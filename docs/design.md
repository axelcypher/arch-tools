# Designrichtlinie

Gemeinsame Regeln für die Oberfläche aller Apps der Suite Arkly. Grundlage ist `packages/core/src/ui/base.css`;
App-eigenes steht in `apps/<app>/src/styles.css`. An dieser Richtlinie messen sich die App-Sitzungen und der
Review-Agent `review-design`.

> Stand: Grundlagen (Skalen, Fokus, Zielgrößen, Überschriften, Meldungen) und gemeinsame Komponenten (Dialoge,
> Druckvorschau, Felder, Umschalter). Die Gestaltungsrichtung (Farben, Knopfstufen,
> Werkzeugleiste, Tabellen) folgt nach der Wahl des Nutzers und wird hier ergänzt.

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
| `--text`, `--muted`                | Text, Nebentext                                                                                                 |
| `--border`, `--line-soft`          | Linien, feine Trennlinien in Tabellen                                                                           |
| `--accent`, `--accent-soft`        | Akzent (aktive Werkzeuge, primärer Knopf, Links), Tönung                                                        |
| `--ok-*`, `--warn-*`, `--fehler-*` | Status: eingehalten, prüfen, überschritten/Fehler                                                               |
| `--sel`                            | Auswahl auf Plänen (Orange); auch ungespeicherte Änderungen (Punkt in Titelleiste und an „Speichern“)           |
| `--sel-foto`                       | Auswahl auf Fotos (Magenta, in beiden Schemata gleich) – Orange kollidiert dort mit Mess- und Markierungsfarben |
| `--danger`                         | zerstörende Aktionen (Löschen)                                                                                  |

**Feste Farben – begründete Ausnahmen:** Zeichenfläche und Papier (siehe Grundsätze) sowie der Schließen-Knopf der
Titelleiste (`.wc-close:hover` in `#c42b1c` mit weißem Symbol), weil Windows ihn in jedem Schema so zeigt und man ihn
daran erkennt.

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
- **Erstfokus** (automatisch, `ui/dialoge.ts`): `autoFocus`, sonst das erste Textfeld, sonst der Hauptknopf
  (`.primary`), sonst das gewählte Optionsfeld. Nie „Abbrechen“ – Enter darf nichts verwerfen.
- **Knöpfe** in `.dialog-buttons` als letztes Kind des Dialogs (oder seines `<form>`, das dann selbst letztes Kind
  ist): rechtsbündig, Hauptknopf rechts außen, „Abbrechen“ links davon. In langen Dialogen bleiben sie unten stehen
  (sticky).
- **Enter** löst den Hauptknopf aus: Inhalt in `<form onSubmit>`, Hauptknopf `type="submit"`, alle anderen
  `type="button"`.
- Optionen, die nur zu einer Wahl gehören, erst bei dieser Wahl zeigen (Beispiel: Vorlagen-Knöpfe im Excel-Dialog nur
  bei „Eigene Vorlage“).

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

## Begriffe

- Befehle, die einen Dialog öffnen, enden auf „ …“ („Öffnen …“, „Excel …“); Befehle, die sofort wirken, nicht
  („Speichern“, „Neu“).
- Gleiches Verb überall: Werkzeugleiste „Öffnen …“, Einstieg „Datei öffnen …“ (mit Objekt, weil der Zusammenhang
  fehlt); „Neu“ bzw. „Neues Projekt“.
- Hinzufügen-Knöpfe und Platzhalter in Auswahllisten: siehe „Listen“.
- Texte sagen, was zu tun ist, nicht was fehlt; was es nur in der Desktop-App gibt, steht als Fußnote darunter.
- Ordner im Dateimanager zeigen (`ordnerZeigen`): „Ordner öffnen“, Symbol `ordnerOffen` – nicht „Im Explorer öffnen“
  (hängt an Windows). Ist der Gegenstand nicht klar, mit Objekt: „Projektordner öffnen“.

## Symbole

Gemeinsamer Satz in `ui/Symbol.tsx` (Raster 24, Linie 2, runde Enden, Farbe des Textes, Größe 1em):
`<Symbol name="lineal" />`. Ohne `titel` ist das Symbol dekorativ, dann trägt der Knopf den Namen (Text oder
`aria-label`); mit `titel` ist es ein benanntes Bild.

- Werkzeuge: `auswahl`, `polygon`, `rechteck`, `erkennen` (Fläche aus dem Plan), `lineal` (Messen), `kalibrieren`, `einpassen`, `raster`,
  `grenze` (Grundstücksgrenze mit Grenzpunkten), `ausrichten` (Unterlage auf einen Punkt schieben).
- Befehle: `speichern`, `drucken`, `export`, `kopie`, `einfuegen`, `muell`, `rueckgaengig`, `wiederholen`, `plus`,
  `suche`, `stift`.
- Zustand: `haken`, `warnung`, `info`, `schliessen`, `auge`, `augeZu`, `stern`.
- Navigation: `pfeilRechts`, `pfeilLinks`, `pfeilUnten`, `ordner`, `ordnerOffen`, `datei`.
- Listen: `einruecken`, `ausruecken` (Gliederungsebene), `nachOben`, `nachUnten` zum Umsortieren (statt ↑/↓ als Schriftzeichen); `mehr` (drei Punkte, Knopf mit `aria-label="Aktionen"` und `title`) für
  Zeilenknöpfe „Aktionen“, die ein Menü öffnen – `pfeilUnten` bleibt dem Aufklapp-Pfeil an Knöpfen mit Text vorbehalten.

