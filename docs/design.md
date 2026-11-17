# Designrichtlinie

Gemeinsame Regeln für die Oberfläche aller Apps der Suite Arkly. Grundlage ist `packages/core/src/ui/base.css`;
App-eigenes steht in `apps/<app>/src/styles.css`. An dieser Richtlinie messen sich die App-Sitzungen und der
Review-Agent `review-design`.

> Stand: Grundlagen (Skalen, Fokus, Zielgrößen, Überschriften, Meldungen) und gemeinsame Komponenten (Dialoge,
> Druckvorschau, Felder, Umschalter), Aufbau der Kopf- und Werkzeugleisten. Gestaltungsrichtung: C „Kachel“ – Farben,
> App-Farbe, Knopfstufen der Werkzeugleiste, Titelleiste und das Kartenlayout („Fläche und Karten“) stehen hier; die
> Apps stellen nach und nach um (`docs/nachziehen/`).

## Grundsätze

- **Die Arbeit steht im Vordergrund.** Plan, Zahlen und Formular bekommen den Platz; Rahmen, Leisten und Hinweise treten
  zurück.
- **Eine Gestalt je Rolle.** Gleiches sieht in allen Apps gleich aus: Abschnittsüberschrift, Feld, Knopf, Tabelle,
  Meldung. Keine App baut eine eigene Variante, wenn es in `base.css` eine gibt.
- **Nur Variablen, keine festen Farben.** Farben kommen aus den Variablen in `base.css`, damit Hell und Dunkel stimmen.
  Ausnahmen: Zeichenfläche und Papier (Druck), die immer mit hellen Farben arbeiten, und der Schließen-Knopf der
  Titelleiste (siehe „Farben“, feste Farben).
- **Tastatur zählt.** Alles, was mit der Maus geht, geht auch mit der Tastatur, und der Fokus ist sichtbar.

## Skalen

Werte nicht frei wählen, sondern aus der Skala nehmen.

| Variable | Wert | Verwendung                                                                          |
| -------- | ---- | ----------------------------------------------------------------------------------- |
| `--s1`   | 4px  | Abstand innerhalb einer Gruppe (Knopf zu Knopf)                                     |
| `--s2`   | 8px  | Feld zu Feld, Überschrift zu Inhalt                                                 |
| `--s3`   | 12px | Innenabstand von Abschnitten                                                        |
| `--s4`   | 16px | Abschnitt zu Abschnitt                                                              |
| `--s5`   | 24px | große Gliederung (Zielwert für den Dialog-Innenabstand; `.modal` hat heute 18/22px) |
| `--s6`   | 32px | Leerzustände, Abstand zum Fensterrand bei Seiten                                    |

| Variable  | Wert | Verwendung                                                 |
| --------- | ---- | ---------------------------------------------------------- |
| `--fs-xs` | 11px | Feldbeschriftung, Hinweis unter dem Feld, Tabellenkopf     |
| `--fs-s`  | 12px | Nebentext, kleine Knöpfe, dichte Tabellen                  |
| `--fs-m`  | 13px | Grundschrift, Abschnitt in der Karte (`h3`), `.sidebar h2` |
| `--fs-l`  | 15px | Kartenkopf (`h2`), Dialogtitel                             |
| `--fs-xl` | 18px | Seitentitel (Einstieg, Bericht), Kennzahl                  |

Weitere: `--radius-s` 6px (Felder, Knöpfe), `--radius` 8px (Dialoge, Karten), `--ctl-h` 30px und `--ctl-h-s` 24px
(Höhe der Bedienelemente).

Zahlen in Tabellen und Feldern stehen rechtsbündig in Tabellenziffern (`.num`, `input.num`).

Kennzahlentabellen nehmen `.summary-table` (Spaltenköpfe rechtsbündig, passend zu Zahlenspalten); `.text` für reine
Texttabellen: Spaltenköpfe linksbündig (`.summary-table.text`, z. B. Platzhalter-Referenz). Gemischte Tabellen (Text-
und Zahlenspalten, z. B. Kostengruppe | von | Mittel | bis) nehmen `.text` und markieren die Zahlenspalten mit `th.num`
und `td.num`. Zeilen mit Feldern (Eingaben je Zeile) bekommen `.felder`: oben bündig, Text ohne Feld oder Knopf fluchtet
mit dem Feldtext. Gruppenzeilen `tr.gruppe` (getönt mit `--tabelle-gruppe`, halbfett), Summenzeilen `tr.summe`
(halbfett, kräftigere Linie darüber); `tr.strong` bleibt für einzelne hervorgehobene Zeilen. Diese Tabelle soll die
eigenen Tabellenklassen der Apps ersetzen; bis zur Umstellung bleiben diese bestehen.

## Überschriften

- **Karte (Richtung C):** Der Kartenkopf ist die oberste Stufe – `h2` in `--fs-l`, halbfett (`Karte`, siehe „Fläche und
  Karten“). Abschnitte in der Karte `h3` in `--fs-m`, Unterabschnitte `h4` in `--fs-s`, beide halbfett.
- **Seitenleiste und Spalten (alte Muster, bis die App auf Karten umstellt):** `h2` in Satzschreibung, `--fs-m`,
  halbfett, Farbe `--text`; Unterabschnitt `h3`, `--fs-s`, halbfett.
- Keine Versalien – sie lesen sich langsamer, besonders bei langen Titeln.
- Überschriften nicht über die Browser-Vorgabe laufen lassen (ein `h2` ohne Regel wird 22px groß). Wer Spalten ohne
  `.sidebar` baut, setzt die Größe aus der Skala.

## Fokus und Tastatur

- `base.css` zeigt bei Tastaturbedienung an allen Knöpfen, Links, `summary`, Kästchen, Optionsfeldern, Reglern und
  fokussierbaren Elementen einen Rahmen in `--fokus` (2px, 2px Abstand). Bei Mausbedienung erscheint er nicht
  (`:focus-visible`).
- Der Abstand trennt **Fokus** von **aktiv**: Ein aktiver Knopf hat einen Rand in `--accent` direkt am Knopf (in der
  Werkzeugleiste stattdessen Tönung und Strich unten, siehe „Knopfstufen“), der Fokusrahmen steht 2px davon ab.
- In der farbigen Titelleiste ist der Fokusrahmen weiß (siehe „Titelleiste“).
- Textfelder und Auswahllisten bekommen beim Fokus einen Rand in `--accent` und einen Saum in `--fokus-saum`.
- Auf Papier (`.report`) und Zeichenfläche (`.canvas`) ist `--fokus` das helle Blau, auch im dunklen Schema.
- **Nicht** `outline: none` setzen, ohne einen gleichwertigen Ersatz zu zeigen.
- Ausnahme: In Leisten, die überstehenden Inhalt abschneiden (`overflow: hidden`, z. B. die Tableiste von Arkly), liegt
  der Fokusrahmen innen (`outline-offset: -2px`), weiterhin in `--fokus`.
- Umschalter (Werkzeug, Ansicht) tragen `aria-pressed`; Menüknöpfe `aria-haspopup` und `aria-expanded`.
- Menüs mit `role="menu"` brauchen die Menübedienung: beim Öffnen Fokus auf den aktuellen Eintrag, ↑/↓ (Pos1/Ende)
  wechseln, Esc schließt und gibt den Fokus an den Knopf zurück. Esc über `useEscSchliessen`, damit Dialoge darunter
  offen bleiben. Andere Elemente (Kästchen, Text) stehen außerhalb der Menürolle. Vorbild: `ThemeMenu` in
  `TitleBar.tsx`.
- Symbolknöpfe ohne Text brauchen `aria-label` und `title`. Symbole lieber als SVG zeichnen als Schriftzeichen
  (◐ ☀ ☾ fallen je nach Schrift winzig oder gar nicht aus).

## Zielgrößen

- Knöpfe in `.toolbar`, `.button-row`, `.dialog-buttons` und `.section-head` sowie Felder und Auswahllisten in
  `.toolbar` und `.field` sind mindestens `--ctl-h` (30px) hoch, `button.small` und `button.icon` dort `--ctl-h-s` (24px).
  Ausnahme Werkzeugleiste (`Werkzeugleiste`): Dort sind auch `button.icon` (Rückgängig, „Mehr“) und die Symbolknöpfe
  der Kompaktstufe `--ctl-h` hoch und mindestens so breit – eine Leiste hat nur eine Knopfgröße, weil Symbol- und
  Textknöpfe dort nebeneinander stehen. App-Regeln mit eigener Größe für `button.icon` nehmen die Werkzeugleiste aus
  (z. B. `button.icon:not(.werkzeugleiste *)`) – sonst schlägt ihre `min-width` die Regel der Leiste.
- Die Regel hat die Spezifität null (`:where`): Eine App-Regel mit eigener `min-height` geht vor. Feste `height`
  allein reicht dafür nicht; wer kleinere Knöpfe braucht, setzt `min-height` mit.
- Kleiner als 24px nur, wo es nicht anders geht (Hilfe-Knopf „?“, Griffe auf der Zeichenfläche).

## Farben

