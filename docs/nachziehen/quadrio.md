# QUADRIO (`apps/flaechenrechner`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.
- Hinzufügen-Knöpfe mit `<Symbol name="plus" />` statt „+“ als Schriftzeichen (Regel „Listen“): `Sidebar.tsx` „+ Neu …“ → „Geschoss …“ (öffnet eine Rückfrage; „Neu“ ist schon „Neues Projekt“), `RoofEditor.tsx` „+ Gaube“ → „Gaube“, jeweils mit `title` „… hinzufügen“
