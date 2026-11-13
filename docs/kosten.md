# NUMIO (Kostenermittlung)

**NUMIO** (`apps/kosten`, eigene App mit eigenem Installer) leitet aus den Flächen und
Rauminhalten des Projekts Mengen ab und rechnet daraus mit Kennwerten die Kosten nach DIN 276 – als
Bandbreite (von / Mittel / bis), nachvollziehbar je Position. Bis Version 0.19.0 hieß die App „Kostenermittlung“;
Einstellungen und Daten bleiben beim Update erhalten.

Die Kennwerte sind Eingaben des Büros (eigene Projekte, Kennwertsammlungen, Literatur). Das Tool liefert
keine Preise; es rechnet transparent mit den hinterlegten Werten und dokumentiert Preisstand, Baupreisindex
und Regionalfaktor.

## Arbeitsweise

- **Öffnen:** ein Projekt aus QUADRIO (Flächenrechner; `.oap`, auch ältere `.json`) oder direkt ein IFC-Modell
  (derselbe Import wie in QUADRIO). Ohne Gebäudemodell lassen sich die Mengen von Hand eintragen.
- **Start:** Solange kein Projekt geöffnet ist, zeigt NUMIO nur den Einstieg (Projekt oder IFC öffnen,
  „Neues Projekt“); die Kostenansicht erscheint, sobald ein Projekt offen oder neu begonnen ist.
- **Pflegen:** Stufe und Kostenstand (Preisstand), Faktoren, Mengen, Positionen mit Kennwerten, festgehaltene Stände.
- **Zwischenstand:** NUMIO hält den Arbeitsstand laufend fest. Nach einem Absturz oder Neuladen kommt ein
  ungespeicherter Stand zurück und bleibt als ungespeichert markiert („•“, Leiste „Ungespeicherter Stand vom …
  wiederhergestellt – Speichern / Verwerfen“); vor dem Öffnen eines anderen Projekts wird nachgefragt.
  Der Zwischenstand wird 0,6 s nach der letzten Änderung geschrieben; schließt Arkly das Fenster oder den Tab
  (auch beim Andocken, Beenden oder Update), schreibt NUMIO einen ausstehenden Stand vorher sofort.
- **Speichern:** in dieselbe Projektdatei. QUADRIO und TERRIO (GRZ-Nachweis) zeigen die Kostenermittlung nicht
  an, bewahren sie aber beim Speichern (ab QUADRIO 0.9.4 und TERRIO 0.2.3); umgekehrt bewahrt
  NUMIO alles, was die anderen Apps pflegen. Ändern sich dort Flächen, ändern sich die Kosten
  beim nächsten Öffnen mit. Beim Speichern
  liest jede App die Zieldatei neu und übernimmt, was eine andere App dort inzwischen gespeichert hat, statt es
  mit ihrem eigenen, älteren Stand zu überschreiben (ab QUADRIO 0.11.0, TERRIO 0.4.0,
  NUMIO 0.4.0). Wird während „IFC aktualisieren …“ weitergearbeitet oder ein anderes Projekt geöffnet,
  verwirft NUMIO das Ergebnis des Imports mit einer Meldung, statt die Eingaben zu überschreiben.
  „Speichern“ (Strg+S) schreibt in die geöffnete Datei, „Speichern unter …“
  (Strg+Shift+S) fragt nach einem neuen Namen.
- **IFC aktualisieren …:** ein neuer Export desselben Modells wird über die IFC-GlobalIds in das bestehende Projekt
  eingelesen; Positionen, Kennwerte und von Hand geänderte Werte bleiben erhalten, die Mengen rechnen sich neu.
- **Regeln nachschlagen:** „§ Regeln“ bzw. F1 öffnet das Nachschlagewerk (DIN 276, DIN 277) mit Quellen und Suche.

## Mengen

Alle Mengen werden aus dem Projekt abgeleitet. Ein eingetragener Wert gilt statt des abgeleiteten; ein
geleertes Feld schaltet zurück.

