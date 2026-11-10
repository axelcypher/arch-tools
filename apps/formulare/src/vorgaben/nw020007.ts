/**
 * Antrag auf Befreiung von den Festsetzungen des Bebauungsplans (§ 31 Absatz 2 BauGB), Fassung 2018, Stand 2022C.
 *
 * Begründung nach § 31 Absatz 2 BauGB: einer der drei Befreiungsgründe (Nr. 1 Wohl der Allgemeinheit, Nr. 2
 * städtebaulich vertretbar, Nr. 3 nicht beabsichtigte Härte) – eine Auswahl – und dazu die Vereinbarkeit mit den
 * öffentlichen Belangen unter Würdigung nachbarlicher Interessen (Textfeld). Die Unterschriften zählen nicht.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { bauherrschaft, entwurf, grundstueck } from './vordruck2018';
import { gruppeV, s, zaehltNicht } from './hilfen';

const s0 = s(0);

export const nw020007_2022C: FormularProfil = zusammen(
  bauherrschaft(['Memo2', 'Memo3', 'Memo4', 'Memo5', 'Memo6', 'Memo7']),
  entwurf(['Memo8', 'Memo9', 'Memo10', 'Memo11', 'Memo12', 'Memo13']),
  grundstueck(['Memo14', 'Memo15', 'Memo16', 'Memo17', 'Memo18']),
  {
    abschnitte: {
      '0:-': { titel: 'Anlage zum Bauantrag' },
      '0:Panel1': { titel: 'Beantragte Befreiung(en) von den Festsetzungen des Bebauungsplans' },
      '0:Panel2': { titel: 'Begründung (§ 31 Absatz 2 BauGB)' },
      '0:Panel11': { titel: 'Ort, Datum (Bauherrschaft)' },
      '0:Panel12': { titel: 'Ort, Datum (Entwurfsverfassende)' },
    },
    feldTitel: {
      '0:Memo1': 'Anlage zum Bauantrag vom (Datum)',
      '0:Memo20': 'Festsetzung(en), von denen die Befreiung beantragt wird',
      '0:CheckBox1': 'Befreiungsgrund: Wohl der Allgemeinheit (§ 31 Absatz 2 Nr. 1 BauGB)',
      '0:CheckBox2': 'Befreiungsgrund: städtebaulich vertretbar, Grundzüge der Planung nicht berührt (§ 31 Absatz 2 Nr. 2 BauGB)',
      '0:CheckBox3': 'Befreiungsgrund: offenbar nicht beabsichtigte Härte (§ 31 Absatz 2 Nr. 3 BauGB)',
      '0:Memo21': 'Begründung: vereinbar mit den öffentlichen Belangen unter Würdigung nachbarlicher Interessen',
      '0:Memo24': 'Ort, Datum (Bauherrschaft)',
      '0:Memo25': 'Für die Bauherrschaft (Unterschrift)',
      '0:Memo26': 'Ort, Datum (Entwurfsverfassende)',
      '0:Memo27': 'Bauvorlageberechtigte Entwurfsverfassende (Unterschrift)',
    },
    zaehlt: zaehltNicht('0:Memo25', '0:Memo27'),
    gruppen: [gruppeV('grund', 'Befreiungsgrund nach § 31 Absatz 2 Nr. 1 bis 3 BauGB', 'eins', s0('CheckBox1', 'CheckBox2', 'CheckBox3'))],
  },
);

export const vorgaben: Record<string, FormularProfil> = { 'nw020007|2022C': nw020007_2022C };