| Variable                           | Bedeutung                                                                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--bg`, `--panel`                  | Fensterhintergrund, Flächen (Leisten, Dialoge)                                                                                                     |
| `--text`, `--muted`                | Text, Nebentext (`--muted` hält auch auf Tönungen und `--bg` mindestens 4,5 : 1)                                                                   |
| `--border`, `--line-soft`          | Linien, feine Trennlinien in Tabellen                                                                                                              |
| `--app`                            | Kachelfarbe der App aus dem Iconset – nur Titelleiste (siehe „App-Farbe“)                                                                          |
| `--accent`, `--accent-soft`        | Akzent (aktive Werkzeuge, primärer Knopf, Links), Tönung                                                                                           |
| `--ausgabe`, `--on-ausgabe`        | Bernstein für die eine Ausgabe-Aktion (Hauptknopf der Werkzeugleiste) sowie Update und Speicherort-Warnung in der Titelleiste, mit dunkler Schrift |
| `--accent-text`                    | Akzent als Schrift auf getönten Flächen (aktive Knöpfe, Chips) – mindestens 4,5:1                                                                  |
| `--ok-*`, `--warn-*`, `--fehler-*` | Status: eingehalten, prüfen, überschritten/Fehler; `--ok-punkt` usw. für Statuspunkte (Ampel)                                                      |
| `--sel`                            | Auswahl auf Plänen (Orange); auch ungespeicherte Änderungen (Punkt in Titelleiste und an „Speichern“)                                              |
| `--sel-foto`                       | Auswahl auf Fotos (Magenta, in beiden Schemata gleich) – Orange kollidiert dort mit Mess- und Markierungsfarben                                    |
| `--danger`                         | zerstörende Aktionen (Löschen)                                                                                                                     |

**App-Farbe:** Die Titelleiste setzt `data-app` (Kennung aus `APP_NAMEN`) am Wurzelelement; `base.css` hält je App
die Kachelfarbe `--app`. Sie trägt die Titelleiste (dunkel: mit Schwarz gemischt) – sonst nichts Flächiges. Als Akzent
dient sie nur, wenn ihr Farbton mindestens 35° von ok, Warnung und Fehler entfernt ist und sie hell wie dunkel 4,5 : 1
hält: QUADRIO, RECTIO, FABRIO und LEXIO. TERRIO (Grün), NUMIO (Rot), PERMIO (Braun) und ATLAS (Türkis, nah an ok)
behalten den neutralen Akzent Schiefer-Blaugrau, ebenso Arkly. `appFarben.test.ts` prüft Kontrast und Abstand je App;
eine neue App bekommt dort ihren Eintrag. **Bernstein** (`--ausgabe`) gibt es nur für die eine Ausgabe je Bildschirm
(„Flächenaufstellung …“, „Nachweis drucken …“) sowie, auf der farbigen Titelleiste, für Update und Speicherort-Warnung
(diese mit dunklem Rand), immer mit dunkler Schrift – nie als Schrift auf Weiß.

**Feste Farben – begründete Ausnahmen:** Zeichenfläche und Papier (siehe Grundsätze) sowie der Schließen-Knopf der
Titelleiste (`.wc-close:hover` in `#c42b1c` mit weißem Symbol), weil Windows ihn in jedem Schema so zeigt und man ihn
daran erkennt. Ebenso der Saum von Statuspunkt und Ampel (`rgba(0, 0, 0, 0.2)`): Er soll auf jedem Grund leicht
dunkler sein als der Punkt selbst.

**Auswahl auf Fotos** immer mit Saum zeichnen: Magenta allein hat auf mittleren Fototönen (Putz, Ziegel, Himmel) kaum
Helligkeitskontrast. Unter der Linie in `--sel-foto` liegt ein Doppelsaum, außen 1px weiß, innen 1px `rgba(0, 0, 0, 0.5)`.

**Planfarben auf der dunklen Zeichenfläche:** Ist „Zeichenfläche im dunklen Schema abdunkeln“ gewählt, wird die
Zeichenfläche im dunklen Schema als Ganzes gefiltert (`--canvas-filter`). Raumfüllungen in Nutzungsfarbe sähen danach dunkel und im Ton verschoben aus,
anders als die Farbmarke derselben Nutzung in der Liste. Deshalb Füllungen vorrechnen, solange
`useZeichenflaecheGefiltert()` (`@core/platform/theme`) wahr ist – als Hook, damit bei jedem Wechsel neu gezeichnet
wird: `planFuellungDunkel(farbe, deckung)` aus `@core/planFarbe` liefert Farbe und Deckung zum Zeichnen. Die Fläche
sieht danach aus wie die Farbmarke mit der gewünschten Deckung über dem dunklen Grund: gleicher Farbton, dunkler und
matter (Gelb erscheint als Ocker). Linien, Auswahl und Schraffuren werden nicht vorgerechnet; sie bleiben in den hellen
Planfarben und laufen durch den Filter. Über einer Unterlage (PDF, Bild) ist der Grund nicht die helle Planfarbe: dort
`grund` übergeben oder die Abweichung hinnehmen. Die Apps übernehmen das nach und nach (`docs/nachziehen/`). Farbmarken in
Listen und Legenden bleiben in der Originalfarbe und bekommen nie `--canvas-filter` oder einen eigenen Filter (ihr
Kontrast zur Seitenleiste fiele unter 3 : 1). `ZEICHENFLAECHE_INVERT`
und `ZEICHENFLAECHE_GRUND` in `planFarbe.ts` müssen zu `--canvas-filter` und `--canvas` in `base.css` passen; wer eines
ändert, ändert das andere mit.

## Dialoge

- Immer `Modal` aus `ui/Dialog.tsx` statt eines eigenen `div.modal`: Esc, Klick daneben, Rolle, Name und Fokusfalle
  kommen dann mit.
- **Titel:** `kopf` zeigt ihn sichtbar als Kopf und benennt damit den Dialog. Nicht zusätzlich als `h3` im Inhalt
  wiederholen. Ohne `kopf` ist `titel` nur der Name für Screenreader. Unterabschnitte im Dialog sind `h4` (`--fs-s`,
  halbfett).
- **Ausnahmen mit eigenem Kopf:** Ein Dialog mit Erklärung unter dem Titel (Ansicht-Editor) oder mit Navigation links
  (Einstellungen) setzt den Titel als `h3` in seinen eigenen Kopf bzw. Navigationskopf und benennt den Dialog darüber
  (`aria-labelledby` auf diese Überschrift oder `titel`). Vollbild-Ebenen mit eigener Leiste (z. B. die
  Unterlagen-Vorschau in PERMIO) sind kein `Modal`, tragen aber `role="dialog"`, `aria-modal` und einen Namen und
  schließen mit Esc über `useEscSchliessen`.
- **Breite:** Standard 380px, `breit` 620px (Formulare), `tabelle` bis 1200px (Vorschauen, Zuordnungen).
- **Erstfokus** (automatisch, `ui/dialoge.ts`): `autoFocus` bzw. `data-startfokus` (der Dialog bestimmt selbst, z. B.
  ein Häkchen), sonst das erste Textfeld, sonst der Hauptknopf (`.primary`), sonst das gewählte Optionsfeld – nie eine
  Aufklappzeile (`summary`), nie „Abbrechen“: Enter darf nichts verwerfen. Schließt ein Dialog über einem anderen,
  geht der Fokus an die Stelle im äußeren zurück.
- **Knöpfe** in `.dialog-buttons` als letztes Kind des Dialogs (oder seines `<form>`, das dann selbst letztes Kind
  ist): rechtsbündig, Hauptknopf rechts außen, „Abbrechen“ links davon. In langen Dialogen bleiben sie unten stehen
  (sticky).
- Werkzeug-Dialoge mit Nebenaktionen (z. B. Fehlerprotokoll: „Kopieren“, „Speichern …“, „Leeren“): Nebenaktionen
  links, dann ein Abstandhalter (`.tb-spacer`), der Hauptknopf („Schließen“) rechts – alles in `.dialog-buttons`.
- **Enter** löst den Hauptknopf aus: Inhalt in `<form onSubmit>`, Hauptknopf `type="submit"`, alle anderen
  `type="button"`.
- Optionen, die nur zu einer Wahl gehören, erst bei dieser Wahl zeigen (Beispiel: Vorlagen-Knöpfe im Excel-Dialog nur
  bei „Eigene Vorlage“).
- In Rückfragen mit Gefahr-Knopf (`art: 'danger'`, z. B. „Löschen“, „Verwerfen“) liegen Erstfokus und Enter nie auf
  ihm, sondern auf dem Hauptknopf bzw. „Abbrechen“ (ohne beide: auf dem letzten ungefährlichen Knopf). Gibt es nur
  Gefahr-Knöpfe, tut Enter nichts, und Esc oder ein Klick daneben schließen wie „Abbrechen“.
  Ungespeicherte Änderungen verwerfen: siehe „Ungespeicherte Änderungen“.

## Einstellungen

Ein Einstellungsdialog für alle Apps: in jeder App „Datei → Einstellungen …“ (in FABRIO steht „Datei“ im Fuß der
Navigation), in Arkly im Menü „Einstellungen und Hilfe“, überall auch mit Strg+, ohne offenes Menü. Er zeigt die
Einstellungen der ganzen Suite, nicht nur der App, aus der er geöffnet wurde. Den Dialog stellt
`packages/core/src/ui/Einstellungen.tsx`; Apps hängen ihre Seite mit `einstellungsSeiteAnmelden` an (Inhalt, `entwurf`
mit `einstellungenEntwurfMelden`, Sperre über `useEinstellungenGesperrt`).