| Kürzel | Menge | Ermittlung |
|---|---|---|
| BGF, BRI, NUF, NRF, TF, VF | Grundflächen und Rauminhalt | DIN 277, wie in QUADRIO |
| WoFl | Wohnfläche | WoFlV |
| GRF | Gründungsfläche | Fläche der BGF-Umrisse, unter denen kein tieferes Geschoss liegt: das unterste Geschoss, dazu bei Teilunterkellerung das EG neben dem Keller und Anbauten ohne Keller – siehe unten |
| BGI | Baugrubenrauminhalt | grob: Fläche des untersten Geschosses × Tiefe seines Fußbodens unter ±0,00. Kennwertsammlungen beziehen den Baugrubenrauminhalt bis zur Baugrubensohle einschließlich Arbeitsraum und Böschung; für KG 310 Menge ggf. von Hand festlegen |
| AWF | Außenwandfläche | grob: senkrechte Außenflächen der BGF-Körper (R), einschließlich Öffnungen und erdberührter Wände – bis zur Geschosshöhe, im obersten Geschoss bis zur Dachhaut; Wände zwischen aneinanderliegenden Umrissen zählen nicht (nur der Teil über dem niedrigeren Körper) |
| IWF | Innenwandfläche | Wände aus dem IFC-Modell: je Innenwand die Ansichtsfläche einer Seite vom Wandfuß bis zur Oberkante (Länge × Höhe, Öffnungen übermessen, Schrägen in wahrer Größe). Ohne IFC-Modell nur grob aus den Raumumfängen – siehe unten |
| DEF | Deckenfläche | Flächen über einem tieferen Geschoss; Geschosse mehr als 1,00 m über dem untersten Geschoss bzw. ±0,00 zählen ganz (auch auskragende Teile) |
| DAF | Dachfläche | Oberseiten der BGF-Körper (R), geneigte Flächen in wahrer Größe; ebene Flächen nur, soweit kein Geschoss darüber liegt (Staffelgeschoss, Anbau). Versätze bis 25 cm zwischen den Geschossen zählen nicht; ohne Dachüberstände |
| AUF | Außenanlagenfläche | Näherung: Grundstücksfläche − überbaute Fläche (Geschoss mit der größten BGF ab Geländehöhe; auskragende Teile anderer Geschosse sind nicht abgezogen) |
| FBG | Grundstücksfläche | Projektdaten |
| WE | Wohneinheiten | Wohnungen im Projekt |

Die Bauteilmengen sind Näherungen für frühe Leistungsphasen (keine Abzüge für Öffnungen, keine
Bauteilschichten). Für die Kostenberechnung auf Elementebene eigene Mengen eintragen. Abzugsflächen
(Innenhof, Luftraum) erzeugen weder Wände noch Dachflächen.

### Gründungs- und Deckenfläche

Die Gründungsfläche (GRF) ist die Fläche, unter der kein tieferes Geschoss liegt – nicht nur das unterste
Geschoss. Bei einer **Teilunterkellerung** gehört der Teil des EG neben dem Keller dazu, bei einem
eingeschossigen **Anbau neben einem unterkellerten Haus** der Anbau. Die Deckenfläche (DEF) umfasst nur die
überbauten Teile, also die Geschossflächen über einem tieferen Geschoss.

Beispiel: Keller 6,00 × 11,25 m unter der Westhälfte, EG und OG je 12,00 × 11,25 m (135 m²):
GRF = 67,50 (Keller) + 67,50 (EG östlich des Kellers) = 135,00 m²; DEF = 67,50 (EG über dem Keller) + 135,00 (OG)
= 202,50 m². Zusammen ergeben GRF und DEF die BGF (337,50 m²).

