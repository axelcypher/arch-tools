# Baurecht – Konzept (Entwurf)

Stand: 12.11.2026 · Status: Planung, noch kein Code

Neue App `apps/baurecht` („Baurecht“): zeigt zu einem Projekt alle Vorschriften, die für den Antrag eine Rolle
spielen, **je Paragraf als Ampel** – und begründet jede Einstufung. Die Angaben zum Projekt kommen wie bei allen Apps
aus der Projektdatei (`.oap`). Die Gesetzestexte holt die App **live** aus den amtlichen Quellen und merkt, wenn eine
neue Fassung gilt. Die Regeln, wann was gilt, sind **austauschbare Module** in einem eigenen Regelpaket: je Gebiet
(Bund, Land, Kreis, Gemeinde) ein Modul, darin je Norm und Fassung eine kleine Datei. Zweck: die Rechtsprüfung **vor
dem Einreichen eines Antrags**.

| Ampel | Bedeutung | Wann automatisch |
|---|---|---|
| **rot** | gilt – muss beachtet und im Antrag berücksichtigt werden | die Regel trifft nach den Projektangaben sicher zu |
| **gelb** | von Hand prüfen | eine Angabe fehlt oder ist unsicher, Einzelfall/Ermessen, die Regel ist an der neuen Fassung noch nicht geprüft, es gibt noch keine Regel |
| **grün** | entfällt auf jeden Fall | die Regel trifft nach **gesicherten** Angaben sicher nicht zu – oder das Gesetz schließt es ausdrücklich aus |

Von Hand festlegen darf jeder (Sonderfälle) – mit Begründung, und beim Speichern noch einmal bestätigt.

---

## 1. Grundsätze

1. **Grün ist ein Beleg, nicht die Vorgabe.** Grün gibt es nur, wenn feststeht, dass eine Vorschrift nicht gilt.
   Alles, was nicht sicher ist, wird gelb. Fehler sollen immer zur sicheren Seite gehen: lieber ein gelber Punkt zu
   viel als ein grüner zu viel.
2. **Dreiwertig wie in Formulare.** Die Bedingungslogik der Formulare-App (`apps/formulare/src/bedingung.ts`, R-01)
   kennt schon `ja` / `nein` / `offen` – das ist die Ampel: `ja` → rot, `nein` → grün, `offen` → gelb. Ein
   fehlendes Merkmal lässt nichts entfallen.
3. **Regeln sind Daten, nicht Programm.** Die App kennt kein einziges Gesetz. Welche Normen es gibt, welche Paragrafen
   bewertet werden, wann sie gelten und woher der Text kommt, steht in den Modulen. Ein neues Gesetz, eine neue
   Fassung oder ein neuer Kreis ist eine neue Datei, kein App-Update.
4. **Jede Einstufung ist nachvollziehbar:** welche Regel (Modul, Datei, Version), welche Angaben (mit Herkunft und
   Stand), welche Fundstelle in welcher Fassung. Ohne Begründung gibt es keine Ampel.
5. **Der Stichtag zählt.** „Die neueste Fassung“ ist nicht immer die, die gilt: Die BauNVO gilt in der Fassung, die
   der Bebauungsplan zugrunde legt; § 42a BauO NRW knüpft an das Datum des Bauantrags an; § 90 Abs. 4 BauO NRW lässt
   Verfahren nach dem Recht zur Zeit der Antragstellung weiterlaufen. Die App arbeitet deshalb mit einem **geplanten
   Einreichungsdatum** und kennt auch künftige Fassungen.
6. **Texte live, Regeln geprüft.** Ändert sich ein Absatz, auf den sich eine Regel stützt, wird aus ihrem Grün ein
   Gelb, bis eine Regeldatei für die neue Fassung da ist.
7. **Kein Ersatz für die fachliche Prüfung.** Die App ordnet und erinnert; die rechtliche Einordnung bleibt bei den
   Entwurfsverfassenden (§ 54 BauO NRW).

## 2. Was es im Repo schon gibt

| Baustein | Ort | Nutzen |
|---|---|---|
| Dreiwertige Bedingungen mit Begründung und Fundstellen | `apps/formulare/src/bedingung.ts`, `vorgaben/hilfen.ts`, `vorgaben/grundlagen.ts` | Kern der Regel-Logik; wandert nach `packages/core` |
| Antragsmerkmale (Gebäudeklasse, Sonderbau, Verfahren, Gebäudeart, Vorhaben, Planungsrecht) | `bedingung.ts` (`VORGABE_MERKMALE`, `MERKMAL_ERKLAERUNG`); Werte je Antrag in `.oap` → `formulare.antraege[<Antrag>].merkmale` | wichtigste Projektangaben; eine gemeinsame Quelle für beide Apps |
| Gesetzestexte mit Lader, Absatzsuche, Fundstelle in Worten | `apps/formulare/src/recht/` (Snapshot BauO NRW, BauPrüfVO, Auszüge BauGB, BauNVO, BNatSchG, GEIG) | Datenformat (`Gesetz`, `Paragraf`) und Parser bleiben; wird zum Stand ohne Netz |
| Abruf-Skript | `apps/formulare/scripts/recht-holen.mjs` | Parser für recht.nrw.de und gesetze-im-internet.de; URL heute von Hand gepflegt |
| Test „gibt es jede Fundstelle im Text?“ und Fallmatrix | `apps/formulare/src/vorgaben/vorgaben.test.ts` | Muster für die Prüfung der Regeldateien |
| Stammdaten mit Koordinaten in EPSG:25832 | `packages/core/src/model.ts` (`ProjectMeta.koordinaten`) | Abfrage der Geodienste, Gemeindeschlüssel |
| Festsetzungen des Bebauungsplans, Plandatum, BauNVO-Fassung, Gebietsart | `model.ts` (`MassNutzung`) aus dem GRZ-Nachweis | Fakten zum Planungsrecht |
| Geschosse, Räume, Wohnungen, BGF/BRI | Flächenrechner (`storeys`) | abgeleitete Fakten (Höhe, Nutzungseinheiten, Wohnungszahl …) |
| Projektdatei gezielt ändern und zusammenführen | `packages/core/src/projektdatei.ts`, `zusammenfuehren.ts` | eigener Abschnitt `baurecht` |
| Updater mit Manifest je App im Release „updater“ | `packages/core/src/platform/update.ts`, `.github/workflows/release.yml` | Muster für die Auslieferung des Regelpakets |
| PDF-Lesen (pdf.js) | Flächenrechner | Text aus Satzungen, die nur als PDF vorliegen |

## 3. Aufbau

```
 amtliche Quellen            Rechtsstand (Büro)           Projekt (.oap)
 ────────────────            ──────────────────           ──────────────
 RIS Bund (API)  ─┐          Texte je Norm und Fassung    Stammdaten, Merkmale,
 gesetze-im-     ─┼─ Adapter ─► (unveränderlich),         Festsetzungen, Geschosse
 internet.de      │          Prüfsumme je Absatz                │
 recht.nrw.de    ─┤                  │                          ▼
 Ortsrecht (PDF) ─┘                  │              Fakten (Wert · Herkunft · Stand · Sicherheit)
 Geodienste ─────────────────────────┼──────────────────────────▲
                                     ▼                          │
 Regelpaket (signiert) ──► Module: Bund · Land · Kreis · Gemeinde (nach Gemeindeschlüssel)
   je Norm und Fassung              │
   eine Regeldatei                  ▼
                          Auswertung je Paragraf (dreiwertig) ◄── Festlegung von Hand
                                     │
                                     ▼
                          Ampel je Paragraf, Zähler je Norm → Prüfprotokoll
```

Gemeinsames gehört nach `packages/core` (Rechtsstand, Bedingungen, Geodienste), damit Formulare dieselben aktuellen
Texte nutzt. Die Regeln liegen im eigenen Paket `packages/baurecht-regeln` und werden getrennt von der App
ausgeliefert (Abschnitt 6.8). Die App enthält nur Auswertung und Oberfläche.

---

## 4. Immer die aktuellen Texte

### 4.1 Quellen

Am 12.11.2026 geprüft:

| Ebene | Quelle | Zugang | Neue Fassung erkennen | Bemerkung |
|---|---|---|---|---|
| Bund | **Rechtsinformationssystem des Bundes (RIS)**, `testphase.rechtsinformationen.bund.de` | REST-API mit OpenAPI (`/openapi.json`); `GET /v1/legislation?eli=<Werk>&mostRelevantOn=<Datum>` liefert genau die Fassung, die an dem Tag gilt (sonst die nächste, sonst die letzte); Text als LegalDocML-XML, HTML oder je Paragraf (`…/<eId>.html`) | ELI der Fassung (`…/2023-07-03/1/deu`) ändert sich; `GET /v1/legislation/changelog?from=…&to=…` (Zeitstempel mit Zone) | **bevorzugt, wo vorhanden**: kennt Fassungen mit Gültigkeitszeitraum, auch künftige. Noch Testphase und **unvollständig** – BauNVO und BNatSchG sind da, BauGB und GEG (Stand heute) nicht. `changelog` meldet derzeit `allChanged: true` → dann je Werk prüfen |
| Bund | **gesetze-im-internet.de** | Verzeichnis aller Gesetze `gii-toc.xml` (≈ 6 100 Einträge), je Gesetz `/<kürzel>/xml.zip` | `ETag`/`Last-Modified` am ZIP → bedingte Abfrage (304 = unverändert); im XML `builddate` und `standangabe` („zuletzt geändert durch Art. 8 Abs. 2 G v. 23.7.2026 …“) | **Rückfall und Vollständigkeit**; nur die geltende Fassung, keine künftigen und keine alten |
| Land NRW | **recht.nrw.de** | Seite je Fassung `/lrgv/<art>/<TTMMJJJJ>-<name>`; Paragrafen in `<section class="legaldoc-article">` (Parser im vorhandenen Skript) | **„Link zur aktuellsten Fassung“** `/taxonomy/term/<id>` (BauO NRW: 32203) leitet per Meta-Refresh auf die geltende Fassung um – ändert sich das Ziel, gibt es eine neue Fassung. Auf der Seite: „Gültig ab“, Vollzitat, Änderungshistorie, PDF | kein Pflegen von URLs mehr. Die Suche der Seite läuft über JavaScript und taugt nicht für den Abruf – die Term-IDs stehen deshalb in den Modulen |
| Kreis, Gemeinde | Ortsrecht (Satzungen, Verordnungen, Landschaftspläne), meist PDF auf den Seiten der Verwaltung | Adresse je Satzung im Modul | `ETag`/`Last-Modified`, sonst Prüfsumme der Datei; bei geänderter Datei Text neu lesen (pdf.js) und je Paragraf vergleichen | keine einheitliche Quelle – genau dafür gibt es Kreis- und Gemeindemodule |
| Technische Regeln | VV TB NRW, DIN-Normen | VV TB über recht.nrw.de (zu prüfen); DIN nur als Fundstelle | wie Landesrecht | DIN urheberrechtlich geschützt – kein Text, nur Verweis |

