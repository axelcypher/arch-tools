import type { Point } from '@core/geometry';
import { polygonArea } from '@core/geometry';

/**
 * Messen (F-19): Kettenmessung mit Summe, dx/dy und Winkel je Abschnitt, geschlossen auch Fläche und Umfang.
 * Messungen gehen nie in BGF, NRF oder Wohnfläche ein – sie sind nur Anzeige (und lassen sich kopieren).
 */

export interface MessAbschnitt {
  laenge: number;
  dx: number;
  /** nach oben positiv (Plan: y nach unten) */
  dy: number;
  /** Richtung in Grad gegen den Uhrzeigersinn ab „Osten“ (rechts), 0 … 360 */
  winkel: number;
}

export interface Messung {
  abschnitte: MessAbschnitt[];
  /** Summe der Abschnitte (geschlossen: Umfang) */
  summe: number;
  /** nur geschlossen: Fläche */
  flaeche?: number;
}

export function messung(punkte: readonly Point[], geschlossen = false): Messung {
  const n = punkte.length;
  const abschnitte: MessAbschnitt[] = [];
  const bis = geschlossen && n >= 3 ? n : n - 1;
  for (let i = 0; i < bis; i++) {
    const a = punkte[i];
    const b = punkte[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = -(b.y - a.y) || 0; // kein „−0°“ bei waagerechten Strecken
    let w = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (w < 0) w += 360;
    abschnitte.push({ laenge: Math.hypot(dx, dy), dx, dy, winkel: w });
  }
  const summe = abschnitte.reduce((s, x) => s + x.laenge, 0);
  return geschlossen && n >= 3 ? { abschnitte, summe, flaeche: polygonArea(punkte as Point[]) } : { abschnitte, summe };
}

const z = (v: number, d = 2) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Messung als Text (Zwischenablage, Anzeige) */
export function messText(m: Messung): string {
  const zeilen = m.abschnitte.map((a, i) => `${i + 1}: ${z(a.laenge, 3)} m (dx ${z(a.dx, 3)}, dy ${z(a.dy, 3)}, ${z(a.winkel, 1)}°)`);
  if (m.abschnitte.length > 1 || m.flaeche !== undefined) zeilen.push(`${m.flaeche !== undefined ? 'Umfang' : 'Summe'}: ${z(m.summe, 3)} m`);
  if (m.flaeche !== undefined) zeilen.push(`Fläche: ${z(m.flaeche)} m²`);
  return zeilen.join('\n');
}
