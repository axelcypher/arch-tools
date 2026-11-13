# arch-tools

Werkzeuge für Architekturbüros: sieben Desktop-Apps (Windows, Tauri) mit gemeinsamem Unterbau – einzeln oder alle
zusammen in der Rahmen-App „arch-tools“ (Tabs, herauslösbare Fenster). Flächenrechner,
GRZ-Nachweis und Kostenermittlung arbeiten mit derselben Projektdatei (`.oap`).

| App | Zweck | Dokumentation |
|---|---|---|
| **Flächenrechner** | Flächen- und Rauminhaltsberechnung nach DIN 277 und WoFlV | unten |
| **GRZ-Nachweis** | GRZ/GFZ-Nachweis nach BauNVO und BauO NRW | [docs/grz-gfz.md](docs/grz-gfz.md) |
| **Kostenermittlung** | Massen- und Kostenermittlung nach DIN 276 | [docs/kosten.md](docs/kosten.md) |
| **Projekt** (früher Projektordner) | Das Setup-Tool: Projekte mit einem Assistenten anlegen und fortschreiben – Stammdaten, Grundstück, Bauherr, Umfang, Beteiligte in der Projektdatei, Ordner nach der Bürostruktur (Klick-Editor mit Bausteinen), Vorlagen-Presets; Ordner prüfen; Mails prüfen, benennen und aus Outlook ablegen; Katasterpläne aus einer QGIS-Vorlage | [docs/projektordner.md](docs/projektordner.md) |
| **Entzerrung** | Fotos perspektivisch entzerren und darin messen | [docs/entzerrung.md](docs/entzerrung.md) |
| **Formulare** | Bauantragsformulare aus SJ FORMA bequem ausfüllen – die Dateien bleiben im Original lesbar | [docs/formulare.md](docs/formulare.md) |
| **AVA** | Ausschreibung, Vergabe, Abrechnung und Bauleitung: Leistungsverzeichnisse (LV-Dateien des bisherigen LV-Programms oder eigenes Format), Preisspiegel, Aufträge, Rechnungsprüfung mit Deckblatt, Kostenkontrolle (Excel), Bautagebuch, Protokolle, Mängel, Mailverlauf | [docs/ava.md](docs/ava.md) |
| **arch-tools** | Rahmen-App: alle Apps in einem Fenster als Tabs, einzelne in eigene Fenster herauslösen | [docs/suite.md](docs/suite.md) |

## Gemeinsame Bedienung aller Apps

- **Farbschema** (◐ in der Titelleiste): Hell, Dunkel oder wie das System – wirkt sofort in allen geöffneten Apps,
  Fenstern und Tabs der Rahmen-App. „Zeichenfläche abdunkeln“ gibt es nur in Apps mit Zeichenfläche bzw. Lageplan.
- **Dialoge**: Esc schließt den obersten Dialog (in einem Eingabefeld verwirft Esc zuerst die Eingabe), der Fokus
  bleibt im Dialog und springt danach zurück.
- **Ungespeicherte Änderungen**: Vor Öffnen, Neu und Beenden fragt die App „Änderungen an ‚…‘ speichern?“ mit
  *Speichern*, *Nicht speichern* und *Abbrechen*; schlägt das Speichern fehl, bleibt das Projekt offen. Löschen und
  Ersetzen fragen mit eigenem Knopf (z. B. *Entfernen*) nach.
- **Eingaben**: Zahlenfelder lesen die deutsche Schreibweise (Komma, Tausenderpunkte „1.234,5“, Einheit „m²“, „%“).
  Ungültige Eingaben und Werte außerhalb des erlaubten Bereichs werden nicht still gekappt oder verworfen: Das Feld
  wird rot, die Meldung steht direkt darunter (z. B. „Höchstens 1,0 – gemeint 0,4?“), die Eingabe bleibt zum
  Korrigieren stehen. Meldungen erscheinen erst nach dem Verlassen des Feldes bzw. nach dem Absenden; Pflichtfelder
  tragen einen Stern. Im Stammdaten-Formular gibt es weiche Hinweise zu PLZ (fünf Ziffern), E-Mail-Adressen und
  Zeichen, die im Ordnernamen entfallen (`/ : ? …`).
- **Stammdaten** (Bauvorhaben, Adresse, Gemarkung/Flur/Flurstück, Bebauungsplan Nr./Name, Bauherr, Bearbeitung)
  stehen einmal in der Projektdatei. Jede App zeigt sie mit demselben Dialog („Stammdaten …“) und lässt sie ändern,
  ohne die App zu wechseln; andere Apps sehen die Änderung, sobald das Projekt dort neu geladen wird. Ausdrucke und
  Excel-Dateien haben denselben Kopf aus diesen Angaben, dazu den Büronamen (Projekt → Einstellungen) und
  „Seite x von y“.
- **Koordinaten der Projektadresse:** Sobald Straße und PLZ bzw. Ort des Vorhabens eingetragen sind (und bei jeder
  Änderung, spätestens beim Speichern), fragt die App die Lage bei OpenStreetMap (Nominatim) ab und sichert sie in den
  Stammdaten der Projektdatei – in **ETRS89 / UTM 32N (EPSG:25832)** wie ALKIS NRW, dazu geographisch. In den
  Stammdaten stehen sie als „O … · N …“; **Kopieren** liefert „Ost, Nord“ mit Punkt als Dezimalzeichen, z. B. zum
  Springen in QGIS (Projekt-KBS EPSG:25832). Liegt nur ein Treffer für die Straße oder den Ort vor, steht das dabei;
  „Neu abfragen“ fragt erneut. Gesendet wird nur die Adresse des Vorhabens, eine Abfrage je geänderter Adresse; die
  Desktop-Apps erlauben dafür in ihrer CSP genau diesen Dienst (AVA und die Rahmen-App zusätzlich den Wetterdienst
  Open-Meteo fürs Bautagebuch, nur auf Knopfdruck). Die Umrechnung rechnet die App selbst (Krüger-Reihen,
  im Millimeterbereich genau); WGS84 und ETRS89 weichen um weniger als einen Meter ab.