Liegt ein Umriss teils auf dem Gelände und teils über einem tieferen Geschoss, erscheint er in **Mengen prüfen**
zweimal: in GRF mit dem freien, in DEF mit dem überbauten Teil (Rechenansatz „… von … m² ohne Geschoss
darunter“). Beide Teile lassen sich getrennt an- und abwählen. Streifen schmaler als 25 cm (etwas größer
gezeichnete Geschosse, unterschiedliche Wandstärken) zählen als überbaut. Geschosse, deren Fußboden mehr als
1,00 m über dem untersten Geschoss bzw. über ±0,00 liegt, stehen nicht auf dem Gelände und zählen ganz als
Decke – auch auskragende Teile. Die Baugrube (BGI) bleibt auf das unterste Geschoss beschränkt. Die Regel ist eine
Näherung: Bei Split-Level oder Hanglage (Halbgeschosse auf dem Gelände) und bei überdeckten Terrassen (S-Umrisse,
oft KG 500) GRF und DEF prüfen und ggf. von Hand festlegen.

### Innenwände aus dem IFC-Modell

Räume können ohne Wand aneinandergrenzen (offene Küche, Flur ohne Tür), deshalb taugen die Raumumrisse nicht
für die Innenwandfläche. Enthält das Projekt ein IFC-Modell (direkt geöffnet oder in QUADRIO importiert
und mitgespeichert), liest NUMIO beim Öffnen dessen Wände (`IfcWall`, `IfcWallStandardCase`) und
vermisst jede einzeln: Länge entlang der Achse, Dicke, Ansichtsfläche vom Wandfuß bis zur Oberkante. Türen und
Fenster werden übermessen, raumhohe Durchgänge überbrückt, Giebel und Dachschrägen in wahrer Größe gerechnet.

Welche Wand innen liegt, entscheidet:

- `IsExternal` aus `Pset_WallCommon` – aber nur, wenn das Modell beide Werte enthält. Viele Modelle markieren
  alle Wände als außen (Archicad-Voreinstellung), dann ist die Angabe wertlos;
- sonst die Lage: Eine Außenwand liegt auf ganzer Länge am umschlossenen BGF-Umriss ihres Geschosses.

Außenwände, Wände außerhalb der BGF und Wände unter 0,50 m Höhe (Aufkantungen, Sockel) stehen in der Liste,
zählen aber zunächst nicht. Ohne IFC-Modell bleibt die grobe Näherung (Σ Raumumfänge − Außenumfang) / 2 ×
Geschosshöhe mit einem Hinweis auf ihre Schwäche.

### Teile an- und abwählen

Jede Menge ist eine Summe von Teilen, und jedes Teil lässt sich in **Mengen prüfen** einzeln an- oder abwählen:
mit dem Häkchen im Rechenweg (die ganze erste Spalte ist Klickfläche; das Häkchen im Tabellenkopf wählt alle
Teile an oder ab) oder per Klick auf das Teil im Grundriss bzw. im 3D-Modell. Mit der Tastatur geht es ebenso:
Tab zum Häkchen oder zum Teil im Grundriss, dann Leertaste (im Grundriss auch Enter); das fokussierte Teil wird
im Bild hervorgehoben. Abgewählte Teile erscheinen grau und durchgestrichen – auch unter dem Mauszeiger bleiben
sie grau, nur ihr Umriss wird orange – und zählen weder zur Menge noch zu den Kosten. Über dem Rechenweg setzen
„alle“, „keine“ und „Standard“ die Auswahl der gewählten Menge auf einmal. In der Mengenliste trägt eine Menge
mit geänderter Auswahl das Kennzeichen „Auswahl geändert“. Die Auswahl wird im Projekt gespeichert (nur
Abweichungen vom Standard) und gilt auch für Druck, Excel und Kostenstände. Ist eine Menge von Hand festgelegt,
wirkt die Auswahl erst, wenn der Handwert entfernt ist.

### Mengen prüfen

Keine Menge ist nur eine Zahl: Jede ist die Summe einzelner Teile – Umrisse, Räume, Wand- und Dachflächen –,
und genau diese Teile zeigt die Ansicht **Mengen prüfen** (Werkzeugleiste, oder Klick auf das Kürzel einer
Menge in der Kostenansicht):

