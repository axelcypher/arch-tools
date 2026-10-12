import type { Bereich, Ebene, Foto, Messung } from '../model';
import { bezugspunkte, zuEbene } from './ebene';
import type { Entzerrung } from './ebene';
import type { Pt } from './mat';

export interface Messwert {
  /** Länge (Strecke, Linienzug) bzw. Umfang (Fläche) in m */
  laenge: number;
  /** Fläche in m² */
  flaeche?: number;
  /** Teillängen je Abschnitt in m */
  abschnitte: number[];
}

export function flaecheVon(p: Pt[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i].x * q.y - q.x * p[i].y;
  }
  return Math.abs(a) / 2;
}

export function messwert(e: Entzerrung, m: Messung): Messwert {
  const p = m.punkte.map((q) => zuEbene(e, q));
  const zu = m.art === 'flaeche' && p.length > 2;
  const abschnitte: number[] = [];
  for (let i = 0; i + 1 < p.length; i++) abschnitte.push(Math.hypot(p[i + 1].x - p[i].x, p[i + 1].y - p[i].y));
  if (zu) abschnitte.push(Math.hypot(p[0].x - p[p.length - 1].x, p[0].y - p[p.length - 1].y));
  const laenge = abschnitte.reduce((s, v) => s + v, 0);
  return zu ? { laenge, flaeche: flaecheVon(p), abschnitte } : { laenge, abschnitte };
}

/** Größe eines Fotopixels in der Ebene an dieser Stelle (m, Wurzel der Pixelfläche) */
export function pixelGroesse(e: Entzerrung, p: Pt): number {
  const a = zuEbene(e, p);
  const b = zuEbene(e, { x: p.x + 1, y: p.y });
  const c = zuEbene(e, { x: p.x, y: p.y + 1 });
  return Math.sqrt(Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)));
}

const STUFEN = [1, 2, 2.5, 5];

/** nächstkleinere „runde“ Auflösung (1 – 2 – 2,5 – 5 × 10ⁿ) */
export function rundeAufloesung(v: number): number {
  const exp = Math.floor(Math.log10(v));
  const basis = 10 ** exp;
  let best = basis;
  for (const s of STUFEN) if (s * basis <= v * (1 + 1e-9)) best = s * basis;
  return best;
}

/** nächstgröbere „runde“ Auflösung */
export function naechsteStufe(v: number): number {
  const exp = Math.floor(Math.log10(v));
  for (const e of [exp, exp + 1]) for (const st of STUFEN) if (st * 10 ** e > v * (1 + 1e-9)) return st * 10 ** e;
  return v * 2;
}

/** Auflösung, bei der die Bezugsfläche etwa in Fotoauflösung erscheint */
export function autoAufloesung(e: Entzerrung, ebene: Ebene): number {
  const bezug = bezugspunkte(ebene);
  const mitte = { x: bezug.reduce((s, p) => s + p.x, 0) / bezug.length, y: bezug.reduce((s, p) => s + p.y, 0) / bezug.length };
  const g = pixelGroesse(e, mitte);
  return rundeAufloesung(Number.isFinite(g) && g > 0 ? g : 0.001);
}

function huelle(p: Pt[]): Bereich {
  return {
    x0: Math.min(...p.map((q) => q.x)),
    y0: Math.min(...p.map((q) => q.y)),
    x1: Math.max(...p.map((q) => q.x)),
    y1: Math.max(...p.map((q) => q.y)),
  };
}

/**
 * Sichtbarer Teil der Ebene: das ganze Foto, soweit es vor dem Horizont liegt, höchstens aber das
 * Dreifache der Bezugsfläche in jede Richtung (zum Horizont hin wächst die Ebene ins Unendliche).
 */
export function autoBereich(e: Entzerrung, foto: Foto, ebene: Ebene): Bereich {
  const bezug = huelle(bezugspunkte(ebene).map((p) => zuEbene(e, p)));
  const n = 48;
  const rand: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    rand.push({ x: t * foto.breite, y: 0 }, { x: t * foto.breite, y: foto.hoehe }, { x: 0, y: t * foto.hoehe }, { x: foto.breite, y: t * foto.hoehe });
  }
  const bw = Math.max(bezug.x1 - bezug.x0, bezug.y1 - bezug.y0, 1e-3);
  const grenze = { x0: bezug.x0 - 3 * bw, y0: bezug.y0 - 3 * bw, x1: bezug.x1 + 3 * bw, y1: bezug.y1 + 3 * bw };
  // Punkte hinter dem Horizont (w ≤ 0) fallen weg; Punkte nahe daran begrenzt die Grenze
  const sichtbar = rand.map((p) => zuEbene(e, p)).filter((q) => q.w > 0 && Number.isFinite(q.x) && Number.isFinite(q.y));
  const b = sichtbar.length ? huelle(sichtbar) : bezug;
  return { x0: Math.max(grenze.x0, b.x0), y0: Math.max(grenze.y0, b.y0), x1: Math.min(grenze.x1, b.x1), y1: Math.min(grenze.y1, b.y1) };
}

export function bereichVon(e: Entzerrung, foto: Foto, ebene: Ebene): Bereich {
  return ebene.ausschnitt ?? autoBereich(e, foto, ebene);
}

/** größte Kantenlänge und Pixelzahl eines entzerrten Bildes */
export const MAX_KANTE = 16000;
export const MAX_PIXEL = 60e6;

export interface Ausgabe {
  bereich: Bereich;
  /** m je Pixel */
  aufloesung: number;
  breite: number;
  hoehe: number;
  /** Auflösung musste vergröbert werden */
  begrenzt: boolean;
}

export function ausgabe(bereich: Bereich, aufloesung: number): Ausgabe {
  let s = aufloesung;
  let begrenzt = false;
  const w = bereich.x1 - bereich.x0;
  const h = bereich.y1 - bereich.y0;
  while (Math.ceil(w / s) > MAX_KANTE || Math.ceil(h / s) > MAX_KANTE || Math.ceil(w / s) * Math.ceil(h / s) > MAX_PIXEL) {
    s = naechsteStufe(s);
    begrenzt = true;
  }
  return { bereich, aufloesung: s, breite: Math.max(1, Math.ceil(w / s)), hoehe: Math.max(1, Math.ceil(h / s)), begrenzt };
}
