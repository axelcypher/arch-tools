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
- [x] **B-07** Abschnitt ohne Kennzeichnung, obwohl alle Felder entfallen – FO 0.23.0 (mit R-01, davon abhängig):
  „entfällt“, wenn die Abschnittsbedingung sicher nicht zutrifft oder alle zählenden Angaben entfallen (dreiwertig: nie
  wegen eines fehlenden Merkmals); hängt es an fehlenden Merkmalen, gelb „n offen“ bzw. „offen“ mit „hängt ab von: …“;
  Abschnitte ohne zählende Angaben „freiwillig“. Abweichung: mit Block B statt im Patch-Release, weil es R-01 voraussetzt
- [x] **B-08** Verlauf passt in der Web-Version nicht zum Dateistand – FO 0.21.1: Abgleich beim Öffnen
  (`abgleichen` in `verlauf.ts`), nicht passende Schritte unter „Frühere Sitzung – nicht in dieser Datei“ (nur
  Ansicht); Meldung „heruntergeladen als … – bitte die neue Datei weiterverwenden“
- [x] **R-01 / U-01** Fehlendes Projektmerkmal darf Pflichtfelder nicht entfallen lassen – FO 0.23.0: dreiwertige
  Auswertung (`auswerten`: ja/nein/offen, Kleene-Logik) in `bedingung.ts`, `erfuellt` fail-safe; offene Felder zählen
  wie erforderliche, gelb am Feld und in der Gliederung („n offen (hängt von Merkmalen ab)“), Hinweis „Offen – hängt
  ab von: … (nicht festgelegt)“ statt „Entfällt“ (`offenGruende`); Projektumfang nie „nicht erforderlich“ bei fehlendem
  Merkmal; Bedingungs-Editor zeigt „offen“; Fallmatrix in `vorgaben.test.ts`
- [x] **R-03** nw010005: Erklärung zum Brandschutz – FO 0.23.0: Nr. 6 bei „ja“ oder GK 1/2 (Merkmal oder Kästchen),
  Grund und Quellen wie vorgegeben; der Plausibilitätshinweis „Sonderbau“ folgt mit U-04
- [x] **R-04** nw010002: Betriebsbeschreibung – FO 0.23.0: Bedingung vom Abschnitt auf die Felder (Nr. 8 bei
  Nichtwohngebäude, Nr. 9 bei Sonderbau), 2024D ohne Sonderbau
- [x] **R-06** nw010002 Nr. 11: Sonderbau GK 4/5 – FO 0.23.0: 11.1 bei GK 1–3 ohne Sonderbau, Gruppe nur ohne
  Sonderbau, Hinweis auf § 9 BauPrüfVO an Nr. 9
- [x] **R-07** Nr. 4 Amtliche Basiskarte – FO 0.23.0: nur nach §§ 34/35 BauGB (nw010001, nw010002, 2024D einheitlich),
  Grund „nach Anforderung der Bauaufsichtsbehörde, üblich im Außenbereich“; Titel Nr. 3 mit Hinweis auf den amtlichen
  Lageplan (Quelle § 2 Abs. 2 Satz 3 BauPrüfVO an der Bedingung)
- [x] **R-08** nw010001: Barrierefrei-Konzept – FO 0.23.0: zählt, erforderlich bei Vorhaben „Errichtung“
- [x] **R-10** Anzeigen (Fassung 2018): § 68 – FO 0.23.0: Schall/Wärme nur Wohngebäude GK 1/2 (§ 68 Abs. 4 Satz 2),
  Standsicherheit § 68 Abs. 3 Satz 5 Nr. 2, Brandschutz-Grund mit Abs. 2 Satz 2, 3, 5. Die Bedingung beim Brandschutz
  bleibt (Mittel- und Großgaragen kennt die App nicht als Merkmal; im Grund genannt)
- [x] **R-25** Merkmal „Planungsrecht“: einfacher Bebauungsplan – FO 0.23.0: neue Werte „einfacher Bebauungsplan“,
  „Satzung nach BauGB“; Erklärungen je Wert (`MERKMAL_ERKLAERUNG`, im Projektumfang angezeigt); auch nw010004
  (Flurkarte bei Nutzungsänderung) zählt den einfachen Bebauungsplan mit
- [x] **U-02** Projektmerkmale direkt im Formular festlegen – FO 0.24.0: Segmentknöpfe je fehlendem Merkmal im
  Hinweiskasten der Gliederung und im Fenster des Info-Symbols am offenen Feld, mit Kurzerklärung und Fundstelle
  (`MERKMAL_ERKLAERUNG`); Desktop in die Projektdatei, Web je Datei im lokalen Speicher (löst B-03 mit)
- [x] **U-03** Prüfliste „Was fehlt noch?“ – FO 0.24.0: Filter „Offene“ (ersetzt „Leere“) als Liste je offener
  Angabe mit den Eingaben darin, ungeklärte gelb; „n offen · n ungeklärt“ im Kopf der Gliederung; „Nächste offene
  Angabe“ (Knopf, F8); Suche blendet Seiten ohne Treffer aus und zeigt die Trefferzahl. Hinweise (U-04/U-05) seit
  FO 0.25.0 in Kopf und Liste („· n Hinweise“). Abweichung: Hinweise auf veraltete Vordrucke gibt es in der App nicht (nichts aufzunehmen)
