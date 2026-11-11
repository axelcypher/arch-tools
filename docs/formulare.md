# Formulare

Die App **Formulare** (`apps/formulare`, eigene App mit eigenem Installer) füllt Bauantragsformulare aus
**SJ FORMA** (SJ Software GmbH, Aachen; Teil von SJ OFFICE) aus – mit einer aufgeräumten Oberfläche statt der
Formularmasken des Originals.

Grundsatz: **Das Originalprogramm muss jede Datei weiter lesen können**, denn im Büro arbeiten alle anderen
weiter mit FORMA. Geändert wird nur der Inhalt von Feldern und Projektkarten-Einträgen, nie das Layout, und alles
Unveränderte bleibt Byte für Byte erhalten. Was sich nicht verlustfrei zurückschreiben lässt, wird nur angezeigt.

## Bedienung

- **Aufbau der Oberfläche:** Links die **Navigation** (Projekt, Projektdaten, Formulare und – durch eine Linie
  getrennt – Projektordner) auf eigenem, dunklerem Grund wie die Titelleiste; der gewählte Eintrag ist hell
  hinterlegt und links markiert. **Projektdaten** (die Projektkarte aus FORMA) stehen hervorgehoben über den
  Formularen, aus ihnen werden die Formulare ausgefüllt.
  Rechts der **Inhalt**. Was zum Dokument gehört – Gliederung, Verlauf, Formularfläche –, steht im Grau der
  Formularfläche.
- **Gemeinsame Einstellungen:** Die Stammordner der Projektordner und der Ort neuer Projektdateien gelten für alle
  Apps (`allgemein.json` im gemeinsamen Konfigurationsordner, siehe `packages/core/src/platform/konfig.ts`); Formulare
  übernimmt beim ersten Start seine bisherigen Werte dorthin, wenn dort noch keine stehen.
- **Einstellungen (⚙)** als eigene Ansicht mit Ebenen: **Ordner** (FORMA-Projekte, Projektordner, angezeigte
  Pfade), **Büro & Stammdaten**, **Adressbuch**, **Formulare**, **Antrag & Export** und **Projektdatei (.oap)** (siehe unten).
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
  Textfelder bleiben), mit der nächsten laufenden Nummer; sie wird geöffnet und auf Wunsch in den Projektumfang
  aufgenommen. Leere Felder, die FORMA der Projektkarte zuordnet, werden dabei gleich befüllt (siehe Autofill).
- **Ansicht „Formular“:** die Seiten wie auf Papier – weiße A4-Blätter mit Rand, das Formular mittig, in den
  Schriften und an den Stellen aus der Datei (Textfelder in Courier New wie in FORMA), mit Zoom (Seitenbreite
  oder 75–200 %). Die Felder sind farbig hinterlegt; gedruckt wird ohne Hinterlegung.
- **Ansicht „Felder“:** dieselben Felder im Aufbau des Formulars – nebeneinanderliegende Abschnitte auch hier
  nebeneinander, Felder einer Zeile in einer Zeile –, groß und durchsuchbar, Filter „Offene“ und „Geänderte“. Beim
  Suchen fallen Seiten ohne Treffer weg, daneben steht die Trefferzahl.
