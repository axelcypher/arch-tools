/**
 * Antrag auf Abweichung, Befreiung und Ausnahme (§ 69 Absatz 2 und 3 BauO NRW) für genehmigungspflichtige
 * Bauvorhaben, Fassung 2018, Stand 2021L – Vorgänger von Anlage I/10 (nw010013).
 *
 * - Abweichung, Befreiung oder Ausnahme: mindestens eine Auswahl.
 * - Aktenzeichen der Bauaufsichtsbehörde: als Anlage zum Bauantrag meist noch nicht vergeben – zählt nicht.
 * - „vertreten durch“ nur bei Vertretung; die Unterschriften zählen nicht.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { bauherrschaft, entwurf, grundstueck } from './vordruck2018';
import { gruppeV, s, zaehltNicht } from './hilfen';

const s0 = s(0);

export const nw020005_2021L: FormularProfil = zusammen(
  bauherrschaft(['Memo5', 'Memo6', 'Memo7', 'Memo9', 'Memo10', 'Memo11'], { feld: 'Memo8', titel: 'Bauherrschaft vertreten durch (Name, Vorname, Anschrift)' }),
  entwurf(['Memo12', 'Memo13', 'Memo14', 'Memo15', 'Memo16', 'Memo17']),
  grundstueck(['Memo18', 'Memo19', 'Memo20', 'Memo21', 'Memo22']),
  {
    abschnitte: {
      '0:Panel1': { titel: 'Untere Bauaufsichtsbehörde' },
      '0:Panel11': { titel: 'Ort, Datum (Bauherrschaft)' },
      '0:Panel12': { titel: 'Ort, Datum (Entwurfsverfassende)' },
    },
    feldTitel: {
      '0:Memo1': 'Anlage zum Bauantrag vom (Datum)',
      '0:Memo2': 'Untere Bauaufsichtsbehörde (Anschrift)',
      '0:Memo3': 'Untere Bauaufsichtsbehörde: PLZ, Ort',
      '0:Memo4': 'Aktenzeichen der Bauaufsichtsbehörde',
      '0:CheckBox1': 'Abweichung',
      '0:CheckBox2': 'Befreiung',
      '0:CheckBox3': 'Ausnahme',
      '0:Memo23': 'Begründung',
      '0:Memo24': 'Ort, Datum (Bauherrschaft)',
      '0:Memo25': 'Für die Bauherrschaft (Unterschrift)',
      '0:Memo26': 'Ort, Datum (Entwurfsverfassende)',
      '0:Memo27': 'Bauvorlageberechtigte Entwurfsverfassende (Unterschrift)',
    },
    zaehlt: zaehltNicht('0:Memo4', '0:Memo25', '0:Memo27'),
    gruppen: [gruppeV('art', 'Abweichung, Befreiung oder Ausnahme', 'eins', s0('CheckBox1', 'CheckBox2', 'CheckBox3'))],
  },
);

export const vorgaben: Record<string, FormularProfil> = { 'nw020005|2021L': nw020005_2021L };
