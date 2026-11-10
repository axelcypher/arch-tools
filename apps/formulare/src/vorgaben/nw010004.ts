/**
 * Anlage I/2.1 zur VV BauPrüfVO – Anzeige der befristeten Nutzungsänderung bei der Gemeinde (§ 64 Absatz 3 BauO NRW
 * 2018), Stand 2026.
 *
 * Nach dem Vordruck:
 * - Auszug aus dem Liegenschaftskataster „bei Vorhaben nach den §§ 34 und 35 BauGB“ (Innen- oder Außenbereich).
 * - Bauzeichnungen und Bau-/Betriebsbeschreibung „nur falls erforderlich (§ 10 Absatz 3 BauPrüfVO)“ – nicht
 *   pauschal vorgeschrieben, zählen nicht.
 * - Lageplan und Kostenermittlung immer.
 * - Kammer-/Verzeichnisnummer der Entwurfsverfassenden „falls eingetragen“ – zählt nicht.
 * Eingänge und Aktenzeichen füllen Gemeinde und Bauaufsichtsbehörde aus; Unterschriften sind freiwillig.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { begruendet, gruppeV, ist, q, s, wenn, zaehltNicht } from './hilfen';

const s0 = s(0);

export const nw010004_2026C: FormularProfil = zusammen({
  abschnitte: {
    '0:Panel1': { titel: 'Gemeinde' },
    '0:Panel5': { titel: 'Eingang bei der Gemeinde (füllt die Gemeinde aus)' },
    '0:Panel2': { titel: 'Eingang bei der Bauaufsichtsbehörde (füllt die Behörde aus)' },
    '0:Panel9': { titel: 'Genehmigte Nutzung' },
    '0:Panel10': { titel: 'Geplante Nutzung und Dauer (bis zu 12 Monate)' },
    '0:Panel11': { titel: 'Beigefügte Unterlagen' },
    '0:Panel12': { titel: 'Ort, Datum (Bauherrschaft)' },
    '0:Panel13': { titel: 'Ort, Datum (Entwurfsverfassende)' },
  },
  feldTitel: {
    '0:Memo1': 'Gemeinde (Anschrift)',
    '0:Memo2': 'Gemeinde: PLZ, Ort',
    '0:Memo3': 'Eingangsstempel der Gemeinde',
    '0:Memo4': 'Aktenzeichen der Gemeinde',
    '0:Memo5': 'Eingangsstempel der Bauaufsichtsbehörde',
    '0:Memo6': 'Aktenzeichen der Bauaufsichtsbehörde',
    '0:Memo7': 'Bauherrschaft: Name, Vorname, Firma',
    '0:Memo8': 'Bauherrschaft: Straße, Hausnummer',
    '0:Memo9': 'Bauherrschaft: PLZ, Ort',
    '0:Memo10': 'Bauherrschaft vertreten durch (Name, Vorname, Anschrift)',
    '0:Memo11': 'Bauherrschaft: Telefon',
    '0:Memo12': 'Bauherrschaft: Telefax',
    '0:Memo13': 'Bauherrschaft: E-Mail',
    '0:Memo14': 'Entwurfsverfassende: Name, Vorname, Büro',
    '0:Memo15': 'Entwurfsverfassende: Straße, Hausnummer',
    '0:Memo16': 'Entwurfsverfassende: PLZ, Ort',
    '0:Memo17': 'Entwurfsverfassende: Kammer-Mitgliedsnummer oder Nr. im Verzeichnis der eingeschränkt Bauvorlageberechtigten (falls eingetragen)',
    '0:Memo18': 'Entwurfsverfassende: Telefon',
    '0:Memo19': 'Entwurfsverfassende: Telefax',
    '0:Memo20': 'Entwurfsverfassende: E-Mail',
    '0:Memo33': 'Grundstück: Zusatzangabe neben der Überschrift',
    '0:Memo21': 'Grundstück: Ort, Straße, Hausnummer, Ortsteil',
    '0:Memo22': 'Grundstück: Gemarkung(en)',
    '0:Memo23': 'Grundstück: Flur(e)',
    '0:Memo24': 'Grundstück: Flurstück(e)',
    '0:Memo25': 'Genehmigte Nutzung',
    '0:Memo26': 'Geplante Nutzung',
    '0:Memo27': 'Dauer der Nutzungsänderung: von',
    '0:Memo28': 'Dauer der Nutzungsänderung: bis',
    '0:CheckBox1': 'Auszug aus dem Liegenschaftskataster (Vorhaben nach §§ 34, 35 BauGB)',
    '0:CheckBox2': 'Lageplan (§ 3 BauPrüfVO)',
    '0:CheckBox3': 'Bauzeichnungen (nur falls erforderlich)',
    '0:CheckBox4': 'Bau- und Betriebsbeschreibung (nur falls erforderlich)',
    '0:CheckBox5': 'Kostenermittlung (§ 6 BauPrüfVO)',
    '0:Memo29': 'Ort, Datum (Bauherrschaft)',
    '0:Memo30': 'Für die Bauherrschaft (Unterschrift)',
    '0:Memo31': 'Ort, Datum (Entwurfsverfassende)',
    '0:Memo32': 'Entwurfsverfassende (Unterschrift)',
  },
  zaehlt: zaehltNicht('0:Memo3', '0:Memo4', '0:Memo5', '0:Memo6', '0:Memo10', '0:Memo17', '0:Memo33', '0:CheckBox3', '0:CheckBox4', '0:Memo30', '0:Memo32'),
  gruppen: [
    gruppeV('bauherrschaft-erreichbar', 'Bauherrschaft: Telefon, Telefax oder E-Mail', 'eins', s0('Memo11', 'Memo12', 'Memo13')),
    gruppeV('entwurf-erreichbar', 'Entwurfsverfassende: Telefon, Telefax oder E-Mail', 'eins', s0('Memo18', 'Memo19', 'Memo20')),
  ],
  bedingungen: {
    '0:CheckBox1': begruendet(
      wenn(ist('Planungsrecht', 'Innenbereich', 'Außenbereich')),
      'Bei einer Nutzungsänderung gehört der Auszug aus dem Liegenschaftskataster nur zu Vorhaben nach den §§ 34 und 35 BauGB.',
      q('baupruefvo', '10', 3),
      q('baupruefvo', '10', 1, undefined, 1),
    ),
  },
});

export const vorgaben: Record<string, FormularProfil> = { 'nw010004|2026C': nw010004_2026C };
