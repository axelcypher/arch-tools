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
- **Einstellungen (⚙)** als eigene Ansicht mit Ebenen: **Ordner** (FORMA-Projekte, Projektordner, angezeigte
  Pfade), **Büro & Stammdaten**, **Adressbuch**, **Formulare** und **Projektdaten.xlsx** (siehe unten).
- **Projekt wählen:** links in der Liste (Suche nach Kürzel oder Titel) oder von überall mit
  <kbd>Strg</kbd>+<kbd>K</kbd> (Schnellwahl: Kürzel tippen, Enter). Ein gewähltes Projekt steht oben links;
  „Wechseln“ öffnet die Schnellwahl.
- **Formulare:** die Formulare des Projekts, ohne die alten Fassungen in `_archiv`. 🔒 heißt: anderswo geöffnet.
  ● heißt: nicht gespeicherte Eingaben.
- **Ansicht „Formular“:** die Seiten wie auf Papier – weiße A4-Blätter mit Rand, das Formular mittig, in den
  Schriften und an den Stellen aus der Datei (Textfelder in Courier New wie in FORMA), mit Zoom (Seitenbreite
  oder 75–200 %). Die Felder sind farbig hinterlegt; gedruckt wird ohne Hinterlegung.
- **Ansicht „Felder“:** dieselben Felder im Aufbau des Formulars – nebeneinanderliegende Abschnitte auch hier
  nebeneinander, Felder einer Zeile in einer Zeile –, groß und durchsuchbar, Filter „Leere“ und „Geänderte“.
- **Gliederung:** eigener Bereich direkt am Formular („Inhalt des Formulars“, im Grau der Formularfläche – getrennt
  von der Navigation links): Seiten und Abschnitte mit Füllstand (z. B. 3/5, ✓ wenn vollständig) und Balken für
  das ganze Formular; ein Klick springt hin. Zeigt man auf einen Eintrag, werden seine Felder im Formular wie mit
  dem Textmarker hervorgehoben. Über den Pfeil rechts klappt ein Abschnitt seine einzelnen Angaben auf (mit ✓ für
  ausgefüllte), auch sie springen und heben hervor. Ein- und ausblenden über „Gliederung“ in der Werkzeugleiste.
  Gezählt wird in Einheiten: jedes Textfeld für sich, Kästchen einer Zeile gemeinsam als eine Auswahl, eigene
  Gruppen als eine Angabe. Abschnitte, die nur aus einer Nummer bestehen („2.“), bekommen den Text daneben dazu
  („2. Bauvorlagen, wenn …“).
- **Gliederung anpassen** (✎ im Kopf der Gliederung), je Formular und Stand – gilt in allen Projekten: Abschnitte
  aus- und einblenden (Auge) und eigene Titel vergeben. Nach dem Aufklappen eines Abschnitts (Pfeil rechts):
  - **Felder umbenennen** – der Name erscheint in den aufgeklappten Angaben und als Hinweis am Feld;
  - **vom Füllstand ausnehmen** (✓ rechts, z. B. Felder, die die Behörde ausfüllt);
  - **gruppieren:** Felder anhaken und „… als eine Angabe zählen“ – etwa eine Mehrfachauswahl über mehrere Zeilen,
    die dann 1/1 statt 1/5 zählt. Eine Gruppe hat einen Namen und eine Regel: „eine genügt“ (ausgefüllt, sobald
    eine Angabe gemacht ist), „alle nötig“ oder „zählt nicht“. ✕ nimmt ein Feld aus der Gruppe bzw. löst sie auf.

  Verweilt man drei Sekunden auf einem Eintrag (Abschnitt, Gruppe oder Feld), wird er im Formular umrandet und ins
  Bild geholt. „Vorgabe wiederherstellen“ setzt zurück; eine Übersicht steht in den Einstellungen unter
  „Formulare“.
- **Tastatur:** <kbd>Tab</kbd> und <kbd>Enter</kbd> (in einzeiligen Feldern) gehen in Lesereihenfolge zum nächsten
  Feld – auf dem Papier von oben nach unten, nebeneinanderliegende Rahmen von links nach rechts.
- **Speichern** (<kbd>Strg</kbd>+<kbd>S</kbd>) schreibt die geänderten Felder in die FORMA-Datei. Vorher wird sie
  frisch eingelesen: Hat sie seit dem Öffnen jemand geändert (z. B. in FORMA gespeichert), wird nicht gespeichert.
  „Neu laden“ liest die neue Fassung und trägt die eigenen Eingaben wieder ein; danach kann gespeichert werden.
- **Drucken** (<kbd>Strg</kbd>+<kbd>P</kbd>): die Formularansicht in Originalgröße, eine Seite je Blatt (A4).
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
  wieder her und springen zum betroffenen Feld. Weitertippen im selben Feld ist ein Schritt; „Aus Projektkarte
  ausfüllen“ ist ein Schritt für alle Felder.
