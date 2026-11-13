# TERRIO (`apps/grz`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- Spalten-Überschriften (`h2` ohne Regel, sonst 22px) auf die Skala setzen: `--fs-l`, halbfett
- Druckvorschau: „Drucken / PDF …“ als Hauptknopf (`.primary`), „Schließen“ normal: `NachweisDruck.tsx`
- Werkzeugleisten mit `Symbol` statt Emoji und Schriftzeichen (📏, ⇔, ⊡, ▭, ↶/↷)
- eigenes Kontextmenü im Lageplan auf `zeigeMenue` umstellen
- Dialoge auf `Modal` (Titel mit `kopf` statt `h3` im Inhalt) und Befehle nach „Begriffe“ benennen (Befehle, die einen Dialog öffnen, mit „ …“) – prüfen, ob noch etwas offen ist
- Lageplanflächen bei `useZeichenflaecheGefiltert()` mit `planFuellungDunkel` vorrechnen: `LageplanEditor.tsx`, alle Deckungen (0,55/0,45/0,15/0,12); Farbmarken bleiben unverändert
- eigene Menüs prüfen: Gefahr-Punkte (Löschen) ans Ende, abgesetzt durch einen Trenner
- ungespeicherte Änderungen am Knopf „Speichern“ mit `className="ungespeichert"` statt „Speichern •“ im Text bzw. `tb-dirty` (mit oder nach #70): `App.tsx`
- Lageplan-Werkzeuge „Grenze“ mit Symbol `grenze`, „Ausrichten“ mit `ausrichten` (mit oder nach #70; dort bisher `ziel`)