- [x] **U-04** Plausibilität: widersprüchliche Kreuze – FO 0.25.0: Regel „genau eine“ (`REGELN`), Widerspruch bei
  Antragsart (auch 2024D und nw010006, gleiche Gruppe) und ja/nein in nw010005, dort Optionsfelder in der
  Felderansicht; Gebäudeklasse nur als Hinweis (Prüfregel `mehrfach`), Gebäudekategorie ohne Regel; Meldungen am
  Abschnitt (⚠), in der Prüfliste und am Feld, nie blockierend; Plausibilitätshinweis Sonderbau bei nw010005 (R-03)
- [x] **U-05** Formularangaben und Projektmerkmale abgleichen – FO 0.25.0: Gebäudeklasse aus dem Merkmal vorbelegt
  (nur leere Gruppe, nie überschreiben, ein Verlaufsschritt, gestrichelt gekennzeichnet), Abweichung „Projekt: GK 3,
  Formular: GK 1“ in Prüfliste und am Feld, beim Ankreuzen Rückfrage „… als Projektmerkmal übernehmen?“; Verfahren
  und Antragsart bewusst nicht verknüpft. Abweichung: die Bedingungen lesen das Kästchen nicht zusätzlich (wo nicht
  schon vorhanden, z. B. R-03) – stattdessen der Hinweis bei Abweichung (im Handoff als Alternative genannt)
- [x] **U-06** Info-Symbole – FO 0.25.0: 11 px statt 13 px, Trefferfläche über Polster, auf dem Papier geringe
  Deckkraft; rechts am Rahmen bzw. oben rechts im Textfeld; gleicher Grund im Abschnitt → ein Symbol (ganzer
  Abschnitt: oben rechts am Rahmen); im Tab-Ablauf, F1 im Feld fokussiert das Symbol und zeigt den Hinweis, Enter
  öffnet den Gesetzestext, Esc zurück; nie im Druck

## Flächenrechner

Block 1 (Fehler F-01 bis F-09): FR 0.18.1; wegen des Projektformats (neue Geschossfelder) bzw. des IFC-Ladens auch
GRZ 0.10.1, KO 0.10.1, PO 0.6.1, EZ 0.5.1, FO 0.21.2 (nur Patch, Bundles geändert).

- [x] **F-01** Doppelte Raumnummern – FR 0.18.1: neue Nummer = höchste vorhandene + 1 (`core/geschosse.ts`), Präfix je
  Geschoss (`Storey.nummernPraefix`, Vorgabe aus dem Namen KG → -1, EG → 0, 1. OG → 1, sonst aus der Lage zum
  nächsten benannten Geschoss), Warnung bei doppelten Nummern (Geschoss- und Raumeigenschaften), „Räume neu
  nummerieren“ (Liste/Uhrzeigersinn) nur auf Befehl mit Rückfrage; IFC-Räume behalten ihre Nummer. Abweichung: Die
  Warnung steht zunächst in den Eigenschaften; die Prüfliste folgt mit F-10.
- [x] **F-02 / FR-15** Kopieren und Duplizieren behalten Nummern und Wohnung – FR 0.18.1: Rückfrage beim Einfügen von
  Räumen in ein anderes Geschoss und beim Duplizieren (Nummern anpassen ja/nein, Wohnung beibehalten / vorhandene /
  neue); Duplikat heißt nach seiner Lage („1. OG“ statt „EG (Kopie)“). „Automatisch nach Raumname“ setzt keine
  Wohnung = Geschoss mehr. IFC-Import: Wohnung „eine für alle Geschosse“ (Vorgabe „WE 01“) / „je Geschoss“ (mit
  Hinweis im Bericht) / „aus Zonenkategorie“ (`IfcSpace.ObjectType`, neu in `ifcData`).
- [x] **F-03** Neues Geschoss: Name, Lage, Geschossart – FR 0.18.1: „+ Neu“ fragt „über/unter dem aktiven Geschoss“,
  Name nach Lage (KG, EG, 1. OG …), Höhe vom Bezugsgeschoss, darunter mit ausdrücklicher Kote. Geschossart
  Keller/Normal/Dach (`Storey.keller` neu, optional; ohne Angabe aus dem Namen); `woflArt` nimmt das Geschoss und
  richtet die Keller-Regel nach der Geschossart.
- [x] **F-04** Radiobuttons im IFC-Dialog – FR 0.18.1: Knopf links, Text daneben, linksbündig (wie die Checkboxen).
- [x] **F-05** Einstellleiste von „Erkennen“ verdeckt die Ansichtsleiste – FR 0.18.1: Werkzeugoptionen in eigener Zeile
  unter den Ansichtsoptionen, Meldungen darunter (rechts) – Punktfang/Hilfslinien bleiben frei.
- [x] **F-06** Layout- und Textfehler in den Eigenschaften – FR 0.18.1: Checkbox „Abzugsfläche“ in normaler Größe mit
  umbrechendem Text und Beispielen je Art (FR-04), R/S-Auswahl „R – Regelfall“ / „S – Sonderfall“ mit Erläuterung
  nach DIN 277 als Hinweis, Maßzahlen weiter von der Kante (nicht auf den Griffen), Einträge des Nachschlagewerks
  umbrechen.
- [x] **F-07** Technische Fehlermeldung beim Öffnen – FR 0.16.0 (mit Q-6): Meldung mit Dateiname und Grund, eigener
  Dialog statt `alert`
- [x] **F-08** Harmlose Meldungen als roter Fehlerzähler – FR 0.18.1: `platform/harmlos.ts` stuft die Rückfall-Meldungen
  von web-ifc beim Laden des WebAssembly-Moduls als Hinweis (Info) ein; echte Warnungen/Fehler zählen weiter.