- **Aufbau:** `Modal` mit `tabelle` und Klasse `einst`; der Titel „Einstellungen“ steht als `h3` im Navigationskopf
  über der Seitenliste (Ausnahme mit eigenem Kopf, siehe „Dialoge“), rechts der Inhalt der gewählten Seite.
  Gemeinsames Muster in `base.css`: `.einst-form`, `.einst-nav` (Seitenliste, Einträge `.einst-nav-eintrag` mit
  Symbol, Titel und kurzem Text), `.einst-inhalt`, `.einst-gruppe`; dazu `.einst-verweis` (`PfadeVerweis`) für den
  umgekehrten Weg, aus einem Dialog der App auf eine Seite der Einstellungen. Unterabschnitte einer Seite sind `h4`.
- **Seitenliste:** eine senkrechte Registerleiste wie unter „Umschalter“ (`role="tablist"`,
  `aria-orientation="vertical"`, Einträge `role="tab"` mit `aria-selected`, ↑/↓ wandern, Pos1/Ende, automatische
  Aktivierung, nur der gewählte Eintrag mit `tabIndex` 0); der Inhalt ist `role="tabpanel"` mit `aria-labelledby` auf
  seinen Eintrag. Die Liste hat eine Mindestbreite, lange Namen brechen um.
- **Seiten in fester Reihenfolge:** „Allgemein“ (Speicherort der Einstellungen, Büro), „Pfade und Benennung“ (alle
  Pfadvorgaben und Benennungsschemata auf einer Seite, nach Thema gegliedert mit `h4` – Projekt, Ablage, Export …;
  jede Einstellung nennt die App bzw. Apps, die sie nutzen, als Text neben dem Feld, und ein Filter „App“ über der Seite
  zeigt nur die Einstellungen einer App), dann je App eine Seite mit ihrem
  Namen, so geschrieben wie die App (QUADRIO), in alphabetischer Reihenfolge. Die öffnende App bestimmt nur die
  Startseite: ihre eigene; Arkly öffnet „Allgemein“, die Warnung zum Notbetrieb ebenfalls „Allgemein“.
- **Erstfokus:** das erste Feld der Startseite (`data-startfokus`), nicht die Seitenliste; im Notbetrieb (alles
  gesperrt) der gewählte Eintrag der Seitenliste.
- **Übernehmen:** Fußzeile `.dialog-buttons` mit Abbrechen | Übernehmen (Hauptknopf). Änderungen gelten erst mit
  „Übernehmen“, für alle Seiten zugleich. Schließen mit Änderungen – Esc, „Abbrechen“, Klick daneben – fragt nach
  (`aenderungenVerwerfen`, siehe „Ungespeicherte Änderungen“). Ist der Speicherort nur lesbar (Notbetrieb), stehen die
  Felder und „Übernehmen“ gesperrt (Grund im `title`), oben ein Hinweis `.meldung.warnung`.
- **Felder:** die gemeinsamen Bausteine (`.field`, Pfadwahl mit „Ordner wählen …“, Platzhalter mit Vorschau des
  Ergebnisses); Fehler an der Stelle (`.feld-meldung`), nicht als Rückfrage.
- **Was keine Einstellung ist, bleibt in seinem Dialog:** was nur ein Werkzeug betrifft (z. B. Vorlagen eines Exports)
  und Datenpflege mit eigenem Speichern je Eintrag (z. B. das Adressbuch von PERMIO). Der Einstellungsdialog kopiert
  es nicht, sondern verweist darauf: ein kurzer Satz (`muted small-text`) und ein Knopf mit dem Objekt und „ …“
  (gleicher Aufbau wie `.einst-verweis`) („Adressbuch …“, `type="button"`, damit Enter nicht „Übernehmen“ auslöst).
  Der Dialog der App liegt dann als eigene Ebene über den Einstellungen (er steht im DOM nach der Titelleiste mit dem
  `EinstellungenHost`); Esc und Klick daneben schließen nur ihn, der Fokus kehrt auf den Knopf zurück. Was dort
  gespeichert wird, gilt sofort: „Übernehmen“ und „Abbrechen“ der Einstellungen betreffen es nicht, es zählt nicht als
  ungespeicherte Änderung der Seite, und ein offener Entwurf der Einstellungen bleibt erhalten. Ist der Speicherort
  nur lesbar, folgt der Dialog der App derselben Sperre (nur lesend, Grund sichtbar). Den eigenen Einstieg in der App
  (z. B. künftig „Adressbuch …“ in „Mehr“, „Adressbuch öffnen …“ in der Projektkarte) behält die Datenpflege; der
  Knopf in den Einstellungen ist ein Verweis, kein doppelter Einstieg.

## Druckvorschau

- `.report-backdrop > .report` gilt als Dialog (Rolle, Name aus der ersten Überschrift, Fokus hinein, Tab bleibt
  drin).
- `.report-actions` ist eine eigene Zeile über dem Blatt und bleibt beim Blättern oben: Optionen links, Knöpfe rechts.
  Sie wird nie mitgedruckt. Hauptknopf (`.primary`) ist **„Drucken / PDF …“** (mit Auslassungspunkten, weil sich der
  Druckdialog öffnet), „Schließen“ ein normaler Knopf links davon.

## Felder

- `NumberField` zeigt Zahlen mit Nachkommastellen gruppiert (45.000,00). Beim Fokussieren bleibt der Text
  unverändert (Cursor und Auswahl stimmen); Punkte vor dem Komma werden beim Lesen immer als Tausendertrenner
  verstanden, auch wenn nach dem Bearbeiten die Dreiergruppen nicht mehr stimmen. Ganze Zahlen (`digits={0}`) stehen
  ohne Punkte, weil „45.00“ dort mehrdeutig wäre.
- **Enter** übernimmt die Eingabe und verlässt das Feld, damit Strg+Z (Rückgängig der App), Entf und die Werkzeugtasten
  wieder der Arbeitsfläche gehören und nicht ins leere Rückgängig des Browsers gehen. In einem `<form>` wird danach
  über den Hauptknopf abgesendet (nicht, wenn er gesperrt ist). Weiter zum nächsten Feld mit Tab. **Esc** verwirft eine
  Eingabe; ohne Eingabe schließt Esc den Dialog.
- In `.toolbar` und `.report-actions` füllen Felder nicht die Zeile: Auswahllisten sind so breit wie ihr Inhalt,
  Textfelder haben die Standardbreite des Browsers (etwa 20 Zeichen; kürzer mit dem Attribut `size`), Regler 120px.
  Sonst füllen Felder ihre Spalte.
- **Fehler über mehrere Felder** (z. B. „Summe der Teilflächen > Grundstücksfläche“): die Meldung einmal neben die
  Felder (`.meldung.fehler` oder `.feld-meldung` mit `id`), an jedem betroffenen `NumberField`/`TextField`
  `ungueltig` und `fehlerId` setzen – das Feld wird rot markiert, `aria-invalid` und von der Meldung beschrieben. Die
  gemeinsame Meldung trägt `role="alert"` und erscheint erst, wenn der Fehler besteht.
- `.toggle` (Kästchen oder Optionsfeld mit Text): das Kästchen wird nie gestaucht.

## Umschalter

`.segment` für eine Wahl aus wenigen (Ansicht, Modus): Knöpfe direkt nebeneinander in einem Rahmen, der gewählte mit
`aria-pressed="true"` in Akzent-Tönung. Höhe 24px, in `.toolbar` 30px wie die übrigen Knöpfe dort; der Rahmen des
Segments zählt mit (die Höhe kommt aus `min-height`, nicht aus dem Innenabstand). Statt eigener
Varianten je App (`.mv-umschalter`, `.ava-tabs`, `.view-switch`).

Als Registerleiste (Bereiche wechseln, der Inhalt darunter tauscht sich) mit `role="tablist"`, Knöpfen mit
`role="tab"` und `aria-selected`; `.segment` färbt `aria-selected="true"` wie `aria-pressed`. ←/→ wechseln zwischen den
Registern, Pos1/Ende springen zum ersten bzw. letzten; der Wechsel wirkt sofort (automatische Aktivierung). Nur das
gewählte Register liegt in der Tab-Reihenfolge (`tabIndex` 0, die übrigen -1).

```html
<div class="segment" role="group" aria-label="Ansicht">
  <button aria-pressed="true">Grundriss</button>
  <button aria-pressed="false">3D</button>
</div>
```

Lange oder viele Werte (z. B. Antworten im Regelbaum von LEXIO) mit `.segment.senkrecht`: die Knöpfe untereinander,
linksbündig, Text darf umbrechen; die Wahl zeigt Tönung und eine Akzentlinie links, ohne halbfette Schrift (sonst
springt der Umbruch). Eine umbrechende Variante gibt es bewusst nicht – umbrechende Segmente lesen sich
treppenartig, und welcher Knopf zu welcher Zeile gehört, ist nicht mehr klar. Dient die Variante als Registerleiste
oder Auswahlgruppe, wechseln ↑/↓ statt ←/→ (`aria-orientation="vertical"`).

## Begriffe

- Befehle, die einen Dialog öffnen, enden auf „ …“ („Öffnen …“, „Excel …“); Befehle, die sofort wirken, nicht
  („Speichern“, „Neu“).
- Gleiches Verb überall: Werkzeugleiste „Öffnen …“, Einstieg „Datei öffnen …“ (mit Objekt, weil der Zusammenhang
  fehlt); „Neu“ bzw. „Neues Projekt“.
