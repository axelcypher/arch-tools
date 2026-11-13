# TERRIO (GRZ-Nachweis) – GRZ, GFZ und Vollgeschosse

**TERRIO** (`apps/grz`, eigene App mit eigenem Installer) weist das Maß der baulichen Nutzung nach:
Grundflächenzahl, Geschossflächenzahl und Zahl der Vollgeschosse – nach dem Recht, das für den jeweiligen
Bebauungsplan gilt. Bis Version 0.22.0 hieß die App „GRZ-Nachweis“; Einstellungen und Daten bleiben beim Update
erhalten.

## Arbeitsweise

- **Einstieg:** Ohne Gebäude und Lageplan-Flächen zeigt die App nur die Einstiegskarte (Projekt wählen, Datei öffnen –
  auch IFC –, Neues Projekt = mit leerem Lageplan beginnen); Festsetzungen, Plan und Nachweis erscheinen danach.
  Nach jedem Öffnen erscheint die Ansicht, auch bei einem Projekt ohne Gebäude; dann sagt ein Hinweis oben, dass
  der Gebäudeumriss aus QUADRIO oder einem IFC-Modell kommt. Der IFC-Bericht ist nur dann gelb, wenn er etwas
  meldet, und schließt mit „×“ oder Esc.
  „Neu“ in der Werkzeugleiste („Öffnen …“, „Nachweis drucken …“ und „Excel-Export …“ öffnen einen Dialog) beginnt ein leeres Projekt (mit Rückfrage bei ungespeicherten Änderungen) und
  verwirft damit auch den Zwischenstand. Gesperrte Knöpfe nennen im Tooltip den Grund. Der Hinweis
  „Grundstücksfläche fehlt“ springt mit „zum Feld“ in das Feld „Grundstücksfläche [m²]“.

- **Öffnen:** ein Projekt aus QUADRIO (Flächenrechner; `.oap`, auch ältere `.json`) oder direkt ein IFC-Modell.
  Gebäudeumrisse, Geschosse, Räume und Dach kommen aus dem Projekt bzw. dem IFC-Import (derselbe Import wie in
  QUADRIO, mit Dachform- und Gaubenerkennung).
- **Pflegen:** Festsetzungen, Lageplan-Flächen (zeichnen als Polygon oder Rechteck, Nutzung, Versiegelung,
  Nachbar-Kennzeichen), Vollgeschoss je Geschoss festlegen, Aufenthaltsräume einstufen.
- **Speichern:** in dieselbe Projektdatei. QUADRIO zeigt Lageplan und Festsetzungen nicht an,
  bewahrt sie aber beim Speichern; umgekehrt bewahrt TERRIO alles, was QUADRIO pflegt. Beim Speichern
  liest jede App die Zieldatei neu und übernimmt, was eine andere App dort inzwischen gespeichert hat, statt es
  mit ihrem eigenen, älteren Stand zu überschreiben (ab QUADRIO 0.11.0, TERRIO 0.4.0,
  NUMIO (Kostenermittlung) 0.4.0). „Speichern“ (Strg+S) schreibt in die geöffnete Datei, „Speichern unter …“
  (Strg+Shift+S) fragt nach einem neuen Namen.
- **IFC aktualisieren …:** ein neuer Export desselben Modells wird in das bestehende Projekt eingelesen, ohne es
  neu aufzusetzen. Geschosse, Räume und Lageplan-Flächen werden über ihre IFC-GlobalId zugeordnet (ältere Projekte
  über Nummer/Name bzw. Überdeckung). Felder, die seit dem letzten Import nicht von Hand geändert wurden, übernehmen
  den neuen IFC-Wert; von Hand geänderte bleiben erhalten – hat sich auch das IFC geändert, meldet der Bericht
  einen Konflikt. Festsetzungen, Einstufungen und Nutzungen bleiben unberührt.
- **Regeln nachschlagen:** „§ Regeln“ in der Titelleiste bzw. F1 öffnet das Nachschlagewerk mit den
  angewandten Vorschriften (Zitat, Fundstelle, Link, Suche); die `?`-Knöpfe an den Abschnitten zeigen nur die
  dort maßgebenden Regeln. In TERRIO zeigt es nur die eigenen Regeln (keine WoFlV); die Suche findet § 19
  BauNVO auch über Terrasse, Carport, Zufahrt, Weg. Die Pillen der Anrechnung („prüfen“, „GRZ II“, „zählt nicht“ …)
  begründen im Tooltip die Einstufung je Nutzung und Fassung und öffnen per Klick die passende Regel.
- **Rückgängig** (Strg+Z) nennt im Tooltip den Schritt („Rückgängig: Nutzung ändern“), ebenso Wiederholen.
- **IFC-Bericht:** Nach dem Import („IFC-Import“) bzw. „IFC aktualisieren“ („IFC-Abgleich“) steht oben eine
  Zusammenfassung („Lageplan: n Flächen, Geländemodell: ja/nein, Geschosse: …“); Hinweise, die nur
  QUADRIO betreffen (BRI, Bodenplatte, Putzabzug, Wohnfläche, Dachform), entfallen.

## Projekt und Bebauungsplan

Die linke Spalte ist in drei Abschnitte gegliedert: **Projekt und Grundstück** (Stammdaten, Grundstücksfläche,
Bebauungsplan), **Festsetzungen** (Baugebiet, Fassungen, Maß der baulichen Nutzung, Vollgeschosse, Höhen) und
**Annahmen für die Berechnung** (Geländeoberfläche, Decken-/Dachaufbau, Wandzuschlag, Einfamilienhaus). Felder
einer Zeile stehen unten bündig. Widersprüche melden sich am Feld, ohne die Eingabe zu sperren: „Mindestens ist
größer als höchstens“ (Vollgeschosse) und eine GRZ II unter der GRZ. Ist „zwingend“ angehakt, bleibt ein Feld
„Anzahl (zwingend)“. Das Baugebiet wird mit Klartext gewählt („WA – allgemeines Wohngebiet“). Die
Grundstücksfläche nennt, was maßgebend ist: der eingetragene Wert (Kataster), die gezeichnete Grenze nur zum
Vergleich; ist das Feld leer, steht dort, woraus ersatzweise gerechnet wird.

