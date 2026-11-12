# Baurechtsprüfung – Konzept (Entwurf)

Stand: 12.11.2026 · Status: Planung, noch kein Code

Neues Modul `apps/baurecht` („Baurechtsprüfung“): zeigt zu einem Projekt alle Vorschriften, die für den Antrag eine
Rolle spielen, als **Ampel** – und begründet jede Einstufung. Die Angaben zum Projekt kommen wie bei allen Apps aus
der Projektdatei (`.oap`). Die Gesetzestexte holt das Modul **live** aus den amtlichen Quellen und merkt, wenn eine
neue Fassung gilt. Zweck: die Rechtsprüfung **vor dem Einreichen eines Antrags**.

| Ampel | Bedeutung | Wann automatisch |
|---|---|---|
| **rot** | gilt – muss beachtet und im Antrag berücksichtigt werden | die Regel trifft nach den Projektangaben sicher zu |
| **gelb** | von Hand prüfen | eine Angabe fehlt oder ist unsicher, Einzelfall/Ermessen, die Regel ist an der neuen Fassung noch nicht geprüft, es gibt noch keine Regel |
| **grün** | entfällt auf jeden Fall | die Regel trifft nach **gesicherten** Angaben sicher nicht zu – oder das Gesetz schließt es ausdrücklich aus |

Von Hand festlegen geht immer (Sonderfälle), mit Begründung, Name und Datum.

---

## 1. Grundsätze

1. **Grün ist ein Beleg, nicht die Vorgabe.** Grün gibt es nur, wenn feststeht, dass eine Vorschrift nicht gilt.
   Alles, was nicht sicher ist, wird gelb. Fehler sollen immer zur sicheren Seite gehen: lieber ein gelber Punkt zu
   viel als ein grüner zu viel.
2. **Dreiwertig wie in Formulare.** Die Bedingungslogik der Formulare-App (`apps/formulare/src/bedingung.ts`, R-01)
   kennt schon `ja` / `nein` / `offen` – das ist genau die Ampel: `ja` → rot, `nein` → grün, `offen` → gelb. Ein
   fehlendes Merkmal lässt nichts entfallen.
3. **Jede Einstufung ist nachvollziehbar:** welche Regel, welche Angaben (mit Herkunft und Stand), welche Fundstelle in
   welcher Fassung. Ohne Begründung gibt es keine Ampel.
4. **Der Stichtag zählt.** „Die neueste Fassung“ ist nicht immer die, die gilt: Die BauNVO gilt in der Fassung, die
   der Bebauungsplan zugrunde legt; § 42a BauO NRW knüpft an das Datum des Bauantrags an; § 90 Abs. 4 BauO NRW lässt
   Verfahren nach dem Recht zur Zeit der Antragstellung weiterlaufen. Das Modul arbeitet deshalb mit einem
   **geplanten Einreichungsdatum** und kennt auch künftige Fassungen.
5. **Texte live, Regeln geprüft.** Texte kommen aus dem Netz, die Regeln (wann gilt was) liefert die App, mit Tests –
   wie die Vorgaben der Formulare. Ändert sich ein Paragraf, auf den sich eine Regel stützt, wird aus ihrem Grün ein
   Gelb, bis die Regel an der neuen Fassung geprüft ist.
6. **Kein Ersatz für die fachliche Prüfung.** Das Modul ordnet und erinnert; die rechtliche Einordnung bleibt bei den
   Entwurfsverfassenden (§ 54 BauO NRW).

## 2. Was es im Repo schon gibt

| Baustein | Ort | Nutzen für das Modul |
|---|---|---|
| Dreiwertige Bedingungen mit Begründung und Fundstellen | `apps/formulare/src/bedingung.ts`, `vorgaben/hilfen.ts`, `vorgaben/grundlagen.ts` | Kern der Regel-Logik; wandert nach `packages/core` |
| Antragsmerkmale (Gebäudeklasse, Sonderbau, Verfahren, Gebäudeart, Vorhaben, Planungsrecht) | `bedingung.ts` (`VORGABE_MERKMALE`, `MERKMAL_ERKLAERUNG`); Werte je Antrag in `.oap` → `formulare.antraege[<Antrag>].merkmale` | wichtigste Projektangaben; eine gemeinsame Quelle für beide Apps |
| Gesetzestexte mit Lader, Absatzsuche, Fundstelle in Worten | `apps/formulare/src/recht/` (Snapshot BauO NRW, BauPrüfVO, Auszüge BauGB, BauNVO, BNatSchG, GEIG) | Datenformat (`Gesetz`, `Paragraf`) und Parser bleiben; wird zum Fallback ohne Netz |
| Abruf-Skript | `apps/formulare/scripts/recht-holen.mjs` | Parser für recht.nrw.de und gesetze-im-internet.de; URL heute von Hand gepflegt |
| Test „gibt es jede Fundstelle im Text?“ und Fallmatrix | `apps/formulare/src/vorgaben/vorgaben.test.ts` | Muster für die Regeltests |
| Stammdaten mit Koordinaten in EPSG:25832 | `packages/core/src/model.ts` (`ProjectMeta.koordinaten`) | Abfrage der Geodienste |
| Festsetzungen des Bebauungsplans, Plandatum, BauNVO-Fassung, Gebietsart | `model.ts` (`MassNutzung`) aus dem GRZ-Nachweis | Fakten zum Planungsrecht; BauNVO-Fassung nach Plandatum |
| Geschosse, Räume, Wohnungen, BGF/BRI | Flächenrechner (`storeys`) | abgeleitete Fakten (Höhe, Nutzungseinheiten, Wohnungszahl …) |
| Projektdatei gezielt ändern und zusammenführen | `packages/core/src/projektdatei.ts`, `zusammenfuehren.ts` | eigener Abschnitt `baurecht`, ohne Daten anderer Apps zu verlieren |
| Nachschlagewerk | `packages/core/src/regeln/regelwerk.ts` | Erklärtexte, Verlinkung |

