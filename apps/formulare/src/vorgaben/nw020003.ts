/**
 * Berechnung des umbauten Raumes nach DIN 277 (NRW 2018) – Brutto-Rauminhalt für die Kostenangabe im Bauantrag
 * (Anlage I/1 bzw. I/2 VV BauPrüfVO, Nr. 7.1).
 *
 * Es zählen die Kopfangaben (Bauantrag vom, Bauherrschaft, Entwurfsverfassende, Baugrundstück, Bauvorhaben) und
 * Ort/Datum. Die 16 Rechenzeilen sind gleichartig – man füllt so viele, wie es Baukörper gibt –, sie zählen nicht,
 * ebenso die Bezeichnung der Gesamtsumme. Ergebnisse, Zwischensummen und die Gesamtsumme rechnet FORMA. Telefon,
 * Telefax und E-Mail: eine Angabe genügt.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { gruppeV, s, zaehltNicht } from './hilfen';

const s0 = s(0);

/** erstes Feld (Bezeichnung) der Zeilen 1–16; dahinter Faktor, Länge, Breite, Höhe, Ergebnis */
const anfang = [5, 11, 17, 23, 30, 36, 42, 48, 55, 61, 67, 73, 80, 86, 92, 98];
const spalten = ['Bezeichnung', 'Faktor', 'Länge (m)', 'Breite (m)', 'Höhe (m)', 'Ergebnis (m³)'];
const zeilen = anfang.map((a, i) => ({ n: i + 1, felder: spalten.map((_, j) => `0:Memo${a + j}`) }));
/** Zwischensummen nach Zeile 4, 8, 12 und 16 */
const zwischensummen = ['0:Memo29', '0:Memo54', '0:Memo79', '0:Memo104'];

export const nw020003_2021L: FormularProfil = zusammen({
  abschnitte: {
    '0:Panel1': { titel: 'Berechnung des umbauten Raumes' },
  },
  feldTitel: {
    '0:Memo188': 'Anlage zum Bauantrag vom (Datum)',
    '0:Memo1': 'Bauherrschaft: Name, Vorname, Firma',
    '0:Memo2': 'Bauherrschaft: Straße, Hausnummer',
    '0:Memo3': 'Bauherrschaft: PLZ, Ort',
    '0:Memo155': 'Bauherrschaft: Telefon',
    '0:Memo156': 'Bauherrschaft: Telefax',
    '0:Memo157': 'Bauherrschaft: E-Mail',
    '0:Memo158': 'Entwurfsverfassende: Name, Vorname, Firma',
    '0:Memo159': 'Entwurfsverfassende: Straße, Hausnummer',
    '0:Memo160': 'Entwurfsverfassende: PLZ, Ort',
    '0:Memo161': 'Entwurfsverfassende: Telefon',
    '0:Memo162': 'Entwurfsverfassende: Telefax',
    '0:Memo163': 'Entwurfsverfassende: E-Mail',
    '0:Memo130': 'Baugrundstück: Ort, Straße, Hausnummer, Ortsteil',
    '0:Memo131': 'Baugrundstück: Gemarkung(en)',
    '0:Memo132': 'Baugrundstück: Flur(e)',
    '0:Memo133': 'Baugrundstück: Flurstück(e)',
    '0:Memo134': 'Baugrundstück: Größe (m²)',
    '0:Memo4': 'Bauvorhaben',
    ...Object.fromEntries(zeilen.flatMap((z) => z.felder.map((f, j) => [f, `Zeile ${z.n}: ${spalten[j]}`]))),
    ...Object.fromEntries(zwischensummen.map((f, i) => [f, `Zwischensumme Zeile ${4 * i + 1} bis ${4 * i + 4} (m³)`])),
    '0:Memo180': 'Gesamtsumme: Bezeichnung',
    '0:Memo181': 'Gesamtsumme umbauter Raum (m³)',
    '0:Memo182': 'Ort, Datum, Unterschrift',
  },
  // Rechenzeilen (ohne das berechnete Ergebnis) und die Bezeichnung der Gesamtsumme
  zaehlt: zaehltNicht(...zeilen.flatMap((z) => z.felder.slice(0, 5)), '0:Memo180'),
  gruppen: [
    gruppeV('bauherrschaft-erreichbar', 'Bauherrschaft: Telefon, Telefax oder E-Mail', 'eins', s0('Memo155', 'Memo156', 'Memo157')),
    gruppeV('entwurf-erreichbar', 'Entwurfsverfassende: Telefon, Telefax oder E-Mail', 'eins', s0('Memo161', 'Memo162', 'Memo163')),
  ],
});

export const vorgaben: Record<string, FormularProfil> = { 'nw020003|2021L': nw020003_2021L };
