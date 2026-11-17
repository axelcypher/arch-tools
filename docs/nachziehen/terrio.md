# TERRIO (`apps/grz`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.

- **„Exportieren“ in „Datei“** (design.md „Kopf- und Werkzeugleisten“): Ausgaben mit Dialog (Excel …, PDF …, CSV …) als Untermenü „Exportieren“ (Punkt mit `unter`) in „Datei“ statt als eigener Menüknopf. Dazu **direkter Export** (design.md „Kopf- und Werkzeugleisten“): der Knopf „Exportieren“ (Symbol `export`, ohne „ …“) speichert mit der eingestellten Vorlage in den Berechnungsordner (Excel, auf Wunsch PDF), gesperrt mit Grund, wenn Vorlage, Ordner oder gespeichertes Projekt fehlen; Rückfrage „‚Name.xlsx‘ ersetzen?“, danach Hinweis samt „Ordner öffnen“ und gegebenenfalls „Prüfhinweise …“ (`zeigeHinweis`).
- **Verweisknopf aus core** (design.md „Skalen“): `button.link` steht jetzt in base.css – die eigene Regel in apps/grz/src/styles.css entfällt.