- [x] **F-09** Beschriftungen im PDF doppelt – FR 0.18.1: je Beschriftung ein `<text>` (Test), im Druck ohne Kontur
  (Chrome schreibt Kontur und Füllung sonst als zwei Texte ins PDF), weißer Seitenhintergrund.
Block 2 (normative Korrekturen): FR 0.20.0; Projektformat und gemeinsamer Rechenkern geändert, daher auch GRZ 0.11.1,
KO 0.11.1, PO 0.8.1, EZ 0.5.3, FO 0.23.1 (Patch). Neue optionale Felder (abwärtskompatibel, Rundlauf-Test): Raum
`rsVonHand`, `abzugArt`, `nutzungsart`, `katalog`, `stempel`, `wofl.anteile` (Kategorie „hoehen“); Umriss
`sohleAnsetzen`, `pruefen`, `stempel`; Geschoss `dachaufbau`, `fussbodenaufbau`; Dach `modellAbweichung`;
Einstellungen `massgrundlage`, `zweiteBV` (die für spätere Punkte schon jetzt, damit nicht jede Stufe alle Apps
mitbumpt).

- [x] **FR-02** Raumumschließung R/S der Räume – FR 0.20.0: Räume übernehmen R/S vom BGF-Umriss, in dem sie liegen
  (`raumUmschliessung` in `calc.ts`), Auswahl „wie der BGF-Umriss“ oder von Hand (bleibt; ein gespeichertes „S“ gilt
  als von Hand); IFC-Import setzt Freisitze auf S; Auswertung warnt getrennt NRF (R) > BGF (R) und NRF (S) > BGF (S).
  Abweichung: „R-Raum außerhalb aller R-Umrisse“ folgt mit der Prüfliste (F-10).
- [x] **FR-03** Abzugsflächen: WoFlV und DIN 277 getrennt – FR 0.20.0: Abzugsflächen ohne eigene Anrechnung erben
  Kategorie und Wohnung des Raums (`effektiveWofl`), Abzugsart „NRF und Wohnfläche“ / „nur Wohnfläche (§ 3 Abs. 3
  WoFlV)“ / „nur NRF“; Hinweistexte im Bericht und in den Eigenschaften mit Schwellen und Nischenregel.
- [x] **FR-04** Beispiele für BGF-Abzugsflächen – FR 0.18.1 (mit F-06): Umriss „z. B. Innenhof, Luftraum über
  Galerie“, Raum „z. B. Schornstein, Pfeiler, Schacht im Raum“; „Treppenloch“ entfernt, Kommentar in `model.ts`.
- [x] **FR-05** Putzabzug, Normausgabe, Maßgrundlage – FR 0.20.0: Raumliste im Bericht mit „Fläche roh“ und
  „Putzabzug“ (nur wenn ein Raum einen hat), Fußnote mit Maßgrundlage und Normausgaben (WoFlV vom 25.11.2003,
  DIN 277:2021-08), Projektfeld „Maßgrundlage“ (Planmaß Rohbau/Fertigmaß/Aufmaß), Excel `projekt.massgrundlage`,
  `projekt.massgrundlage_text`, `projekt.normen`. Abweichung: Eingabe in den Projekt-Einstellungen der Seitenleiste
  (der frühere Projektdialog ist mit Q-4 im gemeinsamen Stammdaten-Dialog aufgegangen); Rechenweg je Raum mit F-13,
  Kopf mit F-17.
- [x] **FR-06** Nutzungsgruppen-Vorschlag beim IFC-Import – FR 0.20.0: Abstell/Keller/Garage/Carport/Fahrrad/Müll und
  HWR/Hauswirtschaft → NUF 7, Galerie → NUF 1, Lager/Archiv → NUF 4.
- [x] **FR-07** WoFlV-Automatik nach Raum- und Geschossnamen – FR 0.20.0: Nutzungsgruppe entscheidet nicht mehr (HWR
  zählt), nur Treppenhaus/Treppenraum entfällt, Raum mit Treppe zählt mit Hinweis auf die Abzugsfläche „nur
  Wohnfläche“ (`woflHinweis`), Keller-Regel nach Geschossart (F-03), betroffene Räume einzeln im Importbericht;
  Bericht: „WoFlV-Einstufung nach Raumnamen vorgeschlagen, vom Verfasser geprüft“.
- [x] **FR-08** 100 %-Anrechnung unter Dachschrägen (Hinweis) – FR 0.20.0: Hinweis in den Eigenschaften bei „voll“ im
  Dachgeschoss (keine Sperre); Anrechnung „Raumteile nach lichter Höhe“ mit Teilflächen in m². Prüfliste mit F-10,
  Berechnung aus dem Dach mit F-12.
- [x] **FR-09** Bericht mit R/S-Trennung bei BRI, NRF, KGF – FR 0.22.0 (mit F-17): Tabelle „Grundflächen und
  Rauminhalte“ mit BGF/BRI/NRF/KGF je R | S | gesamt, S-Spalten nur bei Sonderfall; CSV und Excel-Standardlayout
  ebenso, Platzhalter `kgf_r`/`kgf_s` neu (`nrf_r`/`nrf_s` gab es schon).
- [x] **FR-10** BRI von S-Umrissen – FR 0.20.0: Körperhöhe bei S als Pflichtangabe markiert (Unterkante Überdeckung
  bzw. Oberkante Umwehrung) mit Warnung, solange sie fehlt; Bodenplatte unter S-Umrissen nur mit Haken
  `sohleAnsetzen`. BRI S getrennt im Bericht mit FR-09/F-17.