- Hinzufügen-Knöpfe und Platzhalter in Auswahllisten: siehe „Listen“.
- Texte sagen, was zu tun ist, nicht was fehlt; was es nur in der Desktop-App gibt, steht als Fußnote darunter.
- Ordner im Dateimanager zeigen (`ordnerZeigen`): „Ordner öffnen“, Symbol `ordnerOffen` – nicht „Im Explorer öffnen“
  (hängt an Windows). Ist der Gegenstand nicht klar, mit Objekt: „Projektordner öffnen“.
- Programmnamen anderer Hersteller kommen in der Bedienung nicht vor – auch nicht in Hinweisen und Tooltips („aus dem
  CAD-Programm“, „im E-Mail-Programm“). Ausnahmen: Dateiformate heißen, wie man sie im Büro nennt und wiedererkennt –
  „PDF“, „Excel“, „Word“, „IFC“, „DWG“ („PDF-, Excel- und Word-Dokumente“, Befehl „Excel …“); eine Anleitung, die den
  Export aus einem bestimmten anderen Programm Schritt für Schritt erklärt, darf dieses nennen; ebenso ein Programm, das
  die App selbst startet oder voraussetzt (ATLAS: QGIS), und die Herkunft von Daten, die nur ein bestimmtes Programm
  liefert (ATLAS: Mails aus Outlook ziehen).

## Symbole

Gemeinsamer Satz in `ui/Symbol.tsx` (Raster 24, Linie 2, runde Enden, Farbe des Textes, Größe 1em):
`<Symbol name="lineal" />`. Ohne `titel` ist das Symbol dekorativ, dann trägt der Knopf den Namen (Text oder
`aria-label`); mit `titel` ist es ein benanntes Bild.

- Werkzeuge: `auswahl`, `polygon`, `rechteck`, `erkennen` (Fläche aus dem Plan), `lineal` (Messen), `kalibrieren`, `einpassen`, `raster`,
  `grenze` (Grundstücksgrenze mit Grenzpunkten), `ausrichten` (Unterlage auf einen Punkt schieben).
- Befehle: `speichern`, `drucken`, `export`, `kopie`, `einfuegen`, `muell`, `rueckgaengig`, `wiederholen`, `plus`,
  `suche`, `stift`.
- Zustand: `haken` (trifft zu), `schliessen` (trifft nicht zu), `frage` (offen, unbekannt), `warnung`, `info`, `auge`,
  `augeZu`, `stern`; `punkt` (gewählte Einfachauswahl im Menü).
- Navigation: `pfeilRechts`, `pfeilLinks`, `pfeilUnten`, `ordner`, `ordnerOffen`, `datei`; `menue` (drei Striche) nur für das
  Menü der Titelleiste (siehe „Titelleiste“).
- Listen: `einruecken`, `ausruecken` (Gliederungsebene), `nachOben`, `nachUnten` zum Umsortieren (statt ↑/↓ als Schriftzeichen); `mehr` (drei Punkte, Knopf mit `aria-label="Aktionen"` und `title`; auch „Mehr“ am Ende einer Werkzeugleiste) für
  Zeilenknöpfe „Aktionen“, die ein Menü öffnen – `pfeilUnten` bleibt dem Aufklapp-Pfeil an Knöpfen mit Text vorbehalten.

Neue Symbole kommen in diesen Satz, nicht in die App. Keine Emoji (📏 ✂ 🗑) und keine Schriftzeichen als Symbol.

## Menüs

`ui/Menue.tsx`: Kontextmenü mit `zeigeMenue(e, punkte, name)` im `onContextMenu`, Aufklappmenü mit `<MenueKnopf>`.
`name` benennt das Menü für Screenreader (z. B. „Projekt 2019-003“); der Aufklappknopf nimmt seinen eigenen Namen. Punkte
mit `text`, optional `symbol`, `hinweis` (rechts, z. B. der Grund einer Sperre), `tasten` (Tastenkürzel, siehe unten),
`haken` (Umschalter), `gewaehlt` (Einfachauswahl; nicht zusammen mit `haken`), `bild` (Bild statt Symbol, 16px, z. B. das Symbol einer App), `titel`, `gefahr`, `deaktiviert`, `unter` (Untermenü), Trenner mit `{ trenner: true }`.

- Tastatur: der erste Punkt hat den Fokus, ↑/↓ und Pos1/Ende wandern, → bzw. Enter öffnet ein Untermenü, ← führt
  zurück. Esc schließt nur das Menü (ein Dialog darunter bleibt offen), Tab schließt und gibt den Fokus an den
  Auslöser zurück.
- `MenueHost` steckt schon in der Titelleiste jeder App und in der Rahmen-App; nicht selbst einhängen.
- Gesperrte Punkte (`deaktiviert`) mit Grund im `hinweis` („Antrag eingereicht“), statt sie wegzulassen. Sie bleiben
  per Tastatur erreichbar (`aria-disabled`), damit der Grund vorgelesen wird, und führen nichts aus.
- Ohne Mausposition (Kontextmenütaste) erscheint das Menü am Auslöser.
- Gefahr-Punkte (Löschen) ans Ende, abgesetzt durch einen Trenner. Der Erstfokus liegt nie auf einem Gefahr-Punkt,
  sondern auf dem ersten bedienbaren anderen – Rechtsklick plus Enter löscht so nichts. Gibt es nur Gefahr-Punkte,
  liegt der Fokus auf dem Menü selbst; ↓ bzw. Pos1 erreichen den Punkt.
- Menüs liegen über Dialogen und Rückfragen; Schatten schwebender Flächen über `--schatten-schwebend`.
- Tastenkürzel in `tasten` in der Schreibweise deutscher Windows-Menüs: Strg, Umschalt, Alt, Entf, Einfg, Pos1, Ende,
  Bild↑/Bild↓, Pfeile als ↑ ↓ ← →, Buchstaben groß, verbunden mit „+“ ohne Leerzeichen („Strg+Umschalt+Z“),
  Alternativen mit „/“ („Entf / Rücktaste“). Sie stehen rechts und werden als `aria-keyshortcuts` vorgelesen (`tastenAria`), nicht als
  Teil des Namens. `hinweis` nicht mehr für Tastenkürzel verwenden.
- Umschalter im Menü (an/aus, z. B. „Raster zeigen“) mit `haken: true | false`: Der Punkt wird ein Kästchen
  (`menuitemcheckbox`, `aria-checked`) und zeigt den Haken anstelle des Symbols. Das Menü schließt nach dem Umschalten
  wie bei jedem Befehl. Mehrere Schalter, die man oft nacheinander umlegt (Ebenen, Spalten), gehören nicht ins Menü,
  sondern in eine Seitenleiste oder ein `.segment`.
- Einfachauswahl im Menü (eine Fassung, eine Zuordnung aus mehreren) mit `gewaehlt: true | false`: `menuitemradio`
  mit `aria-checked`, der gewählte Punkt zeigt `punkt` anstelle des Symbols. Haken nur für An/Aus.
- Eigene Öffner ohne `MenueKnopf` (z. B. Zeilenknopf „⋯“ mit `zeigeMenueAn`) tragen `aria-haspopup="menu"`; dann
  setzt das Menü `aria-expanded` am Öffner selbst. Wer den Zustand im Render braucht, nimmt `useMenueOffen(ref)`.
- Ein zweiter Klick auf den Öffner eines offenen Menüs schließt es (Knopf wie Zeilenknopf).
- `MenueKnopf` zeigt hinter dem Text den Aufklapp-Pfeil; reine Symbolknöpfe wie „Mehr“ (Symbol `mehr`) setzen
  `pfeil={false}` und tragen ihren Namen in `ariaLabel` und `title`. Passt ein Untermenü rechts nicht mehr ins
  Fenster, klappt es links neben dem Menü auf.

## Kopf- und Werkzeugleisten

Was sichtbar ist und was ins Menü gehört – für die Werkzeugleisten aller Apps; die Titelleiste regelt „Titelleiste“.

**Sichtbar bleibt**, was man im Arbeitsablauf ständig braucht: „Speichern“ (mit dem Punkt für ungespeicherte
Änderungen), Rückgängig/Wiederholen, die Werkzeuge der Zeichenfläche, der Haupt-Umschalter der App (Kosten | Mengen,
Foto | Entzerrt, BGF | Raum) und der Hauptknopf (`.primary`, z. B. „Flächenaufstellung …“, „Drucken / PDF …“).
**Knopfstufen:** In der Werkzeugleiste sind Knöpfe ruhig (ohne Rahmen und Fläche, beim Überfahren getönt); das aktive
Werkzeug (`.active` bzw. `aria-pressed`) zeigt die Akzent-Tönung mit einem Strich unten. Der Hauptknopf (`.primary`) ist
dort die Ausgabe der App in Bernstein – deshalb ist ein Knopf in einer Werkzeugleiste, der nichts ausgibt (Hinzufügen,
Prüfen), kein `.primary`, sondern ein Standardknopf. Außerhalb der Leiste bleiben Standardknöpfe mit Rahmen, `.primary` in der
Akzentfarbe (Hauptknopf eines Dialogs) und `.danger` für Gefahr. `.segment` behält seinen Rahmen.

Richtwert: höchstens sieben, besser fünf Knöpfe bzw. Gruppen je Leiste; „Datei“ und „Speichern“ zählen mit, die
Werkzeuge als eine Gruppe, „Mehr“ nicht. Status- und Hinweismarken (Warnungen, Module) gehören nicht ins Menü – sie
bleiben sichtbar, solange sie etwas melden.