Oben in der linken Spalte stehen die gemeinsamen **Stammdaten** des Projekts (Knopf „Stammdaten …“: Bauvorhaben,
Adresse, Gemarkung/Flur/Flurstück, Bauherr, Bearbeitung – dieselben wie in den anderen Apps, gespeichert in der
Projektdatei), dazu direkt eintragbar **Bebauungsplan Nr. und Name** (ebenfalls Stammdaten, also auch in den
anderen Apps sichtbar), das **Baugebiet** (WS, WR, WA, WB, MD, MDW, MI, MU, MK, GE, GI, SO; gespeichert in den
Festsetzungen) und das Datum des Bebauungsplans. Druck und Excel geben sie im gemeinsamen Kopf bzw. unter
„Grundlagen“ aus.

**Festsetzungen:** GRZ, GFZ, GR und GF als absolute Festsetzung [m²], Baumassenzahl (§ 21; Baumasse vereinfacht aus
Grundfläche × Geschosshöhe der Vollgeschosse), Vollgeschosse höchstens bzw. mindestens oder zwingend, GRZ II
höchstens (1990), Trauf- und Firsthöhe (nur als Prüfhinweis im Nachweis, nicht gerechnet) und – nur bei
entsprechender Festsetzung nach BauNVO 1990 – „Aufenthaltsräume in Nicht-Vollgeschossen mitrechnen“ (§ 20 Abs. 3
Satz 2). Absolute GR/GF und BMZ erscheinen als eigene Kacheln und Zeilen in Druck und Excel; unterschrittene
Mindest- bzw. zwingende Vollgeschosse stehen als „unterschritten“.

## Welches Recht gilt

Unter „Projekt und Grundstück“ → „Bebauungsplan“ wird das **Inkrafttreten** des Bebauungsplans eingetragen,
optional das Datum der **öffentlichen Auslegung** des Planentwurfs (Feld neben „Inkrafttreten“). Daraus wählt das Tool zwei Regelwerke; beide lassen
sich übersteuern, maßgebend ist die Planurkunde. Ohne Datum gilt das aktuelle Recht (Vorhaben nach § 34 oder § 35 BauGB).

- **BauNVO-Fassung:** nach der öffentlichen Auslegung (§ 25c Abs. 1 BauNVO 1990: Auslegung nach § 3 Abs. 2 BauGB vor
  dem 27.01.1990 → alte Fassung; ebenso § 25a BauNVO 1977 und § 25 BauNVO 1968). Ohne Auslegungsdatum nimmt das Tool
  das Plandatum an; liegt es weniger als zwei Jahre nach einem Fassungswechsel (01.08.1962, 01.01.1969, 27.01.1990),
  steht ein Hinweis im Nachweis.
- **Vollgeschossbegriff (BauO):** nach dem Inkrafttreten des Plans (Plandatum). Fehlt es, aber die Auslegung ist
  eingetragen, gilt ersatzweise das Auslegungsdatum, mit Hinweis („maßgebend ist das Inkrafttreten“). Ohne beide Daten
  gilt das aktuelle Recht; der Hinweis sagt dann, dass die Kennzahlen bei § 34 BauGB nur der Orientierung dienen.

**BauNVO** (Bundesrecht, gilt in allen Ländern gleich):

| Fassung | Zeitraum | Grundfläche | Geschossfläche |
|---|---|---|---|
| 1962 | bis 31.12.1968 | Nebenanlagen (§ 14) werden nicht angerechnet; eingeschossige Garagen und überdachte Stellplätze bis 0,1 der Grundstücksfläche anrechnungsfrei, in MK, GE, GI ohne Anrechnung nur bei Zulassung („prüfen“, § 19 Abs. 5) | Vollgeschosse nach Außenmaßen, dazu Aufenthaltsräume in anderen Geschossen samt zugehöriger Treppenräume; ohne Nebenanlagen |
| 1968/1977 | 01.01.1969 – 26.01.1990 | zusätzlich unberücksichtigt: Balkone, Loggien, Terrassen, Anlagen in Bauwich/Abstandsflächen (§ 19 Abs. 4); überdachte Stellplätze und Garagen bis 0,1 der Grundstücksfläche anrechnungsfrei (§ 21a Abs. 3) | Vollgeschosse, dazu Aufenthaltsräume in anderen Geschossen einschließlich zugehöriger Treppenräume und Umfassungswände (§ 20 Abs. 2); ohne Nebenanlagen (§ 20 Abs. 3) und ohne nicht angerechnete Garagen (§ 21a Abs. 4) |
| 1990 ff. | ab 27.01.1990 | GRZ I für die Hauptanlage; GRZ II mit Garagen, Stellplätzen und Zufahrten, Nebenanlagen und unterirdischen Anlagen, bis 1,5 × GRZ, höchstens 0,8 (§ 19 Abs. 4) | nur Vollgeschosse (Aufenthaltsräume in anderen Geschossen nur bei Festsetzung); ohne Nebenanlagen (§ 20 Abs. 4), Garagen in Vollgeschossen nur bei Festsetzung nach § 21a Abs. 4 Nr. 3 heraus |

**Vollgeschoss** – statische Verweisung auf die Bauordnung NRW zum Zeitpunkt des Plans (OVG NRW, 03.05.2018,
10 A 2937/15):

