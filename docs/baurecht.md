# Baurecht

Rechtsprüfung **vor dem Einreichen eines Antrags**: Die App zeigt alle Vorschriften, die für das Vorhaben eine Rolle
spielen, **je Paragraf als Ampel** – mit Begründung, den beteiligten Angaben und dem Text in der maßgeblichen Fassung.
Die Gesetzestexte holt sie live aus den amtlichen Quellen; die Regeln, wann was gilt, kommen aus einem eigenen,
signierten **Regelpaket** mit austauschbaren Modulen je Gebiet (Bund, Land, Kreis, Gemeinde). Hintergrund und
Entscheidungen: [baurecht-konzept.md](baurecht-konzept.md).

| Ampel | Bedeutung |
|---|---|
| **gilt** (rot) | muss beachtet und im Antrag berücksichtigt werden |
| **prüfen** (gelb) | von Hand prüfen – eine Angabe fehlt oder ist unsicher, Einzelfall, Text geändert, keine Regel |
| **entfällt** (grün) | entfällt auf jeden Fall – nur nach gesicherten Angaben oder weil das Gesetz es selbst ausschließt |

Die Ampel steht nie nur als Farbe da, immer auch als Wort.

## Bedienung

- **Projekt öffnen:** „Projekte“ in der Titelleiste (Desktop: Projektübersicht) bzw. „Projektdatei öffnen …“. Die
  Angaben kommen aus der Projektdatei (.oap): Stammdaten, **Antragsmerkmale** des aktiven Antrags (gemeinsam mit
  Formulare – eine Änderung hier gilt dort und umgekehrt), Festsetzungen aus dem GRZ-Nachweis, Geschosse, Räume und
  Wohnungen aus dem Flächenrechner.
- **Kopfleiste:** Antrag, **geplante Einreichung** (Stichtag – z. B. § 42a BauO NRW knüpft an das Datum des
  Bauantrags an, § 90 an das Verfahrensrecht zur Zeit der Antragstellung), die aktiven Regelmodule, der Rechtsstand
  (Datum des ältesten Stands der aktiven Normen), Warnmarken (nie geprüft, nicht abrufbar, geändert, neue Fassung),
  **Lage abfragen**, **Rechtsstand prüfen**, **Prüfprotokoll**, **Speichern** (Strg+S). „Gemeinde unbestätigt“ bzw.
  „widersprüchlich“ ist ein Knopf und springt zum Gemeindeschlüssel. Ist die App schmaler als 1600 px, stehen „Lage
  abfragen“ und „Rechtsstand prüfen“ unter **Mehr ▾** und die Warnungen zum Rechtsstand als eine Sammelmarke („2
  Warnungen“, Einzelheiten im Tooltip und im Menü); unter 1200 px stehen „Antrag“ und „Einreichung“ nur noch im Feld.
  Gekürzt wird nur die Liste der Module, Warnungen und „Speichern“ nie. „≡ Fehlerprotokoll“ in der Titelleiste ist die
  Fehlersuche der App.
- **Koordinaten:** Ergebnisse der Geodienste und Bestätigungen zur Lage gelten nur, solange die Koordinaten zur
  Adresse in den Stammdaten passen. Fehlen sie oder wurde die Adresse geändert, sind sie nur noch Hinweis (auch der
  Gemeindeschlüssel aus ALKIS); der Kopf zeigt „Keine Koordinaten“ bzw. „Koordinaten veraltet“, „Bestätigen …“ wird
  dann nicht angeboten. Ortsgebunden sind alle Angaben zu Lage, Schutzgebieten, Planungsrecht (Pläne, Satzungen,
  Sperren), Grundstück (Straßen, Gewässer, Zufahrten), Ortsrecht und Zuständigkeit – auch von Hand und ohne Beleg; nach
  einem Adresswechsel sind sie erneut anzugeben (Knopf „Für diese Lage übernehmen“, bei Angaben mit Beleg erneut mit
  Beleg). Die frühere Lage bleibt dabei vermerkt („Angabe zu einer früheren Lage“), auch bei Angaben mit Beleg.
  Gespeichert wird, was das Feld zeigt: Anzahlen (z. B. Stellplätze) ganzzahlig, andere Zahlen auf zwei Nachkommastellen,
  keine negativen Werte. Schwellen „über x“ (im Regelschema „x,01“) gelten als echtes „größer als x“ – 22,005 m sind
  über 22 m. Das **Planungsrecht** zählt erst als gesichert, wenn es für genau diesen Ort und Wert bestätigt ist: in
  Baurecht gesetzt oder mit „Gilt hier“ bestätigt. Ein Wert aus Formulare oder einer älteren Datei, ein seither
  geänderter Wert und ein Umzug (Anschrift, Grundstück, Koordinaten) zeigen oben einen Hinweis; was daran hängt, kann
  bis dahin nicht sicher entfallen (in den Begründungen und im Protokoll „Nicht gesichert: Planungsrecht …“). Angaben
  von Hand aus älteren Dateien werden wie bei der Eingabe geprüft: negative Werte und halbe Anzahlen sind nur Hinweis,
  Angaben zur Lage ohne Lagebezug ebenso („Für diese Lage übernehmen“).
