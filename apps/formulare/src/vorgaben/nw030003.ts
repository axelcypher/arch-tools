/**
 * Anzeige der abschließenden Fertigstellung (Vordruck: § 84 Absätze 2, 4 und 5 BauO NRW), Fassung 2018, Stand 2021L.
 *
 * Bedingungen nach dem Vordruck und § 68 BauO NRW 2018 (bautechnische Nachweise, siehe vordruck2018.ts):
 * - Gebäudeeinmessung (Auftrag an die Katasterbehörde oder Auftragsbestätigung der/des ÖbVI): eine Angabe, nur bei
 *   Errichtung oder Änderung eines Gebäudes (Einmessungspflicht nach dem Vermessungs- und Katastergesetz NRW).
 * - Nr. 1 Schall- und Wärmeschutz: „nicht erforderlich bei Gebäuden nach § 68 Abs. 2“.
 * - Nr. 2 Standsicherheit: „nicht erforderlich bei Gebäuden nach § 68“ (gemeint: Absatz 2).
 * - Nr. 3 Brandschutz: „nicht erforderlich bei Gebäuden der Gebäudeklasse 1 bis 3“ – nur bei Gebäudeklasse 4 und 5;
 *   bei Sonderbauten prüft die Bauaufsichtsbehörde. Die Bitte um eine Bescheinigung über die Besichtigung ist
 *   freiwillig.
 * Die Unterschrift zählt nicht.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { anzeigeKopf, bauleitende, grundstueck, nachweise } from './vordruck2018';
import { begruendet, gruppeV, ist, istNicht, s, und, zaehltNicht } from './hilfen';

const s0 = s(0);
const s1 = s(1);

export const nw030003_2021L: FormularProfil = zusammen(anzeigeKopf, grundstueck(['Memo17', 'Memo18', 'Memo19', 'Memo20', 'Memo21']), bauleitende, {
  abschnitte: {
    '0:-': { titel: 'Gebäudeeinmessung' },
    '1:Panel1': { titel: 'Nr. 1 Nachweise Schall- und Wärmeschutz', bedingung: nachweise.nichtAbsatz2Gebaeude },
    '1:Panel2': { titel: 'Nr. 2 Nachweis der Standsicherheit', bedingung: nachweise.nichtAbsatz2 },
    '1:Panel3': { titel: 'Nr. 3 Nachweis des baulichen Brandschutzes', bedingung: nachweise.brandschutz },
    '1:Panel4': { titel: 'Ort, Datum, Unterschrift' },
  },
  feldTitel: {
    '0:CheckBox1': 'Auftrag zur Gebäudeeinmessung ist der Katasterbehörde erteilt',
    '0:CheckBox2': 'Auftragsbestätigung der/des Öffentlich bestellten Vermessungsingenieurin/-ingenieurs ist beigefügt',
    '1:CheckBox1': 'Schall- und Wärmeschutz: Bescheinigungen der/des staatlich anerkannten Sachverständigen liegen bei',
    '1:CheckBox2': 'Schall- und Wärmeschutz: bei der Bauaufsichtsbehörde (Prüfung der bautechnischen Nachweise)',
    '1:CheckBox3': 'Standsicherheit: Bescheinigung der/des staatlich anerkannten Sachverständigen liegt bei',
    '1:CheckBox4': 'Standsicherheit: bei der Bauaufsichtsbehörde (Prüfung der bautechnischen Nachweise)',
    '1:CheckBox5': 'Brandschutz: Bescheinigung der/des staatlich anerkannten Sachverständigen liegt bei',
    '1:CheckBox6': 'Brandschutz: bei der Bauaufsichtsbehörde (Prüfung der bautechnischen Nachweise)',
    '1:CheckBox7': 'Brandschutz: Bescheinigung über das Ergebnis der Besichtigung erbeten',
    '1:Memo1': 'Ort, Datum',
    '1:Memo2': 'Bauherrschaft / Bevollmächtigte (Unterschrift)',
  },
  zaehlt: zaehltNicht('1:CheckBox7', '1:Memo2'),
  gruppen: [
    gruppeV('einmessung', 'Gebäudeeinmessung: Katasterbehörde oder Vermessungsingenieur/in beauftragt', 'eins', s0('CheckBox1', 'CheckBox2'), {
      bedingung: begruendet(
        und(ist('Vorhaben', 'Errichtung', 'Änderung'), istNicht('Gebäudeart', 'kein Gebäude')),
        'Die Gebäudeeinmessung ist bei der Errichtung oder Änderung von Gebäuden zu beauftragen (Vermessungs- und Katastergesetz NRW, siehe Merkblatt Anlage I/11).',
      ),
    }),
    gruppeV('schall-waerme', 'Nr. 1 Schall- und Wärmeschutz: Sachverständige oder Bauaufsichtsbehörde', 'eins', s1('CheckBox1', 'CheckBox2')),
    gruppeV('standsicherheit', 'Nr. 2 Standsicherheit: Sachverständige oder Bauaufsichtsbehörde', 'eins', s1('CheckBox3', 'CheckBox4')),
    gruppeV('brandschutz', 'Nr. 3 Brandschutz: Sachverständige oder Bauaufsichtsbehörde', 'eins', s1('CheckBox5', 'CheckBox6')),
  ],
});

export const vorgaben: Record<string, FormularProfil> = { 'nw030003|2021L': nw030003_2021L };
