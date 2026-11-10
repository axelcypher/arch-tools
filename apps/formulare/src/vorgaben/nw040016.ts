/**
 * Erklärung nach § 68 Absatz 1 Satz 2 BauO NRW 2018 über die Beauftragung der stichprobenhaften Kontrollen während
 * der Bauausführung, Stand 2022L. Füllt die beauftragte sachverständige Person aus; die Bauherrschaft legt sie mit
 * der Anzeige des Baubeginns vor.
 *
 * Nach dem Vordruck: II. Fachbereiche der Beauftragung (Standsicherheit, baulicher Brandschutz, Schall- und
 * Wärmeschutz) – mindestens einer, als eine Angabe. Fachplanende nur, wenn beteiligt.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { angabenBauvorhaben, ergebnis, unterschrift } from './sachverstaendige';
import { gruppeV, s } from './hilfen';

export const nw040016_2022L: FormularProfil = zusammen(angabenBauvorhaben('Panel2', 'optional'), ergebnis('Panel8', 'II. Erklärung zum Baubeginn'), unterschrift(), {
  feldTitel: {
    '0:CheckBox1': 'Beauftragt mit Kontrollen: Standsicherheit',
    '0:CheckBox2': 'Beauftragt mit Kontrollen: baulicher Brandschutz',
    '0:CheckBox3': 'Beauftragt mit Kontrollen: Schall- und Wärmeschutz',
  },
  gruppen: [gruppeV('fachbereiche', 'Beauftragte Fachbereiche (mindestens einer)', 'eins', s(0)('CheckBox1', 'CheckBox2', 'CheckBox3'))],
});

export const vorgaben: Record<string, FormularProfil> = { 'nw040016|2022L': nw040016_2022L };
