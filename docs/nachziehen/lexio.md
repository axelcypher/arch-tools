# LEXIO (`apps/baurecht`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Abstände aus der Skala:** `styles.css` nutzt viele freie Werte (`padding: 3px 9px`, `7px 10px`, `margin: 6px 0`
  …) und eigene Radien (`5px`, `6px`). Auf `--s1`…`--s6`, `--radius-s`/`--radius` bringen; Höhen der kleinen Knöpfe
  (`min-height: 26px`) auf `--ctl-h-s`.
- **„Datei“ mit „Einstellungen …“ und „Exportieren“** (design.md „Kopf- und Werkzeugleisten“, „Einstellungen“): „Datei“ gibt es in jeder App; letzter Punkt hinter einem Trenner „Einstellungen …“ (`tasten: 'Strg+,'`, wirkt auch ohne offenes Menü) – er öffnet den zentralen Einstellungsdialog auf der Seite der App, sobald der Dialog im Designsystem (`packages/core`) bereitsteht. Ausgaben mit Dialog (Excel …, PDF …, CSV …) als Untermenü „Exportieren“ (Punkt mit `unter`) in „Datei“ statt als eigener Menüknopf. App-eigene Einstellungen ziehen auf die Seite der App im Dialog. Für den späteren Hinweis nach einer Aktion (`zeigeHinweis`): Er wird im F6-Kreis von LEXIO (`App.tsx`) mit `hinweisFokussieren()` die letzte Station (ohne Hinweis übersprungen).
