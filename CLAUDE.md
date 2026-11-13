# Hinweise für Claude

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

## Ablauf nach jeder Änderung

Sobald die Reviews bestanden sind, immer Pull Request auf `main` anlegen und mergen – ohne extra nachzufragen:

1. Vor dem PR `npm test`, `npm run typecheck` und `npm run build` lokal laufen lassen.
2. Arbeitszweig pushen, PR gegen `main` öffnen.
3. Warten, bis alle CI-Checks grün sind (bei Fehlern beheben und erneut pushen; bei einem Konflikt `main` in den
   Zweig mergen).
4. Squash-Merge auf `main`.
5. Den Arbeitszweig danach löschen – auf GitHub und lokal. Nach getaner Arbeit soll kein Branch übrig bleiben.
6. Den Release-Lauf („Build & Release“) bis zum Ende verfolgen und das Ergebnis melden.

Ein Release (Windows-Installer + Auto-Update) entsteht nur, wenn sich die Version einer App ändert.
Bei Änderungen an einer App deshalb ihre Version in `apps/<app>/package.json`,
`apps/<app>/src-tauri/tauri.conf.json`, `apps/<app>/src-tauri/Cargo.toml` und `apps/<app>/src-tauri/Cargo.lock` gleich
hochsetzen – und die Rahmen-App (`apps/suite`) mit, weil sie alle Apps enthält.

## Konventionen

- Oberfläche, Doku und Commit-Nachrichten auf Deutsch.
- Formatierung wie im Bestand: Prettier mit `--single-quote --print-width 200`.
