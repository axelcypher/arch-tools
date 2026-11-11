# Umsetzung des Usability- und Rechts-Reviews – Checkliste

Grundlage: [review-umsetzung-handoff.md](review-umsetzung-handoff.md) (6 Querschnittspunkte, 108 App-Punkte).
Je Punkt: erledigt in Version (App) bzw. Abweichung mit Grund. Kürzel der Apps: FR = Flächenrechner, GRZ =
GRZ-Nachweis, KO = Kostenermittlung, PO = Projektordner, EZ = Entzerrung, FO = Formulare, SU = Rahmen-App.

Querschnittspunkte in `packages/core` betreffen alle Apps; deren Versionen stehen beim Punkt.

## Phase 0 – Querschnitt (`packages/core`)

Block 1 (Q-1, Q-2, Q-6): FR 0.16.0, GRZ 0.8.0, KO 0.8.0, PO 0.3.0, EZ 0.3.0, FO 0.19.0, SU 0.2.0.

- [x] **Q-1** Farbschema sofort, Dunkelmodus vollständig – Block 1. Abo in `platform/theme.ts` (wendet jede Änderung
  sofort an, übernimmt Wechsel aus anderen Fenstern/Tabs über das `storage`-Ereignis); die Kopie im Flächenrechner
  entfällt; `main.tsx` ruft nur noch `themeAnwenden()`. Statusfarben `--ok-*`, `--fehler-*`, `--chip-bg`,
  `--on-accent` in `base.css`. Option „Zeichenfläche abdunkeln“ per `TitleBar`-Prop `zeichenflaeche` (aus in
  Formulare und Projektordner). Erledigt damit auch B-04, B-05 (FO), G-06, G-12 (GRZ), PB-01, PB-02 (PO).
- [x] **Q-2** Dialoge einheitlich – Block 1. `ui/Dialog.tsx` (`useEscSchliessen`, `Modal`), Esc-Stapel in
  `ui/dialoge.ts` (verschachtelt nur der oberste; Esc im Eingabefeld verwirft nur die Eingabe), `ui/Rueckfrage.tsx`
  (`aenderungenSpeichern` mit Speichern / Nicht speichern / Abbrechen, `bestaetigen` z. B. „Entfernen / Abbrechen“,
  `frageText`, `meldung`), angezeigt von der Titelleiste. Alle `window.confirm` und `alert` ersetzt; die Rahmen-App
  lässt beim Schließen eines Tabs über eine Nachricht im Tab speichern (`speichernImTab`). Erledigt damit auch
  G-11, G-15 (GRZ).
- [x] **Q-3** Einheitliche Eingabeprüfung – Block 2 (FR 0.17.0, GRZ 0.9.0, KO 0.9.0, PO 0.4.0, EZ 0.4.0, FO 0.20.0,
  SU 0.3.0). `parseNum` liest deutsche Schreibweise mit Einheit; `NumberField` kappt nicht mehr, sondern meldet am Feld
  (nach dem Verlassen), `TextField` mit `pruefen`/`pflicht`/`live`, Prüfregeln in `ui/pruefen.ts` (Pflicht, PLZ,
  E-Mail je Eintrag, Zeichen im Ordnernamen), Pflichtfeld-Stern in `Field`. Eingesetzt in allen Zahlenfeldern (GRZ,
  Flächenrechner, Kosten, Entzerrung, Projektordner) und im Stammdaten-Formular (Projektnummer Pflicht; der
  Stammdaten-Dialog zeigt die Meldungen nach Klick auf „Anlegen“ statt eines grauen Knopfs). Erledigt damit G-07 (GRZ).
  Abweichung: Die Datums- und Zahlenfelder der Formulare sind Felder der FORMA-Vordrucke (formularspezifisch) und
  bleiben unverändert; die Assistent-Teile von P-08 (Projektordner) folgen in Phase 3.
