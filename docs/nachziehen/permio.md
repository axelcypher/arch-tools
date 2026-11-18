# PERMIO (`apps/formulare`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Marken aus core** (design.md „Skalen“, Marken): Die runden Marken in `styles.css` gehen auf `.marke` mit Variante, je nach Rolle. Zuordnungen und Zähler nehmen `.pille` (`.fo-gl-zahl`, `.fo-gl-hinweise`), Status-Marken (`.fo-gl-offen`, `.fo-gl-entfaellt`, `.fo-gl-freiwillig`, `.fo-sperr-marke`, `.pk-marke`, `.bd-jetzt`, `.fh-da`) `.marke` mit kleiner Rundung und je nach Bedeutung `.warnung`, `.ok` oder `.info`. Fehlerzustände (`.fo-gl-hinweise.fehler`, `.fo-sperr-marke.benutzt`) nehmen `.fehler`. Eigene Schriftgrößen (10–11,5px) und Zeilenhöhen fallen dabei auf `--fs-xs` und 18px. Gefüllte Balken (`.fo-gl-balken`) sind keine Marken und bleiben.
- **Art `hinweis` an eigenen Elementen** (design.md „Meldungen im Inhalt“): `.hinweis` ist in core der schwebende Hinweis und bringt dessen Werte mit (z. B. Schatten). `.fo-meldung.hinweis` (`App.tsx`), `.fo-pruef-zeile.hinweis` (`FelderAnsicht.tsx`) und `.fo-entfall-info.hinweis` (`Hinweise.tsx`) nehmen deshalb eine eigene Art bzw. `.warnung` statt `hinweis`.
