/**
 * Anlage I/2 zur VV BauPrüfVO – Antrag im vereinfachten Baugenehmigungsverfahren (§ 64 BauO NRW 2018), Stand 2026.
 *
 * Bedingungen nach dem Vordruck selbst (Hinweise in den Nummern) und der BauPrüfVO:
 * - Unterlagen nur beim Bauantrag („Einem Antrag auf Vorbescheid sind nur die für die Klärung der Fragestellung
 *   erforderlichen Unterlagen beizufügen“).
 * - Nr. 2 Maß der baulichen Nutzung: „nur im Bereich eines Bebauungsplans“ (auch eines einfachen); Nr. 3 Flurkarte
 *   und Nr. 4 Basiskarte: „nur bei Vorhaben nach den §§ 34 oder 35 BauGB“ (auch im einfachen Bebauungsplan).
 * - Nr. 6 Baubeschreibung: entfällt beim Einfamilienhaus.
 * - Nr. 7.1 bis 7.3 Kosten: eine Angabe; die Herstellungssumme bei 7.3. Bei einer Änderung und bei baulichen
 *   Anlagen, die keine Gebäude sind, muss es die Herstellungssumme sein (7.1/7.2 genügen dann nicht).
 * - Nr. 8 Betriebsbeschreibung bei jedem gewerblichen oder landwirtschaftlichen Betrieb (Nichtwohngebäude, auch im
 *   Wohn- und Geschäftshaus, § 10 Abs. 1 Satz 1 Nr. 4 BauPrüfVO) – der Vordruck führt sie unter den Sonderbauten;
 *   Nr. 9 für Sonderbauten und Mittelgaragen (§ 12 BauPrüfVO).
 * - Nr. 11.1 Erklärung zum Brandschutz: Gebäudeklasse 1 bis 3 ohne Sonderbauten und ohne Mittelgarage; Nr. 11.2
 *   Bescheinigung: Gebäudeklasse 4 und 5 ohne Sonderbauten und Garagen über 100 m² bis 1.000 m² (Mittelgaragen, auch
 *   wenn sie als Sonderbau gelten – deren Brandschutz prüft die Behörde nicht, § 64 Abs. 1 Satz 2 BauO NRW 2018). Bei
 *   anderen Sonderbauten keins von beiden (die Bauaufsichtsbehörde prüft, § 68 Abs. 2 Satz 5), bei baulichen Anlagen,
 *   die keine Gebäude sind, ebenso.
 * - Art des Gebäudes und Nr. 12 Baustatistik: nur bei Gebäuden (nicht bei „Sonstige bauliche Anlage“).
 */

import type { FormularProfil } from '../profil';
import { blatt2, kopf, personen, unterschriften, zusammen } from './antrag';
import {
  MIT_BETRIEB,
  brandschutzBescheinigung,
  gebaeudeImVordruck,
  keinEinfamilienhaus,
  nurBebauungsplan,
  nurGebaeudeStatistik,
  nurInnenAussenBasiskarte,
  nurInnenAussenFlurkarte,
  ohneHerstellungssumme,
} from './grundlagen';
import { angekreuzt, begruendet, gruppeV, ist, nichtAngekreuzt, oder, q, s, und, wenn, zaehltNicht } from './hilfen';

const s0 = s(0);
const s1 = s(1);
const s2 = s(2);
const bauantrag = angekreuzt('0:CheckBox1');
const sonderbau = oder(ist('Sonderbau', 'ja'), angekreuzt('0:CheckBox26'), angekreuzt('0:CheckBox25'));
/** Garage mit über 100 m² bis 1.000 m² Nutzfläche (Mittelgarage) */
const mittelgarage = angekreuzt('0:CheckBox24');
/** ein Gebäude: „Sonstige bauliche Anlage“ nicht angekreuzt oder eine Gebäudeklasse angekreuzt (siehe gebaeudeImVordruck) */
const gebaeude = gebaeudeImVordruck('0:CheckBox22', s0('CheckBox4', 'CheckBox5', 'CheckBox6', 'CheckBox7', 'CheckBox8'));
const NUR_GEBAEUDE = 'Nur bei Gebäuden – nicht bei baulichen Anlagen, die keine Gebäude sind („Sonstige bauliche Anlage“).';