- [x] **FR-11** „unbeheizbarer“ Wintergarten – FR 0.20.0: Bezeichnung „unbeheizbarer Wintergarten, Schwimmbad u. ä.
  (50 %)“, Hilfetext „beheizbare Wintergärten: lichte Höhe ≥ 2 m (100 %) wählen“, Berichtstext.
- [ ] **FR-12** Teilflächen statt gemischtem Faktor
- [x] **FR-13** Veraltete bzw. vermischte Begriffe – FR 0.20.0: Muster-Vorlage „Wohnfläche nach WoFlV“, „Flächen ohne
  Wohnflächenanrechnung“, „Brutto-Grundfläche“ (Zeilen „Brutto-/Netto-Wohnflächen“ mit 3-%-Abzug unverändert);
  Filter `hnf`/`nnf` bleiben als Altnamen, Doku „NUF 1–6 / NUF 7 (früher HNF/NNF nach DIN 277-2:2005)“; R = „allseitig
  in voller Höhe umschlossen“ (mit F-06).
- [x] **FR-14** Bezugsebene der Geschosshöhe – FR 0.20.0: einheitlich „Fußboden in derselben Bezugsebene wie die
  Geschosskoten (i. d. R. OK Fertigfußboden)“, Bodenplatte „UK Sohle bis Fußboden-Bezugsebene“ (Eigenschaften,
  Nachschlagewerk, Modellkommentar, README).
- [x] **FR-16** „Abzug aus IFC-Nettofläche“ – FR 0.20.0: neutrale Bezeichnung in Bemerkung und Importbericht, Werte mehr
  als 0,5 Prozentpunkte neben 3 % einzeln im Bericht.
- [x] **FR-17** Spitzboden ohne BGF: Hinweis – FR 0.20.0: „Geschoss X ohne BGF übernommen – falls begehbar und nutzbar
  (z. B. Spitzboden), BGF-Umriss ergänzen“; die Erkennung bleibt.
- [x] **FR-18** Abweichung der Dachform im Rechenweg – FR 0.20.0: `Dach.modellAbweichung` (IFC-Import und Dach-Editor),
  Fußnote `BriKoerper.bemerkung`, im Bericht unter dem BRI-Rechenweg und in Excel `koerper.bemerkung`.
- [x] **FR-19** Normausgabe in Bauvorlage und Gebühr – Regel „BRI in Bauvorlage und Gebühr (NRW)“ im
  Nachschlagewerk seit FR 0.20.0; Berichtskopf, DIN-277-Tabelle und Excel nennen „BRI nach DIN 277:2021-08 (entspricht
  für den BRI DIN 277-1:2016-01, § 6 BauPrüfVO NRW)“ – FR 0.22.0.
- [x] **FR-20** Angaben für die Hochbaustatistik – FR 0.22.0: Abschnitt „Angaben für die Hochbaustatistik“ (Wohnfläche
  und Räume je Wohnung, sonstige Nutzfläche = NUF ohne Wohnflächenräume, BRI), Excel `statistik.*` und
  `wohnung.raeume_statistik`. Abweichung: Die Zählregel (Räume = NUF 1 ab 6 m² inkl. Küche, ohne Freisitze) ist
  nicht am aktuellen Erhebungsbogen von IT.NRW geprüft (nicht verfügbar) – der Bericht weist darauf hin.
- [x] **FR-21** Bestand nach II. BV – FR 0.20.0: Projektschalter „Altberechnung nach II. BV (nur Vergleich)“ mit
  deutlichem Hinweis in Seitenleiste und Bericht; Wirkung nur auf den Standardfaktor für Freisitze (½); Standard
  bleibt WoFlV, Schalter aus = unverändert (Test).
Block 3 (Verbesserungen F-10, F-11, F-13, F-14): FR 0.21.0; Rechenkern (Nutzungsgruppe aus der Nutzungsart) auch
KO 0.11.2 (Patch).

- [x] **F-10** Plausibilitätsprüfung – FR 0.21.0: reine Funktion `core/pruefung.ts` (R-/S-Raum außerhalb bzw. über den
  Umriss hinaus, NRF > BGF je R/S, Umrisse bzw. Räume überlappen – Abzugsflächen ausgenommen –, Bereiche ohne Raum
  erst ab 0,6 m Breite und 1 m², doppelte Nummern, Raum ohne Wohnung, „keine Wohnfläche“ im Wohngeschoss, „voll“ im
  Dachgeschoss (FR-08), S-Umriss ohne Körperhöhe (FR-10), Raum ohne Katalogeintrag bei eigenem Katalog, zum Prüfen
  markierte Umrisse), alles als Warnung/Hinweis; Ampel „Prüfen“ in der Auswertung, Klick wählt die Fläche; „Auf
  Umriss beschneiden“ in den Raumeigenschaften. Damit auch der Prüflisten-Teil von F-01, FR-02 und FR-08.
- [x] **F-11** Raumkatalog und Vorgaben für neue Räume – FR 0.21.0: Bezeichnung mit Vorschlagsliste, Katalogname setzt
  Nutzungsgruppe/Nutzungsart und WoFlV-Anrechnung („aus Katalog“, Kennzeichen entfällt bei Änderung von Hand);
  Katalog des Büros `raumkatalog.json` im Konfigurationsordner, sonst Vorgabe mit getrennten Einträgen
  Abstellraum in/außerhalb der Wohnung, HWR/Waschküche, Treppenraum, Flur (VF, keine) und Flur in der Wohnung;
  neue Räume übernehmen Nutzung und Anrechnung vom zuletzt angelegten Raum des Geschosses (im leeren Wohngeschoss
  „voll“); Wohnung als Auswahl der vorhandenen, Schreibvarianten werden vereinheitlicht. Keine Sperre für 100 % im
  Dachgeschoss (nur Hinweis in der Prüfliste).
