# TERRIO (`apps/grz`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Kennzahl-Kacheln auf die core-Varianten** (design.md „Skalen“, Kennzahlen als Kacheln): die Ergänzungen unter `.grz-kennzahlen` in `styles.css` (Wunschbreite 12em, Wert oben, `.grz-metric-kopf`, `strong small`, `.metric.alarm` in `--danger`) entfallen zugunsten von `.metric.pruefung` mit `.metric-kopf`, `.metric.fehler` (statt `.alarm`, Innenrand in `--fehler-text`) bzw. `.metric.warnung` und der Einheit aus core. Statusmarken (heute `.pill` mit Status, `GrzGfzView.tsx`) werden `.marke` mit Variante (`.ok`, `.warnung`, `.fehler`). In TERRIO bleiben: der Hinweis auf Offenes (`small.grz-metric-offen` in `--warn-text`) und der kleine Abstand unter dem Wert, falls er bleiben soll.
- **Höchstens vier oder fünf Kacheln** (design.md „Skalen“, Kennzahlen als Kacheln): TERRIO zeigt bis zu acht (u. a. GR/GF absolut, GRZ II, BMZ). Die Kernwerte bleiben Kacheln, die übrigen gehen in eine Tabelle darunter.
