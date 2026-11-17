# Platzhalter (Variablen) der Suite

Alle Apps setzen Werte in Namen und Texte über Platzhalter in geschweiften Klammern ein – Dateinamen exportierter
PDFs, Ordnernamen, den Pfad der Projektdatei, Mailvorlagen. Seit dieser Fassung gilt überall dieselbe Schreibweise
und dieselbe Ersetzung (`packages/core/src/platzhalter.ts`); jede Einstellung mit Platzhaltern zeigt dieselben Chips
darunter.

## Schreibregel: global oder lokal – am Namen erkennbar

| Art        | Schreibweise                                                         | Beispiele                       | gilt                      |
| ---------- | -------------------------------------------------------------------- | ------------------------------- | ------------------------- |
| **global** | GROSSBUCHSTABEN, Wörter mit Unterstrich                              | `{PROJEKT_KUERZEL}`, `{DATUM}`  | in allen Apps gleich      |
| **lokal**  | erster Buchstabe groß, ohne Unterstrich, Groß-/Kleinschreibung zählt | `{Name}`, `{Nr}`, `{FirmaMail}` | nur in ihrem Zusammenhang |

In den Chips stehen die globalen Variablen links unter „Global“ (blau hinterlegt), die lokalen rechts unter
„Nur hier“ (gestrichelter Rand). Ein Klick setzt den Platzhalter an der Schreibmarke ein bzw. hängt ihn an; der
Tooltip nennt Erklärung, Quelle und ein Beispiel.

Nach einem Doppelpunkt folgt eine **Angabe**: beim Datum das Format aus `JJJJ`, `JJ`, `MM`, `TT` und Trennern
(`{DATUM:JJJJ-MM-TT}` → 2026-11-13), bei Zahlen die Stellen (`{Nr:3}` → 007). Platzhalter, die keine Variable
kennt oder deren Angabe nicht passt (`{DATUM:xyz}`), bleiben so stehen und werden am Feld gemeldet.

## Globale Variablen

| Variable             | Bedeutung                                                            | Quelle                                        | Beispiel                         |
| -------------------- | -------------------------------------------------------------------- | --------------------------------------------- | -------------------------------- |
| `{PROJEKT_KUERZEL}`  | Projektkürzel bzw. Projektnummer                                     | Projektdatei (.oap), Stammdaten „Projektcode“ | `BS9`                            |
| `{PROJEKT_KURZNAME}` | Kurzname des Projekts                                                | Projektdatei, Stammdaten „Kurzname“           | `EFH Musterweg`                  |
| `{PROJEKT_VORHABEN}` | Bezeichnung des Vorhabens                                            | Projektdatei, Stammdaten „Vorhaben“           | `Neubau eines Einfamilienhauses` |
| `{BEARBEITER}`       | Bearbeitung (Kürzel bzw. Name)                                       | Projektdatei, Stammdaten „Bearbeitung“        | `TP`                             |
| `{DATUM}`            | Datum des Vorgangs als JJMMTT; mit Format z. B. `{DATUM:JJJJ-MM-TT}` | heute bzw. Tag des Vorgangs (Export, Anlegen) | `261113`                         |
| `{JAHR}`             | Jahr des Vorgangs, vierstellig                                       | wie `{DATUM}`                                 | `2026`                           |
| `{JAHR_KURZ}`        | Jahr des Vorgangs, zweistellig                                       | wie `{DATUM}`                                 | `26`                             |
| `{PHASE}`            | Planungsphase des Projekts als Kürzel; leer ohne Festlegung          | Projektdatei, Stammdaten „Planungsphase“      | `GP`                             |
| `{PHASE_NAME}`       | Name der Planungsphase                                               | Namensschema, zur Planungsphase               | `Genehmigungsplanung`            |
| `{LPH}`              | Leistungsphase (HOAI) der Planungsphase; leer bei Phasen ohne (AB)   | Namensschema, zur Planungsphase               | `4`                              |

„Vorgang“ ist, was den Namen erzeugt: der Export eines PDFs, das Anlegen eines Projekts oder einer Datei. In
ATLAS (Projektordner) ist `{JAHR}` beim Ergänzen eines bestehenden Projekts das Jahr, in dem es angelegt wurde. In FABRIO (AVA)
ist `{PROJEKT_VORHABEN}` ohne Vorhaben der Name des Projekts und `{BEARBEITER}` zuerst die Angabe aus den
Einstellungen des Deckblatts. In PERMIO (Formulare) ist `{PROJEKT_KUERZEL}` wie bisher der Name des Projektordners (im Büro
gleich dem Projektcode); in den Katasterplänen ohne Projektcode der Name des Projekts.

