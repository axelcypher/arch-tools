/**
 * Anlage I/9 zur VV BauPrüfVO – Betriebsbeschreibung für land- und forstwirtschaftliche Vorhaben (§ 5 Absatz 2
 * BauPrüfVO), Stand 2024D. Fast nur Tabellen mit Ist und Ziel; die Summen rechnet FORMA selbst.
 *
 * Regeln:
 * - Kopf: Bauherrschaft ist Eigentümerin/Eigentümer oder Pächterin/Pächter – eine Auswahl.
 * - Genaue Bezeichnung des Vorhabens, Nr. 1 Betriebsflächen, Nr. 2 Bodennutzung: je mindestens eine Angabe.
 * - Pachtdauer nur bei Pacht: Bauherrschaft ist Pächterin/Pächter oder es ist Zupacht eingetragen.
 * - „Art:“ bei Obst, Gemüse, Sonstigem, Mastgeflügel, sonstigen Tieren und Fischzucht nur, wenn dort Ist oder Ziel
 *   eingetragen ist.
 * - Nr. 3 Tierhaltung: mindestens eine Angabe (ohne Tiere „0“); Fischzucht ist frei.
 * - Nr. 4 Tierische Abgänge nur, wenn Tiere eingetragen sind: Fest- oder Flüssigmist; Lagerart, Lagerkapazität und
 *   Art der Verbringung je Spalte nur, wenn dort die Jahresmenge steht.
 * - Nr. 5 Gefährliche Stoffe: Listen – die Zeilen zählen nicht; der Ort der Lagerung aber, sobald in der Zeile
 *   Art und Menge stehen. Art der Beseitigung (5.4) und Behandlung/Verbleib (5.5) nur, wenn dort etwas eingetragen ist.
 * - Nr. 6 Arbeitskräfte: Betriebsleiter(in) mit Ausbildung und Arbeitsanteil; die übrigen Zeilen sind frei, der
 *   Anteil bzw. die Jahresarbeitsstunden aber, sobald die Anzahl (bzw. beim Ehegatten die Ausbildung) eingetragen ist.
 * - Nr. 7 Betriebsform: Voll- oder Nebenerwerb (Ist oder Ziel). Zuerwerb ist frei, sein Anteil aber, sobald eine
 *   Tätigkeit genannt ist. Haupterwerb und Einkünfte nur beim Nebenerwerb der jeweiligen Spalte. Wirtschaftlichkeits-
 *   rechnung beigefügt oder nicht. „Fortbestand gesichert“ nur, wenn zutreffend; dann Betriebsnachfolger und
 *   Ausbildungsstand, „durch …“ bzw. „abgeschlossen am“ nur beim jeweiligen Kästchen.
 * - Nr. 8 Sonstiges ist frei; den Genehmigungsvermerk füllt die Bauaufsichtsbehörde aus.
 */

import type { Bedingung } from '../bedingung';
import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { angekreuzt, fuer, gruppeV, oder, s, wenn, zaehltNicht } from './hilfen';

const s0 = s(0);
const s1 = s(1);
const s2 = s(2);
const s3 = s(3);

/** mindestens eines der Felder ausgefüllt */
const eines = (felder: string[]): Bedingung => oder(...felder.map(angekreuzt));
const nr = (n: number) => String(n).padStart(2, '0');

// Nr. 1 Betriebsflächen: Spalten Eigentum, Zupacht, Verpachtet, Bewirtschaftet je 7 Zeilen (BI = Ist, BZ = Ziel)
const flaechenZeilen = [
  'Ackerland',
  'Grünland',
  'sonstige landwirtschaftliche Nutzfläche',
  'Summe landwirtschaftliche Nutzfläche',
  'Forstwirtschaftliche Nutzfläche',
  'Sonstige Flächen',
  'Summe Betriebsfläche',
];
const flaechenSpalten = ['Eigentum', 'Zupacht', 'Verpachtet', 'Bewirtschaftet'];
const flaeche = (ist: boolean, spalte: number, zeile: number) => `0:Memo${ist ? 'BI' : 'BZ'}${nr(spalte * 7 + zeile + 1)}`;
const flaechenTitel: Record<string, string> = {};
const flaechenEingaben: string[] = [];
const zupacht: string[] = [];
for (const ist of [true, false])
  flaechenSpalten.forEach((sp, j) =>
    flaechenZeilen.forEach((z, i) => {
      const k = flaeche(ist, j, i);
      flaechenTitel[k] = `Nr. 1 ${z}, ${ist ? 'Ist' : 'Ziel'}: ${sp} (ha)`;
      // Zeile 4 und 7 sind Summen (rechnet FORMA)
      if (i !== 3 && i !== 6) {
        flaechenEingaben.push(k);
        if (j === 1) zupacht.push(k);
      }
    }),
  );

