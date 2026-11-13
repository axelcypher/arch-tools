# Formulare

Die App **Formulare** (`apps/formulare`, eigene App mit eigenem Installer) füllt Bauantragsformulare aus
**SJ FORMA** (SJ Software GmbH, Aachen; Teil von SJ OFFICE) aus – mit einer aufgeräumten Oberfläche statt der
Formularmasken des Originals.

Grundsatz: **Das Originalprogramm muss jede Datei weiter lesen können**, denn im Büro arbeiten alle anderen
weiter mit FORMA. Geändert wird nur der Inhalt von Feldern und Projektkarten-Einträgen, nie das Layout, und alles
Unveränderte bleibt Byte für Byte erhalten. Was sich nicht verlustfrei zurückschreiben lässt, wird nur angezeigt.

## Bedienung

- **Aufbau der Oberfläche:** Links die **Navigation** (Projekt, Projektdaten | Antragsdaten, Formulare und – durch
  eine Linie getrennt – Projektordner) auf eigenem, dunklerem Grund wie die Titelleiste; der gewählte Eintrag ist hell
  hinterlegt und links markiert. Der **Kopf der Navigation steht fest** (rollt nicht mit): Projekt, Antrag und darunter
  ein Knopf in zwei Hälften – **Projektdaten** (die Projektkarte – gilt für das ganze Projekt; aus ihr werden die
  Formulare ausgefüllt) und **Antragsdaten** (nur für den aktiven Antrag: Status, Antragsmerkmale, Antragsumfang –
  siehe unten); darunter rollt der Rest ab „Formulare“. Aufbau: Dokument › Antrag › Projekt.
- **Zuletzt bearbeitet:** Rechts an jedem Formular der Navigation und an jeder Datei im Projektordner (Ordner und
  Ansicht „Antrag“) steht kurz, wann zuletzt geändert wurde („heute 14:30“, „gestern 09:05“, „03.03.“) – beim Formular
  auch nicht gespeicherte Eingaben; der volle Zeitpunkt steht im Tooltip (`zeit.ts`). In einer schmalen Navigation
  (unter 260 px – schmaler als die Vorgabe von 300 px) entfällt die Angabe, damit die Namen lesbar bleiben – der
  Tooltip zeigt sie weiter.
- **Menüs** (Kontextmenü, Knöpfe mit ▾ bzw. +) lassen sich mit der Tastatur bedienen: ↑/↓ wandern, Enter bzw. →
  öffnet ein Untermenü (der Fokus geht hinein), ← bzw. Esc führt zurück zum Punkt darüber, Esc oder Tab im Hauptmenü
  schließt. Nach Esc, Tab oder einer Auswahl steht der Fokus wieder auf dem Knopf bzw. Eintrag, der das Menü geöffnet
  hat; Menüknöpfe melden „aufgeklappt“ (`aria-expanded`). Ein gesperrter Punkt nennt rechts den Grund; sein Untermenü
  klappt nicht auf.
- **Dialoge** nutzen den gemeinsamen Rahmen (`Modal` aus `packages/core/src/ui/Dialog.tsx`): Esc und ein Klick daneben
  schließen (nicht während einer laufenden Aktion), der Fokus springt beim Öffnen hinein, bleibt mit Tab im Dialog
  und kehrt danach an die Stelle davor zurück. Das gilt auch für die Schnellwahl (<kbd>Strg</kbd>+<kbd>K</kbd>; der
  Fokus bleibt im Suchfeld, ↑/↓ markieren einen Treffer, der im Bild bleibt) und die Vorschau der Antragsunterlagen
  (Startfokus auf „Schließen“).
- **Begriffe:** Die Ansicht der Projektkarte heißt in der Oberfläche durchgehend **„Projektdaten“** (Navigation, Titel,
  „Projektdaten speichern“, Suche, Dialoge); „Projektkarte“ erscheint nur noch erklärend in Tooltips. **„ungeklärt“**
  heißt: hängt an einem noch nicht festgelegten Antragsmerkmal; **„offen“** steht nur für fehlende Pflichtangaben.
  Dateibefehle heißen überall „Mit Programm öffnen“ und „Im Explorer öffnen“ (Symbol Ordner).
- **Farben:** Statusfarben kommen immer aus dem Designsystem (`--ok-*`, `--fehler-*`, `--warn-*` in
  `packages/core/src/ui/base.css`), Schrift auf Akzentfarbe aus `--on-accent`; eigene Farben der App – Lila für
  Bedingungen (`--bed-*`), Dateitypen (`--typ-*`) – stehen oben in `styles.css` mit Wert für das dunkle Schema. Status
  der Antragsdokumente: roter Ring = fehlt, rot = unvollständig, gelb = noch nicht (aktuell) im Antragsordner, grün =
  aktuell.
- **Kleinste Fensterbreite (1000 px):** Navigation, Gliederung, Verlauf und das Einrichten-Panel schrumpfen bei
  knapper Breite bis auf ihre Mindestbreite (220/180/220/280 px), das Papier behält mindestens 320 px. Die Projektdaten
  ordnen ihr Raster nach dem Platz neben den Leisten (Containerabfrage): schmal 6 statt 12 Spalten, die Anschrift-Vorschau
  rückt nach oben.
- **Ohne Produktnamen:** Die Oberfläche nennt kein anderes Programm. Die App liest und schreibt das Dateiformat der
  Formularprojekte (siehe „Dateiformat“) und soll künftig auch ganz ohne das Originalprogramm auskommen.
- **Seitenleisten** behalten ihre Breite, auch wenn eine Ansicht einen Rollbalken braucht (Platz dafür ist immer
  frei); die Navigation, die Gliederung des Formulars und die Leiste der Projektdaten lassen sich am rechten Rand in der
  Breite ziehen – auch mit der Tastatur (Griff fokussieren, ←/→) – gemerkt je Leiste, Doppelklick: Vorgabe. Rollbalken in den Farben des Schemas (alle Apps).
  Rechts der **Inhalt**. Was zum Dokument gehört – Gliederung, Verlauf, Formularfläche –, steht im Grau der
  Formularfläche.
- **Gemeinsame Einstellungen:** Die Stammordner der Projektordner und der Ort neuer Projektdateien gelten für alle
  Apps (`allgemein.json` im gemeinsamen Konfigurationsordner, siehe `packages/core/src/platform/konfig.ts`); Formulare
  übernimmt beim ersten Start seine bisherigen Werte dorthin, wenn dort noch keine stehen.
- **Einstellungen (⚙)** als Modal über der aktuellen Ansicht (die bleibt, wie sie ist; Fertig, × oder Esc schließt)
  mit Ebenen: **Ordner** (Formularprojekte, Projektordner, angezeigte Pfade), **Büro & Stammdaten**, **Adressbuch**,
  **Formulare**, **Antrag & Export** und **Projektdatei (.oap)** (siehe unten).
- **Projektübersicht:** Ohne gewähltes Projekt (und über „Wechseln“ oben links) zeigt der Inhalt alle Projekte
  über die volle Fensterhöhe – vorne **Zuletzt geöffnet** (die letzten acht), darunter je **Quelle** (Ordner mit
  FORMA-Projekten) eine Gruppe, beim Start eingeklappt. Jede Karte zeigt Kürzel, Titel, Anzahl der Formulare,
  letzte Änderung bzw. wann zuletzt geöffnet, Marken für geöffnete Formulare (🔒), ungespeicherte Eingaben und
  einen fehlenden Projektordner sowie den **Antragsstatus**: Farbpunkt (schlimmster Status, wie in der
  Navigation), Balken je Status und „3/7 aktuell · BAUA 2“. Der Status stammt vom letzten Öffnen des Projekts
  in dieser App („noch nicht geprüft“, solange es nicht offen war). Die Suche (Kürzel oder Titel) klappt die
  passenden Quellen auf, Enter öffnet den ersten Treffer. Rechtsklick: Ordner zeigen, Pfad kopieren, aus
  „Zuletzt geöffnet“ entfernen. Von überall sucht <kbd>Strg</kbd>+<kbd>K</kbd> (Schnellwahl) direkt.
- **Formulare:** die Formulare des Projekts, ohne die alten Fassungen in `_archiv`. 🔒 heißt: anderswo geöffnet.
  ● heißt: nicht gespeicherte Eingaben.
- **Formular hinzufügen** (＋ über den Formularen): Auswahl aus dem Vorlagenordner (Einstellungen › Antrag &
  Export) und den Formularen der anderen FORMA-Projekte – je Formular (Name ohne Nummer und Jahr) eins: aus dem
  Vorlagenordner, sonst der neueste Stand. Angelegt wird eine Kopie mit geleerten Eingaben (schreibgeschützte
  Textfelder bleiben), mit der nächsten laufenden Nummer; sie wird geöffnet und auf Wunsch in den Antragsumfang
  aufgenommen. Leere Felder, die FORMA der Projektkarte zuordnet, werden dabei gleich befüllt (siehe Autofill).
- **Ansicht „Formular“:** die Seiten wie auf Papier – weiße A4-Blätter mit Rand, das Formular mittig, in den
  Schriften und an den Stellen aus der Datei (Textfelder in Courier New wie in FORMA), mit Zoom (Seitenbreite
  oder 75–200 %). Die Felder sind farbig hinterlegt; gedruckt wird ohne Hinterlegung.
- **Ansicht „Felder“:** dieselben Felder im Aufbau des Formulars – nebeneinanderliegende Abschnitte auch hier
  nebeneinander, Felder einer Zeile in einer Zeile –, groß und durchsuchbar, Filter „Offene“ und „Geänderte“. Beim
  Suchen fallen Seiten ohne Treffer weg, daneben steht die Trefferzahl.
- **Prüfliste „Was fehlt noch?“** (`pruefliste.ts`): Der Filter „Offene“ zeigt genau, was im Füllstand fehlt – je
  Angabe eine Zeile mit den Eingaben darin (Gruppen wie „Gebäudeklasse“ als eine Zeile), ohne entfallene und nicht
  zählende Felder (Behördenfelder), mit den ungeklärten (hängen an nicht festgelegten Antragsmerkmalen). Im Kopf der
  Gliederung steht „4 offen · 2 ungeklärt“ (Klick öffnet die Liste) bzw. „Nach den Vorgaben der App keine offenen
  Angaben“ – nie „vollständig“. „Nächste offene Angabe“ (auch <kbd>F8</kbd>) springt zum ersten Feld der nächsten
  offenen Angabe nach dem Feld mit dem Fokus. Dazu kommen **Hinweise** (gelb, Widersprüche rot; nie blockierend):
  - **Widersprüchliche Kreuze** (`plausibel.ts`): Gruppenregel „genau eine“ (zählt wie „eine genügt“, mehr als ein
    Kreuz ist ein Widerspruch) – in den Vorgaben bei Bauantrag/Antrag auf Vorbescheid und bei „Behandlung als
    Bauantrag: ja/nein“ (I/3); in der Feldansicht sind diese Fälle Optionsfelder. Mehrere Gebäudeklassen ergeben nur
    die Frage „umfasst der Antrag mehrere Gebäude?“, mehrere Gebäudekategorien („alle zutreffenden“) nichts. I/3 mit
    Antragsmerkmal Sonderbau = ja: Hinweis auf § 63 Abs. 1 Satz 2 BauO NRW 2018.
  - **Formular und Antragsmerkmale** (`merkmalAbgleich.ts`, Prüfregeln in `vorgaben/pruefregeln.ts`): Leere Kästchen
    der Gebäudeklasse werden aus dem Merkmal vorbelegt – nur wenn in der Gruppe nichts angekreuzt ist, nie
    überschrieben, als ein Schritt „Aus Antragsmerkmal vorbelegt“ im Verlauf (rückgängig zu machen) und am Kästchen
    gestrichelt als Vorschlag gekennzeichnet. Weicht das Formular ab, steht „Projekt: GK 3, Formular: GK 1“ in der
    Prüfliste und am Feld. Kreuzt man von Hand eine andere Gebäudeklasse an, fragt die App, ob sie als Antragsmerkmal
    übernommen werden soll. Verfahren und Antragsart werden nicht verknüpft.
  Am Abschnitt der Gliederung zeigt ⚠ die Hinweise (Titel beim Zeigen).
- **Gesetzestext-Fenster:** Schließen (Esc, Knopf, Klick daneben) und Reiterwechsel sind gegen den Absturz
  „destroy is not a function“ (Chromium/WebView2 liefert bei `scrollIntoView` ein Promise) abgesichert
  (`gesetz.ui.test.ts`).
- **Gliederung:** eigener Bereich direkt am Formular („Inhalt des Formulars“, im Grau der Formularfläche – getrennt
  von der Navigation links): Seiten und Abschnitte mit Füllstand (z. B. 3/5, ✓ wenn vollständig) und Balken für
  das ganze Formular; ein Klick springt hin. Zeigt man auf einen Eintrag, werden seine Felder im Formular wie mit
  dem Textmarker hervorgehoben. Über den Pfeil rechts klappt ein Abschnitt seine einzelnen Angaben auf (mit ✓ für
  ausgefüllte), auch sie springen und heben hervor. Ein- und ausblenden über „Gliederung“ in der Werkzeugleiste.
  Gezählt wird in Einheiten: jedes Textfeld für sich, Kästchen einer Zeile gemeinsam als eine Auswahl, eigene
  Gruppen als eine Angabe. Abschnitte, die nur aus einer Nummer bestehen („2.“), bekommen den Text daneben dazu
  („2. Bauvorlagen, wenn …“).
- **Vorgaben der App:** Für Formulare kann die App je Formular und Stand eine Vorgabe mitbringen (Titel der Felder
  und Abschnitte, Gruppen, Bedingungen nach BauO NRW / BauPrüfVO; `src/vorgaben/`). Eigene Einstellungen liegen
  darüber und gehen immer vor; gespeichert wird nur, was davon abweicht – alles andere folgt der Vorgabe, auch wenn
  eine spätere Version sie verbessert. Beim Einrichten steht bei jedem Eintrag, ob er aus der Vorgabe stammt;
  „Vorgabe wiederherstellen“ verwirft die eigene Änderung, „Alles auf die Vorgabe zurücksetzen“ alle des Formulars.
  Vorgaben gibt es für alle NRW-Formulare der FORMA-Bibliothek (eine Datei je Formular, `src/vorgaben/nw*.ts`, sie
  trägt sich selbst ein; gemeinsame Bausteine in `antrag.ts`, `vordruck2018.ts`, `sachverstaendige.ts`,
  `pruefbericht.ts`, `verzeichnis.ts`, `statistik.ts`). Jede Datei nennt im Kopf ihre Regeln mit Quelle. Beispiele:

  | Formulare | Was die Vorgabe schaltet |
  |---|---|
  | Bauanträge I/1, I/2 (auch Stand 2024D), I/3 | Unterlagen nur beim Bauantrag; Maß der baulichen Nutzung nur mit Bebauungsplan (auch einfachem) oder Satzung (auch in I/3), Flurkarte und Basiskarte nur nach §§ 34/35 BauGB (auch im einfachen Bebauungsplan und im Bereich einer Innen- oder Außenbereichssatzung), Baubeschreibung nicht beim Einfamilienhaus, eine Kostenangabe – bei einer Änderung und bei „Sonstige bauliche Anlage“ die Herstellungssumme; Betriebsbeschreibung bei jedem Nichtwohngebäude und Wohn- und Geschäftshaus (nicht nur bei Sonderbauten), Nr. 9 bei Sonderbauten und Mittelgaragen; Nr. 11 Brandschutz: Erklärung bei GK 1–3, Bescheinigung bei GK 4/5 und bei einer Garage über 100 bis 1.000 m² (Mittelgarage, auch als Sonderbau – dann genügt die Erklärung nicht), bei anderen Sonderbauten und bei „Sonstige bauliche Anlage“ keins von beiden; in der Fassung 2024D ebenso nach geltendem § 68 (Nr. 11 Schall-/Wärmeschutz und Standsicherheit nicht bei Wohngebäuden der GK 1/2); Art des Gebäudes und Baustatistik nur bei Gebäuden; I/1 Barrierefrei-Konzept bei der Errichtung; Vorbescheid-Teil nur beim Vorbescheid; I/3 „ja“ → Nr. 2 bis 6, „nein“ → Nr. 1, 4, 5, Nr. 6 Erklärung zum Brandschutz bei GK 1/2 immer, bei GK 3 mit „ja“, bei GK 4/5 nicht (Bescheinigung nötig). „Gebäudeart: kein Gebäude“ kreuzt „Sonstige bauliche Anlage“ vor |
  | Baubeschreibung I/7 | Nr. 8 bis 10 nicht im vereinfachten Verfahren; Nr. 11 nur bei Ortssatzung/Denkmalschutz |
  | Anzeigen (Baubeginn, Rohbau, Fertigstellung), I/2.1, I/6 | Nachweise nach § 68 BauO NRW 2018 (Fassung ab 01.09.2026, nicht nach der alten Gliederung des Vordrucks): Schall-/Wärmeschutz und Standsicherheit entfallen nur bei Wohngebäuden der GK 1 und 2 (nicht beim Wohn- und Geschäftshaus), Brandschutz bei GK 4/5 und Sonderbauten; Baugenehmigungsdatum nicht bei Freistellung; Gebäudeeinmessung bei neuen Gebäuden und verändertem Grundriss; Hinweise: Nutzungsänderungsanzeige (I/2.1) seit 01.09.2026 an die Bauaufsichtsbehörde, referenzielles Verfahren (alte I/2.1, Stand 2022) seit 01.01.2024 aufgehoben |
  | Werbeanlage I/4, Teilung I/5, Beseitigung I/6.1, Abweichung I/10 und 2018 | Auswahlen, Detailangaben nur beim angekreuzten Kästchen, Bindungen nur wenn vorhanden |
  | Betriebsbeschreibungen I/8, I/9, Artenschutzprüfung | ja/nein-Fragen als Auswahl, Detailangaben nur bei „ja“ bzw. wenn Werte eingetragen sind |
  | Statistikbögen | Neubau-/Bestandsteile und Wohn-/Nichtwohnangaben nach den Kästchen des Bogens; Ziffernkästchen als eine Angabe; Behördenfelder zählen nicht |
  | Berechnungen, GEG-Anlagen, Rechenblatt | Kopfangaben zählen, Tabellenzeilen („Zeile n: …“) nicht; berechnete Felder nur mit Titel |
  | Sachverständige (Prüfung, Kontrolle, Bescheinigung), Berichte II/2–II/4, Verzeichnisse | Angaben der Sachverständigen zählen; Alternativen als Auswahl; Mängelangaben nur bei „folgende Mängel“; Verzeichniszeilen zählen nicht |

  Überall: richtige Titel für alle Felder, Behördenfelder (Eingangsstempel, Aktenzeichen, Genehmigungsvermerk)
  und Unterschriftsfelder zählen nicht, bei Telefon/Telefax/E-Mail genügt eine Angabe. Bedingungen gibt es nur, wo der
  Vordruck oder BauO NRW/BauPrüfVO sie hergeben – im Zweifel keine. `vorgaben.test.ts` prüft gegen die echten
  Formulare unter `.ref/`, dass jeder Schlüssel existiert und dass jedes Formular dort eine Vorgabe hat.
