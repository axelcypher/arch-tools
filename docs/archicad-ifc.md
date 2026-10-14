# Archicad → Flächenrechner (IFC)

Archicad-Projektdateien (`.pln`) sind ein proprietäres, nicht dokumentiertes Binärformat von
Graphisoft und lassen sich außerhalb von Archicad nicht lesen. Der verlässliche Weg ist der
**IFC-Export**, den Archicad ohne Zusatzsoftware beherrscht. Der Flächenrechner übernimmt daraus:

| Archicad | IFC | Flächenrechner |
|---|---|---|
| Geschosse | `IfcBuildingStorey` (Name, Höhe) | Geschosse mit Fußbodenhöhe; Geschosshöhe = Abstand zum nächsten Geschoss |
| Zonen | `IfcSpace` (Nummer = Name, Zonenname = LongName) | Räume mit Nummer und Bezeichnung, Nutzungsgruppe per Stichwort vorbelegt |
| Nettofläche der Zone | `Qto_SpaceBaseQuantities.NetFloorArea` | Putzabzug je Raum (z. B. 3 % bei Rohbaumaßen) |
| Zonenkörper unter Dachschrägen | 3D-Geometrie der Zone | WoFlV-Faktor aus lichten Höhen (≥ 2 m / 1–2 m / < 1 m), exakt aus den Deckenflächen |
| Wände, Stützen, Fenster, Türen, Vorhangfassaden | Bauteilgeometrie | BGF-Außenumriss je Geschoss, exakt auf die Bauteilkanten eingepasst |
| Dach, Dachdecken | `IfcRoof`, `IfcSlab` (ROOF) | Dachhaut für den BRI („Dach aus Modell“) |
| gesamtes Modell | Bauteilgeometrie | Geschossschnitt (Standard 1,00 m über Fußboden) als hinterlegter Vektorplan je Geschoss |
| Fußbodenhöhe der Zone | 3D-Geometrie der Zone | Höhenlage des Raums (Split-Level), wenn er mindestens 5 cm vom Geschossfußboden abweicht |
| Bodenplatte | `IfcSlab` am Fußboden des untersten Geschosses (Oberseite höchstens 0,60 m darunter) | Bodenplatte (Sohle) des untersten Geschosses – der BRI zählt ab ihrer Unterseite |
| Gelände, Lageplan-Bauteile | `IfcSite`, `IfcGeographicElement`, Bauteile des Lageplan-Geschosses | Lageplan-Flächen und Geländemodell (Höhenfeld) |
| GlobalId | `IfcRoot.GlobalId` | Zuordnung beim erneuten Import („IFC aktualisieren“) |

## Split-Level und Bodenplatte

Die Fußbodenhöhe eines Geschosses ist das flächengewichtete Mittel (Median) der Zonenunterseiten. Liegt eine
Zone mindestens 5 cm tiefer oder höher, erhält der Raum eine **Höhenlage** (z. B. −0,60 m); der Import
meldet das. Im Flächenrechner lässt sich die Höhenlage auch von Hand eintragen – nach oben wie nach unten,
für Räume und Umrisse.

Der **BRI** reicht nach DIN 277 bis zur Unterseite der konstruktiven Bodenplatte. Die BGF steht dagegen auf
OK Fußboden. Der Flächenrechner rechnet deshalb unter dem Geschossfußboden eigene BRI-Teilkörper:

- **Bodenplatte:** Umriss des untersten Geschosses (bzw. der Teil eines Geschosses, unter dem kein anderes liegt)
  × Dicke der Bodenplatte. Die Dicke wird aus den Platten unter dem untersten Geschoss erkannt und lässt sich je
  Geschoss unter „Bodenplatte“ eintragen.
- **Split-Level:** tiefer liegende Räume bzw. Umrisse mit ihrer Fläche × Versatz.

Rechenweg, Excel (`{{bri.unterbau}}`) und 3D-Ansicht weisen diese Teile gesondert aus.

## IFC aktualisieren

