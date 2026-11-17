# FABRIO (`apps/ava`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **„Datei“: „Aktualisieren“ und „Exportieren“** (design.md „Kopf- und Werkzeugleisten“): In „Datei“ (Fuß der Navigation) gehören außerdem „Aktualisieren“ (ohne „ …“, wirkt sofort; statt „Neu einlesen“ im Navigationskopf, der dort dann entfällt – ob das „Neu einlesen“ im Rechnungseingang (`abrechnung/Eingang.tsx`) als Einstieg der Ansicht bleibt, prüft die App) und Ausgaben mit Dialog (Excel …, PDF …, CSV …) als Untermenü „Exportieren“ (Punkt mit `unter`) statt als eigener Menüknopf.
- **Datentabellen auf die gemeinsame Zahlentabelle** (design.md „Skalen“, Absatz zu den Kennzahlentabellen): Kostenübersicht und Kostenanschlag (Auftrag) laufen auf `.summary-table`. Die bearbeitbaren Datentabellen (LV, Angebote und Preisspiegel, Rechnungen, Mängel, Beteiligte, Dateien, Mails) stellt die App von `.ava-tabelle` auf `.summary-table.felder` um (`.text`, `th.num`/`td.num`, `tr.gruppe`, `tr.summe`, `tr.selected` für die gewählte Zeile, `.oben` für mehrzeilige Langtexte); eine eigene core-Variante gibt es nicht. Fehlt dabei etwas (z. B. fester Spaltenkopf), meldet die App es dem Designsystem, das `.summary-table` ergänzt.
