/**
 * Bestätigung nach § 62 Absatz 3 Satz 3 BauO NRW 2018 über die Standsicherheit (Beseitigung nicht freistehender
 * Gebäude: Standsicherheit des Gebäudes, an das angebaut ist), Stand 2024H. Füllen die qualifizierten
 * Tragwerksplanenden aus; sie sind die Fachplanenden – die zählen.
 *
 * Nach dem Vordruck: II. ergänzende Bauteiluntersuchungen und Überwachung der Beseitigung – „Ankreuzen, falls
 * zutreffend“: zählen nicht. Zur Bestätigung gehört die Abbruchbeschreibung (kein Feld).
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { angabenBauvorhaben, ergebnis, unterschrift } from './sachverstaendige';
import { zaehltNicht } from './hilfen';

export const nw040010_2024H: FormularProfil = zusammen(angabenBauvorhaben('Panel1', 'pflicht'), ergebnis('Panel99', 'II. Ergebnis'), unterschrift(), {
  feldTitel: {
    '0:CheckBox1': 'Die in der Abbruchbeschreibung geforderten ergänzenden Bauteiluntersuchungen sind rechtzeitig durchzuführen',
    '0:CheckBox2': 'Es ist notwendig, dass die Beseitigung überwacht wird',
  },
  zaehlt: zaehltNicht('0:CheckBox1', '0:CheckBox2'),
});

export const vorgaben: Record<string, FormularProfil> = { 'nw040010|2024H': nw040010_2024H };
