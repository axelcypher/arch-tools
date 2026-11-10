/**
 * Bescheinigung nach § 23 Absatz 2 SV-VO über die stichprobenhaften Kontrollen des Schallschutzes während der
 * Bauausführung (§ 84 Absatz 4 BauO NRW 2018), Stand 2022L. Füllt die sachverständige Person aus.
 *
 * Nach dem Vordruck: Teil II. ist reiner Text. Fachplanende nur, wenn beteiligt (den Nachweis kann auch die
 * sachverständige Person selbst aufgestellt haben, vgl. nw040003). Berichte Nr. … bis …: „bis“ nur bei mehreren
 * Berichten.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { angabenBauvorhaben, kontrollberichte, unterschrift } from './sachverstaendige';

export const nw040004_2022L: FormularProfil = zusammen(angabenBauvorhaben('Panel2', 'optional'), unterschrift(), kontrollberichte);

export const vorgaben: Record<string, FormularProfil> = { 'nw040004|2022L': nw040004_2022L };
