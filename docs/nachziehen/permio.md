# PERMIO (`apps/formulare`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.
- **Feldraster aus core** (design.md „Felder“): Diese Raster werden `.feldraster`, mit `--feld-min` dort, wo die Spaltenbreite bleiben soll:
  - `.es-raster` (`AntragEinstellungen.tsx`, 240px)
  - `.es-dok-felder` mit `.es-dok-feld` (`DokumenteEinstellungen.tsx`, 240px)
  - `.es-adress-felder` (`Einstellungen.tsx`, 180px; `label.breit` wird `.feldraster-zwei`)
  - `.pu-bearbeiten` (`Antrag.tsx`, 220px; Rand, Innenabstand und Knopfzeile bleiben App-Sache)

  `.es-breit` und `.pu-breit` werden `.feldraster-breit`. In `AntragEinstellungen.tsx` steht `.es-breit` auch an einer `radio-row` außerhalb des Rasters; die braucht dann keine Klasse mehr. Die Projektkarte (`.pk-raster`, zwölf Spalten mit Breiten pro Feld) bleibt, wie sie ist.
