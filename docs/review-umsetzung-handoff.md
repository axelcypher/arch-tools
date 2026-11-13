# Hand-off: Umsetzung des Usability- und Rechts-Reviews (arch-tools)

Stand 11.11.2026, Basis `main` @ 8842863: Flächenrechner 0.15.0, GRZ-Nachweis 0.7.0, Projektordner 0.2.1,
Formulare 0.18.0.

Im November 2026 haben unabhängige Prüfer die Apps Flächenrechner, GRZ-Nachweis, Projektordner und Formulare
geprüft. Sie haben sie in der Web-Version bedient und mit vergleichbarer Software verglichen. Für Flächenrechner und
Formulare kam eine Rechtsprüfung dazu (DIN 277, WoFlV, BauO NRW 2018, BauPrüfVO). Der Nutzer hat entschieden, was
umgesetzt wird. Dieses Dokument enthält **nur die freigegebenen Punkte** und ist ohne die Original-Protokolle
umsetzbar, denn die liegen lokal in `.ref/` und sind nicht im Git.

Kommunikation, Oberfläche, Commit-Texte und Doku sind auf **Deutsch**.

## Regeln (vom Nutzer, verbindlich)

- **Das Repo `axelcypher/arch-tools` ist öffentlich.** Echte Formulare (`.frmsjf`) und Kundendaten nie committen.
  `.ref/` ist gitignored und in der Cloud nicht vorhanden. Tests, die `.ref` brauchen, überspringen sich dort; das
  ist so gewollt. Für Formulare deshalb nur synthetische Testdaten verwenden (vgl. `apps/formulare/src/forma/felder.test.ts`).
- **Version bumpen nach jeder abgeschlossenen Änderung** und auf `main` bringen. Neue Funktionen erhöhen die
  Minor-Version (0.x.0), reine Fehlerkorrekturen die Patch-Version. Je App gibt es fünf Stellen, die gleich sein müssen:
  `apps/<app>/package.json`, `apps/<app>/src-tauri/tauri.conf.json`, `apps/<app>/src-tauri/Cargo.toml`, den Eintrag
  im `apps/<app>/src-tauri/Cargo.lock` und `package-lock.json` (Letzteren mit `npm install --package-lock-only`
  nachziehen). Crate-Namen im Cargo.lock: `arch-flaechen-tool` (QUADRIO, Name bleibt absichtlich so),
  `grz-nachweis`, `kostenermittlung`, `projektordner`, `entzerrung`, `formulare`, `ava` und `arch-tools` (Rahmen-App
  Arkly, siehe `docs/suite.md`).
  - Änderungen an `packages/core` betreffen **alle** Apps, die den Code nutzen: QUADRIO, TERRIO, NUMIO, ATLAS,
    RECTIO, PERMIO, FABRIO und die Rahmen-App Arkly. Alle betroffenen Apps bumpen.
  - Ein Push auf `main` mit geänderter Version startet sofort den Release-Workflow (Installer und GitHub-Release).
- **Rust nur über die CI:** Änderungen an `apps/*/src-tauri` (Rust, capabilities, tauri.conf.json außer der
  Versionsnummer) erst als Branch mit PR einreichen, den CI-Job „Tauri-Hülle prüfen“ abwarten und dann per
  Fast-Forward nach `main` bringen. Die Punkte unten sollten fast alle ohne Rust auskommen. Wo ein Punkt Rust
  braucht, steht das dabei.
- **Alte Kennungen bleiben:** `arch-flaechen-tool` im Projektformat, in den Speicherschlüsseln und im Crate nicht
  „aufräumen“. Ebenso nach der Umbenennung der Apps: Die Produktnamen (Arkly, ATLAS, PERMIO, QUADRIO, TERRIO, NUMIO,
  RECTIO, FABRIO, LEXIO) stehen in `packages/core/src/appNamen.ts`; Ordner unter `apps/`, `?app=…`, Speicherschlüssel,
  `arch-tools:…`-Nachrichten, Bundle-Kennungen, Crate-Namen und Release-Tags bleiben. Ebenso der Paketname `@akh/core` und die Kennungen `de.pendzialek.*` (Kennungen des Repo-Eigentümers, keine Kundendaten). Testdaten dagegen nur erfunden: Personen, Firmen und Projekte ausgedacht, Mailadressen mit `example.com`/`example.org` bzw. der Endung `.example`. Welche App früher wie hieß:
  README, Abschnitt „Neue Namen“. Die Abschnitte unten nennen die Apps mit den Namen zur Zeit des Reviews.
- **Vor jedem Push:**
  - `npm run typecheck`, `npx vitest run` und `npm run build` grün.
  - Prettier nur auf eigene neue Dateien oder auf Dateien, die vorher schon Prettier-sauber waren:
    `npx prettier --single-quote --print-width 200 --write <dateien>`.
  - Commit-Text endet mit der Co-Authored-By-Zeile der Sitzung.
- **Prüfung der Oberfläche:** UI-Tests mit happy-dom (`*.ui.test.ts`, Muster siehe vorhandene Tests). Einen
  Headless-Browser nur nach Zustimmung des Nutzers verwenden. Den Chrome des Nutzers nie steuern.
- **Doku nachziehen:** `docs/<app>.md` bzw. `README.md` je Punkt kurz ergänzen.

## Vorgehen (Phasen)

Die Reihenfolge vermeidet Konflikte in `packages/core`: Querschnitt zuerst, dann je App. Jede Phase endet mit
Releases der betroffenen Apps. Innerhalb einer Phase lassen sich die Apps unabhängig voneinander umsetzen und
releasen, auch in getrennten Sitzungen, solange jede nur ihr `apps/<app>` anfasst.

1. **Phase 0 – Querschnitt (`packages/core`):** Die Abschnitte Q-1 bis Q-6 unten. Zuerst Q-1 (Farbschema) und Q-2
   (Dialoge, Esc), weil die App-Punkte darauf aufbauen. Danach Q-4 (Stammdaten): GRZ G-25, Flächenrechner F-17 und
   Formulare brauchen es.
2. **Phase 1 – Fehler je App:** Die mit „Fehler“ markierten Punkte. Sie sind klein (meist Aufwand S), danach je App
   ein Patch-Release.
3. **Phase 2 – fachliche Korrekturen:** Die Vorgaben der Formulare (R-…) und die normativen Korrekturen im
   Flächenrechner (FR-…).
4. **Phase 3 – Verbesserungen je App,** grob nach Priorität:
   - Formulare: U-03, U-02, U-04, U-05, U-06.
   - Flächenrechner: F-10, F-11, F-13, F-17, F-12, F-14 bis F-16, F-18 bis F-21.
   - GRZ: G-20, G-21, G-23, G-25, G-26, G-22, G-24, G-27 bis G-32.
   - Projektordner: P-01 bis P-03, P-05, P-04, P-06 bis P-15.

Den Fortschritt in `docs/review-umsetzung.md` als Checkliste führen: Punkt-ID, erledigt in Version x, gegebenenfalls
Abweichung mit Grund. Im Abschlussbericht je Release App, Version und Punkte nennen.

## Nicht umsetzen (Entscheidungen des Nutzers)

Diese Review-Punkte sind bewusst ausgeschlossen. Nicht „nebenbei“ mit erledigen:
- **Formulare:**
  - Baubeschreibung beim Einfamilienhaus (BauPrüfVO § 10 Abs. 1 Nr. 4): Die Regel bleibt, wie sie ist. Die
    Entscheidung ist offen, deshalb nicht anfassen.
  - Neue Vordrucke Stand 09/2026 (MB.NRW 2026 Nr. 220/229): bekannt, nicht Teil dieses Auftrags.
  - nw010013, Anschrift der Gemeinde: Sie entfällt zu Recht (digitales Verfahren). Kein Befund.
  - Kein Hinweis „keine Rechtsberatung“ einbauen.
  - Kästchen dürfen aus Projektmerkmalen **vorbelegt** werden (U-05). Ein reiner Vorschlag mit Bestätigung ist nicht
    nötig.
  - Keine Vorgaben zur Bezeichnung einer Vollständigkeitsanzeige.
- **Flächenrechner:**
  - Pauschaler 3-%-Abzug und die Begriffe „Brutto-/Netto-Wohnfläche“ in der Muster-Excel-Vorlage (`excel.ts`):
    bleiben.
  - Ein Raumkatalog darf auch im Dachgeschoss 100 % Wohnfläche ansetzen. Keine Sperre dafür.
- **GRZ-Nachweis:** Die Staffelgeschoss-Regel (BauO NW 1984/1995, BauO NRW 2000) bleibt, wie sie ist.

## Querschnitt (Phase 0, `packages/core`)

### Q-1 Farbschema sofort wechseln, Dunkelmodus vollständig (Fehler, Aufwand S–M)
**Problem:**
- `applyTheme` (`packages/core/src/platform/theme.ts:75`) läuft in GRZ, Kosten, Projektordner, Entzerrung,
  Formulare und Suite nur einmal in `main.tsx`. Ein Wechsel über ◐ wirkt deshalb erst nach einem Neustart.
- Nur der Flächenrechner führt das Schema nach (`apps/flaechenrechner/src/App.tsx:31`,
  `useEffect(() => applyTheme(theme, canvasDunkel), [theme, canvasDunkel])`).
- Dazu kommen fest eingetragene helle Farben: Ergebnis-, Meldungs- und Befundkästen im Projektordner, der
  GRZ-Lageplan (dort wirkt „Zeichenfläche abdunkeln“ nicht) und das Gesetzestext-Fenster der Formulare (hellgrauer
  Text auf Weiß).

**Soll:**
- Das Nachführen liegt zentral in core, etwa als Hook `useThemeAnwenden()` oder als Abo in `theme.ts`. Alle Apps
  nutzen es, die Kopie im Flächenrechner entfällt.
- Ein Wechsel über ◐ wirkt sofort in allen Apps und in der Suite.
- Keine festen Farben mehr in den genannten Kästen, sondern nur CSS-Variablen aus `packages/core/src/ui/base.css`.
- „Zeichenfläche abdunkeln“ wirkt auch im GRZ-Lageplan.

**Test:** ein core-UI-Test „Wechsel setzt `data-theme` sofort“, je App ein Rauchtest.

### Q-2 Dialoge einheitlich: Esc, Rückfrage mit „Speichern“ (Fehler, Aufwand M)
**Problem:**
- Esc schließt Druck, Excel und die Projektübersicht im GRZ nicht. Das Verhalten ist zwischen den Apps
  uneinheitlich.
- Rückfragen laufen über `window.confirm` (16 Stellen in `apps/*/src` und `packages/core/src`). „Ungespeicherte
  Änderungen verwerfen?“ bietet dadurch nur OK/Abbrechen, kein „Speichern“.

**Soll:**
- Eine gemeinsame Modal-Komponente in core: Esc schließt, der Fokus bleibt im Dialog und springt danach zurück.
- Ein gemeinsamer Rückfrage-Dialog mit „Speichern / Nicht speichern / Abbrechen“ für ungespeicherte Änderungen und
  mit „Ersetzen / Abbrechen“ für destruktive Aktionen.
- Alle `window.confirm` sind ersetzt.

**Vorbild:** Word, Archicad: „Änderungen speichern?“ mit drei Knöpfen.

**Test:** UI-Test für Esc und für den Rückfrage-Dialog.

### Q-3 Einheitliche Eingabeprüfung (Aufwand M)
**Problem:**
- Ungültige Eingaben verschwinden still oder werden still gekappt. Beispiele aus dem GRZ: „GRZ 4“ wird ohne Meldung
  zu 1,00, und „1.234“ wird als 1,234 m² gelesen.
- Fehlerkästen erscheinen sofort beim Öffnen statt nach der Eingabe (Projektordner).
- PLZ, E-Mail und unzulässige Zeichen im Kurznamen werden nicht geprüft, Pflichtfelder sind nicht markiert.

**Soll:**
- Ein gemeinsames Zahlenfeld und eine gemeinsame Prüflogik in core. Das Zahlenfeld liest deutsche Schreibweise
  (Komma als Dezimalzeichen, Punkt als Tausendertrenner, „1.234,5“ → 1234,5) und ein Einheitensuffix (m, m², %).
- Werte außerhalb des Bereichs werden nicht still gekappt, sondern gemeldet.
- Meldungen erscheinen direkt am Feld, und zwar erst nach dem Verlassen des Feldes oder nach dem Absenden.
- Pflichtfelder sind markiert.
- Einsetzen in allen Apps: Zahlenfelder in GRZ und Flächenrechner, das Stammdatenformular (PLZ 5-stellig, E-Mail,
  zulässige Zeichen für Ordnernamen) sowie Datums- und Zahlenfelder in den Formularen, soweit nicht
  formularspezifisch.

**Test:** Unit-Tests für das Zahlenlesen, UI-Test „Meldung erst nach blur“.

### Q-4 Stammdaten einmal erfassen, überall gleich ausgeben (Aufwand M–L)
**Ausgangslage:**
- Gemeinsame Stammdaten gibt es schon: `packages/core/src/ui/Stammdaten.tsx` mit `StammdatenFelder`,
  `StammdatenDialog` und den Bereichen projekt, grundstueck, bauherr, umfang; dazu `ProjectMeta` in
  `packages/core/src/model.ts`.
- Genutzt werden sie in Formulare und Projektordner. GRZ und Flächenrechner haben keine eigene Eingabe. Dort kommen
  Bauherr, Adresse, Gemarkung, Flur und Flurstück nur aus anderen Apps, und der Bericht des Flächenrechners hat
  keinen Kopf mit Büro, Bauherr und Flurstück.

**Soll:**
- Eine Quelle für die Stammdaten des Projekts, also die Projektdatei bzw. `projekt.json` im Projektordner.
- In jeder App lassen sich die Stammdaten mit derselben Komponente ansehen und ändern, ohne die App zu wechseln.
- Ein gemeinsamer Kopf für Ausdrucke und Excel (Büro, Bearbeiter, Bauherr, Adresse, Gemarkung/Flur/Flurstück,
  B-Plan Nr./Name, Datum, Seitenzahlen). Flächenrechner F-17, GRZ G-25 und G-20 sowie die Kosten nutzen ihn.
- Änderungen in einer App erscheinen in den anderen, sobald dort neu geladen wird. Zusammenführen beim Speichern
  wie heute.
- Ergänzung um B-Plan Nr./Name, sofern nicht vorhanden. Gebietsart gehört zum GRZ (G-26).

**Test:** core-Test „Stammdaten aus der Projektdatei, Kopf enthält Felder“, je App ein UI-Test „Stammdaten öffnen“.

### Q-5 Einheitlicher Einstieg (Aufwand S–M)
**Problem:**
- Die Apps beginnen unterschiedlich: In der Titelleiste steht „Projekte“, im Projektordner gibt es den Reiter
  „Projekt“.
- Die Leerzustände sind verschieden (GRZ G-27, Formulare-Web, Projektordner P-13).

**Soll:**
- Gleicher Einstieg in allen Apps über die gemeinsame `ProjektWahl` (`packages/core/src/ui/ProjektWahl.tsx`),
  mit gleicher Benennung „Projekte“.
- Ein Leerzustand mit denselben Aktionen: zuletzt geöffnet, Projekt wählen, Datei öffnen, neu.
- Der Projektordner fügt sich ein. Die Begriffe sind in allen Apps gleich.

**Test:** UI-Test je App: Leerzustand zeigt dieselben Aktionen.

### Q-6 Fehlermeldungen beim Öffnen verständlich (Fehler, Aufwand S)
**Problem:**
- Eine defekte Projektdatei erzeugt eine technische Meldung (Flächenrechner F-07, GRZ G-14).
- Eine beschädigte alte `projekt.json` wird im Projektordner gar nicht gemeldet.
- Ein fehlgeschlagenes Öffnen schließt in den Formularen das schon geöffnete Formular (B-06).

**Soll:**
- Eine gemeinsame Meldung „Datei … ließ sich nicht lesen (Grund in Klartext). Das geöffnete Projekt bleibt
  unverändert.“ Technische Details stehen aufklappbar bzw. im Protokoll.
- Ein fehlgeschlagenes Öffnen ändert den aktuellen Zustand nicht.

**Test:** UI-Test mit defekter Datei je App.


---

## Formulare

App `apps/formulare` (Stand 0.18.0). Pfade relativ zu `apps/formulare/src/`, wenn nicht anders angegeben. Kennungen wie nw010002 = Formular (Vorgabe `vorgaben/nw010002.ts`). Zeilenangaben gelten für Commit 8842863. Nach jeder Änderung Version der App erhöhen (Projektregel).

Reihenfolge: A Fehler, B Korrekturen der Vorgaben (Recht), C Verbesserungen.

---

# A Fehler

### B-01 Schließen des Gesetzestext-Fensters stürzt die App ab  (S)
**Problem:** `components/GesetzModal.tsx:58`: `useEffect(() => markiert.current?.scrollIntoView?.({ block: 'center' }), [gesetz, q]);` Der Pfeil gibt den Rückgabewert von `scrollIntoView` zurück. Chromium (auch WebView2) liefert dort ein Promise, React ruft es als Aufräumfunktion auf: Fehlerbildschirm „destroy is not a function“. Auslöser: Info-Symbol an entfallendem Feld (z. B. nw010001 Nr. 6 Baubeschreibung) öffnen, dann Esc, „Schließen“ oder Klick daneben; derselbe Absturz beim Wechsel auf den zweiten Reiter (zweite Fundstelle). In jsdom fällt es nicht auf, weil `scrollIntoView` dort fehlt.
**Soll:**
- Effekt mit Block-Körper: `useEffect(() => { markiert.current?.scrollIntoView?.({ block: 'center' }); }, [gesetz, q]);`
- Schließen (Esc, Knopf, Klick daneben) und Reiterwechsel stürzen nicht ab.
- Im Repo nach weiteren Effekten suchen, die einen Wert zurückgeben (`useEffect(() => x?.…` ohne Klammern); die anderen `scrollIntoView`-Aufrufe (`Einrichten.tsx:131/134`, `FelderAnsicht.tsx:36`, `SeitenAnsicht.tsx:102`, `navigation.ts`) sind Anweisungen in Blöcken bzw. Handlern, trotzdem gegenprüfen.
**Auflagen:** Test für Schließen **und** Reiterwechsel.
**Test:** `formulare.ui.test.ts` (oder neue `gesetz.ui.test.ts`): `Element.prototype.scrollIntoView` auf eine Funktion setzen, die ein Promise zurückgibt; Fenster mit zwei Fundstellen öffnen (Formular mit begründeter Bedingung, z. B. Baubeschreibung nw010002 `1:CheckBox6` mit Gebäudeart Einfamilienhaus, zwei Quellen), zweiten Reiter wählen, schließen; erwartet: kein Fehlerbildschirm, Konsole ohne „useEffect must not return anything“.

### B-02 Drucken liefert eine leere Seite  (S)
**Problem:** `packages/core/src/ui/base.css:759` (`@media print`): `.app > :not(.report-backdrop) { display: none !important; }` blendet alles außer Berichten aus und setzt `@page { size: A4 landscape }`. Die Gegenregel in `styles.css` (Druckblock um Zeile 2304: `.fo-main … { display: block !important }`) hat geringere Spezifität und verliert; Ergebnis: eine weiße Seite bei Strg+P / „Drucken“ (Web-Version: einziger Weg zur PDF).
**Soll:**
- Die core-Druckregel gilt nur für Apps mit Bericht (z. B. `body.druck-bericht .app > :not(.report-backdrop)`; die anderen Apps setzen die Klasse, wenn sie einen Bericht drucken) oder Formulare überschreibt sie mit höherer Spezifität (`.app > .fo-main`).
- Formulare druckt die Formularblätter (`.fo-blatt`, A4 hoch, wie auf dem Vordruck), eines je Seite, ohne Werkzeugleiste und Gliederung.
- Im Druck und PDF keine App-Zutaten: keine Info-Symbole (`.fo-entfall-info`), keine Durchstreichung/„entfällt“, keine Autofill- und Textmarker-Farben, keine Feldrahmen-Hinterlegung.
**Auflagen:** (Recht, § 1 Abs. 3 BauPrüfVO) Der Druck muss den amtlichen Vordruck unverfälscht wiedergeben; deshalb die Liste oben.
**Test:** Druck-Snapshot-Test (Druckmedien emulieren, falls im Test-Setup möglich; sonst Test, der `base.css` und `styles.css` einliest und prüft, dass keine core-Druckregel `.fo-main` ausblendet): `.fo-blatt` sichtbar, `.fo-entfall-info` ausgeblendet.

### B-03 Web-Version: „Festlegen …“ führt in eine Sackgasse  (S, zusammen mit C U-02)
**Problem:** `components/Antrag.tsx:76` `umfangZeigen()` setzt `setHaupt('projektkarte')`; ohne Projekt (Web-Version, Formular per „Formular öffnen …“) gibt es keine Projektkarte, `formularSichtbar` wird falsch: Werkzeugleiste und Gliederung verschwinden, nur „Formular öffnen …“ bleibt, Herunterladen nicht mehr möglich. Aufrufer: `components/Gliederung.tsx:132` (Knopf „Festlegen …“ im Hinweiskasten `fo-gl-merkmal`), `Seitenleiste.tsx:241`.
**Soll:**
- `haupt` wird nie auf eine Ansicht gesetzt, die es nicht gibt: ohne Projekt führt „Festlegen …“ nicht dorthin.
- In der Web-Version stattdessen die Auswahl direkt am Formular (siehe U-02), Merkmale lokal je Datei; sonst Knopf ausblenden.
**Test:** `formulare.ui.test.ts`: Formular ohne Projekt öffnen, „Festlegen …“ (bzw. Merkmalauswahl) bedienen; Werkzeugleiste und Gliederung bleiben sichtbar.

### B-04 Farbschema wechselt erst nach Neuladen  (S)
**Problem:** `applyTheme` wird nur in `main.tsx:13` beim Start aufgerufen (`packages/core/src/platform/theme.ts:75`); nur `apps/flaechenrechner/src/App.tsx:31` hat `useEffect(() => applyTheme(theme, canvasDunkel), …)`. In Formulare (und GRZ, Entzerrung) bleibt die Oberfläche nach Wahl Hell/Dunkel/System (`packages/core/src/ui/TitleBar.tsx`, `ThemeMenu`) unverändert bis zum Neuladen.
**Soll:**
- Zentral anwenden (Store-Abo in `theme.ts` oder Effekt in `TitleBar`), sodass alle Apps sofort wechseln; der Effekt im Flächenrechner entfällt oder bleibt harmlos.
- Die Option „Zeichenfläche im dunklen Schema abdunkeln“ (`TitleBar.tsx:206`) wirkt in Formulare nicht (Papier bleibt weiß): dort ausblenden (Option per Prop der TitleBar steuerbar).
**Test:** UI-Test in core oder Formulare: Theme auf „dunkel“ setzen, `document.documentElement` trägt sofort das dunkle Schema (Attribut/Klasse, die `applyTheme` setzt).

### B-05 Gesetzestext im Dunkelmodus unlesbar  (S)
**Problem:** `components/GesetzModal.tsx` mit Stilen `.fo-gesetz-zeile` in `styles.css`: Textkasten weiß, nicht markierte Absätze hellgrau (Kontrast etwa 1,3:1), nur der markierte Absatz lesbar.
**Soll:**
- Kasten mit Themenfarben (`var(--bg)`/`var(--text)`) oder bewusst Papier mit dunklem Text; Kontrast mindestens 4,5:1 für **allen** Text, auch den nicht markierten Rest.
- Markierung über Hintergrund und Rand (`.fo-gesetz-zeile.markiert`), nicht durch Ausgrauen des Rests.
**Auflagen:** Der nicht markierte Rest des Paragrafen ist für die rechtliche Einordnung nötig (z. B. § 68 Abs. 2 Satz 5, § 1 Abs. 2 Satz 3 BauPrüfVO).
**Test:** CSS-Test oder UI-Test: berechnete Farben in hell und dunkel ergeben Kontrast >= 4,5:1 (kleine Hilfsfunktion für Kontrast).