- **Erforderlich, entfällt, ungeklärt:** Eine Bedingung kann zutreffen (erforderlich), sicher nicht zutreffen (entfällt)
  oder **ungeklärt** sein, weil sie an einem Antragsmerkmal hängt, das noch nicht festgelegt ist. Ein fehlendes Merkmal
  lässt nichts entfallen (Fail-safe, `bedingung.ts`: dreiwertige Auswertung; ein sicheres „nein“ der übrigen Teile
  entscheidet trotzdem). Ungeklärte Angaben zählen im Füllstand wie erforderliche; Gliederung und Kopf zeigen sie
  zusätzlich gelb („2 ungeklärt (hängt von Merkmalen ab)“), ✓ und voller Balken erscheinen erst, wenn nichts mehr fehlt.
  Am Feld sind sie gelb hinterlegt, das Info-Symbol sagt „Ungeklärt – hängt ab von: Gebäudeart (nicht festgelegt)“ /
  „Erforderlich, bis Gebäudeart festgelegt ist.“ Im Antragsumfang bekommen Dokumente mit fehlendem Merkmal den normalen
  Status, nie „nicht erforderlich“. Ein Abschnitt heißt „entfällt“, wenn seine Bedingung sicher nicht zutrifft oder
  alle seine zählenden Angaben entfallen; Abschnitte ganz ohne zählende Angaben heißen „freiwillig“.
- **Warum entfällt ein Feld?** Entfällt ein Feld nach den Bedingungen (oder ist es offen), steht daran ein Info-Symbol
  (in der Formular- und der Feldansicht) – klein (11 px, auf dem Papier mit geringer Deckkraft; die Trefferfläche ist
  größer als das Symbol), rechts am Rahmen bzw. oben rechts im Textfeld, damit es weder Kästchen noch Beschriftung
  verdeckt. Felder eines Abschnitts mit **gleichem Grund** teilen sich ein Symbol (entfällt der ganze Abschnitt, steht
  es oben rechts am Rahmen bzw. am Abschnittstitel der Feldansicht); Felder mit eigenem Grund behalten ihres. Die
  Symbole sind per Tastatur erreichbar: <kbd>F1</kbd> im Feld setzt den Fokus auf sein Symbol und zeigt den Hinweis,
  <kbd>Enter</kbd> öffnet den Gesetzestext, <kbd>Esc</kbd> führt zurück ins Feld. Zeigen nennt den Grund: die Begründung der Vorgabe, die Bedingung in Worten, noch
  nicht festgelegte Antragsmerkmale und die Rechtsgrundlage. Ein Klick öffnet den **Gesetzestext** als Fenster in der
  App – der Paragraf mit dem zitierten Absatz hervorgehoben, darunter „Im Original öffnen“. Die Texte liefert die App
  mit (amtliche Fassungen, lesbar ohne Netz): BauO NRW 2018 (gültig ab 01.09.2026) und BauPrüfVO (gültig ab
  26.11.2024) vollständig von recht.nrw.de, dazu einzelne Paragrafen aus BauGB, BauNVO, BNatSchG und GEIG von
  gesetze-im-internet.de. Neue Fassungen holt `node apps/formulare/scripts/recht-holen.mjs` (URL im Skript anpassen);
  die Daten liegen in `src/recht/daten/`. In Vorgaben trägt eine Bedingung Begründung und Fundstellen
  (`begruendet(bedingung, 'Grund', q('bauo-nrw', '68', 2, 3))`, gemeinsame in `vorgaben/grundlagen.ts`);
  `vorgaben.test.ts` prüft, dass es jede Fundstelle samt Absatz (und Nummer) im Text gibt, und enthält eine
  **Fallmatrix** (Vordruck × Gebäudeklasse × Gebäudeart × Sonderbau × Vorhaben × Planungsrecht, auch „nicht
  festgelegt“ → erforderlich/entfällt/offen) für die Pflichtvorlagen. Eigene Bedingungen zeigen die
  Bedingung in Worten, ohne Gesetzestext.
- **Antragsmerkmale der App:** Gebäudeklasse, Sonderbau, Verfahren, **Gebäudeart** (Einfamilienhaus,
  Zweifamilienhaus, Mehrfamilienhaus, Wohn- und Geschäftshaus – gemischt genutzt, mit Betrieb bzw. öffentlich
  zugänglicher Nutzung –, Nichtwohngebäude, kein Gebäude), **Vorhaben** (Errichtung, Änderung,
  Nutzungsänderung, Beseitigung) und **Planungsrecht** (Bebauungsplan = qualifiziert oder vorhabenbezogen nach § 30
  Abs. 1, 2 BauGB, einfacher Bebauungsplan nach § 30 Abs. 3 BauGB, Innenbereich, Außenbereich, Satzung nach BauGB). Der
  einfache Bebauungsplan zählt für die Bauvorlagen als Bebauungsplan (Maß der baulichen Nutzung) und als Vorhaben nach
  §§ 34/35 (Flurkarte, Basiskarte). Ein gespeichertes „Bebauungsplan“ wird nicht umgedeutet; Antragsumfang und
  Hinweise erklären die Werte (`MERKMAL_ERKLAERUNG` in `bedingung.ts`). Die Vorgaben
  bauen darauf auf; sie bleiben deshalb auch in einer eigenen Merkmalliste (fehlende werden ergänzt, auch fehlende
  Werte) und lassen sich weder umbenennen noch entfernen. Eigene Merkmale und Werte kommen dazu.
- **Felder ohne Rahmen** bilden je Seite einen Abschnitt (Kennung `<Seite>:-`), auch wenn Rahmen dazwischen liegen.
- **Formular einrichten** („Einrichten“ in der Werkzeugleiste), je Formular und Stand – gilt in allen Projekten.
  Das Formular wird zur Fläche zum Auswählen: **Feld anklicken** (mit <kbd>Strg</kbd>/<kbd>Umschalt</kbd> mehrere),
  links zeigt die Gliederung den Aufbau als **Baum** (Abschnitte, Gruppen, Felder – mit Füllstand, Inhalt zum
  Wiedererkennen und Zeichen für Bedingungen; bei knapper Breite mit × im Kopf einklappbar, „Gliederung“ in der
  Werkzeugleiste zeigt ihn wieder), rechts stehen **alle Einstellungen der Auswahl**:
  - **Abschnitt:** Titel in der Gliederung, ein- oder ausblenden, Bedingung;
  - **Feld:** Titel (erscheint in den aufgeklappten Angaben und als Hinweis am Feld), „Zählt für den Füllstand“
    (z. B. Felder, die die Behörde ausfüllt), Bedingung – dazu wo es steht und wie es in FORMA heißt;
  - **mehrere Felder/Gruppen:** „Gruppe bilden“ – sie zählen als eine Angabe (etwa eine Mehrfachauswahl über
    mehrere Zeilen: 1/1 statt 1/5), zählen bzw. nicht zählen, gemeinsame Bedingung;
  - **Gruppe:** Name, Regel („eine genügt“, „alle nötig“, „zählt nicht“), Felder und Untergruppen, Bedingung,
    auflösen. **Gruppen lassen sich verschachteln:** Felder einer Gruppe bilden eine Untergruppe in ihr; im Baum
    mit <kbd>Strg</kbd> gewählte Gruppen werden Untergruppen einer neuen; „Teil von“ hängt eine Gruppe in eine
    andere ein oder nimmt sie heraus. Gezählt wird die oberste Gruppe als eine Angabe, ihre Untergruppen nach
    ihrer eigenen Regel – etwa „Gebäudeart: eine genügt“ aus „Wohngebäude: alle nötig“ und weiteren Kästchen.
    Beim Auflösen kommen Felder und Untergruppen eine Ebene höher.

  Gewählte Felder, Gruppen und Abschnitte sind im Formular umrandet; Zeigen auf einen Eintrag im Baum hebt seine
  Felder hervor. Im Einrichten-Modus wird nichts eingetippt. „Fertig“ beendet ihn; „Alles auf die Vorgabe
  zurücksetzen“ (ohne Auswahl) setzt das Formular zurück; eine Übersicht steht in den Einstellungen unter
  „Formulare“.
- **Bedingungen** („Erforderlich“ in den Einstellungen der Auswahl): „nur erforderlich, wenn …“. Eine Bedingung ist
  eine Gruppe, deren Teile **alle** (und) oder **mindestens einer** (oder) zutreffen müssen; Teile sind Prüfungen
  oder wieder Gruppen (bis vier Ebenen) – etwa „Gebäudeklasse 3–5 **und** (Sonderbau angekreuzt **oder** Verfahren
  Baugenehmigungsverfahren)“. Prüfungen: ein **Antragsmerkmal** ist bzw. ist nicht einer der angekreuzten Werte;
  ein **anderes Feld** ist angekreuzt/ausgefüllt, leer, gleich oder ungleich einem Wert. Felder lassen sich in der
  Liste oder mit „Feld im Formular wählen“ per Klick ins Formular wählen (<kbd>Esc</kbd> bricht ab). Darunter steht
  die Bedingung in Worten und ob sie gerade zutrifft. Trifft sie nicht zu, **entfällt** der Eintrag: Er zählt nicht,
  ist in der Gliederung durchgestrichen bzw. „entfällt“, seine Felder sind im Formular neutral statt blau
  hinterlegt; in Gruppen zählen entfallene Teile nicht mit. Fehlt im Projekt ein Merkmal, von dem eine Bedingung
  abhängt, ist der Eintrag offen (siehe oben), und die Gliederung weist darauf hin.
- **Antragsmerkmale direkt am Formular festlegen** (`components/MerkmalWahl.tsx`): Der Hinweiskasten der Gliederung
  bietet je fehlendem Merkmal Segmentknöpfe mit Kurzerklärung und Fundstelle (z. B. „Gebäudeklasse (§ 2 Abs. 3 BauO
  NRW 2018)“, die Erklärung je Wert beim Zeigen; „§“ öffnet den Gesetzestext). Dieselbe Auswahl öffnet das
  Info-Symbol an einem offenen Feld („Gebäudeart festlegen“ im Gesetzes-Fenster). Die Wahl wirkt sofort. Mit Projekt
  steht sie im aktiven Antrag der Projektdatei (gilt für alle Formulare; „Alle Antragsmerkmale …“ führt zum
  Antragsumfang), ohne Projekt (Web-Version) gilt sie für die Datei und liegt im lokalen Speicher
  (`formulare:merkmale-datei`, `merkmalWerte.ts`). Bedingungen aus früheren Versionen (eine Liste, alle
  Teile müssen zutreffen) werden als Und-Gruppe übernommen.
- **Tastatur:** <kbd>Tab</kbd> und <kbd>Enter</kbd> (in einzeiligen Feldern) gehen in Lesereihenfolge zum nächsten
  Feld – auf dem Papier von oben nach unten, nebeneinanderliegende Rahmen von links nach rechts.
- **Speichern** (<kbd>Strg</kbd>+<kbd>S</kbd>) schreibt die geänderten Felder in die FORMA-Datei. Vorher wird sie
  frisch eingelesen: Hat sie seit dem Öffnen jemand geändert (z. B. in FORMA gespeichert), wird nicht gespeichert.
  „Neu laden“ liest die neue Fassung und trägt die eigenen Eingaben wieder ein; danach kann gespeichert werden.
- **Öffnen einer falschen Datei** (z. B. keine `.frmsjf`): Die App prüft die Datei, bevor sie das geöffnete Formular
  schließt. Ist sie kein FORMA-Formular, meldet sie „Das ist kein FORMA-Formular (.frmsjf). Bitte eine Formulardatei
  aus dem FORMA-Projektordner wählen.“ – das geöffnete Formular bleibt offen, die technische Einzelheit steht im
  Protokoll.
- **Drucken** (<kbd>Strg</kbd>+<kbd>P</kbd>): die Formularansicht in Originalgröße, ein Blatt je Seite (A4 hoch),
  ohne Werkzeugleiste und Gliederung. Der Druck gibt den amtlichen Vordruck unverfälscht wieder (§ 1 Abs. 3
  BauPrüfVO): keine Info-Symbole, keine Kennzeichnung entfallender oder offener Felder, keine Autofill- und
  Textmarker-Farben, keine Feldhinterlegung. Die Druckregel aus `packages/core` (zeigt nur Berichte) hebt
  `styles.css` mit spezifischeren Regeln auf (`druck.test.ts`).
- **PDF** (<kbd>Strg</kbd>+<kbd>E</kbd>, auch im Kontextmenü eines Formulars): „Als PDF exportieren …“ fragt, ob in
  den **voreingestellten Ordner** (die aktive Antragsfassung, z. B. `TÖB\BAUA 2`) oder in einen **anderen Ordner
  im Projekt** exportiert wird; der Dateiname kommt aus der Namensvorlage und lässt sich ändern. Gibt es die Datei
  schon, wird erst nach Bestätigung ersetzt (die bisherige wird gesichert). „Speichern unter …“ öffnet den
  Speicherdialog von Windows. Die PDF enthält auch noch nicht gespeicherte Eingaben; „Speichern“
  (<kbd>Strg</kbd>+<kbd>S</kbd>) bleibt das Speichern in die FORMA-Datei. Mehr unter „Antrag, Export und
  Vollständigkeit“.

### Zwischenspeichern, Rückgängig, Verlauf

Jede Eingabe wird sofort **lokal gesichert** (im Speicher der App, nicht im Projektordner) – mit **Verlauf**, der
Neustarts übersteht. In die FORMA-Datei kommt sie erst mit „Speichern“; Kollegen sehen also nie halbe Zwischenstände.

- <kbd>Strg</kbd>+<kbd>Z</kbd> / <kbd>Strg</kbd>+<kbd>Y</kbd> (oder ↶ ↷) nehmen Eingaben zurück bzw. stellen sie
  wieder her und springen zum betroffenen Feld. Weitertippen im selben Feld ist ein Schritt; „Daten
  aktualisieren“ ist ein Schritt für alle Felder.
- **Verlauf** (rechts): alle Schritte mit Zeit, Feld und „alt → neu“, auch aus früheren Sitzungen. Ein Klick stellt
  den Stand nach diesem Schritt her; „Anfang“ nimmt alles zurück.
- Auch nach dem Speichern bleibt der Verlauf: Rückgängig ergibt dann wieder eine ungespeicherte Änderung.
- Beim Öffnen wird der Verlauf mit der Datei abgeglichen: Stehen die Werte der Schritte nicht in der Datei (Web-Version:
  Eingaben heruntergeladen, dann die Originaldatei wieder geöffnet; Desktop: Datei inzwischen außerhalb geändert),
  erscheinen sie unter „Frühere Sitzung – nicht in dieser Datei“ (nur zur Ansicht), und der Verlauf beginnt neu.
- Je Formular bleiben die letzten 500 Schritte, für die 60 zuletzt bearbeiteten Formulare.
- **Während des Speicherns weitertippen** geht nicht verloren: Was eingegeben wird, während die Datei noch geschrieben
  wird (langsames Netzlaufwerk), bleibt als ungespeicherte Änderung stehen – auch in der Projektkarte. Ein zweites
  <kbd>Strg</kbd>+<kbd>S</kbd> in dieser Zeit entfällt.
- Lässt sich **nicht mehr lokal sichern** (Speicher voll), meldet die App das einmal – dann bald speichern.
- Der Verlauf der **Projektkarte** wird beim Lesen ebenso abgeglichen: Hat sie jemand anderes geändert, kommen die
  alten Schritte unter „Frühere Sitzung“, damit <kbd>Strg</kbd>+<kbd>Z</kbd> keine alten Werte über die fremde Änderung
  schreibt.

