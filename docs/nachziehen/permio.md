# PERMIO (`apps/formulare`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Radien aus der Skala** (design.md „Skalen“): In `styles.css` stehen 74 feste Radien in px. 4px wird `var(--radius-xs)`, 6px `var(--radius-s)`, 8px `var(--radius)`. Kartenartige Kästen innerhalb einer Karte nehmen `--radius-s`, also kleiner als die Karte. Unter 4px bleibt nur für Kleinstteile, Pillen bleiben bei `999px`.
