# LEXIO (Baurecht)

Die App **LEXIO** (`apps/baurecht`, eigene App mit eigenem Installer, auch als Tab in Arkly, der Rahmen-App) ist für die
Rechtsprüfung **vor dem Einreichen eines Antrags**: Sie zeigt alle Vorschriften, die für das Vorhaben eine Rolle
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
  Angaben kommen aus der Projektdatei (.oap): Stammdaten, **Antragsmerkmale** des aktiven Antrags – gemeinsam mit PERMIO
  (Formulare), eine Änderung hier gilt dort und umgekehrt –, Festsetzungen aus TERRIO (GRZ-Nachweis), Geschosse, Räume
  und Wohnungen aus QUADRIO (Flächenrechner).
- **Kopfleiste** (Werkzeugleiste nach design.md „Kopf- und Werkzeugleisten“): links **Speichern** (Strg+S;
  ungespeicherte Änderungen zeigt der Punkt an der Ecke des Knopfs, wie in allen Apps; die Rückfrage vor dem Verlassen
  sagt „Die Baurechtsprüfung hat ungespeicherte Änderungen.“, denn ungespeichert ist nur der Teil von LEXIO im
  Projekt), dann Antrag, **geplante Einreichung** (Stichtag – z. B. § 42a BauO NRW knüpft an das Datum des Bauantrags
  an, § 90 an das Verfahrensrecht zur Zeit der Antragstellung), die aktiven Regelmodule mit ihren Marken, der
  Rechtsstand (Datum des ältesten Stands der aktiven Normen) mit den Warnmarken (nie geprüft, nicht abrufbar,
  geändert, neue Fassung), rechts der Hauptknopf **Prüfprotokoll …** und zuletzt **Mehr** (Symbol ⋯) mit den seltenen
  Befehlen **Lage abfragen** und **Rechtsstand prüfen** (Desktop; die Web-Version hat keine). „Gemeinde unbestätigt“
  bzw. „widersprüchlich“ ist ein Knopf und springt zum Gemeindeschlüssel. Reicht die Breite nicht, kürzen sich die
  Liste der Module und der Rechtsstand (ganz im Tooltip); danach wandert die Wahl des Antrags als Einfachauswahl ins
  Menü „Mehr“ (zurück kommt sie erst, wenn alle Einträge in voller Breite passen – eine Grenze des gemeinsamen
  Bausteins). Marken, Einreichung, „Speichern“ und „Prüfprotokoll …“ bleiben immer sichtbar; eine laufende Abfrage
  der Lage steht als „Lage wird abgefragt …“ beim Rechtsstand. Ist die App schmaler als
  1600 px, stehen die Warnungen zum Rechtsstand als eine Sammelmarke da („2 Warnungen“, Einzelheiten im Tooltip und
  ihre Zahl als Hinweis an „Rechtsstand prüfen“), die die Befehle aus „Mehr“ (Lage abfragen, Rechtsstand prüfen)
  öffnet; unter 1200 px stehen „Antrag“ und
  „Einreichung“ nur noch im Feld. „Fehlerprotokoll …“ im Menü „Einstellungen und Hilfe“ der Titelleiste ist die
  Fehlersuche der App.
- **Koordinaten:** Ergebnisse der Geodienste und Bestätigungen zur Lage gelten nur, solange die Koordinaten zur Adresse
  in den Stammdaten passen. Fehlen sie oder wurde die Adresse geändert, sind sie nur noch Hinweis (auch der
  Gemeindeschlüssel aus ALKIS); der Kopf zeigt „Keine Koordinaten“ bzw. „Koordinaten veraltet“, „Bestätigen …“ wird dann
  nicht angeboten. Ortsgebunden sind alle Angaben zu Lage, Schutzgebieten, Planungsrecht (Pläne, Satzungen, Sperren),
  Grundstück (Straßen, Gewässer, Zufahrten), Ortsrecht und Zuständigkeit – auch von Hand und ohne Beleg; nach einem
  Adresswechsel sind sie erneut anzugeben (Knopf „Für diese Lage übernehmen“, bei Angaben mit Beleg erneut mit Beleg).
  Die frühere Lage bleibt dabei vermerkt („Angabe zu einer früheren Lage“), auch bei Angaben mit Beleg. Gespeichert
  wird, was das Feld zeigt: Anzahlen (z. B. Stellplätze) ganzzahlig, andere Zahlen auf zwei Nachkommastellen, keine
  negativen Werte. Schwellen „über x“ (im Regelschema „x,01“) gelten als echtes „größer als x“ – 22,005 m sind über 22
  m. Das **Planungsrecht** zählt erst als gesichert, wenn es für genau diesen Ort und Wert bestätigt ist: in Baurecht
  gesetzt oder mit „Für diesen Ort bestätigen“ (im Hinweis oben und am Merkmal) bestätigt. Vorher steht dort, wie viel
  die Bestätigung klärt („klärt 30“ – gerechnet wie danach, gedrosselt höchstens alle 250 ms); die Einzelheiten führen
  bei „Nicht gesichert: Planungsrecht …“ mit „Zum Bestätigen“ dorthin. Gespeichert und bestätigt steht am Merkmal „für
  diesen Ort bestätigt (Name, Datum)“. Ein Wert aus Formulare oder einer älteren Datei, ein seither geänderter Wert und
  ein Umzug (Anschrift, Grundstück, Koordinaten) zeigen oben einen Hinweis; was daran hängt, kann bis dahin nicht sicher
  entfallen (in den Begründungen und im Protokoll „Nicht gesichert: Planungsrecht …“). Die Bestätigung sagt ihre Wirkung
  an („30 Vorschriften entfallen jetzt“), wird beim Speichern mit ihren Folgen noch einmal abgefragt (bis dahin „Entwurf
  – beim Speichern bestätigen“ am Merkmal, mit „zurücknehmen“; im Protokoll „Entwurf – für diesen Ort bestätigt …“ und
  beim Ergebnis, wie viele Paragrafen an noch nicht Gespeichertem hängen) und steht mit Name und Datum im Protokoll.
  „Speichern, diese als Entwurf behalten“ lässt sie Entwurf. Ein Wert außerhalb der Liste lässt sich nicht für den Ort
  bestätigen – er zählt ohnehin nicht. Angaben von Hand aus älteren Dateien werden wie bei der Eingabe geprüft: negative
  Werte und halbe Anzahlen sind nur Hinweis, Angaben zur Lage ohne Lagebezug ebenso („Für diese Lage übernehmen“).