### 4.2 Abruf in der Desktop-App

- Neuer Tauri-Befehl in `packages/core/tauri/commands.rs`, z. B. `netz_holen(url, etag?, geaendert?)` →
  `{ status, url_final, etag, geaendert, inhalt_base64 }`. Er folgt Umleitungen (den Meta-Refresh von recht.nrw.de
  wertet TypeScript aus) und erlaubt **nur freigegebene Hosts**: eine feste Grundliste in der App, ergänzt um die
  Hosts aus dem **signierten** Regelpaket (ein neues Kreismodul kann so seinen Geodienst mitbringen). Eigene,
  unsignierte Module des Büros können keine Hosts freischalten; dafür fragt die App einmal nach.
- Die CSP der Webansicht bleibt wie sie ist (heute nur Nominatim), CORS spielt keine Rolle. Laut `docs/suite.md`
  gehört der Befehl auch in die Liste der Rahmen-App.
- Web-Build: kein Abruf (CORS); er zeigt den mitgelieferten Stand mit Hinweis „Stand der App vom …“.
- Gesendet wird nur, welches Gesetz gebraucht wird; für die Geodienste die Lage des Grundstücks – keine
  Personendaten. Das kommt wie bei Nominatim in die README.

### 4.3 Wann geprüft wird

- Beim Start der App, danach höchstens einmal am Tag je Norm, und von Hand („Rechtsstand prüfen“). Bedingte Abfragen
  machen das billig: gesetze-im-internet antwortet mit 304, recht.nrw.de liefert über den Term-Link nur eine
  Umleitungsseite (≈ 0,5 kB).
- Vor dem Abschluss einer Prüfung (Protokoll) wird immer frisch geprüft.

### 4.4 Ablage und Fassungen

- **Cache im gemeinsamen Konfigurationsordner** (`konfig_basis`, `recht/`): für alle Apps und alle Projekte des Büros
  gleich, Formulare liest daraus ebenfalls.
- Je Norm eine Liste der Fassungen; **jede Fassung wird nur einmal geschrieben und nie geändert**
  (`<norm>/<gültig-ab>.json` im heutigen Format `Gesetz`/`Paragraf`, erweitert um `gueltigAb`, `gueltigBis`,
  `abgerufen`, `quelle` und die **Prüfsumme je Absatz**). Alte Fassungen bleiben: Festlegungen und Protokolle
  verweisen darauf, und historische Fassungen (BauNVO 1962/1968/1977/1990) werden gebraucht.
- Die mitgelieferten Texte (heute `apps/formulare/src/recht/daten/`) sind die Grundausstattung ohne Netz; sie
  ziehen nach `packages/core`. `recht-holen.mjs` erzeugt sie weiter, nimmt die Quellen aber aus den Modulen.

### 4.4a Eigenheiten von recht.nrw.de (für den Adapter)

Aus der Recherche zum Landesmodul (12.11.2026):

- **Aufgehobene Normen** leiten über den Term-Link weiter auf ihre letzte Fassung; erkennbar an „Gültig bis“ in der
  Infobox und „Aufgehoben durch …“ in der Änderungshistorie (Beispiel: Gesetz zur Ausführung des BauGB). Der Adapter
  setzt dann `gueltigBis`; nach dem Stichtag gilt die Norm nicht mehr.
- **Nicht jede Seite hat einen Term-Link** (Stellplatzverordnung NRW) – dann feste Adresse im Modul und Fassungsliste
  der Seite als Erkennung.
- **Alte Fassungen gibt es nicht immer als HTML** (teils nur Verweis auf eine `.htm`-Datei); für Stichtage in der
  Vergangenheit muss der Adapter das lesen können.
- Der Parser im heutigen `recht-holen.mjs` muss robuster werden: Paragrafennummer ohne §-Zeichen (LWG „104a“),
  Paragrafen ohne Überschrift (Kampfmittelverordnung), Sektionen ohne Nummer (Eingangsformel, Teil-Überschriften),
  Fußnoten vor dem Text, Titelzusätze wie „(Fn 9)“ oder „[1]“. Tests mit aufgezeichneten Seiten.
- **Anlagen stehen nur als PDF da, unter wechselnden Dateinamen** (Gebührentarif, Richtzahlen der
  Stellplatzverordnung, Anlage der VV TB). Der Adapter findet den Link auf der Seite der Norm über seine Beschriftung
  und erkennt Änderungen an Prüfsumme bzw. `ETag`.

### 4.4b Eigenheiten des Ortsrechts (am Beispiel Soest)

- **Keine Fassungsangaben, keine verlässlichen Kopfzeilen:** soest.de liefert kein `ETag`, und `Last-Modified` ist für
  viele PDFs dasselbe Datum (vermutlich vom Umzug der Website). Neue Fassungen erkennt die App deshalb an der
  **SHA-256 des Inhalts** und an **Änderungen der Linkliste** auf der Ortsrecht- und der Bekanntmachungsseite
  (Quellenart `liste`, 6.3). Ein neuer oder geänderter Link einer Satzung des Moduls → Hinweis „Ortsrecht geändert“,
  betroffene Paragrafen gelb.
- **Aufgehobenes bleibt online**, teils unter irreführendem Namen (die neue Entwässerungssatzung heißt „Änderung …“,
  die alte steht weiter als aktuell da). Das Modul führt eine **Sperrliste**; die App benutzt nur die Dateien, die das
  Modul nennt.
- **Die richtige Datei ist nicht immer die verlinkte:** Die Altstadtsatzung auf der Ortsrecht-Seite ist unsigniert, die
  ausgefertigte liegt auf dem Geoserver. Das Modul nennt die maßgebliche Adresse.
- **Satzungen ohne konsolidierte Fassung:** Die Altstadtsatzung 2023 lässt die nicht geänderten Paragrafen der Fassung
  von 2013 fortgelten. Eine Norm kann deshalb **aus mehreren Dokumenten zusammengesetzt** sein (Quellenart
  `zusammengesetzt`: Stammfassung plus Änderungen, je Paragraf das jüngste Dokument, das ihn enthält).
- **Scans ohne Textebene** (Denkmalbereichssatzung, 271 Seiten): Ohne Texterkennung gibt es keine Prüfsumme je Absatz.
  Die Paragrafen bekommen trotzdem eine Ampel; die Regel trägt dann keine `stand`-Werte, und jede Änderung der Datei
  macht alle ihre Paragrafen gelb.
- **Geodienste hinken hinterher** (Bebauungspläne Monate nach der Bekanntmachung noch als Entwurf) → Abgleich mit der
  Bekanntmachungsseite, im Zweifel gelb.

### 4.5 Prüfen, bevor ersetzt wird

Eine neu abgerufene Fassung wird nur übernommen, wenn sie plausibel ist – sonst bleibt die bisherige, und die App
meldet „Neue Fassung erkannt, aber nicht lesbar“:

- Mindestzahl an Paragrafen, Gültig-ab-Datum gefunden (bei Ortsrecht: Datum der Satzung bzw. letzten Änderung);
- jede Fundstelle, auf die sich eine Regel stützt, ist samt Absatz und Nummer im Text (wie `vorgaben.test.ts`, hier
  zur Laufzeit) – fehlt eine, ist das eine Änderung (4.7), kein Lesefehler.

### 4.6 Welche Fassung gilt – Stichtag

Für jede Prüfung gibt es zwei Daten: **heute** und das **geplante Einreichungsdatum** (Vorgabe: heute; im Antrag
änderbar). Daraus:

| Fall | Maßgebliche Fassung | Beispiel |
|---|---|---|
| Regel knüpft an den Bauantrag an | Fassung am Einreichungsdatum | § 42a Abs. 1 BauO NRW (Antrag nach dem 1.1.2024 bzw. 1.1.2025); § 90 Abs. 4 BauO NRW (Verfahrensrecht zur Zeit der Antragstellung, Genehmigungsfiktion für Anträge ab 1.9.2026) |
| statischer Verweis im Bebauungsplan | Fassung zum Plandatum | BauNVO 1962/1968/1977/1990 – im GRZ-Nachweis schon so modelliert (`MassNutzung.planDatum`, `baunvo`) |
| sonst | Fassung, die am Einreichungsdatum gilt – und **Hinweis auf bekannte spätere Fassungen** | RIS liefert Fassungen mit Gültigkeitszeitraum: „Änderung tritt am … in Kraft – wahrscheinlich vor der Entscheidung“ → gelb |

Übergangsvorschriften (z. B. § 90 BauO NRW) sind eigene Paragrafen mit Regeln.

**recht.nrw.de zeigt künftige Fassungen vorab** (geprüft am LNatSchG NRW: Fassung ab 01.05.2027 schon online, die
geltende trägt „Gültig bis 30.04.2027“). Der Term-Link führt aber immer auf die **heute** geltende Fassung; künftige
stehen nur in der Fassungsliste der Seite (`li.version-item`, „vom 01.05.2027“). Der Adapter liest deshalb die Liste
und holt auch künftige Fassungen.

### 4.7 Was sich geändert hat

- Beim Übernehmen einer neuen Fassung vergleicht die App **je Absatz** die Prüfsummen (Text normalisiert: Leerraum,
  Silbentrennung). Ergebnis: geändert / neu / weggefallen, mit Gegenüberstellung alt/neu.
- Jede Regeldatei trägt die Prüfsummen der Absätze, an denen sie geprüft ist (6.4). Wie damit eine neue Fassung ohne
  neue Regeldatei weiterläuft, steht in 6.6.
- Protokolle früherer Prüfungen nennen die Fassungen, auf denen sie beruhen; sie bekommen den Hinweis „Rechtslage
  seit der Prüfung geändert“.

### 4.8 Wächter in der CI

Ein geplanter GitHub-Workflow (z. B. wöchentlich) ruft für alle Normen aller Module dieselben Adapter auf und
vergleicht mit den Prüfsummen der neuesten Regeldateien. Bei einer Änderung legt er ein Issue an: welche Norm, welche
Absätze, welche Regeldatei eine neue Fassung braucht. So hinken die Regeln den Texten nicht lange hinterher.

---

## 5. Projektfakten

### 5.1 Ein Fakt

```ts
interface Fakt<T> {
  /** null = unbekannt → jede Bedingung daran ist offen (gelb) */
  wert: T | null;
  herkunft: 'stammdaten' | 'merkmal' | 'flaechen' | 'grz' | 'geodienst' | 'modul' | 'abgeleitet' | 'manuell';
  /** z. B. „LINFOS NRW (LANUK), Abfrage am Flurstück“ */
  quelle?: string;
  /** Tag der Erhebung bzw. Abfrage */
  stand?: string;
  /** hinweis: z. B. Geokodierung nur auf Straße genau, Grenze näher als 10 m, nicht rechtsverbindlicher Dienst */
  sicherheit: 'sicher' | 'hinweis';
  bestaetigt?: { von: string; am: string };
}
```