Ein neuer Export desselben Modells lässt sich in ein bestehendes Projekt einlesen (Import-Dialog, Modus
„aktualisieren“; im GRZ-Nachweis und in der Kostenermittlung „IFC aktualisieren …“). Archicad behält die
GlobalIds von Geschossen, Zonen und Bauteilen über Exporte hinweg bei; darüber werden Geschosse, Räume und
Lageplan-Flächen zugeordnet (Projekte aus älteren Importen über Nummer/Name bzw. Überdeckung, Umrisse über
Überdeckung). Je Feld gilt:

- unverändert seit dem letzten Import → neuer Wert aus dem IFC,
- von Hand geändert → bleibt; hat sich auch der IFC-Wert geändert, meldet der Bericht einen Konflikt,
- im IFC neu → wird angelegt; im IFC entfallen → wird entfernt, außer er wurde von Hand geändert (dann bleibt er und der Bericht nennt ihn).

Die gespeicherte IFC-Datei im Projektarchiv wird durch die neue ersetzt.

## BGF-Umriss aus den Bauteilen

Die Außenkontur je Geschoss entsteht aus Wänden, Stützen, Vorhangfassaden und Zonen. **Fenster und
Türen** zählen nur dort, wo sie eine Lücke zwischen zwei Wandstücken schließen (raumhohe Öffnungen ohne
Sturz) – Fensterbänke und Rahmen vor bzw. hinter der Fassade erzeugen so keine Zacken mehr.
Fast rechtwinklige Umrisse werden exakt rechtwinklig ausgerichtet.

Beim **Dachgeschoss** reicht der Umriss bis dorthin, wo die Dachhaut die Fußbodenebene schneidet
(höchstens bis zum Umriss des Geschosses darunter), nicht nur bis zu Drempel- oder Innenwänden – siehe
[Dachform und Gauben](dach-und-gauben.md).

Geschosshöhen ergeben sich aus der Kote des nächsten *höher* liegenden Geschosses; Geschosse auf
gleicher Kote (z. B. „Lageplan“ neben „UG“) zählen dabei nicht.

## Lageplan-Geschoss

Ein Geschoss, dessen Name „Lageplan“ enthält, wird kein Gebäudegeschoss (keine BGF, kein BRI, keine
Geschosshöhe) – egal, wo es im IFC einsortiert ist. Seine Bauteile und das IFC-Gelände werden als
Lageplan-Flächen in die Projektdatei übernommen (Nutzung und Versiegelung aus dem Namen, Höhe der
Oberseite) und im GRZ-Nachweis ausgewertet: [GRZ, GFZ und Vollgeschosse](grz-gfz.md).

**Freiflächen getrennt exportieren:** Als „Gelände“ klassifizierte Freiflächen legt der IFC-Übersetzer alle
zusammen in den einen Körper des `IfcSite` – Namen und Versiegelung je Fläche gehen dabei verloren. Abhilfe:
ein Export-Übersetzer, der Freiflächen als `IfcGeographicElement` exportiert. Diese Elemente landen im IFC
nach ihrer Höhe in einem Gebäudegeschoss (meist dem UG); der Import erkennt sie trotzdem als Lageplan-Flächen
– jede einzeln mit ihrem Namen – und lässt sie aus dem Gebäude heraus.

## BGF und BRI bei Dachgeschossen

Die **BGF** wird je Grundrissebene (Geschoss) auf Fußbodenhöhe ermittelt. Ein Geschoss ohne Wände
und Zonen – typischerweise der **Spitzboden bzw. die Dachspitze**, die in Archicad oft als eigenes
Geschoss oberhalb der lichten Höhe des DG angelegt ist – erhält keinen BGF-Umriss.

Der **BRI** umfasst dagegen die ganze Gebäudehülle bis zur Dachhaut. Beim „Dach aus Modell“ reicht
der Körper eines Umrisses deshalb nur dort bis zum Fußboden des nächsten Geschosses, wo dieses
Geschoss BGF hat (Umriss abzüglich Abzugsflächen). Überall sonst – über einem Luftraum, unter der
Dachspitze eines Spitzbodens ohne BGF oder neben einem kleineren Obergeschoss – geht er bis zur
Dachhaut. So wird die Dachspitze dem DG zugerechnet, ohne doppelt zu zählen. Eine feste Begrenzung
lässt sich je Umriss unter „Höhe begrenzen auf“ eintragen.