### Projektkarte und Stammdaten

Die **Projektkarte** (links über den Formularen als „Projektdaten“) zeigt links die Gruppen – „Projekt“ (Projektdaten, Grundstück,
Flächen, Nutzung, Umbau, Kosteneinflüsse) und „Beteiligte“ (Bauherr, Entwurfsverfasser, Behörden …) – jeweils mit
Kurzfassung („Mustermann, Max · Welver“ oder „nicht ausgefüllt“), rechts die gewählte Gruppe als gegliedertes
Formular: bei Adressen Name, Anschrift, Kontakt sowie Bank und Sonstiges (zugeklappt, solange leer), daneben die
Anschrift, wie sie in Formularen steht.

- **Favoriten und Ausblenden:** ☆ an einer Gruppe in der Gliederung (beim Überfahren bzw. per Tab sichtbar) stellt
  sie oben unter „Favoriten“, ★ nimmt sie wieder heraus. Das Auge blendet eine Gruppe aus; sie steht dann unter
  „n ausgeblendet – zeigen“ und lässt sich dort wieder einblenden. Die Suche findet auch ausgeblendete Gruppen; die
  gewählte Gruppe und Gruppen mit ungespeicherten Änderungen bleiben sichtbar. Ein Favorit ist nie zugleich
  ausgeblendet. Die Auswahl gilt für alle FORMA-Projekte (die Gruppen haben in jeder Projektkarte dieselbe Kennung)
  und wird je Rechner mit den übrigen Ansichtseinstellungen gespeichert.
- **Einträge ausblenden:** Das Auge an einem Eintrag der gewählten Gruppe (beim Überfahren bzw. per Tab sichtbar)
  blendet ihn aus, z. B. „Postfach“ oder „Bank“. Bei Beteiligten gilt das für alle Beteiligten (sie haben denselben
  Aufbau), sonst für diese Gruppe – jeweils in allen Projekten. „n Einträge ausgeblendet – zeigen“ unter der Gruppe
  zeigt sie gedämpft wieder und lässt sie einblenden. Einträge mit ungespeicherten Änderungen bleiben sichtbar.
  Ausgeblendete Einträge befüllen die Formulare weiter.
- **Werkzeugleiste:** ↶ ↷ (<kbd>Strg</kbd>+<kbd>Z</kbd> / <kbd>Strg</kbd>+<kbd>Y</kbd>), „Projektdaten speichern“
  (<kbd>Strg</kbd>+<kbd>S</kbd>) und „Verwerfen“ (lässt sich rückgängig machen). Ungespeicherte Änderungen bleiben
  lokal gesichert, auch über Neustarts. Geänderte Einträge sind orange markiert, der Pfeil am Eintrag setzt einen zurück.
- **Auswahllisten und Optionen** wie in FORMA (Anrede, Land, Bodenklasse, Neigung …), Kästchen gesammelt unter einem
  Titel (Besondere Auflagen). Die Möglichkeiten selbst bleiben, wie FORMA sie angelegt hat.
- **Übernehmen von …:** alle Angaben einer anderen Adressgruppe dieses Projekts (z. B. Eigentümer = Bauherr) oder
  aus den Bürostammdaten – in einem Schritt, der sich rückgängig machen lässt. „Leeren“ entfernt alle Angaben.
- **Adressbuch** (Einstellungen): alle Adressen aus den Projektkarten aller Projekte – Bauherren,
  Entwurfsverfasser, Behörden, Fachplaner –, gleiche Adressen einmal mit allen Verwendungen („BS5 ·
  Bauaufsichtsbehörde“), dazu die **eigenen**: „Neue Adresse“ legt eine an, „Bearbeiten“ ändert eine (bei einer
  Adresse aus den Projektkarten entsteht eine eigene Fassung, Marke „geändert“, „Änderungen verwerfen“ nimmt sie
  zurück), „Löschen“ bzw. „Ausblenden“ nimmt sie aus dem Adressbuch (ausgeblendete unten wieder einblendbar). Die
  eigenen Adressen stehen im gemeinsamen Konfigurationsordner (Bereich `formulare`, Eintrag `adressen`) und gelten für
  alle im Büro; die Projektkarten selbst ändert das Adressbuch nicht. „Aus den Projektdaten einlesen“ liest alle
  Projektkarten neu. So funktioniert das Adressbuch auch ohne Projektkarten.
- **Eigene Ansicht der Projektkarte:** oben in der Leiste der Projektkarte – die Einträge, die das Büro nutzt, aus
  allen Gruppen auf einer Seite, in eigenen Abschnitten und eigener Reihenfolge.
  „Ansicht bearbeiten …“ öffnet den **Ansicht-Editor** (gemeinsam in `packages/core/src/ui/AnsichtEditor.tsx`): rechts
  der Katalog aller Einträge mit Suche (Haken nimmt in den gewählten Abschnitt auf), links die Abschnitte – Felder am
  Griff ziehen (auch in einen anderen Abschnitt) oder Griff wählen und ↑/↓, Entf entfernt. Je Feld: **eigene
  Beschriftung**, **Breite** (¼, ⅓, ½, ⅔, ¾, ganz) und **„neue Zeile“** – so legt man fest, welche Felder in einer Zeile
  stehen (die Vorschau unter dem gewählten Abschnitt zeigt die Zeilen; in schmalen Abschnitten werden die Felder
  breiter, in
  schmalen Fenstern steht der Katalog unter dem Aufbau). Ein Feld, das es nicht mehr gibt, steht durchgestrichen da
  und lässt sich nur entfernen. **Verknüpfen (⛓):** Der Knopf öffnet eine kleine Liste „Gemeinsam ausfüllen mit …“
  mit Kästchen (gewählt wird bewusst per Klick bzw. Leertaste, nicht schon mit den Pfeiltasten; Esc schließt die
  Liste). Felder mit demselben Inhalt (z. B.
  Ort des Bauherrn und Ort des Eigentümers) werden gemeinsam ausgefüllt – eine Eingabe trägt den Wert in alle
  verknüpften Einträge der Projektkarte ein – überall in der Projektkarte, auch beim Übernehmen aus einer anderen
  Gruppe; zusammenhängendes Tippen ist ein Schritt im Verlauf. Angeboten werden nur Felder, die zusammenpassen: Text
  in Text (ins einzeilige Feld ohne Zeilenumbrüche), Auswahl in Auswahl über den Text der Wahl (fehlt er im Ziel,
  bleibt es unverändert), Kästchen in Kästchen; ohne passendes Feld gibt es keinen Knopf. „Verwerfen“ und „Leeren“
  einer Gruppe wirken nur auf die eigenen Einträge, nicht über Verknüpfungen. Auf der Seite steht unter jedem Feld
  (unter einer etwaigen Warnung) dezent, aus welcher Gruppe es stammt und womit es verknüpft ist (Kettensymbol). Gilt
  je Benutzer für alle Projekte (`formulare:ansicht:projektkarte`).
- **Eingaben mit fester Form:** „Art der Nutzung“ ist eine Auswahl gängiger Nutzungen (Wohnen, Büro und Verwaltung,
  Handel …; „andere …“ erlaubt einen eigenen Text, ein vorhandener eigener Text bleibt als „(eigene Angabe)“
  erhalten; Esc oder der Pfeil führt zur Liste zurück), „Art der baulichen Nutzung“ eine Auswahl der Baugebiete nach
  BauNVO (§§ 2–11, Sondergebiete nach § 10 und § 11 getrennt) samt Fläche für den Gemeinbedarf (§ 9 Abs. 1 Nr. 5
  BauGB), vorhabenbezogenem Bebauungsplan (§ 12 BauGB), Innenbereich ohne Baugebiet (§ 34 Abs. 1 – im faktischen
  Baugebiet nach § 34 Abs. 2 wählt man das Baugebiet) und Außenbereich (§ 35); Einträge „Anzahl …“ nehmen nur ganze
  Zahlen an – ein Textfeld mit Zifferntastatur, in das sich nur Ziffern tippen lassen; ein alter oder eingefügter
  Text wie „ca. 3“ oder „1.5“ bleibt unverändert sichtbar, wird gemeldet und lässt sich korrigieren oder leeren.
  Gespeichert wird weiter als Text der Projektkarte.
- **Büro & Stammdaten** (Einstellungen): je Rolle (Entwurfsverfasser, Bauvorlageberechtigter,
  Bauaufsichtsbehörde, Gemeinde …) eine Vorgabe aus dem Adressbuch – die bisher in dieser Rolle verwendeten
  Adressen zuerst. In der Projektkarte: „Als Vorgabe festlegen“ bei einer Adresse, **„Vorgaben eintragen“** füllt
  alle leeren Rollen auf einmal, und „Übernehmen von …“ bietet die Vorgabe und die bisherigen Adressen der Rolle an.
- **Projektordner, Ansicht „Ordner“:** Die Reihenfolge der Ordner einer Ebene lässt sich per Ziehen ändern (oder Ordner
  wählen und Alt+↑/↓); gemerkt je Ebene für alle Projekte, „Reihenfolge dieser Ebene zurücksetzen“ im Kontextmenü
  sortiert wieder alphabetisch. Ein Klick ohne Bewegung klappt weiter auf.
- **Projektordner, Ansicht „Antrag“:** Im Abschnitt „Projektordner“ der Navigation schaltet „Ordner | Antrag“ um
  zwischen den angezeigten Pfaden und nur den Dokumenten im Ordner der aktiven Antragsfassung (z. B. `TÖB/BAUA 2`).
  Alle Zeilen sind gleich hoch (wie mit Unterzeile), eingerückt, die Knöpfe mit Abstand.
  Oben steht „n von m bereit“ mit Balken (dazu, wie viele Dokumente des Antragsumfangs dort noch fehlen), darunter je
  Datei ein Zeichen: ✓ bereit, ○ noch nicht bereit, ! Namensformat passt nicht, ↻ nach dem Markieren geändert.
  **Bereit markiert man von Hand** (Klick auf das Zeichen oder Rechtsklick) – das steht je Fassung in der
  Projektdatei (.oap) und gilt für alle im Büro. Wird die Datei danach geändert, gilt sie nicht mehr als bereit.
  Bereit sein können nur Dateien im **Namensformat `<Projektcode> <Antragsart> <JJMMTT> …`**, z. B.
  „MUS BAUA 261110 01 Bauantrag.pdf“ (Projektcode = Kürzel des FORMA-Projekts oder Projektcode der Projektdatei,
  Antragsart = die der Fassung: BAUA, BAUVA, DENK …; gleichwertige Schreibweisen des Namensschemas gelten, im Ordner
  „BVA“ also auch „HVO BAUVA …“) – die Stellen nach dem Namensschema (Vorgabe: Code, Art, Datum).
  Fehlt das Datum, heißt die Meldung „Datum JJMMTT fehlt …“, fehlt die Bezeichnung danach, „Bezeichnung fehlt“;
  „Anlage1“ oder „Ansicht2“ sind Bezeichnungen, keine Nummern (Plankürzel stehen in Großbuchstaben). Rechtsklick →
  „Umbenennen nach Namensformat …“ schlägt den Namen vor (der Punkt erscheint nur, wenn der Vorschlag etwas ändert):
  Projektcode, Antragsart, Datum und Nummer nach dem Namensschema vor die Bezeichnung. Was davon am Anfang schon steht,
  auch verrutscht, wird übernommen statt verdoppelt – der Projektcode, ein gültiges JJMMTT, eine Plan- oder
  Dokumentnummer und ein bekanntes Kürzel (Phase eines verschobenen Plans, andere Antragsart), das durch die Antragsart
  ersetzt wird: „HVO GP 261111 GP-04 Grundriss.pdf“ → „HVO BAUA 261111 GP-04 Grundriss.pdf“, „HVO 261111
  Bauantrag.pdf“ → „HVO BAUA 261111 Bauantrag.pdf“. Fehlt das Datum, kommt das der Datei hinein. Eine Plannummer mit
  Phasenkürzel („GP-04“) kommt auch von weiter hinten an ihre Stelle, damit der Plan im Plansatz bleibt – nur, wenn es
  genau eine ist („Lageplan zu GP-02 und GP-03“ bleibt); Zahlen in der Bezeichnung („Statik Teil 2“, „Lageplan M 1
  500“, „OG2“) bleiben, wo sie sind. Ein Kürzel in Kleinbuchstaben zählt nur an der Stelle der Antragsart (oder
  verrutscht ganz vorn) und mit einem weiteren Kopfteil daneben (Projektcode davor, Datum oder Projektcode danach),
  sonst ist es ein Wort der Bezeichnung („Entw Grundriss“, „Ab 2027 …“). Unter „Fehlt im Antragsordner“ stehen die
  Dokumente des Antragsumfangs ohne Datei.
  Die Namensvorlage für exportierte PDFs ist deshalb `{Kürzel} {Art} {Datum} {Nr} {Name}` (`{Art}` = Antragsart der
  aktiven Fassung, an dieser Stelle immer – siehe „Dateiname“; `{Phase}` gibt es weiter an anderer Stelle). In der
  Unterlagen-Vorschau stehen die Pläne eines Plansatzes an seiner Stelle im Antragsumfang.
  - **Quick-Add:** Gibt es einen Antragsumfang, steht unter einer Datei, die zu keinem seiner Dokumente gehört, „nicht
    im Antragsumfang“ und dahinter ein **+** (Zeilen mit Dokument halten den Platz frei, die Zeitspalte bleibt bündig).
    Es bietet (ebenso oben im Rechtsklick-Menü der Zeile) „Als neues Dokument aufnehmen: „…““ – ein eigenes Dokument
    (Art extern), verknüpft mit der Datei für die angezeigte Fassung; Titel ist die Bezeichnung nach dem Namensformat
    („HVO BAUA 261110 07 Brandschutzkonzept.pdf“ → „Brandschutzkonzept“, Nr. 07; eine Plannummer wird keine Nr.), sonst
    der Name ohne Endung – und, wenn es Dokumente ohne Datei gibt, „Mit fehlendem Dokument verknüpfen“ ▸ mit diesen
    (kein Plansatz – der sammelt seine Pläne selbst). Beides meldet, was geschehen ist; ist die Datei im angezeigten
    Stand schon verknüpft, „Nicht aufgenommen – … ist schon mit „…“ verknüpft.“ Titel und Nr. lassen sich danach in den
    Antragsdaten ändern. Eingereicht bzw. während ein Antrag geöffnet wird, ist beides gesperrt (mit Grund); ist beim
    Klick inzwischen eine andere Fassung angezeigt, wird nichts aufgenommen („… – inzwischen ist Antrag … angezeigt.“).
    In einer schmalen Navigation entfällt mit der Zeitspalte auch der freigehaltene Platz.
- **Antragsunterlagen ansehen:** „Ansehen“ in der Ansicht „Antrag“ (oder Rechtsklick auf eine Datei → „In der
  Vorschau durchblättern“) zeigt alle Unterlagen der aktiven Fassung im ganzen Fenster – zuerst die Dokumente des
  Antragsumfangs in ihrer Reihenfolge, dann die übrigen. Blättern mit ‹ ›, ← → oder Bild↑/Bild↓ bzw. über die Liste
  links; Zoom mit − + (Tasten − + 0) oder der Auswahl (Seitenbreite, 50–300 %). PDFs erscheinen mit allen Seiten,
  Bilder ebenso, andere Dateien öffnet „Mit Programm öffnen“. „Als bereit markieren“ geht auch hier. Esc schließt.
- **Alle Formulare exportieren:** Knopf in der Ansicht „Antrag“ bzw. ⇪ im Kopf des Abschnitts „FORMA“: alle
  Formulare des FORMA-Projekts als PDF, Name und Ziel wie beim einzelnen Export (Namensvorlage, aktive Fassung).
  Formulare in `_archiv` bzw. `archiv` bleiben außen vor. Gibt es Dateien schon, fragt die App einmal: „Ersetzen“,
  „Vorhandene überspringen“ oder „Abbrechen“. Exportierte PDFs im Antragsordner werden mit den Dokumenten des
  Antragsumfangs verknüpft; am Ende steht, wie viele exportiert, übersprungen oder fehlgeschlagen sind.
- **Quellordner mit Schreibweisen der Büros:** Quellen im Antragsumfang (z. B. `Planung/Berechnungen`,
  `Planung/Genehmigungsplanung/pdf`, `Fachplanung/G27*`) werden auch gefunden, wenn der Ordner anders geschrieben ist:
  Nummern, Unterstriche und Punkte vorn („00 Berechnungen“, „__Berechnungen“, „03 Genehmigungsplanung“), gleichwertige
  Namen (Genehmigungsplanung = Genehmigung = GP, Fachplanung = Fachplaner) und Platzhalter („G27*“ für den Ordner des
  Vermessers). Neu im Katalog: Lageplan aus `Fachplanung/G27*`, Bauzeichnungen aus `Planung/Genehmigungsplanung/pdf`.
- **Projektdatei (.oap)** (in der Projektkarte unter „Projektordner“): Abgleich der Projektstammdaten mit der
  Projektkarte in beide Richtungen – „Übernehmen“ (Projektdatei → Projektkarte) und „Eintragen“ (Projektkarte →
  Projektdatei), je Angabe oder für alle abweichenden. Beim Speichern der Projektkarte werden geänderte Angaben in
  die Projektdatei eingetragen; fehlt sie, wird sie angelegt (siehe unten).
