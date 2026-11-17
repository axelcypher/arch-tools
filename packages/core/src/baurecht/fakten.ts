/**
 * Fakten-Katalog: die Angaben zum Projekt, auf die sich die Regeln stützen. Module können eigene Fakten erklären
 * (Fragen, feste Werte, Geodienste); diese hier bringt die App mit. Werte kommen aus der Projektdatei (Stammdaten,
 * Festsetzungen, Flächenrechner), aus Geodiensten oder von Hand.
 */

import type { FaktDef } from './typen';

/* Planungsrecht im Übrigen: Innenbereich bzw. Außenbereich – beim einfachen Bebauungsplan und bei Satzungen nach dem
   BauGB nach der Angabe „Im Zusammenhang bebauter Ortsteil“ (§ 30 Abs. 3, § 34 Abs. 4, § 35 Abs. 6 BauGB) */
const PR = (...werte: string[]) => ({ m: 'Planungsrecht', in: werte });
const FAKT = (f: string, ist: boolean) => ({ f, ist });
const MIT_UND_OHNE_PLAN = PR('einfacher Bebauungsplan', 'Satzung nach BauGB');
const INNEN_34 = { oder: [PR('Innenbereich'), { und: [MIT_UND_OHNE_PLAN, FAKT('planung.innen', true)] }] };
const AUSSEN_35 = { oder: [PR('Außenbereich'), { und: [MIT_UND_OHNE_PLAN, FAKT('planung.innen', false)] }] };
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
  'planung.befreiung': 'Abweichung vom Bebauungsplan',
  'planung.abweichung_umgebung': 'Fehlendes Vorbild in der Umgebung',
  'planung.anschluss_ortslage': 'Nähe zu Ortslage oder Plangebiet',
  'planung.planaufstellung': 'Bebauungsplan in Aufstellung',
  'planung.wohnungsbau_246e': 'Sonderregelung Wohnungsbau (§ 246e)',
  'vorhaben.wohnraum_neu': 'Neue Wohnungen oder Wohnräume',
  'schutz.baum': 'Baum, Allee oder Naturdenkmal betroffen',
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

  /* ---------- Vorfragen (FaktDef.vorfrage): je Gegenstand eine Frage; „nein“ erledigt die Einzelfragen darunter ---------- */
  // Der Anwendungsbereich jeder Vorfrage umfasst den ihrer Einzelfragen ganz – auch Wirkungen aus dem Umfeld (§ 34 BNatSchG,
  // Umgebungsschutz der Denkmäler, Anbaubeschränkungen an Straßen); sonst entstünde aus „nein“ ein falsches Grün
  'vorfrage.natura2000': {
    titel: 'FFH- oder Vogelschutzgebiet (Natura 2000) am Standort oder im Einwirkungsbereich des Vorhabens',
    kurz: 'Natura 2000 am Standort oder im Umfeld',
    gruppe: 'schutz',
    typ: 'janein',
    frage: 'Liegt das Grundstück in einem FFH- oder Vogelschutzgebiet oder so nah daran, dass das Vorhaben das Gebiet erheblich beeinträchtigen könnte?',
    hilfe:
      '§ 34 BNatSchG erfasst auch Vorhaben außerhalb eines Natura-2000-Gebiets, die es erheblich beeinträchtigen können (z. B. Stoffeinträge, Lärm, Licht, Wasserhaushalt). „nein“ nur, wenn kein Gebiet im möglichen Einwirkungsbereich liegt – im Zweifel offen lassen. Karte: Fachinformationssystem Natura 2000 des LANUK. Die Lage-Abfrage prüft nur einen Umkreis von 25 m und belegt die Frage deshalb nie mit „nein“ vor.',
  },
  'vorfrage.naturschutz': {
    titel:
      'Natur- oder Landschaftsschutzgebiet (auch einstweilig sichergestellt), Naturdenkmal, geschützter Landschaftsbestandteil oder gesetzlich geschütztes Biotop am Standort oder im Einwirkungsbereich des Vorhabens',
    kurz: 'Schutzgebiet oder -objekt (Naturschutz)',
    gruppe: 'schutz',
    typ: 'janein',
    frage:
      'Liegen das Grundstück oder Teile des Vorhabens (Zufahrt, Leitungen, Baustelleneinrichtung) in einem – auch einstweilig sichergestellten – Natur- oder Landschaftsschutzgebiet, oder gibt es auf dem Grundstück, angrenzend oder sonst im Einwirkungsbereich (z. B. Einleitung von Wasser, Grundwasserabsenkung, Wurzel- und Kronenbereich) ein Naturdenkmal, einen geschützten Landschaftsbestandteil oder ein gesetzlich geschütztes Biotop?',
    hilfe:
      '§§ 22–23, 26, 28–30 BNatSchG, §§ 42, 48 LNatSchG NRW – Schutzgebiete und -objekte durch Verordnung oder Landschaftsplan, Biotope allein kraft Gesetzes (auch ohne Kartierung). Verboten ist auch, was von außen zu einer Beeinträchtigung führen kann. „nein“ nur, wenn nichts davon im Einwirkungsbereich liegt. Karte: LINFOS NRW. Der Landschaftsplan selbst und Bäume nach einer Baumschutzsatzung sind eigene Angaben.',
  },
  'vorfrage.wasser': {
    titel: 'Wasser- oder Heilquellenschutzgebiet, Überschwemmungsgebiet oder Hochwasser-Risikogebiet',
    kurz: 'Wasserschutz- oder Hochwassergebiet',
    gruppe: 'schutz',
    typ: 'janein',
    frage: 'Liegt das Grundstück in einem Wasser- oder Heilquellenschutzgebiet, einem (auch vorläufig gesicherten) Überschwemmungsgebiet oder einem Hochwasser-Risikogebiet (HQextrem)?',
    hilfe: 'Alle drei zeigt ELWAS-WEB des Landes NRW. Die Pflichten gelten im Gebiet selbst (§§ 51–53, 78, 78b WHG): Liegt das Grundstück außerhalb, folgt „nein“. Nahe einer Gebietsgrenze die Karte genau prüfen.',
  },
  'vorfrage.denkmal': {
    titel: 'Denkmal auf dem Grundstück oder in seiner Umgebung, Denkmalbereich oder Bodendenkmal (auch vermutet)',
    kurz: 'Denkmal am Standort oder in der Umgebung',
    gruppe: 'schutz',
    typ: 'janein',
    frage:
      'Gibt es auf dem Grundstück oder in seiner engeren Umgebung ein Bau- oder Gartendenkmal – auch vorläufig geschützt –, liegt es in oder nahe einem Denkmalbereich, oder ist auf dem Grundstück oder in seiner engeren Umgebung ein Bodendenkmal bekannt oder zu vermuten?',
    hilfe:
      '§§ 4, 9, 13, 15 DSchG NRW: Erlaubnispflichtig ist auch, was in der engeren Umgebung eines Denkmals dessen Erscheinungsbild berührt (Sichtbezug). Vorläufig geschützt ist ein Objekt schon ab der Mitteilung, dass die Unterschutzstellung eingeleitet ist (§ 4) – in der Denkmalliste steht es dann noch nicht: bei der Unteren Denkmalbehörde fragen. Bodendenkmäler und Vermutungsflächen bei der LWL- bzw. LVR-Archäologie. „nein“ nur, wenn weder ein Denkmal noch ein Denkmalbereich im Umfeld liegt und keine archäologischen Funde zu erwarten sind.',
  },
  'vorfrage.gehoelze': {
    titel: 'Bäume, Sträucher oder Hecken auf dem Grundstück, angrenzend oder im Bereich der Bauarbeiten',
    kurz: 'Bäume, Sträucher oder Hecken',
    gruppe: 'schutz',
    typ: 'janein',
    frage: 'Stehen auf dem Grundstück, angrenzend (auch im Straßenraum oder auf dem Nachbargrundstück, mit Krone oder Wurzeln über die Grenze) oder im Bereich von Zufahrt und Baustelleneinrichtung Bäume, Sträucher oder Hecken?',
    hilfe: 'Daran hängen geschützte Bäume (Baumschutzsatzung, Naturdenkmal, Allee), geschützte Hecken und Anpflanzungen (§ 39 LNatSchG NRW) sowie das Fällen und Roden. „nein“ nur, wenn dort gar keine Gehölze stehen.',
  },
  'vorfrage.strasse': {
    titel: 'Bundes-, Landes- oder Kreisstraße am oder nahe dem Grundstück, oder Anschluss daran',
    kurz: 'Klassifizierte Straße im Umfeld',
    gruppe: 'grundstueck',
    typ: 'janein',
    frage: 'Liegt das Grundstück an oder nahe einer Bundesautobahn (bis 100 m) oder einer Bundes-, Landes- oder Kreisstraße (außerhalb der Ortsdurchfahrt bis 40 m, an einer Bundesstraße in der Ortsdurchfahrt angrenzend) – auch geplant –, oder ist bzw. wird es über eine Zufahrt, auch mittelbar, an eine solche Straße außerhalb der Ortsdurchfahrt angeschlossen?',
    hilfe: '§ 9 FStrG, § 25 StrWG NRW; die Abstände gelten ab dem äußeren Rand der befestigten Fahrbahn. „nein“ nur, wenn keine dieser Straßen in diesen Abständen liegt und auch keine Zufahrt – auch nicht über einen Privatweg – zu ihr führt.',
  },

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
  'planung.befreiung': {
    titel: 'Vorhaben hält eine Festsetzung des Bebauungsplans nicht ein oder ist dort nur ausnahmsweise zulässig',
    gruppe: 'planung',
    typ: 'janein',
    frage: 'Hält das Vorhaben eine Festsetzung des Bebauungsplans nicht ein, oder ist die geplante Nutzung dort nur ausnahmsweise zulässig?',
    hilfe:
      'Festsetzungen sind z. B. die Art der Nutzung, die Zahl der Geschosse oder die Höhe, die überbaubare Fläche (Baugrenzen, Baulinien), die Grund- und Geschossfläche im Verhältnis zum Grundstück (GRZ, GFZ) und die Bauweise. Ja zum Beispiel: ein Geschoss mehr als festgesetzt; ein Anbau ragt über die Baugrenze; Wohnungen in einem Gewerbegebiet; ein Gartenbaubetrieb im allgemeinen Wohngebiet, den der Plan nur ausnahmsweise zulässt. Nein, wenn das Vorhaben alle Festsetzungen einhält und dort allgemein zulässig ist. Vorgaben zu Dachform, Material oder Gestaltung zählen hier nicht: Das sind örtliche Bauvorschriften – dafür gibt es die Frage nach einer Abweichung von örtlichen Bauvorschriften. Für Ausnahme oder Befreiung gilt § 31 BauGB; für den Wohnungsbau kommt auch die Sonderregelung nach § 246e BauGB in Betracht.',
  },
  'planung.abweichung_umgebung': {
    titel: 'Für das Vorhaben fehlt ein Vorbild in der näheren Umgebung',
    gruppe: 'planung',
    typ: 'janein',
    frage: 'Fehlt für das Vorhaben ein Vorbild in der näheren Umgebung – gibt es dort nichts Vergleichbares in der Nutzung, der Höhe bzw. Zahl der Geschosse, der Grundfläche, der Lage auf dem Grundstück oder der Bauweise?',
    hilfe:
      'Gemeint ist, was in der näheren Umgebung schon steht. Ja zum Beispiel: ein viergeschossiges Haus zwischen zweigeschossigen; ein Wohnhaus im rückwärtigen Garten, wo bisher nur an der Straße gebaut ist („zweite Reihe“); Wohnungen, wo ringsum nur Gewerbe ist – auch, wenn nur ein einziges Merkmal ohne Vorbild ist oder das Vorhaben das Ortsbild stören könnte. Nein nur, wenn es für Nutzung, Höhe, Grundfläche, Lage und Bauweise jeweils vergleichbare Gebäude in der näheren Umgebung gibt. Im Zweifel offen lassen und mit der Bauaufsicht klären. Maßgeblich: § 34 und § 246e BauGB.',
    wenn: INNEN_34,
  },
  'planung.anschluss_ortslage': {
    titel: 'Grundstück nahe der zusammenhängenden Bebauung des Ortes oder eines Bebauungsplangebiets',
    gruppe: 'planung',
    typ: 'janein',
    frage: 'Liegt das Grundstück nahe an der zusammenhängenden Bebauung des Ortes oder an einem Gebiet mit (qualifiziertem bzw. vorhabenbezogenem) Bebauungsplan – etwa bis 100 m entfernt, auch wenn ein Feld, eine Straße oder ein Weg dazwischen liegt?',
    hilfe:
      'Ja, wenn das Grundstück an bebaute Grundstücke des Ortes oder an ein Plangebiet anschließt oder nur durch ein Feld, eine Straße oder einen Weg davon getrennt ist. Nein, wenn es klar abgesetzt in der freien Landschaft liegt (deutlich weiter als etwa 100 m) oder nur an einzelne Höfe bzw. eine Splittersiedlung grenzt. Im Zweifel offen lassen – es kommt auf den Einzelfall an. Maßgeblich: § 246e Abs. 3 BauGB.',
    wenn: AUSSEN_35,
  },
  'planung.abweichung': j('Abweichung von Anforderungen der Bauordnung beabsichtigt', 'planung', '§ 69 BauO NRW'),
  'planung.wohnungsbau_246e': {
    titel: 'Sonderregelung für den Wohnungsbau kommt in Betracht (§ 246e BauGB)',
    gruppe: 'planung',
    typ: 'janein',
    frage: 'Frühere Angabe: Soll zugunsten des Wohnungsbaus vom Planungsrecht abgewichen werden (§ 246e BauGB)?',
    hilfe:
      'Diese Frage stellt LEXIO nicht mehr: Ob die Sonderregelung in Betracht kommt, ergibt sich aus den Angaben zu neuen Wohnungen und zur Abweichung vom Bebauungsplan bzw. von der Umgebung (im Außenbereich: Zusammenhang mit der Ortslage). Die Antwort aus der älteren Datei gilt, bis diese Angaben vorliegen; ergeben sie etwas anderes, steht hier ein Hinweis.',
    ersetzt: true,
  },
  'vorhaben.wohnraum_neu': {
    titel: 'Durch das Vorhaben entstehen neue Wohnungen oder Wohnräume, oder Wohnraum wird wieder nutzbar',
    gruppe: 'vorhaben',
    typ: 'janein',
    frage: 'Entstehen durch das Vorhaben neue Wohnungen oder Wohnräume (auch Zimmer in einem Wohnheim, Appartements), oder wird leerstehender, bisher nicht bewohnbarer Wohnraum wieder nutzbar?',
    hilfe:
      'Ja zum Beispiel: Neubau eines Wohnhauses oder eines Studenten- bzw. Seniorenwohnheims; Anbau, Aufstockung oder Dachausbau mit zusätzlicher Wohnung; Büro, Laden, Scheune oder Halle wird zu Wohnungen umgebaut; eine unbewohnbare Wohnung wird wieder hergerichtet; auch ein Neubau mit Wohnungen und Läden oder Büros. Nein zum Beispiel: Umbau, Anbau oder Wintergarten ohne zusätzliche Wohnung; Garage oder Carport; Gewerbe- oder Bürobau ohne Wohnungen. Daran hängt unter anderem die Sonderregelung für den Wohnungsbau (§ 246e BauGB) – ob sie bei gemischt genutzten Gebäuden das ganze Gebäude erfasst, klärt die Gemeinde.',
  },


  /* ---------- Vorhaben ---------- */
  'vorhaben.dach_fassade': j('Arbeiten an Dach oder Fassade (Artenschutz: Quartiere von Fledermäusen und Gebäudebrütern)', 'vorhaben'),
  'vorhaben.dachhaut': j('Vollständige Erneuerung der Dachhaut', 'vorhaben', '§ 42a Abs. 3 BauO NRW'),
  'vorhaben.erdarbeiten': j('Erdarbeiten (Aushub, Aufschüttung oder Abtrag, Unterkellerung, Gründung, Leitungen)', 'vorhaben'),
  'vorhaben.boden_800': j('Mehr als 800 m³ Bodenmaterial auf- oder eingebracht', 'vorhaben', '§ 2 Abs. 2 LBodSchG'),
  'vorhaben.baeume_faellen': j('Bäume fällen oder Gehölze roden', 'vorhaben'),
  'vorhaben.werbeanlage': j('Werbeanlage', 'vorhaben'),
  'vorhaben.baustelle_oeffentlich': j('Gerüst oder Baustelleneinrichtung im öffentlichen Straßenraum', 'vorhaben'),
  'vorhaben.entwaesserung': j('Neuer Anschluss oder Änderung der Grundstücksentwässerung', 'vorhaben'),
  'vorhaben.versickerung': j('Niederschlagswasser soll versickert oder eingeleitet werden', 'vorhaben'),
  // Eigenschaft des Grundstücks (an die Lage gebunden), nicht des Vorhabens
  'vorhaben.erstbebauung': j('Grundstück wird erstmals bebaut (nach dem 01.01.1996)', 'grundstueck', '§ 44 LWG / § 55 Abs. 2 WHG'),
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
  'gebaeude.stellplaetze': z('Kfz-Stellplätze im oder am Gebäude', 'gebaeude', 'Stellplätze', 'für die Ladeinfrastruktur nach GEIG'),

  /* ---------- Technik ---------- */
  'technik.feuerstaette': j('Feuerstätte (Heizung mit Verbrennung, Kamin)', 'technik'),
  'technik.waermepumpe': j('Wärmepumpe oder Blockheizkraftwerk', 'technik'),
  'technik.brennstofflager': j('Lagerung von Brennstoffen (Heizöl, Pellets, Flüssiggas)', 'technik'),
  'technik.batteriespeicher': j('Batteriespeicher oder elektrischer Betriebsraum', 'technik'),

  /* ---------- Antrag ---------- */
  'antrag.einreichung': { titel: 'Geplantes Einreichungsdatum', gruppe: 'antrag', typ: 'text' },
};