Neue Symbole kommen in diesen Satz, nicht in die App. Keine Emoji (📏 ✂ 🗑) und keine Schriftzeichen als Symbol.

## Menüs

`ui/Menue.tsx`: Kontextmenü mit `zeigeMenue(e, punkte, name)` im `onContextMenu`, Aufklappmenü mit `<MenueKnopf>`.
`name` benennt das Menü für Screenreader (z. B. „Projekt 2019-003“); der Aufklappknopf nimmt seinen eigenen Namen. Punkte
mit `text`, optional `symbol`, `hinweis` (rechts, z. B. der Grund einer Sperre), `tasten` (Tastenkürzel, siehe unten),
`haken` (Umschalter), `bild` (Bild statt Symbol, 16px, z. B. das Symbol einer App), `titel`, `gefahr`, `deaktiviert`, `unter` (Untermenü), Trenner mit `{ trenner: true }`.

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
- Eigene Öffner ohne `MenueKnopf` (z. B. Zeilenknopf „⋯“ mit `zeigeMenueAn`) tragen `aria-haspopup="menu"`; dann
  setzt das Menü `aria-expanded` am Öffner selbst. Wer den Zustand im Render braucht, nimmt `useMenueOffen(ref)`.
- Ein zweiter Klick auf den Öffner eines offenen Menüs schließt es (Knopf wie Zeilenknopf).

## Listen

- Hinzufügen-Knöpfe mit `<Symbol name="plus" />` und dem Gegenstand als Text, ohne „+“ als Schriftzeichen. Das Verb
  heißt immer „hinzufügen“ (nicht „anlegen“, „neu“ oder „einfügen“). In Leisten knapp nur der Gegenstand („Position“,
  „Abschnitt“), dann mit `title` und `aria-label` der vollen Aktion („Position hinzufügen“); sonst gleich mit Verb
  („Merkmal hinzufügen“). Öffnet der Knopf einen Dialog oder eine Rückfrage, endet er auf „ …“ („Geschoss …“).
- In Auswahllisten (`<option>`) geht kein Symbol: dort als Platzhalter „Firma hinzufügen …“ – mit „ …“, weil die
  eigentliche Wahl erst folgt (Ausnahme zu „Begriffe“).
- Hinweistexte nennen den Knopf so, wie er heißt: „mit ‚Abschnitt‘ beginnen“.
- Einträge eines Menüs „Hinzufügen“ (`MenueKnopf`) tragen nur den Gegenstand („Hinweis“, „Vorbemerkung“), ohne „+“
  und ohne eigenes Symbol – das Plus steht am Menüknopf.
- Gliederungsebenen (einrücken, ausrücken) mit `einruecken` und `ausruecken` – nicht mit Schriftzeichen wie ⇤/⇥ und
  nicht mit `pfeilLinks`/`pfeilRechts`, die sich wie Zurück und Weiter lesen. Umsortieren mit `nachOben`/`nachUnten`, Zeilenaktionen mit `mehr`.
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

## Meldungen auf der Zeichenfläche

- `.canvas-message` ist eine Warnung oben mittig (Warnfarben).
- `.canvas-message.ok` (Erfolg) und `.canvas-message.info` (neutral, Text in `--text`) als weitere Varianten.
- `.canvas-message.leer` ist ein Leerzustand mittig auf der Fläche, neutral („Foto hinzufügen …“).
- Die Hand als Mauszeiger nur, wenn die Meldung per Klick schließt: `.canvas-message.klickbar` oder mit `title`.

## Titelleiste

Das Farbschema-Menü zeigt ein gezeichnetes Symbol und den Namen der Wahl („Auto“, „Hell“, „Dunkel“), wie „§ Regeln“ und
„≡ Protokoll“ mit Text. Unter 960px Fensterbreite zeigen Knöpfe mit Symbol (Farbschema, Speicherort) nur noch das
Symbol: Text in `<span className="titlebar-text">`, der Name bleibt über `aria-label`. Die Tableiste von Arkly zeigt
unter 1100px am Tab nur Symbol und Namen der App (das Projekt steht im Tooltip); eine Fläche zum Ziehen des Fensters
bleibt immer frei.

## Ungespeicherte Änderungen

Der Knopf „Speichern“ in der Werkzeugleiste bekommt bei ungespeicherten Änderungen die Klasse `ungespeichert`: ein
Punkt (8px, `--sel` mit Rand in `--text`) außen an der oberen rechten Ecke, der die Breite der Leiste nicht ändert.
Dazu sagt es der Knopf im `aria-label` („Speichern – ungespeicherte Änderungen“) und im `title`. Der Punkt ● hinter dem
Namen in der Titelleiste (`TitleBar`, Feld `dirty`) bleibt davon unberührt.

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
`rectio.md`, `permio.md`, `fabrio.md`, `arkly.md`). Neue Punkte trägt das Designsystem dort ein, die App löscht erledigte
Punkte in ihrem eigenen PR (löschen, nicht abhaken). Diese Richtlinie ändert sich dafür nicht – so kommen sich
App-PRs und Designsystem nicht in die Quere.
