/**
 * Bescheinigung nach § 19 SV-VO über den Erd- und Grundbau (§§ 63 Absatz 4, 64 bis 66 i. V. m. § 68 Absatz 1
 * BauO NRW 2018), Stand 2022L. Füllt die sachverständige Person aus.
 *
 * Nach dem Vordruck: Teil II. ist reiner Text. Die Nachweise zur Bodenmechanik und zum Erd- und Grundbau stellen
 * Fachplanende (Tragwerksplanung/Geotechnik) auf – sie zählen. Prüfbericht(e) Nr. … vom … , … – das zweite Datum
 * nur bei mehreren Prüfberichten.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { angabenBauvorhaben, pruefberichte, unterschrift } from './sachverstaendige';

export const nw040009_2022L: FormularProfil = zusammen(angabenBauvorhaben('Panel1', 'pflicht'), unterschrift(), pruefberichte('Memo29', 'Memo30', 'Memo31'));

export const vorgaben: Record<string, FormularProfil> = { 'nw040009|2022L': nw040009_2022L };
