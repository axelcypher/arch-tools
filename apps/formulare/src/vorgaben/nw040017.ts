/**
 * Bescheinigung nach § 23 Absatz 1 SV-VO über die energetischen Nachweise (§ 2 Absatz 2 Nummer 1 und 2 GEG-UVO),
 * Stand 2023L. „Das Formular darf ausschließlich von einem saSV … verwendet werden“ – dessen Angaben zählen.
 *
 * Nach dem Vordruck:
 * - 2. Prüfungsergebnis: das eine Kästchen ist die Bescheinigung selbst – zählt.
 * - Nachweise „von mir oder der/dem Fachplanenden aufgestellt“ – Fachplanende nur, wenn beteiligt.
 * - Prüfbericht(e) Nr. … bis …: „nur wenn der Nachweis nicht von einem saSV aufgestellt wurde“ – das zeigt kein Feld
 *   des Vordrucks an, deshalb zählen die Nummern nicht. Verteiler: freiwillig.
 * - Die beiden Rahmen ohne Namen (Prüf-Nr. oben, „Der Bescheinigung zugehörig“ unten) haben dieselbe Kennung „0:-“ –
 *   kein Abschnittstitel.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { angabenBauvorhaben, ergebnis, unterschrift } from './sachverstaendige';
import { zaehltNicht } from './hilfen';

export const nw040017_2023L: FormularProfil = zusammen(angabenBauvorhaben('Panel2', 'optional'), ergebnis('Panel8', '2. Prüfungsergebnis'), unterschrift('3. Unterschrift'), {
  feldTitel: {
    '0:Memo29': 'Prüf-Nr. / Aktenzeichen der sachverständigen Person',
    '0:CheckBox1': 'Die energetischen Nachweise entsprechen den geltenden Vorschriften, die Anforderungen des GEG sind erfüllt',
    '0:Memo1': 'Prüfbericht(e) Nr. (nur wenn der Nachweis nicht von einem saSV aufgestellt wurde)',
    '0:Memo2': 'Prüfbericht(e): bis Nr. (bei mehreren)',
    '0:Memo10': 'Verteiler',
  },
  zaehlt: zaehltNicht('0:Memo1', '0:Memo2', '0:Memo10'),
});

export const vorgaben: Record<string, FormularProfil> = { 'nw040017|2023L': nw040017_2023L };
