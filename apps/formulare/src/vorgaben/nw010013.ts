/**
 * Anlage I/10 zur VV BauPrüfVO – Antrag auf Abweichung, Ausnahme und Befreiung, Stand 2026.
 *
 * Über Ausnahmen und Befreiungen (§ 31 BauGB) entscheidet die Bauaufsichtsbehörde im Einvernehmen mit der Gemeinde
 * (§ 36 BauGB) – die Gemeinde als Empfängerin nur dann; Abweichungen (§ 69 BauO NRW 2018) gehen an die
 * Bauaufsichtsbehörde. Die Eingangsstempel füllen die Behörden aus.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { angekreuzt, gruppeV, oder, s, zaehltNicht } from './hilfen';

const s0 = s(0);
const s1 = s(1);

export const nw010013_2026I: FormularProfil = zusammen({
  abschnitte: {
    '0:Panel13': { titel: 'Gemeinde und Bauaufsichtsbehörde' },
    '0:Panel1': { titel: 'Eingangsstempel (füllen die Behörden aus)' },
    '1:Panel8': { titel: 'Art des Antrags und Begründung' },
    '1:Panel11': { titel: 'Ort, Datum' },
  },
  feldTitel: {
    '0:Memo1': 'Gemeinde (Anschrift)',
    '0:Memo2': 'Untere Bauaufsichtsbehörde (Anschrift)',
    '0:Memo3': 'Eingangsstempel der Gemeinde',
    '0:Memo4': 'Eingangsstempel der Bauaufsichtsbehörde',
    '0:Memo5': 'Bauherrschaft: Name, Vorname, Firma',
    '0:Memo6': 'Bauherrschaft: Straße, Hausnummer',
    '0:Memo7': 'Bauherrschaft: PLZ, Ort',
    '0:Memo8': 'Bauherrschaft vertreten durch (Name, Vorname, Anschrift)',
    '0:Memo9': 'Bauherrschaft: Telefonnummer',
    '0:Memo10': 'Bauherrschaft: Mobiltelefonnummer',
    '0:Memo11': 'Bauherrschaft: E-Mail',
    '0:Memo12': 'Grundstück: Ort, Straße, Hausnummer, Ortsteil',
    '0:Memo16': 'Bezeichnung des Vorhabens',
    '1:CheckBox1': 'Abweichung',
    '1:CheckBox2': 'Befreiung',
    '1:CheckBox3': 'Ausnahme',
    '1:Memo4': 'Begründung mit Angabe der Vorschrift',
    '1:Memo24': 'Ort, Datum',
  },
  zaehlt: zaehltNicht('0:Memo3', '0:Memo4', '0:Memo8'),
  gruppen: [
    gruppeV('erreichbar', 'Bauherrschaft: Telefon, Mobiltelefon oder E-Mail', 'eins', s0('Memo9', 'Memo10', 'Memo11')),
    gruppeV('art', 'Abweichung, Befreiung oder Ausnahme', 'eins', s1('CheckBox1', 'CheckBox2', 'CheckBox3')),
  ],
  bedingungen: {
    '0:Memo1': oder(angekreuzt('1:CheckBox2'), angekreuzt('1:CheckBox3')),
  },
});

export const vorgaben: Record<string, FormularProfil> = { 'nw010013|2026I': nw010013_2026I };
