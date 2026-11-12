/**
 * Fakten-Katalog: die Angaben zum Projekt, auf die sich die Regeln stützen. Module können eigene Fakten erklären
 * (Fragen, feste Werte, Geodienste); diese hier bringt die App mit. Werte kommen aus der Projektdatei (Stammdaten,
 * Festsetzungen, Flächenrechner), aus Geodiensten oder von Hand.
 */

import type { FaktDef } from './typen';

const j = (titel: string, gruppe: FaktDef['gruppe'], hilfe?: string, frage?: string): FaktDef => ({ titel, gruppe, typ: 'janein', ...(hilfe ? { hilfe } : {}), ...(frage ? { frage } : {}) });
const z = (titel: string, gruppe: FaktDef['gruppe'], einheit?: string, hilfe?: string): FaktDef => ({ titel, gruppe, typ: 'zahl', ...(einheit ? { einheit } : {}), ...(hilfe ? { hilfe } : {}) });

/** kurze Namen (höchstens 40 Zeichen) für Angaben mit langem Titel – überall derselbe Name; der Titel erklärt */
const KURZ: Record<string, string> = {
  'schutz.wsg_zone': 'Zone Wasser-/Heilquellenschutz',
  'gebaeude.arbeitsstaette': 'Arbeitsstätte',
  'gebaeude.aufenthaltsraeume': 'Aufenthaltsräume oder Arbeitsplätze',
  'gebaeude.behelfsbau': 'Behelfsbau oder Fliegender Bau',
  'gebaeude.landwirtschaft': 'Land- oder forstwirtschaftliches Gebäude',
  'gebaeude.oeffentlich': 'Öffentlich zugänglich',
  'lage.altlasten': 'Altlast oder Altlastverdacht',
  'lage.bergbau': 'Bergbau oder unsicherer Untergrund',
  'lage.gewaesser': 'Grundstück am Gewässer',
  'lage.strasse_ausserorts': 'An klassifizierter Straße außerorts',
  'lage.zufahrt_neu': 'Neue oder geänderte Zufahrt',
  'planung.abweichung': 'Abweichung von der Bauordnung',
  'planung.befreiung': 'Befreiung vom Bebauungsplan',
  'planung.planaufstellung': 'Bebauungsplan in Aufstellung',
  'planung.wohnungsbau_246e': 'Wohnungsbau nach § 246e BauGB',
  'schutz.baum': 'Geschützte Bäume betroffen',
  'schutz.bodendenkmal': 'Bodendenkmal (auch vermutet)',
  'schutz.denkmal': 'Baudenkmal auf dem Grundstück',
  'schutz.denkmal_umgebung': 'Umgebung eines Baudenkmals',
  'schutz.landschaftsplan': 'Landschaftsplan',
  'schutz.natura_nah': 'Natura-2000-Gebiet in der Nähe',
  'schutz.nsg': 'Naturschutzgebiet',
  'schutz.risikogebiet': 'Hochwasser-Risikogebiet (HQextrem)',
  'schutz.uesg': 'Überschwemmungsgebiet',
  'technik.batteriespeicher': 'Batteriespeicher oder Betriebsraum',
  'technik.brennstofflager': 'Brennstofflager',
  'technik.feuerstaette': 'Feuerstätte',
  'vorhaben.baustelle_oeffentlich': 'Baustelle im Straßenraum',
  'vorhaben.boden_800': 'Über 800 m³ Bodenmaterial',
  'vorhaben.dach_fassade': 'Arbeiten an Dach oder Fassade',
  'vorhaben.entwaesserung': 'Entwässerung neu oder geändert',
  'vorhaben.erdarbeiten': 'Erdarbeiten',
  'vorhaben.erstbebauung': 'Erstbebauung (nach 1996)',
  'vorhaben.grundwasser': 'Eingriff ins Grundwasser',
  'vorhaben.versickerung': 'Versickerung oder Einleitung',
};

