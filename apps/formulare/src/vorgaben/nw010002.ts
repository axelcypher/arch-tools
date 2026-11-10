/**
 * Anlage I/2 zur VV BauPrüfVO – Antrag im vereinfachten Baugenehmigungsverfahren (§ 64 BauO NRW 2018), Stand 2026.
 *
 * Bedingungen nach dem Vordruck selbst (Hinweise in den Nummern) und der BauPrüfVO:
 * - Unterlagen nur beim Bauantrag („Einem Antrag auf Vorbescheid sind nur die für die Klärung der Fragestellung
 *   erforderlichen Unterlagen beizufügen“).
 * - Nr. 2 Maß der baulichen Nutzung: „nur im Bereich eines Bebauungsplans“; Nr. 3 Flurkarte: „nur bei Vorhaben nach
 *   den §§ 34 oder 35 BauGB“.
 * - Nr. 6 Baubeschreibung: entfällt beim Einfamilienhaus.
 * - Nr. 7.1 bis 7.3 Kosten: eine Angabe; die Herstellungssumme bei 7.3.
 * - Nr. 8 und 9 nur für Sonderbauten (die Betriebsbeschreibung nur für Nichtwohngebäude).
 * - Nr. 11.2 Bescheinigung zum Brandschutz: Gebäudeklasse 4 und 5 ohne Sonderbauten, Garagen über 100 m² bis 1.000 m².
 */

import type { FormularProfil } from '../profil';
import { blatt2, kopf, personen, unterschriften, zusammen } from './antrag';
import { brandschutzBescheinigung, keinEinfamilienhaus, nurBebauungsplan, nurBetrieb, nurInnenAussen } from './grundlagen';
import { angekreuzt, begruendet, gruppeV, ist, oder, q, s, und, wenn, zaehltNicht } from './hilfen';

const s0 = s(0);
const s1 = s(1);
const s2 = s(2);
const bauantrag = angekreuzt('0:CheckBox1');
const sonderbau = oder(ist('Sonderbau', 'ja'), angekreuzt('0:CheckBox26'), angekreuzt('0:CheckBox25'));

export const nw010002_2026I: FormularProfil = zusammen(kopf, personen, blatt2, unterschriften(2), {
  abschnitte: {
    '0:Panel8': { titel: 'Gebäudeklasse und Art des Gebäudes' },
    '1:Panel1': { titel: 'Erforderliche Unterlagen (Bauantrag)', bedingung: wenn(bauantrag) },
    '2:Panel1': {
      titel: 'Zusätzliche Bauvorlagen für Sonderbauten (Nr. 8 und 9)',
      bedingung: begruendet(
        und(bauantrag, sonderbau),
        'Diese Bauvorlagen gehören laut Vordruck nur zu Sonderbauten – und nur zum Bauantrag, nicht zum Vorbescheid.',
        q('baupruefvo', '12'),
        q('bauo-nrw', '50'),
      ),
    },
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
    '1:CheckBox3': 'Nr. 3 Beglaubigter Auszug aus der Flurkarte (3-fach)',
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
    gruppeV('art', 'Art des Gebäudes (alle zutreffenden)', 'eins', s0('CheckBox28', 'CheckBox26', 'CheckBox27', 'CheckBox25', 'CheckBox24')),
    gruppeV('kosten', 'Nr. 7 Rauminhalt, Rohbaukosten oder Herstellungssumme', 'eins', s1('CheckBox7', 'CheckBox8', 'CheckBox9')),
    gruppeV('brandschutz', 'Nr. 11 Erklärung oder Bescheinigung zum Brandschutz', 'eins', s2('CheckBox4', 'CheckBox5')),
  ],
  bedingungen: {
    '1:CheckBox2': nurBebauungsplan,
    '1:CheckBox3': nurInnenAussen,
    '1:CheckBox6': keinEinfamilienhaus,
    '1:Memo5': wenn(angekreuzt('1:CheckBox9')),
    '2:CheckBox1': nurBetrieb,
    '2:CheckBox5': brandschutzBescheinigung(oder(und(ist('Gebäudeklasse', '4', '5'), ist('Sonderbau', 'nein')), angekreuzt('0:CheckBox24'))),
    '2:CheckBox6': wenn(bauantrag),
    '2:CheckBox7': wenn(bauantrag),
  },
});

export const vorgaben: Record<string, FormularProfil> = { 'nw010002|2026I': nw010002_2026I };
