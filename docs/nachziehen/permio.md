# PERMIO: aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein; die App löscht erledigte Punkte in ihrem PR. Dateiangaben beziehen sich auf den Stand beim Eintragen.

- [ ] eigenes Menü und eigene Symbole (`components/Menue.tsx`, `components/Symbol.tsx`, `.menue`- und `.symbol`-Regeln in `styles.css`) durch `@core/ui/Menue` und `@core/ui/Symbol` ersetzen; fehlende Symbole im core-Satz ergänzen
- [ ] eigene `div.modal` auf `Modal` umstellen; Titel mit `kopf` statt `h3` im Inhalt; Werkzeugleisten-Befehle nach „Begriffe“ benennen (z. B. TERRIO „Öffnen“ → „Öffnen …“)
- [ ] Tastenkürzel in Menüs von `hinweis` auf `tasten` umstellen (`Canvas.tsx` Strg+C, Strg+D, Entf, F; PERMIO `App.tsx` Strg+E)
- [ ] eigene Menüs prüfen: Gefahr-Punkte (Löschen) ans Ende, abgesetzt durch einen Trenner
- [ ] „Im Explorer öffnen“ → „Ordner öffnen“ (ATLAS `ProjektStart.tsx`; PERMIO `Seitenleiste.tsx`, `AblageBaum.tsx`)