## 3. Aufbau

```
 amtliche Quellen          Rechtsstand (Büro)        Projekt (.oap)
 ─────────────────         ──────────────────        ──────────────
 RIS Bund (API)  ─┐        Cache je Gesetz und        Stammdaten, Merkmale,
 gesetze-im-     ─┼─► Adapter ─► Fassung (unveränderlich) Festsetzungen, Geschosse
 internet.de      │        + Änderungen je §               │
 recht.nrw.de    ─┘                 │                      ▼
 Geodienste NRW ──────────────────────────────────► Fakten (Wert · Herkunft · Stand · Sicherheit)
 Ortsrecht (Büro-Register)          │                      │
                                    ▼                      ▼
                          Normenkatalog + Regeln  ──►  Auswertung (dreiwertig)
                                                           │
                                       manuelle Festlegung ┤
                                                           ▼
                                             Ampel je Gesetz / § / Absatz
                                             mit Begründung → Prüfprotokoll
```

Gemeinsames gehört nach `packages/core` (Rechtsstand, Bedingungen, Geodienste), damit Formulare dieselben aktuellen
Texte nutzt. Die App selbst enthält Normenkatalog, Regeln und Oberfläche.

---

## 4. Immer die aktuellen Texte

### 4.1 Quellen

Am 12.11.2026 geprüft:

| Ebene | Quelle | Zugang | Neue Fassung erkennen | Bemerkung |
|---|---|---|---|---|
| Bund | **Rechtsinformationssystem des Bundes (RIS)**, `testphase.rechtsinformationen.bund.de` | REST-API mit OpenAPI (`/openapi.json`); `GET /v1/legislation?eli=<Werk>&mostRelevantOn=<Datum>` liefert genau die Fassung, die an dem Tag gilt (sonst die nächste, sonst die letzte); Text als LegalDocML-XML, HTML oder je Paragraf (`…/<eId>.html`) | ELI der Fassung (`…/2023-07-03/1/deu`) ändert sich; `GET /v1/legislation/changelog?from=…&to=…` (Zeitstempel mit Zone) | **bevorzugt, wo vorhanden**: kennt Fassungen mit Gültigkeitszeitraum, auch künftige. Noch Testphase und **unvollständig** – BauNVO und BNatSchG sind da, BauGB und GEG (Stand heute) nicht. `changelog` meldet derzeit `allChanged: true` → dann je Werk prüfen |
| Bund | **gesetze-im-internet.de** | Verzeichnis aller Gesetze `gii-toc.xml` (≈ 6 100 Einträge), je Gesetz `/<kürzel>/xml.zip` | `ETag`/`Last-Modified` am ZIP → bedingte Abfrage (304 = unverändert); im XML `builddate` und `standangabe` („zuletzt geändert durch Art. 8 Abs. 2 G v. 23.7.2026 …“) | **Rückfall und Vollständigkeit**; nur die geltende Fassung, keine künftigen und keine alten |
| Land NRW | **recht.nrw.de** | Seite je Fassung `/lrgv/<art>/<TTMMJJJJ>-<name>`; Paragrafen in `<section class="legaldoc-article">` (Parser im vorhandenen Skript) | **„Link zur aktuellsten Fassung“** `/taxonomy/term/<id>` (BauO NRW: 32203) leitet per Meta-Refresh auf die geltende Fassung um – ändert sich das Ziel, gibt es eine neue Fassung. Auf der Seite: „Gültig ab“, Vollzitat, Änderungshistorie, PDF | damit entfällt das Pflegen der URL im Skript. Ob künftige Fassungen vorab erscheinen, ist zu prüfen (siehe 4.6) |
| Kommune | Ortsrecht (Stellplatz-, Gestaltungs-, Baumschutz-, Erhaltungssatzung, Veränderungssperre, Entwässerung), Bebauungspläne | keine einheitliche Quelle; Register des Büros je Gemeindeschlüssel (siehe 5.4) | Inhalts-Prüfsumme bzw. `ETag` der hinterlegten Adresse | in Stufe 1 von Hand; Bebauungsplan-PDF im Projekt |
| Technische Regeln | VV TB NRW, DIN-Normen | VV TB über recht.nrw.de (zu prüfen); DIN nur als Fundstelle | wie Landesrecht | DIN urheberrechtlich geschützt – kein Text, nur Verweis (wie im Nachschlagewerk) |

### 4.2 Abruf in der Desktop-App

- Neuer Tauri-Befehl in `packages/core/tauri/commands.rs`, z. B. `netz_holen(url, etag?, geaendert?)` →
  `{ status, url_final, etag, geaendert, inhalt_base64 }`. Er folgt Umleitungen (auch Meta-Refresh bei recht.nrw.de
  wird in TypeScript ausgewertet) und erlaubt **nur eine feste Liste von Hosts** (`testphase.rechtsinformationen.bund.de`,
  `www.gesetze-im-internet.de`, `recht.nrw.de`, `www.wfs.nrw.de`, `www.wms.nrw.de`, …).
- Damit bleibt die CSP der Webansicht wie sie ist (heute nur Nominatim), und CORS spielt keine Rolle. Laut
  `docs/suite.md` gehört der Befehl auch in die Liste der Rahmen-App.
- Web-Build: kein Abruf (CORS); er zeigt den mitgelieferten Stand mit Hinweis „Stand der App vom …“.
- Gesendet wird nur, welches Gesetz gebraucht wird; für die Geodienste die Lage des Grundstücks – keine
  Personendaten. Das kommt wie bei Nominatim in die README.

### 4.3 Wann geprüft wird

- Beim Start der App, danach höchstens einmal am Tag je Gesetz (wie beim Updater, nur seltener), und von Hand
  („Rechtsstand prüfen“). Bedingte Abfragen machen das billig: gesetze-im-internet antwortet mit 304, recht.nrw.de
  liefert über den Term-Link nur eine Umleitungsseite (≈ 0,5 kB).