- **Filterleiste:** Ampelzähler (blenden ein/aus; Häkchen, Statuspunkt, Zahl und Wort im Umschalter), Balken, Ordnung
  (offen zuerst, nach Ebene, nach Thema), Suche und die Kästchen „nur von Hand festgelegte“ / „nur
  geänderte/überholte“. Ist die mittlere Spalte schmaler als 640 px, wird die Ordnung zur Auswahlliste, die Kästchen
  wandern in **Filter** und der Balken entfällt. Die Zähler an den Normen zählen die sichtbaren Zeilen („11 prüfen von
  14“). Beim Wechsel der Ordnung bleibt der gewählte Paragraf im Blick.
- **Rückfrage zum Antragsmerkmal:** Bei „Beseitigung“ steht der **Umfang der Beseitigung** (vollständiger Abbruch ohne
  Ersatzbau, Teilabbruch, Abbruch mit Ersatzbau) direkt unter „Art des Vorhabens“ (als Knöpfe, unter der Erklärung des
  Werts); Teilabbruch wird wie eine Änderung geprüft, Ersatzbau wie Errichtung und Beseitigung; „Erweiterung“ (Anbau,
  Aufstockung) ist bauordnungsrechtlich eine Änderung und wird wie sie geprüft, aber nie milder (als Test festgehalten);
  strenger ist sie bei der PV-Pflicht – entsteht eine neue, für Photovoltaik geeignete Dachfläche (Frage
  `nw.neue_dachflaeche`), steht sie der Neuerrichtung gleich (SAN-VO § 2 Abs. 7) – und beim Artenschutz (§ 44 BNatSchG
  wie beim Neubau); ein „Wohn- und Geschäftshaus“ ist nie milder als das strengere von Mehrfamilienhaus und
  Nichtwohngebäude (Bausteine `wohnnutzung`/`nichtwohnnutzung` in Anforderungen, `wohngebaeude`/`nichtwohngebaeude` nur
  in Ausnahmen; als Test festgehalten; beim GEIG zählen die Stellplätze insgesamt, die überwiegende Nutzung entscheidet
  – Frage `gebaeude.ueberwiegend_wohnen`, § 11 GEIG); beim Ersatzbau folgen dort die Angaben zum Altbau (verfahrensfrei
  zu beseitigen, Abbruch im Bauantrag mitbeantragt). Offene Rückfragen (auch solche, deren Wert nur Hinweis ist, mit
  „Bestätigen …“) stehen auch bei eingeklappten Merkmalen da („eine Rückfrage offen“), mit ihrer Erläuterung (gekürzt,
  „mehr“); eine neue Rückfrage wird angesagt. Eingeklappt Beantwortetes bleibt bis zum Aufklappen kompakt stehen
  („Umfang der Beseitigung: Abbruch mit Ersatzbau – ändern“), der Fokus geht auf die nächste offene Rückfrage bzw. den
  Gruppenknopf („Rückfragen beantwortet“). Auf- bzw. Zugeklappt bleibt auch nach einer Suche. Ändert sich ein Merkmal,
  ordnen sich die Angaben neu. „Klärt am meisten“ zählt eine Angabe bei einem Paragrafen nur, wenn ihre Antwort dort
  etwas ändert (führen alle Antworten zum selben Ergebnis, zählt sie nicht). Eine Angabe, deren Frage gerade nicht
  gestellt wird, fehlt nicht: Sie steht nicht unter „es fehlt“ und nicht unter „klärt am meisten“ – nur wenn sonst kein
  Grund für Gelb bliebe, wird sie genannt. „Gestellt“ heißt für Kern, App und Protokoll dasselbe (`frageGestellt`): ohne
  Bedingung immer, sonst solange das `wenn` nicht sicher „nein“ ergibt (ein „nein“ nur aus Hinweisen verbirgt keine
  Frage, ein Widerspruch bzw. Vorbehalt an einem Merkmal öffnet keine; Kern, Leiste und Protokoll urteilen im selben
  Kontext); eine Rückfrage (Umfang, Angaben zum Altbau) erst, wenn es „ja“ ergibt. Eine gespeicherte Antwort auf eine
  Frage, die gerade nicht gestellt wird (nach einem Ortswechsel, einem zurückgesetzten Auslöser wie dem Umfang der
  Beseitigung), zählt nicht – weder in den Regeln noch für Ableitungen (bis zum Fixpunkt: eine weggelassene Antwort kann
  weitere Fragen verbergen); das Protokoll führt solche Antworten gesondert („Antworten auf derzeit nicht gestellte
  Fragen (ohne Wirkung)“). Wird eine Frage nur wegen eines Hinweises gestellt (z. B. „Altbau verfahrensfrei“, weil der
  Umfang „Abbruch mit Ersatzbau“ nur Hinweis ist), bleibt die Antwort beantwortet; Regeln, die sie verwenden, zählen
  aber den auslösenden Hinweis als nicht gesichert. Der Paragraf steht dann auf „prüfen“ („Nur Hinweis, nicht
  gesichert: Umfang der Beseitigung“), „Bestätigen …“ steht am Umfang; erst wenn er bestätigt ist, zählt die Antwort
  wieder voll – auch über eine Kette solcher Fragen. An der Antwort steht dann eine Marke „nur Hinweis“ (bei einem
  widersprüchlichen Auslöser „Widerspruch“; der Auslöser im Tooltip), die auf „Bestätigen …“ am Auslöser springt; auch
  beim Festlegen von Hand zählt die Antwort nur als Hinweis (faktStatus) – eine ältere Festlegung, die sie noch als
  gesichert führte, gilt deshalb als überholt („… jetzt nur Hinweis“). Ebenso bei einer widersprüchlichen Angabe als Auslöser: die Regel
  trägt deren Widerspruch („Widerspruch: Umfang der Beseitigung“) – nicht bei Merkmalen wie Planungsrecht oder
  Gebäudeklasse, deren Widerspruch bzw. Vorbehalt prüfen die Regeln selbst. Ausgenommen ist eine Antwort mit dem Wert,
  der auch ohne die Frage gälte (`ohneAusloeser` im Regelmodul, nur wo das zwingend folgt): „Allee betroffen: nein“ gilt
  auch, wenn „geschützte Bäume betroffen“ nur Hinweis ist – diese Angabe schließt Alleen ein, eine betroffene Allee ist
  also immer auch ein solcher Fall; ebenso „nicht im Vogelschutzgebiet Hellwegbörde“, „nicht im Heilquellenschutzgebiet
  Bad Sassendorf“ (bzw. dessen Zonen „außerhalb“), „keine Planreife“, „keine Zurückstellung beantragt“ (§ 15 BauGB,
  entsprechend auch bei vorbereitenden Untersuchungen einer Sanierung, § 141 Abs. 4, und einer Erhaltungssatzung in
  Aufstellung, § 172 Abs. 2) und „keine Feuerstätte für feste Brennstoffe über 50 kW“. Die Fragen nach vorbereitenden
  Untersuchungen und einer Erhaltungssatzung in Aufstellung halten §§ 141, 172 BauGB offen („prüfen“), bis sie
  beantwortet sind; beim Flächennutzungsplan mit Konzentrationszonen zählt Windenergie an Land mit (§ 15 Abs. 3
  entsprechend nach § 245e Abs. 2 BauGB, Flächenbeitragswert; § 245e steht nur im Text der Regel zu § 15, seine Änderung
  meldet keine Prüfsumme). Hängt ein Paragraf an einem anderen, der nur „gilt,
  Ausnahme möglich“ ist, und entfiele er mit dessen Ausnahme, nennt er sie („Ausnahme
  möglich über § 14 BNatSchG – es fehlt dort: …“); die Ampel bleibt „gilt“.
  Unter „Ausnahme möglich – es fehlt“ stehen nur Fragen, die gerade gestellt werden (ohne Ausweichen auf nicht
  gestellte: eine Ausnahme, deren Fragen nicht gestellt sind, wird nicht angeboten). Ist die Ausnahme nur über Hinweise
  bzw. widersprüchliche Angaben ausgeschlossen, steht „Ausnahme ausgeschlossen, aber nicht gesichert (beruht auf:
  Wohnungen – nur Hinweis)“ dabei (die Ampel bleibt „gilt“; bei Modulwerten die Quelle, z. B. der Gemeindeschlüssel).
  Einzelfall einer Regel (`pruefen.wenn`): liegt er vor, wird Grün zu „Einzelfall: …“; ist offen, ob er vorliegt, heißt
  es „Einzelfall möglich – es fehlt: …“ bzw. „Einzelfall möglich – hängt an § … – dort offen“ (die Angaben stehen unter
  „es fehlt“ und zählen für „klärt am meisten“ – als eigenes Ergebnis neben rot/grün, eine Angabe, deren Antwort am
  Einzelfall nichts ändert, klärt nichts); beruht das „kein Einzelfall“ nur auf Hinweisen bzw. widersprüchlichen
  Angaben, steht das als „Nur Hinweis, nicht gesichert“ bzw. „Widerspruch“ da (bestätigen klärt). Hinweise, deren
  Bestätigung allein einen Paragrafen entschiede, stehen dort als „bestätigen klärt N“ (Werte eines Gebietsmoduls dort,
  woher die Unsicherheit kommt: beim Gemeindeschlüssel, solange er nicht gesichert ist, beim Bezug der Tabelle, wenn er
  nur Hinweis ist – ist der Bezug selbst ein Modulwert, zählen dessen Quellen –, beim Wert selbst, wenn die Tabelle von
  der Lage abhängt; sind es mehrere Quellen, beim Wert selbst. Werte, die das Bundesmodul liefert, hängen nicht am
  Gemeindeschlüssel). Ziele, an denen keine Regel unmittelbar hängt (der Bezug einer Tabelle), stehen dafür in der
  Liste; ein Sprungziel ohne Zeile schaltet „alle Angaben“ ein; während einer Suche wird die Suche geleert (angesagt),
  wenn das Ziel nicht unter den Treffern steht. „Für diesen Ort bestätigen“ im Hinweis behält dagegen eine Suche, die
  das Merkmal ausblendet: der Fokus geht ins Suchfeld, die Wirkung wird angesagt. Gespeicherte Modulwerte gelten nur,
  solange ein aktives Modul sie für den jetzigen Bezug liefert; beim Speichern fallen die übrigen aus der Datei. Nur
  zulässige Werte zählen: Ein Merkmalwert außerhalb der Werteliste (eigener Wert aus Formulare) und eine Angabe mit
  falschem Typ oder einem Wert außerhalb ihrer Auswahl (ältere Datei, umbenannter Auswahlwert) gelten als offen und sind
  so gekennzeichnet; Zahlen, die als Text gespeichert sind, werden wie im Eingabefeld gelesen.
