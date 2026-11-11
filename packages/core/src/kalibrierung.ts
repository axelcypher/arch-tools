import type { Point } from './geometry';
import type { Background } from './model';

/**
 * Kalibrierung einer Unterlage (Bild, PDF-Seite, DXF) an einer bekannten Strecke: Zwei Punkte im Plan und ihre
 * wahre Länge ergeben den Maßstab; der erste Punkt bleibt an seiner Stelle. Ausrichten verschiebt die Unterlage so,
 * dass ein Punkt der Unterlage auf einen Punkt im Plan fällt.
 */

/** Maßstab der Unterlage: Meter je Pixel (Raster) bzw. je Zeichnungseinheit (Vektor) */
export const unterlagenMassstab = (bg: Background): number => (bg.type === 'raster' ? bg.metersPerPixel : bg.scale);

/** Faktor, um den die Unterlage wachsen muss, damit die Strecke a–b die Länge `laenge` [m] hat */
export function kalibrierFaktor(a: Point, b: Point, laenge: number): number {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  if (d < 1e-9 || !(laenge > 0)) throw new Error('Für die Kalibrierung zwei verschiedene Punkte und eine Länge über 0 angeben.');
  return laenge / d;
}

/** Unterlage um `faktor` skalieren; der Weltpunkt `anker` bleibt an seiner Stelle */
export function unterlageSkalieren<T extends Background>(bg: T, faktor: number, anker: Point): T {
  const s = unterlagenMassstab(bg) * faktor;
  const lage = { x: anker.x - (anker.x - bg.x) * faktor, y: anker.y - (anker.y - bg.y) * faktor };
  return bg.type === 'raster' ? { ...bg, ...lage, metersPerPixel: s } : { ...bg, ...lage, scale: s };
}

/** Kalibrieren an der Strecke a–b mit der wahren Länge `laenge` [m] (a bleibt an seiner Stelle) */
export function unterlageKalibrieren<T extends Background>(bg: T, a: Point, b: Point, laenge: number): T {
  return unterlageSkalieren(bg, kalibrierFaktor(a, b, laenge), a);
}

/** Unterlage verschieben: Punkt `von` (auf der Unterlage) fällt danach auf `nach` */
export function unterlageVerschieben<T extends Background>(bg: T, von: Point, nach: Point): T {
  return { ...bg, x: bg.x + nach.x - von.x, y: bg.y + nach.y - von.y };
}