### B-06 Fehlgeschlagenes Öffnen schließt das geöffnete Formular  (S)
**Problem:** `store.ts:955` `dateiOeffnen` ruft `await get().schliessen()` vor dem Einlesen (`oeffnen(...)`) auf; schlägt das Öffnen fehl (falsche Datei, z. B. `package.json`: „Unbekanntes Dateiformat bei Byte 149 …“), ist das vorher offene Formular weg.
**Soll:**
- Erst einlesen/prüfen, dann das alte Formular schließen und das neue setzen; bei Fehler bleibt das alte offen.
- Meldung in Alltagssprache: „Das ist kein FORMA-Formular (.frmsjf). Bitte eine Formulardatei aus dem FORMA-Projektordner wählen.“; die technischen Einzelheiten ins Protokoll.
- Gleiches für den Pfad über den Projekteintrag (Zeile darüber, `fehler(`${eintrag.name} lässt sich nicht öffnen`…)`) prüfen.
**Test:** `formulare.ui.test.ts`: Formular offen, `dateiOeffnen` mit ungültigen Bytes; erwartet: Formular bleibt offen, Meldung mit dem neuen Text.

### B-07 Abschnitt ohne Kennzeichnung, obwohl alle Felder entfallen  (S, abhängig von B-R01)
**Problem:** nw010010 (Baubeschreibung), Gliederung „Nr. 4 Barrierefreies Bauen“: alle Kästchen entfallen (Info-Symbole), die Gliederung (`components/Gliederung.tsx`) zeigt weder Zähler noch „entfällt“; Nr. 8 bis 10 dagegen durchgestrichen mit „entfällt“. Ähnlich Nr. 11 und 12.
**Soll:**
- Einheitlich: Abschnitt „entfällt“ (grau, durchgestrichen), wenn alle zählenden Felder entfallen **und alle zugehörigen Merkmale festgelegt sind**.
- Hängt der Entfall nur an nicht festgelegten Merkmalen, gilt nach R-01 (unten) der Abschnitt als offen: Kennzeichnung „offen – hängt ab von: Gebäudeart“.
- „Zählt nicht“ (freiwillig, z. B. `zaehltNicht`) wird getrennt gekennzeichnet („freiwillig“, grau).
**Auflagen:** „Entfällt“ am Abschnitt nie bei fehlendem Merkmal (würde den Fehler aus R-01 verstärken).
**Test:** `bedingung.test.ts` („Bedingungen in der Gliederung“): Abschnitt entfällt nur mit festgelegtem Merkmal; fehlendes Merkmal ergibt Kennzeichnung „offen“.

### B-08 Verlauf passt in der Web-Version nicht zum Dateistand  (S)
**Problem:** Eingaben machen, Herunterladen („… gespeichert.“), neu laden, Originaldatei erneut öffnen: Die heruntergeladenen Eingaben fehlen im Formular (richtig), der Verlauf (`components/VerlaufLeiste.tsx`, `verlauf.ts`) listet sie aber weiter als erledigte Schritte.
**Soll:**
- Beim Öffnen den Verlauf gegen den Dateiinhalt abgleichen (Schritte, deren Wert nicht in der Datei steht, trennen: „frühere Sitzung – nicht in dieser Datei“) oder beim Öffnen einer anderen Dateiversion verwerfen.
- Meldung beim Herunterladen in der Web-Version: „heruntergeladen als … – bitte die neue Datei weiterverwenden“ statt „gespeichert“.
**Test:** `sicherung.ui.test.ts` bzw. `verlauf.test.ts`: Verlauf mit Schritt, Datei ohne diesen Wert öffnen; Schritt als „nicht in dieser Datei“ gekennzeichnet; Meldungstext je Umgebung.

---

# B Korrekturen der Vorgaben (rechtlich)

Gemeinsame Hinweise: Gesetzesquellen mit `q(gesetz, paragraf, absatz?, satz?, nummer?)` (`vorgaben/hilfen.ts:39`), Begründung mit `begruendet(bedingung, grund, ...quellen)`. Zu jeder geänderten Vorgabe einen Fall in die Fallmatrix aufnehmen (siehe Test unter R-01; `vorgaben/vorgaben.test.ts`, Muster Zeilen 114 ff.). Die Texte der Vordrucke und Gesetze (Paragrafen, Absätze) sind in `recht/` hinterlegt; Quellenangaben müssen dort auflösbar sein (`recht/recht.test.ts`).

### R-01 / U-01 Fehlendes Projektmerkmal darf Pflichtfelder nicht entfallen lassen  (M)
**Problem:** `bedingung.ts:126-127` (`trifft`): „ohne Wert im Projekt trifft ein Merkmal nie zu – auch nicht verneint“, Doku Zeile 137. Ohne festgelegte Merkmale entfallen daher Pflichtvorlagen: nw010001/nw010002 Nr. 2 Maß der baulichen Nutzung, Nr. 3 Flurkarte, Nr. 6 Baubeschreibung, Betriebsbeschreibung, Nr. 11.2 Brandschutz; nw010010 Nr. 8 bis 10 (Schutz gegen schädliche Einflüsse, Wärmeerzeugung, Lüftung); Nachweise in den Anzeigen (`vorgaben/vordruck2018.ts:97-117`, `grundlagen.ts`). Füllstand und Gliederung behandeln die Angaben als erledigt (grüner Füllstand bei fehlenden Pflichtvorlagen; Antrag unvollständig, Nachforderung nach § 71 Abs. 1 BauO NRW 2018). Dasselbe im Projektumfang: `antrag.ts:505` `umfangErforderlich` (nutzt `erfuellt`) → `antragStore.ts:563` setzt den Dokumentstatus auf `'entfaellt'` (z. B. Baubeschreibung gilt als nicht erforderliches Dokument).
**Soll:**
- Drei Zustände je Feld/Abschnitt/Dokument: erforderlich, entfällt, **offen** (Merkmal nicht festgelegt). Ein Merkmal ohne Wert lässt nichts entfallen (Fail-safe): `trifft()` liefert für Merkmal ohne Wert `true` (für `ist` und `istNicht`), `fehlendeMerkmale` dient weiter für den Hinweis. Die Prüfung `erfuellt` im Projektumfang folgt derselben Logik, d. h. Dokumente mit fehlendem Merkmal bekommen den normalen Status (fehlt/unvollständig/offen/aktuell), nie `'entfaellt'`.
- Offene Felder zählen für den Füllstand wie erforderliche Felder; Gliederung und Zähler zeigen zusätzlich gelb „n offen (hängt von Merkmalen ab)“; ✓ und voller Balken erscheinen nicht, solange etwas offen ist.
- Am Feld: gelb statt neutral hinterlegt, kleines Info-Symbol mit Text „Offen – hängt ab von: Gebäudeart (nicht festgelegt)“ bzw. „Erforderlich, bis Gebäudeart festgelegt ist“. Das Wort „Entfällt“ nur, wenn alle beteiligten Merkmale festgelegt sind und die Bedingung nicht zutrifft; die Zeile „Im Projekt noch nicht festgelegt: …“ in `entfall.ts:58-60` bleibt, aber unter der Überschrift „Offen“ statt „Entfällt“.
- `entfall.ts` (`entfallGruende`, `entfallText`) liefert für fehlende Merkmale keinen Entfall mehr, sondern einen „offen“-Grund.
**Auflagen:** „Ungeklärt“ zählt **wie erforderlich**; ein eigener gelber Zähler daneben ist gut, darf aber kein ✓/keinen vollen Balken erzeugen. Gleiche Logik im Projektumfang. Kurztext nie „Entfällt, weil: Gebäudeart ist nicht festgelegt“ (inhaltlich falsch).
**Vorbild:** ELSTER und WISO zeigen Anlagen erst, wenn die Vorfrage beantwortet ist, und werten eine unbeantwortete Vorfrage als offenen Punkt im Prüfbericht.
**Test:** `bedingung.test.ts` (Test „fehlt der Wert im Projekt, trifft sie nie zu“, Zeile 14, an neue Logik anpassen); `recht/recht.test.ts` „Gründe und Hinweis eines entfallenden Felds“ (Zeile 46: erwartet bisher „Entfällt“ bei leeren Merkmalen, neu: kein Entfall-Grund, stattdessen Offen-Text); `antrag.ui.test.ts` (Zeile 533 prüft bisher `'entfaellt'` bei fehlendem Merkmal, neu: nicht `'entfaellt'`); in `vorgaben/vorgaben.test.ts` eine **Fallmatrix** (Verfahren x Gebäudeklasse x Gebäudeart x Sonderbau x Planungsrecht, auch „nicht festgelegt“ → erwartete Pflichtvorlagen; sichert zugleich R-03, R-04, R-06, R-07, R-08 ab).

### R-03 nw010005: Erklärung zum Brandschutz entfällt bei „nein“  (S)
**Problem:** `vorgaben/nw010005.ts:98`: `...fuer(s1('CheckBox8'), wenn(ja))`; Nr. 6 ist „Erklärung der/des Entwurfsverfassenden bei Vorhaben gemäß § 68 Absatz 2 Satz 2“. Bei „Behandlung als Bauantrag: nein“ (häufigster Fall: Einfamilienhaus, Gebäudeklasse 1 oder 2) wird eine Pflichtunterlage ausgeblendet. § 13 Abs. 1 Satz 3 BauPrüfVO verlangt die Erklärung bei den Gebäudeklassen 1 und 2 in der Genehmigungsfreistellung immer.
**Soll:**
- `'1:CheckBox8'` erforderlich bei `oder(ja, ist('Gebäudeklasse', '1', '2'), angekreuzt('0:CheckBox8'), angekreuzt('0:CheckBox9'))` (Kästchen Gebäudeklasse 1 und 2 im Formular); nicht mehr nur bei `ja`.
- `grund`: „Bei Gebäuden der Gebäudeklassen 1 und 2 ist die Erklärung zum Brandschutz in der Genehmigungsfreistellung immer beizufügen (auch wenn die Unterlagen nicht als Bauantrag behandelt werden sollen); sonst nur bei Behandlung als Bauantrag.“
- Quellen: `q('baupruefvo', '13', 1, 3)`, `q('bauo-nrw', '68', 2, 2)`.
- Plausibilitätshinweis (Warnung, nicht blockierend): Merkmal Sonderbau = ja bei nw010005: „Sonderbauten sind von der Genehmigungsfreistellung ausgeschlossen (§ 63 Abs. 1 Satz 2 BauO NRW 2018).“
**Test:** `vorgaben/vorgaben.test.ts` Fallmatrix: nw010005, Behandlung „nein“, Gebäudeklasse 1 → `1:CheckBox8` erforderlich; Gebäudeklasse 3, „nein“ → entfällt; „ja“ → erforderlich.

### R-04 nw010002: Betriebsbeschreibung nur bei Sonderbauten  (S)
**Problem:** `vorgaben/nw010002.ts:30-38` (Abschnitt `'2:Panel1'` „Zusätzliche Bauvorlagen für Sonderbauten“ mit Bedingung `und(bauantrag, sonderbau)`) und `:80` (`'2:CheckBox1': nurBetrieb`); ebenso `vorgaben/nw010002_2024D.ts` (um Zeile 190-195, `und(sonderbau, Nichtwohngebäude)`, Feld `1:CheckBox10`). § 10 Abs. 1 Satz 1 Nr. 4 BauPrüfVO verlangt die Betriebsbeschreibung für jeden gewerblichen oder landwirtschaftlichen Betrieb, nicht nur für Sonderbauten (Anlage I/1 führt sie folgerichtig als allgemeine Nr. 9). Bei gewerblicher Halle/Werkstatt ohne Sonderbaueigenschaft fehlt sie.
**Soll:**
- Bedingung vom Abschnitt auf die Felder verlegen: Abschnitt `'2:Panel1'` ohne Bedingung, Titel „Nr. 8 Betriebsbeschreibung, Nr. 9 Zusätzliche Bauvorlagen für Sonderbauten“.
- `'2:CheckBox1'`: `begruendet(und(bauantrag, ist('Gebäudeart', 'Nichtwohngebäude')), 'Die Betriebsbeschreibung gehört im vereinfachten Verfahren zu jedem gewerblichen oder landwirtschaftlichen Betrieb – nicht nur zu Sonderbauten (der Vordruck führt sie unter den Sonderbauten auf).', q('baupruefvo','10',1,1,4), q('baupruefvo','5',2), q('baupruefvo','5',3))`.
- `'2:CheckBox2'` (Nr. 9 Zusätzliche Angaben): `begruendet(und(bauantrag, sonderbau), 'Zusätzliche Angaben nach § 12 BauPrüfVO nur bei Sonderbauten (z. B. Versammlungs-, Beherbergungs-, Verkaufsstätten, Mittel- und Großgaragen).', q('baupruefvo','12'), q('bauo-nrw','50',1))`.
- 2024D `1:CheckBox10`: `sonderbau` aus der Bedingung entfernen.
- Hinweis im Grund ergänzen (aus R-16): „Bei Wohngebäuden mit gewerblicher Einheit und bei gewerblichen Anlagen ohne Gebäude selbst prüfen.“
**Test:** Fallmatrix: nw010002 vereinfacht, Nichtwohngebäude, Sonderbau nein → Betriebsbeschreibung erforderlich; Einfamilienhaus → entfällt; Sonderbau ja ohne Gebäudeart → offen (R-01).

### R-06 nw010002 Nr. 11: Sonderbau der Gebäudeklasse 4/5 soll „Erklärung“ abgeben  (S)
**Problem:** `vorgaben/nw010002.ts:73` (Gruppe `brandschutz`, Regel „eins“ aus `2:CheckBox4`/`2:CheckBox5`), `:81` (11.2 nur bei GK 4/5 und Sonderbau nein oder Mittelgarage `0:CheckBox24`); 11.1 (`2:CheckBox4`, „Erklärung nach § 68 Abs. 2 Satz 2“) ohne Bedingung. Beim Sonderbau der GK 4/5 entfällt 11.2, die Gruppe verlangt dann 11.1, also eine Erklärung, die es in diesem Fall nicht gibt (für Sonderbauten gilt § 68 Abs. 2 Satz 5: die Behörde bzw. Prüfingenieure prüfen). Das verleitet zu einer unzutreffenden Erklärung.
**Soll:**
- `'2:CheckBox4'`: `begruendet(und(ist('Gebäudeklasse','1','2','3'), ist('Sonderbau','nein')), 'Die Erklärung der Entwurfsverfassenden genügt bei Gebäuden der Gebäudeklassen 1 bis 3 und Kleingaragen. Bei Sonderbauten prüft die Bauaufsichtsbehörde den Brandschutz (auch durch Prüfingenieure) – dann gehört das Brandschutzkonzept/der Brandschutznachweis zu Nr. 9.', q('bauo-nrw','68',2,2), q('bauo-nrw','68',2,5))`.
- Gruppe `brandschutz` bekommt die Bedingung `ist('Sonderbau', 'nein')`: beim Sonderbau verlangt die Gruppe weder 11.1 noch 11.2.
- Am Sonderbau-Abschnitt Nr. 9 Hinweis auf § 9 BauPrüfVO (Brandschutzkonzept bei Sonderbauten), `q('baupruefvo','9')`.
**Auflagen:** Kleingaragen (Erklärung genügt) kennt die App noch nicht; nicht in dieser Aufgabe lösen, im Grund nur nennen.
**Test:** Fallmatrix: Sonderbau GK 5 → weder 11.1 noch 11.2 erforderlich; GK 2, Sonderbau nein → 11.1; GK 5, Sonderbau nein → 11.2.

### R-07 Nr. 4 Amtliche Basiskarte zählt immer als Pflicht  (S)
**Problem:** nw010001 (`vorgaben/nw010001.ts`, `bedingungen` ab Zeile 50: für `1:CheckBox4` keine Bedingung) und nw010002 (`1:CheckBox4`, ebenfalls keine). Nr. 4 zählt damit immer (z. B. „0 von 4“ erforderlichen Unterlagen), obwohl § 10 Abs. 1 Satz 1 Nr. 1 i. V. m. § 2 BauPrüfVO den Kartenauszug nur bei Vorhaben nach §§ 34, 35 BauGB verlangt; im Bebauungsplangebiet bleibt der Füllstand unvollständig, obwohl alles beisammen ist. `nw010002_2024D.ts:187` hat bereits `'1:CheckBox4': nurInnenAussen`, die Stände sind uneinheitlich.
**Soll:**
- `'1:CheckBox4': nurInnenAussen` in nw010001 und nw010002 (wie 2024D); Nr. 4 zählt im Innen-/Außenbereich weiter.
- Grund an Nr. 4 ergänzen: „nach Anforderung der Bauaufsichtsbehörde, üblich im Außenbereich“.
- Titel Nr. 3 ergänzen: „entfällt bei amtlichem Lageplan (§ 2 Absatz 2 Satz 3 BauPrüfVO)“ (nur Hinweistext, Quelle `q('baupruefvo','2',2,3)`).
**Test:** Fallmatrix: Planungsrecht Bebauungsplan → Nr. 4 entfällt; Innenbereich/Außenbereich → erforderlich; nicht festgelegt → offen (R-01). Danach gilt Zeile von R-25 für „einfacher Bebauungsplan“.

### R-08 nw010001: Barrierefrei-Konzept zählt nicht  (S)
**Problem:** `vorgaben/nw010001.ts:48`: `zaehlt: zaehltNicht('1:CheckBox8', '1:CheckBox37')`; Nr. 8 Barrierefrei-Konzept (Kopfkommentar: „nur, wenn gefordert (§ 9a BauPrüfVO)“). Nach § 11 Satz 2 und § 9a Abs. 1 BauPrüfVO ist es kraft Verordnung bei neu zu errichtenden öffentlich zugänglichen Gebäuden beizufügen, die große Sonderbauten sind (Anlage I/1 betrifft ausschließlich große Sonderbauten, die meisten sind öffentlich zugänglich).
**Soll:**
- `'1:CheckBox8'` aus `zaehltNicht` nehmen (`'1:CheckBox37'` bleibt).
- Bedingung: `begruendet(wenn(ist('Vorhaben','Errichtung')), 'Pflicht bei neu zu errichtenden öffentlich zugänglichen Gebäuden, die große Sonderbauten sind (außer Gebäuden von Polizei und Justiz). Bei nicht öffentlich zugänglichen Gebäuden (z. B. Hochhaus nur mit Wohnungen, Regallager) selbst als „zählt nicht“ einstellen.', q('baupruefvo','9a',1), q('baupruefvo','11'), q('bauo-nrw','49',2))`.
**Test:** Fallmatrix: nw010001, Vorhaben Errichtung → Nr. 8 erforderlich; Änderung → entfällt; nicht festgelegt → offen.

### R-10 Anzeigen (Fassung 2018): § 68 nach alter Gliederung, Schall-/Wärmeschutz zu großzügig  (M)
**Problem:** `vorgaben/vordruck2018.ts:97-117` (`nachweise.nichtAbsatz2Gebaeude`, `nichtAbsatz2`, `brandschutz`) und `vorgaben/nw030001.ts:29` (Abschnitt `'1:Panel1'` Nr. 1 Schall- und Wärmeschutz entfällt zusätzlich bei Ein- und Zweifamilienhaus), ebenso `nw030003.ts`:
- Schall-/Wärmeschutz entfällt auch beim Zweifamilienhaus der GK 3; geltendes Recht (§ 68 Abs. 4 Satz 2 BauO NRW 2018, Fassung ab 01.09.2026) befreit nur Wohngebäude der GK 1 und 2.
- Die Gründe sprechen von „Gebäuden nach § 68 Absatz 2“; in der Fassung 2026 regelt Abs. 2 den Brandschutz. `q('bauo-nrw','68')` bzw. `68, 2` markiert falsch bzw. nichts.
- Brandschutzbedingung (`GK 4/5 oder Sonderbau`) erfasst Mittel- und Großgaragen der GK 1 bis 3 nicht.
**Soll:**
- Schall/Wärme (nw030001 Nr. 1): Bedingung nur `nachweise.nichtAbsatz2Gebaeude` (Kriterium Ein-/Zweifamilienhaus streichen); `grund`: „Bescheinigungen über Schall- und Wärmeschutz sind nicht erforderlich bei Wohngebäuden der Gebäudeklassen 1 und 2. Der Vordruck (Fassung 2018) nennt noch ‚Gebäude nach § 68 Absatz 2‘ und ‚Wohngebäude mit bis zu zwei Wohnungen‘ – maßgeblich ist das geltende Gesetz.“; Quelle `q('bauo-nrw','68',4,2)`; Kopfkommentar `nw030001.ts:8` berichtigen.
- Standsicherheit (`nichtAbsatz2`): `grund`: „Prüfung und Bescheinigung entfallen u. a. bei Wohngebäuden der Gebäudeklassen 1 und 2 einschließlich ihrer Nebengebäude; die weiteren Ausnahmen (landwirtschaftliche Betriebsgebäude, eingeschossige Gebäude bis 200 m²) erkennt die App nicht.“; Quelle `q('bauo-nrw','68',3,5,2)`.
- Brandschutz (`nachweise.brandschutz`): `grund`: „Bescheinigung der Prüfsachverständigen bei Gebäudeklasse 4 und 5 (ohne Sonderbauten) und Mittelgaragen; bei Sonderbauten und Großgaragen prüft die Bauaufsichtsbehörde; bei Gebäudeklasse 1–3 genügt die Erklärung.“; Quellen `q('bauo-nrw','68',2,3)`, `q('bauo-nrw','68',2,5)`, `q('bauo-nrw','68',2,2)`.
**Test:** Fallmatrix für nw030001: Zweifamilienhaus GK 3 → Nr. 1 erforderlich; Wohngebäude GK 1/2 → entfällt; `recht/recht.test.ts`/`vorgaben.test.ts` löst alle neuen Quellen auf (Absatz/Satz/Nummer vorhanden).

### R-25 Merkmal „Planungsrecht“ kennt den einfachen Bebauungsplan nicht  (M)
**Problem:** `bedingung.ts:33` (Werte „Bebauungsplan“, „Innenbereich“, „Außenbereich“); `vorgaben/grundlagen.ts:9-24` (`nurBebauungsplan`, `nurInnenAussen`). Im Geltungsbereich eines einfachen Bebauungsplans (§ 30 Abs. 3 BauGB) richtet sich die Zulässigkeit im Übrigen nach § 34 oder § 35; er zählt als „Vorhaben nach den §§ 34 und 35“ (§ 10 Abs. 1 Satz 1 Nr. 1 BauPrüfVO). Wählt man „Bebauungsplan“, entfällt die Flurkarte zu Unrecht; wählt man „Innenbereich“, entfällt die Maßberechnung trotz Festsetzungen zum Maß (§ 3 Abs. 2 BauPrüfVO).
**Soll:**
- Werte von `Planungsrecht`: „Bebauungsplan“ (Beschriftung/Erklärung: qualifiziert oder vorhabenbezogen, § 30 Abs. 1, 2 BauGB), neu „einfacher Bebauungsplan“ (§ 30 Abs. 3 BauGB) und „Satzung nach BauGB“ (z. B. § 34 Abs. 4, § 35 Abs. 6).
- `nurBebauungsplan`: `ist('Planungsrecht', 'Bebauungsplan', 'einfacher Bebauungsplan', 'Satzung nach BauGB')`; Grund ggf. auf „nur im Geltungsbereich eines Bebauungsplans“ kürzen.
- `nurInnenAussen`: `ist('Planungsrecht', 'Innenbereich', 'Außenbereich', 'einfacher Bebauungsplan')`; Grund ergänzt um „… oder einfacher Bebauungsplan (§ 30 Abs. 3 BauGB)“; zusätzliche Quelle `q('baugb','30')`.
- Bestehende Projekte mit dem Wert „Bebauungsplan“ beim Laden nicht umdeuten, aber im Hinweis erklären.
- Neue Werte werden in `mitVorgabeMerkmalen` an eigene Listen angehängt (vorhandenes Verhalten).
**Test:** `bedingung.test.ts`/Fallmatrix: einfacher Bebauungsplan → Flurkarte (Nr. 3) und Maßberechnung (Nr. 2) erforderlich; qualifizierter Bebauungsplan → Nr. 3 entfällt, Nr. 2 erforderlich; `mitVorgabeMerkmalen` ergänzt die neuen Werte.

