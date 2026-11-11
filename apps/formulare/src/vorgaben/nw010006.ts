/**
 * Anlage I/4 zur VV BauPrüfVO – Bauantrag / Antrag auf Vorbescheid für eine Werbeanlage, Stand 2026.
 *
 * Nach dem Vordruck und der BauO NRW 2018:
 * - Bauvorlagen nur beim Bauantrag (beim Vorbescheid nur die für die Fragestellung nötigen, wie in Anlage I/1, I/2).
 * - „Vorhaben an der Stätte der Leistung“: ja oder nein; das Betriebsgrundstück nur bei „nein“.
 * - Bis zu drei Werbeanlagen (Spalten 1 bis 3): die erste ist anzugeben, die zweite und dritte nur, wenn ihre
 *   Bezeichnung eingetragen ist – dann Kosten, Art der Maßnahme und Werkstoffe.
 * - Ausladung, Abstand zur Fahrbahnkante und lichte Durchgangshöhe betreffen nur auskragende Anlagen, die Beleuchtung
 *   nur beleuchtete – nicht pauschal vorgeschrieben, zählen nicht.
 * - Lageplan 1 : 500 „bei freistehenden Werbeanlagen“ – ob eine Anlage freistehend ist, sagt kein Feld und kein
 *   Projektmerkmal; zählt deshalb nicht (bei freistehenden Anlagen selbst ankreuzen).
 * - Bauvorlageberechtigung (§ 67 Absatz 1 BauO NRW 2018) gilt für Gebäude – Name der bauvorlageberechtigten Person und
 *   Kammernummer zählen bei Werbeanlagen nicht.
 * - Denkmalrechtliche Erlaubnis: Bindung, nur wenn vorhanden.
 * Eingangsstempel/Aktenzeichen füllt die Behörde aus; Unterschriften sind freiwillig.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { angekreuzt, fuer, gruppeV, s, wenn, zaehltNicht } from './hilfen';

const s0 = s(0);
const s1 = s(1);
const bauantrag = angekreuzt('0:CheckBox1');
const anlage2 = wenn(angekreuzt('0:Memo26'));
const anlage3 = wenn(angekreuzt('0:Memo28'));

export const nw010006_2026C: FormularProfil = zusammen({
  abschnitte: {
    '0:Panel1': { titel: 'Untere Bauaufsichtsbehörde' },
    '0:Panel2': { titel: 'Eingangsstempel (füllt die Bauaufsichtsbehörde aus)' },
    '0:Panel3': { titel: 'Antrag' },
    '0:Panel5': { titel: 'Angaben zur Beurteilung, Bezeichnung und Beschreibung der Werbeanlagen' },
    '1:Panel1': { titel: 'Beschreibung der Werbeanlage: Beleuchtung (nur wenn beleuchtet)' },
    '1:Panel2': { titel: 'Erforderliche Bauvorlagen (Bauantrag)', bedingung: wenn(bauantrag) },
    '1:Panel3': { titel: 'Ort, Datum (Bauherrschaft)' },
    '1:Panel4': { titel: 'Ort, Datum (Entwurfsverfassende)' },
  },
  feldTitel: {
    '0:Memo1': 'Untere Bauaufsichtsbehörde (Anschrift)',
    '0:Memo2': 'Untere Bauaufsichtsbehörde: PLZ, Ort',
    '0:Memo3': 'Aktenzeichen der Bauaufsichtsbehörde',
    '0:CheckBox1': 'Bauantrag',
    '0:CheckBox2': 'Antrag auf Vorbescheid',
    '0:Memo5': 'Bauherrschaft: Name, Vorname, Firma',
    '0:Memo6': 'Bauherrschaft: Straße, Hausnummer',
    '0:Memo7': 'Bauherrschaft: PLZ, Ort',
    '0:Memo8': 'Bauherrschaft vertreten durch (Name, Vorname, Anschrift)',
    '0:Memo9': 'Bauherrschaft: Telefon',
    '0:Memo10': 'Bauherrschaft: Telefax',
    '0:Memo11': 'Bauherrschaft: E-Mail',
    '0:Memo12': 'Entwurfsverfassende: Name, Vorname, Firma',
    '0:Memo13': 'Entwurfsverfassende: Straße, Hausnummer',
    '0:Memo14': 'Entwurfsverfassende: PLZ, Ort',
    '0:Memo15': 'Bauvorlageberechtigte Person: Name, Vorname',
    '0:Memo16': 'Mitgliedsnummer der Architekten- oder Ingenieurkammer',
    '0:Memo17': 'Entwurfsverfassende: Telefon',
    '0:Memo18': 'Entwurfsverfassende: Telefax',
    '0:Memo19': 'Entwurfsverfassende: E-Mail',
    '0:Memo20': 'Baugrundstück: Ort, Straße, Hausnummer, Ortsteil',
    '0:Memo21': 'Baugrundstück: Gemarkung(en)',
    '0:Memo22': 'Baugrundstück: Flur(e)',
    '0:Memo23': 'Baugrundstück: Flurstück(e)',
    '0:CheckBox3': 'Vorhaben an der Stätte der Leistung: ja',
    '0:CheckBox4': 'Vorhaben an der Stätte der Leistung: nein',
    '0:Memo4': 'Betriebsgrundstück (Straße, Nummer)',
    '0:CheckBox5': 'Bindung: Denkmalrechtliche Erlaubnis',
    '0:Memo24': 'Anlage 1: Genaue Bezeichnung des Vorhabens',
    '0:Memo25': 'Anlage 1: Herstellungskosten einschl. Montage und Umsatzsteuer (€)',
    '0:CheckBox6': 'Anlage 1: Errichtung',
    '0:CheckBox7': 'Anlage 1: Anbringung',
    '0:CheckBox8': 'Anlage 1: Änderung',
    '0:Memo26': 'Anlage 2: Genaue Bezeichnung des Vorhabens',
    '0:Memo27': 'Anlage 2: Herstellungskosten einschl. Montage und Umsatzsteuer (€)',
    '0:CheckBox9': 'Anlage 2: Errichtung',
    '0:CheckBox10': 'Anlage 2: Anbringung',
    '0:CheckBox11': 'Anlage 2: Änderung',
    '0:Memo28': 'Anlage 3: Genaue Bezeichnung des Vorhabens',
    '0:Memo29': 'Anlage 3: Herstellungskosten einschl. Montage und Umsatzsteuer (€)',
    '0:CheckBox12': 'Anlage 3: Errichtung',
    '0:CheckBox13': 'Anlage 3: Anbringung',
    '0:CheckBox14': 'Anlage 3: Änderung',
    '0:Memo30': 'Anlage 1: Ausladung',
    '0:Memo31': 'Anlage 2: Ausladung',
    '0:Memo32': 'Anlage 3: Ausladung',
    '0:Memo33': 'Anlage 1: Abstand von der Fahrbahnkante',
    '0:Memo34': 'Anlage 2: Abstand von der Fahrbahnkante',
    '0:Memo35': 'Anlage 3: Abstand von der Fahrbahnkante',
    '0:Memo36': 'Anlage 1: Lichte Durchgangshöhe',
    '0:Memo37': 'Anlage 2: Lichte Durchgangshöhe',
    '0:Memo38': 'Anlage 3: Lichte Durchgangshöhe',
    '0:Memo39': 'Anlage 1: Verwendete Werkstoffe',
    '0:Memo40': 'Anlage 2: Verwendete Werkstoffe',
    '0:Memo41': 'Anlage 3: Verwendete Werkstoffe',
    '1:Memo1': 'Anlage 1: Beleuchtung angestrahlt',
    '1:Memo2': 'Anlage 2: Beleuchtung angestrahlt',
    '1:Memo32': 'Anlage 3: Beleuchtung angestrahlt',
    '1:Memo33': 'Anlage 1: Beleuchtung selbstleuchtend',
    '1:Memo34': 'Anlage 2: Beleuchtung selbstleuchtend',
    '1:Memo35': 'Anlage 3: Beleuchtung selbstleuchtend',
    '1:Memo36': 'Anlage 1: Wechsellicht',
    '1:Memo37': 'Anlage 2: Wechsellicht',
    '1:Memo38': 'Anlage 3: Wechsellicht',
    '1:Memo39': 'Anlage 1: Anzahl beleuchteter Flächen',
    '1:Memo40': 'Anlage 2: Anzahl beleuchteter Flächen',
    '1:Memo41': 'Anlage 3: Anzahl beleuchteter Flächen',
    '1:CheckBox8': 'Auszug aus dem Liegenschaftskataster mit Standort der Werbeanlage (3-fach)',
    '1:CheckBox1': 'Lageplan 1 : 500 bei freistehenden Werbeanlagen (3-fach)',
    '1:CheckBox2': 'Zeichnung(en) 1 : 50 (3-fach)',
    '1:CheckBox3': 'Farbiges Foto oder farbige Fotomontage (3-fach)',
    '1:CheckBox4': 'Angaben zum Artenschutz (§ 44 BNatSchG)',
    '1:Memo3': 'Ort, Datum (Bauherrschaft)',
    '1:Memo4': 'Für die Bauherrschaft (Unterschrift)',
    '1:Memo5': 'Ort, Datum (Entwurfsverfassende)',
    '1:Memo6': 'Entwurfsverfassende (Unterschrift)',
  },
  zaehlt: {
    ...zaehltNicht('1:CheckBox1', '0:Memo3', '0:Memo8', '0:Memo15', '0:Memo16', '0:CheckBox5', '1:Memo4', '1:Memo6'),
    // zweite und dritte Werbeanlage: nur wenn vorhanden
    ...zaehltNicht('0:Memo26', '0:Memo28'),
    // nur bei auskragenden bzw. beleuchteten Anlagen
    ...zaehltNicht(...s0('Memo30', 'Memo31', 'Memo32', 'Memo33', 'Memo34', 'Memo35', 'Memo36', 'Memo37', 'Memo38')),
    ...zaehltNicht(...s1('Memo1', 'Memo2', 'Memo32', 'Memo33', 'Memo34', 'Memo35', 'Memo36', 'Memo37', 'Memo38', 'Memo39', 'Memo40', 'Memo41')),
  },
  gruppen: [
    gruppeV('antragsart', 'Bauantrag oder Antrag auf Vorbescheid', 'genau', s0('CheckBox1', 'CheckBox2')),
    gruppeV('bauherrschaft-erreichbar', 'Bauherrschaft: Telefon, Telefax oder E-Mail', 'eins', s0('Memo9', 'Memo10', 'Memo11')),
    gruppeV('entwurf-erreichbar', 'Entwurfsverfassende: Telefon, Telefax oder E-Mail', 'eins', s0('Memo17', 'Memo18', 'Memo19')),
    gruppeV('staette', 'Vorhaben an der Stätte der Leistung: ja oder nein', 'eins', s0('CheckBox3', 'CheckBox4')),
    gruppeV('art-1', 'Anlage 1: Errichtung, Anbringung oder Änderung', 'eins', s0('CheckBox6', 'CheckBox7', 'CheckBox8')),
    gruppeV('art-2', 'Anlage 2: Errichtung, Anbringung oder Änderung', 'eins', s0('CheckBox9', 'CheckBox10', 'CheckBox11'), { bedingung: anlage2 }),
    gruppeV('art-3', 'Anlage 3: Errichtung, Anbringung oder Änderung', 'eins', s0('CheckBox12', 'CheckBox13', 'CheckBox14'), { bedingung: anlage3 }),
  ],
  bedingungen: {
    '0:Memo4': wenn(angekreuzt('0:CheckBox4')),
    ...fuer(s0('Memo27', 'Memo40'), anlage2),
    ...fuer(s0('Memo29', 'Memo41'), anlage3),
  },
});

export const vorgaben: Record<string, FormularProfil> = { 'nw010006|2026C': nw010006_2026C };
