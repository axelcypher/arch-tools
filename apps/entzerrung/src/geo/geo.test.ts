import { describe, expect, it } from 'vitest';
import { neueEbene, neuesFoto } from '../model';
import type { Ebene, Foto } from '../model';
import { entzerrung, zuEbene, zuFoto } from './ebene';
import type { Entzerrung } from './ebene';
import { homographie } from './homographie';
import { abbilden } from './mat';
import type { Pt } from './mat';
import { ausgabe, autoAufloesung, autoBereich, messwert, naechsteStufe, rundeAufloesung } from './messen';
import { entzeichnen, geradheit, kamera, schaetzeLinse, verzeichnen } from './verzeichnung';

/**
 * Synthetische Aufnahme: Fassade in der Ebene Z = 0 (X nach rechts, Y nach oben, Meter), Kamera 12 m davor
 * in Augenhöhe, um 25° gedreht und 10° nach oben geneigt, Brennweite 3000 px, Bild 4000 × 3000 px.
 */
function aufnahme(drehung = 25, neigung = 10, linse = { k1: 0, k2: 0 }) {
  const f = 3000;
  const [cx, cy] = [2000, 1500];
  const c = [5, 1.6, -12];
  const g = (drehung * Math.PI) / 180;
  const n = (neigung * Math.PI) / 180;
  const kam = kamera(4000, 3000, linse);
  return (X: number, Y: number): Pt => {
    // Welt → Kamera (x rechts, y unten, z nach vorn)
    let x = X - c[0];
    let y = -(Y - c[1]);
    let z = 0 - c[2];
    // Drehung um die Hochachse
    [x, z] = [x * Math.cos(g) - z * Math.sin(g), x * Math.sin(g) + z * Math.cos(g)];
    // Neigung um die Querachse (nach oben)
    [y, z] = [y * Math.cos(n) + z * Math.sin(n), -y * Math.sin(n) + z * Math.cos(n)];
    return verzeichnen(kam, { x: cx + (f * x) / z, y: cy + (f * y) / z });
  };
}

function foto(linse = { k1: 0, k2: 0 }): Foto {
  const f = neuesFoto('f1', 'test.jpg', 'image/jpeg', 4000, 3000);
  return { ...f, linse };
}

function strecke(e: Entzerrung, a: Pt, b: Pt) {
  const p = zuEbene(e, a);
  const q = zuEbene(e, b);
  return Math.hypot(q.x - p.x, q.y - p.y);
}

function ok(r: ReturnType<typeof entzerrung>): Entzerrung {
  if (!r.ok) throw new Error(r.fehler);
  return r.e;
}

describe('Homographie', () => {
  it('findet die Abbildung aus vier und aus acht Punkten', () => {
    const h = [1.2, 0.1, 30, -0.05, 0.9, 12, 0.0002, -0.0001, 1];
    const q = [
      { x: 0, y: 0 },
      { x: 400, y: 10 },
      { x: 380, y: 300 },
      { x: 20, y: 280 },
      { x: 200, y: 150 },
      { x: 50, y: 100 },
      { x: 300, y: 50 },
      { x: 150, y: 250 },
    ];
    for (const n of [4, 8]) {
      const z = q.slice(0, n).map((p) => abbilden(h, p));
      const g = homographie(q.slice(0, n), z);
      const p = abbilden(g, { x: 123, y: 77 });
      const soll = abbilden(h, { x: 123, y: 77 });
      expect(p.x).toBeCloseTo(soll.x, 6);
      expect(p.y).toBeCloseTo(soll.y, 6);
    }
  });

  it('lehnt Punkte auf einer Geraden ab', () => {
    const q = [0, 1, 2, 3].map((i) => ({ x: i * 10, y: i * 10 }));
    expect(() => homographie(q, q)).toThrow(/Geraden/);
  });
});

