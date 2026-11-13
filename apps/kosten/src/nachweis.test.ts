import { describe, expect, it } from 'vitest';
import { computeProject } from '@core/calc';
import { rectPoints } from '@core/geometry';
import type { Project } from '@core/model';
import { createOutline, createProject, createStorey } from '@core/model';
import type { Storey } from '@core/model';
import { mengenAbgeleitet } from './mengen';
import type { MengeNachweis } from './nachweis';
import { flaeche3, mengenNachweis } from './nachweis';
import { projekt, projektMitAnbau } from './testdaten';

const teile = (m: MengeNachweis) => m.teile.map((t) => [t.geschoss, t.bezeichnung, Math.round(t.wert * 1000) / 1000]);
/** Projekt aus Geschossen [Name, Höhenlage, Geschosshöhe, Rechtecke [x0, y0, x1, y1, Name]] */
const gebaeude = (geschosse: [string, number, number, [number, number, number, number, string][]][]): Project => {
  const p = createProject('Test');
  p.storeys = geschosse.map(
    ([name, e, h, rechtecke]) =>
      ({ ...createStorey(name, h), elevation: e, shapes: rechtecke.map(([x0, y0, x1, y1, n]) => createOutline(rectPoints({ x: x0, y: y0 }, { x: x1, y: y1 }), n)) }) as Storey,
  );
  return p;
};
const raumflaeche = (m: MengeNachweis) => m.teile.flatMap((t) => t.raum ?? []).reduce((a, f) => a + flaeche3(f.aussen) - (f.loecher ?? []).reduce((b, l) => b + flaeche3(l), 0), 0);

