import { describe, expect, it } from 'vitest';
import type { Row } from '@core/excel/context';
import { beispielAusfuehren } from '@core/excel/schema';
import { SUMMEN_GRUNDGROESSEN } from './exportData';
import { platzhalterKontext, platzhalterProjekt } from './platzhalterTestdaten';

/** Fertige Summen nach Nutzungsgruppe, R/S und ohne Putzabzug – gegen die Raumzeilen gerechnet */
describe('Summen nach R/S und ohne Putzabzug', () => {
  const ctx = platzhalterKontext();
  const raeume = ctx.collections.raum;
  const summe = (rows: Row[], feld: 'flaeche' | 'flaeche_roh') => Math.round(rows.reduce((a, r) => a + (r[feld] as number), 0) * 100) / 100;
  const gruppe = (name: string) => SUMMEN_GRUNDGROESSEN.find(([n]) => n === name)![1];
  // wie die NRF: ohne Räume außerhalb der BGF und ohne Abzugsflächen, die nur die Wohnfläche mindern (aus den Eingaben)
  const nurWofl = new Set(
    platzhalterProjekt()
      .storeys.flatMap((st) => st.shapes)
      .flatMap((sh) => (sh.kind === 'room' && sh.subtract && sh.abzugArt === 'wofl' ? [sh.nummer] : [])),
  );
  const zaehlt = (r: Row) => r.ausserhalb_bgf !== 'ja' && !nurWofl.has(String(r.nummer));
  const zeilen = (rows: Row[], name: string, rs: '' | 'R' | 'S') => rows.filter((r) => zaehlt(r) && gruppe(name)(KURZ[String(r.nutzung)] ?? '') && (!rs || r.umschliessung === rs));
  const KURZ: Record<string, string> = { 'NUF 1': 'NUF1', 'NUF 2': 'NUF2', 'NUF 3': 'NUF3', 'NUF 4': 'NUF4', 'NUF 5': 'NUF5', 'NUF 6': 'NUF6', 'NUF 7': 'NUF7', 'TF 8': 'TF', 'VF 9': 'VF' };

  const ebenen: [string, Record<string, unknown>, Row[]][] = [
    [
      'Projekt',
      Object.fromEntries(
        Object.entries(ctx.scalars)
          .filter(([k]) => k.startsWith('summe.'))
          .map(([k, v]) => [k.slice(6), v]),
      ),
      raeume,
    ],
    ...ctx.collections.geschoss.map((g): [string, Record<string, unknown>, Row[]] => [`Geschoss ${g.name}`, g, raeume.filter((r) => r._geschossId === g._id)]),
  ];
  for (const [titel, werte, rows] of ebenen)
    it(`${titel}: jede Summe = Σ der passenden Raumzeilen, R + S = gesamt, hnf = NUF 1–6, nnf = NUF 7`, () => {
      for (const [name] of SUMMEN_GRUNDGROESSEN)
        for (const rs of ['', 'R', 'S'] as const)
          for (const roh of [false, true]) {
            const key = `${name}${rs ? `_${rs.toLowerCase()}` : ''}${roh ? '_roh' : ''}`;
            expect(werte[key], key).toBeCloseTo(summe(zeilen(rows, name, rs), roh ? 'flaeche_roh' : 'flaeche'), 2);
          }
      for (const name of [...SUMMEN_GRUNDGROESSEN.map(([n]) => n), 'kgf'])
        for (const roh of ['', '_roh']) expect((werte[`${name}_r${roh}`] as number) + (werte[`${name}_s${roh}`] as number), `${name}${roh}`).toBeCloseTo(werte[`${name}${roh}`] as number, 2);
      expect(werte.hnf).toBeCloseTo(
        [1, 2, 3, 4, 5, 6].reduce((a, i) => a + (werte[`nuf${i}`] as number), 0),
        2,
      );
      expect(werte.nnf).toBe(werte.nuf7);
      expect(werte.kgf_roh).toBeCloseTo((werte.bgf as number) - (werte.nrf_roh as number), 2);
      expect(werte.kgf_s_roh).toBeCloseTo((werte.bgf_s as number) - (werte.nrf_s_roh as number), 2);
    });

  it('die Testdaten decken R und S, Putzabzug, Terrasse außerhalb der BGF und Abzug nur der Wohnfläche ab', () => {
    expect(ctx.scalars['summe.nrf_roh']).not.toBe(ctx.scalars['summe.nrf']);
    expect(ctx.scalars['summe.nnf_s']).toBeGreaterThan(0);
    expect(raeume.filter((r) => !zaehlt(r)).map((r) => r.name)).toEqual(['Terrasse', 'Treppe']);
  });
});

describe('Wohnungen', () => {
  const ctx = platzhalterKontext();
  it('Räume mit Wohnfläche ohne Zuordnung stehen im Block der Wohnung „(ohne Zuordnung)“', () => {
    const out = beispielAusfuehren(
      {
        vorlage: [
          ['{{#wohnung[name=(ohne Zuordnung)]}}{{wohnung.name}}', '{{wohnung.wofl}}'],
          [null, '{{raum.name}}', '{{raum.wofl}}{{/wohnung}}'],
        ],
      },
      ctx,
    );
    expect(out).toEqual([
      ['(ohne Zuordnung)', 4, null],
      [null, 'Bad', 4],
    ]);
  });
  it('Freisitze nach der WoFlV-Anrechnung, auch außerhalb der BGF (ohne R/S)', () => {
    expect(ctx.collections.raum.filter(ctx.filters!.freisitz).map((r) => [r.name, r.umschliessung])).toEqual([
      ['Loggia', 'S'],
      ['Terrasse', ''],
    ]);
  });
});