/**
 * Einzelfragen des Katalogs zu den Vorfragen: Bei „nein“ in der Vorfrage gilt der Wert (hier überall „nein“). Module, die
 * eine dieser Angaben neu fassen (z. B. mit Geodienst), nennen die Vorfrage dort ebenfalls
 */
const VORFRAGE: Record<string, string> = {
  'schutz.ffh': 'vorfrage.natura2000',
  'schutz.vsg': 'vorfrage.natura2000',
  'schutz.natura_nah': 'vorfrage.natura2000',
  'schutz.nsg': 'vorfrage.naturschutz',
  'schutz.lsg': 'vorfrage.naturschutz',
  'schutz.biotop': 'vorfrage.naturschutz',
  'schutz.wsg': 'vorfrage.wasser',
  'schutz.uesg': 'vorfrage.wasser',
  'schutz.risikogebiet': 'vorfrage.wasser',
  'schutz.denkmal': 'vorfrage.denkmal',
  'schutz.denkmal_umgebung': 'vorfrage.denkmal',
  'schutz.denkmalbereich': 'vorfrage.denkmal',
  'schutz.bodendenkmal': 'vorfrage.denkmal',
  'schutz.baum': 'vorfrage.gehoelze',
  'vorhaben.baeume_faellen': 'vorfrage.gehoelze',
  'lage.strasse_ausserorts': 'vorfrage.strasse',
};

