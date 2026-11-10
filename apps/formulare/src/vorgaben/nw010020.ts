/**
 * Statistik der Baugenehmigungen (Hochbaustatistikgesetz, IT.NRW), Erhebungsbogen BG Version 1.2, Stand 2025. Wird
 * mit dem Bauantrag bzw. der Genehmigungsfreistellung eingereicht (Anlage I/1 bis I/3 VV BauPrüfVO: „Erhebungsbogen
 * für die Baustatistik“). Seite 3 ist der Baufertigstellungsbogen – erst nach der Bezugsfertigstellung, zählt hier nicht.
 *
 * Was der Vordruck selbst sagt (Randleisten und Hinweise):
 * - Kennnummern (Identifikationsnummer, Bauscheinnummer/Aktenzeichen, Straßenschlüssel) und das Datum der
 *   Baugenehmigung bzw. Genehmigungsfreistellung trägt die Behörde ein – zählen nicht.
 * - „Ansprechperson für Rückfragen (freiwillige Angabe)“ – zählt nicht; „Sonstige landesrechtliche Angaben“ ebenso
 *   (NRW verlangt keine).
 * - Nr. 2: Neubau (konventionell/Fertigteilbau) oder Baumaßnahme an bestehendem Gebäude. „Bei Baumaßnahme an
 *   bestehendem Gebäude“: Änderung des Nutzungsschwerpunkts ja/nein; „Falls ‚Ja‘“ frühere Nutzung und Abgangsbogen.
 *   „Bei Wiederaufbau, Ersatzbau, Wiederherstellung“: Jahr des Abbruchs (freiwillig, da das Formular den Fall nicht
 *   abfragt); der Abgangsbogen dazu nur, wenn das Jahr angegeben ist.
 * - Nr. 3 „Bei allen Baumaßnahmen“: Bauherr und Gebäudeart. „Nur bei Errichtung eines neuen Gebäudes“: Haustyp (nur
 *   beim Wohngebäude, „Haustyp des Wohngebäudes“), Baustoff, Beheizung und die ganze linke Spalte von Seite 2
 *   (Energie – „jeweils eine Position“, Lüftung, Kühlung, Erfüllung des GEG – mehrfach, mindestens eine).
 *   „Falls ‚Sonstige Energie …‘ / ‚Sonstiges‘“: Erläuterung nur dann.
 * - Nr. 4: Rauminhalt „Nur Neubau“; sonst „Bei allen Baumaßnahmen – bei Neubau ist nur der neue Zustand
 *   auszufüllen“: alter Zustand nur bei Baumaßnahme an bestehendem Gebäude. Nutzfläche beim Nichtwohngebäude,
 *   Wohnfläche und Wohnungen beim Wohngebäude/Wohnheim (Gebäudeart in Nr. 3). Räume in Wohnungen mit 7 oder mehr
 *   Räumen nur, wenn es solche Wohnungen gibt.
 * Neubau/Baumaßnahme und Gebäudeart werden aus den Kästchen des Bogens selbst gelesen (nicht aus den Merkmalen).
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { baufertigstellung, eineAngabe, kopfBauherr, memos, zifferTitel } from './statistik';
import { angekreuzt, fuer, gruppeV, oder, s, und, wenn, zaehltNicht } from './hilfen';

const s0 = s(0);
const s1 = s(1);

// Nr. 2 Art der Bautätigkeit
const neubau = oder(angekreuzt('0:CheckBox5'), angekreuzt('0:CheckBox6'));
const bestand = wenn(angekreuzt('0:CheckBox7'));
// Nr. 3 Gebäudeart: Wohngebäude ohne/mit Eigentumswohnungen, Wohnheim – Nichtwohngebäude (Nutzungsart angegeben)
const wohn = oder(angekreuzt('0:CheckBox22'), angekreuzt('0:CheckBox23'), angekreuzt('0:CheckBox24'));
const nichtwohn = wenn(angekreuzt('0:Memo50'));

const ENERGIE = [
  'Keine',
  'Öl',
  'Gas',
  'Strom',
  'Fernwärme/Fernkälte',
  'Geothermie',
  'Umweltthermie (Luft/Wasser)',
  'Solarthermie',
  'Holz',
  'Biogas/Biomethan',
  'Sonstige Biomasse',
  'Sonstige Energie',
];
const PRIMAER = ['00', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const SEKUNDAER = ['00', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23'];
/** Kästchen der vier Spalten „Verwendete Energie“ in der Reihenfolge von ENERGIE */
const heizungPrimaer = s1('CheckBox1', 'CheckBox2', 'CheckBox3', 'CheckBox4', 'CheckBox5', 'CheckBox6', 'CheckBox7', 'CheckBox8', 'CheckBox9', 'CheckBox14', 'CheckBox10', 'CheckBox11');
const heizungSekundaer = s1('CheckBox12', 'CheckBox13', 'CheckBox15', 'CheckBox16', 'CheckBox17', 'CheckBox18', 'CheckBox19', 'CheckBox20', 'CheckBox21', 'CheckBox22', 'CheckBox23', 'CheckBox24');
const wasserPrimaer = s1(...Array.from({ length: 12 }, (_, i) => `CheckBox${25 + i}`));
const wasserSekundaer = s1(...Array.from({ length: 12 }, (_, i) => `CheckBox${37 + i}`));
const energieTitel = (felder: string[], spalte: string, nummern: string[]) => Object.fromEntries(felder.map((f, i) => [f, `${spalte}: ${ENERGIE[i]} (${nummern[i]})`]));

