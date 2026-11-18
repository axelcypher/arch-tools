# FABRIO (`apps/ava`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Feldraster: Werte, gesperrte Kästchen, Abstand unten** (design.md „Felder“): Schreibgeschützte Angaben im Raster nehmen `.feld-wert` (Beträge `.feld-wert.num`) statt `.ava-angabe`. Ein gesperrtes `.toggle` dämpft core selbst. In Behältern mit `gap` (z. B. Seitenkarte) nimmt das Raster `.feldraster.buendig` statt einer eigenen Ausnahme mit `margin-bottom: 0`. Für eine schmale Seitenkarte statt fester drei Spalten `.feldraster` mit kleinem `--feld-min` nehmen.
- **Feldraster füllend, Beschriftung über Beträgen** (design.md „Felder“): Statt der lokalen Spalten mit `auto-fit` in der Seitenkarte nimmt das Raster `.feldraster.fuellend`. Die eigene Regel `.field:has(> .feld-wert.num) > .field-label` entfällt, core setzt die Beschriftung über `.feld-wert.num` rechtsbündig.
