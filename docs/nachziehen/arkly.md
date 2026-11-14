# Arkly (`apps/suite`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Kopfleiste nach der neuen Regel ordnen** (design.md „Kopf- und Werkzeugleisten“, „Titelleiste“): `App.tsx` – wie die Titelleiste der Apps: Farbschema (`farbschemaPunkte(false)`), Speicherort (`speicherortPunkt`, sichtbar nur `SpeicherortKnopf nurWarnung`) und Seltenes ins Menü „Mehr“ (`MenueKnopf`, Symbol `mehr`, `pfeil={false}`) als letztes Element; sichtbar bleiben Tabs, Version bzw. Update und der Hauptschritt.
