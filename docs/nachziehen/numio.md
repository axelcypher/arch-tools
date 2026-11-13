# NUMIO (`apps/kosten`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

Erledigt mit #37: Spaltenüberschriften, Druckvorschau, `.segment`, `Modal` mit `kopf` und „ …“,
`planFuellungDunkel` im Mengenplan; NUMIO hat keine eigenen Menüs.

- Hinzufügen-Knöpfe mit `<Symbol name="plus" />` statt „+“ als Schriftzeichen (Regel „Listen“): `KostenView.tsx` (Position, Kostenrisiko), mit `title` „… hinzufügen“; UI-Tests, die die Knöpfe beim Text suchen (`kostenansicht.ui.test.ts`), mitziehen
