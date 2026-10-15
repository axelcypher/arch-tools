import { describe, expect, it } from 'vitest';
import type { IfcMeshPart } from './ifcData';
import { raumBoden, sohlenDicke } from './ifcImport';

/** Quader als Dreiecksnetz (Ober- und Unterseite, Seiten) */
function quader(x0: number, y0: number, x1: number, y1: number, z0: number, z1: number): Float32Array {
  const t: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => t.push(...a, ...b, ...c, ...a, ...c, ...d);
  quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]);
  quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
  quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
  quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]);
  quad([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]);
  quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]);
  return new Float32Array(t);
}
const teil = (type: string, tris: Float32Array, predefinedType = ''): IfcMeshPart => ({ expressId: 1, type, name: '', predefinedType, storey: 0, tris, color: [1, 1, 1, 1] });

describe('Erkennung aus dem IFC-Modell', () => {
  it('Bodenplatte: Abstand Fußboden bis Unterseite der Platte, Fundamente und Dächer zählen nicht', () => {
    const els = [
      teil('IFCSLAB', quader(0, 0, 10, 8, -0.3, 0), 'BASESLAB'),
      teil('IFCFOOTING', quader(0, 0, 10, 0.6, -1.1, -0.3)),
      teil('IFCSLAB', quader(0, 0, 10, 8, 5.8, 6), 'ROOF'),
    ];
    expect(sohlenDicke(els, 0)).toBeCloseTo(0.3, 3);
    // Fußboden 8 cm über der Rohdecke (Estrich): Dicke bis UK Platte
    expect(sohlenDicke(els, 0.08)).toBeCloseTo(0.38, 3);
    // nur Platten im gesuchten Bereich
    expect(sohlenDicke(els, 0, (p) => p.x > 20)).toBeUndefined();
  });

  it('Raumboden: unterste waagerechte Fläche mit nennenswertem Anteil – Split-Level erkennbar', () => {
    expect(raumBoden(quader(0, 0, 4, 4, -0.6, 2.4))).toBeCloseTo(-0.6, 2);
    expect(raumBoden(quader(0, 0, 4, 4, 0, 2.6))).toBeCloseTo(0, 2);
  });
});
