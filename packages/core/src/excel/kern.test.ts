import { describe, expect, it } from 'vitest';
import { kernBeispielKontext, kernBeispielSchema } from './beispieldaten';
import { pruefeBlatt, pruefeText } from './pruefung';
import { fileURLToPath } from 'node:url';
import { kernMarkdown } from './referenz';
import { dokuTest } from './schemaTest';
import { KERN_THEMEN } from './kern';
import type { Art } from './schema';
import { beispielAusfuehren, ermittleNutzbarkeit, kopfFusszeileErsetzen, NUTZBAR, textfeldErsetzen, vorlagenZeilen } from './schema';

const ctx = kernBeispielKontext();

describe('Gemeinsame Vorlagen-Syntax: Beispiele laufen gegen die Engine', () => {
  for (const t of KERN_THEMEN)
    for (const b of t.beispiele ?? [])
      it(`${t.titel}: ${b.titel}`, () => {
        expect(beispielAusfuehren(b, ctx)).toEqual(b.ergebnis);
        expect([...new Set(pruefeBlatt(vorlagenZeilen(b.vorlage), ctx, { schema: kernBeispielSchema() }).map((h) => h.art))].sort()).toEqual([...(b.pruefung ?? [])].sort());
      });
});

describe('Wo was nutzbar ist (Tabelle NUTZBAR)', () => {
  const faelle: [string, Art][] = [
    ['summe.wofl', 'einzelwert'],
    ['projekt.name', 'einzelwert'],
    ['raum.name', 'sammlung'],
    ['raum.flaeche', 'sammlung'],
    ['geschoss:EG.wofl', 'zugriff'],
  ];
  for (const [ph, art] of faelle) it(`${ph} (${art})`, () => expect(ermittleNutzbarkeit(ph, ctx)).toEqual(NUTZBAR[art]));
});

describe('Kopf-/Fußzeilen und Textfelder', () => {
  it('Einzelwerte, Einzelzugriff und Datum mit Format; Sammlungen und |einmal bleiben stehen', () => {
    const t = '{{projekt.name}} {{geschoss:EG.wofl}} {{DATUM:TT.MM.JJJJ}} {{raum.name}} {{projekt.name|einmal}}';
    const soll = 'Musterhaus 21 16.11.2026 {{raum.name}} {{projekt.name|einmal}}';
    expect(kopfFusszeileErsetzen(t, ctx)).toBe(soll);
    expect(textfeldErsetzen(t, ctx)).toBe(soll);
  });
  it('„&“ wird in Kopf-/Fußzeilen verdoppelt, Zahlen mit 2 Nachkommastellen', () => {
    const c = { ...ctx, scalars: { ...ctx.scalars, 'projekt.name': 'A & B', x: 1.2345 } };
    expect(kopfFusszeileErsetzen('{{projekt.name}} {{x}}', c)).toBe('A && B 1,23');
  });
});

describe('Behobene Fehler', () => {
  it('Datum mit Format auch in Zellen ({{DATUM:TT.MM.JJJJ}}, {{JAHR:JJ}})', () => {
    expect(beispielAusfuehren({ vorlage: [['{{DATUM:TT.MM.JJJJ}}', 'Jahr {{JAHR:JJ}}']] }, ctx)).toEqual([['16.11.2026', 'Jahr 26']]);
  });
  it('ein vorhandener Einzelwert geht vor, auch wenn sein Präfix wie eine Sammlung heißt', () => {
    const c = { ...ctx, scalars: { ...ctx.scalars, 'raum.titel': 'Räume' } };
    expect(beispielAusfuehren({ vorlage: [['{{raum.titel}}'], ['{{raum[wofl].name}}']] }, c)).toEqual([['Räume'], ['Flur'], ['Küche'], ['Bad']]);
  });
  it('Sammlungen mit Ziffern im Namen (kg2) wiederholen Zeilen und Blöcke', () => {
    const c = { ...ctx, collections: { ...ctx.collections, kg2: [{ kg: '330' }, { kg: '340' }] } };
    expect(beispielAusfuehren({ vorlage: [['{{kg2.kg}}'], ['{{#kg2}}x{{kg2.kg}}{{/kg2}}']] }, c)).toEqual([['330'], ['340'], ['x330'], ['x340']]);
  });
});

