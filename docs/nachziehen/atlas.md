# ATLAS (`apps/ordner`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Feldraster aus core** (design.md „Felder“): `.ka-raster` in `KatasterEinstellungen.tsx` wird `.feldraster` mit `--feld-min: 160px`, falls die schmaleren Spalten bleiben sollen, `.ka-breit` wird `.feldraster-breit` und `.ka-zwei` wird `.feldraster-zwei`. `label.ka-check` wird `label.toggle`. Die Regeln für `.ka-raster` samt Kindern, `.ka-breit`, `.ka-zwei` und `.ka-check` in `styles.css` entfallen, der Test in `kataster.ui.test.ts` prüft dann `.feldraster`. Der Abstand zwischen Beschriftung und Feld ist in core 2px statt `--s1`.
