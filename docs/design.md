# Designrichtlinie

Gemeinsame Regeln für die Oberfläche aller Apps der Suite Arkly. Grundlage ist `packages/core/src/ui/base.css`;
App-eigenes steht in `apps/<app>/src/styles.css`. An dieser Richtlinie messen sich die App-Sitzungen und der
Review-Agent `review-design`.

> Stand: Grundlagen (Skalen, Fokus, Zielgrößen, Überschriften, Meldungen) und gemeinsame Komponenten (Dialoge,
> Druckvorschau, Felder, Umschalter), Aufbau der Kopf- und Werkzeugleisten. Die Gestaltungsrichtung (Farben,
> Knopfstufen, Aussehen der Werkzeugleiste, Tabellen) folgt nach der Wahl des Nutzers und wird hier ergänzt.

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

| Variable  | Wert | Verwendung                                             |
| --------- | ---- | ------------------------------------------------------ |
| `--fs-xs` | 11px | Feldbeschriftung, Hinweis unter dem Feld, Tabellenkopf |
| `--fs-s`  | 12px | Nebentext, kleine Knöpfe, dichte Tabellen              |
| `--fs-m`  | 13px | Grundschrift, Abschnittsüberschrift (`.sidebar h2`)    |
| `--fs-l`  | 15px | Dialogtitel, Titel einer Spalte ohne `.sidebar`        |
| `--fs-xl` | 18px | Seitentitel (Einstieg, Bericht), Kennzahl              |

Weitere: `--radius-s` 4px (Felder, Knöpfe), `--radius` 6px (Dialoge, Karten), `--ctl-h` 28px und `--ctl-h-s` 24px
(Höhe der Bedienelemente).

Zahlen in Tabellen und Feldern stehen rechtsbündig in Tabellenziffern (`.num`, `input.num`).

## Überschriften

- **Seitenleiste und Spalten:** `h2` in Satzschreibung, `--fs-m`, halbfett, Farbe `--text`. Keine Versalien – sie lesen
  sich langsamer, besonders bei langen Titeln.
- **Unterabschnitt:** `h3`, `--fs-s`, halbfett.
- Überschriften nicht über die Browser-Vorgabe laufen lassen (ein `h2` ohne Regel wird 22px groß). Wer Spalten ohne
  `.sidebar` baut, setzt die Größe aus der Skala.

## Fokus und Tastatur

- `base.css` zeigt bei Tastaturbedienung an allen Knöpfen, Links, `summary`, Kästchen, Optionsfeldern, Reglern und
  fokussierbaren Elementen einen Rahmen in `--fokus` (2px, 2px Abstand). Bei Mausbedienung erscheint er nicht
  (`:focus-visible`).
- Der Abstand trennt **Fokus** von **aktiv**: Ein aktiver Knopf hat einen Rand in `--accent` direkt am Knopf, der
  Fokusrahmen steht 2px davon ab.
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
  `.toolbar` und `.field` sind mindestens `--ctl-h` (28px) hoch, `button.small` und `button.icon` dort `--ctl-h-s` (24px).
- Die Regel hat die Spezifität null (`:where`): Eine App-Regel mit eigener `min-height` geht vor. Feste `height`
  allein reicht dafür nicht; wer kleinere Knöpfe braucht, setzt `min-height` mit.
- Kleiner als 24px nur, wo es nicht anders geht (Hilfe-Knopf „?“, Griffe auf der Zeichenfläche).

## Farben

