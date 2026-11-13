# Arkly (Rahmen-App)

Die Rahmen-App Arkly (`apps/suite`, eigene App mit eigenem Installer, bis 0.18.0 „arch-tools“) bündelt alle
Werkzeuge in **einem Programm und einem Fenster**. Sie kann nichts weiter, als zwischen den Apps zu wechseln:

- **Tabs:** Jede geöffnete App ist ein Tab in der Titelleiste – ATLAS (Projektordner), LEXIO (Baurecht), PERMIO
  (Formulare), QUADRIO (Flächenrechner), TERRIO (GRZ-Nachweis), NUMIO (Kostenermittlung), RECTIO (Entzerrung), FABRIO
  (AVA). Ohne offene App zeigt der Rahmen die Startseite mit allen Apps; „+“ öffnet weitere, legt ein neues Projekt an
  oder führt zur Startseite zurück. Startseite und „+“ nennen neben dem
  Namen, wofür die App da ist (den bisherigen Namen), am Tab steht das im Tooltip. Beim Wechseln bleibt jede App, wie
  sie war (sie läuft im Hintergrund weiter). Der Tab zeigt das geöffnete Projekt und ● bei ungespeicherten
  Änderungen; Schließen (× oder mittlere Maustaste) fragt dann „Änderungen an ‚…‘ speichern?“ – *Speichern* lässt
  die App im Tab speichern, *Nicht speichern* verwirft, *Abbrechen* lässt den Tab offen. Beim Beenden – über × wie
  über das System (Alt+F4, Taskleiste) – und vor der Installation eines Updates fragt der Rahmen so für jeden Tab und
  jedes herausgelöste Fenster mit ungespeicherten Änderungen; *Speichern* lässt dann die App im Fenster speichern.
  Danach schließt er auch die herausgelösten Fenster. Tastatur: ←/→ wechseln die Tabs, Pos1/Ende springen, Entf (bzw. Strg+F4) schließt; Rechtsklick bzw. die
  Kontextmenütaste am Tab bietet „In eigenem Fenster öffnen“, „Schließen“ und „Andere schließen“. Bei wenig Platz
  schrumpfen die Tabs (das Projekt steht dann im Tooltip). Welche Tabs offen waren, steht beim nächsten Start wieder da;
  herausgelöste Apps kommen dann als Tab zurück.
- **Herauslösen** (nur Desktop): ⧉ am Tab öffnet die App in einem **eigenen Fenster** (z. B. auf dem zweiten
  Bildschirm) – mit eigenen Fensterknöpfen. **„Andocken“** in dessen Titelleiste holt sie als Tab zurück. Die App
  startet dabei neu:
  QUADRIO, TERRIO, NUMIO und RECTIO stellen ungespeicherte Eingaben aus ihrem
  Zwischenstand wieder her; PERMIO behält nicht gespeicherte Eingaben als Entwurf und zeigt sie beim erneuten
  Öffnen des Formulars wieder – nur ungespeicherte Bearbeitungen von PDF-, Excel- und Word-Dokumenten in der
  Dateiansicht gehen verloren. Bei ungespeicherten Änderungen fragt der Rahmen vor dem Herauslösen und das Fenster vor
  dem Andocken, was mit ihnen geschieht; bei ATLAS und FABRIO, die sie verlieren würden, mit *Speichern*. ATLAS meldet
  als ungespeichert, was beim Beenden verloren ginge: offene Eingaben im Assistenten (geänderte Stammdaten beim
  Ergänzen, im Trockenlauf abgewählte Einträge – nicht den Entwurf eines neuen Projekts, der gespeichert bleibt), den
  nicht übernommenen Text der Ordnerliste und Änderungen an der Struktur, die wegen eines Konflikts mit einem anderen
  Rechner oder eines gescheiterten Schreibens nicht gespeichert sind. *Speichern* schreibt die Struktur erneut und
  übernimmt den Text der Ordnerliste (gesichert, mit „Rückgängig“), wenn er gültig ist und vom aktuellen Stand
  ausgeht; den Projektordner anlegen, die Projektdatei
  schreiben oder einen Konflikt entscheiden tut es nicht still – dann gilt „nicht gespeichert“, die Aktion unterbleibt
  und ATLAS sagt, was noch offen ist. Jede App ist
  höchstens einmal offen – ist sie herausgelöst, holt „+“ bzw. die Startseite ihr Fenster nach vorn. Im Browser gibt
  es kein Herauslösen (dort fehlte der Weg zurück).
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
  `postMessage` an den Rahmen; im herausgelösten Fenster zeigt sie „Andocken“ (Tauri-Ereignis `arch-tools:andocken`)
  und meldet dasselbe per `arch-tools:an-rahmen` (mit `kennung`). Mit `ungespeichert` an der TitleBar kann die App
  für die Rückfrage des Rahmens (Schließen, Beenden, Update) einen genaueren Satz melden, etwa „Das LV hat
  ungespeicherte Änderungen.“; ohne ihn (oder leer bzw. länger als 200 Zeichen) steht dort „Das Projekt hat
  ungespeicherte Änderungen.“. Die eigene Rückfrage der Titelleiste (Schließen mit Speichern) nimmt ihn ebenso. Ihr
  Schließen – auch über das System (`onCloseRequested`) – fragt bei ungespeicherten Änderungen; danach `destroy`, damit
  die Rückfrage nicht zweimal kommt.
  Rechte: Hauptfenster `capabilities/default.json`, herausgelöste Fenster `capabilities/fenster.json` (ohne Updates,
  Neustart und neue Fenster).