- **Filterleiste:** Ampelzähler (blenden ein/aus), Balken, Ordnung (offen zuerst, nach Ebene, nach Thema), Suche und
  die Kästchen „nur von Hand festgelegte“ / „nur geänderte/überholte“. Ist die mittlere Spalte schmaler als 640 px,
  wird die Ordnung zur Auswahlliste, die Kästchen wandern in **Filter ▾** und der Balken entfällt. Die Zähler an den
  Normen zählen die sichtbaren Zeilen („11 prüfen von 14“). Beim Wechsel der Ordnung bleibt der gewählte Paragraf im
  Blick.
- **Rückfrage zum Antragsmerkmal:** Bei „Beseitigung“ steht der **Umfang der Beseitigung** (vollständiger Abbruch
  ohne Ersatzbau, Teilabbruch, Abbruch mit Ersatzbau) direkt unter „Art des Vorhabens“, mit offener Erläuterung;
  Teilabbruch wird wie eine Änderung geprüft, Ersatzbau wie Errichtung und Beseitigung. Ändert sich ein Merkmal, ordnen
  sich die Angaben neu. „Klärt am meisten“ zählt eine Angabe bei einem Paragrafen nur, wenn ihre Antwort dort etwas
  ändert (führen alle Antworten zum selben Ergebnis, zählt sie nicht).
- **Angaben (links):** oben **„Klärt am meisten“** – die fehlenden Angaben, die die meisten offenen Paragrafen
  entscheiden würden (Klick springt zur Angabe); dann die Antragsmerkmale als Knöpfe mit Erklärung (eingeklappt, wenn
  alle festgelegt sind; „leeren“ setzt ein Merkmal bewusst zurück); darunter alle Angaben, an denen eine Regel hängt,
  offene zuerst (die Reihenfolge entsteht beim Öffnen, Filtern und Suchen und bleibt dann stehen – eine beantwortete
  Angabe springt nicht weg). Jede Angabe trägt überall denselben kurzen Namen (höchstens 40 Zeichen – in der Liste, in
  „Klärt am meisten“, in Begründungen und im Protokoll); Frage bzw. ausführlicher Titel stehen darunter, lange
  Erläuterungen sind einklappbar (auch nach dem Beantworten). Die Antragsmerkmale tragen dieselben kurzen Namen wie im
  Regelbaum und im Protokoll („Gebäudeart“, „Planungsrecht“), die Erklärung steht darunter. Die Suche findet auch die
  kurzen Namen. Zahlen stehen
  deutsch mit Einheit („139,12 m²“), Anzahlen ganzzahlig. Jede Angabe zeigt ihre Herkunft (Stammdaten, Flächenrechner, GRZ-Nachweis, Geodienst,
  Regelmodul, von Hand). **Nur Hinweis** heißt: nicht gesichert (z. B. Geodienst ohne Treffer, Koordinaten nur
  straßengenau, Gemeindeschlüssel von Hand ohne Beleg) – ein solcher Wert kann nie etwas ausschließen, bis er
  **bestätigt** ist; eine Bestätigung lässt sich **zurücknehmen**. „alle Angaben“ zeigt auch Angaben, an denen gerade
  keine Regel hängt. Widerspricht das Merkmal „Planungsrecht“ den Geodaten (Bebauungsplan angegeben, Landschaftsplan
  gemeldet), wird das als Widerspruch angezeigt und macht betroffenes Grün gelb – auch dann, wenn eine Angabe von Hand
  dem Treffer eines Dienstes widerspricht. Ebenso wird eine Angabe von Hand widersprüchlich, wenn ein Dienst über eine
  Tabelle etwas anderes ergibt (z. B. „nicht im Denkmalbereich“ gegen einen Treffer des Denkmal-Dienstes).
