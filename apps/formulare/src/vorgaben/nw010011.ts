/**
 * Anlage I/8 zur VV BauPrüfVO – Betriebsbeschreibung für gewerbliche Anlagen (§ 5 Absatz 2 BauPrüfVO), Stand 2024D.
 *
 * Der Vordruck hat keine Kästchen, nur Textfelder. Regeln:
 * - Nr. 1: Erzeugnisse oder Dienstleistung – ein Betrieb hat das eine oder das andere, eine Angabe genügt.
 * - Nr. 2: Betriebszeit an Sonn- und Feiertagen nur, wenn dann gearbeitet wird – keine Pflichtangabe.
 * - Nr. 4.1 bis 4.5 (Immissionsschutz, Abfall, Abwasser): die erste Zeile (Art) ist immer anzugeben (ggf. „keine“);
 *   Lage, Zeiten, Maßnahmen, Lagerung, Behandlung und Verbleib nur, wenn dort etwas anderes als „keine“ steht.
 *   Bei Geräuschen und Erschütterungen genügt Tages- oder Nachtzeit; die zweite Zeitzeile bei 4.3 ist frei.
 * - Nr. 5 Verfahren nach anderen Rechtsvorschriften: nur, wenn es solche Verfahren gibt; die Bescheide sind eine
 *   Tabelle (Zeile 1 bis 3) und zählen nicht.
 * - Genehmigungsvermerk füllt die Bauaufsichtsbehörde aus. „Datum, Unterschrift“ der Entwurfsverfassenden zählt wie in
 *   der Baubeschreibung (Anlage I/7) mit.
 */

import type { Bedingung, Teilbedingung } from '../bedingung';
import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { angekreuzt, fuer, gruppeV, s, und, zaehltNicht } from './hilfen';

const s0 = s(0);
const s1 = s(1);

const ungleich = (feld: string, wert: string): Teilbedingung => ({ art: 'feld', feld, pruefung: 'ungleich', wert });
/** Textfeld ausgefüllt und nicht nur „keine“ (o. ä.) */
const angegeben = (feld: string): Bedingung => und(angekreuzt(feld), ungleich(feld, 'keine'), ungleich(feld, 'keine.'), ungleich(feld, 'entfällt'), ungleich(feld, '-'), ungleich(feld, '–'));

