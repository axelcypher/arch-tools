# PERMIO (`apps/formulare`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **„Exportieren“ in „Datei“** (design.md „Kopf- und Werkzeugleisten“): Ausgaben mit Dialog (Excel …, PDF …, CSV …) als Untermenü „Exportieren“ (Punkt mit `unter`) in „Datei“ statt als eigener Menüknopf.
- **Kartenkopf bricht in core um** (design.md „Fläche und Karten“, Kopf): `.pk-editor > .karte-kopf { flex-wrap }` und `.pk-editor > .karte-kopf h2 { flex: 1 1 12rem }` in `apps/formulare/src/styles.css` entfallen.
- **Fester Kopf der rollenden Spalte aus core** (design.md „Fläche und Karten“, Rollende Spalte): Suche und Filter der Felderansicht (`.fo-felder-kopf` in `FelderAnsicht.tsx`, zuoberst in der Hülle `.fo-felder`) bekommen zusätzlich `rollend-kopf` und `role="search"` mit `aria-label`; in `styles.css` entfallen an `.fo-felder-kopf` `position`, `top`, `margin-top`, `padding-top`, `padding-bottom`, `z-index` und `background` (die Anordnung mit `display: flex`, `gap`, `flex-wrap` bleibt). Weil der Kopf in schmalen Fenstern umbricht (`flex-wrap`, `.fo-feldsuche`), setzt die App `--rollend-kopf-h` für die zweizeilige Stufe per Container- oder Media-Abfrage.