- **Suche** über alle Einträge; ein Treffer springt in seine Gruppe.
- **Hinweise auf Tippfehler** (Postleitzahl, E-Mail, IBAN-Prüfziffer, Telefonnummer) – nur Hinweise, gespeichert
  wird trotzdem. Zeichen, die es in Windows-1252 nicht gibt (z. B. Emojis), werden abgelehnt.
- **Korrekturen der Zuordnung:** Wo ein FORMA-Vordruck Felder falsch oder gar nicht mit der Projektkarte verknüpft,
  liest die App die Zuordnung korrigiert (die Datei bleibt unverändert; `src/vorgaben/zuordnungen.ts`):
  - Angaben zur Artenschutzprüfung (nw020012): „Antragsteller/in“ aus den Bauherrendaten statt vom
    Entwurfsverfasser; PLZ des Bauvorhabens aus der PLZ des Grundstücks.
  - Erhebungsbögen der Bautätigkeitsstatistik (Baugenehmigung nw010020 samt Baufertigstellung auf Seite 3,
    Baufertigstellung nw010021, Bauabgang nw010022): Anschrift des Baugrundstücks bzw. Gebäudes – Straße und
    Hausnummer getrennt aus „Straße/Nr.“ des Grundstücks („Musterweg 12 a“ → „Musterweg“ und „12 a“), dazu die PLZ.
- **Ergänzungen der Projektkarte („Schicht“ der App):** Angaben, für die die Projektkarte von FORMA keinen Eintrag
  hat – bisher die **PLZ des Grundstücks** (Gruppe Baugrundstücksdaten, „PLZ (Ergänzung der App)“). Sie erscheinen
  wie ein Eintrag, werden aber nie in `sj_prokarte.sdb` geschrieben: Die App merkt sie sich je FORMA-Projekt und
  führt sie in der Projektdatei (.oap, Adresse des Vorhabens) mit; ohne eigene Angabe kommt die PLZ von dort. Im
  Abgleich mit der Projektdatei steht sie als „Adresse: PLZ“.
- **Autofill mit Zustand:** Felder, die FORMA einem Eintrag der Projektkarte zuordnet, bekommen ihren Text von
  dort (Auto-Wert). Je Feld merkt sich die App in der Projektdatei (`.oap`, Abschnitt `formulare` → `felder`, je
  Formulardatei) getrennt den zuletzt eingetragenen Auto-Wert und eine manuelle Überschreibung:
  - **neue Formulare** (aus dem Antragsumfang oder „Formular hinzufügen“): leere Felder mit Auto-Wert werden gleich
    befüllt;
  - wer den Auto-Text durch eigenen ersetzt, **fixiert die Überschreibung** (beim Speichern) – sie bleibt beim
    Aktualisieren; im Formular ist ein Feld aus der Projektkarte links blau, ein überschriebenes orange markiert;
  - ein **geleertes Feld** bekommt beim Verlassen wieder den Auto-Wert; **bewusst leer** ist ein Feld mit einem
    Leerzeichen;
  - **Daten aktualisieren …** (Werkzeugleiste des Formulars, auch im Kontextmenü eines Formulars in der Navigation):
    Vorschau aller Felder, die sich ändern würden – vorgewählt sind Felder mit dem bisherigen Auto-Wert und leere;
    überschriebene und Felder mit anderem Inhalt ohne gespeicherten Zustand (z. B. in FORMA geändert) nur auf
    Wunsch. Ausgefülltes wird nie geleert; hat die Projektkarte nichts, bleibt das Feld. Ungespeicherte Änderungen
    der Projektkarte zählen mit. Im Kontextmenü wird ein nicht geöffnetes Formular gleich aktualisiert (mit
    ungespeicherten Eingaben in diese, sonst in die Datei – mit Sperre, nicht, wenn es anderswo geöffnet ist);
  - **Manuelle Überschreibungen ignorieren** (Haken im Menü ▾ neben „Daten aktualisieren“ und im Dialog, je
    Formular): überall der Auto-Wert; die Überschreibungen bleiben gemerkt und kommen zurück, wenn der Haken weg ist;
  - **nach dem Speichern der Projektkarte** fragt die App, ob die Unterlagen aktualisiert werden sollen – mit der
    Liste der Formulare und wie viele Felder sich ändern. Erkannt werden auch Felder, die noch den alten Wert der
    Projektkarte tragen, ohne dass es einen Zustand gab. Das geöffnete Formular bekommt die Werte als ungespeicherte
    Eingaben, die anderen werden gleich geschrieben.
- Ist die Projektkarte gerade in FORMA geöffnet (Datenbank gesperrt), kommt eine Meldung; nichts wird geschrieben.

### Projektordner (Server)

Neben den FORMA-Projekten lassen sich die **echten Projektordner** anbinden – zum Nachsehen (welche Formulare
schon als PDF vorliegen, welche Berechnungen es gibt), als Ziel des PDF-Exports und für einfache Dateibefehle.

- **Immer aktuell:** Nach allem, was die App selbst schreibt (Export, neue Fassung, Verknüpfen, Projektdatei,
  Dateibefehle), liest der Baum neu. Was von außen dazukommt – neue Dokumente im Explorer oder von Kollegen, neue
  Formulare und Sperren aus FORMA –, übernimmt die App, sobald das Fenster wieder in den Vordergrund kommt, und alle
  15 Sekunden, solange es sichtbar ist (FORMA-Formulare, Projektordner, Antragsstatus; beim Zurückkommen auch die
  Projektdatei und in der Übersicht die Liste der Projekte).

- Zuordnung über das **Kürzel**: Der FORMA-Projektordner heißt „BS5“, der echte Ordner beginnt damit
  („BS5 Birkenstraße 5“) oder hat ein Wort davor („JJ H24 …“). Gesucht wird **zwei Ebenen** tief (auch in
  Unterordnern wie der Akquise); ein Treffer auf der obersten Ebene geht vor.
- Links erscheint der Ordner als Baum, beschränkt auf die **ausgewählten Pfade**: je Zeile ein Pfad
  (`Organisation`, `03 Berechnungen/Flächen`), Platzhalter `*` und `?` je Ebene. Die Vorgabe steht in den
  Einstellungen, je Projekt lässt sie sich über ⚙ ändern. Ordner werden erst beim Aufklappen gelesen.
- **Klick** auf eine PDF-, Excel-, Word- oder Bilddatei zeigt sie in der App (siehe unten), **Doppelklick** öffnet
  sie mit ihrem Programm, ↗ zeigt einen Ordner im Explorer. Besitzerdateien von Office (`~$…`) werden ausgeblendet.
- **Rechtsklick** auf eine Datei: Ansehen, Mit Programm öffnen, Im Explorer öffnen, **Kopieren** (danach Rechtsklick
  auf einen Ordner › Einfügen), **Duplizieren** („Name (Kopie).pdf“), **Umbenennen …**, **Löschen …** (nach
  Bestätigung, mit Sicherungskopie im App-Ordner), mit einem **Antragsdokument verknüpfen** (liegt die Datei nicht im
  Ordner der aktiven Fassung, wird sie dorthin kopiert) und Pfad kopieren. Rechtsklick auf einen Ordner: Einfügen,
  Neuer Ordner …, Im Explorer öffnen. Überschrieben wird nie; Dateien von FORMA (`.frmsjf`, `.frmtmp`, `.sdb`,
  `.ini`) lassen sich hier nicht umbenennen.
- **Formulare löschen** (Rechtsklick auf ein Formular › Löschen …): nach Rückfrage und mit Sicherungskopie im
  App-Ordner. Ist das Formular hier geöffnet, wird es vorher geschlossen (die Rückfrage warnt vor nicht gespeicherten
  Eingaben); ist es in FORMA oder auf einem anderen Rechner geöffnet (Sperrdatei), wird nicht gelöscht. Sperrdateien,
  Projektkarte und Projekttitel verwaltet weiterhin nur FORMA. Automatisch löscht die App nie etwas.

### Antrag, Export und Vollständigkeit

Die Anträge liegen im Projektordner unter `TÖB` (einstellbar), darin je **Antragsfassung** ein Ordner: `BAUA`, bei
mehreren mit laufender Nummer – hinten (`BAUA 2`, `BAUA_2`, `BAUA2`) oder vorn (`2 BAUA`, `2. BAUA`, `02. BAUA`,
`02 BAUA`, `2.BAUA`; vorn höchstens zwei Stellen, „2023 BAUA“ ist keine Fassung). Ein Zusatz nach der Nummer zählt
nicht mit – nach Leerzeichen, Punkt, „_“ oder „-“ bzw. direkt als Buchstabe (`BAUA 2 Nachtrag`, `BAUA 2-alt`, `BAUA 2a`
sind Fassung 2); ohne Nummer nur nach einem Leerzeichen (`BAUA Nachtrag` ist Fassung 1, `BAUA_alt` keine).
Daneben andere Antragsarten wie `BAUVA` (Voranfrage) oder `DENK` (Denkmal). Erkannt wird mit den Antragsarten der
Einstellungen und des Namensschemas (`packages/core/src/fassung.ts`, auch in der App „Projekt“ genutzt).

- **Aktive Fassung** (oben links am Projekt, „Antrag“): die gewählte, sonst die neueste der Standardart. Über das Menü
  lässt sich umschalten oder eine **neue Fassung anlegen** – in der Schreibweise der vorhandenen mit der höchsten Nummer
  („03. BAUA“ nach „02. BAUA“, „3 BAUA“ nach „2 BAUA“; nach nur „BAUA“ bzw. „BAUA2“ wird es „BAUA 2“ bzw. „BAUA 3“); der
  Ordner entsteht sofort. Die aktive Fassung ist das voreingestellte Ziel des Exports und der Maßstab der
  Vollständigkeitsprüfung.
- **Sammelprojekte:** Hat ein Formularprojekt je Antrag einen Unterordner (benannt wie die Antragsfassung, in einer der
  Schreibweisen oben), zeigt die Navigation unter „Formulare“ zwei Gruppen in einem Rollbereich: „Antrag BAUA 2 ·
  Unterordner 2. BAUA“ mit den Formularen aus dem Unterordner des **aktiven** Antrags (zugeordnet über Art und Nummer –
  `BAUA 2` im Antragsordner ist `2. BAUA` oder `02 BAUA` im Formularprojekt; heißt er wie die Fassung, „eigener
  Unterordner“) und „Alle Anträge · oberste Ebene“ mit denen der obersten Ebene des Formularprojekts. Unterordner
  anderer Anträge bleiben verborgen; wechselt der aktive Antrag, zeigt die erste Gruppe dessen Unterordner. Neue
  Formulare („Formular anlegen“, „Formular hinzufügen“) entstehen im Unterordner des Antrags, der beim Klick angezeigt
  war – die Tooltips nennen das Ziel; gibt es für ihn keinen, steht „kein eigener Unterordner“ mit den vorhandenen
  darunter, und sie entstehen auf der obersten Ebene. Bei gleichem Namen geht für den Antragsumfang das Formular im
  Unterordner vor; im Menü „Vorhandenes Formular zuordnen“ steht der Unterordner als Hinweis. Zugeordnet und für den
  Autofill gemerkt wird ein Formular mit dem Pfad ab dem Formularprojekt („2. BAUA/002-Bauantrag.frmsjf“; auf der
  obersten Ebene wie bisher der Dateiname) – auch beim Export. Größe und Zeit (Status „aktuell“, „zuletzt bearbeitet“)
  gelten je Pfad; die Sperrenliste umfasst den Unterordner des aktiven Antrags, „Im Explorer öffnen“ öffnet den Ordner
  des Formulars.
- **Dateiname** nach der Namensvorlage, Vorgabe `{Kürzel} {Art} {Datum} {Nr} {Name}` → „BS9 BAUA 261110 03
  Baubeschreibung.pdf“ (Datum als JJMMTT, eine leere Nummer entfällt). Die **Antragsart kommt immer aus dem Antrag**
  (Ordner der aktiven Fassung, „BAUA 2“ → BAUA), nie aus einer Einstellung: Steht in einer Vorlage nach dem Kürzel
  (bzw. an der Stelle der Antragsart nach dem Namensschema) noch `{Phase}` – die Vorgabe früherer Fassungen, dort
  stand dann der Wert der Einstellung „Phase“, z. B. BVA im Bauantrag – oder ein festes Kürzel (mindestens ein
  Buchstabe; „2026“ zählt nicht), setzt der Export dort `{Art}` ein (`vorlageMitAntragsart`, in
  `wirksameEinstellungen`). Gespeichert bleibt die Vorlage, wie sie ist; die Einstellungen (global und je Projekt)
  zeigen dann einen Hinweis mit „Vorlage anpassen“. Weitere Platzhalter: `{Antrag}`, `{Phase}` (Feld „Phase (nur für
  {Phase})“), `{Formular}`, `{Kennung}`, `{Stand}`. `{Name}` ist der Titel im Antragsumfang, sonst der Formularname
  ohne laufende Nummer und Jahr.
- **Einstellungen › Antrag & Export:** Antragsordner, Antragsarten (die erste ist der Standard; dazu die des
  Namensschemas), Namensvorlage und Phase (nur für `{Phase}`), Ziel (aktive Antragsfassung oder fester Ordner, z. B.
  `TÖB/{Antrag}/Formulare`), Ordner der Berechnungen, Vorlagenordner für neue Formulare und der **Katalog der
  Antragsdokumente**. Je Projekt lassen sich Antragsordner, Namensvorlage, Phase (nur für `{Phase}`) und Ziel
  abweichend einstellen (Antragsdaten › „Export für …“, „Vorgabe verwenden“ setzt zurück) – wie die angezeigten Pfade
  im Projektordner.
- **Antragsdaten** (Navigation, rechte Hälfte neben „Projektdaten“): alles, was nur für den aktiven Antrag gilt –
  **Status** (siehe „Eingereicht“), **Antragsmerkmale** und **Antragsumfang**, dazu „Export für …“ (gilt für alle
  Anträge des Projekts). Die Projektdaten (Projektkarte) gelten dagegen für das ganze Projekt.
- **Antragsumfang** (in den Antragsdaten): welche Dokumente zum Antrag gehören. „Antragsumfang festlegen“ übernimmt
  die Dokumente der gewählten Antragsvorlage, „Dokument hinzufügen“ weitere aus dem Katalog oder eigene. Je Dokument:
  **Nummer** – sie steht im Dateinamen des PDF-Exports an der Stelle `{Nr}` (z. B. „BS9 BAUA 261110 01 Bauantrag.pdf“)
  und sortiert so die Unterlagen im Antragsordner –, Titel, **intern** (Formular des Projekts – Teil des Namens oder
  Kennung) oder **extern** (Datei – Berechnung, Plan, fremde PDF; Ordner der Quelle und Muster mit `*`, `?`, mehrere
  mit `;`). Die Textfelder werden beim Verlassen des Felds bzw. mit Enter übernommen, Esc verwirft. Die Datei im
  Antragsordner wird nach Muster bzw. Titel gefunden oder ausdrücklich verknüpft (🔗, auch per Rechtsklick im
  Projektordner); ein Export in die aktive Fassung verknüpft automatisch. Der Antragsumfang und die
  aktive Fassung stehen im Abschnitt `formulare` der Projektdatei (`.oap`) im Projektordner und gelten damit für alle
  im Büro (siehe unten).
