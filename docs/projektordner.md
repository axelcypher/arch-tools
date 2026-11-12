# Projektordner

Das Tool **Projektordner** (`apps/ordner`, eigene App mit eigenem Installer) legt Projekte nach einheitlichem
Schema an und ergänzt bestehende – mit einem **Assistenten**, der Stammdaten, Umfang und Vorlagen abfragt –, und
prüft vorhandene Projektordner gegen dieses Schema.

Grundsätze:

- **Jedes Projekt hat eine Projektdatei (.oap).** Sie gehört keinem einzelnen Werkzeug: Stammdaten und die Angaben
  aller Apps stehen darin (siehe [Projektdatei](#projektdatei-oap)). Fehlt sie, legt der Assistent sie an.
- **Automatisch wird nichts gelöscht, verschoben oder überschrieben.** Ordner und Vorlagen werden nur neu
  angelegt; vorhandene Dateien bleiben, wie sie sind. Einzige Ausnahme ist die Projektdatei selbst: Sie wird
  gezielt ergänzt (nur die geänderten Angaben), vorher gesichert. Vor jedem Lauf zeigt der Trockenlauf, was
  passiert.
- **Einstellungen teilen sich alle Apps** im gemeinsamen Konfigurationsordner (siehe [Einstellungen](#einstellungen)).

## Projekt (Assistent)

Fünf Schritte; die Schrittleiste oben springt zu jedem Schritt, sobald die davor taugen.

1. **Projekt:** die **Projektübersicht** – dieselbe Startseite wie in den anderen Apps: vorne „Zuletzt geöffnet“
   (je Benutzer, über alle Apps), darunter die Projektordner je Stammordner als Karten mit Nummer, Bezeichnung und
   Leistungsphasen aus der Projektdatei (im Hintergrund nachgeladen) und der Marke „ohne Projektdatei“, mit Suche.
   Ein Klick auf ein Projekt ergänzt es; **„Neues Projekt“** im Kopf beginnt ein neues, „Anderen Ordner …“ wählt
   einen Projektordner an beliebiger Stelle. Der Ordner muss nicht nach dem Schema heißen; ergänzt wird in genau
   diesem Ordner. Aus „Ordner prüfen“ führt „Projekt ergänzen …“ direkt hierher. Ohne eingestellten Stammordner
   (und im Browser) stehen hier zwei Karten: neues Projekt bzw. Projektordner wählen.
   Gibt es genau einen Stammordner, ist er aufgeklappt. Die Projekte lassen sich sortieren (Ordnername, Nummer –
   neueste zuerst –, zuletzt geändert, Titel) und nach Status filtern (Standard: ohne abgeschlossene; die Wahl gilt
   je Benutzer). Rechtsklick auf ein Projekt: „Ergänzen …“, „Projekt prüfen“, „Im Explorer öffnen“, **„Projekt
   abschließen“** bzw. „Wieder aktiv“, „Als Akquise kennzeichnen“ und „Anheften“ – angeheftete Projekte stehen ganz
   vorne, in allen Apps. Der Status steht in der Projektdatei (`meta.status`: Akquise, aktiv, abgeschlossen); gesetzt
   wird nur diese Angabe, alles andere in der Datei bleibt. Nummer und Kurzname leitet jede App gleich aus dem
   Ordnernamen ab: Das Schema der Struktur steht dafür in `allgemein.json` (`ordnerSchema`).
2. **Stammdaten:** Projektnummer, Kurzname, Bezeichnung, Adresse des Bauvorhabens, Grundstück, Aktenzeichen,
   Bauherr mit Kontakten.
   - Neues Projekt: Das Tool trägt die nächste freie Nummer vor (änderbar) – die höchste laufende Nummer unter den
     Ordnern **aller** Stammordner (auch Archiv oder Akquise; im laufenden Jahr, wenn das Schema ein Jahr enthält)
     plus eins. Passt eine Nummer nicht zum Schema („26-14“ bei `{jahr}-{nr:3}`), steht am Feld ein Hinweis
     („erwartet z. B. 2026-015“); er hält nicht auf. Projektnummer und Kurzname sind Pflicht (Stern); der
     Ordnername, der sich daraus ergibt, steht direkt darunter, Zeichen wie `/ : ?` meldet das Feld schon beim
     Tippen. Meldungen erscheinen am Feld erst nach dem Verlassen bzw. nach „Weiter“; „Weiter“ nennt dann sichtbar,
     was noch fehlt. Gibt es den Ordner schon, bietet der Assistent an, dieses Projekt zu ergänzen. Das angefangene
     Formular bleibt bis zum nächsten Start erhalten.
   - Bestehendes Projekt: Die Stammdaten kommen aus der Projektdatei. **Fehlt sie, ist das kein Fehler:** Der
     Assistent erfasst die Stammdaten (Nummer und Kurzname aus dem Ordnernamen vorgeschlagen, bei Ordnern aus
     Version 0.1 aus der alten `projekt.json`) und legt die Projektdatei damit an. Der Ordner wird beim Ergänzen
     nicht umbenannt.
3. **Umfang:** beauftragte Leistungsphasen (mit Namen, Schnellwahl „1–4 bis Bauantrag“, „5–8“, „1–9 alle“,
   „keine“), Bearbeitung (Kürzel; Vorschläge aus den Mitarbeitern unter „Einstellungen“), Beteiligte (Rolle mit
   Vorschlägen typischer Beteiligter – Tragwerksplanung, Prüfingenieur/-in, Brandschutz, Vermessung ÖbVI, TGA,
   Energieberatung/GEG, Bauaufsicht … – oder frei; Name mit Vorschlägen aus den Projektdateien der Stammordner, Rolle
   und Kontakt werden dann ergänzt). An Leistungsphasen gebundene Ordner und Vorlagen entstehen nur, wenn eine davon
   beauftragt ist (ohne Angabe alle).
4. **Vorlagen:** Vorlagenordner und Vorlagen-Presets (siehe [Vorlagen](#vorlagen)). Vorausgewählt sind bei neuen
   Projekten die Presets mit „Standard“, bei bestehenden die in der Projektdatei vermerkten.
5. **Anlegen bzw. Ergänzen:** der Trockenlauf als Baum – jeder Ordner und jede Datei mit Herkunft (Struktur,
   Vorlage mit Preset, Projektdatei) und dem Vermerk „neu“, „vorhanden“ oder „wird ergänzt“ (Projektdatei, mit
   den geänderten Angaben als Hinweis). Beim Ergänzen zeigt er nur, was sich ändert (umschaltbar). Einzelne
   Einträge lassen sich abwählen („Alle neuen Einträge abwählen“ und danach einzelne wieder wählen); mit einem
   Ordner entfällt alles darin. Ergänzen ohne Leistungsphasen: Der Trockenlauf weist darauf hin, dass alle Ordner
   vorgeschlagen werden, und springt mit „Leistungsphasen wählen“ zum Umfang. Danach meldet das Tool, was angelegt
   bzw. ergänzt wurde, was schon da war und was fehlgeschlagen ist – ein Fehler hält die übrigen Schritte nicht auf.
   Im Browser entsteht der Projektordner als ZIP-Datei zum Herunterladen (statt im Stammordner).
   Nach dem erfolgreichen Anlegen zeigt der Assistent eine **Abschlussseite** mit dem Ordnernamen, „Ordner öffnen“
   und „Nächstes Projekt“; das Formular ist dann schon für das nächste Projekt geleert – „Rückgängig“ (zehn Sekunden)
   holt den Entwurf zurück. Schlägt ein Schritt fehl, bleibt der Entwurf stehen.

**Tastatur:** Strg+Enter geht zum nächsten Schritt; der aktive Schritt ist für Bildschirmleser gekennzeichnet, die
Felder der Beteiligten sind je Zeile beschriftet („Rolle 2“, „Beteiligten 2 entfernen“).

Angelegt bzw. ergänzt werden

1. die **Ordner** der Struktur,
2. die **Vorlagen** der gewählten Presets, umbenannt nach dem Schema des Büros und mit ersetzten Platzhaltern,
3. die **Projektdatei** am eingestellten Ort (Vorgabe `03 Berechnungen/Flächen/{nummer} {kurzname}.oap`; Platzhalter
   `{Kürzel}` bzw. `{nummer}`, `{Kurzname}`, `{Vorhaben}`, `{Datum}` – hier als JJMMTT – und `{Jahr}`): neu als
   leere Flächenberechnung mit Stammdaten, Anlagedatum, Struktur und Presets – Flächenrechner, GRZ-Nachweis,
   Kostenermittlung und Formulare öffnen sie –, beim Ergänzen nur mit den geänderten Stammdaten (gegenüber dem
   Stand beim Einlesen; was eine andere App inzwischen eingetragen hat, bleibt) und den Presets. Hat jemand die
   Datei zwischen Einlesen und Ergänzen geändert, wird nicht geschrieben – dann neu einlesen.

`{jahr}` in Namen ist beim Ergänzen das Jahr, in dem das Projekt angelegt wurde. Enthält der Name einer Vorlage
`{datum}`, gilt sie als vorhanden, wenn es dieselbe Datei mit einem anderen Datum schon gibt („vorhanden*“).

## Einstellungen

### Gemeinsame Einstellungen

Alle Apps lesen ihre übergreifenden Einstellungen aus einem **Konfigurationsordner**. Er wird einmal gewählt –
auf einem Server-Laufwerk gilt er für das ganze Büro; ohne Wahl ist es ein Ordner auf diesem Rechner
(`%APPDATA%\arch-tools`). Wird ein anderer Ordner gewählt, wandern Einstellungen, die es dort noch nicht gibt,
mit; was dort schon liegt, gilt und bleibt unverändert.

| Datei | Inhalt |
|---|---|
| `allgemein.json` | Stammordner der Projekte (mehrere möglich; im ersten entstehen neue Projekte), Ort der Projektdatei in neuen Projekten, Fotoordner im Projekt (für die Entzerrung), Name des Büros für den Kopf der Ausdrucke und Excel-Dateien, Kürzel der Mitarbeiter (Vorschläge für „Bearbeitung“) |
| `projektordner.json` | Struktur samt Vorlagen-Presets und Vorlagenordner dieses Tools |

Welcher Konfigurationsordner gilt, steht je Benutzer in `%APPDATA%\arch-tools\konfig.json` – für alle Apps
derselbe Ort. Einstellungen früherer Fassungen (lokal gespeichert) werden beim ersten Start übernommen. Im Browser
liegen die Einstellungen im Speicher des Browsers.

`projektordner.json` wird kurz nach der letzten Änderung geschrieben (nicht bei jedem Tastendruck) und nur, wenn
die Datei seit dem Lesen unverändert ist. Hat ein anderer Rechner sie inzwischen geändert, überschreibt das Tool
sie nicht, sondern meldet „Die Struktur wurde inzwischen von einem anderen Rechner geändert – neu laden?“ mit
„Neu laden“ (die eigene Fassung bleibt über „Rückgängig“ erreichbar) und „Meine Fassung trotzdem speichern“. Beim
Wechsel in „Einstellungen“ und „Vorlagen“ liest das Tool die Datei frisch.

### Namensschema

Unter „Gemeinsame Einstellungen“ steht das **Namensschema** des Büros – gemeinsam für alle Apps (`allgemein.json`,
Eintrag `namensschema`; `packages/core/src/namensschema.ts`):

- **Aufbau des Dateinamens:** welche Stelle Projektcode, Phase bzw. Antragsart, Datum (JJMMTT) und Plannummer haben –
  Vorgabe „HVO GP 261111 GP-04 Grundriss OG.pdf“ (im Antragsordner steht die Antragsart statt der Phase, die
  Plannummer bleibt).
- **Planphasen** mit Kürzel, Bedeutung und Leistungsphase: BP Grundlagenermittlung, EP Entwurfsplanung,
  GP Genehmigungsplanung, AP Ausführungsplanung, AB Aufteilungspläne für die Abgeschlossenheitsbescheinigung
  (§ 7 Abs. 4 WEG, Sonderfall).
- **Antrags- und Verfahrensarten** mit gleichwertigen Schreibweisen: BAUA Bauantrag, BAUVA Antrag auf Vorbescheid
  bzw. Bauvoranfrage (auch BVA), BAUF Genehmigungsfreistellung, DENK Denkmalrechtliche Erlaubnis, ABGE
  Abgeschlossenheitsbescheinigung, ENTW Entwässerungsantrag.
- **Bearbeiten:** Kürzel, Bedeutung, Schreibweisen und Leistungsphasen werden beim Verlassen des Felds übernommen
  (Schreibweisen bereinigt: groß, ohne Doppelte). Ein Kürzel muss aus Großbuchstaben und Ziffern bestehen
  (höchstens 8 Zeichen) und darf nicht doppelt vorkommen – sonst zeigt das Feld wieder das alte und eine Meldung
  sagt warum. Leistungsphasen gehen von 0 bis 9 (größere Werte werden begrenzt; leer = keine). Ein neues Kürzel
  („+ Kürzel“) wird erst gespeichert, wenn man die Zeile mit einem gültigen Kürzel verlässt – vorher gilt es in
  keiner App. Die Stellen tauschen beim Umstellen die Plätze; das Beispiel zeigt die Zerlegung mit den Kürzeln des
  Schemas. „Vorgabe wiederherstellen“ (mit Rückfrage) setzt die eingebaute Vorgabe, auch in allen Feldern.
- **Index ab Leistungsphase** (Vorgabe 5, Bürovorgabe): erst ab dann tragen Pläne einen Index (AP-03a).

Jede **neue Projektdatei** bekommt eine Kopie (Abschnitt `namensschema`); beim **Ergänzen** eines Projekts wird
eine fehlende oder abweichende Kopie auf den Stand des Büros gebracht (in der Vorschau als Änderung „Namensschema“
bzw. „Namensschema (Stand des Büros)“). Alle Apps lesen zuerst die der Projektdatei, sonst die des Büros, sonst die
Vorgabe. Formulare erkennt daran Antragsordner und die Pläne eines
Plansatzes.

### Struktur

Ordnerbaum und Namensschemata gehören dem Büro, nicht dem Tool. Die Struktur lässt sich zusätzlich als JSON-Datei
speichern, weitergeben und laden – samt den Vorlagen-Presets und dem Dateinamenschema für Vorlagen; die eingebaute
Vorgabe ist neutral (nach Dokumentart: Projekt, Grundlagen, Pläne, Berechnungen, Schriftverkehr, Protokolle,
Genehmigung, Ausschreibung, Bauleitung, Fotos). „Standard“ setzt Ordner und Schemata zurück; die Presets bleiben.

Die Bürostruktur gilt für alle, die den Konfigurationsordner nutzen. „Standard“ und „Struktur laden …“ fragen
deshalb vorher nach und zeigen, was sich ändert („6 Ordner entfallen, 2 neu, 3 Schemata ändern sich“), mit
„Ersetzen / Abbrechen“. Vor dem Ersetzen wird der bisherige Stand gesichert – in `projektordner-sicherungen.json`
im Konfigurationsordner, je Sicherung mit Namen `projektordner.json.bak-JJJJ-MM-TT-hhmm`; die letzten zehn bleiben.
„Sicherungen …“ listet sie zum Wiederherstellen. Nach dem Ersetzen (und nach „Ordnerliste übernehmen“) nimmt
„Rückgängig“ die Änderung zurück, solange nichts anderes geändert wurde.

| Einstellung | Vorgabe | Platzhalter |
|---|---|---|
| Projektnummer | `{jahr}-{nr:3}` → 2026-014 | `{jahr}`, `{jj}`, `{nr}` bzw. `{nr:3}` (führende Nullen) |
| Name des Projektordners | `{nummer} {kurzname}` | `{nummer}`, `{kurzname}`, `{jahr}` |
| Dateinamenschema für Pläne | `{nummer}_{plannummer}_{index}_{titel}` | dazu `{datum}` |

Die **Ordnerliste** wird als **Baum** bearbeitet: je Ordner der Name, Häkchen für die Leistungsphasen 1–9 und
„Schema“ (Dateischema prüfen); ↑ ↓ verschieben unter den Geschwisterordnern, → macht einen Ordner zum Unterordner des
Ordners darüber, ← rückt ihn eine Ebene höher, „+“ legt einen Unterordner an, „×“ löscht (mit Unterordnern erst nach
Rückfrage), „+ Ordner“ legt einen im Stamm an. Übergeordnete Ordner, die nur als Teil eines Pfads vorkommen, stehen
kursiv; ein Häkchen gibt ihnen eine eigene Regel.

Für Geübte gibt es die Ordnerliste auch als **Text (Experte)** – dieselbe Liste, eine Zeile je Ordner, Unterordner
mit `/`. Zusätze nach `|`:

```
02 Pläne/Entwurf | Dateischema
02 Pläne/Ausführung | LPh 5 | Dateischema
07 Ausschreibung | LPh 6-7
```

- `LPh 5`, `LPh 6-7`, `LPh 4, 8` – der Ordner entsteht nur, wenn eine dieser Leistungsphasen beauftragt ist.
- `Dateischema` – Dateien in diesem Ordner werden im Prüfmodus gegen das Dateinamenschema geprüft.

Unzulässige Zeichen in Namen (`\ / : * ? " < > |`) werden entfernt. Was beim Lesen der Liste entfällt oder
bereinigt wird – doppelte Zeilen (nur die erste gilt), Leistungsphasen außerhalb 1 bis 9, entfernte Zeichen,
unbekannte Zusätze nach `|` –, meldet das Tool zeilenweise unter dem Feld („Zeile 4 doppelt zu Zeile 1 – nur die
erste gilt“). Eine Liste mit Meldungen wird nicht schon beim Verlassen des Felds übernommen, sondern erst mit
„Ordnerliste übernehmen“. Der Ort der Projektdatei stand bis Version 0.1
in der Struktur („Leere Flächenrechner-Datei“); er ist jetzt eine gemeinsame Einstellung und wird übernommen.

## Vorlagen

Vorlagen liegen in einem eigenen **Vorlagenordner**, nicht im Tool – gegliedert, wie es dem Büro passt (etwa nach
Dateiart: `Word/`, `Excel/`, `Bauantrag/`). Er wird unter **Vorlagen** (oder im Assistenten) gewählt, steht im
Konfigurationsordner und wird bei jedem Wechsel der Ansicht frisch eingelesen; „Neu einlesen“ holt Änderungen sofort.

### Presets

Ein **Preset** ist eine Zusammenstellung von Vorlagen, z. B. „Jedes Projekt“, „Bauantrag“ oder „Ausschreibung“.
Jede **Zuordnung** darin sagt:

| Angabe | Bedeutung |
|---|---|
| Vorlage | Pfad im Vorlagenordner: eine **Datei** oder ein **Ordner** (alle Dateien darin, mit ihren Unterordnern); leer = der ganze Vorlagenordner |
| Zielordner im Projekt | Ordner im Projekt, Vorschläge aus der Struktur; Platzhalter erlaubt; leer = Stamm des Projektordners |
| Dateiname im Projekt | Name nach dem Schema des Büros, z. B. `{nummer} Brief Bauherr`; leer = Dateinamenschema für Vorlagen |
| LPh | nur, wenn eine dieser Leistungsphasen beauftragt ist, z. B. `4` oder `6-7`; leer = immer |

Zugeordnet wird unter **Vorlagen**: Preset wählen, im Baum des Vorlagenordners auf „+“ klicken, Zielordner und
gegebenenfalls Namen eintragen. Die Vorschau zeigt mit den Stammdaten des angefangenen neuen Projekts (sonst Beispielwerten),
wo jede Datei landet und wie sie heißt (mehr als vier Dateien je Zuordnung: aufklappbar); Vorlagen, die es im
Vorlagenordner nicht gibt, sind markiert. Dazu prüft sie das Preset nach den Regeln von „Ordner prüfen“ und fasst
zusammen, was danach als Abweichung gälte: „3 Ordner liegen außerhalb der Struktur“, „2 Dateien liegen lose im
Projektstamm“ (aufklappbar mit Liste). Die Anleitung `LIESMICH.txt` im Stamm des Vorlagenordners zählt nicht mit.

Presets mit **„Standard“** sind bei neuen Projekten vorausgewählt; welche ein Projekt bekommen hat, steht in seiner
Projektdatei. Die eingebaute Struktur bringt das Preset
**„Alle Vorlagen“** mit: der ganze Vorlagenordner, jede Datei an denselben Ort im Projekt – für einen Vorlagenordner,
der wie ein Projektordner aufgebaut ist. Ist der Vorlagenordner anders gegliedert (mehr als die Hälfte der Vorlagen
landete außerhalb der Struktur, etwa bei `Word/`, `Excel/`), wird ein solches Preset bei neuen Projekten nicht
vorausgewählt; „Vorlagen“ und der Assistent sagen das, und es lässt sich weiterhin ausdrücklich wählen. Projekte merken sich ihre Presets beim Namen (in der Projektdatei); ein
umbenanntes Preset meldet der Trockenlauf beim Ergänzen als unbekannt.

### Dateinamen

So heißt eine Vorlage im Projekt:

1. Gibt die Zuordnung einen **Namen** vor, gilt er.
2. Enthält der Name der Vorlage selbst Platzhalter (`{nummer} Projektblatt.md`), werden nur diese ersetzt.
3. Sonst gilt das **Dateinamenschema für Vorlagen** (Vorgabe `{nummer} {name}`):
   `Kostenschätzung.xlsx` → `2026-014 Kostenschätzung.xlsx`.

Platzhalter in Namen – derselbe Satz für Ordnernamen, Dateinamen und den Pfad der Projektdatei, Groß-/Kleinschreibung
egal: `{nummer}` (gleich: `{kürzel}`, `{projektcode}`), `{kurzname}`, `{vorhaben}`, `{jahr}`, `{jj}`, `{bearbeiter}`,
`{datum}` (Tag des Anlegens, JJJJ-MM-TT) bzw. `{datum:JJMMTT}` mit eigenem Format (JJJJ, JJ, MM, TT und Trenner) und
`{name}` (Name der Vorlage ohne Endung). Jedes Schemafeld hat ein Menü „Platzhalter ▾“, das den Platzhalter an der
Schreibmarke einsetzt; die Vorschau folgt schon beim Tippen, unbekannte Platzhalter sind sofort markiert. Einzige
Ausnahme: Im Pfad der Projektdatei bleibt `{datum}` ohne Format wie bisher JJMMTT, damit vorhandene Einstellungen
dieselben Namen ergeben – mit Format (`{datum:JJJJ-MM-TT}`) gilt dasselbe wie überall. Die Endung kommt immer von der Vorlage. **Office-Vorlagen
werden zu Dokumenten:** `.dotx` → `.docx`, `.xltx` → `.xlsx`, `.potx` → `.pptx` (auch die Varianten mit Makros) –
mit umgestelltem Inhaltstyp, sonst öffnet Office die Datei nicht.

Konfigurationen ohne Presets (bis Version 0.1.x) bekommen beim Laden „Alle Vorlagen“ und das Schema `{name}` –
die Dateinamen bleiben, wie sie waren.

### Inhalte

Eine `LIESMICH.txt` direkt im Quellordner, Systemdateien und Sperrdateien von Office werden nicht kopiert;
Vorlagen in Ordnern nicht beauftragter Leistungsphasen bleiben weg.

„Muster-Vorlagen in einen Ordner schreiben“ (unter **Vorlagen**) legt einen Ausgangspunkt an – Projektblatt,
Planliste, Besprechungsprotokoll, aufgebaut wie ein Projektordner – und stellt den Ordner als Vorlagenordner ein.
Die Muster sind zum Ersetzen durch die eigenen Dateien gedacht.

Platzhalter im **Inhalt** stehen in doppelten Klammern, mit denselben Namen wie in den Excel-Vorlagen der anderen
Werkzeuge: `{{projekt.nummer}}`, `{{projekt.kurzname}}`, `{{projekt.name}}`, `{{projekt.adresse}}`,
`{{grundstueck.flurtext}}`, `{{bauherr.name}}`, `{{bauherr.adresse}}`, `{{bauherr.email}}`,
`{{projekt.bearbeiter}}`, `{{projekt.leistungsphasen}}`, `{{beteiligte}}`, `{{datum}}`, `{{datum.iso}}` …
Die vollständige Liste steht im Tool unter **Vorlagen**.

| Dateiart | Was passiert |
|---|---|
| Text (`.md`, `.txt`, `.csv`, `.json`, `.html`, `.xml` …) | Platzhalter im Text ersetzt |
| Excel (`.xlsx`, aus `.xltx`) | Vorlagen-Engine der anderen Werkzeuge: Einzelwerte, dazu eine Zeile je Beteiligtem (`{{beteiligter.rolle}}`, `{{beteiligter.name}}`, `{{beteiligter.kontakt}}`) bzw. je Leistungsphase (`{{lph.nr}}`, `{{lph.name}}`) – siehe [Excel-Vorlagen](excel-vorlagen.md) |
| Word (`.docx`, `.docm`, aus `.dotx`/`.dotm`) | Platzhalter im Text, in Kopf- und Fußzeilen. Ein Platzhalter muss in einem Zug getippt sein – wechselt mittendrin die Formatierung, zerlegt Word ihn, und er wird nicht erkannt |
| alles andere (PDF, DWG, Bilder, `.xlsm` …) | unverändert kopiert |

Unbekannte Platzhalter bleiben stehen, damit Tippfehler auffallen.

## Ordner prüfen

Ein vorhandener Projektordner wird eingelesen und mit der Struktur verglichen – aus der Liste der Projektordner aller
Stammordner (mit Suche; ein Klick prüft) oder über „Ordner wählen …“. Gemeldet werden

- die **Projektdatei**: vorhanden (mit Nummer, Kurzname, Anlagedatum, Struktur), fehlt (dann gilt die vollständige
  Struktur; stehen Stammdaten noch in einer alten `projekt.json`, gelten deren Leistungsphasen) oder nicht lesbar,
- der **Ordnername**, wenn er nicht dem Schema und den Stammdaten entspricht,
- **fehlende Ordner** der Struktur,
- **zusätzliche Ordner** auf Ebenen, die die Struktur vorgibt (Stamm und Ordner mit vorgegebenen Unterordnern),
- **lose Dateien** im Projektordner (die alte `projekt.json` darf liegen bleiben),
- Dateien in den Planordnern, die nicht dem **Dateinamenschema** folgen (mit der Projektnummer aus den
  Stammdaten),
- **überlange Pfade** (mehr als 200 Zeichen ab dem Projektordner – mit Laufwerk und Stammordner droht die
  Windows-Grenze von 260 Zeichen).

Die Befunde stehen nach Schwere gruppiert: Fehler, Abweichungen, Hinweise, in Ordnung. „Bericht als CSV …“ speichert
sie mit allen betroffenen Pfaden (für Excel: Semikolon, UTF-8 mit BOM).

**Alle Projekte prüfen** prüft jeden Projektordner der Stammordner – nur lesend – und zeigt eine Übersicht: Projekt,
Zahl der Abweichungen (davon Fehler), Projektdatei ja/nein, längster Pfad; Projekte mit Fehlern und den meisten
Abweichungen zuerst. Ein Klick auf ein Projekt zeigt dessen Einzelbericht; „Als CSV speichern …“ speichert die
Übersicht.

Das Tool meldet nur. Von hier aus lassen sich **fehlende Ordner anlegen** und das **Projekt ergänzen** (im
Assistenten: fehlende Ordner, Vorlagen und die Projektdatei).

## Katasterpläne

Katasterauszüge als PDF und DXF-Pläne kommen aus einem **QGIS-Projekt als Vorlage**, in dem das Büro seine Dienste
(ALKIS-WMS/WFS), Kartenthemen und Layouts mit Planköpfen pflegt. Exportiert wird je Projekt auf der Startseite
(Rechtsklick auf das Projekt → „Katasterpläne …“); QGIS läuft dabei unsichtbar im Hintergrund (`qgis_process`, ab
QGIS 3.28; geprüft mit 3.34 LTR). Früher war das Teil von Formulare; dessen Einstellungen werden beim ersten Öffnen
übernommen.

- **Reiter „Katasterpläne“:** die Vorlage (`.qgz`/`.qgs`, gilt für alle im Büro: gemeinsamer
  Konfigurationsordner, Bereich `kataster`), der Pfad zu `qgis_process` (je Rechner; „Suchen“ findet die
  üblichen Installationen, unter Windows `…\QGIS 3.x\bin\qgis_process-qgis-ltr.bat`), die Ablage (fester Ordner im
  Projektordner, Vorgabe `Kataster`, oder der Ordner des aktiven Antrags `TÖB/<Antrag>` – der Antrag aus der
  Projektdatei, `meta.antrag`, gepflegt in Formulare) mit Dateinamen
  (`{Code} {Art} {Datum} {Name}` – passt zum Namensformat des Antragsordners) und die Pläne. Vorgegeben sind
  *Katasterauszug A4* (Layout „Katasterauszug A4“, 1:1000), *Katasterauszug A3* (Layout „Katasterauszug A3“, 1:500),
  *Schwarzplan* (DXF, Kartenthema „Schwarzplan“, 300 × 300 m) und *Katasterplan* (DXF, Kartenthema „Katasterplan“,
  150 × 150 m, je Objekt mit Beschriftungen). Layouts, Kartenobjekte und Kartenthemen stehen zur Auswahl, sobald die
  Vorlage eingelesen ist; was nicht zur Vorlage passt, wird am Plan gemeldet.
- **PDF:** das Kartenobjekt des Layouts (Kennung oder das erste) wird auf die Koordinate der Projektadresse
  zentriert – im eingestellten Maßstab, oder mit Breite × Höhe auf genau diesen Ausschnitt (Maßstab ergibt sich).
  Mit Kartenthema folgt die Karte diesem Thema.
- **DXF:** die sichtbaren Vektorlayer des Kartenthemas im Ausschnitt um die Projektadresse (Rasterlayer wie WMS
  entfallen), Symbolik je Symbolebene, je Objekt oder ohne, Symbolmaßstab = Maßstab des Plans, Beschriftungen wahlweise.
- **Planköpfe:** Projektvariablen `@project_title` (Vorhaben, sonst Name der Projektdatei), `@project_identifier`
  (Projektcode), `@project_street`, `@project_city`, `@project_zip_code` aus der Projektdatei; je Plan außerdem
  `@plan_name`, `@plan_massstab` („1:1000“), `@plan_datum` und `@plan_beschriftung` (Text aus den Einstellungen).
  `project_title` und `project_identifier` sind in QGIS eingebaute Variablen – gesetzt werden dafür Projekttitel und
  Kennung in den Projekt-Metadaten.
- **Vorlage in der Projektdatei:** beim ersten Export wird die globale Vorlage in die `.oap` übernommen
  (`dateien`, Art `qgis`) und danach von dort verwendet – spätere Änderungen an der Bürovorlage ändern alte Projekte
  nicht. „Vorlage aktualisieren“ im Export-Dialog ersetzt sie durch die aktuelle Fassung.
- Voraussetzung sind **Koordinaten** in der Projektdatei (beim Speichern der Projektadresse abgefragt, EPSG:25832).
  Im Projektordner wird nichts überschrieben: Gibt es einen Plan schon, wird er übersprungen oder mit neuem Namen
  („… (2).pdf“) abgelegt. `{Art}` im Dateinamen ist die Antragsart des aktiven Antrags (ohne Antrag leer).

Umsetzung (`apps/ordner`): `src/kataster/kataster.ts` (Einstellungen, Auslesen der Vorlage, Auftrag), `katasterStore.ts`
(Ablauf), `qgis.ts` (Befehle der Hülle bzw. Ersatz für die Tests), `components/KatasterDialog.tsx` und
`KatasterEinstellungen.tsx`,
`katasterexport.py` (Processing-Skript, wird mitgeliefert und mit `qgis_process run katasterexport.py --
AUFTRAG=<json>` ausgeführt). Die Hülle (`packages/core/tauri/qgis.rs`) startet nur ein Programm namens
`qgis_process…`, legt Skript, Auftrag und Vorlage in einen eigenen temporären Ordner, lässt QGIS dort hineinschreiben
und legt die Pläne danach am Ziel ab – nur neu, nie überschreibend.

## Desktop und Browser

Ordner anlegen und einlesen kann nur die Desktop-App. Die Web-Version liefert den Projektordner als
**ZIP-Datei** zum Entpacken (beim Ergänzen nur das Neue; die vorhandene Projektdatei lässt sich dort nicht
ergänzen) und liest Vorlagen- bzw. Projektordner über den Dateidialog (nur lesend; leere Ordner erkennt der
Browser dabei nicht).

Die Desktop-App greift nur auf Ordner zu, die im Dialog gewählt bzw. eingestellt wurden. Sie nutzt die gemeinsamen
Befehle aller Apps ([packages/core/tauri/commands.rs](../packages/core/tauri/commands.rs)): Ordner und Dateien nur
neu anlegen, ersetzen allein die Projektdatei – atomar, nur wenn sie seit dem Einlesen niemand geändert hat, und
mit Sicherungskopie im App-Ordner (`%LOCALAPPDATA%\de.pendzialek.projektordner\Sicherungen`, die neuesten 200).
Löschen kann das Tool nichts.

## Projektdatei (.oap)

Die Projektdatei ist das gemeinsame Projektarchiv aller Apps (ZIP mit `manifest.json` und `projekt.json`, dazu
Pläne, Modelle und Quelldateien). Dieses Tool schreibt darin die Stammdaten unter `meta` und seine eigenen Angaben
unter `projektordner`:

```json
{
  "name": "Neubau eines Einfamilienhauses",
  "meta": {
    "projektcode": "2026-014",
    "kurzname": "EFH Musterweg",
    "vorhaben": "Neubau eines Einfamilienhauses",
    "adresse": { "strasse": "Musterweg 3", "plz": "48143", "ort": "Münster" },
    "grundstueck": { "gemarkung": "", "flur": "", "flurstueck": "" },
    "bauherr": { "name": "…", "adresse": { "strasse": "", "plz": "", "ort": "" }, "kontakte": [{ "art": "email", "wert": "…" }] },
    "bearbeiter": "TP",
    "leistungsphasen": [1, 2, 3, 4],
    "beteiligte": [{ "rolle": "Tragwerk", "name": "…", "kontakt": "…" }],
    "angelegt": "2026-10-01"
  },
  "projektordner": { "struktur": "Standard", "dateischema": "{nummer}_{plannummer}_{index}_{titel}", "presets": ["Jedes Projekt", "Bauantrag"] }
}
```

Abschnitte, die eine App nicht kennt (etwa die einer anderen App oder einer neueren Fassung), bleiben beim Lesen
und Schreiben erhalten. Welche Projektdatei gilt, wenn es mehrere gibt (bis vier Ebenen tief): eine im Ordner der
Berechnungen (Pfad enthält „Berechnung“), sonst die mit dem kürzesten Pfad, dann die zuletzt geänderte – dieselbe
Regel wie in der Formulare-App.

Bis Version 0.1 standen die Stammdaten in einer eigenen `projekt.json` im Projektordner. Sie wird nur noch gelesen
(sie füllt Lücken der Projektdatei, etwa Kurzname und Leistungsphasen) und bleibt liegen. Ist sie nicht lesbar
(beschädigt oder fremd), meldet „Ordner prüfen“ den Hinweis „Alte projekt.json nicht lesbar“, und beim Ergänzen steht
derselbe Hinweis über den Stammdaten – die Datei selbst bleibt unangetastet.

Presets in der Struktur-Datei:

```json
{
  "vorlagenname": "{nummer} {name}",
  "presets": [
    {
      "name": "Jedes Projekt",
      "standard": true,
      "eintraege": [
        { "quelle": "Word/Briefbogen.dotx", "ziel": "04 Schriftverkehr/Bauherr", "name": "{nummer} Brief Bauherr" },
        { "quelle": "Excel/Kostenschätzung.xltx", "ziel": "03 Berechnungen/Kosten" }
      ]
    },
    { "name": "Bauantrag", "eintraege": [{ "quelle": "Bauantrag", "ziel": "06 Genehmigung", "lph": [4] }] }
  ]
}
```

## Grenzen

- „Projekt abschließen“ setzt nur den Status; ein Verschieben in einen Archiv-Stammordner (als Kopie) und den
  Prüfbericht als PDF gibt es nicht. Ein von Hand ins Archiv verschobenes Projekt zählt beim Nummernvorschlag mit,
  wenn sein Stammordner eingestellt ist. Keine Obsidian-Projektnotiz.
- Ob eine Vorlage vorhanden ist, entscheidet ihr Name im Projekt. Wurde eine ergänzte Datei später umbenannt,
  ergänzt der nächste Lauf sie erneut – der Trockenlauf zeigt es vorher, und sie lässt sich abwählen.
- Die Planliste ist eine Vorlage, keine Verwaltung – Revisionen und Verteiler führt das Tool nicht.
- Die Nummernvergabe ist ein Vorschlag aus den vorhandenen Ordnern. Legen zwei Personen gleichzeitig an,
  erkennt das Tool die Kollision erst am vorhandenen Ordner – und überschreibt auch dann nichts.