- **Ausstehendes Schreiben vor dem Schließen** (`vorDemSchliessen` in `rahmen.ts`): Schreibt eine App verzögert
  (etwa QUADRIO und TERRIO 600 ms nach einer Änderung in IndexedDB, ATLAS etwa 400 ms), meldet sie mit
  `vorDemSchliessen(async () => …)` an, was vor dem Ende noch fertig werden muss – die Funktion soll das Schreiben
  sofort ausführen und abwarten. Liefert sie `false` oder scheitert sie (Promise abgelehnt, z. B. Netzlaufwerk weg),
  gilt das als „nicht gespeichert“. Wird sie erneut aufgerufen („Weiter warten“, „Erneut versuchen“), wartet sie ein
  laufendes Schreiben ab; ist das letzte gescheitert, schreibt sie neu bzw. liefert weiter `false`, solange nichts
  gespeichert ist. Das gilt auch, wenn keine
  ungespeicherten Änderungen gemeldet sind. Abgewartet wird vor dem Schließen des Fensters (× und System), dem
  Andocken, dem Herauslösen, dem Schließen eines Tabs, dem Beenden von Arkly (alle Tabs und Fenster) und dem
  Update-Neustart, höchstens 5 s (`VORBEREITEN_MS`). Danach fragt die App (`ui/vorbereiten.ts`) bei Zeitablauf
  „… speichert noch“ mit *Weiter warten*, bei Scheitern „… konnte nicht speichern“ mit *Erneut versuchen* – jeweils
  Hauptknopf (Enter) –, dazu *Trotzdem schließen* bzw. *andocken*, *herauslösen*, *beenden*, *neu starten* (Gefahr – die
  letzte Änderung kann fehlen) und *Abbrechen* (Esc; Fenster bzw. Tab bleibt offen). Tabs ruft der Rahmen direkt auf
  (gleicher Ursprung), herausgelöste Fenster über `arch-tools:vorbereiten`/`arch-tools:vorbereitet` (Ergebnis `fertig`,
  `zeitlimit` oder `fehler`; nur Fenster, die schon hören); die Titelleiste richtet die Antwort ein. Während des
  Wartens sind Schließen, Andocken und „Jetzt installieren“ gegen ein zweites Auslösen gesperrt. Grenzen: Im Browser
  (Tab schließen, neu laden) und beim Neuladen eines Tabs oder des Rahmens gibt es keinen Hook; nach *Trotzdem …* endet
  das Fenster auch mitten im Schreiben. Die gemeinsamen Einstellungen (`konfig.ts`, alle Schreibvorgänge nacheinander)
  melden ihre laufenden Schreibvorgänge selbst an – dafür muss keine App etwas tun; Fehler beim Schreiben der
  Einstellungen meldet der Schreibvorgang selbst, sie lösen keine Rückfrage beim Schließen aus. Damit nimmt praktisch jeder Tab den
  Warteweg (meist sofort fertig). Die lokale Kopie für den Notbetrieb wird bewusst nicht abgewartet (sie wird atomar
  ersetzt; bleibt höchstens älter).