- **Plansatz** (Art eines Dokuments, Vorgabe für „Bauzeichnungen“): ein Eintrag für **alle Pläne**, statt je Grundriss
  einen anzulegen (`plansatz.ts`). Pläne erkennt die App an der **Plannummer mit Plankürzel** an der Stelle „Nummer“
  des Namensschemas – „HVO BAUA 261111 GP-04 Grundriss OG.pdf“; „GP01-07“ ist ein zusammengefasster Satz (Pläne 01 bis
  07); eine reine Zahl („01 Bauantrag“) ist eine Dokumentnummer der Formulare und zählt nicht. Gesucht wird direkt im
  Ordner der aktiven Fassung und direkt in der Quelle (Vorgabe `Planung/Genehmigungsplanung/pdf`, aus der die Pläne in
  den Antragsordner verschoben werden – eine leere Quelle ist in Ordnung). Unterordner wie `_Archiv` oder `alt` zählen
  nicht (zurückgezogene oder umnummerierte Pläne ergäben sonst Scheinnummern und -lücken); liegt ein Plan auch als DWG
  neben dem PDF, zählt das PDF. Ein Projektcode aus mehreren Wörtern („BS 9“) wird erkannt (dieselbe Zerlegung wie
  beim Namensformat, `dateinameZerlegenMitStellen` in core; die Nummer ist optional). Zugeordnet wird über die
  Plannummer (ob an Stelle 2 GP oder BAUA steht, spielt keine Rolle). Je Plankürzel getrennt:
  - **Lücke:** zwischen der kleinsten und der größten vorhandenen Nummer fehlt eine – nach der Bürovorgabe
    (fortlaufende Nummern) fehlt dann ein Plan (rot, Zustand „Lücke“; in der Zeile „GP-07 fehlt“). Die Reihe muss
    nicht bei 01 beginnen, die Reihenfolge der Planarten wird nicht geprüft. Fehlen mehr als zehn Nummern am Stück,
    ist das eher ein Tippfehler (GP-41 statt GP-04): dann ein Hinweis statt Dutzender fehlender Pläne;
  - **noch nicht verschoben:** die Nummer liegt nur in der Quelle (gelb);
  - **veraltet:** die Quelle hat eine neuere Fassung – Datum im Namen, bei gleichem Datum der Index (AP-03a nach
    AP-03) (gelb); liegt eine Nummer mehrfach im Antragsordner, zählt die neueste;
  - **Hinweise** (nie sperrend): ältere Fassungen derselben Nummer („alte Fassung?“), ein Satz neben Einzelplänen
    daraus, eine Datei mit Plannummer, die nicht an ihrer Stelle im Namensschema steht (etwa ohne Projektcode: „GP-02
    Schnitt.pdf (Quelle): Plannummer GP-02 erkannt, … – zählt nicht zum Plansatz; Datei umbenennen (Rechtsklick ›
    Umbenennen)“, mit dem Ort Antragsordner bzw. Quelle, bei Sätzen „GP-01 bis GP-07“, mit Index „AP-03a“; sonst fiele
    sie still heraus, und weil die Reihe nicht bei 01 beginnen muss, auch ohne Lücke), ein Index, wo ihn das
    Namensschema des Büros nicht vorsieht (Bürovorgabe: erst ab LPH 5; daraus folgt: eine Phase ohne LPH wie AB trägt
    keinen), „kein Schnitt erkannt“ bzw. „keine Ansicht erkannt“ (Bauzeichnungen umfassen Grundrisse, Schnitte und
    Ansichten, § 4 Abs. 1, 3, 4 BauPrüfVO NRW – nur ein Hinweis, weil die Behörde auf Bauvorlagen verzichten kann und
    ein Vorbescheid nur die zur Beurteilung seiner Fragen erforderlichen Bauvorlagen braucht, § 16 BauPrüfVO;
    außerhalb von DENK und ABGE nicht bei Plänen ohne Leistungsphase wie den Aufteilungsplänen nach § 7 Abs. 4 WEG und
    nie beim Entwässerungsantrag (ENTW), für den in der Regel die Entwässerungssatzung der Gemeinde und nicht die
    BauPrüfVO die Grundlage ist; bei der denkmalrechtlichen Erlaubnis (DENK, § 9 DSchG NRW) und der
    Abgeschlossenheitsbescheinigung (ABGE, Aufteilungspläne nach § 7 Abs. 4 WEG – auch AB-Pläne) ohne Paragraphen der
    BauPrüfVO, beim Vorbescheid mit dem Zusatz „nur, soweit für die Fragen erforderlich (§ 16 BauPrüfVO)“;
    „Ausschnitt“ zählt nicht als Schnitt), und – nur wenn die Projektdatei Geschosse kennt – „4 Geschosse, 3
    Grundrisse erkannt“ (Grundrisse für alle Geschosse, § 4 Abs. 2 BauPrüfVO NRW, beim Vorbescheid mit dem Zusatz zu §
    16; nicht beim Entwässerungsantrag, der nur die Geschosse mit Entwässerungsanlagen braucht; der einzige Weg, auch
    einen fehlenden letzten Grundriss zu bemerken).
  Die Zeile zeigt „8 Pläne · GP-01 bis GP-08 · GP-07 fehlt“, darunter „Pläne zeigen“ (die Liste je Nummer),
  „n Hinweise“ (öffnet die Liste und führt zu den Hinweisen) und die Quelle; ohne Pläne gibt es nichts aufzuklappen. In
  der Projektordner-Ansicht „Antrag“ stehen fehlende und noch nicht verschobene Pläne einzeln unter „Fehlt im
  Antragsordner“. Ein optionales Muster grenzt die Pläne ein.
- **Namensschema:** Kürzel (Planphasen BP, EP, GP, AP, AB; Antrags- und Verfahrensarten BAUA, BAUVA/BVA (Antrag auf
  Vorbescheid, § 77 BauO NRW 2018), BAUF (Genehmigungsfreistellung – kein Antrag, sondern Vorlage bei der
  Bauaufsichtsbehörde, § 63 Abs. 3 BauO NRW 2018 in der Fassung ab 01.09.2026), DENK, ABGE, ENTW), die Stellen der
  Teile im Dateinamen (Code, Phase bzw. Antragsart, Datum, Nummer; steht die Nummer vor dem Code, gilt ein Projektcode
  wie „BS9“ dort nie als Nummer) und „Index ab Leistungsphase“ kommen aus dem gemeinsamen Namensschema
  (`packages/core/src/namensschema.ts`): das der Projektdatei, sonst das des Büros (Projektordner › Einstellungen),
  sonst die Vorgabe. Antragsordner werden an den Antragsarten der Einstellungen und des Namensschemas erkannt;
  gleichwertige Schreibweisen (BVA für BAUVA) zählen als dieselbe Art – für die vorgeschlagene Vorlage und die Nummer
  des nächsten Nachtrags („BVA 2“). Ändert sich das Namensschema (in der Projektdatei oder im Projektordner-Tool,
  gelesen beim Zurückkommen ins Fenster), werden Antragsordner und Plansätze sofort neu erkannt. Eine in Formulare
  angelegte Projektdatei bekommt wie im Projektordner-Tool eine Kopie des Büro-Schemas.
- **Antragsvorlagen** (Einstellungen › Antrag & Export): benannte Zusammenstellungen von Katalogdokumenten je
  Antragsart – Vorgabe „Bauantrag“ (BAUA), „Bauvoranfrage“ (BAUVA), „Denkmalrechtliche Erlaubnis“ (DENK). Im Katalog
  hat jede Vorlage eine Spalte zum Ankreuzen; die Reihenfolge ist die des Katalogs. Beim Festlegen des Antragsumfangs
  wird die Vorlage zur Antragsart der aktiven Fassung vorgeschlagen („BAUA 2“ → Bauantrag, „BVA“ → Bauvoranfrage).
  Gibt es zur Art keine Vorlage (BAUF, ABGE, ENTW …), wird nichts vorgewählt – der Bauantrag passt dort nicht –, die
  Auswahl bittet um eine Wahl, „Antragsumfang festlegen“ ist bis dahin aus. „Dokument hinzufügen › Aus Vorlage
  ergänzen“ nimmt die fehlenden Dokumente einer weiteren Vorlage dazu. Die früheren „Vorgewählt“-Häkchen werden beim
  ersten Start zur Vorlage „Bauantrag“.
- **Reihenfolge ändern:** am Griff ⠿ ziehen – oder den Griff wählen und mit ↑/↓ verschieben – im Katalog, bei den
  Antragsvorlagen und Antragsmerkmalen und im Antragsumfang eines Projekts (dort auch per Rechtsklick „Nach oben“ /
  „Nach unten“).
- **Antragsmerkmale** (in den Antragsdaten): Gebäudeklasse, Sonderbau, Verfahren … – **je Antrag** gewählt, gelten sie
  für alle Formulare (Bedingungen in der Gliederung) und für den Antragsumfang des Antrags. Welche Merkmale es gibt,
  ihre Werte und die **Vorgabe für neue Anträge** (globales Preset) stehen in Einstellungen › Antrag & Export. Ein
  neuer Antrag übernimmt die Vorgaben einmalig; danach ist er unabhängig – spätere Änderungen am Preset oder an
  anderen Anträgen ändern ihn nicht. „Ansicht …“ stellt mit dem Ansicht-Editor eine eigene Ansicht zusammen (welche
  Merkmale in welcher Reihenfolge, in Abschnitten; die übrigen unter „weitere Merkmale – zeigen“).
- **Jeder Antrag hat seinen eigenen Satz:** Antragsmerkmale, Antragsumfang (mit Verknüpfungen), die manuellen
  Überschreibungen des Autofills und die „bereit“-Markierungen gehören zum Antrag (zur Antragsfassung, z. B. `BAUA
  2`). Mit der aktiven Fassung wechselt die App auch diese Angaben. Jeder Ordner einer Antragsfassung ist ein Antrag;
  beim ersten Öffnen werden fehlende angelegt (Angelegt-Datum aus dem Ordner). Angaben aus älteren Fassungen der App,
  die für das ganze Projekt galten, werden dabei einmalig in jeden vorhandenen Antrag übernommen.
- **Antragsstand bei der Einreichung:** Sobald ein Antrag als eingereicht gilt (erkannt oder von Hand), hält die App
  einmal fest, welche Dateien im Ordner des Antrags liegen – nur Name, Größe und Änderungszeit, **keine Kopie**
  (`stand` im Antrag der Projektdatei; ohne Archiv, Office-Sperrdateien, Thumbs.db und desktop.ini). Die festgehaltene
  Liste wird danach **nie verworfen, nie neu gebaut und nie gekürzt** – außer von Hand mit „Stand neu festhalten …“
  (siehe unten) –, so geht sie weder durch die Reihenfolge von Dateiaktionen noch durch einen Statuswechsel verloren.
  Gilt der Antrag als in Arbeit (Status von Hand, Nachweis verschoben), ist der Stand nur unsichtbar und gilt wieder,
  sobald der Antrag eingereicht ist. Ändert sich der Tag der Einreichung (von Hand berichtigt, ein älterer Nachweis
  taucht auf, der erste verschwindet), wird der Stand nur neu beschriftet – Status, Stand und Startseite zeigen so
  immer denselben Tag. Was nach dem Tag der Einreichung geändert wurde (etwa wenn die Einreichung erst später erkannt
  wird), zählt erst **beim Vergleich** nicht zur Einreichung und gilt dann als „neu“; das ist umkehrbar, wenn der Tag
  später wieder berichtigt wird.
  „Stand neu festhalten …“ in den Antragsdaten (mit Rückfrage, Gefahr-Knopf) ersetzt den Stand nach einem
  versehentlich gesetzten oder falsch erkannten Status – nicht nach einer Nachreichung – durch die Dateien, die jetzt
  im Ordner liegen: Erst wird der Ordner gelesen, dann wird in einem Schritt aus der aktuellen Projektdatei
  geschrieben; ist er gerade nicht erreichbar, ist der Knopf gesperrt bzw. bleibt der bisherige Stand (Fehlermeldung),
  und ändern sich während des Lesens Projekt, Antrag oder Status, wird abgebrochen. Ein so festgehaltener Stand gilt
  vollständig (auch was nach dem Tag der Einreichung, aber vor dem Festhalten neu dazukam oder geändert wurde); danach
  erscheint „Stand von … neu festgehalten – n Dateien“. Beide Tage stehen dann da – im Status „eingereicht am
  03.11.2026 … · Stand neu festgehalten am 20.11.2026 (n Dateien)“, in der Ablage „Eingereicht am 03.11.2026 – Stand
  neu festgehalten am 20.11.2026“ –, Abweichungen heißen „… seit dem Festhalten“. Angezeigt wird der echte Tag des
  Festhaltens, auch wenn eine Datei eine Änderungszeit in der Zukunft trägt (Uhr des Netzlaufwerks).
  **Vergleich:** In der Ansicht „Antrag“ steht „Eingereicht am … – Stand festgehalten“ (im Status „Stand vom …
  festgehalten (n Dateien)“). Jede **eingereichte** Datei auf oberster Ebene des Antragsordners wird mit dem Stand
  verglichen und ist gekennzeichnet, wenn sie danach **geändert** wurde („geändert seit der Einreichung“, gelb, mit
  Summe oben); verschwundene (gelöscht oder verschoben) zählen als **entfernt** (in der Summe, darunter bis zu drei
  Namen – bei mehr zwei und „n weitere – zeigen“ –, alle auch im Tooltip der Summe). Verglichen wird nur die oberste
  Ebene des Antragsordners: Nachreichungen gehören dorthin, nicht in Unterordner. Nach dem Neu-Festhalten lauten Summe,
  Etiketten und Tooltips durchgängig „… seit dem Festhalten“. Ausgenommen ist der **Nachweis der Einreichung** selbst
  (Antragsprotokoll, Eingangs- bzw. Empfangsbestätigung): Steht er im Stand oder trägt er im Namen keinen späteren Tag
  als den der Einreichung (Protokoll vom 03.11., erst am 04.11. gespeichert), ist er nie „neu“ oder „geändert“; ein
  späteres oder undatiertes Protokoll ist „neu“ – es ist kein Schreiben der Behörde und kann einen weiteren Antrag
  belegen. Was im laufenden Verfahren nachgereicht oder ausgetauscht wird, bleibt im selben Antrag und erscheint als
  „neu“ bzw. „geändert“ (§ 70 Abs. 2 Satz 4, § 71 Abs. 1 Sätze 6 und 7 BauO NRW 2018, § 7 BauPrüfVO NRW); eine neue
  Antragsfassung (Nachtrag) ist es erst nach Rücknahme bzw. Rücknahmefiktion (§ 71 Abs. 1 Satz 8), Ablehnung,
  Rückgabe der Unterlagen (§ 63 Abs. 4 Satz 3) oder bei einer Änderung nach der Entscheidung. Im Fall von § 63 Abs. 4
  Satz 4 werden die vorgelegten Unterlagen als Bauantrag im vereinfachten Verfahren (§ 64) behandelt – kein Nachtrag;
  das Büro führt den Vorgang als Antragsart BAUA weiter (Bürovorgabe), die Bauvorlagen dafür gehören schon in die
  Vorlage (§ 13 Abs. 2 Sätze 2 und 3 BauPrüfVO NRW, dort noch § 63 Abs. 6 Satz 4 alter Zählung).
- **Neue Dateien nach der Einreichung** sind „neu seit der Einreichung“ – außer sie kommen erwartungsgemäß
  (`nachEinreichungErwartet`, nur für neue Dateien). Grundsatz: **im Zweifel „neu“**, damit nachgereichte Bauvorlagen
  auffallen (§ 70 Abs. 2 Satz 4 und § 71 Abs. 1 Sätze 6 und 7 BauO NRW 2018, § 7 BauPrüfVO NRW). Deshalb gilt eine
  **Positivliste**: Erwartet ist eine Datei nur, wenn ihr Name ausschließlich aus einem Schreiben der Behörde besteht
  – einem Kernwort und sonst nur Zusätzen und Füllwörtern. Alles Weitere (eine Bauvorlage, ein Begleitwort des Büros,
  „Anlagen“, „Mängelbeseitigung“, „Behebung der Mängel“ oder eine Bescheinigung zu einem Schreiben, eine Präposition
  vor dem Kernwort wie „zur Genehmigung“ oder „gem. Nachforderung“, ein Bestand, ein Ortsname, eine Dokumentnummer,
  ein weiteres Antragsprotokoll – siehe oben) macht sie zu etwas Nachgereichtem.
  - **Kernwörter** (ganze Wörter, abschließend) – nach der Bürovorgabe die Genehmigung selbst (Baugenehmigung, Teil-,
    Nachtrags-, Änderungs-, Entwässerungsgenehmigung, auch die Fiktionsbescheinigung bzw. „Bescheinigung über den
    Eintritt der Genehmigungsfiktion“, § 74 Abs. 3 Satz 1 Nr. 4 BauO NRW 2018 i. V. m. § 42a Abs. 3 VwVfG NRW), die
    Empfangsbestätigung und Nachforderungen der Behörde (§ 71 Abs. 1 Satz 7; auch „Nachforderungen“,
    „Aufforderung(sschreiben)“). Über die Bürovorgabe hinaus ergänzt: Eingangsbestätigung (§ 71 Abs. 1 Satz 1), die
    Unterrichtung bzw. Mitteilung, Bestätigung oder Bescheinigung über die Vollständigkeit (§ 71 Abs. 1 Satz 9 BauO
    NRW 2018 in der Fassung ab 01.09.2026), Bescheide (Vor-, Bauvor-, Gebühren-, Ablehnungs-, Kosten(festsetzungs)-,
    Teil-, Änderungs-, Abweichungs-, Befreiungs-, Verlängerungsbescheid, „Bescheid über die Verlängerung (des
    Vorbescheids)“, „Bescheid über die Verlängerung der Geltungsdauer (der Baugenehmigung)“, § 75 Abs. 2), Ablehnung,
    Versagung, Anhörung(sschreiben), Gebühr(en), Gebührenrechnung bzw. -festsetzung,
    Kostenfestsetzung, (denkmalrechtliche) Erlaubnis, Abgeschlossenheitsbescheinigung, Rückgabe der Unterlagen (§ 63
    Abs. 4 Satz 3) sowie Mitteilung bzw. Erklärung der Gemeinde (Stadt) bei der Genehmigungsfreistellung (§ 63 Abs. 3
    Satz 5; § 63 Abs. 2 Satz 1 Nr. 4 i. V. m. Abs. 4 Satz 1). „Bescheinigung“ allein, „Verlängerung“ ohne Bescheid
    (auch „Vorbescheid Verlängerung“ – das kann der Antrag nach § 77 Abs. 1 Satz 3 sein) und Zusammensetzungen wie
    „Gebührenberechnung“ oder „Vollständigkeitserklärung“ zählen nicht.
  - **Füllwörter** – die Behörde (Kreis, Stadt, Gemeinde, Bauamt, Bauaufsicht, Denkmalbehörde …, ohne Ortsnamen),
    Verbindungswörter (eine Präposition aber nur hinter einem Kernwort, auch mit Datum, Aktenzeichen, Antragsart oder
    anderen Füllwörtern dazwischen: „Anhörung vor Ablehnung“, „Gebührenbescheid vom 20.11.2026 zur Baugenehmigung“), Projektcode (auch
    mit Bindestrich oder Unterstrich: „2025-014“, „2025_014“, „BS-9“) und Antragsart, ein Aktenzeichen („Az
    63-1234-26“), ein Datum ab dem Tag der Einreichung – so genau verglichen, wie es angegeben ist: Tag („12.11.2026“,
    „12-11-2026“, „12.11.26“, „261112“, „20261112“), Monat („11-2026“) oder Jahr; ein älteres meint einen beigefügten
    Bestand, eines mehr als ein Jahr in der Zukunft zählt nicht. Im Aktenzeichen entscheidet ab drei Zahlengruppen
    oder mit „Az“/„Nr.“ eine Jahresangabe am Ende („63-1234-72“: zweistellig, 2072 liegt in der Zukunft – Bestand;
    „63-1934-2026“: laufende Nummer 1934; „Az 1950-26“: Nummer 1950 aus 2026), sonst jede vierstellige Jahreszahl („Nr.
    1972“, „1972-26“). Dazu der Bezug „zum Bauantrag“ bzw. „Genehmigung (des)
    Bauantrags“ (nur das ganze Wort „Bauantrag“ – „Baugenehmigung Antrag“ ist der Antrag), feste Wendungen wie „von
    Unterlagen“, „an den Bauherrn“ und – nur hinter dem Schreiben der Behörde – „Aufforderung zur Behebung der Mängel“
    bzw. „zur Mängelbeseitigung“ und „Baugenehmigung mit Anlagen“, Zusätze wie „Nebenbestimmungen“ und „vereinfachtes
    Verfahren“. Trennzeichen (_ - ( ) , ;) zählen wie Leerzeichen, zerlegte Umlaute (macOS) werden zusammengeführt.
  - **Genehmigte Bauvorlagen** (§ 74 Abs. 4 Satz 5 BauO NRW 2018): Mit „genehmigt…“, „Genehmigungsvermerk“ oder
    „Grünstempel“ dürfen auch Planart, Geschoss (EG, OG, 1OG …), Richtung, Plannummer, Bau- bzw. Betriebsbeschreibung
    und – bei einem Schnitt – seine Bezeichnung („Schnitt A-A“) im Namen stehen („GP-03 Grundriss OG genehmigt“,
    „Baubeschreibung genehmigt“). Standsicherheitsnachweise erhalten keinen Genehmigungsvermerk – sie werden, soweit
    erforderlich (Ausnahmen § 68 Abs. 3 Satz 5), von Prüfsachverständigen bescheinigt und spätestens mit der
    Baubeginnanzeige eingereicht (§ 68 Abs. 3 Sätze 2, 3 und 6), „genehmigt Statik“ ist deshalb nachgereicht. Aufteilungspläne mit „gesiegelt“, „gestempelt“ oder „beglaubigt“.
    Verneint („ohne Grünstempel“, „nicht genehmigt“) oder mit weiteren Wörtern („Nachtrag zur genehmigten Planung“)
    ist es nachgereicht.