**Ins Menü** kommen seltene und einmalige Befehle: Import und Export, Vorlagen, Einstellungen, Protokoll, Hilfe,
Zurücksetzen, Sonderfunktionen. Feste Namen, in allen Apps gleich:

| Menü          | Inhalt                                                                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| „Datei“       | in jeder App: Neu, Öffnen …, Speichern unter …, Import … bzw. Aktualisieren …, „Exportieren“ (Untermenü), Drucken … (wenn es nicht der Hauptknopf ist), Trenner, „Einstellungen …“ (Strg+,)                  |
| „Exportieren“ | Untermenü in „Datei“ (Punkt mit `unter`, den Pfeil zeichnet das Menü – kein „▸“ im Text): Excel …, PDF …, CSV … – je mit Dialog (Ziel, bei Excel und PDF auch Vorlage); kein eigener Menüknopf in der Leiste |
| „Ansicht“     | Schalter der Darstellung (`haken`: Raster, Beschriftung) und Einfachauswahl (`gewaehlt`)                                                                                                                     |
| „Hinzufügen“  | Varianten eines Eintrags (siehe „Listen“); der häufigste bleibt daneben als eigener Knopf                                                                                                                    |
| „Mehr“        | alles Übrige, als letztes Element der Leiste                                                                                                                                                                 |

- **„Einstellungen …“** steht in jeder App als letzter Punkt von „Datei“, hinter einem Trenner, mit `tasten: 'Strg+,'`
  (in keiner App anders belegt; das Kürzel wirkt auch ohne offenes Menü), und öffnet den app-übergreifenden
  Einstellungsdialog auf der Seite der App (siehe „Einstellungen“). In Arkly gilt Strg+, einmal: Ist ein App-Tab
  aktiv, öffnet es den Dialog auf der Seite dieser App, sonst auf „Allgemein“.
  Ausnahme: FABRIO hat keine durchgehende Werkzeugleiste (je Ansicht eigene Leisten, links die Navigation); dort steht
  das Menü „Datei“ im Fuß der Navigation und enthält von den Punkten der Tabelle nur die, die es in FABRIO gibt.
- **Befristet: „Einstellungen von <App> …“** – bis die App ihre eigenen Einstellungen als App-Seite in den zentralen
  Dialog umgezogen hat, öffnet dieser Punkt den bisherigen App-Dialog: in FABRIO in „Datei“ direkt vor dem Trenner
  und „Einstellungen …“, in PERMIO im Menü „Mehr“. Mit der App-Seite entfällt er.
- **Direkter Export:** Wo eine App eine eingestellte Vorlage und einen Zielordner hat (QUADRIO, TERRIO, NUMIO), steht
  in der Leiste der Knopf „Exportieren“ (Symbol `export`, ohne „ …“, weil er sofort wirkt). Er speichert mit der
  eingestellten Vorlage in den Berechnungsordner – als Excel, auf Wunsch zusätzlich als PDF. `title` nennt Ziel und
  Formate („Als Excel und PDF in ‹Ordner› speichern“); ob zusätzlich PDF entsteht, stellt die Seite der App im
  Einstellungsdialog ein.
  - Fehlt etwas (keine Vorlage, kein Berechnungsordner, Projekt noch nie gespeichert), ist der Knopf gesperrt
    (`aria-disabled`, damit er per Tastatur erreichbar bleibt und den Grund vorliest), der Grund steht im `title`; „Datei → Exportieren → Excel …“ bleibt möglich. Während des Exports ist er gesperrt.
  - Gibt es die Datei schon, fragt eine Rückfrage „‚Name.xlsx‘ ersetzen?“ bzw. „‚Name.xlsx‘ und ‚Name.pdf‘ ersetzen?“
    mit dem Satz „Die Datei gibt es schon in ‚Ordner‘.“ bzw. „Die Dateien …“ (Abbrechen | Ersetzen; „Ersetzen“ ist ein
    Gefahr-Knopf, Erstfokus und Enter auf „Abbrechen“, siehe „Dialoge“).
  - Danach meldet ein Hinweis (`zeigeHinweis`, siehe „Meldungen im Inhalt“) den Erfolg mit „Ordner öffnen“; hat die
    Vorlagenprüfung etwas gefunden, ist es derselbe Hinweis als `.meldung.warnung` mit dem Knopf „Prüfhinweise …“ (die
    Liste steht in einem `Modal`), und der Export ist trotzdem geschehen. Scheitert das Schreiben
    (z. B. Datei in Excel geöffnet), meldet ein Hinweis den Fehler.
  - Wer Vorlage oder Ziel wählen will, nimmt „Datei → Exportieren → Excel …“.
- Weitere sprechende Menünamen („Unterlage“, „Einrichtung“, „LV“) nur für eine Gruppe von mindestens drei
  zusammengehörigen Befehlen. Menüknöpfe zum selben Gegenstand zusammenlegen („Neues LV ▾“ und „LV ▾“ → „LV ▾“).
  Keine geteilten Knöpfe (Befehl plus Pfeil in einem): Hauptbefehl als Knopf, Varianten im Menü daneben – etwa
  „Position“ (mit Symbol `plus`) und „Hinzufügen ▾“ mit Kostenrisiko und Gliederung.
- Menüknöpfe tragen Text und Aufklapp-Pfeil (`MenueKnopf`), „Mehr“ nur das Symbol `mehr` (`className="icon"`,
  `pfeil={false}`, `ariaLabel="Mehr"`, `title` „Mehr – weitere Befehle“); Größe siehe „Zielgrößen“.
- Schaltet ein Menü zwischen Ansichten um (ATLAS: „Einrichtung“ mit Struktur, Vorlagen, Einstellungen), zeigt der
  Menüknopf mit `.active`, dass eine seiner Ansichten offen ist, und nennt sie im Namen (`ariaLabel` und `title`
  „Einrichtung: Vorlagen“); im Menü ist sie `gewaehlt`.
- Reihenfolge im Menü: Schalter und Einfachauswahl, dann Befehle, Gefahr-Punkte (Zurücksetzen, Entfernen) am Ende
  hinter einem Trenner. Tastenkürzel in `tasten`, Punkte mit Dialog auf „ …“ (siehe „Menüs“ und „Begriffe“).
- Doppelte Einstiege vermeiden: Steht ein Befehl schon an naheliegender Stelle (Listenkopf, Seitenleiste), fällt sein
  Einstieg in der Leiste weg (NUMIO: Kennwertkatalog). „Einstellungen …“ steht nur in „Datei“, nicht zusätzlich im
  Menü der Titelleiste; das Farbschema nur im Menü der Titelleiste, nicht im Einstellungsdialog. Bewusste Ausnahmen:
  der Update-Punkt im Menü der Titelleiste (siehe „Titelleiste“) und in Arkly „Einstellungen …“ im Menü des Rahmens
  neben „Datei“ der App im Tab (Arkly hat kein eigenes „Datei“; Strg+, gilt einmal, siehe oben) sowie befristet
  „Einstellungen von <App> …“ (siehe oben). Verweise aus den Einstellungen auf einen Dialog der App (Werkzeug,
  Datenpflege) zählen nicht als doppelter Einstieg (siehe „Einstellungen“).
- **Aufbau:** links „Datei“ und „Speichern“, in der Mitte die Werkzeuge bzw. Hauptschritte, rechts der Hauptknopf,
  zuletzt „Mehr“ (FABRIO: „Datei“ im Fuß der Navigation, siehe oben).
- **Zeilen:** Seltene Aktionen einer Tabellen- oder Listenzeile (FABRIO-Rechnung: Deckblatt, Mail an den Zahler)
  kommen in den Zeilenknopf „Aktionen“ (Symbol `mehr`, siehe „Menüs“ und „Listen“); häufige bleiben als Knopf.
- **Schmale Fenster:** Einträge mit Rang wandern nach ihrem Rang ins Menü „Mehr“ (Überlauf), statt nur auf Symbole zu
  schrumpfen. Dafür `Werkzeugleiste` (`ui/Werkzeugleiste.tsx`): `teile` in Leistenreihenfolge, je Eintrag `inhalt`
  (ein Knopf oder mehrere), `gruppe` (Trennstrich zum nächsten Eintrag), `menue` (dasselbe als Menüpunkt bzw.
  Punkte) und `rang` (höher = wandert früher); `{ abstand: true }` schiebt den Rest nach rechts; `mehr` liefert die
  festen Punkte des Menüs „Mehr“, `name` benennt die Leiste. Ohne `rang` oder `menue` bleibt ein Eintrag immer
  sichtbar – so der Hauptknopf und die Werkzeuge. Übergelaufene Einträge stehen in „Mehr“ oben, in ihrer Reihenfolge,
  getrennt von den festen Punkten; hatte ein übergelaufener Knopf den Fokus, bekommt ihn „Mehr“. Einträge
  behalten ihre Breite (`flex: none`) und wandern ins Menü, statt zu schrumpfen; ein Eintrag, der sich kürzen darf
  (Statustext), bekommt `kuerzbar` – er schrumpft bis auf eine Mindestbreite, der Text endet auf „…“; erst danach wandern Einträge
  mit Rang ins Menü. Reicht der Platz auch dann nicht, wenn alle Einträge mit Rang im Menü stehen, wird die Leiste
  kompakt (Klasse `.kompakt`): Knopftexte in `<span className="tb-text">` verschwinden, es bleiben die Symbole. `tb-text`
  nur in Knöpfen mit Symbol, und diese tragen den vollen Namen in `aria-label` und `title` (sonst hätten sie kompakt
  keinen Namen); reine Textknöpfe wie „Datei“ bekommen kein `tb-text`. Die Leiste bleibt kompakt, bis die volle
  Fassung wieder passt. Eigene Media-Queries für `.tb-text` braucht es dann nicht – anders als die Titelleiste, die
  keinen Überlauf hat und deshalb eine feste Grenze nutzt (siehe „Titelleiste“). Einträge ohne
  Rang (Werkzeuge, Hauptknopf) und „Mehr“ müssen bei der Mindestbreite des Fensters zusammen hineinpassen. Die Leiste nimmt die
  volle Breite ihres Elternelements (wächst oder schrumpft in einer Spalte aber nicht in der Höhe) und braucht keine eigene
  `.toolbar` darum; sie steht in einer Spalte (über der Arbeitsfläche) oder allein in einer Zeile.