- [ ] **F-12** Dachschrägen nach WoFlV gliedern
- [x] **F-13** Rechenweg je Raum – FR 0.21.0: `core/raumRechenweg.ts` (Rechtecke L × B bzw. Dreiecke aus
  `flaechenZerlegung.ts`, sonst Gauß’sche Formel; Putzabzug, Abzugsflächen als Minuszeilen, Anrechnung bzw.
  Raumteile nach Höhe), Summe = Ergebnis der Auswertung (Test); Bericht mit Schalter „Rechenweg je Raum“, Excel-Blatt
  „Rechenweg Räume“ mit Formeln. Abweichung: statt aufklappbarer Spalte eine zuschaltbare Zeile je Raum (druckbar).
- [x] **F-14** Nutzungsarten als zweite Ebene – FR 0.21.0: Feld „Nutzungsart“ je Raum (Liste des Büros
  `nutzungsarten.json`, Vorgabe nur 1.1, 7.1, 7.3, 7.4, 9.1 mit kurzen Bezeichnungen – keine Normtabelle), Gruppe
  folgt der ersten Ziffer (`raumNutzung`), Auswertung weiter je Gruppe; ohne Nutzungsart wie bisher (Test).
- [ ] **F-15** BGF-Umriss aus dem Plan erkennen
- [ ] **F-16** Kalibrieren mit Fang und Kontrollmaß
- [x] **F-17** Bericht für die Bauvorlage – FR 0.22.0: Vorlagen „Vollständige Flächenaufstellung“, „Bauantrag NRW
  (BRI + WoFl)“ (DIN 277 mit R/S und BRI-Rechenweg nicht abwählbar), „Abschnitte frei wählen“, gemerkt in
  `settings.bericht`; Kopf aus den Stammdaten (gemeinsamer `DruckKopf`: Bauvorhaben, Adresse, Grundstück, Bauherr,
  Büro/Bearbeitung) mit Normausgaben und Maßgrundlage (FR-05, FR-19), „Seite x von y“ (seit Q-4), Unterschriftszeilen
  „Ort, Datum“, „Aufgestellt“, „Entwurfsverfasserin / Entwurfsverfasser (§ 54 BauO NRW 2018)“; leere Abschnitte
  (S-Spalten, Wohnflächen) entfallen, fehlender BRI als Warnung; keine erzwungenen Seitenumbrüche je Geschoss mehr
  (Überschriften bleiben bei ihrem Inhalt). Logik in `core/bericht.ts` (Tests), Render-Test `Report.test.ts`.
  Prüfung „Adresse/Bauherr fehlt“: Der Kopf druckt beides, sobald es in den Stammdaten steht (Q-4) – die Beobachtung
  stammte aus Projekten ohne erfasste Stammdaten. Abweichung: Die Fundstelle der Unterschriftsbezeichnung (§ 54 BauO
  NRW 2018) ist sinngemäß gewählt und sollte vom Büro bestätigt werden.
- [ ] **F-18** Neues Geschoss mit Bezug zum darunterliegenden
- [ ] **F-19** Messen erweitern
- [ ] **F-20** Beschriftungen überlagern sich
- [ ] **F-21** Raumliste sortiert, Tabellenansicht
- [ ] F-22 bis F-24 (optional, nur Liste)

## GRZ-Nachweis

- [x] **G-01** Wiederhergestellter Zwischenstand gilt als gespeichert – GRZ 0.10.1: `wiederherstellen()` vergleicht die Inhalte
  (`gleich`), ohne Datei gilt ein nicht leeres Projekt als ungespeichert; Zeitstempel im IndexedDB-Eintrag, Leiste
  „Ungespeicherter Stand vom … wiederhergestellt – Speichern / Verwerfen“ (Verwerfen mit Rückfrage)
- [x] **G-02** Gerundete Kennzahl widerspricht der Ampel – GRZ 0.10.1: `kennzahlText` (mind. 3 Stellen, unter 0,005 Abstand 4,
  bei Bedarf mehr), Begründung in m² (`flaechenVergleich`) in Kachel, Druck und Excel (`*.vergleich`); Excel mit
  denselben Stellen
- [x] **G-03** Grundfläche ohne Grundstücksfläche – GRZ 0.10.1: `Kennzahl.flaeche` direkt aus der Rechnung, ohne
  Grundstücksfläche Kennzahl „–“ und Status „Grundstücksfläche fehlt“; Hinweis nennt das Feld in den Festsetzungen
- [x] **G-04** Druck: Spalte „angerechnet“ – GRZ 0.10.1: Spalten „eindeutig“ und „angerechnet auf GR II/GR“ (je Fläche aus
  dem Rechenkern, Spanne bei „prüfen“), Kellergeschoss als eigene Zeile, Summen GR I/GR II = Kacheln (die Kennzahlen
  rechnen jetzt selbst mit der Summe der disjunkten Anteile)
- [x] **G-05** Excel: Summe zählt Überlagerungen doppelt – GRZ 0.10.1: Spalten „eindeutig“ und „angerechnet“ mit Summen,
  GRZ/GFZ, zulässige Fläche und Ergebnis als Formeln, offene Spanne als eigene Zeile. Abweichung: Die Ergebnis-Formel
  nutzt nur IF und Vergleiche (vom Formelrechner in core für die Vorschau unterstützt)
