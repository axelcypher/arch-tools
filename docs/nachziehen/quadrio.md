# QUADRIO (`apps/flaechenrechner`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Meldung über der Zeichenfläche als Meldung im Inhalt** (design.md „Skalen“, Radien): core rundet `.canvas-message` als schwebende Ebene mit `--radius`. QUADRIO stellt sie in `.canvas-wrap` statisch in eine eigene Zeile (`position: static`), dort ist sie eine Meldung im Inhalt und setzt `border-radius: var(--radius-s)`.
