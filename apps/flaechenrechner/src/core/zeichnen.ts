import type { Point } from '@core/geometry';
import { roundTo } from '@core/geometry';

/**
 * Kantenfang mit Rasterfang: den Lotfußpunkt `p` auf der Kante a–b entlang der Kante auf das Raster legen.
 * Achsparallele Kanten runden die freie Koordinate, schräge Kanten den Abstand von a in Vielfachen des Rasters;
 * der Punkt bleibt auf der Kante.
 */
export function kantenpunktAufRaster(p: Point, a: Point, b: Point, step: number): Point {
  const d = { x: b.x - a.x, y: b.y - a.y };
  const len = Math.hypot(d.x, d.y);
  if (len < 1e-9 || !(step > 0)) return p;
  const klemme = (v: number, u: number, w: number) => Math.min(Math.max(v, Math.min(u, w)), Math.max(u, w));
  if (Math.abs(d.y) < 1e-9) return { x: klemme(roundTo(p.x, step), a.x, b.x), y: p.y };
  if (Math.abs(d.x) < 1e-9) return { x: p.x, y: klemme(roundTo(p.y, step), a.y, b.y) };
  const t = ((p.x - a.x) * d.x + (p.y - a.y) * d.y) / len;
  const tr = klemme(roundTo(t, step), 0, len);
  return { x: roundTo(a.x + (d.x / len) * tr, 1e-4), y: roundTo(a.y + (d.y / len) * tr, 1e-4) };
}

/**
 * Relative Eingabe „dx;dy“ beim Polygon: wie im Plan nach rechts und oben positiv (die Zeichenfläche rechnet intern
 * mit y nach unten); passt zur Koordinatenanzeige und zum Messwerkzeug.
 */
export function relativerPunkt(von: Point, dx: number, dy: number): Point {
  return { x: roundTo(von.x + dx, 1e-4), y: roundTo(von.y - dy, 1e-4) };
}

export type EscZiel = 'eingabe' | 'entwurf' | 'kalibrierung' | 'messung' | 'werkzeug' | 'auswahl';

/** Was Esc zuerst verwirft: Zahleneingabe → Entwurf → Kalibrierstrecke → Messung → Werkzeug → Auswahl */
export function escZiel(z: { eingabe: boolean; entwurf: boolean; kalibrierung: boolean; messung: boolean; werkzeug: boolean }): EscZiel {
  if (z.eingabe) return 'eingabe';
  if (z.entwurf) return 'entwurf';
  if (z.kalibrierung) return 'kalibrierung';
  if (z.messung) return 'messung';
  if (z.werkzeug) return 'werkzeug';
  return 'auswahl';
}

/** grobe Breite eines Textes auf der Zeichenfläche in px (für die Entscheidung, ob eine Beschriftung passt) */
export function textBreite(text: string, schrift = 12): number {
  return text.length * schrift * 0.55;
}
