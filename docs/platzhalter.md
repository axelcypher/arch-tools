# Platzhalter (Variablen) der Suite

Alle Apps setzen Werte in Namen und Texte über Platzhalter in geschweiften Klammern ein – Dateinamen exportierter
PDFs, Ordnernamen, den Pfad der Projektdatei, Mailvorlagen. Seit dieser Fassung gilt überall dieselbe Schreibweise
und dieselbe Ersetzung (`packages/core/src/platzhalter.ts`); jede Einstellung mit Platzhaltern zeigt dieselben Chips
darunter.

## Schreibregel: global oder lokal – am Namen erkennbar

| Art | Schreibweise | Beispiele | gilt |
| --- | --- | --- | --- |
| **global** | GROSSBUCHSTABEN, Wörter mit Unterstrich | `{PROJEKT_KUERZEL}`, `{DATUM}` | in allen Apps gleich |
| **lokal** | erster Buchstabe groß, ohne Unterstrich, Groß-/Kleinschreibung zählt | `{Name}`, `{Nr}`, `{FirmaMail}` | nur in ihrem Zusammenhang |

In den Chips stehen die globalen Variablen links unter „Global“ (blau hinterlegt), die lokalen rechts unter
„Nur hier“ (gestrichelter Rand). Ein Klick setzt den Platzhalter an der Schreibmarke ein bzw. hängt ihn an; der
Tooltip nennt Erklärung, Quelle und ein Beispiel.

Nach einem Doppelpunkt folgt eine **Angabe**: beim Datum das Format aus `JJJJ`, `JJ`, `MM`, `TT` und Trennern
(`{DATUM:JJJJ-MM-TT}` → 2026-11-13), bei Zahlen die Stellen (`{Nr:3}` → 007). Platzhalter, die keine Variable
kennt oder deren Angabe nicht passt (`{DATUM:xyz}`), bleiben so stehen und werden am Feld gemeldet.

## Globale Variablen

| Variable | Bedeutung | Quelle | Beispiel |
| --- | --- | --- | --- |
| `{PROJEKT_KUERZEL}` | Projektkürzel bzw. Projektnummer | Projektdatei (.oap), Stammdaten „Projektcode“ | `BS9` |
| `{PROJEKT_KURZNAME}` | Kurzname des Projekts | Projektdatei, Stammdaten „Kurzname“ | `EFH Musterweg` |
| `{PROJEKT_VORHABEN}` | Bezeichnung des Vorhabens | Projektdatei, Stammdaten „Vorhaben“ | `Neubau eines Einfamilienhauses` |
| `{BEARBEITER}` | Bearbeitung (Kürzel bzw. Name) | Projektdatei, Stammdaten „Bearbeitung“ | `TP` |
| `{DATUM}` | Datum des Vorgangs als JJMMTT; mit Format z. B. `{DATUM:JJJJ-MM-TT}` | heute bzw. Tag des Vorgangs (Export, Anlegen) | `261113` |
| `{JAHR}` | Jahr des Vorgangs, vierstellig | wie `{DATUM}` | `2026` |
| `{JAHR_KURZ}` | Jahr des Vorgangs, zweistellig | wie `{DATUM}` | `26` |

„Vorgang“ ist, was den Namen erzeugt: der Export eines PDFs, das Anlegen eines Projekts oder einer Datei. Im
Projektordner ist `{JAHR}` beim Ergänzen eines bestehenden Projekts das Jahr, in dem es angelegt wurde. In der AVA
ist `{PROJEKT_VORHABEN}` ohne Vorhaben der Name des Projekts und `{BEARBEITER}` zuerst die Angabe aus den
Einstellungen des Deckblatts.

