# RECTIO: aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein; die App löscht erledigte Punkte in ihrem PR. Dateiangaben beziehen sich auf den Stand beim Eintragen.

- [ ] `apps/entzerrung/src/components/Arbeitsflaeche.tsx:364`: Leerzustand „Foto hinzufügen …“ mit `className="canvas-message leer"`; Auswahl auf dem Foto mit `--sel-foto` und Saum statt eigener Farbe
- [ ] eigene `RechteLeiste` durch `BreitenLeiste seite="rechts"` ersetzen
- [ ] Werkzeugleisten mit `Symbol` statt Emoji und Schriftzeichen (📏, ⇔, ⊡, ▭, ↶/↷)
- [ ] eigene Kontextmenüs auf `zeigeMenue` umstellen (TERRIO Lageplan, RECTIO Arbeitsfläche, ATLAS Ordner-Editor)
- [ ] eigene `div.modal` auf `Modal` umstellen; Titel mit `kopf` statt `h3` im Inhalt; Werkzeugleisten-Befehle nach „Begriffe“ benennen (z. B. TERRIO „Öffnen“ → „Öffnen …“)
- [ ] eigene Menüs prüfen: Gefahr-Punkte (Löschen) ans Ende, abgesetzt durch einen Trenner