- **Prüfliste „Was fehlt noch?“** (`pruefliste.ts`): Der Filter „Offene“ zeigt genau, was im Füllstand fehlt – je
  Angabe eine Zeile mit den Eingaben darin (Gruppen wie „Gebäudeklasse“ als eine Zeile), ohne entfallene und nicht
  zählende Felder (Behördenfelder), mit den ungeklärten (hängen an nicht festgelegten Projektmerkmalen). Im Kopf der
  Gliederung steht „4 offen · 2 ungeklärt“ (Klick öffnet die Liste) bzw. „Nach den Vorgaben der App keine offenen
  Angaben“ – nie „vollständig“. „Nächste offene Angabe“ (auch <kbd>F8</kbd>) springt zum ersten Feld der nächsten
  offenen Angabe nach dem Feld mit dem Fokus. Dazu kommen **Hinweise** (gelb, Widersprüche rot; nie blockierend):
  - **Widersprüchliche Kreuze** (`plausibel.ts`): Gruppenregel „genau eine“ (zählt wie „eine genügt“, mehr als ein
    Kreuz ist ein Widerspruch) – in den Vorgaben bei Bauantrag/Antrag auf Vorbescheid und bei „Behandlung als
    Bauantrag: ja/nein“ (I/3); in der Feldansicht sind diese Fälle Optionsfelder. Mehrere Gebäudeklassen ergeben nur
    die Frage „umfasst der Antrag mehrere Gebäude?“, mehrere Gebäudekategorien („alle zutreffenden“) nichts. I/3 mit
    Projektmerkmal Sonderbau = ja: Hinweis auf § 63 Abs. 1 Satz 2 BauO NRW 2018.
  - **Formular und Projektmerkmale** (`merkmalAbgleich.ts`, Prüfregeln in `vorgaben/pruefregeln.ts`): Leere Kästchen
    der Gebäudeklasse werden aus dem Merkmal vorbelegt – nur wenn in der Gruppe nichts angekreuzt ist, nie
    überschrieben, als ein Schritt „Aus Projektmerkmal vorbelegt“ im Verlauf (rückgängig zu machen) und am Kästchen
    gestrichelt als Vorschlag gekennzeichnet. Weicht das Formular ab, steht „Projekt: GK 3, Formular: GK 1“ in der
    Prüfliste und am Feld. Kreuzt man von Hand eine andere Gebäudeklasse an, fragt die App, ob sie als Projektmerkmal
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
  | Bauanträge I/1, I/2 (auch Stand 2024D), I/3 | Unterlagen nur beim Bauantrag; Maß der baulichen Nutzung nur mit Bebauungsplan (auch einfachem) oder Satzung, Flurkarte und Basiskarte nur nach §§ 34/35 BauGB (auch im einfachen Bebauungsplan), Baubeschreibung nicht beim Einfamilienhaus, eine Kostenangabe; Betriebsbeschreibung bei jedem Nichtwohngebäude (nicht nur bei Sonderbauten), Nr. 9 nur bei Sonderbauten; Nr. 11 Brandschutz: Erklärung bei GK 1–3, Bescheinigung bei GK 4/5, beim Sonderbau keins von beiden; I/1 Barrierefrei-Konzept bei der Errichtung; Vorbescheid-Teil nur beim Vorbescheid; I/3 „ja“ → Nr. 2 bis 6, „nein“ → Nr. 1, 4, 5, Nr. 6 Erklärung zum Brandschutz bei GK 1/2 immer |
  | Baubeschreibung I/7 | Nr. 8 bis 10 nicht im vereinfachten Verfahren; Nr. 11 nur bei Ortssatzung/Denkmalschutz |
  | Anzeigen (Baubeginn, Rohbau, Fertigstellung), I/2.1, I/6 | Nachweise nach § 68 BauO NRW 2018 (Fassung ab 01.09.2026, nicht nach der alten Gliederung des Vordrucks): Schall-/Wärmeschutz und Standsicherheit entfallen nur bei Wohngebäuden der GK 1 und 2, Brandschutz bei GK 4/5 und Sonderbauten; Baugenehmigungsdatum nicht bei Freistellung |
  | Werbeanlage I/4, Teilung I/5, Beseitigung I/6.1, Abweichung I/10 und 2018 | Auswahlen, Detailangaben nur beim angekreuzten Kästchen, Bindungen nur wenn vorhanden |
  | Betriebsbeschreibungen I/8, I/9, Artenschutzprüfung | ja/nein-Fragen als Auswahl, Detailangaben nur bei „ja“ bzw. wenn Werte eingetragen sind |
  | Statistikbögen | Neubau-/Bestandsteile und Wohn-/Nichtwohnangaben nach den Kästchen des Bogens; Ziffernkästchen als eine Angabe; Behördenfelder zählen nicht |
  | Berechnungen, GEG-Anlagen, Rechenblatt | Kopfangaben zählen, Tabellenzeilen („Zeile n: …“) nicht; berechnete Felder nur mit Titel |
  | Sachverständige (Prüfung, Kontrolle, Bescheinigung), Berichte II/2–II/4, Verzeichnisse | Angaben der Sachverständigen zählen; Alternativen als Auswahl; Mängelangaben nur bei „folgende Mängel“; Verzeichniszeilen zählen nicht |

  Überall: richtige Titel für alle Felder, Behördenfelder (Eingangsstempel, Aktenzeichen, Genehmigungsvermerk)
  und Unterschriftsfelder zählen nicht, bei Telefon/Telefax/E-Mail genügt eine Angabe. Bedingungen gibt es nur, wo der
  Vordruck oder BauO NRW/BauPrüfVO sie hergeben – im Zweifel keine. `vorgaben.test.ts` prüft gegen die echten
  Formulare unter `.ref/`, dass jeder Schlüssel existiert und dass jedes Formular dort eine Vorgabe hat.
