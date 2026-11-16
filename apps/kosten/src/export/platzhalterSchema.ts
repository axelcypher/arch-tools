import { GLOBAL_GRUPPE, PROJEKT_GRUPPE } from '@core/excel/projekt';
import type { Feld, PlatzhalterSchema } from '@core/excel/schema';
import { MENGEN_BEZUEGE, MENGEN_INFO } from '../mengen';

/**
 * Schema aller Platzhalter von NUMIO – Quelle für die Referenz im Excel-Dialog, das Blatt „Platzhalter“ der
 * Muster-Vorlage und docs/excel-vorlagen.md. Tests: platzhalterSchema.test.ts gegen buildKostenContext mit den
 * Beispieldaten aus platzhalterTestdaten.ts.
 */

/** Summenzeile einer Kostengruppe (kg.*, kg2.*) */
const KG_FELDER: Feld[] = [
  { name: 'kg', text: 'Kostengruppe nach DIN 276, z. B. „300“ (leer in der Zeile „Kostenrisiken“)' },
  { name: 'name', text: 'Bezeichnung der Kostengruppe nach DIN 276' },
  { name: 'von', text: 'Summe netto, untere Grenze der Bandbreite', einheit: '€' },
  { name: 'mittel', text: 'Summe netto, Mittelwert', einheit: '€' },
  { name: 'bis', text: 'Summe netto, obere Grenze der Bandbreite', einheit: '€' },
];