- **Angaben (links):** oben **„Klärt am meisten“** – die fehlenden Angaben, die die meisten offenen Paragrafen
  entscheiden würden (Klick springt zur Angabe); dann die Antragsmerkmale als Knöpfe mit Erklärung (eingeklappt, wenn
  alle festgelegt sind; „leeren“ setzt ein Merkmal bewusst zurück); darunter alle Angaben, an denen eine Regel hängt,
  offene zuerst (die Reihenfolge entsteht beim Öffnen, Filtern und Suchen und bleibt dann stehen – eine beantwortete
  Angabe springt nicht weg). Jede Angabe trägt überall denselben kurzen Namen (höchstens 40 Zeichen – in der Liste, in
  „Klärt am meisten“, in Begründungen und im Protokoll); Frage bzw. ausführlicher Titel stehen darunter, lange
  Erläuterungen sind einklappbar (auch nach dem Beantworten). Die Antragsmerkmale tragen dieselben kurzen Namen wie im
  Regelbaum und im Protokoll („Gebäudeart“, „Planungsrecht“), die Erklärung steht darunter. Die Suche findet auch die
  kurzen Namen. Zahlen stehen deutsch mit Einheit („139,12 m²“), Anzahlen ganzzahlig. Jede Angabe zeigt ihre Herkunft
  (Stammdaten, QUADRIO, TERRIO, Geodienst, Regelmodul, von Hand – Apps mit Namen, ihre Erklärung im Tooltip). **Nur
  Hinweis** heißt: nicht gesichert (z. B. Geodienst ohne Treffer, Koordinaten nur straßengenau, Gemeindeschlüssel von
  Hand ohne Beleg) – ein solcher Wert kann nie etwas ausschließen, bis er **bestätigt** ist; eine Bestätigung lässt sich
  **zurücknehmen**. „alle Angaben“ zeigt auch Angaben, an denen gerade keine Regel hängt. Widerspricht das Merkmal
  „Planungsrecht“ den Geodaten (Bebauungsplan angegeben, Landschaftsplan gemeldet), wird das als Widerspruch angezeigt
  und macht betroffenes Grün gelb – auch dann, wenn eine Angabe von Hand dem Treffer eines Dienstes widerspricht. Ebenso
  wird eine Angabe von Hand widersprüchlich, wenn ein Dienst über eine Tabelle etwas anderes ergibt (z. B. „nicht im
  Denkmalbereich“ gegen einen Treffer des Denkmal-Dienstes). Plausibilität der Merkmale: Ein Wohngebäude (Ein-, Zwei-,
  Mehrfamilienhaus, Wohn- und Geschäftshaus) bei Errichtung oder Ersatzbau als „verfahrensfrei“ ist ein Widerspruch am
  Merkmal „Verfahren“ – § 62 Abs. 1 BauO NRW nennt keine Wohngebäude. Nötig ist im qualifizierten oder
  vorhabenbezogenen Bebauungsplan mindestens die Genehmigungsfreistellung (§ 63 Abs. 2, mit § 74 Abs. 7, 8 und 9 Satz
  1–2 nach § 63 Abs. 6 Satz 3), sonst mindestens § 64; der Satz richtet sich nach dem Planungsrecht. „verfahrensfrei“
  trägt dann kein „entfällt“ (etwa §§ 63, 74 BauO NRW, die Bauvorlagen der BauPrüfVO). Die erste Warnung je Merkmal hat
  „Zum Merkmal“ (springt auf den gewählten Wert); angesagt wird ein neuer Satz über eine stehende Live-Region. In den
  Sätzen steht bei der Anzeige nach „§“, „Abs.“, „Nr.“ ein geschütztes Leerzeichen.
