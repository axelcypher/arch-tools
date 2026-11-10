/**
 * Anlage I/6.1 zur VV BauPrüfVO – Antrag auf Genehmigung der vollständigen Beseitigung einer verfahrensfreien Anlage
 * (§ 62 Absatz 3 Satz 2 BauO NRW 2018), Stand 2024.
 *
 * Nach § 62 Absatz 3 BauO NRW 2018 und dem Vordruck:
 * - Art der Anlage (Satz 1 Nummer 1 bis 3): eine Auswahl.
 * - Bindungen (wohnungsrechtliche Genehmigung, denkmalrechtliche Erlaubnis, Baulast) nur, wenn vorhanden; Bescheid,
 *   Behörde und Aktenzeichen nur zur angekreuzten Bindung.
 * - Kammer-/Verzeichnisnummer der Entwurfsverfassenden „falls eingetragen“ – zählt nicht.
 * - Erhebungsbogen für die Abgangsstatistik (Hochbaustatistikgesetz) nur für Gebäude, nicht für sonstige Anlagen.
 * Eingangsstempel/Aktenzeichen füllt die Behörde aus; Unterschriften sind freiwillig.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { angekreuzt, fuer, gruppeV, oder, s, wenn, zaehltNicht } from './hilfen';

const s0 = s(0);
const s1 = s(1);

export const nw010009_2024D: FormularProfil = zusammen({
  abschnitte: {
    '0:Panel1': { titel: 'Untere Bauaufsichtsbehörde' },
    '0:Panel2': { titel: 'Eingangsstempel (füllt die Bauaufsichtsbehörde aus)' },
    '0:Panel8': { titel: 'Grundstück und Art der Anlage' },
    '0:Panel9': { titel: 'Bindungen zur Beurteilung des Vorhabens (nur wenn vorhanden)' },
    '1:Panel3': { titel: 'Verbleib des Beseitigungsmaterials und Unterlagen' },
    '1:Panel11': { titel: 'Ort, Datum (Bauherrschaft)' },
    '1:Panel12': { titel: 'Ort, Datum (Entwurfsverfassende)' },
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
    '0:Memo12': 'Entwurfsverfassende: Name, Vorname, Büro',
    '0:Memo13': 'Entwurfsverfassende: Straße, Hausnummer',
    '0:Memo14': 'Entwurfsverfassende: PLZ, Ort',
    '0:Memo16': 'Entwurfsverfassende: Kammer-Mitgliedsnummer oder Nr. im Verzeichnis der eingeschränkt Bauvorlageberechtigten (falls eingetragen)',
    '0:Memo17': 'Entwurfsverfassende: Telefon',
    '0:Memo18': 'Entwurfsverfassende: Telefax',
    '0:Memo19': 'Entwurfsverfassende: E-Mail',
    '0:Memo20': 'Grundstück: Ort, Straße, Hausnummer, Ortsteil',
    '0:Memo21': 'Grundstück: Gemarkung(en)',
    '0:Memo22': 'Grundstück: Flur(e)',
    '0:Memo23': 'Grundstück: Flurstück(e)',
    '0:CheckBox3': 'Anlage nach § 62 Absatz 1 BauO NRW 2018',
    '0:CheckBox4': 'Freistehendes Gebäude der Gebäudeklasse 1 oder 3',
    '0:CheckBox5': 'Sonstige Anlage (kein Gebäude) bis 10 m Höhe',
    '0:Memo4': 'Genaue Bezeichnung des Beseitigungsvorhabens',
    '0:CheckBox8': 'Auszug aus der Flurkarte mit Lage des Beseitigungsvorhabens (§ 2 Absatz 2 BauPrüfVO)',
    '0:CheckBox13': 'Bindung: Wohnungsrechtliche Genehmigung',
    '0:Memo25': 'Wohnungsrechtliche Genehmigung: Bescheid vom',
    '0:Memo26': 'Wohnungsrechtliche Genehmigung: erteilt von (Behörde)',
    '0:Memo27': 'Wohnungsrechtliche Genehmigung: Aktenzeichen',
    '0:CheckBox14': 'Bindung: Denkmalrechtliche Erlaubnis',
    '0:Memo28': 'Denkmalrechtliche Erlaubnis: Bescheid vom',
    '0:Memo29': 'Denkmalrechtliche Erlaubnis: erteilt von (Behörde)',
    '0:Memo30': 'Denkmalrechtliche Erlaubnis: Aktenzeichen',
    '0:CheckBox16': 'Bindung: Baulast',
    '0:Memo34': 'Baulast Nr.',
    '0:Memo35': 'Baulast: Bescheid vom',
    '0:Memo36': 'Baulast: erteilt von (Behörde)',
    '0:Memo37': 'Baulast: Aktenzeichen',
    '1:Memo1': 'Beschreibung der Anlage nach ihrer wesentlichen Konstruktion',
    '1:Memo2': 'Beschreibung des vorgesehenen Beseitigungsvorgangs',
    '1:Memo3': 'Angaben über den Verbleib des Beseitigungsmaterials',
    '1:CheckBox1': 'Erhebungsbogen für die Abgangsstatistik',
    '1:CheckBox2': 'Angaben zum Artenschutz (§ 44 BNatSchG)',
    '1:Memo28': 'Ort, Datum (Bauherrschaft)',
    '1:Memo29': 'Für die Bauherrschaft (Unterschrift)',
    '1:Memo30': 'Ort, Datum (Entwurfsverfassende)',
    '1:Memo31': 'Entwurfsverfassende (Unterschrift)',
  },
  // die Kästchen der Bindungen sind eine Auswahl, keine Pflicht
  zaehlt: zaehltNicht('0:Memo3', '0:Memo8', '0:Memo16', '0:CheckBox13', '0:CheckBox14', '0:CheckBox16', '1:Memo29', '1:Memo31'),
  gruppen: [
    gruppeV('bauherrschaft-erreichbar', 'Bauherrschaft: Telefon, Telefax oder E-Mail', 'eins', s0('Memo9', 'Memo10', 'Memo11')),
    gruppeV('entwurf-erreichbar', 'Entwurfsverfassende: Telefon, Telefax oder E-Mail', 'eins', s0('Memo17', 'Memo18', 'Memo19')),
    gruppeV('art', 'Art der Anlage (§ 62 Absatz 3 Satz 1 BauO NRW 2018)', 'eins', s0('CheckBox3', 'CheckBox4', 'CheckBox5')),
  ],
  bedingungen: {
    ...fuer(s0('Memo25', 'Memo26', 'Memo27'), wenn(angekreuzt('0:CheckBox13'))),
    ...fuer(s0('Memo28', 'Memo29', 'Memo30'), wenn(angekreuzt('0:CheckBox14'))),
    ...fuer(s0('Memo34', 'Memo35', 'Memo36', 'Memo37'), wenn(angekreuzt('0:CheckBox16'))),
    ...fuer(s1('CheckBox1'), oder(angekreuzt('0:CheckBox3'), angekreuzt('0:CheckBox4'))),
  },
});

export const vorgaben: Record<string, FormularProfil> = { 'nw010009|2024D': nw010009_2024D };
