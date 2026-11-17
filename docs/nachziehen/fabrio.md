# FABRIO (`apps/ava`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **„Datei“: „Aktualisieren“ und „Exportieren“** (design.md „Kopf- und Werkzeugleisten“): In „Datei“ (Fuß der Navigation) gehören außerdem „Aktualisieren“ (ohne „ …“, wirkt sofort; statt „Neu einlesen“ im Navigationskopf, der dort dann entfällt – ob das „Neu einlesen“ im Rechnungseingang (`abrechnung/Eingang.tsx`) als Einstieg der Ansicht bleibt, prüft die App) und Ausgaben mit Dialog (Excel …, PDF …, CSV …) als Untermenü „Exportieren“ (Punkt mit `unter`) statt als eigener Menüknopf.