- **Vorschriften (Mitte):** **offen zuerst** (Vorgabe: prüfen, gilt, entfällt), nach Ebene oder nach Thema; je Norm
  Fassung und Zähler in Worten, darunter die Paragrafen mit Ampel und Hauptgrund (die Angaben, die das Ergebnis tragen).
  Oben das Ergebnis je Ampel (zugleich Ein-/Ausblenden), Suche und Filter „nur von Hand festgelegte“ bzw. „nur
  geänderte/überholte“, mit Trefferzahl. Marken: „von Hand“ bzw. „von Hand · Entwurf“, „überholt“, „nicht wirksam“,
  „Text geändert“, „eigene Verantwortung“ (prüft die Bauaufsicht nicht). Hängt eine Regel an einem anderen Paragrafen,
  der selbst offen ist, heißt es „hängt an § … – dort offen“; in den Einzelheiten steht das unter „Hängt an“ (getrennt
  von den fehlenden Angaben). Ist die Spalte schmaler als 900 px, steht der Grund unter dem Titel.
- **Einzelheiten (rechts):** Ampel, Begründung in Worten, Hinweise (Ausnahmen, Einzelfall, Vorrang des Ortsrechts,
  Annahmen des Büros), fehlende und unsichere Angaben (Klick springt hin), ob die Bauaufsicht das im Verfahren prüft,
  womit es nachgewiesen wird, Stand der Regel, aufklappbar die **Regel im Einzelnen** (eingerückt, je Bedingung ✓ trifft
  zu, ✗ trifft nicht zu, ? offen, mit dem aktuellen Wert; entschiedene Unterzweige zugeklappt; „keines davon“ für
  verneinte Gruppen; verneinte Blätter positiv, auch durch Bausteine hindurch, z. B. „Gebäudeart: alles außer „EFH“ und
  „ZFH““; Schwellen wie im Gesetz: „über 22 m“, Anzahlen „mehr als 3“, „genau 3“, „vorhanden“, „keine“, die Einheit
  nicht doppelt und bei 1 in der Einzahl; Gemeindeschlüssel als Gemeindename; Verweise mit der Norm vor dem Titel („§ 36
  BauGB – Einvernehmen …“); Folgezeilen hängend eingerückt; ✓/✗ neutral eingefärbt, nicht in Ampelfarben), und der
  **Gesetzestext** mit den Absätzen der Fundstellen hervorgehoben (mit Legende); nach einer Änderung **alt/neu**
  untereinander mit gestrichenen bzw. unterstrichenen Wörtern – verglichen mit der Fassung, an der die Regel geprüft
  ist. Die Spalte lässt sich am linken Rand in der Breite ziehen (auch mit ←/→, Pos1/Ende). Beide Leisten schrumpfen bei
  schmalen Fenstern, die Mitte behält mindestens 420 px; Ziehen und Tastatur gehen nie über den verfügbaren Platz
  hinaus. Unter 1000 CSS-px (Web-Version, Browser-Zoom; der Desktop hat eine Mindestbreite) behält die Arbeitsfläche
  1000 px und die Seite scrollt waagerecht – keine Spalte wird abgeschnitten.

## Von Hand festlegen

Jeder darf festlegen – und bestätigt dafür zweimal:

1. **Beim Festlegen:** „Von Hand festlegen …“ → Ampel wählen, **Begründung** (Pflicht, mindestens 10 Zeichen) und Name.
   Herabstufungen (gilt → prüfen/entfällt, prüfen → entfällt) werden ausdrücklich angesagt. Die Festlegung ist danach
   ein Entwurf (gestrichelte Marke).
2. **Beim Speichern:** Neue, geänderte und **aufgehobene** Festlegungen erscheinen in einer Liste (vorher → nachher,
   Begründung, Herabstufungen hervorgehoben) – ebenso neu bestätigte Hinweise (siehe unten). „Bestätigen und speichern“
   geht erst nach dem Haken „Ich habe diese … geprüft“. Ist eine Festlegung inzwischen **überholt**, sagt die Liste das,
   und „Bestätigen und speichern“ ist gesperrt, bis sie erneut festgelegt oder aufgehoben ist; „noch nicht wirksam“ wird
   ebenfalls angezeigt. „Speichern, diese als Entwurf behalten“ schreibt für sie den bisherigen Stand der Datei (eine
   schon bestätigte Festlegung bleibt also erhalten) und lässt die Änderung in der App als Entwurf offen. Vor einem
   Antragswechsel, dem Öffnen eines anderen Projekts oder dem Beenden gilt das nicht als „gespeichert“: Die App meldet,
   dass Entwürfe offen sind, und bleibt, bis sie bestätigt, aufgehoben oder ausdrücklich verworfen („Nicht speichern“)
   sind.

