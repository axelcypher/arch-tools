/**
 * Antrag auf Ausnahme(n) von den Festsetzungen des Bebauungsplans (§ 31 Absatz 1 BauGB), Fassung 2018, Stand 2021L.
 *
 * Beantragte Ausnahme und Begründung zählen; die Unterschriften zählen nicht.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { bauherrschaft, entwurf, grundstueck } from './vordruck2018';
import { zaehltNicht } from './hilfen';

export const nw020006_2021L: FormularProfil = zusammen(
  bauherrschaft(['Memo2', 'Memo3', 'Memo4', 'Memo5', 'Memo6', 'Memo7']),
  entwurf(['Memo8', 'Memo9', 'Memo10', 'Memo11', 'Memo12', 'Memo13']),
  grundstueck(['Memo14', 'Memo15', 'Memo16', 'Memo17', 'Memo18']),
  {
    abschnitte: {
      '0:-': { titel: 'Anlage zum Bauantrag' },
      '0:Panel1': { titel: 'Beantragte Ausnahme(n) von den Festsetzungen des Bebauungsplans' },
      '0:Panel2': { titel: 'Begründung der Ausnahme(n)' },
      '0:Panel11': { titel: 'Ort, Datum (Bauherrschaft)' },
      '0:Panel12': { titel: 'Ort, Datum (Entwurfsverfassende)' },
    },
    feldTitel: {
      '0:Memo1': 'Anlage zum Bauantrag vom (Datum)',
      '0:Memo20': 'Beantragte Ausnahme(n) von den Festsetzungen',
      '0:Memo21': 'Begründung: Die Voraussetzungen für die Ausnahme(n) werden erfüllt durch',
      '0:Memo24': 'Ort, Datum (Bauherrschaft)',
      '0:Memo25': 'Für die Bauherrschaft (Unterschrift)',
      '0:Memo26': 'Ort, Datum (Entwurfsverfassende)',
      '0:Memo27': 'Bauvorlageberechtigte Entwurfsverfassende (Unterschrift)',
    },
    zaehlt: zaehltNicht('0:Memo25', '0:Memo27'),
  },
);

export const vorgaben: Record<string, FormularProfil> = { 'nw020006|2021L': nw020006_2021L };