- **Ordner nicht erreichbar:** Ist der Ordner einmal nicht lesbar (Netz nach dem Aufwachen), bleiben „eingereicht“ und
  der Stand unverändert. Die Ablage warnt oben („Ordner gerade nicht erreichbar …“ mit „Erneut versuchen“, das während
  des Versuchs „Wird versucht …“ zeigt und danach „Letzter Versuch 14:32:05 – ohne Erfolg“), zeigt die zuletzt
  gelesene Liste und in der Summe „beim letzten Lesen: 1 neu, 1 entfernt seit der Einreichung (Ordner gerade nicht
  erreichbar)“ bzw.
  „Vergleich mit dem Ordner gerade nicht möglich“ statt „seitdem unverändert“ – ohne Liste von vorher zählt sie nichts
  und meldet nichts als fehlend. „Stand neu festhalten …“ ist dann gesperrt.
- **Eingereicht:** liegt im Ordner eines Antrags – auch in Unterordnern, Archivordner (`archiv`, `_archiv`)
  ausgenommen – ein Dokument, dessen Name `Antragsprotokoll`, `Eingangsbestätigung` oder `Empfangsbestätigung` (auch
  mit „ae“) enthält, gilt der Antrag als **eingereicht** – mit dem Datum im Dateinamen, sonst dem der Datei. Bei
  mehreren zählt der **erste Nachweis**: Maßgeblich ist der Eingang (§ 71 Abs. 1 Sätze 1 und 2 BauO NRW 2018), eine
  spätere Eingangsbestätigung bestätigt nur diesen Eingang – Status, Stand und Startseite zeigen denselben Tag.
  Angezeigt wird das Datum des Nachweises; den Tag des Eingangs laut Bestätigung im Zweifel prüfen. Das zeigt die App
  am Antrag (oben links), in der Navigation und im Menü der Fassungen; verschwindet die Datei, ist er es nicht mehr.
  Der Status lässt sich in den Antragsdaten **von Hand setzen**: „automatisch“ (die Erkennung), „in Arbeit“ oder
  „eingereicht“ mit Datum (`status` im Antrag; „in Arbeit“ behält das Datum, zurück auf „eingereicht“ gilt derselbe
  Tag). Das Datum wird erst beim Verlassen des Felds bzw. mit Enter übernommen – nur Tage ab 2000 und nicht in der
  Zukunft, Zwischenstände beim Tippen des Jahres zählen nicht; ein ungültiger Wert bleibt rot markiert mit Meldung
  stehen, Esc im Feld stellt den gespeicherten Tag wieder her, schlägt das Speichern fehl, sagt das Feld es (ein
  erneutes Enter versucht es noch einmal). Der **aktive Antrag** – derselbe, den das Projekt zeigt
  – steht zusätzlich in `meta.antrag` der Projektdatei und erscheint auf den Startseiten aller Apps als Marke auf der
  Projektkarte („BAUA 2 · eingereicht 03.11.2026“ bzw. „BAUA 2 in Arbeit“); die Startseite von Formulare zeigt ihn
  auch dann, wenn nicht alle Formulare lesbar sind.
- **Eingereicht = gesperrt:** Ist der aktive Antrag eingereicht, lassen sich die Formulare nur ansehen (Hinweis über
  dem Formular, „Antragsdaten …“), Antragsmerkmale, Antragsumfang, Export, „bereit“ und „Daten aktualisieren“ bleiben,
  wie eingereicht. **Nachgereicht** wird im laufenden Verfahren im selben Antrag: den Status vorübergehend auf „in
  Arbeit“ setzen (Tag und Stand bleiben), Formulare berichtigen bzw. Unterlagen ablegen, dann wieder „eingereicht“ –
  die Nachreichung erscheint als „neu“ bzw. „geändert seit der Einreichung“ (für nachgereichte oder ausgetauschte
  Bauvorlagen ist die Übereinstimmungserklärung nach § 7 BauPrüfVO NRW nötig). Ein **Nachtrag** („Nachtrag „BAUA 3“
  anlegen“ in den Antragsdaten: nächste Fassung, wird aktiv) erst nach Rücknahme bzw. Rücknahmefiktion, Ablehnung,
  Rückgabe der Unterlagen oder für eine Änderung nach der Entscheidung (siehe „Vergleich“ oben).
- **Dokumente mit Bedingung:** im Antragsumfang (Bearbeiten) und im Katalog („Nur wenn“; Antragsmerkmale mit und/oder
  wie oben) – etwa ein Nachweis nur bei Gebäudeklasse 3–5. Trifft sie nicht zu, ist das Dokument „nicht erforderlich“:
  kein Farbpunkt, kein grauer „Anlegen“-Eintrag, es zählt nicht mit.
- **Status** – immer gegen die aktive Fassung:
  - **grau – fehlt:** kein Formular im Projekt bzw. weder Quelle noch Datei;
  - **rot – nicht vollständig:** das Formular hat noch offene Angaben (Füllstand wie in der Gliederung);
  - **gelb – nicht (aktuell) exportiert:** ausgefüllt, aber keine PDF im Antragsordner oder die PDF ist älter als die
    letzte Änderung (Datei oder ungespeicherte Eingaben); bei externen: die Quelle ist neuer als die Datei. **Maßstab
    ist das Datum im Dateinamen** (`JJMMTT` wie „BS9 BAUA 261110 …“, auch `261110_1430`, `20261110`, `2026-11-10`,
    `10.11.2026`; ein Projektcode am Anfang zählt nicht): Haben Quelle und Datei eines, entscheidet es – gleiches
    Datum heißt gleicher Stand, auch wenn die Excel-Datei danach noch einmal gespeichert wurde. Hat nur eine Seite
    eines, wird es mit dem Tag der Änderungszeit der anderen verglichen (am selben Tag zählt die Änderungszeit); ohne
    Datum im Namen gilt wie bisher die Änderungszeit. Ebenso wählt die App bei mehreren passenden Dateien die neueste
    (`datumAusName`, `standVergleich` in `antrag.ts`);
  - **grün – aktuell:** die PDF liegt im Ordner der aktiven Fassung und ist nach der letzten Änderung entstanden.
- In der **Navigation** trägt jedes Formular des Antragsumfangs einen Farbpunkt; fehlende Formulare stehen grau
  hinterlegt darunter – ein **Klick legt das Formular an** (aus dem Vorlagenordner, sonst als Kopie des neuesten
  passenden Formulars aus einem anderen Projekt, jeweils mit geleerten Eingaben; schreibgeschützte Textfelder bleiben)
  und öffnet es – leere Felder mit Angaben aus der Projektkarte sind gleich befüllt. Die Suche meldet sich sofort
  („Suche eine Vorlage …“); in anderen Projekten sucht sie nur nach dem Namen (im Vorlagenordner auch nach der
  Kennung) und meldet, wenn sie nichts findet. Ein zweiter Klick legt kein zweites Formular an. Liegt das Formular
  schon im Projekt, nur anders benannt: Rechtsklick › „Vorhandenes Formular zuordnen“ (in den Antragsdaten der Knopf
  „Zuordnen“). **Doppelter Eintrag?** Passt der Titel eines fehlenden Eintrags zu einem Formular, das
  schon einem anderen Eintrag zugeordnet ist (z. B. „Baustatistik“ neben „Statistischer Erhebungsbogen“), steht dort
  „doppelt?“ – ein Klick legt dann nichts an, sondern öffnet am Eintrag ein Menü mit Zuordnen oder „Aus dem
  Antragsumfang nehmen“. Bei einem eingereichten Antrag sind Anlegen, Zuordnen und Entfernen ausgegraut (mit dem
  Hinweis „Antrag eingereicht“); der Tooltip sagt warum.
- Die **PDF** entsteht in der App aus dem Formular selbst – so, wie die Formularansicht es zeigt: A4-Blätter, Rahmen,
  Linien, Beschriftungen (auch gedreht), Feldinhalte und Kreuze, Bilder. Echter Text in den PDF-Standardschriften:
  Helvetica hat die Breiten von Arial, Courier die von Courier New – die Zeilen brechen an denselben Stellen um.
  Zeichen außerhalb von Windows-1252 werden zu „?“.

### Projektdatei (.oap) – die Projektstammdaten

Die Projektstammdaten liegen als JSON in der **Projektdatei (`.oap`)** im Projektordner – dem gemeinsamen
Projektarchiv von Flächenrechner, GRZ-Nachweis, Kostenermittlung und Projektordner (ZIP mit `manifest.json` und
`projekt.json`, die Stammdaten in `projekt.json` unter `meta`). Die frühere `Projektdaten.xlsx` wird nicht mehr
beschrieben.

| Projektkarte | Projektdatei (`meta`) |
|---|---|
| Bezeichnung der Baumaßnahme | `vorhaben` |
| Aktenzeichen | `aktenzeichen` |
| Grundstück: Straße/Nr., Ort | `adresse.strasse`, `adresse.ort` (bei „59494 Soest“ auch `adresse.plz`) |
| Gemarkung, Flur, Flurstück, Grundstücksfläche | `grundstueck.gemarkung`, `.flur`, `.flurstueck`, `.flaeche` (Zahl in m²) |
| Bauherr: Name/Firma, Vorname | `bauherr.name`, `bauherr.vorname` |
| Bauherr: Straße/Nr., PLZ, Ort | `bauherr.adresse.strasse`, `.plz`, `.ort` |
| Bauherr: Telefon, E-Mail | erster Eintrag der Art in `bauherr.kontakte` |

- **Welche Datei:** gesucht wird bis vier Ebenen tief im Projektordner; bei mehreren gilt die im Ordner der
  Berechnungen (Pfad enthält „Berechnung“), sonst die mit dem kürzesten Pfad, dann die zuletzt geänderte. In der
  Projektkarte lässt sich je Projekt eine andere wählen.
- **Schreiben:** frisch eingelesen und nur die geänderten Angaben in `meta` ersetzt – alles andere im Archiv
  (Pläne, Modelle, Quelldateien, Manifest) bleibt unverändert; vorher wird eine Sicherungskopie angelegt. Steht
  schon alles so in der Datei, wird nichts geschrieben. Hat der Flächenrechner das Projekt gerade offen, führt er
  die Änderung beim nächsten Speichern mit seinen eigenen zusammen.
- **Gemeinsamer Zugriff:** Lesen, gezielt Ändern und Anlegen laufen über `packages/core` (`projektdatei.ts`,
  `platform/projektordner.ts`) – dieselben Regeln in allen Apps. Ersetzt wird atomar, mit Sicherungskopie und nur,
  wenn die Datei seit dem Lesen niemand geändert hat (sonst einmal frisch gelesen und erneut versucht). Was andere
  Apps in `projekt.json` ablegen, bleibt erhalten.
- **Fehlt die Projektdatei:** kein Fehler – der **Stammdaten-Dialog** (gemeinsam in `packages/core`) fragt die
  Angaben ab, vorbelegt aus der Projektkarte, und legt sie an. Er erscheint, sobald die App die Datei braucht (beim
  Speichern der Projektkarte, beim Festlegen von Antragsumfang, Antragsfassung oder Antragsmerkmalen); im Projektkopf
  steht bis dahin „Keine Projektdatei – Stammdaten erfassen …“. Der Ort kommt aus den gemeinsamen Einstellungen
  (`oapPfad`) und gilt für alle Apps; eine bisher eigene Einstellung dieser App wird beim ersten Start dorthin
  übernommen. Platzhalter (Groß-/Kleinschreibung egal): `{Kürzel}` (auch `{nummer}`), `{Kurzname}`, `{Vorhaben}`,
  `{Datum}` (Tag des Anlegens als JJMMTT) und `{Jahr}` – etwa `Organisation/{Kürzel} {Datum} {Vorhaben}.oap` →
  `Organisation/BS9 261110 Neubau EFH.oap`; leere Angaben fallen weg. Die Einstellungen (Projektdatei) fügen
  Platzhalter per Knopf ein, zeigen ein Beispiel und warnen vor unbekannten Platzhaltern (sie blieben so im Namen).
- **Fehlt der Projektordner:** „Kein Projektordner – zuordnen …“ im Projektkopf (und automatisch, wenn er gebraucht
  wird): einen vorhandenen Ordner wählen oder im Stammordner einen neuen anlegen (Vorschlag „Kürzel Titel“), danach
  folgt bei Bedarf der Stammdaten-Dialog. Die Zuordnung gilt für alle im Büro (gemeinsamer Konfigurationsordner,
  Bereich `formulare`, `ordnerWahl`).
- **Angaben zum Antrag** stehen im Abschnitt `formulare` von `projekt.json`: `aktiveFassung` und `antraege` – je
  Fassung `angelegt`, `merkmale`, `umfang`, `felder` (Autofill), `bereit` und `eingereicht`; der zuletzt angelegte
  Antrag zusätzlich als Kurzfassung in `meta.antrag` (für die anderen Apps). Ein früheres `meta.merkmale` bzw.
  projektweite Angaben im Abschnitt werden gelesen und in die Anträge übernommen. Eine alte `formulare.json` im
  FORMA-Projekt wird noch gelesen und einmalig in die Projektdatei übernommen – sie selbst bleibt liegen und wird nicht
  mehr geschrieben.