describe('Rechteck', () => {
  const bild = aufnahme();
  // Fenster 1,26 × 1,51 m, Unterkante 0,9 m, 2 m vom linken Rand
  const ecken = [bild(2, 0.9), bild(3.26, 0.9), bild(3.26, 2.41), bild(2, 2.41)];

  it('misst Strecken außerhalb des Rechtecks richtig', () => {
    const ebene: Ebene = { ...neueEbene(1), rechteck: { ecken, breite: 1.26, hoehe: 1.51 } };
    const e = ok(entzerrung(foto(), ebene));
    // Fassadenbreite 10 m auf Sockelhöhe und Traufhöhe 6 m
    expect(strecke(e, bild(0, 0), bild(10, 0))).toBeCloseTo(10, 6);
    expect(strecke(e, bild(9, 0), bild(9, 6))).toBeCloseTo(6, 6);
    // Ursprung links unten am Rechteck
    const p = zuEbene(e, bild(2, 0.9));
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(0, 6);
    // zurück ins Foto
    const q = zuFoto(e, { x: 5, y: 3 });
    const soll = bild(7, 3.9);
    expect(q.x).toBeCloseTo(soll.x, 4);
    expect(q.y).toBeCloseTo(soll.y, 4);
  });

  it('meldet fehlende Angaben und falsche Reihenfolge', () => {
    const f = foto();
    expect(entzerrung(f, { ...neueEbene(1), rechteck: { ecken: ecken.slice(0, 3), breite: 1, hoehe: 1 } })).toMatchObject({ ok: false, fehler: 'Noch 1 Ecke des Rechtecks setzen.' });
    expect(entzerrung(f, { ...neueEbene(1), rechteck: { ecken } })).toMatchObject({ ok: false, fehler: expect.stringMatching(/Breite und Höhe/) });
    const vertauscht = [ecken[0], ecken[2], ecken[1], ecken[3]];
    expect(entzerrung(f, { ...neueEbene(1), rechteck: { ecken: vertauscht, breite: 1, hoehe: 1 } })).toMatchObject({ ok: false, fehler: expect.stringMatching(/Reihenfolge/) });
    const gespiegelt = [ecken[1], ecken[0], ecken[3], ecken[2]];
    expect(entzerrung(f, { ...neueEbene(1), rechteck: { ecken: gespiegelt, breite: 1, hoehe: 1 } }).ok).toBe(false);
  });

  it('berücksichtigt die Objektivverzeichnung', () => {
    const linse = { k1: -0.12, k2: 0.02 };
    const bildV = aufnahme(25, 10, linse);
    const eckenV = [bildV(2, 0.9), bildV(3.26, 0.9), bildV(3.26, 2.41), bildV(2, 2.41)];
    const ebene: Ebene = { ...neueEbene(1), rechteck: { ecken: eckenV, breite: 1.26, hoehe: 1.51 } };
    const mit = ok(entzerrung(foto(linse), ebene));
    expect(strecke(mit, bildV(0, 0), bildV(10, 0))).toBeCloseTo(10, 5);
    // ohne Korrektur deutlich daneben
    const ohne = ok(entzerrung(foto(), ebene));
    expect(Math.abs(strecke(ohne, bildV(0, 0), bildV(10, 0)) - 10)).toBeGreaterThan(0.02);
  });
});

describe('Passpunkte', () => {
  const bild = aufnahme(-30, 5);
  const koord = [
    [0, 0],
    [10, 0],
    [10, 6],
    [0, 6],
    [4, 3],
    [7, 1.5],
  ];

  it('gleicht mehr als vier Punkte aus und zeigt Restfehler', () => {
    const passpunkte = koord.map(([x, y], i) => ({ id: `p${i}`, bild: bild(x, y), x, y }));
    const e = ok(entzerrung(foto(), { ...neueEbene(1), methode: 'passpunkte', passpunkte }));
    expect(e.residuen).toHaveLength(6);
    expect(Math.max(...e.residuen.map((r) => r.wert))).toBeLessThan(1e-6);
    expect(strecke(e, bild(1, 1), bild(9, 5))).toBeCloseTo(Math.hypot(8, 4), 6);

    // ein falsch eingemessener Punkt fällt im Restfehler auf
    const falsch = passpunkte.map((p) => (p.id === 'p4' ? { ...p, x: 4.1 } : p));
    const f = ok(entzerrung(foto(), { ...neueEbene(1), methode: 'passpunkte', passpunkte: falsch }));
    const groesster = f.residuen.reduce((a, b) => (b.wert > a.wert ? b : a));
    expect(groesster.id).toBe('p4');
  });

  it('braucht vier Punkte mit Koordinaten', () => {
    const passpunkte = koord.slice(0, 4).map(([x, y], i) => ({ id: `p${i}`, bild: bild(x, y), x: i === 3 ? undefined : x, y }));
    const r = entzerrung(foto(), { ...neueEbene(1), methode: 'passpunkte', passpunkte });
    expect(r).toMatchObject({ ok: false, fehler: expect.stringMatching(/vier Passpunkte.*vorhanden: 3, 1 ohne/) });
  });
});

