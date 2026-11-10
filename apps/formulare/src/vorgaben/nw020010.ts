/**
 * Wohnflächenberechnung nach der Wohnflächenverordnung (WoFlV), NRW 2018.
 *
 * Es zählen die Kopfangaben (Bauvorhaben, Baugrundstück, Bauherrschaft, Haus, Wohnung, Lage), die Zahl der
 * Wohnungen im Gebäude und die Art der Ermittlung (Ausmessen oder Bauzeichnung – eine Auswahl). Die 17 Raumzeilen
 * sind gleichartig – man füllt so viele, wie die Wohnung Räume hat –, sie zählen nicht. Flächen und Summen rechnet
 * FORMA; die Spalte „Von der Behörde auszufüllen“ ist schreibgeschützt (FORMA führt sie als berechnet) und zählt
 * ohnehin nicht. Die Bemerkungen sind freiwillig.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { gruppeV, s, zaehltNicht } from './hilfen';

const s0 = s(0);

const zz = (i: number) => String(i).padStart(2, '0');
/** Raumzeilen 1–17; die Behördenspalte heißt Memo4 … Memo20 */
const zeilen = Array.from({ length: 17 }, (_, i) => {
  const n = zz(i + 1);
  return {
    n: i + 1,
    nr: `0:MemoLR${n}`,
    raum: `0:MemoRB${n}`,
    gf: `0:MemoGF${n}`,
    sg: `0:MemoSG${n}`,
    ft: `0:MemoFT${n}`,
    sa: `0:MemoSA${n}`,
    eg: `0:MemoEG${n}`,
    behoerde: `0:Memo${4 + i}`,
  };
});

export const nw020010_2021L: FormularProfil = zusammen({
  abschnitte: {
    '0:Panel1': { titel: 'Wohnflächenberechnung' },
    '0:-': { titel: 'Wohnungen im Gebäude, Art der Ermittlung' },
  },
  feldTitel: {
    '0:Memo1': 'Bauvorhaben',
    '0:Memo25': 'Baugrundstück',
    '0:Memo2': 'Bauherrschaft',
    '0:Memo3': 'Haus',
    '0:Memo110': 'Wohnung',
    '0:Memo111': 'Lage der Wohnung',
    ...Object.fromEntries(
      zeilen.flatMap((z) => [
        [z.nr, `Zeile ${z.n}: Nr.`],
        [z.raum, `Zeile ${z.n}: Raumbezeichnung`],
        [z.gf, `Zeile ${z.n}: Grundfläche (m × m)`],
        [z.sg, `Zeile ${z.n}: Grundfläche (m²)`],
        [z.ft, `Zeile ${z.n}: Abzugsfläche (m × m)`],
        [z.sa, `Zeile ${z.n}: Abzugsfläche (m²)`],
        [z.eg, `Zeile ${z.n}: Ermittelte Grundfläche (m²)`],
        [z.behoerde, `Zeile ${z.n}: von der Behörde auszufüllen`],
      ]),
    ),
    '0:MemoSumme1': 'Grundflächensumme (m²)',
    '0:MemoSumme2': 'Abzugsfläche (m²)',
    '0:MemoSumme3': 'Anrechenbare Wohnfläche (m²)',
    '0:Memo21': 'Grundflächensumme: von der Behörde auszufüllen',
    '0:Memo22': 'Abzugsfläche: von der Behörde auszufüllen',
    '0:Memo23': 'Anrechenbare Wohnfläche: von der Behörde auszufüllen',
    '0:Memo26': 'Bemerkungen',
    '0:Memo24': 'Im Gebäude sind insgesamt … Wohnung(en)',
    '0:CheckBox1': 'Ermittlung der Grundfläche durch Ausmessen',
    '0:CheckBox2': 'Ermittlung der Grundfläche nach Bauzeichnung',
  },
  // Raumzeilen (die berechneten Felder zählen ohnehin nicht) und die Bemerkungen
  zaehlt: zaehltNicht(...zeilen.flatMap((z) => [z.nr, z.raum, z.gf, z.ft]), '0:Memo26'),
  gruppen: [gruppeV('ermittlung', 'Ermittlung der Grundfläche: Ausmessen oder Bauzeichnung', 'eins', s0('CheckBox1', 'CheckBox2'))],
});

export const vorgaben: Record<string, FormularProfil> = { 'nw020010|2021L': nw020010_2021L };
