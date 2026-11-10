/**
 * Anlage I/3 zur VV BauPrüfVO – Antrag auf Genehmigungsfreistellung (§ 63 BauO NRW 2018), Stand 2026.
 *
 * Der Vordruck sagt selbst, was auszufüllen ist: „Behandlung als Bauantrag …“ – ja: „bitte Nummer 2 bis 6
 * ausfüllen“, nein: „bitte Nummer 1, 4 und 5 ausfüllen“. Nr. 3 (Bescheinigung nach § 6) ist freiwillig. Dazu: die
 * Baubeschreibung (Nr. 2.4) entfällt beim Einfamilienhaus, bei den Kosten (Nr. 2.5) genügt eine Angabe.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { keinEinfamilienhaus } from './grundlagen';
import { angekreuzt, fuer, gruppeV, s, wenn, zaehltNicht } from './hilfen';

const s0 = s(0);
const s1 = s(1);
const ja = angekreuzt('0:CheckBox1');
const nein = angekreuzt('0:CheckBox2');

export const nw010005_2026I: FormularProfil = zusammen({
  abschnitte: {
    '0:Panel1': { titel: 'Bauaufsichtsbehörde' },
    '0:Panel2': { titel: 'Eingang bei der Bauaufsichtsbehörde (füllt die Behörde aus)' },
    '0:Panel3': { titel: 'Eingang bei der Gemeinde (füllt die Gemeinde aus)' },
    '0:Panel6': { titel: 'Behandlung als Bauantrag, wenn die Gemeinde ein vereinfachtes Verfahren verlangt' },
    '1:Panel1': { titel: 'Isolierte Abweichung, Ausnahme oder Befreiung (nur wenn nötig)' },
    '1:Panel5': { titel: 'Nr. 1 Bauvorlagen in der Genehmigungsfreistellung', bedingung: wenn(nein) },
    '1:Panel10': { titel: 'Nr. 2 Bauvorlagen bei Behandlung als Bauantrag', bedingung: wenn(ja) },
    '1:Panel6': { titel: 'Nr. 3 bis 6 Weitere Unterlagen' },
    '1:Panel2': { titel: 'Ort, Datum (Bauherrschaft)' },
    '1:Panel3': { titel: 'Ort, Datum (Entwurfsverfassende)' },
  },
  feldTitel: {
    '0:Memo1': 'Bauaufsichtsbehörde (Anschrift)',
    '0:Memo3': 'Eingangsstempel der Bauaufsichtsbehörde',
    '0:Memo4': 'Aktenzeichen der Bauaufsichtsbehörde',
    '0:Memo5': 'Eingangsstempel der Gemeinde',
    '0:Memo6': 'Aktenzeichen der Gemeinde',
    '0:CheckBox1': 'Ja, als Bauantrag behandeln (Nummer 2 bis 6)',
    '0:CheckBox2': 'Nein (Nummer 1, 4 und 5)',
    '0:Memo7': 'Bauherrschaft: Name, Vorname, Firma',
    '0:Memo8': 'Bauherrschaft: Straße, Hausnummer',
    '0:Memo9': 'Bauherrschaft: PLZ, Ort',
    '0:Memo10': 'Bauherrschaft vertreten durch (Name, Vorname, Anschrift)',
    '0:Memo11': 'Bauherrschaft: Telefonnummer',
    '0:Memo12': 'Bauherrschaft: Mobiltelefonnummer',
    '0:Memo13': 'Bauherrschaft: E-Mail',
    '0:Memo14': 'Entwurfsverfassende: Name, Vorname, Büro',
    '0:Memo15': 'Entwurfsverfassende: Straße, Hausnummer',
    '0:Memo16': 'Entwurfsverfassende: PLZ, Ort',
    '0:Memo17': 'Bauvorlageberechtigte Person: Name, Vorname',
    '0:Memo18': 'Mitgliedsnummer der Architekten- oder Ingenieurkammer',
    '0:Memo19': 'Entwurfsverfassende: Telefonnummer',
    '0:Memo20': 'Entwurfsverfassende: Mobiltelefonnummer',
    '0:Memo21': 'Entwurfsverfassende: E-Mail',
    '0:Memo22': 'Baugrundstück: Ort, Straße, Hausnummer, Ortsteil',
    '0:CheckBox8': 'Gebäudeklasse 1',
    '0:CheckBox9': 'Gebäudeklasse 2',
    '0:CheckBox10': 'Gebäudeklasse 3',
    '0:CheckBox11': 'Gebäudeklasse 4',
    '0:CheckBox12': 'Gebäudeklasse 5',
    '0:CheckBox22': 'Sonstige bauliche Anlagen',
    '0:Memo26': 'Bezeichnung des Vorhabens',
    '1:Memo2': 'Isolierte Abweichung/Ausnahme/Befreiung: erteilt am',
    '1:Memo3': 'Isolierte Abweichung/Ausnahme/Befreiung: Aktenzeichen',
    '1:CheckBox3': 'Abweichung nach § 69 Absatz 1 Satz 5 BauO NRW 2018 (Bescheinigung einer sachverständigen Person)',
    '1:CheckBox1': 'Nr. 1.1 Lageplan / amtlicher Lageplan (1-fach)',
    '1:CheckBox2': 'Nr. 1.2 Berechnung des Maßes der baulichen Nutzung (1-fach)',
    '1:CheckBox4': 'Nr. 1.3 Bauzeichnungen (1-fach)',
    '1:CheckBox11': 'Nr. 2.1 Lageplan / amtlicher Lageplan (3-fach)',
    '1:CheckBox12': 'Nr. 2.2 Berechnung des Maßes der baulichen Nutzung (3-fach)',
    '1:CheckBox13': 'Nr. 2.3 Bauzeichnungen (3-fach)',
    '1:CheckBox14': 'Nr. 2.4 Baubeschreibung auf amtlichem Vordruck (3-fach)',
    '1:CheckBox15': 'Nr. 2.5.1 Berechnung des umbauten Raums nach DIN 277 (2-fach)',
    '1:CheckBox16': 'Nr. 2.5.2 Berechnung der Rohbaukosten (2-fach)',
    '1:CheckBox17': 'Nr. 2.5.3 Herstellungssumme (Änderung, bauliche Anlagen ohne Gebäude)',
    '1:Memo1': 'Herstellungssumme einschließlich Umsatzsteuer',
    '1:CheckBox5': 'Nr. 3 Bescheinigung der Übereinstimmung mit § 6 BauO NRW 2018',
    '1:CheckBox6': 'Nr. 4 Erhebungsbogen für die Baustatistik',
    '1:CheckBox7': 'Nr. 5 Angaben zum Artenschutz',
    '1:CheckBox8': 'Nr. 6 Erklärung der/des Entwurfsverfassenden (§ 68 Absatz 2 Satz 2 BauO NRW 2018)',
    '1:Memo27': 'Ort, Datum (Bauherrschaft)',
    '1:Memo28': 'Für die Bauherrschaft (Unterschrift)',
    '1:Memo31': 'Ort, Datum (Entwurfsverfassende)',
    '1:Memo32': 'Bauvorlageberechtigte Entwurfsverfassende (Unterschrift)',
  },
  zaehlt: zaehltNicht('0:Memo3', '0:Memo4', '0:Memo5', '0:Memo6', '0:Memo10', '1:CheckBox5', '1:Memo28', '1:Memo32'),
  gruppen: [
    gruppeV('bauantrag', 'Behandlung als Bauantrag: ja oder nein', 'eins', s0('CheckBox1', 'CheckBox2')),
    gruppeV('bauherrschaft-erreichbar', 'Bauherrschaft: Telefon, Mobiltelefon oder E-Mail', 'eins', s0('Memo11', 'Memo12', 'Memo13')),
    gruppeV('entwurf-erreichbar', 'Entwurfsverfassende: Telefon, Mobiltelefon oder E-Mail', 'eins', s0('Memo19', 'Memo20', 'Memo21')),
    gruppeV('gebaeudeklasse', 'Gebäudeklasse', 'eins', s0('CheckBox8', 'CheckBox9', 'CheckBox10', 'CheckBox11', 'CheckBox12', 'CheckBox22')),
    gruppeV('isoliert', 'Isolierte Abweichung, Ausnahme oder Befreiung', 'nie', s1('Memo2', 'Memo3', 'CheckBox3')),
    gruppeV('kosten', 'Nr. 2.5 Rauminhalt, Rohbaukosten oder Herstellungssumme', 'eins', s1('CheckBox15', 'CheckBox16', 'CheckBox17')),
  ],
  bedingungen: {
    '1:CheckBox14': keinEinfamilienhaus,
    '1:Memo1': wenn(angekreuzt('1:CheckBox17')),
    ...fuer(s1('CheckBox8'), wenn(ja)),
  },
});

export const vorgaben: Record<string, FormularProfil> = { 'nw010005|2026I': nw010005_2026I };
