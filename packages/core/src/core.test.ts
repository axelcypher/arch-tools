import { describe, expect, it } from 'vitest';
import { computeProject, computeStorey } from './calc';
import { fmt2, parseNum } from './format';
import {
  centroid,
  isSelfIntersecting,
  labelPoint,
  perimeter,
  pointInPolygon,
  polygonArea,
  rectPoints,
  signedArea,
  snapToGrid,
} from './geometry';
import { createOutline, createProject, createRoom, createStorey } from './model';
import { woflFaktor } from './norms';
import { parseProject, serializeProject } from './serialize';

const rect = (x: number, y: number, w: number, h: number) => rectPoints({ x, y }, { x: x + w, y: y + h });

describe('Geometrie', () => {
  it('berechnet Rechteckflächen unabhängig vom Umlaufsinn', () => {
    const r = rect(0, 0, 10, 12.5);
    expect(polygonArea(r)).toBeCloseTo(125);
    expect(polygonArea([...r].reverse())).toBeCloseTo(125);
    expect(Math.sign(signedArea(r))).toBe(-Math.sign(signedArea([...r].reverse())));
  });

  it('berechnet L-Formen, Umfang und Schwerpunkt', () => {
    const l = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 6 },
      { x: 0, y: 6 },
    ];
    expect(polygonArea(l)).toBeCloseTo(6 * 2 + 2 * 4);
    expect(perimeter(l)).toBeCloseTo(24);
    expect(centroid(rect(0, 0, 4, 2))).toEqual({ x: 2, y: 1 });
    const lp = labelPoint(l);
    expect(pointInPolygon(lp, l)).toBe(true);
  });

  it('erkennt Selbstüberschneidungen', () => {
    const bowtie = [
      { x: 0, y: 0 },
      { x: 2, y: 2 },
      { x: 2, y: 0 },
      { x: 0, y: 2 },
    ];
    expect(isSelfIntersecting(bowtie)).toBe(true);
    expect(isSelfIntersecting(rect(0, 0, 3, 3))).toBe(false);
  });

  it('fängt auf das Raster ohne Rundungsrauschen', () => {
    expect(snapToGrid({ x: 1.2345, y: -0.026 }, 0.05)).toEqual({ x: 1.25, y: -0.05 });
  });
});

describe('Zahlenformat', () => {
  it('liest deutsche und englische Dezimaltrenner', () => {
    expect(parseNum('3,25')).toBe(3.25);
    expect(parseNum(' 3.5 ')).toBe(3.5);
    expect(parseNum('abc')).toBeNull();
    // deutsche Schreibweise: Punkt als Tausendertrenner, Komma als Dezimalzeichen, Einheit erlaubt
    const tabelle: [string, number | null][] = [
      ['1.234,56', 1234.56],
      ['1.234', 1234],
      ['1.234.567', 1234567],
      ['3.25', 3.25],
      ['0.4', 0.4],
      ['0.400', 0.4],
      ['12,5 m²', 12.5],
      ['612,50m2', 612.5],
      ['40 %', 40],
      ['3,00 m', 3],
      ['-1,5', -1.5],
      ['1.23,4', null],
      ['1,2,3', null],
      ['1.2.3', null],
      ['4x', null],
    ];
    for (const [ein, aus] of tabelle) expect([ein, parseNum(ein)]).toEqual([ein, aus]);
    expect(fmt2(1234.5)).toBe('1.234,50');
  });
});

