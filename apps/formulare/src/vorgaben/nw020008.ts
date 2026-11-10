/**
 * Vollmacht zur Einsicht in die Hausakten und zum Kopieren (Grundbuch, Baulastverzeichnis, Bauakten), Fassung 2018,
 * Stand 2021L.
 *
 * - Grundbuch, Baulastverzeichnis, Bauakten: mindestens eins (Mehrfachauswahl).
 * - „Anlage zum Bauantrag vom“: Die Vollmacht wird meist vor dem Bauantrag erteilt – zählt nicht.
 * - Das Feld „Datum, Unterschrift der Bauherrschaft“ ist die Unterschrift – zählt nicht (Ort, Datum steht oben).
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { bauherrschaft, entwurf, grundstueck } from './vordruck2018';
import { gruppeV, s, zaehltNicht } from './hilfen';

const s0 = s(0);

export const nw020008_2021L: FormularProfil = zusammen(
  bauherrschaft(['Memo2', 'Memo3', 'Memo4', 'Memo5', 'Memo6', 'Memo7']),
  entwurf(['Memo8', 'Memo9', 'Memo10', 'Memo11', 'Memo12', 'Memo13']),
  grundstueck(['Memo14', 'Memo15', 'Memo16', 'Memo17', 'Memo18']),
  {
    abschnitte: {
      '0:Panel6': { titel: 'Eigentümer/in des Hauses' },
      '0:Panel7': { titel: 'Unterschrift der Bauherrschaft' },
    },
    feldTitel: {
      '0:Memo1': 'Anlage zum Bauantrag vom (Datum)',
      '0:Memo22': 'Ort, Datum',
      '0:Memo20': 'Als Eigentümer/in des Hauses (Haus, Anschrift)',
      '0:CheckBox1': 'Einsicht in: das Grundbuch',
      '0:CheckBox2': 'Einsicht in: das Baulastverzeichnis',
      '0:CheckBox3': 'Einsicht in: die Bauakten',
      '0:Memo21': 'Datum, Unterschrift der Bauherrschaft',
    },
    zaehlt: zaehltNicht('0:Memo1', '0:Memo21'),
    gruppen: [gruppeV('einsicht', 'Einsicht in Grundbuch, Baulastverzeichnis oder Bauakten (mindestens eins)', 'eins', s0('CheckBox1', 'CheckBox2', 'CheckBox3'))],
  },
);

export const vorgaben: Record<string, FormularProfil> = { 'nw020008|2021L': nw020008_2021L };
