# QUADRIO (`apps/flaechenrechner`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- Dialoge auf `Modal` (Titel mit `kopf` statt `h3` im Inhalt) und Befehle nach „Begriffe“ benennen (Befehle, die einen Dialog öffnen, mit „ …“) – prüfen, ob noch etwas offen ist
- Raumfüllungen bei `useZeichenflaecheGefiltert()` mit `planFuellungDunkel` vorrechnen: `Canvas.tsx`, Deckung 0,45; Farbmarken bleiben unverändert
- Tastenkürzel in Menüs von `hinweis` auf `tasten` umstellen: `Canvas.tsx` (Strg+C, Strg+D, Entf, F)
- eigene Menüs prüfen: Gefahr-Punkte (Löschen) ans Ende, abgesetzt durch einen Trenner
- eigenen Punkt `tb-dirty` am Knopf „Speichern“ durch `className="ungespeichert"` ersetzen und die eigene Regel löschen: `Toolbar.tsx`, `styles.css`
