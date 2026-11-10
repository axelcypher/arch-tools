/**
 * Anzeige der Rohbaufertigstellung genehmigungsbedürftiger Vorhaben (Vordruck: § 84 Absatz 2 BauO NRW), Fassung
 * 2018, Stand 2021L.
 *
 * Kopf, Bauherrschaft, Entwurfsverfassende und Bauleitende wie bei der Baubeginnanzeige (vordruck2018.ts); der
 * Termin, ab dem der Rohbau besichtigt werden kann, zählt. Die Unterschrift zählt nicht.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { anzeigeKopf, bauleitende, grundstueck } from './vordruck2018';
import { zaehltNicht } from './hilfen';

export const nw030002_2021L: FormularProfil = zusammen(anzeigeKopf, grundstueck(['Memo17', 'Memo18', 'Memo19', 'Memo20', 'Memo21']), bauleitende, {
  abschnitte: {
    '0:-': { titel: 'Rohbaufertigstellung' },
    '0:Panel8': { titel: 'Ort, Datum, Unterschrift' },
  },
  feldTitel: {
    '0:Memo23': 'Rohbau kann besichtigt werden ab (Datum)',
    '0:Memo30': 'Ort, Datum',
    '0:Memo31': 'Unterschrift (Bauherrschaft)',
  },
  zaehlt: zaehltNicht('0:Memo31'),
});

export const vorgaben: Record<string, FormularProfil> = { 'nw030002|2021L': nw030002_2021L };
