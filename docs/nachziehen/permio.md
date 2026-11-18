# PERMIO (`apps/formulare`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Marken aus core** (design.md „Skalen“, Marken): Die runden Marken in `styles.css` gehen auf `.marke` mit Variante, je nach Rolle. Zuordnungen und Zähler nehmen `.pille` (`.fo-gl-zahl`, `.fo-gl-hinweise`), Status-Marken die eckig gerundete `.marke` mit `.warnung`, `.ok` oder `.info` (`.fo-gl-offen`, `.fo-gl-entfaellt`, `.fo-gl-freiwillig`, `.fo-sperr-marke`, `.pk-marke`, `.bd-jetzt`, `.fh-da` – je nach Bedeutung). Eigene Schriftgrößen (10–11,5px) und Zeilenhöhen fallen dabei auf `--fs-xs` und 18px. Gefüllte Balken (`.fo-gl-balken`) sind keine Marken und bleiben.
