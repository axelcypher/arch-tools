/**
 * Rechnerischer Nachweis über die Höhe der Fußbodenoberkante des höchstgelegenen Geschosses (NRW 2018) – Grundlage
 * der Gebäudeklasse (§ 2 Absatz 3 BauO NRW 2018).
 *
 * Es zählen die Kopfangaben (Bauherrschaft, Entwurfsverfassende, Baugrundstück, Bauvorhaben), die beiden
 * Bezugshöhen des Erdgeschosses, die Gebäudeklasse und Ort/Datum. Die Geschosszeilen sind gleichartig – man füllt
 * so viele, wie das Gebäude Geschosse hat –, sie zählen nicht. Die Höhe des höchstgelegenen Aufenthaltsraums rechnet
 * FORMA. Telefon, Telefax und E-Mail: eine Angabe genügt.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { gruppeV, s, zaehltNicht } from './hilfen';

const s0 = s(0);

/** Geschosszeilen: Geschoss Memo6, Höhe Memo7 … Geschoss Memo24, Höhe Memo25 */
const zeilen = Array.from({ length: 10 }, (_, i) => ({ n: i + 1, geschoss: `0:Memo${6 + 2 * i}`, hoehe: `0:Memo${7 + 2 * i}` }));

export const nw020004_2021L: FormularProfil = zusammen({
  abschnitte: {
    '0:Panel5': { titel: 'Bauvorhaben' },
    '0:Panel2': { titel: 'Höhen der Geschosse' },
    '0:Panel6': { titel: 'Gebäudeklasse' },
  },
  feldTitel: {
    '0:Memo1': 'Bauherrschaft: Name, Vorname, Firma',
    '0:Memo2': 'Bauherrschaft: Straße, Hausnummer',
    '0:Memo26': 'Bauherrschaft: PLZ, Ort',
    '0:Memo27': 'Bauherrschaft: Telefon',
    '0:Memo28': 'Bauherrschaft: Telefax',
    '0:Memo29': 'Bauherrschaft: E-Mail',
    '0:Memo31': 'Entwurfsverfassende: Name, Vorname, Firma',
    '0:Memo32': 'Entwurfsverfassende: Straße, Hausnummer',
    '0:Memo34': 'Entwurfsverfassende: PLZ, Ort',
    '0:Memo35': 'Entwurfsverfassende: Telefon',
    '0:Memo36': 'Entwurfsverfassende: Telefax',
    '0:Memo37': 'Entwurfsverfassende: E-Mail',
    '0:Memo130': 'Baugrundstück: Ort, Straße, Hausnummer, Ortsteil',
    '0:Memo131': 'Baugrundstück: Gemarkung(en)',
    '0:Memo132': 'Baugrundstück: Flur(e)',
    '0:Memo133': 'Baugrundstück: Flurstück(e)',
    '0:Memo134': 'Baugrundstück: Größe (m²)',
    '0:Memo3': 'Bauvorhaben (Errichtung, Änderung)',
    '0:Memo4': 'OK FF EG = 0,00 entspricht (m über NHN)',
    '0:Memo5': 'OK FF EG über Gelände im Mittel (m)',
    ...Object.fromEntries(
      zeilen.flatMap((z) => [
        [z.geschoss, `Zeile ${z.n}: Geschoss`],
        [z.hoehe, `Zeile ${z.n}: Geschosshöhe (m)`],
      ]),
    ),
    '0:Memo30': 'Höhe des höchstgelegenen Aufenthaltsraums über Gelände (m)',
    '0:CheckBox3': 'Gebäudeklasse 1',
    '0:CheckBox1': 'Gebäudeklasse 2',
    '0:CheckBox2': 'Gebäudeklasse 3',
    '0:CheckBox4': 'Gebäudeklasse 4',
    '0:CheckBox5': 'Gebäudeklasse 5',
    '0:Memo33': 'Ort, Datum, Unterschrift',
  },
  zaehlt: zaehltNicht(...zeilen.flatMap((z) => [z.geschoss, z.hoehe])),
  gruppen: [
    gruppeV('bauherrschaft-erreichbar', 'Bauherrschaft: Telefon, Telefax oder E-Mail', 'eins', s0('Memo27', 'Memo28', 'Memo29')),
    gruppeV('entwurf-erreichbar', 'Entwurfsverfassende: Telefon, Telefax oder E-Mail', 'eins', s0('Memo35', 'Memo36', 'Memo37')),
    gruppeV('gebaeudeklasse', 'Gebäudeklasse', 'eins', s0('CheckBox3', 'CheckBox1', 'CheckBox2', 'CheckBox4', 'CheckBox5')),
  ],
});

export const vorgaben: Record<string, FormularProfil> = { 'nw020004|2021L': nw020004_2021L };
