/**
 * Anlage I/2.1 zur VV BauPrüfVO (alte Fassung) – Anzeige des Bezugsgebäudes im referenziellen Baugenehmigungsverfahren
 * (§ 66 BauO NRW 2018), Stand 2022.
 *
 * Nach dem Vordruck:
 * - Bauherrschaft und Entwurfsverfassende „nur, wenn abweichend vom Referenzgebäude“ – der Block ist erst
 *   erforderlich, wenn darin etwas eingetragen ist (dann vollständig).
 * - Lageplan, Bauzeichnungen und bautechnische Nachweise werden „spätestens mit der Anzeige des Baubeginns“ vorgelegt
 *   (§ 66 Absatz 5 Nummer 3 BauO NRW 2018) – die drei Erklärungen zählen.
 * Eingangsstempel/Aktenzeichen füllt die Behörde aus; Unterschriften zählen nicht.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { angekreuzt, gruppeV, oder, s, zaehltNicht } from './hilfen';

const s0 = s(0);
const abweichendeBauherrschaft = oder(...s0('Memo5', 'Memo6', 'Memo7', 'Memo9', 'Memo10', 'Memo11').map(angekreuzt));
const abweichendeEntwurfsverfassende = oder(...s0('Memo12', 'Memo13', 'Memo14', 'Memo15', 'Memo16', 'Memo17', 'Memo18', 'Memo19').map(angekreuzt));

export const nw010003_2022B: FormularProfil = zusammen({
  abschnitte: {
    '0:Panel1': { titel: 'Untere Bauaufsichtsbehörde' },
    '0:Panel2': { titel: 'Eingangsstempel (füllt die Bauaufsichtsbehörde aus)' },
    '0:Panel5': { titel: 'Aktenzeichen des Referenzgebäudes' },
    '0:Panel6': { titel: 'Bauherrschaft (nur, wenn abweichend vom Referenzgebäude)', bedingung: abweichendeBauherrschaft },
    '0:Panel7': { titel: 'Entwurfsverfassende (nur, wenn abweichend vom Referenzgebäude)', bedingung: abweichendeEntwurfsverfassende },
    '0:Panel10': { titel: 'Spätestens mit der Anzeige des Baubeginns vorgelegt (§ 66 Absatz 5 Nummer 3 BauO NRW 2018)' },
    '0:Panel11': { titel: 'Ort, Datum (Bauherrschaft)' },
    '0:Panel12': { titel: 'Ort, Datum (Entwurfsverfassende)' },
  },
  feldTitel: {
    '0:Memo1': 'Untere Bauaufsichtsbehörde (Anschrift)',
    '0:Memo2': 'Untere Bauaufsichtsbehörde: PLZ, Ort',
    '0:Memo3': 'Aktenzeichen der Bauaufsichtsbehörde',
    '0:Memo4': 'Aktenzeichen des Referenzgebäudes',
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
    '0:Memo20': 'Bezugsgebäude: Ort, Straße, Hausnummer, Ortsteil',
    '0:Memo21': 'Bezugsgebäude: Gemarkung(en)',
    '0:Memo22': 'Bezugsgebäude: Flur(e)',
    '0:Memo23': 'Bezugsgebäude: Flurstück(e)',
    '0:Memo24': 'Referenzgebäude: Ort, Straße, Hausnummer, Ortsteil',
    '0:Memo25': 'Referenzgebäude: Gemarkung(en)',
    '0:Memo26': 'Referenzgebäude: Flur(e)',
    '0:Memo27': 'Referenzgebäude: Flurstück(e)',
    '0:CheckBox1': 'Nr. 1 Lageplan (1-fach)',
    '0:CheckBox2': 'Nr. 2 Bauzeichnungen (1-fach)',
    '0:CheckBox3': 'Nr. 3 Bautechnische Nachweise (1-fach)',
    '0:Memo28': 'Ort, Datum (Bauherrschaft)',
    '0:Memo29': 'Für die Bauherrschaft (Unterschrift)',
    '0:Memo30': 'Ort, Datum (Entwurfsverfassende)',
    '0:Memo31': 'Bauvorlageberechtigte Entwurfsverfassende (Unterschrift)',
  },
  zaehlt: zaehltNicht('0:Memo3', '0:Memo8', '0:Memo29', '0:Memo31'),
  gruppen: [
    gruppeV('bauherrschaft-erreichbar', 'Bauherrschaft: Telefon, Telefax oder E-Mail', 'eins', s0('Memo9', 'Memo10', 'Memo11')),
    gruppeV('entwurf-erreichbar', 'Entwurfsverfassende: Telefon, Telefax oder E-Mail', 'eins', s0('Memo17', 'Memo18', 'Memo19')),
  ],
});

export const vorgaben: Record<string, FormularProfil> = { 'nw010003|2022B': nw010003_2022B };
