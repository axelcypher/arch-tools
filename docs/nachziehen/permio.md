# PERMIO (`apps/formulare`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Feldraster aus core** (design.md „Felder“): Diese Raster werden `.feldraster`, mit `--feld-min` dort, wo die Spaltenbreite bleiben soll:
  - `.es-raster` (`AntragEinstellungen.tsx`, 240px)
  - `.es-dok-felder` mit `.es-dok-feld` (`DokumenteEinstellungen.tsx`, 240px)
  - `.es-adress-felder` (`AdressbuchDialog.tsx`, 180px; `label.breit` wird `.feldraster-zwei`)
  - `.pu-bearbeiten` (`Antrag.tsx`, 220px; Rand, Innenabstand und Knopfzeile bleiben App-Sache)

  `.es-breit` und `.pu-breit` werden `.feldraster-breit`. `.pu-breit` ist ein `div` mit Feld, Hinweisen und Chips: Es wird `.feldraster-breit`, das `label` darin bekommt `.field` (Beschriftung oben), Abstände zwischen Feld, Hinweisen und Chips setzt die App. In `AntragEinstellungen.tsx` steht `.es-breit` auch am `span` einer `radio-row` außerhalb des Rasters, wo es `strong` und `code` untereinander stellt; das braucht dort eine eigene Regel der App, denn `.feldraster-breit` wirkt nur im Raster. Die schreibgeschützten Angaben dort (`div` mit `.field-label` und `code`: Antragsordner, Berechnungen, Vorlagen) bleiben `div` und stehen wie die Felder (Beschriftung oben); die Regel `.es-raster > div > .field-label` entfällt. Felder mit Hinweis oder Fehler unter dem Feld fluchten weiter mit den Nachbarn. Die Projektkarte (`.pk-raster`, zwölf Spalten mit Breiten pro Feld) bleibt, wie sie ist.

- **Steuerzeile der Felderansicht** (design.md „Zielgrößen“): Suchfeld und Filter-Segment im festen Kopf (`.rollend-kopf` in `FelderAnsicht.tsx`) sind jetzt beide `--ctl-h` hoch. „Nächste offene Angabe“ ist noch `button.small` (24px); ohne `small` hat die Zeile eine Höhe.
