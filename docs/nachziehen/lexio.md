# LEXIO (`apps/baurecht`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Umschalter auf `.segment`** (Designsystem entschieden): `.br-segment` durch `.segment` ersetzen, lange Werte mit `.segment.senkrecht` statt `.br-segment-senkrecht` (`components/Angaben.tsx`, `components/Vorschriften.tsx`). Eine umbrechende Variante gibt es bewusst nicht (treppenartig, Zuordnung unklar; siehe design.md „Umschalter“) – bei vielen Werten senkrecht. Die Ampelfarbe der Filter als `.statuspunkt` neben dem Wort im Knopf.
- **Feste Farben in `styles.css`** (Designsystem entschieden): Das gemeinsame `--muted` ist jetzt dunkler (#5f6673, auf allen Tönungen mindestens 4,76 : 1) – die Überschreibung von `--muted` in `.br-app` streichen; `--br-leise-stark` prüfen und möglichst auch streichen. Ampelpunkte `.br-ampel-punkt` und `--br-punkt-*` durch `.statuspunkt` (`.ok`, `.warnung`, `.fehler`) bzw. `--ok-punkt`, `--warn-punkt`, `--fehler-punkt` ersetzen; im Protokoll (`.report`) gelten die hellen Werte von selbst.
- **Abstände aus der Skala:** `styles.css` nutzt viele freie Werte (`padding: 3px 9px`, `7px 10px`, `margin: 6px 0`
  …) und eigene Radien (`5px`, `6px`). Auf `--s1`…`--s6`, `--radius-s`/`--radius` bringen; Höhen der kleinen Knöpfe
  (`min-height: 26px`) auf `--ctl-h-s`.
- **Stand „offen“ im Regelbaum** (`components/Detail.tsx`, `STAND`): das „?“ als Text durch das neue Symbol `frage` ersetzen.
- **Satz für ungespeicherte Änderungen prüfen** (design.md „Ungespeicherte Änderungen“): Meint „ungespeichert“ nur einen Teil des Projekts, den Satz in Nutzersprache setzen („Die Angaben haben ungespeicherte Änderungen.“) – an der `TitleBar` (`ungespeichert`) und als dritter Parameter eigener `aenderungenSpeichern`-Aufrufe. Passt der Rückfall „Das Projekt hat ungespeicherte Änderungen.“, den Punkt einfach löschen.
