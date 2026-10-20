import pc from 'polygon-clipping';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rectPoints } from './geometry';
import { areaMP, diffMP, intersectMP, unionAll, unionMP } from './polygon';

const r = (x0: number, y0: number, x1: number, y1: number) => unionAll([rectPoints({ x: x0, y: y0 }, { x: x1, y: y1 })]);
const fehler = () => {
  throw new Error('Unable to complete output ring starting at [4.2497, 5.2059].');
};

afterEach(() => vi.restoreAllMocks());

describe('Flächenoperationen bei numerischem Scheitern', () => {
  it('wiederholen auf einem Raster, wenn der erste Versuch scheitert', () => {
    const a = r(0, 0, 10, 10);
    const b = r(5, 5, 15, 15);
    const echt = pc.difference;
    let n = 0;
    vi.spyOn(pc, 'difference').mockImplementation((...args) => (n++ === 0 ? fehler() : echt(...args)));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(areaMP(diffMP(a, b))).toBeCloseTo(75, 6);
  });

  it('stürzen nie ab: Differenz ohne den scheiternden Abzug, Schnitt leer, Vereinigung nebeneinander', () => {
    vi.spyOn(pc, 'difference').mockImplementation(fehler);
    vi.spyOn(pc, 'intersection').mockImplementation(fehler);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = r(0, 0, 10, 10);
    const b = r(5, 5, 15, 15);
    expect(areaMP(diffMP(a, b))).toBeCloseTo(100, 6);
    expect(intersectMP(a, b)).toEqual([]);
    vi.spyOn(pc, 'union').mockImplementation(fehler);
    expect(unionMP(a, b)).toHaveLength(2);
  });
});
