# LEXIO (`apps/baurecht`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Abstände aus der Skala:** `styles.css` nutzt viele freie Werte (`padding: 3px 9px`, `7px 10px`, `margin: 6px 0`
  …) und eigene Radien (`5px`, `6px`). Auf `--s1`…`--s6`, `--radius-s`/`--radius` bringen; Höhen der kleinen Knöpfe
  (`min-height: 26px`) auf `--ctl-h-s`.
- **„Datei“ mit „Einstellungen …“ und „Exportieren“** (design.md „Kopf- und Werkzeugleisten“, „Einstellungen“): „Datei“ gibt es in jeder App; letzter Punkt hinter einem Trenner „Einstellungen …“ (`tasten: 'Strg+,'`, wirkt auch ohne offenes Menü) – er öffnet den zentralen Einstellungsdialog auf der Seite der App, sobald der Dialog im Designsystem (`packages/core`) bereitsteht. Ausgaben mit Dialog (Excel …, PDF …, CSV …) als Untermenü „Exportieren“ (Punkt mit `unter`) in „Datei“ statt als eigener Menüknopf. App-eigene Einstellungen ziehen auf die Seite der App im Dialog. Für den Hinweis nach einer Aktion (`zeigeHinweis`, `ui/Hinweis.tsx`): beim Start `hinweisF6Eigen()` aufrufen, damit nicht zwei F6-Handler laufen, und den Stapel im F6-Kreis von LEXIO (`App.tsx`) mit `hinweisFokussieren()` als letzte Station aufnehmen (liefert `false` ohne Hinweis, dann übersprungen); F6 im Hinweis springt weiter zur ersten Station.
- **Kartenlayout (Richtung C)** (design.md „Fläche und Karten“): Angaben, Vorschriften und Einzelheiten werden `Flaeche` mit Karten (der F6-Kreis bleibt: jede Karte eine Station). Eigene Layout-CSS entfällt, ebenso die rund 6 festen Farbwerte in `styles.css` (außer Zeichenfläche und Papier) zugunsten der Variablen aus `base.css`. Eigene Tabellenvarianten auf die gemeinsame Zahlentabelle `.summary-table`.