/** Einzelfragen zu anderen Angaben des Katalogs (Teilmenge: ohne die Arbeiten selbst gibt es auch das Besondere nicht) */
const VORFRAGE_SONST: Record<string, { fakt: string; sonst: string | number | boolean }> = {
  // die vollständige Erneuerung der Dachhaut ist eine Arbeit am Dach
  'vorhaben.dachhaut': { fakt: 'vorhaben.dach_fassade', sonst: false },
  // Bodenmaterial auf- oder einbringen ist eine Erdarbeit (Aufschüttung)
  'vorhaben.boden_800': { fakt: 'vorhaben.erdarbeiten', sonst: false },
};

const WOHNGEBAEUDE = { m: 'Gebäudeart', in: ['Einfamilienhaus', 'Zweifamilienhaus', 'Mehrfamilienhaus'] };
/** reines Wohngebäude, nicht bei einer Nutzungsänderung (dort könnte ein Teil zu Gästezimmern, Laden o. Ä. werden, ohne dass die Gebäudeart angepasst ist) */
const WOHNGEBAEUDE_BLEIBT = { und: [WOHNGEBAEUDE, { m: 'Vorhaben', nicht: ['Nutzungsänderung'] }] };
const KEIN_GEBAEUDE = { m: 'Gebäudeart', in: ['kein Gebäude'] };
/* § 246e BauGB: neue Wohnungen (Abs. 1 Nr. 1–3) und eine Abweichung vom Planungsrecht – je nach Lage vom Bebauungsplan
   (§ 30), vom Rahmen der Umgebung (§ 34) oder im Außenbereich nur mit Zusammenhang zur Ortslage bzw. einem Plangebiet (Abs. 3) */
