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
  Ausnahme: Zeichenfläche und Papier (Druck), die immer mit hellen Farben arbeiten.
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
| `--sel`                            | Auswahl auf Plänen (Orange)                                                                                     |
| `--sel-foto`                       | Auswahl auf Fotos (Magenta, in beiden Schemata gleich) – Orange kollidiert dort mit Mess- und Markierungsfarben |
| `--danger`                         | zerstörende Aktionen (Löschen)                                                                                  |

**Auswahl auf Fotos** immer mit Saum zeichnen: Magenta allein hat auf mittleren Fototönen (Putz, Ziegel, Himmel) kaum
Helligkeitskontrast. Unter der Linie in `--sel-foto` liegt ein Doppelsaum, außen 1px weiß, innen 1px `rgba(0, 0, 0, 0.5)`.

## Dialoge

- Immer `Modal` aus `ui/Dialog.tsx` statt eines eigenen `div.modal`: Esc, Klick daneben, Rolle, Name und Fokusfalle
  kommen dann mit.
- **Titel:** `kopf` zeigt ihn sichtbar als Kopf und benennt damit den Dialog. Nicht zusätzlich als `h3` im Inhalt
  wiederholen. Ohne `kopf` ist `titel` nur der Name für Screenreader.
- **Breite:** Standard 380px, `breit` 620px (Formulare), `tabelle` bis 1200px (Vorschauen, Zuordnungen).
- **Erstfokus** (automatisch, `ui/dialoge.ts`): `autoFocus`, sonst das erste Textfeld, sonst der Hauptknopf
  (`.primary`). Nie „Abbrechen“ – Enter darf nichts verwerfen.
- **Knöpfe** in `.dialog-buttons` als letztes Kind des Dialogs (oder seines `<form>`, das dann selbst letztes Kind ist): rechtsbündig, Hauptknopf
  rechts außen, „Abbrechen“ links davon. In langen Dialogen bleiben sie unten stehen (sticky).
- **Enter** löst den Hauptknopf aus: Inhalt in `<form onSubmit>`, Hauptknopf `type="submit"`, alle anderen
  `type="button"`.
- Optionen, die nur zu einer Wahl gehören, erst bei dieser Wahl zeigen (Beispiel: Vorlagen-Knöpfe im Excel-Dialog nur
  bei „Eigene Vorlage“).

## Druckvorschau

- `.report-backdrop > .report` gilt als Dialog (Rolle, Name aus der ersten Überschrift, Fokus hinein, Tab bleibt
  drin).
- `.report-actions` ist eine eigene Zeile über dem Blatt und bleibt beim Blättern oben: Optionen links, Knöpfe rechts.
  Sie wird nie mitgedruckt. Hauptknopf (`.primary`) ist **„Drucken / PDF“**, „Schließen“ ein normaler Knopf links
  davon.

## Felder

- `NumberField` zeigt Zahlen mit Nachkommastellen gruppiert (45.000,00). Beim Fokussieren bleibt der Text
  unverändert (Cursor und Auswahl stimmen); Punkte vor dem Komma werden beim Lesen immer als Tausendertrenner
  verstanden, auch wenn nach dem Bearbeiten die Dreiergruppen nicht mehr stimmen. Ganze Zahlen (`digits={0}`) stehen
  ohne Punkte, weil „45.00“ dort mehrdeutig wäre.
- **Enter** übernimmt die Eingabe und verlässt das Feld (in einem `<form>` ohne Absendeknopf wird danach abgesendet), damit Strg+Z (Rückgängig der App), Entf und die
  Werkzeugtasten wieder der Arbeitsfläche gehören und nicht ins leere Rückgängig des Browsers gehen. Weiter zum nächsten
  Feld mit Tab. **Esc** verwirft eine Eingabe; ohne Eingabe schließt Esc den Dialog.
- In `.toolbar` und `.report-actions` füllen Felder nicht die Zeile: Auswahllisten sind so breit wie ihr Inhalt,
  Textfelder haben die Standardbreite des Browsers (etwa 20 Zeichen; kürzer mit dem Attribut `size`), Regler 120px.
  Sonst füllen Felder ihre Spalte.