- Vor dem Abschluss einer Prüfung (Protokoll) wird immer frisch geprüft.

### 4.4 Ablage und Fassungen

- **Cache im gemeinsamen Konfigurationsordner** (`konfig_basis`, `recht/`): für alle Apps und alle Projekte des Büros
  gleich, Formulare liest daraus ebenfalls.
- Je Gesetz eine Liste der Fassungen; **jede Fassung wird nur einmal geschrieben und nie geändert**
  (`<gesetz>/<fassung>.json` im heutigen Format `Gesetz`/`Paragraf`, erweitert um `gueltigAb`, `gueltigBis`,
  `abgerufen`, `quelle`, Prüfsumme je Paragraf und Absatz). Alte Fassungen bleiben: Festlegungen und Protokolle
  verweisen darauf, und historische Fassungen (BauNVO 1962/1968/1977/1990) werden gebraucht.
- Die mitgelieferten Texte (heute `apps/formulare/src/recht/daten/`) sind die Grundausstattung ohne Netz; sie
  ziehen nach `packages/core`. Das Skript `recht-holen.mjs` erzeugt sie weiter, nutzt aber die Adapter (keine von Hand
  gepflegten URLs mehr).

### 4.5 Prüfen, bevor ersetzt wird

Eine neu abgerufene Fassung wird nur übernommen, wenn sie plausibel ist – sonst bleibt die bisherige, und die App
meldet „Neue Fassung erkannt, aber nicht lesbar“:

- Mindestzahl an Paragrafen (wie im Skript), Gültig-ab-Datum gefunden;
- **jede Fundstelle, auf die sich eine Regel stützt, ist samt Absatz und Nummer im Text** (derselbe Test wie in
  `vorgaben.test.ts`, hier zur Laufzeit);
- Paragrafen, die verschwinden oder umnummeriert werden, gelten als Änderung (siehe 4.7), nicht als Fehler.

### 4.6 Welche Fassung gilt – Stichtag

Für jede Prüfung gibt es zwei Daten: **heute** und das **geplante Einreichungsdatum** (Vorgabe: heute; im Antrag
änderbar). Daraus:

| Fall | Maßgebliche Fassung | Beispiel |
|---|---|---|
| Regel knüpft an den Bauantrag an | Fassung am Einreichungsdatum | § 42a Abs. 1 BauO NRW (Antrag nach dem 1.1.2024 bzw. 1.1.2025); § 90 Abs. 4 BauO NRW (Verfahrensrecht zur Zeit der Antragstellung, Genehmigungsfiktion für Anträge ab 1.9.2026) |
| statischer Verweis im Bebauungsplan | Fassung zum Plandatum | BauNVO 1962/1968/1977/1990 – im GRZ-Nachweis schon so modelliert (`MassNutzung.planDatum`, `baunvo`) |
| sonst | Fassung, die am Einreichungsdatum gilt – und **Hinweis auf bekannte spätere Fassungen** | RIS liefert Fassungen mit Gültigkeitszeitraum: „Änderung tritt am … in Kraft – wahrscheinlich vor der Entscheidung“ → gelb |

Übergangsvorschriften (z. B. § 90 BauO NRW) sind eigene Regeln im Katalog. Ob recht.nrw.de künftige Fassungen schon
vor dem Inkrafttreten zeigt, ist offen; das Gültig-ab-Datum wird in jedem Fall ausgewertet. Für Landesrecht kann
später das Gesetz- und Verordnungsblatt (GV. NRW.) als Frühwarnung dazukommen.

### 4.7 Was sich geändert hat – und was das für die Regeln heißt

- Beim Übernehmen einer neuen Fassung vergleicht das Modul **je Paragraf und Absatz** die Prüfsummen (Text
  normalisiert: Leerraum, Silbentrennung). Ergebnis: geändert / neu / weggefallen.
- Jede Regel trägt, gegen welche Fassung ihrer Fundstellen sie geprüft wurde (`geprueftGegen`: Prüfsumme je
  Fundstelle). Weicht eine ab, ist die Regel **nicht an der geltenden Fassung geprüft**: Aus Grün wird Gelb mit
  „§ 42a Abs. 4 BauO NRW hat sich am … geändert – Einstufung von Hand prüfen“; Rot bleibt Rot (sichere Seite).
- In der App: „Seit der letzten Prüfung geändert“ je Projekt, mit Gegenüberstellung alt/neu je Absatz.
- Protokolle früherer Prüfungen nennen die Fassungen, auf denen sie beruhen – sie bleiben gültig, bekommen aber den
  Hinweis „Rechtslage seit der Prüfung geändert“.

### 4.8 Wächter in der CI

Ein geplanter GitHub-Workflow (z. B. wöchentlich) ruft dieselben Adapter auf, vergleicht mit den Fassungen, gegen die
die Regeln geprüft sind, und legt bei einer Änderung ein Issue an: welche Gesetze, welche Paragrafen, welche Regeln
betroffen sind. So hinken die Regeln den Texten nicht lange hinterher. Die Fundstellen-Tests laufen dort gegen die
Live-Texte.

---

## 5. Projektfakten

### 5.1 Ein Fakt

