# NUMIO (`apps/kosten`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **„Exportieren“ in „Datei“** (design.md „Kopf- und Werkzeugleisten“): Ausgaben mit Dialog (Excel …, PDF …, CSV …) als Untermenü „Exportieren“ (Punkt mit `unter`) in „Datei“ statt als eigener Menüknopf. Dazu **direkter Export** (design.md „Kopf- und Werkzeugleisten“): der Knopf „Exportieren“ (Symbol `export`, ohne „ …“) speichert mit der eingestellten Vorlage in den Berechnungsordner (Excel, auf Wunsch PDF), gesperrt mit Grund, wenn Vorlage, Ordner oder gespeichertes Projekt fehlen; Rückfrage „‚Name.xlsx‘ ersetzen?“, danach Hinweis samt „Ordner öffnen“ und gegebenenfalls „Prüfhinweise …“ (`zeigeHinweis`).
- **Kartenlayout (Richtung C)** (design.md „Fläche und Karten“): `.ko-view` mit `.ko-links`/`.ko-rechts` und `.ko-col` wird `Flaeche` mit `FlaechenSpalte` links („Grundlagen“, „Mengen“) und Karten rechts („Positionen“, „Kostenschätzung“); ebenso `.mv-view`. Eigene Layout-CSS entfällt, ebenso der eine feste Farbwert in `styles.css` (außer Zeichenfläche und Papier) zugunsten der Variablen aus `base.css`. Eigene Tabellen (`.ko-table`) auf die gemeinsame Zahlentabelle `.summary-table`.
