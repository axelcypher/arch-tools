/**
 * Rechenblatt (NRW 2018) – freie Anlage zum Bauantrag für Berechnungen, die kein eigener Vordruck abdeckt.
 *
 * Es zählen die Kopfangaben (Bauantrag vom, Bezeichnung der Anlage, Bauherrschaft, Entwurfsverfassende,
 * Baumaßnahme), die Berechnung selbst und die Angabe des Ergebnisses. Der Übertrag gilt nur für Folgeseiten, die
 * Nummer der Anlage und die Bemerkungen sind freiwillig. Summe und Ergebnis rechnet FORMA. Telefon, Telefax und
 * E-Mail: eine Angabe genügt.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { gruppeV, s, zaehltNicht } from './hilfen';

const s0 = s(0);

export const nw020009_2021L: FormularProfil = zusammen({
  abschnitte: {
    '0:Panel5': { titel: 'Bezeichnung der Anlage' },
  },
  feldTitel: {
    '0:Memo1': 'Anlage zum Bauantrag vom (Datum)',
    '0:Memo14': 'Bezeichnung der Anlage',
    '0:Memo25': 'Nummer der Anlage',
    '0:Memo2': 'Bauherrschaft: Name, Vorname, Firma',
    '0:Memo3': 'Bauherrschaft: Straße, Hausnummer',
    '0:Memo4': 'Bauherrschaft: PLZ, Ort',
    '0:Memo5': 'Bauherrschaft: Telefon',
    '0:Memo6': 'Bauherrschaft: Telefax',
    '0:Memo7': 'Bauherrschaft: E-Mail',
    '0:Memo8': 'Entwurfsverfassende: Name, Vorname, Büro',
    '0:Memo9': 'Entwurfsverfassende: Straße, Hausnummer',
    '0:Memo10': 'Entwurfsverfassende: PLZ, Ort',
    '0:Memo11': 'Entwurfsverfassende: Telefon',
    '0:Memo12': 'Entwurfsverfassende: Telefax',
    '0:Memo13': 'Entwurfsverfassende: E-Mail',
    '0:Memo15': 'Bezeichnung der Baumaßnahme',
    '0:Memo16': 'Übertrag von Seite',
    '0:Memo17': 'Übertrag: Summe',
    '0:Memo18': 'Übertrag: Einheit',
    '0:Memo19': 'Berechnung',
    '0:Memo20': 'Ergebnis der Berechnung (Summe)',
    '0:Memo21': 'Ergebnis der Berechnung: Bezeichnung',
    '0:Memo22': 'Ergebnis der Berechnung: Wert',
    '0:Memo23': 'Ergebnis der Berechnung: Einheit',
    '0:Memo24': 'Bemerkungen',
  },
  zaehlt: zaehltNicht('0:Memo25', '0:Memo16', '0:Memo17', '0:Memo18', '0:Memo24'),
  gruppen: [
    gruppeV('bauherrschaft-erreichbar', 'Bauherrschaft: Telefon, Telefax oder E-Mail', 'eins', s0('Memo5', 'Memo6', 'Memo7')),
    gruppeV('entwurf-erreichbar', 'Entwurfsverfassende: Telefon, Telefax oder E-Mail', 'eins', s0('Memo11', 'Memo12', 'Memo13')),
  ],
});

export const vorgaben: Record<string, FormularProfil> = { 'nw020009|2021L': nw020009_2021L };