**Asymmetrie:** Ein unsicherer Fakt darf etwas auslösen (Treffer im Landschaftsschutzgebiet → rot), aber nichts
ausschließen: Ein `nein` aus einem Fakt mit `sicherheit: 'hinweis'` wird zu `offen`, bis er bestätigt ist.

Die App bringt einen Grundstock an Fakten mit (aus der Projektdatei, abgeleitet). **Module können eigene Fakten
erklären** – als Frage an die Bearbeitung („Liegt das Grundstück innerhalb des Walls?“), als Geodienst-Abfrage oder
als fester Wert („Die Stadt hat eine Stellplatzsatzung“) – siehe 6.3.

### 5.2 Woher die Fakten kommen

| Gruppe | Fakten | Herkunft |
|---|---|---|
| Lage | Bundesland, Kreis, Gemeinde, **Gemeindeschlüssel**, Gemarkung/Flur/Flurstück, Grundstücksfläche, tatsächliche Nutzung | Stammdaten; ALKIS-WFS (prüft bzw. ergänzt) |
| Planungsrecht | Planungsrecht (§§ 30/34/35 BauGB), Bebauungsplan (Nr., Datum), Gebietsart, BauNVO-Fassung, GRZ/GFZ, Vollgeschosse | Merkmal *Planungsrecht*; Stammdaten; GRZ-Nachweis (`massNutzung`) |
| Schutz und Lage | Natur- und Landschaftsschutzgebiet, FFH-/Vogelschutzgebiet, geschütztes Biotop, Überschwemmungsgebiet, Risikogebiet, Wasserschutzgebiet (Zone), Erdbebenzone, Bergbau, Radonvorsorgegebiet, Baudenkmal/Denkmalbereich/Umgebung, Bodendenkmal, Altlasten, Kampfmittel, Baulasten | Geodienste (Land- und Kreismodul), sonst von Hand mit „Auskunft vom …“ |
| Vorhaben | Vorhaben (Errichtung, Änderung, Nutzungsänderung, Beseitigung), Verfahren, Sonderbau, Gebäudeart, Gebäudeklasse | Merkmale (dieselben Werte wie in Formulare – eine Quelle) |
| Gebäude | Höhe nach § 2 Abs. 3 BauO NRW, Zahl und Größe der Nutzungseinheiten, Wohnungen, Geschosse, BGF, BRI, Nutzfläche, Aufenthaltsräume, beheizt/gekühlt, Stellplätze und Garagen (Zahl, Nutzfläche), Dachfläche | Flächenrechner, GRZ-Nachweis (Lageplan), sonst von Hand |
| Ortsrecht | Satzung vorhanden, Grundstück im Geltungsbereich | Gemeinde- und Kreismodul (fester Wert, Frage oder Geodienst) |
| Antrag | aktiver Antrag, geplantes Einreichungsdatum, eingereicht | Formulare (`meta.antrag`, `formulare.aktiveFassung`), Baurecht |

### 5.3 Abgeleitete Fakten und Abgleich

Wo sich ein Merkmal aus dem Modell ableiten lässt, rechnet die App mit und vergleicht:

- **Gebäudeklasse** aus Höhe (Fußboden des obersten Geschosses mit möglichem Aufenthaltsraum über der mittleren
  Geländeoberfläche – Geschosse und Gelände aus Flächenrechner/GRZ), Zahl und Fläche der Nutzungseinheiten
  (Wohnungen aus dem Flächenrechner).
- **Wohnungszahl / Gebäudeart**, **Nutzfläche** (§ 42a Abs. 4 Nr. 1: bis 50 m²), **Garagen-Nutzfläche**,
  **Stellplatzzahl** (GEIG).

Weicht die Ableitung vom festgelegten Merkmal ab („Merkmal GK 2, berechnet GK 3: Höhe 7,40 m“), wird alles, was an
dem Merkmal hängt, gelb – mit dem Angebot, das Merkmal zu ändern oder die Abweichung zu begründen. Die Ableitung
ersetzt das Merkmal nie still.

### 5.4 Geodienste NRW

Am 12.11.2026 geprüft (ohne Anmeldung, Abfrage in EPSG:25832 wie die Stammdaten):

| Dienst | Adresse | Liefert |
|---|---|---|
| ALKIS vereinfacht (WFS 2.0) | `https://www.wfs.nrw.de/geobasis/wfs_nw_alkis_vereinfacht` | `ave:Flurstueck` per BBOX um den Punkt: Gemarkung, Flur, Flurstück, **Gemeindeschlüssel** (`gmdschl`), amtliche Fläche, Lagebezeichnung, tatsächliche Nutzung, Umring, Aktualität |
| LINFOS NRW (WMS) | `https://www.wms.nrw.de/umwelt/linfos` | per GetFeatureInfo (GML; `STYLES` nötig): Naturschutzgebiete, Landschaftsschutzgebiet, FFH-Gebiete, Vogelschutzgebiete, geschützte Biotope … |
| Überschwemmungsgebiete (WMS) | `https://www.wms.nrw.de/umwelt/wasser/uesg` | erreichbar; Ebenen beim Bau festlegen |
| Wasserschutzgebiete (WMS) | `https://www.wms.nrw.de/umwelt/wasser/wsg` | erreichbar; Ebenen beim Bau festlegen |

- Welche Dienste abgefragt werden, steht in den Modulen (Landesmodul: die landesweiten, Kreis- und Gemeindemodul:
  Landschaftsplan, Bebauungspläne, Denkmäler, soweit es Dienste gibt).
- Abgefragt wird **am Flurstück**, nicht nur am Adresspunkt: Umring aus ALKIS, Prüfpunkte im Flurstück; liegt eine
  Grenze näher als ein Puffer (z. B. 10 m) oder ist die Geokodierung nur straßengenau (`koordinaten.genauigkeit`),
  ist der Fakt nur ein Hinweis.
- Die Dienste sind nicht rechtsverbindlich. Ein Treffer macht rot; kein Treffer macht grün nur bei Datensätzen, die
  das Modul als **vollständig** kennzeichnet, und mit Puffer (Vorschlag: LINFOS, ÜSG, WSG ja; Lückenhaftes wie
  Denkmäler nein).
- Ergebnisse werden mit Quelle und Stand im Projekt gespeichert; „Neu abfragen“ wie bei den Koordinaten.

---

## 6. Module und Regelpaket

### 6.1 Ein Modul je Gebiet

| Ebene | Modul-ID | Gilt, wenn der Gemeindeschlüssel … | Inhalt (Beispiele) |
|---|---|---|---|
| Bund | `bund` | immer | BauGB, BauNVO (auch alte Fassungen), GEG, GEIG, BNatSchG, WHG, StrlSchG, ArbStättV |
| Land | `nw` | mit `05` beginnt | BauO NRW, BauPrüfVO, Sonderbauverordnung, DSchG NRW, LNatSchG NRW, LWG NRW …; landesweite Geodienste |
| Kreis | `nw-05974` (Kreis Soest, Gemeindeschlüssel 05974000) | mit `05974` beginnt | Landschaftspläne, Schutzverordnungen für das Kreisgebiet (auch die der Bezirksregierung), Auskünfte, Zuständigkeiten, Geodienste |
| Gemeinde | `nw-05974040` (Stadt Soest) | gleich ist | Satzungen, Bebauungspläne, Denkmalliste, Fakten zum Ortsrecht |

- Den Gemeindeschlüssel liefert ALKIS (`gmdschl`) zum Flurstück; ohne Abfrage wird er aus den Stammdaten erfragt.
- Kreisfreie Städte haben keine Kreisebene. Fehlt für eine Gemeinde oder einen Kreis ein Modul, sagt die App das
  oben („Für Werl gibt es kein Gemeindemodul – Ortsrecht von Hand prüfen“), und alle Fakten zum Ortsrecht bleiben
  offen (gelb).
- Module können aufeinander verweisen: Das Landesmodul fragt z. B. den Fakt „Stellplatzsatzung vorhanden“ ab, den das
  Gemeindemodul setzt (die Stellplatzsatzung geht der Landesregel vor). Umgekehrt zeigt ein Landesparagraf den
  Vorrang des Ortsrechts als Hinweis: In der Soester Altstadt bleibt § 6 BauO NRW rot, mit Verweis auf § 3 der
  Altstadtsatzung (kleinere Abstandsflächen); § 42a BauO NRW verweist auf § 5a der Altstadtsatzung, die nach § 42a
  Abs. 1 Satz 3 maßgeblich ist.

### 6.2 Eine Datei je Norm und Fassung

```
packages/baurecht-regeln/
  schema/                         JSON-Schema für Modul- und Regeldateien (Autovervollständigung im Editor)
  module/
    bund/
      modul.json                  das Modul: Name, Ebene, Fakten, Geodienste, Bausteine, Normen
      baugb@2026-07-24.json       Regeln einer Norm in einer Fassung (Dateiname: Norm @ gültig ab)
      baunvo@2023-07-07.json
      baunvo@1990-01-27.json      alte Fassung für Bebauungspläne aus dieser Zeit
    nw/
      modul.json
      bauo-nrw@2026-09-01.json
      baupruefvo@2024-11-26.json
    nw-05974/                     Kreis Soest
      modul.json
      lp-…@….json
    nw-05974040/                  Stadt Soest
      modul.json
      stellplatzsatzung@….json
  test/                           Prüfungen über alle Dateien (6.8)
```

Warum je Norm und Fassung statt einer Datei je Land und Rechtsstand: Ändert sich die BauO NRW, kommt genau **eine**
neue Datei dazu (einige kB); BauPrüfVO, DSchG und alle anderen bleiben unberührt. Alte Dateien bleiben liegen – sie
werden für frühere Stichtage und alte Bebauungspläne gebraucht – und kosten nur Platz im Paket, nicht in der Auswertung.

### 6.3 Moduldatei (`modul.json`)

```jsonc
{
  "format": 1,
  "id": "nw-05974040",
  "name": "Stadt Soest",
  "ebene": "gemeinde",
  "schluessel": "05974040",
  "ueber": "nw-05974",
  /** Hosts, die die Abfragen dieses Moduls brauchen (nur aus dem signierten Paket wirksam) */
  "hosts": ["www.soest.de", "gis02.soest.de"],
  /** Normen dieses Moduls und woher ihr Text kommt */
  "normen": {
    "stellplatzsatzung": { "titel": "Stellplatzsatzung der Stadt Soest", "quelle": { "art": "datei", "format": "pdf",
      "url": "https://www.soest.de/fileadmin/user_upload/Dokumente/Politik_und_Verwaltung/Bekanntmachungen_und_Satzungen/Stellplatzsatzung_-_Soest.pdf" } },
    "altstadtsatzung": { "titel": "Örtliche Bauvorschrift über die Gestaltung der Altstadt", "quelle": { "art": "zusammengesetzt", "teile": [
      { "url": "https://www.soest.de/fileadmin/user_upload/Dokumente/Ortsrecht/13_07_11_Satzung_mit_Geltungsbereich_und_Begruendung.pdf", "fassung": "2013-07-11" },
      { "url": "https://gis02.soest.de/pdf/AS/b049_as.pdf", "fassung": "2023-11-14" } ] } }
  },
  /** Übersichtsseiten, deren Links beobachtet werden */
  "listen": ["https://www.soest.de/politik-verwaltung/ortsrecht-und-satzungen"],
  /** aufgehobene Dokumente, die noch online stehen */
  "sperrliste": ["https://www.soest.de/fileadmin/user_upload/Dokumente/Ortsrecht/Stellplatzsatzung_-_Adam-Kaserne.pdf"],
  /** Fakten, die das Modul setzt oder erfragt */
  "fakten": {
    "ortsrecht.stellplatzsatzung": { "wert": true },
    "soest.denkmalbereich": { "geodienst": { "art": "arcgis", "url": "https://gis02.soest.de/arcgis/rest/services/Denkmalschutz/MapServer", "ebene": 5, "vollstaendig": true } },
    "soest.altstadt": { "frage": "Liegt das Grundstück innerhalb des Walls?", "typ": "janein", "vorschlag": "soest.denkmalbereich",
      "hilfe": "Geltungsbereich der Altstadtsatzung (Anlage 1)" }
  },
  /** gemeinsame Bedingungen, in den Regeldateien mit { "$": "…" } verwendet */
  "bausteine": {
    "neubau": { "m": "Vorhaben", "in": ["Errichtung"] }
  }
}
```