- **Einstieg**: „Projekte“ in der Titelleiste aller Apps (auch Projekt und Formulare). Ohne geöffnetes Projekt
  zeigt jede App denselben Einstieg mit denselben Aktionen: *Projekt wählen …* (Desktop: Übersicht mit „zuletzt
  geöffnet“), *Datei öffnen …*, *Neues Projekt*. Die Projektübersicht scrollt als Ganzes (aufgeklappte Quellen werden
  nicht mehr auf die Fensterhöhe gequetscht); „Zuletzt geöffnet“ steht auf einem farbigen Streifen.
- **Projektübersicht mit Sammelordnern:** Projekte in Gruppen-, Akquise- und Archivordnern der Stammordner stehen in
  eigenen Abschnitten (Archiv = abgeschlossen, Akquise = Akquise, solange die Projektdatei nichts anderes sagt); die
  Reihenfolge der Stammordner lässt sich per Ziehen ändern – in der Übersicht und unter „Einstellungen“ der App „Projekt“.
- **Neues Projekt anlegen** aus jeder App (in der Rahmen-App „arch-tools“): Der Knopf auf der Projektübersicht startet
  den Assistenten der App „Projekt“ in deren Tab; nach dem Anlegen führt „In … öffnen“ zurück, und Flächenrechner,
  GRZ-Nachweis, Kostenermittlung und Entzerrung öffnen das neue Projekt gleich. Auch über „+“ und die Startseite des
  Rahmens. In den einzeln installierten Apps gibt es den Knopf nicht (sie können die App „Projekt“ nicht starten).
- **Rollbalken** in den Farben des Schemas (schmal, abgerundet); Seitenleisten halten Platz für den Rollbalken frei,
  damit sich ihre Breite beim Wechsel der Ansicht nicht ändert.
- **Eigene Ansichten** (Ansicht-Editor in `packages/core/src/ui/AnsichtEditor.tsx`): aus einem Katalog von Feldern
  Abschnitte mit genau den benötigten Feldern zusammenstellen – Reihenfolge per Ziehen. Genutzt in Formulare
  (Projektkarte, Antragsmerkmale); für weitere Apps (Startseite, Vorlagen) vorbereitet.
- **Datei ließ sich nicht öffnen**: Die Meldung nennt Datei und Grund in Klartext („Keine gültige Projektdatei
  (.oap) – beschädigt oder aus einer anderen Anwendung.“); technische Einzelheiten stehen aufklappbar darunter und im
  Protokoll. Ein fehlgeschlagenes Öffnen ändert das geöffnete Projekt nicht.

## Flächenrechner

Visuell gestützte Flächenberechnung für Gebäude. Grundrisse werden direkt gezeichnet oder auf einem
kalibrierten Planbild nachgezeichnet; die Anwendung ermittelt daraus:

| Kennwert | Grundlage | Ermittlung |
|---|---|---|
| **BGF** – Brutto-Grundfläche | DIN 277 | Σ BGF-Umrisse je Geschoss, getrennt nach Raumumschließung **R** (Regelfall) und **S** (Sonderfall) |
| **BRI** – Brutto-Rauminhalt | DIN 277 | Σ Umrissfläche × Geschosshöhe bzw. Volumen vom Fußboden bis zur Dachhaut (Dachform oder Dach aus IFC), unten ab **Unterkante Bodenplatte einschließlich Dämmung darunter** inkl. tiefer liegender Bereiche |
| **NRF** – Netto-Raumfläche | DIN 277 | Σ Räume = NUF 1–7 + TF 8 + VF 9 |
| **KGF** – Konstruktions-Grundfläche | DIN 277 | BGF − NRF (rechnerisch) |
| **WoFl** – Wohnfläche | WoFlV § 4 | Σ Raumfläche × Anrechnungsfaktor, gruppiert nach Wohnung |

Anrechnungsfaktoren WoFlV: lichte Höhe ≥ 2 m → 100 %, 1–2 m → 50 %, < 1 m → 0 % (auch als Teilflächen eines
Raums nach lichter Höhe), unbeheizbare Wintergärten/Schwimmbäder → 50 %, Balkone/Loggien/Dachgärten/Terrassen →
i. d. R. 25 % (Projektstandard einstellbar, max. 50 %) sowie ein individueller Faktor. Optional eine
**Vergleichsrechnung „II. BV“** (nur zum Vergleich mit Bestandsberechnungen bis 2003): gerechnet wird nach WoFlV,
nur Balkone, Loggien, Dachgärten und Terrassen zählen standardmäßig zur Hälfte; weitere Regeln der II. BV a. F.
(§ 44 Abs. 1 Nr. 2, Abs. 2, Abs. 3) sind nicht nachgebildet – so steht es auch im Bericht. **Messverfahren**
(Maßgrundlage: Planmaß Rohbau, Planmaß Fertigmaß, Aufmaß) und **Planungsunterlagen** (Eingabe, sonst die
hinterlegten Pläne) werden beim Projekt festgehalten und stehen im Kopf von Bericht und Excel (DIN 277:2021-08, 5.1);
fehlen sie, warnt der Bericht.

### Funktionen

- **IFC-Import** (Archicad, Revit, …): Geschosse, Zonen → Räume (inkl. Putzabzug und WoFlV-Faktor aus den
  Raumhöhen), BGF-Umrisse aus den Bauteilen und Dachhaut für den BRI – siehe [docs/archicad-ifc.md](docs/archicad-ifc.md)