```ts
interface Fakt<T> {
  /** null = unbekannt → jede Bedingung daran ist offen (gelb) */
  wert: T | null;
  herkunft: 'stammdaten' | 'merkmal' | 'flaechen' | 'grz' | 'geodienst' | 'abgeleitet' | 'manuell';
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

### 5.2 Woher die Fakten kommen

| Gruppe | Fakten | Herkunft |
|---|---|---|
| Lage | Bundesland, Gemeinde, **Gemeindeschlüssel**, Gemarkung/Flur/Flurstück, Grundstücksfläche, tatsächliche Nutzung | Stammdaten; ALKIS-WFS (prüft bzw. ergänzt) |
| Planungsrecht | Planungsrecht (§§ 30/34/35 BauGB), Bebauungsplan (Nr., Datum), Gebietsart, BauNVO-Fassung, GRZ/GFZ, Vollgeschosse | Merkmal *Planungsrecht*; Stammdaten; GRZ-Nachweis (`massNutzung`) |
| Schutz und Lage | Natur- und Landschaftsschutzgebiet, FFH-/Vogelschutzgebiet, geschütztes Biotop, Überschwemmungsgebiet (festgesetzt/vorläufig), Risikogebiet, Wasserschutzgebiet (Zone), Erdbebenzone, Bergbau, Radonvorsorgegebiet, Baudenkmal/Denkmalbereich/Umgebung, Bodendenkmal, Altlasten, Kampfmittel, Baulasten | Geodienste (soweit vorhanden), sonst von Hand mit „Auskunft vom …“ |
| Vorhaben | Vorhaben (Errichtung, Änderung, Nutzungsänderung, Beseitigung), Verfahren, Sonderbau, Gebäudeart, Gebäudeklasse | Merkmale (dieselben Werte wie in Formulare – eine Quelle) |
| Gebäude | Höhe nach § 2 Abs. 3 BauO NRW, Zahl und Größe der Nutzungseinheiten, Wohnungen, Geschosse, BGF, BRI, Nutzfläche, Aufenthaltsräume, beheizt/gekühlt, Stellplätze und Garagen (Zahl, Nutzfläche), Dachfläche | Flächenrechner, GRZ-Nachweis (Lageplan), sonst von Hand |
| Antrag | aktiver Antrag, geplantes Einreichungsdatum, eingereicht | Formulare (`meta.antrag`, `formulare.aktiveFassung`), Baurecht |

### 5.3 Abgeleitete Fakten und Abgleich

Wo sich ein Merkmal aus dem Modell ableiten lässt, rechnet das Modul mit und vergleicht:

- **Gebäudeklasse** aus Höhe (Fußboden des obersten Geschosses mit möglichem Aufenthaltsraum über der mittleren
  Geländeoberfläche – Geschosse und Gelände aus Flächenrechner/GRZ), freistehend (Hinweis), Zahl und Fläche der
  Nutzungseinheiten (Wohnungen aus dem Flächenrechner).
- **Wohnungszahl / Gebäudeart**, **Nutzfläche** (für § 42a Abs. 4 Nr. 1: bis 50 m²), **Garagen-Nutzfläche** (Sonderbau-
  und Prüfschwellen), **Stellplatzzahl** (GEIG).

Weicht die Ableitung vom festgelegten Merkmal ab („Merkmal GK 2, berechnet GK 3: Höhe 7,40 m“), wird alles, was an
dem Merkmal hängt, gelb – mit dem Angebot, das Merkmal zu ändern oder die Abweichung zu begründen. Die Ableitung
ersetzt das Merkmal nie still.

### 5.4 Geodienste NRW

Am 12.11.2026 geprüft (alle ohne Anmeldung, Abfrage in EPSG:25832 wie die Stammdaten):

| Dienst | Adresse | Liefert |
|---|---|---|
| ALKIS vereinfacht (WFS 2.0) | `https://www.wfs.nrw.de/geobasis/wfs_nw_alkis_vereinfacht` | `ave:Flurstueck` per BBOX um den Punkt: Gemarkung, Flur, Flurstück, **Gemeindeschlüssel** (`gmdschl`), amtliche Fläche, Lagebezeichnung, tatsächliche Nutzung, Umring, Aktualität |
| LINFOS NRW (WMS) | `https://www.wms.nrw.de/umwelt/linfos` | per GetFeatureInfo (GML; `STYLES` nötig): Naturschutzgebiete, Landschaftsschutzgebiet, FFH-Gebiete, Vogelschutzgebiete, geschützte Biotope … |
| Überschwemmungsgebiete (WMS) | `https://www.wms.nrw.de/umwelt/wasser/uesg` | erreichbar; Ebenen beim Bau festlegen |
| Wasserschutzgebiete (WMS) | `https://www.wms.nrw.de/umwelt/wasser/wsg` | erreichbar; Ebenen beim Bau festlegen |
| Bebauungspläne | kein landesweiter Dienst gefunden; einzelne Kreise/Städte (XPlanung, INSPIRE) | Stufe 3; bis dahin Merkmal und PDF |
| Erdbebenzonen, Bergbau, Radon, Denkmäler | Quelle noch zu klären | bis dahin von Hand |

- Abgefragt wird **am Flurstück**, nicht nur am Adresspunkt: Umring aus ALKIS, Prüfpunkte im Flurstück; liegt eine
  Grenze näher als ein Puffer (z. B. 10 m) oder ist die Geokodierung nur straßengenau (`koordinaten.genauigkeit`),
  ist der Fakt nur ein Hinweis.
- Die Dienste sind nicht rechtsverbindlich (der ALKIS-INSPIRE-Dienst sagt das ausdrücklich). Ein Treffer macht rot;
  kein Treffer macht grün nur bei landesweiten amtlichen Datensätzen mit Puffer (Einstellung des Büros, Vorgabe: ja
  für LINFOS/ÜSG/WSG, nein für alles Lückenhafte wie Denkmäler).
- Ergebnisse werden mit Quelle und Stand im Projekt gespeichert; „Neu abfragen“ wie bei den Koordinaten.

**Ortsrecht** (Stufe 3): Register des Büros im Konfigurationsordner (`ortsrecht.json`) je Gemeindeschlüssel – Titel,
Art (Stellplatz-, Gestaltungs-, Baumschutz-, Erhaltungssatzung, Veränderungssperre …), Adresse des Textes,
Geltungsbereich (gemeindeweit oder Teilgebiet), Stand. Gemeindeweit → gilt; Teilgebiet → gelb, bis „innerhalb/
außerhalb“ festgelegt ist. Einmal für eine Gemeinde gepflegt, nutzt es jedes Projekt dort.