- **links** alle Mengen mit dem Wert, mit dem die Kosten rechnen. Ist eine Menge von Hand festgelegt, steht sie
  mit dem Kennzeichen „festgelegt“ und dem abgeleiteten Wert klein darunter („abgeleitet 245,00“); geänderte
  Teilauswahl ist mit „Auswahl geändert“ gekennzeichnet. Die Liste ist auch mit der Tastatur bedienbar (Tab
  zur gewählten Menge, ↑/↓ bzw. Pos1/Ende wählen die nächste). Bei Fensterbreiten bis 1400 px zeigt sie nur
  Kürzel und Wert (der Name steht im Tooltip), damit Bild und Rechenweg nebeneinander Platz haben,
- **in der Mitte** die gewählte Menge im Bild: **Grundrisse** aller Geschosse im selben Ausschnitt (oberstes
  zuerst) oder das **3D-Modell**. Was zählt, ist blau gefüllt und beschriftet, Abzüge sind rot schraffiert
  (Geschosssumme dann als „Abzug 155,00 m²“), der Rest des Projekts steht nur als dünne Linie bzw. blasser
  Körper da. Geschosse, die zur Menge nichts beitragen, sind mit „zählt nicht“ gekennzeichnet. Die Legende
  nennt nur, was im Bild vorkommt. Die Grundrisse sind Zeichenfläche wie in QUADRIO: hell wie Papier, im
  dunklen Farbschema folgen sie der Einstellung „Zeichenfläche dunkel“ (Menü ◐),
- **rechts** der Rechenweg: je Teil Geschoss, Bezeichnung, Rechenansatz und Wert (Abzüge mit Minus); die Summe
  ist die Menge.

Ein Teil unter dem Mauszeiger wird in Bild und Tabelle gemeinsam hervorgehoben, die Zeile im Rechenweg wird
dabei eingeblendet; ein Klick darauf wählt es an oder ab (siehe oben). Im 3D-Modell steht über dem Bild
Bezeichnung und Wert des Teils unter dem Mauszeiger; „⤢ Alles“ zeigt das ganze Modell, nach dem
Auseinanderziehen der Geschosse passt sich der Ausschnitt von selbst an. Grundflächen, Räume,
Gründung, Decken und Außenanlagen öffnen in den Grundrissen, Rauminhalt, Außenwand und Dach im 3D-Modell
(drehen, zoomen, Geschosse auseinanderziehen); beide Darstellungen lassen sich für jede Menge umschalten.
Hinweise, die eine Schwäche der Menge beschreiben (etwa die grobe Innenwandfläche ohne IFC-Modell oder die
fehlende Grundstücksfläche), sind als Warnung hervorgehoben. Ist eine Menge von Hand festgelegt, weist die
Ansicht darauf hin – das Bild zeigt immer die abgeleitete Menge –, und „Handwert entfernen“ kehrt zur
abgeleiteten Menge zurück.

Die Ansicht zeigt auch Schwächen des Modells: Reicht etwa ein Körper des Rauminhalts weiter nach oben als
erwartet, liegt das an den Umrissen bzw. der Dachzuordnung in QUADRIO („Dach aus Modell“ ohne
Begrenzung auf die Geschosshöhe) und sollte dort korrigiert werden.

## Positionen

Jede Position gehört zu einer Kostengruppe (dreistellig, 1. bis 3. Ebene) und hat eine Bezugsgröße:

- eine der **Mengen** oben – Kosten = Menge × Kennwert × Faktor
- **eigene Menge** mit Einheit (z. B. 2 Stk Aufzug, 35 m Zaun)
- **pauschal** – ein Betrag
- **% von KG** – Prozentsatz auf die Summe anderer Kostengruppen (z. B. Baunebenkosten auf KG 300 + 400)

**+ Position** legt eine leere Zeile an und setzt den Cursor in die Kostengruppe; Bezeichnung und Bezugsgröße
folgen aus der eingetragenen Kostengruppe. Eine ungültige Kostengruppe und eine Doppelerfassung stehen direkt an
der Zeile. „Gliederung 1./2. Ebene“ legt nur die Kostengruppen an, die noch fehlen, und ist gesperrt, wenn alle
vorhanden sind. Unter der Stufe nennt NUMIO die geforderte Gliederungstiefe.