export const nw010011: FormularProfil = zusammen({
  abschnitte: {
    '0:Panel1': { titel: 'Bauantrag, Bauherrschaft, Betreibende, Grundstück' },
    '0:Panel2': { titel: 'Nr. 1 Art des Betriebes oder der Anlage' },
    '0:Panel3': { titel: 'Nr. 2 Betriebszeit' },
    '0:Panel5': { titel: 'Nr. 3 Gesamtbeschäftigte am Betriebsort' },
    '0:Panel11': { titel: 'Nr. 4.1 Luftverunreinigung' },
    '0:Panel13': { titel: 'Nr. 4.2 Geräusche' },
    '0:Panel15': { titel: 'Nr. 4.3 Erschütterungen, mechanische Schwingungen' },
    '1:Panel1': { titel: 'Nr. 4.4 Abfallstoffe' },
    '1:Panel2': { titel: 'Nr. 4.5 Besonders zu behandelnde Abwässer' },
    '1:Panel5': { titel: 'Nr. 5 Verfahren nach anderen Rechtsvorschriften (nur wenn vorhanden)' },
    '1:Panel10': { titel: 'Entwurfsverfassende' },
    '1:Panel11': { titel: 'Genehmigungsvermerk (füllt die Bauaufsichtsbehörde aus)' },
  },
  feldTitel: {
    '0:Memo1': 'Bauantrag / Antrag auf Vorbescheid vom (Datum)',
    '0:Memo2': 'Bauherrschaft',
    '0:Memo4': 'Betreibende',
    '0:Memo3': 'Grundstück (Ort, Straße, Hausnummer)',
    '0:Memo5': 'Nr. 1 Art des Betriebes oder der Anlage',
    '0:Memo6': 'Nr. 1 Erzeugnisse',
    '0:Memo7': 'Nr. 1 Dienstleistung',
    '0:Memo8': 'Nr. 1 Rohstoffe, Materialien, Betriebsstoffe, Reststoffe, Waren',
    '0:Memo9': 'Nr. 2 Betriebszeit an Werktagen: von',
    '0:Memo10': 'Nr. 2 Betriebszeit an Werktagen: bis',
    '0:Memo11': 'Nr. 2 Betriebszeit an Sonn- und Feiertagen: von',
    '0:Memo12': 'Nr. 2 Betriebszeit an Sonn- und Feiertagen: bis',
    '0:Memo13': 'Nr. 3 Gesamtbeschäftigte am Betriebsort',
    '0:Memo14': 'Nr. 4.1 Luftverunreinigung: Art der Verunreinigung',
    '0:Memo15': 'Nr. 4.1 Lage der Emissionsöffnungen (Grundriss- und Höhenangaben)',
    '0:Memo16': 'Nr. 4.1 Maßnahmen zur Vermeidung schädlicher Luftverunreinigungen',
    '0:Memo17': 'Nr. 4.2 Geräusche: Ursache, Dauer, Häufigkeit',
    '0:Memo18': 'Nr. 4.2 Geräusche: Tageszeit von – bis',
    '0:Memo19': 'Nr. 4.2 Geräusche: Nachtzeit (22–6 Uhr) von – bis',
    '0:Memo20': 'Nr. 4.2 Lage der Geräuschquellen (Austrittsöffnungen, Richtung)',
    '0:Memo21': 'Nr. 4.2 Maßnahmen zur Vermeidung schädlicher Geräusche',
    '0:Memo22': 'Nr. 4.3 Erschütterungen: Art, Ursache, Dauer und Häufigkeit',
    '0:Memo23': 'Nr. 4.3 Erschütterungen: Tageszeit von – bis (Zeile 1)',
    '0:Memo24': 'Nr. 4.3 Erschütterungen: Nachtzeit (22–6 Uhr) von – bis (Zeile 1)',
    '0:Memo27': 'Nr. 4.3 Erschütterungen: Tageszeit von – bis (Zeile 2)',
    '0:Memo28': 'Nr. 4.3 Erschütterungen: Nachtzeit (22–6 Uhr) von – bis (Zeile 2)',
    '0:Memo25': 'Nr. 4.3 Lage der Erschütterungs- oder Schwingungsquellen',
    '0:Memo26': 'Nr. 4.3 Maßnahmen zur Vermeidung schädlicher Erschütterungen oder Schwingungen',
    '1:Memo1': 'Nr. 4.4 Abfallstoffe: Art, Menge pro Zeiteinheit',
    '1:Memo2': 'Nr. 4.4 Zwischenlagerung: Art, Ort und Menge',
    '1:Memo3': 'Nr. 4.4 Art der Beseitigung',
    '1:Memo4': 'Nr. 4.5 Besonders zu behandelnde Abwässer: Art, Menge pro Zeiteinheit',
    '1:Memo5': 'Nr. 4.5 Abwässer: Art und Ort der Behandlung',
    '1:Memo6': 'Nr. 4.5 Abwässer: Verbleib der Rückstände',
    '1:Memo7': 'Nr. 5 Verfahren nach anderen Rechtsvorschriften: Art, Gegenstand, Antragsdatum',
    '1:Memo11': 'Nr. 5 Zeile 1: Bescheid(e) vom',
    '1:Memo8': 'Nr. 5 Zeile 1: durch',
    '1:Memo9': 'Nr. 5 Zeile 1: Aktenzeichen',
    '1:Memo10': 'Nr. 5 Zeile 2: Bescheid(e) vom',
    '1:Memo12': 'Nr. 5 Zeile 2: durch',
    '1:Memo13': 'Nr. 5 Zeile 2: Aktenzeichen',
    '1:Memo14': 'Nr. 5 Zeile 3: Bescheid(e) vom',
    '1:Memo15': 'Nr. 5 Zeile 3: durch',
    '1:Memo16': 'Nr. 5 Zeile 3: Aktenzeichen',
    '1:Memo17': 'Entwurfsverfassende: Name, Vorname, Büro',
    '1:Memo18': 'Entwurfsverfassende: Straße, Hausnummer',
    '1:Memo19': 'Entwurfsverfassende: PLZ, Ort',
    '1:Memo20': 'Entwurfsverfassende: Datum, Unterschrift',
    '1:Memo21': 'Genehmigungsvermerk',
  },
  zaehlt: {
    // Sonn- und Feiertage, zweite Zeitzeile bei Erschütterungen: nur wenn zutreffend
    ...zaehltNicht(...s0('Memo11', 'Memo12', 'Memo27', 'Memo28')),
    // Nr. 5 nur, wenn es andere Verfahren gibt; Bescheide als Tabelle
    ...zaehltNicht(...s1('Memo7', 'Memo11', 'Memo8', 'Memo9', 'Memo10', 'Memo12', 'Memo13', 'Memo14', 'Memo15', 'Memo16')),
    ...zaehltNicht('1:Memo21'),
  },
  gruppen: [
    gruppeV('erzeugnisse', 'Nr. 1 Erzeugnisse oder Dienstleistung', 'eins', s0('Memo6', 'Memo7')),
    gruppeV('geraeusche-zeit', 'Nr. 4.2 Geräusche: Tages- oder Nachtzeit', 'eins', s0('Memo18', 'Memo19'), { bedingung: angegeben('0:Memo17') }),
    gruppeV('erschuetterung-zeit', 'Nr. 4.3 Erschütterungen: Tages- oder Nachtzeit', 'eins', s0('Memo23', 'Memo24'), { bedingung: angegeben('0:Memo22') }),
  ],
  bedingungen: {
    ...fuer(s0('Memo15', 'Memo16'), angegeben('0:Memo14')),
    ...fuer(s0('Memo20', 'Memo21'), angegeben('0:Memo17')),
    ...fuer(s0('Memo25', 'Memo26'), angegeben('0:Memo22')),
    ...fuer(s1('Memo2', 'Memo3'), angegeben('1:Memo1')),
    ...fuer(s1('Memo5', 'Memo6'), angegeben('1:Memo4')),
  },
});

export const vorgaben: Record<string, FormularProfil> = { 'nw010011|2024D': nw010011 };