- **Dachformen** je BGF-Umriss für den BRI: Flach-, Pult-, Sattel-, Walm-, Krüppelwalm-, Zelt-, Mansard-,
  Mansardwalm-, Tonnen- und Sheddach mit Traufhöhe, Neigungen und Firstrichtung (exakte Volumenberechnung)
- **Gauben** (Schlepp-, Flachdach-, Satteldachgaube) mit den üblichen Formeln, z. B.
  B × T² × (tan α − tan β) / 2 – in BRI, Rechenweg, Excel-Vorlage und 3D-Ansicht
- **Dachform- und Gaubenerkennung aus IFC**: Dachform, Neigung, Traufhöhe und Gauben werden aus der
  Dachhaut abgeleitet und nur übernommen, wenn sie den Rauminhalt des Modells treffen – siehe
  [docs/dach-und-gauben.md](docs/dach-und-gauben.md)
- **3D-Ansicht** der Rauminhalte (Geschosse auseinanderziehbar, Vergleich mit dem IFC-Modell)
- Zeichnen von **Polygonen** und **Rechtecken** als BGF-Umriss oder Raum
- **Raum erkennen per Klick** (Werkzeug „Erkennen“): Klick in einen umschlossenen Bereich eines DXF-/PDF-/Bildplans
  oder zwischen bereits gezeichneten Flächen erzeugt die Fläche automatisch
  - Türöffnungen bis zum eingestellten **Lückenschluss** (Standard 1,10 m) werden bündig mit der Wandflucht geschlossen
  - DXF: Kanten werden exakt auf die Plangeometrie eingepasst; Bögen (Türaufschläge) können ignoriert werden
  - PDF/Bild: dünne Linien (Türaufschläge, Möbel) werden ignoriert, solange der Raum geschlossen bleibt;
    Kanten werden auf dem Originalbild subpixelgenau an die Wandkante geschoben
- **BGF-Umriss aus dem Plan**: Werkzeug „Erkennen“ im Modus BGF-Umriss, Klick auf die Außenwand → äußere Kontur
  der zusammenhängenden Wandfläche (Außenkante der Wandschraffur bzw. Außenlinie; Öffnungen bis zum Lückenschluss
  werden überbrückt). Der Umriss ist zum Prüfen markiert (Außenmaße einschließlich Bekleidung, im Dachgeschoss bis
  zum Schnitt der Dachhaut mit der Fußbodenebene). Ohne Plan: „BGF-Umriss aus Räumen + Wanddicke …“ (nur mit
  ausdrücklicher Wanddicke, Vermerk „Näherung“). Kleine Umrisse außen am Gebäude: Hinweis „Balkon oder Loggia? → S“
- **Hintergrundpläne**: **PDF** (Seite wählbar, direkte Maßstabseingabe 1:M), **DXF** (Layer ein-/ausblenden,
  Einheit aus `$INSUNITS`, Blöcke, Bemaßungen, Texte) sowie **PNG/JPG**; Kalibrierung über eine bekannte Strecke
  (Länge mit Einheit: „12,00 m“, „1200 cm“, „12000 mm“; Fang auf Plankanten und Eckpunkte), danach **Kontrollmaß**
  an einer zweiten Strecke mit Abweichung in % – steht als Maßgrundlage („aus Plan abgegriffen, Maßstab kalibriert,
  Kontrollmaß … Abweichung x %“) im Berichtskopf und in Excel (`projekt.kontrollmass`). Das Kontrollmaß gilt nur
  für den Plan im gemessenen Maßstab: Ein neuer Plan, Neukalibrieren oder ein anderer Planmaßstab verwirft es
- **Fang** auf Raster, Eckpunkte und Kanten (auch DXF-Geometrie und darunterliegendes Geschoss), **Alt** = Fang aus
- **Hilfslinienfang** für schräg stehende (genordete) Gebäude: Verlängerungen der Nachbarkanten, Gebäudeachsen
  und Fluchten bestehender Eckpunkte; **Shift** hält die Linie auf der Gebäudeachse, Rechtecke richten sich an ihr aus
- **Mehrfachauswahl**: Shift+Klick, Shift+Aufziehen, `Strg+A`; gemeinsam verschieben, löschen und gemeinsame Felder bearbeiten
- **Kopieren, Einfügen, Duplizieren** (`Strg+C/V/D`) – auch in ein anderes Geschoss (Regelgeschosse) – und
  Verschieben mit den Pfeiltasten (1 cm, mit Umschalt 10 cm). Beim Einfügen von Räumen in ein anderes Geschoss
  und beim Duplizieren eines Geschosses fragt die App, ob die Raumnummern an das Zielgeschoss angepasst werden und
  welcher Wohnung die Räume angehören (Vorgabe: Wohnung beibehalten)
- **Raumnummern**: Präfix je Geschoss (Vorgabe aus dem Namen: KG → -1, EG → 0, 1. OG → 1; in den
  Geschosseigenschaften einstellbar), neue Räume zählen ab der höchsten vergebenen Nummer weiter. Doppelte Nummern
  werden gemeldet; „Räume neu nummerieren“ (Listenreihenfolge oder im Uhrzeigersinn) nur auf ausdrücklichen Befehl –
  Räume aus dem IFC-Import behalten ihre Nummer, damit sie zu Modell und Plänen passen
- **Höhenlage / Split-Level**: Räume (Höhenlage Fußboden) und Umriss-Körper (Höhenversatz, ganzer Körper samt
  Dach) lassen sich nach oben und unten versetzen; tiefer liegende Räume (aus IFC automatisch erkannt) und die
  Bodenplatte gehen als eigene Posten in den BRI ein
- **IFC aktualisieren**: erneuter Import in ein bestehendes Projekt über die stabilen IFC-GlobalIds – von Hand
  geänderte Werte bleiben erhalten, Konflikte werden gemeldet
