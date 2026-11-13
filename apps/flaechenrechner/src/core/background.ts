import type { Bounds, Point } from '@core/geometry';
import type { Background, Kontrollmass, Project, Storey, VectorBackground } from '@core/model';
import { SegmentGrid } from '@core/spatial';

/** Faktor lokal → Meter (Raster: m/px, Vektor: m/DXF-Einheit). */
export function bgScale(bg: Background): number {
  return bg.type === 'raster' ? bg.metersPerPixel : bg.scale;
}

export function withScale(bg: Background, scale: number): Background {
  return bg.type === 'raster' ? { ...bg, metersPerPixel: scale } : { ...bg, scale };
}

export function bgToWorld(bg: Background, lx: number, ly: number): Point {
  const s = bgScale(bg);
  return { x: bg.x + lx * s, y: bg.y + ly * s };
}

/**
 * Skaliert den Plan um factor, wobei der Weltpunkt anchor an seiner Stelle bleibt
 * (Kalibrierung über eine bekannte Strecke).
 */
export function scaleAround(bg: Background, factor: number, anchor: Point): Background {
  const s = bgScale(bg);
  const next = withScale(bg, s * factor);
  return { ...next, x: anchor.x - (anchor.x - bg.x) * factor, y: anchor.y - (anchor.y - bg.y) * factor };
}

const localBoundsCache = new WeakMap<VectorBackground['polylines'], Bounds>();

function vectorLocalBounds(bg: VectorBackground): Bounds {
  let b = localBoundsCache.get(bg.polylines);
  if (b) return b;
  b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const pl of bg.polylines) {
    for (let i = 0; i < pl.pts.length; i += 2) {
      const x = pl.pts[i];
      const y = pl.pts[i + 1];
      if (x < b.minX) b.minX = x;
      if (x > b.maxX) b.maxX = x;
      if (y < b.minY) b.minY = y;
      if (y > b.maxY) b.maxY = y;
    }
  }
  if (!Number.isFinite(b.minX)) b = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  localBoundsCache.set(bg.polylines, b);
  return b;
}

export function bgWorldBounds(bg: Background): Bounds {
  if (bg.type === 'raster') {
    return { minX: bg.x, minY: bg.y, maxX: bg.x + bg.widthPx * bg.metersPerPixel, maxY: bg.y + bg.heightPx * bg.metersPerPixel };
  }
  const b = vectorLocalBounds(bg);
  const a = bgToWorld(bg, b.minX, b.minY);
  const c = bgToWorld(bg, b.maxX, b.maxY);
  return { minX: a.x, minY: a.y, maxX: c.x, maxY: c.y };
}

export interface VectorSegmentOptions {
  /** aus Bögen/Kreisen entstandene Linien (z. B. Türaufschläge) auslassen */
  skipArcs?: boolean;
}

const gridCache = new WeakMap<VectorBackground, Map<string, SegmentGrid>>();

/**
 * Segmentverzeichnis der sichtbaren DXF-Layer in Weltkoordinaten.
 * Wird je Hintergrund-Objekt zwischengespeichert (Objekte sind unveränderlich).
 */
export function vectorSegmentGrid(bg: VectorBackground, opts: VectorSegmentOptions = {}): SegmentGrid {
  const key = opts.skipArcs ? 'noarcs' : 'all';
  let m = gridCache.get(bg);
  if (!m) gridCache.set(bg, (m = new Map()));
  const cached = m.get(key);
  if (cached) return cached;

  const segs: number[] = [];
  const s = bg.scale;
  for (const pl of bg.polylines) {
    if (!bg.layers[pl.layer]?.visible) continue;
    if (opts.skipArcs && pl.arc) continue;
    const p = pl.pts;
    const n = p.length / 2;
    const count = pl.closed ? n : n - 1;
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % n;
      segs.push(bg.x + p[i * 2] * s, bg.y + p[i * 2 + 1] * s, bg.x + p[j * 2] * s, bg.y + p[j * 2 + 1] * s);
    }
  }
  const grid = new SegmentGrid(segs);
  m.set(key, grid);
  return grid;
}

/* ---------- Kalibrieren mit Einheit und Kontrollmaß (F-16) ---------- */

const EINHEIT: Record<string, number> = { mm: 0.001, cm: 0.01, dm: 0.1, m: 1 };

/**
 * Länge mit Einheit lesen: „12“, „12,00 m“, „1200 cm“, „12000 mm“, „1.200,5 cm“ → Meter; null, wenn unlesbar.
 * Ohne Einheit gilt Meter.
 */
export function laengeAusText(text: string): number | null {
  const m = /^\s*([\d.,\s]+?)\s*(mm|cm|dm|m)?\s*$/i.exec(text);
  if (!m) return null;
  let zahl = m[1].replace(/\s/g, '');
  // deutsche Schreibweise: Punkt als Tausendertrenner, Komma als Dezimalzeichen
  if (zahl.includes(',')) zahl = zahl.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(zahl)) zahl = zahl.replace(/\./g, '');
  const v = Number(zahl);
  if (!Number.isFinite(v) || v <= 0) return null;
  return v * EINHEIT[(m[2] ?? 'm').toLowerCase()];
}

/** relative Abweichung eines Kontrollmaßes: (gemessen − tatsächlich) / tatsächlich */
export function kontrollAbweichung(gemessen: number, tatsaechlich: number): number {
  return tatsaechlich > 0 ? (gemessen - tatsaechlich) / tatsaechlich : NaN;
}

/** Text für Bericht und Excel: „aus Plan abgegriffen, Maßstab kalibriert, Kontrollmaß 8,00 m: Abweichung +0,12 %“ */
export function kontrollText(k: { soll: number; abweichung: number }): string {
  const pct = (k.abweichung * 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `aus Plan abgegriffen, Maßstab kalibriert, Kontrollmaß ${k.soll.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} m: Abweichung ${k.abweichung > 0 ? '+' : ''}${pct} %`;
}

/**
 * Kontrollmaß eines Geschosses für Bericht und Excel – nur, solange es zum Plan passt: Ohne Plan oder nach einer
 * Maßstabsänderung (Neukalibrieren, Planmaßstab, Einheit) gilt es nicht mehr. Ein neuer Plan verwirft es
 * (ohneKontrollmass); Kontrollmaße ohne gespeicherten Maßstab (bis 0.31) gelten, solange der Plan da ist.
 */
export function gueltigesKontrollmass(project: Project, storey: Storey): Kontrollmass | undefined {
  const k = project.settings.kontrollmasse?.[storey.id];
  const bg = storey.background;
  if (!k || !bg) return undefined;
  if (k.massstab !== undefined && !(Math.abs(k.massstab / bgScale(bg) - 1) < 1e-9)) return undefined;
  return k;
}

/** Kontrollmaß eines Geschosses entfernen (neuer bzw. entfernter Plan, neue Kalibrierung) */
export function ohneKontrollmass(p: Project, storeyId: string): Project {
  if (!p.settings.kontrollmasse?.[storeyId]) return p;
  const { [storeyId]: _weg, ...rest } = p.settings.kontrollmasse;
  void _weg;
  return { ...p, settings: { ...p.settings, kontrollmasse: rest } };
}