describe('Vorlagenprüfung', () => {
  const schema = kernBeispielSchema();
  const arten = (spec: (string | null)[][]) => pruefeBlatt(vorlagenZeilen(spec), ctx, { blatt: 'Blatt1', schema }).map((h) => `${h.ort} ${h.art}: ${h.text}`);
  it('unbekannter Filter mit Vorschlag', () => expect(arten([['{{raum[wolf].name}}']])).toEqual(['A1 filter: Filter [wolf] gibt es nicht – er trifft nie zu. Meinten Sie [wofl]?']));
  it('benannter Filter auf oberster Ebene mit Vorschlag', () =>
    expect(arten([['{{#wenn[wofl]}}x{{/wenn}}']])).toEqual([
      'A1 filterfelder: [wofl] prüft Felder, die es auf oberster Ebene (Projektsummen summe.*) nicht gibt – trifft dort nie zu (gehört zu raum). Meinten Sie {{#wenn raum[wofl]}}?',
    ]));
  it('benannter Filter an einer Sammlung ohne diese Felder', () => expect(arten([['{{geschoss[wofl].name}}']])[0]).toMatch(/^A1 filterfelder: \[wofl\] prüft Felder, die es bei geschoss nicht gibt/));
  it('Vergleich auf ein fehlendes Feld', () =>
    expect(arten([['{{#wenn[hoehe>0]}}x{{/wenn}}']])).toEqual(['A1 vergleichsfeld: Feld „hoehe“ gibt es auf oberster Ebene (Projektsummen summe.*) nicht – der Vergleich trifft dort nie zu.']));
  it('Filtername mit Vergleich', () => expect(arten([['{{raum[wofl!=0].name}}']])).toEqual(['A1 vergleichsfeld: „wofl“ ist ein benannter Filter, kein Feld – ohne Vergleich schreiben: [wofl].']));
  it('Schreibweisen', () => {
    expect(arten([['{{raum.Name}}', '{{ raum . name }}', '{{Summe.wofl}}']])).toEqual([
      'A1 schreibweise: Schreibweise: {{raum.name}} (Namen klein und ohne Leerzeichen).',
      'B1 schreibweise: Schreibweise: {{raum.name}} (Namen klein und ohne Leerzeichen).',
      'C1 schreibweise: Schreibweise: {{summe.wofl}} (Namen klein und ohne Leerzeichen).',
    ]);
  });
  it('unbekanntes Feld, unbekannter Name, unbekannter Einzelwert', () =>
    expect(arten([['{{raum.foo}}'], ['{{geschoss:XY.wofl}}', '{{geschoss:EG.foo}}', '{{summe.foo}}']]).map((t) => t.split(':')[0])).toEqual(['A1 feld', 'A2 name', 'B2 feld', 'C2 einzelwert']));
  it('Zusatz, zweite Sammlung, Klammern', () => {
    expect(arten([['{{raum.name|eimal}}']])[0]).toMatch(/^A1 zusatz/);
    expect(arten([['{{raum.name}}', '{{geschoss.name}}']])[0]).toMatch(/^B1 zweite-sammlung/);
    expect(arten([['{{raum[[wofl].name}}']])[0]).toMatch(/^A1 klammern/);
    expect(arten([['{{#wenn raum[[wofl]}}x{{/wenn}}']])[0]).toMatch(/^A1 klammern/);
  });
  it('Blöcke: offen, verwaist, unbekannt; Feld des Blockdatensatzes ist gebunden', () => {
    expect(arten([['{{#geschoss}}{{geschoss.name}}', '{{raum.name}}']]).map((t) => t.split(':')[0])).toEqual(['A1 block-offen']);
    expect(arten([['{{/raum}}'], ['{{#foo}}']]).map((t) => t.split(':')[0])).toEqual(['A1 block-verwaist', 'A2 block-unbekannt']);
  });
  it('Kopf-/Fußzeile und Textfeld', () => {
    const h = pruefeText('{{projekt.name}} {{raum.name}} {{projekt.name|einmal}} {{#geschoss}}', ctx, { blatt: 'Blatt1', ort: 'Kopf-/Fußzeile' }, schema).map((x) => x.art);
    expect(h).toEqual(['kopf', 'kopf', 'kopf']);
  });
});

dokuTest(fileURLToPath(new URL('../../../../docs/excel-vorlagen.md', import.meta.url)), 'kern', kernMarkdown);