```tsx
<Werkzeugleiste
  name="Werkzeugleiste"
  teile={[
    { id: 'datei', inhalt: <MenueKnopf punkte={dateiPunkte}>Datei</MenueKnopf> },
    { id: 'speichern', gruppe: true, inhalt: speichernKnopf },
    { id: 'werkzeuge', gruppe: true, inhalt: werkzeuge },
    { id: 'export', rang: 2, inhalt: exportKnopf, menue: { text: 'Exportieren', symbol: 'export', aktion: direktExportieren, deaktiviert: !bereit, hinweis: grund } },
    { id: 'ansicht', rang: 1, inhalt: <MenueKnopf punkte={ansichtPunkte}>Ansicht</MenueKnopf>, menue: { text: 'Ansicht', unter: ansichtPunkte() } },
    { abstand: true },
    { id: 'haupt', inhalt: <button className="primary">Flächenaufstellung …</button> },
  ]}
  mehr={() => [{ text: 'Vorlagen verwalten …', aktion: vorlagen }]}
/>
```

## Listen

- Hinzufügen-Knöpfe mit `<Symbol name="plus" />` und dem Gegenstand als Text, ohne „+“ als Schriftzeichen.
  Rechenzeichen in Summenzeilen („+ 19 % USt.“) sind keine Knöpfe und bleiben.
- Verb: Für Einträge einer Liste (Positionen, Punkte, Firmen, Merkmale) „hinzufügen“, nicht „neu“ oder „einfügen“.
  Eigenständige Gegenstände wie Projekt, Formular, Ordner oder Datei bleiben bei „Neu“ bzw. „anlegen“ (siehe
  „Begriffe“), ebenfalls mit Symbol `plus` („Neues Projekt anlegen …“).
- Leiste heißt in diesem Abschnitt nur: `.toolbar` und die Kopfzeile eines Abschnitts (`.section-head`) – in einer
  `.section-head` auch dann, wenn der Hinzufügen-Knopf dort der Hauptknopf (`.primary`) ist; in der Werkzeugleiste ist
  er ein Standardknopf (siehe „Knopfstufen“). Dort knapp nur der Gegenstand mit `title` der vollen Aktion, z. B.
  „Mangel“ mit `title` „Mangel hinzufügen“. App-eigene Kopfzeilen gelten nur als Leiste,
  wenn sie `.toolbar` bzw. `.section-head` tragen.
- Keine Leisten sind `.button-row`, `.dialog-buttons`, Seitenleisten und Tabellenzeilen – dort fehlt der Zusammenhang
  einer Werkzeugleiste, der den knappen Text erklärt: dort gleich mit Verb („Beteiligten hinzufügen“).
- Ein `aria-label` enthält den sichtbaren Text wörtlich (sonst trifft Sprachsteuerung den Knopf nicht); geht das nur
  mit Beugung, nur `title` setzen.
- Öffnet der Knopf einen Dialog oder eine Rückfrage, endet er auf „ …“ („Geschoss …“).
- In Auswahllisten (`<option>`) geht kein Symbol: dort als Platzhalter „Firma hinzufügen …“ – mit „ …“, weil die
  eigentliche Wahl erst folgt (Ausnahme zu „Begriffe“).
- Hinweistexte nennen den Knopf so, wie er heißt: „mit ‚Abschnitt‘ beginnen“.
- Ein Menüknopf, der verschiedene Einträge hinzufügt, heißt „Hinzufügen“ mit `<Symbol name="plus" />`; seine Punkte
  tragen nur den Gegenstand („Hinweis“, „Vorbemerkung“, „Aus Vorlage …“), ohne „+“ und ohne eigenes Symbol.
- Gliederungsebenen (einrücken, ausrücken) mit `einruecken` und `ausruecken` – nicht mit Schriftzeichen wie ⇤/⇥ und
  nicht mit `pfeilLinks`/`pfeilRechts`, die sich wie Zurück und Weiter lesen. Umsortieren mit `nachOben`/`nachUnten`,
  Zeilenaktionen mit `mehr`.
- Symbolknöpfe ohne Text (in Zeilen wie in Leisten) brauchen `aria-label` und `title` mit Gegenstand („Position
  einrücken“).

## Fläche und Karten

Das Layout aller Apps (Richtung C): Unter der Werkzeugleiste liegt eine ruhige **Fläche** (`--bg`); Seitenleisten,
Hauptbereich und Zeichenfläche stehen darauf als **Karten** mit weichem Schatten und 8 px Spalt (`--spalt`). Die
Werkzeugleiste liegt mit auf der Fläche (gleicher Grund, keine Linie). Bausteine in `ui/Karte.tsx`:

- `Flaeche` (`.flaeche`): Karten nebeneinander mit Spalt und Innenabstand `--spalt`; sie scrollt nie.
- `Karte` (`.karte`): Kopf (`.karte-kopf`, Überschrift `h2` in `--fs-l`, direkt dahinter `hilfe` für das „?“
  (`HilfeKnopf`), rechts `aktionen` wie Umschalter oder „Hinzufügen“), darunter der Inhalt (`.karte-rumpf`), der **in
  der Karte** scrollt, wahlweise eine feste Fußzeile (`fuss`, Summen). Mit Titel ist die Karte ein benannter Bereich
  (`aria-labelledby` auf das `h2`); die Hilfe steht außerhalb des `h2` und gehört nicht zum Namen. Ohne sichtbaren Titel
  braucht die Karte `ariaLabel`. Der Inhalt beginnt und endet immer im Abstand des Rumpfs, gleich ob vorn ein `p`, eine
  Liste oder ein `h3` steht (Außenabstand des ersten und letzten Kindes entfällt). `buendig` lässt Tabellen und Listen
  bis an den Rand laufen; Fokusrahmen liegen dort innen. Breite Tabellen scrollen mit dem Inhalt der Karte, sie laufen
  nie aus ihr heraus. Der Rumpf ist positioniert: absolut gesetzte Elemente darin bleiben in seinem Rollbereich.
  Klappmenüs, Vorschlagslisten und Hinweise, die über die Karte hinausragen sollen, deshalb als Portal bzw. mit
  `position: fixed` ausführen. Bündelt eine Karte ohne Kopf mehrere Themen (z. B. Projekt, Geschosse, Flächen), bekommt
  sie `abschnitte`: je Thema ein `<section>` direkt im Rumpf mit `h2` (wie die Kopfüberschrift, `--fs-l`), Trennlinien
  bis an den Rand, in einer `.section-head` mit Knopf ohne eigenen Abstand. Innenabstand waagerecht `--karte-pad` (14px,
  aus der gewählten Vorschau), Kopfhöhe `--karte-kopf-h` (ein Knopf in `--ctl-h` mit `--s2` darüber und darunter),
  Fußzeile in `--ctl-h`.
- `FlaechenSpalte` (`.flaechen-spalte`): mehrere Karten untereinander (z. B. „Geschoss“ über „Auswertung“), sie teilen
  sich die Höhe; `wachsend` lässt die Spalte die Restbreite nehmen. Eine kurze Karte unter einer langen bekommt
  `hoehe="inhalt"`: Sie ist so hoch wie ihr Inhalt (höchstens die halbe Spalte, darüber scrollt sie), die übrigen Karten
  teilen sich den Rest. Mehrere Inhaltskarten in einer Spalte sind erlaubt; die teilende Karte zeigt dann immer
  mindestens ihren Kopf und einige Zeilen (Mindesthöhe `--karte-kopf-h` + 6 × `--s4`), notfalls scrollen die
  Inhaltskarten (ihr Kopf bleibt stehen). `hoehe` wirkt nur in einer `FlaechenSpalte`, nicht in einer `BreitenLeiste`
  oder direkt auf der Fläche. Nur für Karten mit weitgehend festem Inhalt – wächst der Inhalt (Aufklappen, Bild lädt),
  springt die Höhe der Nachbarkarte mit.