const WOHNRAUM_NEU = FAKT('vorhaben.wohnraum_neu', true);
/* „keine Abweichung nötig“ nur ohne Veränderungssperre, Erhaltungssatzung (auch in Aufstellung) und Sanierungsgebiet:
   auch von diesen Vorschriften des BauGB kann § 246e befreien (offen gilt als „vielleicht“ – dann folgt nichts) */
const KEINE_SPERRE = { und: ['planung.veraenderungssperre', 'planung.erhaltungssatzung', 'planung.erhaltungssatzung_aufstellung', 'planung.sanierungsgebiet'].map((f) => ({ nicht: FAKT(f, true) })) };
/**
 * Werte, die sich zwingend aus anderen Angaben ergeben (FaktDef.folgt) – die Frage entfällt, eine abweichende Antwort
 * wird zum Widerspruch bzw. überstimmt nur mit Beleg. Ein reines Wohngebäude (Ein-, Zwei-, Mehrfamilienhaus) hat keine
 * andere Nutzung: Läden, Praxen, Gästezimmer, Versammlungsräume machen es zum „Wohn- und Geschäftshaus“ (Merkmal).
 * Bewusst nicht: Stellplätze nach GEIG und Garagen-Nutzfläche (auch vorhandene, dem Neubau zugeordnete zählen),
 * Behelfsbau (Wohncontainer können einer sein, § 51 BauO NRW), gemischte Nutzung beim Mehrfamilienhaus (Fachreview Runde 3).
 */
