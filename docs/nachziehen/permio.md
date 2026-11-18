# PERMIO (`apps/formulare`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Berechnete Felder aus core** (design.md „Felder“): `.fo-feld :is(textarea, input[type='text']).berechnet` in `styles.css` entfällt, core setzt `input.berechnet`/`textarea.berechnet` gleich (Grund `--bg`, gestrichelt, Textfarbe). `.fo-summe-aus` (`FelderAnsicht.tsx`) wird `.feld-herkunft`. Gesperrte Felder aus FORMA (`disabled`) behalten ihre eigene Regel für `opacity`.
