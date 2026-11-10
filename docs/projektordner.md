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

1. **Projekt:** „Neues Projekt anlegen“ oder **„Bestehendes Projekt ergänzen“** – aus der Liste der Projekte im
   Stammordner (mit Suche) oder mit „Anderen Ordner wählen …“ an beliebiger Stelle. Der Ordner muss nicht nach dem
   Schema heißen; ergänzt wird in genau diesem Ordner. Aus „Ordner prüfen“ führt „Projekt ergänzen …“ direkt hierher.
2. **Stammdaten:** Projektnummer, Kurzname, Bezeichnung, Adresse des Bauvorhabens, Grundstück, Aktenzeichen,
   Bauherr mit Kontakten.
   - Neues Projekt: Das Tool schlägt die nächste freie Nummer vor – die höchste laufende Nummer unter den Ordnern
     des Stammordners (im laufenden Jahr, wenn das Schema ein Jahr enthält) plus eins. Gibt es den Ordner schon,
     bietet der Assistent an, dieses Projekt zu ergänzen. Das angefangene Formular bleibt bis zum nächsten Start
     erhalten.
   - Bestehendes Projekt: Die Stammdaten kommen aus der Projektdatei. **Fehlt sie, ist das kein Fehler:** Der
     Assistent erfasst die Stammdaten (Nummer und Kurzname aus dem Ordnernamen vorgeschlagen, bei Ordnern aus
     Version 0.1 aus der alten `projekt.json`) und legt die Projektdatei damit an.
3. **Umfang:** beauftragte Leistungsphasen, Bearbeitung, Beteiligte (Rolle, Name, Kontakt). An Leistungsphasen
   gebundene Ordner und Vorlagen entstehen nur, wenn eine davon beauftragt ist (ohne Angabe alle).
