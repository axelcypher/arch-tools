/**
 * Anlage I/2 zur VV BauPrüfVO – Antrag im vereinfachten Baugenehmigungsverfahren (§ 64 BauO NRW 2018), ältere
 * Fassung (FORMA-Stand 2024D, 2 Blätter). Inhaltlich dieselben Regeln wie die Fassung 2026 (nw010002.ts), aber
 * andere Komponentennamen und Nummern; die Bausteine aus antrag.ts passen deshalb nicht.
 *
 * Blatt 1 (Seite 0): Behörde, Antragsart, Bauherrschaft, Entwurfsverfassende, Baugrundstück, Gebäudeklasse,
 * Vorhaben, Vorbescheid und Bindungen. Blatt 2 (Seite 1): Bauvorlagen Nr. 1 bis 14, Ort/Datum, Unterschriften.
 *
 * Bedingungen nach dem Vordruck selbst und der BauPrüfVO:
 * - Bauvorlagen (Blatt 2, Nr. 1 bis 14) nur beim Bauantrag („einem Antrag auf Vorbescheid sind nur die für die
 *   Klärung der Fragestellung erforderlichen Unterlagen beizufügen“).
 * - Nr. 2 Maß der baulichen Nutzung: „nur im Bereich eines Bebauungsplanes oder einer Satzung nach BauGB“.
 * - Nr. 3 Flurkarte und Nr. 4 Basiskarte: „nur bei Vorhaben nach den §§ 34 oder 35 des BauGB“.
 * - Nr. 6 Baubeschreibung: entfällt beim Einfamilienhaus (wie Fassung 2026).
 * - Nr. 7.1 bis 7.3 Kosten: eine Angabe; die Herstellungssumme nur, wenn 7.3 angekreuzt ist.
 * - Nr. 8 und 9 „Zusätzliche Bauvorlagen für Sonderbauten“: nur bei Sonderbauten (Merkmal oder angekreuzt);
 *   die Betriebsbeschreibung nur für Nichtwohngebäude (wie Fassung 2026).
 * - Nr. 10 Bescheinigung zum Brandschutz nach dem Wortlaut: „Wohngebäude der Gebäudeklasse 4 und 5,
 *   Nicht-Wohngebäude der Gebäudeklasse 3 bis 5“ (Garagen über 100 m² bis 1.000 m²: kein Merkmal dafür).
 *   Nr. 10 oder Nr. 14 (Erklärung der/des Entwurfsverfassenden): eine Angabe (wie Fassung 2026).
 * - Nr. 11 Bescheinigungen Schall-, Wärmeschutz, Standsicherheit (§ 68 Absatz 2 BauO NRW 2018): Schall- und
 *   Wärmeschutz nur bei Gebäuden (nicht bei „Sonstige bauliche Anlagen“); Standsicherheit immer.
 * - Nr. 11.2 Prüfung durch die Bauaufsichtsbehörde: „soweit erforderlich“ – freiwillige Auswahl.
 * - Vorbescheid (Zulässigkeit, Fragestellung): nur beim Antrag auf Vorbescheid. Der Rahmen Panel9 enthält auch die
 *   Bindungen, deshalb hängen die Felder und nicht der Abschnitt an der Bedingung.
 * - Bindungen: Bescheid vom, Behörde, Aktenzeichen nur, wenn die Bindung angekreuzt ist.
 * - Art des Gebäudes (Wohngebäude / Sonderbau): nur bei Gebäuden (nicht bei „Sonstige bauliche Anlagen“).
 * - Unterschriften: „die Vordrucke müssen nicht unterschrieben werden“ – zählen nicht.
 */

import type { Teilbedingung } from '../bedingung';
import type { FormularProfil } from '../profil';
import { brandschutzBescheinigung, keinEinfamilienhaus, nurBebauungsplan, nurInnenAussen } from './grundlagen';
import { angekreuzt, begruendet, fuer, gruppeV, ist, oder, q, s, und, wenn, zaehltNicht } from './hilfen';

const s0 = s(0);
const s1 = s(1);
/** Feld leer bzw. Kästchen nicht angekreuzt */
const leer = (feld: string): Teilbedingung => ({ art: 'feld', feld, pruefung: 'leer' });

