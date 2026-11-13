import { describe, expect, it } from 'vitest';
import { musterLv } from '../__fixtures__/muster';
import type { Lv, Position } from './modell';
import { leeresLv, neueId, ozDubletten } from './modell';
import { auffaellig, brutto, gesamtbetrag, rangfolge, rund2, spiegelzeile, summen, ustBetrag } from './rechnen';

const pos = (oz: string, menge: number | null, preise: Position['preise'], extra: Partial<Position> = {}): Position => ({
  id: neueId(),
  art: 'position',
  oz,
  kurztext: `Position ${oz}`,
  langtext: [],
  einheit: 'm',
  menge,
  positionsart: 'normal',
  preise,
  ...extra,
});

function lvMit(
  elemente: Position[],
  bieter: Lv['bieter'] = [
    { id: 0, name: 'Kostenansatz LV' },
    { id: 10, name: 'A' },
    { id: 11, name: 'B' },
  ],
): Lv {
  const lv = leeresLv('Test');
  lv.bieter = bieter;
  lv.elemente = [{ id: neueId(), art: 'abschnitt', oz: '01', kurztext: 'Abschnitt', langtext: [], kinder: elemente }];
  return lv;
}

describe('Rundung', () => {
  it('rund2 rundet kaufmännisch, auch bei Gleitkommafehlern', () => {
    expect(rund2(1.005)).toBe(1.01);
    expect(rund2(0.5 * 2.01)).toBe(1.01);
    expect(rund2(-1.005)).toBe(-1.01);
    expect(rund2(2.004)).toBe(2);
    // Gegenprobe: ohne Ausgleich wäre 1,005 → 1,00
    expect(Math.round(1.005 * 100) / 100).toBe(1);
  });

  it('Brutto = Netto + USt, beides auf Cent', () => {
    expect(ustBetrag(100.05, 19)).toBe(19.01);
    expect(brutto(100.05, 19)).toBe(119.06);
    expect(brutto(0, 19)).toBe(0);
    expect(brutto(10, 0)).toBe(10);
  });

  it('Gesamtbetrag: Menge × EP auf Cent, Pauschale, abweichende Menge, ohne Preis = null', () => {
    const p = pos('0010', 0.5, { '0': { ep: 2.01 }, '10': { ep: 5, menge: 3 }, '11': { ep: null, pauschal: 99.999 } });
    expect(gesamtbetrag(p, 0)).toBe(1.01);
    expect(gesamtbetrag(p, 10)).toBe(15);
    expect(gesamtbetrag(p, 11)).toBe(100);
    expect(gesamtbetrag(p, 12)).toBeNull();
  });
});

describe('Summen', () => {
  it('Nachlass, Bedarfs-, Wahl- und Nachtragspositionen', () => {
    const lv = lvMit([
      pos('0010', 10, { '10': { ep: 10 }, '11': { ep: 12 } }),
      pos('0020', 1, { '10': { ep: 1000 }, '11': { ep: 1000 } }, { positionsart: 'bedarf' }),
      pos('0030', 2, { '10': { ep: 50 }, '11': { ep: 40 } }, { positionsart: 'wahl' }),
      pos('0040', 1, { '10': { ep: 300 }, '11': { ep: 300 } }, { nachtrag: 1 }),
    ]);
    lv.bieter[1].nachlass = -2;
    lv.auftrag = { bieterId: 10 };
    const s = summen(lv);
    const a = s.bieter.get(10)!;
    // nur die Normalposition zählt
    expect(a.ohneNachlass).toBe(100);
    expect(a.netto).toBe(98);
    expect(a.mwst).toBe(18.62);
    expect(a.brutto).toBe(116.62);
    expect(s.bieter.get(11)!.ohneNachlass).toBe(120);
    // Bedarf und Wahl haben einen Gesamtbetrag, zählen aber nicht
    expect(s.positionen.get(lv.elemente[0].art === 'abschnitt' ? lv.elemente[0].kinder[1].id : '')!.get(10)).toBe(1000);
    expect(s.nachtraege.get(1)).toBe(300);
  });

  it('Abschnittssumme = Summe der Positions-Gesamtbeträge = Angebotssumme', () => {
    const lv = lvMit([pos('0010', 0.5, { '10': { ep: 2.01 } }), pos('0020', 3.333, { '10': { ep: 1.11 } })]);
    const s = summen(lv);
    const gb = [...s.positionen.values()].map((m) => m.get(10) ?? 0);
    const summe = rund2(gb.reduce((x, y) => x + y, 0));
    expect(s.abschnitte.get(lv.elemente[0].id)!.get(10)).toBe(summe);
    expect(s.bieter.get(10)!.ohneNachlass).toBe(summe);
  });
});

describe('Preisspiegel und Rangfolge', () => {
  it('unvollständige Angebote stehen hinten und sind gekennzeichnet', () => {
    const lv = lvMit([pos('0010', 10, { '10': { ep: 10 }, '11': { ep: 12 } }), pos('0020', 10, { '10': { ep: 10 } })]);
    const r = rangfolge(lv);
    // B ist ohne die fehlende Position günstiger (120 < 200), steht aber hinter dem vollständigen Angebot
    expect(r.map((x) => [x.id, x.rang, x.unvollstaendig, x.ohnePreis])).toEqual([
      [10, 1, false, 0],
      [11, 2, true, 1],
    ]);
    // Gegenprobe: mit allen Preisen ist B vollständig und Erster
    const voll = lvMit([pos('0010', 10, { '10': { ep: 10 }, '11': { ep: 12 } }), pos('0020', 10, { '10': { ep: 10 }, '11': { ep: 1 } })]);
    expect(rangfolge(voll).map((x) => [x.id, x.unvollstaendig])).toEqual([
      [11, false],
      [10, false],
    ]);
  });

  it('ausgeschlossene Bieter und der Kostenansatz zählen nicht', () => {
    const lv = musterLv();
    lv.bieter = lv.bieter.map((b) => (b.id === 11 ? { ...b, ausgeschlossen: true } : b));
    expect(rangfolge(lv).map((x) => x.id)).not.toContain(11);
    expect(rangfolge(lv).map((x) => x.id)).not.toContain(0);
  });

  it('Spiegelzeile und auffällige Preise (ab drei Preisen, über 30 % vom Mittel)', () => {
    const p = pos('0010', 1, { '10': { ep: 100 }, '11': { ep: 100 }, '12': { ep: 200 } });
    const z = spiegelzeile(p, [10, 11, 12]);
    expect(z.min).toBe(100);
    expect(z.max).toBe(200);
    expect(z.guenstigster).toEqual([10, 11]);
    expect(auffaellig(z, 12)).toBe(true);
    expect(auffaellig(z, 10)).toBe(false);
    // Gegenprobe: nur zwei Preise → nichts auffällig
    expect(auffaellig(spiegelzeile(p, [10, 12]), 12)).toBe(false);
  });
});

describe('OZ-Dubletten', () => {
  it('findet doppelte Ordnungszahlen (auch mit/ohne führende Nullen)', () => {
    const lv = lvMit([pos('0010', 1, {}), pos('10', 1, {}), pos('0020', 1, {})]);
    expect(ozDubletten(lv).map((d) => [d.oz, d.ids.length])).toEqual([['01.0010', 2]]);
    expect(ozDubletten(musterLv())).toEqual([]);
  });
});