describe('Mengennachweis', () => {
  it('Summen der Teile stimmen mit der Flächenberechnung überein (DIN 277, WoFlV)', () => {
    for (const p of [projekt(), projektMitAnbau()]) {
      const t = computeProject(p).total;
      const n = mengenNachweis(p).mengen;
      expect(n.bgf.summe).toBeCloseTo(t.bgf.total, 6);
      expect(n.bri.summe).toBeCloseTo(t.bri.total, 6);
      expect(n.nuf.summe).toBeCloseTo(t.nuf.total, 6);
      expect(n.tf.summe).toBeCloseTo(t.tf.total, 6);
      expect(n.vf.summe).toBeCloseTo(t.vf.total, 6);
      expect(n.nrf.summe).toBeCloseTo(t.nrf.total, 6);
      expect(n.wofl.summe).toBeCloseTo(t.wofl, 6);
      // die Mengen der Kostenermittlung sind genau diese Summen
      const m = mengenAbgeleitet(p);
      for (const b of Object.keys(n) as (keyof typeof n)[]) expect(m[b]).toBeCloseTo(n[b].summe, 2);
    }
  });

  it('Grundflächen: Teile je Umriss und Raum mit Grundriss', () => {
    const p = projektMitAnbau();
    const n = mengenNachweis(p).mengen;
    expect(teile(n.bgf)).toEqual([
      ['EG', 'Haus (R)', 135],
      ['EG', 'Anbau (R)', 20],
      ['OG', 'Staffelgeschoss (R)', 90],
    ]);
    expect(n.bgf.teile.every((t) => t.plan?.length === 1 && t.plan[0].points.length === 4)).toBe(true);
    expect(teile(n.grf)).toEqual([
      ['EG', 'Haus (R)', 135],
      ['EG', 'Anbau (R)', 20],
    ]);
    expect(teile(n.def)).toEqual([['OG', 'Staffelgeschoss (R)', 90]]);
    expect(n.bgi.teile).toEqual([]);
    expect(n.bgi.hinweis).toContain('keine Baugrube');
    expect(teile(n.nuf)).toEqual([['EG', '0.1 Wohnen · NUF 1', 25.76]]);
    expect(n.nrf.summe).toBeCloseTo(25.76 + 8.28 + 15.64, 6);
    expect(n.wofl.teile.map((t) => t.ansatz)).toEqual(['25,76 m² × 100 %', '8,28 m² × 100 %']);
    expect(n.we.teile.map((t) => [t.bezeichnung, t.wert, t.plan?.length])).toEqual([['WE 1', 1, 2]]);
  });

  it('Rauminhalt: Körper je Umriss', () => {
    const n = mengenNachweis(projektMitAnbau()).mengen;
    expect(n.bri.teile.map((t) => [t.bezeichnung, t.ansatz, t.wert])).toEqual([
      ['Haus (R)', '135,00 m² × 3,45 m', 465.75],
      ['Anbau (R)', '20,00 m² × 3,00 m', 60],
      ['Staffelgeschoss (R)', '90,00 m² × 3,20 m', 288],
    ]);
    // sechs Flächen je Quader
    expect(n.bri.teile.map((t) => t.raum?.length)).toEqual([6, 6, 6]);
  });

  it('Außenwand: Wände an einem anderen Umriss zählen nur über dessen Höhe', () => {
    const n = mengenNachweis(projektMitAnbau()).mengen.awf;
    // Haus: 46,50 m × 3,45 m, abzüglich 5,00 m × 3,00 m am Anbau · Anbau: drei freie Seiten (13,00 m) × 3,00 m
    expect(teile(n)).toEqual([
      ['EG', 'Haus (R)', 46.5 * 3.45 - 15],
      ['EG', 'Anbau (R)', 39],
      ['OG', 'Staffelgeschoss (R)', 123.2],
    ]);
    expect(n.teile[0].ansatz).toContain('ohne 1 Abschnitt an anderen Umrissen');
    expect(n.teile[2].ansatz).toBe('Umfang 38,50 m × 3,20 m');
    // die dargestellten Flächen ergeben genau die Menge
    expect(raumflaeche(n)).toBeCloseTo(n.summe, 6);
    // der Streifen der Hauswand über dem Anbau: 5,00 m × 0,45 m zwischen 3,00 und 3,45 m
    const streifen = n.teile[0].raum!.find((f) => Math.abs(flaeche3(f.aussen) - 2.25) < 1e-6)!;
    expect([...new Set(streifen.aussen.map((q) => q.z))].sort()).toEqual([3, 3.45]);
  });

  it('Dach: ebene Flächen nur, soweit kein Geschoss darüber liegt', () => {
    const n = mengenNachweis(projektMitAnbau()).mengen.daf;
    // Haus: 135 − 90 unter dem Staffelgeschoss = 45 · Anbau 20 · Staffelgeschoss 90
    expect(teile(n)).toEqual([
      ['EG', 'Haus (R)', 45],
      ['EG', 'Anbau (R)', 20],
      ['OG', 'Staffelgeschoss (R)', 90],
    ]);
    expect(n.teile[0].ansatz).toContain('abzüglich überbauter Fläche');
    expect(raumflaeche(n)).toBeCloseTo(155, 6);
    // die freie Dachfläche des Hauses liegt östlich des Staffelgeschosses (x von 8 bis 12) in Höhe der Decke
    const frei = n.teile[0].raum![0].aussen;
    expect([Math.min(...frei.map((q) => q.x)), Math.max(...frei.map((q) => q.x)), frei[0].z]).toEqual([8, 12, 3.45]);
  });

  it('Walmdach: geneigte Flächen in wahrer Größe, Decken darunter zählen nicht', () => {
    const n = mengenNachweis(projekt()).mengen;
    expect(teile(n.daf)).toEqual([['DG', 'BGF (R)', Math.round((135 / Math.cos(Math.PI / 4)) * 1000) / 1000]]);
    expect(n.daf.teile[0].ansatz).toBe('Walmdach, 45°');
    expect(n.awf.teile.map((t) => t.geschoss)).toEqual(['UG', 'EG', 'OG']);
    expect(n.bgi.teile.map((t) => [t.geschoss, t.ansatz, t.wert])).toEqual([['UG', '135,00 m² × 2,80 m', 378]]);
  });

  it('Teilunterkellerung: EG neben dem Keller steht auf dem Gelände (Gründungsfläche), über dem Keller ist es Decke', () => {
    // UG 6,00 × 11,25 m (67,5 m²) unter der Westhälfte, EG und OG 12,00 × 11,25 m (135 m²)
    const p = gebaeude([
      ['UG', -2.8, 2.8, [[0, 0, 6, 11.25, 'Keller']]],
      ['EG', 0, 3, [[0, 0, 12, 11.25, 'Haus']]],
      ['OG', 3, 3, [[0, 0, 12, 11.25, 'Haus']]],
    ]);
    const n = mengenNachweis(p).mengen;
    // Handrechnung: GRF = 67,5 (UG) + 67,5 (EG östlich des Kellers) = 135 · DEF = 67,5 (EG über dem Keller) + 135 (OG) = 202,5
    expect(teile(n.grf)).toEqual([
      ['UG', 'Keller (R)', 67.5],
      ['EG', 'Haus (R)', 67.5],
    ]);
    expect(teile(n.def)).toEqual([
      ['EG', 'Haus (R)', 67.5],
      ['OG', 'Haus (R)', 135],
    ]);
    expect(n.grf.summe + n.def.summe).toBeCloseTo(n.bgf.summe, 6);
    // Baugrube nur unter dem Keller: 67,5 m² × 2,80 m
    expect(n.bgi.summe).toBeCloseTo(189, 6);
    expect(n.bgi.hinweis).toContain('Arbeitsraum und Böschung');
    // Teile bleiben darstellbar: der freie Teil des EG liegt östlich des Kellers (x von 6 bis 12)
    const eg = n.grf.teile[1];
    expect(eg.ansatz).toBe('67,50 von 135,00 m² ohne Geschoss darunter');
    const xs = eg.plan!.flatMap((f) => f.points.map((q) => q.x));
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([6, 12]);
    expect(n.def.teile[0].plan![0].points.every((q) => q.x <= 6)).toBe(true);
    // Teile einzeln abwählbar: Kennungen grf-/def- + Umriss
    const egId = p.storeys[1].shapes[0].id;
    expect([n.grf.teile[1].id, n.def.teile[0].id]).toEqual([`grf-${egId}`, `def-${egId}`]);
    const ab = mengenNachweis({ ...p, kosten: { positionen: [], teile: { [`grf-${egId}`]: false } } }).mengen;
    expect(ab.grf.summe).toBeCloseTo(67.5, 6);
    expect(ab.def.summe).toBeCloseTo(202.5, 6);
  });

  it('Anbau auf dem Gelände neben einem unterkellerten Haus', () => {
    // UG und EG-Haus 12,00 × 11,25 m (135 m²), eingeschossiger Anbau 4,00 × 5,00 m (20 m²) ohne Keller
    const p = gebaeude([
      ['UG', -2.8, 2.8, [[0, 0, 12, 11.25, 'Keller']]],
      [
        'EG',
        0,
        3,
        [
          [0, 0, 12, 11.25, 'Haus'],
          [12, 0, 16, 5, 'Anbau'],
        ],
      ],
    ]);
    const n = mengenNachweis(p).mengen;
    // Handrechnung: GRF = 135 (Keller) + 20 (Anbau) = 155 · DEF = 135 (EG-Haus über dem Keller)
    expect(teile(n.grf)).toEqual([
      ['UG', 'Keller (R)', 135],
      ['EG', 'Anbau (R)', 20],
    ]);
    expect(teile(n.def)).toEqual([['EG', 'Haus (R)', 135]]);
    // der Anbau liegt ganz auf dem Gelände: ganzer Umriss, kein Teilansatz
    expect(n.grf.teile[1].ansatz).toBeUndefined();
    expect(n.bgi.summe).toBeCloseTo(135 * 2.8, 6);
    expect(n.grf.hinweis).toContain('Teile höherer Geschosse');
  });

  it('Gegenprobe: auskragendes Obergeschoss und leicht größer gezeichnetes Geschoss zählen nicht als Gründungsfläche', () => {
    // EG 10 × 10 m, OG kragt 2 m aus (12 × 10 m) – das OG liegt über dem Gelände, also Decke
    const krag = mengenNachweis(
      gebaeude([
        ['EG', 0, 3, [[0, 0, 10, 10, 'EG']]],
        ['OG', 3, 3, [[0, 0, 12, 10, 'OG']]],
      ]),
    ).mengen;
    expect([krag.grf.summe, krag.def.summe]).toEqual([100, 120]);
    // EG 10 cm breiter gezeichnet als der Keller (Wandstärken): kein Streifen in der Gründungsfläche
    const versatz = mengenNachweis(
      gebaeude([
        ['UG', -2.8, 2.8, [[0, 0, 12, 11.25, 'Keller']]],
        ['EG', 0, 3, [[0, 0, 12.1, 11.25, 'Haus']]],
      ]),
    ).mengen;
    expect(versatz.grf.summe).toBeCloseTo(135, 6);
    expect(teile(versatz.def)).toEqual([['EG', 'Haus (R)', 136.125]]);
  });

  it('Außenanlagen: Grundstück abzüglich des größten Geschosses; ohne Grundstücksfläche ein Hinweis', () => {
    const p = projektMitAnbau();
    const n = mengenNachweis(p).mengen;
    expect(teile(n.auf)).toEqual([
      ['', 'Grundstücksfläche laut Projektdaten', 500],
      ['EG', 'überbaut: Haus (R)', -135],
      ['EG', 'überbaut: Anbau (R)', -20],
    ]);
    expect(n.auf.summe).toBe(345);
    const ohne: Project = { ...p, meta: { ...p.meta, grundstueck: { ...p.meta.grundstueck, flaeche: undefined } } };
    const m = mengenNachweis(ohne).mengen;
    expect(m.auf.teile).toEqual([]);
    expect(m.fbg.hinweis).toContain('fehlt');
  });

  it('Abzugsflächen erscheinen als negative Teile', () => {
    const p = projektMitAnbau();
    p.storeys[1].shapes.push({ ...createOutline(rectPoints({ x: 2, y: 2 }, { x: 4, y: 5 }), 'Luftraum'), subtract: true });
    const n = mengenNachweis(p).mengen;
    expect(teile(n.bgf).at(-1)).toEqual(['OG', 'Luftraum (R) – Abzug', -6]);
    expect(n.bgf.summe).toBe(239);
  });

  it('wird wiederverwendet, solange sich das Gebäude nicht ändert', () => {
    const p = projektMitAnbau();
    const a = mengenNachweis(p);
    expect(mengenNachweis({ ...p, name: 'umbenannt', kosten: { positionen: [] } })).toBe(a);
    expect(mengenNachweis({ ...p, storeys: [...p.storeys] })).not.toBe(a);
  });
});