- [x] **Q-4** Stammdaten einmal erfassen, überall gleich ausgeben – Block 3 (FR 0.18.0, GRZ 0.10.0, KO 0.10.0, PO 0.5.0,
  EZ 0.5.0, FO 0.21.0, SU 0.4.0). Quelle bleibt die Projektdatei (`meta`); neu `meta.bebauungsplan` (Nr., Name) mit
  Roundtrip. `StammdatenKnopf` + `StammdatenDialog` (mit Projektbezeichnung, ohne Pflicht-Projektnummer) in
  Flächenrechner (ersetzt den eigenen Projektdaten-Dialog), GRZ und Kosten; Formulare und Projektordner nutzen die
  Komponente schon. Gemeinsamer Kopf `ui/DruckKopf.tsx` (`kopfZeilen`, `DruckKopf`) in den Ausdrucken von
  Flächenrechner, GRZ und Kosten; Excel-Platzhalter `kopf.angaben`, `bplan.*`, `buero`, `projekt.vorhaben`, Datum
  TT.MM.JJJJ; „Seite x von y“ im Druck über `@page`. Büroname neu in `allgemein.json` (Projektordner → Einstellungen).
  Abweichung: Die Entzerrung hat keine Projektdatei mit Stammdaten (eigenes `.entz`-Format) – dort kein Stammdaten-Dialog.
  B-Plan Nr./Name stehen in den gemeinsamen Stammdaten (nicht in `MassNutzung`, wie G-25 es vorschlägt), damit alle
  Apps sie ausgeben; Gebietsart folgt mit G-25/G-26.
- [x] **Q-5** Einheitlicher Einstieg – Block 3. `ProjektEinstieg` (gleiche Aktionen in gleicher Reihenfolge: Projekt
  wählen …, Datei öffnen …, Neues Projekt) in der Projektwahl (Browser und ohne Stammordner), im Leerzustand von GRZ,
  Kosten und Formulare (Web); der Flächenrechner zeigt im Browser ohne Projekt die Projektwahl wie auf dem Desktop.
  „Projekte“ in der Titelleiste jetzt auch im Projektordner (führt zur Startseite; der Reiter heißt „Assistent“) und in
  Formulare (Desktop). Erledigt damit P-13 (PO).
- [x] **Q-6** Fehlermeldungen beim Öffnen verständlich – Block 1. `platform/dateiFehler.ts` (`DateiLesenFehler`,
  `oeffnenFehlerText`), Meldung `oeffnenFehlgeschlagen` mit aufklappbaren Einzelheiten; `ProjectFormatError` trennt
  Nutzertext und Technik („Keine gültige Projektdatei (.oap) – beschädigt oder aus einer anderen Anwendung.“).
  Erledigt damit auch F-07 (FR), G-14 (GRZ), B-06 (FO), PB-04 (PO).

## Formulare

- [x] **B-01** Schließen des Gesetzestext-Fensters stürzt ab – FO 0.21.1: Effekt mit Block-Körper (auch die übrigen
  Pfeil-Effekte in `App.tsx`); Test mit Promise-liefernder `scrollIntoView` für Reiterwechsel, Knopf, Esc, Klick daneben
- [x] **B-02** Drucken liefert eine leere Seite – FO 0.21.1: spezifischere Druckregeln in `styles.css` heben die
  core-Regel für `.fo-main` auf (core unverändert); A4 hoch, ein Blatt je Seite, ohne Info-Symbole,
  Entfall-/Offen-Kennzeichnung, Autofill-/Textmarker-Farben und Feldhinterlegung; `druck.test.ts`
- [x] **B-03** Web-Version: „Festlegen …“ führt in eine Sackgasse – FO 0.21.1: ohne Projekt kein Sprung in die
  Projektkarte (`setHaupt`/`umfangZeigen` prüfen es), Knopf ausgeblendet; die Auswahl am Formular folgt mit U-02
- [x] **B-04** Farbschema wechselt erst nach Neuladen – FO 0.19.0 (mit Q-1)
- [x] **B-05** Gesetzestext im Dunkelmodus unlesbar – FO 0.19.0 (mit Q-1): Kasten mit `--panel`/`--text`, Markierung
  über Hintergrund und Rand
- [x] **B-06** Fehlgeschlagenes Öffnen schließt das geöffnete Formular – FO 0.19.0 (mit Q-6): erst lesen und prüfen,
  dann schließen; gilt für „Formular öffnen …“ und den Projekteintrag
- [ ] **B-07** Abschnitt ohne Kennzeichnung, obwohl alle Felder entfallen
- [x] **B-08** Verlauf passt in der Web-Version nicht zum Dateistand – FO 0.21.1: Abgleich beim Öffnen
  (`abgleichen` in `verlauf.ts`), nicht passende Schritte unter „Frühere Sitzung – nicht in dieser Datei“ (nur
  Ansicht); Meldung „heruntergeladen als … – bitte die neue Datei weiterverwenden“
