/**
 * Angaben zur Artenschutzprüfung gemäß § 44 Absatz 5 BNatSchG (Nr. 5 der Anlage I/3, „Angaben zum Artenschutz“).
 * Die Stände 2024I und 2025I haben dieselben Felder und dieselbe Lage.
 *
 * Regeln:
 * - Nr. 3 bis 5: jede Frage ist ja oder nein (je eine Auswahl). Bei den Laubgehölzen, der Brachfläche und den
 *   Gebäuden stehen je zwei Fragen in einer Zeile (beseitigt / zurückgeschnitten bzw. vorübergehend in Anspruch
 *   genommen) – jede für sich.
 * - Antragsteller/in: der Name der juristischen Person nur bei juristischen Personen – keine Pflichtangabe.
 * - Nr. 6 „Zu 3.: Art der Feststellung“ nur, wenn in Nr. 3 etwas mit „ja“ beantwortet ist; „zu 4. und 5.“
 *   (Zeitraum, Beschreibung der Veränderung) nur, wenn in Nr. 4 oder 5 etwas mit „ja“ beantwortet ist.
 * - Nr. 7 Schutz-/Vermeidungsmaßnahmen sind eine freie Auswahl; die eigene Maßnahme (Textfeld neben dem dritten
 *   Kästchen) nur, wenn es angekreuzt ist, die Beschreibung, sobald eine Maßnahme angekreuzt ist.
 * - Unterschrift zählt nicht (reines Unterschriftsfeld).
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { angekreuzt, fuer, gruppeV, oder, s, wenn, zaehltNicht } from './hilfen';

const s1 = s(1);

/** Fragen mit ja/nein: [Gruppen-ID, Titel, Nummer des ja-Kästchens] – nein ist das folgende */
const fragen: [string, string, number][] = [
  ['gehoelze', 'Nr. 3 Lebensstätte Gehölze', 1],
  ['gewaesser', 'Nr. 3 Lebensstätte Gewässer (auch zeitweise trocken fallend)', 3],
  ['brache', 'Nr. 3 Lebensstätte Brachfläche', 5],
  ['voegel', 'Nr. 3 Vorkommen Vögel', 7],
  ['fledermaeuse', 'Nr. 3 Vorkommen Fledermäuse', 9],
  ['amphibien', 'Nr. 3 Vorkommen Frösche/Kröten/Molche', 11],
  ['eidechsen', 'Nr. 3 Vorkommen Eidechsen', 13],
  ['gehoelze-10', 'Nr. 4 Mehr als 10 % der Gehölze entfernt', 15],
  ['laub-beseitigt', 'Nr. 4 Laubgehölze außerhalb 01.10.–28.02. beseitigt', 17],
  ['laub-rueckschnitt', 'Nr. 4 Laubgehölze außerhalb 01.10.–28.02. zurückgeschnitten', 19],
  ['obstbaum', 'Nr. 4 Obstbaum/-bäume (Hochstamm) beseitigt', 21],
  ['baum-1m', 'Nr. 4 Baum/Bäume mit Stammumfang über 1 m beseitigt', 23],
  ['baumhoehle', 'Nr. 4 Höhle am Baum/an Bäumen beseitigt', 25],
  ['brache-beseitigt', 'Nr. 4 Brachfläche beseitigt', 27],
  ['brache-voruebergehend', 'Nr. 4 Brachfläche vorübergehend in Anspruch genommen', 29],
  ['gewaesser-beseitigt', 'Nr. 4 Gewässer beseitigt', 31],
  ['vogelnest-grundstueck', 'Nr. 4 Vogelnest/er beseitigt', 33],
  ['fledermausquartier', 'Nr. 4 Fledermausquartier/e beseitigt', 35],
  ['gebaeude-beseitigt', 'Nr. 5 Gebäude/-teil/e beseitigt', 37],
  ['gebaeude-voruebergehend', 'Nr. 5 Gebäude/-teil/e vorübergehend in Anspruch genommen', 39],
  ['dachausbau', 'Nr. 5 Dachausbau/-erneuerung bei nicht ausgebautem Dachboden', 41],
  ['dachueberstand', 'Nr. 5 Dachüberstand von mehr als 20 cm verändert', 43],
  ['vogelnest-gebaeude', 'Nr. 5 Vogelnest/er am Gebäude beseitigt', 45],
  ['verschalung', 'Nr. 5 Verschalung beseitigt', 47],
  ['leerstand', 'Nr. 5 Gebäude/-teil/e seit mehr als 2 Jahren nicht regelmäßig genutzt', 49],
];

