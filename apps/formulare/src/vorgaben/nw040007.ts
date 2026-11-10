/**
 * Bescheinigung nach § 16 Absatz 1 SV-VO über die Prüfung des Brandschutzes (§§ 63 Absatz 4, 64 bis 66 i. V. m.
 * § 68 Absatz 1 BauO NRW 2018), Stand 2022L. Füllt die sachverständige Person aus.
 *
 * Nach dem Vordruck: Teil II. ist reiner Text. Die brandschutztechnischen Nachweise kann auch die/der
 * Entwurfsverfassende aufstellen – Fachplanende nur, wenn beteiligt. Prüfbericht(e) Nr. … vom … , … – das zweite
 * Datum nur bei mehreren Prüfberichten.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { angabenBauvorhaben, pruefberichte, unterschrift } from './sachverstaendige';

export const nw040007_2022L: FormularProfil = zusammen(angabenBauvorhaben('Panel1', 'optional'), unterschrift(), pruefberichte('Memo10', 'Memo29', 'Memo30'));

export const vorgaben: Record<string, FormularProfil> = { 'nw040007|2022L': nw040007_2022L };