- [ ] **R-01 / U-01** Fehlendes Projektmerkmal darf Pflichtfelder nicht entfallen lassen
- [ ] **R-03** nw010005: Erklärung zum Brandschutz
- [ ] **R-04** nw010002: Betriebsbeschreibung
- [ ] **R-06** nw010002 Nr. 11: Sonderbau GK 4/5
- [ ] **R-07** Nr. 4 Amtliche Basiskarte
- [ ] **R-08** nw010001: Barrierefrei-Konzept
- [ ] **R-10** Anzeigen (Fassung 2018): § 68
- [ ] **R-25** Merkmal „Planungsrecht“: einfacher Bebauungsplan
- [ ] **U-02** Projektmerkmale direkt im Formular festlegen
- [ ] **U-03** Prüfliste „Was fehlt noch?“
- [ ] **U-04** Plausibilität: widersprüchliche Kreuze
- [ ] **U-05** Formularangaben und Projektmerkmale abgleichen
- [ ] **U-06** Info-Symbole

## Flächenrechner

- [ ] **F-01** Doppelte Raumnummern
- [ ] **F-02 / FR-15** Kopieren und Duplizieren behalten Nummern und Wohnung
- [ ] **F-03** Neues Geschoss: Name, Lage, Geschossart
- [ ] **F-04** Radiobuttons im IFC-Dialog
- [ ] **F-05** Einstellleiste von „Erkennen“ verdeckt die Ansichtsleiste
- [ ] **F-06** Layout- und Textfehler in den Eigenschaften
- [x] **F-07** Technische Fehlermeldung beim Öffnen – FR 0.16.0 (mit Q-6): Meldung mit Dateiname und Grund, eigener
  Dialog statt `alert`
- [ ] **F-08** Harmlose Meldungen als roter Fehlerzähler
- [ ] **F-09** Beschriftungen im PDF doppelt
- [ ] **FR-02** Raumumschließung R/S der Räume
- [ ] **FR-03** Abzugsflächen: WoFlV und DIN 277 getrennt
- [ ] **FR-04** Beispiele für BGF-Abzugsflächen
- [ ] **FR-05** Putzabzug, Normausgabe, Maßgrundlage
- [ ] **FR-06** Nutzungsgruppen-Vorschlag beim IFC-Import
- [ ] **FR-07** WoFlV-Automatik nach Raum- und Geschossnamen
- [ ] **FR-08** 100 %-Anrechnung unter Dachschrägen (Hinweis)
- [ ] **FR-09** Bericht mit R/S-Trennung bei BRI, NRF, KGF
- [ ] **FR-10** BRI von S-Umrissen
- [ ] **FR-11** „unbeheizbarer“ Wintergarten
- [ ] **FR-12** Teilflächen statt gemischtem Faktor
- [ ] **FR-13** Veraltete bzw. vermischte Begriffe
- [ ] **FR-14** Bezugsebene der Geschosshöhe
- [ ] **FR-16** „Abzug aus IFC-Nettofläche“
- [ ] **FR-17** Spitzboden ohne BGF: Hinweis
- [ ] **FR-18** Abweichung der Dachform im Rechenweg
- [ ] **FR-19** Normausgabe in Bauvorlage und Gebühr
- [ ] **FR-20** Angaben für die Hochbaustatistik
- [ ] **FR-21** Bestand nach II. BV
- [ ] **F-10** Plausibilitätsprüfung
- [ ] **F-11** Raumkatalog und Vorgaben für neue Räume
- [ ] **F-12** Dachschrägen nach WoFlV gliedern
- [ ] **F-13** Rechenweg je Raum
- [ ] **F-14** Nutzungsarten als zweite Ebene
- [ ] **F-15** BGF-Umriss aus dem Plan erkennen
- [ ] **F-16** Kalibrieren mit Fang und Kontrollmaß
- [ ] **F-17** Bericht für die Bauvorlage
- [ ] **F-18** Neues Geschoss mit Bezug zum darunterliegenden
- [ ] **F-19** Messen erweitern
- [ ] **F-20** Beschriftungen überlagern sich
- [ ] **F-21** Raumliste sortiert, Tabellenansicht
- [ ] F-22 bis F-24 (optional, nur Liste)

## GRZ-Nachweis