---

## 6. Regel-Logik

### 6.1 Normenbaum

Vorschriften stehen in einem Baum: **Gesetz → (Teil/Abschnitt) → Paragraf → Absatz/Nummer**. Regeln hängen an jeder
Ebene. Die Ebene des Gesetzes klärt den Anwendungsbereich (gilt das GEG überhaupt?), die darunter die einzelnen
Pflichten.

```ts
interface Norm {
  /** z. B. 'geg', 'bauo-nrw/42a', 'bauo-nrw/42a/4' */
  id: string;
  titel: string;
  ebene: 'eu' | 'bund' | 'land' | 'kommune' | 'technik';
  /** wie der Text bezogen wird */
  quelle:
    | { art: 'ris'; eli: string } //           Werk-ELI, z. B. eli/bund/bgbl-1/1962/s429 (BauNVO)
    | { art: 'gii'; pfad: string } //          gesetze-im-internet.de/<pfad>/xml.zip
    | { art: 'recht-nrw'; term: number } //    recht.nrw.de/taxonomy/term/<id>
    | { art: 'ortsrecht'; art_: string } //    Register des Büros
    | { art: 'verweis'; url?: string }; //     DIN u. ä.: nur Fundstelle
  eltern?: string;
  thema: 'planungsrecht' | 'bauordnung' | 'brandschutz' | 'energie' | 'natur' | 'wasser' | 'denkmal' | 'immission' | 'verfahren' | 'sonstiges';
  regeln: Anwendungsregel[];
}
```

### 6.2 Regel

Die Bedingungen aus `bedingung.ts` werden um Fakten, Stichtage und Bezüge auf andere Normen erweitert; alles bleibt
dreiwertig und in Worten darstellbar (`bedingungText`).

```ts
type Teilbedingung =
  | { art: 'merkmal'; merkmal: string; werte: string[]; nicht?: boolean } //   wie heute
  | { art: 'fakt'; fakt: string; op: '=' | '≠' | '<' | '≤' | '>' | '≥' | 'in' | 'bekannt'; wert?: string | number | boolean | string[] }
  | { art: 'stichtag'; bezug: 'einreichung' | 'heute'; op: '<' | '≥'; datum: string }
  | { art: 'norm'; norm: string; ampel: Ampel[] }; //                            Ergebnis einer anderen Norm (ohne Zyklen)

interface Anwendungsregel {
  id: string;
  /** ja → rot, nein → grün, offen → gelb */
  gilt: Bedingung;
  /** trifft zu → Einzelfall/Ermessen: aus Grün wird Gelb, Rot bekommt den Hinweis „im Einzelfall prüfen“ */
  pruefen?: Bedingung;
  /** nie automatisch grün (z. B. Artenschutz: ohne Begehung nicht auszuschließen) */
  gruenNurVonHand?: boolean;
  /** Begründung in einem Satz, erscheint an der Ampel */
  grund: string;
  /** Fundstellen: öffnen den Text, werden auf Existenz geprüft und auf Änderungen überwacht */
  fundstellen: Quelle[];
  /** Prüfsumme je Fundstelle in der Fassung, gegen die die Regel geprüft ist (4.7) */
  geprueftGegen: Record<string, string>;
  /** prüft die Bauaufsicht das? (nach Verfahren, § 64/65 BauO NRW) – sonst eigene Verantwortung */
  prueftBehoerde?: Bedingung;
  /** womit es im Antrag nachgewiesen wird, z. B. 'baupruefvo/9' (Brandschutzkonzept) */
  nachweis?: string[];
}
```

### 6.3 Auswertung

Je Norm, von oben nach unten:

1. **Eltern grün → grün** („entfällt mit dem Gesetz“). Kinder werden nicht einzeln bewertet.
2. **Von Hand festgelegt → diese Festlegung** (Abschnitt 7); ist sie überholt, steht ⚠ daran.
3. **Jede Regel dreiwertig auswerten:**
   - `gilt` = ja → **rot** (mit `pruefen` = ja zusätzlich „im Einzelfall prüfen“)
   - `gilt` = nein → **grün**, außer `pruefen` ist nicht `nein`, `gruenNurVonHand` ist gesetzt oder die Regel ist
     nicht an der geltenden Fassung geprüft (4.7) → dann **gelb**
   - `gilt` = offen → **gelb**, mit den fehlenden bzw. unsicheren Fakten
4. **Mehrere Regeln:** rot vor gelb vor grün.
5. **Keine Regel:** gelb („noch keine Regel – von Hand beurteilen“). Ein Gesetz im Katalog ohne Regel wird nie grün.
6. Die Ampel eines Gesetzes in der Übersicht ist die eigene; darunter zählt die Liste „3 rot · 2 gelb · 14 grün“ der
   Paragrafen.

Dazu eine Auswertung **„Was klärt am meisten?“**: Je fehlendem Fakt wird gezählt, wie viele gelbe Punkte er auflösen
würde („Überschwemmungsgebiet klären – 4 Punkte“). Die Liste der offenen Angaben ist danach sortiert.

### 6.4 Wann gelb

- ein Fakt fehlt oder ist nur ein Hinweis (und würde ausschließen);
- Merkmal und Ableitung widersprechen sich (5.3);
- Einzelfall/Ermessen (z. B. „fügt sich ein“ nach § 34 BauGB, Abweichungen § 69 BauO NRW, Befreiungen § 31 BauGB,
  § 42a Abs. 5 BauO NRW „soweit … im Einzelfall“);
- die Regel ist an der geltenden Fassung nicht geprüft, oder eine spätere Fassung tritt vor der erwarteten
  Entscheidung in Kraft;
- es gibt noch keine Regel.

### 6.5 Wann grün

Nur wenn **alles** zutrifft: die Regel schließt nach gesicherten Fakten sicher aus, sie ist an der geltenden Fassung
geprüft, nichts ist Einzelfall, und kein Widerspruch steht offen. Am stärksten sind Ausschlüsse, die das Gesetz
selbst formuliert – sie sollten bevorzugt als Regel geschrieben werden (Beispiele unten).