Quellenarten: `ris` (Werk-ELI), `gii` (Pfad auf gesetze-im-internet.de), `recht-nrw` (Term-ID; ersatzweise feste
Adresse), `datei` (Adresse einer HTML- oder PDF-Datei, Ortsrecht; mit `textebene: false` für Scans), `zusammengesetzt`
(Stammfassung plus Änderungsdokumente), `liste` (Übersichtsseite, deren Links beobachtet werden – z. B. Ortsrecht und
Bekanntmachungen einer Stadt), `verweis` (nur Fundstelle, z. B. DIN). Dazu je Modul eine `sperrliste` mit Adressen
aufgehobener Dokumente, die nicht verwendet werden dürfen.

### 6.4 Regeldatei (`<norm>@<gültig ab>.json`)

```jsonc
{
  "format": 1,
  "norm": "bauo-nrw",
  "fassung": "2026-09-01",
  /** Version dieser Regeldatei (steigt bei Korrekturen der Regeln, nicht der Fassung) */
  "version": 1,
  /** Anwendungsbereich der ganzen Norm; nein → alle Paragrafen grün */
  "geltung": { "m": "Gebäudeart", "nicht": ["kein Gebäude"] },
  "paragrafen": {
    "6": {
      "gilt": { "und": [{ "m": "Vorhaben", "in": ["Errichtung", "Änderung"] }, { "m": "Gebäudeart", "nicht": ["kein Gebäude"] }] },
      "grund": "Abstandsflächen vor den Außenwänden von Gebäuden.",
      "behoerde": { "$": "prueft-64" },
      "nachweis": ["baupruefvo/3"],
      "stand": { "6/1": "4be1c09a", "6/2": "0f3d9e11" }
    },
    "42a": {
      "gilt": { "und": [{ "$": "neubau" }, { "oder": [
        { "und": [{ "m": "Gebäudeart", "in": ["Nichtwohngebäude"] }, { "tag": "einreichung", "ab": "2024-01-02" }] },
        { "und": [{ "$": "wohngebaeude" }, { "tag": "einreichung", "ab": "2025-01-02" }] }
      ] }] },
      "entfaellt": { "oder": [{ "f": "gebaeude.nutzflaeche", "max": 50 }, { "f": "gebaeude.behelfsbau", "ist": true }] },
      "pruefen": { "grund": "Abs. 5: Die Pflicht entfällt, soweit … im Einzelfall – immer von Hand beurteilen." },
      "grund": "PV-Pflicht bei Errichtung, abhängig vom Datum des Bauantrags; örtliche Bauvorschriften oder Bebauungsplan gehen vor (Abs. 1 Satz 3).",
      "fundstellen": ["42a/1", "42a/4", "42a/5"],
      "stand": { "42a/1": "9c1e7a02", "42a/4": "51b0d3aa", "42a/5": "e2c4f8b1" }
    }
  }
}
```

- `stand`: Prüfsumme (8 Hex-Zeichen) je Absatz, an dem die Regel geprüft ist – Grundlage für 6.6.
- `grund` wird kurz gehalten (ein Satz); der Gesetzestext selbst steht nie in der Regeldatei.
- Paragrafen, die nicht in `paragrafen` stehen, werden nicht bewertet (Begriffe, Ordnungswidrigkeiten …); ihr Text
  bleibt lesbar.

### 6.5 Bedingungen in Kurzform

Die Kurzform wird beim Laden in die Bedingungen von `bedingung.ts` übersetzt (dreiwertig, in Worten darstellbar).

| Kurzform | Bedeutung | unbekannt → |
|---|---|---|
| `{ "m": "Gebäudeklasse", "in": ["3","4","5"] }` / `"nicht": [...]` | Antragsmerkmal hat einen / keinen dieser Werte | offen |
| `{ "f": "schutz.lsg", "ist": true }` | Fakt hat diesen Wert | offen |
| `{ "f": "gebaeude.hoehe", "min": 7, "max": 13 }` | Zahl im Bereich (Grenzen einschließlich) | offen |
| `{ "f": "lage.ags", "in": [...] }` | Fakt ist einer der Werte | offen |
| `{ "tag": "einreichung", "ab": "2025-01-02" }` / `"vor"` | Stichtag (Einreichung oder heute) ab / vor Datum | – |
| `{ "n": "bund/bnatschg/18", "ampel": ["gruen"] }` | Ergebnis eines anderen Paragrafen (auch anderer Module, ohne Zyklen) | offen, wenn der gelb ist |
| `{ "$": "neubau" }` | Baustein aus `modul.json` (eigenes oder übergeordnetes Modul) | – |
| `{ "und": [...] }`, `{ "oder": [...] }`, `{ "nicht": {...} }` | Verknüpfung; `nicht` lässt offen offen | – |

### 6.6 Passende Fassung finden – und neue Texte ohne neue Regeln

Für eine Norm und einen Stichtag:

1. **Textfassung** = die Fassung, die am Stichtag gilt (Rechtsstand, 4.6).
2. **Regeldatei** = die neueste Datei der Norm mit `fassung` ≤ Gültig-ab der Textfassung.
3. Passt beides zusammen, gelten die Regeln, wie sie sind.
4. Ist der Text **neuer als die Regeldatei**, vergleicht die App je Paragraf die Prüfsummen in `stand` mit dem neuen
   Text: unverändert → die Regel gilt weiter; geändert oder weggefallen → der Paragraf wird **gelb** („Abs. 4 hat
   sich am 01.03.2027 geändert – Regel noch nicht nachgezogen“), rot bleibt rot.

So wirkt eine neue Gesetzesfassung **sofort** (der neue Text ist da, unveränderte Paragrafen bleiben bewertet), und
die Regeldatei für die neue Fassung kann nachgereicht werden.

### 6.7 Neue Fassung einpflegen

Werkzeug im Paket: `npm run regeln:fassung -- nw/bauo-nrw`

1. holt die geltende Fassung über die Quelle aus `modul.json`,
2. legt `bauo-nrw@<gültig ab>.json` als Kopie der letzten Regeldatei an, mit neuen Prüfsummen für alle
   **unveränderten** Absätze,
3. listet die geänderten, neuen und weggefallenen Absätze – nur deren Regeln muss man ansehen; ihre Prüfsummen bleiben
   bis dahin alt, die Tests schlagen fehl, bis jede bestätigt ist.

Eine neue Norm, ein neuer Kreis oder eine neue Gemeinde: `modul.json` ergänzen bzw. anlegen, Regeldatei schreiben.
Der Wächter (4.8) meldet, wann das nötig ist.

### 6.8 Eigenes Paket: prüfen, ausliefern, laden

- **Quelle:** `packages/baurecht-regeln` im Repo (nur Daten, Schema und Tests). Die Tests laufen gegen die Auswertung
  aus `packages/core`:
  - Schema jeder Datei, keine unbekannten Fakten, Bausteine, Merkmalwerte, keine Zyklen bei `n`-Verweisen;
  - jede Fundstelle existiert im Text der Fassung, `stand` stimmt mit dem Text überein;
  - **Fallmatrix** je Modul (Vorhaben × Gebäudeart × Gebäudeklasse × Planungsrecht × Verfahren × Stichtag, auch
    „nicht festgelegt“): nie grün bei offenem Fakt, erwartete Ampeln für Musterfälle.
- **Auslieferung:** eigener Workflow, sobald sich `packages/baurecht-regeln/**` auf `main` ändert: Dateien
  verkleinern (JSON ohne Leerraum), `index.json` mit Paketversion (`2026.11.12-1`), benötigter Formatversion und
  SHA-256 und Größe je Datei, **signiert** (Ed25519, privater Schlüssel als GitHub-Secret wie beim Updater),
  hochladen in das Release „regeln“ (wie das Release „updater“).
- **Laden in der App:** prüft beim Start und täglich `index.json` (bedingte Abfrage), prüft die Signatur im
  Rust-Teil, lädt **nur geänderte Dateien** in den Konfigurationsordner (`baurecht/regeln/`) und prüft jede gegen ihre
  SHA-256. Kennt die App eine Formatversion nicht, bleibt das alte Paket aktiv und sie meldet „App-Update nötig“.
- **Ohne Netz:** Die App bringt das Paket vom Tag ihres Builds mit.
- **Anzeige:** „Regeln: Paket 2026.11.12-1 · Bund, NRW, Kreis Soest, Stadt Soest“; jede Ampel nennt Modul, Datei
  und Version.

### 6.9 Eigene Module des Büros

Im Konfigurationsordner (`baurecht/eigene/<modul>/`) im selben Format – etwa für eine Gemeinde, für die es noch kein
Modul gibt, oder für Arbeitshilfen des Büros. Sie sind unsigniert, überall als „eigenes Modul“ gekennzeichnet, dürfen
keine Hosts freischalten, und eine eigene Regeldatei geht für dieselbe Norm der aus dem Paket vor (deutlich markiert).

### 6.10 Dateigröße

Die Regeldateien enthalten keine Gesetzestexte, nur Bedingungen, einen Satz Begründung und Prüfsummen. Grob: je
bewertetem Paragrafen 200–400 Byte; die BauO NRW mit etwa 40 bewerteten Paragrafen also rund 10–15 kB, ohne Leerraum
und komprimiert übertragen wenige kB (zum Vergleich: der Text der BauO NRW sind 245 kB). Gemeinsame Bedingungen stehen
einmal als Baustein im Modul; Prüfsummen sind auf 8 Zeichen gekürzt (genügt zum Erkennen von Änderungen).

---

## 7. Ampel je Paragraf

### 7.1 Einheit

- Bewertet wird **der Paragraf**. Bei Plänen und Satzungen ohne Paragrafen (Landschaftsplan, Bebauungsplan) ist es die
  nummerierte Festsetzung bzw. Ziffer.