- **Vorschriften (Mitte):** **offen zuerst** (Vorgabe: prüfen, gilt, entfällt), nach Ebene oder nach Thema; je Norm
  Fassung und Zähler in Worten, darunter die Paragrafen mit Ampel und Hauptgrund (die Angaben, die das Ergebnis
  tragen). Oben das Ergebnis je Ampel (zugleich Ein-/Ausblenden), Suche und Filter „nur von Hand festgelegte“ bzw.
  „nur geänderte/überholte“, mit Trefferzahl. Marken: „von Hand“ bzw. „von Hand · Entwurf“, „überholt“, „nicht
  wirksam“, „Text geändert“, „eigene Verantwortung“ (prüft die Bauaufsicht nicht). Hängt eine Regel an einem anderen
  Paragrafen, der selbst offen ist, heißt es „hängt an § … (dort offen)“; in den Einzelheiten steht das unter „Hängt an“
  (getrennt von den fehlenden Angaben). Ist die Spalte schmaler als 900 px, steht der
  Grund unter dem Titel.
- **Einzelheiten (rechts):** Ampel, Begründung in Worten, Hinweise (Ausnahmen, Einzelfall, Vorrang des Ortsrechts,
  Annahmen des Büros), fehlende und unsichere Angaben (Klick springt hin), ob die Bauaufsicht das im Verfahren prüft,
  womit es nachgewiesen wird, Stand der Regel, aufklappbar die **Regel im Einzelnen** (eingerückt, je Bedingung ✓ trifft
  zu, ✗ trifft nicht zu, ? offen, mit dem aktuellen Wert; entschiedene Unterzweige zugeklappt; „keines davon“ für
  verneinte Gruppen; verneinte Blätter positiv, auch durch Bausteine hindurch, z. B. „Gebäudeart: alles außer „EFH“ und
  „ZFH““; Schwellen wie im Gesetz: „über 22 m“, Anzahlen „mehr als 3“, „genau 3“, „vorhanden“, „keine“, die Einheit nicht
  doppelt und bei 1 in der Einzahl; Gemeindeschlüssel als Gemeindename; Verweise mit der Norm vor dem Titel („§ 36 BauGB –
  Einvernehmen …“); Folgezeilen hängend eingerückt; ✓/✗ neutral eingefärbt, nicht in Ampelfarben), und der **Gesetzestext** mit den
  Absätzen der Fundstellen hervorgehoben (mit Legende); nach einer Änderung **alt/neu** untereinander mit
  gestrichenen bzw. unterstrichenen Wörtern – verglichen mit der Fassung, an der die Regel geprüft ist. Die Spalte lässt
  sich am linken Rand in der Breite ziehen (auch mit ←/→, Pos1/Ende). Beide Leisten schrumpfen bei schmalen Fenstern,
  die Mitte behält mindestens 420 px; Ziehen und Tastatur gehen nie über den verfügbaren Platz hinaus.

## Von Hand festlegen

Jeder darf festlegen – und bestätigt dafür zweimal:

1. **Beim Festlegen:** „Von Hand festlegen …“ → Ampel wählen, **Begründung** (Pflicht, mindestens 10 Zeichen) und Name.
   Herabstufungen (gilt → prüfen/entfällt, prüfen → entfällt) werden ausdrücklich angesagt. Die Festlegung ist danach
   ein Entwurf (gestrichelte Marke).