---

# C Verbesserungen

### U-02 Projektmerkmale direkt im Formular festlegen  (M, löst B-03 mit)
**Problem:** Der Hinweiskasten in der Gliederung (`components/Gliederung.tsx:~128-136`, `fo-gl-merkmal`: „Für die Bedingungen dieses Formulars fehlt im Projekt: …“) führt über „Festlegen …“ (`umfangZeigen`) aus dem Formular in die Projektkarte (Desktop) bzw. in die Sackgasse B-03 (Web). Kontext (welches Feld, warum) geht verloren.
**Soll:**
- Je fehlendem Merkmal eine kleine Auswahl im Hinweiskasten (Segmentknöpfe, z. B. „Planungsrecht: Bebauungsplan | einfacher Bebauungsplan | Innenbereich | Außenbereich | Satzung nach BauGB“); Änderung wirkt sofort (Füllstand, Entfall/Offen aktualisieren sich), Desktop: Speichern in der Projektdatei (.oap, wie bisher bei den Merkmalen), Web: lokal je Datei (Entwurfssicherung).
- Dasselbe im Tooltip/Gesetzesfenster am offenen Feld: „Gebäudeart festlegen …“ (öffnet die gleiche Auswahl).
- Jede Auswahl mit Kurzerklärung und Fundstelle: „Bebauungsplan = qualifizierter oder vorhabenbezogener Bebauungsplan (§ 30 Abs. 1, 2 BauGB)“, „Sonderbau (§ 50 BauO NRW 2018)“, „Gebäudeklasse (§ 2 Abs. 3 BauO NRW 2018)“.
- Merkmale gelten für das Projekt, nicht je Formular (Web: je Datei).
**Auflagen:** Die Wahl ist eine rechtliche Einordnung durch die Entwurfsverfassenden (§ 54 Abs. 1 BauO NRW 2018); Kurzwahl ohne Erklärung verleitet zu falschen Werten. Planungsrecht erst mit dem Wert aus R-25 sinnvoll.
**Vorbild:** WISO/SteuerSparErklärung stellen die Weichenfrage dort, wo sie gebraucht wird, und blenden danach ein/aus; das Bauportal.NRW fragt im Assistenten Schritt für Schritt.
**Test:** `formulare.ui.test.ts`: Formular mit fehlendem Merkmal öffnen, Wert im Hinweiskasten wählen; erwartet: Merkmal gesetzt (Projektdatei bzw. lokaler Speicher), Hinweiskasten verkleinert sich, abhängige Felder wechseln von „offen“ zu „erforderlich“/„entfällt“.

### U-03 Prüfliste „Was fehlt noch?“ und Sprung zur nächsten offenen Angabe  (M)
**Problem:** `components/FelderAnsicht.tsx:13-44`: Filter `'alle' | 'leer' | 'geaendert'` („Leere“) zeigt auch Behördenfelder (z. B. „Aktenzeichen der Bauaufsichtsbehörde“, zählt nicht), entfallene Felder und „Gebäudeklasse 2/4/5“ obwohl die Gruppe „eine genügt“ schon erfüllt ist. Kein Weg „zur nächsten offenen Angabe“; die Suche meldet je Seite „Keine passenden Felder.“.
**Soll:**
- Filter „Offene“ ersetzt/ergänzt „Leere“: genau das, was im Füllstand fehlt (Gruppen als eine Zeile, entfallene und nicht zählende Felder ausgeschlossen, offene Felder nach R-01 eingeschlossen).
- Knopf „Nächste offene Angabe“ (auch per Tastatur, z. B. F8) springt zum Feld (nutzt vorhandene Sprunglogik `navigation.ts`, Textmarker `markierung.ts`).
- Prüfliste im Kopf der Gliederung: „6 offen · 2 ungeklärt · 1 Hinweis“ (Hinweise: Widersprüche aus U-04, Abweichungen aus U-05).
- Suche: Seiten ohne Treffer ausblenden, Trefferzahl zeigen.
**Auflagen:** Die Liste enthält die ungeklärten Angaben (R-01/U-01) und Hinweise auf veraltete Vordrucke (soweit vorhanden). Bei leerer Liste: „Nach den Vorgaben der App keine offenen Angaben“, nicht „vollständig“.
**Vorbild:** Mein ELSTER „Prüfen“ (Fehler und Hinweise mit Link „zum Feld“), WISO „Steuer-Check“.
**Test:** `formulare.ui.test.ts`: leeres nw010001 → Filter „Offene“ zählt nicht Aktenzeichen der Behörde, nicht entfallene Felder, Gruppe Gebäudeklasse als eine Zeile; nach Ankreuzen einer Gebäudeklasse verschwindet die Zeile; „Nächste offene Angabe“ fokussiert das erste offene Feld.

### U-04 Plausibilität: widersprüchliche Kreuze melden  (M)
**Problem:** nw010001/nw010002: „Bauantrag“ und „Antrag auf Vorbescheid“ (Gruppe `antragsart`, `vorgaben/antrag.ts:75`) und mehrere Gebäudeklassen (`gebaeudeklasse`, `antrag.ts:76`, auch nw010005 `:91`) lassen sich ohne Hinweis ankreuzen, die Gliederung zeigt ✓. Regeln in `profil.ts:36` sind nur `'eins' | 'alle' | 'nie'` („eine genügt“).
**Soll:**
- Neue Gruppenregel „genau eine“ (`'genau'` in `Regel`/`REGELN`, Zählung wie „eine genügt“, zusätzlich Warnung bei mehr als einem Kreuz); Warnung gelb am Abschnitt/in der Gliederung, **nicht blockierend**; wird in der Prüfliste (U-03) als Hinweis geführt.
- Anwenden als **Fehlermeldung** nur bei: Antragsart (Bauantrag/Antrag auf Vorbescheid, `antrag.ts:75`; § 77 Abs. 1) und ja/nein „Behandlung als Bauantrag“ in nw010005 (`nw010005.ts:88`).
- **Gebäudeklasse**: nur ein Hinweis, keine Regel „genau eine“: „Mehrere Gebäudeklassen – umfasst der Antrag mehrere Gebäude?“ (zulässig bei Wohnhaus und Garage, Doppelhaus).
- **Gebäudekategorie** („Art des Gebäudes“, Vordruck „alle zutreffenden“) und **Abweichungen**: keine Regel.
- Optionsfelder (Radio) in der Felderansicht nur für die echten Entweder-oder-Fälle (Antragsart, ja/nein).
- Plausibilität „Sonderbau = ja“ bei nw010005: Warnung (siehe R-03).
**Auflagen:** immer nicht blockierend; Texte formulieren als Hinweis, nicht als Rechtsaussage.
**Vorbild:** ELSTER-Plausibilitätsprüfung unterscheidet Fehler und Hinweise.
**Test:** `profil`-/`bedingung.test.ts`: Regel „genau“ zählt wie „eins“ und meldet bei zwei Kreuzen; `formulare.ui.test.ts`: nw010001 Bauantrag und Vorbescheid angekreuzt → Warnung am Abschnitt; Gebäudeklasse 1 und 3 → nur Hinweistext; Gebäudekategorien mehrfach → keine Meldung.

### U-05 Formularangaben und Projektmerkmale abgleichen  (M)
**Problem:** Gebäudeklasse, Verfahren und Vorhaben stehen doppelt: als Kästchen im Formular (nw010001/nw010002 Abschnitt „Gebäudeklasse“, `0:CheckBox4`–`8`; nw010005 `0:CheckBox8`–`12`) und als Projektmerkmale (`bedingung.ts:~25-33`); ein Kreuz bei „Gebäudeklasse 3“ ändert das Merkmal nicht, das Merkmal kreuzt nichts an; Bedingungen lesen das Merkmal (z. B. `nw010002.ts:81`), das Formular kann davon abweichen (R-24).
**Soll:**
- Kästchen aus dem Projektmerkmal **vorbelegen** (gewollt): nur in leeren Kästchen, nie überschreiben, wie Autofill (`autofill.ts`, Markierung „aus Projektmerkmal“); für Gebäudeklasse (Merkmal → Kästchen 1 bis 5). Verfahren und Antragsart **nicht** verknüpfen („Verfahren“ = Freistellung/vereinfacht/Baugenehmigung ist nicht „Antragsart“ = Bauantrag/Vorbescheid; „Vorhaben“ ist im Vordruck Freitext).
- **Abweichungen melden** (bleibt Pflicht): Projekt „Gebäudeklasse 3“, Formular „Gebäudeklasse 1“ erscheint als Hinweis in der Prüfliste (U-03), am Feld mit kleinem Symbol: „Projekt: GK 3, Formular: GK 1“.
- Umgekehrt beim Ankreuzen anbieten: „Gebäudeklasse 3 als Projektmerkmal übernehmen?“ (mit Rückfrage).
- Bedingungen dürfen zusätzlich das Kästchen berücksichtigen: `oder(ist('Gebäudeklasse', 'n'), angekreuzt('0:CheckBox…'))` wie bei `sonderbau` (R-24), oder Plausibilitätshinweis bei Abweichung.
**Auflagen:** (Hinweis des Rechtsgutachtens) Ein vorbelegtes Kreuz ist eine Erklärung der Entwurfsverfassenden; daher sichtbar als Vorschlag gekennzeichnet, ohne Überschreiben, und mit gelber Abweichungsmeldung. Die zuvor genannte Auflage „nur vorschlagen“ ist nicht gefordert.
**Vorbild:** SJ FORMA überträgt Projektdaten in alle Formulare; XBau/Bauportal fragt jede Angabe einmal ab.
**Test:** `autofill.test.ts` bzw. `formulare.ui.test.ts`: Merkmal Gebäudeklasse 3 → leeres Kästchen „Gebäudeklasse 3“ vorbelegt und markiert; bereits angekreuztes Kästchen bleibt unverändert; Abweichung erscheint in der Prüfliste.

### U-06 Info-Symbole: weniger, klein, rechts am Feld, per Tastatur erreichbar  (M)
**Problem:** `components/EntfallInfo.tsx:60` (`tabIndex={-1}`: nicht per Tastatur erreichbar, Hinweis nur beim Zeigen); im leeren nw010001 etwa 35 Symbole, auf Blatt 2 sitzen sie über den Kästchen und überdecken „3-fach“; in der Bindungen-Tabelle in jeder Zelle eines; Trefferfläche sehr klein. Aufrufer `components/SeitenAnsicht.tsx:138` (absolut positioniert über dem Feld, Klasse `fo-el`) und `components/FelderAnsicht.tsx:129`. Stile `.fo-entfall-info` in `styles.css:3794-3830` (13 px).
**Soll:**
- Symbole **klein und unauffällig** (Zusatz des Nutzers): nicht größer als jetzt (13 px Symbol, eher kleiner/zurückhaltende Farbe, in der Papieransicht geringe Deckkraft), nicht auffällig groß; die Trefferfläche über unsichtbares Padding vergrößern, nicht über die Symbolgröße.
- Entfällt ein ganzer Abschnitt aus **identischem** Grund, nur ein Symbol am Abschnitt, die Felder darin neutral; Symbole am Feld nur bei eigenem Grund (Merkmal, Rechtsgrundlage, Büroregel).
- Position rechts außen am Feldrahmen statt über der Beschriftung/dem Kästchen; darf Text („3-fach“) und Kästchen nicht überdecken.
- Per Tastatur erreichbar: `tabIndex` 0 bzw. Hinweis auch beim Fokus des Felds selbst; F1 am fokussierten Feld zeigt den Hinweis; Enter/Leertaste öffnet den Gesetzestext.
- Nie im Druck (siehe B-02).
**Auflagen:** Bündeln nur bei identischem Grund; Felder mit eigenem Grund (Merkmal, Büroregel) behalten ihr Symbol; die Herkunft (Gesetz, Vordruck, Büro) muss am Symbol bzw. im Hinweis erkennbar bleiben.
**Vorbild:** ELSTER hat ein „?“ je Frage (eine Stelle), Acrobat zeigt Feld-QuickInfos bei Fokus.
**Test:** `formulare.ui.test.ts` (oder `entfall`-UI-Test): leeres nw010001 hat deutlich weniger Symbole als Entfallfelder; Abschnitt mit identischem Grund hat genau eines; Symbol per Tab erreichbar (`tabIndex` >= 0) und per Tastatur auslösbar; CSS-Größe <= 13 px.


---

## Flächenrechner

Grundlage: Flächenrechner 0.15.0. Pfade relativ zum Repo. `F` = `apps/flaechenrechner/src`, `C` = `packages/core/src`.
Zeilennummern sind Stand Commit 8842863, bei Abweichung gilt der genannte Funktionsname.
Tests: Rechenkern `C/core.test.ts`, `C/ifcImport.test.ts`, `C/rechenweg.test.ts`, `C/detect.test.ts`; App `F/store/store.test.ts`, `F/core/exportData.test.ts`, `F/core/app.test.ts`, `F/platform/excel.test.ts`.
Nicht ändern (Entscheidung des Nutzers): der pauschale 3-%-Abzug und die Zeilen „Brutto-/Netto-Wohnflächen“ der Excel-Mustervorlage (`F/platform/excel.ts` ca. Z. 242–253).
Nach Umsetzung Version der App erhöhen.
Normen: DIN 277:2021-08 ist urheberrechtlich geschützt, Texte und Tabellen nur sinngemäß bzw. als büroeigener Katalog. Stellen mit **[Norm prüfen]** sind nur aus Sekundärquellen belegt.

# A. Fehler

### F-01 Doppelte Raumnummern, Nummer hängt an Geschossposition  (Aufwand M)
**Problem:** `nextRoomNumber` (`F/store/store.ts:337`) bildet `<Geschossindex>.<Anzahl Räume + 1>`. EG mit 0.01–0.04, 0.02 gelöscht, neuer Raum heißt wieder 0.04 (doppelt). Wird ein KG darunter angelegt, verschiebt sich der Geschossindex, neue EG-Räume passen nicht mehr zu den alten. Aufruf in `F/components/Canvas.tsx:271` (Raum zeichnen/erkennen).
**Soll:**
- Neue Nummer = höchste vorhandene Nummer des Geschosses + 1 (numerisch, nicht Anzahl).
- Nummernpräfix je Geschoss einstellbar (neues Feld am Geschoss), Vorgabe aus Geschossart bzw. -name (KG → -1, EG → 0, 1. OG → 1), danach unabhängig von der Listenposition.
- Warnung bei doppelten Nummern (Eintrag der Prüfliste aus F-10).
- Befehl „Räume neu nummerieren“ (Reihenfolge nach Liste oder im Uhrzeigersinn): nur auf ausdrücklichen Befehl, nie automatisch; für Räume aus dem IFC-Import (`ifcId` gesetzt) gesperrt bzw. mit Warnung „Nummern weichen dann vom Modell und den Plänen ab“ (der IFC-Abgleich `C/ifcAbgleich.ts` arbeitet teils über Nummer und Name).
**Auflagen:** Raumnummern im Flächennachweis müssen mit den Bauzeichnungen übereinstimmen, daher kein stilles Umnummerieren.
**Vorbild:** Archicad zählt ab der zuletzt vergebenen Nummer weiter und hat „Zonen neu nummerieren“; Vectorworks hat ein Präfix je Geschoss.
**Test:** `F/store/store.test.ts`: vier Räume, zweiten löschen, neuer Raum bekommt 0.05; KG vor EG einfügen ändert die Nummernvergabe im EG nicht; Neu-Nummerieren lässt IFC-Räume unberührt.

### F-02 / FR-15 Kopieren und Duplizieren behalten Nummern und Wohnung  (Aufwand S)
**Problem:** `flaechenEinfuegen` (`F/store/store.ts:492`) und `duplicateStorey` (`F/store/store.ts:300`) übernehmen Raumnummer (0.01 …) und `wofl.wohnung` des Ursprungsgeschosses. In das 1. OG eingefügte EG-Räume landen in der WoFlV-Tabelle bei der Wohnung „EG“. Das Duplikat heißt „EG (Kopie)“. Dazu (FR-15): „Wohnung = Geschoss“ als Automatik (`F/components/IfcImportDialog.tsx` ca. Z. 153, `C/ifcImport.ts:194–198`, `Properties.tsx:451`) ist bei EFH/Maisonette falsch gegliedert (Summe stimmt).
**Soll:**
- Beim Einfügen in ein anderes Geschoss bzw. beim Duplizieren fragen: Nummern an das Zielgeschoss anpassen (Präfix aus F-01, fortlaufend) ja/nein; Wohnung ersetzen: Auswahl aus den vorhandenen Wohnungen, Vorgabe „Wohnung beibehalten“, nicht stillschweigend „Wohnung = Geschoss“.
- IFC-Import: Option „eine Wohnung für alle Geschosse / je Geschoss / aus Zonenkategorie“; im Bericht Hinweis, wenn Wohnungsnamen gleich Geschossnamen sind.
- Einfügen im selben Geschoss ändert Nummern nicht, ist aber ein Fall für F-10 (`Strg+V` erzeugt um 0,5 m versetzte Kopien).
**Auflagen:** keine neue Automatik, die Wohnung = Geschoss setzt (§ 1 Abs. 2, § 2 Abs. 1 WoFlV: Wohnfläche je Wohnung; § 3 HBauStatG).
**Vorbild:** Archicad passt beim Kopieren in ein anderes Geschoss die Zonennummer über Nummerierungsregeln an.
**Test:** `F/store/store.test.ts`: EG-Räume ins 1. OG einfügen mit Option „Nummern anpassen“ → 1.01 ff., Wohnung wie gewählt; Duplikat analog.

### F-03 Neues Geschoss: falscher Name, immer oben  (Aufwand S)
**Problem:** `F/components/Sidebar.tsx:52` ruft `addStorey(project, \`${project.storeys.length}. OG\`)` (`F/store/store.ts:290`): Name immer „<Anzahl>. OG“, Geschoss immer ganz oben. Ein KG/DG muss umbenannt und verschoben werden; mit vorhandenem KG heißt das nächste OG falsch.
**Soll:**
- „+ Neu“ als Auswahl „darüber / darunter einfügen“; Name nach Lage vorschlagen (KG, EG, 1. OG, DG), Fußbodenhöhe aus dem Nachbargeschoss.
- Die WoFlV-Heuristik (`woflArt` in `C/norms.ts:72`, `KEINE_WOFL_GESCHOSS` Z. 69) hängt an einer Geschossart (neues Feld: Keller-/Wohn-/Dachgeschoss), nicht am Geschossnamen; sonst schließt ein automatisch „KG“ getauftes Geschoss eine Souterrainwohnung aus. Altprojekte: Art aus dem Namen ableiten, danach änderbar; Dateiformat abwärtskompatibel (Feld optional).
**Vorbild:** Archicad/Allplan: Geschossdialog mit „über/unter dem aktuellen Geschoss einfügen“ und Höhe.
**Test:** `F/store/store.test.ts`: Einfügen unter dem EG liefert KG; `C/core.test.ts`: `woflArt` mit Geschossart „Keller“ vs. Name.

### F-04 Radiobuttons im IFC-Dialog verrutscht  (Aufwand S)
**Problem:** In `F/components/IfcImportDialog.tsx` (Z. 186–194) stehen die drei Optionen (aktualisieren / neu / hinzufügen) rechtsbündig, die Radiobuttons schweben mittig vor dem Text. Fehlbedienung bei „Aktualisieren“ möglich (berührt von Hand gesetzte R/S, WoFlV).
**Soll:** gleiche Anordnung wie die Checkboxen darüber (Knopf links, Text daneben, linksbündig); CSS in `F/styles.css`.
**Test:** nur visuell.

### F-05 Einstellleiste von „Erkennen“ verdeckt die Ansichtsleiste  (Aufwand S)
**Problem:** Das Feld „Lückenschluss“ (`F/components/Canvas.tsx:1113`) legt sich über „Punktfang/Hilfslinien“; mit Hintergrundplan ersetzt die Leiste die Ansichtsoptionen ganz; die Meldung „Der Klickpunkt liegt auf einer Linie …“ verdeckt sie ebenfalls.
**Soll:** Werkzeugoptionen in eine eigene Zeile oder die Statusleiste; Meldungen überdecken keine Bedienelemente; „Punktfang“ bleibt immer erreichbar.
**Test:** nur visuell.

### F-06 Layout- und Textfehler in den Eigenschaften  (Aufwand S)
**Problem:** `F/components/Properties.tsx`: Checkbox „Abzugsfläche“ (Z. 101) winzig, der zweizeilige Text läuft in die Überschrift „Höhenlage Fußboden“; R/S-Auswahl (Z. 91) abgeschnitten („überc…“); Maßzahlen der Auswahl liegen auf den Eckgriffen („4,9|0“, `Canvas.tsx`); im Nachschlagewerk sind lange Einträge links abgeschnitten, waagerechte Bildlaufleiste nötig.
**Soll:** Abstände korrigieren; R/S-Texte kürzen auf „R – Regelfall“ / „S – Sonderfall“, Erklärung als Hinweis und nach DIN 277 formuliert: „allseitig in voller Höhe umschlossen“ statt „überdeckt“ (siehe FR-13); Maßtexte der Auswahl außerhalb der Kante versetzen; Navigationsliste des Nachschlagewerks umbrechen.
**Test:** nur visuell.

### F-07 Technische Fehlermeldung beim Öffnen  (Aufwand S)
**Problem:** Beim Öffnen einer beschädigten `.oap` zeigt `F/components/Toolbar.tsx:36` per `alert` „Die Datei ist kein gültiges JSON.“ (Quelle `ProjectFormatError` in `C/serialize.ts:79`, `C/archive.ts:157`).
**Soll:** verständliche Meldung mit Dateiname („Die Datei ‚x.oap‘ ist keine gültige Projektdatei oder beschädigt.“) und Hinweis auf den letzten Zwischenstand/Sicherung; eigener Dialog statt `alert`. Fehlertexte im Kern bleiben, der Dateiname wird in der App ergänzt.
**Vorbild:** Office/CAD-Standardmeldung mit Dateiname und Wiederherstellungshinweis.
**Test:** `F/core/app.test.ts` (Meldungslogik in eine testbare Funktion ziehen): ungültiger Inhalt → Meldung enthält den Dateinamen.

### F-08 Harmlose Meldungen als roter Fehlerzähler  (Aufwand S)
**Problem:** Der Zähler „Protokoll“ in der Titelleiste springt nach dem IFC-Import auf rot 2/3; Inhalt: „wasm streaming compile failed … falling back to ArrayBuffer instantiation“ (web-ifc), der Import funktioniert.
**Soll:** Rückfall-/Streaming-Meldungen von web-ifc als Info/Debug führen und nicht als Fehler zählen; rot nur bei echten Fehlern. Stelle: Protokoll-/Konsolenabfang der App (per Grep nach `console.error`-Abfang bzw. Protokoll-Store suchen).
**Test:** Unit-Test des Protokollfilters: Meldung „wasm streaming compile failed“ erhöht den Fehlerzähler nicht.

