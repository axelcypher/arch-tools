/**
 * Anzeige über die Fertigstellung genehmigungsfreier Vorhaben (Vordruck: § 67 Abs. 5 BauO NRW), Fassung 2018,
 * Stand 2021L.
 *
 * - Aktenzeichen: genehmigungsfreie Vorhaben haben keine Baugenehmigung; ein Aktenzeichen der Bauaufsichtsbehörde
 *   gibt es nur bei der Genehmigungsfreistellung (§ 63 BauO NRW 2018).
 * - Bauvorhaben: Errichtung, Änderung oder Nutzungsänderung – eine Auswahl.
 * Die Unterschrift zählt nicht.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { anzeigeKopf, grundstueck } from './vordruck2018';
import { begruendet, gruppeV, ist, q, s, wenn, zaehltNicht } from './hilfen';

const s0 = s(0);

export const nw030004_2021L: FormularProfil = zusammen(anzeigeKopf, grundstueck(['Memo18', 'Memo19', 'Memo20', 'Memo21', 'Memo22']), {
  abschnitte: {
    '0:-': { titel: 'Fertigstellung' },
    '0:Panel8': { titel: 'Ort, Datum, Unterschrift' },
  },
  feldTitel: {
    '0:Memo23': 'Tag der abschließenden Fertigstellung',
    '0:CheckBox1': 'Bauvorhaben: Errichtung',
    '0:CheckBox2': 'Bauvorhaben: Änderung',
    '0:CheckBox3': 'Bauvorhaben: Nutzungsänderung',
    '0:Memo17': 'Bauvorhaben: Objekt',
    '0:Memo30': 'Ort, Datum',
    '0:Memo31': 'Unterschrift (Bauherrschaft)',
  },
  zaehlt: zaehltNicht('0:Memo31'),
  gruppen: [gruppeV('vorhaben', 'Bauvorhaben: Errichtung, Änderung oder Nutzungsänderung', 'eins', s0('CheckBox1', 'CheckBox2', 'CheckBox3'))],
  bedingungen: {
    '0:Memo10': begruendet(
      wenn(ist('Verfahren', 'Genehmigungsfreistellung')),
      'Ein Aktenzeichen gibt es nur, wenn die Unterlagen in der Genehmigungsfreistellung bei der Bauaufsichtsbehörde eingereicht wurden.',
      q('bauo-nrw', '63', 3),
    ),
  },
});

export const vorgaben: Record<string, FormularProfil> = { 'nw030004|2021L': nw030004_2021L };