Kennwerte werden als **von / Mittel / bis** eingetragen. Fehlt „von“ oder „bis“, gilt der Mittelwert; fehlt
der Mittelwert, wird er aus „von“ und „bis“ gemittelt. Sind die Werte nicht aufsteigend eingetragen (etwa
von 20, Mittel 10, bis 5), wird mit der sortierten Spanne gerechnet (5 / 10 / 20) und an der Position darauf
hingewiesen. Negative Mengen, Kennwerte, Beträge und Prozentsätze (etwa aus einer Datei) werden gerechnet,
aber als unplausibel gemeldet. Positionen lassen sich ausschalten – sie bleiben
sichtbar, werden aber nicht gerechnet (für Alternativen).

„Gliederung 1. Ebene“ legt leere Positionen für KG 300, 400, 500 und 700 an (Kostenrahmen, Kennwerte je m²
BGF), „Gliederung 2. Ebene“ für KG 310 bis 480 mit Bauteilmengen (ab der Kostenschätzung). DIN 276:2018-12
verlangt für die Kostenschätzung die 2. und für die Kostenberechnung die 3. Ebene; HOAI § 2 Abs. 10/11 (mit
Bezug auf DIN 276:2008-12) die 1. bzw. 2. Ebene. Vorgeschlagen wird deshalb die 1. Ebene nur für den
Kostenrahmen; die 3. Ebene ist frei eintragbar. Jede Kostengruppe bekommt dabei ihre übliche Bezugsgröße: Baugrube je m³ BGI, Gründung
je m² GRF, Außenwände je m² AWF, Innenwände je m² IWF, Decken je m² DEF, Dächer je m² DAF, technische
Anlagen je m² BGF, Außenanlagen je m² AUF, Baunebenkosten in % von KG 300 + 400.

**Prozentpositionen** werden nach ihren Abhängigkeiten gerechnet, nicht in der Reihenfolge der Liste: Liegt
eine Prozentposition in der Grundlage einer anderen (z. B. KG 700 = 20 % von KG 300 in der Grundlage von
KG 810 = 10 % von KG 300 + 700), wird sie zuerst gerechnet. Beziehen sich Prozentpositionen gegenseitig
aufeinander – auch über mehrere Stufen –, ist das ein **Zirkelbezug**: Die beteiligten Positionen werden mit
0 € gerechnet und gemeldet. Ergibt die Grundlage einer Prozentposition 0 €, heißt der Hinweis „Grundlage ohne
Kosten“.

Das Tool weist auf **Doppelerfassung** hin, wenn eine Kostengruppe und eine ihr übergeordnete gleichzeitig
gerechnet werden (z. B. KG 300 je m² BGF und zusätzlich KG 330), auf Positionen ohne Menge oder Kennwert und
auf unplausible Eingaben.

## Kostenrisiken

DIN 276:2018-12 sieht vor, Kostenrisiken zu benennen und in der Kostenermittlung gesondert auszuweisen. Dafür gibt es
Positionen mit der Kennung **Kostenrisiken** statt einer Kostengruppe (intern `risiko`, Knopf **+ Kostenrisiko**). Vorbelegt ist
**% von KG 300 + 400** – eine Voreinstellung, die je Projekt zu prüfen ist (Risiken etwa auch in KG 200 oder 500); möglich sind auch
pauschal oder eine Menge als Bezug. Mehrere
Risiko-Positionen werden addiert.

- Kostenrisiken zählen **nicht** in die Summen der Kostengruppen, sondern als eigener Betrag zu den
  Gesamtkosten: Gesamtkosten netto = Summe der Kostengruppen + Kostenrisiken, brutto daraus.
- Die Kennwerte des Bauwerks (€/m² BGF …) bleiben ohne Risiko.
- Kostenrisiken können nicht Grundlage einer Prozentposition sein; steht `risiko` in einer Grundlage, wird
  es nicht berücksichtigt und gemeldet. Die Prüfung auf Doppelerfassung lässt sie außen vor.
