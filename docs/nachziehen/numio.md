# NUMIO (`apps/kosten`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

Zurzeit nichts offen. Erledigt mit #37: Spaltenüberschriften, Druckvorschau, `.segment`, `Modal` mit `kopf` und „ …“,
`planFuellungDunkel` im Mengenplan; NUMIO hat keine eigenen Menüs. Hinzufügen-Knöpfe mit Symbol `plus` (Position, Kostenrisiko).

- **Kopf- und Werkzeugleiste nach der neuen Regel ordnen** (design.md „Kopf- und Werkzeugleisten“): Werkzeugleiste in `App.tsx` – was sichtbar bleibt, die festen Menüs, die Reihenfolge darin und der Aufbau stehen dort; umsetzen mit `Werkzeugleiste` (`ui/Werkzeugleiste.tsx`) und Rang je Eintrag für den Überlauf in schmalen Fenstern. Die Titelleiste ordnet das Designsystem selbst.
