/**
 * Bescheinigung nach § 16 Absatz 3 SV-VO über die stichprobenhaften Kontrollen des Brandschutzes während der
 * Bauausführung (§ 84 Absatz 4 BauO NRW 2018), Stand 2022L. Füllt die sachverständige Person aus.
 *
 * Nach dem Vordruck: Teil II. ist reiner Text. Fachplanende nur, wenn beteiligt (wie nw040007). Berichte Nr. … bis …:
 * „bis“ nur bei mehreren Berichten.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { angabenBauvorhaben, kontrollberichte, unterschrift } from './sachverstaendige';

export const nw040008_2022L: FormularProfil = zusammen(angabenBauvorhaben('Panel1', 'optional'), unterschrift(), kontrollberichte);

export const vorgaben: Record<string, FormularProfil> = { 'nw040008|2022L': nw040008_2022L };