- Übersicht, Druck und Excel weisen die Kostenrisiken als eigene Zeile vor „Gesamt netto“ aus.
- Festgehaltene Stände halten das Risiko mit fest; der Vorher/Nachher-Vergleich zeigt es als eigene Zeile.
- Im Kennwertkatalog steht in der Spalte KG `risiko`.

## Faktoren und Umsatzsteuer

- **Baupreisindex:** Index zum Stand der Kennwerte und aktueller Index; der Faktor ist aktuell / Stand.
- **Regionalfaktor:** 1,000 = Bundesdurchschnitt.
- Beide wirken auf Kennwerte je Einheit, nicht auf Pauschalen und Prozentsätze.
- Ein Index oder Regionalfaktor von 0 oder darunter ist ungültig: Dieser Anteil wird mit 1 gerechnet und
  gemeldet (statt still ohne Index bzw. mit 0 € zu rechnen). Ist nur einer der beiden Indizes eingetragen,
  bleibt der Index unberücksichtigt.
- Gerechnet wird **netto**; die Umsatzsteuer (Standard 19 %) wird am Ende ausgewiesen. Enthalten die
  Kennwerte die Umsatzsteuer, wird das angekreuzt – sie werden dann vor der Rechnung auf netto umgerechnet.
  Ein Satz außerhalb von 0 bis 100 % ist ungültig; dann wird mit 19 % gerechnet und darauf hingewiesen.

## Kennwertkatalog

Der Katalog ist eine eigene, austauschbare Datei (JSON oder CSV) mit Name, Quelle, Preisstand und
Baupreisindex. Der zuletzt geladene Katalog bleibt in der Anwendung hinterlegt; übernommene Kennwerte stehen
mit Quelle im Projekt.

- **Katalog laden …** – JSON oder CSV
- **Aus Projektpositionen erstellen** – die Kennwerte eines fertigen Projekts als Katalog für das nächste
- **Als CSV / JSON speichern …**
- **Suchen** nach Kostengruppe oder Bezeichnung; Einträge ankreuzen und **Als Positionen übernehmen**
  (Doppelklick übernimmt einen Eintrag sofort, Enter im Suchfeld bei genau einem Treffer)
- Ersetzen („Aus Projektpositionen erstellen“) und Entfernen eines hinterlegten Katalogs fragen nach.
  Fasst der Speicher der App den Katalog nicht, meldet der Dialog das; er gilt dann nur bis zum Schließen.

CSV aus Excel (Semikolon, Dezimalkomma):

```
# Name: Bürokennwerte
# Quelle: eigene Projekte
# Stand: 1. Quartal 2026
# Index: 131,4
KG;Bezeichnung;Bezug;Grundlage;von;Mittel;bis;Bemerkung
300;Bauwerk – Baukonstruktionen;BGF;;1.500;1.800;2.100;
330;Außenwände;AWF;;;420;;WDVS, verputzt
461;Aufzug;Stk;;;45.000;;
540;Carport;psch;;;30.000;;
700;Baunebenkosten;%;300+400;18;20;22;
```

Spalte **Bezug**: Kürzel einer Menge (`BGF`, `BRI`, `AWF`, `DAF` …), `psch` für pauschal, `%` für Prozent
(mit den Kostengruppen in **Grundlage**); alles andere gilt als Einheit einer eigenen Menge (`Stk`, `m`).
Ohne Angabe gilt die übliche Bezugsgröße der Kostengruppe. Die Zahlen im Beispiel sind Platzhalter, keine
Kennwerte. Zahlen werden je Zelle erkannt: Stehen Punkt und Komma darin, ist das letzte das Dezimalzeichen (`1.800,50`,
`1,800.50`); steht nur eines darin, ist es das Dezimalzeichen, außer es trennt genau Dreiergruppen (`1.800`; in einer
CSV mit Komma als Trennzeichen auch `1,800`) – dann ist es der Tausendertrenner. Eine
JSON-Datei, die sich nicht lesen lässt, meldet „Die Datei ist kein gültiger Kennwertkatalog (JSON)“.

