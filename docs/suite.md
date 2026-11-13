# Arkly (Rahmen-App)

Die Rahmen-App Arkly (`apps/suite`, eigene App mit eigenem Installer, bis 0.18.0 „arch-tools“) bündelt alle
Werkzeuge in **einem Programm und einem Fenster**. Sie kann nichts weiter, als zwischen den Apps zu wechseln:

- **Tabs:** Jede geöffnete App ist ein Tab in der Titelleiste – ATLAS (Projektordner), LEXIO (Baurecht), PERMIO
  (Formulare), QUADRIO (Flächenrechner), TERRIO (GRZ-Nachweis), NUMIO (Kostenermittlung), RECTIO (Entzerrung), FABRIO (AVA). Ohne
  offene App zeigt der Rahmen die Startseite mit allen Apps; „+“ öffnet weitere. Startseite und „+“ nennen neben dem
  Namen, wofür die App da ist (den bisherigen Namen), am Tab steht das im Tooltip. Beim Wechseln bleibt jede App, wie
  sie war (sie läuft im Hintergrund weiter). Der Tab zeigt das geöffnete Projekt und ● bei ungespeicherten
  Änderungen; Schließen (× oder mittlere Maustaste) fragt dann „Änderungen an ‚…‘ speichern?“ – *Speichern* lässt
  die App im Tab speichern, *Nicht speichern* verwirft, *Abbrechen* lässt den Tab offen. Beim Beenden fragt der Rahmen
  so für jeden Tab mit ungespeicherten Änderungen. Welche Tabs offen waren, steht beim nächsten Start wieder da.
- **Herauslösen:** ⧉ am Tab öffnet die App in einem **eigenen Fenster** (z. B. auf dem zweiten Bildschirm) – mit
  eigenen Fensterknöpfen. **„Andocken“** in dessen Titelleiste holt sie als Tab zurück. Die App startet dabei neu:
  QUADRIO, TERRIO, NUMIO und RECTIO stellen ungespeicherte Eingaben aus ihrem
  Zwischenstand wieder her; PERMIO behält nicht gespeicherte Eingaben als Entwurf und zeigt sie beim erneuten
  Öffnen des Formulars wieder – nur ungespeicherte Bearbeitungen von PDF-, Excel- und Word-Dokumenten in der
  Dateiansicht gehen verloren. Bei ungespeicherten Änderungen sagt der Rahmen vorher, was mit ihnen geschieht. Jede App ist
  höchstens einmal offen – ist sie herausgelöst, holt „+“ bzw. die Startseite ihr Fenster nach vorn.
- **Neues Projekt anlegen** aus jeder App: Der Knopf auf der Projektübersicht der Apps, „+“ → „Neues Projekt
  anlegen …“ und die Startseite öffnen den Tab von ATLAS mit dem Assistenten; nach dem Anlegen führt „In … öffnen“
  zurück zur App, aus der der Auftrag kam (QUADRIO, TERRIO, NUMIO und RECTIO öffnen das
  neue Projekt gleich). Der Rahmen leitet dafür Nachrichten weiter (siehe Technik).
- **Sperrdateien der Formulare** (`.frmtmp`, für FORMA und die Kollegen) gibt der Rahmen frei, sobald der
  Tab von PERMIO bzw. sein Fenster zu ist oder umzieht – nicht erst beim Beenden des Programms.
- **Updates** macht der Rahmen für alle Apps zusammen (Knopf in der Titelleiste, Manifest `suite.json`); die
  Update-Knöpfe der einzelnen Apps sind im Rahmen ausgeblendet.
