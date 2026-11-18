# FABRIO (`apps/ava`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Feldraster: Werte, gesperrte Kästchen, Abstand unten** (design.md „Felder“): Schreibgeschützte Angaben im Raster nehmen `.feld-wert` (Beträge `.feld-wert.num`) statt `.ava-angabe`. Ein gesperrtes `.toggle` dämpft core selbst. Unter der letzten Zeile hält das Raster keinen Abstand mehr, deshalb entfällt eine eigene Ausnahme mit `margin-bottom: 0` in Behältern mit `gap` (z. B. Seitenkarte). Für eine schmale Seitenkarte statt fester drei Spalten `.feldraster` mit kleinem `--feld-min` nehmen.