## Dachform und Gauben erkennen

Mit der Option **„Dachform und Gauben erkennen“** (Standard) wird das Dach aus dem Modell für den
obersten Abschluss eines Umrisses in eine Dachform mit Formeln übersetzt – damit der BRI in der
Excel-Vorlage wie gewohnt als z. B. *Walmdach B × H × (3 × L − B) / 6* plus *Schleppgaube
B × T² × (tan α − tan β) / 2* erscheint. Übernommen wird das nur, wenn Dachform und Gauben den
Rauminhalt des Modells auf 3 % treffen; sonst bleibt es beim Dach aus dem Modell. Für bereits
importierte Projekte gibt es im Dach-Editor die Schaltfläche **„Dachform und Gauben erkennen“**.

Formeln, Ablauf der Erkennung und Grenzen: [Dachform und Gauben](dach-und-gauben.md).

## Plan zum Prüfen und Korrigieren

Der Geschossschnitt wird als Vektorplan hinterlegt (Layer Wände, Stützen/Träger, Fenster, Türen,
Treppen/Geländer, Decken/Dach, Möblierung, Sonstiges). Umrisse und Räume lassen sich darauf mit
Punkt- und Kantenfang korrigieren oder mit „Erkennen“ neu erzeugen. Schnitthöhe im Importdialog
einstellbar; Layer in den Geschoss-Eigenschaften ein- und ausblenden.

## Empfohlene Exporteinstellungen

*Datei → Speichern unter… → Dateityp „IFC-Dateien“*, Übersetzer z. B. **„Allgemeiner Übersetzer“**
oder ein eigener Übersetzer „Flächenrechner“ (Datei → Interoperabilität → IFC → IFC-Übersetzer):

1. **Zu exportierende Elemente:** gesamtes Projekt (oder alle Geschosse einer Ansicht)
2. **Zonen exportieren:** ein – Zonen werden als `IfcSpace` geschrieben
3. **IFC-Basismengen (Base Quantities):** ein – liefert die Nettoflächen der Zonen (Putzabzug)
4. **Geometrie:** „Extrudiert/Rotiert“ oder BREP – beides wird gelesen
5. **Zonenkategorien als Klassifikation:** optional
6. Schema IFC4 (Reference View) oder IFC2x3 (Coordination View 2.0)

Das Beispiel `AC20-FZK-Haus.ifc` (KIT, Archicad 20) wurde so importiert: BGF 2 × 120,00 m²,
Raumflächen identisch mit den Archicad-Nettoflächen, Wohnfläche der Galerie im Dachgeschoss
74,51 m² (identisch mit Archicad), BRI bis zur Dachhaut.

## Arbeitsablauf

1. In Archicad Zonen für alle Räume anlegen (Zonenstempel mit Nummer und Name).
2. IFC exportieren.
3. Im Flächenrechner **IFC-Import** → Datei wählen → Optionen prüfen → Importieren.
4. In der **3D-Ansicht** kontrollieren, ob die Körper (BRI) zum Modell passen („IFC-Modell“ ein-/ausblenden).
5. Nutzungsgruppen (NUF/TF/VF) und R/S bei Bedarf in den Eigenschaften anpassen.

## Grenzen

- Innenhöfe/Lichthöfe werden als Teil der BGF erkannt – bei Bedarf als Abzugsfläche ergänzen.
- Balkone und auskragende Decken werden nicht automatisch als BGF (S) angelegt.
- Die Bodenplatte wird nur erkannt, wenn sie als Platte unter dem untersten Geschoss exportiert wird; sonst
  ihre Dicke unter „Bodenplatte“ eintragen.
- Ein direkter Live-Abgleich mit dem laufenden Archicad (JSON-/Python-Schnittstelle) wäre möglich,
  ist aber noch nicht umgesetzt.
