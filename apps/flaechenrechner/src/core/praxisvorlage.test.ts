import { describe, expect, it } from 'vitest';
import { computeProject } from '@core/calc';
import { pruefeBlatt } from '@core/excel/pruefung';
import { beispielAusfuehren, vorlagenZeilen } from '@core/excel/schema';
import { rectPoints } from '@core/geometry';
import type { Storey } from '@core/model';
import { createOutline, createProject, createRoom, createStorey } from '@core/model';
import { defaultDach } from '@core/roof';
import { buildExportContext } from './exportData';
import { QUADRIO_SCHEMA } from './platzhalterSchema';

/**
 * Praxisfall: Struktur einer Büro-Vorlage für QUADRIO (Blätter Nebenflächen, NUF/TF/VF, BGF, BRI – ohne echte Daten),
 * gegen ein erfundenes Projekt: Keller, EG und OG normal, DG mit Satteldach, Balkon im Sonderfall, eine Wohnung und ein
 * Raum ohne Wohnung. Die Tests halten das tatsächliche Verhalten der Engine und die Hinweise der Vorlagenprüfung fest.
 */
function projekt(dgAlsNormal = false) {
  const p = createProject('Praxisfall');
  const kg = p.storeys[0];
  kg.name = 'KG';
  const eg = createStorey('EG', 2.75);
  const og = createStorey('OG', 2.75);
  const dg = createStorey('DG', 2.5);
  p.storeys.push(eg, og, dg);
  const raum = (st: Storey, name: string, w: number, h: number, nutzung: 'NUF1' | 'NUF7' | 'TF' | 'VF', wohnung?: string, s = false) => {
    const r = createRoom(rectPoints({ x: 0, y: 0 }, { x: w, y: h }), '', name);
    r.nutzung = nutzung;
    if (wohnung !== undefined) r.wofl = { kategorie: s ? 'freisitz' : 'voll', wohnung };
    if (s) r.umschliessung = 'S';
    st.shapes.push(r);
  };
  raum(kg, 'Keller', 5, 4, 'NUF7');
  raum(kg, 'Heizung', 2, 2, 'TF');
  raum(eg, 'Wohnen', 5, 4, 'NUF1', 'WE 1');
  raum(eg, 'Flur', 2, 1.5, 'VF', 'WE 1');
  raum(og, 'Zimmer', 4, 3, 'NUF1', 'WE 1');
  raum(og, 'Balkon', 2, 1.5, 'NUF1', 'WE 1', true);
  raum(dg, 'Studio', 4, 4, 'NUF1', '');
  for (const st of [kg, eg, og]) st.shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 })));
  const balkon = createOutline(rectPoints({ x: 0, y: 8 }, { x: 2, y: 9.5 }), 'Balkon');
  balkon.umschliessung = 'S';
  og.shapes.push(balkon);
  const dach = createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 }), 'Dach');
  dach.dach = { ...defaultDach('sattel', 0), neigung: 40 };
  dg.shapes.push(dach);
  if (dgAlsNormal) dg.dachgeschoss = false;
  return p;
}
const kontext = (dgAlsNormal = false) => {
  const p = projekt(dgAlsNormal);
  return buildExportContext(p, computeProject(p), new Date(2026, 10, 16));
};
const ctx = kontext();
const pruefe = (spec: (string | null)[][]) => pruefeBlatt(vorlagenZeilen(spec), ctx, { schema: QUADRIO_SCHEMA }).map((h) => `${h.ort} ${h.art}`);