| Fassung | Zeitraum | Vollgeschoss, wenn … |
|---|---|---|
| BauO NW 1962/1970 | 01.10.1962 – 31.12.1984 | vollständig über der festgelegten Geländeoberfläche und auf mindestens zwei Dritteln der eigenen Grundfläche die lichte Höhe für Aufenthaltsräume (2,50 m; im Einfamilienhaus und im Dachraum 2,30 m). Kellergeschosse, die im Mittel mehr als 1,40 m über das Gelände ragen, werden angerechnet. |
| BauO NW 1984/1995, BauO NRW 2000 | 01.01.1985 – 31.12.2018 | Deckenoberkante im Mittel mehr als 1,60 m über Gelände und Höhe mindestens 2,30 m (bis OK Fußboden darüber bzw. OK Dachhaut). Geneigte Dachflächen: über mehr als drei Viertel der eigenen Grundfläche; Staffelgeschoss (nur das oberste Geschoss, zurückgesetzt gegenüber einem oberirdischen Geschoss darunter): über mehr als zwei Drittel der Grundfläche darunter. |
| BauO NRW 2018 | ab 01.01.2019 | Deckenoberkante im Mittel mehr als 1,60 m über Gelände und lichte Höhe mindestens 2,30 m über mehr als drei Viertel der Grundfläche des Geschosses darunter. Fällt ein Geschoss nur wegen eines größeren Geschosses darunter durch (z. B. EG über Tiefgarage), steht ein Hinweis im Nachweis. |

Grundflächen und Höhenraster der Vollgeschossprüfung rechnen nach Außenmaßen ohne Balkone, Loggien und Terrassen:
nur Umrisse mit Raumumschließung R (§ 2 Abs. 6 BauO NRW 2018, § 2 Abs. 5 BauO NRW 2000).

Nicht automatisch geprüft werden (BauO NW 1962/1970) Geschosse mit mehr als 1,80 m lichter Höhe unterhalb der
Traufenoberkante und Garagengeschosse; sie lassen sich je Geschoss als Vollgeschoss festlegen. Kellergeschosse
werden bei Plänen ab der BauO NW 1970 (in Kraft ab 01.07.1970, ebenso ohne Plandatum) „im Lichten“ gemessen: Deckenoberkante
minus Decken-/Dachaufbau muss im Mittel mehr als 1,40 m über dem Gelände liegen; bei älteren Plänen zählt die
Deckenoberkante.

## Lageplan

Der Lageplan ist ein eigener Teil der Projektdatei (kein Geschoss): keine BGF, kein BRI, keine
Geschosshöhe. Er besteht aus **Lageplan-Flächen** mit zwei Merkmalen:

- **Nutzung** (Zufahrt, Stellplatz, Garage/Carport, Terrasse, Weg, Nebenanlage, unterirdische Anlage, Garten,
  sonstige) – entscheidet über die Anrechnung auf die Grundfläche.
- **Versiegelung** (vollversiegelt, teilversiegelt, Grünfläche) – für die Flächenbilanz. Sie entscheidet nach
  verbreiteter Auslegung nicht über die GRZ: Eine Zufahrt aus Rasengitter zählt wie eine gepflasterte.

Flächen von **Nachbargrundstücken** (zur Darstellung, oft größer als ihr Flurstück) werden als „Nachbar“ markiert und
zählen nirgends mit.

Bedienung im Lageplan – wie in QUADRIO: Werkzeug „Polygon“ (P; Punkte setzen, Startpunkt, Doppelklick
oder Enter schließt, Rücktaste löscht den letzten Punkt, Esc bricht ab) oder „Rechteck“ (R; zwei Ecken); Ecken von
Gebäude und Flächen werden gefangen. „Auswahl“ (V): Klicken wählt eine Fläche, Ziehen verschiebt sie, Punkte
ziehen ändert sie, ◇ in der Kantenmitte ziehen fügt einen Punkt ein, Rechtsklick auf einen Punkt löscht ihn
(mindestens drei bleiben), Entf/Rück löscht die Fläche. Mausrad zoomt (nur den Plan), mittlere Maustaste,
Leertaste + Ziehen oder Ziehen auf freier Fläche verschiebt die Ansicht, „Einpassen“ (F) zeigt alles. Punkte
werden auf die Innenfläche des Plans umgerechnet (ohne Rahmen), Abweichung unter 1 mm bei jedem Zoom. Der
Ausschnitt (Zoom, Verschiebung) bleibt bei allen Änderungen stehen und wird nur beim Öffnen eines anderen Projekts
neu eingepasst. Leertaste und Enter auf einem fokussierten Knopf oder Kästchen bedienen diesen, nicht den Plan; der
Fokusrahmen des Plans erscheint nur bei Bedienung mit der Tastatur. Die Leiste über dem Plan hat Werkzeuge |
Nutzung; „Einpassen“, „Beschriftung“, „Raster“ und „?“ (Tastenübersicht, schließt mit Esc oder Klick daneben) stehen
als Bedienfeld oben links im Plan. Eingabezeile und Flurstück-Leiste stehen fest, damit der Plan beim
Werkzeugwechsel nicht springt. Ohne
Flächen bietet der Plan „Rechteck zeichnen“, „Polygon zeichnen“ und „Unterlage laden …“ an. Die Flächentabelle
unter dem Plan beginnt mit der Nummer wie im Plan und im Druck.

