# NUMIO: aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein; die App löscht erledigte Punkte in ihrem PR. Dateiangaben beziehen sich auf den Stand beim Eintragen.

- [ ] Spalten-Überschriften (`h2` ohne Regel, sonst 22px) auf die Skala setzen: `--fs-l`, halbfett
- [ ] Druckvorschau: „Drucken / PDF …“ als Hauptknopf (`.primary`), „Schließen“ normal (`NachweisDruck.tsx`, `KostenDruck.tsx`)
- [ ] eigene Umschalter (`.mv-umschalter`) auf `.segment` umstellen
- [ ] eigene `div.modal` auf `Modal` umstellen; Titel mit `kopf` statt `h3` im Inhalt; Werkzeugleisten-Befehle nach „Begriffe“ benennen (z. B. TERRIO „Öffnen“ → „Öffnen …“)
- [ ] Raumfüllungen bzw. Lageplanflächen bei `useZeichenflaecheGefiltert()` mit `planFuellungDunkel` vorrechnen (`Canvas.tsx` Deckung 0,45; `LageplanEditor.tsx` alle Deckungen 0,55/0,45/0,15/0,12; NUMIO `MengenPlan.tsx` 0,3); Marken bleiben unverändert
- [ ] eigene Menüs prüfen: Gefahr-Punkte (Löschen) ans Ende, abgesetzt durch einen Trenner