2. **Beim Speichern:** Neue, geänderte und **aufgehobene** Festlegungen erscheinen in einer Liste (vorher → nachher,
   Begründung, Herabstufungen hervorgehoben) – ebenso neu bestätigte Hinweise (siehe unten). „Bestätigen und speichern“
   geht erst nach dem Haken „Ich habe diese … geprüft“. Ist eine Festlegung inzwischen **überholt**, sagt die Liste das,
   und „Bestätigen und speichern“ ist gesperrt, bis sie erneut festgelegt oder aufgehoben ist; „noch nicht wirksam“
   wird ebenfalls angezeigt. „Speichern, diese als Entwurf behalten“ schreibt für sie den
   bisherigen Stand der Datei (eine schon bestätigte Festlegung bleibt also erhalten) und lässt die Änderung in der App
   als Entwurf offen. Vor einem Antragswechsel, dem Öffnen eines anderen Projekts oder dem Beenden gilt das nicht als
   „gespeichert“: Die App meldet, dass Entwürfe offen sind, und bleibt, bis sie bestätigt, aufgehoben oder ausdrücklich
   verworfen („Nicht speichern“) sind.

„Festlegung aufheben“ wirkt sofort; daneben steht „Rückgängig“, der Fokus geht auf „Von Hand festlegen …“. Auch das
Aufheben einer gespeicherten Festlegung wird beim Speichern noch einmal bestätigt. Ein Entwurf zählt für Verweise,
„Klärt am meisten“ und die offenen Punkte noch nicht als Klärung; eine mit „Rückgängig“
wiederhergestellte Festlegung, die nicht mehr dem Stand der Datei entspricht, ist wieder Entwurf.

Eine Festlegung geht der Automatik vor. Sie wird **überholt**, sobald die automatische Ampel danach strenger wird als
damals und als die Festlegung (wird sie schwächer oder kommt sie bei der Festlegung an, bleibt die Festlegung richtig),
sobald sich der **Ort** ändert (Anschrift, Grundstück oder Koordinaten – eine Festlegung gilt für den Ort, an dem sie
getroffen wurde; eine Festlegung ohne Ortsangabe – aus einer älteren Datei – gilt als überholt; über der Liste ordnet
„Für diesen Ort übernehmen“ alle in einem Schritt dem jetzigen Ort zu, als Entwurf, der beim Speichern bestätigt wird),
sobald sich eine beteiligte Angabe (auch nur ihre Sicherheit, z. B. ein neuer Widerspruch) oder der Text einer Fundstelle ändert (oder
sie ohne geprüften Text getroffen wurde und der Text jetzt vorliegt) – dann steht die Marke „überholt“ daran, ein
überholtes „entfällt“ zählt mindestens als „prüfen“, ein überholtes „prüfen“ hält ein automatisches „gilt“ nicht auf
(es gilt dann die automatische Ampel), und das Protokoll führt sie als offen. Fehlt dagegen der Systemstand (Text
nicht verfügbar, Rechtsstand nicht aktuell bestätigt, zum Stichtag gilt schon eine neue Fassung), ist ein festgelegtes
„entfällt“ **noch nicht wirksam**: Es zählt als „prüfen“, bis der Text geprüft vorliegt – erneutes Festlegen hilft
dagegen nicht. Verweist eine Regel auf einen anderen Paragrafen, zählt dort nur die
automatische Ampel oder eine bestätigte, nicht überholte Festlegung – und auch die nur als unsicher (ein „entfällt“, das
darauf beruht, wird „prüfen“).

**Hinweise bestätigen:** Angaben, die nur Hinweis sind (z. B. „kein Treffer im Landschaftsschutzgebiet“, Flächen aus
dem Modell), lassen sich mit „Bestätigen …“ als gesichert übernehmen – nur mit Angabe, worauf die Bestätigung beruht
(z. B. Auskunft der Behörde mit Datum). Der Dialog zeigt vorher, wie viele Vorschriften dadurch herabgestuft werden –
mit genau der Rechnung, die danach gilt. Widerspricht ein Dienst der Angabe, bleibt der Widerspruch auch nach der
Bestätigung bestehen; der Dialog sagt das. Auch Bestätigungen werden beim Speichern noch einmal bestätigt und stehen
im Prüfprotokoll. Eine bestätigte Angabe aus dem Modell bzw. aus einer Tabelle des Regelmoduls gilt nur für genau
diesen Wert – ändert sich das Modell bzw. die Tabelle, ist sie wieder Hinweis.

**Schutzgebiete und Geodaten von Hand** (ja/nein, Auswahl) gibt es nur mit Beleg – wie eine Bestätigung. Widerspricht
die Angabe einem Treffer eines Dienstes, bleibt der Widerspruch stehen; was nur an ihr hängt, bleibt „prüfen“ (für
einen begründeten Sonderfall: den Paragrafen von Hand festlegen).

