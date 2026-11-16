# FABRIO (`apps/ava`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **„Datei“ mit „Einstellungen …“ und „Exportieren“** (design.md „Kopf- und Werkzeugleisten“, „Einstellungen“): „Datei“ gibt es in jeder App; letzter Punkt hinter einem Trenner „Einstellungen …“ (`tasten: 'Strg+,'`, wirkt auch ohne offenes Menü) – er öffnet den zentralen Einstellungsdialog auf der Seite der App, sobald der Dialog im Designsystem (`packages/core`) bereitsteht. Ausgaben mit Dialog (Excel …, PDF …, CSV …) als Untermenü „Exportieren“ (Punkt mit `unter`) in „Datei“ statt als eigener Menüknopf. App-eigene Einstellungen ziehen auf die Seite der App im Dialog. In FABRIO zieht das vorhandene Strg+, (`App.tsx`) auf den zentralen Dialog um, an die Stelle des Knopfs „Einstellungen …“ unten in der Navigation (`components/Navigation.tsx`) tritt das Menü „Datei“ (ohne durchgehende Werkzeugleiste steht es im Fuß der Navigation) mit „Einstellungen von FABRIO …“, Trenner, „Einstellungen …“ (Strg+,); die eigenen Einstellungen (Ablage, Benennung, Prüfung, Deckblatt, Scanordner, Mailvorlagen) verteilen sich auf die Seite FABRIO und „Pfade und Benennung“.