**Planungsphase:** Jedes Projekt kann eine aktuelle Planungsphase tragen (`meta.planphase`, Kürzel aus den Planphasen
des Namensschemas – Projekt vor Büro vor Vorgabe, also z. B. BP, EP, GP, AP oder AB). Name und Leistungsphase kommen
aus dem Namensschema; AB hat keine Leistungsphase, `{LPH}` ist dort leer. Eingestellt wird sie in den Stammdaten
(Bereich „Leistungen“, in jeder App über „Stammdaten …“), im Projektkopf neben „Stammdaten …“ (QUADRIO, TERRIO, NUMIO,
FABRIO) und in ATLAS über das Kontextmenü der Projektkarte („Planungsphase …“) bzw. im Assistenten. Ohne Festlegung
steht „nicht festgelegt“ da; ein Vorschlag (aus einem Antrag in Arbeit: Bauantrag bzw. Genehmigungsfreistellung → LPh 4,
Abgeschlossenheitsbescheinigung (ABGE) → AB; nach dem Einreichen eines Bauantrags bzw. einer Freistellung die nächste
beauftragte Phase ab LPh 5; sonst die kleinste beauftragte Leistungsphase) wird nur angeboten, nie still gesetzt.

**Leere Werte und Trenner:** Ist eine Variable leer (etwa `{PHASE}` ohne festgelegte Phase), entfällt ein Trenner
daneben (Leerzeichen, `_`, `-`, im Pfad `/`): `{PROJEKT_KUERZEL}_{PHASE}_{Plannummer}` wird ohne Phase `BS9_GP-04`,
nicht `BS9__GP-04`; am Anfang bzw. Ende eines Namens oder Pfadteils und vor der Endung fällt der Trenner ebenso weg
(`BS9_{PHASE}.pdf` → `BS9.pdf`). Nutzt das Dateinamenschema der Pläne die Phase und hat das Projekt keine, meldet die
Prüfung in ATLAS „Planungsphase nicht festgelegt“.

In PERMIO bleibt an der Stelle der Antragsart (nach dem Namensschema; Vorgabe: nach dem Kürzel) die Antragsart: Steht
dort `{PHASE}` bzw. das alte `{Phase}`, setzt der Export `{Art}` ein und das Feld zeigt den Hinweis dazu. Grund: Die
frühere PERMIO-Einstellung „Phase“ landete genau dort und lieferte im Antragsordner falsche Namen (BVA im Bauantrag) –
die Planungsphase ist keine Antragsart. An anderer Stelle der Namensvorlage ist `{PHASE}` frei verwendbar.

