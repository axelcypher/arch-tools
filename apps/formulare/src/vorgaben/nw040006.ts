/**
 * Bescheinigung nach § 12 Absatz 2 SV-VO über die stichprobenhaften Kontrollen der Standsicherheit während der
 * Bauausführung (§ 84 Absatz 4 BauO NRW 2018), Stand 2022L. Füllt die sachverständige Person aus.
 *
 * Nach dem Vordruck: Teil II. ist reiner Text. Den Standsicherheitsnachweis stellen die Tragwerksplanenden auf – die
 * Fachplanenden zählen. Berichte Nr. … bis …: „bis“ nur bei mehreren Berichten.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { angabenBauvorhaben, kontrollberichte, unterschrift } from './sachverstaendige';

export const nw040006_2022L: FormularProfil = zusammen(angabenBauvorhaben('Panel1', 'pflicht'), unterschrift(), kontrollberichte);

export const vorgaben: Record<string, FormularProfil> = { 'nw040006|2022L': nw040006_2022L };
