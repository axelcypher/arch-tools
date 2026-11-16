# QUADRIO (`apps/flaechenrechner`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **„Datei“ mit „Einstellungen …“ und „Exportieren“** (design.md „Kopf- und Werkzeugleisten“, „Einstellungen“): „Datei“ gibt es in jeder App; letzter Punkt hinter einem Trenner „Einstellungen …“ (`tasten: 'Strg+,'`, wirkt auch ohne offenes Menü) – er öffnet den zentralen Einstellungsdialog auf der Seite der App, sobald der Dialog im Designsystem (`packages/core`) bereitsteht. Ausgaben mit Dialog (Excel …, PDF …, CSV …) als Untermenü „Exportieren“ (Punkt mit `unter`) in „Datei“ statt als eigener Menüknopf. App-eigene Einstellungen ziehen auf die Seite der App im Dialog. Dazu **direkter Export** (design.md „Kopf- und Werkzeugleisten“): der Knopf „Exportieren“ (Symbol `export`, ohne „ …“) speichert mit der eingestellten Vorlage in den Berechnungsordner (Excel, auf Wunsch PDF), gesperrt mit Grund, wenn Vorlage, Ordner oder gespeichertes Projekt fehlen; Rückfrage „‚Name.xlsx‘ ersetzen?“, danach Hinweis samt „Ordner öffnen“ und gegebenenfalls „Prüfhinweise …“ (`zeigeHinweis`).