// Nr. 2 Bodennutzung: links feste Zeilen, rechts Zeilen mit „Art:“
const boden: Record<string, string> = {};
['Getreide', 'Ölfrüchte', 'Kartoffeln', 'Zuckerrüben', 'Ackerfutter', 'Weide'].forEach((z, i) => {
  boden[`1:MemoBI${nr(i + 1)}`] = `Nr. 2 ${z}: Ist (ha)`;
  boden[`1:MemoBZ${nr(i + 1)}`] = `Nr. 2 ${z}: Ziel (ha)`;
});
/** rechte Zeilen: Art-Feld, Bezeichnung, Nummer der Ist/Ziel-Felder */
const bodenArt: [string, string, number][] = [
  ['1:Memo3', 'Obst', 7],
  ['1:Memo8', 'Gemüse', 8],
  ['1:Memo13', 'Sonstige (Zeile 1)', 9],
  ['1:Memo18', 'Sonstige (Zeile 2)', 10],
];
for (const [art, z, n] of bodenArt) {
  boden[art] = `Nr. 2 ${z}: Art`;
  boden[`1:MemoBI${nr(n)}`] = `Nr. 2 ${z}: Ist (ha)`;
  boden[`1:MemoBZ${nr(n)}`] = `Nr. 2 ${z}: Ziel (ha)`;
}
const bodenEingaben = [...Object.keys(boden).filter((k) => !bodenArt.some(([a]) => a === k)), '1:Memo27', '1:Memo28'];

// Nr. 3 Tierhaltung: [Bezeichnung, Ist, Ziel]
const tiere: [string, string, string][] = [
  ['Milchkühe', 'Memo29', 'Memo30'],
  ['Mastrinder, -bullen', 'Memo34', 'Memo35'],
  ['Zuchtsauen', 'Memo38', 'Memo39'],
  ['Mastschweine', 'Memo42', 'Memo43'],
  ['Ziegen, Schafe', 'Memo46', 'Memo47'],
  ['Arbeitspferde', 'Memo50', 'Memo51'],
  ['Zuchtpferde', 'Memo55', 'Memo56'],
  ['Reitpferde', 'Memo60', 'Memo61'],
  ['davon Pensionstiere', 'Memo62', 'Memo63'],
  ['Mastgeflügel', 'Memo32', 'Memo33'],
  ['davon Käfighaltung', 'Memo36', 'Memo37'],
  ['Legehennen in Käfighaltung', 'Memo40', 'Memo41'],
  ['Legehennen in Bodenhaltung', 'Memo44', 'Memo45'],
  ['Legehennen freilaufend', 'Memo48', 'Memo49'],
  ['Sonstige Tiere (Zeile 1)', 'Memo53', 'Memo54'],
  ['Sonstige Tiere (Zeile 2)', 'Memo58', 'Memo59'],
];
const tierTitel: Record<string, string> = {};
for (const [z, ist, ziel] of tiere) {
  tierTitel[`1:${ist}`] = `Nr. 3 ${z}: Ist (Anzahl)`;
  tierTitel[`1:${ziel}`] = `Nr. 3 ${z}: Ziel (Anzahl)`;
}
const tierZahlen = tiere.flatMap(([, ist, ziel]) => s1(ist, ziel));

