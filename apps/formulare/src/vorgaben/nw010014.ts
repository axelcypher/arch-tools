/**
 * Anlage I/11 zur VV BauPrüfVO – Merkblatt zur gesetzlichen Gebäudeeinmessungspflicht (§ 16 Absatz 2 VermKatG NRW),
 * Stand 2026.
 *
 * Reines Merkblatt ohne Eingabefelder: nichts auszufüllen, nichts zu schalten. Die Vorgabe ist leer und hält nur
 * fest, dass das Formular geprüft ist.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';

export const nw010014_2026C: FormularProfil = zusammen({});

export const vorgaben: Record<string, FormularProfil> = { 'nw010014|2026C': nw010014_2026C };