describe('DIN 277 / WoFlV', () => {
  function sampleProject() {
    const p = createProject('Test');
    const eg = p.storeys[0];
    eg.hoehe = 3;
    eg.shapes.push(createOutline(rect(0, 0, 10, 10))); // 100 m² BGF
    const hof = createOutline(rect(4, 4, 2, 2)); // 4 m² Abzug
    hof.subtract = true;
    eg.shapes.push(hof);
    const balkonBgf = createOutline(rect(10, 0, 2, 4)); // 8 m² BGF (S)
    balkonBgf.umschliessung = 'S';
    eg.shapes.push(balkonBgf);

    const wohnen = createRoom(rect(0.3, 0.3, 5, 4), '0.01', 'Wohnen'); // 20 m²
    wohnen.wofl = { kategorie: 'voll', wohnung: 'WE 1' };
    const flur = createRoom(rect(0.3, 5, 3, 2), '0.02', 'Flur'); // 6 m²
    flur.nutzung = 'VF';
    flur.wofl = { kategorie: 'voll', wohnung: 'WE 1' };
    const hzg = createRoom(rect(6, 6, 2, 2), '0.03', 'Heizung'); // 4 m²
    hzg.nutzung = 'TF';
    const balkon = createRoom(rect(10, 0, 2, 4), '0.04', 'Balkon'); // 8 m²
    balkon.umschliessung = 'S';
    balkon.wofl = { kategorie: 'freisitz', wohnung: 'WE 1' };
    eg.shapes.push(wohnen, flur, hzg, balkon);

    const og = createStorey('OG', 2.8);
    og.shapes.push(createOutline(rect(0, 0, 10, 10)));
    const schraege = createRoom(rect(0, 0, 10, 1), '1.01', 'Schräge');
    schraege.wofl = { kategorie: 'halb', wohnung: 'WE 2' };
    og.shapes.push(schraege);
    p.storeys.push(og);
    return p;
  }

  it('berechnet BGF, BRI, NRF und KGF je Geschoss', () => {
    const p = sampleProject();
    const r = computeStorey(p.storeys[0], p);
    expect(r.bgf.R).toBeCloseTo(96);
    expect(r.bgf.S).toBeCloseTo(8);
    expect(r.bgf.total).toBeCloseTo(104);
    expect(r.bri.total).toBeCloseTo(104 * 3);
    expect(r.nuf.total).toBeCloseTo(20 + 8);
    expect(r.nutzung.NUF1).toBeCloseTo(28);
    expect(r.tf.total).toBeCloseTo(4);
    expect(r.vf.total).toBeCloseTo(6);
    expect(r.nrf.R).toBeCloseTo(30);
    expect(r.nrf.S).toBeCloseTo(8);
    expect(r.kgf.R).toBeCloseTo(66);
    expect(r.kgf.S).toBeCloseTo(0);
  });

  it('berücksichtigt abweichende Höhen für den BRI', () => {
    const p = createProject();
    const o = createOutline(rect(0, 0, 5, 4));
    o.hoehe = 5.5;
    p.storeys[0].shapes.push(o);
    expect(computeStorey(p.storeys[0], p).bri.total).toBeCloseTo(110);
  });

  it('berechnet Wohnflächen mit Anrechnungsfaktoren je Wohnung', () => {
    const p = sampleProject();
    const r = computeProject(p);
    // WE 1: 20 + 6 + 8 × 0,25 = 28; WE 2: 10 × 0,5 = 5
    expect(r.wohnungen.map((w) => w.wohnung)).toEqual(['WE 1', 'WE 2']);
    expect(r.wohnungen[0].wofl).toBeCloseTo(28);
    expect(r.wohnungen[1].wofl).toBeCloseTo(5);
    expect(r.total.wofl).toBeCloseTo(33);
    expect(r.total.bgf.total).toBeCloseTo(204);
    expect(r.total.bri.total).toBeCloseTo(104 * 3 + 100 * 2.8);
  });

  it('begrenzt den Balkonfaktor auf höchstens 50 %', () => {
    const s = createProject().settings;
    expect(woflFaktor({ kategorie: 'freisitz', wohnung: '' }, s)).toBe(0.25);
    expect(woflFaktor({ kategorie: 'freisitz', faktor: 0.8, wohnung: '' }, s)).toBe(0.5);
  });
});

describe('Serialisierung', () => {
  it('speichert und lädt ein Projekt verlustfrei', () => {
    const p = createProject('Roundtrip');
    p.storeys[0].shapes.push(createRoom(rect(0, 0, 3, 4), '1', 'Küche'));
    const back = parseProject(serializeProject(p));
    expect(back).toEqual(JSON.parse(JSON.stringify(p)));
  });

  it('weist fremde Dateien ab und bereinigt ungültige Werte', () => {
    expect(() => parseProject('{"foo":1}')).toThrow();
    expect(() => parseProject('kein json')).toThrow();
    const p = parseProject(
      JSON.stringify({
        format: 'arch-flaechen-tool',
        version: 1,
        storeys: [{ name: 'EG', shapes: [{ kind: 'room', nutzung: 'XYZ', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }, { kind: 'room', points: [] }] }],
      }),
    );
    expect(p.storeys[0].shapes).toHaveLength(1);
    const s = p.storeys[0].shapes[0];
    expect(s.kind === 'room' && s.nutzung).toBe('NUF1');
  });
});