describe('Praxisfall Büro-Vorlage', () => {
  it('Befund 1: #wenn und #geschoss in einer Zeile – der Geschossblock öffnet nicht, {{/geschoss}} schließt den äußeren Block', () => {
    const blatt = [
      ['{{#wenn raum[nebenflaeche]}}Nebenflächen'],
      ['{{#geschoss}}{{geschoss.name|einmal}}', '{{raum[nebenflaeche].name}}{{#wenn[nebenflaeche.wohnung!=0]}} - {{raum[nebenflaeche].wohnung}}[[{{/wenn}}', '{{raum[nebenflaeche].flaeche_roh}}'],
      ['Brutto-Nebenfläche gesamt', null, '=SUM(C2:C2)'],
      ['{{/geschoss}}'],
      ['Netto-Nebenfläche gesamt'],
      ['{{/wenn}}'],
    ];
    // Bedingung [nebenflaeche.wohnung!=0] ist ein unbekannter Filter → die ganze Zeile 2 entfällt
    // Bedingung [nebenflaeche.wohnung!=0] ist ein unbekannter Filter → die ganze Zeile 2 entfällt; {{/geschoss}} schließt den
    // äußeren #wenn, deshalb steht „Netto“ immer da, und {{/wenn}} am Ende ist verwaist
    expect(beispielAusfuehren({ vorlage: blatt }, ctx)).toEqual([
      ['Nebenflächen', null, null],
      ['Brutto-Nebenfläche gesamt', null, '=SUM(0)'],
      ['Netto-Nebenfläche gesamt', null, null],
    ]);
    // „[[“ steht außerhalb der Klammern und ist nur Text; weil der Geschossblock nicht öffnet, wiederholt geschoss.name die Zeile
    expect(pruefe(blatt)).toEqual(['B2 markierung-zeile', 'B2 filterpunkt', 'A2 block-doppelt', 'B2 zweite-sammlung', 'A4 block-falsch', 'A6 block-verwaist']);
    // so geht es: Text nur bei gefüllter Wohnung mit |vor:
    const richtig = [
      ['{{#wenn raum[nebenflaeche]}}Nebenflächen'],
      ['{{#geschoss}}{{geschoss.name|einmal}}', '{{raum[nebenflaeche].name}}{{raum[nebenflaeche].wohnung|vor: - }}', '{{raum[nebenflaeche].flaeche_roh}}'],
      ['Brutto-Nebenfläche gesamt', null, '=SUM(C2:C2)'],
      ['{{/geschoss}}'],
      ['{{/wenn}}'],
    ];
    expect(pruefe(richtig)).toEqual([]);
    expect(beispielAusfuehren({ vorlage: richtig }, ctx)).toEqual([
      ['Nebenflächen', null, null],
      ['KG', 'Keller', 20],
      [null, 'Heizung', 4],
      ['Brutto-Nebenfläche gesamt', null, '=SUM(C2:C3)'],
    ]);
  });

  it('Befund 2: {{#wenn raum[nebenflaeche!=0]}} ist nie erfüllt – Raumzeilen haben kein Feld nebenflaeche', () => {
    expect(beispielAusfuehren({ vorlage: [['{{#wenn raum[nebenflaeche!=0]}}ja{{/wenn}}']] }, ctx)).toEqual([]);
    expect(pruefe([['{{#wenn raum[nebenflaeche!=0]}}ja{{/wenn}}']])).toEqual(['A1 vergleichsfeld']);
  });

  it('Befund 3: [hnf,s!=0] im Geschossblock nie erfüllt; [nnf!=0] mit den neuen Summen erfüllt', () => {
    const blatt = [['{{#geschoss}}{{geschoss.name}}'], ['{{#wenn[hnf,s!=0]}}S-Flächen{{/wenn}}'], ['{{#wenn[nnf!=0]}}NNF{{/wenn}}'], ['{{/geschoss}}']];
    expect(beispielAusfuehren({ vorlage: blatt }, ctx)).toEqual([['KG'], ['NNF'], ['EG'], ['OG'], ['DG']]);
    expect(pruefe(blatt)).toEqual(['A2 vergleichsfeld', 'A2 filterfelder']);
    expect(beispielAusfuehren({ vorlage: [['{{#wenn[nnf!=0]}}NNF im Projekt{{/wenn}}'], ['{{#wenn[hnf_s!=0]}}HNF im Sonderfall{{/wenn}}']] }, ctx)).toEqual([
      ['NNF im Projekt'],
      ['HNF im Sonderfall'],
    ]);
  });

  it('Befund 4: {{bgf[r].fleache_roh}} ist leer und wird gemeldet; bgf hat kein flaeche_roh', () => {
    const blatt = [
      ['{{#geschoss}}{{geschoss.name|einmal}}', '{{bgf[r].name}}', '{{bgf[r].fleache_roh}}{{/geschoss}}'],
      ['{{#wenn[bgf_s!=0]}}Bruttogrundfläche S', '{{summe.bgf_s}}{{/wenn}}'],
      ['{{#wenn[bgf_s=0]}}Bruttogrundfläche S', '0{{/wenn}}'],
    ];
    expect(beispielAusfuehren({ vorlage: blatt }, ctx).map((z) => z[2])).toEqual([null, null, null, null, null]);
    expect(beispielAusfuehren({ vorlage: blatt }, ctx).at(-1)).toEqual(['Bruttogrundfläche S', 3, null]);
    expect(pruefe(blatt)).toEqual(['C1 feld']);
    expect(ctx.collections.bgf.every((r) => !('flaeche_roh' in r))).toBe(true);
  });

  it('Befund 5: ein Dachkörper in einem als Normalgeschoss festgelegten Geschoss fehlt bei [normal,grundkoerper]', () => {
    const c = kontext(true);
    const dach = c.collections.koerper.filter((k) => k.geschoss === 'DG').map((k) => [k.art, k.dachgeschoss]);
    // Satteldach mit Traufhöhe 0: nur der Dachkörper, kein Grundkörper
    expect(dach).toEqual([['Dach', '']]);
    const grund = beispielAusfuehren({ vorlage: [['{{koerper[normal,grundkoerper].geschoss}}', '{{koerper[normal,grundkoerper].bezeichnung}}']] }, c);
    expect(grund.map((z) => z[0])).toEqual(['KG', 'EG', 'OG', 'OG']);
    expect(beispielAusfuehren({ vorlage: [['{{koerper[normal,dach].geschoss}}']] }, c)).toEqual([['DG']]);
  });

  it('Befund 6 (korrigiert): Geschosse ohne passende Datensätze entfallen samt Zwischensumme', () => {
    const blatt = [['{{#geschoss}}{{geschoss.name|einmal}}', '{{raum[tf].name}}', '{{raum[tf].flaeche}}'], ['Summe', null, '=SUM(C1:C1)'], ['{{/geschoss}}']];
    expect(beispielAusfuehren({ vorlage: blatt }, ctx)).toEqual([
      ['KG', 'Heizung', 4],
      ['Summe', null, '=SUM(C1:C1)'],
    ]);
  });

  it('Blatt BRI: Normalgeschosse je Grundkörper, Dachgeschoss je Körper, Kontrolle', () => {
    const blatt = [
      ['{{#geschoss[normal]}}'],
      ['{{koerper[normal,grundkoerper,r].bezeichnung}}', '{{koerper[normal,grundkoerper,r].hoehe}}', '{{koerper[normal,grundkoerper,r].flaeche}}', '=B2*C2'],
      ['{{/geschoss}}'],
      ['{{#geschoss[dg]}}{{geschoss.name}}'],
      ['{{#koerper[r]}}{{koerper.bezeichnung}}', '{{koerper.formel}}', '{{koerper.rechnung}}', '{{koerper.volumen}}{{/koerper}}'],
      ['{{/geschoss}}'],
      ['{{#wenn[bri_s!=0]}}Sonderfall', null, null, '{{summe.bri_s}}{{/wenn}}'],
      ['Kontrolle', null, null, '{{summe.bri}}'],
    ];
    expect(pruefe(blatt)).toEqual([]);
    const out = beispielAusfuehren({ vorlage: blatt }, ctx);
    expect(out.map((z) => z[0])).toEqual(['Quader', 'Quader', 'Quader', 'DG', 'Satteldach', 'Sonderfall', 'Kontrolle']);
    expect(out.at(-2)).toEqual(['Sonderfall', null, null, 8.25]);
  });
});
