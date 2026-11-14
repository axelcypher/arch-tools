# ATLAS (`apps/ordner`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **Satz für ungespeicherte Änderungen prüfen** (design.md „Ungespeicherte Änderungen“): Meint „ungespeichert“ nur einen Teil des Projekts, den Satz in Nutzersprache setzen („Die Ordnerstruktur hat ungespeicherte Änderungen.“) – an der `TitleBar` (`ungespeichert`) und als dritter Parameter eigener `aenderungenSpeichern`-Aufrufe. Passt der Rückfall „Das Projekt hat ungespeicherte Änderungen.“, den Punkt einfach löschen.
- **Keine Programmnamen anderer Hersteller** (design.md „Begriffe“): `src/plan.ts` („Explorer und Office“) allgemein fassen, etwa „Dateimanager und andere Programme“; „Windows“ bleibt, weil die Pfadgrenze vom Betriebssystem kommt. QGIS (von der App gestartet) und „Mails aus Outlook ziehen“ (Herkunft der Mails) sind ausgenommen.
