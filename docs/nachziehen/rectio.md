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
- Hinzufügen-Knöpfe mit `<Symbol name="plus" />` statt „+“ als Schriftzeichen (Regel „Listen“): „Foto …“ in `FotoLeiste.tsx` und `App.tsx`, „Ebene“ in `FotoLeiste.tsx`, mit `title` „… hinzufügen“; UI-Tests, die die Knöpfe beim Text suchen (`entzerrung.ui.test.ts`), mitziehen