- `.toggle` (Kästchen oder Optionsfeld mit Text): das Kästchen wird nie gestaucht.

## Umschalter

`.segment` für eine Wahl aus wenigen (Ansicht, Modus): Knöpfe direkt nebeneinander in einem Rahmen, der gewählte mit
`aria-pressed="true"` in Akzent-Tönung. Höhe 24px, in `.toolbar` 28px wie die übrigen Knöpfe dort. Statt eigener
Varianten je App (`.mv-umschalter`, `.ava-tabs`, `.view-switch`).

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
- Texte sagen, was zu tun ist, nicht was fehlt; was es nur in der Desktop-App gibt, steht als Fußnote darunter.

## Symbole

Gemeinsamer Satz in `ui/Symbol.tsx` (Raster 24, Linie 2, runde Enden, Farbe des Textes, Größe 1em):
`<Symbol name="lineal" />`. Ohne `titel` ist das Symbol dekorativ, dann trägt der Knopf den Namen (Text oder
`aria-label`); mit `titel` ist es ein benanntes Bild.

- Werkzeuge: `auswahl`, `polygon`, `rechteck`, `lineal` (Messen), `kalibrieren`, `einpassen`, `raster`.
- Befehle: `speichern`, `drucken`, `export`, `kopie`, `einfuegen`, `muell`, `rueckgaengig`, `wiederholen`, `plus`,
  `suche`, `stift`.
- Zustand: `haken`, `warnung`, `info`, `schliessen`, `auge`, `augeZu`, `stern`.
- Navigation: `pfeilRechts`, `pfeilLinks`, `pfeilUnten`, `ordner`, `ordnerOffen`, `datei`.

Neue Symbole kommen in diesen Satz, nicht in die App. Keine Emoji (📏 ✂ 🗑) und keine Schriftzeichen als Symbol.

## Menüs

`ui/Menue.tsx`: Kontextmenü mit `zeigeMenue(e, punkte, name)` im `onContextMenu`, Aufklappmenü mit `<MenueKnopf>`.
`name` benennt das Menü für Screenreader (z. B. „Projekt 2019-003“); der Aufklappknopf nimmt seinen eigenen Namen. Punkte
mit `text`, optional `symbol`, `hinweis` (rechts, z. B. Tastenkürzel), `titel`, `gefahr`, `deaktiviert`, `unter`
(Untermenü), Trenner mit `{ trenner: true }`.

- Tastatur: der erste Punkt hat den Fokus, ↑/↓ und Pos1/Ende wandern, → bzw. Enter öffnet ein Untermenü, ← führt
  zurück. Esc schließt nur das Menü (ein Dialog darunter bleibt offen), Tab schließt und gibt den Fokus an den
  Auslöser zurück.
- `MenueHost` steckt schon in der Titelleiste jeder App und in der Rahmen-App; nicht selbst einhängen.
- Gesperrte Punkte (`deaktiviert`) mit Grund im `hinweis` („Antrag eingereicht“), statt sie wegzulassen. Sie bleiben
  per Tastatur erreichbar (`aria-disabled`), damit der Grund vorgelesen wird, und führen nichts aus.
- Ohne Mausposition (Kontextmenütaste) erscheint das Menü am Auslöser.
- Menüs liegen über Dialogen und Rückfragen; Schatten schwebender Flächen über `--schatten-schwebend`.

## Seitenleisten

`BreitenLeiste` (`ui/Leiste.tsx`) mit gemerkter, ziehbarer Breite. Der Griff sitzt am Rand zur Arbeitsfläche: links
stehende Leiste (Vorgabe) rechts, rechts stehende Leiste mit `seite="rechts"` links. Tastatur ←/→ bewegen den Griff,
Doppelklick setzt die Vorgabe. Keine eigenen Leisten-Komponenten je App.

## Meldungen im Inhalt

`.meldung` (neutral) mit `.ok`, `.warnung` oder `.fehler` für Meldungen in Dialogen und Seitenleisten; `role="status"`
für Rückmeldungen, `role="alert"` für Fehler. `.warning` bleibt als Hinweis in Warnfarben.