| Variable                           | Bedeutung                                                                                                       |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `--bg`, `--panel`                  | Fensterhintergrund, Flächen (Leisten, Dialoge)                                                                  |
| `--text`, `--muted`                | Text, Nebentext (`--muted` hält auch auf Tönungen und `--bg` mindestens 4,5 : 1)                                |
| `--border`, `--line-soft`          | Linien, feine Trennlinien in Tabellen                                                                           |
| `--accent`, `--accent-soft`        | Akzent (aktive Werkzeuge, primärer Knopf, Links), Tönung                                                        |
| `--accent-text`                    | Akzent als Schrift auf getönten Flächen (aktive Knöpfe, Chips) – mindestens 4,5:1                               |
| `--ok-*`, `--warn-*`, `--fehler-*` | Status: eingehalten, prüfen, überschritten/Fehler; `--ok-punkt` usw. für Statuspunkte (Ampel)                   |
| `--sel`                            | Auswahl auf Plänen (Orange); auch ungespeicherte Änderungen (Punkt in Titelleiste und an „Speichern“)           |
| `--sel-foto`                       | Auswahl auf Fotos (Magenta, in beiden Schemata gleich) – Orange kollidiert dort mit Mess- und Markierungsfarben |
| `--danger`                         | zerstörende Aktionen (Löschen)                                                                                  |

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
`aria-pressed="true"` in Akzent-Tönung. Höhe 24px, in `.toolbar` 28px wie die übrigen Knöpfe dort; der Rahmen des
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
  Menü der Titelleiste („Einstellungen und Hilfe“).
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
Richtwert: höchstens sieben, besser fünf Knöpfe bzw. Gruppen je Leiste; „Datei“ und „Speichern“ zählen mit, die
Werkzeuge als eine Gruppe, „Mehr“ nicht. Status- und Hinweismarken (Warnungen, Module) gehören nicht ins Menü – sie
bleiben sichtbar, solange sie etwas melden.

**Ins Menü** kommen seltene und einmalige Befehle: Import und Export, Vorlagen, Einstellungen, Protokoll, Hilfe,
Zurücksetzen, Sonderfunktionen. Feste Namen, in allen Apps gleich:

| Menü          | Inhalt                                                                                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| „Datei“       | Neu, Öffnen …, Speichern unter …, Import … bzw. Aktualisieren …, Drucken … (wenn es nicht der Hauptknopf ist) – nur bei mindestens zwei Dateibefehlen, sonst stehen sie in „Mehr“ |
| „Exportieren“ | CSV …, Excel …, weitere Ausgabeformate neben dem Hauptknopf                                                                                                                       |
| „Ansicht“     | Schalter der Darstellung (`haken`: Raster, Beschriftung) und Einfachauswahl (`gewaehlt`)                                                                                          |
| „Hinzufügen“  | Varianten eines Eintrags (siehe „Listen“); der häufigste bleibt daneben als eigener Knopf                                                                                         |
| „Mehr“        | alles Übrige, als letztes Element der Leiste                                                                                                                                      |

- Weitere sprechende Menünamen („Unterlage“, „Einrichtung“, „LV“) nur für eine Gruppe von mindestens drei
  zusammengehörigen Befehlen. Menüknöpfe zum selben Gegenstand zusammenlegen („Neues LV ▾“ und „LV ▾“ → „LV ▾“).
  Keine geteilten Knöpfe (Befehl plus Pfeil in einem): Hauptbefehl als Knopf, Varianten im Menü daneben – etwa
  „Position“ (mit Symbol `plus`) und „Hinzufügen ▾“ mit Kostenrisiko und Gliederung.
- Menüknöpfe tragen Text und Aufklapp-Pfeil (`MenueKnopf`), „Mehr“ nur das Symbol `mehr` (`className="icon"`,
  `pfeil={false}`, `ariaLabel="Mehr"`, `title` „Mehr – weitere Befehle“).
- Schaltet ein Menü zwischen Ansichten um (ATLAS: „Einrichtung“ mit Struktur, Vorlagen, Einstellungen), zeigt der
  Menüknopf mit `.active`, dass eine seiner Ansichten offen ist, und nennt sie im Namen (`ariaLabel` und `title`
  „Einrichtung: Vorlagen“); im Menü ist sie `gewaehlt`.
- Reihenfolge im Menü: Schalter und Einfachauswahl, dann Befehle, Gefahr-Punkte (Zurücksetzen, Entfernen) am Ende
  hinter einem Trenner. Tastenkürzel in `tasten`, Punkte mit Dialog auf „ …“ (siehe „Menüs“ und „Begriffe“).