„Festlegung aufheben“ wirkt sofort; daneben steht „Rückgängig“, der Fokus geht auf „Von Hand festlegen …“. Auch das
Aufheben einer gespeicherten Festlegung wird beim Speichern noch einmal bestätigt. Ein Entwurf zählt für Verweise,
„Klärt am meisten“ und die offenen Punkte noch nicht als Klärung; eine mit „Rückgängig“ wiederhergestellte Festlegung,
die nicht mehr dem Stand der Datei entspricht, ist wieder Entwurf.

Eine Festlegung geht der Automatik vor. Sie wird **überholt**, sobald die automatische Ampel danach strenger wird als
damals und als die Festlegung (wird sie schwächer oder kommt sie bei der Festlegung an, bleibt die Festlegung richtig),
sobald sich der **Ort** ändert (Anschrift, Grundstück oder Koordinaten – eine Festlegung gilt für den Ort, an dem sie
getroffen wurde; eine Festlegung ohne Ortsangabe – aus einer älteren Datei – gilt als überholt; über der Liste ordnet
„Für diesen Ort übernehmen“ alle in einem Schritt dem jetzigen Ort zu, als Entwurf, der beim Speichern bestätigt wird),
sobald sich eine beteiligte Angabe (auch nur ihre Sicherheit, z. B. ein neuer Widerspruch) oder der Text einer
Fundstelle ändert (oder sie ohne geprüften Text getroffen wurde und der Text jetzt vorliegt) – dann steht die Marke
„überholt“ daran, ein überholtes „entfällt“ zählt mindestens als „prüfen“, ein überholtes „prüfen“ hält ein
automatisches „gilt“ nicht auf (es gilt dann die automatische Ampel), und das Protokoll führt sie als offen. Fehlt
dagegen der Systemstand (Text nicht verfügbar, Rechtsstand nicht aktuell bestätigt, zum Stichtag gilt schon eine neue
Fassung), ist ein festgelegtes „entfällt“ **noch nicht wirksam**: Es zählt als „prüfen“, bis der Text geprüft vorliegt –
erneutes Festlegen hilft dagegen nicht. Verweist eine Regel auf einen anderen Paragrafen, zählt dort nur die
automatische Ampel oder eine bestätigte, nicht überholte Festlegung – und auch die nur als unsicher (ein „entfällt“, das
darauf beruht, wird „prüfen“).

**Festlegen** wird angesagt („§ 6 BauO NRW: von Hand „gilt“ festgelegt – Entwurf, beim Speichern noch einmal
bestätigen“). Wirkte ein „entfällt“ von Hand noch nicht, sagen Dialog und Ansage es vorher bzw. danach („noch nicht
wirksam (Text der Norm nicht verfügbar), es bleibt bei „gilt““) – mit derselben Bedingung wie der Kern
(`entfaelltVorbehalt`: nur bei Regeln mit Prüfsummen; Verweise ohne abrufbaren Text brauchen keinen Text; sonst Text
fehlt, Rechtsstand alt, neuere Fassung zum Stichtag, Text für anderen Stichtag, angekündigte Fassung). **Aufheben** wird
angesagt („Festlegung aufgehoben – automatisch: „gilt““), ebenso „Rückgängig“ („Festlegung wiederhergestellt – „prüfen“
(Entwurf)“, bei einem noch nicht wirksamen „entfällt“ mit Grund). Die Gruppenüberschrift „Antragsmerkmale“ ist während
einer Suche `aria-disabled` (nicht zuklappbar), bleibt aber voll lesbar.

**Hinweise bestätigen:** Angaben, die nur Hinweis sind (z. B. „kein Treffer im Landschaftsschutzgebiet“, Flächen aus
dem Modell), lassen sich mit „Bestätigen …“ als gesichert übernehmen – nur mit Angabe, worauf die Bestätigung beruht (z.
B. Auskunft der Behörde mit Datum). Der Dialog zeigt vorher, wie viele Vorschriften dadurch herabgestuft werden – mit
genau der Rechnung, die danach gilt. Widerspricht ein Dienst der Angabe, bleibt der Widerspruch auch nach der
Bestätigung bestehen; der Dialog sagt das. Auch Bestätigungen werden beim Speichern noch einmal bestätigt und stehen im
Prüfprotokoll. Der Dialog beim Speichern nennt, was genau neu ist (neue, geänderte, aufgehobene Festlegungen, neu
gesicherte Angaben, das Planungsrecht), mit Name und Datum; die Folgen je Punkt allein gegenüber der Datei, mit Vermerk,
was eine andere Bestätigung ebenso bewirkt, und bei mehreren Punkten „Zusammen (gegenüber dem Stand ohne diese
Bestätigungen)“ – so fehlt keine Herabstufung, auch wenn zwei Bestätigungen dieselbe Vorschrift entscheiden. Der Fokus
beginnt am Häkchen. Eine bestätigte Angabe aus dem Modell bzw. aus einer Tabelle des Regelmoduls gilt nur für genau
diesen Wert – ändert sich das Modell bzw. die Tabelle, ist sie wieder Hinweis.

**Schutzgebiete und Geodaten von Hand** (ja/nein, Auswahl) gibt es nur mit Beleg – wie eine Bestätigung. Widerspricht
die Angabe einem Treffer eines Dienstes, bleibt der Widerspruch stehen; was nur an ihr hängt, bleibt „prüfen“ (für einen
begründeten Sonderfall: den Paragrafen von Hand festlegen).

## Lage abfragen (Desktop)

An den Koordinaten der Stammdaten: **Flurstück und Gemeindeschlüssel** aus ALKIS NRW, danach alle Geodienste, die die
aktiven Module nennen (z. B. Schutzgebiete aus LINFOS, Überschwemmungs- und Wasserschutzgebiete, Denkmalbereich und
Bebauungspläne der Stadt Soest) – am **Umring des Flurstücks mit mindestens 25 m Puffer**, auch die Vorstufen (vorläufig
gesichert, geplant). **Ein Treffer gilt als gesichert. Kein Treffer bleibt ein Hinweis**, auch wenn alles andere stimmt:
Ob seit dem Datenstand des Dienstes eine neue Verordnung bekanntgemacht wurde, lässt sich nicht automatisch prüfen –
nach einem Blick ins Amtsblatt bzw. der Auskunft der Behörde „Bestätigen …“. So entsteht kein falsches „entfällt“.

