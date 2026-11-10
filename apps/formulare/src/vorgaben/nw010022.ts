/**
 * Statistik des Bauabgangs (Hochbaustatistikgesetz, IT.NRW), Stand 2024: je abgehendem Gebäude bzw. Gebäudeteil,
 * auch bei Nutzungsänderung zwischen Wohnbau und Nichtwohnbau („Abgänge im Sinne dieser Erhebung sind auch
 * Nutzungsänderungen“).
 *
 * - Identifikationsnummer, Bauscheinnummer/Aktenzeichen und Straßenschlüssel trägt die Behörde ein – zählen nicht;
 *   der „Platzhalter für sonstige Informationen“ ebenso.
 * - Datum des Bauabgangs bzw. der Abbruchgenehmigung: Monat und Jahr – eine Angabe.
 * - Nr. 4 „Bei Totalabgang“ (Abbruch, „nur den überwiegenden Grund“) bzw. „Bei Nutzungsänderung“ – nach dem Merkmal
 *   Vorhaben (Nutzungsänderung oder nicht).
 * - Nr. 5: Nutzfläche („ohne Wohnfläche“) beim Nichtwohngebäude (Nutzungsart in Nr. 2 angegeben), Wohnfläche und
 *   Wohnungen beim Wohngebäude/Wohnheim; Räume in Wohnungen mit 7 oder mehr Räumen nur, wenn es solche gibt.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { eineAngabe, memos, monatJahrTitel, zifferTitel } from './statistik';
import { angekreuzt, begruendet, gruppeV, ist, istNicht, oder, s, wenn, zaehltNicht } from './hilfen';

const s0 = s(0);
const s1 = s(1);

const bauschein = s0('Memo0', ...memos(7, 25));
const datum = s0(...memos(28, 33));
const nutzflaeche = s1(...memos(2, 7));
const wohnflaeche = s1(...memos(8, 13));
const strassenschluessel = s1(...memos(38, 55));
const wohn = oder(angekreuzt('0:CheckBox11'), angekreuzt('0:CheckBox12'));

/** Nr. 5 Wohnungen nach Zahl der Räume: [Text, erstes Memo] – je drei Ziffernkästchen */
const RAEUME: [string, number][] = [
  ['1 Raum', 14],
  ['2 Räumen', 17],
  ['3 Räumen', 20],
  ['4 Räumen', 23],
  ['5 Räumen', 26],
  ['6 Räumen', 29],
  ['7 Räumen oder mehr', 32],
];
const drei = (n: number) => s1(...memos(n, n + 2));

