# arch-tools (Rahmen-App)

Die Rahmen-App (`apps/suite`, eigene App mit eigenem Installer „arch-tools“) bündelt alle Werkzeuge in **einem
Programm und einem Fenster**. Sie kann nichts weiter, als zwischen den Apps zu wechseln:

- **Tabs:** Jede geöffnete App ist ein Tab in der Titelleiste – Projektordner, Formulare, Flächenrechner,
  GRZ-Nachweis, Kostenermittlung, Entzerrung. Ohne offene App zeigt der Rahmen die Startseite mit allen Apps; „+“
  öffnet weitere. Beim Wechseln bleibt jede App, wie sie war (sie läuft im Hintergrund weiter). Der Tab zeigt das
  geöffnete Projekt und ● bei ungespeicherten Änderungen; Schließen (× oder mittlere Maustaste) fragt dann nach.
  Welche Tabs offen waren, steht beim nächsten Start wieder da.
- **Herauslösen:** ⧉ am Tab öffnet die App in einem **eigenen Fenster** (z. B. auf dem zweiten Bildschirm) – mit
  eigenen Fensterknöpfen. **„Andocken“** in dessen Titelleiste holt sie als Tab zurück. Die App startet dabei neu:
  Flächenrechner, GRZ-Nachweis, Kostenermittlung und Entzerrung stellen ungespeicherte Eingaben aus ihrem
  Zwischenstand wieder her; in Projektordner und Formulare vorher speichern (der Rahmen fragt nach). Jede App ist
  höchstens einmal offen – ist sie herausgelöst, holt „+“ bzw. die Startseite ihr Fenster nach vorn.
- **Sperrdateien der Formulare** (`.frmtmp`, für FORMA und die Kollegen) gibt der Rahmen frei, sobald der
  Formulare-Tab bzw. sein Fenster zu ist oder umzieht – nicht erst beim Beenden des Programms.
- **Updates** macht der Rahmen für alle Apps zusammen (Knopf in der Titelleiste, Manifest `suite.json`); die
  Update-Knöpfe der einzelnen Apps sind im Rahmen ausgeblendet.

Die einzelnen Apps mit eigenem Installer bleiben unverändert nutzbar; Einstellungen (gemeinsamer
Konfigurationsordner) und Projektdateien sind dieselben.

## Technik

- **Ein Programm:** Die Tauri-Hülle (`apps/suite/src-tauri/src/lib.rs`) registriert die Befehle aller Apps – die
  gemeinsamen (`packages/core/tauri/commands.rs`) und die der Formulare-App (`apps/formulare/src-tauri/src/befehle.rs`,
  per `include!`). Neue Befehle einer App gehören deshalb auch in die Liste der Rahmen-App.
- **Web-Builds eingebettet:** `npm run build:alle` (in `apps/suite`) baut alle Apps und kopiert ihre `dist/` nach
  `apps/suite/dist/apps/<app>/` (`scripts/apps-einbauen.mjs`). Jede eingebettete `index.html` lädt vorab
  `rahmen-bruecke.js`: Richtet die Webansicht in einem Tab den Zugang zu den Befehlen nicht selbst ein, übernimmt
  die App den des Rahmens (gleicher Ursprung).
- **Tabs** sind iframes mit `?rahmen=tab&app=<app>`, herausgelöste Fenster eigene Tauri-Fenster (`app-<app>`) mit
  `?rahmen=fenster&app=<app>`. `packages/core/src/platform/rahmen.ts` erkennt das; die gemeinsame Titelleiste blendet
  im Tab Fensterknöpfe, Ziehen und Updates aus und meldet Projektname und ungespeicherte Änderungen per
  `postMessage` an den Rahmen; im herausgelösten Fenster zeigt sie „Andocken“ (Tauri-Ereignis `arch-tools:andocken`).
- Die Apps teilen sich im Rahmen einen Ursprung und damit den Browser-Speicher; ihre Schlüssel und Datenbanken sind
  je App verschieden (`projektordner:…`, `formulare:…`, `arch-flaechen-tool`, `grz-nachweis`, `kostenermittlung`,
  `arch-tools-entzerrung`). Gemeinsam ist nur das Farbschema.
- Dateien per Ziehen & Ablegen: Die Fenster des Rahmens haben `dragDropEnabled: false`, damit die Apps in den Tabs
  die Dateien selbst bekommen.

## Entwicklung

```bash
npm run build            # alle Apps, zuletzt die Rahmen-App mit den eingebetteten Apps
npm run dev:suite        # Rahmen unter http://localhost:1480 (bettet die vorhandenen Web-Builds ein)
npm run tauri:dev:suite  # als Desktop-App
```

Release: Tag `suite-v<version>` (wie die anderen Apps, sobald die Version in `apps/suite` auf `main` steigt).