/** Nr. 4 Wohnungen nach Zahl der Räume: [Nummer, Text, erstes Memo] – je drei Ziffernkästchen */
const RAEUME_NEU: [string, string, number][] = [
  ['07', '1 Raum', 38],
  ['08', '2 Räumen', 44],
  ['09', '3 Räumen', 50],
  ['10', '4 Räumen', 56],
  ['11', '5 Räumen', 62],
  ['12', '6 Räumen', 68],
  ['13', '7 Räumen oder mehr', 74],
];
const RAEUME_ALT: [string, string, number][] = [
  ['15', '1 Raum', 41],
  ['16', '2 Räumen', 47],
  ['17', '3 Räumen', 53],
  ['18', '4 Räumen', 59],
  ['19', '5 Räumen', 65],
  ['20', '6 Räumen', 71],
  ['21', '7 Räumen oder mehr', 77],
];
const drei = (n: number) => s1(...memos(n, n + 2));

/** Anzahl der Wohnungen (neuer bzw. alter Zustand): eine Gruppe mit einer Untergruppe je Zeile */
function wohnungen(id: string, zustand: string, zeilen: [string, string, number][], bedingung: ReturnType<typeof wenn>): Partial<FormularProfil> {
  return {
    feldTitel: Object.assign({}, ...zeilen.map(([nr, text, n]) => zifferTitel(drei(n), `Wohnungen mit ${text}, ${zustand} (${nr})`))),
    gruppen: [
      gruppeV(id, `Anzahl der Wohnungen nach Zahl der Räume, ${zustand}`, 'eins', [], { bedingung }),
      ...zeilen.map(([nr, text, n]) => gruppeV(`${id}-${nr}`, `Wohnungen mit ${text}, ${zustand} (${nr})`, 'eins', drei(n), { in: `v:${id}` })),
    ],
  };
}

const rauminhalt = s1('Memo0', ...memos(5, 10));
const vollgeschosse = s1(...memos(12, 14));
const nutzNeu = s1('Memo11', ...memos(15, 19));
const nutzAlt = s1(...memos(20, 25));
const wohnflNeu = s1(...memos(26, 31));
const wohnflAlt = s1(...memos(32, 37));
const raeume7Neu = drei(80);
const raeume7Alt = drei(83);
const kosten = s1(...memos(86, 94));
const strassenschluessel = s1(...memos(95, 112));
const abbruchJahr = s0(...memos(46, 49));