// Nr. 5 Gefährliche Stoffe: je Unterpunkt 4 Zeilen „Art und Menge“ / „Ort der Lagerung“
const stoffe: [string, number][] = [
  ['5.1 Düngemittel', 3],
  ['5.2 Pflanzenschutzmittel, Gifte', 11],
  ['5.3 Kraft-, Betriebsstoffe', 19],
  ['5.4 Abfallstoffe', 27],
];
const stoffTitel: Record<string, string> = {};
const stoffArt: string[] = [];
const stoffOrt: Record<string, Bedingung> = {};
for (const [z, start] of stoffe)
  for (let i = 0; i < 4; i++) {
    const art = `2:Memo${start + 2 * i}`;
    const ort = `2:Memo${start + 2 * i + 1}`;
    stoffTitel[art] = `Nr. ${z}, Zeile ${i + 1}: Art und Menge`;
    stoffTitel[ort] = `Nr. ${z}, Zeile ${i + 1}: Ort der Lagerung und Schutzvorkehrungen`;
    stoffArt.push(art);
    stoffOrt[ort] = wenn(angekreuzt(art));
  }
const abfall = s2('Memo27', 'Memo29', 'Memo31', 'Memo33');
const abwasser = s2('Memo37', 'Memo38', 'Memo39', 'Memo40');

