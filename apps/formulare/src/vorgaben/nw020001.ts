/**
 * Allgemeine Anlage zum Bauantrag, Fassung 2018, Stand 2021L: Kopfdaten und ein freies Textfeld für den Inhalt der
 * Anlage (das große Feld unter „Bauvorhaben“).
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { bauherrschaft, entwurf, grundstueck } from './vordruck2018';

export const nw020001_2021L: FormularProfil = zusammen(
  bauherrschaft(['Memo2', 'Memo3', 'Memo4', 'Memo5', 'Memo6', 'Memo7']),
  entwurf(['Memo8', 'Memo9', 'Memo10', 'Memo11', 'Memo12', 'Memo13']),
  grundstueck(['Memo14', 'Memo15', 'Memo16', 'Memo17', 'Memo18']),
  {
    feldTitel: {
      '0:Memo1': 'Anlage zum Bauantrag vom (Datum)',
      '0:Memo8': 'Entwurfsverfassende: Name, Vorname, Firma',
      '0:Memo19': 'Bezeichnung des Bauvorhabens',
      '0:Memo20': 'Inhalt der Anlage',
    },
  },
);

export const vorgaben: Record<string, FormularProfil> = { 'nw020001|2021L': nw020001_2021L };
