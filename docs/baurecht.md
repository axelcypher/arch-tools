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
2. **Beim Speichern:** Neue oder geänderte Festlegungen erscheinen in einer Liste (automatisch → festgelegt,
   Begründung, Herabstufungen hervorgehoben). „Festlegungen bestätigen und speichern“ geht erst nach dem Haken „Ich habe
   die Festlegungen geprüft“; „Ohne diese Festlegungen speichern“ speichert den Rest und lässt sie als Entwurf offen.

Eine Festlegung geht der Automatik vor. Sie wird **überholt**, sobald sich danach die automatische Ampel, eine
beteiligte Angabe oder der Text einer Fundstelle ändert – dann steht ⚠ daran, und das Protokoll zählt sie als offen.

## Lage abfragen (Desktop)

An den Koordinaten der Stammdaten: **Flurstück und Gemeindeschlüssel** aus ALKIS NRW, danach alle Geodienste, die
die aktiven Module nennen (z. B. Schutzgebiete aus LINFOS, Überschwemmungs- und Wasserschutzgebiete, Denkmalbereich
und Bebauungspläne der Stadt Soest) – am **Umring des Flurstücks mit mindestens 25 m Puffer**, auch die Vorstufen
(vorläufig gesichert, geplant). **Ein Treffer gilt als gesichert. Kein Treffer bleibt ein Hinweis**, auch wenn alles
andere stimmt: Ob seit dem Datenstand des Dienstes eine neue Verordnung bekanntgemacht wurde, lässt sich nicht
automatisch prüfen – nach einem Blick ins Amtsblatt bzw. der Auskunft der Behörde „Bestätigen“. So entsteht kein
falsches „entfällt“.

Gesendet werden nur die Lage des Grundstücks (Koordinaten bzw. Umring) und welche Gesetze gebraucht werden – keine
Personendaten.

## Rechtsstand

- Quellen: Rechtsinformationssystem des Bundes (wo vorhanden), gesetze-im-internet.de, recht.nrw.de (stabiler Link
  „aktuellste Fassung“, Fassungsliste mit künftigen Fassungen), Ortsrecht als PDF/HTML, MVV TB des DIBt.
- Jede Norm wird höchstens einmal am Tag an der Quelle geprüft (bedingte Abfragen), „Rechtsstand prüfen“ sofort. Die
  Fassungen liegen im gemeinsamen Konfigurationsordner unter `baurecht/recht/` – für alle Projekte gleich, nie
  überschrieben; ist eine Quelle nicht erreichbar, arbeitet die App mit dem letzten Stand und sagt es.
- **Prüfsumme je Absatz:** Jede Regel weiß, an welchem Text sie geprüft ist. Ändert sich ein Absatz, wird aus
  „entfällt“ ein „prüfen“ (aus „gilt“ wird nichts Schwächeres), bis die Regel nachgezogen ist.
- Ohne Text (Web-Version, Quelle nie erreichbar) bleibt aus demselben Grund alles, was sonst entfiele, gelb.

## Prüfprotokoll

Kopf aus den Stammdaten, Grundlagen (Stichtag, Module, Regelpaket, Merkmale, Ergebnis), alle Paragrafen je Ebene mit
Ampel, Begründung und Fassung, offene Punkte, Festlegungen von Hand (mit Name, Datum, Entwurf/bestätigt), Hinweise und
Auskünfte der Module. „Drucken / PDF …“ schlägt den Dateinamen `<Projektdatei> Baurecht <Antrag>.pdf` vor.
**„Prüfung abschließen“** legt den Stand (Fassungen, Ampeln, Zähler, Regelpaket) in der Projektdatei ab.

## Daten

In `projekt.json` unter `baurecht.pruefungen[<Antrag>]`: geplante Einreichung, Angaben von Hand bzw. aus Geodiensten,
Festlegungen, abgeschlossene Prüfungen. Die Antragsmerkmale bleiben im Abschnitt `formulare` (eine Quelle mit
Formulare). Geschrieben wird gezielt (nur `projekt.json`, Zusammenführen bei gleichzeitigen Änderungen).

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

Auslieferung und Wächter: `.github/workflows/regeln.yml` (Release „regeln“; wöchentlicher Abgleich mit den geltenden
Fassungen, bei Abweichungen ein Issue). **Einrichten:** `npm run schluessel`, privaten Schlüssel als Secret
`BAURECHT_REGELN_SCHLUESSEL`, öffentlichen in `packages/baurecht-regeln/schluessel/regeln.pub`. Solange der öffentliche
Schlüssel fehlt, nutzt die App das Regelpaket ihres Builds.

## Technik

- Netz nur über den Tauri-Befehl `netz_holen` (`apps/baurecht/src-tauri/src/netz.rs`) zu freigegebenen Hosts; jede
  Umleitung wird einzeln gegen die Liste geprüft; Hosts aus einem gültig signierten Paket kommen dazu. Die CSP der
  Webansicht bleibt unverändert. Ablage des Rechtsstands über `baurecht_ablage_*` (nur JSON unter `baurecht/`).
- Kern im gemeinsamen Unterbau: `packages/core/src/recht/` (Adapter, Prüfsummen, Rechtsstand),
  `packages/core/src/baurecht/` (Format, Bedingungen, Auswertung, Projektdatei, Geodienste).
- Entwicklung: `npm run dev:baurecht` (http://localhost:1490), `npm run tauri:dev:baurecht`; Live-Abgleich der Quellen:
  `LIVE=1 npx vitest run packages/core/src/recht/quellen.live.test.ts`.

Die Ergebnisse sind eine Arbeitshilfe und ersetzen keine fachliche Prüfung; die rechtliche Einordnung bleibt bei den
Entwurfsverfassenden (§ 54 BauO NRW).
