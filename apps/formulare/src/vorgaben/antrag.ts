/**
 * Gemeinsame Teile der Bauanträge nach VV BauPrüfVO (Anlage I/1 Baugenehmigungsverfahren, Anlage I/2 vereinfachtes
 * Baugenehmigungsverfahren): Blatt 1 bis zur Gebäudeklasse und auf Blatt 2 Abweichungen, Vorbescheid und Bindungen
 * tragen in beiden Formularen dieselben Komponentennamen.
 */

import type { FormularProfil } from '../profil';
import { angekreuzt, fuer, gruppeV, s, wenn, zaehltNicht } from './hilfen';

const s0 = s(0);
const s1 = s(1);

/** Profile zusammenfügen (spätere ergänzen bzw. ersetzen frühere Einträge) */
export function zusammen(...teile: Partial<FormularProfil>[]): FormularProfil {
  const out: FormularProfil = { abschnitte: {}, zaehlt: {}, feldTitel: {}, gruppen: [], bedingungen: {} };
  for (const t of teile) {
    Object.assign(out.abschnitte, t.abschnitte);
    Object.assign(out.zaehlt, t.zaehlt);
    Object.assign(out.feldTitel!, t.feldTitel);
    out.gruppen!.push(...(t.gruppen ?? []));
    Object.assign(out.bedingungen!, t.bedingungen);
  }
  return out;
}

/** Bauherrschaft und Entwurfsverfassende – Telefon, Mobiltelefon und E-Mail: eine Angabe genügt */
export const personen: Partial<FormularProfil> = {
  feldTitel: {
    '0:Memo5': 'Bauherrschaft: Name, Vorname, Firma',
    '0:Memo6': 'Bauherrschaft: Straße, Hausnummer',
    '0:Memo7': 'Bauherrschaft: PLZ, Ort',
    '0:Memo8': 'Bauherrschaft vertreten durch (Name, Vorname, Anschrift)',
    '0:Memo9': 'Bauherrschaft: Telefonnummer',
    '0:Memo20': 'Bauherrschaft: Mobiltelefonnummer',
    '0:Memo11': 'Bauherrschaft: E-Mail',
    '0:Memo12': 'Entwurfsverfassende: Name, Vorname, Büro',
    '0:Memo13': 'Entwurfsverfassende: Straße, Hausnummer',
    '0:Memo14': 'Entwurfsverfassende: PLZ, Ort',
    '0:Memo15': 'Bauvorlageberechtigte Person: Name, Vorname',
    '0:Memo16': 'Mitgliedsnummer der Architekten- oder Ingenieurkammer',
    '0:Memo22': 'Entwurfsverfassende: Telefonnummer',
    '0:Memo21': 'Entwurfsverfassende: Mobiltelefonnummer',
    '0:Memo10': 'Entwurfsverfassende: E-Mail',
  },
  // vertreten durch: nur, wenn jemand die Bauherrschaft vertritt
  zaehlt: zaehltNicht('0:Memo8'),
  gruppen: [
    gruppeV('bauherrschaft-erreichbar', 'Bauherrschaft: Telefon, Mobiltelefon oder E-Mail', 'eins', s0('Memo9', 'Memo20', 'Memo11')),
    gruppeV('entwurf-erreichbar', 'Entwurfsverfassende: Telefon, Mobiltelefon oder E-Mail', 'eins', s0('Memo22', 'Memo21', 'Memo10')),
  ],
};

/** Behörde, Eingangsstempel, Antragsart, Grundstück, Gebäudeklasse */
export const kopf: Partial<FormularProfil> = {
  abschnitte: {
    '0:Panel1': { titel: 'Untere Bauaufsichtsbehörde' },
    '0:Panel2': { titel: 'Eingangsstempel (füllt die Bauaufsichtsbehörde aus)' },
    '0:Panel3': { titel: 'Antrag' },
  },
  feldTitel: {
    '0:Memo1': 'Untere Bauaufsichtsbehörde (Anschrift)',
    '0:Memo3': 'Aktenzeichen der Bauaufsichtsbehörde',
    '0:CheckBox1': 'Bauantrag',
    '0:CheckBox2': 'Antrag auf Vorbescheid',
    '0:Memo34': 'Baugrundstück: Ort, Straße, Hausnummer, Ortsteil',
    '0:CheckBox4': 'Gebäudeklasse 1',
    '0:CheckBox5': 'Gebäudeklasse 2',
    '0:CheckBox6': 'Gebäudeklasse 3',
    '0:CheckBox7': 'Gebäudeklasse 4',
    '0:CheckBox8': 'Gebäudeklasse 5',
    '0:CheckBox22': 'Sonstige bauliche Anlage',
  },
  zaehlt: zaehltNicht('0:Memo3'),
  gruppen: [
    gruppeV('antragsart', 'Bauantrag oder Antrag auf Vorbescheid', 'genau', s0('CheckBox1', 'CheckBox2')),
    gruppeV('gebaeudeklasse', 'Gebäudeklasse', 'eins', s0('CheckBox4', 'CheckBox5', 'CheckBox6', 'CheckBox7', 'CheckBox8', 'CheckBox22')),
  ],
};