- Ein späterer **Treffer geht immer vor** – auch einem bestätigten „kein Treffer“.
- Widerspricht ein Dienst einer Angabe von Hand (z. B. Treffer gegen „nein“), bleibt die Angabe, aber sie ist als
  **Widerspruch** markiert; was nur an ihr hängt, wird „prüfen“, bis sie geändert oder geklärt ist.
- Ergebnisse und Bestätigungen gelten nur für die **Lage**, an der sie ermittelt wurden. Ändern sich die Koordinaten des
  Vorhabens, werden sie wieder zum Hinweis.

Gesendet werden nur die Lage des Grundstücks (Koordinaten bzw. Umring) und welche Gesetze gebraucht werden – keine
Personendaten.

## Bedienung mit der Tastatur

Die ersten Tabstopps sind die Sprungmarken „Zu den Angaben / Vorschriften / Einzelheiten“ (sichtbar, sobald sie den
Fokus haben), danach die Titelleiste. Die Vorschriftenliste ist ein Tabstopp: ↑/↓, Pos1/Ende wählen den Paragrafen.
Auswahlgruppen (ja/nein, Merkmale) bedienen sich mit ←/→ bzw. ↑/↓ (mit Umlauf), Pos1/Ende. F6 (Umschalt+F6) springt
zwischen Kopf, Angaben, Vorschriften und Einzelheiten; ist kein Paragraf gewählt, bekommen die Einzelheiten selbst den
Fokus (der Bereich wird angesagt, F6 geht weiter). Menüs (Mehr, Filter, Farbschema) nehmen beim Öffnen den Fokus,
bedienen sich mit ↑/↓ und Pos1/Ende, schließen mit Esc (Fokus zurück an ihren Knopf) und schließen, sobald der Fokus sie
mit Tab verlässt; ihre Einträge sind keine eigenen Tabstopps; ein zweiter Klick auf den Öffner schließt das Menü. Die
Suche in den Vorschriften findet Zitate genau (Norm nach Kurzform): „§ 6 BauO NRW“, „§ 62 Abs. 1 Satz 1 Nr. 1a BauO
NRW“, „§§ 30, 34 BauGB“, Bereiche „§§ 30 bis 35“, „§§ 30–35“, „§§ 30-35“, „§§ 30 ff.“ und „§ 30 f.“, benannte Einheiten
wie „C.3“. Ein „§“, den die Regeln nicht kennen, zeigt die genannte Norm mit dem Hinweis „§ 248 BauGB ist nicht erfasst
– gezeigt: BauGB“ (bei Bereichen „§ 29 ist nicht erfasst“ in der Trefferzeile, lange Listen zusammengefasst: „32 der 35
§§ sind nicht erfasst“); ohne Norm ergibt er keinen Treffer. Ohne „§“ und ohne Paragrafentreffer sucht sie im Text
(Zahlen als ganzes Wort, ein Bindestrich bleibt Teil des Worts – „DIN 4108-2“; Kürzel bis drei Zeichen wie „GK“, „GRZ“
nur am Wortanfang und auch ausgeschrieben, gängige Synonyme wie Abriss/Rückbau, Einfriedung/Einfriedigung; Umlaute auch
als „a“ bzw. „ae“ – „Stellpla“, „Stellplaetze“, „Ruckbau“). Die Suche in den Angaben geht über den sichtbaren Text
(Kurzname, Titel, Frage, Werte), nicht über interne Kennungen. Die Trefferzahl wird angesagt (Angaben wie Vorschriften);
wer nur sucht, bekommt „Suche leeren“ statt „Filter zurücksetzen“. Nach Suche, Filter und „Filter zurücksetzen“ bleibt
die gewählte Zeile im Blick, der Fokus geht ins Suchfeld. Die Sammelmarke der Warnungen öffnet dasselbe Menü wie „Mehr“ an der Marke selbst (ein zweiter Klick schließt es),
Esc gibt den Fokus an die Marke zurück. Nach „Bestätigen“, „zurücknehmen“ und der Wahl des Farbschemas bleibt der Fokus an
der Angabe bzw. am Knopf. In den Dialogen „von Hand festlegen“, „Angabe bestätigen“ und „Angabe von Hand setzen“ löst
Enter (außer im mehrzeiligen Begründungsfeld) den Hauptknopf aus; der Titel steht im Kopf des Dialogs.

## Rechtsstand

- Quellen: Rechtsinformationssystem des Bundes (wo vorhanden), gesetze-im-internet.de, recht.nrw.de (stabiler Link
  „aktuellste Fassung“, Fassungsliste mit künftigen Fassungen), Ortsrecht als PDF/HTML, MVV TB des DIBt.
- Jede Norm wird höchstens einmal am Tag an der Quelle geprüft (bedingte Abfragen), „Rechtsstand prüfen“ sofort. Die
  Fassungen liegen im gemeinsamen Konfigurationsordner unter `baurecht/recht/` – für alle Projekte gleich, nie
  überschrieben; ist eine Quelle nicht erreichbar, arbeitet die App mit dem letzten Stand und sagt es. Ist eine Norm
  seit **14 Tagen** nicht mehr an der Quelle bestätigt (oder nie), wird aus „entfällt“ ein „prüfen“.
- Die Texte werden zu viert parallel geholt und kommen **gebündelt** in die Ansicht: höchstens alle 250 ms ein
  Zwischenstand, am Ende der Rest – nicht je Text eine neue Auswertung (`TEXTE_BUENDELN_MS` in `pruefung.ts`).
- **Stichtag:** Eine Fassung mit bekanntem Ende vor der Einreichung deckt den Stichtag nicht; gilt zum Stichtag laut
  Quelle schon eine angekündigte Fassung, wird sie geholt – liegt ihr Text nicht vor, wird aus „entfällt“ ein „prüfen“.
  Auch „entfällt mit der Norm“ (Anwendungsbereich) braucht den geprüften Text der Norm.
- **Künftige Fassungen:** Kündigt die Quelle eine neue Fassung an, die innerhalb von sechs Monaten nach der geplanten
  Einreichung gilt (voraussichtlich vor der Entscheidung), wird aus „entfällt“ ein „prüfen“ – an der künftigen Fassung
  prüfen.
