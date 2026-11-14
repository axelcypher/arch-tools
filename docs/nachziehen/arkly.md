# Arkly (`apps/suite`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Rückfragen ohne Speichermöglichkeit und beim Umzug ohne Verlust** (design.md „Ungespeicherte Änderungen“, gemeinsamer Kern `packages/core`): `aenderungenVerwerfen` in `ui/Rueckfrage.tsx` einführen und nutzen – `ui/TitleBar.tsx` fragt noch „Ungespeicherte Änderungen verwerfen?“ statt „Änderungen an ‚Name‘ verwerfen?“; `ui/umzug.ts` fragt „App herauslösen?“ bzw. „… andocken?“ mit dem Satz aus `beimUmzug` statt dem festen Wortlaut. Übernimmt Arkly/core (Zweig `kann-speichern`).