describe('Projektdaten', () => {
  it('übernimmt die Adresse früherer Versionen (Freitext) als Straße, PLZ, Ort', () => {
    const alt = (adresse: string) =>
      parseProject(JSON.stringify({ format: 'arch-flaechen-tool', version: 1, meta: { projektcode: 'HSA', adresse, bearbeiter: 'TP' }, storeys: [] })).meta;
    expect(alt('Lindenweg 7a, 59494 Soest').adresse).toEqual({ strasse: 'Lindenweg 7a', plz: '59494', ort: 'Soest' });
    expect(alt('59494 Soest').adresse).toEqual({ strasse: '', plz: '59494', ort: 'Soest' });
    expect(alt('Hauptstraße 1').adresse).toEqual({ strasse: 'Hauptstraße 1', plz: '', ort: '' });
    const m = alt('Lindenweg 7a, 59494 Soest');
    expect(m).toMatchObject({ projektcode: 'HSA', bearbeiter: 'TP', grundstueck: { gemarkung: '', flur: '', flurstueck: '' }, bauherr: { name: '', kontakte: [] } });
  });
  it('Vorhaben, Aktenzeichen und Vorname des Bauherrn bleiben erhalten (für PERMIO); fehlen sie, bleibt es wie bisher', () => {
    const roh = { format: 'arch-flaechen-tool', version: 1, meta: { projektcode: 'BS9', vorhaben: 'Neubau EFH', aktenzeichen: '63/123/26', bauherr: { name: 'Mustermann', vorname: 'Max' } }, storeys: [] };
    const m = parseProject(JSON.stringify(roh)).meta;
    expect(m).toMatchObject({ vorhaben: 'Neubau EFH', aktenzeichen: '63/123/26', bauherr: { name: 'Mustermann', vorname: 'Max' } });
    // erneut gespeichert und gelesen: unverändert
    expect(parseProject(serializeProject({ ...parseProject(JSON.stringify(roh)) })).meta).toEqual(m);
    const ohne = parseProject(JSON.stringify({ ...roh, meta: { projektcode: 'BS9' } })).meta;
    expect('vorhaben' in ohne || 'aktenzeichen' in ohne || 'vorname' in ohne.bauherr).toBe(false);
  });
});

describe('WoFlV-Vorschlag nach Geschossart (F-03)', () => {
  it('Kellergeschoss nach der Geschossart, nicht nur nach dem Namen', async () => {
    const { woflArt } = await import('./norms');
    expect(woflArt('Bad', { name: 'KG' }, 'NUF7')).toBe('keine');
    // Souterrainwohnung: Geschoss heißt „UG“, ist aber ausdrücklich kein Kellergeschoss
    expect(woflArt('Bad', { name: 'UG', keller: false }, 'NUF7')).toBe('wohnen');
    // ausdrücklich Kellergeschoss trotz neutralem Namen
    expect(woflArt('Hobby', { name: 'Ebene -1', keller: true }, 'NUF1')).toBe('keine');
    expect(woflArt('Bad', 'Kellergeschoss', 'NUF7')).toBe('keine');
  });
});

describe('Raumumschließung der Räume (FR-02)', () => {
  it('Balkonraum auf S-Umriss: NRF S 8, KGF S 0 – von Hand festgelegt bleibt', () => {
    const p = createProject();
    const eg = p.storeys[0];
    eg.shapes.push(createOutline(rect(0, 0, 12, 10)));
    eg.shapes.push({ ...createOutline(rect(12, 0, 2, 4), 'Balkon'), umschliessung: 'S' as const, hoehe: 1.1 });
    const balkon = createRoom(rect(12, 0, 2, 4), '0.05', 'Balkon');
    eg.shapes.push(balkon);
    const r = computeStorey(eg, p);
    expect(r.nrf.S).toBeCloseTo(8);
    expect(r.kgf.S).toBeCloseTo(0);
    expect(r.nrf.R).toBeCloseTo(0);
    expect(r.rooms[0].umschliessung).toBe('S');
    // von Hand R: bleibt R
    eg.shapes[2] = { ...balkon, rsVonHand: true };
    expect(computeStorey(eg, p).nrf.R).toBeCloseTo(8);
  });
});

