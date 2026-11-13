# RECTIO (`apps/entzerrung`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- `Arbeitsflaeche.tsx`: Leerzustand „Foto hinzufügen …“ mit `className="canvas-message leer"`; Auswahl auf dem Foto mit `--sel-foto` und Saum statt eigener Farbe
- eigene `RechteLeiste` durch `BreitenLeiste seite="rechts"` ersetzen
- Werkzeugleisten mit `Symbol` statt Emoji und Schriftzeichen (📏, ⇔, ⊡, ▭)
- eigenes Kontextmenü der Arbeitsfläche auf `zeigeMenue` umstellen
- Dialoge auf `Modal` (Titel mit `kopf` statt `h3` im Inhalt) und Befehle nach „Begriffe“ benennen (Befehle, die einen Dialog öffnen, mit „ …“) – prüfen, ob noch etwas offen ist
- eigene Menüs prüfen: Gefahr-Punkte (Löschen) ans Ende, abgesetzt durch einen Trenner
- „+ Foto …“ und „+ Ebene“ durch `<Symbol name="plus" />` mit „Foto …“ bzw. „Ebene“ ersetzen: `FotoLeiste.tsx`, `App.tsx`
