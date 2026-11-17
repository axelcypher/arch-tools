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
- **Kopfleiste** (nach docs/design.md, „Titelleiste“): Tabs (am Tab nur ×), „+“ (App öffnen, Neues Projekt anlegen,
  Startseite), die Version bzw. das Update, im Notbetrieb die Warnung zum Speicherort, das Menü „Einstellungen und
  Hilfe“ (drei Striche) und die Fensterknöpfe. Im Menü: „Update auf ‹Version› …“ (nur solange ein Update bereitliegt), „Farbschema“,
  „Speicherort der Einstellungen …“ und „Fehlerprotokoll …“; neue Fehler zählt eine Marke am Menüknopf.
- **Herauslösen** (nur Desktop): „In eigenem Fenster öffnen“ im Kontextmenü des Tabs öffnet die App in einem
  **eigenen Fenster** (z. B. auf dem zweiten Bildschirm) – mit eigenen Fensterknöpfen. **„Andocken“** in dessen Titelleiste holt sie als Tab zurück. Die App
  startet dabei neu:
  QUADRIO, TERRIO, NUMIO und RECTIO stellen ungespeicherte Eingaben aus ihrem
  Zwischenstand wieder her; PERMIO behält nicht gespeicherte Eingaben als Entwurf und zeigt sie beim erneuten
  Öffnen des Formulars wieder – nur ungespeicherte Bearbeitungen von PDF-, Excel- und Word-Dokumenten in der
  Dateiansicht gehen verloren. Bei ungespeicherten Änderungen fragt der Rahmen vor dem Herauslösen und das Fenster vor
  dem Andocken, was mit ihnen geschieht; bei ATLAS und FABRIO, die sie verlieren würden, mit *Speichern*. ATLAS meldet
  als ungespeichert, was beim Beenden verloren ginge: offene Eingaben im Assistenten (geänderte Angaben beim
  Ergänzen, unter „Anlegen“ bzw. „Ergänzen“ abgewählte Einträge – nicht den Entwurf eines neuen Projekts, der
  gespeichert bleibt), den nicht übernommenen Text der Ordnerliste und Änderungen an der Struktur, die wegen eines
  Konflikts mit einem anderen Rechner oder eines gescheiterten Schreibens nicht gespeichert sind. *Speichern* schreibt
  die Struktur erneut und übernimmt den Text der Ordnerliste (gesichert, mit „Rückgängig“), wenn er gültig ist und vom
  aktuellen Stand ausgeht; den Projektordner anlegen, die Projektdatei schreiben oder einen Konflikt entscheiden tut es
  nicht still – dann gilt „nicht gespeichert“, die Aktion unterbleibt und ATLAS sagt, was noch offen ist. Jede App ist
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