describe('Fluchtlinien', () => {
  const bild = aufnahme(35, 12);
  const linie = (id: string, a: [number, number], b: [number, number]) => ({ id, a: bild(...a), b: bild(...b) });
  const basis = {
    waagerecht: [linie('w1', [1, 0.5], [9, 0.5]), linie('w2', [0.5, 5.5], [8, 5.5])],
    senkrecht: [linie('s1', [1, 0.2], [1, 5]), linie('s2', [9.2, 1], [9.2, 5.8])],
  };

  it('entzerrt mit einer Breite und einer Höhe', () => {
    const masse = [
      { ...linie('m1', [2, 1], [6, 1]), laenge: 4 },
      { ...linie('m2', [7, 0.5], [7, 3]), laenge: 2.5 },
    ];
    const e = ok(entzerrung(foto(), { ...neueEbene(1), methode: 'fluchtlinien', fluchtlinien: { ...basis, masse } }));
    expect(strecke(e, bild(0, 0), bild(10, 6))).toBeCloseTo(Math.hypot(10, 6), 6);
    expect(strecke(e, bild(3, 4), bild(8, 4))).toBeCloseTo(5, 6);
    // Achsen: rechts im Foto → x wächst, oben → y wächst
    const a = zuEbene(e, bild(1, 1));
    const b = zuEbene(e, bild(2, 3));
    expect(b.x - a.x).toBeCloseTo(1, 6);
    expect(b.y - a.y).toBeCloseTo(2, 6);
  });

  it('nimmt schräge Maße und zeigt Abweichungen weiterer Kanten', () => {
    const masse = [
      { ...linie('m1', [1, 1], [5, 4]), laenge: 5 },
      { ...linie('m2', [6, 5], [9, 1]), laenge: 5 },
      { ...linie('m3', [2, 2], [8, 2]), laenge: 6 },
    ];
    const f = { ...basis, waagerecht: [...basis.waagerecht, linie('w3', [2, 3], [7, 3])], masse };
    const e = ok(entzerrung(foto(), { ...neueEbene(1), methode: 'fluchtlinien', fluchtlinien: f }));
    expect(strecke(e, bild(0, 0), bild(10, 0))).toBeCloseTo(10, 5);
    expect(e.residuen.map((r) => r.id)).toEqual(['w1', 'w2', 'w3', 'm1', 'm2', 'm3']);
    expect(Math.max(...e.residuen.map((r) => r.wert))).toBeLessThan(1e-6);
  });

  it('erkennt Maße in gleicher Richtung', () => {
    const masse = [
      { ...linie('m1', [2, 1], [6, 1]), laenge: 4 },
      { ...linie('m2', [2, 3], [5, 3]), laenge: 3 },
    ];
    const r = entzerrung(foto(), { ...neueEbene(1), methode: 'fluchtlinien', fluchtlinien: { ...basis, masse } });
    expect(r).toMatchObject({ ok: false, fehler: expect.stringMatching(/dieselbe Richtung/) });
  });
});

