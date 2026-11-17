# LEXIO (`apps/baurecht`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **„Exportieren“ in „Datei“** (design.md „Kopf- und Werkzeugleisten“): Ausgaben mit Dialog (Excel …, PDF …, CSV …) als Untermenü „Exportieren“ (Punkt mit `unter`) in „Datei“ statt als eigener Menüknopf. Für den Hinweis nach einer Aktion (`zeigeHinweis`, `ui/Hinweis.tsx`): beim Start `hinweisF6Eigen()` aufrufen, damit nicht zwei F6-Handler laufen, und den Stapel im F6-Kreis von LEXIO (`App.tsx`) mit `hinweisFokussieren()` als letzte Station aufnehmen (liefert `false` ohne Hinweis, dann übersprungen); F6 im Hinweis springt weiter zur ersten Station.
