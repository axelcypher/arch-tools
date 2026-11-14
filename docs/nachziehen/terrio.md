# TERRIO (`apps/grz`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Kopf- und Werkzeugleiste nach der neuen Regel ordnen** (design.md „Kopf- und Werkzeugleisten“): Werkzeugleiste in `App.tsx` – was sichtbar bleibt, die festen Menüs, die Reihenfolge darin und der Aufbau stehen dort; umsetzen mit `Werkzeugleiste` (`ui/Werkzeugleiste.tsx`) und Rang je Eintrag für den Überlauf in schmalen Fenstern. Die Titelleiste ordnet das Designsystem selbst.
- **Kompaktstufe der Werkzeugleiste** (design.md „Kopf- und Werkzeugleisten“): mit dem Umbau auf `Werkzeugleiste` (Punkt oben), nicht vorher, die eigene Media-Query für `.toolbar .tb-text` in `styles.css` streichen – dann blendet die Leiste Knopftexte selbst aus (`.kompakt`), erst wenn alle Einträge mit Rang im Menü stehen. `tb-text` nur in Knöpfen mit Symbol und `aria-label`/`title` (`App.tsx`). Beim Umbau prüfen: Menüknöpfe mit Symbol und `tb-text` (die Kompaktform greift nur, wenn `.tb-text` direkt im Knopf steht).