## Lage abfragen (Desktop)

An den Koordinaten der Stammdaten: **Flurstück und Gemeindeschlüssel** aus ALKIS NRW, danach alle Geodienste, die
die aktiven Module nennen (z. B. Schutzgebiete aus LINFOS, Überschwemmungs- und Wasserschutzgebiete, Denkmalbereich
und Bebauungspläne der Stadt Soest) – am **Umring des Flurstücks mit mindestens 25 m Puffer**, auch die Vorstufen
(vorläufig gesichert, geplant). **Ein Treffer gilt als gesichert. Kein Treffer bleibt ein Hinweis**, auch wenn alles
andere stimmt: Ob seit dem Datenstand des Dienstes eine neue Verordnung bekanntgemacht wurde, lässt sich nicht
automatisch prüfen – nach einem Blick ins Amtsblatt bzw. der Auskunft der Behörde „Bestätigen …“. So entsteht kein
falsches „entfällt“.

- Ein späterer **Treffer geht immer vor** – auch einem bestätigten „kein Treffer“.
- Widerspricht ein Dienst einer Angabe von Hand (z. B. Treffer gegen „nein“), bleibt die Angabe, aber sie ist als
  **Widerspruch** markiert; was nur an ihr hängt, wird „prüfen“, bis sie geändert oder geklärt ist.
- Ergebnisse und Bestätigungen gelten nur für die **Lage**, an der sie ermittelt wurden. Ändern sich die Koordinaten
  des Vorhabens, werden sie wieder zum Hinweis.

Gesendet werden nur die Lage des Grundstücks (Koordinaten bzw. Umring) und welche Gesetze gebraucht werden – keine
Personendaten.

## Bedienung mit der Tastatur

Die ersten Tabstopps sind die Sprungmarken „Zu den Angaben / Vorschriften / Einzelheiten“ (sichtbar, sobald sie den
Fokus haben), danach die Titelleiste. Die Vorschriftenliste ist ein Tabstopp: ↑/↓, Pos1/Ende wählen den Paragrafen.
Auswahlgruppen (ja/nein, Merkmale) bedienen sich mit ←/→ bzw. ↑/↓ (mit Umlauf), Pos1/Ende. F6 (Umschalt+F6) springt
zwischen Kopf, Angaben, Vorschriften und Einzelheiten; ist kein Paragraf gewählt, bekommen die Einzelheiten selbst den
Fokus (der Bereich wird angesagt, F6 geht weiter). Menüs (Mehr ▾, Filter ▾, Farbschema) nehmen beim Öffnen den Fokus,
bedienen sich mit ↑/↓ und Pos1/Ende, schließen mit Esc (Fokus zurück an ihren Knopf) und schließen, sobald der Fokus sie
mit Tab verlässt; ihre Einträge sind keine eigenen Tabstopps; ↓/↑ auf dem geschlossenen Knopf „Mehr“ öffnet es.
Die Suche in den Vorschriften findet „§ 6 BauO NRW“ und „§ 6 Abs. 1 BauO NRW“ genau (Norm nach Kurzform); ein „§“, den
die Regeln nicht kennen, ergibt keinen Treffer; ohne „§“ und ohne Paragrafentreffer sucht sie im Text (Zahlen als ganzes
Wort, Kürzel bis drei Zeichen wie „GK“, „GRZ“ nur am Wortanfang und auch ausgeschrieben). Nach Suche, Filter und
„Filter zurücksetzen“ bleibt die gewählte Zeile im Blick, der Fokus geht ins Suchfeld. Die Sammelmarke der Warnungen öffnet und schließt „Mehr“, Esc gibt
den Fokus an den Öffner zurück. Nach „Bestätigen“, „zurücknehmen“ und der Wahl des Farbschemas bleibt der Fokus an der
Angabe bzw. am Knopf.

## Rechtsstand

- Quellen: Rechtsinformationssystem des Bundes (wo vorhanden), gesetze-im-internet.de, recht.nrw.de (stabiler Link
  „aktuellste Fassung“, Fassungsliste mit künftigen Fassungen), Ortsrecht als PDF/HTML, MVV TB des DIBt.