In **Dokumentvorlagen** (Excel, Word, Text – doppelte Klammern, siehe [excel-vorlagen.md](excel-vorlagen.md) und
[projektordner.md](projektordner.md#vorlagen)) gibt es dieselben globalen Variablen: `{{PROJEKT_KUERZEL}}`,
`{{DATUM}}`, `{{DATUM:TT.MM.JJJJ}}` … – neben den Feldnamen wie `{{projekt.name}}`.

## Lokale Variablen je App

| App                    | Einstellung                                        | lokale Variablen                                                                                                                                      |
| ---------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| PERMIO                 | Namensvorlage exportierter PDFs, fester Zielordner | `{Art}` Antragsart, `{Nr}` Nummer im Antragsumfang, `{Name}` Titel bzw. Formularname, `{Antrag}` aktive Fassung, `{Formular}`, `{Kennung}`, `{Stand}` |
| ATLAS                  | Nummernschema                                      | nur `{JAHR}`, `{JAHR_KURZ}` und `{Nr}` bzw. `{Nr:3}` – das Schema bildet die Projektnummer selbst                                                     |
| ATLAS                  | Name des Projektordners, Pfad der Projektdatei     | – (alle globalen)                                                                                                                                     |
| ATLAS                  | Dateinamenschema für Pläne                         | `{Plannummer}`, `{Index}`, `{Titel}`                                                                                                                  |
| ATLAS                  | Dateinamen der Vorlagen im Projekt                 | `{Name}` Name der Vorlage ohne Endung                                                                                                                 |
| ATLAS                  | Katasterpläne: Dateiname, Ablageordner             | `{Art}` Antragsart, `{Name}` Name des Plans; im Ordner `{Antrag}`                                                                                     |
| FABRIO                 | Muster der Rechnungsdateien                        | `{Nr}`, `{Art}`, `{Lfd}`, `{Firma}`, `{Rechnungsdatum}`, `{Gewerk}`                                                                                   |
| FABRIO                 | Name neuer LV-Dateien                              | `{Gewerk}`                                                                                                                                            |
| FABRIO                 | Mailvorlagen (Rechnung)                            | `{Gewerk}`, `{Firma}`, `{FirmaMail}`, `{Rechnung}`, `{Nr}`, `{Betrag}`, `{Rechnungsdatum}`, `{Zahler}`                                                |
| FABRIO                 | Mailvorlage Protokoll                              | `{Nr}`, `{Protokolldatum}`, `{Teilnehmer}`                                                                                                            |
| QUADRIO, TERRIO, NUMIO | Dateiname Excel- und PDF-Export                    | `{Inhalt}` – was exportiert wird, z. B. Flächenaufstellung                                                                                            |

Eingestellt werden alle Datei- und Ordnernamen mit Platzhaltern zentral: **Einstellungen › Pfade und Benennung**
(„Datei → Einstellungen …“ in jeder App, Strg+,), siehe [suite.md](suite.md#einstellungen-aller-apps). Ausnahmen sind
die Mailvorlagen von FABRIO und die Zielordner und Dateinamen der Vorlagen-Presets in ATLAS, die zu ihrem Werkzeug
gehören.

## Alte Namen gelten weiter

Gespeicherte Einstellungen, Strukturen und Projektdateien werden **nicht** umgeschrieben. Alte Namen werden beim
Ersetzen als Alias erkannt – ohne Rücksicht auf Groß-/Kleinschreibung, mit ihrer bisherigen Bedeutung:

| alt                                                                                                                       | neu                                                                              |
| ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `{Kürzel}`, `{Kuerzel}`, `{nummer}`, `{projektcode}`; `{Projekt}` (PERMIO), `{projekt}` (ATLAS), `{Code}` (Katasterpläne) | `{PROJEKT_KUERZEL}`                                                              |
| `{Kurzname}`, `{Vorhaben}`, `{Bearbeiter}`; `{Projekt}` (FABRIO)                                                          | `{PROJEKT_KURZNAME}`, `{PROJEKT_VORHABEN}`, `{BEARBEITER}`; `{PROJEKT_VORHABEN}` |
| `{Datum}` bzw. `{datum}` – Formulare, Projektdatei, Katasterpläne, LV-Dateien: JJMMTT                                     | `{DATUM}`                                                                        |
| `{datum}` in ATLAS (Ordner- und Dateinamen): JJJJ-MM-TT                                                                   | `{DATUM:JJJJ-MM-TT}`                                                             |
| `{Jahr}`, `{jj}`                                                                                                          | `{JAHR}`, `{JAHR_KURZ}`                                                          |
| `{Datum}` in FABRIO (Rechnungen bzw. Protokoll)                                                                           | `{Rechnungsdatum}` bzw. `{Protokolldatum}`                                       |
| `{Firma-Mail}` (FABRIO)                                                                                                   | `{FirmaMail}`                                                                    |
| `{Phase}` (PERMIO, frühere Einstellung „Phase“)                                                                           | `{Art}`                                                                          |
| `{name}`, `{nr}`, `{plannummer}`, `{index}`, `{titel}` …                                                                  | `{Name}`, `{Nr}`, `{Plannummer}`, `{Index}`, `{Titel}`                           |

Ein exakter neuer Name geht immer vor: `{DATUM}` ist überall die globale Variable, auch wo `{Datum}` früher etwas
anderes hieß. Wer früher genau `{DATUM}` (groß) geschrieben hatte – die alten Platzhalter achteten nicht auf
Groß-/Kleinschreibung –, bekommt jetzt die neue Bedeutung: in ATLAS JJMMTT statt JJJJ-MM-TT, in den
Rechnungsmustern von FABRIO den Tag des Vorgangs statt des Rechnungsdatums. Das betrifft nur diese eine Schreibweise. Enthält eine Einstellung alte Namen, steht am Feld „Alte Schreibweise (funktioniert weiter): {Kürzel} →
{PROJEKT_KUERZEL} …“ mit dem Knopf **Auf neue Namen umstellen** – erst dieser Klick stellt die Einstellung auf die neuen Namen
um, mit gleicher Bedeutung (`{datum}` in ATLAS wird zu `{DATUM:JJJJ-MM-TT}`).

## Für Entwickler

- `GLOBALE_VARIABLEN` – Liste mit Name, Erklärung, Quelle, Beispiel, Vorgabe-Angabe und alten Namen.
- `ersetzen(vorlage, variablen, werte, { saeubern?, ohneWert? })` – die gemeinsame Ersetzungsfunktion; `werte`
  nach dem neuen Namen (Text, Zahl oder Datum).
- `globaleWerte({ projektcode, kurzname, vorhaben, bearbeiter, datum, phase })` – Werte der globalen Variablen;
  `phase` aus `phaseQuelle(projektPlanphase(projekt))` (`packages/core/src/planphase.ts`).
- `ersetzen` lässt um leere Werte einen Trenner entfallen; `{ trennerLassen: true }` schaltet das ab.
- `mitAliasen(name, aliase, ersetzen?)` – globale Variable mit eigenen alten Namen für einen Zusammenhang.
- `platzhalterIn`, `unbekanntePlatzhalter`, `veraltetePlatzhalter`, `modernisieren` – zum Zerlegen, Prüfen und
  Umstellen.
- Oberfläche: `PlatzhalterChips` und `PlatzhalterHinweise` aus `@core/ui/Platzhalter`.
- Lokale Variablen gehören zu ihrem Zusammenhang und folgen derselben Schreibregel. Die der zentralen Einstellungen
  stehen in `packages/core/src/einstellungen/variablen.ts` (damit der Dialog sie in jeder App kennt; die Apps
  übernehmen sie von dort, z. B. `PLATZHALTER_PLAN` in `apps/ordner/src/nummer.ts`), die übrigen in der App (z. B. die
  Mailvorlagen in `apps/ava/src/platzhalter.ts`). Aliase lokaler Variablen gehen denen der globalen
  vor (`{Datum}` ist in FABRIO das Rechnungsdatum).