- **Mehrfachauswahl:** Shift+Klick nimmt Flächen hinzu bzw. heraus, Shift+Ziehen auf freier Fläche zieht einen
  Auswahlrahmen auf, Strg+A wählt alle. Mehrere Flächen werden gemeinsam verschoben, gelöscht und in Nutzung,
  Versiegelung, Nachbar und Höhe gemeinsam bearbeitet. Strg+C/V/D kopiert, fügt ein bzw. dupliziert (um 0,50 m
  versetzt), die Pfeiltasten verschieben die Auswahl um 1 cm (mit Umschalt 10 cm). Nach einem Klick in den Lageplan
  wählt Tab bzw. Umschalt+Tab die nächste bzw. vorige Fläche.
- **Beschriftung und Orientierung:** Jede eigene Fläche trägt im Plan „Nr · Nutzung · m²“ (eindeutiger Anteil, Nummern
  wie im Druck), abschaltbar über „Beschriftung“. Maßstabsleiste und Nordpfeil (Planoberkante = Projektnorden) stehen
  immer im Plan, ein Raster lässt sich zuschalten. Die Hilfezeile nennt nur die wichtigsten Kürzel des Werkzeugs;
  alle Kürzel stehen in der Übersicht hinter „?“.
- **Unterlage:** „Bild/PDF laden …“ legt einen amtlichen Lageplan (PNG, JPG oder die erste Seite eines PDF) unter den Plan;
  er wird mit dem Projekt gespeichert, lässt sich ein- und ausblenden und in der Deckkraft einstellen. „Kalibrieren“:
  zwei Punkte einer bekannten Strecke klicken und die wahre Länge in Metern eintragen – der erste Punkt bleibt an
  seiner Stelle; die Messlinie bleibt sichtbar, bis die Länge eingetragen ist. „Ausrichten“: einen Punkt der
  Unterlage und dann den Zielpunkt im Plan klicken (Pfeil zeigt die Verschiebung). Ein Zug am Regler „Deckkraft“ ist
  ein Rückgängig-Schritt; „Unterlage entfernen“ nimmt sie heraus.
- **Grundstücksgrenze:** Das Werkzeug „Grenze“ (G) zeichnet das Flurstück als Polygon (mehrere nacheinander möglich,
  der Entwurf erscheint strichpunktiert ohne Füllung). Im Werkzeug „Auswahl“ wählt ein Klick auf die Kante ein
  Flurstück; seine Punkte lassen sich ziehen, über ◇ einfügen und per Rechtsklick löschen, Entf löscht das
  Flurstück. Die Leiste „Grenze“ (im Werkzeug Grenze bzw. bei gewähltem Flurstück) listet die Flurstücke mit Fläche
  und löscht sie einzeln. Die strichpunktierte Linie in Plan und Druck ist dann die gezeichnete Grenze;
  ohne Grenze ist sie als „Umriss der erfassten Flächen“ beschriftet. Die Fläche der Grenze wird mit der
  eingetragenen Grundstücksfläche abgeglichen: Bei Abweichung nennt der Nachweis beide Werte, maßgebend bleibt die
  eingetragene Fläche des Baugrundstücks im Bauland (§ 19 Abs. 3 BauNVO). Ohne eingetragene Grundstücksfläche gilt die Fläche der Grenze.
- **Nutzung beim Zeichnen:** Die Auswahl „Nutzung“ neben den Werkzeugen (aktiv bei Polygon und Rechteck) wählt die
  Nutzung neuer Flächen mit denselben Bezeichnungen wie in der Tabelle. Die
  Versiegelung wird passend vorbelegt (z. B. Zufahrt vollversiegelt, Garten Grünfläche), der Name zählt je Nutzung
  („Zufahrt 1“, „Terrasse 2“). Die Wahl wechselt das Werkzeug nicht. „sonstige“
  (Anrechnung „prüfen“) gibt es nur noch auf ausdrückliche Wahl. Der Auswahlbereich unter dem Plan bietet für eine
  gewählte Fläche Bezeichnung, Nutzung, Versiegelung, Nachbargrundstück, Höhe, die Kantenlängen und die Teilflächen
  des Rechenwegs.
- **Genaue Eingabe:** Solange Polygon, Rechteck oder Grenze aktiv ist, steht unter der Leiste die Eingabe (bis zum
  ersten Punkt gesperrt, der Plan springt nicht) – beim Polygon Länge [m] und
  Winkel [°] (gegen die Gebäudeachse, gegen den Uhrzeigersinn; leer: in Richtung des Mauszeigers), beim Rechteck
  Breite × Tiefe [m] entlang der Gebäudeachse in Richtung des Mauszeigers. Eine Zifferntaste springt in das erste
  Feld, Tab wechselt das Feld, Enter setzt den Punkt bzw. das Rechteck, Enter im leeren Feld schließt das Polygon.
  Beim Zeichnen stehen Segmentlänge (bzw. Breite × Tiefe) und Fläche am Mauszeiger und in der Leiste.
- **Kantenfang:** Außer auf Ecken fängt der Cursor auf die Kantenmitte (Dreieck), das Lot vom letzten Punkt auf
  eine Kante (⊥) und jeden Punkt einer Kante (×) – z. B. eine Terrasse ohne Spalt an der Hauswand.
- **Varianten:** Eine Fläche lässt sich im Auswahlbereich auf „nur Variante B“ (bzw. A, C, D) setzen – etwa „mit
  Terrasse“ oder „Carport hier/dort“. Sobald es mehr als eine Variante gibt, zeigt der Nachweis oben die
  Kennzahlen aller Varianten nebeneinander und einen Umschalter; Kacheln, Druck und Excel gelten für die gewählte
  Variante (sie wird im Projekt gespeichert), Flächen anderer Varianten erscheinen im Plan blass.
- **3D-Ansicht:** Überlagerte Lageplan-Flächen auf gleicher Höhe liegen nach ihrem Rang einige Millimeter
  übereinander (wie die Zuordnung der Überlagerungen im Nachweis) – an jeder Stelle ist die höher angerechnete
  Fläche zu sehen, nichts flimmert.