- **Nachschlagewerk** der Berechnungsregeln (`F1` bzw. „§ Regeln“, `?` an den Abschnitten) mit Zitaten,
  Quellenangaben, Links und Suche – zentral und je Funktion gefiltert
- **Numerische Eingabe** beim Zeichnen: Länge tippen + Enter (in Mausrichtung), `dx;dy` relativ, Rechteck `4,5x3,2`
- Eckpunkte ziehen, auf Kantenmitte ziehen = Punkt einfügen, Rechtsklick = Punkt löschen, Koordinaten-Tabelle
- **Abzugsflächen**: am BGF-Umriss z. B. Innenhof, Luftraum über einer Galerie oder Deckenöffnung über 1,0 m², im
  Raum z. B. Schornstein, Pfeiler, Schacht im Raum. Wird ein Raum zur Abzugsfläche, erbt er Anrechnung und Wohnung
  des Raums, in dem er liegt (Anrechnung „keine“)
- Mehrere **Geschosse**: „+ Neu“ fügt über oder unter dem aktiven Geschoss ein (Name und Fußbodenhöhe nach der
  Lage, z. B. KG unter dem EG), Geschoss duplizieren (Regelgeschosse, die Kopie heißt nach ihrer Lage),
  darunterliegendes Geschoss einblenden. **Geschossart** Keller-, Normal- oder Dachgeschoss (ohne Angabe nach Name
  bzw. Dach): Räume im Kellergeschoss werden nicht als Wohnfläche vorgeschlagen – eine Souterrainwohnung liegt in
  einem Geschoss mit der Art „Normalgeschoss“
- **Messen**: Kettenmessung mit Summe, dx/dy und Winkel je Abschnitt, Klick auf den Startpunkt misst die Fläche
  (ohne Raum anzulegen), `Strg+C` kopiert die Messung, sie bleibt beim Werkzeugwechsel stehen (Esc löscht);
  Messungen zählen nie zu BGF, NRF oder Wohnfläche. Maßketten der ausgewählten Fläche, Maßstabsleiste
- **Beschriftung**: BGF-Beschriftung am Rand des Umrisses (außen oben links) statt auf den Räumen; Raumstempel lassen
  sich am Griff unter der Beschriftung verschieben (gespeichert, auch im Grundriss des Berichts; „Beschriftung
  zurücksetzen“ in den Eigenschaften)
- **Raumliste** nach Nummer sortiert (natürliche Sortierung); **Raumtabelle** aller Räume des Projekts mit direkt
  bearbeitbaren Spalten (Nr., Bezeichnung, R/S, Nutzung, WoFlV-Anrechnung, Faktor, Wohnung, Abzug, Putzabzug)
- **Neues Geschoss**: das darunterliegende wird eingeblendet; „BGF-Umriss aus [Geschoss darunter] übernehmen“
  kopiert nur die Geometrie (ohne Dach, Körperhöhe, Höhenversatz, Umschließung) und markiert den Umriss zum Prüfen
- IFC-Import: das IFC-Modul lädt schon beim Öffnen des Dialogs, das Lesen einer Datei lässt sich abbrechen;
  Bedienhinweise unten lassen sich einklappen (bleibt so); „Neu“ beginnt mit dem BGF-Umriss
- Live-Auswertung je Geschoss und gesamt
- **Flächenaufstellung** zum Drucken/PDF mit **Grundriss je Geschoss** (farbig nach Nutzungsgruppe, beschriftet,
  Maßstabsleiste, Legende, optional mit Hintergrundplan) und Raumliste je Geschoss; auf Wunsch mit **Rechenweg je
  Raum** (L × B bzw. Zerlegung in Rechtecke/Dreiecke oder Gauß’sche Formel, − Putzabzug, − Abzugsflächen,
  × Anrechnung) – die Summe der Zeilen ist exakt das Ergebnis. Im Excel-Standardlayout steht derselbe Rechenweg
  als Formeln (Blatt „Rechenweg Räume“)
- **Dachschrägen nach WoFlV**: Unter Dachformen zeigt der Grundriss die Dachflächen (First, Grate, Kehlen) und die
  Zonen der lichten Höhe (< 1 m schraffiert, 1–2 m getönt; Ansicht „Höhenlinien“). Lichte Höhe = Dachhaut −
  Dachaufbau bis zur Innenbekleidung ÷ cos α − ggf. Fußbodenaufbau (je Geschoss einstellbar) − Höhenlage des Raums.
  „Raum an Höhenlinien teilen“ setzt die Anrechnung „Raumteile nach lichter Höhe“ mit den Teilflächen ≥ 2 m /
  1–2 m / < 1 m – eine Nummer, eine NRF, nur die Wohnfläche ändert sich. Bericht und Excel (`raum.teil_h2` …) weisen
  die Teilflächen in m² aus. Gauben und Kehlbalkendecken werden dabei nicht berücksichtigt (Teilflächen prüfen)
- **Bericht für die Bauvorlage**: Vorlagen „Vollständige Flächenaufstellung“, „Bauantrag NRW (BRI + WoFl)“ und
  freie Auswahl der Abschnitte (Grundflächen und Rauminhalte, BRI-Rechenweg, Nutzungsgruppen, Raumlisten,
  Wohnflächen, Hochbaustatistik). In „Bauantrag NRW“ sind die Tabelle nach DIN 277 mit R/S-Trennung und der
  BRI-Rechenweg nicht abwählbar (§ 6 Nr. 1 BauPrüfVO NRW, Gebührentarif 3.1.1.2). Kopf aus den Stammdaten mit
  Normausgaben („DIN 277:2021-08 (Gebührentarif NRW, Tarifstelle 3.1.1.2; § 6 Nr. 1 BauPrüfVO NRW nennt
  DIN 277-1:2016-01)“, WoFlV vom 25.11.2003), Messverfahren und Planungsunterlagen, „Seite x von y“, Unterschriftszeilen (Aufsteller, Entwurfsverfasser). BGF, BRI, NRF
  und KGF getrennt nach R und S (S-Spalten nur, wenn es einen Sonderfall gibt; ebenso in CSV und Excel:
  `nrf_r`/`nrf_s`, `kgf_r`/`kgf_s`); leere Abschnitte entfallen; ein fehlender BRI, fehlendes Messverfahren bzw.
  fehlende Planungsunterlagen und selbstüberschneidende Flächen erscheinen als Warnung; keine erzwungenen
  Seitenumbrüche mehr. **Angaben für die Hochbaustatistik**: Wohnfläche und Räume je Wohnung (Wohn- und
  Aufenthaltsräume ab 6 m², Küchen unabhängig von der Größe), sonstige Nutzfläche, BRI (Excel `statistik.*`,
  `wohnung.raeume_statistik`; Zählregeln am Erhebungsbogen prüfen)