/** Blatt 2: Ausnahmen/Befreiungen/Abweichungen (nur wenn nötig), Vorbescheid, Bindungen */
export const blatt2: Partial<FormularProfil> = {
  abschnitte: {
    '1:Panel2': { titel: 'Ausnahme, Befreiung, Abweichung (nur wenn nötig)' },
    // nur bei einem Antrag auf Vorbescheid
    '1:Panel3': { titel: 'Bei Vorbescheid (§ 77 BauO NRW 2018)', bedingung: wenn(angekreuzt('0:CheckBox2')) },
    '1:Panel9': { titel: 'Bindungen zur Beurteilung des Vorhabens (nur wenn vorhanden)' },
  },
  feldTitel: {
    '1:CheckBox17': 'Abweichung nach § 69 Absatz 1 Satz 5 BauO NRW 2018 (Bescheinigung einer sachverständigen Person)',
    '1:CheckBox24': 'Vorbescheid: planungsrechtliche Zulässigkeit',
    '1:CheckBox28': 'Vorbescheid: bauordnungsrechtliche Zulässigkeit',
    '1:Memo3': 'Fragestellung des Vorbescheids',
    '1:CheckBox22': 'Bindung: Vorbescheid',
    '1:Memo25': 'Vorbescheid: Bescheid vom',
    '1:Memo26': 'Vorbescheid: erteilt von (Behörde)',
    '1:Memo27': 'Vorbescheid: Aktenzeichen',
    '1:CheckBox23': 'Bindung: Teilungsgenehmigung',
    '1:Memo28': 'Teilungsgenehmigung: Bescheid vom',
    '1:Memo29': 'Teilungsgenehmigung: erteilt von (Behörde)',
    '1:Memo30': 'Teilungsgenehmigung: Aktenzeichen',
    '1:CheckBox25': 'Bindung: Baulast(en)',
    '1:Memo2': 'Baulast Nr.',
    '1:Memo38': 'Baulast: Bescheid vom',
    '1:Memo39': 'Baulast: erteilt von (Behörde)',
    '1:Memo40': 'Baulast: Aktenzeichen',
    '1:CheckBox27': 'Bindung: Denkmalrechtliche Erlaubnis',
    '1:Memo31': 'Denkmalrechtliche Erlaubnis: Bescheid vom',
    '1:Memo32': 'Denkmalrechtliche Erlaubnis: erteilt von (Behörde)',
    '1:Memo33': 'Denkmalrechtliche Erlaubnis: Aktenzeichen',
    '1:CheckBox26': 'Bindung: Sonstige',
    '1:Memo41': 'Sonstige Bindung (Bezeichnung)',
    '1:Memo42': 'Sonstige Bindung: Bescheid vom',
    '1:Memo43': 'Sonstige Bindung: erteilt von (Behörde)',
    '1:Memo44': 'Sonstige Bindung: Aktenzeichen',
  },
  // die Kästchen der Bindungen sind eine Auswahl, keine Pflicht
  zaehlt: zaehltNicht('1:CheckBox22', '1:CheckBox23', '1:CheckBox25', '1:CheckBox27', '1:CheckBox26'),
  gruppen: [
    gruppeV('abweichungen', 'Ausnahme, Befreiung, Abweichung', 'nie', s1('CheckBox13', 'CheckBox14', 'CheckBox15', 'CheckBox18', 'CheckBox19', 'CheckBox17')),
    gruppeV('vorbescheid-art', 'Vorbescheid: planungs- oder bauordnungsrechtliche Zulässigkeit', 'eins', s1('CheckBox24', 'CheckBox28')),
  ],
  // eine Bindung: Datum, Behörde und Aktenzeichen nur, wenn sie angekreuzt ist
  bedingungen: {
    ...fuer(s1('Memo25', 'Memo26', 'Memo27'), wenn(angekreuzt('1:CheckBox22'))),
    ...fuer(s1('Memo28', 'Memo29', 'Memo30'), wenn(angekreuzt('1:CheckBox23'))),
    ...fuer(s1('Memo2', 'Memo38', 'Memo39', 'Memo40'), wenn(angekreuzt('1:CheckBox25'))),
    ...fuer(s1('Memo31', 'Memo32', 'Memo33'), wenn(angekreuzt('1:CheckBox27'))),
    ...fuer(s1('Memo41', 'Memo42', 'Memo43', 'Memo44'), wenn(angekreuzt('1:CheckBox26'))),
  },
};

/** Unterschriften auf dem letzten Blatt (Panel7: Memo10 Bauherrschaft, Memo11 Entwurfsverfassende) */
export const unterschriften = (seite: number): Partial<FormularProfil> => ({
  abschnitte: { [`${seite}:Panel7`]: { titel: 'Ort, Datum' } },
  feldTitel: { [`${seite}:Memo10`]: 'Ort, Datum (Bauherrschaft)', [`${seite}:Memo11`]: 'Ort, Datum (Entwurfsverfassende)' },
});
