# PERMIO (`apps/formulare`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Symbolknöpfe der Werkzeugleiste** (design.md „Zielgrößen“): Die globale Regel `button.icon { min-width: 24px; height: 24px; padding: 0 4px }` in `styles.css` hält „Mehr“ und Rückgängig in der Werkzeugleiste auf 24 px Breite (Höhe wird 28) – die Werkzeugleiste ausnehmen (`button.icon:not(.werkzeugleiste *)`); danach ist „Mehr“ dort 28×28 wie in den anderen Apps.
