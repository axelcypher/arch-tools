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
  (geprüft um …, nicht abrufbar, geändert, neue Fassung angekündigt), **Lage abfragen**, **Rechtsstand prüfen**,
  **Prüfprotokoll**, **Speichern** (Strg+S).
- **Bilanz:** Zahl der Paragrafen je Ampel und **„Am meisten klärt“** – die fehlenden Angaben, die die meisten
  gelben Paragrafen entscheiden würden (Klick springt zur Angabe).
- **Angaben (links):** Antragsmerkmale als Knöpfe mit Erklärung und Fundstelle; darunter alle Angaben, an denen eine
  Regel hängt, offene zuerst. Jede Angabe zeigt ihre Herkunft (Stammdaten, Flächenrechner, GRZ-Nachweis, Geodienst,
  Regelmodul, von Hand). **Nur Hinweis** heißt: nicht gesichert (z. B. Geodienst ohne Treffer, Koordinaten nur
  straßengenau) – ein solcher Wert kann nie etwas ausschließen, bis er **bestätigt** ist. „alle“ zeigt auch Angaben,
  an denen gerade keine Regel hängt.
- **Vorschriften (Mitte):** nach Ebene (Bund, Land, Kreis, Gemeinde) oder Thema; je Norm Fassung und Zähler, darunter
  die Paragrafen mit Ampel und Hauptgrund. Filter: Ampel, von Hand, geändert/überholt, Suche. Marken: „von Hand“
  (gestrichelt = Entwurf), „überholt“, „Text geändert“, „eigene Verantwortung“ (prüft die Bauaufsicht nicht).
- **Einzelheiten (rechts):** Ampel, Begründung in Worten, Hinweise (Ausnahmen, Einzelfall, Vorrang des Ortsrechts,
  Annahmen des Büros), fehlende und unsichere Angaben (Klick springt hin), ob die Bauaufsicht das im Verfahren prüft,
  womit es nachgewiesen wird, Regeldatei und Fassung, an der die Regel geprüft ist, und der **Gesetzestext** mit den
  Absätzen der Fundstellen hervorgehoben; nach einer Änderung **alt/neu** nebeneinander.

## Von Hand festlegen

Jeder darf festlegen – und bestätigt dafür zweimal:

1. **Beim Festlegen:** „Von Hand festlegen …“ → Ampel wählen, **Begründung** (Pflicht, mindestens 10 Zeichen) und Name.
   Herabstufungen (gilt → prüfen/entfällt, prüfen → entfällt) werden ausdrücklich angesagt. Die Festlegung ist danach
   ein Entwurf (gestrichelte Marke).
2. **Beim Speichern:** Neue, geänderte und **aufgehobene** Festlegungen erscheinen in einer Liste (vorher → nachher,
   Begründung, Herabstufungen hervorgehoben) – ebenso neu bestätigte Hinweise (siehe unten). „Bestätigen und speichern“
   geht erst nach dem Haken „Ich habe diese Angaben geprüft“. „Ohne diese Angaben speichern“ schreibt für sie den
   bisherigen Stand der Datei (eine schon bestätigte Festlegung bleibt also erhalten) und lässt die Änderung in der App
   als Entwurf offen.

Eine Festlegung geht der Automatik vor. Sie wird **überholt**, sobald sich danach die automatische Ampel, eine
beteiligte Angabe oder der Text einer Fundstelle ändert – dann steht ⚠ daran, ein überholtes „entfällt“ zählt als
„prüfen“, und das Protokoll führt sie als offen. Verweist eine Regel auf einen anderen Paragrafen, zählt dort nur die
automatische Ampel oder eine bestätigte, nicht überholte Festlegung – und auch die nur als unsicher (ein „entfällt“, das
darauf beruht, wird „prüfen“).

**Hinweise bestätigen:** Angaben, die nur Hinweis sind (z. B. „kein Treffer im Landschaftsschutzgebiet“, Flächen aus
dem Modell), lassen sich mit „Bestätigen …“ als gesichert übernehmen – nur mit Angabe, worauf die Bestätigung beruht
(z. B. Auskunft der Behörde mit Datum). Der Dialog zeigt vorher, wie viele Vorschriften dadurch herabgestuft werden.
Auch Bestätigungen werden beim Speichern noch einmal bestätigt und stehen im Prüfprotokoll. Eine bestätigte Angabe
aus dem Modell gilt nur für genau diesen Wert – ändert sich das Modell, ist sie wieder Hinweis.

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

Die Vorschriftenliste ist ein Tabstopp: ↑/↓, Pos1/Ende wählen den Paragrafen. F6 (Umschalt+F6) springt zwischen Kopf,
Angaben, Vorschriften und Einzelheiten; dieselben Sprungmarken erscheinen beim ersten Tab.

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

Kopf aus den Stammdaten, Grundlagen (Stichtag, Module, Regelpaket, Merkmale, Ergebnis), alle Paragrafen je Ebene mit
Ampel, Begründung und Fassung, offene Punkte, Festlegungen von Hand (mit Name, Datum, Entwurf/bestätigt), bestätigte
Angaben (mit Begründung), Quellen der Geodaten, Hinweise und Auskünfte der Module. „Drucken / PDF …“ schlägt den
Dateinamen `<Projektdatei> Baurecht <Antrag>.pdf` vor. **„Prüfung abschließen“** legt den Stand (Fassungen, Ampeln,
Zähler, Regelpaket) in der Projektdatei ab – erst, wenn keine Angabe von Hand mehr Entwurf ist.

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
Wächter gleicht wöchentlich mit den geltenden Fassungen ab und legt bei Abweichungen ein Issue an. **Einrichten:** `npm run schluessel`, privaten Schlüssel als Secret
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