- Die Zeile einer Norm zeigt ihren Anwendungsbereich (`geltung`) und zählt die Paragrafen: „BauO NRW · 12 rot ·
  3 gelb · 25 grün“. Ist `geltung` nein, sind alle ihre Paragrafen grün („entfällt mit der Norm“).
- Absätze kommen in der Begründung vor („rot nach Abs. 1, Ausnahme nach Abs. 4 nicht erfüllt“), haben aber keine
  eigene Ampel.

### 7.2 Auswertung eines Paragrafen

Die Regel eines Paragrafen hat drei Teile, die dem Aufbau vieler Vorschriften folgen: **Tatbestand** (`gilt`),
**Ausnahmen** (`entfaellt`) und **Einzelfall** (`pruefen`).

1. Norm nicht anwendbar (`geltung` nein) → **grün**.
2. Von Hand festgelegt → diese Festlegung (Abschnitt 8); ist sie überholt, steht ⚠ daran.
3. `entfaellt` = ja → **grün**.
4. sonst `gilt`:
   - ja → **rot** (ist `entfaellt` offen, mit Hinweis „Ausnahme nach Abs. 4 möglich – Nutzfläche angeben“)
   - nein → **grün**
   - offen → **gelb**, mit den fehlenden bzw. unsicheren Fakten
5. Herabstufen zur sicheren Seite – aus Grün wird **gelb**, wenn `pruefen` zutrifft oder offen ist, die Regel an der
   geltenden Fassung nicht geprüft ist (6.6), ein Fakt nur Hinweis ist oder Merkmal und Ableitung sich widersprechen.
   Rot bleibt rot, bekommt aber den Hinweis („im Einzelfall prüfen“).
6. Paragraf ohne Regel (im Modul gelistet, Regel fehlt): **gelb** („noch keine Regel – von Hand beurteilen“).

Dazu **„Was klärt am meisten?“**: Je fehlendem Fakt wird gezählt, wie viele gelbe Paragrafen er auflösen würde
(„Überschwemmungsgebiet klären – 4 Paragrafen“). Die offenen Angaben sind danach sortiert.

### 7.3 Wann gelb

- ein Fakt fehlt oder ist nur ein Hinweis (und würde ausschließen);
- Merkmal und Ableitung widersprechen sich (5.3);
- Einzelfall/Ermessen (z. B. „fügt sich ein“ nach § 34 BauGB, Abweichungen § 69 BauO NRW, Befreiungen § 31 BauGB,
  § 42a Abs. 5 BauO NRW);
- die Regel ist an der geltenden Fassung nicht geprüft, oder eine spätere Fassung tritt vor der erwarteten
  Entscheidung in Kraft;
- es gibt kein Modul für Kreis oder Gemeinde (alle Fakten zum Ortsrecht offen);
- es gibt noch keine Regel.

### 7.4 Wann grün

Nur wenn **alles** zutrifft: Die Regel schließt nach gesicherten Fakten sicher aus (oder eine Ausnahme greift sicher),
sie ist an der geltenden Fassung geprüft, nichts ist Einzelfall, und kein Widerspruch steht offen. Am stärksten sind
Ausschlüsse, die das Gesetz selbst formuliert – sie werden bevorzugt als `entfaellt` geschrieben.

### 7.5 Prüft die Behörde – und womit wird es nachgewiesen?

Rot heißt „gilt“, nicht „wird geprüft“. Jeder rote Paragraf zeigt zusätzlich (`behoerde`, `nachweis`):

- **prüft die Bauaufsicht** – im vereinfachten Verfahren nach § 64 Abs. 1 BauO NRW: §§ 29–38 BauGB, §§ 4, 6, 48 und
  49 BauO NRW, örtliche Bauvorschriften, beantragte Abweichungen, anderes öffentliches Recht, das nicht in einem
  anderen Verfahren geprüft wird; bei Sonderbauten, die keine großen sind, zusätzlich den Brandschutz; baulicher
  Arbeitsschutz nicht. Im Baugenehmigungsverfahren (§ 65) entsprechend mehr, in der Freistellung (§ 63) nichts.
  Als Bausteine im Landesmodul (`prueft-64`, `prueft-65`);
- **eigene Verantwortung** – gilt, wird aber nicht geprüft (z. B. GEG, baulicher Arbeitsschutz);
- **Nachweis** – welche Bauvorlage es belegt (BauPrüfVO), später verknüpft mit dem Antragsumfang in Formulare.

### 7.6 Beispiele

- **§ 42a BauO NRW (Solaranlagen)** – siehe 6.4: Tatbestand mit Stichtag des Bauantrags, Ausnahmen aus Abs. 4 als
  `entfaellt`, Abs. 5 als `pruefen`.
- **§ 14 BNatSchG (Eingriffsregelung)** – § 18 Abs. 2 BNatSchG schließt sie im Geltungsbereich eines Bebauungsplans
  (§ 30 BauGB) und im Innenbereich (§ 34 BauGB) aus: `entfaellt` = Planungsrecht Bebauungsplan oder Innenbereich →
  grün; Außenbereich → rot; einfacher Bebauungsplan → gelb.
- **§ 44 BNatSchG (Artenschutz)** – `pruefen` immer: bei Errichtung, Änderung an Dach/Fassade oder Abbruch ohne
  Prüfung nicht auszuschließen; grün nur von Hand (z. B. nach Begehung).
- **§ 78 WHG (Überschwemmungsgebiet)** – Fakt aus dem Geodienst: im festgesetzten oder vorläufig gesicherten Gebiet →
  rot (Abs. 4: Bauverbot mit Ausnahmen); außerhalb mit Puffer → grün; nahe der Grenze oder nur straßengenau → gelb.
- **BauNVO** – Regeldatei der Fassung nach Plandatum im Bebauungsplan, der geltenden Fassung im Innenbereich mit
  faktischem Baugebiet (§ 34 Abs. 2 BauGB); `geltung` nein im Außenbereich ohne Plan.
- **§§ 6, 7 GEIG** – rot bei Errichtung eines Wohngebäudes mit mehr als fünf bzw. eines Nichtwohngebäudes mit mehr
  als sechs Stellplätzen; Stellplatzzahl unbekannt → gelb.
- **GEG** – `geltung`: Anwendungsbereich nach § 2; Paragrafen zu Neubau (§§ 10 ff.) bzw. Änderung bestehender
  Gebäude (§ 36 in der Fassung nach dem Gesetz vom 23.07.2026 – der frühere § 48 ist weggefallen) nach Vorhaben;
  eigene Verantwortung, prüft die Behörde nicht.

---

## 8. Von Hand festlegen

**Jeder darf festlegen** – und bestätigt dafür zweimal:

1. **Beim Festlegen:** Am Paragrafen „Von Hand festlegen …“ → Ampel wählen, **Begründung (Pflicht)** →
   „Festlegen“. Gespeichert werden Name (aus den Einstellungen bzw. der Bearbeitung), Datum, die automatische Ampel zu
   diesem Zeitpunkt, die Fakten, an denen die Regel hängt, und die Prüfsummen der Fundstellen.
2. **Beim Speichern der Projektdatei:** Gibt es neue oder geänderte Festlegungen seit dem letzten Speichern, zeigt
   die App sie alle in einer Liste – automatische und festgelegte Ampel nebeneinander, Begründung, Herabstufungen
   (rot → gelb/grün, gelb → grün) hervorgehoben. „**Festlegungen bestätigen und speichern**“ speichert alles;
   „Ohne diese Festlegungen speichern“ speichert den Rest und behält die Festlegungen als Entwurf; „Abbrechen“
   speichert nichts. Enter löst keine Bestätigung aus.

Danach:

- Die Festlegung geht vor. Sie wird **überholt**, wenn sich danach die automatische Ampel, ein beteiligter Fakt oder
  eine Fundstelle ändert. Dann steht ⚠ daran („Automatisch jetzt rot: Landschaftsschutzgebiet seit Abfrage am …“),
  und das Protokoll zählt sie als offen, bis sie erneut festgelegt (wieder mit beiden Bestätigungen) oder aufgehoben
  ist.
- Festlegungen sind in der Liste immer sichtbar (eigenes Zeichen), filterbar, stehen im Protokoll mit Begründung, und
  im Verlauf (Rückgängig/Wiederholen wie in den anderen Apps).
- Eigene Normen für einen Einzelfall (z. B. eine Auflage aus einem Vorbescheid) lassen sich im Projekt mit Titel und
  Fundstelle anlegen – ohne Regel, also gelb, bis festgelegt.

## 9. Die ersten Module

Alle Quellen am 12.11.2026 abgerufen; Term-IDs und Fassungen selbst auf recht.nrw.de bzw. im Verzeichnis von
gesetze-im-internet.de geprüft. Die Paragrafen sind der erste Umfang der Regeldateien – was „wann es greift“ heißt,
wird dort als Regel geschrieben und mit der Fallmatrix getestet.

### 9.1 Bund (`bund`) – Grundstock

| Norm | Quelle | Paragrafen (erster Umfang) |
|---|---|---|
| BauGB | gii `bbaug` (im RIS noch nicht) – zuletzt geändert durch Art. 8 Abs. 2 G v. 23.7.2026 | §§ 29–38 (Zulässigkeit), § 31 Befreiungen, §§ 14, 17 Veränderungssperre, § 172 Erhaltungssatzung, § 246e (Wohnungsbau) |
| BauNVO | RIS `eli/bund/bgbl-1/1962/s429` (Fassung ab 03.07.2023), alte Fassungen 1962/1968/1977/1990 mitgeliefert | §§ 1–15 nach Gebietsart, §§ 16–21a Maß, § 23 überbaubare Fläche |
| GEG | gii `geg` – **seit dem G v. 23.7.2026 amtlich „GModG“**, §§ 47–55 und 71–73 weggefallen | § 2 Anwendungsbereich (`geltung`), §§ 10 ff. Neubau, § 36 Änderung bestehender Gebäude; die Auswahl wird an der neuen Fassung erst erarbeitet |
| GEIG | gii `geig` | §§ 6, 7 (Neubau mit Stellplätzen), § 10 |
| BNatSchG | RIS `eli/bund/bgbl-1/2009/s2542` (Fassung ab 30.09.2026) | §§ 14, 15, 18 (Eingriffsregelung), § 30 Biotope, § 34 Verträglichkeit in Natura-2000-Gebieten (FFH, Vogelschutz – gilt auch im Innenbereich), § 44 Artenschutz, § 67 Befreiungen |
| WHG | gii `whg_2009` | §§ 76–78b (Überschwemmungs- und Risikogebiete), § 52 (Wasserschutzgebiete), § 55 Abs. 2 (Niederschlagswasser) |
| StrlSchG | gii `strlschg` | §§ 121–123 (Radon) |
| ArbStättV | gii `arbst_ttv_2004` | § 3a, Anhang (nur Nichtwohngebäude mit Arbeitsplätzen) |
| BBodSchG | gii `bbodschg` | Hinweis Altlasten (Einzelheiten im Landesrecht) |

