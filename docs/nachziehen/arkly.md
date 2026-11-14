# Arkly (`apps/suite`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Kopfleiste nach der neuen Regel ordnen** (design.md „Titelleiste“, „Kopf- und Werkzeugleisten“): `App.tsx` – oben nur Tabs, „+“, Update solange eines vorliegt, das Menü „Einstellungen und Hilfe“ (`MenueKnopf`, Symbol `menue`, `pfeil={false}`, Name in `ariaLabel` und `title`) und die Fensterknöpfe. Ins Menü: Farbschema (`farbschemaPunkte(false)`), Speicherort (`speicherortPunkt`; sichtbar nur im Notbetrieb über `SpeicherortAnzeige ort={…} nurWarnung` wie in der Titelleiste) und das Übrige. „⧉“ (Herauslösen) vom Tab nehmen – bleibt im Kontextmenü des Tabs.