- **Kantenlängen** einer gewählten Fläche lassen sich unter „Kantenlängen“ eintragen: Der Endpunkt wandert entlang
  der Kante; bei einem Rechteck wandert die Nachbarecke mit, es bleibt ein Rechteck.
- **Hilfslinienfang:** Beim Zeichnen und Punkteziehen fängt der Cursor auf den Verlängerungen der Nachbarkanten,
  den Achsen des (genordet schräg stehenden) Gebäudes und den Fluchten vorhandener Eckpunkte. Shift hält die
  Linie auf der Gebäudeachse, Rechtecke richten sich an ihr aus. Alt schaltet den Fang aus.
- **3D-Ansicht:** Umschalter „Plan / 3D“ – Gebäude nach Geschossen (Vollgeschoss farbig hervorgehoben),
  Geländemodell bzw. Lageplan-Flächen in ihrer Höhe und je Geschoss die maßgebende mittlere Geländeoberfläche.

### IFC-Import

- Ein Geschoss, dessen Name „Lageplan“ enthält, wird kein Gebäudegeschoss, sondern der Lageplan – unabhängig
  davon, wo es im IFC einsortiert ist (in Archicad liegt es meist auf Höhe des UG). Es beeinflusst die
  Geschosshöhen nicht. Das gilt auch beim IFC-Import in QUADRIO.
- Seine Bauteile (Decken, Beläge, Zonen, Objekte, Wände) und das IFC-Gelände (`IfcSite`, z. B. eine
  Garageneinfahrt aus dem Gelände-Werkzeug) werden Lageplan-Flächen. Nutzung und Versiegelung werden aus dem Namen
  vorgeschlagen (z. B. „Zufahrt Rasengitter“ → Zufahrt, teilversiegelt; ausdrückliche Angaben wie
  „teilversiegelt“ gehen vor), die Höhe der Oberseite wird übernommen.
- **Geländeelemente** (`IfcGeographicElement`) werden immer Lageplan-Flächen, egal in welchem Geschoss sie im
  IFC stehen. Archicad ordnet sie beim Export nach ihrer Höhe zu (meist dem UG), nicht dem Geschoss „Lageplan“.
  Sie zählen nie zum Gebäude.
- Flächen ohne Verbindung zum Gebäude – auch nicht über andere Flächen – werden als Nachbargrundstück markiert.
- Die nach oben gerichteten Flächen von Gelände und Lageplan-Bauteilen werden als **Geländemodell** gespeichert
  (Höhenfeld für die Vollgeschossprüfung und die 3D-Ansicht).

### Grundstück und Gelände

- **Gemeinschaftsanlagen (§ 21a Abs. 2 BauNVO 1968/1977/1990):** Setzt der Bebauungsplan es fest, werden Anteile
  an außerhalb des Baugrundstücks festgesetzten Gemeinschaftsanlagen (1968: § 9 Abs. 1 Nr. 12 und 13 BBauG, 1977:
  § 9 Abs. 1 Nr. 22 BBauG, heute § 9 Abs. 1 Nr. 22 BauGB; z. B. Gemeinschaftsgaragen im Reihenhausgebiet) der Grundstücksfläche hinzugerechnet: Feld „Anteil an
  Gemeinschaftsanlagen [m²]“ unter der Grundstücksfläche; der Rechenweg zeigt „FGst = Grundstück + Anteil“, der
  Druck nennt den Anteil. Nach BauNVO 1962 gibt es die Regel nicht (Hinweis, kein Zuschlag).
- **Absolute GR und GR II (BauNVO 1990):** Ist die Grundfläche absolut festgesetzt, wird auch die GR II geprüft:
  höchstens 1,5 × GR, höchstens bis zu einer GRZ von 0,8, nie unter der GR selbst (§ 19 Abs. 4 Satz 2); eine
  festgesetzte „GRZ II höchstens“ (Satz 3) geht vor – eigene Karte, Zeile im Druck und Platzhalter `gr2_absolut`.
- **Zu prüfende Aufenthaltsräume:** Räume, die nach Nutzung Aufenthaltsräume sind, aber die lichte Höhe nicht
  erreichen, sind zum Aufenthalt bestimmt (§ 2 Abs. 7 BauO NRW) und zählen vor 1990 zur Geschossfläche. Die GFZ steht
  deshalb ohne und mit ihnen („mit zu prüfenden Räumen bis …“, Rechenweg, Drucknotiz), Status „prüfen“, wenn sie
  mit ihnen überschritten wäre.

- **Grundstücksfläche im Bauland:** Maßgebend ist nach § 19 Abs. 3 BauNVO nur die Fläche des Baugrundstücks im
  Bauland hinter der festgesetzten (sonst tatsächlichen) Straßenbegrenzungslinie – nicht ohne Weiteres die
  Katasterfläche, die Verkehrs-, Grün- oder Waldflächen enthalten kann. Das Feld heißt deshalb „Grundstücksfläche im
  Bauland [m²]“; die Katasterfläche ist gegebenenfalls zu mindern. Sie kommt aus den Projektdaten; fehlt sie, aus der gezeichneten Grundstücksgrenze, sonst aus den eigenen Lageplan-Flächen zusammen mit dem
  Gebäude. Weichen beide voneinander ab, weist der Nachweis darauf hin. Eine Grundstücksfläche von 0 oder darunter (etwa aus einer
  fremden Datei) zählt wie „nicht angegeben“; dann springen Grenze bzw. Lageplan ein.