## Meldungen auf der Zeichenfläche

- `.canvas-message` ist eine Warnung oben mittig (Warnfarben).
- `.canvas-message.ok` (Erfolg) und `.canvas-message.info` (neutral, Text in `--text`) als weitere Varianten.
- `.canvas-message.leer` ist ein Leerzustand mittig auf der Fläche, neutral („Foto hinzufügen …“).
- Die Hand als Mauszeiger nur, wenn die Meldung per Klick schließt: `.canvas-message.klickbar` oder mit `title`.

## Titelleiste

Das Farbschema-Menü zeigt ein gezeichnetes Symbol und den Namen der Wahl („Auto“, „Hell“, „Dunkel“), wie „§ Regeln“ und
„≡ Protokoll“ mit Text. Unter 960px Fensterbreite zeigen Knöpfe mit Symbol (Farbschema, Speicherort) nur noch das
Symbol: Text in `<span className="titlebar-text">`, der Name bleibt über `aria-label`.

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

| App                            | Datei und Aufgabe                                                                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RECTIO                         | `apps/entzerrung/src/components/Arbeitsflaeche.tsx:364`: Leerzustand „Foto hinzufügen …“ mit `className="canvas-message leer"`; Auswahl auf dem Foto mit `--sel-foto` und Saum statt eigener Farbe                              |
| TERRIO, NUMIO                  | Spalten-Überschriften (`h2` ohne Regel, sonst 22px) auf die Skala setzen: `--fs-l`, halbfett                                                                                                                                    |
| FABRIO                         | Versalien entfernen: `.ava-nav-titel` (`apps/ava/src/styles.css:77`); `outline: none` prüfen: `apps/ava/src/styles.css:492`, `:628`                                                                                             |
| PERMIO                         | Versalien entfernen: `apps/formulare/src/styles.css:160`, `.pk-nav-titel` (:1142), `.pk-abschnitt h3` (:1353), `.fo-ein-teil h4` (:4235); `outline: none` prüfen: :1797, :2612, :2652                                           |
| ATLAS                          | `outline: none` prüfen: `apps/ordner/src/styles.css:415`                                                                                                                                                                        |
| QUADRIO, TERRIO, NUMIO, FABRIO | Druckvorschau: „Drucken / PDF“ als Hauptknopf (`.primary`), „Schließen“ normal (`Report.tsx`, `NachweisDruck.tsx`, `KostenDruck.tsx`, `Druck.tsx`)                                                                              |
| NUMIO, FABRIO, QUADRIO         | eigene Umschalter (`.mv-umschalter`, `.ava-tabs`, `.view-switch`) auf `.segment` umstellen                                                                                                                                      |
| PERMIO                         | eigenes Menü und eigene Symbole (`components/Menue.tsx`, `components/Symbol.tsx`, `.menue`- und `.symbol`-Regeln in `styles.css`) durch `@core/ui/Menue` und `@core/ui/Symbol` ersetzen; fehlende Symbole im core-Satz ergänzen |
| RECTIO                         | eigene `RechteLeiste` durch `BreitenLeiste seite="rechts"` ersetzen                                                                                                                                                             |
| QUADRIO, TERRIO, RECTIO        | Werkzeugleisten mit `Symbol` statt Emoji und Schriftzeichen (📏, ⇔, ⊡, ▭, ↶/↷)                                                                                                                                                  |
| alle                           | eigene Kontextmenüs auf `zeigeMenue` umstellen (QUADRIO Canvas, TERRIO Lageplan, RECTIO Arbeitsfläche, ATLAS Ordner-Editor)                                                                                                     |
| alle                           | eigene `div.modal` auf `Modal` umstellen; Titel mit `kopf` statt `h3` im Inhalt; Werkzeugleisten-Befehle nach „Begriffe“ benennen (z. B. TERRIO „Öffnen“ → „Öffnen …“)                                                          |

Zeilennummern beziehen sich auf den Stand dieser Richtlinie.
