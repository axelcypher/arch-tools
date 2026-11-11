/**
 * Geographische Koordinaten (ETRS89 bzw. WGS84, Grad) → ETRS89 / UTM Zone 32N (EPSG:25832), wie im amtlichen
 * Lagebezugssystem in NRW (ALKIS). Transversale Mercatorprojektion nach Krüger (Reihen in n bis 6. Ordnung,
 * Genauigkeit im Millimeterbereich); GRS80-Ellipsoid, Mittelmeridian 9° Ost, Maßstab 0,9996, Ostwert + 500 000 m.
 * WGS84 und ETRS89 weichen in Mitteleuropa um weniger als einen Meter voneinander ab – für die Suche genügt das.
 */

const A = 6378137; // große Halbachse GRS80
const F = 1 / 298.257222101; // Abplattung GRS80
const K0 = 0.9996;
const L0 = (9 * Math.PI) / 180;
const FALSCH_OST = 500000;

const N = F / (2 - F);
const N2 = N * N;
const N3 = N2 * N;
const N4 = N3 * N;
const N5 = N4 * N;
const N6 = N5 * N;
/** Meridianbogen-Radius */
const AA = (A / (1 + N)) * (1 + N2 / 4 + N4 / 64 + N6 / 256);
const ALPHA = [
  N / 2 - (2 * N2) / 3 + (5 * N3) / 16 + (41 * N4) / 180 - (127 * N5) / 288 + (7891 * N6) / 37800,
  (13 * N2) / 48 - (3 * N3) / 5 + (557 * N4) / 1440 + (281 * N5) / 630 - (1983433 * N6) / 1935360,
  (61 * N3) / 240 - (103 * N4) / 140 + (15061 * N5) / 26880 + (167603 * N6) / 181440,
  (49561 * N4) / 161280 - (179 * N5) / 168 + (6601661 * N6) / 7257600,
  (34729 * N5) / 80640 - (3418889 * N6) / 1995840,
  (212378941 * N6) / 319334400,
];
const E = Math.sqrt(F * (2 - F));

export interface Utm32 {
  /** Ostwert (Rechtswert) in m */
  ost: number;
  /** Nordwert (Hochwert) in m */
  nord: number;
}

export function nachUtm32(lat: number, lon: number): Utm32 {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180 - L0;
  // konforme Breite
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - E * Math.atanh(E * Math.sin(phi)));
  const xi1 = Math.atan2(t, Math.cos(lambda));
  const eta1 = Math.atanh(Math.sin(lambda) / Math.sqrt(1 + t * t));
  let xi = xi1;
  let eta = eta1;
  for (let j = 1; j <= 6; j++) {
    xi += ALPHA[j - 1] * Math.sin(2 * j * xi1) * Math.cosh(2 * j * eta1);
    eta += ALPHA[j - 1] * Math.cos(2 * j * xi1) * Math.sinh(2 * j * eta1);
  }
  return { ost: FALSCH_OST + K0 * AA * eta, nord: K0 * AA * xi };
}