### 6.6 Prüft die Behörde – und womit wird es nachgewiesen?

Rot heißt „gilt“, nicht „wird geprüft“. Für die Vorbereitung des Antrags ist der Unterschied wichtig, deshalb zeigt
jeder rote Punkt zusätzlich:

- **prüft die Bauaufsicht** – im vereinfachten Verfahren nach § 64 Abs. 1 BauO NRW: §§ 29–38 BauGB, §§ 4, 6, 48 und
  49 BauO NRW, örtliche Bauvorschriften, beantragte Abweichungen, anderes öffentliches Recht, das nicht in einem
  anderen Verfahren geprüft wird; bei Sonderbauten, die keine großen sind, zusätzlich den Brandschutz;
  baulicher Arbeitsschutz nicht. Im Baugenehmigungsverfahren (§ 65) entsprechend mehr, in der Freistellung (§ 63)
  nichts;
- **eigene Verantwortung** – gilt, wird aber nicht geprüft (z. B. GEG, baulicher Arbeitsschutz);
- **Nachweis** – welche Bauvorlage es belegt (BauPrüfVO), später verknüpft mit dem Antragsumfang in Formulare.

### 6.7 Beispiele

**§ 42a BauO NRW (Solaranlagen)** – Stichtag, Ausschlüsse aus dem Gesetz, Einzelfall:

```ts
regel({
  gilt: und(ist('Vorhaben', 'Errichtung'), oder(
    und(ist('Gebäudeart', 'Nichtwohngebäude'), stichtag('einreichung', '≥', '2024-01-02')),
    und(ist('Gebäudeart', 'Einfamilienhaus', 'Zweifamilienhaus', 'Mehrfamilienhaus'), stichtag('einreichung', '≥', '2025-01-02')),
  )),
  grund: 'PV-Pflicht bei Errichtung, abhängig vom Datum des Bauantrags.',
  fundstellen: [q('bauo-nrw', '42a', 1)],
});
// Kind 'bauo-nrw/42a/4': grün, wenn Nutzfläche ≤ 50 m² (Fakt aus dem Flächenrechner) oder Behelfsbau/untergeordnet
// Kind 'bauo-nrw/42a/5': pruefen – „entfällt, soweit …“ ist immer Einzelfall
// Hinweis aus Abs. 1 Satz 3: örtliche Bauvorschrift oder Bebauungsplan gehen vor → Norm('ortsrecht/solar')
```

Die Daten im Gesetz („nach dem 1. Januar 2024“) stehen als Stichtag in der Regel; der Fundstellen-Test prüft, dass der
Absatz noch so lautet – ändert er sich, wird die Regel gelb (4.7).

**Eingriffsregelung §§ 14 ff. BNatSchG** – Ausschluss durch das Gesetz selbst (§ 18 Abs. 2 BNatSchG: im Geltungsbereich
eines Bebauungsplans nach § 30 BauGB und im Innenbereich nach § 34 BauGB nicht anzuwenden):

- `gilt`: Planungsrecht = Außenbereich → rot; Bebauungsplan oder Innenbereich → **grün**; einfacher Bebauungsplan →
  gelb (im Übrigen § 34 oder § 35).
- **Artenschutz § 44 BNatSchG** dagegen: `gruenNurVonHand` – bei Errichtung, Änderung am Dach/an der Fassade oder
  Abbruch ohne Prüfung nicht auszuschließen; es gibt dafür auch ein Formular in Formulare.

**Überschwemmungsgebiet (§§ 76–78 WHG)** – Geodienst: im festgesetzten oder vorläufig gesicherten Gebiet → rot (§ 78
Abs. 4: Bauverbot mit Ausnahmen); im Risikogebiet (§ 78b) → rot mit Hinweis; außerhalb mit Puffer → grün; nahe der
Grenze oder nur straßengenau → gelb.

**BauNVO** – rot im Bebauungsplan mit Baugebiet (Fassung nach Plandatum) und im Innenbereich mit faktischem Baugebiet
(§ 34 Abs. 2 BauGB, geltende Fassung); im Außenbereich ohne Plan grün.

**GEIG** – rot bei Errichtung eines Wohngebäudes mit mehr als fünf bzw. eines Nichtwohngebäudes mit mehr als sechs
Stellplätzen (§§ 6, 7); Stellplatzzahl unbekannt → gelb; Beseitigung → grün.

**GEG** – Gesetz rot bei Errichtung eines Gebäudes, das beheizt oder gekühlt wird (§ 2); bei Änderung gelb (Änderung
von Außenbauteilen, § 48); Beseitigung, „kein Gebäude“ → grün. Prüft die Behörde nicht (eigene Verantwortung).

---

## 7. Von Hand festlegen (Sonderfälle)

- An jeder Norm: **rot / gelb / grün festlegen**, **Begründung Pflicht**, Name (Bearbeitung aus den Stammdaten bzw.
  Einstellungen) und Datum werden gespeichert, dazu die automatische Ampel zum Zeitpunkt der Festlegung und die
  Fassung der Fundstellen.
- Die Festlegung geht vor. Sie wird **überholt**, wenn sich danach die automatische Ampel, ein Fakt, an dem die Regel
  hängt, oder eine Fundstelle ändert. Dann steht ⚠ daran („Automatisch jetzt rot: Landschaftsschutzgebiet seit
  Abfrage am …“), und das Protokoll zählt sie als offen, bis sie bestätigt oder aufgehoben ist.
- „Von Hand“ ist in der Liste immer sichtbar (eigenes Zeichen), filterbar, und steht im Protokoll mit Begründung.
- Rückgängig/Verlauf wie in den anderen Apps.
- Eigene Normen des Büros (z. B. eine Satzung, eine Arbeitshilfe) lassen sich mit Titel, Fundstelle und Ampel von Hand
  anlegen – ohne Regel, also gelb, bis festgelegt.

