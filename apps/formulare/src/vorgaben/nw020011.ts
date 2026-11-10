/**
 * Vollmacht zum Bauantrag (Einreichen, Schriftverkehr, Zustellungen über die Entwurfsverfassenden), Fassung 2018,
 * Stand 2021L. Die Unterschrift hat kein Feld.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { bauherrschaft, entwurf, grundstueck } from './vordruck2018';

export const nw020011_2021L: FormularProfil = zusammen(
  bauherrschaft(['Memo2', 'Memo3', 'Memo4', 'Memo5', 'Memo6', 'Memo7']),
  entwurf(['Memo8', 'Memo9', 'Memo10', 'Memo11', 'Memo12', 'Memo13']),
  grundstueck(['Memo14', 'Memo15', 'Memo16', 'Memo17', 'Memo18']),
  {
    abschnitte: { '0:-': { titel: 'Anlage zum Bauantrag' } },
    feldTitel: {
      '0:Memo1': 'Anlage zum Bauantrag vom (Datum)',
      '0:Memo19': 'Bezeichnung des Bauvorhabens',
      '0:Memo20': 'Ort, Datum',
    },
  },
);

export const vorgaben: Record<string, FormularProfil> = { 'nw020011|2021L': nw020011_2021L };
