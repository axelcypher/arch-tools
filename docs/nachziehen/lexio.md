# LEXIO (`apps/baurecht`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Umschalter auf `.segment`** (wartet auf Designsystem): `.br-segment` (Antworten in den Angaben, Ampel-Filter, Ordnung in
  `components/Angaben.tsx`, `components/Vorschriften.tsx`) ist eine eigene Variante. LEXIO braucht dabei zwei Dinge, die
  `.segment` nicht hat: Umbruch bei vielen Werten und eine senkrechte Form für lange Werte (`.br-segment-senkrecht`);
  die Ampel-Filter tragen zusätzlich ihre Ampelfarbe. Erst nach Klärung mit dem Designsystem umstellen (Variante dort
  oder begründete Ausnahme).
- **Feste Farben in `styles.css`** (wartet auf Designsystem): `--muted` und `--br-leise-stark` werden in `.br-app` mit festen Werten überschrieben
  (Kontrast auf den Tönungen der App), die Ampelpunkte (`--br-punkt-rot/-gelb/-gruen`) sind feste Farben. Mit dem
  Designsystem klären, ob `--muted` in `base.css` dunkler wird bzw. Punktfarben für Status dazukommen; dann die
  App-Werte streichen.
- **Abstände aus der Skala:** `styles.css` nutzt viele freie Werte (`padding: 3px 9px`, `7px 10px`, `margin: 6px 0`
  …) und eigene Radien (`5px`, `6px`). Auf `--s1`…`--s6`, `--radius-s`/`--radius` bringen; Höhen der kleinen Knöpfe
  (`min-height: 26px`) auf `--ctl-h-s`.
- **Stand „offen“ im Regelbaum** (wartet auf Designsystem) (`components/Detail.tsx`, `STAND`): „trifft zu“ und „trifft nicht zu“ zeigen die
  Symbole `haken` und `schliessen`, „offen“ übergangsweise ein „?“ als Text – im Symbolsatz fehlt ein Symbol dafür
  (beim Designsystem angefragt).