### F-09 Beschriftungen im PDF doppelt im Text  (Aufwand S)
**Problem:** In der Flächenaufstellung (Drucken/PDF) erscheinen Raumnamen doppelt im Text („00..0011 WWoohhnneenn“), die PDF-Suche findet „Wohnen“ nicht, vermutlich Halo als zweites Textelement (`F/components/PlanFigure.tsx`; `paint-order: stroke` ist in `F/styles.css:46,60` schon gesetzt, prüfen, wo noch doppelt gezeichnet wird). Die letzte PDF-Seite trug zudem den grauen App-Hintergrund (nur mit Hintergrundgrafiken beobachtet, gegen den echten Druckdialog prüfen).
**Soll:** Halo über `paint-order: stroke` am selben Textelement, nie ein zweites Textelement; Druck-CSS mit weißem Hintergrund; auch Zahlen und Einheiten (m², m³) stehen nicht doppelt im Text.
**Test:** Test auf die SVG-Ausgabe von `PlanFigure`: je Beschriftung genau ein `<text>`-Element.

# B. Rechtliche und normative Korrekturen

(FR-01 bewusst nicht aufgenommen; FR-15 steht in F-02. FR-05, FR-08, FR-09, FR-12, FR-19 werden zusammen mit den genannten F-Punkten in Abschnitt C umgesetzt, hier stehen sie mit ihrem Soll.)

### FR-02 Raumumschließung R/S der Räume  (Aufwand M)
**Problem:** `createRoom` setzt immer `umschliessung: 'R'` (`C/model.ts:580`); der IFC-Import vergibt nie S (`C/ifcImport.ts:168–203`); `Properties.tsx:521` warnt nur bei KGF gesamt < 0. Balkon 8 m² als R-Raum plus S-Umriss 8 m²: NRF S = 0, KGF S = 8,00, KGF R um 8 m² zu klein. DIN 277:2021-08 verlangt die getrennte Ermittlung nach R/S (`C/calc.ts:291–297`, `addRS`).
**Soll:**
- Standard-Umschließung eines Raums aus dem Umriss ableiten, in dem er liegt (wie `raumBodenVersatz`), mit „von Hand“-Übersteuerung, die erhalten bleibt.
- IFC-Import: Räume mit `woflArt = 'freisitz'` auf S setzen.
- Warnungen je Bereich: NRF(R) > BGF(R), NRF(S) > BGF(S), R-Raum außerhalb aller R-Umrisse (als Hinweis in der Prüfliste aus F-10).
**Test:** `C/core.test.ts`: Balkon-Szenario (BGF R 120 + S-Umriss 8, Balkonraum) → NRF S 8, KGF S 0; `C/ifcImport.test.ts`: Freisitz-Raum bekommt S.

### FR-03 Abzugsflächen in Räumen: WoFlV und DIN 277 getrennt  (Aufwand M)
**Problem:** In `C/calc.ts` (ca. Z. 296–300) gilt `woflArea = a × f` mit negativem `a` und dem Faktor der eigenen Kategorie der Abzugsfläche; neue Abzugsflächen haben WoFlV „keine“ (`C/model.ts:582`). Raum 69,56 m² mit Schornstein 0,50 × 0,50 als Abzug: NRF 69,31, aber Wohnfläche 69,56 (erwartet 69,31), still ohne Hinweis. Der Hinweis in `F/components/Report.tsx:264–265` empfiehlt, alle § 3 Abs. 3-Flächen (auch Treppen) als Abzug zu erfassen, was die NRF nach DIN 277 falsch mindert (Treppen sind VF, gehören zur NRF).
**Soll:**
- Abzugsflächen in einem Raum erben dessen WoFlV-Kategorie und Wohnung (Übersteuerung möglich).
- Abzugsart wählbar: „NRF und Wohnfläche“ (Standard, z. B. Schornstein, Pfeiler > 0,1 m² und > 1,50 m hoch, Schacht im Raum), „nur Wohnfläche (§ 3 Abs. 3 WoFlV)“ (Treppe mit mehr als drei Steigungen, Treppenabsatz; berührt die NRF nicht), „nur DIN 277“ (z. B. Pfeiler ≤ 0,1 m², der nach WoFlV mitzählt).
- Hinweistext im Bericht und in den Eigenschaften präzisieren (Schwellen und Nischenregel nennen).
**Auflagen:** Abzugsflächen überlappen absichtlich: in der Überlappungsprüfung (F-10) ausnehmen; im Rechenweg (F-13) als eigene Minuszeilen.
**Test:** `C/core.test.ts`: Schornstein-Fall → NRF 69,31, WoFl 69,31; Treppen-Abzug „nur Wohnfläche“ → NRF unverändert.

### FR-04 Beispiele für BGF-Abzugsflächen widersprechen DIN 277  (Aufwand S)
**Problem:** `F/components/Properties.tsx:101–104` zeigt für Umriss und Raum denselben Text „Abzugsfläche (wird abgezogen, z. B. Innenhof, Schacht, Treppenloch)“; Kommentar `C/model.ts:12` „z. B. Innenhof, Schacht, Schornstein“. Schacht 0,60 × 0,60 als Abzug am BGF-Umriss: BGF −0,36 m², BRI −1,08 m³, falsch (Schornsteine und nicht begehbare Schächte sind KGF, begehbare Schächte TF, Aufzugsschächte VF, in jeder Grundrissebene **[Norm prüfen]**).
**Soll:** Hinweis je Art: Umriss „z. B. Innenhof, Luftraum über Galerie“; Raum „z. B. Schornstein, Pfeiler, Schacht im Raum“. „Treppenloch“ als BGF-Abzug entfernen (DIN 277:2021 regelt Treppen/Öffnungen neu **[Norm prüfen]**). Kommentar in `C/model.ts` angleichen.
**Test:** kein Rechentest nötig; Texte nur testen, falls schon Hinweistexte getestet werden.

### FR-05 Putzabzug unsichtbar, Normausgabe und Maßgrundlage fehlen  (Aufwand M; Rechenweg siehe F-13, Kopf siehe F-17)
**Problem:** Der Putzabzug (`roomArea` in `C/model.ts:634–636`, `C/calc.ts` ca. Z. 296) mindert NRF und Wohnfläche, ist aber im Ausdruck (`F/components/Report.tsx:72, 199–213`) und im Grundriss unsichtbar (Grundriss 9,40 × 7,40 m, Fläche 67,47 m²). Kopf/Überschriften nennen nur „nach DIN 277“ bzw. „nach WoFlV“ ohne Ausgabe und Maßgrundlage.
**Soll:**
- Raumliste im Bericht um „Fläche roh“ und „Putzabzug %“ ergänzen (nur wenn ein Raum einen Abzug hat).
- Fußnote: „Flächen aus Planmaßen (Rohbau), Putzabzug je Raum; Wohnfläche nach WoFlV vom 25.11.2003; Grundflächen und Rauminhalte nach DIN 277:2021-08“ (Maßgrundlage aus dem Projektfeld).
- Projektfeld „Maßgrundlage“: Planmaß Rohbau / Planmaß Fertig / Aufmaß, Eingabe in `F/components/ProjektDialog.tsx`, Ausgabe im Berichtskopf und in Excel.
**Test:** `F/core/exportData.test.ts`: Raum mit 3 % Putzabzug liefert Spalten roh/Abzug/Fläche mit stimmender Rechnung.

### FR-06 Nutzungsgruppen-Vorschlag beim IFC-Import  (Aufwand S)
**Problem:** `NUTZUNG_KEYWORDS` (`C/ifcImport.ts:927–933`): `abstell|keller|garage|fahrrad|müll` → NUF 4 (DIN 277: 7.3 Abstellräume, 7.4 Fahrzeugabstellflächen, also NUF 7); „galerie“ → VF (im Wohnungsbau meist NUF 1); „hwr“ → TF (Hauswirtschaftsraum ist Nutzungsfläche). Widerspruch zum eigenen Nachschlagewerk (Regel „din277-nutzung“). `lager|archiv` → NUF 4 ist richtig.
**Soll:** `abstell|keller|garage|carport|fahrrad|müll` → NUF 7; „galerie“ → NUF 1; `hwr|hauswirtschaft` → NUF 7 (bzw. NUF 1 nach Bürostandard) statt TF; `lager|archiv` bleibt NUF 4. Muss vor dem Raumkatalog (F-11) behoben sein, da dieser die Zuordnungen übernimmt.
**Test:** `C/ifcImport.test.ts`: `guessNutzung` für „Abstellraum“, „Garage“, „Galerie“, „HWR“, „Lager“.

### FR-07 WoFlV-Automatik nach Raum- und Geschossnamen  (Aufwand M)
**Problem:** `C/norms.ts:67–75` (`KEINE_WOFL`, `KEINE_WOFL_GESCHOSS`, `nutzung === 'TF'` in `woflArt`), genutzt in `C/ifcImport.ts:193–200` und `F/components/Properties.tsx:441–462`. „HWR“ wird über TF ausgeschlossen, „Hauswirtschaft“ nicht (gleicher Raum, verschiedenes Ergebnis); „Treppe“ im Namen schließt den ganzen Raum aus, obwohl nur die Treppenfläche entfällt (§ 3 Abs. 3 Nr. 2 WoFlV); „Diele“ mit Treppe zählt ganz; Räume in KG/UG werden pauschal ausgeschlossen (die WoFlV schließt Kellerräume als Zubehör aus, nicht Aufenthaltsräume einer Souterrainwohnung).
**Soll:**
- HWR nicht über die Nutzungsgruppe ausschließen.
- „Treppe“ nur bei eigenständigem Treppenhaus/Treppenraum ausschließen; sonst Hinweis, die Treppenfläche als „nur Wohnfläche“-Abzug (FR-03) zu erfassen.
- UG-/KG-Regel hängt an der Geschossart (F-03), nicht am Namen, als Vorschlag kennzeichnen; im IFC-Importbericht die betroffenen Räume einzeln nennen.
- Bericht: Satz „WoFlV-Einstufung nach Raumnamen vorgeschlagen, vom Verfasser geprüft“.
**Test:** `C/core.test.ts`: `woflArt('HWR', 'EG', 'NUF1')` = wohnen, `('Treppenhaus', …)` = keine, `('Hauswirtschaft', …)` = wohnen, `('Bad', Keller-Geschoss, …)` je nach Geschossart.

### FR-08 Pauschale 100 %-Anrechnung unter Dachschrägen  (Aufwand S für den Hinweis; Berechnung siehe F-12)
**Problem:** `F/components/Properties.tsx:452–454` („automatisch nach Raumname“) setzt gezeichnete Räume auf `voll`, ohne die lichte Höhe zu prüfen; unter Dachschrägen wird die Wohnfläche überschätzt (§ 4 Nr. 1–2 WoFlV: Räume und Raumteile 2 m / 1–2 m / < 1 m). Höhenlinien gibt es nur für IFC-Räume (`C/ifcImport.ts:522–545`).
**Soll:** In Geschossen mit geneigtem Dach (`istDachgeschoss`, `C/model.ts:628`) bei „voll“ einen Hinweis „lichte Höhe prüfen / Teilflächen nach F-12“ anzeigen (Hinweis, keine Sperre). Berechnung über F-12.
**Test:** Prüflogik aus F-10: Raum „voll“ im Dachgeschoss erzeugt Hinweis.

### FR-09 Bericht ohne R/S-Trennung bei BRI, NRF, KGF  (Aufwand M; Umsetzung mit F-17)
**Problem:** `F/components/Report.tsx:72–96` weist nur BGF getrennt nach R/S aus; BRI, NRF, KGF nur gesamt. CSV (`F/core/export.ts:27`) hat BRI R/S, aber NRF/KGF nicht; Excel (`F/platform/excel.ts:34`) BGF/BRI R/S.
**Soll:** Tabelle „Grundflächen und Rauminhalte“ mit BRI R | S | gesamt, NRF R | S, KGF R | S (bei reinen R-Projekten S-Spalten ausblenden); CSV und Excel entsprechend. Bezug: DIN 277:2021-08 getrennte Ermittlung nach Raumumschließung; § 6 Nr. 1 BauPrüfVO NRW.
**Test:** `F/core/exportData.test.ts`: Projekt mit S-Umriss liefert getrennte Werte, Summen stimmen.

### FR-10 BRI von S-Umrissen: volle Geschosshöhe und Bodenplatte  (Aufwand M)
**Problem:** `C/calc.ts` (Körperhöhe = Geschosshöhe ca. Z. 206–208; Bodenplatte auch unter S-Umrissen ca. Z. 186–194, 261–269). Balkon 8 m² → BRI S = 8 × 2,75 + 8 × 0,30 = 24,40 m³ ohne jede Eingabe; für Dachterrasse/auskragenden Balkon zu viel, dort gibt es keine Bodenplatte. Die obere Begrenzung nicht umschlossener Bereiche ist normativ eigens geregelt **[Norm prüfen]**; der BRI geht in die Baugebühr NRW ein (Tarifstelle 3.1.1.2).
**Soll:**
- Bei Umschließung S die Körperhöhe als Pflichtangabe abfragen bzw. markieren („Unterkante Überdeckung bzw. Oberkante Umwehrung“); ohne Eingabe Warnung in der Prüfliste.
- Bodenplatte für S-Umrisse nur auf ausdrücklichen Wunsch ansetzen.
- Bericht zeigt BRI S getrennt (FR-09).
**Test:** `C/core.test.ts`: S-Umriss ohne Körperhöhe → Warnung, keine Bodenplatte; mit Körperhöhe 1,10 → BRI 8 × 1,10.

### FR-11 „unbeheizter“ statt „unbeheizbarer“ Wintergarten  (Aufwand S)
**Problem:** `C/norms.ts:32`, `C/model.ts:26`, `F/components/Report.tsx:263` sagen „unbeheizt“; § 4 Nr. 3 WoFlV meint „unbeheizbar“ (maßgebend ist die Beheizbarkeit).
**Soll:** Bezeichnung „unbeheizbarer Wintergarten, Schwimmbad u. ä. (50 %)“; Hilfetext „beheizbare Wintergärten: lichte Höhe ≥ 2 m (100 %) wählen“.
**Test:** Label-Test in `C/core.test.ts`, falls Labels dort geprüft werden, sonst keiner.

### FR-12 Gemischter Faktor statt Raumteile, Faktor-Rundung  (Aufwand S–M; Umsetzung mit F-12/F-13)
**Problem:** `C/ifcImport.ts:196–199` bildet `individuell` mit Faktor `a2 + 0,5·a12` (4 Stellen; `a2 ≥ 0,995` gilt als 100 %); `F/components/Report.tsx:210` und `F/core/exportData.ts:91` drucken den Faktor auf 2 Stellen: Fläche × gedruckter Faktor (0,85) ≠ gedruckte Wohnfläche (berechnet mit 0,8473), Abweichung bis 0,005 × Fläche; Höhenanteile stehen nur in der Bemerkung; Toleranz 0,5 % undokumentiert.
**Soll:** Für Räume mit gemischter Höhe im Bericht und in Excel die Teilflächen ausweisen (≥ 2 m | 1–2 m | < 1 m in m²) und die Wohnfläche daraus bilden; Faktor höchstens als Information. Toleranz auf 0 setzen oder dokumentieren.
**Test:** `C/ifcImport.test.ts` und `F/core/exportData.test.ts`: Teilflächen ergeben Raumfläche, Wohnfläche = 1·a2 + 0,5·a12 exakt.

### FR-13 Veraltete bzw. vermischte Begriffe  (Aufwand S)
**Problem:** `F/platform/excel.ts` („Wohnflächen (Hauptnutzfläche)“ ca. Z. 242, „Neben-Nutzflächen“/„Brutto-Nebenflächen“ ca. Z. 255, 260, „Bruttogrundfläche“ ca. Z. 267–268, 277); `F/core/exportData.ts` (Filter `hnf`/`nnf`, ca. Z. 232, 350–363); `docs/excel-vorlagen.md`; `C/norms.ts:23` (R „… überdeckt“). DIN 277:2016/2021 kennt NUF 1–7 statt HNF/NNF; R = allseitig in voller Höhe umschlossen (überdeckt/nicht überdeckt stammt aus 2005). Die Excel-Zeilen „Brutto-/Netto-Wohnflächen“ mit 3-%-Abzug bleiben unverändert.
**Soll:** „Wohnfläche nach WoFlV“, „Flächen ohne Wohnflächenanrechnung“, „Brutto-Grundfläche“; Filter `hnf`/`nnf` als Altnamen behalten, in der Doku „NUF 1–6 / NUF 7 (frühere HNF/NNF nach DIN 277-2:2005)“; R-Bezeichnung „allseitig in voller Höhe umschlossen“ wie im Nachschlagewerk.
**Test:** `F/core/template.test.ts` / `F/platform/excel.test.ts`: Filter `hnf`/`nnf` funktionieren weiter, neue Beschriftungen.

### FR-14 Bezugsebene der Geschosshöhe uneinheitlich  (Aufwand S)
**Problem:** `F/components/Properties.tsx:408` und `C/regeln/regelwerk.ts` (ca. Z. 109) „OK Rohfußboden bis OK Rohfußboden“ vs. `C/model.ts:190` „OK Fußboden“; Bodenplatte „UK Sohle bis Fußboden“ (`C/calc.ts` ca. Z. 194); IFC-Kote Roh- oder Fertigfußboden (`C/ifcImport.ts` ca. Z. 400). Im untersten Geschoss wird der Fußbodenaufbau doppelt gezählt oder fehlt.
**Soll:** Einheitlich „Fußboden (gleiche Bezugsebene wie die Geschosskoten, i. d. R. OK Fertigfußboden)“; Feld Bodenplatte: „UK Sohle bis zu dieser Bezugsebene“; Texte in Properties, Regelwerk, Modellkommentaren und Doku angleichen. Voraussetzung für F-12.
**Test:** keiner (Texte).

### FR-16 „Putzabzug“ aus IFC-Nettofläche  (Aufwand S)
**Problem:** `C/ifcImport.ts:181–188` übernimmt jede Abweichung IFC-Nettofläche/Geometrie zwischen 0,2 % und 6 % als „Putzabzug“; Archicad-Nettoflächen können auch Stützen-/Nischenabzüge enthalten.
**Soll:** Neutral „Abzug aus IFC-Nettofläche“ nennen (Bemerkung, Importbericht); Werte deutlich abseits von 3 % im Importbericht einzeln ausweisen.
**Test:** `C/ifcImport.test.ts`: Bezeichnung im Bericht, Ausreißer wird gelistet.

### FR-17 Spitzboden ohne Wände/Zonen erhält keine BGF  (Aufwand S)
**Problem:** `docs/archicad-ifc.md` (ca. Z. 108–112) und Umrisserkennung in `C/ifcImport.ts`: ein begehbarer, nutzbarer Spitzboden ohne Wände gehört nach DIN 277 zur BGF **[Norm prüfen]**, bekommt aber keine.
**Soll:** Importbericht meldet „Geschoss X ohne BGF übernommen – falls begehbar/nutzbar, BGF-Umriss ergänzen“; Verhalten der Erkennung bleibt (rein geometrische Dachspitze bekommt weiter keine BGF).
**Test:** `C/ifcImport.test.ts`: Fixture mit Dachspitze ohne Zonen → Meldung im Bericht.

### FR-18 Dachform darf bis 3 % vom Modell abweichen  (Aufwand S)
**Problem:** `C/roofFit.ts:33–34, 162`: die Abweichung (bis 3 % des Körpervolumens) steht nur im Dach-Editor (`F/components/RoofEditor.tsx:68`), nicht im Rechenweg.
**Soll:** Abweichung als Fußnote am Dachkörper im Rechenweg (`koerper.bemerkung` in `C/rechenweg.ts`), damit sie im Bericht und in Excel erscheint (§ 6 Nr. 1 BauPrüfVO NRW: nachprüfbar).
**Test:** `C/rechenweg.test.ts`: Dach aus Modell mit Abweichung → Bemerkung am Körper.

### FR-19 Normausgabe in Bauvorlage und Gebühr  (Aufwand S; Umsetzung in F-17)
**Problem:** Bericht ohne Normausgabe (`F/components/Report.tsx:72`); `C/regeln/regelwerk.ts:51` nennt DIN 277:2021-08. § 6 Nr. 1 BauPrüfVO NRW verlangt „nachprüfbare Berechnung des BRI nach DIN 277-1:2016-01“, Gebührentarif NRW Tarifstelle 3.1.1.2 verweist auf DIN 277:2021-08.
**Soll:** Bericht: „BRI nach DIN 277:2021-08 (entspricht für den BRI DIN 277-1:2016-01, § 6 BauPrüfVO NRW)“; im Nachschlagewerk neue Regel „BRI in Bauvorlage und Gebühr NRW“ mit beiden Fundstellen.
**Test:** Regel im Nachschlagewerk vorhanden (vorhandene Regelwerk-Tests erweitern, falls es welche gibt).

### FR-20 Angaben für die Hochbaustatistik  (Aufwand M; niedrige Priorität)
**Problem:** Keine eigene Ausgabe; „sonstige Nutzfläche“ und Wohnungen nach Zahl der Räume muss das Büro selbst ableiten (§ 3 HBauStatG).
**Soll:** Kleine Zusammenstellung „Statistik“ (Wohnfläche je Wohnung, Räume je Wohnung, sonstige Nutzfläche = NUF ohne Wohnflächenräume, BRI) im Bericht/Excel; Zählregeln vorher am aktuellen Erhebungsbogen IT.NRW prüfen.
**Test:** `F/core/exportData.test.ts`: Zusammenstellung für ein Projekt mit zwei Wohnungen.

### FR-21 Bestand nach II. BV  (Aufwand S; geringe Priorität)
**Problem:** WoFlV ist Standard (richtig); für Bestandsvergleiche fehlt ein II.-BV-Modus (§ 5 WoFlV, § 42 II. BV: Berechnungen bis 31.12.2003 bleiben).
**Soll:** Allenfalls Projektschalter „Altberechnung nach II. BV (nur Vergleich)“ mit deutlichem Hinweis im Bericht; Standard bleibt WoFlV, kein Standardverhalten ändern.
**Test:** `C/core.test.ts`: Schalter aus → Ergebnisse unverändert.

# C. Verbesserungen

### F-10 Plausibilitätsprüfung  (Aufwand M)
**Problem:** Keine Prüfung auf Räume über den BGF-Umriss hinaus (Flur ragt 10 cm über), Lücken, Räume außerhalb jedes Umrisses, versetzte Kopien (`Strg+V` im selben Geschoss: BGF 108 → 216 m²), doppelte Nummern; nur negative KGF wird gewarnt (`F/components/Properties.tsx:521`).
**Soll:** Prüfliste („Prüfen“-Knopf oder Ampel in der Auswertung), Klick auf einen Eintrag wählt die Fläche. Regeln:
- Prüfung je Raumumschließung: R-Raum außerhalb R-Umriss, S-Raum außerhalb S-Umriss, NRF(R) > BGF(R), NRF(S) > BGF(S) (FR-02).
- Umrisse überlappen (BGF doppelt); Räume überlappen, Abzugsflächen ausnehmen.
- Lücken zwischen Räumen nur als Hinweis (Wände sind KGF) und erst ab Breite deutlich über üblicher Wanddicke (z. B. > 0,6 m) bzw. Mindestfläche.
- Doppelte Raumnummern; Raum ohne Wohnung bei WoFlV-Anrechnung; „keine Wohnfläche“ im Wohngeschoss nur als Hinweis (Treppenraum, Heizung, Abstellraum außerhalb der Wohnung sind richtig).
- Ergebnis als Hinweis („prüfen“), nicht als Fehler.
- Optional beim Zeichnen „Raum auf Umriss beschneiden“ (zulässig, da NRF innerhalb BGF liegen muss).
- Prüflogik als reine Funktion im Kern (z. B. `C/pruefung.ts`), Anzeige in der App.
**Vorbild:** Archicad-Zonen werden an Wänden begrenzt und Konflikte in der Auswertung sichtbar; Bluebeam zeigt Überschneidungen in „Spaces“.
**Test:** neue `C/pruefung.test.ts`: je Regel ein Positiv- und ein Negativfall (Balkon auf S-Umriss ist kein Fehler; Lücke 0,3 m kein Hinweis; Abzugsfläche kein Überlappungshinweis).