- **Speichern auf Anfrage** (`speichernImTab`, `speichernImFenster`, `speichernAnfragenBeantworten`): Der Rahmen
  schickt `arch-tools:speichern`, die App bestätigt sofort (`arch-tools:speichert`) und meldet danach das Ergebnis
  (`arch-tools:gespeichert`). Kommt binnen 3 s keine Bestätigung (App lädt, hängt, ist abgestürzt), gilt „nicht
  gespeichert“ mit der Meldung „… antwortet nicht“ – die Rückfrage endet, der Tab bleibt offen. Ebenso, wenn das
  Fenster während des Speicherns zugeht oder der Tab neu lädt; Beenden bleibt danach möglich. Was ein Umzug aus Änderungen macht, steht je App in
  `BEIM_UMZUG` (`rahmen.ts`), die Rückfrage in `ui/umzug.ts`.
- Die Apps teilen sich im Rahmen einen Ursprung und damit den Browser-Speicher; ihre Schlüssel und Datenbanken sind
  je App verschieden (`projektordner:…`, `formulare:…`, `arch-flaechen-tool`, `grz-nachweis`, `kostenermittlung`,
  `arch-tools-entzerrung`, `ava:…`, `baurecht:…`). Gemeinsam sind nur das Farbschema und die Nachricht „Speicherort der Einstellungen gewechselt“ (`arch-tools:konfig-ort`) – beides wirkt über das Ereignis `storage` sofort in allen Tabs und Fenstern.
- **Nachrichten zwischen den Apps** (`rahmen.ts`: `anRahmen`, `vomRahmen`): Tabs schicken per `postMessage`, herausgelöste
  Fenster per Tauri-Ereignis `arch-tools:an-rahmen`; der Rahmen stellt per `postMessage` bzw. `arch-tools:an-app`
  (mit Empfänger `an`) zu. Eine App meldet sich mit `arch-tools:bereit`, sobald sie hört – Nachrichten an Apps, die
  noch laden, hält der Rahmen bis dahin zurück; schließt die App vorher, verfallen sie. Aufträge: `arch-tools:projekt-anlegen` → `arch-tools:assistent-neu`
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

## Prüfschritte auf Windows: Schließen, Update, herausgelöste Fenster

Von Hand in der installierten Arkly durchzuklicken. „Ändern“ heißt: in der App etwas eingeben, ohne zu speichern, bis
am Tab bzw. in der Titelleiste ● erscheint.

1. **Alt+F4 im Hauptfenster:** NUMIO und QUADRIO als Tabs öffnen, in beiden ändern, Alt+F4. Erwartet: „Änderungen an
   ‚NUMIO – …‘ speichern?“, danach dieselbe Frage für QUADRIO. Bei *Abbrechen* bleibt Arkly offen, mit allen
   Änderungen.
2. **Schließen über die Taskleiste:** Rechtsklick auf Arkly in der Taskleiste → „Fenster schließen“. Erwartet: wie in
   Schritt 1.
3. **Herausgelöstes Fenster beim Beenden:** NUMIO öffnen, ⧉ (in eigenem Fenster), dort ändern. Im Hauptfenster ×.
   Erwartet: „Änderungen an ‚NUMIO – …‘ speichern?“. *Speichern* speichert im NUMIO-Fenster, dann schließen sich beide
   Fenster. Im Task-Manager läuft danach kein Arkly mehr.
4. **Alt+F4 im herausgelösten Fenster:** TERRIO herauslösen, ändern, im TERRIO-Fenster Alt+F4. Erwartet: „Vor dem
   Beenden speichern?“ bzw. „Ungespeicherte Änderungen verwerfen?“; *Abbrechen* lässt das Fenster offen.