- **Prüfliste** in der Auswertung (Ampel „Prüfen“): Räume außerhalb bzw. über den Umriss hinaus (je R/S),
  NRF > BGF je Bereich, überlappende Umrisse oder Räume (z. B. versetzt eingefügte Kopie; Abzugsflächen
  ausgenommen), breite Bereiche ohne Raum, doppelte Raumnummern, Räume ohne Wohnung, „keine Wohnfläche“ im
  Wohngeschoss, „voll“ im Dachgeschoss, S-Umrisse ohne obere Begrenzung, selbstüberschneidende Flächen,
  Abzugsflächen mit eigener, vom umgebenden Raum abweichender Anrechnung bzw. außerhalb aller Räume, Räume nicht im
  Raumkatalog (mit eigenem Katalog), zum Prüfen markierte Umrisse – Warnungen und Hinweise; ein Klick wählt die
  Fläche. Ragt ein Raum über den Umriss, lässt er sich in den Eigenschaften „auf den Umriss beschneiden“
- **Raumkatalog**: Die Bezeichnung schlägt Raumnamen vor; ein Katalogname setzt Nutzungsgruppe (ggf. Nutzungsart)
  und WoFlV-Anrechnung, gekennzeichnet als Vorschlag „aus Katalog“. Der Katalog des Büros liegt im
  Konfigurationsordner (`raumkatalog.json`, Liste aus `{ "name", "nutzung", "nutzungsart", "wofl" }`), sonst gilt
  eine kleine Vorgabe (u. a. getrennt „Abstellraum (in der Wohnung)“ / „Abstellraum/Keller (außerhalb)“,
  „HWR (in der Wohnung)“ / „Waschküche“). Neue Räume übernehmen Nutzung und Anrechnung vom zuletzt angelegten Raum
  des Geschosses; die Wohnung wird aus den vorhandenen gewählt (Schreibvarianten wie „WE01“ werden zu „WE 01“)
- **Nutzungsart** als optionale zweite Ebene unter der Nutzungsgruppe (z. B. 7.1): Liste des Büros in
  `nutzungsarten.json` (`{ "nr", "bezeichnung" }`); die Gruppe folgt der ersten Ziffer, die Auswertung summiert
  weiter je Gruppe. Die vollständige Tabelle der DIN 277 wird nicht mitgeliefert (urheberrechtlich geschützt)
- **Excel-Export** (.xlsx) im Standardlayout oder mit **eigener Vorlage** – siehe [docs/excel-vorlagen.md](docs/excel-vorlagen.md);
  BGF auch je Teilfläche (`{{bgf.name}}`, `{{bgf.flaeche}}` …), leere Blöcke entfallen, bedingte Abschnitte
  mit `{{#wenn raum[nebenflaeche]}}` … `{{/wenn}}`
- **CSV-Export** (Excel, Dezimalkomma)
- **Dateinamen**: „Speichern“ (`Strg+S`) schreibt in die geöffnete Datei, „Speichern unter“ (`Strg+Shift+S`) fragt neu;
  Exporte heißen `<Projektdatei> WoFl+BGF+BRI`, `<Projektdatei> GRZ+GFZ` bzw. `<Projektdatei> Kosten <Stufe>`
  und landen vorgeschlagen im Ordner der Projektdatei
- **GRZ/GFZ-Nachweis** als eigene App im selben Repository (`apps/grz`), die dieselbe Projektdatei öffnet –
  siehe [docs/grz-gfz.md](docs/grz-gfz.md)
- **Massen- und Kostenermittlung nach DIN 276** als eigene App (`apps/kosten`): Mengen aus dem Projekt mit
  Nachweis im Grundriss und im 3D-Modell, Kennwerte mit Bandbreite, Kennwertkatalog, Kostenstände – siehe
  [docs/kosten.md](docs/kosten.md)
- **Projekt** (früher Projektordner) als eigene App (`apps/ordner`): Assistent für neue und bestehende Projekte
  (Stammdaten, Grundstück, Bauherr, Umfang, Beteiligte, Vorlagen, Zusammenfassung und Trockenlauf), alles in der
  Projektdatei (`.oap`) des Projektordners, **Struktur-Editor zum Klicken** (Mehrfachauswahl, Ziehen, Kopieren in
  mehrere Ordner, **Bausteine** für wiederkehrende Unterordner wie Gewerke), **Vorlagen-Presets** aus
  einem eigenen Vorlagenordner (Datei oder Ordner → Zielordner, Dateiname nach dem Schema des Büros,
  `.dotx`/`.xltx` werden Dokumente), Ordner prüfen – siehe [docs/projektordner.md](docs/projektordner.md)