In **Dokumentvorlagen** (Excel, Word, Text – doppelte Klammern, siehe [excel-vorlagen.md](excel-vorlagen.md) und
[projektordner.md](projektordner.md#vorlagen)) gibt es dieselben globalen Variablen: `{{PROJEKT_KUERZEL}}`,
`{{DATUM}}`, `{{DATUM:TT.MM.JJJJ}}` … – neben den Feldnamen wie `{{projekt.name}}`.

## Lokale Variablen je App

| App | Einstellung | lokale Variablen |
| --- | --- | --- |
| Formulare | Namensvorlage exportierter PDFs, fester Zielordner | `{Art}` Antragsart, `{Nr}` Nummer im Antragsumfang, `{Name}` Titel bzw. Formularname, `{Antrag}` aktive Fassung, `{Formular}`, `{Kennung}`, `{Stand}` |
| Projekt (Projektordner) | Nummernschema | nur `{JAHR}`, `{JAHR_KURZ}` und `{Nr}` bzw. `{Nr:3}` – das Schema bildet die Projektnummer selbst |
| Projekt | Name des Projektordners, Pfad der Projektdatei | – (alle globalen) |
| Projekt | Dateinamenschema für Pläne | `{Plannummer}`, `{Index}`, `{Titel}` |
| Projekt | Dateinamen der Vorlagen im Projekt | `{Name}` Name der Vorlage ohne Endung |
| Projekt | Katasterpläne: Dateiname, Ablageordner | `{Art}` Antragsart, `{Name}` Name des Plans; im Ordner `{Antrag}` |
| AVA | Muster der Rechnungsdateien | `{Nr}`, `{Art}`, `{Lfd}`, `{Firma}`, `{Rechnungsdatum}`, `{Gewerk}` |
| AVA | Name neuer LV-Dateien | `{Gewerk}` |
| AVA | Mailvorlagen (Rechnung) | `{Gewerk}`, `{Firma}`, `{FirmaMail}`, `{Rechnung}`, `{Nr}`, `{Betrag}`, `{Rechnungsdatum}`, `{Zahler}` |
| AVA | Mailvorlage Protokoll | `{Nr}`, `{Protokolldatum}`, `{Teilnehmer}` |

## Alte Namen gelten weiter

Gespeicherte Einstellungen, Strukturen und Projektdateien werden **nicht** umgeschrieben. Alte Namen werden beim
Ersetzen als Alias erkannt – ohne Rücksicht auf Groß-/Kleinschreibung, mit ihrer bisherigen Bedeutung:

| alt | neu |
| --- | --- |
| `{Kürzel}`, `{Kuerzel}`, `{nummer}`, `{projektcode}`; `{Projekt}` (Formulare), `{projekt}` (Projekt), `{Code}` (Katasterpläne) | `{PROJEKT_KUERZEL}` |
| `{Kurzname}`, `{Vorhaben}`, `{Bearbeiter}`; `{Projekt}` (AVA) | `{PROJEKT_KURZNAME}`, `{PROJEKT_VORHABEN}`, `{BEARBEITER}`; `{PROJEKT_VORHABEN}` |
| `{Datum}` bzw. `{datum}` – Formulare, Projektdatei, Katasterpläne, LV-Dateien: JJMMTT | `{DATUM}` |
| `{datum}` im Projektordner (Ordner- und Dateinamen): JJJJ-MM-TT | `{DATUM:JJJJ-MM-TT}` |
| `{Jahr}`, `{jj}` | `{JAHR}`, `{JAHR_KURZ}` |
| `{Datum}` in der AVA (Rechnungen bzw. Protokoll) | `{Rechnungsdatum}` bzw. `{Protokolldatum}` |
| `{Firma-Mail}` (AVA) | `{FirmaMail}` |
| `{Phase}` (Formulare, frühere Einstellung „Phase“) | `{Art}` |
| `{name}`, `{nr}`, `{plannummer}`, `{index}`, `{titel}` … | `{Name}`, `{Nr}`, `{Plannummer}`, `{Index}`, `{Titel}` |

Ein exakter neuer Name geht immer vor: `{DATUM}` ist überall die globale Variable, auch wo `{Datum}` früher etwas
anderes hieß. Enthält eine Einstellung alte Namen, steht am Feld „Alte Schreibweise (funktioniert weiter): {Kürzel} →
{PROJEKT_KUERZEL} …“ mit dem Knopf **Vorlage anpassen** – erst dieser Klick stellt die Einstellung auf die neuen Namen
um, mit gleicher Bedeutung (`{datum}` im Projektordner wird zu `{DATUM:JJJJ-MM-TT}`).

## Für Entwickler

- `GLOBALE_VARIABLEN` – Liste mit Name, Erklärung, Quelle, Beispiel, Vorgabe-Angabe und alten Namen.
- `ersetzen(vorlage, variablen, werte, { saeubern?, ohneWert? })` – die gemeinsame Ersetzungsfunktion; `werte`
  nach dem neuen Namen (Text, Zahl oder Datum).
- `globaleWerte({ projektcode, kurzname, vorhaben, bearbeiter, datum })` – Werte der globalen Variablen.
- `mitAliasen(name, aliase, ersetzen?)` – globale Variable mit eigenen alten Namen für einen Zusammenhang.
- `platzhalterIn`, `unbekanntePlatzhalter`, `veraltetePlatzhalter`, `modernisieren` – zum Zerlegen, Prüfen und
  Umstellen.
- Oberfläche: `PlatzhalterChips` und `PlatzhalterHinweise` aus `@core/ui/Platzhalter`.
- Lokale Variablen gehören zu ihrer App (z. B. `apps/ava/src/platzhalter.ts`, `PLATZHALTER_PLAN` in
  `apps/ordner/src/nummer.ts`) und folgen derselben Schreibregel. Aliase lokaler Variablen gehen denen der globalen
  vor (`{Datum}` ist in der AVA das Rechnungsdatum).