- `ZeichenKarte` (`.zeichen-karte`): Die Zeichenfläche füllt die Karte und bleibt hell (`.canvas`); Bedienhinweis,
  Koordinaten und Maßstab stehen in der Fußzeile der Karte, nicht über dem Plan: aus `fuss` oder, wenn sie tief in der
  Zeichenkomponente entstehen, über `ZeichenFussInhalt` (Portal in die Fußzeile der umgebenden Karte). Ohne Inhalt
  bleibt die Fußzeile unsichtbar; was über `ZeichenFussInhalt` kommt, bleibt deshalb dauerhaft eingehängt (Koordinaten
  außerhalb des Plans als „–“, nicht ausgehängt), sonst springt die Höhe der Zeichenfläche. Je Fußzeile möglichst nur
  eine Einhängung: mehrere stehen in der Reihenfolge des Einhängens. `als="main"`, wenn die Zeichenfläche der
  Hauptbereich der App ist – je Fenster nur ein `main`, die App legt dann kein eigenes `<main>` um die Fläche. Kopf wie
  bei `Karte` (`titel`, `aktionen`), meist ohne – die Werkzeuge stehen in der Werkzeugleiste.
- Seitenkarten mit ziehbarer Breite: `BreitenLeiste` mit einer `Karte` (oder `FlaechenSpalte`) als Kind; auf der Fläche
  liegt der Griff im Spalt (Linie beim Überfahren in voller Akzentfarbe, weil der Spalt sonst keinen Rand zeigt), und
  Innenabstand und Spalt zählen bei der Höchstbreite mit.
- **Schmale Fenster:** Die Fläche scrollt nie. Fehlt Platz, geben zuerst die Seitenkarten bis zu ihrer Mindestbreite
  (`--leiste-min`, 180px) nach, solange die Mitte (eine `Karte` direkt auf der Fläche oder eine wachsende Spalte) unter
  ihrer Wunschbreite `--karte-mitte-wunsch` (480px) bliebe; erst dann schrumpft die Mitte bis `--karte-mitte-min`
  (280px). Breiter ziehen lässt sich eine Seitenkarte auf der Fläche nur, solange der Mitte die Wunschbreite bleibt
  (oder `mitteMin`, wenn größer). Die gemerkte Breite bleibt und gilt wieder, sobald Platz ist. Das gilt auch für eine
  Seitenspalte (`FlaechenSpalte` ohne `wachsend`). Unter der Summe der Mindestbreiten (zwei Seitenkarten und Mitte, rund
  670px) wird abgeschnitten – für Desktop-Fenster vertretbar.

Die alten Muster (`.workspace`, `.sidebar`, eigene Spalten-Layouts der Apps) laufen weiter, bis eine App umgestellt
ist (`docs/nachziehen/`). Eigene Layout-CSS und feste Farben der Apps entfallen mit der Umstellung. Ausgenommen ist die
Rahmen-App Arkly: Sie hat keine Arbeitsfläche, sondern Tableiste und Startseite; ihre Seiten zeigen die Apps, die selbst
auf Karten stehen.

## Seitenleisten

`BreitenLeiste` (`ui/Leiste.tsx`) mit gemerkter, ziehbarer Breite. Der Griff sitzt am Rand zur Arbeitsfläche: links
stehende Leiste (Vorgabe) rechts, rechts stehende Leiste mit `seite="rechts"` links. Tastatur ←/→ bewegen den Griff,
Doppelklick setzt die Vorgabe. Keine eigenen Leisten-Komponenten je App. Auf einer `Flaeche` ist die Leiste eine
Seitenkarte (siehe „Fläche und Karten“).

## Meldungen im Inhalt

`.meldung` (neutral, leicht im Akzent getönt, damit sie sich von Eingabefeldern abhebt) mit `.ok`, `.warnung` oder
`.fehler` für Meldungen in Dialogen und Seitenleisten; `role="status"`
für Rückmeldungen, `role="alert"` für Fehler. `.warning` bleibt als Hinweis in Warnfarben.

**Hinweis nach einer Aktion** (`zeigeHinweis`, z. B. „Gespeichert unter …“ nach dem direkten Export):

- **Aussehen:** unten rechts im Fenster, Abstand `var(--s4)` zum Rand und oberhalb einer Statusleiste, Breite
  höchstens `min(28rem, 100vw - 2 * var(--s4))`; eine App mit Statusleiste hebt ihn über `--hinweis-unten`.
  `.meldung.ok`, bei Warnungen `.meldung.warnung`, bei einem Fehler `.meldung.fehler`. Darin der Text (ein Pfad bricht
  um statt abzuschneiden), höchstens zwei Aktionen und ein Symbolknopf `schliessen` mit `aria-label`/`title` „Hinweis
  schließen“ (mindestens `--ctl-h-s`).
- **Aktionen:** nach dem Inhalt benannt, z. B. „Ordner öffnen“; „Prüfhinweise …“ erscheint nur, wenn es welche gibt,
  und öffnet die Liste in einem `Modal`; der Hinweis bleibt dabei stehen, damit der Dialog den Fokus an den Knopf
  zurückgeben kann und „Ordner öffnen“ erreichbar bleibt. Abschließende Aktionen wie „Ordner öffnen“ schließen ihn
  (`schliesst: true`).
- **Dauer:** Er hält nichts auf, nimmt keinen Fokus und verschwindet nicht von selbst (WCAG 2.2.1). Er bleibt, bis man
  ihn schließt oder ein neuer Hinweis mit demselben Schlüssel (`id`, z. B. `'export'`) ihn ersetzt; der neue Text wird
  wieder angesagt.
- **Stapel:** Verschiedene Hinweise stapeln sich, der neueste unten. Ab dem vierten fällt der älteste weg, aber nie
  einer, in dem gerade der Fokus steht. Ist das Fenster zu niedrig, wird der Stapel in sich scrollbar; er verdeckt
  höchstens die untere rechte Ecke, nie das fokussierte Element (WCAG 2.4.11): Liegt es darunter, wird es per
  `scrollIntoView` über den Stapel geschoben, und geht das nicht, weicht der Stapel nach links unten aus. Der Stapel
  ist ein Bereich mit Namen (`role="region"`, `aria-label` „Hinweise“) und immer im DOM; darin sagen zwei stets
  vorhandene Live-Regionen jeden neuen Hinweis an (`role="status"`, bei einem Fehler `role="alert"`).
- **Tastatur:** F6 springt in den neuesten Hinweis (ohne Hinweis tut F6 nichts), F6 im Hinweis wieder zurück; Tab und
  Umschalt+Tab gehen durch die Knöpfe aller Hinweise des Stapels. Esc springt nur zurück an das zuvor fokussierte
  Element (ersatzweise den Hauptbereich) und schließt den Hinweis nicht – anders als in Dialogen und Menüs; zum
  Schließen dient der Knopf. Schließt man einen Hinweis mit Fokus, geht der Fokus an den nächsten Hinweis im Stapel,
  sonst zurück wie bei Esc. Ersetzt ein neuer Hinweis einen fokussierten, bleibt der Fokus im neuen. Hat eine App
  schon einen F6-Kreis zwischen ihren Bereichen (LEXIO), nimmt sie den Stapel mit `hinweisFokussieren()` als letzte
  Station auf (sie liefert `false`, wenn kein Hinweis da ist; dann wird die Station übersprungen).

Baustein: `ui/Hinweis.tsx` – `zeigeHinweis({ id, art, text, pfad, aktionen })` liefert die id, `schliesseHinweis(id)`
schließt ihn; der Stapel (`HinweisHost`) steckt in der Titelleiste, also in jeder App. Solange ein Dialog offen ist,
lässt er F6 und den Fokus in Ruhe. Während eine Aktion läuft, ist ihr Knopf mit `aria-disabled` gesperrt (er behält den
Fokus); scheitert sie, ersetzt ein Fehler-Hinweis den alten. Apps mit eigenem F6-Kreis rufen beim Start
`hinweisF6Eigen()` und nehmen den Stapel mit `hinweisFokussieren()` auf. `--hinweis-unten` (Vorgabe `0px`) hebt den
Stapel über eine Statusleiste. Texte nur für Vorleseprogramme tragen die gemeinsame Klasse `.nur-vorlesen`.

**Statuspunkt (Ampel):** `<span class="statuspunkt ok"></span> gilt` (bzw. `.warnung`, `.fehler`) – ein Punkt (10px,
Abstand zum Wort per Leerzeichen bzw. `gap: var(--s1)`) in
`--ok-punkt`, `--warn-punkt` oder `--fehler-punkt` mit dunklem Saum, immer neben dem Wort, nie allein (Gelb hat auf
hellem Grund nur 2,2 : 1). Der Text daneben in `--ok-text` usw. bzw. `--text`.

## Meldungen auf der Zeichenfläche

- `.canvas-message` ist eine Warnung oben mittig (Warnfarben).
- `.canvas-message.ok` (Erfolg) und `.canvas-message.info` (neutral, Text in `--text`) als weitere Varianten.
- `.canvas-message.leer` ist ein Leerzustand mittig auf der Fläche, neutral („Foto hinzufügen …“).
- Die Hand als Mauszeiger nur, wenn die Meldung per Klick schließt: `.canvas-message.klickbar` oder mit `title`.

## Titelleiste