- **Verlauf** (rechts): alle Schritte mit Zeit, Feld und „alt → neu“, auch aus früheren Sitzungen. Ein Klick stellt
  den Stand nach diesem Schritt her; „Anfang“ nimmt alles zurück.
- Auch nach dem Speichern bleibt der Verlauf: Rückgängig ergibt dann wieder eine ungespeicherte Änderung.
- Je Formular bleiben die letzten 500 Schritte, für die 60 zuletzt bearbeiteten Formulare.

### Projektkarte und Stammdaten

Die **Projektkarte** (links über den Formularen als „Projektdaten“) zeigt links die Gruppen – „Projekt“ (Projektdaten, Grundstück,
Flächen, Nutzung, Umbau, Kosteneinflüsse) und „Beteiligte“ (Bauherr, Entwurfsverfasser, Behörden …) – jeweils mit
Kurzfassung („Mustermann, Max · Welver“ oder „nicht ausgefüllt“), rechts die gewählte Gruppe als gegliedertes
Formular: bei Adressen Name, Anschrift, Kontakt sowie Bank und Sonstiges (zugeklappt, solange leer), daneben die
Anschrift, wie sie in Formularen steht.

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
- **Projektdaten.xlsx** (in der Projektkarte unter „Projektordner“): Abgleich der erkannten Angaben mit der
  Projektkarte, „Übernehmen“ je Angabe oder „Abweichende übernehmen“. Beim Speichern der Projektkarte werden
  geänderte Angaben in die Datei nachgetragen; fehlt sie und ist eine Vorlage eingestellt, wird sie angelegt.
- **Suche** über alle Einträge; ein Treffer springt in seine Gruppe.
- **Hinweise auf Tippfehler** (Postleitzahl, E-Mail, IBAN-Prüfziffer, Telefonnummer) – nur Hinweise, gespeichert
  wird trotzdem. Zeichen, die es in Windows-1252 nicht gibt (z. B. Emojis), werden abgelehnt.
- **Aus Projektkarte ausfüllen …** (im Formular): Vorschau aller Felder, die die Projektkarte füllen würde. Leere
  Felder sind vorgewählt, Felder mit eigenem Inhalt nur auf Wunsch (sie können von Hand angepasst sein); Felder,
  für die die Projektkarte nichts hat, bleiben unberührt. Ungespeicherte Änderungen der Projektkarte zählen mit.
- Ist die Projektkarte gerade in FORMA geöffnet (Datenbank gesperrt), kommt eine Meldung; nichts wird geschrieben.

### Projektordner (Server)

Neben den FORMA-Projekten lassen sich die **echten Projektordner** anbinden – zum Nachsehen (welche Formulare
schon als PDF vorliegen, welche Berechnungen es gibt), als Ziel des PDF-Exports und für einfache Dateibefehle.

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
  `.ini`) lassen sich hier nicht umbenennen oder löschen.

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
  Antrag gehören. „Aus dem Katalog festlegen“ übernimmt die vorgewählten, „Dokument hinzufügen“ weitere aus dem
  Katalog oder eigene. Je Dokument: Nummer (für `{Nr}`), Titel, **intern** (Formular aus FORMA – Teil des Namens
  oder Kennung) oder **extern** (Datei – Berechnung, Plan, fremde PDF; Ordner der Quelle und Muster mit `*`, `?`,
  mehrere mit `;`). Die Datei im Antragsordner wird nach Muster bzw. Titel gefunden oder ausdrücklich verknüpft (🔗,
  auch per Rechtsklick im Projektordner); ein Export in die aktive Fassung verknüpft automatisch. Der Projektumfang
  und die aktive Fassung stehen in `formulare.json` im FORMA-Projekt und gelten damit für alle im Büro.
- **Status** – immer gegen die aktive Fassung:
  - **grau – fehlt:** kein Formular im Projekt bzw. weder Quelle noch Datei;
  - **rot – nicht vollständig:** das Formular hat noch offene Angaben (Füllstand wie in der Gliederung);
  - **gelb – nicht (aktuell) exportiert:** ausgefüllt, aber keine PDF im Antragsordner oder die PDF ist älter als
    die letzte Änderung (Datei oder ungespeicherte Eingaben); bei externen: die Quelle ist neuer als die Datei;
  - **grün – aktuell:** die PDF liegt im Ordner der aktiven Fassung und ist nach der letzten Änderung entstanden.
- In der **Navigation** trägt jedes Formular des Projektumfangs einen Farbpunkt; fehlende Formulare stehen grau
  hinterlegt darunter – ein **Klick legt das Formular an** (aus dem Vorlagenordner, sonst als Kopie des neuesten
  passenden Formulars aus einem anderen Projekt, jeweils mit geleerten Eingaben; schreibgeschützte Textfelder
  bleiben) und öffnet es. „Aus Projektkarte ausfüllen …“ trägt dann die Projektdaten ein.
