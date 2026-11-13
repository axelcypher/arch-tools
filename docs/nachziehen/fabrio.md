# FABRIO (`apps/ava`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- eigene Menüs prüfen: Gefahr-Punkte (Löschen) ans Ende, abgesetzt durch einen Trenner
- „+“ in Knöpfen durch `<Symbol name="plus" />` ersetzen (Text ohne „+“): `LvEditor.tsx` („Position“, „Abschnitt“, Menüpunkte „Hinweis“, „Vorbemerkung“ ohne „+“), `Angebote.tsx` („Bieter“), `Protokolle.tsx` („Punkt“), `Maengel.tsx` („Mangel“); Auswahlliste in `Bautagebuch.tsx` als „Firma hinzufügen …“; Hinweistexte, die „+ Abschnitt“ usw. nennen, anpassen
- Gliederungsebene im LV-Editor mit Symbol `einruecken`/`ausruecken` statt `pfeilRechts`/`pfeilLinks`
