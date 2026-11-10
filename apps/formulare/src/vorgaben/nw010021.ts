/**
 * Statistik der Baufertigstellungen (Hochbaustatistikgesetz, IT.NRW), Stand 2024: auszufüllen nach der
 * Bezugsfertigstellung vom Bauherrn/von der Bauherrin.
 *
 * - Identifikationsnummer und Bauscheinnummer/Aktenzeichen trägt die Behörde ein – zählen nicht.
 * - Ansprechpartner/-in für Rückfragen: „freiwillige Angabe“ – zählt nicht.
 * - Datum der Baugenehmigung und der Bezugsfertigstellung: Monat und Jahr in Ziffernkästchen – je eine Angabe.
 * - Angabe der Änderungen nur „Falls ‚Ja‘“ (Änderungen seit dem Erhebungsbogen für Baugenehmigung).
 *
 * Die Teile stehen in statistik.ts (auch Seite 3 des Baugenehmigungsbogens nw010020).
 */

import type { FormularProfil } from '../profil';
import { baufertigstellung } from './statistik';

export const nw010021_2024G: FormularProfil = baufertigstellung(0);

export const vorgaben: Record<string, FormularProfil> = { 'nw010021|2024G': nw010021_2024G };