- **Umbenennung:** Bis 0.18.0 hieß die Rahmen-App „arch-tools“. Beim ersten Update auf den neuen Namen entfernt der
  Installer die Installation unter dem alten Namen (nur mit gleichem Herausgeber und gleicher Programmdatei) und legt
  vorhandene Startmenü- und Desktop-Verknüpfungen als „Arkly“ an; Einstellungen und Daten bleiben, weil sie an der
  App-Kennung hängen. Ein MSI-Paket ersetzt das alte (gleicher Upgrade-Code), alte Verknüpfungen können dabei stehen
  bleiben. Einzelheiten in der README unter „Neue Namen“. Hook: `apps/suite/src-tauri/windows/umbenennung.nsh`; die Namen aller
  Apps stehen in der README unter [Neue Namen](../README.md#neue-namen).

- **Speicherort der Einstellungen** (Knopf „Einzelplatz“ bzw. „Netzwerk“ in der Titelleiste des Rahmens und jeder App, dazu auf der Startseite):
  Einzelplatz oder Netzwerkinstallation, für alle Apps auf einmal – Einzelheiten in der README unter
  [Gemeinsame Bedienung](../README.md#gemeinsame-bedienung-aller-apps). Nach einem Wechsel gilt der neue Ort sofort in
  allen Tabs und Fenstern: Was die Apps zwischengespeichert haben (ATLAS: Struktur, Mails, Kataster; FABRIO:
  Einstellungen; QUADRIO: Raumkatalog; Büroname im Kopf der Ausdrucke), lesen sie neu (`konfigNeuLesen`) – ebenso, wenn
  das Netzlaufwerk wegfällt oder wieder da ist. Im Tab steht der Knopf nur in der Kopfleiste des Rahmens. Ist das
  Netzlaufwerk nicht erreichbar, zeigt sie „⚠ Einstellungen nur lesbar“ (Notbetrieb mit der lokalen Kopie).

Die einzelnen Apps mit eigenem Installer bleiben unverändert nutzbar; Einstellungen (gemeinsamer
Konfigurationsordner) und Projektdateien sind dieselben.

## Technik

- **Ein Programm:** Die Tauri-Hülle (`apps/suite/src-tauri/src/lib.rs`) registriert die Befehle aller Apps – die
  gemeinsamen (`packages/core/tauri/commands.rs`), die von PERMIO (`apps/formulare/src-tauri/src/befehle.rs`),
  die von FABRIO (`apps/ava/src-tauri/src/befehle.rs`) und die von LEXIO (`apps/baurecht/src-tauri/src/netz.rs`:
  Abruf der Gesetzestexte und Geodienste über die Host-Liste, Ablage), jeweils per `include!`. Neue Befehle einer App gehören deshalb auch in die Liste der Rahmen-App.
- **Web-Builds eingebettet:** `npm run build:alle` (in `apps/suite`) baut alle Apps und kopiert ihre `dist/` nach
  `apps/suite/dist/apps/<app>/` (`scripts/apps-einbauen.mjs`). Jede eingebettete `index.html` lädt vorab
  `rahmen-bruecke.js`: Richtet die Webansicht in einem Tab den Zugang zu den Befehlen nicht selbst ein (macOS,
  Linux), übernimmt die App den des Rahmens (gleicher Ursprung). Unter Windows (WebView2) richtet Tauri ihn auch im
  iframe ein; die Befehle gehen dann über das IPC-Protokoll – deshalb steht `ipc: http://ipc.localhost` in
  `connect-src` der CSP (`tauri.conf.json`; ein `useHttpsScheme` hieße `https://ipc.localhost`, der Test
  `csp.test.ts` sichert beides ab). Ohne das wiche Tauri auf `postMessage`/`eval` aus, und dieser Ausweichweg
  funktioniert nur im Hauptdokument: In den Tabs reagierten dann alle Knöpfe, die einen Befehl brauchen, nicht (Ordner
  wählen, Import, Speichern, Einstellungen). Tauri-Ereignisse erreichen Tabs unter Windows aus demselben Grund nicht –
  Tabs sprechen mit dem Rahmen deshalb überall per `postMessage`.
- **Tabs** sind iframes mit `?rahmen=tab&app=<app>`, herausgelöste Fenster eigene Tauri-Fenster (`app-<app>`) mit
  `?rahmen=fenster&app=<app>`. `packages/core/src/platform/rahmen.ts` erkennt das; die gemeinsame Titelleiste blendet
  im Tab Fensterknöpfe, Ziehen und Updates aus und meldet Projektname und ungespeicherte Änderungen per
  `postMessage` an den Rahmen; im herausgelösten Fenster zeigt sie „Andocken“ (Tauri-Ereignis `arch-tools:andocken`).
- Die Apps teilen sich im Rahmen einen Ursprung und damit den Browser-Speicher; ihre Schlüssel und Datenbanken sind
  je App verschieden (`projektordner:…`, `formulare:…`, `arch-flaechen-tool`, `grz-nachweis`, `kostenermittlung`,
  `arch-tools-entzerrung`, `ava:…`, `baurecht:…`). Gemeinsam sind nur das Farbschema und die Nachricht „Speicherort der Einstellungen gewechselt“ (`arch-tools:konfig-ort`) – beides wirkt über das Ereignis `storage` sofort in allen Tabs und Fenstern.
- **Nachrichten zwischen den Apps** (`rahmen.ts`: `anRahmen`, `vomRahmen`): Tabs schicken per `postMessage`, herausgelöste
  Fenster per Tauri-Ereignis `arch-tools:an-rahmen`; der Rahmen stellt per `postMessage` bzw. `arch-tools:an-app`
  (mit Empfänger `an`) zu. Eine App meldet sich mit `arch-tools:bereit`, sobald sie hört – Nachrichten an Apps, die
  noch laden, hält der Rahmen bis dahin zurück. Aufträge: `arch-tools:projekt-anlegen` → `arch-tools:assistent-neu`
  (an ATLAS), `arch-tools:zur-app` → `arch-tools:projekt-angelegt` (an die auftraggebende App). Angenommen wird nur
  vom gleichen Ursprung und von bekannten Apps.
- **Speicherort der Einstellungen** (`packages/core/src/platform/konfig.ts`, Oberfläche `ui/Speicherort.tsx`): Zeiger
  `%APPDATA%\arch-tools\konfig.json` `{ modus: 'einzelplatz' | 'netzwerk', ordner, netzordner? }` (ältere Fassungen
  mit nur `ordner` gelten als Netzwerkinstallation und lesen auch den neuen Zeiger). Rust-Befehle in
  `packages/core/tauri/commands.rs`: `ordner_erreichbar` (mit Zeitlimit 4 s, ein getrenntes Laufwerk hält die App nicht
  auf), `konfig_dateien` (Einstellungsdateien eines Ordners für den Umzug), `konfig_schreiben_wenn` (Vergleich und
  atomares Ersetzen unter einer Sperrdatei mit eigenem Zeichen; verwaist ist eine Sperre, die nach der eigenen Uhr 10 s
  unverändert liegt – die Uhr des Netzlaufwerks zählt nicht). Auch das ganze Ersetzen eines Bereichs läuft darüber.
  Lokale Kopie der Netzwerkinstallation: `%APPDATA%\arch-tools\netz-kopie\` mit `.herkunft.json` (Netzordner und
  gespiegelte Bereiche; eine Kopie anderer Herkunft gilt im Notbetrieb nicht). Meldet ein getrenntes Laufwerk eine
  Datei als „nicht vorhanden“, prüft die App die Erreichbarkeit, bevor sie Vorgaben annimmt.
- **Grenzen:** Alle Rechner einer Netzwerkinstallation sollten auf dem aktuellen Stand sein – ältere Fassungen
  schreiben ohne Sperre und ohne Vergleich. Hängt eine Netzfreigabe beim Lesen einer einzelnen Datei (statt
  getrennt zu sein), wartet die App bis zum Zeitlimit des Betriebssystems.
- Dateien per Ziehen & Ablegen: Die Fenster des Rahmens haben `dragDropEnabled: false`, damit die Apps in den Tabs
  die Dateien selbst bekommen.

## Entwicklung

```bash
npm run build            # alle Apps, zuletzt die Rahmen-App mit den eingebetteten Apps
npm run dev:suite        # Rahmen unter http://localhost:1480 (bettet die vorhandenen Web-Builds ein)
npm run tauri:dev:suite  # als Desktop-App
```

Release: Tag `suite-v<version>` (wie die anderen Apps, sobald die Version in `apps/suite` auf `main` steigt).