- [x] **G-06** Farbschema-Wechsel wirkt erst nach Neustart – GRZ 0.8.0 (mit Q-1)
- [x] **G-07** Zahlenfelder verwerfen oder kappen Eingaben ohne Meldung – GRZ 0.9.0 (mit Q-3)
- [x] **G-08** Druck-Lageplan: Nummern, Maßstab, Nordpfeil – GRZ 0.10.1: Nummern mind. 10 pt (Maßstab aus Breite und Höhe der
  Druckfläche), Punkt im größten eindeutigen Teilstück (`beschriftung.ts`), Maßstabsleiste, Nordpfeil
  (Planoberkante = Projektnorden; der IFC-Import legt −y nach Norden). Maße an Kanten folgen mit G-20
- [x] **G-09** Bedienhinweise und Doppelungen im amtlichen Nachweis – GRZ 0.10.1: `Hinweis` mit Art „sachlich“/„bedienung“
  und `tipp` (nur App); Druck/Excel nur sachliche, Recht-Hinweise nicht doppelt; keine doppelte Klammer; Datum
  TT.MM.JJJJ; Haftungssatz im Druck per Schalter (aus), im Excel-Standardlayout entfernt; „Stand“ im Druckdialog
  eintragbar (leer = ohne); ab GRZ 0.12.0 im Projekt gespeichert (`massNutzung.stand`) und im Excel (`stand.text`)
- [x] **G-11** Esc schließt Druck, Excel und Projektübersicht – GRZ 0.8.0 (mit Q-2)
- [x] **G-12** Lageplan im Dunkelmodus weiß – GRZ 0.8.0 (mit Q-1): `.grz-skizze` mit `--canvas-filter`
- [x] **G-13** Zeichenpunkte um die Rahmenbreite versetzt – GRZ 0.10.1: `innenflaeche()` (ohne Rahmen/Innenabstand) für
  Zeichnen, Ziehen, Fang, Zoom und Pan; `weltpunkt` exportiert und getestet (Zoom 1, 0,2, 5)
- [x] **G-14** Technische Fehlermeldung bei defekter Projektdatei – GRZ 0.8.0 (mit Q-6); gilt für Öffnen,
  IFC-Übernahme und Speichern
- [x] **G-15** Rückfrage als `window.confirm` – GRZ 0.8.0 (mit Q-2)
- [x] **G-20** Prüffähiger Rechenweg – GRZ 0.11.0: neu `core/flaechenZerlegung.ts` (Rechtecke entlang der Flächenachse,
  auch mit Löchern; sonst Dreiecke; Summe = Fläche exakt; sonst „Fläche aus Koordinaten“), `apps/grz/src/rechenweg.ts`
  (Formelzeilen GRZ = GR / FGst, GR II = GR I + § 19 Abs. 4, GF; Teilflächen des eindeutigen Anteils je Fläche); App
  („Rechenweg“ unter den Kacheln, Teilflächen der gewählten Fläche), Druck (Schalter, standardmäßig an; Teilflächen
  gestrichelt mit Nummer und Maßen im Lageplan), Excel (Sammlungen `formel`, `teil`, Fläche als Formel L × B × Faktor).
  Abweichung: Maße stehen als Beschriftung je Teilfläche („1.2: 3,00 × 5,00“) statt als Maßketten an den Kanten
- [x] **G-21** Genaue Eingabe beim Zeichnen – GRZ 0.11.0: Eingabe unter der Plan-Leiste (Polygon: Länge/Winkel gegen die
  Gebäudeachse, leer = Mausrichtung; Rechteck: Breite × Tiefe), Ziffer springt ins Feld, Tab/Enter; laufende Anzeige
  von Segment und Fläche (Leiste und am Zeiger); neu `core/kantenFang.ts` (Kantenmitte, Lot, Punkt auf der Kante) mit
  Symbol; Kantenlängen der gewählten Fläche bearbeitbar (Rechteck bleibt Rechteck). Abweichung: Eingabefelder in der
  Leiste statt schwebend am Zeiger; Test für den Fang in `kantenFang.test.ts` statt `fang.test.ts`
- [x] **G-22** Unterlage und echte Grundstücksgrenze – GRZ 0.13.0: Unterlage Bild/PDF (erste Seite, pdf.js wie im
  Flächenrechner) in `lageplan.unterlage`, ein-/ausblendbar, Deckkraft; Kalibrieren an zwei Punkten und Ausrichten
  (neu `core/kalibrierung.ts`); Werkzeug „Grenze“ → `lageplan.grenze`, Grundstückslinie = Grenze, sonst als „Umriss
  der erfassten Flächen“ beschriftet; Abgleich mit der eingetragenen Fläche (Katasterangabe maßgebend). Abweichung:
  DXF als Unterlage zurückgestellt – der DXF-Import liegt im Flächenrechner (`apps/flaechenrechner/src/core/dxf.ts`)
  und müsste dafür nach core wandern, während dort parallel gearbeitet wird; ALKIS (optionale Stufe) nicht umgesetzt;
  die Grenze wird gelöscht und neu gezeichnet statt Punkt für Punkt bearbeitet; Unterlage ohne Drehen
- [x] **G-23** Nutzung direkt beim Zeichnen – GRZ 0.11.0: Leiste „Neue Fläche“ mit allen Nutzungen, Versiegelung passend
  vorbelegt, Name je Nutzung („Zufahrt 1“), kein „sonstige“ mehr als Vorgabe; Auswahlbereich mit Nutzung,
  Versiegelung und Nachbar