const ja = (n: number) => `0:CheckBox${n}`;
const nein = (n: number) => `0:CheckBox${n + 1}`;
const jaIn = (von: number, bis: number) => fragen.filter(([, , n]) => n >= von && n <= bis).map(([, , n]) => angekreuzt(ja(n)));

export const nw020012: FormularProfil = zusammen({
  abschnitte: {
    '0:Panel1': { titel: 'Anschriftenfeld (oben links)' },
    '0:Panel2': { titel: 'Nr. 1 Bauvorhaben' },
    '0:Panel6': { titel: 'Nr. 2 Antragsteller/in' },
    '0:-': { titel: 'Nr. 3 bis 5 Lebensstätten, Tiere, Veränderungen, Maßnahmen an Gebäuden' },
    '1:Panel1': { titel: 'Nr. 6 Zu 3.: Art der Feststellung', bedingung: oder(...jaIn(1, 13)) },
    '1:Panel2': { titel: 'Nr. 6 Zu 4. und 5.: Geplanter Zeitraum der Durchführung', bedingung: oder(...jaIn(15, 49)) },
    '1:Panel3': { titel: 'Nr. 6 Zu 4. und 5.: Beschreibung der Veränderung', bedingung: oder(...jaIn(15, 49)) },
    '1:-': { titel: 'Nr. 7 Schutz-/Vermeidungsmaßnahmen' },
    '1:Panel4': { titel: 'Nr. 7 Weitere Schutz-/Vermeidungsmaßnahme' },
    '1:Panel5': { titel: 'Nr. 7 Beschreibung der Maßnahme' },
    '1:Panel11': { titel: 'Erklärung: Ort, Datum, Unterschrift' },
  },
  feldTitel: {
    '0:Memo1': 'Anschriftenfeld (oben links)',
    '0:Memo2': 'Bauvorhaben: Art/Umfang',
    '0:Memo3': 'Bauvorhaben: Straße, Hausnummer',
    '0:Memo4': 'Bauvorhaben: PLZ',
    '0:Memo5': 'Bauvorhaben: Ort',
    '0:Memo6': 'Antragsteller/in: Name der juristischen Person',
    '0:Memo7': 'Antragsteller/in: Name (bei juristischen Personen Ansprechpartner/in)',
    '0:Memo8': 'Antragsteller/in: Vorname',
    '0:Memo9': 'Antragsteller/in: Straße, Hausnummer',
    '0:Memo10': 'Antragsteller/in: PLZ',
    '0:Memo11': 'Antragsteller/in: Ort',
    ...Object.fromEntries(
      fragen.flatMap(([, t, n]) => [
        [ja(n), `${t}: ja`],
        [nein(n), `${t}: nein`],
      ]),
    ),
    '1:Memo1': 'Zu 3.: Art der Feststellung (Beobachtungen, Artbezeichnungen)',
    '1:Memo2': 'Zu 4. und 5.: Geplanter Zeitraum der Durchführung',
    '1:Memo3': 'Zu 4. und 5.: Beschreibung der Veränderung (Art/Umfang, Wirkungen auf geschützte Tiere/Lebensstätten)',
    '1:CheckBox1': 'Nr. 7 Ersatzgewässer wird vorzeitig angelegt',
    '1:CheckBox2': 'Nr. 7 Künstliche Nisthilfen werden vorzeitig bereitgestellt',
    '1:CheckBox3': 'Nr. 7 Weitere Schutz-/Vermeidungsmaßnahme',
    '1:Memo4': 'Nr. 7 Weitere Schutz-/Vermeidungsmaßnahme (Bezeichnung)',
    '1:Memo5': 'Nr. 7 Beschreibung der Maßnahme (Struktur/Art/Umfang/Zeitraum)',
    '1:Memo28': 'Erklärung: Ort, Datum',
    '1:Memo6': 'Erklärung: Unterschrift',
  },
  zaehlt: zaehltNicht('0:Memo6', '1:Memo6'),
  gruppen: [...fragen.map(([id, t, n]) => gruppeV(id, t, 'eins', [ja(n), nein(n)])), gruppeV('massnahmen', 'Nr. 7 Schutz-/Vermeidungsmaßnahmen', 'nie', s1('CheckBox1', 'CheckBox2', 'CheckBox3'))],
  bedingungen: {
    '1:Memo4': wenn(angekreuzt('1:CheckBox3')),
    ...fuer(s1('Memo5'), oder(...s1('CheckBox1', 'CheckBox2', 'CheckBox3').map(angekreuzt))),
  },
});

export const vorgaben: Record<string, FormularProfil> = { 'nw020012|2025I': nw020012, 'nw020012|2024I': nw020012 };
