# Designrichtlinie

Gemeinsame Regeln für die Oberfläche aller Apps der Suite Arkly. Grundlage ist `packages/core/src/ui/base.css`;
App-eigenes steht in `apps/<app>/src/styles.css`. An dieser Richtlinie messen sich die App-Sitzungen und der
Review-Agent `review-design`.

> Stand: Grundlagen (Skalen, Fokus, Zielgrößen, Überschriften, Meldungen). Die Gestaltungsrichtung (Farben, Knopfstufen,
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

## Meldungen auf der Zeichenfläche

- `.canvas-message` ist eine Warnung oben mittig (Warnfarben).
- `.canvas-message.leer` ist ein Leerzustand mittig auf der Fläche, neutral („Foto hinzufügen …“).
- Die Hand als Mauszeiger nur, wenn die Meldung per Klick schließt: `.canvas-message.klickbar` oder mit `title`.

## Titelleiste

Das Farbschema-Menü zeigt ein gezeichnetes Symbol und den Namen der Wahl („Auto“, „Hell“, „Dunkel“), wie „§ Regeln“ und
„≡ Protokoll“ mit Text.

## Richtig und falsch

| Richtig                                                                          | Falsch                                                         |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Abstände und Schriftgrade aus der Skala (`var(--s2)`, `var(--fs-s)`)             | freie Werte wie `margin: 7px`, `font-size: 12.5px`             |
| Farben über Variablen (`var(--muted)`, `var(--warn-bg)`)                         | feste Farben (`#888`, `orange`) in App-CSS                     |
| `:focus-visible` mit sichtbarem Rahmen                                           | `outline: none` ohne Ersatz                                    |
| Überschriften in Satzschreibung                                                  | Versalien mit Sperrung (`text-transform: uppercase`)           |
| Symbole als SVG, mit `aria-label` am Knopf                                       | Schriftzeichen wie ◐ ◂ 📏 als einziges Erkennungsmerkmal       |
| gemeinsame Klassen (`.field`, `.toolbar`, `.canvas-message`)                     | App-eigene Kopien mit leicht anderen Abständen                 |
| `--sel-foto` mit hellem und dunklem Saum                                         | Magenta-Linie allein auf dem Foto                              |
| Enter übernimmt; Esc verwirft eine Eingabe, ohne Eingabe schließt Esc den Dialog | Esc muss zweimal gedrückt werden, um einen Dialog zu schließen |

## Was die Apps nachziehen

| App           | Datei und Aufgabe                                                                                                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RECTIO        | `apps/entzerrung/src/components/Arbeitsflaeche.tsx:364`: Leerzustand „Foto hinzufügen …“ mit `className="canvas-message leer"`; Auswahl auf dem Foto mit `--sel-foto` und Saum statt eigener Farbe |
| TERRIO, NUMIO | Spalten-Überschriften (`h2` ohne Regel, sonst 22px) auf die Skala setzen: `--fs-l`, halbfett                                                                                                       |
| FABRIO        | Versalien entfernen: `.ava-nav-titel` (`apps/ava/src/styles.css:77`); `outline: none` prüfen: `apps/ava/src/styles.css:492`, `:628`                                                                |
| PERMIO        | erledigt (PERMIO 0.47.2): Versalien entfernt, Überschriften auf `--fs-*`, `outline: none` geprüft (Menüpunkte mit Fokusrahmen)                                                                     |
| core          | Versalien entfernen: `.pa-abschnitt-titel` (`packages/core/src/ui/projektuebersicht.css:60`) – Projektübersicht in PERMIO und ATLAS                                                                |
| ATLAS         | `outline: none` prüfen: `apps/ordner/src/styles.css:415`                                                                                                                                           |

Zeilennummern beziehen sich auf den Stand dieser Richtlinie.