- **Gemeinsame Basis aller Apps** (`packages/core`): Konfigurationsordner für übergreifende Einstellungen
  (`platform/konfig.ts`), die Projektdatei im Projektordner finden, gezielt ergänzen und anlegen
  (`projektdatei.ts`, `platform/projektordner.ts`), Stammdaten-Dialog für Projektordner ohne Projektdatei
  (`ui/Stammdaten.tsx`), Projektübersicht als Startseite (`ui/ProjektUebersicht.tsx`) und Projektwahl für
  Flächenrechner, GRZ-Nachweis, Kostenermittlung und Entzerrung (`ui/ProjektWahl.tsx`: Projektordner wählen,
  Projektdatei öffnen oder – wenn sie fehlt – mit den Stammdaten anlegen); unbekannte Abschnitte der Projektdatei
  bleiben erhalten
- **Projektübersicht** beim Start (Desktop, auch über „Projekte“ in der Titelleiste): Projektordner aus den
  Stammordnern der gemeinsamen Einstellungen, zuletzt geöffnete vorne; ein Klick öffnet die Projektdatei des
  Projekts – fehlt sie, werden die Stammdaten erfasst und sie wird angelegt. „Datei öffnen …“ bleibt
- **Projektdaten** (Projektcode, Adresse, Grundstück mit Gemarkung/Flur/Flurstück, Bauherr mit beliebig vielen
  E-Mail-Adressen und Telefonnummern) im Dialog; als Platzhalter für Excel-Vorlagen (`{{bauherr.name}}` …)
- Rückgängig/Wiederholen, automatische Zwischenspeicherung (IndexedDB); stürzt eine App kurz nach dem Laden des
  Zwischenstands ab, startet sie beim nächsten Mal ohne ihn und bietet „Trotzdem laden“ an (alle Apps)
- **Projektarchiv** `*.oap` (ZIP): Projekt, Planbilder, Dachmodell sowie die
  Originaldateien der Importe (IFC, DXF, PDF) und die Excel-Vorlage – auf einem anderen Rechner vollständig
  wieder zu öffnen, inkl. IFC-Modell in der 3D-Ansicht. Ältere `*.flaeche.json` lassen sich weiter öffnen.

#### Tastenkürzel

| Taste | Funktion |
|---|---|
| `V` / `P` / `R` / `E` / `M` | Auswählen / Polygon / Rechteck / Erkennen / Messen |
| `B` / `N` | neue Flächen als BGF-Umriss / Raum zeichnen |
| `Enter` | Polygon schließen bzw. Zahleneingabe übernehmen |
| `Backspace` | letzten Punkt bzw. letzte Ziffer entfernen |
| `Esc` | Abbrechen / Auswahl aufheben |
| `Entf` (oder `Backspace` ohne laufende Eingabe) | ausgewählte Fläche(n) löschen |
| `Shift`+Klick / `Shift`+Ziehen | Mehrfachauswahl / Auswahlrahmen |
| `Strg+A` | alle Flächen des Geschosses wählen |
| `Strg+C` / `Strg+V` / `Strg+D` | Flächen kopieren / einfügen (in ein anderes Geschoss deckungsgleich) / duplizieren |
| Pfeiltasten (`Umschalt`) | Auswahl um 1 cm (10 cm) verschieben |
| `Tab` / `Umschalt+Tab` | nächste / vorige Fläche wählen (nach einem Klick in die Zeichenfläche) |
| `Strg+S` / `Strg+Shift+S` / `Strg+O` | Speichern / Speichern unter / Öffnen |
| `F1` | Nachschlagewerk der Berechnungsregeln |
| `F` | alles zeigen |
| `Strg+Z` / `Strg+Y` | Rückgängig / Wiederholen |
| Mausrad / mittlere Maustaste / `Leertaste`+Ziehen | Zoomen / Verschieben |

## Aufbau des Repositorys

Ein Repository mit npm-Workspaces, sieben Apps und einem gemeinsamen Unterbau:

```
packages/core/       gemeinsamer Unterbau (TypeScript-Quelltext, in den Apps als @core/… eingebunden)
  src/               Geometrie, Projektformat (.oap), IFC-Import, Dachformen und Gauben, DIN-277-
                     Berechnung, Lageplan-Flächen, Namensschema des Büros (namensschema.ts: Kürzel, Stellen im
                     Dateinamen, Plannummern, Indizes – für alle Apps, je Projektdatei mit Kopie)
  src/excel/         Excel-Vorlagen-Engine (Platzhalter, Blöcke, Formeln), Vorlagenspeicher
  src/dokumente/     Office-Dateien verlustfrei lesen und zellgenau ändern (XML mit Lage im Quelltext, ZIP, Excel),
                     Formeln einer Mappe nachrechnen (auch blattübergreifend)
  src/platform/      Speichern/Öffnen (Tauri-Dialog bzw. Download), web-ifc, Protokoll, Farbschema
  src/ui/            Titelleiste, Protokoll-Fenster, Excel-Dialog, Eingabefelder, Dialoge (Dialog.tsx: Esc, Modal;
                     Rueckfrage.tsx: Rückfragen und Meldungen), Grund-Styles (base.css), Ansicht-Editor
                     (AnsichtEditor.tsx, ansicht.ts), Ziehen mit dem Zeiger (ziehen.ts), ziehbare Leisten (Leiste.tsx)
  tauri/commands.rs  gemeinsame Tauri-Befehle, per include! in alle Tauri-Hüllen eingebunden
apps/flaechenrechner/  Flächenrechner (dieses Tool): Zeichenfläche, Bericht, Excel, DXF/PDF, 3D
apps/grz/              GRZ/GFZ-Nachweis: Lageplan, Nachweis zum Drucken, Excel – siehe docs/grz-gfz.md
apps/kosten/           Kostenermittlung nach DIN 276: Mengen, Kennwerte, Kostenstände, Druck, Excel – siehe docs/kosten.md
apps/ordner/           App „Projekt“: Assistent (neu/fortschreiben), Struktur-Editor, Vorlagen-Presets, Ordner prüfen, Katasterpläne – siehe docs/projektordner.md
apps/entzerrung/       Fotos entzerren und messen: Homographie, Fluchtlinien, Verzeichnung, WebGL – siehe docs/entzerrung.md
apps/formulare/        FORMA-Formulare ausfüllen: Formatkern (.frmsjf), Formular- und Feldansicht, Projektkarte, Verlauf, Projektordner – siehe docs/formulare.md
apps/ava/              Ausschreibung, Vergabe, Abrechnung, Bauleitung: LV-Formate (.aslv, .oalv, GAEB), Preisspiegel, Kostenkontrolle, Rechnungsprüfung, Bautagebuch – siehe docs/ava.md
apps/suite/            Rahmen-App „arch-tools“: alle Apps in einem Fenster (Tabs, herauslösbare Fenster) – siehe docs/suite.md
```