- [ ] **G-01** Wiederhergestellter Zwischenstand gilt als gespeichert
- [ ] **G-02** Gerundete Kennzahl widerspricht der Ampel
- [ ] **G-03** Grundfläche ohne Grundstücksfläche
- [ ] **G-04** Druck: Spalte „angerechnet“
- [ ] **G-05** Excel: Summe zählt Überlagerungen doppelt
- [x] **G-06** Farbschema-Wechsel wirkt erst nach Neustart – GRZ 0.8.0 (mit Q-1)
- [x] **G-07** Zahlenfelder verwerfen oder kappen Eingaben ohne Meldung – GRZ 0.9.0 (mit Q-3)
- [ ] **G-08** Druck-Lageplan: Nummern, Maßstab, Nordpfeil
- [ ] **G-09** Bedienhinweise und Doppelungen im amtlichen Nachweis
- [x] **G-11** Esc schließt Druck, Excel und Projektübersicht – GRZ 0.8.0 (mit Q-2)
- [x] **G-12** Lageplan im Dunkelmodus weiß – GRZ 0.8.0 (mit Q-1): `.grz-skizze` mit `--canvas-filter`
- [ ] **G-13** Zeichenpunkte um die Rahmenbreite versetzt
- [x] **G-14** Technische Fehlermeldung bei defekter Projektdatei – GRZ 0.8.0 (mit Q-6); gilt für Öffnen,
  IFC-Übernahme und Speichern
- [x] **G-15** Rückfrage als `window.confirm` – GRZ 0.8.0 (mit Q-2)
- [ ] **G-20** Prüffähiger Rechenweg
- [ ] **G-21** Genaue Eingabe beim Zeichnen
- [ ] **G-22** Unterlage und echte Grundstücksgrenze
- [ ] **G-23** Nutzung direkt beim Zeichnen
- [ ] **G-24** Beschriftung und Orientierung im Plan
- [ ] **G-25** Stammdaten und Bebauungsplan-Kopf
- [ ] **G-26** Fachliche Lücken bei Festsetzungen und Einstufung
- [ ] **G-27** Leerzustand und Einstieg
- [ ] **G-28** Layout der Nachweis-Spalte
- [ ] **G-29** Regeln: Begründung der Anrechnung je Nutzung
- [ ] **G-30** IFC-Bericht zuschneiden
- [ ] **G-31** 3D-Ansicht: überlagerte Flächen
- [ ] **G-32** Rückgängig mit Beschriftung, Varianten

## Projektordner

- [x] **PB-01** Helle Kästen im Dunkelmodus – PO 0.3.0 (mit Q-1): nur noch Variablen aus `base.css`
- [x] **PB-02** Farbschema wechselt erst nach Neustart – PO 0.3.0 (mit Q-1); „Zeichenfläche abdunkeln“ ausgeblendet
- [x] **PB-03** Ungültige/doppelte Zeilen der Ordnerliste verschwinden still – PO 0.5.1: `ordnerAusTextMitMeldungen`
  meldet je Zeile doppelte Pfade, LPh außerhalb 1–9, entfernte Zeichen, unbekannte Zusätze; Meldungen unter dem Feld,
  mit Meldungen kein Übernehmen beim Verlassen (nur über den Knopf); `ordnerAusText` bleibt kompatibel
- [x] **PB-04** Beschädigte alte `projekt.json` wird nicht gemeldet – PO 0.3.0 (mit Q-6): Befund „Alte projekt.json
  nicht lesbar“ (Hinweis), Hinweis beim Ergänzen
- [x] **PB-05** Texte passen nicht zur Lage – PO 0.5.1: „1 Datei“/„2 Dateien“; Satz zur Projektdatei je Lage (neu
  angelegt / auf dem Desktop gezielt ergänzt / im Browser keiner); Kurzname-Hinweis beim Ergänzen „Der Ordner wird
  nicht umbenannt.“ (über `kurznameHinweis`); im Browser „Ausgabe: ZIP-Datei zum Herunterladen“ statt Stammordner
- [ ] **P-01** Bürostruktur ohne Rückfrage und Rückweg ersetzbar
- [ ] **P-02** Letzter Schreiber gewinnt
- [ ] **P-03** Projektnummer: Prüfung, Vorschlag aus allen Stammordnern
- [ ] **P-04** Ordnerliste als Baum
- [ ] **P-05** Vorlagen-Zuordnungen außerhalb der Struktur
- [ ] **P-06** Uneinheitliche Platzhalter
- [ ] **P-07** Leistungsphasen-Auswahl
- [ ] **P-08** Validierung im Stammdaten-Formular
- [ ] **P-09** Projektübersicht (alle Apps)
- [ ] **P-10** „Ordner prüfen“ für alle Projekte, mit Bericht
- [ ] **P-11** Entwurf bleibt nach dem Anlegen stehen
- [ ] **P-12** Barrierefreiheit und Tastatur
- [x] **P-13** Uneinheitlicher Einstieg – PO 0.5.0 (mit Q-5)
- [ ] **P-14** Beteiligte und Bearbeitung ohne Adressbuch
- [ ] **P-15** Kein Abschluss/Archiv
