# PERMIO (`apps/formulare`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Kopf- und Werkzeugleiste nach der neuen Regel ordnen** (design.md „Kopf- und Werkzeugleisten“): Werkzeugleiste in `App.tsx` (26 Knöpfe) – sichtbar nur die häufigen Schritte (höchstens fünf bis sieben Knöpfe bzw. Gruppen und der Hauptknopf), Seltenes in „Datei“ und „Mehr“; Aufbau links „Datei“/„Speichern“, Mitte Werkzeuge, rechts Hauptknopf und „Mehr“; mit `Werkzeugleiste` (`ui/Werkzeugleiste.tsx`) und Rang je Eintrag für den Überlauf in schmalen Fenstern. Die Titelleiste ordnet das Designsystem selbst.