### F-11 Raumkatalog und Vorgaben für neue Räume  (Aufwand M)
**Problem:** `createRoom` (`C/model.ts:572`) legt jeden neuen Raum als „Raum“, NUF 1, WoFlV „keine“ an: die Wohnfläche fehlt still. „Automatisch nach Raumname“ (`Properties.tsx:441–462`) setzt nur die WoFlV, nicht die Nutzungsgruppe („Flur“ bleibt NUF 1 statt VF 9, „Bad“ NUF 1 statt NUF 7).
**Soll:**
- Bezeichnungsfeld mit Vorschlagsliste (Büro-Katalog, im Konfigurationsordner pflegbar): Name → Nutzungsart DIN 277 + WoFlV-Kategorie; Auswahl setzt beides.
- Katalogeinträge sichtbar als Vorschlag kennzeichnen („aus Katalog“).
- Getrennte Einträge „Abstellraum (in der Wohnung)“ (zählt zur Wohnfläche) und „Abstellraum/Keller (außerhalb)“ (zählt nicht); Treppenraum entfällt nur mit Treppe über drei Steigungen und Absätzen; HWR in der Wohnung zählt, Waschküche nicht.
- DIN-277-Zuordnung muss stimmen (Abstellraum NUF 7.3, Garage NUF 7.4, Bad/WC NUF 7.1, Flur VF 9); FR-06 und FR-07 vorher beheben.
- Vorgabe für neue Räume je Geschoss („Wohngeschoss: anrechnen“) bzw. Übernahme vom zuletzt bearbeiteten Raum.
- Feld „Wohnung“ als Auswahl der vorhandenen Wohnungen (verhindert „WE 01“ vs. „WE01“).
- Räume ohne Katalogzuordnung in der Prüfliste (F-10) melden.
**Vorbild:** Archicad Zonenkategorien; Allplan Raumbezeichnungs-Katalog mit Flächenart und Faktor; Vectorworks Raumnamen-Liste.
**Test:** `C/core.test.ts` / `F/store/store.test.ts`: Katalogauswahl „Flur“ → VF/keine Wohnfläche, „Bad“ → NUF 7; Wohnungsauswahl lässt keine Schreibvarianten entstehen.

### F-12 Dachschrägen nach WoFlV gliedern (inkl. FR-08, FR-12)  (Aufwand L)
**Problem:** Das Dach ist bekannt (Traufhöhe, Neigung, Firstrichtung, Gauben) und geht in den BRI ein, im Grundriss erscheinen aber weder First noch Höhenlinien; Räume darunter bleiben bei 100 %. Ein Werkzeug zum Teilen einer Fläche fehlt; Gauben erscheinen nur in 3D und werden nur über Zahlen platziert.
**Soll:**
- First, Traufe und Höhenlinien 1,00 m / 2,00 m lichte Höhe im Grundriss einblenden; lichte Höhe von OK Fertigfußboden bis Unterseite der fertigen Decke bzw. Dachschräge (Innenbekleidung), Abzug für den Dachaufbau bis Innenbekleidung senkrecht umgerechnet (Dicke ÷ cos α), bei Bezug Rohfußboden auch Fußbodenaufbau (FR-14); Eingabe „Aufbau Dach bis Innenbekleidung“ und „Fußbodenaufbau“ je Geschoss, Vorgabe aus der IFC.
- „Raum an Höhenlinien teilen“ erzeugt Teilflächen mit 100 / 50 / 0 % als Unterteilung eines Raums (eine Nummer, eine NRF, je Teil Fläche und Anrechnung), nicht als eigenständige Räume.
- Teilflächen ändern nur die Wohnfläche, nie NRF/NUF nach DIN 277; die Teile summieren sich in NRF genau zur Raumfläche.
- Höhenlinien je Raum ab dessen eigener Fußbodenhöhe (Split-Level, `versatz`); Drempel, Gauben, Kehlbalkendecke berücksichtigen.
- Bericht je Raum: Teilfläche ≥ 2 m, 1–2 m, < 1 m in m² (FR-12); Hinweis „Höhenlinien aus Planmaßen abgeleitet“.
- Allgemeines Werkzeug „Fläche teilen“ (Linie durch die Fläche); Gauben im Grundriss anzeigen und per Ziehen verschieben.
- Hinweis aus FR-08 bei „voll“ im Dachgeschoss.
**Vorbild:** Archicad erzeugt die Höhenlinien 1/2 m automatisch (die NRF-Reduktion nach Raumhöhe ist dabei kein Vorbild).
**Test:** `C/core.test.ts`: Raum mit Teilflächen 10/6/4 m² → NRF 20, Wohnfläche 10 + 3 = 13; `C/roof.test.ts`: Höhenlinie 2 m bei 45° mit Aufbau 0,30 m.

### F-13 Rechenweg je Raum (inkl. Putzabzug)  (Aufwand M)
**Problem:** Raumliste im Bericht und Excel „Raumliste“ zeigen nur das Ergebnis (28,91 m²), ohne Maße. Prüfer erwarten L × B je Raum.
**Soll:**
- Rechenweg vollständig: „L × B = Rohfläche; − 3 % Putzabzug = Fläche; × Faktor = Wohnfläche“, sonst passt der Rechenweg nicht zum Ergebnis (Beispiel 9,40 × 7,40 ≠ 67,47).
- Abzugsflächen als eigene Zeilen mit Minus (FR-03).
- Rechteckige Räume „L × B“; Polygone als Koordinatenliste (Gauß’sche Formel) oder Zerlegung in Rechtecke/Trapeze, deren Summe exakt die Polygonfläche ergibt (wie beim BRI-Rechenweg, `C/rechenweg.ts`).
- Bericht: aufklappbare Spalte; Excel: als Formel, damit gedruckte Werte und Rechnung übereinstimmen.
**Vorbild:** DIN-277-/WoFlV-Excel-Vorlagen mit Spalten Länge, Breite, Faktor, Fläche; Allplan-Reports mit Teilflächen-Rechenweg.
**Test:** `C/rechenweg.test.ts`: Rechteck mit Putzabzug und Abzugsfläche → Summe der Zeilen = Raumfläche; L-förmiges Polygon → Zerlegung summiert exakt.

### F-14 Nutzungsarten nach DIN 277:2021-08 als zweite Ebene  (Aufwand M)
**Problem:** Eigenschaften „Nutzungsgruppe (DIN 277)“ (`Properties.tsx:128`) bieten NUF 1–7, TF 8, VF 9; die Untergliederung (1.1 Wohnräume, 7.1 Sanitärräume, 9.1 Flure) fehlt.
**Soll:** Nutzungsart als optionale zweite Ebene, Auswertung weiterhin je Gruppe summiert. Gliederung und Nummern nach DIN 277:2021-08, nicht nach DIN 277-2:2005. Die Liste ist ein büroeigener Katalog im Konfigurationsordner (das Büro besitzt die Norm), allenfalls mit kurzen Bezeichnungen als Vorgabe; die vollständige Normtabelle nicht mitliefern (Urheberrecht, vgl. `C/regeln/regelwerk.ts` „nur sinngemäß“).
**Vorbild:** Archicad-Zonenkategorien und Allplan-Flächenarten bilden die Tabelle 1 der DIN 277 ab.
**Test:** `C/core.test.ts`: Nutzungsart 7.1 summiert in NUF 7; Projekt ohne Nutzungsart verhält sich wie bisher.

### F-15 BGF-Umriss aus dem Plan erkennen  (Aufwand M)
**Problem:** Werkzeug „Erkennen“ mit „als BGF-Umriss“: Klick auf die Außenwand meldet „Der Klickpunkt liegt auf einer Linie …“; Klick in einen Raum erzeugt eine Raumkontur als BGF. Die Außenkontur muss von Hand gezeichnet werden; Fang auf Rasterplan-Kanten fehlt. Code: `C/detect.ts`, `F/components/Canvas.tsx`.
**Soll:**
- Im BGF-Modus Klick auf eine Wand → äußere Kontur der zusammenhängenden Wandfläche (Außenkante der Wandschraffur bzw. Außenlinie), Ergebnis zum Prüfen anzeigen.
- Die BGF folgt den Außenmaßen einschließlich Bekleidung (Putz, WDVS, Vorsatzschale) in Höhe OK Belag (DIN 277:2021-08).
- Alternative „Umriss aus Räumen + Wanddicke“ nur mit ausdrücklicher Wanddicke und Vermerk „Näherung“ in der Bemerkung des Umrisses (bei ungleichen Wanddicken/Dämmung werden BGF, BRI und Gebühr falsch).
- Im DG reicht die BGF bis zum Schnitt der Dachhaut mit der Fußbodenebene, nicht nur bis zum Drempel.
- Für Balkone/Loggien Umschließung S vorschlagen.
**Vorbild:** Archicad-Zone mit Konstruktionsmethode „Brutto“ folgt den Wandaußenkanten; Bluebeam „Dynamic Fill“ füllt auch Wandbereiche.
**Test:** `C/detect.test.ts`: Rasterplan mit zwei Räumen und umlaufender Wand → BGF-Kontur = Außenkante; Näherungsvariante setzt den Vermerk.

### F-16 Kalibrieren mit Fang und Kontrollmaß  (Aufwand M)
**Problem:** Kalibrierpunkte rasten nicht auf Plankanten ein; 1–2 px Klickfehler → 10,025 statt 10,000 mm/px (Raum 47,61 statt 47,38 m², 0,25 % Maßstab = 0,5 % Fläche). Keine Kontrollmessung; „Tatsächliche Länge“ erwartet Meter, viele Pläne sind in cm bemaßt. Code: `F/components/BackgroundPanel.tsx`, `F/core/background.ts`.
**Soll:**
- Kantenfang/Lupe beim Kalibrieren.
- Eingabe mit Einheit („1200 cm“, „12 m“).
- Anschließend „Kontrollmaß messen“ mit Abweichung in %.
- Optional Maßstabsliste (1:50, 1:100) mit dpi für Bilder.
- Maßgrundlage festhalten: „aus Plan abgegriffen, Maßstab kalibriert, Kontrollmaß Abweichung x %“, im Bericht ausgeben (FR-05).
**Vorbild:** Bluebeam: Kalibrieren mit Fang auf Inhalt, X/Y getrennt, Maßstabsliste; PlanSwift verlangt eine Prüfstrecke.
**Test:** `F/core/app.test.ts` oder neue `F/core/background.test.ts`: Einheitenparser („1200 cm“ = 12 m), Abweichungsberechnung des Kontrollmaßes.

### F-17 Bericht für die Bauvorlage (inkl. FR-09, FR-19, FR-05-Kopf, FR-20)  (Aufwand M)
**Problem:** Der Bericht (`F/components/Report.tsx`) hat keine Seitenzahlen und kein Unterschriftsfeld; der Kopf zeigt Projektname, Datum, Bearbeiter. Alle Abschnitte werden immer gedruckt, auch leere (lauter 0,00); Raumliste (Z. 174) und WoFlV-Summe (Z. 235) beginnen je auf neuer Seite, Seiten bleiben großteils leer. Die Beobachtung „Adresse/Bauherr fehlt“ gegen `Report.tsx:63–65` nachprüfen: dort werden Adresse, Flurstück und Bauherr schon gedruckt, wenn erfasst (Ursache evtl. nicht erfasstes oder anderes Feld).
**Soll:**
- Druckkopf aus den Projektdaten (Bauvorhaben, Adresse, Gemarkung/Flur/Flurstück, Bauherr, Verfasser), „Seite x von y“, Unterschriftszeile für Entwurfsverfasser/Aufsteller (Bezeichnung nach BauO NRW 2018 bzw. BauPrüfVO, Fundstelle vorher prüfen).
- Normausgabe und Maßgrundlage im Kopf (FR-05, FR-19), R/S-Trennung (FR-09).
- Abschnitte wählbar mit Vorlagen, z. B. „Bauantrag NRW: BRI + WoFl“. Vorlage „Bauantrag NRW“ = Kopf + DIN 277 mit R/S + BRI-Rechenweg + optional WoFlV und Statistik (FR-20): BRI-Rechenweg und R/S-Trennung sind dort nicht abwählbar (§ 6 Nr. 1 BauPrüfVO NRW, Gebührentarif 3.1.1.2). Freie Abschnittsauswahl nur außerhalb dieser Vorlage.
- Leere Abschnitte weglassen: S-Spalten mit 0,00 und leerer WoFlV-Abschnitt dürfen entfallen; ein fehlender BRI ist ein Mangel und erscheint als Warnung statt zu verschwinden.
- Seitenumbrüche so, dass keine fast leeren Seiten entstehen.
**Vorbild:** Allplan/Archicad-Listen mit Planköpfen aus Projektdaten; Excel-Vorlagen der Büros mit Kopf/Fuß.
**Test:** `F/core/exportData.test.ts` bzw. neuer Render-Test `F/components/Report.test.tsx`: Vorlage „Bauantrag NRW“ enthält BRI-Rechenweg und R/S, auch wenn der BRI-Abschnitt abgewählt wird; leerer WoFlV-Abschnitt entfällt; fehlender BRI erzeugt Warnung.

### F-18 Neues Geschoss mit Bezug zum darunterliegenden  (Aufwand S)
**Problem:** Das neue Geschoss ist leer, „darunterliegendes Geschoss einblenden“ ist aus, der EG-Umriss muss erst kopiert werden (`addStorey`, `F/store/store.ts:290`).
**Soll:** Bei neuem leeren Geschoss das darunterliegende automatisch einblenden und „BGF-Umriss aus [Geschoss darunter] übernehmen“ anbieten. Beim Übernehmen nur die Geometrie kopieren (ohne Dach, Körperhöhe, Höhenversatz, Umschließung des Originals) und den Umriss auf „prüfen“ setzen (im DG weicht die BGF regelmäßig ab).
**Vorbild:** Archicad „Trace & Reference“, Allplan Teilbilder passiv im Hintergrund.
**Test:** `F/store/store.test.ts`: Übernahme kopiert Punkte, nicht `dach`/Körperhöhe.

### F-19 Messen erweitern  (Aufwand S–M)
**Problem:** Werkzeug „Messen“: zwei Punkte → eine Länge; der nächste Klick beginnt neu; keine dx/dy, keine Polylinie, keine Fläche; das Ergebnis verschwindet beim Werkzeugwechsel.
**Soll:** Kettenmessung (Summe), dx/dy und Winkel anzeigen, Flächenmessung ohne Raum anzulegen, Messung mit `Strg+C` kopieren. Messflächen gehen nie in BGF, NRF oder Wohnfläche ein.
**Vorbild:** Bluebeam: Länge, Polylänge, Fläche, Umfang, Winkel, Summen in der Markup-Liste.
**Test:** reine Funktion für Kettenmessung (`F/core/app.test.ts`): Summe, dx/dy, Winkel.

### F-20 Beschriftungen überlagern sich  (Aufwand S)
**Problem:** Die Beschriftung „BGF (R) 108,00 m²“ liegt in der Umrissmitte, oft auf Raumbeschriftung oder Raumgrenze; Messwerte liegen auf Raumtexten.
**Soll:** BGF-Beschriftung an den Rand (z. B. außen oben links) oder ausblendbar; Raumstempel ziehbar (Position optional im Modell gespeichert); gilt auch für den Grundriss im Bericht.
**Vorbild:** Archicad-Raumstempel frei verschiebbar; Bluebeam-Beschriftungen ebenfalls.
**Test:** visuell; Positionsfeld im Modell: Rundlauf-Test (Speichern/Laden) in `C/projektdatei.test.ts`.

### F-21 Raumliste sortiert, Tabellenansicht  (Aufwand M)
**Problem:** Die Seitenleiste „Flächen“ listet Räume in Zeichenreihenfolge (1.04 nach 0.04); Mehrfachänderung nur über Mehrfachauswahl, nicht tabellarisch.
**Soll:** Liste nach Nummer sortieren (natürliche Sortierung); optional Tabellenansicht aller Räume des Projekts mit editierbaren Spalten: Nr., Name, R/S, Nutzung, WoFlV-Kategorie, Faktor, Wohnung, Abzug, Putzabzug.
**Vorbild:** Archicad „Interaktive Auswertung“, Allplan-Raumbuch.
**Test:** `F/store/store.test.ts`: Sortierfunktion (0.04 vor 1.01, 0.10 nach 0.09).

# D. Optional (nur Liste)

- F-22 IFC-Modul lädt ohne Fortschritt und Abbrechen: Spinner/Fortschritt, Abbrechen-Knopf, web-ifc beim Öffnen des Dialogs vorladen.
- F-23 Web-Version: Speichern meldet Erfolg ohne Dateiwahl: File System Access API (`showSaveFilePicker`) in Chromium, sonst Hinweis „als Download gespeichert“.
- F-24 Kleinigkeiten: „Neu“ übernimmt die Zeichenart des vorigen Projekts (mit BGF-Umriss beginnen); Hinweiskasten unten bleibt nach dem ersten Einklappen eingeklappt; „Protokoll“ in „Diagnose“ umbenennen oder um Änderungsliste ergänzen; Fokusrahmen der Zeichenfläche im Hellmodus dezenter.


---

## GRZ-Nachweis

Stand: Review von GRZ-Nachweis 0.7.0. Pfade relativ zum Repo `arch-tools`; `apps/grz/src` = App, `packages/core/src` = gemeinsamer Code (nicht app-spezifisch ändern, wenn mehrere Apps betroffen sind). Nicht aufgenommen: G-10 (Staffelgeschoss-Regel, bewusst ignorieren). Aufwand: S = Stunden, M = ein bis zwei Tage, L = mehrere Tage.

# Fehler

### G-01 Wiederhergestellter Zwischenstand gilt als gespeichert  (S)
**Problem:** Nach Neuladen lädt `apps/grz/src/store.ts` (IndexedDB-Block ab ca. Z. 160, `st.load(project, r.datei, basis)`) den Zwischenstand, `load()` (Z. 66-69) setzt aber immer `dirty: false`. Ablauf: speichern, Projektnamen ändern (Titel „•“), neu laden, Titel ohne „•“, „Speichern“ ohne Punkt. Man schließt, die Änderung fehlt in der Datei.
**Soll:**
- Nach dem Wiederherstellen ist `dirty = !gleich(project, basis)` (Vergleich über serialisierte Projektdaten, nicht über Objektidentität); bei `basis === null` und vorhandenem Projekt gilt der Stand als ungespeichert.
- Eine Leiste zeigt „Ungespeicherter Stand vom <Datum Uhrzeit> wiederhergestellt – [Speichern] [Verwerfen]“; „Verwerfen“ lädt `basis` (bzw. leeres Projekt, wenn keine) und setzt `dirty = false`. Zeitstempel dafür mit in den IndexedDB-Eintrag schreiben.
- Titel zeigt „•“, „Speichern“ hat den Punkt; gilt für Web und Desktop (gleicher Store).
**Vorbild:** Word/Excel markieren wiederhergestellte Dateien als ungespeichert, Archicad hat einen eigenen Wiederherstellen-Dialog.
**Test:** `apps/grz/src/grz.ui.test.ts`: Store mit abweichendem `project`/`basis` laden, `dirty === true`; mit gleichem `project`/`basis`, `dirty === false`; „Verwerfen“ setzt auf `basis` zurück.

### G-02 Gerundete Kennzahl widerspricht der Ampel  (S)
**Problem:** `zahl()` in `apps/grz/src/texte.ts:41` rundet auf 2 Stellen, der Status vergleicht den ungerundeten Wert. Testprojekt (`apps/grz/src/testdaten.ts`, Plan 1967): Kachel „GFZ 0,50 – überschritten – zulässig 0,50 – zu viel 1,02 m²“; ebenso „GRZ I 0,40 überschritten, zulässig 0,40“ bei 199,9 m² Grundstück. Gilt für Kacheln (`components/GrzGfzView.tsx`, `KpiZeile`), Druck (`components/NachweisDruck.tsx`) und Excel (`export/exportData.ts`, `export/excel.ts`).
**Soll:**
- Kennzahlen mit mindestens 3 Nachkommastellen; ist die Abweichung zum Grenzwert so klein, dass die Anzeige gleich aussähe (unter 0,005), 4 Stellen (0,5017 statt 0,50).
- Ampel zusätzlich in m² begründet: „GF 307,28 m² > 306,25 m² zulässig“ (bzw. GR gegen zulässige GR = Kennzahl × Grundstücksfläche).
- Nie „überschritten“ neben identisch angezeigten Zahlen; Druck und Excel gleiche Stellenzahl wie die Kachel.
**Vorbild:** Musterformulare der Bauämter (LBK München, Frankfurt) führen GRZ/GFZ mit 3-4 Stellen oder vergleichen Flächen in m².
**Test:** `apps/grz/src/massNutzung.test.ts` bzw. Formatierungstest: GFZ 0,5017 gegen 0,50 ergibt Text „0,5017“ und Flächenbegründung; GRZ 0,4003 / 0,40 analog; unkritischer Wert (0,18) bleibt bei 3 Stellen.

### G-03 GRZ-Kachel zeigt „Grundfläche 0,00 m²“ ohne Grundstücksfläche  (S)
**Problem:** `components/GrzGfzView.tsx` Z. 325-326: `flaeche={n.grz.wert * (n.grundstueck.flaeche ?? 0)}`. Nach IFC-Import ohne Grundstücksfläche steht „GRZ I 0,00 · Grundfläche 0,00 m²“, obwohl das Gebäude 80 m² hat; die GFZ-Kachel zeigt dagegen richtig „Geschossfläche 160,00 m²“.
**Soll:**
- Grundfläche direkt aus dem Rechenkern ausgeben (Hauptanlage bzw. GR II, in `massNutzung.ts` vorhanden), nicht aus Kennzahl × Fläche zurückrechnen.
- Fehlt die Grundstücksfläche: Kennzahlwert „–“ mit Hinweis „Grundstücksfläche fehlt“, keine Ampel „eingehalten“.
- Hinweistext (`massNutzung.ts:664`) verweist auf das Feld „Grundstücksfläche“ in den Festsetzungen (siehe G-27), nicht auf eine nicht vorhandene Projektdaten-Maske.
**Test:** `apps/grz/src/massNutzung.test.ts`: Projekt mit Gebäude 80 m² ohne Grundstücksfläche, Grundfläche = 80, Kennzahl nicht berechnet.

### G-04 Druck: Spalte „angerechnet [m²]“ zeigt nicht die angerechnete Fläche  (S)
**Problem:** `components/NachweisDruck.tsx:159`: Spalte „angerechnet [m²]“ gibt `flaecheEindeutig` aus. Terrasse mit Anrechnung „zählt nicht“ zeigt 14,53 m², Garten („zählt nicht“) 435,07 m². Eine Summe der angerechneten Grundfläche (GR bzw. GR II) fehlt. Dieses Blatt geht an die Bauaufsicht.
**Soll:**
- Bestehende Spalte heißt „eindeutig [m²]“ (Überlagerungen nur einmal gezählt).
- Neue Spalte „angerechnet auf GR / GR II [m²]“: je Fläche nur die tatsächlich angerechnete Fläche (0 bei „zählt nicht“, volle bzw. Anteil bei GRZ I/II, Spanne bei „prüfen“ wie in den Kacheln).
- Summenzeilen GR und GR II stimmen exakt mit den Kacheln überein.
**Test:** `apps/grz/src/grz.ui.test.ts` (Druck rendern) oder `export/excel.test.ts`: Terrasse „zählt nicht“ hat angerechnet 0; Summe angerechnet = Kachelwert.