const FOLGT: Record<string, NonNullable<FaktDef['folgt']>> = {
  // ein neues Gebäude mit Wohnungen schafft neue Wohnungen (§ 246e Abs. 1 Nr. 1); nicht bei der Nutzungsänderung (sie kann
  // auch innerhalb eines Wohngebäudes liegen, z. B. Keller zu Hobbyraum) und nicht bei Nichtwohngebäuden (Betriebswohnung)
  'vorhaben.wohnraum_neu': [
    { wenn: { und: [{ m: 'Vorhaben', in: ['Errichtung'] }, { m: 'Gebäudeart', in: ['Einfamilienhaus', 'Zweifamilienhaus', 'Mehrfamilienhaus', 'Wohn- und Geschäftshaus'] }] }, wert: true, grund: 'Neubau eines Gebäudes mit Wohnungen' },
    { wenn: KEIN_GEBAEUDE, wert: false, grund: 'kein Gebäude – es entstehen keine Wohnungen' },
  ],
  // Sonderregelung für den Wohnungsbau: kommt in Betracht bei neuen Wohnungen und einer Abweichung vom Planungsrecht; nicht
  // ohne neue Wohnungen, ohne Abweichung bzw. im Außenbereich ohne Zusammenhang mit der Ortslage. „Satzung nach BauGB“ und
  // der einfache Bebauungsplan: Bebauungsplan und Umgebung zugleich maßgeblich – „keine Abweichung“ nur, wenn beides nein
  'planung.wohnungsbau_246e': [
    { wenn: FAKT('vorhaben.wohnraum_neu', false), wert: false, grund: 'es entstehen keine neuen Wohnungen bzw. Wohnräume und kein wieder nutzbarer Wohnraum – die Sonderregelung gilt nur für den Wohnungsbau' },
    { wenn: { und: [AUSSEN_35, FAKT('planung.anschluss_ortslage', false)] }, wert: false, grund: 'Außenbereich ohne räumlichen Zusammenhang mit der Ortslage oder einem Bebauungsplangebiet (§ 246e Abs. 3)' },
    { wenn: { und: [PR('Bebauungsplan'), FAKT('planung.befreiung', false), KEINE_SPERRE] }, wert: false, grund: 'das Vorhaben hält den Bebauungsplan ein, und keine Sperre oder Satzung steht entgegen – eine Abweichung ist nicht nötig' },
    { wenn: { und: [PR('Innenbereich'), FAKT('planung.abweichung_umgebung', false), KEINE_SPERRE] }, wert: false, grund: 'das Vorhaben hat Vorbilder in der Umgebung, und keine Sperre oder Satzung steht entgegen – eine Abweichung ist nicht nötig' },
    { wenn: { und: [MIT_UND_OHNE_PLAN, FAKT('planung.innen', true), FAKT('planung.befreiung', false), FAKT('planung.abweichung_umgebung', false), KEINE_SPERRE] }, wert: false, grund: 'das Vorhaben hält den Bebauungsplan ein, hat Vorbilder in der Umgebung, und keine Sperre oder Satzung steht entgegen – eine Abweichung ist nicht nötig' },
    { wenn: { und: [WOHNRAUM_NEU, PR('Bebauungsplan', 'einfacher Bebauungsplan', 'Satzung nach BauGB'), FAKT('planung.befreiung', true)] }, wert: true, grund: 'es entstehen neue Wohnungen, und das Vorhaben weicht vom Bebauungsplan ab' },
    { wenn: { und: [WOHNRAUM_NEU, INNEN_34, FAKT('planung.abweichung_umgebung', true)] }, wert: true, grund: 'es entstehen neue Wohnungen, und für das Vorhaben fehlt ein Vorbild in der Umgebung' },
    { wenn: { und: [WOHNRAUM_NEU, AUSSEN_35, FAKT('planung.anschluss_ortslage', true)] }, wert: true, grund: 'es entstehen neue Wohnungen im Außenbereich, im Zusammenhang mit der Ortslage bzw. einem Bebauungsplangebiet' },
  ],
  // nicht bei „kein Gebäude“: Versammlungsstätten im Freien (Freilichtbühne, Stadion) sind bauliche Anlagen ohne Gebäude
  'gebaeude.besucher': [{ wenn: WOHNGEBAEUDE_BLEIBT, wert: 0, grund: 'reines Wohngebäude – keine Versammlungsstätte' }],
  'gebaeude.verkaufsflaeche': [{ wenn: WOHNGEBAEUDE_BLEIBT, wert: 0, grund: 'reines Wohngebäude – keine Verkaufsstätte' }],
  // Ferienwohnungen können im Einzelfall Beherbergung sein (§ 13a Satz 2 BauNVO): nur ohne sie
  'gebaeude.gastbetten': [{ wenn: { und: [WOHNGEBAEUDE_BLEIBT, { f: 'vorhaben.ferienwohnung', ist: false }] }, wert: 0, grund: 'reines Wohngebäude ohne Ferienwohnungen – keine Beherbergung' }],
  'gebaeude.wohnungen': [
    { wenn: { m: 'Gebäudeart', in: ['Einfamilienhaus'] }, wert: 1, grund: 'Einfamilienhaus – eine Wohnung' },
    { wenn: { m: 'Gebäudeart', in: ['Zweifamilienhaus'] }, wert: 2, grund: 'Zweifamilienhaus – zwei Wohnungen' },
    { wenn: KEIN_GEBAEUDE, wert: 0, grund: 'kein Gebäude – keine Wohnungen' },
  ],
  // eine Wohnung bzw. zwei; Räume für freie Berufe (§ 13 BauNVO) können eine eigene Nutzungseinheit sein – nur ohne sie
  'gebaeude.nutzungseinheiten': [
    { wenn: { und: [{ m: 'Gebäudeart', in: ['Einfamilienhaus'] }, { f: 'vorhaben.freiberuflich', ist: false }] }, wert: 1, grund: 'Einfamilienhaus ohne Räume für freie Berufe – eine Nutzungseinheit' },
    { wenn: { und: [{ m: 'Gebäudeart', in: ['Zweifamilienhaus'] }, { f: 'vorhaben.freiberuflich', ist: false }] }, wert: 2, grund: 'Zweifamilienhaus ohne Räume für freie Berufe – zwei Nutzungseinheiten' },
  ],
  // Wohnungen haben Aufenthaltsräume (§ 2 Abs. 5 BauO NRW: Wohn- und Schlafräume)
  'gebaeude.aufenthaltsraeume': [
    { wenn: { m: 'Gebäudeart', in: ['Einfamilienhaus', 'Zweifamilienhaus', 'Mehrfamilienhaus', 'Wohn- und Geschäftshaus'] }, wert: true, grund: 'Gebäude mit Wohnungen – Wohnräume sind Aufenthaltsräume' },
    { wenn: KEIN_GEBAEUDE, wert: false, grund: 'kein Gebäude – keine Aufenthaltsräume' },
  ],
  // bauordnungsrechtliche Nutzung (das Betriebsleiter- oder Altenteilerwohnhaus nach § 35 Abs. 1 Nr. 1 BauGB bleibt davon
  // unberührt); „ja“ wäre milder
  'gebaeude.landwirtschaft': [{ wenn: WOHNGEBAEUDE, wert: false, grund: 'Wohngebäude – kein land- oder forstwirtschaftlich genutztes Gebäude' }],
  // das GEG (§ 2 Abs. 1) setzt ein Gebäude voraus
  'gebaeude.beheizt': [{ wenn: KEIN_GEBAEUDE, wert: false, grund: 'kein Gebäude – das GEG gilt nur für Gebäude' }],
};

export const FAKTEN: Record<string, FaktDef> = Object.fromEntries(
  Object.entries(KATALOG).map(([id, d]) => [
    id,
    { ...d, ...(KURZ[id] ? { kurz: KURZ[id] } : {}), ...(VORFRAGE[id] ? { vorfrage: { fakt: VORFRAGE[id], sonst: false } } : VORFRAGE_SONST[id] ? { vorfrage: VORFRAGE_SONST[id] } : {}), ...(FOLGT[id] ? { folgt: FOLGT[id] } : {}) },
  ]),
);

/** Merkmale aus Formulare (Antragsmerkmale) – Titel für die Anzeige */
export const MERKMAL_TITEL: Record<string, string> = {
  Gebäudeklasse: 'Gebäudeklasse',
  Sonderbau: 'Sonderbau',
  Verfahren: 'Verfahren',
  Gebäudeart: 'Gebäudeart',
  Vorhaben: 'Art des Vorhabens',
  Planungsrecht: 'Planungsrecht',
};