Die Titelleiste steht in der Kachelfarbe der App (`--app`, siehe „App-Farbe“) mit heller Schrift; darin sind der
Fokusrahmen weiß, der Punkt für ungespeicherte Änderungen hellgelb, Update-Knopf und Warnung zum Speicherort Bernstein
mit dunkler Schrift und die Fehlermarke am Menüknopf mit weißem Saum. Dialoge, die aus der Leiste kommen (Update,
Berechnungsregeln), behalten die Farben des Schemas. Links Symbol und Name
der App, „Projekte“ und das geöffnete Projekt (mit dem Punkt ● für ungespeicherte Änderungen).
Rechts nur, was gerade zählt – Version bzw. Update, im Notbetrieb die Warnung zum Speicherort –, dann das Menü der
Titelleiste und die Fensterknöpfe. Das Menü heißt in den Apps „Darstellung und Hilfe“ (Symbol `menue`, drei Striche;
Name in `ariaLabel` und `title`), damit es sich vom „Mehr“ der Werkzeugleiste darunter unterscheidet; „Einstellungen …“
steht in „Datei“, nicht hier (siehe „Doppelte Einstiege vermeiden“). Es enthält, in dieser Reihenfolge: solange ein
Update bereitliegt „Update auf ‹Version› …“ mit Trenner (`updatePunkt`) – zusätzlich zur Anzeige rechts in der
Titelleiste, damit man es auch dort findet, wo die seltenen Befehle stehen (bewusste Ausnahme von „Doppelte Einstiege
vermeiden“); dann „Farbschema“ (aktuelle Wahl als Hinweis; Untermenü mit Auto/Hell/Dunkel als Einfachauswahl und, wenn
die App eine Zeichenfläche hat, dem Schalter „Zeichenfläche im dunklen Schema abdunkeln“ – `farbschemaPunkt`, Untermenü
`farbschemaPunkte`), im herausgelösten Fenster „Andocken“, Trenner, „Berechnungsregeln …“ (F1) und „Fehlerprotokoll …“.
Neue Fehler zählt eine Marke am Menüknopf, ebenso sein Name („Darstellung und Hilfe – 2 neue Fehler im Fehlerprotokoll“)
und der Hinweis am Punkt („2 neue“). Der Speicherort der Einstellungen steht im Einstellungsdialog (Seite „Allgemein“);
sichtbar in der Titelleiste bleibt nur die Warnung im Notbetrieb, sie öffnet den Dialog auf dieser Seite. Das Farbschema
bleibt nur hier (schneller Wechsel, keine Kopie im Dialog). Die Kopfleiste von Arkly hat kein „Datei“: Ihr Menü heißt
weiter „Einstellungen und Hilfe“ und beginnt nach dem Update-Punkt mit „Einstellungen …“ (Strg+,), dann Farbschema und
Fehlerprotokoll, ohne „Berechnungsregeln …“. Unter 960px Fensterbreite (feste Grenze, weil die Titelleiste keinen
Überlauf hat; die Werkzeugleiste regelt das selbst, siehe „Kopf- und Werkzeugleisten“) zeigen Knöpfe mit Symbol nur noch
das Symbol: Text in `<span className="titlebar-text">`, der Name bleibt über `aria-label`. Die Tableiste von Arkly zeigt
unter 1100px am Tab nur Symbol und Namen der App (das Projekt steht im Tooltip); eine Fläche zum Ziehen des Fensters
bleibt immer frei.

## Ungespeicherte Änderungen

Der Knopf „Speichern“ in der Werkzeugleiste bekommt bei ungespeicherten Änderungen die Klasse `ungespeichert`: ein
Punkt (8px, `--sel` mit Rand in `--text`) außen an der oberen rechten Ecke, der die Breite der Leiste nicht ändert.
Dazu sagt es der Knopf im `aria-label` („Speichern – ungespeicherte Änderungen“) und im `title`. Der Punkt ● hinter dem
Namen in der Titelleiste (`TitleBar`, Feld `dirty`) bleibt davon unberührt.

Vor einer Aktion, die das Projekt verlässt (Öffnen, Neu, Tab schließen, Beenden, Herauslösen oder Andocken, Neustart für
ein Update), fragt `aenderungenSpeichern` „Änderungen an ‚`Name`‘ speichern?“ (im Dialog mit einfachen Anführungszeichen
um den Namen) – in den Apps mit dem Projekt- oder Dateinamen, im Rahmen Arkly mit „`App – Projekt`“ – und bietet
Abbrechen | Nicht speichern | Speichern. „Nicht speichern“ ist hier bewusst kein Gefahr-Knopf; Erstfokus und Enter
liegen auf „Speichern“. Darunter steht eine Aussage, keine zweite Frage, die sagt, was ungespeichert ist: „`Gegenstand`
hat (bzw. haben) ungespeicherte Änderungen.“ – ein kurzer, ganzer Satz mit Punkt, der Gegenstand in Nutzersprache mit
Artikel („Das LV …“, „Das Formular …“, „Die Ordnerstruktur …“, „Die Angaben haben …“), ohne weitere Erklärung. Ohne
eigenen Satz gilt „Das Projekt hat ungespeicherte Änderungen.“ Hat die Aktion eine weitere Folge, darf ein Satz dazu
davorstehen (Herauslösen: „Beim Herauslösen startet die App neu.“). Meint „ungespeichert“ nur einen Teil des Projekts
(FABRIO: nur das LV), setzt die App den Satz an der `TitleBar` (Eigenschaft `ungespeichert`) und als dritten Parameter
ihrer eigenen Aufrufe von `aenderungenSpeichern(name, speichern, satz)`, damit alle ihre Wege gleich lauten.

Kann die App gerade nicht speichern (keine Speicherfunktion `onSpeichern` an der `TitleBar`, z. B. LEXIO ohne
Projektdatei), fragt `aenderungenVerwerfen` „Änderungen an ‚`Name`‘ verwerfen?“ mit Abbrechen | „Verwerfen und
`Verb`“. „Verwerfen …“ ist ein Gefahr-Knopf, Erstfokus und Enter liegen auf „Abbrechen“. Verb und Satz darunter (der
Verlust als Aussage) je Aktion:

| Aktion                                                  | Knopf                                                  | Satz darunter                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Tab schließen                                           | „Verwerfen und schließen“                              | „Die Änderungen gehen beim Schließen verloren.“                               |
| Beenden                                                 | „Verwerfen und beenden“                                | „Die Änderungen gehen beim Beenden verloren.“                                 |
| Neustart (Update)                                       | „Verwerfen und neu starten“                            | „Die Änderungen gehen beim Neustart für das Update verloren.“                 |
| Herauslösen                                             | „Verwerfen und herauslösen“                            | „Beim Herauslösen startet die App neu, die Änderungen gehen verloren.“        |
| Andocken                                                | „Verwerfen und andocken“                               | „Beim Andocken startet die App neu, die Änderungen gehen verloren.“           |
| Öffnen, Neu (App)                                       | „Verwerfen und öffnen“ bzw. „Verwerfen und fortfahren“ | „Die Änderungen gehen verloren.“                                              |
| Einstellungen schließen (Esc, Abbrechen, Klick daneben) | „Verwerfen und schließen“                              | „Die Änderungen an den Einstellungen gehen verloren.“ (Name: „Einstellungen“) |

Geht beim Herauslösen oder Andocken nichts verloren (die App behält ungespeicherte Änderungen als Zwischenstand), fragt
sie nicht nach dem Speichern, sondern „`App` herauslösen?“ mit „Beim Herauslösen startet die App neu. Ungespeicherte
Änderungen bleiben als Zwischenstand erhalten.“ und Abbrechen | Herauslösen bzw. „`App` andocken?“ mit „Beim Andocken
startet die App neu. Ungespeicherte Änderungen bleiben als Zwischenstand erhalten.“ und Abbrechen | Andocken.
„Herauslösen“ bzw. „Andocken“ ist der Hauptknopf (Erstfokus, Enter). PERMIO erklärt dort zusätzlich, was mit Entwurf
und Dokumenten geschieht.

## Richtig und falsch

| Richtig                                                                                                | Falsch                                                         |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Abstände und Schriftgrade aus der Skala (`var(--s2)`, `var(--fs-s)`)                                   | freie Werte wie `margin: 7px`, `font-size: 12.5px`             |
| Farben über Variablen (`var(--muted)`, `var(--warn-bg)`)                                               | feste Farben (`#888`, `orange`) in App-CSS                     |
| `:focus-visible` mit sichtbarem Rahmen                                                                 | `outline: none` ohne Ersatz                                    |
| Überschriften in Satzschreibung                                                                        | Versalien mit Sperrung (`text-transform: uppercase`)           |
| Symbole als SVG, mit `aria-label` am Knopf                                                             | Schriftzeichen wie ◐ ◂ 📏 als einziges Erkennungsmerkmal       |
| gemeinsame Klassen (`.field`, `.toolbar`, `.canvas-message`)                                           | App-eigene Kopien mit leicht anderen Abständen                 |
| `--sel-foto` mit hellem und dunklem Saum                                                               | Magenta-Linie allein auf dem Foto                              |
| Enter übernimmt und verlässt das Feld; Esc verwirft eine Eingabe, ohne Eingabe schließt Esc den Dialog | Esc muss zweimal gedrückt werden, um einen Dialog zu schließen |

## Was die Apps nachziehen

Je App eine Datei in [`docs/nachziehen/`](nachziehen/) (`quadrio.md`, `terrio.md`, `numio.md`, `atlas.md`,
`rectio.md`, `permio.md`, `fabrio.md`, `lexio.md`, `arkly.md`). Neue Punkte trägt das Designsystem dort ein, die App löscht erledigte
Punkte in ihrem eigenen PR (löschen, nicht abhaken). Diese Richtlinie ändert sich dafür nicht – so kommen sich
App-PRs und Designsystem nicht in die Quere.