- Die **PDF** entsteht in der App aus dem Formular selbst – so, wie die Formularansicht es zeigt: A4-Blätter, Rahmen,
  Linien, Beschriftungen (auch gedreht), Feldinhalte und Kreuze, Bilder. Echter Text in den PDF-Standardschriften:
  Helvetica hat die Breiten von Arial, Courier die von Courier New – die Zeilen brechen an denselben Stellen um.
  Zeichen außerhalb von Windows-1252 werden zu „?“.

### Projektdaten.xlsx

Im Projektordner liegt unter `Organisation\<Kürzel> Projektdaten.xlsx` eine Übersicht der Projektdaten. Ihr
Aufbau ist nicht vorgegeben; die App liest allgemein: Beschriftung und Wert in der nächsten gefüllten Zelle rechts
daneben (mehrere Paare je Zeile möglich, „PLZ / Ort“ in einer Zelle wird geteilt). Überschriften ohne Wert wie
„Bauherr“ oder „Grundstück“ bestimmen, wozu Straße, PLZ und Ort darunter gehören. Erkannt werden Bauvorhaben,
Aktenzeichen, Grundstück (Straße, Ort, Gemarkung, Flur, Flurstück, Fläche) und Bauherr (Name, Vorname, Straße, PLZ,
Ort, Telefon, E-Mail) – jeweils mit Gegenstück in der Projektkarte. Geschrieben wird nur in die Wertzellen, nicht
solange die Datei in Excel geöffnet ist, und nicht, wenn sie seit dem Lesen geändert wurde.

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

### Web-Version

Ohne Desktop-App gibt es keinen Zugriff auf Ordner: Die Web-Version öffnet ein einzelnes Formular über den
Dateidialog, und „Herunterladen“ liefert die geänderte Fassung als Datei. Sperrdateien, Projektkarte und
Projektordner gibt es dort nicht.

## Dateiformat

Ein FORMA-Projekt ist ein Ordner:

| Datei | Inhalt |
|---|---|
| `*.frmsjf` | ein Formular je Datei (Text, ASCII, CRLF) |
| `_archiv/` | ältere Fassungen eines Formulars (z. B. Anlage I-3 von 2024, als die von 2026 kam) |
| `sj_prokarte.sdb` | Projektkarte (SQLite, Texte UTF-8): Projektdaten, Beteiligte, Grundstück … – `.bak` ist die Sicherung |
| `sj_office.ini` | Projekttitel (`[Allgemeines]`, `Text=`, Windows-1252) |
| `*.frmtmp` | Sperrdatei, solange das Formular geöffnet ist (INI, Windows-1252) |
| `formulare.json` | nicht von FORMA: Angaben dieser App zum Projekt – aktive Antragsfassung, Projektumfang mit Verknüpfungen |

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
`antragStore.ts` der Zustand dazu (Einstellungen, `formulare.json`, Export, Formular anlegen), `dateiAktionen.ts`
die Dateibefehle des Kontextmenüs. `dokumente/` liest und ändert PDF (pdf.js),
Excel und Word (eigener XML-Leser mit Lage im Quelltext, ZIP über fflate). `verlauf.ts` ist der Verlauf, `ablage.ts` die
Zuordnung der echten Projektordner.

Die Tauri-Hülle (`src-tauri/src/lib.rs`) ersetzt nur vorhandene `.frmsjf` sowie vorhandene PDF-, Excel- und
Word-Dateien (atomar über eine temporäre Datei, Dokumente nur mit Sicherungskopie und nicht, solange Office sie
geöffnet hat), prüft
Sperrdateien (offen gehalten? Prozess auf diesem Rechner?),
legt nur `.frmtmp` an bzw. löscht sie und ändert in `sj_prokarte.sdb` nur vorhandene Einträge – in einer
Transaktion, und nur, wenn jeder noch den Wert hat, von dem die Änderung ausgeht. Neu anlegen darf sie Dokumente
(PDF, Excel, Word), Formulare (`.frmsjf`, nie überschreibend), Ordner und `formulare.json` (atomar ersetzt);
kopieren und umbenennen nur ohne zu überschreiben, löschen nur nach einer Sicherungskopie – Dateien von FORMA sind
davon ausgenommen. Beim Auflisten liefert sie die Änderungszeit mit (für die Vollständigkeitsprüfung).

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
- **`Projektdaten.xlsx`:** gelesen wird allgemein; mit einer echten Datei bzw. der Vorlage des Büros prüfen und
  die Erkennung bei Bedarf anpassen.
- **Vorgabe der angezeigten Pfade** an die Ordnerstruktur des Büros anpassen.
- **Beschriftungen in Tabellen** (z. B. „1-fach / 3-fach“-Spalten) sind aus der Lage nur unvollständig ableitbar.
