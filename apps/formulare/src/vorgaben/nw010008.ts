/**
 * Anlage I/6 zur VV BauPrüfVO – Anzeige der vollständigen Beseitigung von Anlagen (§ 62 Absatz 3 Satz 3 BauO NRW
 * 2018), Stand 2026.
 *
 * Nach § 62 Absatz 3 BauO NRW 2018 und dem Vordruck:
 * - Gebäudeklasse bzw. Art der Anlage: eine Auswahl.
 * - Bei nicht freistehenden Gebäuden muss eine berechtigte Person nach § 54 Absatz 4 die Standsicherheit der
 *   angebauten Gebäude beurteilen und nachweisen (Satz 4) – Block „Berechtigte Person“ und der Nachweis nur dann.
 *   Nicht freistehend sind die Gebäude der Gebäudeklasse 2 (freistehende gleicher Größe sind Gebäudeklasse 1,
 *   § 2 Absatz 3 BauO NRW 2018) und die unter „nicht freistehend 1b, 3, 4 oder 5“.
 * - Erhebungsbogen für die Abgangsstatistik (Hochbaustatistikgesetz) nur für Gebäude, nicht für sonstige Anlagen.
 * Eingangsstempel/Aktenzeichen füllt die Behörde aus; die Unterschrift ist freiwillig.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { angekreuzt, gruppeV, oder, s, zaehltNicht } from './hilfen';

const s0 = s(0);
const nichtFreistehend = oder(angekreuzt('0:CheckBox1'), angekreuzt('0:CheckBox4'));

export const nw010008_2026C: FormularProfil = zusammen({
  abschnitte: {
    '0:Panel1': { titel: 'Untere Bauaufsichtsbehörde' },
    '0:Panel2': { titel: 'Eingangsstempel (füllt die Bauaufsichtsbehörde aus)' },
    '0:Panel7': { titel: 'Berechtigte Person (§ 54 Absatz 4 BauO NRW 2018, nur bei nicht freistehenden Gebäuden)', bedingung: nichtFreistehend },
    '0:Panel9': { titel: 'Gebäudeklasse bzw. Art der Anlage' },
    '0:Panel10': { titel: 'Beseitigungsvorhaben und Unterlagen' },
    '0:Panel11': { titel: 'Ort, Datum (Bauherrschaft)' },
  },
  feldTitel: {
    '0:Memo1': 'Untere Bauaufsichtsbehörde (Anschrift)',
    '0:Memo2': 'Untere Bauaufsichtsbehörde: PLZ, Ort',
    '0:Memo3': 'Aktenzeichen der Bauaufsichtsbehörde',
    '0:Memo5': 'Bauherrschaft: Name, Vorname, Firma',
    '0:Memo6': 'Bauherrschaft: Straße, Hausnummer',
    '0:Memo7': 'Bauherrschaft: PLZ, Ort',
    '0:Memo8': 'Bauherrschaft vertreten durch (Name, Vorname, Anschrift)',
    '0:Memo9': 'Bauherrschaft: Telefon',
    '0:Memo10': 'Bauherrschaft: Telefax',
    '0:Memo11': 'Bauherrschaft: E-Mail',
    '0:Memo12': 'Berechtigte Person: Name, Vorname, Büro',
    '0:Memo13': 'Berechtigte Person: Straße, Hausnummer',
    '0:Memo14': 'Berechtigte Person: PLZ, Ort',
    '0:Memo15': 'Berechtigt: Name, Vorname',
    '0:Memo16': 'Berechtigte Person: Mitgliedsnummer der Architekten- oder Ingenieurkammer',
    '0:Memo17': 'Berechtigte Person: Telefon',
    '0:Memo18': 'Berechtigte Person: Telefax',
    '0:Memo19': 'Berechtigte Person: E-Mail',
    '0:Memo20': 'Grundstück: Ort, Straße, Hausnummer, Ortsteil',
    '0:Memo21': 'Grundstück: Gemarkung(en)',
    '0:Memo22': 'Grundstück: Flur(e)',
    '0:Memo23': 'Grundstück: Flurstück(e)',
    '0:CheckBox1': 'Gebäudeklasse 2',
    '0:CheckBox4': 'Nicht freistehend: Gebäudeklasse 1b, 3, 4 oder 5',
    '0:CheckBox5': 'Freistehend: Gebäudeklasse 4 oder 5',
    '0:CheckBox6': 'Sonstige Anlagen über 10 m Höhe',
    '0:Memo4': 'Genaue Bezeichnung des Beseitigungsvorhabens',
    '0:CheckBox2': 'Auszug aus der Flurkarte mit Lage des Beseitigungsvorhabens (§ 2 Absatz 2 BauPrüfVO)',
    '0:CheckBox3': 'Standsicherheit angebauter Gebäude: Nachweis der berechtigten Person beigefügt (§ 62 Absatz 3 Satz 4)',
    '0:CheckBox7': 'Erhebungsbogen für die Abgangsstatistik',
    '0:CheckBox8': 'Angaben zum Artenschutz (§ 44 BNatSchG)',
    '0:Memo28': 'Ort, Datum (Bauherrschaft)',
    '0:Memo29': 'Für die Bauherrschaft (Unterschrift)',
  },
  zaehlt: zaehltNicht('0:Memo3', '0:Memo8', '0:Memo29'),
  gruppen: [
    gruppeV('bauherrschaft-erreichbar', 'Bauherrschaft: Telefon, Telefax oder E-Mail', 'eins', s0('Memo9', 'Memo10', 'Memo11')),
    gruppeV('berechtigt-erreichbar', 'Berechtigte Person: Telefon, Telefax oder E-Mail', 'eins', s0('Memo17', 'Memo18', 'Memo19')),
    gruppeV('gebaeudeklasse', 'Gebäudeklasse bzw. Art der Anlage', 'eins', s0('CheckBox1', 'CheckBox4', 'CheckBox5', 'CheckBox6')),
  ],
  bedingungen: {
    '0:CheckBox3': nichtFreistehend,
    '0:CheckBox7': oder(angekreuzt('0:CheckBox1'), angekreuzt('0:CheckBox4'), angekreuzt('0:CheckBox5')),
  },
});

export const vorgaben: Record<string, FormularProfil> = { 'nw010008|2026C': nw010008_2026C };