## 8. Normenkatalog – erster Umfang (NRW, Wohnungsbau und kleinere Nichtwohnbauten)

Fakten in Klammern; „GD“ = Geodienst.

| Norm | Quelle | rot | gelb | grün |
|---|---|---|---|---|
| BauGB §§ 29–38 | gii (RIS, sobald vorhanden) | § 30/34/35 nach *Planungsrecht* | § 31 Befreiung, § 34 Einfügen, einfacher B-Plan, § 246e (Wohnungsbau) | jeweils andere Lage |
| BauGB §§ 14, 172 ff. (Veränderungssperre, Erhaltungssatzung) | gii + Ortsrecht | festgestellt | Ortsrecht nicht gepflegt | Gemeinde gepflegt, nichts gefunden |
| BauNVO (Fassung nach Plandatum) | RIS (+ mitgelieferte alte Fassungen) | B-Plan mit Baugebiet, § 34 Abs. 2 | Gebietsart unbekannt | Außenbereich ohne Plan |
| BauO NRW: § 6 Abstandsflächen | recht-nrw (Term 32203) | Errichtung/Änderung eines Gebäudes | Änderung ohne Außenwirkung | Beseitigung, kein Gebäude |
| BauO NRW: Brandschutz | recht-nrw | immer bei Gebäuden | – | Beseitigung |
| BauO NRW: § 48 Stellplätze (+ Satzung) | recht-nrw + Ortsrecht | Errichtung, Nutzungsänderung | Satzung unbekannt | Beseitigung |
| BauO NRW: § 49 Barrierefreiheit | recht-nrw | Wohnungen ab GK 3, öffentlich zugänglich | Nutzungsänderung | EFH/ZFH GK 1–2 ohne öffentliche Nutzung |
| BauO NRW: § 42a Solaranlagen | recht-nrw | s. 6.7 | Einzelfall Abs. 5 | Abs. 4, Vorhaben ≠ Errichtung (außer Dacherneuerung, Abs. 3) |
| BauO NRW: § 50 / SBauVO NRW | recht-nrw | Sonderbau = ja (Teil nach Art), Garagen über der Schwelle | Garagenfläche unbekannt | kein Sonderbau, keine Garage |
| BauO NRW: §§ 63–65, 69, 90 | recht-nrw | Verfahren nach *Verfahren*; § 90 nach Stichtag | Abweichungen | – |
| BauPrüfVO | recht-nrw | Bauvorlagen nach Verfahren | – | – |
| GEG | gii | Errichtung, beheizt/gekühlt | Änderung | Beseitigung, kein Gebäude |
| GEIG | gii | Stellplatzschwellen | Stellplätze unbekannt | darunter, Beseitigung |
| BNatSchG §§ 14–18 | RIS | Außenbereich | einfacher B-Plan | B-Plan, Innenbereich (§ 18 Abs. 2) |
| BNatSchG § 44 Artenschutz | RIS | – | immer, außer von Hand | nur von Hand |
| LNatSchG NRW, Landschaftsplan, Schutzgebiets-VO | recht-nrw + GD LINFOS | in NSG/LSG/FFH/Biotop | Grenze nahe | außerhalb mit Puffer |
| WHG §§ 76–78b | gii + GD ÜSG | im ÜSG/Risikogebiet | Grenze nahe | außerhalb mit Puffer |
| WHG § 52, WSG-Verordnung | gii + GD WSG | in Zone I–III | Grenze nahe | außerhalb mit Puffer |
| StrlSchG §§ 121–123 (Radon) | gii | Neubau mit Aufenthaltsräumen/Arbeitsplätzen (§ 123) | Vorsorgegebiet unbekannt | Beseitigung, ohne Aufenthaltsräume |
| DSchG NRW | recht-nrw | Denkmal/Bereich/Umgebung bestätigt | bis Auskunft | Auskunft negativ (von Hand) |
| ArbStättV | gii | Nichtwohngebäude mit Arbeitsplätzen | Nutzung unklar | Wohngebäude ohne Arbeitsstätte |
| BImSchG/TA Lärm | gii | – | Gewerbe, Wohnen an Lärmquellen | EFH im WR/WA ohne Hinweise (von Hand) |
| Kampfmittel, Altlasten, Baulasten, Bergbau | Ortsrecht/Auskunft | bestätigt | bis Auskunft | Auskunft negativ (von Hand) |
| Ortsrecht: Gestaltung, Baumschutz, Entwässerung | Ortsrecht | gemeindeweit | Teilgebiet | Gemeinde gepflegt, keine |
| VV TB NRW, DIN-Normen | Verweis | immer | – | – |

Die Liste wächst mit; jeder Eintrag kommt mit Tests (Fallmatrix wie in `vorgaben.test.ts`: Vorhaben × Gebäudeart ×
Gebäudeklasse × Planungsrecht × Verfahren × Stichtag, auch „nicht festgelegt“).

## 9. Daten in der Projektdatei

Neuer Abschnitt `baurecht` in `projekt.json`, **je Antrag** (wie die Merkmale in `formulare.antraege`). Merkmale
selbst bleiben dort, wo Formulare sie führt – Baurecht liest und schreibt sie über denselben Weg (eine Quelle).