const bauantrag = angekreuzt('0:CheckBox1');
const vorbescheid = wenn(angekreuzt('0:CheckBox2'));
const sonderbau = oder(ist('Sonderbau', 'ja'), angekreuzt('0:CheckBox21'), angekreuzt('0:CheckBox3'));
/** ein Gebäude: „Sonstige bauliche Anlagen“ nicht angekreuzt */
const gebaeude = wenn(leer('0:CheckBox22'));

export const nw010002_2024D: FormularProfil = {
  abschnitte: {
    '0:Panel1': { titel: 'Untere Bauaufsichtsbehörde' },
    '0:Panel2': { titel: 'Eingangsstempel (füllt die Bauaufsichtsbehörde aus)' },
    '0:Panel3': { titel: 'Antrag' },
    '0:Panel8': { titel: 'Baugrundstück, Gebäudeklasse und Art des Gebäudes' },
    '0:Panel5': { titel: 'Bezeichnung des Vorhabens; Ausnahme, Befreiung, Abweichung' },
    '0:Panel9': { titel: 'Vorbescheid (§ 77 BauO NRW 2018) und Bindungen zur Beurteilung des Vorhabens' },
    '1:Panel1': { titel: 'Erforderliche Bauvorlagen (Bauantrag)', bedingung: wenn(bauantrag) },
    '1:Panel11': { titel: 'Ort, Datum und Unterschrift (Bauherrschaft)' },
    '1:Panel12': { titel: 'Ort, Datum und Unterschrift (Entwurfsverfassende)' },
  },
  feldTitel: {
    // Blatt 1
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
    '0:Memo12': 'Entwurfsverfassende: Name, Vorname, Büro',
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
    '0:CheckBox4': 'Gebäudeklasse 1',
    '0:CheckBox5': 'Gebäudeklasse 2',
    '0:CheckBox6': 'Gebäudeklasse 3',
    '0:CheckBox7': 'Gebäudeklasse 4',
    '0:CheckBox8': 'Gebäudeklasse 5',
    '0:CheckBox22': 'Sonstige bauliche Anlagen',
    '0:CheckBox20': 'Wohngebäude',
    '0:CheckBox21': 'Sonderbau (auch Nicht-Wohngebäude, nicht § 50 Absatz 2 BauO NRW 2018)',
    '0:CheckBox3': 'Sonderbau nach § 64 Absatz 2 BauO NRW 2018',
    '0:Memo4': 'Bezeichnung des Vorhabens',
    '0:CheckBox9': 'Ausnahme (§ 31 Absatz 1 BauGB)',
    '0:CheckBox10': 'Befreiung (§ 31 Absatz 2 BauGB)',
    '0:CheckBox11': 'Abweichung (§ 69 BauO NRW 2018)',
    '0:CheckBox16': 'Abweichung nach § 69 Absatz 1a BauO NRW 2018 (Bescheinigung einer sachverständigen Person)',
    '0:CheckBox12': 'Vorbescheid: planungsrechtliche Zulässigkeit',
    '0:CheckBox13': 'Vorbescheid: bauordnungsrechtliche Zulässigkeit',
    '0:Memo24': 'Fragestellung des Vorbescheids',
    '0:CheckBox14': 'Bindung: Vorbescheid',
    '0:Memo25': 'Vorbescheid: Bescheid vom',
    '0:Memo26': 'Vorbescheid: erteilt von (Behörde)',
    '0:Memo27': 'Vorbescheid: Aktenzeichen',
    '0:CheckBox15': 'Bindung: Teilungsgenehmigung',
    '0:Memo28': 'Teilungsgenehmigung: Bescheid vom',
    '0:Memo29': 'Teilungsgenehmigung: erteilt von (Behörde)',
    '0:Memo30': 'Teilungsgenehmigung: Aktenzeichen',
    '0:CheckBox17': 'Bindung: Befreiungs-/Abweichungsbescheid',
    '0:Memo35': 'Befreiungs-/Abweichungsbescheid: Bescheid vom',
    '0:Memo36': 'Befreiungs-/Abweichungsbescheid: erteilt von (Behörde)',
    '0:Memo37': 'Befreiungs-/Abweichungsbescheid: Aktenzeichen',
    '0:CheckBox18': 'Bindung: Baulast',
    '0:Memo38': 'Baulast: Bescheid vom',
    '0:Memo39': 'Baulast: erteilt von (Behörde)',
    '0:Memo40': 'Baulast: Aktenzeichen',
    '0:CheckBox23': 'Bindung: Denkmalrechtliche Erlaubnis',
    '0:Memo31': 'Denkmalrechtliche Erlaubnis: Bescheid vom',
    '0:Memo32': 'Denkmalrechtliche Erlaubnis: erteilt von (Behörde)',
    '0:Memo33': 'Denkmalrechtliche Erlaubnis: Aktenzeichen',
    '0:CheckBox19': 'Bindung: Sonstige',
    '0:Memo41': 'Sonstige Bindung (Bezeichnung)',
    '0:Memo42': 'Sonstige Bindung: Bescheid vom',
    '0:Memo43': 'Sonstige Bindung: erteilt von (Behörde)',
    '0:Memo44': 'Sonstige Bindung: Aktenzeichen',
    // Blatt 2
    '1:CheckBox1': 'Nr. 1 Lageplan / amtlicher Lageplan (3-fach)',
    '1:CheckBox2': 'Nr. 2 Berechnung des Maßes der baulichen Nutzung (3-fach)',
    '1:CheckBox3': 'Nr. 3 Beglaubigter Auszug aus der Flurkarte (3-fach)',
    '1:CheckBox4': 'Nr. 4 Auszug aus der amtlichen Basiskarte 1:5000 (3-fach)',
    '1:CheckBox5': 'Nr. 5 Bauzeichnungen (3-fach)',
    '1:CheckBox6': 'Nr. 6 Baubeschreibung auf amtlichem Vordruck (3-fach)',
    '1:CheckBox7': 'Nr. 7.1 Berechnung des umbauten Raums nach DIN 277 (2-fach)',
    '1:CheckBox8': 'Nr. 7.2 Berechnung der Rohbaukosten (2-fach)',
    '1:CheckBox9': 'Nr. 7.3 Herstellungssumme (Änderung, bauliche Anlagen ohne Gebäude)',
    '1:Memo1': 'Herstellungssumme einschließlich Umsatzsteuer',
    '1:CheckBox10': 'Nr. 8 Betriebsbeschreibung auf amtlichem Vordruck (3-fach)',
    '1:CheckBox11': 'Nr. 9 Zusätzliche Angaben und Bauvorlagen für besondere Vorhaben (3-fach)',
    '1:CheckBox12': 'Nr. 10 Bescheinigung einer sachverständigen Person zum Brandschutz (2-fach)',
    '1:CheckBox13': 'Nr. 11 Bescheinigung mit Nachweis des Schallschutzes (2-fach)',
    '1:CheckBox14': 'Nr. 11 Bescheinigung mit Nachweis des Wärmeschutzes (2-fach)',
    '1:CheckBox15': 'Nr. 11 Bescheinigung mit Nachweis der Standsicherheit (2-fach)',
    '1:CheckBox16': 'Nr. 11.2 Prüfung durch die Bauaufsichtsbehörde: Schallschutz',
    '1:CheckBox17': 'Nr. 11.2 Prüfung durch die Bauaufsichtsbehörde: Wärmeschutz',
    '1:CheckBox18': 'Nr. 11.2 Prüfung durch die Bauaufsichtsbehörde: Standsicherheit',
    '1:CheckBox19': 'Nr. 11.2 Prüfung durch die Bauaufsichtsbehörde: Brandschutz',
    '1:CheckBox20': 'Nr. 12 Erhebungsbogen für die Baustatistik',
    '1:CheckBox21': 'Nr. 13 Angaben zum Artenschutz',
    '1:CheckBox22': 'Nr. 14 Erklärung der/des Entwurfsverfassenden zum Brandschutz',
    '1:Memo28': 'Ort, Datum (Bauherrschaft)',
    '1:Memo29': 'Für die Bauherrschaft (Unterschrift)',
    '1:Memo30': 'Ort, Datum (Entwurfsverfassende)',
    '1:Memo31': 'Bauvorlageberechtigte Entwurfsverfassende (Unterschrift)',
  },
  zaehlt: {
    // Behörde; „vertreten durch“ nur, wenn jemand die Bauherrschaft vertritt; Unterschriften freiwillig
    ...zaehltNicht('0:Memo3', '0:Memo8', '1:Memo29', '1:Memo31'),
    // die Kästchen der Bindungen sind eine Auswahl, keine Pflicht
    ...zaehltNicht('0:CheckBox14', '0:CheckBox15', '0:CheckBox17', '0:CheckBox18', '0:CheckBox23', '0:CheckBox19'),
  },
  gruppen: [
    gruppeV('antragsart', 'Bauantrag oder Antrag auf Vorbescheid', 'eins', s0('CheckBox1', 'CheckBox2')),
    gruppeV('bauherrschaft-erreichbar', 'Bauherrschaft: Telefon, Telefax oder E-Mail', 'eins', s0('Memo9', 'Memo10', 'Memo11')),
    gruppeV('entwurf-erreichbar', 'Entwurfsverfassende: Telefon, Telefax oder E-Mail', 'eins', s0('Memo17', 'Memo18', 'Memo19')),
    gruppeV('gebaeudeklasse', 'Gebäudeklasse', 'eins', s0('CheckBox4', 'CheckBox5', 'CheckBox6', 'CheckBox7', 'CheckBox8', 'CheckBox22')),
    gruppeV('art', 'Art des Gebäudes (Wohngebäude oder Sonderbau)', 'eins', s0('CheckBox20', 'CheckBox21', 'CheckBox3'), { bedingung: gebaeude }),
    gruppeV('abweichungen', 'Ausnahme, Befreiung, Abweichung', 'nie', s0('CheckBox9', 'CheckBox10', 'CheckBox11', 'CheckBox16')),
    gruppeV('vorbescheid-art', 'Vorbescheid: planungs- oder bauordnungsrechtliche Zulässigkeit', 'eins', s0('CheckBox12', 'CheckBox13'), { bedingung: vorbescheid }),
    gruppeV('kosten', 'Nr. 7 Rauminhalt, Rohbaukosten oder Herstellungssumme', 'eins', s1('CheckBox7', 'CheckBox8', 'CheckBox9')),
    gruppeV('brandschutz', 'Nr. 10 Bescheinigung oder Nr. 14 Erklärung zum Brandschutz', 'eins', s1('CheckBox12', 'CheckBox22')),
    gruppeV('pruefung-behoerde', 'Nr. 11.2 Prüfung durch die Bauaufsichtsbehörde (soweit erforderlich)', 'nie', s1('CheckBox16', 'CheckBox17', 'CheckBox18', 'CheckBox19')),
  ],
  bedingungen: {
    // Vorbescheid
    '0:Memo24': vorbescheid,
    // eine Bindung: Datum, Behörde und Aktenzeichen nur, wenn sie angekreuzt ist
    ...fuer(s0('Memo25', 'Memo26', 'Memo27'), wenn(angekreuzt('0:CheckBox14'))),
    ...fuer(s0('Memo28', 'Memo29', 'Memo30'), wenn(angekreuzt('0:CheckBox15'))),
    ...fuer(s0('Memo35', 'Memo36', 'Memo37'), wenn(angekreuzt('0:CheckBox17'))),
    ...fuer(s0('Memo38', 'Memo39', 'Memo40'), wenn(angekreuzt('0:CheckBox18'))),
    ...fuer(s0('Memo31', 'Memo32', 'Memo33'), wenn(angekreuzt('0:CheckBox23'))),
    ...fuer(s0('Memo41', 'Memo42', 'Memo43', 'Memo44'), wenn(angekreuzt('0:CheckBox19'))),
    // Bauvorlagen
    '1:CheckBox2': nurBebauungsplan,
    '1:CheckBox3': nurInnenAussen,
    '1:CheckBox4': nurInnenAussen,
    '1:CheckBox6': keinEinfamilienhaus,
    '1:Memo1': wenn(angekreuzt('1:CheckBox9')),
    '1:CheckBox10': begruendet(
      und(sonderbau, ist('Gebäudeart', 'Nichtwohngebäude')),
      'Die Betriebsbeschreibung gehört laut Vordruck zu Sonderbauten, und nur bei gewerblichen oder landwirtschaftlichen Betrieben.',
      q('baupruefvo', '5', 2),
      q('baupruefvo', '5', 3),
    ),
    '1:CheckBox11': sonderbau,
    '1:CheckBox12': brandschutzBescheinigung(
      oder(
        und(ist('Gebäudeklasse', '4', '5'), oder(ist('Gebäudeart', 'Einfamilienhaus', 'Zweifamilienhaus', 'Mehrfamilienhaus'), angekreuzt('0:CheckBox20'))),
        und(ist('Gebäudeklasse', '3', '4', '5'), ist('Gebäudeart', 'Nichtwohngebäude')),
      ),
    ),
    '1:CheckBox13': gebaeude,
    '1:CheckBox14': gebaeude,
  },
};

export const vorgaben: Record<string, FormularProfil> = { 'nw010002|2024D': nw010002_2024D };