describe('Abzugsflächen im Raum (FR-03)', () => {
  const szenario = (abzugArt?: 'wofl' | 'din') => {
    const p = createProject();
    const eg = p.storeys[0];
    const wohnen = createRoom(rectPoints({ x: 0, y: 0 }, { x: 9.4, y: 7.4 }), '0.01', 'Wohnen');
    wohnen.wofl = { kategorie: 'voll', wohnung: 'WE 01' };
    const abzug = { ...createRoom(rect(1, 1, 0.5, 0.5), '', abzugArt === 'wofl' ? 'Treppe' : 'Schornstein'), subtract: true, ...(abzugArt ? { abzugArt } : {}) };
    eg.shapes.push(wohnen, abzug);
    return computeStorey(eg, p);
  };
  it('Schornstein erbt die Anrechnung des Raums: NRF und Wohnfläche 69,31', () => {
    const r = szenario();
    expect(r.nrf.total).toBeCloseTo(69.31, 2);
    expect(r.wofl).toBeCloseTo(69.31, 2);
    expect(r.rooms[1].wohnung).toBe('WE 01');
  });
  it('„nur Wohnfläche“ (Treppe) lässt die NRF unverändert, „nur NRF“ die Wohnfläche', () => {
    const t = szenario('wofl');
    expect(t.nrf.total).toBeCloseTo(69.56, 2);
    expect(t.wofl).toBeCloseTo(69.31, 2);
    const d = szenario('din');
    expect(d.nrf.total).toBeCloseTo(69.31, 2);
    expect(d.wofl).toBeCloseTo(69.56, 2);
  });
});

describe('WoFlV-Vorschlag nach Raumname (FR-07)', () => {
  it('HWR zählt unabhängig von der Nutzungsgruppe, Treppenhaus nicht, Raum mit Treppe schon', async () => {
    const { woflArt, woflHinweis } = await import('./norms');
    expect(woflArt('HWR', 'EG', 'NUF1')).toBe('wohnen');
    expect(woflArt('HWR', 'EG', 'TF')).toBe('wohnen');
    expect(woflArt('Hauswirtschaft', 'EG', 'NUF7')).toBe('wohnen');
    expect(woflArt('Treppenhaus', 'EG', 'VF')).toBe('keine');
    expect(woflArt('Diele/Treppe', 'EG', 'VF')).toBe('wohnen');
    expect(woflHinweis('Diele/Treppe')).toMatch(/nur Wohnfläche/);
    expect(woflArt('Bad', { name: 'UG', keller: true }, 'NUF7')).toBe('keine');
    expect(woflArt('Bad', { name: 'UG', keller: false }, 'NUF7')).toBe('wohnen');
  });
});

describe('BRI von S-Umrissen (FR-10)', () => {
  it('ohne Körperhöhe keine Bodenplatte unter S; mit Körperhöhe 1,10 → BRI 8 × 1,10', () => {
    const p = createProject();
    const eg = p.storeys[0];
    eg.hoehe = 2.75;
    eg.sohle = 0.3;
    const balkon = { ...createOutline(rect(0, 0, 2, 4), 'Balkon'), umschliessung: 'S' as const };
    eg.shapes.push(balkon);
    expect(computeStorey(eg, p).bri.S).toBeCloseTo(8 * 2.75);
    eg.shapes[0] = { ...balkon, hoehe: 1.1 };
    expect(computeStorey(eg, p).bri.S).toBeCloseTo(8 * 1.1);
    // ausdrücklich mit Bodenplatte
    eg.shapes[0] = { ...balkon, hoehe: 1.1, sohleAnsetzen: true };
    expect(computeStorey(eg, p).bri.S).toBeCloseTo(8 * 1.1 + 8 * 0.3);
  });
});