export const nw010020_2025F: FormularProfil = zusammen(
  kopfBauherr(0),
  {
    abschnitte: {
      '0:Panel1': { titel: '1 Allgemeine Angaben (Bauherr/Bauherrin, Baugrundstück)' },
      '0:Panel5': { titel: 'Kenntnisgabe/Genehmigungsfreistellung, landesrechtliche Angaben, Ansprechperson' },
      '0:Panel4': { titel: 'Lage des Baugrundstücks, Datum der Baugenehmigung' },
      '1:Panel6': { titel: 'Identifikationsnummer (trägt die Behörde ein)' },
      '1:Panel2': { titel: 'noch 3: Verwendete Energie, Lüftung, Kühlung, Erfüllung des GEG (nur Neubau)', bedingung: neubau },
    },
    feldTitel: {
      '0:CheckBox1': 'Kenntnisgabe, Anzeige bzw. Genehmigungsfreistellung nach Landesrecht: ja',
      '0:CheckBox2': 'Kenntnisgabe, Anzeige bzw. Genehmigungsfreistellung nach Landesrecht: nein',
      '0:Memo37': 'Sonstige landesrechtliche Angaben',
      '0:Memo51': 'Ansprechperson für Rückfragen: Name (freiwillig)',
      '0:Memo52': 'Ansprechperson für Rückfragen: Telefon und/oder E-Mail (freiwillig)',
      // Nr. 2
      '0:CheckBox5': 'Neubau, überwiegend in konventioneller Bauart',
      '0:CheckBox6': 'Neubau, überwiegend im Fertigteilbau (auch serielles/modulares Bauen)',
      '0:CheckBox7': 'Baumaßnahme an bestehendem Gebäude',
      '0:CheckBox8': 'Nutzungsschwerpunkt ändert sich zwischen Wohnbau und Nichtwohnbau: ja',
      '0:CheckBox9': 'Nutzungsschwerpunkt ändert sich zwischen Wohnbau und Nichtwohnbau: nein',
      '0:Memo45': 'Frühere Nutzung (bei Änderung des Nutzungsschwerpunkts)',
      '0:CheckBox10': 'Änderung des Nutzungsschwerpunkts: Abgangsbogen ausgestellt: ja',
      '0:CheckBox11': 'Änderung des Nutzungsschwerpunkts: Abgangsbogen ausgestellt: nein',
      ...zifferTitel(abbruchJahr, 'Wiederaufbau/Ersatzbau: Jahr des Abbruchs bzw. der Zerstörung'),
      '0:CheckBox12': 'Wiederaufbau/Ersatzbau: Abgangsbogen ausgestellt: ja',
      '0:CheckBox13': 'Wiederaufbau/Ersatzbau: Abgangsbogen ausgestellt: nein',
      // Nr. 3
      '0:CheckBox15': 'Bauherr: Öffentlicher Bauherr (1)',
      '0:CheckBox14': 'Bauherr: Wohnungsunternehmen (2)',
      '0:CheckBox16': 'Bauherr: Immobilienfonds (3)',
      '0:CheckBox17': 'Bauherr: Land- und Forstwirtschaft, Tierhaltung, Fischerei (4)',
      '0:CheckBox18': 'Bauherr: Produzierendes Gewerbe (5)',
      '0:CheckBox19': 'Bauherr: Handel, Kreditinstitute, Versicherungen, Dienstleistungen, Verkehr, Nachrichtenübermittlung (6)',
      '0:CheckBox20': 'Bauherr: Privater Haushalt (7)',
      '0:CheckBox21': 'Bauherr: Organisation ohne Erwerbszweck (8)',
      '0:CheckBox22': 'Wohngebäude ohne Eigentumswohnungen (1)',
      '0:CheckBox23': 'Wohngebäude mit Eigentumswohnungen (2)',
      '0:CheckBox24': 'Wohnheim (3)',
      '0:Memo50': 'Nichtwohngebäude: Nutzungsart',
      '0:CheckBox25': 'Haustyp: Einzelhaus (1)',
      '0:CheckBox26': 'Haustyp: Doppelhaushälfte (2)',
      '0:CheckBox27': 'Haustyp: Gereihtes Haus (3)',
      '0:CheckBox28': 'Haustyp: Sonstiger Haustyp (4)',
      '0:CheckBox29': 'Baustoff/Tragkonstruktion: Ziegel (1)',
      '0:CheckBox30': 'Baustoff/Tragkonstruktion: Kalksandstein (2)',
      '0:CheckBox31': 'Baustoff/Tragkonstruktion: Porenbeton (3)',
      '0:CheckBox32': 'Baustoff/Tragkonstruktion: Leichtbeton/Bims (4)',
      '0:CheckBox33': 'Baustoff/Tragkonstruktion: Stahl (5)',
      '0:CheckBox34': 'Baustoff/Tragkonstruktion: Stahlbeton (6)',
      '0:CheckBox35': 'Baustoff/Tragkonstruktion: Holz (7)',
      '0:CheckBox36': 'Baustoff/Tragkonstruktion: Sonstiges (8)',
      '0:CheckBox37': 'Beheizung: Fernheizung (1)',
      '0:CheckBox38': 'Beheizung: Blockheizung (2)',
      '0:CheckBox39': 'Beheizung: Zentralheizung (3)',
      '0:CheckBox40': 'Beheizung: Etagenheizung (4)',
      '0:CheckBox41': 'Beheizung: Einzelraumheizung (5)',
      '0:CheckBox42': 'Beheizung: Keine Heizung (6)',
      // Seite 2
      '1:Memo1': 'Identifikationsnummer (Seite 2, trägt die Behörde ein)',
      ...energieTitel(heizungPrimaer, 'Energie für Heizung, primär', PRIMAER),
      ...energieTitel(heizungSekundaer, 'Energie für Heizung, sekundär', SEKUNDAER),
      ...energieTitel(wasserPrimaer, 'Energie für Warmwasserbereitung, primär', PRIMAER),
      ...energieTitel(wasserSekundaer, 'Energie für Warmwasserbereitung, sekundär', SEKUNDAER),
      '1:Memo2': 'Erläuterung „Sonstige Energie“ für Heizung',
      '1:Memo3': 'Erläuterung „Sonstige Energie“ für Warmwasserbereitung',
      '1:CheckBox49': 'Lüftung: mit Wärmerückgewinnung (1)',
      '1:CheckBox50': 'Lüftung: ohne Wärmerückgewinnung (2)',
      '1:CheckBox51': 'Lüftung: keine Nutzung (3)',
      '1:CheckBox52': 'Kühlung: elektrisch (1)',
      '1:CheckBox53': 'Kühlung: thermisch (2)',
      '1:CheckBox54': 'Kühlung: keine Nutzung (3)',
      '1:CheckBox55': 'GEG: Erneuerbare Energie – Holz, Bioöl, Biogas, Biomethan (01)',
      '1:CheckBox56': 'GEG: Erneuerbare Energie – Sonstige, z. B. Wärmepumpe, Umwelt-, Geo-, Solarthermie (02)',
      '1:CheckBox57': 'GEG: Kraft-Wärme-Kopplung, § 71 (04)',
      '1:CheckBox58': 'GEG: Wärmerückgewinnung, § 68 (05)',
      '1:CheckBox59': 'GEG: Sonstige Abwärme, § 71 (06)',
      '1:CheckBox60': 'GEG: Fernwärme, § 71 (08)',
      '1:CheckBox63': 'GEG: Gemeinschaftliche Wärmeversorgung, § 107 (09)',
      '1:CheckBox64': 'GEG: Befreiung, § 102 (11)',
      '1:CheckBox66': 'GEG: Sonstiges (12)',
      '1:Memo4': 'Erläuterung „Sonstiges“ zur Erfüllung des GEG',
      ...zifferTitel(rauminhalt, 'Rauminhalt brutto in m³, DIN 277 (01)'),
      ...zifferTitel(vollgeschosse, 'Anzahl der Vollgeschosse (02)'),
      ...zifferTitel(nutzNeu, 'Nutzfläche in m², neuer Zustand (03)'),
      ...zifferTitel(nutzAlt, 'Nutzfläche in m², alter Zustand (05)'),
      ...zifferTitel(wohnflNeu, 'Wohnfläche in m², neuer Zustand (04)'),
      ...zifferTitel(wohnflAlt, 'Wohnfläche in m², alter Zustand (06)'),
      ...zifferTitel(raeume7Neu, 'Räume in Wohnungen mit 7 oder mehr Räumen, neuer Zustand (14)'),
      ...zifferTitel(raeume7Alt, 'Räume in Wohnungen mit 7 oder mehr Räumen, alter Zustand (22)'),
      ...zifferTitel(kosten, 'Veranschlagte Kosten in 1 000 Euro (23)'),
      ...zifferTitel(strassenschluessel, 'Straßenschlüssel (24, trägt die Behörde ein)'),
    },
    zaehlt: zaehltNicht(
      // Datum der Baugenehmigung/Genehmigungsfreistellung kennt erst die Behörde
      ...s0(...memos(31, 36)),
      '0:Memo37',
      '0:Memo51',
      '0:Memo52',
      '1:Memo1',
      ...strassenschluessel,
    ),
    gruppen: [
      gruppeV('landesrecht', 'Kenntnisgabe, Anzeige bzw. Genehmigungsfreistellung nach Landesrecht: ja oder nein', 'eins', s0('CheckBox1', 'CheckBox2')),
      gruppeV('bautaetigkeit', 'Art der Bautätigkeit: Neubau (konventionell, Fertigteilbau) oder Baumaßnahme an bestehendem Gebäude', 'eins', s0('CheckBox5', 'CheckBox6', 'CheckBox7')),
      gruppeV('nutzungsschwerpunkt', 'Änderung des Nutzungsschwerpunkts: ja oder nein', 'eins', s0('CheckBox8', 'CheckBox9'), { bedingung: bestand }),
      gruppeV('abgang-nutzung', 'Änderung des Nutzungsschwerpunkts: Abgangsbogen ausgestellt?', 'eins', s0('CheckBox10', 'CheckBox11'), { bedingung: wenn(angekreuzt('0:CheckBox8')) }),
      gruppeV('abbruchjahr', 'Wiederaufbau/Ersatzbau: Jahr des Abbruchs bzw. der Zerstörung', 'nie', abbruchJahr),
      gruppeV('abgang-wiederaufbau', 'Wiederaufbau/Ersatzbau: Abgangsbogen ausgestellt?', 'eins', s0('CheckBox12', 'CheckBox13'), { bedingung: oder(...eineAngabe(abbruchJahr)) }),
      gruppeV('bauherr', 'Bauherr (Art)', 'eins', s0('CheckBox15', 'CheckBox14', 'CheckBox16', 'CheckBox17', 'CheckBox18', 'CheckBox19', 'CheckBox20', 'CheckBox21')),
      gruppeV('gebaeudeart', 'Gebäudeart: Wohngebäude, Wohnheim oder Nichtwohngebäude (Nutzungsart)', 'eins', s0('CheckBox22', 'CheckBox23', 'CheckBox24', 'Memo50')),
      gruppeV('haustyp', 'Haustyp des Wohngebäudes', 'eins', s0('CheckBox25', 'CheckBox26', 'CheckBox27', 'CheckBox28'), { bedingung: und(neubau, wohn) }),
      gruppeV('baustoff', 'Überwiegend verwendeter Baustoff/Tragkonstruktion', 'eins', s0(...Array.from({ length: 8 }, (_, i) => `CheckBox${29 + i}`)), { bedingung: neubau }),
      gruppeV('beheizung', 'Vorwiegende Art der Beheizung', 'eins', s0(...Array.from({ length: 6 }, (_, i) => `CheckBox${37 + i}`)), { bedingung: neubau }),
      // Seite 2, linke Spalte (Abschnitt nur bei Neubau)
      gruppeV('heizung-primaer', 'Energie für Heizung, primär', 'eins', heizungPrimaer),
      gruppeV('heizung-sekundaer', 'Energie für Heizung, sekundär', 'eins', heizungSekundaer),
      gruppeV('wasser-primaer', 'Energie für Warmwasserbereitung, primär', 'eins', wasserPrimaer),
      gruppeV('wasser-sekundaer', 'Energie für Warmwasserbereitung, sekundär', 'eins', wasserSekundaer),
      gruppeV('lueftung', 'Anlagen zur Lüftung', 'eins', s1('CheckBox49', 'CheckBox50', 'CheckBox51')),
      gruppeV('kuehlung', 'Anlagen zur Kühlung', 'eins', s1('CheckBox52', 'CheckBox53', 'CheckBox54')),
      gruppeV(
        'geg',
        'Art der Erfüllung des GEG (Mehrfachnennungen möglich)',
        'eins',
        s1('CheckBox55', 'CheckBox56', 'CheckBox57', 'CheckBox58', 'CheckBox59', 'CheckBox60', 'CheckBox63', 'CheckBox64', 'CheckBox66'),
      ),
      // Nr. 4 und 5: je Zahl eine Angabe
      gruppeV('rauminhalt', 'Rauminhalt brutto in m³, DIN 277 (01)', 'eins', rauminhalt, { bedingung: neubau }),
      gruppeV('vollgeschosse', 'Anzahl der Vollgeschosse (02)', 'eins', vollgeschosse),
      gruppeV('nutzflaeche-neu', 'Nutzfläche, neuer Zustand (03)', 'eins', nutzNeu, { bedingung: nichtwohn }),
      gruppeV('nutzflaeche-alt', 'Nutzfläche, alter Zustand (05)', 'eins', nutzAlt, { bedingung: und(bestand, nichtwohn) }),
      gruppeV('wohnflaeche-neu', 'Wohnfläche, neuer Zustand (04)', 'eins', wohnflNeu, { bedingung: wohn }),
      gruppeV('wohnflaeche-alt', 'Wohnfläche, alter Zustand (06)', 'eins', wohnflAlt, { bedingung: und(bestand, wohn) }),
    ],
  },
  wohnungen('wohnungen-neu', 'neuer Zustand', RAEUME_NEU, wohn),
  wohnungen('wohnungen-alt', 'alter Zustand', RAEUME_ALT, und(bestand, wohn)),
  {
    gruppen: [
      gruppeV('raeume7-neu', 'Räume in Wohnungen mit 7 oder mehr Räumen, neuer Zustand (14)', 'eins', raeume7Neu, { bedingung: oder(...eineAngabe(drei(74))) }),
      gruppeV('raeume7-alt', 'Räume in Wohnungen mit 7 oder mehr Räumen, alter Zustand (22)', 'eins', raeume7Alt, { bedingung: oder(...eineAngabe(drei(77))) }),
      gruppeV('kosten', 'Veranschlagte Kosten des Bauwerks bzw. der Baumaßnahme in 1 000 Euro (23)', 'eins', kosten),
    ],
    bedingungen: {
      '0:Memo45': wenn(angekreuzt('0:CheckBox8')),
      ...fuer(['1:Memo2'], oder(angekreuzt('1:CheckBox11'), angekreuzt('1:CheckBox24'))),
      ...fuer(['1:Memo3'], oder(angekreuzt('1:CheckBox36'), angekreuzt('1:CheckBox48'))),
      '1:Memo4': wenn(angekreuzt('1:CheckBox66')),
    },
  },
  // Seite 3: Baufertigstellung – erst nach der Bezugsfertigstellung
  baufertigstellung(2, true),
);

export const vorgaben: Record<string, FormularProfil> = { 'nw010020|2025F': nw010020_2025F };