describe('Objektivverzeichnung', () => {
  it('rechnet verzeichnete Punkte zurück', () => {
    const k = kamera(4000, 3000, { k1: -0.15, k2: 0.03 });
    for (const u of [
      { x: 10, y: 20 },
      { x: 3900, y: 2950 },
      { x: 2100, y: 1400 },
    ]) {
      const d = entzeichnen(k, verzeichnen(k, u));
      expect(d.x).toBeCloseTo(u.x, 6);
      expect(d.y).toBeCloseTo(u.y, 6);
    }
  });

  it('schätzt die Verzeichnung aus gekrümmten Kanten', () => {
    const linse = { k1: -0.1, k2: 0 };
    const bild = aufnahme(0, 0, linse);
    // drei Kanten nahe am Bildrand, je acht Punkte
    const kante = (a: [number, number], b: [number, number]) =>
      [...Array(8).keys()].map((i) => bild(a[0] + ((b[0] - a[0]) * i) / 7, a[1] + ((b[1] - a[1]) * i) / 7));
    const linien = [kante([-2.5, 5.2], [12.5, 5.2]), kante([-2.8, -1.4], [-2.8, 4.8]), kante([-2, -1.6], [12, -1.6])];
    expect(geradheit(linien).rms).toBeGreaterThan(5);
    const s = schaetzeLinse(4000, 3000, linien);
    expect(s.nurK1).toBe(false);
    expect(s.k1).toBeCloseTo(-0.1, 2);
    expect(s.nachher).toBeLessThan(0.05);
    expect(s.vorher).toBeGreaterThan(5);
  });
});

describe('Messen und Ausgabe', () => {
  const bild = aufnahme();
  const ecken = [bild(0, 0), bild(10, 0), bild(10, 6), bild(0, 6)];
  const ebene: Ebene = { ...neueEbene(1), rechteck: { ecken, breite: 10, hoehe: 6 } };
  const e = ok(entzerrung(foto(), ebene));

  it('Strecke, Linienzug und Fläche', () => {
    expect(messwert(e, { id: 'a', art: 'strecke', name: '', punkte: [bild(1, 1), bild(4, 5)] }).laenge).toBeCloseTo(5, 6);
    const zug = messwert(e, { id: 'b', art: 'linienzug', name: '', punkte: [bild(1, 1), bild(4, 1), bild(4, 3)] });
    expect(zug.abschnitte.map((v) => +v.toFixed(6))).toEqual([3, 2]);
    const fl = messwert(e, { id: 'c', art: 'flaeche', name: '', punkte: [bild(1, 1), bild(4, 1), bild(4, 3), bild(1, 3)] });
    expect(fl.flaeche).toBeCloseTo(6, 6);
    expect(fl.laenge).toBeCloseTo(10, 6);
  });

  it('wählt eine runde Auflösung und begrenzt die Bildgröße', () => {
    expect(rundeAufloesung(0.0037)).toBeCloseTo(0.0025, 10);
    expect(rundeAufloesung(0.002)).toBeCloseTo(0.002, 10);
    expect(naechsteStufe(0.002)).toBeCloseTo(0.0025, 10);
    expect(naechsteStufe(0.005)).toBeCloseTo(0.01, 10);
    const a = autoAufloesung(e, ebene);
    expect(a).toBeGreaterThan(0.001);
    expect(a).toBeLessThan(0.02);
    const g = ausgabe({ x0: 0, y0: 0, x1: 100, y1: 60 }, 0.001);
    expect(g.begrenzt).toBe(true);
    expect(g.breite * g.hoehe).toBeLessThanOrEqual(60e6);
    expect(g.aufloesung).toBeCloseTo(0.01, 10);
  });

  it('nimmt als Bereich das sichtbare Foto, begrenzt um die Bezugsfläche', () => {
    const b = autoBereich(e, foto(), ebene);
    // links schneidet der Bildrand die Fassade ab, nach rechts reicht die Ebene bis zur Grenze der Bezugsfläche
    expect(b.x0).toBeGreaterThan(2);
    expect(b.x0).toBeLessThan(3);
    expect(b.x1).toBeGreaterThan(10);
    expect(b.x1).toBeLessThanOrEqual(10 + 30);
    expect(b.y1).toBeLessThanOrEqual(6 + 30);
  });
});
