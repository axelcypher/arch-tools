/**
 * Bescheinigung nach § 12 Absatz 1 SV-VO über die Prüfung der Standsicherheit (§§ 63 Absatz 4, 64 bis 66 i. V. m.
 * § 68 Absatz 1 BauO NRW 2018), Stand 2022L. Füllt die sachverständige Person aus.
 *
 * Nach dem Vordruck:
 * - Den Standsicherheitsnachweis stellen die Tragwerksplanenden auf – die Fachplanenden zählen.
 * - II.: Einzelnachweise nach § 8 BauPrüfVO später einzureichen – „Ankreuzen, falls zutreffend“: zählt nicht.
 * - Prüfbericht(e) Nr. … vom … , … – das zweite Datum nur bei mehreren Prüfberichten.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { angabenBauvorhaben, ergebnis, pruefberichte, unterschrift } from './sachverstaendige';
import { zaehltNicht } from './hilfen';

export const nw040005_2022L: FormularProfil = zusammen(
  angabenBauvorhaben('Panel1', 'pflicht'),
  ergebnis('Panel99', 'II. Ergebnis der Prüfung'),
  unterschrift(),
  pruefberichte('Memo29', 'Memo30', 'Memo31'),
  {
    feldTitel: { '0:CheckBox1': 'Einzelnachweise nach § 8 BauPrüfVO sind nach Erteilung der Baugenehmigung, rechtzeitig vor der Bauausführung einzureichen' },
    zaehlt: zaehltNicht('0:CheckBox1'),
  },
);

export const vorgaben: Record<string, FormularProfil> = { 'nw040005|2022L': nw040005_2022L };