5. **Andocken mit Änderungen:** FABRIO herauslösen, im LV ändern, „Andocken“. Erwartet: „Änderungen an ‚FABRIO – …‘
   speichern?“ mit dem Hinweis, dass die App neu startet. *Abbrechen* lässt das Fenster stehen; *Speichern* speichert
   und holt FABRIO als Tab zurück. Bei QUADRIO kommt stattdessen „QUADRIO andocken?“ (Änderungen bleiben im
   Zwischenstand).
   Zusätzlich bei FABRIO: im LV eine Menge bzw. im Langtext etwas eintippen und im Feld bleiben (● erscheint schon beim
   Tippen), dann Alt+F4 bzw. „Andocken“. Erwartet: bei Alt+F4 die Frage aus Schritt 4 („Vor dem Beenden speichern?“),
   bei „Andocken“ dieselbe Frage wie oben; *Speichern* übernimmt die Eingabe, *Nicht speichern* schließt ohne weitere
   Rückfrage.
6. **Herauslösen mit Änderungen:** FABRIO als Tab im LV ändern, ⧉. Erwartet: Frage mit *Speichern*; bei RECTIO nur
   „RECTIO herauslösen?“. Bei ATLAS mit geänderten Stammdaten im Assistenten (Ergänzen): Frage mit *Speichern*;
   *Speichern* legt nichts an, ATLAS bleibt als Tab und meldet „Nicht alles gespeichert“. Mit geändertem Text der
   Ordnerliste (Struktur, Textansicht) übernimmt *Speichern* ihn, danach wird herausgelöst.
7. **Update mit Änderungen:** Liegt ein Update vor, in einem Tab und einem herausgelösten Fenster ändern, Update-Knopf
   → „Jetzt installieren“. Erwartet: erst die Fragen je App, *Abbrechen* bricht das Update ab; erst nach den Fragen
   wird geladen und neu gestartet.
8. **App reagiert nicht:** Schwer nachzustellen; erwartet ist, dass *Speichern* bei einer hängenden App nach etwa
   3 Sekunden aufgibt und Arkly offen bleibt.
9. **Neustart:** Eine App herauslösen, Arkly beenden und neu starten. Erwartet: Die App ist wieder als Tab da.
10. **Verzögertes Schreiben** (ATLAS, QUADRIO und TERRIO melden `vorDemSchliessen` an): In ATLAS etwas ändern bzw. in
    QUADRIO oder im Lageplan von TERRIO eine Fläche zeichnen oder verschieben und sofort (innerhalb einer halben
    Sekunde) den Tab schließen bzw. Arkly beenden. Erwartet: Die Änderung ist nach dem Neustart da. Hängt das
    Netzlaufwerk, erscheint nach etwa 5 s „ATLAS speichert noch“; scheitert das Schreiben sofort und die App meldet das (`false` bzw. Fehler), „ATLAS konnte nicht
    speichern“. Enter bzw. „Weiter warten“ wartet erneut, „Erneut versuchen“ speichert noch einmal (bleibt das
    Laufwerk getrennt, erscheint die Rückfrage wieder), Esc bzw. „Abbrechen“ lässt Tab bzw. Fenster offen, „Trotzdem
    schließen“ schließt. Bei QUADRIO und TERRIO (lokale IndexedDB) erscheinen die Rückfragen praktisch
    nie.

## Entwicklung

```bash
npm run build            # alle Apps, zuletzt die Rahmen-App mit den eingebetteten Apps
npm run dev:suite        # Rahmen unter http://localhost:1480 (bettet die vorhandenen Web-Builds ein)
npm run tauri:dev:suite  # als Desktop-App
```

Release: Tag `suite-v<version>`. Die Version setzt der Release-Lauf, sobald eine andere App eine neue Version bekommt
(Minor, wenn eine App Minor oder Major erhöht, sonst Patch) oder eine Versionsnotiz für Arkly vorliegt
(`.versionen/LIESMICH.md`, `scripts/versionen-setzen.mjs`); er committet sie nach main und baut Arkly aus diesem Commit.
Ein PR braucht eine Notiz für Arkly nur bei Änderungen an `apps/suite` selbst.
