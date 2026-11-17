# ATLAS (`apps/ordner`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **„Exportieren“ und Muster `.es-*`** (design.md „Kopf- und Werkzeugleisten“, „Einstellungen“): Ausgaben mit Dialog (Excel …, PDF …, CSV …) als Untermenü „Exportieren“ (Punkt mit `unter`) in „Datei“ statt als eigener Menüknopf. Die eigene Kopie des Musters `.es-*` (`styles.css`, genutzt in `KatasterEinstellungen.tsx`) auf `.einst*` umstellen und die App-Kopie streichen; das Raster der Planangaben wird `.feldraster` (siehe unten).
- **Feldraster aus core** (design.md „Felder“): `.es-raster.ka-raster` in `KatasterEinstellungen.tsx` wird `.feldraster` mit `--feld-min: 160px`, falls die schmaleren Spalten bleiben sollen, `.es-breit` wird `.feldraster-breit` und `.ka-zwei` wird `.feldraster-zwei`. `label.ka-check` wird `label.toggle`. Die Regeln für `.es-raster`, `.es-breit`, `.ka-zwei` und `.ka-raster select` in `styles.css` entfallen, außerdem `flex-direction: row !important` an `.ka-check`.