## Festgehaltene Stände

DIN 276 nennt „Kostenstand“ den Zeitpunkt, auf den sich die Kosten beziehen – in NUMIO das Feld
„Kostenstand (Preisstand)“. Momentaufnahmen der Ermittlung heißen deshalb **festgehaltene Stände**.
„Stand festhalten“ (oder Enter im Bemerkungsfeld) speichert die aktuellen Kosten je Kostengruppe und die Mengen mit Datum, Stufe
(Kostenrahmen, -schätzung, -berechnung, -voranschlag, -anschlag, -feststellung) und Bemerkung. Die
Übersicht zeigt **Vorher/Nachher** gegenüber dem gewählten Stand – je Kostengruppe und mit den geänderten
Mengen. So wird sichtbar, was eine Planänderung kostet.

## Stufen

| Stufe | Leistungsphase | Gliederung nach DIN 276:2018-12 |
|---|---|---|
| Kostenrahmen | LPh 1, Bedarfsplanung | 1. Ebene, Bauwerkskosten gesondert |
| Kostenschätzung | LPh 2 | mindestens 2. Ebene (HOAI § 2 Abs. 10 mit DIN 276:2008-12: 1. Ebene) |
| Kostenberechnung | LPh 3 | mindestens 3. Ebene (HOAI § 2 Abs. 11 mit DIN 276:2008-12: 2. Ebene) |
| Kostenvoranschlag | LPh 6 | 3. Ebene bzw. Vergabeeinheiten |
| Kostenanschlag | LPh 7 | 3. Ebene bzw. Vergabeeinheiten |
| Kostenfeststellung | LPh 8 | 3. Ebene bzw. Vergabeeinheiten |

Maßgeblich ist die im Vertrag vereinbarte Fassung. Kostenvoranschlag, -anschlag und -feststellung beruhen nach
DIN 276 auf bepreisten Leistungsverzeichnissen, Aufträgen bzw. abgerechneten Kosten. NUMIO rechnet auch dort mit
Kennwerten und Pauschalen; Druck und Excel vermerken deshalb, dass die Grundlage von der Verfasserin bzw. dem
Verfasser zu belegen ist. Die Kostenfeststellung erscheint im Druck ohne Bandbreite (in Excel von = bis = Wert).

## Ausgabe

- **Kosten drucken …** (Strg+P): Kostenermittlung auf A4 hoch – Grundlagen, Kostenübersicht nach Kostengruppen
  mit Bandbreite, Kennwerte des Bauwerks (€/m² BGF, €/m³ BRI …), Positionen mit Menge und Kennwert, Mengen
  mit Ermittlung, festgehaltene Stände, Hinweise und Unterschriftszeile. Über den Druckdialog auch als PDF.
- **Dateinamen:** Druck/PDF und Excel schlagen `<Projektdatei> Kosten <Stufe>` vor, z. B.
  „Musterhaus Kosten Kostenberechnung“, im Ordner der Projektdatei.
- **Excel …**: Standardlayout (Blatt „Kosten“ mit Summenformeln) oder eigene Vorlage mit Platzhaltern wie
  `{{gesamt.brutto}}`, `{{kg300}}` und den Sammlungen `kg`, `kg2`, `position`, `menge`, `stand`, `hinweis` –
  siehe [Excel-Vorlagen](excel-vorlagen.md#numio-kostenermittlung). Die Vorlage wird im Projekt mitgespeichert,
  getrennt von denen der anderen Apps.

## Grenzen

- Kostenermittlung bis zur Kostenberechnung (Elemente auf der 2. und 3. Ebene). Vergabeeinheiten,
  Nachträge und Ist-Kosten werden nicht erfasst.
- Varianten werden über ausgeschaltete Positionen und festgehaltene Stände verglichen; ein eigener
  Variantenvergleich fehlt.
- Honorarfragen (HOAI, anrechenbare Kosten) sind nicht abgebildet.
