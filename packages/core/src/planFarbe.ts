/**
 * Planfarben auf der dunklen Zeichenfläche.
 *
 * Im dunklen Schema wird die Zeichenfläche als Ganzes mit `--canvas-filter: invert(0.92) hue-rotate(180deg)` gefiltert
 * (base.css). Pläne bleiben so lesbar, aber eine Raumfüllung in Nutzungsfarbe erscheint danach dunkel und im Ton
 * verschoben (Gelb wird Oliv) – anders als die Farbmarke derselben Nutzung in der Liste, die nicht gefiltert wird.
 *
 * `planFuellungDunkel` rechnet die Füllung so vor, dass sie *nach* dem Filter wie die Farbmarke mit der gewünschten
 * Deckung über dem dunklen Planhintergrund aussieht: gleicher Farbton wie in der Liste. Die Farbmarke selbst bleibt
 * unverändert (hell und kontrastreich).
 *
 * Grundlage: Die Filterfunktionen wirken im sRGB-Raum (Filter Effects, Kurzschreibweisen) und sind je Schritt affin;
 * zwischen den Schritten wird auf [0, 1] begrenzt. invert(a): c' = a + (1 − 2a)·c; hue-rotate(180°) ist eine lineare
 * Abbildung, die ihr eigenes Inverses ist. Damit lässt sich die Zielfarbe zurückrechnen. Ist das Ergebnis mit der
 * gewünschten Deckung nicht darstellbar (Kanal außerhalb von [0, 1]), wird die Deckung so weit erhöht, bis es geht.
 */

type Rgb = [number, number, number];

/** muss zu `--canvas-filter` in base.css passen */
export const ZEICHENFLAECHE_INVERT = 0.92;
/** helle Grundfarbe der Zeichenfläche (`--canvas` in base.css), vor dem Filter */
export const ZEICHENFLAECHE_GRUND = '#fbfbfa';

/** hue-rotate(180°) nach Filter Effects (Matrix in sRGB); selbstinvers */
const DREHUNG_180: [Rgb, Rgb, Rgb] = [
  [-0.574, 1.43, 0.144],
  [0.426, 0.43, 0.144],
  [0.426, 1.43, -0.856],
];

const begrenzt = (v: number) => Math.min(1, Math.max(0, v));
const mal = (m: [Rgb, Rgb, Rgb], c: Rgb): Rgb => m.map((z) => z[0] * c[0] + z[1] * c[1] + z[2] * c[2]) as Rgb;

export function hexZuRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  const voll = h.length === 3 ? [...h].map((x) => x + x).join('') : h;
  if (!/^[0-9a-f]{6}$/i.test(voll)) throw new Error(`Keine Farbe: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(voll.slice(i, i + 2), 16) / 255) as Rgb;
}

export function rgbZuHex(c: Rgb): string {
  return (
    '#' +
    c
      .map((v) =>
        Math.round(begrenzt(v) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

/** Farbe nach dem Filter der dunklen Zeichenfläche (so, wie man sie sieht) */
export function gefiltert(c: Rgb): Rgb {
  const a = ZEICHENFLAECHE_INVERT;
  const inv = c.map((v) => begrenzt(a + (1 - 2 * a) * v)) as Rgb;
  return mal(DREHUNG_180, inv).map(begrenzt) as Rgb;
}

/** Farbe vor dem Filter, die danach `ziel` ergibt; Kanäle können außerhalb von [0, 1] liegen (dann nicht darstellbar) */
function ungefiltert(ziel: Rgb): Rgb {
  const a = ZEICHENFLAECHE_INVERT;
  const inv = mal(DREHUNG_180, ziel);
  return inv.map((v) => (v - a) / (1 - 2 * a)) as Rgb;
}

const mischen = (oben: Rgb, unten: Rgb, deckung: number): Rgb => oben.map((v, i) => deckung * v + (1 - deckung) * unten[i]) as Rgb;
const darstellbar = (c: Rgb) => c.every((v) => v >= -1e-6 && v <= 1 + 1e-6);

/**
 * Füllung für die dunkle Zeichenfläche: Farbe und Deckung, mit denen die Fläche *vor* dem Filter gezeichnet wird, damit
 * sie danach wie `farbe` mit `deckung` über dem dunklen Planhintergrund aussieht – im selben Farbton wie die Farbmarke
 * in der Liste. Die zurückgegebene Deckung ist mindestens `deckung` (höher nur, wenn es anders nicht darstellbar ist).
 *
 * @param farbe Nutzungs- bzw. Planfarbe als Hex (z. B. aus `nutzungInfo(...).color`)
 * @param deckung gewünschte sichtbare Deckung (0–1), wie im hellen Schema, z. B. 0,45
 * @param grund helle Grundfarbe der Zeichenfläche vor dem Filter
 */
export function planFuellungDunkel(farbe: string, deckung: number, grund: string = ZEICHENFLAECHE_GRUND): { farbe: string; deckung: number } {
  const m = hexZuRgb(farbe);
  const g = hexZuRgb(grund);
  const d = begrenzt(deckung);
  // sichtbares Ziel: Farbe mit Deckung über dem gefilterten (dunklen) Grund
  const ziel = mischen(m, gefiltert(g), d);
  // Mischung vor dem Filter, die das Ziel ergibt
  const vorher = ungefiltert(ziel);
  // Füllfarbe p mit Deckung e: e·p + (1 − e)·g = vorher  →  p = (vorher − (1 − e)·g) / e; kleinste darstellbare e ≥ d
  for (let e = Math.max(d, 0.01); e <= 1.0001; e += 0.01) {
    const p = vorher.map((v, i) => (v - (1 - e) * g[i]) / e) as Rgb;
    if (darstellbar(p)) return { farbe: rgbZuHex(p), deckung: Math.round(Math.min(1, e) * 100) / 100 };
  }
  // nicht exakt erreichbar: deckend und begrenzt (nächstliegende Farbe)
  return { farbe: rgbZuHex(vorher), deckung: 1 };
}

/** Farbton (0–360°) einer Farbe; für Tests und Prüfungen */
export function farbton(c: Rgb): number {
  const [r, g, b] = c;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 1e-9) return 0;
  const h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
  return (h * 60 + 360) % 360;
}
