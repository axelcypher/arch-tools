/**
 * Anlage 2 zur GEG-UVO NRW – Unternehmererklärung (§ 96 Absatz 1 Nummer 1 bis 8 GEG), Stand 2022. Das ausführende
 * Unternehmen füllt sie aus.
 *
 * Nach dem Vordruck: Von den Nummern 1 bis 8 wird angekreuzt, was geändert oder eingebaut wurde – mindestens eine.
 * Zu Nr. 3 (Zentralheizung) gehören die Anlagenaufwandszahl und wofür sie gilt (Heizung, Warmwasser, Lüftung), zu
 * Nr. 7 (Klima- und raumlufttechnische Anlagen) die elektrische Leistung und der Wärmerückgewinnungsgrad – jeweils
 * nur, wenn die Nummer angekreuzt ist.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { angekreuzt, fuer, gruppeV, s, wenn } from './hilfen';

const s0 = s(0);
const nr3 = wenn(angekreuzt('0:CheckBox3'));
const nr7 = wenn(angekreuzt('0:CheckBox10'));

export const nw040002_2022L: FormularProfil = zusammen({
  abschnitte: {
    '0:Panel2': { titel: 'Unternehmen' },
    '0:Panel1': { titel: 'Maßnahme und Gebäude' },
    '0:Panel6': { titel: 'Geänderte oder eingebaute Bau- oder Anlagenteile (Nr. 1 bis 8)' },
    '0:Panel9': { titel: 'Bestätigung des ausführenden Unternehmens' },
  },
  feldTitel: {
    '0:Memo3': 'Unternehmen: Name, Vorname, Firma',
    '0:Memo4': 'Unternehmen: Straße, Hausnummer',
    '0:Memo5': 'Unternehmen: PLZ, Ort',
    '0:Memo8': 'Unternehmen: E-Mail',
    '0:Memo9': 'Maßnahme',
    '0:Memo11': 'Gebäude',
    '0:Memo12': 'Gebäude: Straße',
    '0:Memo13': 'Gebäude: PLZ, Ort',
    '0:CheckBox1': 'Nr. 1 Änderung von Außenbauteilen (§ 48 GEG)',
    '0:CheckBox2': 'Nr. 2 Dämmung oberster Geschossdecken (§ 47 Absatz 1 GEG)',
    '0:CheckBox3': 'Nr. 3 Einbau von Zentralheizungen (§§ 61 bis 63 GEG)',
    '0:Memo1': 'Nr. 3 Anlagenaufwandszahl',
    '0:CheckBox4': 'Nr. 3 Anlagenaufwandszahl einschließlich Heizung',
    '0:CheckBox5': 'Nr. 3 Anlagenaufwandszahl einschließlich Warmwasser',
    '0:CheckBox6': 'Nr. 3 Anlagenaufwandszahl einschließlich Lüftung',
    '0:CheckBox7': 'Nr. 4 Regelungseinrichtungen für Zentralheizungen (§§ 61 bis 63 GEG)',
    '0:CheckBox8': 'Nr. 5 Umwälzpumpen und Zirkulationspumpen (§ 64 GEG)',
    '0:CheckBox9': 'Nr. 6 Wärme- und Kälteverteilungs-, Warm- und Kaltwasserleitungen (§§ 69 bis 71 GEG)',
    '0:CheckBox10': 'Nr. 7 Klima- und raumlufttechnische Anlagen (§§ 65 bis 68 GEG)',
    '0:Memo2': 'Nr. 7 Elektrische Leistung',
    '0:Memo6': 'Nr. 7 Wärmerückgewinnungsgrad',
    '0:CheckBox11': 'Nr. 8 Einrichtung zur Feuchteregelung (§ 66 GEG)',
    '0:Memo28': 'Ort, Datum',
  },
  zaehlt: {},
  gruppen: [
    gruppeV('nummern', 'Geänderte oder eingebaute Teile: mindestens eine Nummer', 'eins', s0('CheckBox1', 'CheckBox2', 'CheckBox3', 'CheckBox7', 'CheckBox8', 'CheckBox9', 'CheckBox10', 'CheckBox11')),
    gruppeV('aufwandszahl', 'Nr. 3 Anlagenaufwandszahl einschließlich Heizung, Warmwasser oder Lüftung', 'eins', s0('CheckBox4', 'CheckBox5', 'CheckBox6'), { bedingung: nr3 }),
  ],
  bedingungen: {
    '0:Memo1': nr3,
    ...fuer(s0('Memo2', 'Memo6'), nr7),
  },
});

export const vorgaben: Record<string, FormularProfil> = { 'nw040002|2022L': nw040002_2022L };