- **Speicherort der Einstellungen** (im Menü „Einstellungen und Hilfe“ der Kopfleiste des Rahmens, in den Apps im Einstellungsdialog auf der Seite „Allgemein“, dazu auf der Startseite):
  Einzelplatz oder Netzwerkinstallation, für alle Apps auf einmal – Einzelheiten in der README unter
  [Gemeinsame Bedienung](../README.md#gemeinsame-bedienung-aller-apps). Nach einem Wechsel gilt der neue Ort sofort in
  allen Tabs und Fenstern: Was die Apps zwischengespeichert haben (ATLAS: Struktur, Mails, Kataster; FABRIO:
  Einstellungen; QUADRIO: Raumkatalog; Büroname im Kopf der Ausdrucke), lesen sie neu (`konfigNeuLesen`) – ebenso, wenn
  das Netzlaufwerk wegfällt oder wieder da ist. Im Tab steht der Punkt nur im Menü des Rahmens. Ist das
  Netzlaufwerk nicht erreichbar, zeigt die Kopfleiste „⚠ Einstellungen nur lesbar“ (Notbetrieb mit der lokalen Kopie).

- **Einstellungen …** (im Menü „Einstellungen und Hilfe“ der Kopfleiste, Strg+,): der zentrale Einstellungsdialog
  aller Apps, siehe unten.

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
  `BEIM_UMZUG` (`rahmen.ts`), die Rückfrage in `ui/umzug.ts`: zuerst die Folge („Beim Herauslösen startet die App
  neu.“), dann ein kurzer Satz. Apps, die die Änderungen verlieren, nennen ihren Satz `ungespeichert` und bieten
  *Speichern* an; können sie gerade nicht speichern (LEXIO ohne Projektdatei), kommt „Änderungen an ‚…‘ verwerfen?“
  mit „Verwerfen und …“ als Gefahrknopf. Die übrigen fragen „<App> herauslösen?“ bzw. „… andocken?“ mit
  „Ungespeicherte Änderungen bleiben als Zwischenstand erhalten.“ (PERMIO mit eigenem Text zu Entwurf und Dokumenten).
  Ob eine App speichern kann, meldet die Titelleiste mit dem Status (`kannSpeichern: false`, wenn sie keine
  Speicherfunktion `onSpeichern` hat); dann fragt Arkly auch beim Schließen, Beenden und Update „Änderungen an ‚…‘
  verwerfen?“ mit „Verwerfen und schließen“ (bzw. „… beenden“, „… neu starten“) statt „… speichern?“ – ebenso die
  eigene Schließen-Rückfrage der Titelleiste. PERMIO meldet das, solange Dokumente bearbeitet werden oder die
  Dateiansicht offen ist; Formulareingaben bleiben dabei trotzdem als Entwurf.
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
3. **Herausgelöstes Fenster beim Beenden:** NUMIO öffnen, Rechtsklick am Tab → „In eigenem Fenster öffnen“, dort
   ändern. Im Hauptfenster ×. Erwartet: „Änderungen an ‚NUMIO – …‘ speichern?“. *Speichern* speichert im NUMIO-Fenster,
   dann schließen sich beide Fenster. Im Task-Manager läuft danach kein Arkly mehr.
4. **Alt+F4 im herausgelösten Fenster:** TERRIO herauslösen, ändern, im TERRIO-Fenster Alt+F4. Erwartet: „Änderungen
   an ‚…‘ speichern?“ mit „Das Projekt hat ungespeicherte Änderungen.“ bzw. ohne Speichermöglichkeit „Änderungen an
   ‚…‘ verwerfen?“;
   *Abbrechen* lässt das Fenster offen.
5. **Andocken mit Änderungen:** FABRIO herauslösen, im LV ändern, „Andocken“. Erwartet: „Änderungen an ‚FABRIO – …‘
   speichern?“ mit „Beim Andocken startet die App neu. Das LV hat ungespeicherte Änderungen.“ *Abbrechen* lässt das
   Fenster stehen; *Speichern* speichert und holt FABRIO als Tab zurück. Bei QUADRIO kommt stattdessen „QUADRIO
   andocken?“ mit „… Ungespeicherte Änderungen bleiben als Zwischenstand erhalten.“
   Zusätzlich bei FABRIO: im LV eine Menge bzw. im Langtext etwas eintippen und im Feld bleiben (● erscheint schon beim
   Tippen), dann Alt+F4 bzw. „Andocken“. Erwartet: bei Alt+F4 die Frage aus Schritt 4 (mit „Das LV hat ungespeicherte Änderungen.“),
   bei „Andocken“ dieselbe Frage wie oben; *Speichern* übernimmt die Eingabe, *Nicht speichern* schließt ohne weitere
   Rückfrage.
6. **Herauslösen mit Änderungen:** FABRIO als Tab im LV ändern, „In eigenem Fenster öffnen“ (Kontextmenü des Tabs).
   Erwartet: Frage mit *Speichern* und „Beim Herauslösen startet die App neu. Das LV hat ungespeicherte Änderungen.“; bei RECTIO nur „RECTIO herauslösen?“ mit
   „… Ungespeicherte Änderungen bleiben als Zwischenstand erhalten.“ Gegenprobe ohne Speichermöglichkeit: LEXIO ohne
   Projektdatei herauslösen, ändern, „Andocken“. Erwartet: „Änderungen an ‚LEXIO – …‘ verwerfen?“ mit „Beim Andocken
   startet die App neu, die Änderungen gehen verloren.“ und *Verwerfen und andocken* (Gefahr); *Abbrechen* lässt das
   Fenster stehen. Bei ATLAS mit geänderten Stammdaten im Assistenten (Ergänzen): Frage mit *Speichern*;
   *Speichern* legt nichts an, ATLAS bleibt als Tab und meldet „Nicht alles gespeichert“. Mit geändertem Text der
   Ordnerliste (Struktur, Textansicht) übernimmt *Speichern* ihn, danach wird herausgelöst.
   Ohne Speichermöglichkeit im Hauptfenster: LEXIO ohne Projektdatei als Tab öffnen, ändern, Tab ×. Erwartet:
   „Änderungen an ‚LEXIO – …‘ verwerfen?“ mit „Die Änderungen gehen beim Schließen verloren.“ und *Verwerfen und
   schließen* (Gefahr); danach LEXIO erneut öffnen, ändern und Alt+F4 im Hauptfenster: *Verwerfen und beenden*.
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

## Prüfschritte auf Windows: Direktexport und PDF aus Excel

Mit einem Projekt, dessen `.oap` im Projektordner liegt (Vorgabe `03 Berechnungen/Flächen/…oap`), Stammdaten mit
Projektcode.

1. **Direktexport mit Excel:** Auf einem Rechner mit Microsoft Excel in QUADRIO „Exportieren“ (Werkzeugleiste).
   Tooltip vorher: „Als Excel und PDF in ‚<Pfad>‘ speichern …“. Erwartet: nach wenigen Sekunden unten rechts der
   Hinweis „Gespeichert: …“ mit beiden Dateinamen und dem Ordner (hält nichts auf, F6 springt hinein); im Ordner
   `03 Berechnungen/Flächen` liegen `<Kürzel> <JJMMTT> Flächenaufstellung.xlsx` und `.pdf`. Das PDF hat
   Seitenformat, Ränder, Kopf- und Fußzeile (Seitenzahlen) der Vorlage; im Task-Manager läuft danach kein `EXCEL.EXE`
   mehr. „Ordner öffnen“ öffnet den Explorer im Ordner.
2. **Vorhandene Datei:** Schritt 1 wiederholen. Erwartet: „‚… .xlsx‘ und ‚… .pdf‘ ersetzen?“ mit „Die Dateien gibt es
   schon in ‚<Ordner>‘.“, Fokus auf „Abbrechen“; Enter bzw. Esc schreibt nichts. Noch einmal, diesmal „Ersetzen“ → die
   Dateien werden überschrieben.
3. **Excel offen mit derselben Datei:** Die erzeugte `.xlsx` in Excel öffnen und „Ersetzen“ wählen. Erwartet: Fehler-Hinweis
   „Export fehlgeschlagen – …“ mit dem Grund (Datei gesperrt), nichts halb Geschriebenes.
4. **Nur LibreOffice:** Auf einem Rechner ohne Excel, mit LibreOffice (Standardpfad unter `Programme\LibreOffice`).
   Erwartet: PDF entsteht ebenso. Zahlen mit Dezimalkomma prüfen – zeigt LibreOffice Punkte, steht es auf einer
   englischen Sprache (Extras ▸ Optionen ▸ Spracheinstellungen ▸ Gebietsschema „Deutsch (Deutschland)“).
5. **Weder Excel noch LibreOffice:** Erwartet: Hinweis als Warnung „… Das PDF fehlt: Für das PDF wird
   Microsoft Excel oder LibreOffice gebraucht – keines davon wurde … gefunden.“; die `.xlsx` ist gespeichert.
6. **Hängender Wandler:** (schwer nachzustellen, z. B. Excel mit offenem modalen Dialog) Erwartet: nach 2 Minuten
   „… hat nach 2 Minuten nicht geantwortet und wurde beendet.“, kein übrig gebliebener Excel- bzw. soffice-Prozess.
7. **Datei → Exportieren → PDF …:** Dialog „PDF-Export“, „Excel-Datei daneben mitspeichern“ anhaken, „PDF speichern“.
   Erwartet: Speicherdialog für das PDF, die `.xlsx` mit gleichem Namen daneben; gibt es sie schon, Rückfrage
   „‚… .xlsx‘ ersetzen?“ mit Fokus auf „Abbrechen“.
8. **Ohne Projektdatei bzw. außerhalb des Projektordners:** Neues Projekt (ungespeichert). Erwartet: „Exportieren“
   gesperrt, per Tab erreichbar, Tooltip „Erst das Projekt speichern …“. Eine `.oap` auf dem Desktop: Tooltip „Kein
   Berechnungsordner …“. „Datei → Exportieren → Excel …“ geht in beiden Fällen.
9. **Vorlage mit Tippfehler:** Eigene Vorlage mit `{{flaeche.gibtsnicht}}` hinterlegen, „Exportieren“. Erwartet:
   Dateien werden gespeichert, der Hinweis (Warnung) nennt die Zahl der Prüfhinweise; „Prüfhinweise …“ öffnet die
   Liste (Blatt und Zelle).
10. Schritte 1, 2 und 7 auch in TERRIO (`03 Berechnungen/Nachweise`, „GRZ-Nachweis“) und NUMIO (`03 Berechnungen/Kosten`,
    Stufe als Inhalt, z. B. „Kostenschätzung“).

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

## Einstellungen aller Apps

Ein Dialog für alle Apps und Arkly (`packages/core/src/ui/Einstellungen.tsx`; Gestaltung nach docs/design.md,
„Einstellungen“). Geöffnet über „Datei → Einstellungen …“ in jeder App, in Arkly über „Einstellungen …“ im Menü
„Einstellungen und Hilfe“, überall mit Strg+,. Links die Seiten (senkrechte Registerleiste: ↑/↓, Pos1/Ende), rechts
der Inhalt. Änderungen gelten erst mit **Übernehmen**, für alle Seiten zugleich; Abbrechen, Esc und ein Klick daneben
fragen bei Änderungen „Änderungen an ‚Einstellungen‘ verwerfen?“. Im Notbetrieb (Netzlaufwerk nicht erreichbar) sind
Felder und „Übernehmen“ gesperrt.

- **Allgemein:** Speicherort der Einstellungen (Einzelplatz/Netzwerk; der Wechsel wirkt sofort), Name des Büros,
  Kürzel der Mitarbeiter. Das Farbschema bleibt im Menü der Titelleiste.
- **Pfade und Benennung:** alle Pfadvorgaben und Benennungsschemata, nach Thema gegliedert und mit den Apps
  gekennzeichnet, die sie nutzen; ein Filter „App“ zeigt nur die einer App. Je Eintrag: Feld (Listen je Zeile),
  Platzhalter-Chips (am Eintrag mit dem Fokus), Vorschau mit erfundenen Beispielwerten (BS9, „EFH Musterweg“, heute),
  Prüfung am Feld (unzulässige Zeichen `< > : " | ? *` und bei Namen `/`, `\`; leere Pflichtfelder; absolute Pfade, wo
  ein relativer verlangt ist; „..“; unter Windows reservierte Namen wie CON) und „Vorgabe wiederherstellen“. Wo ein
  Projekt einen eigenen Wert tragen kann (Dateinamen der Pläne in der Projektdatei, Abweichungen je Projekt in PERMIO,
  Kostenkontrolle in FABRIO), sagt es der Eintrag: Auf der Seite steht die Vorgabe des Büros, der Projektwert bleibt im
  Projekt.

| Thema               | Einstellung                                         | Apps                    | Vorgabe                                                       | gespeichert (Bereich › Schlüssel)                  |
| ------------------- | --------------------------------------------------- | ----------------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| Projekt             | Projektnummer                                       | ATLAS                   | `{JAHR}-{Nr:3}`                                               | projektordner › struktur.nummernschema             |
| Projekt             | Name des Projektordners                             | alle mit Projekten      | `{PROJEKT_KUERZEL} {PROJEKT_KURZNAME}`                        | projektordner › struktur.ordnername (+ allgemein › ordnerSchema) |
| Projekt             | Projektdatei (.oap) in neuen Projekten              | alle mit Projektdatei   | `03 Berechnungen/Flächen/{PROJEKT_KUERZEL} {PROJEKT_KURZNAME}.oap` | allgemein › oapPfad                           |
| Ablage              | Fotoordner                                          | RECTIO, FABRIO, ATLAS   | `09 Fotos`                                                    | allgemein › fotoordner                             |
| Ablage              | Antragsordner                                       | PERMIO                  | `TÖB`                                                         | allgemein › pfade                                  |
| Ablage              | PERMIO sucht Berechnungen außerdem in               | PERMIO                  | `Planung/Berechnungen` (dazu immer die Berechnungsordner der Rechen-Apps) | allgemein › pfade                       |
| Ablage              | Ablageordner der Katasterpläne                      | ATLAS                   | `Kataster`                                                    | kataster › zielpfad                                |
| Ablage              | Gewerke, LV-Unterordner, Aufträge, Mailverkehr, Archiv, Bauleitung, weitere Mailordner, Kostenkontrolle | FABRIO | wie bisher (`Gewerke`, leer, `Auftrag`, `Korrespondenz`, `Archiv`/`_archiv`, `Bauleitung`, `Korrespondenz`, `Kostenkontrolle`) | ava › ablage.* |
| Pläne und Dokumente | Dateinamen der Pläne                                | ATLAS                   | `{PROJEKT_KUERZEL}_{Plannummer}_{Index}_{Titel}`              | projektordner › struktur.dateischema               |
| Pläne und Dokumente | Dateinamen exportierter Antragsdokumente (PDF)      | PERMIO                  | `{PROJEKT_KUERZEL} {Art} {DATUM} {Nr} {Name}`                 | allgemein › pfade                                  |
| Pläne und Dokumente | Fester Zielordner exportierter Antragsdokumente     | PERMIO                  | `TÖB/{Antrag}`                                                | allgemein › pfade                                  |
| Pläne und Dokumente | Dateinamen der Katasterpläne                        | ATLAS                   | `{PROJEKT_KUERZEL} {Art} {DATUM} {Name}`                      | kataster › dateiname                               |
| Pläne und Dokumente | Muster der Rechnungsdateien                         | FABRIO                  | wie bisher (das erste für neue Dateien)                       | ava › rechnungen.muster                            |
| Export              | Berechnungsordner (gemeinsam), darin Unterordner je App | QUADRIO, TERRIO, NUMIO | `03 Berechnungen`; Unterordner `Flächen`, `Nachweise`, `Kosten` | allgemein › pfade                                  |
| Export              | Dateiname Excel-Export, Dateiname PDF-Export (gemeinsam, je App abweichend möglich) | QUADRIO, TERRIO, NUMIO | `{PROJEKT_KUERZEL} {DATUM} {Inhalt}`; abweichend leer | allgemein › pfade                                  |
| Export              | PDF beim direkten Export mitspeichern               | QUADRIO, TERRIO, NUMIO  | ja                                                            | allgemein › pfade                                  |
| Vorlagen            | Dateinamen der Vorlagen im Projekt                  | ATLAS                   | `{PROJEKT_KUERZEL} {Name}`                                    | projektordner › struktur.vorlagenname              |
| Vorlagen            | Leere Formulare                                     | PERMIO                  | (keiner)                                                      | allgemein › pfade                                  |
| Vorlagen            | Name neuer LV-Dateien                               | FABRIO                  | `{PROJEKT_KUERZEL} {DATUM} LV {Gewerk}`                       | ava › lv.dateiname                                 |

**Gemeinsame Angaben:** Was mehrere Apps gleich nutzen, steht einmal (docs/design.md, „Einstellungen“). Der
Berechnungsordner gilt für QUADRIO, TERRIO und NUMIO; darin hat jede App einen Unterordner (leer = direkt im
gemeinsamen). Die Vorgaben ergeben zusammen die Struktur von ATLAS („03 Berechnungen/Flächen“, „…/Nachweise“,
„…/Kosten“); die Projektdatei liegt per Vorgabe in „03 Berechnungen/Flächen“, dem Ordner von QUADRIO. Die Dateinamen
für Excel und PDF gelten ebenso gemeinsam; „Je App abweichend“ klappt je App ein Feld auf (leer = der
gemeinsame Name), die Vorschau unter der gemeinsamen Angabe zeigt, was je App gilt. Bis zur Umstellung stand je App ein
vollständiger Wert (`export.berechnungsordner.<app>`, `export.excel.<app>`, `export.pdf.<app>`): Daraus übernimmt die
Seite ohne Verlust – beim Ordner wird der längste gemeinsame Anfang gemeinsam und der Rest Unterordner, bei den Namen
der häufigste Wert gemeinsam und die übrigen Abweichungen; jede App exportiert danach wie vorher. Beim Speichern stehen
die wirksamen Werte je App weiter auch unter den alten Schlüsseln, damit ältere Versionen auf anderen Rechnern gleich
weiterarbeiten (der Projektordner selbst als „.“ – ältere Versionen zeigen dazu am Feld einen Hinweis, exportieren
aber richtig). Grenze: Sind die neuen Schlüssel einmal geschrieben, liest die neue
Version die alten nicht mehr – ändert danach eine ältere Version dort etwas, gilt das nur für sie, und das nächste
Speichern der Gruppe schreibt den wirksamen Wert zurück. PERMIO sucht externe Antragsdokumente (Berechnungen, Nachweise) in den Berechnungsordnern aller drei Rechen-Apps und in
den zusätzlich eingestellten Ordnern (Vorgabe wie bisher „Planung/Berechnungen“) – so findet es auch die direkten
Exporte. Platzhalter der Suchordner setzt PERMIO mit den Angaben des jeweiligen Projekts ein. Die Einträge unter
„Export“ (Berechnungsordner, Dateinamen, „PDF mitspeichern“) nutzt der direkte Export von QUADRIO, TERRIO und NUMIO
(Knopf „Exportieren“, siehe „Prüfschritte auf Windows: Direktexport und PDF aus Excel“).

**Ohne Verlust übernommen:** Die Werte bleiben unter ihren bisherigen Schlüsseln, die Apps lesen sie dort weiter
(„Vorgabe wiederherstellen“ schreibt die Vorgabe dort ausdrücklich hinein). Neue Einstellungen liegen in `allgemein.json`
unter `pfade`. Die Export-Einstellungen von PERMIO standen bis 0.58 nur je Rechner im Browser-Speicher
(`formulare:export`): Beim Start von PERMIO bzw. beim Öffnen der Seite werden abweichende Werte übernommen, wenn
gemeinsam noch keiner steht; der alte Eintrag bleibt unverändert. Steht gemeinsam schon ein anderer Wert (zweiter Rechner
einer Netzwerkinstallation mit eigenem altem Wert), wird nichts still überschrieben – die Seite zeigt die Abweichung und
fragt, welcher Wert gelten soll. Jeder alte Wert wird je Rechner nur einmal übernommen bzw. entschieden – ein späteres
„Vorgabe wiederherstellen“ bleibt bestehen. Ein eigener alter Berechnungsordner von PERMIO wird zusätzlicher Suchordner.
In die Struktur von ATLAS schreibt der
Dialog nur, wenn ATLAS sie angelegt hat und sie lesbar ist.

**In den App-Dialogen** stehen die Werte nur noch zur Ansicht, mit dem Verweis „Pfade und Benennung …“: ATLAS
(Einrichtung › Struktur „Namen“, Einstellungen: Projektdatei und Fotoordner bzw. „Speicherort und Büro …“, Vorlagen:
Dateinamen im Projekt, Katasterpläne: Ordner und Dateiname), PERMIO (Einstellungen › Antrag & Export, › Projektdatei),
FABRIO (Einstellungen › Ablage, › Rechnungen & Benennung, › Leistungsverzeichnisse). Die übrigen Einstellungen der Apps
bleiben in deren eigenen Dialogen („Einstellungen von PERMIO …“, „Einstellungen von FABRIO …“); die Stammordner der
Projekte und der Vorlagenordner von ATLAS ebenso.

**Für Entwickler:** Verzeichnis `packages/core/src/einstellungen/eintraege.ts` (je Einstellung Kennung, Apps,
Bezeichnung, Vorgabe, Platzhalter, Erklärung, Speicherort), Zugriff `einstellungen/pfade.ts` (`pfadWert`,
`pfadWertLesen`, `usePfadWert`, `pfadSpeichern`, `pfadeAbonnieren`; für den Export `exportPfade(app)`,
`exportPfadeLaden(app)`, `berechnungsordnerPfad`, `exportDateinameAusMuster`; für PERMIO `berechnungenSuchordner`),
Platzhalter `einstellungen/variablen.ts`. Öffnen mit `einstellungenOeffnen(seite?, fokus?)`, Menüpunkt
`einstellungenPunkt()`, Verweis `<PfadeVerweis fokus="…" />`. **Erweiterungspunkt:** `einstellungsSeiteAnmelden({ id,
titel, text, symbol, app, inhalt, entwurf? })` hängt eine Seite einer App an (hinter den gemeinsamen, nach App-Namen
sortiert); mit `entwurf` (geändert?, Fehler, übernehmen, verwerfen) gilt sie für „Übernehmen“ mit,
`einstellungenEntwurfMelden()` meldet Änderungen, `useEinstellungenGesperrt()` liefert den Grund einer Sperre,
`einstellungenStartseite(id)` macht sie zur Startseite der App. Apps, die Werte zwischenspeichern, lesen nach einer
Änderung neu (`konfigBeobachten(bereich, f)`; `konfigGeaendertMelden` meldet allen Fenstern und Tabs).

**Prüfschritte unter Windows** (Desktop, nach dem Update):

1. Strg+, in einer App und in Arkly (ohne Tab bzw. mit einem App-Tab): der Dialog öffnet sich genau einmal.
2. Speicherort *Netzwerkinstallation* mit einem Netzwerkpfad (`\\server\freigabe\arch-tools`) und mit einem
   verbundenen Laufwerk (`Z:\arch-tools`): Seite „Pfade und Benennung“ zeigt die Werte des Netzlaufwerks; eine Änderung
   erscheint nach „Übernehmen“ auf einem zweiten Rechner (nach dem nächsten Lesen, spätestens beim Öffnen des Dialogs).
3. Netzlaufwerk trennen: Der Dialog zeigt „nur lesbar“, Felder und „Übernehmen“ sind gesperrt.
4. „Leere Formulare“ (PERMIO) mit „Ordner wählen …“ auf einem UNC-Pfad und auf einem Laufwerk: wird angenommen; ein
   relativer Wert („Vorlagen“) wird abgelehnt.
5. Ein Rechner mit eigener alter PERMIO-Namensvorlage, ein zweiter mit einer anderen (Netzwerk): Auf dem zweiten zeigt
   die Seite die Abweichung mit der Wahl; nach der Wahl erscheint der Hinweis nicht mehr.
6. Unterordner von QUADRIO im Berechnungsordner auf einen Namen mit Umlaut und Leerzeichen setzen („Flächen alt“)
   und in QUADRIO „Exportieren“: QUADRIO legt den Ordner an und speichert dort; PERMIO findet die Datei als externes
   Antragsdokument.
