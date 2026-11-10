# Projektordner

Das Tool **Projektordner** (`apps/ordner`, eigene App mit eigenem Installer) legt für ein neues Projekt den
Ordnerbaum, die Vorlagen und die Stammdaten nach einheitlichem Schema an, ergänzt in vorhandenen Projektordnern,
was fehlt, und prüft sie gegen dieses Schema.

Grundsatz: Es wird **nur neu angelegt**. Vorhandene Ordner und Dateien bleiben unverändert – nichts wird
überschrieben, verschoben, umbenannt oder gelöscht. Vor dem Anlegen zeigt der Trockenlauf, was passiert.

## Neues Projekt

Links die Stammdaten, rechts der Trockenlauf.

- **Stammdaten:** Projektnummer, Kurzname, Bezeichnung, Adresse des Bauvorhabens, Grundstück, Bauherr mit
  Kontakten, beauftragte Leistungsphasen, Bearbeitung, Beteiligte (Rolle, Name, Kontakt).
- **Stammordner:** der Ordner, in dem alle Projektordner liegen (Server, Cloud-Ordner oder lokal). Er wird
  einmal gewählt und bleibt eingestellt.
- **Projektnummer:** Das Tool schlägt die nächste freie Nummer vor – die höchste laufende Nummer unter den
  Ordnern des Stammordners (im laufenden Jahr, wenn das Schema ein Jahr enthält) plus eins. Es ist ein
  Vorschlag: Das Feld bleibt frei, und wer die Nummern im Büro vergibt, entscheidet.