### G-05 Excel: Summe der Lageplan-Flächen zählt Überlagerungen doppelt  (S)
**Problem:** `apps/grz/src/export/excel.ts`, Abschnitt „Lageplan-Flächen“ (ab Z. 120): Summe `=SUM(C46:C48)` über Bruttoflächen = 578,05 m², die App zeigt 466,56 m² („jede Stelle einmal“). GRZ/GFZ stehen als feste Zahl (0,1778) statt als Formel; die Spanne offener Flächen („bis 0,22“) fehlt.
**Soll:**
- Spalte „eindeutig“ ausgeben und summieren (Summe = Wert der App).
- GRZ/GFZ als Excel-Formeln aus den Zellen (z. B. `=C18/C12`), damit Prüfer nachrechnen können; zulässiger Wert und Vergleich ebenfalls als Formel.
- Offene Spanne („prüfen“) als eigene Zeile „GRZ bei Anrechnung offener Flächen“.
- Gilt für das Standardlayout; Vorlagen-Platzhalter (`export/exportData.ts`) bleiben kompatibel.
**Test:** `apps/grz/src/export/excel.test.ts`: Testprojekt mit Überlagerung; Summenzelle = Summe eindeutig (nicht brutto), Kennzahlzelle enthält Formel.

### G-06 Farbschema-Wechsel wirkt erst nach Neustart  (S)  → zentral (Querschnitt)
**Problem:** `applyTheme` wird nur in `apps/grz/src/main.tsx:13` beim Start aufgerufen; `apps/flaechenrechner/src/App.tsx:31` hat `useEffect(() => applyTheme(theme, canvasDunkel), [theme, canvasDunkel])`, `apps/grz/src/App.tsx` nicht. Betrifft auch `entzerrung` und `formulare` (nur `main.tsx`).
**Soll:**
- Zentrale Lösung in `packages/core` (z. B. in `packages/core/src/platform/theme.ts` oder im gemeinsamen Rahmen/`TitleBar`), die auf Änderungen von `theme` und `canvasDunkel` reagiert; alle Apps nutzen sie, keine Kopie je App.
- Wechsel Hell/Dunkel/System und „Zeichenfläche abdunkeln“ wirken sofort ohne Neuladen.
**Test:** neuer Test in `packages/core/src` (Theme): `useTheme.setState({ theme: 'light' })` ändert das Attribut/die Klasse am Wurzelelement ohne Neuladen.

### G-07 Zahlenfelder verwerfen oder kappen Eingaben ohne Meldung  (S)
**Problem:** `packages/core/src/ui/fields.tsx`, `commit()` (ca. Z. 79-95) und `packages/core/src/format.ts:27` `parseNum` (ersetzt nur das erste Komma, kennt keine Tausenderpunkte). GRZ „4“ (vertippt für 0,4) wird per `Math.min(max, c)` stumm zu 1,00, Ampel „eingehalten“; „abc“ wird verworfen; „1.234“ wird als 1,234 gelesen; „1.234,56“ wird verworfen. Betrifft alle `NumberField` in allen Apps, daher zentral ändern.
**Soll:**
- `parseNum`: deutsche Tausenderpunkte erkennen („1.234“ und „1.234,56“, „1.234.567“); Dezimalpunkt nur bei eindeutigem Fall („3.25“, „0.4“). „1.234“ (genau drei Ziffern nach dem Punkt) gilt als Tausender.
- Außerhalb von min/max: Wert nicht kappen, Feld rot markieren mit Text („GRZ höchstens 1,0 – gemeint 0,4?“), Wert nicht übernehmen (Eingabe bleibt zum Korrigieren stehen).
- Ungültige Eingabe („abc“) sichtbar ablehnen (rote Markierung, Hinweis), nicht still zurücksetzen; Esc verwirft wie bisher.
**Test:** `packages/core/src/ui/fields.ui.test.ts`: „4“ bei max 1 gibt Fehlermarkierung, `onChange` nicht aufgerufen; „abc“ gibt Fehlermarkierung. `parseNum`-Tabelle (z. B. in `core.test.ts`): „1.234,56“ → 1234,56; „1.234“ → 1234; „3.25“ → 3,25.

### G-08 Druck-Lageplan: Nummern unlesbar, zum Teil auf dem Gebäude  (S-M)
**Problem:** `components/NachweisDruck.tsx` ca. Z. 407-411: `labelPoint(f.points)` und `fontSize={k * 11}`; Nummern wirken 4-5 px klein. Die Nummer der Gartenfläche, die das Gebäude umschließt, sitzt mitten im Gebäude (Beschriftungspunkt liegt nicht im sichtbaren, eindeutigen Anteil). Maßstab und Nordpfeil fehlen.
**Soll:**
- Schriftgröße mit Mindestgröße in pt (unabhängig vom Planmaßstab), im Druck gut lesbar.
- Beschriftungspunkt im eindeutigen Flächenanteil (nicht unter Gebäude oder überlagernden Flächen); bei mehreren Teilstücken im größten.
- Maßstabsleiste (gerundete Länge, z. B. 5 m / 10 m) und Nordpfeil (die genordete Achse ist im Modell bekannt).
- Optional abschaltbar: Maße an den Kanten (G-20 baut darauf auf).
**Vorbild:** Amtliche Lagepläne und Bauamtsskizzen haben Maßstab, Nordpfeil und Teilflächen mit Maßen; Bluebeam setzt das Label an den sichtbaren Teil der Fläche.
**Test:** `apps/grz/src/grz.ui.test.ts`: Garten umschließt Gebäude, Beschriftungspunkt liegt im Gartenpolygon und nicht im Gebäudepolygon; Maßstab- und Nordpfeil-Element vorhanden.

