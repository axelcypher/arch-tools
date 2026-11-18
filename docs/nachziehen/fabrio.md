# FABRIO (`apps/ava`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Feldraster: Werte, gesperrte Kästchen, Abstand unten** (design.md „Felder“): Schreibgeschützte Angaben im Raster nehmen `.feld-wert` (Beträge `.feld-wert.num`) statt `.ava-angabe`. Ein gesperrtes `.toggle` dämpft core selbst. In Behältern mit `gap` (z. B. Seitenkarte) nimmt das Raster `.feldraster.buendig` statt einer eigenen Ausnahme mit `margin-bottom: 0`. Für eine schmale Seitenkarte statt fester drei Spalten `.feldraster` mit kleinem `--feld-min` nehmen.
- **Radien aus der Skala** (design.md „Skalen“): In `styles.css` stehen 18 feste Radien in px. 4px wird `var(--radius-xs)`, 6px `var(--radius-s)`, 8px `var(--radius)`. Kartenartige Kästen innerhalb einer Karte nehmen `--radius-s`, also kleiner als die Karte. Unter 4px bleibt nur für Kleinstteile, Pillen bleiben bei `999px`.
