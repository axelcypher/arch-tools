# Hinweise für Claude

## Ablauf nach jeder Änderung

Immer Pull Request auf `main` anlegen und mergen – ohne extra nachzufragen:

1. Vor dem PR `npm test`, `npm run typecheck` und `npm run build` lokal laufen lassen.
2. Arbeitszweig pushen, PR gegen `main` öffnen.
3. Warten, bis alle CI-Checks grün sind (bei Fehlern beheben und erneut pushen).
4. Squash-Merge auf `main`.
5. Den Release-Lauf („Build & Release“) bis zum Ende verfolgen und das Ergebnis melden.

Ein Release (Windows-Installer + Auto-Update) entsteht nur, wenn sich die Version einer App ändert.
Bei Änderungen an einer App deshalb ihre Version in `apps/<app>/package.json`,
`apps/<app>/src-tauri/tauri.conf.json`, `apps/<app>/src-tauri/Cargo.toml` und `apps/<app>/src-tauri/Cargo.lock` gleich
hochsetzen – und die Rahmen-App (`apps/suite`) mit, weil sie alle Apps enthält.