const KATALOG: Record<string, FaktDef> = {
  /* ---------- Lage ---------- */
  'lage.ags': { titel: 'Gemeindeschlüssel', gruppe: 'lage', typ: 'text', hilfe: 'Amtlicher Gemeindeschlüssel (8 Ziffern), z. B. 05974040 für Soest – aus ALKIS zum Flurstück oder von Hand' },
  'lage.gemeinde': { titel: 'Gemeinde', gruppe: 'lage', typ: 'text' },
  'lage.erdbebenzone': { titel: 'Erdbebenzone', gruppe: 'lage', typ: 'wahl', werte: ['0', '1', '2', '3'], hilfe: 'nach der eingeführten Erdbebennorm (Technische Baubestimmungen); Abfrage z. B. beim GFZ Potsdam oder GD NRW. „0“ = außerhalb der Zonen 1–3' },
  'lage.bergbau': j('Bergbau oder Gefährdung des Untergrunds bekannt', 'lage', 'Auskunft der Bezirksregierung Arnsberg, Abt. 6 (Bergbau), bzw. GDU NRW'),
  'lage.radon': j('Radonvorsorgegebiet', 'lage', 'Festlegung nach § 121 StrlSchG durch das Land'),
  'lage.altlasten': j('Altlast oder Altlastverdacht auf dem Grundstück', 'lage', 'Auskunft aus dem Altlastenkataster der unteren Bodenschutzbehörde'),
  'lage.kampfmittel': j('Kampfmittelverdacht', 'lage', 'Auskunft über die örtliche Ordnungsbehörde (Luftbildauswertung des Kampfmittelbeseitigungsdienstes)'),
  'lage.baulast': j('Baulast eingetragen oder nötig', 'lage', 'Baulastenverzeichnis der Bauaufsichtsbehörde'),
  'lage.gewaesser': j('Grundstück an einem oberirdischen Gewässer (bis 5 m Uferstreifen) oder Anlage am Gewässer', 'grundstueck'),
  'lage.strasse_ausserorts': j('An einer Bundes-, Landes- oder Kreisstraße außerhalb der Ortsdurchfahrt (bis 40 m)', 'grundstueck', 'Zustimmung der Straßenbaubehörde (§ 25 StrWG NRW, § 9 FStrG)'),
  'lage.zufahrt_neu': j('Neue oder geänderte Zufahrt zu einer öffentlichen Straße', 'grundstueck'),

  /* ---------- Schutzgebiete und Denkmal ---------- */
  'schutz.nsg': j('Naturschutzgebiet (auch einstweilig sichergestellt)', 'schutz'),
  'schutz.lsg': j('Landschaftsschutzgebiet', 'schutz'),
  'schutz.ffh': j('FFH-Gebiet (Natura 2000)', 'schutz'),
  'schutz.vsg': j('Vogelschutzgebiet (Natura 2000)', 'schutz'),
  'schutz.natura_nah': j('Natura-2000-Gebiet in der Nähe, erhebliche Beeinträchtigung möglich', 'schutz', 'auch außerhalb des Gebiets kann eine Verträglichkeitsprüfung nötig sein (§ 34 BNatSchG)'),
  'schutz.biotop': j('Gesetzlich geschütztes Biotop betroffen', 'schutz'),
  'schutz.uesg': j('Überschwemmungsgebiet (festgesetzt oder vorläufig gesichert)', 'schutz'),
  'schutz.risikogebiet': j('Risikogebiet außerhalb von Überschwemmungsgebieten (HQextrem)', 'schutz'),
  'schutz.wsg': j('Wasser- oder Heilquellenschutzgebiet', 'schutz'),
  'schutz.wsg_zone': { titel: 'Zone des Wasser- bzw. Heilquellenschutzgebiets', gruppe: 'schutz', typ: 'wahl', werte: ['I', 'II', 'III', 'IIIA', 'IIIB'] },
  'schutz.landschaftsplan': j('Im Geltungsbereich eines Landschaftsplans', 'schutz'),
  'schutz.denkmal': j('Baudenkmal auf dem Grundstück (eingetragen oder vorläufig geschützt)', 'schutz'),
  'schutz.denkmal_umgebung': j('In der engeren Umgebung eines Baudenkmals', 'schutz', 'erlaubnispflichtig, wenn das Erscheinungsbild des Denkmals berührt wird (§ 9 Abs. 2 DSchG NRW)'),
  'schutz.denkmalbereich': j('In einem Denkmalbereich', 'schutz'),
  'schutz.bodendenkmal': j('Bodendenkmal oder Vermutung eines Bodendenkmals', 'schutz'),
  'schutz.baum': j('Geschützte Bäume betroffen (Baumschutzsatzung, Naturdenkmal, Allee)', 'schutz'),

  /* ---------- Planungsrecht ---------- */
  'planung.bplan_nr': { titel: 'Bebauungsplan (Nummer)', gruppe: 'planung', typ: 'text' },
  'planung.bplan_datum': { titel: 'Bebauungsplan in Kraft seit', gruppe: 'planung', typ: 'text', hilfe: 'JJJJ-MM-TT' },
  'planung.gebietsart': { titel: 'Baugebiet', gruppe: 'planung', typ: 'wahl', werte: ['WS', 'WR', 'WA', 'WB', 'MD', 'MDW', 'MI', 'MU', 'MK', 'GE', 'GI', 'SO', 'keins'] },
  'planung.baunvo': { titel: 'BauNVO-Fassung', gruppe: 'planung', typ: 'wahl', werte: ['1962', '1968', '1977', '1990', '2013', '2017', '2021', 'aktuell'], hilfe: 'im Bebauungsplan die Fassung zum Zeitpunkt der öffentlichen Auslegung (§§ 25c ff. BauNVO); im Innenbereich die geltende' },
  'planung.veraenderungssperre': j('Veränderungssperre (§ 14 BauGB)', 'planung'),
  'planung.erhaltungssatzung': j('Erhaltungssatzung (§ 172 BauGB)', 'planung'),
  'planung.sanierungsgebiet': j('Sanierungsgebiet', 'planung'),
  'planung.planaufstellung': j('Bebauungsplan in Aufstellung (§ 33 BauGB)', 'planung'),
  'planung.befreiung': j('Abweichung von Festsetzungen des Bebauungsplans beabsichtigt', 'planung', 'Ausnahme oder Befreiung nach § 31 BauGB'),
  'planung.abweichung': j('Abweichung von Anforderungen der Bauordnung beabsichtigt', 'planung', '§ 69 BauO NRW'),
  'planung.wohnungsbau_246e': j('Abweichung vom Planungsrecht für Wohnungsbau nach § 246e BauGB beabsichtigt', 'planung'),

  /* ---------- Vorhaben ---------- */
  'vorhaben.dach_fassade': j('Arbeiten an Dach oder Fassade (Artenschutz: Quartiere von Fledermäusen und Gebäudebrütern)', 'vorhaben'),
  'vorhaben.dachhaut': j('Vollständige Erneuerung der Dachhaut', 'vorhaben', '§ 42a Abs. 3 BauO NRW'),
  'vorhaben.erdarbeiten': j('Erdarbeiten (Unterkellerung, Gründung, Leitungen)', 'vorhaben'),
  'vorhaben.boden_800': j('Mehr als 800 m³ Bodenmaterial auf- oder eingebracht', 'vorhaben', '§ 2 Abs. 2 LBodSchG'),
  'vorhaben.baeume_faellen': j('Bäume fällen oder Gehölze roden', 'vorhaben'),
  'vorhaben.werbeanlage': j('Werbeanlage', 'vorhaben'),
  'vorhaben.baustelle_oeffentlich': j('Gerüst oder Baustelleneinrichtung im öffentlichen Straßenraum', 'vorhaben'),
  'vorhaben.entwaesserung': j('Neuer Anschluss oder Änderung der Grundstücksentwässerung', 'vorhaben'),
  'vorhaben.versickerung': j('Niederschlagswasser soll versickert oder eingeleitet werden', 'vorhaben'),
  'vorhaben.erstbebauung': j('Grundstück wird erstmals bebaut (nach dem 01.01.1996)', 'vorhaben', '§ 44 LWG / § 55 Abs. 2 WHG'),
  'vorhaben.grundwasser': j('Eingriff ins Grundwasser (Wasserhaltung, Erdwärmesonde, Brunnen)', 'vorhaben'),

  /* ---------- Gebäude ---------- */
  'gebaeude.hoehe': z('Höhe nach § 2 Abs. 3 BauO NRW', 'gebaeude', 'm', 'Fußbodenoberkante des höchsten Geschosses mit möglichem Aufenthaltsraum über der mittleren Geländeoberfläche'),
  'gebaeude.wohnungen': z('Wohnungen', 'gebaeude'),
  'gebaeude.nutzungseinheiten': z('Nutzungseinheiten', 'gebaeude'),
  'gebaeude.bgf': z('Brutto-Grundfläche', 'gebaeude', 'm²'),
  'gebaeude.bri': z('Brutto-Rauminhalt', 'gebaeude', 'm³'),
  'gebaeude.nutzflaeche': z('Nutzfläche', 'gebaeude', 'm²', 'für § 42a Abs. 4 BauO NRW (bis 50 m²)'),
  'gebaeude.freistehend': j('Freistehendes Gebäude', 'gebaeude'),
  'gebaeude.aufenthaltsraeume': j('Aufenthaltsräume oder Arbeitsplätze im Gebäude', 'gebaeude'),
  'gebaeude.beheizt': j('Gebäude wird beheizt oder gekühlt', 'gebaeude', 'Anwendungsbereich des GEG'),
  'gebaeude.arbeitsstaette': j('Arbeitsstätte (Arbeitsplätze von Beschäftigten)', 'gebaeude'),
  'gebaeude.oeffentlich': j('Öffentlich zugänglich (§ 49 Abs. 2 BauO NRW)', 'gebaeude'),
  'gebaeude.behelfsbau': j('Behelfsbau, untergeordnetes Gebäude oder Fliegender Bau', 'gebaeude'),
  'gebaeude.landwirtschaft': j('Land- oder forstwirtschaftlich genutztes Gebäude', 'gebaeude'),
  'gebaeude.aufzug': j('Aufzug', 'gebaeude'),
  'gebaeude.besucher': z('Besucher (Versammlungsstätte)', 'gebaeude'),
  'gebaeude.gastbetten': z('Gastbetten (Beherbergung)', 'gebaeude'),
  'gebaeude.verkaufsflaeche': z('Verkaufsfläche', 'gebaeude', 'm²'),
  'gebaeude.garage_nutzflaeche': z('Nutzfläche von Garagen', 'gebaeude', 'm²', 'Kleingarage bis 100 m², Mittelgarage bis 1 000 m², Großgarage darüber'),
  'gebaeude.stellplaetze': z('Kfz-Stellplätze im oder am Gebäude', 'gebaeude', undefined, 'für die Ladeinfrastruktur nach GEIG'),

  /* ---------- Technik ---------- */
  'technik.feuerstaette': j('Feuerstätte (Heizung mit Verbrennung, Kamin)', 'technik'),
  'technik.waermepumpe': j('Wärmepumpe oder Blockheizkraftwerk', 'technik'),
  'technik.brennstofflager': j('Lagerung von Brennstoffen (Heizöl, Pellets, Flüssiggas)', 'technik'),
  'technik.batteriespeicher': j('Batteriespeicher oder elektrischer Betriebsraum', 'technik'),

  /* ---------- Antrag ---------- */
  'antrag.einreichung': { titel: 'Geplantes Einreichungsdatum', gruppe: 'antrag', typ: 'text' },
};

export const FAKTEN: Record<string, FaktDef> = Object.fromEntries(Object.entries(KATALOG).map(([id, d]) => [id, KURZ[id] ? { ...d, kurz: KURZ[id] } : d]));

/** Merkmale aus Formulare (Antragsmerkmale) – Titel für die Anzeige */
export const MERKMAL_TITEL: Record<string, string> = {
  Gebäudeklasse: 'Gebäudeklasse',
  Sonderbau: 'Sonderbau',
  Verfahren: 'Verfahren',
  Gebäudeart: 'Gebäudeart',
  Vorhaben: 'Art des Vorhabens',
  Planungsrecht: 'Planungsrecht',
};
