# arch-tools – Regeln für die Arbeit mit Claude

Kommunikation, Oberfläche, Commit-Texte und Doku sind auf **Deutsch**. Die verbindlichen Projektregeln (öffentliches
Repo ohne Kundendaten, Versionen an fünf Stellen, Rust nur über PR mit CI, Prüfungen vor jedem Push, Doku nachziehen)
stehen in [docs/review-umsetzung-handoff.md](docs/review-umsetzung-handoff.md), Abschnitt „Regeln“.

## Review-Pflicht (projektweit)

Jede abgeschlossene Änderung wird vor dem Merge von Review-Agenten geprüft (`.claude/agents/`):

- **review-code** – Code: Korrektheit, Tests, Lesbarkeit, Projektregeln (immer)
- **review-baurecht** – fachlich-rechtliche Inhalte: BauO NRW, BauPrüfVO, BauNVO, BauGB, HOAI, DIN 277, WoFlV
  (wenn Fachliches betroffen ist)
- **review-design** – Oberfläche: Designsystem, Hell/Dunkel, Bedienung, Barrierefreiheit (wenn die Oberfläche
  betroffen ist)

Jeder Agent vergibt eine Wertung von 0 bis 10 mit kurzem Protokoll (warum durchgefallen, wie die 8,5 erreicht
werden). **Bestanden nur über 8,5.** Darunter wird nachgebessert und erneut geprüft, bis alle betroffenen Agenten
bestehen. Das Ergebnis (Wertungen) gehört in den Bericht an den Nutzer.