Jede App hat ihre eigene Tauri-Hülle (`apps/<app>/src-tauri`), eigenen Installer und eigene Releases.
Flächenrechner, GRZ-Nachweis und Kostenermittlung öffnen dieselbe Projektdatei (`.oap`): Der Flächenrechner liefert Gebäude, Geschosse und
Flächen, der GRZ-Nachweis pflegt Lageplan und Festsetzungen, die Kostenermittlung Positionen, Kennwerte und
Kostenstände. Was eine App nicht kennt, bewahrt sie beim Speichern. Weil jede App mit ihrer eigenen
Kopie arbeitet, liest sie beim Speichern die Zieldatei neu und führt zusammen (`packages/core/src/zusammenfuehren.ts`):
Was sie seit dem Öffnen nicht geändert hat, kommt aus der Datei – Änderungen anderer Apps gehen nicht verloren.

Die gesamte Berechnung läuft im Frontend. Tauri liefert nur Fenster und nativen Dateidialog; ohne Tauri
fällt `packages/core/src/platform/files.ts` automatisch auf Browser-Mechanismen zurück. Damit ist jeder
Web-Build (`apps/<app>/dist/`) ohne Änderungen als statische Webanwendung einsetzbar.

## Entwicklung

Voraussetzungen: Node.js ≥ 20; für die Desktop-Apps zusätzlich Rust (stable) und unter Windows
die WebView2-Runtime (in Windows 10/11 enthalten) sowie die MSVC-Build-Tools.

```bash
npm install              # alle Workspaces
npm run dev              # Flächenrechner unter http://localhost:1420
npm run dev:grz          # GRZ-Nachweis unter http://localhost:1430
npm run dev:kosten       # Kostenermittlung unter http://localhost:1440
npm run dev:ordner       # Projekt (früher Projektordner) unter http://localhost:1450
npm run dev:entzerrung   # Entzerrung unter http://localhost:1460
npm run dev:formulare    # Formulare unter http://localhost:1470
npm run dev:ava          # AVA unter http://localhost:1490 (Demo-Projekt: http://localhost:1490/?demo)
npm run dev:suite        # Rahmen-App unter http://localhost:1480 (nach npm run build)
npm test                 # alle Tests (Unterbau und Apps, vitest)
npm run typecheck        # TypeScript für alle Workspaces
npm run build            # Web-Builds aller Apps nach apps/<app>/dist/

npm run tauri:dev        # Flächenrechner als Desktop-App
npm run tauri:dev:grz    # GRZ-Nachweis als Desktop-App
npm run tauri:dev:kosten # Kostenermittlung als Desktop-App
npm run tauri:dev:ordner # Projekt als Desktop-App
npm run tauri:dev:entzerrung # Entzerrung als Desktop-App
npm run tauri:dev:formulare  # Formulare als Desktop-App
npm run tauri:dev:ava        # AVA als Desktop-App
npm run tauri:dev:suite      # Rahmen-App als Desktop-App
npm run tauri:build -w flaechenrechner   # Windows-Installer unter apps/<app>/src-tauri/target/release/bundle/
```

Der Workflow **Build & Release** (GitHub Actions) baut je App die Windows-Installer und veröffentlicht ein
GitHub-Release (mit Web-Version als ZIP), sobald die Version der App auf `main` erhöht wird:
Flächenrechner als `v<version>`, GRZ-Nachweis als `grz-v<version>`, Kostenermittlung als `kosten-v<version>`,
Projekt (früher Projektordner) als `ordner-v<version>`, Entzerrung als `entzerrung-v<version>`, Formulare als `formulare-v<version>`,
AVA als `ava-v<version>`,
die Rahmen-App als `suite-v<version>`.
Die Version steht je App in
`package.json`, `src-tauri/tauri.conf.json` und `src-tauri/Cargo.toml` und muss dort überall gleich sein.
Manuell gestartet wird die gewählte App in ihrer aktuellen Version (neu) gebaut. Die CI prüft zusätzlich
alle Tauri-Hüllen mit `cargo check`.

### Automatische Updates

Die Desktop-Apps suchen kurz nach dem Start und danach alle sechs Stunden nach einer neuen Version. Ist eine
verfügbar, erscheint in der Titelleiste „Update x.y.z“; ein Klick lädt den signierten Installer, installiert
ihn und startet die Anwendung neu. Der Versionsknopf in der Titelleiste sucht auch von Hand. Die Web-Versionen
aktualisieren sich nicht selbst.

- Jede App fragt ihr eigenes Manifest ab: `releases/download/updater/<app>.json` (Release „updater“). Der
  Release-Workflow legt es nach jedem Build aus dem `latest.json` des App-Releases dort ab.