- **Geländeoberfläche:** eingetragener Wert (vor 1985: die festgelegte Geländeoberfläche). Sonst wird das Gelände
  **je Geschoss** entlang seiner eigenen Außenwände abgetastet (alle 0,4 m, 0,5 m vor der Wand) – aus dem
  Geländemodell des IFC, ersatzweise aus den Höhen der Lageplan-Flächen. Bei Hanglage hat damit jedes Geschoss
  sein eigenes Mittel, Minimum und Maximum; die Quelle steht im Nachweis. Säumt das Gelände weniger als die Hälfte
  des Umfangs, wird ±0,00 angenommen und darauf hingewiesen. Nach BauO NW 1962/1970 („vollständig über der
  Geländeoberfläche“) zählt der höchste Geländepunkt am Geschoss.

## Berechnung

- **Hauptanlage:** Vereinigung aller Geschossgrundrisse (BGF-Umrisse abzüglich Abzugsflächen) der Geschosse, deren
  Decke über dem Gelände liegt – als Überdeckung, nicht als Summe. Nach BauNVO 1968/1977 ohne S-Umrisse
  (Balkone, Loggien, Terrassen).
- **Überlagerungen:** Überlagern sich Lageplan-Flächen untereinander oder mit dem Gebäude, wird jeder Quadratmeter
  nur einmal angerechnet. Die Überdeckung wird der Fläche mit dem höheren Rang zugeschlagen (Gebäude vor Garage
  vor Zufahrt/Stellplatz vor Nebenanlage …); Tabelle und Druck zeigen je Fläche den eindeutigen Anteil und den
  überlagerten Rest, der Nachweis weist auf jede Überlagerung hin.
- **Anrechnung der Lageplan-Flächen** je Fassung (siehe Tabelle oben). Wo die Fassung keine eindeutige Antwort gibt
  (z. B. Terrassen nach 1990, Zufahrten vor 1990), steht „prüfen“: Die GRZ wird ohne und mit diesen Flächen angegeben,
  und im Tab lässt sich je Nutzung festlegen, ob sie zählt. Keller-Grundflächen außerhalb der Hauptanlage gelten als
  unterirdische Anlagen.
- **Geschossfläche:** R-Umrisse der Vollgeschosse. Bei Plänen vor 1990 kommen in Nicht-Vollgeschossen die
  Aufenthaltsräume samt zugehörigen Treppenräumen hinzu, erweitert um die Umfassungswände (Wandzuschlag, Standard
  0,25 m) und begrenzt auf den Grundriss. Ob ein Raum Aufenthaltsraum oder Treppenraum ist, ergibt sich aus Name und
  Nutzungsgruppe und lässt sich je Raum festlegen.
- **Räume in Nicht-Vollgeschossen** werden nach der maßgebenden Bauordnung geprüft: Ein Aufenthaltsraum braucht
  nach BauO NW 1962/1970 2,50 m lichte Höhe (2,30 m im Dachraum und im Einfamilienhaus), nach späteren Fassungen
  2,40 m bzw. im Dachraum/Kellergeschoss 2,20 m über mindestens der Hälfte der Grundfläche (Teile unter 1,50 m
  zählen nicht), in Wohngebäuden der Gebäudeklassen 1 und 2 2,30 m, wenn die Bauaufsicht es gestattet (Schalter
  unter „Annahmen“: vor 1985 „Einfamilienhaus“, danach „Wohngebäude Gebäudeklasse 1/2“). Die Tabelle zeigt je Raum
  Einstufung, Höhenlage und Begründung; Räume mit Höhenversatz (Split-Level) werden mit ihrer eigenen Fußbodenhöhe
  gerechnet. Ein Raum, der nach Nutzung Aufenthaltsraum ist, die lichte Höhe aber nicht erreicht, steht als
  „prüfen“ (Pille und sachlicher Hinweis): vorläufig nicht mitgerechnet; wird er als Aufenthaltsraum genutzt, zählt
  er trotzdem – dann von Hand festlegen.
- **Anteile nahe an einer Schwelle** (⅔, ¾, ½) stehen in den Begründungen mit Nachkommastellen; innerhalb von ±1 %
  mit dem Zusatz „knapp am Grenzwert – Rasterprüfung, im Schnitt nachweisen“.
- **Höhen:** Das Tool rechnet auf einem Raster über dem Grundriss mit der Höhe bis zur Dachhaut (Dachform mit Gauben
  bzw. IFC-Modell) oder bis zum Fußboden darüber. Lichte Höhe = diese Höhe minus Decken-/Dachaufbau (Standard
  0,30 m, einstellbar; gilt für Dach und Decken).
- **Terrassen und offene Fälle:** Unter „Einstufung offener Fälle“ lässt sich nach BauNVO 1990 außer „zählt zur
  GRZ II“ (Vorgabe, wenn die Fläche zählt) und „zählt nicht“ auch „zählt zur Hauptanlage (GRZ I)“ wählen – z. B. für
  eine angebaute, ebenerdige Terrasse, die viele Bauaufsichten der Hauptanlage zurechnen.
- **Gebäudeteile:** Hat ein Geschoss mehrere Umrisse (z. B. eine im IFC modellierte angebaute Garage), lassen sie sich
  unter „Gebäudeteile“ als „Garage / Carport“ oder „Nebenanlage“ kennzeichnen. Sie zählen dann nicht zur
  Hauptanlage, sondern wie eine Lageplan-Fläche dieser Nutzung (§ 19 Abs. 4 BauNVO 1990, § 21a 1968/1977 bzw.
  § 19 Abs. 5 1962) und erscheinen in der Tabelle „Grundfläche“; die Vollgeschossprüfung bleibt unverändert.
  **Geschossfläche:** Nebenanlagen zählen nicht (§ 20 Abs. 4 BauNVO 1990, § 20 Abs. 3 der früheren Fassungen).
  Garagen zählen nach BauNVO 1962 und 1968/1977 nicht, soweit sie nicht auf die Grundfläche angerechnet werden
  (§ 20 Abs. 3 i. V. m. § 19 Abs. 5 BauNVO 1962, § 21a Abs. 4 Nr. 2 BauNVO 1968/1977); nach 1968/1977 und 1990 ganz nicht, wenn der Bebauungsplan das nach § 21a
  Abs. 4 Nr. 3 festsetzt (Kästchen „Garagen in Vollgeschossen zählen nicht zur Geschossfläche (festgesetzt bzw. als Ausnahme zugelassen)“ unter „Maß der baulichen Nutzung“ in den
  Festsetzungen, ab BauNVO 1968).