- **Schreiben als Änderung:** Jeder Schreibvorgang liest die Projektdatei frisch und trägt nur ein, was er selbst
  geändert hat – je Antrag und Feld, Antragsmerkmale und Autofill je Eintrag, „bereit“ je Datei, den Antragsumfang je
  Eintrag und Feld (`aenderungAnwenden`, `bereitAnwenden`, `umfangAnwenden`): hinzugefügte Einträge hinter ihren
  Vorgänger, entfernte, geänderte Felder; beim Verschieben zieht nur der verschobene Eintrag um – nach oben gezogen vor
  den Eintrag, an dem er vorbeizog, nach unten dahinter. Was inzwischen anderswo gespeichert wurde (ein anderer
  Arbeitsplatz, ein gleichzeitiges Laden, das eigene vorige Speichern), bleibt, ebenso ein Antrag, den der Schreibende
  nicht kannte; ein woanders entfernter Eintrag bzw. ein woanders aufgehobener Antragsumfang kommt durch eine Änderung
  nicht zurück („Nicht geändert – der Eintrag „Lageplan“ ist inzwischen nicht mehr im Antragsumfang.“ bzw. „… –
  inzwischen gibt es keinen Antragsumfang mehr.“), und „Antragsumfang festlegen“ ersetzt keinen, der woanders
  inzwischen festgelegt wurde („Antragsumfang nicht festgelegt – inzwischen ist schon einer festgelegt; er ist jetzt
  geladen.“; ist die Ansicht dabei einer woanders aktiv gemachten Fassung gefolgt, nennt die Meldung beide Fassungen;
  ist inzwischen ein anderes Projekt bzw. eine andere Projektdatei gewählt, nennt sie das Projekt bzw. die Datei).
  „Antragsumfang aufheben …“ hebt ihn ganz auf – auch Einträge, die woanders inzwischen dazukamen. Ganz nach oben bzw.
  unten gezogen bleibt ganz oben bzw. unten. Kennungen im Antragsumfang werden beim Lesen eindeutig gemacht. Ein
  späteres Laden der Projektdatei gilt vor einem früheren, das erst danach zurückkommt. Das Laden ergänzt so nur
  fehlende Anträge, nie ersetzt es Vorhandenes.
  - **Bindung:** Geschrieben wird nur in die Projektdatei, aus der die Angaben stammen, und nur für das Projekt, in dem
    die Änderung begonnen hat. Wird währenddessen ein anderes Projekt geöffnet, bricht die Änderung mit Meldung ab
    (Formular anlegen bzw. hinzufügen sagen, was schon geschehen ist: „angelegt, aber nicht zugeordnet …“); wird eine
    andere `.oap` gewählt (auch umbenannt oder neu angelegt nach „nicht lesbar“), lädt die App neu und bindet sich an
    sie. Ist die Datei gerade nicht lesbar (Netz nach dem Aufwachen), liest die App sie beim Speichern erneut und
    meldet sonst „… nicht gespeichert: Die Projektdatei ist gerade nicht lesbar“; ist sie wieder lesbar, verschwindet
    die Fehlermeldung. Fehlt sie, obwohl ihr Ordner lesbar ist (gelöscht, verschoben), löst die App die Bindung – dann
    gilt eine andere `.oap` bzw. der Stammdaten-Dialog bietet das Anlegen an; ein nicht erreichbares Netzlaufwerk
    zählt nicht als gelöscht. Eine eigene Meldung „… nicht gespeichert“ verschwindet, sobald der nächste Versuch
    gespeichert hat.
  - **Projektordner zuordnen, Projektdatei anlegen:** Nach dem Zuordnen eines Projektordners werden vorhandene Angaben
    zum Antrag geladen statt überschrieben; zeigt das Projekt danach eine andere Antragsfassung (aus dem
    Projektordner) als die, für die die Änderung gedacht war, wird sie nicht dorthin geschrieben, sondern gemeldet.
    Nach dem Anlegen einer Projektdatei über den Stammdaten-Dialog kommt die Änderung samt der Fassung, für die sie
    gedacht war (als aktive), in die neue Datei („Projektdatei angelegt – Antrag BAUA 2 ist das Ziel des Exports.“).
    Wird ein Dialog abgebrochen (auch nacheinander), heißt es „Projektordner nicht zugeordnet – die Änderung ist
    nicht gespeichert.“ bzw. „Projektdatei nicht angelegt – …“; nach „Neue Fassung „BAUA 3“ anlegen“ bzw. „Nachtrag
    „BAUA 3“ anlegen“ sagt die Meldung, dass der Ordner schon angelegt ist („Ordner BAUA 3 angelegt, aber nicht als
    aktive Antragsfassung gespeichert – keine Projektdatei angelegt.“; ohne Projektordner entsteht kein Ordner).
  - **Ein Antrag wird geöffnet:** Während ein Fassungswechsel lädt (auch von außen) – bis Umfang, Zeilen und Dateien
    der neuen Fassung da sind –, sind die Antragsdaten nicht bedienbar; dauert es länger als einen Moment, sind sie
    abgeblendet, und neben der Fassungswahl steht „Antrag BAUA wird geöffnet …“. Auch „Als bereit markieren“, die
    Menüs der fehlenden Formulare und „Antragsdokument“ in der Navigation sowie Verknüpfen in der Ablage sind so lange
    ausgegraut („Antrag wird geöffnet“). Änderungen am Antrag werden abgewiesen („Nicht entfernt – Antrag BAUA wird
    gerade geöffnet; bitte gleich noch einmal versuchen.“, „Nicht als bereit markiert – …“), ein PDF-Export verknüpft
    dann nicht; Autofill-Zustände kommen in den Antrag, der geöffnet wird. Ein Neu-Prüfen der bisherigen Fassung gilt
    danach nicht mehr. Macht ein anderer Arbeitsplatz eine andere Fassung aktiv, folgt die Ansicht beim nächsten
    Speichern bzw. Lesen; passen Ansicht und aktive Fassung einmal nicht zusammen, lädt die App den Antrag neu (die
    Sperre bleibt nicht hängen). Innerhalb derselben Fassung werden die Zeilen nach jedem Speichern sofort neu
    berechnet (die gelesenen Dateien gelten weiter) – Ziehen und ↑/↓ gehen so immer von der angezeigten Reihenfolge
    aus.
  - **Festgehaltene Fassung:** Änderungen am Antragsumfang aus Zeilen und Menüs – Zeilenmenü, „Formular anlegen“,
    „Zuordnen“, Datei verknüpfen bzw. „Verknüpfung lösen“, Bearbeiten (Felder und „Aus dem Antragsumfang nehmen“),
    Ziehen der Zeilen und ↑/↓, „Dokument hinzufügen“, die Menüs in der Navigation – lesen den Umfang erst beim
    Speichern (`umfangAendern`), und nur, wenn noch die Fassung der Zeile bzw. des Menüs angezeigt ist und es den
    Eintrag noch gibt; verschoben wird nach Kennung. Sonst ändert sich nichts, und die Meldung sagt warum („Nicht
    entfernt – inzwischen ist Antrag BAUA angezeigt.“, „Nicht verschoben – der Eintrag „Lageplan“ ist inzwischen nicht
    mehr im Antragsumfang.“, „Nicht hinzugefügt – inzwischen gibt es keinen Antragsumfang mehr.“); ist ein Eintrag
    beim Entfernen schon weg, heißt es „„Lageplan“ ist schon nicht mehr im Antragsumfang.“. „Als bereit markieren“
    gilt ebenso nur für die Fassung der Liste bzw. des Menüs. „Antragsumfang aufheben …“ fragt nach und hebt nur auf,
    wenn danach noch der Antrag der Rückfrage angezeigt ist (sonst „Antragsumfang nicht aufgehoben – inzwischen ist
    Antrag BAUA angezeigt.“). Die Textfelder (Nr., Titel, Formular, Ordner der Quelle, Muster) speichern beim Verlassen
    bzw. mit Enter, Esc verwirft – ein Schreiben statt eines je Taste; bis das Speichern zurück ist, bleibt das
    Getippte stehen, eine Korrektur währenddessen wird danach gespeichert (das zuletzt Bestätigte gilt). Sie gelten für
    die Fassung, in der getippt wurde – zeigt das Projekt inzwischen eine andere, sagt das Feld es gleich („Getippt für
    Antrag BAUA 2 – inzwischen ist Antrag BAUA angezeigt; Esc verwirft.“), gespeichert wird dann nicht. Verschwindet die
    Zeile mit ungespeicherter Eingabe, sagt eine Meldung es. Scheitert das Speichern (Schreibfehler, Antrag wird gerade geöffnet), bleibt das Getippte rot markiert
    stehen („Nicht gespeichert – Enter im Feld versucht es erneut, Esc verwirft.“); ein leerer Titel wird nicht
    gespeichert („Der Titel darf nicht leer sein – Esc stellt „Lageplan“ wieder her.“). Esc während eines laufenden
    Speicherns verwirft nur die Eingabe im Feld – das Speichern läuft zu Ende, danach zeigt das Feld den gespeicherten
    Wert.
  - **Nachholen:** Beim Anlegen bzw. Hinzufügen eines Formulars nennt die Meldung den Weg, wenn das Zuordnen nicht
    ging („Bitte später in den Antragsdaten von BAUA 2 über „Zuordnen“ nachholen.“, bei einem schon vorhandenen
    Formular „Bitte später zu Antrag BAUA 2 wechseln und per Rechtsklick auf „…“ in der Navigation ›
    „Antragsdokument“ › „Bauantrag“ zuordnen.“); findet die Zeile das Formular ohnehin über den Namen, heißt es „…
    findet es über den Namen“.
  - **Eingereicht:** Ändernde Menüpunkte sind ausgegraut, mit dem Hinweis „Antrag eingereicht“ (Navigation,
    Zeilenmenü der Antragsdaten, Ablage, „Als bereit markieren“); ändernde Knöpfe sind ausgegraut mit dem Grund im
    Tooltip („Formular anlegen“, „Zuordnen“, „PDF“, Nr., „bereit“) bzw. ausgeblendet (Bearbeiten, Datei verknüpfen,
    Ziehen, „Dokument hinzufügen“, „Antragsumfang aufheben …“).
  - **Verknüpfen in der Ablage** prüft zuerst, ob noch die Fassung des Menüs angezeigt ist (sonst „Nicht kopiert – …“
    bzw. „Nicht verknüpft – inzwischen ist Antrag BAUA angezeigt.“, je nach Menüpunkt) oder gerade ein Antrag
    geöffnet wird, dann die Sperre; erst danach wird kopiert. Gemeldet wird nach dem Speichern, ob verknüpft wurde
    (sonst: „kopiert, aber nicht verknüpft … Bitte später die Kopie in BAUA 2 über „Mit Antragsdokument verknüpfen“
    verknüpfen, nicht noch einmal kopieren.“); die Zusage „verknüpft wird nach dem Anlegen der Projektdatei“ steht
    nur, solange der Dialog offen ist, und wird beim Abbrechen zurückgenommen.
- **Alte `Projektdaten.xlsx`:** wird noch gelesen (`Organisation\<Kürzel> Projektdaten.xlsx`); weichen ihre
  Angaben von der Projektkarte ab, übernimmt „In die Projektkarte übernehmen“ sie – beim Speichern landen sie dann
  in der Projektdatei.

### Katasterpläne