- **Erforderlich, entfällt, offen:** Eine Bedingung kann zutreffen (erforderlich), sicher nicht zutreffen (entfällt)
  oder **offen** sein, weil sie an einem Projektmerkmal hängt, das noch nicht festgelegt ist. Ein fehlendes Merkmal
  lässt nichts entfallen (Fail-safe, `bedingung.ts`: dreiwertige Auswertung; ein sicheres „nein“ der übrigen Teile
  entscheidet trotzdem). Offene Angaben zählen im Füllstand wie erforderliche; Gliederung und Kopf zeigen sie
  zusätzlich gelb („2 offen (hängt von Merkmalen ab)“), ✓ und voller Balken erscheinen erst, wenn nichts mehr fehlt.
  Am Feld sind sie gelb hinterlegt, das Info-Symbol sagt „Offen – hängt ab von: Gebäudeart (nicht festgelegt)“ /
  „Erforderlich, bis Gebäudeart festgelegt ist.“ Im Projektumfang bekommen Dokumente mit fehlendem Merkmal den normalen
  Status, nie „nicht erforderlich“. Ein Abschnitt heißt „entfällt“, wenn seine Bedingung sicher nicht zutrifft oder
  alle seine zählenden Angaben entfallen; Abschnitte ganz ohne zählende Angaben heißen „freiwillig“.
- **Warum entfällt ein Feld?** Entfällt ein Feld nach den Bedingungen (oder ist es offen), steht daran ein Info-Symbol
  (in der Formular- und der Feldansicht) – klein (11 px, auf dem Papier mit geringer Deckkraft; die Trefferfläche ist
  größer als das Symbol), rechts am Rahmen bzw. oben rechts im Textfeld, damit es weder Kästchen noch Beschriftung
  verdeckt. Felder eines Abschnitts mit **gleichem Grund** teilen sich ein Symbol (entfällt der ganze Abschnitt, steht
  es oben rechts am Rahmen bzw. am Abschnittstitel der Feldansicht); Felder mit eigenem Grund behalten ihres. Die
  Symbole sind per Tastatur erreichbar: <kbd>F1</kbd> im Feld setzt den Fokus auf sein Symbol und zeigt den Hinweis,
  <kbd>Enter</kbd> öffnet den Gesetzestext, <kbd>Esc</kbd> führt zurück ins Feld. Zeigen nennt den Grund: die Begründung der Vorgabe, die Bedingung in Worten, noch
  nicht festgelegte Projektmerkmale und die Rechtsgrundlage. Ein Klick öffnet den **Gesetzestext** als Fenster in der
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
- **Projektmerkmale der App:** Gebäudeklasse, Sonderbau, Verfahren, **Gebäudeart** (Einfamilienhaus,
  Zweifamilienhaus, Mehrfamilienhaus, Nichtwohngebäude, kein Gebäude), **Vorhaben** (Errichtung, Änderung,
  Nutzungsänderung, Beseitigung) und **Planungsrecht** (Bebauungsplan = qualifiziert oder vorhabenbezogen nach § 30
  Abs. 1, 2 BauGB, einfacher Bebauungsplan nach § 30 Abs. 3 BauGB, Innenbereich, Außenbereich, Satzung nach BauGB). Der
  einfache Bebauungsplan zählt für die Bauvorlagen als Bebauungsplan (Maß der baulichen Nutzung) und als Vorhaben nach
  §§ 34/35 (Flurkarte, Basiskarte). Ein gespeichertes „Bebauungsplan“ wird nicht umgedeutet; Projektumfang und
  Hinweise erklären die Werte (`MERKMAL_ERKLAERUNG` in `bedingung.ts`). Die Vorgaben
  bauen darauf auf; sie bleiben deshalb auch in einer eigenen Merkmalliste (fehlende werden ergänzt, auch fehlende
  Werte) und lassen sich weder umbenennen noch entfernen. Eigene Merkmale und Werte kommen dazu.
