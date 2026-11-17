# PERMIO (`apps/formulare`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **„Exportieren“ in „Datei“** (design.md „Kopf- und Werkzeugleisten“): Ausgaben mit Dialog (Excel …, PDF …, CSV …) als Untermenü „Exportieren“ (Punkt mit `unter`) in „Datei“ statt als eigener Menüknopf.
- **Kartenlayout (Richtung C), Rest** (design.md „Fläche und Karten“): Fläche und Karten stehen (Navigation, Gliederung, Verlauf, Einrichten und Gruppen der Projektdaten als Seitenkarten, Abschnitte der Felderansicht, Projektdaten und Antragsdaten als Karten). Offen: die übrigen festen Farbwerte in `styles.css` (außer Zeichenfläche und Papier) zugunsten der Variablen aus `base.css`; eigene Tabellenvarianten auf die gemeinsame Zahlentabelle `.summary-table`; Bernstein (`--ausgabe`) nur für „Als PDF exportieren …“.