- Die Installer werden mit dem privaten Schlüssel signiert (GitHub-Secrets `TAURI_SIGNING_PRIVATE_KEY` und
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`); der öffentliche Schlüssel steht je App in
  `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`). Der Workflow bricht ab, wenn er vom Secret
  `TAURI_UPDATER_PUBKEY` abweicht.
- Für einen lokalen `tauri:build` müssen dieselben beiden Variablen gesetzt sein, sonst scheitert das
  Signieren der Update-Dateien. `tauri:dev` braucht sie nicht.
- Versionen ohne Updater (Flächenrechner bis 0.9.4, GRZ-Nachweis bis 0.2.3, Kostenermittlung 0.1.0) müssen
  einmal von Hand über den Installer aktualisiert werden.

## Hinweise zur Normanwendung (Flächenrechner)

- Die Raumumschließung R/S wird je BGF-Umriss festgelegt; Räume übernehmen sie vom Umriss, in dem sie liegen
  (ein Balkonraum auf einem S-Umriss zählt zur NRF S), lassen sich aber von Hand festlegen. Der IFC-Import setzt
  Balkone, Loggien und Terrassen auf S und nennt Terrassen im Importbericht. Die Auswertung warnt getrennt, wenn
  NRF (R) > BGF (R) oder NRF (S) > BGF (S).
- **Ebenerdige Terrasse** (nicht unterbaut, nicht konstruktiv fest mit dem Gebäude verbunden): gehört nicht zur BGF
  und NRF (DIN 277:2021-08, 6.1 a), zählt aber zur Wohnfläche (§ 2 Abs. 2 Nr. 2 WoFlV). Im Raum unter
  „Raumumschließung“ „außerhalb der BGF – nur Wohnfläche“ wählen (Katalog: „Terrasse (ebenerdig, nicht
  unterbaut)“); unterbaute Terrassen und Dachterrassen sind S.
- **S-Umrisse** (Balkon, Loggia, Dachterrasse): Die obere Begrenzung ist Pflichtangabe (DIN 277:2021-08, 7.1) –
  überdeckt bis Oberkante der Überdeckung (bei übereinanderliegenden Balkonen i. d. R. die Geschosshöhe: „überdeckt“
  bestätigen), nicht überdeckt bis Oberkante Brüstung bzw. Geländer (Körperhöhe), ohne Umwehrung 0. Ohne Angabe
  rechnet der BRI mit der Geschosshöhe und warnt. Die Bodenplatte wird unter S-Umrissen nur auf ausdrücklichen
  Wunsch angesetzt.
- Geschosshöhe und Bodenplatte beziehen sich auf den Fußboden in derselben Bezugsebene wie die Geschosskoten
  (i. d. R. OK Fertigfußboden); die Bodenplatte zählt von der Unterkante der Boden- bzw. Fundamentplatte
  einschließlich darunter liegender Dämmschichten bis zu dieser Bezugsebene; Einzel- und Streifenfundamente zählen
  nicht.
- KGF wird rechnerisch als BGF − NRF ermittelt; sie ist nur aussagekräftig, wenn alle Räume erfasst sind.
- Dachschrägen: Anrechnung „Raumteile nach lichter Höhe“ mit Teilflächen ≥ 2 m / 1–2 m / < 1 m (aus dem IFC
  automatisch); die Wohnfläche ergibt sich exakt als ≥ 2 m + ½ × 1–2 m. Steht ein Raum im Dachgeschoss auf „voll“,
  erinnert ein Hinweis daran, die lichte Höhe zu prüfen.
- **Abzugsflächen im Raum** (§ 3 Abs. 3 WoFlV): Sie erben die WoFlV-Anrechnung und Wohnung des Raums, in dem sie
  liegen, und mindern wahlweise „NRF und Wohnfläche“ (Schornstein, Pfeiler über 0,1 m² und 1,50 m Höhe, Schacht im
  Raum), „nur Wohnfläche“ (Treppe mit mehr als drei Steigungen samt Absätzen – bleibt in der NRF des Raums; für
  VF 9 die Treppe als eigenen Raum zeichnen) oder
  „nur NRF“ (Pfeiler bis 0,1 m², der zur Wohnfläche zählt).
- „Automatisch nach Raumname“ ist ein Vorschlag: Treppenhaus/Treppenraum zählt nicht, ein Raum mit Treppe
  (z. B. „Diele/Treppe“) zählt ohne die Treppenfläche, Hauswirtschaftsraum zählt, Waschküche nicht; Räume eines
  Kellergeschosses (Geschossart) zählen nicht. Die Nutzungsgruppe entscheidet nicht über die Wohnfläche.
- Beim IFC-Import schlägt der Flächenrechner die Nutzungsgruppe nach DIN 277:2021-08 vor (u. a. Abstellraum,
  Keller, Garage, Hauswirtschaftsraum → NUF 7, Galerie → NUF 1, Lager/Archiv → NUF 4). Eine kleinere
  IFC-Nettofläche wird als „Abzug aus IFC-Nettofläche“ je Raum übernommen; Werte deutlich abseits von 3 % nennt der
  Importbericht einzeln. Geschosse ohne Wände (z. B. Spitzboden) erhalten keine BGF – der Bericht weist darauf hin.
- Aus dem Modell erkannte Dachformen tragen ihre Abweichung zum Modell als Fußnote im BRI-Rechenweg.
- Automatisch erkannte Flächen immer kontrollieren (Maße der Auswahl werden angezeigt). Bei Rasterplänen hängt die
  Genauigkeit von der Planqualität ab; DXF-Pläne liefern exakte Kanten.
- DWG wird nicht direkt unterstützt – bitte als DXF exportieren. Archicad-PLN ist ein geschlossenes Format –
  bitte IFC exportieren.
- Dachformen spannen sich über das umschließende Rechteck in Firstrichtung auf; bei L-/T-Grundrissen mit
  mehreren Firsten den Umriss in Teilflächen mit je eigenem Dach aufteilen.
- Die Ergebnisse ersetzen keine fachliche Prüfung.

## Lizenz

MIT – siehe [LICENSE](LICENSE).
