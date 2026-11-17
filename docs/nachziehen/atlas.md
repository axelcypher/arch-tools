# ATLAS (`apps/ordner`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **„Exportieren“ und Muster `.es-*`** (design.md „Kopf- und Werkzeugleisten“, „Einstellungen“): Ausgaben mit Dialog (Excel …, PDF …, CSV …) als Untermenü „Exportieren“ (Punkt mit `unter`) in „Datei“ statt als eigener Menüknopf. Die eigene Kopie des Musters `.es-*` (`styles.css`, genutzt in `KatasterEinstellungen.tsx`) auf `.einst*` umstellen und die App-Kopie streichen.
- **Kartenlayout (Richtung C)** (design.md „Fläche und Karten“): `.po-view` mit `.po-col` wird `Flaeche` mit Karten. Eigene Layout-CSS entfällt zugunsten der Bausteine aus `base.css`. Eigene Tabellen (`.po-table`) auf die gemeinsame Zahlentabelle `.summary-table`.