Die Katasterpläne (QGIS) sind ins Projektordner-Tool umgezogen – siehe [projektordner.md](projektordner.md#katasterpläne).

### Dokumente ansehen und bearbeiten

Dokumente aus dem Projektordner erscheinen in der App mit Kopfzeile (Art, Name, Ordner, „Neu laden“, „Mit
Programm öffnen“). Bearbeitet wird so, dass alles, was nicht geändert wurde, in der Datei bleibt, wie es war:

- **PDF:** alle Seiten, Zoom (Seitenbreite oder 50–200 %). Hat die PDF **Formularfelder**, lassen sie sich direkt
  auf der Seite ausfüllen. Mit **Text** und **Kreuz** lässt sich auch in PDFs ohne Formularfelder etwas eintragen:
  Werkzeug wählen, auf die Stelle klicken (Text: Eingabe, beginnt an der Stelle; Kreuz: mittig darauf). Vorgemerkte
  Einträge sind markiert, ein Klick entfernt sie wieder. Gespeichert wird als **Nachtrag** ans Ende der Datei
  (Freitext-Anmerkungen mit Erscheinungsbild, druckbar) – der ursprüngliche Inhalt bleibt Byte für Byte erhalten.
  Vorhandenen Text einer PDF ändern geht nicht; er lässt sich nur mit neuem Text ergänzen.
- **Excel** (`.xlsx`, `.xlsm`): Blätter mit Spalten- und Zeilenköpfen, Formaten (fett, kursiv, Füllung, Rahmen,
  Zahl- und Datumsformate), verbundenen Zellen und Spaltenbreiten. Zelle wählen und tippen (oder Doppelklick, F2),
  Enter/Tab übernimmt, Entf leert; Zahlen mit Komma, Formeln in Excel-Schreibweise mit „=“ (englische
  Funktionsnamen, z. B. `=SUM(B2:B5)`). Gespeichert werden nur die geänderten Zellen; Diagramme, Makros und
  alles andere bleiben. Excel rechnet beim nächsten Öffnen neu.
- **Word** (`.docx`): das Dokument wie auf Papier (Absätze, Überschriften, Aufzählungen, Tabellen, Platzhalter für
  Bilder). **Text bearbeiten** macht den vorhandenen Text direkt änderbar – für Korrekturen, Namen, Daten; neue
  Absätze oder Formatierungen gibt es nicht. Gespeichert werden nur die geänderten Textstücke.
- **Bilder** werden angezeigt.
- Ist eine Datei in **Excel oder Word geöffnet** (Besitzerdatei `~$…`), wird sie nur angezeigt. Hat jemand sie
  **seit dem Öffnen geändert**, wird nicht gespeichert – „Neu laden“ liest die neue Fassung, die eigenen
  Bearbeitungen in Excel und Word bleiben als Entwurf erhalten (bis zum Schließen der App; die Datei ist in der
  Seitenleiste mit ● markiert).
- **Ungespeicherte Bearbeitungen in Dokumenten** gelten nur für diese Sitzung: Die Titelleiste zeigt dann ●, und beim
  Beenden bzw. vor einem Update fragt die App nach. Eingaben in einer **PDF** hält nur die Ansicht – wer sie verlässt
  (andere Ansicht, anderes Dokument, Formular oder Projekt, „Neu laden“), wird gefragt: „Speichern / Nicht speichern /
  Abbrechen“.
- Vor jedem Speichern legt die App eine **Sicherungskopie** der bisherigen Fassung im App-Ordner an
  (`%LOCALAPPDATA%\de.pendzialek.formulare\Sicherungen`, die letzten 200).

### Sperren

FORMA legt neben jedes geöffnete Formular eine Sperrdatei (gleicher Name, Endung `.frmtmp`). Die App hält es
genauso:

- Ist das Formular frei, legt die App eine eigene Sperrdatei im selben Format an (`InGebrauch` = ihre
  Prozessnummer) und **hält sie offen**, solange das Formular geöffnet ist (andere dürfen lesen, nicht löschen).
  Beim Schließen bzw. Beenden wird sie entfernt – nur, solange sie noch genau den eigenen Inhalt hat.
- **Nach einem Absturz:** Jede eigene Sperre ist im Speicher der App vermerkt. Beim nächsten Start (und beim
  Öffnen des Formulars) wird sie gelöscht, wenn sie noch den eigenen Inhalt hat und kein Programm sie offen hält.
- Liegt beim Öffnen eine fremde Sperrdatei da, wird das Formular **nur angezeigt**. Die App prüft, ob die Sperre
  noch in Gebrauch ist, und zeigt das Ergebnis mit Benutzer, Rechner und Zeitpunkt:
  - **In Gebrauch:** Ein Programm hält die Datei offen (diese App tut das immer, FORMA womöglich auch) – oder
    auf diesem Rechner läuft das Programm mit der eingetragenen Prozessnummer noch (FORMA/SJ OFFICE, Formulare).
  - **Verwaist:** Auf diesem Rechner läuft kein Programm mit der Nummer mehr bzw. die Nummer gehört einem
    anderen Programm – oder die Sperre eines anderen Rechners ist älter als 12 Stunden und nicht offen gehalten.
  - **Nicht prüfbar:** Sperre eines anderen Rechners, jünger als 12 Stunden – ob das Formular dort noch offen ist,
    lässt sich von hier nicht feststellen.
- **Erneut prüfen** bewertet die Sperre neu; ist sie inzwischen weg, wird das Formular zum Bearbeiten geöffnet.
- **Sperre aufheben …** löscht die Sperrdatei nach einer Bestätigung (mit Warnung, wenn sie nicht sicher verwaist
  ist) und öffnet das Formular zum Bearbeiten. Hält ein Programm die Datei offen, geht das nicht. Gelöscht wird
  nur, wenn die Datei noch genau den angezeigten Inhalt hat.
- **Übersicht** (🔒 über den Formularen): alle Sperrdateien des Projekts, auch solche ohne Formular, mit
  Bewertung und „Aufheben …“.

### Einstellungen sichern und übertragen

Die Einstellungen liegen im Speicher der App auf diesem Rechner. Unter **Einstellungen › Sichern & Übertragen**
lassen sie sich als JSON-Datei exportieren (`Formulare-Einstellungen JJMMTT.json`) und wieder einspielen – zum
Sichern, für einen anderen Rechner oder für Kolleginnen und Kollegen. Entwürfe, Verlauf und Formularinhalte
gehören nicht dazu.

| Bereich | Schlüssel | beim Einspielen |
| --- | --- | --- |
| Gliederung der Formulare (Titel, Gruppen, Bedingungen) | `formulare:profile` | ergänzt – gleiche Formulare ersetzt |
| Antragsmerkmale | `formulare:merkmale` | ersetzt |
| Antragsdokumente (Katalog) | `formulare:katalog` | ersetzt |
| Antrag & Export | `formulare:export` | ersetzt |
| Antrag & Export: Abweichungen je Projekt | `formulare:export-projekte` | ergänzt – gleiche Projekte ersetzt |
| Bürostammdaten | `formulare:stammdaten` | ersetzt |
| Ordner, angezeigte Pfade, Projektdatei, Ansicht | `formulare:einstellungen` | ersetzt – zunächst nicht angehakt (Pfade dieses Rechners) |

Beim Einspielen zeigt die App, was in der Datei steht, und übernimmt nur die angehakten Bereiche. Gliederungen
werden dabei geprüft; Ungültiges fällt weg. Die Datei hat die Form
`{ "art": "formulare-einstellungen", "version": 1, "app": "0.11.0", "erstellt": "…", "daten": { "<Schlüssel>": … } }`
und eignet sich auch als Vorlage für die Vorgaben der App.

### Web-Version

Ohne Desktop-App gibt es keinen Zugriff auf Ordner: Die Web-Version öffnet ein einzelnes Formular über den
Dateidialog, und „Herunterladen“ liefert die geänderte Fassung als Datei („heruntergeladen als … – bitte die neue
Datei weiterverwenden“). Sperrdateien, Projektkarte und Projektordner gibt es dort nicht; deshalb führt auch kein
Knopf in die Projektkarte (ohne Projekt bliebe sonst nur „Formular öffnen …“).

## Dateiformat

Ein FORMA-Projekt ist ein Ordner:

| Datei | Inhalt |
|---|---|
| `*.frmsjf` | ein Formular je Datei (Text, ASCII, CRLF) |
| `_archiv/` | ältere Fassungen eines Formulars (z. B. Anlage I-3 von 2024, als die von 2026 kam) |
| `sj_prokarte.sdb` | Projektkarte (SQLite, Texte UTF-8): Projektdaten, Beteiligte, Grundstück … – `.bak` ist die Sicherung |
| `sj_office.ini` | Projekttitel (`[Allgemeines]`, `Text=`, Windows-1252) |
| `*.frmtmp` | Sperrdatei, solange das Formular geöffnet ist (INI, Windows-1252) |
| `formulare.json` | nicht von FORMA, früher: Angaben dieser App zum Projekt – stehen jetzt im Abschnitt `formulare` der Projektdatei (`.oap`); eine vorhandene wird nur noch gelesen und übernommen |

### Formulardatei (`.frmsjf`)

Signatur und Kopf, dann je Seite eine **Delphi-Formulardefinition im Textformat (DFM)** – ohne Zeilenumbrüche
zwischen den Abschnitten, und am Ende ohne Zeilenumbruch:

```
[*SJ_FORMULAR (w) by SJ GmbH Aachen#][*SJ_BEGIN#][*SJ_MODIFIED#]nw010005[*SJ_VERSION#]2026I[*SJ_END#]
[*S01#][*SJ_BEGIN#]object Form1_2: TFRMABSeiteForm
  …
end
[*SJ_END#][*S02#][*SJ_BEGIN#]object Form2: TFRMABSeiteForm
  …
end
[*SJ_END#]
```

- `SJ_MODIFIED` enthält die Formularkennung (`nw010005` = NRW, Formular 005), `SJ_VERSION` den Stand.
- Layout und eingetragene Werte stehen gemeinsam in den Definitionen: Textfelder (`TMemo`) als
  `Lines.Strings = ('…' '…')`, Kästchen (`TCheckBox`) als `Checked = True` und `State = cbChecked`. Leere
  Felder und leere Kästchen haben diese Eigenschaften gar nicht.
- Zeichenketten schreibt Delphi in Stücken von höchstens 64 Zeichen (mit ` +` verbunden); druckbare
  ASCII-Zeichen in Hochkommas, alles andere als `#nnn` (UTF-16), z. B. `'Bauaufsichtsbeh'#246'rde'`.
- Die Eigenschaften stehen in Delphis fester Reihenfolge: `Lines.Strings` nach `Font.*` und vor `ParentFont`,
  `Checked` nach `Caption`, `State` vor `TabOrder`.
- Die Einrückung ist unregelmäßig (FORMA setzt die Dateien aus Bausteinen zusammen) und wird deshalb nie neu
  berechnet: Jede Eigenschaft behält ihre Originalzeilen, nur geänderte werden neu erzeugt.
- In Textfeldern mit Zeilenumbruch speichert FORMA jede *angezeigte* Zeile einzeln – ein langer Name kann
  also auf zwei Zeilen verteilt sein.
- Leere Vorlagen, die FORMA noch nie gespeichert hat, tragen die Kennung ohne Marke
  (`[*SJ_BEGIN#]nw010005[*SJ_VERSION#]2026I[*SJ_END#]`), und manche Komponenten haben keinen Namen
  (`object TLabel`).
- Was ganz außerhalb seines Rahmens liegt (etwa ein Textfeld mit negativem `Top`), schneidet Delphi ab – die App
  zeigt es nicht und zählt es nicht. Gesperrte Textfelder (`Enabled = False`) rechnet FORMA aus (Summen, Kopfzeilen
  der Folgeblätter); man trägt dort nichts ein, und sie zählen nicht für den Füllstand.
- Beschriftungen: über dem Feld (Höhe nach den Textzeilen, nicht nach `Height`), sonst links daneben; bei
  Kästchen rechts daneben – außer in Zeilen, deren Beschriftungen links vor den Kästchen stehen
  („1 ☐ 2 ☐ 3 ☐“). „☐ 3-fach Lageplan …“ ergibt „Lageplan … (3-fach)“; Tabellenzellen bekommen den Spaltenkopf.
- Alle bekannten Seiten sind 700 Pixel breit. Beschriftungen in Arial, Textfelder in Courier New; gedrehte
  Beschriftungen (`TExtendedLabel`, `Angle = 90/270`) geben Breite und Höhe ungedreht an. Bilder (`TImage`)
  stehen als `Picture.Data` in der Datei (Klassenname, bei `TBitmap` Länge + Windows-BMP).

### Projektkarte (`sj_prokarte.sdb`)

SQLite (`PRAGMA encoding = UTF-8`), Tabellen `Allgemeines` (Kennung `[*SJ_PJK (w) by SJ GmbH Aachen#]`),
`Gruppe` (`GruppeID`, `GruppeTyp`, `GruppeText` – z. B. 101 Projektdaten, 201 Bauherr, 202 Entwurfsverfasser,
206 Bauvorlageberechtigter, 231 Bauaufsichtsbehörde, 301 Baugrundstücksdaten) und `Inhalte` (`GruppeID`,
`InhalteID`, `InhalteTyp`, `Ganzzahl`, `Titel`, `Texte`, …; Schlüssel ist GruppeID + InhalteID + InhalteTyp).
Adressgruppen (Typ 1) haben dieselben Einträge: 10 Branche, 20 Titel, 30 Vorname, 40 Name/Firma, 70 Straße/Nr.,
80 Postfach, 90 PLZ, 110 Ort, 130 Telefon, 170 E-Mail, 210 Anrede, 220 Bevorzugter Kontakt …

| `InhalteTyp` | Art | `Texte` | `Ganzzahl` |
|---|---|---|---|
| 1 / 2 | Text, einzeilig / mehrzeilig (CR LF) | der Text | – |
| 4 | Auswahlliste | die Möglichkeiten zeilenweise, **erste Zeile leer** | Nummer der Wahl ab 0 **ohne** die leere Zeile (`NULL`/−1 = keine) |
| 8 | Optionen | die Möglichkeiten zeilenweise | Nummer der Wahl ab 0 (−1 = keine) |
| 16 | Kästchen | Beschriftung (z. B. „Wärmeschutz“) | 1 = angekreuzt |

Bei Auswahl, Optionen und Kästchen schreibt die App nur `Ganzzahl`; die Möglichkeiten in `Texte` bleiben unverändert.
Texte stehen als UTF-8 darin; ältere Einträge in Windows-1252 werden als solche gelesen. Geschrieben wird ein Eintrag
nur, wenn er noch genau die gelesenen Bytes enthält – bei einem Windows-1252-Text vergleicht die App deshalb mit
dessen Rohbytes (neu geschrieben wird immer UTF-8).
Die leere erste Zeile der Auswahlliste steht für „keine Angabe“ (−1); `Ganzzahl` 0 ist die erste Möglichkeit danach.
So liest SJ Office die Projektkarte: Bei „Land“ ist 0 „NRW“ und 1 „RLP“, bei der Anrede 1 „Sehr geehrter Herr“. Bis
Formulare 0.35 zählte die App die leere Zeile mit – dort gewählte Auswahlen erscheinen jetzt (wie in SJ Office) um
eine Möglichkeit versetzt und sind einmal neu zu wählen (vor „Daten aktualisieren“ in angefangenen Formularen); eine
dadurch außerhalb der Liste liegende Nummer zeigt die Auswahl als „(Auswahl nicht in der Liste – bitte neu wählen)“.

Jede Formularseite enthält eine versteckte Liste **`lstbxProkarte`**, die Textfeldern Einträge zuordnet:

```
Memo7=K0201aedt040;0201aedt030                 → „Name, Vorname“ des Bauherrn
Memo2=K0201aedt010;L0201aedt030;R0201aedt040;K0201aedt070;"Postfach ";K0201aedt080;L0201aedt090;0201aedt110
```

Teile sind durch `;` getrennt: `<Trenner><Gruppe 4-stellig><Art><Eintrag 3-stellig>` oder ein Text in
Anführungszeichen. Die Trenner stehen hinter einem *gefüllten* Wert: `K` = „, “, `L` = Leerzeichen, `R` = neue
Zeile (in einzeiligen Feldern ein Leerzeichen). Ein Text erscheint nur, wenn der Wert danach gefüllt ist. Die App
lässt Trenner am Ende weg (FORMA lässt dort manchmal ein Komma stehen).

### Umsetzung

`src/forma/` ist der Formatkern: `dfm.ts` liest DFM-Text verlustfrei, `delphi.ts` schreibt Zeichenketten
wie Delphi, `formular.ts` liest und schreibt Formulardateien und ändert Textfelder und Kästchen,
`felder.ts` leitet Beschriftung, Abschnitt und Zeilen eines Felds aus der Lage ab (FORMA kennt keine Verknüpfung),
`darstellung.ts` Farben, Maße, Drehung und Bilder für die Formularansicht, `pdf.ts` die PDF aus dem Formular
(eigener PDF-Schreiber, Zeichenbreiten der Standardschriften in `schriftbreiten.ts`, Bitmaps/PNG/JPEG),
`projektkarte.ts` die Zuordnung Feld → Projektkarte, `sperre.ts` liest und schreibt Sperrdateien.
`antrag.ts` ist die Logik von Antrag und Export (Namensvorlage, Fassungen, Katalog, Zuordnung, Status),
`antragStore.ts` der Zustand dazu (Einstellungen, Abschnitt `formulare` der Projektdatei, Export, Formular anlegen), `dateiAktionen.ts`
die Dateibefehle des Kontextmenüs. `autofill.ts` ist das Autofill mit Zustand (Auto-Wert, Überschreibung,
Aktualisieren), `aktualisieren.ts` führt es in offenen und nicht geöffneten Formularen aus (Dialog, Rückfrage nach
dem Speichern der Projektkarte). `vorgabe.ts` legt die Vorgaben der App (`vorgaben/`) unter die eigenen
Einstellungen der Formulare und speichert nur die Abweichungen. `dokumente/` liest und ändert PDF (pdf.js),
Excel und Word (eigener XML-Leser mit Lage im Quelltext, ZIP über fflate; XML-Leser, ZIP und Excel liegen inzwischen
gemeinsam in `packages/core/src/dokumente/`, hier nur weitergereicht). `verlauf.ts` ist der Verlauf, `ablage.ts` die
Zuordnung der echten Projektordner.

Die Tauri-Hülle (`src-tauri/src/lib.rs`) ersetzt nur vorhandene `.frmsjf` sowie vorhandene PDF-, Excel- und
Word-Dateien (atomar über eine temporäre Datei, Dokumente nur mit Sicherungskopie und nicht, solange Office sie
geöffnet hat), prüft
Sperrdateien (offen gehalten? Prozess auf diesem Rechner?),
legt nur `.frmtmp` an bzw. löscht sie und ändert in `sj_prokarte.sdb` nur vorhandene Einträge – in einer
Transaktion, und nur, wenn jeder noch den Wert hat, von dem die Änderung ausgeht. Neu anlegen darf sie Dokumente
(PDF, Excel, Word), Formulare (`.frmsjf`, nie überschreibend) und Ordner; die Projektdatei (`.oap`) schreiben die
gemeinsamen Befehle aus `packages/core/tauri/commands.rs`;
kopieren und umbenennen nur ohne zu überschreiben (Dateien von FORMA ausgenommen), löschen nur von Hand und nach
einer Sicherungskopie – Formulare nur ohne Sperrdatei daneben, Sperrdateien, Projektkarte und Projekttitel nie. Beim Auflisten liefert sie die Änderungszeit mit (für die Vollständigkeitsprüfung).

## Kompatibilitätstests

Die echten FORMA-Dateien sind das Orakel: Jede Zeichenkette, jedes ausgefüllte Textfeld und jedes Kreuz darin
hat FORMA geschrieben. `formular.test.ts` prüft für jede Datei,

- dass sie unverändert byte-genau zurückgeschrieben wird,
- dass jede Zeichenkette genau wie von Delphi kodiert wird,
- dass jedes Textfeld nach Leeren und erneutem Füllen und jedes Kästchen nach Umschalten und Zurückschalten
  wieder die Originaldatei ergibt (damit stimmen auch die Einfügepositionen).

`projektkarte.test.ts` liest die echte Projektkarte (über `node:sqlite`) und prüft, dass die von FORMA
ausgefüllten Felder sich aus ihr ergeben (im Referenzprojekt 29 von 37; die übrigen sind von Hand geändert).
Die Rust-Tests der Hülle (`cargo test`, mit `SJFORMA_REF`) schreiben eine Kopie jeder echten Projektkarte
unverändert zurück und prüfen „alle oder keiner“.

Versioniert ist nur eine anonymisierte Musterdatei (`src/__fixtures__/muster.frmsjf`). Echte Projekte mit
Kundendaten gehören nach `.ref/` im Repository (nicht eingecheckt) oder in den Ordner aus `SJFORMA_REF`:

```bash
SJFORMA_REF=/pfad/zu/forma-projekten npx vitest run --project formulare
SJFORMA_REF=/pfad/zu/forma-projekten cargo test --manifest-path apps/formulare/src-tauri/Cargo.toml
```

## Offen

- **Gegenprobe in FORMA:** eine hier gespeicherte Datei und Projektkarte in FORMA öffnen, prüfen und dort wieder
  speichern – insbesondere eine hier gewählte Anrede (Zählweise der Auswahlliste).
- **`InGebrauch` in der Sperrdatei:** Bedeutung bei FORMA unbekannt; die App trägt ihre Prozessnummer ein. Ist
  es auch bei FORMA die Prozessnummer, erkennt die App verwaiste FORMA-Sperren auf demselben Rechner sicher.
  Zu prüfen: Hält FORMA seine Sperrdatei offen (dann zeigt die App sie als „In Gebrauch“)?
- **Neue Formulare und neue Formularfassungen:** sauber nur mit der Formularbibliothek von FORMA. Bis dahin legt die
  App fehlende Formulare aus einem Vorlagenordner bzw. als geleerte Kopie aus einem anderen Projekt an – zu prüfen,
  ob FORMA solche Kopien vollständig annimmt (Gegenprobe) und ob dabei Felder geleert werden, die FORMA selbst
  vorbelegt.
- **PDF-Export gegen FORMA-Druck vergleichen:** Schriften (Helvetica statt Arial), Bilder und gedrehte
  Beschriftungen mit echten Formularen prüfen.
- **Katalog der Antragsdokumente:** Vorgabe an die Bauvorlagen des Büros anpassen (Muster der Dateinamen, Kennungen
  der Formulare).
- **Ganz ohne Originalprogramm:** Die App soll alle Funktionen auch mit eigenen Daten anbieten (Projektkarte,
  neue Formulare); mit vorhandenen Formularprojekten arbeitet sie auf deren Daten. Das Adressbuch kann das schon.
- **Projektdatei (.oap):** mit echten Projekten prüfen, welche Datei je Projekt die Stammdaten führen soll (bei
  mehreren Berechnungen) und ob die Zuordnung Grundstück/Ort zur Projektkarte so passt.
- **Vorgabe der angezeigten Pfade** an die Ordnerstruktur des Büros anpassen.
- **Baubeschreibung beim Einfamilienhaus:** Die Vorgabe lässt sie entfallen (Vorgabe des Büros). § 10 Absatz 1 Nr. 4
  BauPrüfVO verlangt sie im vereinfachten Verfahren ohne Ausnahme; Grundlage ist nur § 5 Absatz 1 („soweit die
  Angaben nicht bereits im Lageplan und in den Bauzeichnungen enthalten sind“) – im Hinweis so begründet.
- **Vorgaben fachlich gegenlesen:** Einige Regeln sind Ermessen und sollten geprüft werden – etwa, wann
  Fachplanende in den Bescheinigungen der Sachverständigen zählen, „Gebäude nach § 68 Absatz 2“ als Wohngebäude der
  Gebäudeklassen 1 und 2, die Gebäudeeinmessung bei der Fertigstellung und der Fertigstellungsteil (Blatt 3) des
  Statistikbogens Baugenehmigung, der nicht zählt. Merkmale wie „freistehend“, „Kellergeschoss“ oder „Tierhaltung“
  gibt es nicht; die betroffenen Angaben zählen deshalb nicht bzw. immer.
- **Beschriftungen in Tabellen** (z. B. „1-fach / 3-fach“-Spalten) sind aus der Lage nur unvollständig ableitbar.
