# LEXIO (`apps/baurecht`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- Eigene Überschreibung von `--muted` in `.br-app` löschen – das gemeinsame `--muted` hält jetzt auf Tönungen 4,5 : 1: `styles.css`
- Ampelpunkte `.br-ampel-punkt` und `--br-punkt-*` durch `.statuspunkt` (`.ok`, `.warnung`, `.fehler`) bzw. `--ok-punkt`, `--warn-punkt`, `--fehler-punkt` ersetzen; im Protokoll (`.report`) gelten die hellen Werte von selbst: `styles.css`
- Antworten im Regelbaum: `.br-segment`/`.br-segment-senkrecht` durch `.segment` bzw. `.segment.senkrecht` ersetzen: `styles.css` und die Komponenten mit diesen Klassen
- Zustand „offen“ im Regelbaum mit Symbol `frage` (neben `haken` für „trifft zu“, `schliessen` für „trifft nicht zu“): Komponenten mit Zustandsanzeige, z. B. `Vorschriften.tsx`, `Detail.tsx`