- Jede Norm wird höchstens einmal am Tag an der Quelle geprüft (bedingte Abfragen), „Rechtsstand prüfen“ sofort. Die
  Fassungen liegen im gemeinsamen Konfigurationsordner unter `baurecht/recht/` – für alle Projekte gleich, nie
  überschrieben; ist eine Quelle nicht erreichbar, arbeitet die App mit dem letzten Stand und sagt es. Ist eine Norm
  seit **14 Tagen** nicht mehr an der Quelle bestätigt (oder nie), wird aus „entfällt“ ein „prüfen“.
- **Stichtag:** Eine Fassung mit bekanntem Ende vor der Einreichung deckt den Stichtag nicht; gilt zum Stichtag laut
  Quelle schon eine angekündigte Fassung, wird sie geholt – liegt ihr Text nicht vor, wird aus „entfällt“ ein „prüfen“.
  Auch „entfällt mit der Norm“ (Anwendungsbereich) braucht den geprüften Text der Norm.
- **Künftige Fassungen:** Kündigt die Quelle eine neue Fassung an, die innerhalb von sechs Monaten nach der geplanten
  Einreichung gilt (voraussichtlich vor der Entscheidung), wird aus „entfällt“ ein „prüfen“ – an der künftigen Fassung
  prüfen.
- **Prüfsumme je Absatz:** Jede Regel weiß, an welchem Text sie geprüft ist. Ändert sich ein Absatz, wird aus
  „entfällt“ ein „prüfen“ (aus „gilt“ wird nichts Schwächeres), bis die Regel nachgezogen ist.
- Ohne Text (Web-Version, Quelle nie erreichbar) bleibt aus demselben Grund alles, was sonst entfiele, gelb.

## Prüfprotokoll

Kopf aus den Stammdaten, Grundlagen (Stichtag, Module, Regelpaket, Merkmale, Ergebnis), dann **Festlegungen von Hand**
(Ampel, automatisch, Begründung, Name, Datum, Entwurf/bestätigt) und **gesicherte Angaben** (Wert, Herkunft, worauf
gestützt, von wem) als Tabellen, dann die **offenen Punkte** als Tabelle „Was fehlt – Anzahl – Paragrafen“; danach
alle Paragrafen je Ebene mit Ampel, Begründung und Fassung, Quellen der Geodaten, Hinweise und Auskünfte der Module.
Angaben von Hand ohne Beleg stehen in einer eigenen Tabelle (mit wer und wann). Die offenen Punkte zählen wie „Klärt am
meisten“ (ein Paragraf kann unter mehreren Angaben stehen); Punkte mit nur einem Paragrafen stehen gesammelt unter
„Weitere“. Enthält es Entwürfe, steht „ENTWURF …“ als Kopfzeile im oberen Seitenrand jeder Druckseite (überdruckt keinen Text);
Überschriften werden nicht von ihrer Tabelle getrennt. Warum „Prüfung abschließen“ gesperrt ist, steht sichtbar
neben dem Knopf. „Drucken / PDF …“ schlägt den
Dateinamen `<Projektdatei> Baurecht <Antrag>.pdf` vor. **„Prüfung abschließen“** legt den Stand (Fassungen, Ampeln,
Zähler, Regelpaket) in der Projektdatei ab – erst, wenn nichts mehr Entwurf, alles gespeichert und jeder Text geladen
ist.

## Daten

In `projekt.json` unter `baurecht.pruefungen[<Antrag>]`: geplante Einreichung, Angaben von Hand bzw. aus Geodiensten,
Festlegungen, abgeschlossene Prüfungen. Die Antragsmerkmale bleiben im Abschnitt `formulare` (eine Quelle mit
Formulare). Geschrieben wird gezielt (nur `projekt.json`): Angaben, Festlegungen und Protokolle werden je Eintrag gegen
den zuletzt gelesenen Stand zusammengeführt, so gehen gleichzeitige Änderungen anderer Instanzen nicht verloren;
unbekannte Felder (neuere App-Versionen) bleiben erhalten.

## Regelpaket

`packages/baurecht-regeln` – Module je Gebiet (`module/<modul>/modul.json`), je Norm und Fassung eine Regeldatei
(`<norm>@<gültig ab>.json`), Texte von Scans (`texte/`). Gepflegt wird **nur im Repo**; in der App wird nur von Hand
festgelegt.