export const nw010002_2026I: FormularProfil = zusammen(kopf, personen, blatt2, unterschriften(2), {
  abschnitte: {
    '0:Panel8': { titel: 'Gebäudeklasse und Art des Gebäudes' },
    '1:Panel1': { titel: 'Erforderliche Unterlagen (Bauantrag)', bedingung: wenn(bauantrag) },
    // die Bedingungen hängen an den Feldern (R-04): die Betriebsbeschreibung gehört nicht nur zu Sonderbauten
    '2:Panel1': { titel: 'Nr. 8 Betriebsbeschreibung, Nr. 9 Zusätzliche Bauvorlagen für Sonderbauten' },
    '2:Panel2': { titel: 'Nr. 10 Bescheinigung der Übereinstimmung mit § 6 BauO NRW 2018 (freiwillig)' },
    '2:Panel3': { titel: 'Nr. 11 Unterlagen zum Brandschutz', bedingung: wenn(bauantrag) },
    '2:Panel4': { titel: 'Nr. 12 Erhebungsbogen für die Baustatistik' },
    '2:Panel5': { titel: 'Nr. 13 Angaben zum Artenschutz' },
  },
  feldTitel: {
    '0:CheckBox28': 'Standardgebäude (§ 2 Absatz 2 Satz 2 BauO NRW 2018)',
    '0:CheckBox26': 'Sonderbau (kein großer Sonderbau)',
    '0:CheckBox27': 'Wohngebäude',
    '0:CheckBox25': 'Sonderbau nach § 64 Absatz 2 BauO NRW 2018 (Erneuerbare-Energien-Richtlinie)',
    '0:CheckBox24': 'Garage mit über 100 m² bis 1.000 m² Nutzfläche',
    '1:Memo4': 'Bezeichnung des Vorhabens',
    '1:CheckBox1': 'Nr. 1 Lageplan / amtlicher Lageplan (3-fach)',
    '1:CheckBox2': 'Nr. 2 Berechnung des Maßes der baulichen Nutzung (3-fach)',
    '1:CheckBox3': 'Nr. 3 Beglaubigter Auszug aus der Flurkarte (3-fach) – entfällt bei amtlichem Lageplan (§ 2 Absatz 2 Satz 3 BauPrüfVO)',
    '1:CheckBox4': 'Nr. 4 Auszug aus der amtlichen Basiskarte 1:5000 (3-fach)',
    '1:CheckBox5': 'Nr. 5 Bauzeichnungen (3-fach)',
    '1:CheckBox6': 'Nr. 6 Baubeschreibung auf amtlichem Vordruck (3-fach)',
    '1:CheckBox7': 'Nr. 7.1 Berechnung des umbauten Raums nach DIN 277 (2-fach)',
    '1:CheckBox8': 'Nr. 7.2 Berechnung der Rohbaukosten (2-fach)',
    '1:CheckBox9': 'Nr. 7.3 Herstellungssumme (Änderung, bauliche Anlagen ohne Gebäude)',
    '1:Memo5': 'Herstellungssumme einschließlich Umsatzsteuer',
    '2:CheckBox1': 'Nr. 8 Betriebsbeschreibung auf amtlichem Vordruck (3-fach)',
    '2:CheckBox2': 'Nr. 9 Zusätzliche Angaben und Bauvorlagen für besondere Vorhaben (3-fach)',
    '2:CheckBox3': 'Nr. 10 Bescheinigung der Übereinstimmung mit § 6 BauO NRW 2018',
    '2:CheckBox4': 'Nr. 11.1 Erklärung der/des Entwurfsverfassenden (§ 68 Absatz 2 Satz 2 BauO NRW 2018)',
    '2:CheckBox5': 'Nr. 11.2 Bescheinigung einer sachverständigen Person zum Brandschutz (2-fach)',
    '2:CheckBox6': 'Nr. 12 Erhebungsbogen für die Baustatistik',
    '2:CheckBox7': 'Nr. 13 Angaben zum Artenschutz',
  },
  zaehlt: zaehltNicht('2:CheckBox3'),
  gruppen: [
    gruppeV('art', 'Art des Gebäudes (alle zutreffenden)', 'eins', s0('CheckBox28', 'CheckBox26', 'CheckBox27', 'CheckBox25', 'CheckBox24'), {
      bedingung: begruendet(gebaeude, NUR_GEBAEUDE),
    }),
    gruppeV('kosten', 'Nr. 7 Rauminhalt, Rohbaukosten oder Herstellungssumme', 'eins', s1('CheckBox7', 'CheckBox8', 'CheckBox9')),
    // beim Sonderbau weder Erklärung noch Bescheinigung: die Bauaufsichtsbehörde prüft (R-06) – außer bei der
    // Mittelgarage: deren Brandschutz prüft sie nicht, die Bescheinigung ist Pflicht
    gruppeV('brandschutz', 'Nr. 11 Erklärung oder Bescheinigung zum Brandschutz', 'eins', s2('CheckBox4', 'CheckBox5'), {
      bedingung: begruendet(
        oder(mittelgarage, und(ist('Sonderbau', 'nein'), gebaeude)),
        'Bei Sonderbauten prüft die Bauaufsichtsbehörde den Brandschutz (auch durch Prüfingenieure) – außer bei Garagen bis 1.000 m² Nutzfläche: Für Mittelgaragen bleibt die Bescheinigung (Nr. 11.2) Pflicht. Bei baulichen Anlagen, die keine Gebäude sind, entfällt Nr. 11.',
        q('bauo-nrw', '68', 2, 5),
        q('bauo-nrw', '64', 1, 2),
        q('bauo-nrw', '68', 2, 3),
      ),
    }),
  ],
  bedingungen: {
    '1:CheckBox2': nurBebauungsplan,
    '1:CheckBox3': nurInnenAussenFlurkarte,
    '1:CheckBox4': nurInnenAussenBasiskarte,
    '1:CheckBox6': keinEinfamilienhaus,
    '1:CheckBox7': ohneHerstellungssumme(gebaeude),
    '1:CheckBox8': ohneHerstellungssumme(gebaeude),
    '1:Memo5': wenn(angekreuzt('1:CheckBox9')),
    '2:CheckBox1': begruendet(
      und(bauantrag, MIT_BETRIEB),
      'Die Betriebsbeschreibung gehört im vereinfachten Verfahren zu jedem gewerblichen oder landwirtschaftlichen Betrieb – nicht nur zu Sonderbauten (der Vordruck führt sie unter den Sonderbauten auf), auch zum Betrieb in einem Wohn- und Geschäftshaus. Bei gewerblichen Anlagen ohne Gebäude selbst prüfen.',
      q('baupruefvo', '10', 1, 1, 4),
      q('baupruefvo', '5', 2),
      q('baupruefvo', '5', 3),
    ),
    '2:CheckBox2': begruendet(
      und(bauantrag, oder(sonderbau, mittelgarage)),
      'Zusätzliche Angaben nach § 12 BauPrüfVO nur bei Sonderbauten (z. B. Versammlungs-, Beherbergungs-, Verkaufsstätten) und Mittel- oder Großgaragen (Zahl, Abmessung und Kennzeichnung der Einstellplätze und Fahrgassen). Bei Sonderbauten gehört das Brandschutzkonzept hierher (§ 9 BauPrüfVO).',
      q('baupruefvo', '12'),
      q('baupruefvo', '12', 4),
      q('bauo-nrw', '50', 1),
      q('baupruefvo', '9'),
    ),
    '2:CheckBox4': begruendet(
      und(ist('Gebäudeklasse', '1', '2', '3'), ist('Sonderbau', 'nein'), nichtAngekreuzt('0:CheckBox24')),
      'Die Erklärung der Entwurfsverfassenden genügt bei Gebäuden der Gebäudeklassen 1 bis 3 und Kleingaragen – für eine Mittelgarage (über 100 m² bis 1.000 m²) nicht: Für sie ist die Bescheinigung von Prüfsachverständigen nötig (Nr. 11.2); für ein Gebäude der Gebäudeklassen 1 bis 3 daneben ist die Erklärung erforderlich, soweit die Bescheinigung nur die Garage umfasst. Bei Sonderbauten prüft die Bauaufsichtsbehörde den Brandschutz (auch durch Prüfingenieure) – dann gehört das Brandschutzkonzept/der Brandschutznachweis zu Nr. 9.',
      q('bauo-nrw', '68', 2, 2),
      q('bauo-nrw', '68', 2, 3),
      q('bauo-nrw', '68', 2, 5),
    ),
    '2:CheckBox5': brandschutzBescheinigung(oder(und(ist('Gebäudeklasse', '4', '5'), ist('Sonderbau', 'nein')), mittelgarage)),
    '2:CheckBox6': nurGebaeudeStatistik(gebaeude, bauantrag),
    '2:CheckBox7': wenn(bauantrag),
  },
});

export const vorgaben: Record<string, FormularProfil> = { 'nw010002|2026I': nw010002_2026I };
