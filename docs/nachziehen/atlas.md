# ATLAS: aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein; die App löscht erledigte Punkte in ihrem PR. Dateiangaben beziehen sich auf den Stand beim Eintragen.

- [ ] `outline: none` prüfen: `apps/ordner/src/styles.css:415`
- [ ] eigene Kontextmenüs auf `zeigeMenue` umstellen (TERRIO Lageplan, RECTIO Arbeitsfläche, ATLAS Ordner-Editor)
- [ ] eigene `div.modal` auf `Modal` umstellen; Titel mit `kopf` statt `h3` im Inhalt; Werkzeugleisten-Befehle nach „Begriffe“ benennen (z. B. TERRIO „Öffnen“ → „Öffnen …“)
- [ ] Umsortieren mit `Symbol` `nachOben`/`nachUnten` statt ↑/↓; Zeilenknopf „⋯“ mit Symbol `mehr` und `aria-haspopup="menu"` (dann setzt das Menü `aria-expanded`)
- [ ] eigene Menüs prüfen: Gefahr-Punkte (Löschen) ans Ende, abgesetzt durch einen Trenner
- [ ] „Im Explorer öffnen“ → „Ordner öffnen“ (ATLAS `ProjektStart.tsx`; PERMIO `Seitenleiste.tsx`, `AblageBaum.tsx`)