- [x] **G-24** Beschriftung und Orientierung im Plan – GRZ 0.13.0: „Nr · Nutzung · m²“ im eindeutigen Anteil
  (Schalter „Beschriftung“), Maßstabsleiste, Nordpfeil, Raster (Schalter); Kürzel in der Übersicht „?“, Hilfezeile
  mit höchstens drei Kürzeln
- [x] **G-25** Stammdaten und Bebauungsplan-Kopf – GRZ 0.12.0: Abschnitt „Projekt und Bebauungsplan“ mit `StammdatenKnopf`,
  B-Plan Nr./Name direkt eintragbar (in `meta.bebauungsplan`, kein Doppelmodell), Baugebiet `massNutzung.gebietsart`;
  Druck (Grundlagen: Bebauungsplan, Baugebiet) und Excel (`bplan.angabe`, `gebietsart.*`, `stand.*`). Abweichung:
  B-Plan Nr./Name liegen wie mit Q-4 entschieden in den gemeinsamen Stammdaten, nicht in `MassNutzung`. core-Modell
  und -Speicherung erweitert (auch für G-26/G-22) – dadurch auch FR 0.21.1, KO 0.11.2, PO 0.9.1, EZ 0.5.4, FO 0.24.1 (Patch, gleiche Speicherung)
- [x] **G-26** Fachliche Lücken bei Festsetzungen und Einstufung – GRZ 0.12.0: Einstufung „GRZ I“ (`'grz1'`) für offene
  Fälle 1990, Vorgabe bei „zählt“ bleibt GRZ II; Gebäudeumrisse als Garage/Carport/Nebenanlage (`OutlineShape.anlage`,
  zählen als Anlage, nicht als Hauptanlage); Baugebiet mit § 19 Abs. 5 BauNVO 1962; GR/GF absolut, BMZ (Baumasse
  vereinfacht), Vollgeschosse mindestens/zwingend („unterschritten“), Trauf-/Firsthöhe als Prüfhinweis; Schalter
  § 20 Abs. 3 S. 2 (1990); Keller „im Lichten“ ab BauO NW 1970 (Plandatum ab 27.01.1970 oder ohne Datum); Feld
  „Decken-/Dachaufbau [m]“. Staffelgeschoss-Regel unverändert. Abweichung: gekennzeichnete Gebäudeteile bleiben in
  Vollgeschossprüfung und Geschossfläche (nur die Grundfläche ändert sich)
- [x] **G-27** Leerzustand und Einstieg – GRZ 0.13.0: ohne Gebäude und Flächen nur `ProjektEinstieg` (Text nennt „mit
  leerem Lageplan beginnen“); „Neu“ in der Werkzeugleiste mit Rückfrage; gesperrte Knöpfe mit Grund im Tooltip;
  Hinweis „Grundstücksfläche fehlt“ mit „zum Feld“. Abweichung: Die Aktion heißt wie in allen Apps „Neues Projekt“
  (Q-5)
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
- [x] **P-01** Bürostruktur ohne Rückfrage und Rückweg ersetzbar – PO 0.6.0: „Standard“, „Struktur laden …“ und
  „Sicherungen … → Wiederherstellen“ fragen mit Vorschau („4 Ordner entfallen, 3 neu, 2 Schemata ändern sich“) und
  „Ersetzen / Abbrechen“; vorher Sicherung `projektordner.json.bak-JJJJ-MM-TT-hhmm` (die letzten zehn); „Rückgängig“
  nach dem Ersetzen und nach „Ordnerliste übernehmen“. Abweichung: Die Sicherungen stehen gemeinsam in
  `projektordner-sicherungen.json` statt in einzelnen Dateien – das Begrenzen auf zehn Dateien bräuchte einen neuen
  Rust-Befehl zum Löschen; so wird keine Datei gelöscht. Optionales „Bearbeiten“-Freischalten nicht umgesetzt.
- [x] **P-02** Letzter Schreiber gewinnt – PO 0.6.0: `konfigSchreibenWennUnveraendert` in `platform/konfig.ts` (neu, nur
  vom Projektordner genutzt) vergleicht vor dem Schreiben den frisch gelesenen Inhalt mit dem Stand beim letzten Lesen
  bzw. Schreiben; bei Abweichung Meldung mit „Neu laden“ / „Meine Fassung trotzdem speichern“. Frisch gelesen beim
  Wechsel in Einstellungen/Vorlagen; Schreiben entprellt (400 ms). Abweichung: Vergleich über den Inhalt statt
  Änderungszeit (ohne Rust); zwischen Lesen und Schreiben bleibt ein sehr kurzes Zeitfenster.
- [x] **P-03** Projektnummer: Prüfung, Vorschlag aus allen Stammordnern – PO 0.7.0: `nummerPasst` (Schema
  `{jahr} {jj} {nr[:n]}`), Hinweis am Feld „Passt nicht zum Schema … – erwartet z. B. 2026-015“ (blockiert nicht;
  core: Prop `nummerPruefen` in `StammdatenFelder`); Vorschlag über die Ordner aller `allgemein.projekte`, beim neuen
  Projekt vorausgefüllt. Abweichung: die optionale Reservierungsdatei `nummern.json` ist nicht umgesetzt.
