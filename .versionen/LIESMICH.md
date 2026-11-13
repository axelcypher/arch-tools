# Versionsnotizen

Versionen setzt nur der Release-Lauf. Ein PR, der Code einer App ändert (`apps/<app>/…`) oder den gemeinsamen Kern
(`packages/core/…`), legt hier **eine Datei mit eindeutigem Namen** an, am besten nach dem Zweig:
`.versionen/<zweig>.json`. Dateien mit verschiedenen Namen kollidieren nie – so gibt es kein Wettrennen um
Versionsnummern.

Eine Änderung am Kern betrifft nur die Apps (außer Arkly, siehe unten), die die Datei einbinden – über Importe, auch über andere
Kerndateien, bzw. `include!` bei den Rust-Befehlen (`scripts/kern-nutzer.mjs`). Was sich nicht sicher zuordnen lässt
(Konfiguration wie `package.json`, Typdeklarationen, gelöschte Dateien), gilt für alle. Welche Apps es sind, nennt die
CI-Meldung samt Vorlage; lokal: `node scripts/versionen-pruefen.mjs main HEAD` (mit sauberem Arbeitsbaum nach
`git merge origin/main` – die Zuordnung liest den Arbeitsbaum). Nur von Tests genutzte Kerndateien brauchen keine
Notiz; eine Kerndatei, die weder eine App noch ein Test einbindet, gilt für alle. Bindet allein Arkly die Datei ein,
braucht Arkly die Notiz.

```json
{
  "grz": { "stufe": "minor", "notiz": "Neuer Nachweis der Stellplätze." },
  "kosten": { "stufe": "patch", "notiz": "Rundung in der Kostengruppe 300 korrigiert." }
}
```

- Schlüssel: Kennung der App – `flaechenrechner` (QUADRIO), `grz` (TERRIO), `kosten` (NUMIO), `ordner` (ATLAS),
  `entzerrung` (RECTIO), `formulare` (PERMIO), `ava` (FABRIO), `baurecht` (LEXIO), `suite` (Arkly).
- `stufe`: `patch` (Fehlerkorrektur), `minor` (neue Funktion) oder `major`.
- `notiz`: ein Satz für die Release-Notiz (Deutsch).
- Arkly braucht eine Notiz nur bei Änderungen an `apps/suite`; sonst setzt der Release-Lauf ihre Version selbst
  (Minor, wenn eine App Minor oder Major erhöht, sonst Patch).

Dateien im Wurzelverzeichnis (`package.json`, `package-lock.json`, `tsconfig*`) prüft die CI nicht – ändert sich dort
Ausgeliefertes (etwa eine Abhängigkeit), die betroffenen Apps selbst eintragen. Notizen anderer PRs nie löschen oder
umbenennen.

Die CI prüft im PR, dass jede betroffene App in einer Notiz steht, dass die Notizen gültig sind und dass der PR keine
Version ändert (`scripts/versionen-pruefen.mjs`). Der Release-Lauf sammelt alle Notizen auf `main`, hebt je App die
größte verlangte Stufe an allen fünf Stellen, löscht die Notizen und committet das als github-actions nach `main`
(`scripts/versionen-setzen.mjs`). Nach dem Merge deshalb `main` frisch holen.

## Neue App aufnehmen

Eine neue App (Kennung = Ordner unter `apps/`, z. B. `baurecht`) muss an diesen Stellen eingetragen werden, sonst
prüft die CI sie nicht oder der Release-Lauf baut sie nicht:

- `scripts/versionen-pruefen.mjs`: `APPS` (Kennung). Das Tag-Schema `<kennung>-v<version>` ergibt sich von selbst aus
  `tagVon`.
- `scripts/versionen-setzen.mjs`: `NAMEN` (Produktname, wie in `packages/core/src/appNamen.ts`).
- `.github/workflows/release.yml`: Kopfkommentar, Auswahl `options` beim Start von Hand, die Schleife `for d in …` und
  der `case` mit Tag, Release-Name und Name des Web-Zips (`<produkt>-web.zip`, klein geschrieben).
- Testprojekt: `test.name` in `apps/<kennung>/vite.config.ts` gleich der Kennung – der Release-Lauf testet je App nur
  dieses Projekt und den Kern (`--project`); bindet die App weitere Pakete ein, sie im `case` des Schritts „Tests“ in
  `release.yml` ergänzen.
- `.github/workflows/ci.yml`: Pfad unter `web-dist` und ein Eintrag in der Matrix „Tauri-Hülle prüfen“ (`app`, `pkg`
  = Name in `package.json`).
- Wurzel-`package.json`: Skripte `build`, `dev:<kennung>`, `tauri:dev:<kennung>`.
- Wenn die App in Arkly erscheinen soll: `apps/suite/src/apps.ts`, `apps/suite/scripts/alle-bauen.mjs` und
  `apps-einbauen.mjs`. Dazu gehört eine Arkly-Notiz (`suite`, Stufe `minor`).
- Symbol: `design/icons/erzeugen.mjs`.

**Erstversion:** Die Version, die beim Anlegen in den fünf Stellen steht (üblich `0.1.0`), wird unverändert die erste
veröffentlichte. Für eine App ohne Tag hebt der Release-Lauf nichts, er übernimmt die Version und baut sie. Der PR,
der die App anlegt, braucht trotzdem eine Notiz für sie, etwa `{"baurecht": {"stufe": "minor", "notiz": "Erste
Fassung."}}`. Die Stufe hat dabei keine Wirkung, Arkly hebt für eine neue App immer Minor. Erst ab dem zweiten
Release zählt die Stufe für die App selbst. Der öffentliche Updater-Schlüssel in `tauri.conf.json` muss derselbe
sein wie bei den anderen Apps, sonst bricht der Release-Lauf ab.