export const NUMIO_SCHEMA: PlatzhalterSchema = {
  app: 'NUMIO',
  beispieldaten:
    'Beispieldaten: Kostenschätzung für das Projekt „Musterhaus“ (BGF 540 m²), Regionalfaktor 1,1; Positionen KG 300 und 400 je m² BGF, KG 530 je m² Außenanlagenfläche (von Hand festgelegt: 400 m²), KG 540 pauschal, KG 560 ausgeschaltet, KG 610 je m² Wohnfläche (ohne Menge), KG 700 in % von KG 300 + 400, Kostenrisiken pauschal; zwei festgehaltene Stände. Beträge netto, auf ganze Euro gerundet.',
  abschnitte: [
    PROJEKT_GRUPPE,
    {
      art: 'einzelwerte',
      id: 'grundlagen',
      titel: 'Grundlagen der Ermittlung',
      werte: [
        { schluessel: 'stufe', text: 'Stufe der Kostenermittlung nach DIN 276, z. B. „Kostenschätzung“' },
        { schluessel: 'stufe.lph', text: 'Leistungsphase der Stufe, z. B. „LPh 2“' },
        { schluessel: 'stufe.hinweis', text: 'bei Kostenvoranschlag, Kostenanschlag und Kostenfeststellung: Hinweis auf die Fortschreibung mit Kennwerten, sonst leer' },
        { schluessel: 'preisstand', text: 'Kostenstand (Preisstand) der Ermittlung' },
        { schluessel: 'katalog', text: 'Herkunft der Kennwerte in einer Zeile' },
        { schluessel: 'katalog.name', text: 'Name der Kennwertsammlung' },
        { schluessel: 'katalog.quelle', text: 'Quelle der Kennwertsammlung' },
        { schluessel: 'katalog.stand', text: 'Stand der Kennwertsammlung' },
        { schluessel: 'index.basis', text: 'Baupreisindex zum Stand der Kennwerte (leer ohne)' },
        { schluessel: 'index.aktuell', text: 'aktueller Baupreisindex (leer ohne)' },
        { schluessel: 'regionalfaktor', text: 'Regionalfaktor (1 ohne Angabe)' },
        { schluessel: 'faktor', text: 'daraus der Faktor auf die Kennwerte (Index × Regionalfaktor)' },
        { schluessel: 'hinweise', text: 'alle Hinweise in einer Zelle (Zeilenumbrüche) – je Zeile: hinweis.text' },
        { schluessel: 'haftung', text: 'Hinweis zur Herkunft der Kennwerte' },
      ],
    },
    {
      art: 'einzelwerte',
      id: 'ergebnis',
      titel: 'Ergebnis',
      text: 'Gesamtkosten als Mittelwert mit Bandbreite (.von/.bis); bei der Kostenfeststellung sind von, Mittel und bis gleich.',
      werte: [
        { schluessel: 'gesamt.netto', text: 'Gesamtkosten netto (Mittel), einschließlich Kostenrisiken', einheit: '€' },
        { schluessel: 'gesamt.netto.von', text: 'Gesamtkosten netto, untere Grenze', einheit: '€' },
        { schluessel: 'gesamt.netto.bis', text: 'Gesamtkosten netto, obere Grenze', einheit: '€' },
        { schluessel: 'gesamt.brutto', text: 'Gesamtkosten brutto (Mittel)', einheit: '€' },
        { schluessel: 'gesamt.brutto.von', text: 'Gesamtkosten brutto, untere Grenze', einheit: '€' },
        { schluessel: 'gesamt.brutto.bis', text: 'Gesamtkosten brutto, obere Grenze', einheit: '€' },
        { schluessel: 'gesamt.mwst', text: 'Umsatzsteuer auf das Mittel', einheit: '€' },
        { schluessel: 'mwst', text: 'Umsatzsteuersatz', einheit: '%' },
        { schluessel: 'risiko', text: 'Kostenrisiken (gesondert ausgewiesen, netto, im Gesamt netto enthalten)', einheit: '€' },
        { schluessel: 'risiko.von', text: 'Kostenrisiken, untere Grenze', einheit: '€' },
        { schluessel: 'risiko.bis', text: 'Kostenrisiken, obere Grenze', einheit: '€' },
        {
          schluessel: 'kg300',
          muster: 'kg\\d{3}',
          text: 'Summe netto einer Kostengruppe der 1. oder 2. Ebene (kg300, kg330 …) – nur Kostengruppen mit Kosten; sonst bleibt der Platzhalter stehen',
          einheit: '€',
        },
        { schluessel: 'kg300.von', muster: 'kg\\d{3}\\.von', text: 'dieselbe Summe, untere Grenze', einheit: '€' },
        { schluessel: 'kg300.bis', muster: 'kg\\d{3}\\.bis', text: 'dieselbe Summe, obere Grenze', einheit: '€' },
        ...['bgf', 'bri', 'nuf', 'wofl'].flatMap((b) => {
          const m = MENGEN_INFO[b as keyof typeof MENGEN_INFO];
          const t = `Bauwerkskosten (KG 300 + 400) brutto je ${m.einheit} ${m.kurz}`;
          return [
            { schluessel: `kennwert.${b}`, text: `${t} (leer ohne Bezugsmenge)`, einheit: `€/${m.einheit}` },
            { schluessel: `kennwert.${b}.von`, text: `${t}, untere Grenze`, einheit: `€/${m.einheit}` },
            { schluessel: `kennwert.${b}.bis`, text: `${t}, obere Grenze`, einheit: `€/${m.einheit}` },
          ];
        }),
      ],
      beispiele: [
        {
          titel: 'Gesamtkosten mit Bandbreite',
          vorlage: [
            ['{{stufe}} ({{stufe.lph}}), Stand {{preisstand}}'],
            ['Gesamt brutto', '{{gesamt.brutto.von}}', '{{gesamt.brutto}}', '{{gesamt.brutto.bis}}'],
            ['KG 300', '{{kg300}}', 'KG 530', '{{kg530}}'],
          ],
          ergebnis: [
            ['Kostenschätzung (LPh 2), Stand 1.7.2026', null, null, null],
            ['Gesamt brutto', 1862031, 2152139, 2450729],
            ['KG 300', 1069200, 'KG 530', 52800],
          ],
        },
      ],
    },
    {
      art: 'einzelwerte',
      id: 'mengen',
      titel: 'Mengen (mengen.*)',
      text: 'Bezugsmengen als Einzelwert; je Zeile mit Ermittlung: Sammlung menge.',
      werte: MENGEN_BEZUEGE.map((b) => ({ schluessel: `mengen.${b}`, text: `${MENGEN_INFO[b].label} (${MENGEN_INFO[b].kurz})`, einheit: MENGEN_INFO[b].einheit })),
    },
    {
      art: 'sammlung',
      name: 'kg',
      titel: 'Kostengruppen der 1. Ebene',
      datensatz: 'je Kostengruppe',
      text: 'Kostengruppen der 1. Ebene nach DIN 276 mit Kosten; gibt es Kostenrisiken, folgt eine Zeile „Kostenrisiken“ ohne KG – so ergibt die Summe des Blocks das Gesamt netto.',
      felder: KG_FELDER,
      filter: [],
      enthaelt: [
        { sammlung: 'kg2', text: 'Kostengruppen der 2. Ebene dieser Kostengruppe' },
        { sammlung: 'position', text: 'Positionen dieser Kostengruppe (in der Zeile „Kostenrisiken“ die Risiko-Positionen)' },
      ],
      zugriff: { ueber: 'kg', text: 'Summe einer Kostengruppe der 1. Ebene über ihre Nummer (Felder wie kg.*).', beispiel: '{{kg:300.mittel}}' },
      hinweise: ['Ohne Kostenrisiken in der Liste: {{kg[kg!=].name}} … – der Filter „kg ungleich leer“ lässt die Zeile „Kostenrisiken“ weg.'],
      beispiele: [
        {
          titel: 'Kostenübersicht mit Summe',
          vorlage: [
            ['{{kg.kg}}', '{{kg.name}}', '{{kg.mittel}}'],
            [null, 'Gesamt netto', '=SUM(C1:C1)'],
          ],
          ergebnis: [
            ['300', 'Bauwerk – Baukonstruktionen', 1069200],
            ['400', 'Bauwerk – Technische Anlagen', 356400],
            ['500', 'Außenanlagen und Freiflächen', 82800],
            ['600', 'Ausstattung und Kunstwerke', 0],
            ['700', 'Baunebenkosten', 285120],
            [null, 'Kostenrisiken', 15000],
            [null, 'Gesamt netto', '=SUM(C1:C6)'],
          ],
        },
        {
          titel: 'Block je Kostengruppe mit Positionen',
          vorlage: [
            ['{{#kg[kg=500]}}{{kg.kg}}', '{{kg.name}}', '{{kg.mittel}}'],
            [null, '{{position.kg}} {{position.bezeichnung}}', '{{position.kosten}}', '{{position.aktiv}}{{/kg}}'],
          ],
          ergebnis: [
            ['500', 'Außenanlagen und Freiflächen', 82800, null],
            [null, '530 Befestigte Flächen', 52800, 'ja'],
            [null, '540 Carport', 30000, 'ja'],
            [null, '560 Einbauten in Außenanlagen', 5000, null],
          ],
        },
      ],
    },
    {
      art: 'sammlung',
      name: 'kg2',
      titel: 'Kostengruppen der 2. Ebene',
      datensatz: 'je Kostengruppe der 2. Ebene',
      text: 'Kostengruppen der 2. Ebene nach DIN 276 (z. B. 330, 530) mit Kosten.',
      felder: KG_FELDER,
      filter: [],
      enthaelt: [{ sammlung: 'position', text: 'Positionen dieser Kostengruppe' }],
      beispiele: [
        {
          titel: 'Zweite Ebene',
          vorlage: [['{{kg2.kg}}', '{{kg2.name}}', '{{kg2.mittel}}']],
          ergebnis: [
            ['530', 'Oberbau, Deckschichten', 52800],
            ['540', 'Baukonstruktionen', 30000],
            ['610', 'Allgemeine Ausstattung', 0],
          ],
        },
        {
          titel: 'Erste und zweite Ebene verschachtelt',
          vorlage: [
            ['{{#kg[kg=500]}}{{kg.kg}}', '{{kg.name}}', '{{kg.mittel}}'],
            ['{{#kg2}}', '{{kg2.kg}} {{kg2.name}}', '{{kg2.mittel}}'],
            [null, '{{position.bezeichnung}}', '{{position.kosten}}{{/kg2}}'],
            ['{{/kg}}'],
          ],
          ergebnis: [
            ['500', 'Außenanlagen und Freiflächen', 82800],
            [null, '530 Oberbau, Deckschichten', 52800],
            [null, 'Befestigte Flächen', 52800],
            [null, '540 Baukonstruktionen', 30000],
            [null, 'Carport', 30000],
          ],
        },
      ],
    },
    {
      art: 'sammlung',
      name: 'position',
      titel: 'Positionen',
      datensatz: 'je Position',
      text: 'Alle Positionen der Ermittlung, auch ausgeschaltete (dann aktiv leer) und Kostenrisiken (kg leer, kg_name „Kostenrisiken“).',
      felder: [
        { name: 'nr', text: 'laufende Nummer' },
        { name: 'kg', text: 'Kostengruppe nach DIN 276 (leer bei Kostenrisiken)' },
        { name: 'kg_name', text: 'Bezeichnung der Kostengruppe' },
        { name: 'bezeichnung', text: 'Bezeichnung der Position' },
        { name: 'bezug', text: 'Bezugsgröße, z. B. „m² BGF“, „psch“, „% von KG 300 + 400“' },
        { name: 'menge', text: 'Menge (bei % die Grundlage in €)' },
        { name: 'einheit', text: 'Einheit der Menge (bei % „€“)' },
        { name: 'kennwert', text: 'Kennwert netto nach Faktor, Mittel (bei % der Prozentsatz, bei Pauschalen der Betrag)' },
        { name: 'kennwert_von', text: 'Kennwert, untere Grenze' },
        { name: 'kennwert_bis', text: 'Kennwert, obere Grenze' },
        { name: 'kosten', text: 'Kosten netto, Mittel (auch bei ausgeschalteten Positionen berechnet)', einheit: '€' },
        { name: 'kosten_von', text: 'Kosten netto, untere Grenze', einheit: '€' },
        { name: 'kosten_bis', text: 'Kosten netto, obere Grenze', einheit: '€' },
        { name: 'aktiv', text: '„ja“, wenn die Position gerechnet wird' },
        { name: 'quelle', text: 'Herkunft des Kennwerts' },
        { name: 'bemerkung', text: 'Bemerkung' },
        { name: 'hinweis', text: 'Hinweis zur Position, z. B. fehlende Menge' },
      ],
      filter: [
        { name: 'aktiv', text: 'gerechnete Positionen' },
        { name: 'aus', text: 'ausgeschaltete Positionen' },
      ],
      enthaelt: [],
      hinweise: ['Ausgeschaltete Positionen erscheinen ohne Filter mit – für eine Aufstellung nur der gerechneten Positionen [aktiv] verwenden.'],
      beispiele: [
        {
          titel: 'Gerechnete Positionen einer Kostengruppe',
          vorlage: [['{{position[aktiv,kg>=500,kg<600].kg}}', '{{position[aktiv,kg>=500,kg<600].bezeichnung}}', '{{position.menge}} {{position.einheit}}', '{{position.kosten}}']],
          ergebnis: [
            ['530', 'Befestigte Flächen', '400 m²', 52800],
            ['540', 'Carport', '1 psch', 30000],
          ],
        },
        {
          titel: 'Ausgeschaltete Positionen nur, wenn es welche gibt',
          vorlage: [['{{#wenn position[aus]}}Nicht gerechnet:', '{{position[aus].bezeichnung}}{{/wenn}}']],
          ergebnis: [['Nicht gerechnet:', 'Einbauten in Außenanlagen']],
        },
      ],
    },
    {
      art: 'sammlung',
      name: 'menge',
      titel: 'Mengen',
      datensatz: 'je Menge',
      text: 'Alle Bezugsmengen mit Kürzel, Wert und Ermittlung (als Einzelwert: mengen.*).',
      felder: [
        { name: 'kurz', text: 'Kürzel, z. B. „BGF“' },
        { name: 'label', text: 'Bezeichnung, z. B. „Brutto-Grundfläche“' },
        { name: 'wert', text: 'Wert' },
        { name: 'einheit', text: 'Einheit, z. B. „m²“' },
        { name: 'ermittlung', text: 'wie die Menge ermittelt wurde bzw. „festgelegt“' },
        { name: 'festgelegt', text: '„ja“, wenn von Hand festgelegt' },
      ],
      filter: [{ name: 'festgelegt', text: 'von Hand festgelegte Mengen' }],
      enthaelt: [],
      beispiele: [
        {
          titel: 'Mengen mit Wert',
          vorlage: [['{{menge[wert>0,wert<300].kurz}}', '{{menge.wert}}', '{{menge.einheit}}']],
          ergebnis: [
            ['GRF', 135, 'm²'],
            ['DAF', 190.92, 'm²'],
          ],
        },
      ],
    },
    {
      art: 'sammlung',
      name: 'stand',
      titel: 'Festgehaltene Stände',
      datensatz: 'je Stand',
      text: 'Festgehaltene Stände der Kostenermittlung (Kostenkontrolle).',
      felder: [
        { name: 'nr', text: 'laufende Nummer' },
        { name: 'datum', text: 'Datum des Stands (T.M.JJJJ, ohne führende Null)' },
        { name: 'stufe', text: 'Stufe der Kostenermittlung' },
        { name: 'bemerkung', text: 'Bemerkung' },
        { name: 'netto', text: 'Gesamtkosten netto (Mittel)', einheit: '€' },
        { name: 'brutto', text: 'Gesamtkosten brutto (Mittel)', einheit: '€' },
        { name: 'brutto_von', text: 'Gesamtkosten brutto, untere Grenze', einheit: '€' },
        { name: 'brutto_bis', text: 'Gesamtkosten brutto, obere Grenze', einheit: '€' },
      ],
      filter: [],
      enthaelt: [],
      beispiele: [
        {
          titel: 'Kostenkontrolle',
          vorlage: [['{{stand.datum}}', '{{stand.stufe}}', '{{stand.brutto}}']],
          ergebnis: [
            ['1.3.2026', 'Kostenrahmen', 2152139],
            ['1.7.2026', 'Kostenschätzung', 2152139],
          ],
        },
      ],
    },
    {
      art: 'sammlung',
      name: 'hinweis',
      titel: 'Hinweise',
      datensatz: 'je Hinweis',
      text: 'Hinweise zur Ermittlung (fehlende Mengen, Faktoren, doppelte Positionen …).',
      felder: [
        { name: 'nr', text: 'laufende Nummer' },
        { name: 'text', text: 'Hinweis' },
      ],
      filter: [],
      enthaelt: [],
      beispiele: [
        {
          titel: 'Hinweise',
          vorlage: [['{{hinweis.nr}}', '{{hinweis.text}}']],
          ergebnis: [
            [1, '1 Position ohne Menge oder Kennwert: KG 610 (WoFl ist 0).'],
            [2, 'Kennwerte mit Faktor 1,1 angepasst (Baupreisindex/Regionalfaktor); Pauschalen und Prozentsätze unverändert.'],
          ],
        },
      ],
    },
    GLOBAL_GRUPPE,
  ],
};
