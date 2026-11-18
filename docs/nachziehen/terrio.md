# TERRIO (`apps/grz`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Schriftgrößen aus der Skala** (design.md „Skalen“): `styles.css` setzt noch freie Schriftgrößen (11px viermal, 12px achtmal, je einmal 10,5 und 11,5px). Sie gehen nach Rolle auf `--fs-xs` (11px: Beschriftung, Hinweis, Tabellenkopf) bzw. `--fs-s` (12px: Nebentext, dichte Tabellen); 10,5 und 11,5px auf die nächste Stufe ihrer Rolle.