```jsonc
"baurecht": {
  "pruefungen": {
    "BAUA 2": {
      "einreichung": "2026-12-01",
      "fakten": {
        "schutz.lsg": { "wert": true, "herkunft": "geodienst", "quelle": "LINFOS NRW", "stand": "2026-11-12", "sicherheit": "sicher" },
        "gebaeude.beheizt": { "wert": true, "herkunft": "manuell", "bestaetigt": { "von": "TP", "am": "2026-11-12" } }
      },
      "festlegungen": {
        "bnatschg/44": { "ampel": "gruen", "grund": "Begehung 03.11.2026 ohne Befund, Bericht im Projektordner", "von": "TP", "am": "2026-11-12",
                         "automatisch": "gelb", "fassung": { "bnatschg/44": "<Prüfsumme>" } }
      },
      "protokolle": [
        { "am": "2026-11-20", "fassungen": { "bauo-nrw": "01092026", "baunvo": "eli/bund/bgbl-1/1962/s429/2023-07-03/1/deu" },
          "ergebnis": { "rot": 18, "gelb": 0, "gruen": 41 }, "datei": "… Rechtsprüfung 2026-11-20.pdf" }
      ]
    }
  }
}
```

Geändert wird mit `projektdateiAendern` / Zusammenführen wie in den anderen Apps; unbekannte Abschnitte bleiben.

## 10. Bedienung (Skizze)

- **Kopf:** Projekt, Antrag, Einreichungsdatum, „Rechtsstand: geprüft heute 09:14 · 2 Gesetze seit der letzten
  Prüfung geändert“.
- **Links – Angaben:** Fakten in Gruppen mit Herkunft (Stammdaten, Merkmal, Flächenrechner, Geodienst, von Hand) und
  Stand; offene zuerst, sortiert nach „Was klärt am meisten?“. Merkmale mit denselben Segmentknöpfen und
  Erklärungen wie in Formulare (`MerkmalWahl`).
- **Mitte – Vorschriften:** nach Thema oder Ebene gruppiert, Ampel, Zähler, Filter (nur rot/gelb, von Hand,
  geändert, prüft Behörde / eigene Verantwortung).
- **Rechts – Einzelheiten:** Ampel mit Begründung in Worten, beteiligte Fakten, Text des Paragrafen in der
  maßgeblichen Fassung (Gesetzestext-Fenster aus Formulare), Änderungen alt/neu, Festlegung von Hand.
- **Prüfprotokoll** (Druck/PDF mit `DruckKopf`): alle Vorschriften mit Ampel, Begründung, Fassung und Abrufdatum,
  Festlegungen von Hand, offene gelbe Punkte. „Prüfung abschließen“ friert den Stand ein (wie „eingereicht“ in
  Formulare). Die Startseiten können „Rechtsprüfung: 3 gelb“ beim Antrag zeigen.

## 11. Umsetzung in Stufen

**Stufe 0 – Grundlage (nützt sofort auch Formulare)**
1. `bedingung.ts` (Logik und Merkmale) und `recht/` von `apps/formulare` nach `packages/core` verschieben; Formulare
   importiert von dort; Tests ziehen mit. Keine Verhaltensänderung.
2. Tauri-Befehl `netz_holen` mit Host-Liste; in allen Hüllen und in der Rahmen-App registrieren.
3. Rechtsstand-Dienst mit den Adaptern RIS, gesetze-im-internet.de und recht.nrw.de; Cache im Konfigurationsordner;
   Plausibilitätsprüfung; `recht-holen.mjs` auf die Adapter umstellen.

**Stufe 1 – erste Fassung der App**
4. `apps/baurecht` (Port 1490), in der Rahmen-App, Release `baurecht-v<version>` – Gerüst wie die anderen Apps.
5. Fakten aus der Projektdatei (Stammdaten, Merkmale, Festsetzungen, Flächenrechner) und von Hand; Ableitung der
   Gebäudeklasse mit Abgleich.
6. Regel-Engine (6.3), etwa 15 Normen aus Abschnitt 8 mit Tests, Ampel, Festlegung von Hand, Prüfprotokoll.

**Stufe 2 – live und am Grundstück**
7. Geodienste (ALKIS, LINFOS, ÜSG, WSG) am Flurstück mit Puffer.
8. Stichtag mit künftigen Fassungen (RIS), Änderungsvergleich je Absatz, „nicht an der geltenden Fassung geprüft“,
   CI-Wächter.

**Stufe 3 – Ortsrecht und Antrag**
9. Ortsrecht-Register je Gemeinde, Bebauungsplan-Dokumente im Projekt, Bebauungspläne aus XPlanung, wo es sie gibt.
10. Verknüpfung mit dem Antragsumfang in Formulare (roter Punkt → nötige Bauvorlage bzw. Fachantrag), eigene
    Regeln des Büros.

## 12. Risiken und offene Fragen

**Risiken**
- RIS ist in der Testphase: Adressen, Umfang und Format können sich ändern → Adapter mit Rückfall auf
  gesetze-im-internet.de, Tests gegen aufgezeichnete Antworten.
- recht.nrw.de hat kein dokumentiertes API; der HTML-Parser kann brechen → Plausibilitätsprüfung, alte Fassung
  behalten, PDF als letzter Rückfall, CI-Wächter merkt es zuerst.
- Geodienste sind nicht rechtsverbindlich und teils unvollständig → Asymmetrie (5.1), Puffer, Einstellung je
  Datensatz.
- Regeln hinken neuen Fassungen hinterher → Gelb statt veraltetem Grün (4.7), CI-Wächter.
- Haftung: Das Protokoll ist eine Arbeitshilfe; der Hinweis „ersetzt keine fachliche Prüfung“ steht darauf.

**Zu entscheiden**
1. Nur NRW, oder von Anfang an mit Platz für weitere Länder (Adapter je Land, Regeln je Land)?
2. Ampel nur je Gesetz oder auch je Paragraf/Absatz? (Vorschlag: beides, als Baum.)
3. Reicht „kein Treffer im landesweiten Geodienst“ für Grün? (Vorschlag: ja mit Puffer für LINFOS/ÜSG/WSG, sonst nein.)
4. Regeln nur mit App-Updates ausliefern oder als eigenes, häufiger aktualisiertes Regelpaket?
5. Wer darf von Hand festlegen, und muss eine Festlegung von einer zweiten Person bestätigt werden?
6. Name der App: „Baurechtsprüfung“, „Rechtsprüfung“ oder „Baurecht“?
