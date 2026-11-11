/**
 * Baubeginnanzeige für genehmigungspflichtige und nach § 63 BauO NRW 2018 freigestellte Vorhaben (§ 74 BauO NRW
 * 2018; der Vordruck nennt § 74 Absatz 9), Fassung 2018, Stand 2021L.
 *
 * Bedingungen nach dem Vordruck und § 68 BauO NRW 2018 (bautechnische Nachweise, siehe vordruck2018.ts):
 * - „Die Baugenehmigung wurde am … erteilt“: nicht bei der Genehmigungsfreistellung (keine Baugenehmigung).
 * - Nr. 1 Schall- und Wärmeschutz: Der Vordruck nennt „Gebäude nach § 68 Abs. 2 oder Wohngebäude mit bis zu zwei
 *   Wohnungen“; nach geltendem Recht (§ 68 Abs. 4 Satz 2 BauO NRW 2018) entfällt er nur bei Wohngebäuden der
 *   Gebäudeklassen 1 und 2 – das Zweifamilienhaus der Gebäudeklasse 3 braucht ihn (R-10).
 * - Nr. 2 Standsicherheit: immer eine Angabe (qualifizierte Tragwerksplanung für Gebäude nach § 68 Absatz 2,
 *   sonst Bescheinigung oder Prüfung).
 * - Nr. 3 Brandschutz: „nicht erforderlich bei Gebäuden der Gebäudeklasse 1 bis 3“ – nur bei Gebäudeklasse 4 und 5;
 *   bei Sonderbauten prüft die Bauaufsichtsbehörde.
 * Die Unterschrift zählt nicht.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { anzeigeKopf, bauleitende, grundstueck, nachweise } from './vordruck2018';
import { begruendet, gruppeV, istNicht, q, s, wenn, zaehltNicht } from './hilfen';

const s1 = s(1);

export const nw030001_2021L: FormularProfil = zusammen(anzeigeKopf, grundstueck(['Memo17', 'Memo18', 'Memo19', 'Memo20', 'Memo21']), bauleitende, {
  abschnitte: {
    '0:-': { titel: 'Baubeginn und Baugenehmigung' },
    '1:Panel1': { titel: 'Nr. 1 Nachweise Schall- und Wärmeschutz', bedingung: nachweise.nichtAbsatz2Gebaeude },
    '1:Panel2': { titel: 'Nr. 2 Nachweis der Standsicherheit' },
    '1:Panel3': { titel: 'Nr. 3 Nachweis des baulichen Brandschutzes', bedingung: nachweise.brandschutz },
    '1:Panel4': { titel: 'Ort, Datum, Unterschrift' },
  },
  feldTitel: {
    '0:Memo23': 'Baubeginn voraussichtlich am',
    '0:Memo24': 'Baugenehmigung erteilt am',
    '1:CheckBox1': 'Schall- und Wärmeschutz: Bescheinigungen der/des staatlich anerkannten Sachverständigen liegen bei',
    '1:CheckBox2': 'Schall- und Wärmeschutz: bei der Bauaufsichtsbehörde (Prüfung der bautechnischen Nachweise)',
    '1:CheckBox3': 'Standsicherheit: von der/dem qualifizierten Tragwerksplanenden (Gebäude nach § 68 Absatz 2)',
    '1:CheckBox4': 'Standsicherheit: Bescheinigung der/des staatlich anerkannten Sachverständigen liegt bei',
    '1:CheckBox5': 'Standsicherheit: bei der Bauaufsichtsbehörde (Prüfung der bautechnischen Nachweise)',
    '1:CheckBox6': 'Brandschutz: Bescheinigung der/des staatlich anerkannten Sachverständigen liegt bei',
    '1:CheckBox7': 'Brandschutz: bei der Bauaufsichtsbehörde (Prüfung der bautechnischen Nachweise)',
    '1:Memo1': 'Ort, Datum',
    '1:Memo2': 'Bauherrschaft / Bevollmächtigte (Unterschrift)',
  },
  zaehlt: zaehltNicht('1:Memo2'),
  gruppen: [
    gruppeV('schall-waerme', 'Nr. 1 Schall- und Wärmeschutz: Sachverständige oder Bauaufsichtsbehörde', 'eins', s1('CheckBox1', 'CheckBox2')),
    gruppeV('standsicherheit', 'Nr. 2 Standsicherheit: Tragwerksplanende, Sachverständige oder Bauaufsichtsbehörde', 'eins', s1('CheckBox3', 'CheckBox4', 'CheckBox5')),
    gruppeV('brandschutz', 'Nr. 3 Brandschutz: Sachverständige oder Bauaufsichtsbehörde', 'eins', s1('CheckBox6', 'CheckBox7')),
  ],
  bedingungen: {
    '0:Memo24': begruendet(wenn(istNicht('Verfahren', 'Genehmigungsfreistellung')), 'Bei der Genehmigungsfreistellung gibt es keine Baugenehmigung.', q('bauo-nrw', '63', 1)),
  },
});

export const vorgaben: Record<string, FormularProfil> = { 'nw030001|2021L': nw030001_2021L };