- [x] **P-04** Ordnerliste als Baum – PO 0.8.0: Baumansicht (Standard) mit Umbenennen, Löschen (mit Unterordnern nach
  Rückfrage), Anlegen, ↑ ↓ verschieben, → einrücken, ← ausrücken, je Ordner LPh 1–9 und „Schema“; Textansicht bleibt als
  „Text (Experte)“; beide bearbeiten `OrdnerRegel[]` (reine Funktionen in `baum.ts`, Rundlauf Text ↔ Baum verlustfrei).
  Abweichung: Umsortieren über Knöpfe statt Ziehen; das optionale „Struktur aus Musterordner übernehmen“ ist nicht
  umgesetzt.
- [x] **P-05** Vorlagen-Zuordnungen außerhalb der Struktur – PO 0.8.0: `presetPruefen` mit den Regeln des Prüfmodus
  (`ausserhalbDerStruktur`, gemeinsam mit `pruefe`), Zusammenfassung „N Ordner liegen außerhalb der Struktur“ / „N Dateien
  liegen lose im Projektstamm“ mit aufklappbarer Liste; Standard-Presets mit dem ganzen Vorlagenordner werden nicht
  vorausgewählt, wenn mehr als die Hälfte der Vorlagen außerhalb der Struktur landete (Hinweis unter „Vorlagen“ und im
  Assistenten); `LIESMICH.txt` zählt nicht; „… und N weitere“ aufklappbar. Abweichung: „wie die Struktur aufgebaut“ als
  Mehrheit der Vorlagen gefasst, damit ein einzelner Zusatzordner das Preset nicht abschaltet.
- [ ] **P-06** Uneinheitliche Platzhalter
- [x] **P-07** Leistungsphasen-Auswahl – PO 0.7.0 (core `StammdatenFelder`, damit in allen Apps; mit P-03, P-08, P-12,
  P-14 auch FR 0.19.0, GRZ 0.11.0, KO 0.11.0, FO 0.22.0, dazu EZ 0.5.2 und SU 0.4.1 nur Patch, Bundles geändert): Namen sichtbar
  („4 Genehmigungsplanung“), Schnellwahl „1–4 bis Bauantrag“, „5–8“, „1–9 alle“, „keine“; im Trockenlauf beim
  Ergänzen ohne LPh Hinweis mit Sprung „Leistungsphasen wählen“; „Alle neuen Einträge abwählen“ / „Alle wieder wählen“
- [x] **P-08** Validierung im Stammdaten-Formular – PO 0.7.0: im Assistenten Kurzname Pflicht (Stern), keine gelben
  Kästen beim Öffnen, Meldungen am Feld nach Verlassen bzw. nach „Weiter“, „Weiter“ nennt sichtbar, was fehlt; der
  abgeleitete Fehler „kein Name“ entfällt; Ordnername direkt unter Nummer/Kurzname (core: Prop `ordnerName`); PLZ,
  E-Mail und Zeichen im Kurznamen über die gemeinsame Prüfung (Q-3)
- [ ] **P-09** Projektübersicht (alle Apps)
- [x] **P-10** „Ordner prüfen“ für alle Projekte, mit Bericht – PO 0.9.0: Projektliste aller Stammordner mit Suche
  (Klick prüft) und „Anderen Ordner wählen …“; „Alle Projekte prüfen“ (`allePruefen`, nur lesend) mit Übersicht
  (Abweichungen, davon Fehler, Projektdatei, längster Pfad) und CSV; Befunde nach Schwere gruppiert, Einzelbericht als
  CSV (`berichtCsv`). Abweichung: kein PDF (optional).
- [x] **P-11** Entwurf bleibt nach dem Anlegen stehen – PO 0.9.0: nach Erfolg Abschlussseite mit Ordnername, „Ordner
  öffnen“ und „Nächstes Projekt“ (Hauptaktion), Entwurf geleert mit „Rückgängig“ (10 s); kein ZIP-Knopf mehr nach dem
  Herunterladen; bei Fehlern einzelner Schritte bleibt der Entwurf. Abweichung: „In Flächenrechner öffnen“ fehlt – es
  gibt keinen Weg, eine andere App mit einem Projekt zu starten (bräuchte Rahmen-App bzw. Rust); stattdessen der Hinweis,
  dass das Projekt in allen Apps unter „Zuletzt geöffnet“ steht.
- [x] **P-12** Barrierefreiheit und Tastatur – PO 0.7.0: `aria-current="step"`, Strg+Enter = „Weiter“, `aria-label` je
  Beteiligten-Feld („Rolle 2“) und Löschknopf („Beteiligten 2 entfernen“, core), aktiver Schritt nicht mehr grau
  (auch auf der Startseite), Text in `--text` und fett; „neu“-Vermerk fett in `--ok-text`. Die übrigen „×“-Knöpfe
  (Stammordner, Zuordnungen) haben bereits eine Beschriftung über `title`.
- [x] **P-13** Uneinheitlicher Einstieg – PO 0.5.0 (mit Q-5)
- [x] **P-14** Beteiligte und Bearbeitung ohne Adressbuch – PO 0.7.0: Rollen-Vorschläge (`ROLLEN`, NRW-typisch) plus
  Freitext, Namen-Vorschläge aus den Projektdateien der Stammordner (`beteiligteSammeln`, die 60 zuletzt geänderten
  Projekte) mit Ergänzen von Rolle/Kontakt, „Bearbeitung“ mit Hinweis „Kürzel, z. B. TP“ und Vorschlägen aus
  `allgemein.mitarbeiter` (neu, Einstellungen „Mitarbeiter (Kürzel)“). Die Vorschläge nutzt der Projektordner; in den
  anderen Apps bietet der Dialog die Rollen-Vorschläge.
- [ ] **P-15** Kein Abschluss/Archiv
