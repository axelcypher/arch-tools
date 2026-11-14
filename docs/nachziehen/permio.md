# PERMIO (`apps/formulare`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Satz für ungespeicherte Änderungen angleichen** (design.md „Ungespeicherte Änderungen“): `dateiVerlassen` (`src/store.ts`) übergibt „Die Eingaben in dieser PDF sind noch nicht gespeichert und gingen sonst verloren.“ – auf das Muster bringen: „Das Formular hat ungespeicherte Änderungen.“ (bzw. „Das Dokument …“), denselben Satz an der `TitleBar` (`ungespeichert`) setzen.
