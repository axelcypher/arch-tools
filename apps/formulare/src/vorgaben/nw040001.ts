/**
 * Anlage 1 zur GEG-UVO NRW – Bescheinigung über stichprobenhafte Kontrollen der Ausführung energiesparender
 * Maßnahmen auf der Baustelle und Erfüllungserklärung (§ 92 GEG), Stand 2022.
 *
 * Die Bescheinigung stellt die nachweisberechtigte Person aus; alle Angaben gehören dazu. Der Vordruck verlangt das
 * Datum der abschließenden Kontrolle, das Datum der Berechnungsdokumentation und den Energieausweis
 * (Registriernummer, Ausstellungsdatum) – keine Bedingungen. Telefon, Telefax und E-Mail: je Person genügt eine
 * Angabe.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { gruppeV, s } from './hilfen';

const s0 = s(0);

export const nw040001_2022L: FormularProfil = zusammen({
  abschnitte: {
    '0:Panel8': { titel: 'Bescheinigung und Erfüllungserklärung' },
    '0:Panel9': { titel: 'Ort, Datum, Unterschrift' },
  },
  feldTitel: {
    '0:Memo3': 'Bauherrschaft: Name, Vorname, Firma',
    '0:Memo4': 'Bauherrschaft: Straße, Hausnummer',
    '0:Memo5': 'Bauherrschaft: PLZ, Ort',
    '0:Memo6': 'Bauherrschaft: Telefon',
    '0:Memo7': 'Bauherrschaft: Telefax',
    '0:Memo8': 'Bauherrschaft: E-Mail',
    '0:Memo9': 'Entwurfsverfassende: Name, Vorname, Büro',
    '0:Memo11': 'Entwurfsverfassende: Straße, Hausnummer',
    '0:Memo12': 'Entwurfsverfassende: PLZ, Ort',
    '0:Memo13': 'Entwurfsverfassende: Telefon',
    '0:Memo14': 'Entwurfsverfassende: Telefax',
    '0:Memo15': 'Entwurfsverfassende: E-Mail',
    '0:Memo16': 'Fachplanende: Name, Vorname, Büro',
    '0:Memo17': 'Fachplanende: Straße, Hausnummer',
    '0:Memo18': 'Fachplanende: PLZ, Ort',
    '0:Memo19': 'Fachplanende: Telefon',
    '0:Memo20': 'Fachplanende: Telefax',
    '0:Memo21': 'Fachplanende: E-Mail',
    '0:Memo22': 'Baugrundstück: Ort, Straße, Hausnummer, Ortsteil',
    '0:Memo23': 'Baugrundstück: Gemarkung(en)',
    '0:Memo24': 'Baugrundstück: Flur(e)',
    '0:Memo25': 'Baugrundstück: Flurstück(e)',
    '0:Memo26': 'Baugrundstück: Größe (m²)',
    '0:Memo27': 'Bezeichnung des Vorhabens',
    '0:Memo1': 'Abschließende Kontrolle auf der Baustelle am (Datum)',
    '0:Memo2': 'Berechnungsdokumentation vom (Datum)',
    '0:Memo10': 'Energieausweis: Registriernummer',
    '0:Memo29': 'Energieausweis ausgestellt am (Datum)',
    '0:Memo28': 'Ort, Datum',
  },
  zaehlt: {},
  gruppen: [
    gruppeV('bauherrschaft-erreichbar', 'Bauherrschaft: Telefon, Telefax oder E-Mail', 'eins', s0('Memo6', 'Memo7', 'Memo8')),
    gruppeV('entwurf-erreichbar', 'Entwurfsverfassende: Telefon, Telefax oder E-Mail', 'eins', s0('Memo13', 'Memo14', 'Memo15')),
    gruppeV('fachplanung-erreichbar', 'Fachplanende: Telefon, Telefax oder E-Mail', 'eins', s0('Memo19', 'Memo20', 'Memo21')),
  ],
});

export const vorgaben: Record<string, FormularProfil> = { 'nw040001|2022L': nw040001_2022L };
