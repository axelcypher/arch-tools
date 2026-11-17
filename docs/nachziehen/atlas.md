# ATLAS (`apps/ordner`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **„Exportieren“ und Muster `.es-*`** (design.md „Kopf- und Werkzeugleisten“, „Einstellungen“): Ausgaben mit Dialog (Excel …, PDF …, CSV …) als Untermenü „Exportieren“ (Punkt mit `unter`) in „Datei“ statt als eigener Menüknopf. Die eigene Kopie des Musters `.es-*` (`styles.css`, genutzt in `KatasterEinstellungen.tsx`) auf `.einst*` umstellen und die App-Kopie streichen.
- **Verweisknopf aus core** (design.md „Kopf- und Werkzeugleisten“, Knopfstufen): Der Knopf „Ordner öffnen“ im Ergebnis der Katasterpläne (KatasterDialog.tsx, `button.link`) bekommt jetzt die core-Regel (dezent unterstrichen); die Farbe des Ergebnisses (`.ka-ergebnis button { color: inherit }`) bleibt. Prüfen, ob Haken und Dateiname so stimmig sind, und die doppelten Angaben in `.ka-ergebnis button` (Rahmen, Grund, Innenabstand) samt `.ka-ergebnis button:hover` streichen.
