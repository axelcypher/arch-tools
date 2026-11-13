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
 * gewünschten Deckung nicht darstellbar (Kanal außerhalb von [0, 1]), wird die Deckung so weit erhöht, bis es geht;
 * ist es auch deckend nicht darstellbar, wird das Ziel entsättigt (Farbton bleibt, Buntheit sinkt).
 * Über einer Unterlage (PDF, Bild) ist der Grund nicht `ZEICHENFLAECHE_GRUND`: dann `grund` übergeben oder die
 * Abweichung hinnehmen.
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
 * Achtung: Sie ist das Mischverhältnis *vor* dem Filter, mit dem gezeichnet wird – sichtbar bleibt die gewünschte
 * `deckung`. Bedingung für den Aufruf: `useZeichenflaecheGefiltert()` (platform/theme.ts).
 * Die Konstanten oben müssen zu `--canvas-filter` und `--canvas` in base.css passen.
 *
 * @param farbe Nutzungs- bzw. Planfarbe als Hex (z. B. aus `nutzungInfo(...).color`)
 * @param deckung gewünschte sichtbare Deckung (0–1), wie im hellen Schema, z. B. 0,45
 * @param grund helle Grundfarbe der Zeichenfläche vor dem Filter
 */
export function planFuellungDunkel(farbe: string, deckung: number, grund: string = ZEICHENFLAECHE_GRUND): { farbe: string; deckung: number } {
  if (!Number.isFinite(deckung)) throw new Error(`Keine Deckung: ${deckung}`);
  const m = hexZuRgb(farbe);
  const g = hexZuRgb(grund);
  const d = begrenzt(deckung);
  if (d === 0) return { farbe: rgbZuHex(g), deckung: 0 };
  const grundSichtbar = gefiltert(g);
  // sichtbares Ziel: Farbe mit Deckung über dem gefilterten (dunklen) Grund
  let ziel = mischen(m, grundSichtbar, d);
  let vorher = ungefiltert(ziel);
  if (!darstellbar(vorher)) {
    // auch deckend nicht erreichbar: Ziel zur gleich hellen Graustufe hin entsättigen, bis es geht – der Farbton bleibt
    // (Mischen mit Grau ändert den Ton nicht), nur die Buntheit sinkt
    const grau = 0.2126 * ziel[0] + 0.7152 * ziel[1] + 0.0722 * ziel[2];
    const roh = ziel;
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 30; k++) {
      const mitte = (lo + hi) / 2;
      if (darstellbar(ungefiltert(roh.map((v) => mitte * v + (1 - mitte) * grau) as Rgb))) lo = mitte;
      else hi = mitte;
    }
    ziel = roh.map((v) => lo * v + (1 - lo) * grau) as Rgb;
    vorher = ungefiltert(ziel).map(begrenzt) as Rgb;
  }
  // Füllfarbe p mit Deckung e: e·p + (1 − e)·g = vorher. p liegt in [0, 1], wenn je Kanal
  // e ≥ (g − v) / g (für v < g) und e ≥ (v − g) / (1 − g) (für v > g) – kleinste solche Deckung, mindestens d
  let e = d;
  vorher.forEach((v, i) => {
    if (v < g[i] && g[i] > 0) e = Math.max(e, (g[i] - v) / g[i]);
    if (v > g[i] && g[i] < 1) e = Math.max(e, (v - g[i]) / (1 - g[i]));
  });
  // auf Hundertstel aufrunden und erst dann p rechnen (passt genau zur zurückgegebenen Deckung)
  e = Math.min(1, Math.ceil(e * 100 - 1e-9) / 100);
  const p = vorher.map((v, i) => (v - (1 - e) * g[i]) / e) as Rgb;
  return { farbe: rgbZuHex(p), deckung: e };
}
