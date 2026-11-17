# LEXIO (`apps/baurecht`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **„Exportieren“ in „Datei“** (design.md „Kopf- und Werkzeugleisten“): Ausgaben mit Dialog (Excel …, PDF …, CSV …) als Untermenü „Exportieren“ (Punkt mit `unter`) in „Datei“ statt als eigener Menüknopf. Für den Hinweis nach einer Aktion (`zeigeHinweis`, `ui/Hinweis.tsx`): beim Start `hinweisF6Eigen()` aufrufen, damit nicht zwei F6-Handler laufen, und den Stapel im F6-Kreis von LEXIO (`App.tsx`) mit `hinweisFokussieren()` als letzte Station aufnehmen (liefert `false` ohne Hinweis, dann übersprungen); F6 im Hinweis springt weiter zur ersten Station.
- **Kartenkopf bricht in core um** (design.md „Fläche und Karten“, Kopf): `.br-angaben > .karte-kopf { flex-wrap }` und `.br-angaben > .karte-kopf h2 { flex: 1 0 auto }` in `styles.css` entfallen. `.karte-aktionen { margin-left: 0 }` (Aktionen links in der zweiten Zeile) prüft die App: In core stehen sie rechtsbündig.
