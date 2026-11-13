# -*- coding: utf-8 -*-
"""
Katasterpläne aus einer QGIS-Vorlage exportieren (ATLAS, arch-tools).

Aufruf:  qgis_process run katasterexport.py -- AUFTRAG=<auftrag.json>

Der Auftrag (JSON) enthält die Vorlage (QGIS-Projekt), die Koordinate des Vorhabens (EPSG:25832), die
Projektvariablen für die Planköpfe (project_title, project_identifier, project_street, project_city,
project_zip_code) und die Pläne. Je Plan:
  art          "pdf" (Layout der Vorlage) oder "dxf" (Vektorlayer eines Kartenthemas)
  layout       pdf: Name des Layouts
  karte        pdf: Kennung des Kartenobjekts im Layout (leer = das erste)
  massstab     Maßstabszahl, z. B. 1000 für 1:1000 (pdf: Maßstab des Kartenobjekts, dxf: Symbolmaßstab)
  breite/hoehe Ausdehnung in m (dxf: Pflicht; pdf: optional, dann ergibt sich der Maßstab)
  thema        Kartenthema der Vorlage (leer = sichtbare Layer)
  dpi          pdf: Auflösung
  stil         dxf: "symbollayer", "objekt" oder "ohne" (Symbolik der DXF)
  beschriftungen  dxf: Beschriftungen der Layer mit exportieren
  beschriftung    Text für den Plan, im Layout als [% @plan_beschriftung %]
  ausgabe      Zieldatei (vollständiger Pfad)
Im Layout stehen zusätzlich @plan_massstab („1:1000“), @plan_name und @plan_datum zur Verfügung.

Je Plan schreibt das Skript eine Zeile „ERGEBNIS {json}“ (id, ok, datei, fehler). Schlägt ein Plan fehl, löscht es
seine (leere oder halb geschriebene) Ausgabedatei. Was ein Plan an der Vorlage ändert (Kartenthema und Ausschnitt des
Kartenobjekts, abgeschaltete Beschriftungen), wird danach zurückgesetzt – der nächste Plan beginnt mit der Vorlage.
"""

import json
import os
from datetime import date

from qgis.core import (
    QgsCoordinateReferenceSystem,
    QgsCoordinateTransform,
    QgsDxfExport,
    QgsExpressionContextUtils,
    QgsLayoutExporter,
    QgsLayoutItemMap,
    QgsMapLayer,
    QgsMapSettings,
    QgsPointXY,
    QgsProcessingAlgorithm,
    QgsProcessingParameterFile,
    QgsProject,
    QgsRectangle,
)
from qgis.PyQt.QtCore import QFile, QIODevice

try:  # QGIS >= 3.30
    from qgis.core import Qgis

    SYMBOLIK = {
        "ohne": Qgis.FeatureSymbologyExport.NoSymbology,
        "objekt": Qgis.FeatureSymbologyExport.PerFeature,
        "symbollayer": Qgis.FeatureSymbologyExport.PerSymbolLayer,
    }
except AttributeError:  # ältere Fassungen
    SYMBOLIK = {
        "ohne": QgsDxfExport.NoSymbology,
        "objekt": QgsDxfExport.FeatureSymbology,
        "symbollayer": QgsDxfExport.SymbolLayerSymbology,
    }

ETRS89_UTM32 = QgsCoordinateReferenceSystem("EPSG:25832")