export const nw010022_2024G: FormularProfil = zusammen({
  abschnitte: {
    '0:Panel1': { titel: '1 Allgemeine Angaben (Eigentümer/Eigentümerin, Anschrift des Gebäudes)' },
    '0:Panel5': { titel: 'Datum des Bauabgangs bzw. der Abbruchgenehmigung' },
    '0:-': { titel: 'Lage des Gebäudes, Eigentümer/Eigentümerin, 2 Art und Alter, 3 Umfang des Bauabgangs' },
    '1:Panel1': { titel: 'Platzhalter für sonstige Informationen (freiwillig)' },
    '1:-': { titel: '4 Art und Ursache, 5 Größe des Bauabgangs' },
  },
  feldTitel: {
    '0:Memo1': 'Eigentümer/Eigentümerin: Name/Firma',
    '0:Memo2': 'Eigentümer/Eigentümerin: Name/Firma (2. Zeile)',
    '0:Memo3': 'Eigentümer/Eigentümerin: Anschrift (Straße, Hausnummer)',
    '0:Memo4': 'Eigentümer/Eigentümerin: Anschrift (Postleitzahl, Ort)',
    '0:Memo5': 'Anschrift des Gebäudes: Straße',
    '0:Memo34': 'Anschrift des Gebäudes: Hausnummer',
    '0:Memo35': 'Anschrift des Gebäudes: Postleitzahl',
    '0:Memo27': 'Anschrift des Gebäudes: Ort',
    ...zifferTitel(bauschein, 'Bauscheinnummer/Aktenzeichen (trägt die Behörde ein)'),
    '0:Memo6': 'Identifikationsnummer (trägt die Behörde ein)',
    ...monatJahrTitel(datum, 'Datum des Bauabgangs bzw. der Abbruchgenehmigung'),
    '0:Memo43': 'Lage des Gebäudes: Gemeinde',
    '0:Memo47': 'Lage des Gebäudes: Gemeindeteil',
    '0:CheckBox2': 'Eigentümer: Öffentlicher Eigentümer (1)',
    '0:CheckBox1': 'Eigentümer: Wohnungsunternehmen (2)',
    '0:CheckBox3': 'Eigentümer: Immobilienfonds (3)',
    '0:CheckBox4': 'Eigentümer: Land- und Forstwirtschaft, Tierhaltung, Fischerei (4)',
    '0:CheckBox5': 'Eigentümer: Produzierendes Gewerbe (5)',
    '0:CheckBox6': 'Eigentümer: Handel, Kreditinstitute, Versicherungen, Dienstleistungen, Verkehr, Nachrichtenübermittlung (6)',
    '0:CheckBox7': 'Eigentümer: Privater Haushalt (7)',
    '0:CheckBox8': 'Eigentümer: Organisation ohne Erwerbszweck (8)',
    '0:CheckBox11': 'Wohngebäude, ohne Wohnheim (1)',
    '0:CheckBox12': 'Wohnheim (2)',
    '0:Memo26': 'Nichtwohngebäude: Nutzungsart',
    '0:CheckBox13': 'Errichtet: vor 1919 (1)',
    '0:CheckBox14': 'Errichtet: 1919–1948 (2)',
    '0:CheckBox15': 'Errichtet: 1949–1978 (3)',
    '0:CheckBox16': 'Errichtet: 1979–1986 (4)',
    '0:CheckBox17': 'Errichtet: 1987–1990 (5)',
    '0:CheckBox18': 'Errichtet: 1991–1995 (6)',
    '0:CheckBox19': 'Errichtet: 1996–2010 (7)',
    '0:CheckBox22': 'Errichtet: 2011 und später (8)',
    '0:CheckBox20': 'Abgang betrifft ein ganzes Gebäude (1)',
    '0:CheckBox21': 'Abgang betrifft einen Gebäudeteil (2)',
    '1:Memo56': 'Sonstige Informationen',
    '1:Memo1': 'Identifikationsnummer (Seite 2, trägt die Behörde ein)',
    '1:CheckBox2': 'Totalabgang: zur Schaffung öffentlicher Verkehrsflächen (1)',
    '1:CheckBox1': 'Totalabgang: zur Schaffung von Freiflächen (2)',
    '1:CheckBox3': 'Totalabgang: zur Errichtung eines neuen Wohngebäudes (3)',
    '1:CheckBox4': 'Totalabgang: zur Errichtung eines neuen Nichtwohngebäudes (4)',
    '1:CheckBox5': 'Totalabgang: infolge bauordnungsrechtlicher Unzulässigkeit (5)',
    '1:CheckBox6': 'Totalabgang: infolge eines außergewöhnlichen Ereignisses, z. B. Brand, Explosion, Einsturz (6)',
    '1:CheckBox7': 'Totalabgang: aus sonstigen Gründen (7)',
    '1:CheckBox8': 'Nutzungsänderung mit Baumaßnahme verbunden: ja (8)',
    '1:CheckBox9': 'Nutzungsänderung mit Baumaßnahme verbunden: nein (9)',
    ...zifferTitel(nutzflaeche, 'Nutzfläche in m², DIN 277, ohne Wohnfläche'),
    ...zifferTitel(wohnflaeche, 'Wohnfläche in m², WoFlV'),
    ...Object.assign({}, ...RAEUME.map(([text, n]) => zifferTitel(drei(n), `Anzahl der Wohnungen mit ${text}`))),
    ...zifferTitel(drei(35), 'Räume in Wohnungen mit 7 oder mehr Räumen'),
    ...zifferTitel(strassenschluessel, 'Straßenschlüssel (trägt die Behörde ein)'),
  },
  zaehlt: zaehltNicht('0:Memo2', '0:Memo6', ...bauschein, '1:Memo56', '1:Memo1', ...strassenschluessel),
  gruppen: [
    gruppeV('datum', 'Datum des Bauabgangs bzw. der Abbruchgenehmigung (Monat, Jahr)', 'alle', datum),
    gruppeV('eigentuemer', 'Eigentümer/Eigentümerin (Art)', 'eins', s0('CheckBox2', 'CheckBox1', 'CheckBox3', 'CheckBox4', 'CheckBox5', 'CheckBox6', 'CheckBox7', 'CheckBox8')),
    gruppeV('gebaeudeart', 'Gebäudeart: Wohngebäude, Wohnheim oder Nichtwohngebäude (Nutzungsart)', 'eins', s0('CheckBox11', 'CheckBox12', 'Memo26')),
    gruppeV('baujahr', 'Das Gebäude wurde errichtet in den Jahren', 'eins', s0('CheckBox13', 'CheckBox14', 'CheckBox15', 'CheckBox16', 'CheckBox17', 'CheckBox18', 'CheckBox19', 'CheckBox22')),
    gruppeV('umfang', 'Umfang des Bauabgangs: ganzes Gebäude oder Gebäudeteil', 'eins', s0('CheckBox20', 'CheckBox21')),
    gruppeV('totalabgang', 'Bei Totalabgang: überwiegender Grund', 'eins', s1('CheckBox2', 'CheckBox1', 'CheckBox3', 'CheckBox4', 'CheckBox5', 'CheckBox6', 'CheckBox7'), {
      bedingung: begruendet(
        wenn(istNicht('Vorhaben', 'Nutzungsänderung')),
        'Der Grund des Abgangs ist laut Vordruck nur beim Totalabgang anzugeben, nicht bei einer Nutzungsänderung (Projektmerkmal Vorhaben).',
      ),
    }),
    gruppeV('nutzungsaenderung', 'Bei Nutzungsänderung: mit einer Baumaßnahme verbunden?', 'eins', s1('CheckBox8', 'CheckBox9'), {
      bedingung: begruendet(wenn(ist('Vorhaben', 'Nutzungsänderung')), 'Nur bei einer Nutzungsänderung (Projektmerkmal Vorhaben).'),
    }),
    gruppeV('nutzflaeche', 'Nutzfläche in m² (DIN 277, ohne Wohnfläche)', 'eins', nutzflaeche, { bedingung: wenn(angekreuzt('0:Memo26')) }),
    gruppeV('wohnflaeche', 'Wohnfläche in m² (WoFlV)', 'eins', wohnflaeche, { bedingung: wohn }),
    gruppeV('wohnungen', 'Anzahl der Wohnungen nach Zahl der Räume', 'eins', [], { bedingung: wohn }),
    ...RAEUME.map(([text, n], i) => gruppeV(`wohnungen-${i + 1}`, `Anzahl der Wohnungen mit ${text}`, 'eins', drei(n), { in: 'v:wohnungen' })),
    gruppeV('raeume7', 'Räume in Wohnungen mit 7 oder mehr Räumen', 'eins', drei(35), { bedingung: oder(...eineAngabe(drei(32))) }),
  ],
});

export const vorgaben: Record<string, FormularProfil> = { 'nw010022|2024G': nw010022_2024G };
