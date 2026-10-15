import type { Point } from './geometry';
import { pointInPolygon, polygonArea } from './geometry';
import type { Project } from './model';
import type { DachModell } from './roofMesh';
import type { MultiPolygon } from './polygon';
import { inMP } from './polygon';
import { roofHeightField } from './roofMesh';

/**
 * Geländeoberfläche: Höhe (über ±0,00) an einem Punkt – aus dem Geländemodell der IFC (Höhenfeld der
 * Geländeoberseite), sonst aus den Lageplan-Flächen mit Höhenangabe. undefined, wo nichts bekannt ist.
 */
export function gelaendeHoeheFn(project: Project, bereich?: { minX: number; minY: number; maxX: number; maxY: number }): (p: Point) => number | undefined {
  const m = project.gelaendeModell;
  const flaechen = (project.lageplan?.flaechen ?? [])
    .filter((f) => !f.nachbar && f.hoehe !== undefined && f.points.length >= 3)
    // kleinste Fläche zuerst: Beläge auf dem Gelände vor der Gesamtfläche
    .map((f) => ({ f, a: polygonArea(f.points) }))
    .sort((a, b) => a.a - b.a)
    .map((x) => x.f);
  const feld = m && m.triangles.length >= 9 ? hoehenfeld(m, bereich ?? dreieckBereich(m.triangles)) : null;
  return (p) => {
    if (feld) {
      const i = Math.floor((p.x - feld.minX) / feld.res);
      const j = Math.floor((p.y - feld.minY) / feld.res);
      if (i >= 0 && j >= 0 && i < feld.w && j < feld.h) {
        const z = feld.z[j * feld.w + i];
        if (!Number.isNaN(z)) return z;
      }
    }
    for (const f of flaechen) if (pointInPolygon(p, f.points)) return f.hoehe;
    return undefined;
  };
}

type Feld = ReturnType<typeof roofHeightField>;
/** Höhenfelder je Geländemodell und Bereich – das Modell ist unveränderlich, das Raster teuer */
const feldCache = new WeakMap<DachModell, Map<string, Feld>>();

/** Höhenfeld nur über dem benötigten Bereich (mit Rand), Raster 10 cm */
function hoehenfeld(m: DachModell, b: { minX: number; minY: number; maxX: number; maxY: number }): Feld {
  const rand = 2;
  const key = [b.minX, b.minY, b.maxX, b.maxY].map((v) => v.toFixed(2)).join(';');
  let c = feldCache.get(m);
  if (!c) {
    c = new Map();
    feldCache.set(m, c);
  }
  let feld = c.get(key);
  if (!feld) {
    feld = roofHeightField(
      m,
      [
        { x: b.minX - rand, y: b.minY - rand },
        { x: b.maxX + rand, y: b.minY - rand },
        { x: b.maxX + rand, y: b.maxY + rand },
        { x: b.minX - rand, y: b.maxY + rand },
      ],
      0.1,
    );
    // nur wenige Bereiche je Modell vorhalten (Gebäude wird verschoben/geändert)
    if (c.size > 8) c.clear();
    c.set(key, feld);
  }
  return feld;
}

function dreieckBereich(t: number[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < t.length; i += 3) {
    minX = Math.min(minX, t[i]);
    maxX = Math.max(maxX, t[i]);
    minY = Math.min(minY, t[i + 1]);
    maxY = Math.max(maxY, t[i + 1]);
  }
  return { minX, minY, maxX, maxY };
}

export interface GelaendeAmUmfang {
  /** Mittel entlang der Außenwände (längengewichtet) */
  mittel: number;
  min: number;
  max: number;
  /** Anteil des Umfangs, für den eine Geländehöhe bekannt ist (0 … 1) */
  abdeckung: number;
  /** Stützstellen (Punkt außen vor der Wand, Höhe) – für Darstellung und Nachvollzug */
  punkte: { p: Point; z: number }[];
}

/**
 * Geländeoberfläche entlang der Außenwände eines Grundrisses: Proben alle 0,5 m, 0,4 m vor der Wand.
 * Grundlage für „Deckenoberkante im Mittel über der Geländeoberfläche“ (BauO NRW) bzw. „vollständig über der
 * festgelegten Geländeoberfläche“ (BauO NW 1962/1970, dann der höchste Punkt).
 */
export function gelaendeAmUmfang(grundriss: MultiPolygon, hoehe: (p: Point) => number | undefined, abstand = 0.4, schritt = 0.5): GelaendeAmUmfang | undefined {
  const punkte: { p: Point; z: number }[] = [];
  let proben = 0;
  for (const poly of grundriss) {
    for (const ring of poly) {
      const pts = ring.map(([x, y]) => ({ x, y }));
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 1e-6) continue;
        const nx = (b.y - a.y) / len;
        const ny = -(b.x - a.x) / len;
        for (let t = schritt / 2; t < len; t += schritt) {
          const m = { x: a.x + ((b.x - a.x) * t) / len, y: a.y + ((b.y - a.y) * t) / len };
          // nach außen: die Seite, die nicht im Grundriss liegt
          let p = { x: m.x + nx * abstand, y: m.y + ny * abstand };
          if (inMP(p, grundriss)) p = { x: m.x - nx * abstand, y: m.y - ny * abstand };
          if (inMP(p, grundriss)) continue; // Innenhof schmaler als der Abstand
          proben++;
          const z = hoehe(p);
          if (z !== undefined) punkte.push({ p, z });
        }
      }
    }
  }
  if (!punkte.length) return undefined;
  const zs = punkte.map((x) => x.z);
  return { mittel: zs.reduce((a, z) => a + z, 0) / zs.length, min: Math.min(...zs), max: Math.max(...zs), abdeckung: proben ? punkte.length / proben : 0, punkte };
}