- **Felder ohne Rahmen** bilden je Seite einen Abschnitt (Kennung `<Seite>:-`), auch wenn Rahmen dazwischen liegen.
- **Formular einrichten** („Einrichten“ in der Werkzeugleiste), je Formular und Stand – gilt in allen Projekten.
  Das Formular wird zur Fläche zum Auswählen: **Feld anklicken** (mit <kbd>Strg</kbd>/<kbd>Umschalt</kbd> mehrere),
  links zeigt die Gliederung den Aufbau als **Baum** (Abschnitte, Gruppen, Felder – mit Füllstand, Inhalt zum
  Wiedererkennen und Zeichen für Bedingungen), rechts stehen **alle Einstellungen der Auswahl**:
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
  Baugenehmigungsverfahren)“. Prüfungen: ein **Projektmerkmal** ist bzw. ist nicht einer der angekreuzten Werte;
  ein **anderes Feld** ist angekreuzt/ausgefüllt, leer, gleich oder ungleich einem Wert. Felder lassen sich in der
  Liste oder mit „Feld im Formular wählen“ per Klick ins Formular wählen (<kbd>Esc</kbd> bricht ab). Darunter steht
  die Bedingung in Worten und ob sie gerade zutrifft. Trifft sie nicht zu, **entfällt** der Eintrag: Er zählt nicht,
  ist in der Gliederung durchgestrichen bzw. „entfällt“, seine Felder sind im Formular neutral statt blau
  hinterlegt; in Gruppen zählen entfallene Teile nicht mit. Fehlt im Projekt ein Merkmal, von dem eine Bedingung
  abhängt, ist der Eintrag offen (siehe oben), und die Gliederung weist darauf hin.
- **Projektmerkmale direkt am Formular festlegen** (`components/MerkmalWahl.tsx`): Der Hinweiskasten der Gliederung
  bietet je fehlendem Merkmal Segmentknöpfe mit Kurzerklärung und Fundstelle (z. B. „Gebäudeklasse (§ 2 Abs. 3 BauO
  NRW 2018)“, die Erklärung je Wert beim Zeigen; „§“ öffnet den Gesetzestext). Dieselbe Auswahl öffnet das
  Info-Symbol an einem offenen Feld („Gebäudeart festlegen“ im Gesetzes-Fenster). Die Wahl wirkt sofort. Mit Projekt
  steht sie in der Projektdatei (`meta.merkmale`, gilt für alle Formulare; „Alle Projektmerkmale …“ führt zum
  Projektumfang), ohne Projekt (Web-Version) gilt sie für die Datei und liegt im lokalen Speicher
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
- **Werkzeugleiste:** ↶ ↷ (<kbd>Strg</kbd>+<kbd>Z</kbd> / <kbd>Strg</kbd>+<kbd>Y</kbd>), „Projektkarte speichern“
  (<kbd>Strg</kbd>+<kbd>S</kbd>) und „Verwerfen“ (lässt sich rückgängig machen). Ungespeicherte Änderungen bleiben
  lokal gesichert, auch über Neustarts. Geänderte Einträge sind orange markiert, ↺ setzt einen zurück.
- **Auswahllisten und Optionen** wie in FORMA (Anrede, Land, Bodenklasse, Neigung …), Kästchen gesammelt unter einem
  Titel (Besondere Auflagen). Die Möglichkeiten selbst bleiben, wie FORMA sie angelegt hat.
- **Übernehmen von …:** alle Angaben einer anderen Adressgruppe dieses Projekts (z. B. Eigentümer = Bauherr) oder
  aus den Bürostammdaten – in einem Schritt, der sich rückgängig machen lässt. „Leeren“ entfernt alle Angaben.
- **Adressbuch** (Einstellungen): alle Adressen aus den Projektkarten aller FORMA-Projekte – Bauherren,
  Entwurfsverfasser, Behörden, Fachplaner –, gleiche Adressen einmal mit allen Verwendungen („BS5 ·
  Bauaufsichtsbehörde“). Gepflegt wird in FORMA bzw. in der Projektkarte, nicht doppelt; „Neu einlesen“ liest alle
  Projektkarten. Die zentrale Adressdatenbank von SJ OFFICE ist noch nicht angebunden (Ort unbekannt).