- **Vorlagen-Presets:** welche Zusammenstellungen von Vorlagen (siehe [Vorlagen](#vorlagen)) das Projekt
  bekommt. Vorausgewählt sind die Presets mit „Standard“; die Auswahl wird in `projekt.json` vermerkt.
- **Trockenlauf:** der vollständige Plan als Baum – jeder Ordner und jede Datei mit Herkunft (Struktur,
  Vorlage mit Preset, Stammdaten, leere Flächenberechnung) und dem Vermerk „neu“ oder „vorhanden“. Neue Einträge
  lassen sich abwählen; mit einem Ordner entfällt alles darin. Was es schon gibt, bleibt unverändert; ein zweiter
  Lauf ergänzt nur, was fehlt.
- **Projektordner anlegen:** führt den Plan aus und meldet, was angelegt wurde, was schon da war und was
  fehlgeschlagen ist. Ein Fehler in einem Schritt hält die übrigen nicht auf.

Angelegt werden

1. die **Ordner** der Struktur – an Leistungsphasen gebundene nur, wenn eine davon beauftragt ist (ohne
   Angabe von Leistungsphasen alle),
2. die **Vorlagen** der gewählten Presets, umbenannt nach dem Schema des Büros und mit ersetzten Platzhaltern,
3. **`projekt.json`** mit den Stammdaten im Projektordner – die zentrale Quelle für Nummer, Bauherr und
   Leistungsphasen,
4. eine **leere Flächenrechner-Datei** (`.oap`) mit den Projektdaten. Flächenrechner, GRZ-Nachweis und
   Kostenermittlung öffnen sie; Projektcode, Vorhaben (die Bezeichnung), Adresse, Grundstück und Bauherr sind schon
   eingetragen. Die Formulare-App gleicht diese Stammdaten mit der Projektkarte von FORMA ab.

## Projekt aktualisieren

Ein vorhandener Projektordner bekommt, was nach Struktur und Presets fehlt – etwa nachdem das Büro neue Vorlagen
eingeführt hat, ein Preset dazukommt oder weitere Leistungsphasen beauftragt sind.

- **Projektordner wählen:** aus der Liste der Projekte im Stammordner oder mit „Anderen Ordner wählen …“ an
  beliebiger Stelle. Der Ordner muss nicht nach dem Schema heißen; ergänzt wird in genau diesem Ordner.
- **Stammdaten** kommen aus der `projekt.json` des Ordners. Fehlt sie (Projekte von vor dem Tool), lassen sich die
  Stammdaten aus „Neues Projekt“ verwenden; die `projekt.json` wird dann daraus angelegt.
- **Leistungsphasen und Presets** sind aus der `projekt.json` vorausgewählt (ohne Angabe die Standard-Presets)
  und lassen sich für diesen Lauf ändern. Die `projekt.json` selbst bleibt unverändert.
- **Trockenlauf:** zeigt nur, was fehlt (umschaltbar auf den ganzen Baum); einzelne Einträge lassen sich abwählen.
  „Fehlendes ergänzen“ legt nur diese Einträge an. `{jahr}` in Namen ist das Jahr, in dem das Projekt angelegt
  wurde.
- **Datum im Dateinamen:** Enthält der Name einer Vorlage `{datum}`, gilt sie als vorhanden, wenn es dieselbe
  Datei mit einem anderen Datum schon gibt (im Trockenlauf „vorhanden*“) – sie wird nicht bei jedem Lauf neu
  angelegt.

Im Browser entsteht eine ZIP-Datei mit dem, was fehlt, zum Entpacken in den Projektordner. Der Prüfmodus führt
mit „Projekt aktualisieren …“ direkt hierher.

## Struktur

Ordnerbaum und Namensschemata gehören dem Büro, nicht dem Tool. Die Struktur lässt sich als JSON-Datei
speichern, weitergeben und laden – samt den Vorlagen-Presets und dem Dateinamenschema für Vorlagen; die eingebaute
Vorgabe ist neutral (nach Dokumentart: Projekt, Grundlagen,
Pläne, Berechnungen, Schriftverkehr, Protokolle, Genehmigung, Ausschreibung, Bauleitung, Fotos).

| Einstellung | Vorgabe | Platzhalter |
|---|---|---|
| Projektnummer | `{jahr}-{nr:3}` → 2026-014 | `{jahr}`, `{jj}`, `{nr}` bzw. `{nr:3}` (führende Nullen) |
| Name des Projektordners | `{nummer} {kurzname}` | `{nummer}`, `{kurzname}`, `{jahr}` |
| Dateinamenschema für Pläne | `{nummer}_{plannummer}_{index}_{titel}` | dazu `{datum}` |
| Leere Flächenrechner-Datei | `03 Berechnungen/Flächen/{nummer} {kurzname}.oap` | leer = keine |

Die **Ordnerliste** ist ein Text mit einer Zeile je Ordner, Unterordner mit `/`. Zusätze nach `|`:

```
02 Pläne/Entwurf | Dateischema
02 Pläne/Ausführung | LPh 5 | Dateischema
07 Ausschreibung | LPh 6-7
```

- `LPh 5`, `LPh 6-7`, `LPh 4, 8` – der Ordner entsteht nur, wenn eine dieser Leistungsphasen beauftragt ist.
- `Dateischema` – Dateien in diesem Ordner werden im Prüfmodus gegen das Dateinamenschema geprüft.

Unzulässige Zeichen in Namen (`\ / : * ? " < > |`) werden entfernt.

## Vorlagen

Vorlagen liegen in einem eigenen **Vorlagenordner**, nicht im Tool – gegliedert, wie es dem Büro passt (etwa nach
Dateiart: `Word/`, `Excel/`, `Bauantrag/`). Er wird unter **Vorlagen** (oder im Trockenlauf) gewählt, bleibt
eingestellt und wird bei jedem Wechsel der Ansicht frisch eingelesen; „Neu einlesen“ holt Änderungen sofort.

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
gegebenenfalls Namen eintragen. Die Vorschau zeigt mit den Stammdaten aus „Neues Projekt“ (sonst Beispielwerten),
wo jede Datei landet und wie sie heißt; Vorlagen, die es im Vorlagenordner nicht gibt, sind markiert.

Presets mit **„Standard“** sind bei neuen Projekten vorausgewählt. Die eingebaute Struktur bringt das Preset
**„Alle Vorlagen“** mit: der ganze Vorlagenordner, jede Datei an denselben Ort im Projekt – für einen Vorlagenordner,
der wie ein Projektordner aufgebaut ist. Projekte merken sich ihre Presets beim Namen (`projekt.json`); ein
umbenanntes Preset meldet der Trockenlauf beim Aktualisieren als unbekannt.

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

- `projekt.json`: vorhanden, fehlt oder nicht lesbar; mit Stammdaten gilt deren Auswahl der Leistungsphasen,
- der **Ordnername**, wenn er nicht dem Schema und den Stammdaten entspricht,
- **fehlende Ordner** der Struktur,
- **zusätzliche Ordner** auf Ebenen, die die Struktur vorgibt (Stamm und Ordner mit vorgegebenen Unterordnern),
- **lose Dateien** im Projektordner,
- Dateien in den Planordnern, die nicht dem **Dateinamenschema** folgen (mit der Projektnummer aus den
  Stammdaten),
- **überlange Pfade** (mehr als 200 Zeichen ab dem Projektordner – mit Laufwerk und Stammordner droht die
  Windows-Grenze von 260 Zeichen).

Das Tool meldet nur. Von hier aus lassen sich **fehlende Ordner anlegen**, das **Projekt aktualisieren**
(fehlende Ordner, Vorlagen und Stammdaten ergänzen, siehe oben) und die **Stammdaten übernehmen** – als
Ausgangspunkt für ein neues Projekt. Alles legt nur neu an.

## Desktop und Browser

Ordner anlegen und einlesen kann nur die Desktop-App. Die Web-Version liefert den Projektordner als
**ZIP-Datei** zum Entpacken und liest Vorlagen- bzw. Projektordner über den Dateidialog (nur lesend; leere
Ordner erkennt der Browser dabei nicht).

Die Desktop-App greift nur auf Ordner zu, die im Dialog gewählt wurden, und ihre Befehle können ausschließlich
neue Ordner und Dateien anlegen ([apps/ordner/src-tauri/src/lib.rs](../apps/ordner/src-tauri/src/lib.rs)).

## `projekt.json`

```json
{
  "format": "projektordner",
  "version": 1,
  "nummer": "2026-014",
  "kurzname": "EFH Musterweg",
  "bezeichnung": "Neubau eines Einfamilienhauses",
  "adresse": { "strasse": "Musterweg 3", "plz": "48143", "ort": "Münster" },
  "grundstueck": { "gemarkung": "", "flur": "", "flurstueck": "" },
  "bauherr": { "name": "…", "adresse": { "strasse": "", "plz": "", "ort": "" }, "kontakte": [{ "art": "email", "wert": "…" }] },
  "bearbeiter": "TP",
  "leistungsphasen": [1, 2, 3, 4],
  "beteiligte": [{ "rolle": "Tragwerk", "name": "…", "kontakt": "…" }],
  "presets": ["Jedes Projekt", "Bauantrag"],
  "angelegt": "2026-10-01",
  "struktur": "Standard",
  "dateischema": "{nummer}_{plannummer}_{index}_{titel}"
}
```

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
- Die `projekt.json` wird nie geändert: Beim Aktualisieren nachträglich gewählte Presets oder Leistungsphasen
  stehen dort nicht und müssen beim nächsten Mal wieder gewählt werden.
- Ob eine Vorlage vorhanden ist, entscheidet ihr Name im Projekt. Wurde eine ergänzte Datei später umbenannt,
  ergänzt der nächste Lauf sie erneut – der Trockenlauf zeigt es vorher, und sie lässt sich abwählen.
- Die Planliste ist eine Vorlage, keine Verwaltung – Revisionen und Verteiler führt das Tool nicht.
- Die Nummernvergabe ist ein Vorschlag aus den vorhandenen Ordnern. Legen zwei Personen gleichzeitig an,
  erkennt das Tool die Kollision erst am vorhandenen Ordner – und überschreibt auch dann nichts.