- **Prüfsumme je Absatz:** Jede Regel weiß, an welchem Text sie geprüft ist. Ändert sich ein Absatz, wird aus „entfällt“
  ein „prüfen“ (aus „gilt“ wird nichts Schwächeres), bis die Regel nachgezogen ist.
- Ohne Text (Web-Version, Quelle nie erreichbar) bleibt aus demselben Grund alles, was sonst entfiele, gelb.

## Prüfprotokoll

Kopf aus den Stammdaten, Grundlagen (Stichtag, Module, Regelpaket, Merkmale, Ergebnis), dann **Festlegungen von Hand**
(Ampel, automatisch, Begründung, Name, Datum, Entwurf/bestätigt) und **gesicherte Angaben** (Wert, Herkunft, worauf
gestützt, von wem) als Tabellen, dann die **offenen Punkte** als Tabelle „Was fehlt – Anzahl – Paragrafen“; danach alle
Paragrafen je Ebene mit Ampel, Begründung und Fassung, Quellen der Geodaten, Hinweise und Auskünfte der Module. Angaben
von Hand ohne Beleg stehen in einer eigenen Tabelle (mit wer und wann). Die offenen Punkte zählen wie „Klärt am meisten“
(ein Paragraf kann unter mehreren Angaben stehen); Punkte mit nur einem Paragrafen stehen gesammelt unter „Weitere“.
Enthält es Entwürfe, steht „ENTWURF …“ als Kopfzeile im oberen Seitenrand jeder Druckseite (überdruckt keinen Text);
Überschriften werden nicht von ihrer Tabelle getrennt. Warum „Prüfung abschließen“ gesperrt ist, steht sichtbar neben
dem Knopf. „Drucken / PDF …“ ist der Hauptknopf rechts außen (wie in allen Druckvorschauen), „Schließen“ steht links
davon. „Drucken / PDF …“ schlägt den Dateinamen `<Projektdatei> Baurecht <Antrag>.pdf` vor. Am Bildschirm klebt die
Aktionsleiste oben und der Tabellenkopf darunter (in sehr niedrigen Fenstern – 400 % Zoom – klebt nur der Tabellenkopf);
Tabellenzellen trennen nach Silben (erst notfalls mitten im Wort), kurze Nummern („§ 248“) und Kennungen („SO‑076“)
bleiben zusammen. Nach dem Speichern bei offenem Protokoll heißt es „Gespeichert – die Prüfung lässt sich jetzt
abschließen.“, wenn nichts mehr sperrt. **„Prüfung abschließen“** legt den Stand (Fassungen, Ampeln, Zähler, Regelpaket)
in der Projektdatei ab – erst, wenn nichts mehr Entwurf, alles gespeichert und jeder Text geladen ist. Danach steht oben
eine Meldung („Prüfung vom … abgelegt (… gilt · … prüfen · … entfällt) – zum Übernehmen in die Datei speichern“,
stehende Live-Region) mit „Jetzt speichern“, der Fokus geht dorthin; „Jetzt speichern“ steht auch neben jedem Sperrtext
„Erst speichern …“. Danach (auch nach Strg+S) „Gespeichert – …“ bzw. „Nicht gespeichert – …“ im Dialog, der Fokus geht
dann auf „Drucken / PDF …“; jedes Speichern bei offenem Protokoll (auch Strg+S) meldet sich in dessen Live-Region, ohne
den Fokus zu verschieben. Eine abgelegte, noch nicht gespeicherte Prüfung ist auch nach dem Wiederöffnen erkennbar
(Meldung mit „Jetzt speichern“, Eintrag „noch nicht in der Datei gespeichert“). Derselbe Stand (gleiche Ampeln,
Fassungen, Regelpaket, Stichtag) wird nicht zweimal abgeschlossen; abgeschlossene Prüfungen stehen mit Datum und
Uhrzeit. Mit „ohne „entfällt““ vermerkt das Ergebnis, dass diese Vorschriften im Ausdruck fehlen. Nach jedem Speichern
steht im Kopf kurz „Gespeichert“ (bzw. „– keine Änderungen“, „– N Entwürfe bleiben offen“), auch angesagt. Im
Speichern-Dialog nennt eine geänderte Festlegung den bisherigen Stand der Datei („bisher: gilt (Name, Datum: Grund)“);
Kopf und Fuß (Häkchen, Knöpfe) stehen fest, die Liste dazwischen ist ein benannter Scrollbereich („Änderungen seit dem
letzten Speichern“, Tabstopp, Pfeiltasten scrollen), der Startfokus bleibt am Häkchen. Schmal (≤ 600 px) stehen die
Knöpfe untereinander, in sehr niedrigen Fenstern scrollt der ganze Dialog. „Jetzt speichern“ ist während des Speicherns
`aria-disabled` (fokussierbar, gesperrt dargestellt).

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

