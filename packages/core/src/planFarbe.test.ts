import { describe, expect, it } from 'vitest';
import { NUTZUNGSGRUPPEN } from './norms';
import { VERSIEGELUNGEN } from './lageplan';
import { farbton, gefiltert, hexZuRgb, planFuellungDunkel, ZEICHENFLAECHE_GRUND } from './planFarbe';

/** was man nach dem Filter sieht: Füllung mit Deckung über dem Grund, dann der Filter der dunklen Zeichenfläche */
function sichtbar(farbe: string, deckung: number, grund = ZEICHENFLAECHE_GRUND) {
  const p = hexZuRgb(farbe);
  const g = hexZuRgb(grund);
  return gefiltert(p.map((v, i) => deckung * v + (1 - deckung) * g[i]) as [number, number, number]);
}
const buntheit = (c: number[]) => Math.max(...c) - Math.min(...c);
const tonAbstand = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

const FARBEN = [...NUTZUNGSGRUPPEN.map((n) => ({ name: n.kurz, color: n.color })), ...VERSIEGELUNGEN.map((v) => ({ name: v.label, color: v.color }))];

describe('Planfarben auf der dunklen Zeichenfläche', () => {
  it('ohne Vorrechnung erscheint die Füllung viel dunkler (Ausgangsbefund „Gelb wird Oliv“), vorgerechnet deutlich heller', () => {
    // relative Helligkeit (Rec. 709 auf sRGB-Werten) – genügt für den Vergleich vorher/nachher
    const hell = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const roh = sichtbar('#f4c95d', 0.45);
    const f = planFuellungDunkel('#f4c95d', 0.45);
    const vor = sichtbar(f.farbe, f.deckung);
    expect(hell(roh)).toBeLessThan(0.2);
    expect(hell(vor)).toBeGreaterThan(hell(roh) * 1.5);
    expect(buntheit(vor)).toBeGreaterThan(buntheit(roh));
  });

  it.each(FARBEN)('$name ($color): nach dem Filter derselbe Farbton wie die Marke, sichtbar wie Marke mit 45 % über dunklem Grund', ({ color }) => {
    const f = planFuellungDunkel(color, 0.45);
    expect(f.deckung).toBeGreaterThanOrEqual(0.45);
    expect(f.deckung).toBeLessThanOrEqual(1);
    const ist = sichtbar(f.farbe, f.deckung);
    const marke = hexZuRgb(color);
    const grund = gefiltert(hexZuRgb(ZEICHENFLAECHE_GRUND));
    const soll = marke.map((v, i) => 0.45 * v + 0.55 * grund[i]);
    // sichtbare Farbe trifft das Ziel (Rundung auf 8 Bit)
    ist.forEach((v, i) => expect(Math.abs(v - soll[i])).toBeLessThan(0.02));
    // Farbton wie die Marke (bei Grau ohne Ton: bleibt grau)
    if (buntheit(marke) < 0.02) expect(buntheit(ist)).toBeLessThan(0.02);
    else expect(tonAbstand(farbton(ist), farbton(marke))).toBeLessThan(4);
  });

  it('nicht erreichbare Deckung wird erhöht statt den Ton zu verfälschen; Eingaben werden geprüft', () => {
    // sehr geringe Deckung bei kräftiger Farbe: Kanal wäre außerhalb – die Funktion erhöht die Deckung
    const f = planFuellungDunkel('#f4c95d', 0.05);
    expect(f.deckung).toBeGreaterThanOrEqual(0.05);
    expect(() => planFuellungDunkel('gelb', 0.4)).toThrow('Keine Farbe');
  });
});
