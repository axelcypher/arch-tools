/**
 * Bescheinigung nach § 23 Absatz 1 SV-VO über den Schallschutz (Prüfung; §§ 63 Absatz 4, 64 bis 66 i. V. m. § 68
 * Absatz 1 BauO NRW 2018), Stand 2022L. Füllt die sachverständige Person aus.
 *
 * Nach dem Vordruck:
 * - II. Ergebnis: Nachweis von mir aufgestellt oder von der/dem Fachplanenden aufgestellt und von mir geprüft –
 *   „Zutreffendes bitte ankreuzen“: eine Auswahl.
 * - Fachplanende nur, wenn sie den Nachweis aufgestellt haben (zweites Kästchen).
 * - Prüfbericht(e) Nr.: „gilt nur wenn der Nachweis nicht von mir aufgestellt worden ist“ (zweites Kästchen); „bis“
 *   nur bei mehreren Prüfberichten.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { angabenBauvorhaben, ergebnis, unterschrift } from './sachverstaendige';
import { angekreuzt, gruppeV, s, wenn, zaehltNicht } from './hilfen';

const fachplanend = wenn(angekreuzt('0:CheckBox2'));

export const nw040003_2022L: FormularProfil = zusammen(angabenBauvorhaben('Panel2', fachplanend), ergebnis('Panel8', 'II. Ergebnis der Prüfung'), unterschrift(), {
  abschnitte: { '0:-': { titel: 'Zur Bescheinigung gehören' } },
  feldTitel: {
    '0:CheckBox1': 'Der von mir aufgestellte Nachweis über den Schallschutz erfüllt die Anforderungen',
    '0:CheckBox2': 'Der von der/dem Fachplanenden aufgestellte und von mir geprüfte Nachweis über den Schallschutz erfüllt die Anforderungen',
    '0:Memo29': 'Prüfbericht(e) Nr. (nur wenn der Nachweis nicht von mir aufgestellt ist)',
    '0:Memo30': 'Prüfbericht(e): bis Nr. (bei mehreren)',
  },
  zaehlt: zaehltNicht('0:Memo30'),
  gruppen: [gruppeV('ergebnis', 'Nachweis selbst aufgestellt oder von Fachplanenden aufgestellt und geprüft', 'eins', s(0)('CheckBox1', 'CheckBox2'))],
  bedingungen: { '0:Memo29': fachplanend },
});

export const vorgaben: Record<string, FormularProfil> = { 'nw040003|2022L': nw040003_2022L };
