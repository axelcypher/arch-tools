# PERMIO (`apps/formulare`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- eigenes Menü und eigene Symbole (`components/Menue.tsx`, `components/Symbol.tsx`, `.menue`- und `.symbol`-Regeln in `styles.css`) durch `@core/ui/Menue` und `@core/ui/Symbol` ersetzen; fehlende Symbole beim Designsystem anfragen
- Dialoge auf `Modal` (Titel mit `kopf` statt `h3` im Inhalt) und Befehle nach „Begriffe“ benennen (Befehle, die einen Dialog öffnen, mit „ …“) – prüfen, ob noch etwas offen ist
- Tastenkürzel in Menüs von `hinweis` auf `tasten` umstellen: `App.tsx` (Strg+E)
- eigene Menüs prüfen: Gefahr-Punkte (Löschen) ans Ende, abgesetzt durch einen Trenner
- „Im Explorer öffnen“ → „Ordner öffnen“: `Seitenleiste.tsx`, `AblageBaum.tsx` (zwei Menüpunkte und ein `title`)
- `AnsichtEditor` (core, Pflege bei PERMIO): „+ Abschnitt“ durch `<Symbol name="plus" />` mit „Abschnitt“ und `title`/`aria-label` „Abschnitt hinzufügen“ ersetzen: `packages/core/src/ui/AnsichtEditor.tsx`