export const nw010012: FormularProfil = zusammen({
  abschnitte: {
    '0:Panel1': { titel: 'Bauantrag, Bauherrschaft, Grundstück' },
    '0:Panel3': { titel: 'Genaue Bezeichnung des beantragten Vorhabens' },
    '0:Panel4': { titel: 'Nr. 1 Betriebsflächen (ha) und Pachtdauer' },
    '1:Panel4': { titel: 'Kopf Blatt 2' },
    '1:Panel28': { titel: 'Nr. 2 Bodennutzung (ha)' },
    '1:Panel3': { titel: 'Nr. 3 Tierhaltung (Anzahl) und Fischzucht' },
    '1:Panel999': { titel: 'Nr. 4 Tierische Abgänge', bedingung: eines(tierZahlen) },
    '2:Panel1': { titel: 'Kopf Blatt 3' },
    '2:Panel2': { titel: 'Nr. 5 Gefährliche Stoffe' },
    '3:Panel1': { titel: 'Kopf Blatt 4' },
    '3:Panel2': { titel: 'Nr. 6 Arbeitskräfte' },
    '3:Panel4': { titel: 'Nr. 7 Betriebsform' },
    '3:Panel5': { titel: 'Nr. 8 Sonstiges' },
    '4:Panel10': { titel: 'Entwurfsverfassende' },
    '4:Panel11': { titel: 'Genehmigungsvermerk (füllt die Bauaufsichtsbehörde aus)' },
  },
  feldTitel: {
    '0:Memo1': 'Bauantrag / Antrag auf Vorbescheid vom (Datum)',
    '0:Memo2': 'Bauherrschaft',
    '0:CheckBox1': 'Bauherrschaft ist Eigentümerin / Eigentümer',
    '0:CheckBox2': 'Bauherrschaft ist Pächterin / Pächter',
    '0:Memo3': 'Grundstück (Ort, Straße, Hausnummer)',
    '0:Memo4': 'Vorhaben: Betriebsgebäude (Zeile 1)',
    '0:Memo5': 'Vorhaben: Betriebsgebäude (Zeile 2)',
    '0:Memo6': 'Vorhaben: Lagergebäude (Zeile 1)',
    '0:Memo7': 'Vorhaben: Lagergebäude (Zeile 2)',
    '0:Memo8': 'Vorhaben: Stallgebäude (Zeile 1)',
    '0:Memo9': 'Vorhaben: Stallgebäude (Zeile 2)',
    '0:Memo10': 'Vorhaben: Wohngebäude (Zeile 1)',
    '0:Memo11': 'Vorhaben: Wohngebäude (Zeile 2)',
    '0:Memo12': 'Vorhaben: sonstige Gebäude / Anlagen (Zeile 1)',
    '0:Memo13': 'Vorhaben: sonstige Gebäude / Anlagen (Zeile 2)',
    ...flaechenTitel,
    '0:Memo70': 'Nr. 1 Pachtdauer bis 18 Jahre, Ist (ha)',
    '0:Memo71': 'Nr. 1 Pachtdauer bis 18 Jahre, Ziel (ha)',
    '0:Memo72': 'Nr. 1 Pachtdauer über 18 Jahre, Ist (ha)',
    '0:Memo73': 'Nr. 1 Pachtdauer über 18 Jahre, Ziel (ha)',
    '0:Memo74': 'Nr. 1 Verwandtschaftspacht, Ist (ha)',
    '0:Memo75': 'Nr. 1 Verwandtschaftspacht, Ziel (ha)',
    '1:Memo1': 'Bauherrschaft (Blatt 2)',
    '1:Memo2': 'Antrag vom (Blatt 2)',
    ...boden,
    '1:MemoBI11': 'Nr. 2 Summe der Bodennutzung: Ist (ha)',
    '1:MemoBZ11': 'Nr. 2 Summe der Bodennutzung: Ziel (ha)',
    '1:Memo27': 'Nr. 2 davon unter Glas: Ist (ha)',
    '1:Memo28': 'Nr. 2 davon unter Glas: Ziel (ha)',
    ...tierTitel,
    '1:Memo31': 'Nr. 3 Mastgeflügel: Art',
    '1:Memo52': 'Nr. 3 Sonstige Tiere (Zeile 1): Art',
    '1:Memo57': 'Nr. 3 Sonstige Tiere (Zeile 2): Art',
    '1:Memo64': 'Nr. 3 Hauptfutterfläche: Ist',
    '1:Memo65': 'Nr. 3 Hauptfutterfläche: Ziel',
    '1:Memo66': 'Nr. 3 Zusatzfutterfläche: Ist',
    '1:Memo67': 'Nr. 3 Zusatzfutterfläche: Ziel',
    '1:Memo68': 'Nr. 3 Fischzucht (Spalte 1): Art',
    '1:Memo69': 'Nr. 3 Fischzucht (Spalte 1): Jahresproduktion Ist (kg)',
    '1:Memo70': 'Nr. 3 Fischzucht (Spalte 1): Jahresproduktion Ziel (kg)',
    '1:Memo71': 'Nr. 3 Fischzucht (Spalte 2): Art',
    '1:Memo72': 'Nr. 3 Fischzucht (Spalte 2): Jahresproduktion Ist (kg)',
    '1:Memo73': 'Nr. 3 Fischzucht (Spalte 2): Jahresproduktion Ziel (kg)',
    '1:Memo74': 'Nr. 4 Festmist, Jahresmenge: Ist (m³)',
    '1:Memo75': 'Nr. 4 Festmist, Jahresmenge: Ziel (m³)',
    '1:Memo76': 'Nr. 4 Festmist, Lagerart: Ist',
    '1:Memo77': 'Nr. 4 Festmist, Lagerart: Ziel',
    '1:Memo78': 'Nr. 4 Festmist, Lagerkapazität: Ist (m³)',
    '1:Memo79': 'Nr. 4 Festmist, Lagerkapazität: Ziel (m³)',
    '1:Memo80': 'Nr. 4 Festmist, Art der Verbringung: Ist',
    '1:Memo81': 'Nr. 4 Festmist, Art der Verbringung: Ziel',
    '1:Memo82': 'Nr. 4 Flüssigmist, Jahresmenge: Ist (m³)',
    '1:Memo83': 'Nr. 4 Flüssigmist, Jahresmenge: Ziel (m³)',
    '1:Memo84': 'Nr. 4 Flüssigmist, Lagerart: Ist',
    '1:Memo85': 'Nr. 4 Flüssigmist, Lagerart: Ziel',
    '1:Memo86': 'Nr. 4 Flüssigmist, Lagerkapazität: Ist (m³)',
    '1:Memo87': 'Nr. 4 Flüssigmist, Lagerkapazität: Ziel (m³)',
    '1:Memo88': 'Nr. 4 Flüssigmist, Art der Verbringung: Ist',
    '1:Memo89': 'Nr. 4 Flüssigmist, Art der Verbringung: Ziel',
    '2:Memo1': 'Bauherrschaft (Blatt 3)',
    '2:Memo2': 'Antrag vom (Blatt 3)',
    ...stoffTitel,
    '2:Memo35': 'Nr. 5.4 Art der Beseitigung (Zeile 1)',
    '2:Memo36': 'Nr. 5.4 Art der Beseitigung (Zeile 2)',
    '2:Memo37': 'Nr. 5.5 Besonders zu behandelnde Abwässer, Zeile 1: Art, Menge pro Zeiteinheit',
    '2:Memo38': 'Nr. 5.5 Besonders zu behandelnde Abwässer, Zeile 2: Art, Menge pro Zeiteinheit',
    '2:Memo39': 'Nr. 5.5 Besonders zu behandelnde Abwässer, Zeile 3: Art, Menge pro Zeiteinheit',
    '2:Memo40': 'Nr. 5.5 Besonders zu behandelnde Abwässer, Zeile 4: Art, Menge pro Zeiteinheit',
    '2:Memo41': 'Nr. 5.5 Abwässer: Art und Ort der Behandlung (Zeile 1)',
    '2:Memo42': 'Nr. 5.5 Abwässer: Art und Ort der Behandlung (Zeile 2)',
    '2:Memo43': 'Nr. 5.5 Abwässer: Art und Ort der Behandlung (Zeile 3)',
    '2:Memo44': 'Nr. 5.5 Abwässer: Art und Ort der Behandlung (Zeile 4)',
    '2:Memo45': 'Nr. 5.5 Abwässer: Verbleib der Rückstände (Zeile 1)',
    '2:Memo46': 'Nr. 5.5 Abwässer: Verbleib der Rückstände (Zeile 2)',
    '2:Memo47': 'Nr. 5.5 Abwässer: Verbleib der Rückstände (Zeile 3)',
    '2:Memo48': 'Nr. 5.5 Abwässer: Verbleib der Rückstände (Zeile 4)',
    '2:Memo49': 'Nr. 5.5 Abwässer: Verbleib der Rückstände (Zeile 5)',
    '3:Memo1': 'Bauherrschaft (Blatt 4)',
    '3:Memo2': 'Antrag vom (Blatt 4)',
    '3:Memo3': 'Nr. 6 Betriebsleiter(in): Ausbildung als',
    '3:Memo4': 'Nr. 6 Betriebsleiter(in): %-Anteil Ist',
    '3:Memo5': 'Nr. 6 Betriebsleiter(in): %-Anteil Ziel',
    '3:Memo6': 'Nr. 6 Ehegatte: Ausbildung als',
    '3:Memo7': 'Nr. 6 Ehegatte: %-Anteil Ist',
    '3:Memo8': 'Nr. 6 Ehegatte: %-Anteil Ziel',
    '3:MemoAI01': 'Nr. 6 Mithelfende Familienangehörige, Zeile 1: Anzahl Ist',
    '3:Memo10': 'Nr. 6 Mithelfende Familienangehörige, Zeile 1: %-Anteil je Ist',
    '3:MemoAZ01': 'Nr. 6 Mithelfende Familienangehörige, Zeile 1: Anzahl Ziel',
    '3:Memo12': 'Nr. 6 Mithelfende Familienangehörige, Zeile 1: %-Anteil je Ziel',
    '3:MemoAI02': 'Nr. 6 Mithelfende Familienangehörige, Zeile 2: Anzahl Ist',
    '3:Memo14': 'Nr. 6 Mithelfende Familienangehörige, Zeile 2: %-Anteil je Ist',
    '3:MemoAZ02': 'Nr. 6 Mithelfende Familienangehörige, Zeile 2: Anzahl Ziel',
    '3:Memo16': 'Nr. 6 Mithelfende Familienangehörige, Zeile 2: %-Anteil je Ziel',
    '3:MemoAI03': 'Nr. 6 Mithelfende Familienangehörige, Zeile 3: Anzahl Ist',
    '3:Memo18': 'Nr. 6 Mithelfende Familienangehörige, Zeile 3: %-Anteil je Ist',
    '3:MemoAZ03': 'Nr. 6 Mithelfende Familienangehörige, Zeile 3: Anzahl Ziel',
    '3:Memo20': 'Nr. 6 Mithelfende Familienangehörige, Zeile 3: %-Anteil je Ziel',
    '3:MemoAI04': 'Nr. 6 Ständige Arbeitnehmer: Anzahl Ist',
    '3:MemoAZ04': 'Nr. 6 Ständige Arbeitnehmer: Anzahl Ziel',
    '3:MemoAI05': 'Nr. 6 Teilzeitkräfte: Anzahl Ist',
    '3:Memo24': 'Nr. 6 Teilzeitkräfte: Jahresarbeitsstunden Ist',
    '3:MemoAZ05': 'Nr. 6 Teilzeitkräfte: Anzahl Ziel',
    '3:Memo26': 'Nr. 6 Teilzeitkräfte: Jahresarbeitsstunden Ziel',
    '3:MemoAI06': 'Nr. 6 Nicht ständige Arbeitnehmer: Anzahl Ist',
    '3:Memo28': 'Nr. 6 Nicht ständige Arbeitnehmer: Jahresarbeitsstunden Ist',
    '3:MemoAZ06': 'Nr. 6 Nicht ständige Arbeitnehmer: Anzahl Ziel',
    '3:Memo30': 'Nr. 6 Nicht ständige Arbeitnehmer: Jahresarbeitsstunden Ziel',
    '3:MemoAI07': 'Nr. 6 Anzahl der Arbeitskräfte insgesamt: Ist',
    '3:MemoAZ07': 'Nr. 6 Anzahl der Arbeitskräfte insgesamt: Ziel',
    '3:Memo33': 'Nr. 6 Fremd vergebene Arbeiten, Zeile 1: Ist',
    '3:Memo34': 'Nr. 6 Fremd vergebene Arbeiten, Zeile 1: Ziel',
    '3:Memo35': 'Nr. 6 Fremd vergebene Arbeiten, Zeile 2: Ist',
    '3:Memo36': 'Nr. 6 Fremd vergebene Arbeiten, Zeile 2: Ziel',
    '3:CheckBox1': 'Nr. 7 Vollerwerbsbetrieb: Ist',
    '3:CheckBox2': 'Nr. 7 Vollerwerbsbetrieb: Ziel',
    '3:Memo37': 'Nr. 7 Zuerwerb, Art der Tätigkeit (Zeile 1): Ist',
    '3:Memo38': 'Nr. 7 Zuerwerb, Art der Tätigkeit (Zeile 1): Ziel',
    '3:Memo39': 'Nr. 7 Zuerwerb, Art der Tätigkeit (Zeile 2): Ist',
    '3:Memo40': 'Nr. 7 Zuerwerb, Art der Tätigkeit (Zeile 2): Ziel',
    '3:Memo41': 'Nr. 7 Anteil des Zuerwerbs am Gesamtbetrieb: Ist (%)',
    '3:Memo42': 'Nr. 7 Anteil des Zuerwerbs am Gesamtbetrieb: Ziel (%)',
    '3:CheckBox3': 'Nr. 7 Nebenerwerbsbetrieb: Ist',
    '3:CheckBox4': 'Nr. 7 Nebenerwerbsbetrieb: Ziel',
    '3:Memo43': 'Nr. 7 Art des Haupterwerbs: Ist',
    '3:Memo44': 'Nr. 7 Art des Haupterwerbs: Ziel',
    '3:Memo45': 'Nr. 7 Jahreseinkünfte aus Haupterwerb: Ist (EUR)',
    '3:Memo46': 'Nr. 7 Jahreseinkünfte aus Haupterwerb: Ziel (EUR)',
    '3:Memo47': 'Nr. 7 Jahreseinkünfte aus Nebenerwerbsbetrieb: Ist (EUR)',
    '3:Memo48': 'Nr. 7 Jahreseinkünfte aus Nebenerwerbsbetrieb: Ziel (EUR)',
    '3:CheckBox5': 'Nr. 7 Wirtschaftlichkeitsrechnung beigefügt',
    '3:CheckBox6': 'Nr. 7 Wirtschaftlichkeitsrechnung nicht beigefügt',
    '3:CheckBox7': 'Nr. 7 Fortbestand des Betriebes gesichert durch Erbfolge',
    '3:CheckBox8': 'Nr. 7 Fortbestand des Betriebes gesichert durch …',
    '3:Memo49': 'Nr. 7 Fortbestand gesichert durch (Angabe)',
    '3:Memo50': 'Nr. 7 Betriebsnachfolger: Name und Ausbildung als',
    '3:CheckBox9': 'Nr. 7 Ausbildung des Betriebsnachfolgers ist abgeschlossen',
    '3:CheckBox10': 'Nr. 7 Ausbildung des Betriebsnachfolgers wird abgeschlossen am',
    '3:Memo51': 'Nr. 7 Ausbildung wird abgeschlossen am (Datum)',
    '3:Memo52': 'Nr. 8 Sonstiges: Angaben und Hinweise (Zeile 1)',
    '3:Memo53': 'Nr. 8 Sonstiges: Angaben und Hinweise (Zeile 2)',
    '4:Memo17': 'Entwurfsverfassende: Name, Vorname, Büro',
    '4:Memo18': 'Entwurfsverfassende: Straße, Hausnummer',
    '4:Memo19': 'Entwurfsverfassende: PLZ, Ort',
    '4:Memo20': 'Entwurfsverfassende: Datum, Unterschrift',
    '4:Memo21': 'Genehmigungsvermerk',
  },
  zaehlt: {
    // Nr. 5: Listen
    ...zaehltNicht(...stoffArt, '2:Memo36', ...abwasser, ...s2('Memo42', 'Memo43', 'Memo44', 'Memo46', 'Memo47', 'Memo48', 'Memo49')),
    // Nr. 6: weitere Arbeitskräfte und Fremdvergabe nur, wenn vorhanden
    ...zaehltNicht(...s3('Memo6', 'MemoAI01', 'MemoAZ01', 'MemoAI02', 'MemoAZ02', 'MemoAI03', 'MemoAZ03', 'MemoAI04', 'MemoAZ04', 'MemoAI05', 'MemoAZ05', 'MemoAI06', 'MemoAZ06')),
    ...zaehltNicht(...s3('Memo33', 'Memo34', 'Memo35', 'Memo36')),
    // Nr. 7: Zuerwerb nur, wenn vorhanden; Nr. 8 frei
    ...zaehltNicht(...s3('Memo37', 'Memo38', 'Memo39', 'Memo40', 'Memo52', 'Memo53')),
    ...zaehltNicht('4:Memo21'),
  },
  gruppen: [
    gruppeV('eigentum-pacht', 'Bauherrschaft ist Eigentümer(in) oder Pächter(in)', 'eins', s0('CheckBox1', 'CheckBox2')),
    gruppeV('vorhaben', 'Genaue Bezeichnung des beantragten Vorhabens', 'eins', s0('Memo4', 'Memo5', 'Memo6', 'Memo7', 'Memo8', 'Memo9', 'Memo10', 'Memo11', 'Memo12', 'Memo13')),
    gruppeV('flaechen', 'Nr. 1 Betriebsflächen', 'eins', flaechenEingaben),
    gruppeV('pachtdauer', 'Nr. 1 Pachtdauer', 'eins', s0('Memo70', 'Memo71', 'Memo72', 'Memo73', 'Memo74', 'Memo75'), {
      bedingung: oder(angekreuzt('0:CheckBox2'), ...zupacht.map(angekreuzt)),
    }),
    gruppeV('bodennutzung', 'Nr. 2 Bodennutzung', 'eins', bodenEingaben),
    gruppeV('tierhaltung', 'Nr. 3 Tierhaltung', 'eins', [...tierZahlen, ...s1('Memo64', 'Memo65', 'Memo66', 'Memo67')]),
    gruppeV('fischzucht', 'Nr. 3 Fischzucht', 'nie', s1('Memo68', 'Memo69', 'Memo70', 'Memo71', 'Memo72', 'Memo73')),
    gruppeV('mist', 'Nr. 4 Fest- oder Flüssigmist: Jahresmenge', 'eins', s1('Memo74', 'Memo75', 'Memo82', 'Memo83')),
    gruppeV('betriebsleiter-anteil', 'Nr. 6 Betriebsleiter(in): %-Anteil Ist oder Ziel', 'eins', s3('Memo4', 'Memo5')),
    gruppeV('betriebsform', 'Nr. 7 Voll- oder Nebenerwerbsbetrieb (Ist oder Ziel)', 'eins', s3('CheckBox1', 'CheckBox2', 'CheckBox3', 'CheckBox4')),
    gruppeV('wirtschaftlichkeit', 'Nr. 7 Wirtschaftlichkeitsrechnung beigefügt oder nicht', 'eins', s3('CheckBox5', 'CheckBox6')),
    gruppeV('fortbestand', 'Nr. 7 Fortbestand des Betriebes gesichert', 'nie', s3('CheckBox7', 'CheckBox8')),
    gruppeV('nachfolger-ausbildung', 'Nr. 7 Ausbildung des Betriebsnachfolgers', 'eins', s3('CheckBox9', 'CheckBox10'), { bedingung: eines(s3('CheckBox7', 'CheckBox8')) }),
  ],
  bedingungen: {
    // „Art:“ nur, wenn Ist oder Ziel eingetragen ist
    ...Object.fromEntries(bodenArt.map(([art, , n]) => [art, eines([`1:MemoBI${nr(n)}`, `1:MemoBZ${nr(n)}`])])),
    '1:Memo31': eines(s1('Memo32', 'Memo33')),
    '1:Memo52': eines(s1('Memo53', 'Memo54')),
    '1:Memo57': eines(s1('Memo58', 'Memo59')),
    // Nr. 4: Angaben je Spalte nur mit Jahresmenge
    ...fuer(s1('Memo76', 'Memo78', 'Memo80'), wenn(angekreuzt('1:Memo74'))),
    ...fuer(s1('Memo77', 'Memo79', 'Memo81'), wenn(angekreuzt('1:Memo75'))),
    ...fuer(s1('Memo84', 'Memo86', 'Memo88'), wenn(angekreuzt('1:Memo82'))),
    ...fuer(s1('Memo85', 'Memo87', 'Memo89'), wenn(angekreuzt('1:Memo83'))),
    // Nr. 5
    ...stoffOrt,
    '2:Memo35': eines(abfall),
    ...fuer(s2('Memo41', 'Memo45'), eines(abwasser)),
    // Nr. 6: Anteil bzw. Jahresarbeitsstunden zur Anzahl
    ...fuer(s3('Memo7', 'Memo8'), wenn(angekreuzt('3:Memo6'))),
    '3:Memo10': wenn(angekreuzt('3:MemoAI01')),
    '3:Memo12': wenn(angekreuzt('3:MemoAZ01')),
    '3:Memo14': wenn(angekreuzt('3:MemoAI02')),
    '3:Memo16': wenn(angekreuzt('3:MemoAZ02')),
    '3:Memo18': wenn(angekreuzt('3:MemoAI03')),
    '3:Memo20': wenn(angekreuzt('3:MemoAZ03')),
    '3:Memo24': wenn(angekreuzt('3:MemoAI05')),
    '3:Memo26': wenn(angekreuzt('3:MemoAZ05')),
    '3:Memo28': wenn(angekreuzt('3:MemoAI06')),
    '3:Memo30': wenn(angekreuzt('3:MemoAZ06')),
    // Nr. 7
    '3:Memo41': eines(s3('Memo37', 'Memo39')),
    '3:Memo42': eines(s3('Memo38', 'Memo40')),
    ...fuer(s3('Memo43', 'Memo45', 'Memo47'), wenn(angekreuzt('3:CheckBox3'))),
    ...fuer(s3('Memo44', 'Memo46', 'Memo48'), wenn(angekreuzt('3:CheckBox4'))),
    '3:Memo49': wenn(angekreuzt('3:CheckBox8')),
    '3:Memo50': eines(s3('CheckBox7', 'CheckBox8')),
    '3:Memo51': wenn(angekreuzt('3:CheckBox10')),
  },
});

export const vorgaben: Record<string, FormularProfil> = { 'nw010012|2024D': nw010012 };
