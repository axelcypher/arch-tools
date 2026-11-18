# TERRIO (`apps/grz`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Radien aus der Skala** (design.md „Skalen“): Feste Radien in `styles.css` nach Rolle, nicht nach Zahl, auf die Token bringen. Felder, Code, Listen und kleine Kästen nehmen `var(--radius-xs)`, Knöpfe und kartenartige Kästen innerhalb einer Karte `var(--radius-s)`, eigene Flächen `var(--radius)`. Verschachtelte Kästen runden kleiner als ihre Umgebung. Auch 3 und 5px gehen nach dieser Rolle auf eine Stufe. Zähler und Marken mit runden Enden (oft 9–14px) bekommen `999px`, einseitige Radien dasselbe Token (z. B. `0 var(--radius-xs) var(--radius-xs) 0`). Unter 4px bleibt nur für Kleinstteile.
