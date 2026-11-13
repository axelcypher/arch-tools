# ATLAS (`apps/ordner`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- `outline: none` prüfen: `apps/ordner/src/styles.css:415`
- eigenes Kontextmenü im Ordner-Editor auf `zeigeMenue` umstellen
- Dialoge auf `Modal` (Titel mit `kopf` statt `h3` im Inhalt) und Befehle nach „Begriffe“ benennen (Befehle, die einen Dialog öffnen, mit „ …“) – prüfen, ob noch etwas offen ist
- Umsortieren mit `Symbol` `nachOben`/`nachUnten` statt ↑/↓; Zeilenknopf „⋯“ mit Symbol `mehr` und `aria-haspopup="menu"` (dann setzt das Menü `aria-expanded`)
- eigene Menüs prüfen: Gefahr-Punkte (Löschen) ans Ende, abgesetzt durch einen Trenner
- „Im Explorer öffnen“ → „Ordner öffnen“: `ProjektStart.tsx`
