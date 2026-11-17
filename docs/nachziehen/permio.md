# PERMIO (`apps/formulare`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **„Exportieren“ in „Datei“** (design.md „Kopf- und Werkzeugleisten“): Ausgaben mit Dialog (Excel …, PDF …, CSV …) als Untermenü „Exportieren“ (Punkt mit `unter`) in „Datei“ statt als eigener Menüknopf.
- **Tabelle der Projektdatei-Angaben** (design.md „Tabellen“): Die Tabelle „In den Projektdaten | In der Projektdatei“ auf der Einstellungsseite PERMIO (`components/Einstellungen.tsx`, Klasse `es-tabelle`) auf `.summary-table text` umstellen und danach `.es-tabelle` aus `styles.css` löschen – Änderungen an `Einstellungen.tsx` werden über die Koordination abgestimmt.
