# LEXIO (`apps/baurecht`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Text nur für Screenreader aus core** (design.md „Fokus und Tastatur“): `.br-unsichtbar` und `.br-kopf-label` (im Media-Query) in `styles.css` wiederholen die Regel von `.unsichtbar`; sie entfallen zugunsten von `.unsichtbar` (für `.br-kopf-label` nur innerhalb des Media-Query, dort als zusätzliche Klasse am Element oder über die Regel). Der Sprunglink `.br-sprung button:not(:focus)` bleibt eigene Regel, weil er beim Fokus sichtbar wird.