- **Büro & Stammdaten** (Einstellungen): je Rolle (Entwurfsverfasser, Bauvorlageberechtigter,
  Bauaufsichtsbehörde, Gemeinde …) eine Vorgabe aus dem Adressbuch – die bisher in dieser Rolle verwendeten
  Adressen zuerst. In der Projektkarte: „Als Vorgabe festlegen“ bei einer Adresse, **„Vorgaben eintragen“** füllt
  alle leeren Rollen auf einmal, und „Übernehmen von …“ bietet die Vorgabe und die bisherigen Adressen der Rolle an.
- **Projektdatei (.oap)** (in der Projektkarte unter „Projektordner“): Abgleich der Projektstammdaten mit der
  Projektkarte in beide Richtungen – „Übernehmen“ (Projektdatei → Projektkarte) und „Eintragen“ (Projektkarte →
  Projektdatei), je Angabe oder für alle abweichenden. Beim Speichern der Projektkarte werden geänderte Angaben in
  die Projektdatei eingetragen; fehlt sie, wird sie angelegt (siehe unten).
- **Suche** über alle Einträge; ein Treffer springt in seine Gruppe.
- **Hinweise auf Tippfehler** (Postleitzahl, E-Mail, IBAN-Prüfziffer, Telefonnummer) – nur Hinweise, gespeichert
  wird trotzdem. Zeichen, die es in Windows-1252 nicht gibt (z. B. Emojis), werden abgelehnt.
- **Korrekturen der Zuordnung:** Wo ein FORMA-Vordruck Felder der falschen Beteiligten-Gruppe zuordnet, liest die
  App die Zuordnung korrigiert (die Datei bleibt unverändert; `src/vorgaben/zuordnungen.ts`). Bisher: Angaben zur
  Artenschutzprüfung (nw020012) – „Antragsteller/in“ kommt aus den Bauherrendaten, nicht vom Entwurfsverfasser.
- **Autofill mit Zustand:** Felder, die FORMA einem Eintrag der Projektkarte zuordnet, bekommen ihren Text von
  dort (Auto-Wert). Je Feld merkt sich die App in der Projektdatei (`.oap`, Abschnitt `formulare` → `felder`, je
  Formulardatei) getrennt den zuletzt eingetragenen Auto-Wert und eine manuelle Überschreibung:
  - **neue Formulare** (aus dem Projektumfang oder „Formular hinzufügen“): leere Felder mit Auto-Wert werden gleich
    befüllt;
  - wer den Auto-Text durch eigenen ersetzt, **fixiert die Überschreibung** (beim Speichern) – sie bleibt beim
    Aktualisieren; im Formular ist ein Feld aus der Projektkarte links blau, ein überschriebenes orange markiert;
  - ein **geleertes Feld** bekommt beim Verlassen wieder den Auto-Wert; **erzwungen leer** ist ein Feld mit einem
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
- **Rechtsklick** auf eine Datei: Ansehen, Mit Programm öffnen, Im Explorer zeigen, **Kopieren** (danach Rechtsklick
  auf einen Ordner › Einfügen), **Duplizieren** („Name (Kopie).pdf“), **Umbenennen …**, **Löschen …** (nach
  Bestätigung, mit Sicherungskopie im App-Ordner), mit einem **Antragsdokument verknüpfen** (liegt die Datei nicht im
  Ordner der aktiven Fassung, wird sie dorthin kopiert) und Pfad kopieren. Rechtsklick auf einen Ordner: Einfügen,
  Neuer Ordner …, Im Explorer zeigen. Überschrieben wird nie; Dateien von FORMA (`.frmsjf`, `.frmtmp`, `.sdb`,
  `.ini`) lassen sich hier nicht umbenennen.
- **Formulare löschen** (Rechtsklick auf ein Formular › Löschen …): nach Rückfrage und mit Sicherungskopie im
  App-Ordner. Ist das Formular hier geöffnet, wird es vorher geschlossen (die Rückfrage warnt vor nicht gespeicherten
  Eingaben); ist es in FORMA oder auf einem anderen Rechner geöffnet (Sperrdatei), wird nicht gelöscht. Sperrdateien,
  Projektkarte und Projekttitel verwaltet weiterhin nur FORMA. Automatisch löscht die App nie etwas.

### Antrag, Export und Vollständigkeit

Die Anträge liegen im Projektordner unter `TÖB` (einstellbar), darin je **Antragsfassung** ein Ordner: `BAUA`, bei
mehreren `BAUA 2` oder `BAUA2` …, daneben andere Antragsarten wie `BAUVA` (Voranfrage) oder `DENK` (Denkmal).

