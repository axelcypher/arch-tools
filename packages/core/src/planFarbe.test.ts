import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NUTZUNGSGRUPPEN } from './norms';
import { VERSIEGELUNGEN } from './lageplan';
import { gefiltert, hexZuRgb, planFuellungDunkel, ZEICHENFLAECHE_GRUND, ZEICHENFLAECHE_INVERT } from './planFarbe';

type Rgb = [number, number, number];

/** was man nach dem Filter sieht: Füllung mit Deckung über dem Grund, dann der Filter der dunklen Zeichenfläche */
function sichtbar(farbe: string, deckung: number, grund = ZEICHENFLAECHE_GRUND): Rgb {
  const p = hexZuRgb(farbe);
  const g = hexZuRgb(grund);
  return gefiltert(p.map((v, i) => deckung * v + (1 - deckung) * g[i]) as Rgb);
}
/** Ziel: Marke mit Deckung über dem gefilterten Grund */
function ziel(farbe: string, deckung: number, grund = ZEICHENFLAECHE_GRUND): Rgb {
  const m = hexZuRgb(farbe);
  const g = gefiltert(hexZuRgb(grund));
  return m.map((v, i) => deckung * v + (1 - deckung) * g[i]) as Rgb;
}
function farbton([r, g, b]: Rgb): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 1e-9) return 0;
  const h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
  return (h * 60 + 360) % 360;
}
const buntheit = (c: number[]) => Math.max(...c) - Math.min(...c);
const hell = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const tonAbstand = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
const TOLERANZ = 2 / 255;

const FARBEN = [...NUTZUNGSGRUPPEN.map((n) => ({ name: n.kurz, color: n.color })), ...VERSIEGELUNGEN.map((v) => ({ name: v.label, color: v.color }))];
/** in den Apps benutzte Deckungen der Füllungen (QUADRIO 0,45; TERRIO 0,55/0,45/0,15/0,12; NUMIO 0,3) */
const DECKUNGEN = [0.12, 0.15, 0.3, 0.45, 0.5, 0.55];
const FAELLE = FARBEN.flatMap((f) => DECKUNGEN.map((d) => ({ ...f, d })));

describe('Planfarben auf der dunklen Zeichenfläche', () => {
  it('Ausgangsbefund: ohne Vorrechnung viel dunkler und matter („Gelb wird Oliv“), vorgerechnet heller und bunter', () => {
    const roh = sichtbar('#f4c95d', 0.45);
    const f = planFuellungDunkel('#f4c95d', 0.45);
    const vor = sichtbar(f.farbe, f.deckung);
    expect(hell(roh)).toBeLessThan(0.2);
    expect(hell(vor)).toBeGreaterThan(hell(roh) * 1.5);
    expect(buntheit(vor)).toBeGreaterThan(buntheit(roh));
  });

  it.each(FAELLE)('$name ($color) bei $d: sichtbar wie die Marke mit dieser Deckung, gleicher Farbton', ({ color, d }) => {
    const f = planFuellungDunkel(color, d);
    expect(f.deckung).toBeGreaterThanOrEqual(d);
    expect(f.deckung).toBeLessThanOrEqual(1);
    const ist = sichtbar(f.farbe, f.deckung);
    const soll = ziel(color, d);
    ist.forEach((v, i) => expect(Math.abs(v - soll[i])).toBeLessThan(TOLERANZ));
    const marke = hexZuRgb(color);
    if (buntheit(marke) < 0.02) expect(buntheit(ist)).toBeLessThan(0.02);
    // bei kaum bunter Fläche (geringe Deckung, matte Farbe) ist der Farbton numerisch kaum bestimmt – dann keine Tonprüfung
    else if (buntheit(ist) > 0.04) expect(tonAbstand(farbton(ist), farbton(marke))).toBeLessThan(4);
  });

  it.each(FARBEN)('$name ($color) deckend: auch wenn nicht exakt erreichbar, bleibt der Farbton (entsättigt statt verschoben)', ({ color }) => {
    const f = planFuellungDunkel(color, 1);
    expect(f.deckung).toBe(1);
    const ist = sichtbar(f.farbe, 1);
    const marke = hexZuRgb(color);
    if (buntheit(marke) < 0.02) expect(buntheit(ist)).toBeLessThan(0.02);
    else expect(tonAbstand(farbton(ist), farbton(marke))).toBeLessThan(4);
  });

  it('Rückfall greift schon unter Deckung 1: Gelb bei 0,8 wird deckend, entsättigt, im selben Farbton', () => {
    const f = planFuellungDunkel('#f4c95d', 0.8);
    expect(f.deckung).toBe(1);
    const ist = sichtbar(f.farbe, 1);
    const soll = ziel('#f4c95d', 0.8);
    // nicht exakt erreichbar …
    expect(Math.max(...ist.map((v, i) => Math.abs(v - soll[i])))).toBeGreaterThan(TOLERANZ);
    // … aber Farbton erhalten, nur matter
    expect(tonAbstand(farbton(ist), farbton(soll))).toBeLessThan(4);
    expect(buntheit(ist)).toBeLessThan(buntheit(soll));
  });

  it('geringe Deckung bei kräftiger Farbe: Deckung wird echt erhöht, sichtbar bleibt das Ziel', () => {
    const f = planFuellungDunkel('#f4c95d', 0.05);
    expect(f.deckung).toBeGreaterThan(0.05);
    const ist = sichtbar(f.farbe, f.deckung);
    ziel('#f4c95d', 0.05).forEach((v, i) => expect(Math.abs(ist[i] - v)).toBeLessThan(TOLERANZ));
  });

  it('krumme Deckung wird nie unterschritten; Rundung passt zur Farbe', () => {
    const f = planFuellungDunkel('#8ecae6', 0.453);
    expect(f.deckung).toBeGreaterThanOrEqual(0.453);
    const ist = sichtbar(f.farbe, f.deckung);
    ziel('#8ecae6', 0.453).forEach((v, i) => expect(Math.abs(ist[i] - v)).toBeLessThan(TOLERANZ));
  });

  it('Randfälle: Deckung 0, über 1, ungültig; 3-stellige Farbe; eigener Grund (Unterlage)', () => {
    expect(planFuellungDunkel('#f4c95d', 0)).toEqual({ farbe: ZEICHENFLAECHE_GRUND, deckung: 0 });
    expect(planFuellungDunkel('#f4c95d', 2).deckung).toBe(1);
    expect(() => planFuellungDunkel('#f4c95d', Number.NaN)).toThrow('Keine Deckung');
    expect(() => planFuellungDunkel('gelb', 0.4)).toThrow('Keine Farbe');
    expect(planFuellungDunkel('#abc', 0.45)).toEqual(planFuellungDunkel('#aabbcc', 0.45));
    const grund = '#e8e4da';
    const f = planFuellungDunkel('#7cb66a', 0.45, grund);
    const ist = sichtbar(f.farbe, f.deckung, grund);
    ziel('#7cb66a', 0.45, grund).forEach((v, i) => expect(Math.abs(ist[i] - v)).toBeLessThan(TOLERANZ));
  });

  it('Konstanten passen zu base.css (--canvas und --canvas-filter)', () => {
    const css = readFileSync(new URL('./ui/base.css', import.meta.url), 'utf8');
    expect(css).toMatch(new RegExp(`--canvas:\\s*${ZEICHENFLAECHE_GRUND};`));
    expect(css).toContain(`--canvas-filter: invert(${ZEICHENFLAECHE_INVERT}) hue-rotate(180deg)`);
  });
});