- **BauNVO 1962, § 19 Abs. 5:** Außerhalb von Kern-, Gewerbe- und Industriegebieten werden eingeschossige Garagen und
  überdachte Stellplätze bis 0,1 der Grundstücksfläche nicht angerechnet („bis 0,1 frei“, wie 1968/1977). Im Kern-,
  Gewerbe- und Industriegebiet (MK, GE, GI) können sie ohne Anrechnung zugelassen werden: Das Tool zeigt „prüfen“
  und rechnet ohne und mit ihnen; nach Klärung unter „Einstufung offener Fälle“ festlegen.
- **GRZ I mit ungeklärten Flächen (BauNVO 1990):** Terrassen und Wege mit „prüfen“ rechnet ein Teil der Praxis der
  Hauptanlage zu. Die GRZ I steht deshalb – wie die GRZ II – ohne und mit ihnen; überschreitet sie mit ihnen die
  zulässige GRZ, lautet der Status „prüfen“.
- **Treppenräume (vor 1990):** Ein Treppenraum in einem Nicht-Vollgeschoss zählt nur zur Geschossfläche, wenn im
  selben Geschoss ein Aufenthaltsraum liegt („die zu ihnen gehörenden Treppenräume“, § 20 Abs. 2 BauNVO 1962/1968/1977).

## Ausgabe

- Kennzahlen mit Ampel und Reserve (Karte: Fläche, „zulässig … · Reserve …“ bzw. „Überschreitung …“, bei ungeklärten
  Flächen eine eigene Zeile „mit ungeklärten Flächen bis …“; der Flächenvergleich steht im Tooltip und im
  Rechenweg), Vollgeschossprüfung (Begründungen über „Begründungen zeigen“), Geschossfläche je Geschoss,
  Flächenbilanz (Gebäude, voll-/teilversiegelt, grün; der Rest als „nicht gezeichnet (Rest des Grundstücks)“,
  Überlappungen warnend) und Hinweise. Zahl und Einheit stehen nie getrennt; die Tabellen laufen nicht über. Bis
  1280 px Fensterbreite steht der Nachweis unter Festsetzungen und Plan, eine Ergebnisleiste oben (GRZ, GFZ,
  Vollgeschosse mit Ampel, „zum Nachweis“) bleibt beim Scrollen stehen.
- **Einstufung automatisch oder von Hand:** Vollgeschosse und Räume haben dasselbe Muster – eine Auswahl
  „automatisch: Vollgeschoss“ (mit dem Ergebnis der Prüfung) bzw. „… (von Hand)“. Eine Festlegung von Hand ist
  farbig und kursiv hervorgehoben; die Karte „Vollgeschosse“ nennt „davon … von Hand festgelegt“, der Druck
  „(von Hand festgelegt)“.
- **Stellen der Kennzahlen:** GRZ und GFZ stehen mit mindestens drei Nachkommastellen; liegt der Wert näher als
  0,005 am zulässigen Wert, mit vier (0,5017 statt 0,50) – und mit so vielen mehr, dass „überschritten“ nie neben
  gleich aussehenden Zahlen steht. Die Ampel ist zusätzlich in m² begründet („GF 307,28 m² > 306,25 m² zulässig“).
  Kachel, Druck und Excel zeigen dieselben Stellen.
- **Ohne Grundstücksfläche** zeigen die Kacheln die Grundfläche bzw. Geschossfläche aus der Rechnung, die Kennzahl
  als „–“ und „Grundstücksfläche fehlt“ statt einer Ampel.
- **Hinweise** sind getrennt in sachliche (für die Bauaufsicht, kommen in Druck und Excel) und Bedienhinweise
  (nur in der App, grau; z. B. „Geländeoberfläche unbekannt“). Arbeitsanweisungen stehen nur in der App.
- **Rechenweg:** „Rechenweg“ unter den Kacheln zeigt die Formeln (z. B. „GRZ I = GR I / FGst = 135,00 m² /
  612,50 m² = 0,220“, GR II = GR I + Anlagen nach § 19 Abs. 4, GF als Summe der Geschosse). Jede Fläche (Hauptanlage
  und eigene Lageplan-Flächen, jeweils der eindeutige Anteil) wird in Rechtecke (Länge × Breite) bzw. Dreiecke
  (Grundseite × Höhe / 2) zerlegt; die Summe der Teilflächen ist exakt die Fläche aus den Koordinaten. Rechtwinklige
  Flächen – auch schräg zur Planachse und mit Löchern, etwa ein Garten um das Haus – werden in Streifen entlang
  ihrer Achse zerlegt, andere ohne Löcher in Dreiecke; mehr als acht Teile oder keine saubere Zerlegung ergeben
  „Fläche aus Koordinaten“. Im Druck (Schalter „Rechenweg“, standardmäßig an) stehen Formeln und Teilflächen als
  Tabelle, im Lageplan die Teilflächen gestrichelt mit Nummer und Maßen; im Excel-Standardlayout Formeln und
  Teilflächen als Zeilen mit der Formel Länge × Breite × Faktor.