describe('Raumteile nach lichter Höhe (FR-12)', () => {
  it('Wohnfläche = 1 · ≥ 2 m + ½ · 1–2 m, exakt', () => {
    const p = createProject();
    const r = createRoom(rect(0, 0, 4, 5), '1.01', 'Kind');
    r.wofl = { kategorie: 'hoehen', anteile: { h2: 0.5, h12: 0.3, h01: 0.2 }, wohnung: 'WE 01' };
    p.storeys[0].shapes.push(r);
    const s = computeStorey(p.storeys[0], p);
    expect(s.nrf.total).toBeCloseTo(20);
    expect(s.wofl).toBeCloseTo(10 + 3, 10);
  });
});

describe('Altberechnung nach II. BV (FR-21)', () => {
  it('Schalter aus: Ergebnisse unverändert; an: Balkon ohne eigenen Faktor zur Hälfte', () => {
    const p = createProject();
    const b = createRoom(rect(0, 0, 2, 4), '0.05', 'Balkon');
    b.wofl = { kategorie: 'freisitz', wohnung: 'WE 01' };
    p.storeys[0].shapes.push(b);
    const vorher = computeProject(p).total.wofl;
    expect(computeProject({ ...p, settings: { ...p.settings, zweiteBV: false } }).total.wofl).toBe(vorher);
    expect(vorher).toBeCloseTo(2);
    expect(computeProject({ ...p, settings: { ...p.settings, zweiteBV: true } }).total.wofl).toBeCloseTo(4);
  });
});

describe('Projektformat: neue Felder (Block 2)', () => {
  it('Rundlauf Speichern/Laden, alte Dateien ohne die Felder bleiben gültig', () => {
    const p = createProject();
    const eg = p.storeys[0];
    eg.dachaufbau = 0.3;
    eg.fussbodenaufbau = 0.12;
    const r = createRoom(rect(0, 0, 4, 5), '1.01', 'Kind');
    r.rsVonHand = true;
    r.nutzungsart = '1.1';
    r.katalog = 'Kinderzimmer';
    r.stempel = { x: 1, y: 2 };
    r.wofl = { kategorie: 'hoehen', anteile: { h2: 0.5, h12: 0.3, h01: 0.2 }, wohnung: 'WE 01' };
    const a = { ...createRoom(rect(1, 1, 0.5, 0.5), '', 'Schornstein'), subtract: true, abzugArt: 'din' as const };
    const o = { ...createOutline(rect(0, 0, 6, 6)), umschliessung: 'S' as const, sohleAnsetzen: true, pruefen: true, stempel: { x: 0.5, y: 0.5 } };
    eg.shapes.push(o, r, a);
    p.settings.massgrundlage = 'rohbau';
    p.settings.zweiteBV = true;
    p.settings.planunterlagen = 'Grundrisse 1:100';
    o.ueberdeckt = true;
    const terrasse = { ...createRoom(rect(0, 7, 3, 3), '0.09', 'Terrasse'), ausserhalbBgf: true };
    eg.shapes.push(terrasse);
    const q = parseProject(serializeProject(p));
    expect(q.storeys[0].shapes[0]).toMatchObject({ ueberdeckt: true });
    expect(q.storeys[0].shapes[3]).toMatchObject({ ausserhalbBgf: true });
    expect(q.settings.planunterlagen).toBe('Grundrisse 1:100');
    expect(q.storeys[0]).toMatchObject({ dachaufbau: 0.3, fussbodenaufbau: 0.12 });
    expect(q.storeys[0].shapes[0]).toMatchObject({ sohleAnsetzen: true, pruefen: true, stempel: { x: 0.5, y: 0.5 } });
    expect(q.storeys[0].shapes[1]).toMatchObject({ rsVonHand: true, nutzungsart: '1.1', katalog: 'Kinderzimmer', stempel: { x: 1, y: 2 }, wofl: { kategorie: 'hoehen', anteile: { h2: 0.5, h12: 0.3 } } });
    expect(q.storeys[0].shapes[2]).toMatchObject({ abzugArt: 'din' });
    expect(q.settings).toMatchObject({ massgrundlage: 'rohbau', zweiteBV: true });
    const alt = parseProject(JSON.stringify({ format: 'arch-flaechen-tool', version: 1, storeys: [{ name: 'EG', hoehe: 3, shapes: [{ kind: 'room', name: 'Bad', nummer: '1', points: rect(0, 0, 2, 2), wofl: { kategorie: 'voll', wohnung: '' } }] }] }));
    const raum = alt.storeys[0].shapes[0];
    expect(raum.kind === 'room' && [raum.rsVonHand, raum.abzugArt, raum.nutzungsart, raum.katalog, raum.stempel, raum.wofl.anteile]).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
  });
});

