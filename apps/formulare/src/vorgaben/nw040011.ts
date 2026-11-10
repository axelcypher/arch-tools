/**
 * Bescheinigung durch qualifizierte Tragwerksplanende über die stichprobenhaften Kontrollen der Standsicherheit
 * während der Ausführung (§ 68 Absatz 2 Satz 2 bzw. § 62 Absatz 3 Satz 3 BauO NRW 2018), Stand 2024F. Füllen die
 * Tragwerksplanenden aus; sie sind die Fachplanenden – die zählen.
 *
 * Nach dem Vordruck: II. gilt für Vorhaben nach § 68 Absatz 2 Satz 2 (Übereinstimmung des Standsicherheitsnachweises
 * mit der Bauausführung) oder nach § 62 Absatz 3 Satz 3 (Überwachung der Beseitigung) – eine Auswahl. Berichte Nr. …
 * bis …: „bis“ nur bei mehreren Berichten.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { angabenBauvorhaben, ergebnis, kontrollberichte, unterschrift } from './sachverstaendige';
import { gruppeV, s } from './hilfen';

export const nw040011_2024F: FormularProfil = zusammen(angabenBauvorhaben('Panel1', 'pflicht'), ergebnis('Panel99', 'II. Ergebnis der Prüfung'), unterschrift(), kontrollberichte, {
  feldTitel: {
    '0:CheckBox1': 'Vorhaben nach § 68 Absatz 2 Satz 2 BauO NRW: Übereinstimmung des Standsicherheitsnachweises mit der Bauausführung',
    '0:CheckBox2': 'Vorhaben nach § 62 Absatz 3 Satz 3 BauO NRW: Überwachung der Beseitigung',
  },
  gruppen: [gruppeV('vorhaben', 'Vorhaben nach § 68 Absatz 2 Satz 2 oder § 62 Absatz 3 Satz 3 BauO NRW', 'eins', s(0)('CheckBox1', 'CheckBox2'))],
});

export const vorgaben: Record<string, FormularProfil> = { 'nw040011|2024F': nw040011_2024F };