Der GEG-Fund zeigt, warum Abschnitt 6.6 nötig ist: Eine Regel, die sich auf § 48 GEG alter Fassung stützt, wäre ab dem
Inkrafttreten der Änderung nicht mehr belastbar – sie wird gelb, bis die neue Regeldatei da ist.

### 9.2 Land NRW (`nw`)

Alle Texte von recht.nrw.de, als HTML mit Paragrafen; Anlagen teils nur als PDF.

| Norm | Term | gültig ab | Paragrafen (erster Umfang) |
|---|---|---|---|
| BauO NRW 2018 | 32203 | 01.09.2026 | § 4 Bebauung, § 6 Abstandsflächen, § 8 nicht überbaute Flächen und Kinderspielplätze, § 14 und §§ 26–38 Brandschutz, Bauteile, Rettungswege, § 39 Aufzüge, §§ 46, 47 Aufenthaltsräume, Wohnungen, § 42a Solaranlagen, § 48 Stellplätze, § 49 Barrierefreiheit, § 50 Sonderbauten, §§ 60–65 Verfahren, § 67 Bauvorlageberechtigung, § 68 bautechnische Nachweise, § 69 Abweichungen, § 70 Bauantrag, § 90 Übergang |
| BauPrüfVO | 27719 | 26.11.2024 | §§ 1–6 (Bauvorlagen, Berechnungen), §§ 7–9a (Nachweise, Brandschutz-, Barrierefrei-Konzept), §§ 10–16 (Bauvorlagen je Verfahren), § 18 Baulasten, § 31 Übergang |
| Sonderbauverordnung (SBauVO) | 31721 | 15.11.2019 | Anwendungsbereiche: § 1 Versammlungsstätten (über 200 Besucher), § 47 Beherbergung (über 12 Gastbetten), § 60 Verkaufsstätten (über 2 000 m²), § 92 Hochhäuser; Garagen §§ 121–140 (Klein- bis 100 m², Mittel- bis 1 000 m², Großgarage darüber), §§ 143–149 elektrische Betriebsräume |
| Stellplatzverordnung NRW | **kein Term-Link** – feste Adresse `…/01072022-verordnung-ueber-notwendige-stellplaetze-fuer-kraftfahrzeuge-und` | 01.07.2022 | § 1 Anwendungsbereich (Bebauungsplan und Stellplatzsatzung gehen vor), §§ 3–6 Anzahl, Verringerung, Erfüllung, Ablösung (Richtzahlen nur als PDF-Anlage), §§ 7–9, § 11 Übergang |
| Feuerungsverordnung (FeuVO NRW) | 32303 | 01.01.2019 | §§ 3–6 Verbrennungsluft, Aufstellräume, Heizräume (feste Brennstoffe über 50 kW), §§ 7–9 Abgasanlagen, § 10 Wärmepumpen/BHKW, §§ 11–13 Brennstofflagerung, Flüssiggas |
| Sachverständigenverordnung (SV-VO) | 28042 | 26.11.2024 | § 6 Pflichten; Fachbereiche Standsicherheit, Brandschutz, Erd- und Grundbau, Schall- und Wärmeschutz |
| GEG-Umsetzungsverordnung (GEG-UVO) | 33174 | 27.10.2022 | § 2 Nachweis (Sachverständige für Schall- und Wärmeschutz), § 3 Befreiungen |
| Denkmalschutzgesetz (DSchG NRW) | 33502 | 01.09.2026 | § 4 vorläufiger Schutz, § 9 Erlaubnis (Abs. 1 Denkmal, Abs. 2 engere Umgebung, Abs. 3 Abwägung), § 10 Denkmalbereiche, §§ 15, 16 Bodendenkmäler, §§ 23, 24 Denkmalliste, Verfahren |
| Landesnaturschutzgesetz (LNatSchG NRW) | 28058 | 30.10.2026 (**gültig bis 30.04.2027**, Fassung ab 01.05.2027 schon online) | § 7 Landschaftsplan, § 23 Schutzausweisung, §§ 30, 31, 33 Eingriff und Ausgleich, §§ 39, 41, 42 Landschaftsbestandteile, Alleen, Biotope, § 49 Baumschutzsatzung (Ermächtigung), § 75 Befreiungen |
| Landeswassergesetz (LWG) | 26930 | 30.10.2026 | § 22 Anlagen an Gewässern, § 31 Gewässerrandstreifen, §§ 35, 36 Schutzgebiete, § 44 Niederschlagswasser (erstmals bebaut nach 01.01.1996), §§ 46, 48, 57 Abwasser, §§ 83, 84 Überschwemmungsgebiete |
| Landesbodenschutzgesetz (LBodSchG) | 28047 | 01.04.2025 | § 2 Mitteilungspflichten (Altlasten; über 800 m³ Auf- oder Einbringen), § 8 Altlastenkataster, § 12 Bodenschutzgebiete |
| Kampfmittelverordnung NRW | 28341 | 01.06.2022 | §§ 2–4 (Fund, Umgang, Betretungsverbot) – eine Auskunftspflicht vor dem Bauantrag steht nicht darin; die Auskunft ist ein Fakt, keine Pflicht aus dieser Verordnung |
| Straßen- und Wegegesetz (StrWG NRW) | 27058 | 01.07.2026 | § 20 Zufahrten, § 25 bauliche Anlagen an Straßen (außerhalb der Ortsdurchfahrt bis 40 m von Landes- und Kreisstraßen Zustimmung der Straßenbaubehörde), §§ 18, 19 Sondernutzung |
| Nachbarrechtsgesetz (NachbG NRW) | 26658 | 29.12.2021 | **Privatrecht – nur als Hinweis**, nie rot: § 1 Abstand 2 m, § 4 Fenster, §§ 7–23a Nachbar- und Grenzwand, Wärmedämmung, § 27 Niederschlagswasser, §§ 32–48 Einfriedigung, Pflanzen |
| Verwaltungsgebührenordnung (AVwGebO NRW) | 33844 | 25.04.2026 | nur zur Information: Tarifstelle 3.1 (Baurecht), 3.3 (Denkmalschutz) – Tarif nur als PDF |
| VV Technische Baubestimmungen (VV TB NRW) | 33148 | 21.11.2025 | **verweist dynamisch auf die MVV TB des DIBt** (neue Ausgabe gilt 6 Monate nach Veröffentlichung, ohne neue Fassung auf recht.nrw.de); NRW-Abweichungen nur in der PDF-Anlage → eigene Quelle für die MVV TB nötig (offen) |

Geodienste des Landesmoduls: ALKIS (Flurstück, Gemeindeschlüssel), LINFOS (Schutzgebiete, als vollständig
gekennzeichnet), Überschwemmungs- und Wasserschutzgebiete (Abschnitt 5.4).

Nicht aufgenommen: Landes-Immissionsschutzgesetz (für den Antrag kaum relevant), Prüfverordnung für technische Anlagen
(nur Sonderbauten, später), Gesetz zur Ausführung des BauGB (**aufgehoben** zum 31.08.2026 durch das Gesetz vom
21.07.2026, das auch BauO NRW und DSchG NRW geändert hat – zählt nur noch für Anträge vor dem 01.09.2026). Eine
Verwaltungsvorschrift zur BauO NRW 2018 und die Verwaltungsvorschrift Artenschutz stehen nicht auf recht.nrw.de; sie
kommen als `datei`-Quelle dazu, sobald die amtliche Fundstelle geklärt ist.

### 9.3 Kreis Soest (`nw-05974`)

Gemeindeschlüssel des Kreises 05974000, 14 Gemeinden (05974004 Anröchte … 05974056 Wickede (Ruhr); Liste aus dem
DVG-Dienst von Geobasis NRW). **Untere Bauaufsicht** ist der Kreis für zehn Gemeinden; Lippstadt (große), Soest,
Warstein und Werl (mittlere kreisangehörige Städte) sind es selbst und führen auch ihr Baulastenverzeichnis. Für
Vorhaben in Soest bleibt der Kreis zuständig als untere Naturschutz-, Wasser- und Bodenschutzbehörde und als
Brandschutzdienststelle. Viele Schutzverordnungen erlässt die **Bezirksregierung Arnsberg**; sie stehen trotzdem in
diesem Modul, weil sie für das Kreisgebiet gelten. (Wird eine Verordnung kreisübergreifend gebraucht, kann ein Modul je
Regierungsbezirk dazukommen – die dritte Stelle des Gemeindeschlüssels, hier `059`.)

Das Modul setzt die Zuständigkeiten als Fakten (`zustaendig.bauaufsicht`, `zustaendig.baulasten` je
Gemeindeschlüssel), damit Protokoll und Hinweise die richtige Stelle nennen.

**Für die Stadt Soest gibt es keinen Landschaftsplan.** Im Außenbereich gilt dort die Landschaftsschutzverordnung der
Bezirksregierung, dazu einzelne Naturschutzgebietsverordnungen.