4. **Vorlagen:** Vorlagenordner und Vorlagen-Presets (siehe [Vorlagen](#vorlagen)). Vorausgewählt sind bei neuen
   Projekten die Presets mit „Standard“, bei bestehenden die in der Projektdatei vermerkten.
5. **Anlegen bzw. Ergänzen:** der Trockenlauf als Baum – jeder Ordner und jede Datei mit Herkunft (Struktur,
   Vorlage mit Preset, Projektdatei) und dem Vermerk „neu“, „vorhanden“ oder „wird ergänzt“ (Projektdatei, mit
   den geänderten Angaben als Hinweis). Beim Ergänzen zeigt er nur, was sich ändert (umschaltbar). Einzelne
   Einträge lassen sich abwählen; mit einem Ordner entfällt alles darin. Danach meldet das Tool, was angelegt
   bzw. ergänzt wurde, was schon da war und was fehlgeschlagen ist – ein Fehler hält die übrigen Schritte nicht auf.

Angelegt bzw. ergänzt werden

1. die **Ordner** der Struktur,
2. die **Vorlagen** der gewählten Presets, umbenannt nach dem Schema des Büros und mit ersetzten Platzhaltern,
3. die **Projektdatei** am eingestellten Ort (Vorgabe `03 Berechnungen/Flächen/{nummer} {kurzname}.oap`): neu als
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
| `allgemein.json` | Stammordner der Projekte (mehrere möglich; im ersten entstehen neue Projekte), Ort der Projektdatei in neuen Projekten, Fotoordner im Projekt (für die Entzerrung) |
| `projektordner.json` | Struktur samt Vorlagen-Presets und Vorlagenordner dieses Tools |

Welcher Konfigurationsordner gilt, steht je Benutzer in `%APPDATA%\arch-tools\konfig.json` – für alle Apps
derselbe Ort. Einstellungen früherer Fassungen (lokal gespeichert) werden beim ersten Start übernommen. Im Browser
liegen die Einstellungen im Speicher des Browsers.

### Struktur

Ordnerbaum und Namensschemata gehören dem Büro, nicht dem Tool. Die Struktur lässt sich zusätzlich als JSON-Datei
speichern, weitergeben und laden – samt den Vorlagen-Presets und dem Dateinamenschema für Vorlagen; die eingebaute
Vorgabe ist neutral (nach Dokumentart: Projekt, Grundlagen, Pläne, Berechnungen, Schriftverkehr, Protokolle,
Genehmigung, Ausschreibung, Bauleitung, Fotos). „Standard“ setzt Ordner und Schemata zurück; die Presets bleiben.

| Einstellung | Vorgabe | Platzhalter |
|---|---|---|
| Projektnummer | `{jahr}-{nr:3}` → 2026-014 | `{jahr}`, `{jj}`, `{nr}` bzw. `{nr:3}` (führende Nullen) |
| Name des Projektordners | `{nummer} {kurzname}` | `{nummer}`, `{kurzname}`, `{jahr}` |
| Dateinamenschema für Pläne | `{nummer}_{plannummer}_{index}_{titel}` | dazu `{datum}` |

Die **Ordnerliste** ist ein Text mit einer Zeile je Ordner, Unterordner mit `/`. Zusätze nach `|`:

```
02 Pläne/Entwurf | Dateischema
02 Pläne/Ausführung | LPh 5 | Dateischema
07 Ausschreibung | LPh 6-7
```

- `LPh 5`, `LPh 6-7`, `LPh 4, 8` – der Ordner entsteht nur, wenn eine dieser Leistungsphasen beauftragt ist.
- `Dateischema` – Dateien in diesem Ordner werden im Prüfmodus gegen das Dateinamenschema geprüft.

Unzulässige Zeichen in Namen (`\ / : * ? " < > |`) werden entfernt. Der Ort der Projektdatei stand bis Version 0.1
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
wo jede Datei landet und wie sie heißt; Vorlagen, die es im Vorlagenordner nicht gibt, sind markiert.

Presets mit **„Standard“** sind bei neuen Projekten vorausgewählt; welche ein Projekt bekommen hat, steht in seiner
Projektdatei. Die eingebaute Struktur bringt das Preset
**„Alle Vorlagen“** mit: der ganze Vorlagenordner, jede Datei an denselben Ort im Projekt – für einen Vorlagenordner,
der wie ein Projektordner aufgebaut ist. Projekte merken sich ihre Presets beim Namen (in der Projektdatei); ein
umbenanntes Preset meldet der Trockenlauf beim Ergänzen als unbekannt.

### Dateinamen

So heißt eine Vorlage im Projekt:

1. Gibt die Zuordnung einen **Namen** vor, gilt er.
2. Enthält der Name der Vorlage selbst Platzhalter (`{nummer} Projektblatt.md`), werden nur diese ersetzt.
3. Sonst gilt das **Dateinamenschema für Vorlagen** (Vorgabe `{nummer} {name}`):
   `Kostenschätzung.xlsx` → `2026-014 Kostenschätzung.xlsx`.

Platzhalter in Namen: `{nummer}`, `{kurzname}`, `{jahr}`, `{bearbeiter}`, `{datum}` (Tag des Anlegens,
JJJJ-MM-TT) und `{name}` (Name der Vorlage ohne Endung). Die Endung kommt immer von der Vorlage. **Office-Vorlagen
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

Ein vorhandener Projektordner wird eingelesen und mit der Struktur verglichen. Gemeldet werden

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

Das Tool meldet nur. Von hier aus lassen sich **fehlende Ordner anlegen** und das **Projekt ergänzen** (im
Assistenten: fehlende Ordner, Vorlagen und die Projektdatei).

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
(sie füllt Lücken der Projektdatei, etwa Kurzname und Leistungsphasen) und bleibt liegen.

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

- Kein Archivieren (Projekt abschließen, als ZIP exportieren) und keine Obsidian-Projektnotiz.
- Die Projektauswahl beim Ergänzen ist eine einfache Liste; die gemeinsame Projektübersicht aller Apps folgt.
- Ob eine Vorlage vorhanden ist, entscheidet ihr Name im Projekt. Wurde eine ergänzte Datei später umbenannt,
  ergänzt der nächste Lauf sie erneut – der Trockenlauf zeigt es vorher, und sie lässt sich abwählen.
- Die Planliste ist eine Vorlage, keine Verwaltung – Revisionen und Verteiler führt das Tool nicht.
- Die Nummernvergabe ist ein Vorschlag aus den vorhandenen Ordnern. Legen zwei Personen gleichzeitig an,
  erkennt das Tool die Kollision erst am vorhandenen Ordner – und überschreibt auch dann nichts.