- **Aktive Fassung** (oben links am Projekt, „Antrag“): die gewählte, sonst die neueste der Standardart. Über das
  Menü lässt sich umschalten oder eine **neue Fassung anlegen** („BAUA 3“ – der Ordner entsteht sofort). Die aktive
  Fassung ist das voreingestellte Ziel des Exports und der Maßstab der Vollständigkeitsprüfung.
- **Dateiname** nach der Namensvorlage, Vorgabe `{Kürzel} {Phase} {Datum} {Nr} {Name}` → „BS9 GP 261110 03
  Baubeschreibung.pdf“ (Datum als JJMMTT, eine leere Nummer entfällt). Weitere Platzhalter: `{Antrag}`,
  `{Formular}`, `{Kennung}`, `{Stand}`. `{Name}` ist der Titel im Projektumfang, sonst der Formularname ohne
  laufende Nummer und Jahr.
- **Einstellungen › Antrag & Export:** Antragsordner, Antragsarten (die erste ist der Standard), Namensvorlage und
  Phase, Ziel (aktive Antragsfassung oder fester Ordner, z. B. `TÖB/{Antrag}/Formulare`), Ordner der
  Berechnungen, Vorlagenordner für neue Formulare und der **Katalog der Antragsdokumente**. Je Projekt lassen sich
  Antragsordner, Namensvorlage, Phase und Ziel abweichend einstellen (Projektkarte › Projektumfang › „Export für …“,
  „Vorgabe verwenden“ setzt zurück) – wie die angezeigten Pfade im Projektordner.
- **Projektumfang** (eigener Reiter der Projektkarte unter „Antrag“ – gibt es in FORMA nicht): welche Dokumente zum
  Antrag gehören. „Projektumfang festlegen“ übernimmt die Dokumente der gewählten Antragsvorlage, „Dokument hinzufügen“ weitere aus dem
  Katalog oder eigene. Je Dokument: Nummer (für `{Nr}`), Titel, **intern** (Formular aus FORMA – Teil des Namens
  oder Kennung) oder **extern** (Datei – Berechnung, Plan, fremde PDF; Ordner der Quelle und Muster mit `*`, `?`,
  mehrere mit `;`). Die Datei im Antragsordner wird nach Muster bzw. Titel gefunden oder ausdrücklich verknüpft (🔗,
  auch per Rechtsklick im Projektordner); ein Export in die aktive Fassung verknüpft automatisch. Der Projektumfang
  und die aktive Fassung stehen im Abschnitt `formulare` der Projektdatei (`.oap`) im Projektordner und gelten damit
  für alle im Büro (siehe unten).
- **Antragsvorlagen** (Einstellungen › Antrag & Export): benannte Zusammenstellungen von Katalogdokumenten je
  Antragsart – Vorgabe „Bauantrag“ (BAUA), „Bauvoranfrage“ (BAUVA), „Denkmalrechtliche Erlaubnis“ (DENK). Im Katalog
  hat jede Vorlage eine Spalte zum Ankreuzen; die Reihenfolge ist die des Katalogs. Beim Festlegen des Projektumfangs
  wird die Vorlage zur Antragsart der aktiven Fassung vorgeschlagen („BAUA 2“ → Bauantrag), eine andere lässt sich
  wählen; „Dokument hinzufügen › Aus Vorlage ergänzen“ nimmt die fehlenden Dokumente einer weiteren Vorlage dazu.
  Die früheren „Vorgewählt“-Häkchen werden beim ersten Start zur Vorlage „Bauantrag“.
- **Reihenfolge ändern:** am Griff ⠿ ziehen – oder den Griff wählen und mit ↑/↓ verschieben – im Katalog, bei den
  Antragsvorlagen und Projektmerkmalen und im Projektumfang eines Projekts (dort auch per Rechtsklick „Nach oben“ /
  „Nach unten“).
- **Projektmerkmale** (oben im Projektumfang): Gebäudeklasse, Sonderbau, Verfahren … – je Projekt einmal gewählt,
  gelten sie für alle Formulare (Bedingungen in der Gliederung) und für den Projektumfang. Welche Merkmale es gibt
  und ihre Werte, steht in Einstellungen › Antrag & Export. Gespeichert in der Projektdatei unter `meta.merkmale` –
  sie gehören zum Projekt und stehen damit auch den anderen Apps zur Verfügung.