- **Zwischenstand:** Die App sichert den Stand laufend im Browser bzw. App-Speicher. Wird nach einem Neustart ein
  Stand wiederhergestellt, der von der Datei abweicht, gilt er als ungespeichert (Titel „•“); eine Leiste
  „Ungespeicherter Stand vom … wiederhergestellt – Speichern / Verwerfen“ bietet an, ihn zu speichern oder auf den
  Stand der Datei (bzw. ein leeres Projekt) zurückzusetzen.
- **Nachweis drucken** (Strg+P): Nachweis auf A4 hoch – Kopf mit den Stammdaten, Grundlagen und Festsetzungen
  (Datum TT.MM.JJJJ), Ergebnis-Tabelle, Lageplan, Grundfläche je Fläche, Vollgeschossprüfung mit Begründung,
  Geschossfläche, vor 1990 die Aufenthaltsräume in Nicht-Vollgeschossen, Flächenbilanz, sachliche Hinweise und
  Unterschriftszeile. Versiegelungen sind in Plan und Legende auch schwarz-weiß unterscheidbar (voll: Schraffur,
  teil: Punkte, Grün: Fläche), „überschritten“/„unterschritten“ steht fett, kleine Tabellen werden nicht getrennt;
  „Drucken / PDF“ ist der Hauptknopf der Leiste. Über den Druckdialog auch als PDF; der vorgeschlagene Dateiname ist `<Projektdatei> GRZ+GFZ`.
  - Tabelle „Grundfläche“: Spalte „eindeutig“ (Überlagerungen nur einmal gezählt) und „angerechnet auf GR II“
    (BauNVO 1990) bzw. „auf GR“ – 0 bei „zählt nicht“, anteilig bei Garagen bis 0,1 der Grundstücksfläche, bei
    „prüfen“ als Spanne; Kellergeschosse außerhalb der Hauptanlage als eigene Zeile. Die Summenzeilen GR I und
    GR II bzw. GR stimmen exakt mit den Kacheln überein.
  - Lageplan: Nummern in mindestens 10 pt im eindeutigen Anteil der Fläche (nicht unter dem Gebäude oder
    überlagernden Flächen, bei mehreren Teilstücken im größten), Maßstabsleiste und Nordpfeil (Planoberkante =
    Projektnorden des Modells).
  - „Stand“ im Kopf wird im Druckdialog eingetragen und mit dem Projekt gespeichert (leer: ohne Stand), nicht
    automatisch heute; Excel übernimmt ihn (`{{stand.text}}`). Der Haftungssatz
    des Tools steht nur auf dem Blatt, wenn „Haftungshinweis“ gewählt ist.
- **Excel …**: Standardlayout (Blatt „GRZ GFZ“ mit Summenformeln) oder eigene Vorlage mit Platzhaltern wie
  `{{grz}}`, `{{gfz}}`, `{{vollgeschosse}}`, `{{bilanz.*}}` und den Sammlungen `geschoss`, `lageplan`, `raum`,
  `hinweis` – siehe [Excel-Vorlagen](excel-vorlagen.md#terrio-grz-nachweis). Die Vorlage wird wie in QUADRIO im
  Projekt mitgespeichert, aber getrennt von dessen Vorlage.
  - Im Standardlayout sind die Kennzahlen Formeln aus den Zellen (GRZ = Grundfläche / Grundstücksfläche), dazu die
    zulässige Fläche (zulässig × Grundstücksfläche) und das Ergebnis als Vergleich – Prüfer können nachrechnen.
    Die offene Spanne steht als eigene Zeile „GRZ II bei Anrechnung offener Flächen“.
  - Die Lageplan-Flächen haben die Spalten „eindeutig“ und „angerechnet“; die Summe über „eindeutig“ ist der Wert
    der App (keine doppelt gezählten Überlagerungen).

Das Tool rechnet nach und zeigt die angewandte Fassung; die Verantwortung für den Nachweis bleibt bei der
Entwurfsverfasserin bzw. dem Entwurfsverfasser.

## Quellen

- [§ 19 BauNVO](https://www.gesetze-im-internet.de/baunvo/__19.html), [§ 20 BauNVO](https://www.gesetze-im-internet.de/baunvo/__20.html)
- Frühere Fassungen: [BauNVO 1962](https://www.planertreff.de/recht/baunvo/baunvo-1962.html), [BauNVO 1968](https://www.planertreff.de/recht/baunvo/baunvo-1968.html), [BauNVO 1977](https://www.planertreff.de/recht/baunvo/baunvo-1977.html)
- [Stadt Meschede: Vollgeschossbegriff in den Bauordnungen NRW 1962 bis 2018](https://www.meschede.de/fileadmin/Mediendatenbank/Downloads/Planen_und_Bauen/Bauleitplanung/Rechtskraeftige_Bebauungsplaene/Vollgeschoss_Begriff_Vollgeschossigkeit.pdf)
- [AKNW-Rechtstipp zum alten Bauordnungsrecht](https://www.aknw.de/recht/rechtstipps-und-urteile/details/news/rechtstipp-nach-welchen-grundlagen-ermittle-ich-fuer-ein-staffelgeschoss-ob-es-sich-um-ein-vollgeschoss-handelt-wenn-der-bebauungsplan-von-1978-ist-1)
- [IK-Bau NRW: Synopse BauO NRW 2018/2023](https://ikbaunrw.de/kammer-wAssets/docs/Recht/Synopsen_BauO-NRW/IK-Bau-NRW-Synopse-BauO-NRW-2023.pdf) (§ 2 Abs. 5, § 46)
- [BauO NRW 2018](https://recht.nrw.de/lrgv/gesetz/01092026-landesbauordnung-2018-bauo-nrw-2018/)