describe('Projekteinstellungen aus der Datei', () => {
  const laden = (settings: unknown) => parseProject(JSON.stringify({ format: 'arch-flaechen-tool', version: 1, settings, storeys: [{ name: 'EG', hoehe: 3, shapes: [] }] })).settings;

  it('ungültige Werte fallen auf die Vorgabe zurück bzw. entfallen; unbekannte Felder bleiben', () => {
    expect(laden({ freisitzFaktor: null, gridStep: 0 })).toMatchObject({ freisitzFaktor: 0.25, gridStep: 0.05 });
    expect(laden({ freisitzFaktor: '0,25', gridStep: null })).toMatchObject({ freisitzFaktor: 0.25, gridStep: 0.05 });
    expect(laden({ freisitzFaktor: 0.8, gridStep: -1 })).toMatchObject({ freisitzFaktor: 0.25, gridStep: 0.05 });
    expect(laden({ freisitzFaktor: 0.5, gridStep: 0.01 })).toMatchObject({ freisitzFaktor: 0.5, gridStep: 0.01 });
    const s = laden({ massgrundlage: 'gibts-nicht', zweiteBV: 'ja', bericht: 3, andereApp: { x: 1 } });
    expect(['massgrundlage' in s, 'zweiteBV' in s, 'bericht' in s]).toEqual([false, false, false]);
    expect((s as unknown as Record<string, unknown>).andereApp).toEqual({ x: 1 });
    expect(laden(undefined)).toEqual(createProject().settings);
  });

  it('Kontrollmaße: nur vollständige Einträge mit endlichen Zahlen', () => {
    const s = laden({ kontrollmasse: { a: { soll: 8, ist: 8.01, abweichung: 0.00125, massstab: 0.01 }, b: { soll: 8, ist: null, abweichung: 0 }, c: 'x', d: { soll: 5, ist: 5, abweichung: 0, massstab: 0 } } });
    expect(s.kontrollmasse).toEqual({ a: { soll: 8, ist: 8.01, abweichung: 0.00125, massstab: 0.01 }, d: { soll: 5, ist: 5, abweichung: 0 } });
  });

  it('Raster ohne gültige Schrittweite rundet nicht (keine NaN-Koordinaten)', async () => {
    const { roundTo } = await import('./geometry');
    expect(roundTo(1.234, 0)).toBe(1.234);
    expect(roundTo(1.234, NaN)).toBe(1.234);
    expect(roundTo(1.234, 0.05)).toBe(1.25);
  });
});

describe('Nutzungsart als zweite Ebene (F-14)', () => {
  it('Nutzungsart 7.1 summiert in NUF 7; ohne Nutzungsart wie bisher', () => {
    const p = createProject();
    const bad = createRoom(rect(0, 0, 2, 3), '0.01', 'Bad');
    bad.nutzungsart = '7.1';
    const wohnen = createRoom(rect(2, 0, 4, 3), '0.02', 'Wohnen');
    p.storeys[0].shapes.push(bad, wohnen);
    const r = computeStorey(p.storeys[0], p);
    expect(r.nutzung.NUF7).toBeCloseTo(6);
    expect(r.nutzung.NUF1).toBeCloseTo(12);
    expect(r.rooms[0].nutzung).toBe('NUF7');
  });
});

describe('Einlesen: Grundstücksfläche', () => {
  it('verwirft 0 und negative Werte (Gegenprobe: positive Fläche bleibt)', () => {
    const mit = (flaeche: unknown) => {
      const p = createProject('T');
      const roh = JSON.parse(serializeProject(p));
      roh.meta.grundstueck.flaeche = flaeche;
      return parseProject(JSON.stringify(roh)).meta.grundstueck.flaeche;
    };
    expect(mit(0)).toBeUndefined();
    expect(mit(-100)).toBeUndefined();
    expect(mit(612.5)).toBe(612.5);
  });
});