- **Dokumente mit Bedingung:** im Projektumfang (Bearbeiten) und im Katalog („Nur wenn“; Projektmerkmale mit
  und/oder wie oben) – etwa ein Nachweis nur
  bei Gebäudeklasse 3–5. Trifft sie nicht zu, ist das Dokument „nicht erforderlich“: kein Farbpunkt, kein grauer
  „Anlegen“-Eintrag, es zählt nicht mit.
- **Status** – immer gegen die aktive Fassung:
  - **grau – fehlt:** kein Formular im Projekt bzw. weder Quelle noch Datei;
  - **rot – nicht vollständig:** das Formular hat noch offene Angaben (Füllstand wie in der Gliederung);
  - **gelb – nicht (aktuell) exportiert:** ausgefüllt, aber keine PDF im Antragsordner oder die PDF ist älter als
    die letzte Änderung (Datei oder ungespeicherte Eingaben); bei externen: die Quelle ist neuer als die Datei;
  - **grün – aktuell:** die PDF liegt im Ordner der aktiven Fassung und ist nach der letzten Änderung entstanden.
- In der **Navigation** trägt jedes Formular des Projektumfangs einen Farbpunkt; fehlende Formulare stehen grau
  hinterlegt darunter – ein **Klick legt das Formular an** (aus dem Vorlagenordner, sonst als Kopie des neuesten
  passenden Formulars aus einem anderen Projekt, jeweils mit geleerten Eingaben; schreibgeschützte Textfelder
  bleiben) und öffnet es – leere Felder mit Angaben aus der Projektkarte sind gleich befüllt.
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
  Speichern der Projektkarte, beim Festlegen von Projektumfang, Antragsfassung oder Projektmerkmalen); im Projektkopf
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
- **Angaben zum Antrag** (aktive Antragsfassung, Projektumfang) stehen im Abschnitt `formulare` von `projekt.json`,
  die Projektmerkmale unter `meta.merkmale`. Eine alte `formulare.json` im FORMA-Projekt wird noch gelesen und einmalig in die
  Projektdatei übernommen – sie selbst bleibt liegen und wird nicht mehr geschrieben.
- **Alte `Projektdaten.xlsx`:** wird noch gelesen (`Organisation\<Kürzel> Projektdaten.xlsx`); weichen ihre
  Angaben von der Projektkarte ab, übernimmt „In die Projektkarte übernehmen“ sie – beim Speichern landen sie dann
  in der Projektdatei.

### Dokumente ansehen und bearbeiten

Dokumente aus dem Projektordner erscheinen in der App mit Kopfzeile (Art, Name, Ordner, „Neu laden“, „Extern
öffnen“). Bearbeitet wird so, dass alles, was nicht geändert wurde, in der Datei bleibt, wie es war:

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
  Bearbeitungen bleiben als Entwurf erhalten (bis zum Schließen der App; die Datei ist in der Seitenleiste mit ●
  markiert).
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
| Projektmerkmale | `formulare:merkmale` | ersetzt |
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
| 4 | Auswahlliste | die Möglichkeiten zeilenweise, **erste Zeile leer** | Nummer der Wahl, die leere Zeile zählt mit (`NULL`/−1 = keine) |
| 8 | Optionen | die Möglichkeiten zeilenweise | Nummer der Wahl ab 0 (−1 = keine) |
| 16 | Kästchen | Beschriftung (z. B. „Wärmeschutz“) | 1 = angekreuzt |

Bei Auswahl, Optionen und Kästchen schreibt die App nur `Ganzzahl`; die Möglichkeiten in `Texte` bleiben unverändert.
Die Zählweise der Auswahlliste folgt aus den Daten (Delphi: `Items` = Texte, `ItemIndex` = Ganzzahl): Nummer 2 ergibt
bei einem Ansprechpartner „Sehr geehrter Herr“ und als Kontakt „Telefon“.

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
Excel und Word (eigener XML-Leser mit Lage im Quelltext, ZIP über fflate). `verlauf.ts` ist der Verlauf, `ablage.ts` die
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
- **Adressdatenbank von SJ OFFICE:** Ort und Aufbau unbekannt; bis dahin kommt das Adressbuch aus den Projektkarten.
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