| Norm | Erlassen von | Stand | Quelle | Geltung → Ampel |
|---|---|---|---|---|
| Landschaftsschutzverordnung Kreis Soest (LINFOS LSG-SO-00097, 31 320 ha; u. a. Soest, Bad Sassendorf, Möhnesee, Welver, Werl, Erwitte, Geseke) | Bez.-Reg. Arnsberg | 24.03.2009; **§ 8 neu gefasst durch VO vom 21.07.2026** (Befristung entfallen) | `legaldocs.naturschutzinformationen.nrw.de` (`vo_ar_2009_15.pdf` + `vo_31_2026_arnsberg.pdf`, zusammengesetzt) – nicht die veraltete Kopie auf kreis-soest.de | LINFOS-Treffer → § 3 Abs. 1 Nr. 1 (Verbot baulicher Anlagen) rot, Befreiung nötig |
| Naturschutzgebiete mit Anteil Soest: SO-060 Standortübungsplatz Büecke, SO-075 Klärteiche Hattrop (beide **einstweilig sichergestellt, befristet**), SO-076 Klärteiche Zuckerfabrik, SO-079 Salzbrink | Bez.-Reg. Arnsberg | 2001–2026 | legaldocs (je Gebiet) | LINFOS-Treffer → rot; Sicherstellung mit Fristende → gelb, wenn das Fristende vor der erwarteten Entscheidung liegt |
| Landschaftspläne I–VI (Obere Lippetalung/Geseker Unterbörde, Erwitte/Anröchte, Lippetal/Lippstadt-West, Welver, Wickede/Ense, Werl) | Kreis | 2002–2013; Rechtskraft von LP II, III, V noch nicht ermittelt, LP II nur als Scan | kreis-soest.de (PDF) | nur im Außenbereich der jeweiligen Gemeinden; Festsetzungen als Einheiten |
| Landschaftsplan VIII Warstein | Kreis | Offenlage 06.07.–08.08.2026, dazu einstweilige Sicherstellungen | kreis-soest.de | nicht rechtskräftig → gelb; Sicherstellungen rot |
| Verordnung Naturdenkmale/geschützte Landschaftsbestandteile im Innenbereich Soest, Welver, Werl | Kreis | 19.05.2014 | kreis-soest.de (PDF) | Frage „Naturdenkmal oder geschützter Bestandteil betroffen?“ → sonst gelb |
| Überschwemmungsgebietsverordnung ME_LIP_1600 (Ahse, Salzbach, Mühlenbach, Soestbach, Amper Bach, Blögge, Schledde, Rosenau) | Bez.-Reg. Arnsberg | 05.03.2022, unbefristet | bra.nrw.de (PDF) | ÜSG-Dienst Ebene 6 (festgesetzt) bzw. 5 (vorläufig gesichert) → § 78 WHG rot; Genehmigung bei der unteren Wasserbehörde des Kreises |
| Heilquellenschutzgebiet Bad Sassendorf 451401 (Zone III reicht in den Osten Soests) | Bez.-Reg. Arnsberg | VO 21.09.1987 | bra.nrw.de – **Scan ohne Textebene** | WSG-Dienst (`typ=H`) → rot; Verbote der Zone III von Hand prüfen |
| Vogelschutzgebiet **Hellwegbörde** DE-4415-401 (48 417 ha, zu 85 % im Kreis, liegt im Stadtgebiet Soest) | EU/Land (Bekanntmachung 17.12.2004) | Maßnahmenplan LANUV 2015 | recht.nrw.de (Bekanntmachung), lanuk.nrw.de (Maßnahmenplan) | LINFOS-Treffer → § 34 BNatSchG (Verträglichkeitsprüfung) rot – **auch im Innenbereich**; Hinweis: Summation aller Eingriffe seit 2004, Bauten mit Kulissenwirkung (Höhe) kritisch, Kataster der Verfahren bei LANUK und Kreis |
| weitere Natura-2000-Gebiete: VSG Lippe-/Ahsewiesen, Luerwald/Bieberbach, Möhnesee; FFH DE-4414-301 Büecke und Hiddingser Schledde (Soest) | EU/Land | – | LINFOS | wie oben |
| Regionalplan Arnsberg, Teilabschnitt Kreis Soest/Hochsauerlandkreis | Bez.-Reg. Arnsberg | März 2012 | bra.nrw.de (PDF) | nur Außenbereich: Hinweis zu § 35 Abs. 3 BauGB, gelb |

**Auskünfte** (Fakten mit „Auskunft vom …“, ohne eigene Norm):

| Auskunft | Stelle | Hinweis für die App |
|---|---|---|
| Altlasten | Kreis, nur schriftlich (Serviceportal) | ohne Einverständnis der Eigentümer nur ja/nein; etwa eine Woche – früh anstoßen |
| Kampfmittel | Antrag über die örtliche Ordnungsbehörde (Stadt Soest), die den Kampfmittelbeseitigungsdienst Westfalen-Lippe beauftragt | |
| Baulasten | Stadt Soest (für die zehn übrigen Gemeinden der Kreis) | nach `zustaendig.baulasten` |
| Artenschutz-Vorprüfung | Formular „Vorprüfung Artenschutz“ des Kreises als Teil der Bauvorlagen | ob Soest dasselbe Formular nutzt, ist offen |
| Bergbau, Erdbebenzone | Bez.-Reg. Arnsberg Abt. 6 (GDU); GD NRW | Relevanz für Soest und Dienste noch nicht geklärt → gelb bis Auskunft |

**Geodienste:** Für das Kreismodul vor allem die landesweiten – LINFOS (NSG, LSG, FFH, VSG, Biotope; die
Detailseiten verlinken die Verordnungstexte auf legaldocs), ÜSG (Ebenen 5 und 6, mit Verweis auf das PDF der
Verordnung), WSG (Heilquellen- und Trinkwasserschutz, geplant/festgesetzt). Die Dienste des Kreises
(`gis.kreis-soest.de`) waren aus der Recherche **nicht erreichbar**; Altlasten-, Kompensations- und
Wiesenweihe-Karten sind ohnehin passwortgeschützt. Beim Bau erneut prüfen.

**Neue Fassungen erkennen:** Amtsblatt des Kreises und Amtsblatt der Bezirksregierung Arnsberg als `liste`-Quellen
(neue Schutzgebiets-, ÜSG- und WSG-Verordnungen erscheinen dort zuerst); legaldocs für die Texte. **kreis-soest.de
antwortet auf fehlende Seiten mit HTTP 200** (Titel „Fehler - 404“), alte Adressen ändern sich – der Adapter prüft den
Inhalt, nicht nur den Status.

Offen für das Modul: Rechtskraft der Landschaftspläne II, III und V; Texterkennung für Scans (LP II, Heilquellen-VO);
Dienste des Kreises; Erdbebenzone; ob in Soest die Stadt oder der Kreis Artenschutz bei Bauvoranfragen prüft.

### 9.4 Stadt Soest (`nw-05974040`)

Gemeindeschlüssel 05974040 (bestätigt im städtischen Bebauungsplan-Dienst). Die Stadt ist **untere
Bauaufsichtsbehörde** und **untere Denkmalbehörde**; Naturschutz liegt beim Kreis, Abwasser bei der Stadtentwässerung
Soest AöR (SES).

**Quellen:** Ortsrecht auf einer Seite mit rund 100 PDF-Links, ohne Datum und Fassung
(`https://www.soest.de/politik-verwaltung/ortsrecht-und-satzungen`), Bekanntmachungen nach § 17 der Hauptsatzung auf
derselben Seite, BauGB-Bekanntmachungen unter `…/politik-verwaltung/bekanntmachungen`. Geodienste der Stadt unter
`https://gis02.soest.de/arcgis/rest/services` (Lizenz laut Geodatenkatalog dl-de/zero-2.0; Angabe auf open.nrw
weicht ab – vor dem Bau klären). Hosts: `www.soest.de`, `gis02.soest.de`, `www.stadtentwaesserung-soest.de`.

| Norm (Modul) | Stand | Geltungsbereich → Fakt | Paragrafen bzw. Einheiten (erster Umfang) |
|---|---|---|---|
| Örtliche Bauvorschrift Gestaltung Altstadt („Altstadtsatzung“) | Änderung vom 27.09.2023, ausgefertigt 14.11.2023; **nicht geänderte Paragrafen der Fassung vom 11.07.2013 gelten fort** (§ 20) | Altstadt im Wallring → `soest.altstadt` (Frage; Vorschlag aus dem Polygon der Denkmalbereichssatzung, nur Hinweis) | § 3 Abstandsflächen (bis 0,125 H – **weicht von § 6 BauO NRW ab**), § 4 Dach (45–58°), § 5 Gauben, § 5a Solaranlagen (**maßgeblich nach § 42a Abs. 1 Satz 3 BauO NRW**), §§ 7–11 Fenster, Material, Farben, § 12 Einfriedungen, § 13 Vorgärten, § 14 Technik/Wärmepumpen, § 15 Garagen mit Gründach, § 18 Gestaltungsbeirat (bei Neubauten Pflicht) |
| Werbeanlagen Altstadt | 12.11.2001, geändert 30.06.2002 | Altstadt; nur bei Werbeanlage | ganze Satzung |
| Denkmalbereichssatzung Altstadt | 14.02.1996 | innerhalb der Wallstraßen → Polygon im Denkmal-Dienst (vollständig) | § 3 erlaubnispflichtige Maßnahmen – **Scan ohne Textebene (271 S.)**: Text von Hand prüfen, Änderung nur an der Prüfsumme der Datei erkennbar; Solaranlagen in der Altstadt brauchen laut Stadt eine denkmalrechtliche Erlaubnis |
| Stellplatzsatzung | Ratsbeschluss 15.12.2021, ausgefertigt 28.01.2022 | ganzes Stadtgebiet, Zonen 1–3 → `soest.stellplatzzone` (Frage, Karte Anlage 2); setzt `ortsrecht.stellplatzsatzung` = ja (Stellplatzverordnung NRW tritt zurück) | Anzahl nach Anlage 3 (Kfz und Fahrrad), Ablöse je Zone, Sonderregel Dachausbau in Gebäuden vor 1993 (Zone 1/2), § 7 hebt ältere Satzungen auf |
| Baumschutzsatzung | 19.07.2019 | Innenbereich und Bebauungspläne → Frage „geschützte Bäume betroffen (Stammumfang ab 120 cm, mehrstämmig 150 cm)?“ | Schutz, Eintrag im Lageplan, Ersatzpflanzung |
| Entwässerungssatzung der SES | 03.12.2025, in Kraft 01.01.2026 (ersetzt 2014) | ganzes Stadtgebiet | § 9 Anschluss- und Benutzungszwang, §§ 5, 11 Niederschlagswasser und Versickerung, § 14 Zustimmungsverfahren (eigener Antrag bei der SES), § 15 Zustands- und Funktionsprüfung |
| Sondernutzungssatzung | 19.05.2011, zuletzt geändert 26.04.2023 | Straßen der Stadt → Frage „Gerüst oder Baustelle im öffentlichen Raum?“ | Erlaubnis, Gebühren |
| Fernwärme „Britische Wohnsiedlung“ | 25.10.1993 | Teilgebiet → Frage | Anschluss- und Benutzungszwang (Heizungskonzept, GEG) |
| Satzung historische Ortsteile | 18.04.1973, geändert 1980 | Schutzzonen als Flurliste (Gemarkung im Text nicht genannt) | **Fortgeltung neben der Altstadtsatzung ungeklärt → gelb**, bis geklärt |
| Spielplatzsatzung | 1973/1974 | Stadtgebiet, Gebäude mit mehr als zwei Wohnungen | stützt sich auf die BauO 1970 – **Fortgeltung ungeklärt → gelb** (§ 8 BauO NRW gilt ohnehin) |
| Veränderungssperre B-Plan Nr. 5 „Windenergie Müllingsen“ | Verlängerung 2022; heutiger Stand ungeklärt | Teilgebiet | § 14 BauGB – gelb, bis geklärt |
| Bebauungspläne | dynamisch je Projekt | Abfrage am Flurstück (siehe unten) | je Plan eine Norm; Festsetzungen als Einheiten (Maß der Nutzung aus dem GRZ-Nachweis, textliche Festsetzungen von Hand) |

Nur als Hinweis, ohne Ampel: Sanierungssatzungen (alle im vereinfachten Verfahren, § 144 BauGB ausgeschlossen –
Förderung), Erschließungs-, Straßenbau- und Anschlussbeitragssatzung (Kosten), Gestaltungshandbuch 2023
(Erläuterung). **Sperrliste** (online noch abrufbar, aber aufgehoben bzw. ersetzt): Stellplatzablösesatzung 1980,
Stellplatzsatzung Adam-Kaserne 2020, Abwassersatzung 2014, die unsignierte Fassung der Altstadtsatzung auf der
Ortsrecht-Seite (maßgeblich ist die ausgefertigte unter `gis02.soest.de/pdf/AS/b049_as.pdf`). Nicht vorhanden:
Erhaltungssatzung (bis 2023 Teil der Altstadtsatzung, entfallen), Vorkaufsrechtssatzung, eigene Solar- oder
Dachbegrünungssatzung.