| Werkzeug | Zweck |
|---|---|
| `npm run stand -w @akh/baurecht-regeln` | Prüfsummen der Fundstellen aus den geltenden Texten eintragen (`NUR=<modul>/<norm>`, `UEBERNEHMEN=1` nach Prüfung einer Änderung) |
| `npm run fassung -w @akh/baurecht-regeln` | neue Regeldatei für eine neue Fassung anlegen, geänderte Fundstellen auflisten |
| `npm run texterkennung -w @akh/baurecht-regeln` | Text eines Scans erkennen (Tesseract) und unter `texte/` ablegen |
| `npm run index -w @akh/baurecht-regeln` | Paket ohne Leerraum bauen, Index mit SHA-256, Signatur (Ed25519) |
| `npm run schluessel -w @akh/baurecht-regeln` | Schlüsselpaar für die Signatur erzeugen (einmalig) |

Auslieferung und Wächter: `.github/workflows/regeln.yml` – Prüfen und Bauen in einem Job ohne Schreibrechte und ohne
Schlüssel, Signieren (OpenSSL, Ed25519) und Hochladen in das Release „regeln“ in einem eigenen Job ohne npm; der
Wächter gleicht wöchentlich mit den geltenden Fassungen ab und legt bei Abweichungen ein Issue an. Signiert wird nur
von `main` und nur in der GitHub-Umgebung **„regeln“** – diese Umgebung in den Einstellungen des Repos anlegen (Branch-
Regel `main`, Freigabe durch Reviewer) und das Secret `BAURECHT_REGELN_SCHLUESSEL` dort hinterlegen.

**Einrichten:** `npm run schluessel`, privaten Schlüssel als Secret (in der Umgebung „regeln“)
`BAURECHT_REGELN_SCHLUESSEL`, öffentlichen in `packages/baurecht-regeln/schluessel/regeln.pub`. Solange der öffentliche
Schlüssel fehlt, nutzt die App das Regelpaket ihres Builds.

Übernommen wird ein nachgeladenes Paket nur, wenn die Signatur stimmt, **jede Datei** zu Größe und SHA-256 im Index
passt und alle Regeln zu dieser App-Version passen (sonst bleibt das bisherige Paket – auch für das im
Konfigurationsordner abgelegte). Die Paketversion ist `<version aus package.json>-<Laufnummer>`; gegen den Build zählt
nur eine höhere Version. **Geänderte Regeln brauchen deshalb eine neue Version in `package.json`** – das Ausliefern
bricht sonst ab.

## Technik

- Netz nur über den Tauri-Befehl `netz_holen` (`apps/baurecht/src-tauri/src/netz.rs`) zu freigegebenen Hosts; jede
  Umleitung wird einzeln gegen die Liste geprüft; Hosts aus einem gültig signierten Paket kommen dazu. Die CSP der
  Webansicht bleibt unverändert. Die Signatur des Index prüft die Tauri-Hülle beim Freigeben der Hosts selbst
  (öffentlicher Schlüssel einkompiliert). Ablage des Rechtsstands über `baurecht_ablage_*` – nur JSON unter
  `<Konfigurationsordner>/baurecht`, Verknüpfungen werden aufgelöst. Das schützt vor Fehlbedienung, ist aber keine
  Sicherheitsgrenze gegenüber der Webansicht, solange die gemeinsamen Dateibefehle der Suite (`read_binary_file`,
  `write_binary_file`) beliebige Pfade erlauben; die Sicherheit des Regelpakets beruht auf der Signatur.
- Netzfehler: Nur Verbindungsfehler und Zeitüberschreitungen werden wiederholt, nicht „Host nicht freigegeben“ o. Ä.
- Kern im gemeinsamen Unterbau: `packages/core/src/recht/` (Adapter, Prüfsummen, Rechtsstand),
  `packages/core/src/baurecht/` (Format, Bedingungen, Auswertung, Projektdatei, Geodienste).
- Entwicklung: `npm run dev:baurecht` (http://localhost:1490), `npm run tauri:dev:baurecht`; Live-Abgleich der Quellen:
  `LIVE=1 npx vitest run packages/core/src/recht/quellen.live.test.ts`.

Die Ergebnisse sind eine Arbeitshilfe und ersetzen keine fachliche Prüfung; die rechtliche Einordnung bleibt bei den
Entwurfsverfassenden (§ 54 BauO NRW).