- Doppelte Einstiege vermeiden: Steht ein Befehl schon an naheliegender Stelle (Listenkopf, Seitenleiste), fällt sein
  Einstieg in der Leiste weg (NUMIO: Kennwertkatalog). Bewusste Ausnahme: der Update-Punkt im Menü der Titelleiste
  (siehe „Titelleiste“).
- **Aufbau:** links „Datei“ und „Speichern“, in der Mitte die Werkzeuge bzw. Hauptschritte, rechts der Hauptknopf,
  zuletzt „Mehr“.
- **Zeilen:** Seltene Aktionen einer Tabellen- oder Listenzeile (FABRIO-Rechnung: Deckblatt, Mail an den Zahler)
  kommen in den Zeilenknopf „Aktionen“ (Symbol `mehr`, siehe „Menüs“ und „Listen“); häufige bleiben als Knopf.
- **Schmale Fenster:** Einträge mit Rang wandern nach ihrem Rang ins Menü „Mehr“ (Überlauf), statt nur auf Symbole zu
  schrumpfen. Dafür `Werkzeugleiste` (`ui/Werkzeugleiste.tsx`): `teile` in Leistenreihenfolge, je Eintrag `inhalt`
  (ein Knopf oder mehrere), `gruppe` (Trennstrich zum nächsten Eintrag), `menue` (dasselbe als Menüpunkt bzw.
  Punkte) und `rang` (höher = wandert früher); `{ abstand: true }` schiebt den Rest nach rechts; `mehr` liefert die
  festen Punkte des Menüs „Mehr“, `name` benennt die Leiste. Ohne `rang` oder `menue` bleibt ein Eintrag immer
  sichtbar – so der Hauptknopf und die Werkzeuge. Übergelaufene Einträge stehen in „Mehr“ oben, in ihrer Reihenfolge,
  getrennt von den festen Punkten; hatte ein übergelaufener Knopf den Fokus, bekommt ihn „Mehr“. Die Leiste nimmt die
  volle Breite ihres Elternelements (wächst in der Spalte von `.app` aber nicht in die Höhe) und braucht keine eigene
  `.toolbar` darum.

```tsx
<Werkzeugleiste
  name="Werkzeugleiste"
  teile={[
    { id: 'datei', inhalt: <MenueKnopf punkte={dateiPunkte}>Datei</MenueKnopf> },
    { id: 'speichern', gruppe: true, inhalt: speichernKnopf },
    { id: 'werkzeuge', gruppe: true, inhalt: werkzeuge },
    { id: 'export', rang: 2, inhalt: <MenueKnopf punkte={exportPunkte}>Exportieren</MenueKnopf>, menue: { text: 'Exportieren', unter: exportPunkte() } },
    { id: 'ansicht', rang: 1, inhalt: <MenueKnopf punkte={ansichtPunkte}>Ansicht</MenueKnopf>, menue: { text: 'Ansicht', unter: ansichtPunkte() } },
    { abstand: true },
    { id: 'haupt', inhalt: <button className="primary">Flächenaufstellung …</button> },
  ]}
  mehr={() => [{ text: 'Einstellungen …', aktion: einstellungen }]}
/>
```

## Listen

- Hinzufügen-Knöpfe mit `<Symbol name="plus" />` und dem Gegenstand als Text, ohne „+“ als Schriftzeichen.
  Rechenzeichen in Summenzeilen („+ 19 % USt.“) sind keine Knöpfe und bleiben.
- Verb: Für Einträge einer Liste (Positionen, Punkte, Firmen, Merkmale) „hinzufügen“, nicht „neu“ oder „einfügen“.
  Eigenständige Gegenstände wie Projekt, Formular, Ordner oder Datei bleiben bei „Neu“ bzw. „anlegen“ (siehe
  „Begriffe“), ebenfalls mit Symbol `plus` („Neues Projekt anlegen …“).
- Leiste heißt in diesem Abschnitt nur: `.toolbar` und die Kopfzeile eines Abschnitts (`.section-head`) – auch wenn
  der Hinzufügen-Knopf dort der Hauptknopf (`.primary`) ist. Dort knapp nur der Gegenstand mit `title` der vollen
  Aktion, z. B. „Mangel“ mit `title` „Mangel hinzufügen“. App-eigene Kopfzeilen gelten nur als Leiste,
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