class KatasterExport(QgsProcessingAlgorithm):
    def name(self):
        return "katasterexport"

    def displayName(self):
        return "Katasterpläne exportieren (ATLAS)"

    def createInstance(self):
        return KatasterExport()

    def initAlgorithm(self, config=None):
        self.addParameter(QgsProcessingParameterFile("AUFTRAG", "Auftrag (JSON)"))

    def processAlgorithm(self, parameters, context, feedback):
        pfad = self.parameterAsFile(parameters, "AUFTRAG", context)
        with open(pfad, encoding="utf-8") as f:
            auftrag = json.load(f)
        projekt = QgsProject.instance()
        if not projekt.read(auftrag["vorlage"]):
            raise Exception("Die QGIS-Vorlage ließ sich nicht öffnen: " + projekt.error())
        for k, v in (auftrag.get("variablen") or {}).items():
            # project_title und project_identifier sind eingebaute Variablen von QGIS (Titel bzw. Kennung in den
            # Metadaten des Projekts) – eigene Variablen gleichen Namens würden überdeckt
            if k == "project_title":
                projekt.setTitle(v)
            elif k == "project_identifier":
                md = projekt.metadata()
                md.setIdentifier(v)
                projekt.setMetadata(md)
            else:
                QgsExpressionContextUtils.setProjectVariable(projekt, k, v)
        k = auftrag["koordinaten"]
        mitte = QgsPointXY(float(k["ost"]), float(k["nord"]))
        ok = 0
        plaene = auftrag.get("plaene") or []
        for i, plan in enumerate(plaene):
            if feedback.isCanceled():
                break
            ergebnis = {"id": plan.get("id"), "datei": plan.get("ausgabe"), "ok": False}
            try:
                if plan.get("art") == "dxf":
                    self.dxf(projekt, plan, mitte)
                else:
                    self.pdf(projekt, plan, mitte)
                ergebnis["ok"] = True
                ok += 1
            except Exception as e:  # noqa: BLE001 – jeder Fehler gehört in die Meldung des Plans
                ergebnis["fehler"] = str(e)
                self.ausgabe_loeschen(plan.get("ausgabe"))
            feedback.pushInfo("ERGEBNIS " + json.dumps(ergebnis, ensure_ascii=False))
            feedback.setProgress(100 * (i + 1) / max(1, len(plaene)))
        projekt.clear()
        return {}

    # ---------- Hilfen ----------

    def ausgabe_loeschen(self, ausgabe):
        """Ausgabe eines fehlgeschlagenen Plans entfernen – sonst würde eine leere oder kaputte Datei abgelegt"""
        if not ausgabe:
            return
        try:
            if os.path.isfile(ausgabe):
                os.remove(ausgabe)
        except OSError:
            pass

    def thema_pruefen(self, projekt, thema):
        if thema and thema not in projekt.mapThemeCollection().mapThemes():
            raise Exception(f"Kartenthema „{thema}“ gibt es in der Vorlage nicht")

    def mitte_in(self, projekt, mitte, crs):
        if not crs.isValid() or crs == ETRS89_UTM32:
            return mitte
        t = QgsCoordinateTransform(ETRS89_UTM32, crs, projekt)
        return t.transform(mitte)

    # ---------- PDF aus einem Layout ----------

    def pdf(self, projekt, plan, mitte):
        name = plan.get("layout") or ""
        layout = projekt.layoutManager().layoutByName(name)
        if layout is None:
            raise Exception(f"Layout „{name}“ gibt es in der Vorlage nicht")
        karten = [x for x in layout.items() if isinstance(x, QgsLayoutItemMap)]
        if not karten:
            raise Exception(f"Im Layout „{name}“ gibt es kein Kartenobjekt")
        kennung = plan.get("karte") or ""
        karte = next((x for x in karten if x.id() == kennung), None) if kennung else karten[0]
        if karte is None:
            raise Exception(f"Kartenobjekt „{kennung}“ gibt es im Layout „{name}“ nicht")
        thema = plan.get("thema") or ""
        self.thema_pruefen(projekt, thema)
        # Zustand des Kartenobjekts sichern: ein späterer Plan mit demselben Layout beginnt wieder mit der Vorlage
        alt_folgen = karte.followVisibilityPreset()
        alt_thema = karte.followVisibilityPresetName()
        alt_ausschnitt = QgsRectangle(karte.extent())
        try:
            self.pdf_schreiben(layout, karte, plan, thema, mitte, projekt)
        finally:
            karte.setFollowVisibilityPreset(alt_folgen)
            karte.setFollowVisibilityPresetName(alt_thema)
            karte.zoomToExtent(alt_ausschnitt)

    def pdf_schreiben(self, layout, karte, plan, thema, mitte, projekt):
        if thema:
            karte.setFollowVisibilityPreset(True)
            karte.setFollowVisibilityPresetName(thema)
        m = self.mitte_in(projekt, mitte, karte.crs())
        # zoomToExtent behält die Größe des Kartenobjekts im Layout (setExtent würde es dem Ausschnitt anpassen)
        breite, hoehe = plan.get("breite"), plan.get("hoehe")
        if breite and hoehe:
            karte.zoomToExtent(QgsRectangle.fromCenterAndSize(m, float(breite), float(hoehe)))
        else:
            e = karte.extent()
            karte.zoomToExtent(QgsRectangle.fromCenterAndSize(m, e.width(), e.height()))
            karte.setScale(float(plan.get("massstab") or 1000))
        massstab = round(karte.scale())
        for v, w in (
            ("plan_beschriftung", plan.get("beschriftung") or ""),
            ("plan_name", plan.get("name") or ""),
            ("plan_massstab", f"1:{massstab}"),
            ("plan_datum", date.today().strftime("%d.%m.%Y")),
        ):
            QgsExpressionContextUtils.setLayoutVariable(layout, v, w)
        layout.refresh()
        einstellungen = QgsLayoutExporter.PdfExportSettings()
        einstellungen.dpi = float(plan.get("dpi") or 300)
        r = QgsLayoutExporter(layout).exportToPdf(plan["ausgabe"], einstellungen)
        if r != QgsLayoutExporter.Success:
            raise Exception(f"PDF-Export fehlgeschlagen (Code {int(r)})")

    # ---------- DXF aus den Vektorlayern eines Kartenthemas ----------

    def dxf(self, projekt, plan, mitte):
        thema = plan.get("thema") or ""
        self.thema_pruefen(projekt, thema)
        if thema:
            layer = projekt.mapThemeCollection().mapThemeVisibleLayers(thema)
            stile = projekt.mapThemeCollection().mapThemeStyleOverrides(thema)
        else:
            layer = [l.layer() for l in projekt.layerTreeRoot().findLayers() if l.isVisible() and l.layer()]
            stile = {}
        vektor = [l for l in layer if l.type() == QgsMapLayer.VectorLayer]
        if not vektor:
            raise Exception(f"Im Kartenthema „{thema or 'sichtbare Layer'}“ gibt es keine Vektorlayer – DXF lässt sich nur aus Vektordaten schreiben")
        breite, hoehe = plan.get("breite"), plan.get("hoehe")
        if not (breite and hoehe):
            raise Exception("Für DXF fehlt die Ausdehnung (Breite × Höhe in m)")
        # abgeschaltete Beschriftungen gelten nur für diesen Plan – die Layer gehören allen Plänen der Vorlage
        beschriftet = {l.id(): l.labelsEnabled() for l in vektor}
        try:
            if not plan.get("beschriftungen", True):
                for l in vektor:
                    l.setLabelsEnabled(False)
            self.dxf_schreiben(plan, vektor, stile, mitte, breite, hoehe)
        finally:
            for l in vektor:
                l.setLabelsEnabled(beschriftet[l.id()])

    def dxf_schreiben(self, plan, vektor, stile, mitte, breite, hoehe):
        ausschnitt = QgsRectangle.fromCenterAndSize(mitte, float(breite), float(hoehe))
        ms = QgsMapSettings()
        ms.setDestinationCrs(ETRS89_UTM32)
        ms.setLayers(vektor)
        ms.setLayerStyleOverrides(stile)
        ms.setExtent(ausschnitt)
        export = QgsDxfExport()
        export.setMapSettings(ms)
        export.addLayers([QgsDxfExport.DxfLayer(l) for l in vektor])
        export.setSymbologyScale(float(plan.get("massstab") or 1000))
        export.setSymbologyExport(SYMBOLIK.get(plan.get("stil") or "symbollayer", SYMBOLIK["symbollayer"]))
        export.setDestinationCrs(ETRS89_UTM32)
        export.setExtent(ausschnitt)
        export.setLayerTitleAsName(True)
        datei = QFile(plan["ausgabe"])
        if not datei.open(QIODevice.WriteOnly | QIODevice.Truncate):
            raise Exception(f"{plan['ausgabe']} lässt sich nicht schreiben")
        try:
            r = export.writeToFile(datei, "utf-8")
        finally:
            datei.close()
        if int(r) != 0:
            raise Exception(f"DXF-Export fehlgeschlagen (Code {int(r)})")
