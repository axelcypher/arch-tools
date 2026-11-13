# RECTIO (`apps/entzerrung`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.
- Hinzufügen-Knöpfe mit `<Symbol name="plus" />` statt „+“ als Schriftzeichen (Regel „Listen“): „Foto …“ in `FotoLeiste.tsx` und `App.tsx`, „Ebene“ in `FotoLeiste.tsx`, mit `title` „… hinzufügen“; UI-Tests, die die Knöpfe beim Text suchen (`entzerrung.ui.test.ts`), mitziehen
