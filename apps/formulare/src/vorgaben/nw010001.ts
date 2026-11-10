/**
 * Anlage I/1 zur VV BauPrüfVO – Antrag im Baugenehmigungsverfahren (§ 65 BauO NRW 2018, große Sonderbauten),
 * Stand 2026.
 *
 * Bedingungen nach dem Vordruck und der BauPrüfVO:
 * - Unterlagen nur beim Bauantrag (beim Vorbescheid nur die für die Fragestellung nötigen).
 * - Nr. 2 Maß der baulichen Nutzung nur im Bereich eines Bebauungsplans, Nr. 3 Flurkarte nur nach §§ 34, 35 BauGB.
 * - Nr. 6 Baubeschreibung entfällt beim Einfamilienhaus; Nr. 8 Barrierefrei-Konzept nur, wenn gefordert (§ 9a
 *   BauPrüfVO); Nr. 9 Betriebsbeschreibung für Betriebe (Nichtwohngebäude).
 * - Nr. 10.1 bis 10.3 Kosten: eine Angabe; die Herstellungssumme bei 10.3.
 */

import type { FormularProfil } from '../profil';
import { blatt2, kopf, personen, unterschriften, zusammen } from './antrag';
import { keinEinfamilienhaus, nurBebauungsplan, nurBetrieb, nurInnenAussen } from './grundlagen';
import { angekreuzt, gruppeV, s, wenn, zaehltNicht } from './hilfen';

const s1 = s(1);
const bauantrag = angekreuzt('0:CheckBox1');

export const nw010001_2026I: FormularProfil = zusammen(kopf, personen, blatt2, unterschriften(2), {
  abschnitte: {
    '0:Panel8': { titel: 'Gebäudeklasse' },
    '1:Panel1': { titel: 'Erforderliche Unterlagen (Bauantrag)', bedingung: wenn(bauantrag) },
    '1:Panel4': { titel: 'Nr. 11 Bescheinigung der Übereinstimmung mit § 6 BauO NRW 2018 (freiwillig)' },
    '2:Panel4': { titel: 'Nr. 12 Erhebungsbogen für die Baustatistik' },
    '2:Panel5': { titel: 'Nr. 13 Angaben zum Artenschutz' },
  },
  feldTitel: {
    '0:Memo4': 'Bezeichnung des Vorhabens',
    '1:CheckBox1': 'Nr. 1 Lageplan / amtlicher Lageplan (3-fach)',
    '1:CheckBox2': 'Nr. 2 Berechnung des Maßes der baulichen Nutzung (3-fach)',
    '1:CheckBox3': 'Nr. 3 Beglaubigter Auszug aus der Flurkarte (3-fach)',
    '1:CheckBox4': 'Nr. 4 Auszug aus der amtlichen Basiskarte 1:5000 (3-fach)',
    '1:CheckBox5': 'Nr. 5 Bauzeichnungen (3-fach)',
    '1:CheckBox6': 'Nr. 6 Baubeschreibung auf amtlichem Vordruck (3-fach)',
    '1:CheckBox7': 'Nr. 7 Brandschutzkonzept (3-fach)',
    '1:CheckBox8': 'Nr. 8 Barrierefrei-Konzept (3-fach)',
    '1:CheckBox9': 'Nr. 9 Betriebsbeschreibung auf amtlichem Vordruck (3-fach)',
    '1:CheckBox34': 'Nr. 10.1 Berechnung des umbauten Raums nach DIN 277 (2-fach)',
    '1:CheckBox35': 'Nr. 10.2 Berechnung der Rohbaukosten (2-fach)',
    '1:CheckBox36': 'Nr. 10.3 Herstellungssumme (Änderung, bauliche Anlagen ohne Gebäude)',
    '1:Memo4': 'Herstellungssumme einschließlich Umsatzsteuer',
    '1:CheckBox37': 'Nr. 11 Bescheinigung der Übereinstimmung mit § 6 BauO NRW 2018',
    '2:CheckBox6': 'Nr. 12 Erhebungsbogen für die Baustatistik',
    '2:CheckBox7': 'Nr. 13 Angaben zum Artenschutz',
  },
  zaehlt: zaehltNicht('1:CheckBox8', '1:CheckBox37'),
  gruppen: [gruppeV('kosten', 'Nr. 10 Rauminhalt, Rohbaukosten oder Herstellungssumme', 'eins', s1('CheckBox34', 'CheckBox35', 'CheckBox36'))],
  bedingungen: {
    '1:CheckBox2': nurBebauungsplan,
    '1:CheckBox3': nurInnenAussen,
    '1:CheckBox6': keinEinfamilienhaus,
    '1:CheckBox9': nurBetrieb,
    '1:Memo4': wenn(angekreuzt('1:CheckBox36')),
    '2:CheckBox6': wenn(bauantrag),
    '2:CheckBox7': wenn(bauantrag),
  },
});

export const vorgaben: Record<string, FormularProfil> = { 'nw010001|2026I': nw010001_2026I };
