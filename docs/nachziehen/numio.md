# NUMIO (`apps/kosten`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- Spalten-Überschriften (`h2` ohne Regel, sonst 22px) auf die Skala setzen: `--fs-l`, halbfett
- Druckvorschau: „Drucken / PDF …“ als Hauptknopf (`.primary`), „Schließen“ normal: `KostenDruck.tsx`
- eigene Umschalter (`.mv-umschalter`) auf `.segment` umstellen
- Dialoge auf `Modal` (Titel mit `kopf` statt `h3` im Inhalt) und Befehle nach „Begriffe“ benennen (Befehle, die einen Dialog öffnen, mit „ …“) – prüfen, ob noch etwas offen ist
- Flächen im Mengenplan bei `useZeichenflaecheGefiltert()` mit `planFuellungDunkel` vorrechnen: `MengenPlan.tsx`, Deckung 0,3; Farbmarken bleiben unverändert
- eigene Menüs prüfen: Gefahr-Punkte (Löschen) ans Ende, abgesetzt durch einen Trenner