**Geodienste der Stadt** (am 12.11.2026 geprüft):

| Dienst | Abfrage | Liefert | Für die Ampel |
|---|---|---|---|
| `Bauleitplanung_WFS` (ArcGIS REST, Ebene 0) | `…/MapServer/0/query?geometry=x,y&geometryType=esriGeometryPoint&inSR=25832&outFields=*&f=json` – zuverlässig; der WFS filtert per BBOX nur in EPSG:4326 (Breite, Länge) | 491 Pläne inkl. Satzungen nach § 34 BauGB: Nr., Name, Ortsteil, Planart, Stand (4000 in Kraft, 2000 Entwurf), Datum (Text, teils Platzhalter), Planurkunde, Begründung, Verweis auf die Altstadtsatzung | Treffer → Bebauungsplan als Norm, Abgleich mit dem Merkmal *Planungsrecht*. **Der Dienst hinkt den Bekanntmachungen um Monate hinterher** (Pläne mit bekanntgemachtem Satzungsbeschluss noch als Entwurf) → Entwurf, Platzhalter-Datum oder neuere Bekanntmachung → gelb |
| `Denkmalschutz` (MapServer) | Abfrage am Flurstück | Baudenkmal (694 Punkte mit Listennummer), erhaltenswerte Gebäude, sonstige Baudenkmäler, eingetragene Bodendenkmäler, Polygon der Denkmalbereichssatzung | Denkmalbereich: vollständig (Polygon). Baudenkmäler nur als Punkte, Umgebungsschutz nicht abgebildet, Pflegestand unklar → **Treffer rot, kein Treffer gelb** |
| `Bauleitplanung2024`, `Sanierungsgebiete`, `FNP_2024` (WMS, auch GeoJSON) | GetFeatureInfo | u. a. Schutzgebiete, Sanierungsgebiete, laufende Verfahren, Solarflächen | laufendes Verfahren am Flurstück → gelb (Planreife, § 33 BauGB) |

Eine Denkmalliste als Liste ist nicht online (Kartei bei der unteren Denkmalbehörde; Übernahme in „Denkmalliste.NRW“
angekündigt). Für den Antrag in Soest außerdem nützlich, ohne Ampel: digitaler Bauantrag über „Rathaus online“
(seit 01.02.2023), städtischer Vordruck „Nachweis der Gebäudeklasse“, Artenschutz-Formular als Pflichtangabe,
Gestaltungsbeirat alle zwei Monate, Antragsvordrucke der SES.

Offen für das Modul: Text von § 3 der Denkmalbereichssatzung (Scan, Texterkennung), Fortgeltung der Satzungen von 1973,
Stand der Veränderungssperre Müllingsen, Lizenz der Geodaten.

## 10. Daten in der Projektdatei

Neuer Abschnitt `baurecht` in `projekt.json`, **je Antrag** (wie die Merkmale in `formulare.antraege`). Die Merkmale
selbst bleiben, wo Formulare sie führt – Baurecht liest und schreibt sie über denselben Weg (eine Quelle).

```jsonc
"baurecht": {
  "pruefungen": {
    "BAUA 2": {
      "einreichung": "2026-12-01",
      "fakten": {
        "schutz.lsg": { "wert": true, "herkunft": "geodienst", "quelle": "LINFOS NRW", "stand": "2026-11-12", "sicherheit": "sicher" },
        "soest.altstadt": { "wert": false, "herkunft": "manuell", "bestaetigt": { "von": "TP", "am": "2026-11-12" } }
      },
      "festlegungen": {
        "bund/bnatschg/44": { "ampel": "gruen", "grund": "Begehung 03.11.2026 ohne Befund, Bericht im Projektordner", "von": "TP", "am": "2026-11-12",
                              "automatisch": "gelb", "stand": { "44/1": "7d2a90c4" }, "bestaetigt": "2026-11-12T10:14" }
      },
      "protokolle": [
        { "am": "2026-11-20", "paket": "2026.11.12-1",
          "fassungen": { "nw/bauo-nrw": "2026-09-01", "bund/baunvo": "1990-01-27" },
          "ergebnis": { "rot": 31, "gelb": 0, "gruen": 64 }, "datei": "… Baurecht 2026-11-20.pdf" }
      ]
    }
  }
}
```

Paragrafen heißen überall `<modul>/<norm>/<paragraf>`. Geändert wird mit `projektdateiAendern` / Zusammenführen wie in
den anderen Apps; unbekannte Abschnitte bleiben.

## 11. Bedienung (Skizze)

- **Kopf:** Projekt, Antrag, Einreichungsdatum, Module („Bund · NRW · Kreis Soest · Stadt Soest“), „Rechtsstand:
  geprüft heute 09:14 · 2 Normen seit der letzten Prüfung geändert“, Regelpaket.
- **Links – Angaben:** Fakten in Gruppen mit Herkunft (Stammdaten, Merkmal, Flächenrechner, Geodienst, Modul, von
  Hand) und Stand; offene zuerst, sortiert nach „Was klärt am meisten?“; Fragen der Module als Segmentknöpfe wie die
  Merkmale in Formulare (`MerkmalWahl`).
- **Mitte – Vorschriften:** nach Ebene (Bund, Land, Kreis, Gemeinde) oder Thema gruppiert; je Norm eine Zeile mit
  Zählern, aufgeklappt die Paragrafen mit Ampel. Filter: nur rot/gelb, von Hand, geändert, prüft Behörde / eigene
  Verantwortung.
- **Rechts – Paragraf:** Ampel mit Begründung in Worten, beteiligte Fakten, Text in der maßgeblichen Fassung
  (Gesetzestext-Fenster aus Formulare), Änderungen alt/neu, Festlegung von Hand.
- **Prüfprotokoll** (Druck/PDF mit `DruckKopf`): alle bewerteten Paragrafen mit Ampel, Begründung, Fassung,
  Abrufdatum, Regelpaket; Festlegungen von Hand; offene gelbe Punkte. „Prüfung abschließen“ friert den Stand ein (wie
  „eingereicht“ in Formulare). Die Startseiten können „Baurecht: 3 gelb“ beim Antrag zeigen.

## 12. Umsetzung in Stufen

**Stufe 0 – Grundlage (nützt sofort auch Formulare)**
1. `bedingung.ts` (Logik und Merkmale) und `recht/` von `apps/formulare` nach `packages/core` verschieben; Formulare
   importiert von dort; Tests ziehen mit. Keine Verhaltensänderung.
2. Tauri-Befehl `netz_holen` mit Host-Liste; in allen Hüllen und in der Rahmen-App registrieren.
3. Rechtsstand-Dienst mit den Adaptern RIS, gesetze-im-internet.de, recht.nrw.de und `datei` (PDF über pdf.js);
   Prüfsumme je Absatz; Cache im Konfigurationsordner; `recht-holen.mjs` auf die Adapter umstellen.

**Stufe 1 – Regelpaket und App**
4. `packages/baurecht-regeln`: Schema, Lader (Kurzform → Bedingungen), Auswahl der Module nach Gemeindeschlüssel,
   Auswahl der Regeldatei (6.6), Tests, Werkzeug `regeln:fassung`.
5. Module **Bund** (Grundstock), **NRW**, **Kreis Soest**, **Stadt Soest** (Abschnitt 9).
6. `apps/baurecht` (Port 1490), in der Rahmen-App, Release `baurecht-v<version>`: Fakten aus der Projektdatei und von
   Hand, Ableitung der Gebäudeklasse, Ampel je Paragraf, Festlegung mit doppelter Bestätigung, Prüfprotokoll.
7. Auslieferung des Pakets: Workflow, Signatur, Release „regeln“, Laden und Prüfen in der App.

**Stufe 2 – live und am Grundstück**
8. Geodienste aus den Modulen (ALKIS, LINFOS, ÜSG, WSG, Dienste des Kreises) am Flurstück mit Puffer.
9. Stichtag mit künftigen Fassungen (RIS), Gegenüberstellung alt/neu, CI-Wächter.

**Stufe 3 – Antrag**
10. Verknüpfung mit dem Antragsumfang in Formulare (roter Paragraf → nötige Bauvorlage bzw. Fachantrag), eigene
    Module des Büros, weitere Kreise und Gemeinden.

## 13. Entscheidungen und offene Punkte

**Entschieden (12.11.2026)**
- Regeln austauschbar: je Gebiet ein Modul, je Norm und Fassung eine Datei, klein gehalten; zu Beginn NRW, Kreis Soest,
  Stadt Soest – dazu das Bundesmodul, ohne das BauGB, BauNVO, GEG usw. fehlen würden.
- Ampel je Paragraf.
- Regeln als eigenes Paket, getrennt von der App ausgeliefert.
- Festlegen von Hand darf jeder; dafür doppelte Bestätigung (beim Festlegen und beim Speichern).
- Name der App: **Baurecht**.

**Noch offen**
1. Reicht „kein Treffer im landesweiten Geodienst“ für Grün? Vorschlag: ja mit Puffer für Datensätze, die das Modul
   als vollständig kennzeichnet (LINFOS, ÜSG, WSG), sonst nein.
2. Wer pflegt die Module fachlich (Regeln schreiben und nach einer neuen Fassung bestätigen) – nur im Repo oder auch
   über eine Bearbeitungsansicht in der App?
3. Texterkennung für Satzungen und Verordnungen, die nur als Scan vorliegen (Denkmalbereichssatzung Soest,
   Landschaftsplan II, Heilquellenschutz Bad Sassendorf): in der App, beim Pflegen des Moduls einmalig, oder
   Paragrafen ohne Text von Hand?
4. Quelle für die MVV TB des DIBt, auf die die VV TB NRW dynamisch verweist.
5. Fachlich zu klären, bevor die Regeln geschrieben werden: Fortgeltung der Soester Satzungen von 1973, Stand der
   Veränderungssperre Müllingsen, Rechtskraft der Landschaftspläne II, III, V, Lizenz der Soester Geodaten,
   Erdbebenzone und Bergbau im Kreis.

**Risiken**
- RIS ist in der Testphase: Adressen, Umfang und Format können sich ändern → Rückfall auf gesetze-im-internet.de,
  Tests gegen aufgezeichnete Antworten.
- recht.nrw.de hat kein dokumentiertes API; der HTML-Parser kann brechen → Plausibilitätsprüfung, alte Fassung
  behalten, PDF als letzter Rückfall, der Wächter merkt es zuerst.
- Ortsrecht liegt meist als PDF vor, Adressen ändern sich beim Umbau einer Website → Modul meldet „Quelle nicht
  erreichbar“, letzter Text bleibt, Paragrafen werden gelb.
- Geodienste sind nicht rechtsverbindlich und teils unvollständig → Asymmetrie (5.1), Puffer, Kennzeichnung je
  Datensatz.
- Haftung: Das Protokoll ist eine Arbeitshilfe; der Hinweis „ersetzt keine fachliche Prüfung“ steht darauf.
