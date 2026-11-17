# PERMIO (`apps/formulare`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **„Exportieren“ in „Datei“** (design.md „Kopf- und Werkzeugleisten“): Ausgaben mit Dialog (Excel …, PDF …, CSV …) als Untermenü „Exportieren“ (Punkt mit `unter`) in „Datei“ statt als eigener Menüknopf.
- **Rollende Spalte aus core** (design.md „Fläche und Karten“): Felder- und Seitenansicht über `FlaechenSpalte wachsend rollend` statt der eigenen Regel `.fo-inhalt` (overflow, Rand für den Fokussaum); die Abschnittskarten mit `ebene={3}` und `als="div"`, damit die Seite nicht Dutzende Regionen und gleichrangige h2 bekommt. Darüber ein sichtbares `h2` (z. B. der Name des Formulars als Kopf über der Spalte); Unterabschnitte in den Abschnittskarten `h4`. Eigene Regeln auf `.karte-kopf h2` (z. B. `.pk-editor > .karte-kopf h2`) für diese Karten auf `.karte-kopf :is(h2, h3)` umstellen.
- **Kartenkopf bricht in core um** (design.md „Fläche und Karten“, Kopf): `.pk-editor > .karte-kopf { flex-wrap }` und `.pk-editor > .karte-kopf h2 { flex: 1 1 12rem }` in `apps/formulare/src/styles.css` entfallen.
