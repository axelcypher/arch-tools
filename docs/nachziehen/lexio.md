# LEXIO (`apps/baurecht`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Text nur für Screenreader aus core** (design.md „Fokus und Tastatur“): `.br-unsichtbar` in `styles.css` wiederholt die Regel von `.unsichtbar` und entfällt zugunsten von `.unsichtbar`. `.br-kopf-label` bleibt als bedingte Regel in der Container-Query (`@container app (max-width: 1199px)`, `styles.css` um Zeile 183; keine feste Klasse am Element, sonst wäre die Beschriftung in jeder Breite weg), übernimmt aber `margin: -1px`, `padding: 0`, `border: 0` und `clip-path: inset(50%)` aus `.unsichtbar`; ebenso ergänzt `.br-sprung button:not(:focus)` (um Zeile 1184) `margin: -1px`, `clip-path: inset(50%)` und `white-space: nowrap`.