### G-09 Bedienhinweise und Doppelungen im amtlichen Nachweis  (S)
**Problem:** Druck (`components/NachweisDruck.tsx`, „Grundlagen“ Z. 64, „Hinweise“ ab Z. 314) und Excel (`export/exportData.ts`: `hinweise`, `haftung`) geben alle `n.hinweise` aus, darunter Arbeitsanweisungen an die Planerin (z. B. `massNutzung.ts:495` „Höhe eintragen, das Gelände mit der IFC übernehmen oder den Lageplan … vervollständigen“; „die Einstufung lässt sich je Nutzung festlegen“). Weitere Mängel: „0,00 m über ±0,00 (angenommen (±0,00))“ mit doppelter Klammer (`texte.ts:24` `annahme: 'angenommen (±0,00)'` wird zusätzlich eingeklammert); Datum „1.6.1975“ statt „01.06.1975“; „Stand“ ist immer das heutige Datum (`NachweisDruck.tsx:22/59`); der Haftungssatz des Tools steht auf dem Blatt für das Bauamt.
**Soll:**
- Hinweise in zwei Arten trennen: „offene Punkte“ (sachlich, für die Bauaufsicht, kommen in Druck/Excel) und Bedienhinweise (nur in der App). Der Rechenkern liefert die Art je Hinweis.
- Keine doppelte Klammer; Datumsformat TT.MM.JJJJ (zweistellig) in Druck, Excel und Grundlagen.
- „Stand“ beim Speichern festhalten (Datum im Projekt, z. B. in `meta`) oder im Druckdialog editierbar; nicht automatisch heute.
- Haftungssatz optional (Schalter), im Blatt für das Bauamt standardmäßig aus.
**Test:** `apps/grz/src/massNutzung.test.ts`: Hinweis „Gelände unbekannt“ hat Art Bedienhinweis und fehlt in der Druckliste; `grz.ui.test.ts`: Datumstext „01.06.1975“, kein „((“.

### G-11 Esc schließt Druck, Excel und Projektübersicht nicht  (S)  → zentral (Querschnitt)
**Problem:** `apps/grz/src/components/NachweisDruck.tsx`, `ExcelDialog.tsx` und `packages/core/src/ui/ProjektWahl.tsx` reagieren nicht auf Esc. Regeln (`ui/Nachschlagewerk.tsx:138`), Protokoll (`ui/LogDialog.tsx:27`) und `ui/UpdateKnopf.tsx:46` haben je einen eigenen `keydown`-Handler.
**Soll:**
- Einheitlich in `packages/core` (z. B. gemeinsamer Dialograhmen oder Hook, Anknüpfung an `ui/dialoge.ts`): Esc schließt jeden Dialog, Fokusfalle (Tab bleibt im Dialog), Fokus-Rückgabe an das auslösende Element; vorhandene Einzel-Handler darauf umstellen.
- Verschachtelte Dialoge: Esc schließt nur den obersten.
- Esc in einem Eingabefeld verwirft zuerst die Eingabe (Verhalten von `fields.tsx`), schließt nicht den Dialog.
**Test:** `packages/core/src/ui/dialoge.test.ts` ergänzen: Esc ruft `onClose`; Fokusrückgabe; Esc im Zahlenfeld schließt den Dialog nicht.

### G-12 Lageplan im Dunkelmodus weiß, „Zeichenfläche abdunkeln“ wirkungslos  (S)
**Problem:** `apps/grz/src/styles.css:36` `.grz-skizze` nutzt `background: var(--canvas)`, aber nicht `filter: var(--canvas-filter)` (Definition in `packages/core/src/ui/base.css` Z. 32, 873, 904); im dunklen Schema bleibt der Lageplan grellweiß, die Option im Farbmenü ändert nichts.
**Soll:**
- `.grz-skizze` (und `.lp-editor .grz-skizze`) wenden den Filter wie im Flächenrechner an bzw. nutzen dunkle Planfarben bei aktivierter Option.
- Papierdarstellung (weiß, Originalfarben) nur im Druck und in der Druckvorschau.
**Test:** `apps/grz/src/grz.ui.test.ts`: Stylesheet-Regel für `.grz-skizze` enthält den Filter; Druckansicht nicht.

### G-13 Zeichenpunkte um die Rahmenbreite versetzt  (S)
**Problem:** `components/LageplanEditor.tsx` `weltpunkt()` (ab Z. 519) rechnet mit `getBoundingClientRect()` inklusive des 1-px-Rahmens (`styles.css:36-44`); die `viewBox` bezieht sich auf die Innenfläche. Klick auf (13,00 | 6,00) wird als (12,96 | 5,95) übernommen (4-5 cm), ausgezoomt mehr. Ohne Fang entstehen Spalten von einigen Zentimetern zwischen Terrasse und Haus.
**Soll:**
- Umrechnung über `svg.getScreenCTM().inverse()` oder Rahmen und Innenmaß berücksichtigen; Abweichung unter 1 mm bei jedem Zoom.
- Gilt für alle Stellen, die `weltpunkt` nutzen (Zeichnen, Ziehen, Fang, Pan).
**Test:** `apps/grz/src/grz.ui.test.ts`: `weltpunkt` (exportieren) mit Rahmen und bekanntem Rect liefert für die Bildschirmposition des Punkts exakt (13,00 | 6,00), bei Zoom 1, 0,2 und 5.

### G-14 Technische Fehlermeldung bei defekter Projektdatei  (S)
**Problem:** Öffnen einer kaputten .oap meldet „Die Datei ist kein gültiges JSON.“ (`packages/core/src/serialize.ts:79`; im Archiv `archive.ts:157` „… ist kein gültiges JSON“), obwohl .oap ein Archiv ist; Anzeige als Browser-`alert` (`apps/grz/src/App.tsx:47` „Datei konnte nicht geöffnet werden: …“, ebenso Z. 63 und 79).
**Soll:**
- Meldung: „Keine gültige Projektdatei (.oap) – beschädigt oder aus einer anderen Anwendung.“ mit Dateiname, Hinweis auf eine Sicherung bzw. das Protokoll (Link „Protokoll öffnen“).
- Eigener Meldungsdialog statt `alert` (gemeinsame Komponente in `packages/core`, nutzt den Dialograhmen aus G-11/G-15); Technikdetail nur aufklappbar bzw. im Protokoll.
- Gilt für Öffnen, IFC-Übernahme und Speichern-Fehler.
**Test:** `packages/core/src/projektdatei.test.ts`: kaputte Eingabe wirft `ProjectFormatError` mit der neuen Nutzermeldung; UI-Test: Meldungsdialog erscheint, `window.alert` wird nicht aufgerufen.

### G-15 Rückfrage „Ungespeicherte Änderungen verwerfen?“ als `window.confirm`  (S)  → zentral (Querschnitt)
**Problem:** `apps/grz/src/App.tsx:38` und `:196` sowie `packages/core/src/ui/TitleBar.tsx:85` („… verwerfen und beenden?“) nutzen `window.confirm`: nur OK/Abbrechen, blockiert die Seite, kein „Speichern“.
**Soll:**
- Eigener gemeinsamer Dialog in `packages/core` mit drei Knöpfen „Speichern“ / „Nicht speichern“ / „Abbrechen“ („Änderungen an ‚<Name>‘ speichern?“). „Speichern“ speichert und führt danach die Aktion (Öffnen/Beenden) aus; schlägt Speichern fehl oder wird abgebrochen, bleibt man im Projekt.
- Alle Stellen (Öffnen, Projektwahl, Beenden) und alle Apps nutzen ihn; Esc = Abbrechen (G-11).
**Vorbild:** Office, Archicad und Allplan fragen „Änderungen an ‚X‘ speichern? [Speichern] [Nicht speichern] [Abbrechen]“.
**Test:** `packages/core/src/ui/ProjektWahl.ui.test.ts` bzw. neuer Dialogtest: drei Knöpfe, „Speichern“ ruft Speichern vor der Aktion, „Abbrechen“ lässt die Aktion aus, `window.confirm` wird nicht aufgerufen.

# Verbesserungen

### G-20 Prüffähiger Rechenweg (Teilflächen, Formeln, Maße)  (L)
**Problem:** Der Nachweis (Kacheln, Druck, Excel) nennt nur Ergebnisflächen („Hauptanlage 80,00 m²“, „Fläche 1 16,96 m²“). Nirgends steht, wie eine Fläche entsteht: keine Maße, keine Zerlegung, keine Formel GRZ = GR / FGst. Für den BRI gibt es das Muster schon im Core (`packages/core/src/rechenweg.ts`: Zerlegung in Teilkörper, Länge × Breite).
**Soll:**
- Je Lageplan-Fläche und je Gebäudeumriss (GR) Zerlegung in Rechtecke und Dreiecke mit Maßen (Länge × Breite = Fläche, Dreieck g·h/2); Summe der Teilflächen = berechnete Fläche exakt; ohne saubere Zerlegung „Fläche aus Koordinaten“. Automatisch, abschaltbar.
- Formelzeile: „GRZ I = 135,00 m² / 612,50 m² = 0,2204“ (analog GRZ II; GFZ = GF / FGst), gegliedert in Hauptanlage und Anlagen nach § 19 Abs. 4 BauNVO.
- Druck: Skizze mit Teilflächennummern und Maßketten; Excel: Teilflächen als Zeilen mit Formeln (Länge × Breite).
- Abschnitt optional (Schalter „Rechenweg ausgeben“), im Druck standardmäßig an.
- Baut auf G-02, G-04, G-05, G-08 auf (Reihenfolge beachten).
**Vorbild:** Bauamts-Formulare (LBK München, Braunschweig, Frankfurt, Brandenburg) gliedern je Teilfläche Länge × Breite = Fläche mit Summen und Formel samt nummerierter Skizze; Geosoft GEORG GRZ-GFZ gibt Nachweislisten mit Deckblatt aus.
**Test:** neuer Test in `packages/core/src` (nach Vorbild `rechenweg.test.ts`): Rechteck, L-Form, Dreieck, Summe der Teilflächen = `polygonArea`; `apps/grz/src/export/excel.test.ts`: Formelzeile „135,00 / 612,50“ und Teilflächenzeilen.

### G-21 Genaue Eingabe beim Zeichnen  (M)
**Problem:** `components/LageplanEditor.tsx` (Werkzeuge Polygon/Rechteck, ab Z. 33): Punkte nur mit der Maus; Länge, Winkel, Koordinaten oder B × T lassen sich nicht eingeben; beim Zeichnen werden weder Länge noch Fläche angezeigt; der Fang (`packages/core/src/fang.ts`) greift auf Ecken und Verlängerungen, nicht auf einen beliebigen Punkt einer Kante und nicht aufs Lot. Eine Terrasse „3,00 × 5,00 m an der Hauswand“ ergab im Test 2,93 × 4,95 m mit 6 cm Spalt (ein Teil davon ist G-13).
**Soll:**
- Während des Zeichnens ein kleines Eingabefeld am Zeiger: Länge und Winkel (Tab wechselt das Feld, Enter setzt den Punkt), bei Rechteck Breite × Tiefe; Eingaben in Metern.
- Laufende Anzeige von Segmentlänge und Gesamtfläche.
- Fang zusätzlich auf Punkt einer Kante, Kantenmitte und Lot (senkrecht auf eine Kante), mit sichtbarem Symbol.
- In der Auswahl sind Kantenlängen bearbeitbar (Eingabe verschiebt den Endpunkt entlang der Kante).
- Voraussetzung: G-13.
**Vorbild:** Archicad-Tracker (Länge/Winkel, Tab wechselt Feld, relative Koordinaten, Fang auf Kante/Mitte/Lot); Bluebeam Revu zeigt Länge und Fläche live.
**Test:** `packages/core/src/fang.test.ts`: Fang auf Kante, Lot, Mitte; `apps/grz/src/grz.ui.test.ts`: Rechteck per Eingabe 3,00 × 5,00 an der Hauswand hat exakt diese Maße, ohne Spalt.

### G-22 Unterlage (amtlicher Lageplan, ALKIS) und echte Grundstücksgrenze  (L)
**Problem:** Es gibt keine Unterlage zum Nachzeichnen. Die strichpunktierte „Grundstückslinie“ ist nur die Vereinigung der eigenen Flächen und des Gebäudes (`apps/grz/src/massNutzung.ts:668`, `grundstueckPolygone`); im Testprojekt umschließt sie 180 m², das Grundstück hat 612,50 m². Das sieht wie die Flurstücksgrenze aus, ist es aber nicht.
**Soll:**
- PDF, Bild oder DXF als Unterlage unter dem Lageplan einlesen; Zwei-Punkt-Kalibrierung an einer bekannten Strecke (Eingabe der Länge in m); Unterlage wird mit dem Projekt gespeichert und lässt sich ein-/ausblenden.
- Eigenes Objekt „Grundstück (Flurstück)“ (Polygon) statt der Vereinigung; dessen Fläche aus der Zeichnung (oder dem Kataster) wird mit der eingetragenen Grundstücksfläche abgeglichen; bei Abweichung zeigt die App beide Werte, es gilt die Katasterangabe (Hinweis § 19 Abs. 3 BauNVO: maßgebend ist die Fläche des Baulands).
- Die strichpunktierte Linie in Plan und Druck zeigt die echte Grenze; ohne Objekt entweder keine oder klar als „Umriss der erfassten Flächen“ beschriftet.
- ALKIS-Import (NRW offen verfügbar, z. B. TIM-online/WFS) ist spätere, optionale Stufe; Pflicht sind PDF/Bild/DXF mit Kalibrierung und das Grundstücksobjekt.
**Vorbild:** Bluebeam Revu (PDF öffnen, Maßstab mit „Calibrate“ an bekannter Strecke, Flächen mit Aussparungen messen); Archicad/Vectorworks nutzen DWG/DXF bzw. PDF als Unterlage.
**Test:** Kalibrierung (zwei Punkte, bekannte Länge ergibt richtigen Maßstab) in `packages/core/src`; `apps/grz/src/massNutzung.test.ts`: Grundstücksobjekt 612,50 m² gegen eingetragene Fläche, Abweichungshinweis; Projekt-Roundtrip (`packages/core/src/projektdatei.test.ts`) erhält Unterlage und Grundstücksobjekt.

### G-23 Nutzung direkt beim Zeichnen; Auswahlbereich vollständig  (S)
**Problem:** `packages/core/src/model.ts:544` `createLageplanFlaeche` setzt jede neue Fläche auf Nutzung `sonstige`, Versiegelung `voll`, Name „Fläche n“ (`components/LageplanEditor.tsx:142`). Die Kennzahl springt auf „prüfen … bis 0,22“, links erscheint „Einstufung offener Fälle – sonstige“. Der Auswahlbereich unter dem Plan bietet nur Bezeichnung und Höhe; Nutzung und Versiegelung stehen nur in der Tabelle bzw. in der Mehrfachauswahl.
**Soll:**
- Werkzeugleiste mit Nutzungs-Vorlagen (Zufahrt, Stellplatz, Garage/Carport, Terrasse, Weg, Nebenanlage, Garten) auf Basis von `LAGEPLAN_NUTZUNGEN`: Vorgabe für Nutzung und passende Versiegelung (z. B. Zufahrt voll, Garten unversiegelt); Name nach Nutzung („Zufahrt 1“, „Terrasse 2“, laufende Nummer je Nutzung).
- Kein Standard „sonstige/prüfen“ mehr für neue Flächen (nur bei ausdrücklicher Wahl).
- Der Auswahlbereich unter dem Plan enthält zusätzlich Nutzung, Versiegelung und Nachbar-Schalter wie die Mehrfachauswahl.
**Vorbild:** Bluebeam „Tool Chest“ (vordefinierte Messwerkzeuge mit Farbe/Kategorie, z. B. „Pflaster“, „Rasen“); Archicad wählt Zonenkategorien vor dem Zeichnen.
**Test:** `apps/grz/src/grz.ui.test.ts`: Werkzeug „Zufahrt“ erzeugt Fläche mit Nutzung `zufahrt`, passender Versiegelung, Name „Zufahrt 1“; Kennzahl bleibt ohne offene Spanne.

### G-24 Beschriftung und Orientierung im Plan (App)  (M)
**Problem:** Im Lageplan der App (`components/LageplanEditor.tsx`) stehen weder Namen noch Nummern noch m² (nur ein Tooltip beim Überfahren). Maßstab, Nordpfeil und Raster fehlen. Die Hilfezeile über dem Plan (`hint` der Werkzeuge, ab Z. 33) ist ein vierzeiliger Fließtext mit allen Kürzeln.
**Soll:**
- Beschriftung „Nr · Nutzung · m²“ je Fläche im Plan, ein-/ausblendbar (Schalter in der Plan-Leiste); Position wie in G-08 (im eindeutigen Anteil).
- Maßstabsleiste und Nordpfeil, optional Raster (abschaltbar).
- Kürzel in einer aufklappbaren Tastenübersicht („?“); in der Hilfezeile nur die 2-3 wichtigsten des aktiven Werkzeugs.
**Vorbild:** Archicad-Zonenstempel und Bluebeam-Labels zeigen Name und Fläche direkt im Plan; viele CAD-Programme zeigen Kürzel in einer Übersicht hinter „?“.
**Test:** `apps/grz/src/grz.ui.test.ts`: Beschriftung „1 · Zufahrt · 16,96 m²“ vorhanden und ausblendbar; Hilfezeile mit höchstens 3 Kürzeln.

### G-25 Stammdaten und Bebauungsplan-Kopf in der App  (M)
**Problem:** Der Druck liest Bauherr, Adresse, Gemarkung/Flur/Flurstück aus den Projektdaten (`project.meta`), im GRZ-Nachweis kann man sie aber nicht eingeben. Felder für B-Plan-Nummer, -Name, Gebietsart und Bauvorhaben fehlen; ein reines IFC-Projekt druckt nur „Testhaus · Stand …“. Hängt am Querschnittspunkt „Stammdaten einmal erfassen“.
**Soll:**
- Abschnitt „Projekt und Bebauungsplan“ oben in den Festsetzungen (`components/GrzGfzView.tsx`). Dafür die vorhandene gemeinsame Komponente nutzen, nicht neu bauen: `StammdatenFelder` (Bereiche `projekt`, `grundstueck`, `bauherr`, `umfang`) bzw. `StammdatenDialog` aus `packages/core/src/ui/Stammdaten.tsx` auf `ProjectMeta` aus `packages/core/src/model.ts` (Bauherr, Adresse, Gemarkung/Flur/Flurstück sind dort schon modelliert).
- Neue Felder B-Plan Nr., B-Plan Name, Gebietsart (WR/WA/MI/MK/GE/GI/…) im Modell `MassNutzung` (`model.ts:520`) ergänzen, Roundtrip in der .oap sowie Kopf in Druck und Excel (Deckblattangaben aus Stammdaten und B-Plan).
- Gebietsart wirkt in G-26 (BauNVO 1962 § 19 Abs. 5).
- Stammdaten liegen gemeinsam in der Projektdatei; Eingabe in anderen Apps bleibt gültig (kein Doppelmodell).
**Vorbild:** Geosoft GEORG GRZ-GFZ führt durch „Stammdaten → Flurstücke → Flächen“ und erzeugt daraus das Deckblatt zum amtlichen Lageplan; Bauamtsformulare beginnen mit Bauherr, Grundstück und B-Plan.
**Test:** `apps/grz/src/grz.ui.test.ts`: Eingabe von Bauherr/Flurstück/B-Plan Nr. erscheint im Druckkopf und im Export; `packages/core/src/projektdatei.test.ts`: Roundtrip der neuen `MassNutzung`-Felder.

### G-26 Fachliche Lücken bei Festsetzungen und Einstufung  (M-L)
**Problem:** Rechenkern und Festsetzungen (`apps/grz/src/massNutzung.ts`, `components/GrzGfzView.tsx`, `packages/core/src/model.ts:520` `MassNutzung`):
- Terrasse nach BauNVO 1990 („zählt zur Grundfläche“, `massNutzung.ts` ca. Z. 89-111) führt immer zu GRZ II; viele Bauaufsichten rechnen eine angebaute, ebenerdige Terrasse der Hauptanlage zu (GRZ I). Streitig, deshalb wählbar.
- Im IFC modellierte angebaute Garage, Carport oder Gartenhaus zählen als Hauptanlage (GRZ I); als Anlage nach § 19 Abs. 4 bzw. § 21a nicht einstufbar, nur als Lageplan-Fläche nachzeichenbar.
- § 20 Abs. 3 S. 2 BauNVO 1990 (Aufenthaltsräume in Nicht-Vollgeschossen mitrechnen) ist nicht abbildbar (Doku nennt sie, Oberfläche bietet sie nicht an).
- Es fehlen GR/GF als absolute Festsetzung (m²), Baumassenzahl (§ 21), Vollgeschosse als Mindest- bzw. zwingendes Maß, Trauf-/Firsthöhe und Gebietsart; BauNVO 1962 § 19 Abs. 5 stellt Garagen in MK/GE/GI anrechnungsfrei, die App rechnet Garagen 1962 immer an.
- BauO NW 1970: Kellergeschosse „im Lichten“ > 1,40 m; gerechnet wird mit Deckenoberkante.
- Feld „Dachaufbau [m]“ (`GrzGfzView.tsx:121`, `MassNutzung.dachaufbau`) wirkt auch als Deckenaufbau aller Geschosse.
**Soll:**
- Einstufung „GRZ I / GRZ II / zählt nicht“ auch für Terrassen (über `einstufung`, bisher nur für „prüfen“); Vorgabe BauNVO 1990 bleibt GRZ II, ist aber wählbar.
- Gebäudeumrisse (aus IFC) lassen sich als „Garage/Carport/Nebenanlage“ kennzeichnen und werden dann als Anlage nach § 19 Abs. 4 BauNVO (1990) bzw. § 21a (1962-1977) gerechnet, nicht als Hauptanlage.
- Schalter „Aufenthaltsräume in Nicht-Vollgeschossen mitrechnen (§ 20 Abs. 3 S. 2 BauNVO 1990)“ im Modell und in der GFZ-Rechnung.
- Felder GR (m²) absolut, GF (m²) absolut, BMZ (§ 21), Gebietsart (aus G-25) mit Wirkung auf BauNVO 1962 (Garagen in MK/GE/GI nicht anrechnen); optional Vollgeschosse mindestens/zwingend, Trauf-/Firsthöhe als Eingabe mit Prüfhinweis.
- BauO NW 1970: Kellerregel über lichte Höhe; Feld in „Decken-/Dachaufbau [m]“ umbenennen (ggf. getrennte Felder).
- Reihenfolge nach Nutzen, in kleinen Schritten mit je eigenem Test: Terrasse, Garage/Gebäudeteil, Gebietsart/§ 19 Abs. 5 (1962), absolute GR/GF, § 20 Abs. 3 S. 2, Rest.
**Test:** `apps/grz/src/massNutzung.test.ts`: Terrasse 1990 mit Einstufung GRZ I zählt zur GR statt GR II; angebaute Garage als Anlage zählt zur GRZ II; Garage 1962 in GE nicht angerechnet, in WA angerechnet; GR absolut 120 m² gegen vorhandene GR; Kellergeschoss 1970 mit lichter Höhe 1,50 m wird als Vollgeschoss geprüft, 1,30 m nicht.

### G-27 Leerzustand und Einstieg  (S)
**Problem:** Start ohne Projekt (`App.tsx`, Einstiegskarte `grz-leer` ab ca. Z. 175, Bedingung `!hatGebaeude`): Darunter stehen schon die vollständigen Festsetzungen, ein leerer Lageplan und ein Nachweis mit drei Hinweisen. Im Web gibt es kein „Neues Projekt“ (nur Neuladen, dann kommt der Zwischenstand wieder). Ausgegraute Knöpfe („Nachweis drucken“, „Excel …“, `App.tsx` Z. 136-146) sagen nicht, warum sie gesperrt sind. Der Hinweis „Grundstücksfläche fehlt: in den Projektdaten eintragen“ (`massNutzung.ts:664`) verweist auf eine Maske, die es in der App nicht gibt; das Feld steht in den Festsetzungen.
**Soll:**
- Ohne Gebäude (und ohne Lageplan-Flächen) nur die Einstiegskarte (Öffnen, IFC, „mit leerem Lageplan beginnen“); Festsetzungen, Plan und Nachweis erst danach.
- „Neues Projekt“ in der Werkzeugleiste (mit Rückfrage nach G-15 bei ungespeicherten Änderungen); verwirft auch den Zwischenstand.
- Gesperrte Knöpfe mit Tooltip „erst ein Gebäude öffnen“.
- Hinweis „Grundstücksfläche fehlt“ nennt das Feld „Grundstücksfläche [m²]“ in den Festsetzungen und fokussiert es per Klick.
**Vorbild:** Online-GRZ-Rechner (z. B. rechner-portal.de) zeigen nur die nötigen Felder, Grundstücksfläche und überbaute Fläche, dann das Ergebnis mit Formel.
**Test:** `apps/grz/src/grz.ui.test.ts`: Leerzustand rendert nur die Einstiegskarte; Knopf „Nachweis drucken“ hat `title` mit Grund; „Neues Projekt“ setzt den Store zurück.

### G-28 Layout der Nachweis-Spalte  (S)
**Problem:** `components/GrzGfzView.tsx` (Vollgeschosse-Tabelle ca. Z. 380-400, Lageplan-Tabelle ab Z. 248, `KpiZeile` Z. 506-518), Stile in `apps/grz/src/styles.css`: Die Spalte „Ergebnis“ der Vollgeschoss-Tabelle ist sehr schmal (Auswahlfeld, fettes Ergebnis und Begründung brechen in 8-10 Zeilen um); bei 1280 px ist die Versiegelung abgeschnitten („vollversiegel…“); in den Kacheln bricht „Reserve 100,00 m²“ mitten in der Einheit um.
**Soll:**
- Begründung als aufklappbare Unterzeile über die volle Breite der Tabelle.
- Auswahlfelder schmaler (Symbol oder „auto/ja/nein“).
- `white-space: nowrap` für Zahl und Einheit („100,00 m²“ nie getrennt).
- Bei schmalen Fenstern (bis 1280 px) zwei statt drei Kachelspalten; Versiegelung nicht abgeschnitten.
**Test:** `apps/grz/src/grz.ui.test.ts`: Stylesheet enthält `nowrap` für Kennzahl+Einheit; Begründung als eigene Zeile (Struktur); kein visueller Test nötig.

### G-29 Regeln: Begründung der Anrechnung je Nutzung leichter finden  (S)
**Problem:** In „Regeln“ (Nachschlagewerk: `packages/core/src/regeln/`, `ui/Nachschlagewerk.tsx`) findet die Suche „Terrasse“ nur die WoFlV-Regeln des Flächenrechners, nicht § 19 BauNVO. Die Pille „prüfen“ hat als Tooltip nur „BauNVO 1968/1977“. Die Titel in der linken Liste sind abgeschnitten (waagerechte Bildlaufleiste).
**Soll:**
- Tooltip bzw. Klick auf die Pille („prüfen“, „zählt nicht“, „GRZ II“) zeigt z. B. „Terrasse nach BauNVO 1990: nicht ausdrücklich geregelt; Praxis A …, Praxis B …“ und springt in die passende Regel.
- Stichworte (Terrasse, Zufahrt, Stellplatz, Carport, Garage …) bei § 19 BauNVO ergänzen, damit die Suche sie findet.
- Im GRZ-Nachweis WoFlV-Regeln ausblenden (Regelsatz „grz“ filtert nach App).
- Die linke Liste umbricht Titel statt sie abzuschneiden (keine waagerechte Bildlaufleiste).
**Test:** vorhandene Regeltests unter `packages/core/src/regeln` ergänzen: Suche „Terrasse“ im Regelsatz „grz“ liefert § 19 BauNVO und keine WoFlV-Treffer; Pille verweist auf die Regel-ID.

### G-30 IFC-Bericht auf den GRZ-Nachweis zuschneiden  (S)
**Problem:** Die Leiste „IFC-Import“ (`App.tsx` Z. 161-173, Zustand `bericht`) zeigt den vollständigen Import-Bericht, darunter BRI- und Putzabzugshinweise des Flächenrechners („keine Bodenplatte … damit der BRI ab UK Sohle rechnet“), die hier keine Bedeutung haben. Beim Aktualisieren heißt sie ebenfalls „IFC-Import“. Ob ein Geschoss „Lageplan“ oder Gelände gefunden wurde, steht nicht darin, obwohl das für die GRZ wichtig ist.
**Soll:**
- Hinweise zu BRI/Putz usw. herausfiltern (nach Berichtstyp, wenn der Core Typen liefert, sonst App-seitiger Filter).
- Titel „IFC-Abgleich“ beim Aktualisieren, „IFC-Import“ beim ersten Import.
- Zusammenfassung oben: „Lageplan: n Flächen, Geländemodell: ja/nein, Geschosse: …“.
**Test:** `apps/grz/src/grz.ui.test.ts` bzw. `packages/core/src/ifcAbgleich.test.ts`: Bericht ohne BRI-/Putzzeilen; Zusammenfassung mit Lageplanflächen und Geländemodell-Angabe für das Fixture `packages/core/src/__fixtures__/testhaus.ifc`.

### G-31 3D-Ansicht: überlagerte Flächen unsichtbar  (S)
**Problem:** `components/Gelaende3D.tsx` (3D-Ansicht): Zufahrt und Terrasse auf gleicher Höhe wie die umschließende Gartenfläche sind nicht zu sehen (Z-Fighting), es bleibt ein flimmernder Rest.
**Soll:**
- Flächen nach Rang minimal versetzt zeichnen (höherer Rang geringfügig höher, wenige Millimeter) oder `polygonOffset` nutzen oder nur die eindeutigen Anteile darstellen; kein Flimmern.
- Je Stelle ist die Fläche mit dem höchsten Rang sichtbar.
**Test:** `apps/grz/src/grz.ui.test.ts`: erzeugte Meshes für überlagerte Flächen haben verschiedene Höhen bzw. `polygonOffset`-Material (Struktur prüfen); kein Pixeltest.

### G-32 Rückgängig mit Beschriftung, Varianten  (S Beschriftung / M Varianten)
**Problem:** `App.tsx` Z. 151-154: Tooltip „Rückgängig (Strg+Z)“ / „Wiederholen (Strg+Y)“ nennt nicht, was zurückgenommen wird (`store.ts` `update(fn, zusammenfassen)` kennt keine Aktionsnamen). Varianten („mit/ohne Terrasse“, „Carport hier/dort“) lassen sich nur über Kopien der Datei vergleichen.
**Soll:**
- Teil 1 (S): `update` erhält einen Aktionsnamen („Fläche verschieben“, „Nutzung ändern“); `past`/`future` halten die Namen; Tooltip „Rückgängig: Fläche verschieben (Strg+Z)“.
- Teil 2 (M, getrennt lieferbar): einfache Variantenumschaltung je Lageplan-Fläche („nur in Variante B“), Kennzahlen der Varianten nebeneinander (Variante an der Fläche im Modell, Rechenkern wertet je Variante aus).
**Vorbild:** Photoshop und Office zeigen „Rückgängig: <Aktion>“; Archicad bietet mit Design Options Varianten in einem Projekt.
**Test:** `apps/grz/src/grz.ui.test.ts`: nach Aktion „Nutzung ändern“ nennt der Rückgängig-Tooltip diese Aktion; Varianten: Kennzahlen je Variante im Rechenkern (`massNutzung.test.ts`).


---

## Projektordner

Alle Pfade relativ zu `apps/ordner/src/` (App) bzw. `packages/core/src/` (Core). Tests der App: `apps/ordner/src/ordner.test.ts` (Logik) und `ordner.ui.test.ts` (Oberfläche); Core: `ui/*.test.ts(x)`, `platform/*.test.ts`.

### PB-01 Helle Kästen im Dunkelmodus  (Aufwand S)  → zentral (Querschnitt)
**Problem:** `styles.css` setzt feste Hellfarben: `.po-ergebnis`/`.po-meldung` (Z. 146, 164; `#e9f6ee`, `#9fd3b3`, `#1f2328`), `.po-befund-art` und Varianten ok/warnung/fehler (Z. 186–205; `#eef0f2`, `#e2f2e8`, `#fbefd6`, `#fbe4e1`), `.po-schritt-nr` (Z. 387, 402). Im Dunkelmodus stehen helle Kästen auf dunklem Grund (Ergebnis nach Anlegen, Meldungen in Einstellungen/Vorlagen, Befund-Marken in „Ordner prüfen“, Schrittnummern).
**Soll:**
- Keine festen Hex-Farben mehr in diesen Regeln; stattdessen Variablen aus `ui/base.css` (dort existieren `--warn-bg/-border/-text`; `--ok-*` und ggf. `--info-*`/`--fehler-*` ergänzen, hell und dunkel definiert).
- Ergebnis, Meldung, Befund-Marken, Schrittnummer und „neu“-Vermerk im Trockenlauf sind in beiden Schemata gut lesbar (Kontrast WCAG AA).
- `.po-ergebnis.fehler` bleibt wie bisher.
**Vorbild:** Gängige Apps leiten Statusfarben aus Theme-Variablen ab, nie aus festen Farben.
**Test:** Kein Pixeltest. `ordner.ui.test.ts`: Quelltext-/CSS-Prüfung, dass `styles.css` in diesen Selektoren keine `#rrggbb` mehr enthält (oder zentraler CSS-Test in Core, falls dort für alle Apps angelegt).

### PB-02 Farbschema wechselt erst nach Neustart  (Aufwand S)  → zentral (Querschnitt)
**Problem:** `main.tsx:13` ruft `applyTheme(useTheme.getState().theme, …canvasDunkel)` nur einmal beim Start; keine Neuanwendung bei Änderung (`platform/theme.ts`, `applyTheme` Z. 75). Nach Wahl „Hell“ bleibt die Seite dunkel (`data-theme="dunkel"`), obwohl der Knopf „Hell“ zeigt. Nur der Flächenrechner wendet per `useEffect` in seiner `App.tsx` an; GRZ, Formulare, Entzerrung, Suite vermutlich gleicher Fehler.
**Soll:**
- `applyTheme` wird zentral in `packages/core` bei jeder Änderung von `theme`/`canvasDunkel` ausgeführt (z. B. `useTheme.subscribe` in `platform/theme.ts` oder in `TitleBar`), für alle Apps.
- Wahl „Hell/Dunkel/System“ wirkt sofort ohne Neustart; bei „System“ folgt die Seite einem Wechsel des Systemschemas.
- Menüpunkt „Zeichenfläche im dunklen Schema abdunkeln“ ist in Apps ohne Zeichenfläche ausgeblendet (auch Projektordner).
**Vorbild:** Theme-Umschalter in Office/VS Code wirken sofort.
**Test:** `packages/core/src/platform/theme.test.ts` (neu): `useTheme.setState({theme:'hell'})` → `document.documentElement.dataset.theme === 'hell'` ohne weiteren Aufruf; zusätzlich Fall in `ordner.ui.test.ts`: Titelleiste Menü → „Hell“ → Attribut sofort geändert.

### PB-03 Ungültige/doppelte Zeilen der Ordnerliste verschwinden still  (Aufwand S)
**Problem:** `struktur.ts` `ordnerAusText` (ab Z. 145) verwirft stillschweigend: doppelte Pfade (Z. 152, `gesehen`), unbekannte LPh (`lphAus` leer → `LPh 10` entfällt, Ordner wird dann immer angelegt) und bereinigt Zeichen wie `< >` per `sichererName`. `components/StrukturView.tsx:104` übernimmt zusätzlich schon beim Verlassen des Felds (`onBlur` → `ordnerUebernehmen`, Z. 28), ohne Meldung.
**Soll:**
- `ordnerAusText` liefert zusätzlich eine Liste von Meldungen mit Zeilennummer, z. B. „Zeile 22: LPh 10 gibt es nicht“, „Zeile 23 doppelt zu Zeile 12 – nur die erste gilt“, „Zeile 24: Zeichen < > werden entfernt“, unbekannter Zusatz nach „|“.
- Vor dem Übernehmen werden die Meldungen unter dem Feld angezeigt; gibt es welche, wird beim Verlassen des Felds NICHT automatisch übernommen (nur über den Knopf „Ordnerliste übernehmen“, ggf. mit Hinweis).
- Fehlerfreie Listen verhalten sich wie bisher (Rückgabewert für andere Aufrufer kompatibel halten).
**Vorbild:** Konfigurationseditoren melden Syntaxfehler zeilenweise statt still zu korrigieren.
**Test:** `ordner.test.ts`, Block „Struktur“: Eingabe mit `10 Archiv | LPh 10`, doppelter Zeile und `Test<>Ordner` → je eine Meldung mit richtiger Zeilennummer; `ordner.ui.test.ts`, Einstellungen: Blur mit fehlerhafter Liste übernimmt nicht und zeigt Meldungen.

### PB-04 Beschädigte alte `projekt.json` wird nicht gemeldet  (Aufwand S)
**Problem:** `projekt.ts:~38–44`: `leseProjektJson` in `try/catch`, Fehler werden stumm verworfen („eine fremde oder kaputte projekt.json zählt nicht“). „Ordner prüfen“ meldet nur „Projektdatei (.oap) fehlt“ (`pruefung.ts:~61`), Ergänzen sagt „Bitte die Stammdaten erfassen“ (`components/AssistentView.tsx:368`) – kein Hinweis, dass Altdaten vorhanden, aber unlesbar sind.
**Soll:**
- Beim Lesen wird erfasst, dass eine `projekt.json` existiert, aber nicht lesbar ist (neues Feld in `quelle`, z. B. `alteProjektJsonDefekt`).
- „Ordner prüfen“ zeigt einen Befund der Art „Hinweis“: „Alte projekt.json nicht lesbar“ (Datei bleibt unangetastet).
- Beim Ergänzen steht derselbe Hinweis statt/neben „Bitte die Stammdaten erfassen“.
- Ohne `projekt.json` oder mit lesbarer Datei ändert sich nichts.
**Vorbild:** Tools melden beschädigte Altdateien, statt sie zu ignorieren.
**Test:** `ordner.test.ts`, Block „Prüfmodus“: Ordner mit Inhalt `{kaputt` in `projekt.json` → Befund „Alte projekt.json nicht lesbar“; `ordner.ui.test.ts`, Ergänzen-Fall: Hinweis sichtbar.

### PB-05 Texte passen nicht zur Lage  (Aufwand S)
**Problem:** Vier Textfehler, hauptsächlich in `components/AssistentView.tsx`:
1. Z. 450: „… Ordner und {n} Dateien neu“ → „1 Dateien“ (kein Singular).
2. Z. 472: „Die Projektdatei wird gezielt ergänzt (vorher gesichert)“ steht auch beim neuen Projekt und im Browser (dort gibt es weder Ergänzen noch Sicherung).
3. Hinweis „Kurzname – wird Teil des Ordnernamens“ erscheint auch im Modus Ergänzen, wo der Ordner nicht umbenannt wird (Feld Kurzname im Stammdaten-Formular, `packages/core/src/ui/Stammdaten.tsx`, bzw. wird von dort übergeben; Stelle per Grep nach „wird Teil des Ordnernamens“ suchen).
4. Z. 434: Beschriftung „Stammordner für Projekte“ erscheint im Browser ohne Wert/Kontext.
**Soll:**
- Singular/Plural korrekt („1 Datei“, „2 Dateien“; ebenso „1 Ordner“).
- Satz zur Projektdatei je Lage: neues Projekt → „wird neu angelegt“; Ergänzen auf dem Desktop → „wird gezielt ergänzt (vorher gesichert)“; Browser (ZIP) → kein Satz zu Sicherung/Ergänzen.
- Kurzname-Hinweis nur im Modus „neu“; beim Ergänzen entfällt er oder lautet „Der Ordner wird nicht umbenannt“.
- Stammordner-Zeile im Browser ausgeblendet oder mit erklärendem Text (Ausgabe als ZIP).
**Vorbild:** Meldungen passen sich Kontext und Zahl an, statt generisch zu bleiben.
**Test:** `ordner.ui.test.ts`, Assistent neu: Trockenlauf mit genau einer neuen Datei zeigt „1 Datei“ und keinen Satz „vorher gesichert“; Ergänzen-Fall: kein „wird Teil des Ordnernamens“.

### P-01 Bürostruktur ohne Rückfrage und Rückweg ersetzbar  (Aufwand M)
**Problem:** `components/StrukturView.tsx`: „Standard“ (Z. 72, `setStruktur({...STANDARD,…})`), „Struktur laden …“ (Z. 40, `setStruktur(s)`), Ordnerliste beim Verlassen des Felds (Z. 104) und Presets in `components/VorlagenView.tsx` ersetzen die Bürostruktur sofort. `store.ts` `setStruktur` (Z. 115) → `eigeneSpeichern` (Z. 95) → `konfigSchreiben` schreibt `projektordner.json`; liegt der Konfigurationsordner auf dem Server, gilt das für das ganze Büro (nur Code gelesen). Kein Rückgängig, keine Sicherung.
**Soll:**
- „Standard“ und „Struktur laden …“ fragen vorher nach, mit Vorschau der Änderung („6 Ordner entfallen, 2 neu, 3 Schemata ändern sich“) und Knöpfen „Ersetzen/Abbrechen“.
- Vor jedem Ersetzen entsteht eine Sicherung `projektordner.json.bak-<JJJJ-MM-TT-hhmm>` im Konfigurationsordner (wie bei der Projektdatei); nur die letzten N (z. B. 10) behalten, sonst wird nichts gelöscht.
- „Rückgängig“ für die letzte Änderung (Meldung mit Knopf, stellt aus Sicherung/Speicher wieder her).
- Optional: Bearbeitung der Bürostruktur erst nach Klick auf „Bearbeiten“.
**Vorbild:** SharePoint führt Versionshistorie; M-Files/d.velop haben Admin-Bereiche mit Speichern/Verwerfen.
**Test:** `ordner.ui.test.ts`, Einstellungen (neben dem bestehenden Fall „Standard wiederherstellen“): Klick „Standard“ → Rückfrage, Abbrechen ändert nichts, Bestätigen ersetzt, „Rückgängig“ stellt wieder her; `ordner.test.ts`: Sicherungsname und Begrenzung der Anzahl.

### P-02 Letzter Schreiber gewinnt  (Aufwand M)  (nur Code gelesen)
**Problem:** `store.ts:95–97` `eigeneSpeichern()` schreibt immer `{ struktur, vorlagenordner }` komplett aus dem App-Speicher (`konfigSchreiben`, `packages/core/src/platform/konfig.ts:112`); gelesen wird nur beim Start (`konfigLaden`, `store.ts:55`). Zwei Rechner mit offener App überschreiben gegenseitig Änderungen. Für `allgemein.json` gibt es dagegen `allgemeinAendern` (`konfig.ts:~132`, frisch lesen, nur Patch schreiben). Jeder Tastendruck in einem Preset-Namen schreibt aufs Laufwerk.
**Soll:**
- Beim Lesen wird der Stand (Änderungszeit oder Hash) gemerkt, beim Schreiben verglichen (Muster `projekt_oap_ersetzen`); bei Abweichung kein Überschreiben, sondern Meldung „Die Struktur wurde inzwischen von einem anderen Rechner geändert – neu laden?“ (Knöpfe „Neu laden“, „Meine Fassung trotzdem speichern“).
- Beim Wechsel in „Einstellungen“/„Vorlagen“ wird frisch gelesen.
- Schreiben wird entprellt (nicht je Tastendruck).
**Vorbild:** DMS sperren Konfigurationsobjekte (Check-out); SharePoint meldet „Die Datei wurde von … geändert“.
**Test:** `packages/core/src/platform/konfig.test.ts`: Schreiben mit veraltetem Stand schlägt mit Konflikt fehl, mit aktuellem Stand gelingt es; `ordner.ui.test.ts`: simulierte Fremdänderung → Meldung statt Überschreiben.

### P-03 Projektnummer: keine Prüfung, Vorschlag nur aus erstem Stammordner  (Aufwand M)
**Problem:** `plan.ts:178` prüft nur `if (!s.nummer)`; „26-14“ wird bei Schema `{jahr}-{nr:3}` angenommen und der Ordner „26-14 EFH Müller Weg 3“ gebaut. Der Vorschlag (`components/AssistentView.tsx:67–83`) liest nur `stammordner` (erster Eintrag von `allgemein.projekte`, `store.ts`) per `tauriDateisystem.liste(stammordner, 1)`; Projekte in weiteren Stammordnern (z. B. Archiv, Akquise) zählen nicht → doppelte Nummern möglich. Der Vorschlag steht nur als Platzhalter mit „übernehmen“-Knopf, das Feld bleibt leer (`nummer.ts` `naechsteNummer`) (nur Code gelesen).
**Soll:**
- Passt die Nummer nicht zum Schema (`nummer.ts`, Platzhalter `{jahr} {jj} {nr[:n]}`), erscheint eine Warnung am Feld („erwartet z. B. 2026-015“); sie blockiert nicht (Hinweis, kein Fehler).
- Vorschlag berücksichtigt ALLE konfigurierten Stammordner (`allgemein.projekte`) und ist beim neuen Projekt vorausgefüllt (Feld bleibt änderbar).
- Optional (separat abnehmbar): Reservierungsdatei `nummern.json` im Konfigurationsordner (Nummer, Kürzel, Datum), damit gleichzeitiges Anlegen nicht kollidiert.
**Vorbild:** untermStrich, PROJEKT PRO, KOBOLD CONTROL vergeben Nummern aus einem zentralen Nummernkreis und reservieren sie beim Anlegen.
**Test:** `ordner.test.ts`, „Nummern und Namen“: Funktion „passt zum Schema“ (`26-14` vs. `{jahr}-{nr:3}` → nein; `2026-014` → ja); `naechsteNummer` über Ordnernamen mehrerer Stammordner; `ordner.ui.test.ts`: Warnung am Feld, Vorschlag vorausgefüllt.

### P-04 Ordnerliste als Text mit eigener Syntax  (Aufwand L)
**Problem:** `components/StrukturView.tsx:104` (Textarea `po-ordnertext`), Syntax in `struktur.ts:142ff` (`02 Pläne/Ausführung | LPh 5 | Dateischema`). Für Büromitarbeiter fehleranfällig (siehe PB-03); keine Baumvorschau, kein Umsortieren.
**Soll:**
- Baumansicht der Ordnerstruktur mit Einrücken/Umsortieren (Ziehen oder Hoch/Runter), je Ordner Häkchen LPh 1–9 und „Dateischema prüfen“, Anlegen/Umbenennen/Löschen einzelner Einträge.
- Die Textansicht bleibt als „Experte“ erhalten; beide Ansichten bearbeiten dasselbe Modell (`OrdnerRegel[]`), Rundlauf Text ↔ Baum verlustfrei (`ordnerAlsText`/`ordnerAusText`).
- Optional: „Struktur aus vorhandenem Musterordner übernehmen“.
**Vorbild:** SharePoint-Dokumentenmappen/Teams-Vorlagen und ELO/d.velop-Aktenpläne werden per Oberfläche gepflegt; „Folder Templates“ kopiert einen Musterordner.
**Test:** `ordner.test.ts`: Rundlauf `ordnerAusText(ordnerAlsText(x))` unverändert, Baum-Operationen (einrücken, verschieben) als reine Funktionen; `ordner.ui.test.ts`: LPh-Häkchen setzen ändert `struktur.ordner[i].lph`.

### P-05 Vorlagen-Zuordnungen landen außerhalb der Struktur  (Aufwand M)
**Problem:** `components/VorlagenView.tsx`: Das Preset „Alle Vorlagen“ (Z. 310, Zuordnung `''`) übernimmt die Gliederung des Vorlagenordners. Ist dieser nach Dateiart gegliedert (`Word/`, `Excel/`, `Bauantrag/`, wie die Doku empfiehlt), entstehen diese Ordner im Projektstamm; „Ordner prüfen“ meldet sie danach als „zusätzlicher Ordner“/„lose Datei“. Der Hinweis „Zielordner steht nicht in der Struktur“ (Z. 295) kommt nur bei ausdrücklich eingetragenem Ziel, nicht für die entstehenden Unterordner; „landet im Stamm“ (Z. 296) nur bei Einzeldateien. Die Zählung „Vorlagenordner – 7 Dateien“ enthält die nicht kopierte `LIESMICH.txt` (`vorlagen.ts:153`). Die Vorschau endet bei „… und N weitere“ (Z. 294) ohne Aufklappen.
**Soll:**
- Die Vorschau wendet die Regeln des Prüfmodus an und zeigt zusammengefasst: „3 Ordner liegen außerhalb der Struktur“, „2 Dateien liegen lose im Projektstamm“ (mit Liste).
- „Alle Vorlagen“ wird nur automatisch vorausgewählt, wenn der Vorlagenordner wie die Struktur aufgebaut ist; sonst Hinweis beim ersten Einlesen.
- `LIESMICH.txt` zählt nicht mit.
- Vorschau („… und N weitere“) ist aufklappbar.
**Vorbild:** SharePoint-Dokumentenmappen legen Standardinhalt je Typ in einen festen Ordner (`folderName`); M-Files ordnet Vorlagen über Klassen/Metadaten zu, ohne lose Ablagen.
**Test:** `ordner.test.ts`, „Vorlagen-Presets“: Vorlagenordner mit `Word/…`, `Excel/…` und Struktur ohne diese Ordner → Prüffunktion liefert 2 Ordner außerhalb und lose Dateien; Zähler ohne `LIESMICH.txt`; `ordner.ui.test.ts`: Vorschau zeigt Warnung und lässt sich aufklappen.

### P-06 Uneinheitliche Platzhalter  (Aufwand M)
**Problem:** Dateinamen (`components/StrukturView.tsx:91`, Vorlagen): `{nummer}, {plannummer}, {index}, {titel}, {datum}`, `{datum}` = JJJJ-MM-TT. Pfad der Projektdatei (`@core/projektdatei`, `OAP_PLATZHALTER`, `projektdateiPfad`; Aufruf `plan.ts:250`): Hilfetext nennt `{Kürzel}, {Kurzname}, {Vorhaben}, {Datum}, {Jahr}` (groß), das Feld selbst enthält `{nummer} {kurzname}` (klein), `{datum}` = JJMMTT; `{Vorhaben}` nur dort, `{bearbeiter}` nur in Dateinamen; im Inhalt `{{projekt.nummer}}`. Beispiele wechseln zwischen Entwurfswerten und festen Musterwerten. Rückmeldung zu unbekannten Platzhaltern (`unbekanntePlatzhalter`) erst nach Verlassen des Felds.
**Soll:**
- Ein gemeinsamer Platzhalter-Satz für alle Stellen, Groß-/Kleinschreibung egal, gleiche Bedeutung; `{datum}` überall gleich mit Formatoption (`{datum:JJMMTT}`, Standard JJJJ-MM-TT).
- Bestehende Konfigurationen (alte Schreibweisen, alter `{datum}`-Wert JJMMTT im Projektdatei-Pfad) bleiben gültig bzw. werden migriert, ohne dass sich vorhandene Dateinamen ändern.
- Einfüge-Menü „Platzhalter ▾“ neben jedem Schemafeld; Vorschau live beim Tippen; unbekannte Platzhalter sofort markiert.
**Vorbild:** M-Files und Word-Serienbriefe fügen Felder per Auswahldialog ein, man tippt sie nicht frei.
**Test:** `ordner.test.ts`: dieselbe Auflösefunktion für Dateiname und Projektdatei-Pfad, Groß/Klein-Äquivalenz, `{datum:JJMMTT}`, Rückwärtskompatibilität des alten Pfad-Schemas; `ordner.ui.test.ts`: Einfüge-Menü setzt Platzhalter ins Feld.

### P-07 Leistungsphasen-Auswahl  (Aufwand S)
**Problem:** Im Schritt „Umfang“ (`components/AssistentView.tsx`, Formular `packages/core/src/ui/Stammdaten.tsx`, Abschnitt „Leistungen und Beteiligte“ ab Z. 169) stehen neun Kästchen „LPh 1…9“, Namen nur im Tooltip. Ohne Auswahl entsteht „alles“ – beim Ergänzen eines alten Projekts ohne Projektdatei schlägt der Trockenlauf daher z. B. „07 Ausschreibung“ und „08 Bauleitung“ vor; der Hinweis dazu steht nur im Schritt „Umfang“.
**Soll:**
- Namen sichtbar („4 Genehmigungsplanung“), nicht nur im Tooltip.
- Schnellwahl-Knöpfe: „1–4 bis Bauantrag“, „5–8“, „1–9 alle“, „keine“.
- Im Trockenlauf beim Ergänzen ohne LPh-Angabe ein deutlicher Hinweis „Keine Leistungsphasen gewählt – alle Ordner werden vorgeschlagen“ mit Sprung „Leistungsphasen wählen“.
- Knopf „alle neuen Einträge abwählen“ im Trockenlauf.
**Vorbild:** Büro-Software (untermStrich, KOBOLD CONTROL, PROJEKT PRO) übernimmt beauftragte Phasen aus dem Honorarangebot, mit Vorlagen wie „Grundleistungen 1–4“.
**Test:** `packages/core/src/ui/Stammdaten.ui.test.ts`: Schnellwahl setzt erwartete Leistungsphasen, Namen sichtbar; `ordner.ui.test.ts`, Ergänzen-Fall: Hinweis bei leerer Auswahl, Sprung funktioniert.

### P-08 Validierung im Stammdaten-Formular  (Aufwand S)  → Querschnitt „einheitliche Eingabeprüfung“
**Problem:** `packages/core/src/ui/Stammdaten.tsx:222–223` `stammdatenFehlen` prüft nur die Projektnummer; in `components/AssistentView.tsx:245` und `plan.ts:178ff` entstehen drei gelbe Fehlerkästen sofort beim ersten Öffnen („Projektnummer fehlt“, „Kurzname fehlt“, „…ergibt sich kein Name“ – der dritte folgt aus den ersten beiden), weit weg vom Feld; „Weiter“ ist grau, der Grund nur im Tooltip. PLZ (`Stammdaten.tsx:97, 151`) „4814“, E-Mail (Z. 159) „anna@mueller, kein-mail“ und Kurzname „EFH Müller/Weg: 3?“ werden nicht beanstandet (Ordnername wird still zu „EFH Müller Weg 3“). Pflichtfelder sind nicht markiert.
**Soll:**
- Pflichtfelder markiert (Stern); Fehler am Feld, erst nach erster Interaktion (Verlassen des Felds) oder nach Klick auf „Weiter“; der abgeleitete Dritt-Fehler entfällt.
- Weiche Prüfung (Hinweis, kein Blocker): PLZ = 5 Ziffern, E-Mail-Format je Eintrag.
- Live-Hinweis unter dem Kurznamen: „/ : ? … werden im Ordnernamen entfernt“; der abgeleitete Ordnername steht direkt unter Nummer/Kurzname.
- Umsetzung möglichst über die gemeinsame Eingabeprüfung in `packages/core` (gleiches Muster in allen Apps).
**Vorbild:** Übliche Formular-Muster (Office/SharePoint): Pflichtfeld-Stern, Fehler am Feld nach erstem Verlassen.
**Test:** `packages/core/src/ui/Stammdaten.ui.test.ts`: frisch geöffnet keine Fehlerkästen; nach Blur Fehler am Feld; PLZ „4814“ und E-Mail „kein-mail“ erzeugen Hinweise; `ordner.ui.test.ts`: „Weiter“ erklärt seinen Grund sichtbar.

### P-09 Projektübersicht (alle Apps)  (Aufwand M)  (nur Code gelesen)
**Problem:** `packages/core/src/ui/ProjektUebersicht.tsx:85–88` `useAufgeklappt` startet immer eingeklappt (`offen: []`), auch bei nur einem Stammordner. Keine Sortierung (Nummer, zuletzt geändert, Bauherr), kein Projektstatus (Akquise/aktiv/abgeschlossen), kein Filter. In den anderen Apps (`ui/ProjektWahl.tsx`) kein Kontextmenü („Ordner öffnen“, „Im Projektordner-Tool ergänzen/prüfen“) und kein „Neues Projekt“. Nummer/Kurzname werden in Projektordner nach dem Schema der Struktur abgeleitet, in den übrigen Apps nach „bis zum ersten Leerzeichen“ (`ui/projektListe.ts:22` `ausOrdnernameEinfach`, Aufruf `ui/ProjektWahl.tsx:117`, Standardwert in `useProjektordnerListe` Z. 41) – bei abweichendem Schema zeigen die Apps unterschiedliche Kürzel.
**Soll:**
- Bei genau einer Quelle startet die Gruppe aufgeklappt.
- Sortierung (Nummer, zuletzt geändert, Name) und „angeheftet/Favorit“; Status aus der Projektdatei (`meta.status`) als Filter.
- Kontextmenü je Projekt: „Im Explorer öffnen“, „Projekt prüfen“, „Neues Projekt …“ (öffnet Assistent der Projektordner-App bzw. Suite-Tab).
- Ableitung von Nummer/Kurzname überall gleich: Schema aus der Struktur wird in `allgemein` abgelegt und von `ausName` verwendet.
**Vorbild:** untermStrich/PROJEKT PRO/Orca: Projektliste mit Status, Filter „meine Projekte“, sortierbare Spalten; Teams/SharePoint: angeheftete/zuletzt besuchte Bereiche; Nextcloud/Dropbox: Favoriten.
**Test:** `packages/core/src/ui/ProjektUebersicht.test.ts`: eine Quelle → aufgeklappt, mehrere → eingeklappt; Sortierfunktion; Statusfilter; `ProjektWahl.ui.test.ts`: Kontextmenü-Einträge; Test zu `projektListe`: Ableitung mit Schema aus `allgemein` liefert in Projektordner und anderen Apps dasselbe Ergebnis.

### P-10 „Ordner prüfen“ nur einzeln und ohne Bericht  (Aufwand M)
**Problem:** `components/PruefView.tsx`: Jeder Projektordner muss per Dialog gewählt werden (`ordnerWaehlen`, `platform/projektordner.ts:75`); die Projektliste der Startseite steht nicht zur Verfügung. Keine Sammelprüfung, kein Export/Druck, Befunde nicht nach Schwere sortiert (Struktur-Reihenfolge, `pruefung.ts`).
**Soll:**
- Projektliste wie im Assistenten (Klick = prüfen), zusätzlich „Ordner wählen …“.
- „Alle Projekte prüfen“ über alle Stammordner mit Tabelle (Projekt, Zahl Abweichungen, Projektdatei ja/nein, längster Pfad) und Export CSV (PDF optional); Prüfung rein lesend.
- Befunde nach Schwere gruppiert/sortiert (Fehler, Abweichung, Hinweis); Einzelbericht exportierbar.
**Vorbild:** DMS (ELO, d.velop) werten über alle Akten aus („Akten ohne Pflichtregister“); SharePoint-Speicherberichte.
**Test:** `ordner.test.ts`, „Prüfmodus“: Sortierung nach Schwere; Sammelprüfung über mehrere Fake-Projektordner (Zusammenfassungszeile) und CSV-Erzeugung als reine Funktion; `ordner.ui.test.ts`: Klick auf Projekt in der Liste startet Prüfung.

### P-11 Entwurf bleibt nach dem Anlegen stehen  (Aufwand S)
**Problem:** `components/AssistentView.tsx`: Nach erfolgreichem Anlegen/ZIP bleibt der Entwurf (`stamm` im Store), erst „Nächstes Projekt“ (Z. 477–489, `neuesProjekt`) leert ihn. Beim nächsten Start steht „Weiter mit 26-14 …“ für ein schon angelegtes Projekt (Desktop erkennt den vorhandenen Ordner und bietet „ergänzen“ an – nur Code gelesen). Der Ergebniskasten (`ErgebnisAnzeige`, `components/gemeinsam.tsx:173`) nennt im Browser keinen Ordnernamen; „Als ZIP herunterladen“ bleibt aktiv.
**Soll:**
- Nach Erfolg wird der Entwurf automatisch geleert, mit „Rückgängig“ (ca. 10 s) zur Wiederherstellung.
- Abschlussseite mit Ordnername und Knöpfen „Ordner öffnen“, „In Flächenrechner öffnen“, „Nächstes Projekt“; ZIP-Knopf nach Erfolg nicht mehr als Primäraktion.
**Vorbild:** Assistenten in Office/SharePoint („Website erstellen“) enden mit Abschlussseite und setzen das Formular zurück.
**Test:** `ordner.ui.test.ts`, Assistent neu: nach „Anlegen“ ist `useOrdner.getState().stamm` leer, „Rückgängig“ stellt ihn wieder her, Abschlussseite nennt den Ordnernamen.

### P-12 Barrierefreiheit und Tastatur  (Aufwand S)
**Problem:** Schrittleiste (`components/AssistentView.tsx:285`, `ol.po-schritte`) ohne `aria-current`; aktiver Schritt „1 Projekt“ auf der Startseite kontrastarm; Eingaben der Beteiligten-Zeilen (`packages/core/src/ui/Stammdaten.tsx:195–201`) ohne `aria-label` (nur Spaltenkopf); „×“-Knöpfe ohne Beschriftung (`Stammdaten.tsx:205`, `StrukturView.tsx:182`, `VorlagenView.tsx:275`); Enter im Formular führt nicht zum nächsten Schritt; „neu“-Vermerk im Trockenlauf grün auf dunkel sehr blass.
**Soll:**
- `aria-current="step"` am aktiven Schritt.
- `aria-label` je Beteiligten-Feld („Rolle“, „Name“, „Kontakt“ mit Zeilennummer) und je Löschknopf („Beteiligten 2 entfernen“).
- Strg+Enter = „Weiter“ im Assistenten.
- Kontraste (aktiver Schritt, „neu“-Vermerk) nach WCAG AA, in beiden Schemata (zusammen mit PB-01).
**Vorbild:** Gängige Wizard-Muster (WAI-ARIA Authoring Practices).
**Test:** `ordner.ui.test.ts`: `aria-current="step"` genau am aktiven Schritt, Strg+Enter wechselt den Schritt; `Stammdaten.ui.test.ts`: Felder/Knöpfe per `getByLabelText` auffindbar.

### P-13 Uneinheitlicher Einstieg zwischen den Apps  (Aufwand M)  → Querschnitt „einheitlicher Einstieg“
**Problem:** Flächenrechner und GRZ haben „Projekte“ in der Titelleiste (öffnet `ProjektWahl`/`ProjektUebersicht` als Ebene über das ganze Fenster); Projektordner hat stattdessen den Reiter „Projekt“ mit Schrittleiste; GRZ zeigt zusätzlich eine eigene Startkarte „Projekt oder IFC öffnen …“, der Flächenrechner startet direkt im leeren Editor.
**Soll:**
- Einheitlich „Projekte“ in der Titelleiste aller Apps (inkl. Projektordner).
- Beim Start ohne geöffnetes Projekt zeigt jede App die Projektübersicht (`packages/core/src/ui/ProjektWahl.tsx`).
- Umsetzung zentral als gemeinsamer Einstieg (siehe Querschnittspunkt); projektordner-spezifisch bleibt der Assistent „Neues Projekt“.
**Vorbild:** Office-Apps starten mit einheitlicher Startseite („Zuletzt verwendet“/Neu).
**Test:** `packages/core/src/ui/ProjektWahl.ui.test.ts`: Start ohne Projekt zeigt die Übersicht; `ordner.ui.test.ts`: „Projekte“ in der Titelleiste vorhanden und öffnet sie.

### P-14 Beteiligte und Bearbeitung ohne Adressbuch  (Aufwand M)
**Problem:** `packages/core/src/ui/Stammdaten.tsx:~190–215`: Rolle frei getippt (nur Platzhalter „z. B. Tragwerk“, Z. 195), Kontakt als ein Freitextfeld, „Bearbeitung“ ohne Erklärung (Kürzel? Name?), keine Übernahme aus früheren Projekten.
**Soll:**
- Rollen-Auswahl (Vorschlagsliste) mit typischen NRW-Beteiligten (Tragwerksplanung, Prüfingenieur/-in, Brandschutz, Vermessung ÖbVI, TGA, Energieberatung/GEG, Bauaufsicht) plus Freitext.
- Vorschläge aus den Beteiligten der Projektdateien im Stammordner (Name/Kontakt automatisch ergänzen).
- „Bearbeitung“ mit Hinweis „Kürzel, z. B. TP“ und Auswahl der Büromitarbeiter aus den Einstellungen.
**Vorbild:** untermStrich, PROJEKT PRO, KOBOLD CONTROL: zentrale Adressdatenbank, Beteiligte werden zugeordnet und stehen in Serienbriefen zur Verfügung.
**Test:** `packages/core/src/ui/Stammdaten.ui.test.ts`: Rollen-Auswahl bietet Vorschläge und akzeptiert Freitext; Vorschläge aus gelieferter Beteiligten-Liste; Hinweistext bei „Bearbeitung“.

### P-15 Kein Abschluss/Archiv  (Aufwand L)
**Problem:** Doku „Grenzen“: kein Projektabschluss/Archiv. Abgeschlossene Projekte bleiben in der Liste (`packages/core/src/ui/ProjektUebersicht.tsx`), und der Nummernvorschlag (P-03, `nummer.ts` `naechsteNummer`) übersieht verschobene Projekte.
**Soll:**
- „Projekt abschließen“: setzt Status „abgeschlossen“ in der Projektdatei (`meta.status`, siehe P-09) und blendet das Projekt in der Standardansicht aus (Filter).
- Optional: Verschieben in einen Archiv-Stammordner (als Kopie, nichts wird gelöscht; Bestätigung mit Trockenlauf) und Prüfbericht als PDF in `00 Projekt`.
- Der Nummernvorschlag berücksichtigt Archiv-Stammordner (hängt an P-03: alle `allgemein.projekte`).
**Vorbild:** DMS und Büro-Software kennen „abgeschlossen“ mit Aufbewahrungsfrist; SharePoint/Teams „Team archivieren“ (schreibgeschützt).
**Test:** `ordner.test.ts`: Status-Setzen schreibt nur den Abschnitt in der Projektdatei (Fake-Dateisystem), Nummernvorschlag zählt Archivordner mit; `ProjektUebersicht.test.ts`: abgeschlossene Projekte standardmäßig ausgeblendet, per Filter sichtbar.
