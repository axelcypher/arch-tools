# QUADRIO (`apps/flaechenrechner`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Kompaktstufe der Werkzeugleiste nutzen** (design.md „Kopf- und Werkzeugleisten“): `styles.css` blendet Knopftexte noch per `@media (max-width: 1197px)` (`.tb-text`) und `@media (max-width: 1131px)` (`.tb-werkzeug-text`) aus – beide Queries streichen und die Werkzeugtexte ebenfalls als `tb-text` auszeichnen (`components/Toolbar.tsx`); dann verschwinden die Texte erst, wenn alle Einträge mit Rang im Menü stehen, und „Exportieren“ springt nicht mehr zurück. Dabei prüfen: die Marke „ungespeichert“ am dann schmalen Speichern-Knopf (Hell/Dunkel) und Menüknöpfe mit Symbol (die Kompaktform greift nur, wenn `.tb-text` direkt im Knopf steht).
