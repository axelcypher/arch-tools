# QUADRIO (`apps/flaechenrechner`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- Dialoge auf `Modal` (Titel mit `kopf` statt `h3` im Inhalt) und Befehle nach „Begriffe“ benennen (Befehle, die einen Dialog öffnen, mit „ …“) – prüfen, ob noch etwas offen ist
- eigenen Punkt `tb-dirty` am Knopf „Speichern“ durch `className="ungespeichert"` ersetzen und die eigene Regel löschen: `Toolbar.tsx`, `styles.css`
- „+ Neu“ (Geschoss) durch `<Symbol name="plus" />` und „Neu“ bzw. „Geschoss …“ ersetzen: `Sidebar.tsx`
