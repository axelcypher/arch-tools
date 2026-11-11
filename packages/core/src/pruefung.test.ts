import { describe, expect, it } from 'vitest';
import { rectPoints } from './geometry';
import type { Project } from './model';
import { createOutline, createProject, createRoom } from './model';
import { pruefeGeschoss, raumAufUmriss } from './pruefung';

const rect = (x: number, y: number, w: number, h: number) => rectPoints({ x, y }, { x: x + w, y: y + h });

/** EG mit BGF 12 × 10 und zwei Räumen mit 0,3 m Wand dazwischen */
function haus(): Project {
  const p = createProject();
  const eg = p.storeys[0];
  eg.shapes.push(createOutline(rect(0, 0, 12, 10)));
  const a = createRoom(rect(0.3, 0.3, 5.55, 9.4), '0.01', 'Wohnen');
  a.wofl = { kategorie: 'voll', wohnung: 'WE 01' };
  const b = createRoom(rect(6.15, 0.3, 5.55, 9.4), '0.02', 'Küche');
  b.wofl = { kategorie: 'voll', wohnung: 'WE 01' };
  eg.shapes.push(a, b);
  return p;
}
const regeln = (p: Project) => pruefeGeschoss(p.storeys[0], p).map((e) => e.regel);

describe('Prüfliste (F-10)', () => {
  it('sauberes Geschoss: keine Einträge; Lücke 0,3 m (Wand) ist kein Hinweis', () => {
    expect(regeln(haus())).toEqual([]);
  });

  it('Raum ragt über den Umriss bzw. liegt außerhalb', () => {
    const p = haus();
    p.storeys[0].shapes.push(createRoom(rect(11.5, 2, 1, 1), '0.03', 'Flur'));
    const e = pruefeGeschoss(p.storeys[0], p).find((x) => x.regel === 'raum-ausserhalb')!;
    expect(e.text).toMatch(/ragt 0,50 m² über den R-Umriss/);
    p.storeys[0].shapes.push(createRoom(rect(20, 2, 2, 2), '0.04', 'Abstellraum'));
    expect(pruefeGeschoss(p.storeys[0], p).some((x) => /außerhalb aller R-Umrisse/.test(x.text))).toBe(true);
  });

  it('Balkon auf S-Umriss ist kein Fehler; ohne S-Umriss schon', () => {
    const p = haus();
    const balkon = createRoom(rect(12, 2, 2, 4), '0.05', 'Balkon');
    p.storeys[0].shapes.push(balkon);
    expect(regeln(p)).toContain('raum-ausserhalb');
    p.storeys[0].shapes.push({ ...createOutline(rect(12, 2, 2, 4), 'Balkon'), umschliessung: 'S' as const, hoehe: 1.1 });
    expect(regeln(p)).not.toContain('raum-ausserhalb');
    expect(regeln(p)).not.toContain('nrf-groesser-bgf');
  });

  it('versetzte Kopie: Umrisse und Räume überlappen; Abzugsfläche nicht', () => {
    const p = haus();
    const eg = p.storeys[0];
    eg.shapes.push({ ...createRoom(rect(1, 1, 0.5, 0.5), '', 'Schornstein'), subtract: true });
    expect(regeln(p)).toEqual([]);
    eg.shapes.push(createOutline(rect(0.5, 0.5, 12, 10)));
    eg.shapes.push(createRoom(rect(0.8, 0.8, 5.55, 9.4), '0.06', 'Wohnen (Kopie)'));
    const r = regeln(p);
    expect(r).toContain('umrisse-ueberlappen');
    expect(r).toContain('raeume-ueberlappen');
  });

  it('Lücke breiter als eine Wand, doppelte Nummern, Raum ohne Wohnung', () => {
    const p = haus();
    const eg = p.storeys[0];
    eg.shapes.splice(2, 1); // Küche fehlt
    expect(regeln(p)).toContain('luecke');
    const p2 = haus();
    const k = p2.storeys[0].shapes[2];
    if (k.kind === 'room') {
      k.nummer = '0.01';
      k.wofl = { kategorie: 'voll', wohnung: '' };
    }
    expect(regeln(p2)).toEqual(expect.arrayContaining(['nummer-doppelt', 'ohne-wohnung']));
  });

  it('S-Umriss ohne Körperhöhe; „voll“ im Dachgeschoss als Hinweis (FR-08)', () => {
    const p = haus();
    p.storeys[0].shapes.push({ ...createOutline(rect(12, 2, 2, 4), 'Balkon'), umschliessung: 'S' as const });
    expect(regeln(p)).toContain('s-ohne-hoehe');
    p.storeys[0].dachgeschoss = true;
    const e = pruefeGeschoss(p.storeys[0], p).filter((x) => x.regel === 'dachschraege');
    expect(e).toHaveLength(2);
    expect(e[0].art).toBe('hinweis');
  });

  it('„keine Wohnfläche“ im Wohngeschoss nur als Hinweis; Raum auf Umriss beschneiden', () => {
    const p = haus();
    const flur = createRoom(rect(11.5, 2, 1, 1), '0.03', 'Treppenraum');
    p.storeys[0].shapes.push(flur);
    const e = pruefeGeschoss(p.storeys[0], p).find((x) => x.regel === 'keine-wofl')!;
    expect(e.art).toBe('hinweis');
    const pts = raumAufUmriss(flur, p.storeys[0])!;
    expect(Math.abs(pts.reduce((s, q, i) => s + q.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * q.y, 0) / 2)).toBeCloseTo(0.5, 6);
  });
});