Prüfungen des Pakets (`npm test -w @akh/baurecht-regeln`): Format und Verweise, die **Fallmatrix** (kein falsches Grün
über alle Kombinationen der Merkmale), die Fälle aus den Fachprüfungen und **„Fragen und Regeln“**: Eine Angabe, deren
Frage nicht gestellt wird (Bedingung `wenn` der Angabe ergibt „nein“), darf in keinem Grundfall einen Paragrafen ändern,
offen lassen oder unter „klärt am meisten“ stehen – auch nicht, wenn eine gestellte Angabe fehlt (je Grundfall jede
gestellte Angabe einzeln offen gelassen, dazu Altbau „nein“ und Umfang offen). Eine Norm, die an einer nur bedingt
gestellten Frage hängt, nimmt deshalb deren Bedingung in die Geltung auf (z. B. Heilquellenschutzgebiet Bad Sassendorf
nur im Wasser- oder Heilquellenschutzgebiet, außerhalb von Bad Sassendorf und Soest „nein“ aus dem Gemeindeschlüssel).
Ob nicht gestellt, prüft das Paket mit demselben `frageGestellt` wie die App. Fragebedingungen (`wenn`) dürfen nicht auf
Paragrafen verweisen (`n`) und keine Zyklen bilden (eine Frage, deren Bedingung über Bausteine oder den Bezug
abgeleiteter Werte an ihr selbst hängt) – `paketPruefen` lehnt beides ab, über alle Definitionen einer Angabe (ein Ort
ohne Gemeindemodul nimmt die des Landes). Der Fixpunkt steht nach höchstens Tiefe + 1 Runden (gerechnet wird mit der
Zahl der Antworten + 2). Fände die Auswertung dennoch keinen festen Stand, zählen nur Antworten, die in jeder Runde
gestellt waren (eine weggelassene Antwort führt nur zu „offen“); Antworten auf nicht gestellte Fragen dürfen weder als
„ja“ noch als „nein“ etwas ändern. § 36 BauGB (Einvernehmen) entfällt, wo die Gemeinde selbst untere Bauaufsicht ist
(„Gemeinde ist selbst Bauaufsicht“: im Kreis Soest Lippstadt, Soest, Warstein, Werl; in NRW die kreisfreien Städte und
Aachen nach Gemeindeschlüssel; sonst offen – „gilt, Ausnahme möglich“). § 47 Abs. 6 BauO NRW (Fassung ab 01.09.2026):
Bei einer Nutzungsänderung zu Wohnraum wird gefragt, ob Nutzungseinheiten mit Aufenthaltsräumen in einem bestehenden
Gebäude umgenutzt werden (gefragt bei einer Nutzungsänderung an einem Gebäude, das Wohngebäude ist oder mindestens eine
Wohnung hat – bei einem Nichtwohngebäude ohne Wohnung nicht; der Baustein `nw_umnutzung_wohnraum` verlangt nur
Nutzungsänderung, Wohngebäude bzw. Wohnung und „ja“, so bleibt eine offene Gebäudeart ohne Wirkung); dann entfallen §§
29, 34 und 36, § 35 gilt nur noch mit Abs. 2 (Hinweis), §§ 6, 15, 27, 28, 30 bis 32 gelten mit dem Hinweis „nicht für
bestehende Bauteile“. § 35 BauO NRW gilt mit Abs. 2 (Rettungsweglänge 35 m von Aufenthaltsräumen und Kellergeschossen)
in jeder Gebäudeklasse, der notwendige Treppenraum (Abs. 1) erst ab Gebäudeklasse 3; „entfällt“ nur bei Gebäudeklasse
1/2 ohne Aufenthaltsräume und ohne Kellergeschoss (`nw.kellergeschoss`, nur dann gefragt). MVV TB A 1.2.9 wird an der
Fundstelle A 1.2.9.1 (DIN 4149) geprüft; `paketPruefen` lehnt Prüfsummen leerer Texte ab (die Fundstelle wurde beim
Abruf nicht gefunden) und ordnet Unterabschnitte („A 1.2.9.1“) ihrem Abschnitt zu. Die Entwässerungssatzung Soest § 9
bleibt ohne neue Entwässerung ein Einzelfall, wo Niederschlagswasser anfällt (Dach eines Gebäudes ohne Aufenthaltsräume,
befestigte Fläche einer Anlage ohne Gebäude – Stellplätze bzw. Garagen auf dem Grundstück oder sonst eine neue
befestigte Fläche wie Lagerplatz oder Hof –, neue Dach- oder befestigte Fläche einer Änderung wie ein Anbau; gefragt als
`soest.befestigte_flaeche`, wenn keine neue Entwässerung angegeben ist). Einzelfalltexte im Paket tragen kein „im
Einzelfall prüfen“ – das setzt die Auswertung davor.

Die großen Matrizen (Fallmatrix, „neue Merkmalwerte“, „Fragen und Regeln“) rechnen voll über zehn Minuten (ohne Netz).
Voll laufen sie in der CI (GitHub Actions setzt `CI=true`) und mit `VOLL=1 npx vitest run --project regeln`; sonst –
lokal, in Cloud-Sitzungen – prüft eine feste, über alle Merkmalswerte gestreute Stichprobe in unter einer Minute (Zeitgrenze
60 s), die Fallmatrix nur voll. Im PR rechnet die CI nur voll, wenn der PR die Auswertung erreichen kann
(`scripts/regeln-matrix.mjs`): Regelpaket, LEXIO, ihr Kern (über Importe, auch aus Tests), Wurzel-Konfiguration,
Workflows, Skripte und alles nicht sicher Zuordenbare. Nur Doku, Notizen, andere Apps und Kerndateien außerhalb lassen
die Stichprobe zu (`REGELN_STICHPROBE=1`). Auf `main`, im Release-Lauf und im Regel-Workflow bleibt es immer voll.

Auslieferung und Wächter: `.github/workflows/regeln.yml` – Prüfen und Bauen in einem Job ohne Schreibrechte und ohne
Schlüssel, Signieren (OpenSSL, Ed25519) und Hochladen in das Release „regeln“ in einem eigenen Job ohne npm; der Wächter
gleicht wöchentlich mit den geltenden Fassungen ab und legt bei Abweichungen ein Issue an. Signiert wird nur von `main`
und nur in der GitHub-Umgebung **„regeln“** – diese Umgebung in den Einstellungen des Repos anlegen (Branch-Regel
`main`, Freigabe durch Reviewer) und das Secret `BAURECHT_REGELN_SCHLUESSEL` dort hinterlegen.

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
- Ablage und Speicherort der Einstellungen: Bei einer Netzwerkinstallation liegt die Ablage auf dem Netzlaufwerk und
  gilt für alle Rechner des Büros. Beim Wechsel des Speicherorts zieht sie nicht mit – sie ist nur ein Zwischenspeicher,
  die Fassungen werden am neuen Ort neu geholt. Im Notbetrieb (Netzlaufwerk nicht erreichbar) ist sie nicht verfügbar;
  neu geholte Fassungen werden dann nicht abgelegt.
- Netzfehler: Nur Verbindungsfehler und Zeitüberschreitungen werden wiederholt, nicht „Host nicht freigegeben“ o. Ä.
- Kern im gemeinsamen Unterbau: `packages/core/src/recht/` (Adapter, Prüfsummen, Rechtsstand),
  `packages/core/src/baurecht/` (Format, Bedingungen, Auswertung, Projektdatei, Geodienste).
- Entwicklung: `npm run dev:baurecht` (http://localhost:1500), `npm run tauri:dev:baurecht`; Live-Abgleich der Quellen:
  `LIVE=1 npx vitest run packages/core/src/recht/quellen.live.test.ts`.

Die Ergebnisse sind eine Arbeitshilfe und ersetzen keine fachliche Prüfung; die rechtliche Einordnung bleibt bei den
Entwurfsverfassenden (§ 54 BauO NRW).
