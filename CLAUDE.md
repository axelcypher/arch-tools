# Hinweise für Claude (gilt für alle Sessions in diesem Repo)

## Abschluss jeder Arbeit: PR, Merge, Branch weg

- Nach getaner Arbeit **immer selbst** einen Pull Request gegen `main` anlegen, die CI abwarten und bei grünem Ergebnis
  **selbst mergen** – ohne nachzufragen. Schlägt die CI fehl: Ursache beheben, erneut pushen, dann mergen.
- Danach den Arbeits-Branch **löschen** (auf GitHub und lokal). Nach getaner Arbeit soll kein Branch übrig bleiben.
- Merge-Methode: „squash“ oder „merge“ (bei Merge-Commits im Branch geht „rebase“ nicht).

## Konventionen

- Oberfläche, Doku und Commit-Nachrichten auf Deutsch.
- Versionen je App stehen in `apps/<app>/package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` und
  `src-tauri/Cargo.lock` – alle vier gleich. Ein Versionssprung auf `main` löst den Release der App aus
  (`.github/workflows/release.yml`).
- Vor dem PR: `npm run typecheck`, `npm test`, `npm run build`.
- Formatierung wie im Bestand: Prettier mit `--single-quote --print-width 200`.
