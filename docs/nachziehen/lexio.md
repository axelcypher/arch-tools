# LEXIO (`apps/baurecht`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Abstände aus der Skala:** `styles.css` nutzt viele freie Werte (`padding: 3px 9px`, `7px 10px`, `margin: 6px 0`
  …) und eigene Radien (`5px`, `6px`). Auf `--s1`…`--s6`, `--radius-s`/`--radius` bringen; Höhen der kleinen Knöpfe
  (`min-height: 26px`) auf `--ctl-h-s`.
- **Kopf- und Werkzeugleiste nach der neuen Regel ordnen** (design.md „Kopf- und Werkzeugleisten“): `components/Kopf.tsx` – sichtbar nur die häufigen Schritte (höchstens fünf bis sieben Knöpfe bzw. Gruppen und der Hauptknopf), Seltenes in „Datei“ und „Mehr“; Aufbau links „Datei“/„Speichern“, Mitte Werkzeuge, rechts Hauptknopf und „Mehr“; mit `Werkzeugleiste` (`ui/Werkzeugleiste.tsx`) und Rang je Eintrag für den Überlauf in schmalen Fenstern. Die Titelleiste ordnet das Designsystem selbst.