## Seitenleisten

`BreitenLeiste` (`ui/Leiste.tsx`) mit gemerkter, ziehbarer Breite. Der Griff sitzt am Rand zur Arbeitsfläche: links
stehende Leiste (Vorgabe) rechts, rechts stehende Leiste mit `seite="rechts"` links. Tastatur ←/→ bewegen den Griff,
Doppelklick setzt die Vorgabe. Keine eigenen Leisten-Komponenten je App.

## Meldungen im Inhalt

`.meldung` (neutral, leicht im Akzent getönt, damit sie sich von Eingabefeldern abhebt) mit `.ok`, `.warnung` oder
`.fehler` für Meldungen in Dialogen und Seitenleisten; `role="status"`
für Rückmeldungen, `role="alert"` für Fehler. `.warning` bleibt als Hinweis in Warnfarben.

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

Links Symbol und Name der App, „Projekte“ und das geöffnete Projekt (mit dem Punkt ● für ungespeicherte Änderungen).
Rechts nur, was gerade zählt – Version bzw. Update, im Notbetrieb die Warnung zum Speicherort –, dann das Menü der
Titelleiste und die Fensterknöpfe. Das Menü heißt „Einstellungen und Hilfe“ (Symbol `menue`, drei Striche; Name in
`ariaLabel` und `title`), damit es sich vom „Mehr“ der Werkzeugleiste darunter unterscheidet. Es enthält, in dieser
Reihenfolge: solange ein Update bereitliegt „Update auf ‹Version› …“ mit Trenner (`updatePunkt`) – zusätzlich zur
Anzeige rechts in der Titelleiste, damit man es auch dort findet, wo die seltenen Befehle stehen (bewusste Ausnahme von
„Doppelte Einstiege vermeiden“); dann „Farbschema“ (aktuelle Wahl als Hinweis; Untermenü mit Auto/Hell/Dunkel als Einfachauswahl und, wenn
die App eine Zeichenfläche hat, dem Schalter „Zeichenfläche im dunklen Schema abdunkeln“ – `farbschemaPunkte`),
„Speicherort der Einstellungen …“ (Einzelplatz bzw. Netzwerk als Hinweis – `speicherortPunkt`), im herausgelösten
Fenster „Andocken“, Trenner, „Berechnungsregeln …“ (F1) und „Fehlerprotokoll …“. Neue Fehler zählt eine Marke am
Menüknopf, ebenso sein Name („Einstellungen und Hilfe – 2 neue Fehler im Fehlerprotokoll“) und der Hinweis am Punkt
(„2 neue“). Die Kopfleiste von Arkly folgt derselben Regel (Menü mit Update, Farbschema, Speicherort und
Fehlerprotokoll, ohne „Berechnungsregeln …“). Unter 960px Fensterbreite zeigen Knöpfe mit Symbol nur noch das Symbol: Text in
`<span className="titlebar-text">`, der Name bleibt über `aria-label`. Die Tableiste von Arkly zeigt
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

| Aktion            | Knopf                                                  | Satz darunter                                                          |
| ----------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| Tab schließen     | „Verwerfen und schließen“                              | „Die Änderungen gehen beim Schließen verloren.“                        |
| Beenden           | „Verwerfen und beenden“                                | „Die Änderungen gehen beim Beenden verloren.“                          |
| Neustart (Update) | „Verwerfen und neu starten“                            | „Die Änderungen gehen beim Neustart für das Update verloren.“          |
| Herauslösen       | „Verwerfen und herauslösen“                            | „Beim Herauslösen startet die App neu, die Änderungen gehen verloren.“ |
| Andocken          | „Verwerfen und andocken“                               | „Beim Andocken startet die App neu, die Änderungen gehen verloren.“    |
| Öffnen, Neu (App) | „Verwerfen und öffnen“ bzw. „Verwerfen und fortfahren“ | „Die Änderungen gehen verloren.“                                       |

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
