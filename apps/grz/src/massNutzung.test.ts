import { describe, expect, it } from 'vitest';
import { rectPoints } from '@core/geometry';
import type { LageplanFlaeche, Project, Storey } from '@core/model';
import { createLageplanFlaeche, createOutline, createProject, createRoom, createStorey } from '@core/model';
import { anrechnung, massNachweis, recht } from './massNutzung';

/** Haus wie HSA: UG (Keller), EG, OG je 11,25 × 12 m, DG unter Walmdach 45° ab Fußboden; Grundstück 612,50 m² */
function haus(planDatum?: string): Project {
  const p = createProject('Test');
  const rect = rectPoints({ x: 0, y: 0 }, { x: 12, y: 11.25 });
  const st = (name: string, e: number, h: number) => {
    const s: Storey = { ...createStorey(name, h), elevation: e };
    s.shapes.push(createOutline(rect));
    return s;
  };
  const ug = st('UG', -2.5, 2.5);
  const eg = st('EG', 0, 3.45);
  const og = st('OG', 3.45, 3.2);
  const dg = st('DG', 6.65, 3);
  const dgO = dg.shapes[0];
  if (dgO.kind === 'outline') dgO.dach = { typ: 'walm', traufhoehe: 0, neigung: 45, neigungWalm: 45, firstrichtung: 0 };
  // Aufenthaltsräume im DG (Zimmer mittig) und ein Abstellraum
  dg.shapes.push(createRoom(rectPoints({ x: 3, y: 3 }, { x: 9, y: 8.25 }), '1', 'Zimmer I'), createRoom(rectPoints({ x: 1, y: 1 }, { x: 2, y: 2 }), '2', 'Abstellraum'));
  p.storeys = [ug, eg, og, dg];
  p.meta.grundstueck.flaeche = 612.5;
  p.massNutzung = { planDatum, grz: 0.4, gfz: 0.8, vollgeschosseMax: 2, gelaende: -0.2 };
  return p;
}

function lageplan(p: Project, ...f: LageplanFlaeche[]) {
  p.lageplan = { flaechen: [...(p.lageplan?.flaechen ?? []), ...f] };
}

const flaeche = (x0: number, y0: number, x1: number, y1: number, patch: Partial<LageplanFlaeche>): LageplanFlaeche => ({ ...createLageplanFlaeche(rectPoints({ x: x0, y: y0 }, { x: x1, y: y1 })), ...patch });

describe('Maß der baulichen Nutzung: anzuwendendes Recht', () => {
  it('wählt BauNVO und Bauordnung nach dem Plandatum', () => {
    expect(recht({ planDatum: '1967-03-14' })).toMatchObject({ baunvo: '1962', bauo: 'nw1962', ausDatum: true });
    expect(recht({ planDatum: '1978-06-01' })).toMatchObject({ baunvo: '1968', bauo: 'nw1962' });
    expect(recht({ planDatum: '1989-05-01' })).toMatchObject({ baunvo: '1968', bauo: 'nw1985' });
    expect(recht({ planDatum: '1990-01-27' })).toMatchObject({ baunvo: '1990', bauo: 'nw1985' });
    expect(recht({ planDatum: '2019-01-01' })).toMatchObject({ baunvo: '1990', bauo: 'nrw2019' });
    expect(recht({})).toMatchObject({ baunvo: '1990', bauo: 'nrw2019', ausDatum: false });
    expect(recht({ planDatum: '1967-03-14', baunvo: '1990' })).toMatchObject({ baunvo: '1990', bauo: 'nw1962', ausDatum: false });
  });

  it('Anrechnung je Fassung, offene Fälle über die Einstufung', () => {
    expect(anrechnung('garage', '1962')).toBe('hauptanlage');
    expect(anrechnung('garage', '1968')).toBe('garage01');
    expect(anrechnung('terrasse', '1968')).toBe('nein');
    expect(anrechnung('zufahrt', '1990')).toBe('grz2');
    expect(anrechnung('terrasse', '1990')).toBe('pruefen');
    expect(anrechnung('terrasse', '1990', { terrasse: 'ja' })).toBe('grz2');
    expect(anrechnung('zufahrt', '1962', { zufahrt: 'nein' })).toBe('nein');
    expect(anrechnung('garten', '1962', { garten: 'ja' })).toBe('nein');
  });
});

describe('Maß der baulichen Nutzung: Nachweis', () => {
  it('heutiges Recht: GRZ I/II, Vollgeschosse EG und OG, GFZ ohne DG', () => {
    const p = haus('2020-05-01');
    lageplan(
      p,
      flaeche(12, 0, 15, 10, { name: 'Zufahrt', nutzung: 'zufahrt', versiegelung: 'teil', hoehe: -0.2 }),
      flaeche(-3, 0, 0, 5, { name: 'Terrasse', nutzung: 'terrasse', versiegelung: 'voll', hoehe: -0.2 }),
    );
    const n = massNachweis(p);
    const A = 12 * 11.25;
    expect(n.recht).toMatchObject({ baunvo: '1990', bauo: 'nrw2019' });
    expect(n.hauptanlage).toBeCloseTo(A, 6); // Überdeckung, nicht Summe der Geschosse
    expect(n.grz.wert).toBeCloseTo(A / 612.5, 6);
    expect(n.grz.status).toBe('ok');
    expect(n.grz2!.wert).toBeCloseTo((A + 30) / 612.5, 6);
    expect(n.grz2!.mitOffenen).toBeCloseTo((A + 30 + 15) / 612.5, 6);
    expect(n.grz2!.zulaessig).toBeCloseTo(0.6, 9);
    expect(n.geschosse.map((g) => [g.name, g.vollgeschoss])).toEqual([
      ['UG', false],
      ['EG', true],
      ['OG', true],
      ['DG', false],
    ]);
    expect(n.geschosse[0].oberirdisch).toBe(false);
    expect(n.vollgeschosse).toMatchObject({ anzahl: 2, status: 'ok' });
    expect(n.gf).toBeCloseTo(2 * A, 6);
    expect(n.gfz.wert).toBeCloseTo((2 * A) / 612.5, 6);
  });

  it('Plan von 1967: Aufenthaltsräume im DG zählen zur GF (mit Wandzuschlag), Abstellraum nicht', () => {
    const n = massNachweis(haus('1967-03-14'));
    expect(n.recht).toMatchObject({ baunvo: '1962', bauo: 'nw1962' });
    const dg = n.gfJeGeschoss.find((g) => g.name === 'DG')!;
    expect(dg.art).toBe('aufenthalt');
    // Zimmer 6 × 5,25 m, um 0,25 m erweitert (Ecken gerundet)
    expect(dg.flaeche).toBeCloseTo(6.5 * 5.75 - (4 - Math.PI) * 0.25 ** 2, 0);
    expect(n.gf).toBeCloseTo(2 * 12 * 11.25 + dg.flaeche, 6);
  });

  it('BauO NW 1962: Vollgeschoss im Dachraum ab zwei Dritteln der eigenen Grundfläche mit 2,30 m', () => {
    const p = haus('1967-03-14');
    const dg = p.storeys[3].shapes[0];
    // flaches Dach mit Kniestock 3,00 m: überall hoch genug
    if (dg.kind === 'outline') dg.dach = { typ: 'flach', traufhoehe: 3, neigung: 0 };
    expect(massNachweis(p).geschosse.find((g) => g.name === 'DG')!.vollgeschoss).toBe(true);
  });

  it('BauO NW 1984–2018: Höhe bis OK Dachhaut über mehr als drei Viertel der eigenen Grundfläche', () => {
    const p = haus('1995-01-01');
    const dg = p.storeys[3].shapes[0];
    // Satteldach mit hohem Kniestock: 2,30 m bis Dachhaut auf fast der ganzen Fläche
    if (dg.kind === 'outline') dg.dach = { typ: 'sattel', traufhoehe: 2.2, neigung: 40, firstrichtung: 0 };
    const pr = massNachweis(p).geschosse.find((g) => g.name === 'DG')!;
    expect(pr.licht).toBe(false);
    expect(pr.bezug).toBe('eigene');
    expect(pr.anteilSoll).toBe(0.75);
    // Höhe ≥ 2,30 ab 0,1/tan40 ≈ 0,12 m von der Traufe: Anteil ≈ 1 − 2·0,12/11,25
    expect(pr.anteil).toBeGreaterThan(0.97);
    expect(pr.vollgeschoss).toBe(true);
  });

  it('BauNVO 1968/77: Garagen bis 0,1 der Grundstücksfläche anrechnungsfrei, Terrassen nicht', () => {
    const p = haus('1978-06-01');
    lageplan(p, flaeche(12, 0, 15, 6, { nutzung: 'garage' }), flaeche(-3, 0, 0, 5, { nutzung: 'terrasse' }));
    const n = massNachweis(p);
    expect(n.garagenFrei).toBeCloseTo(18, 6);
    expect(n.grz.wert).toBeCloseTo((12 * 11.25) / 612.5, 6);
    expect(n.grz2).toBeUndefined();
    // Überschreitet die Garage 0,1 · G, zählt der Rest
    p.meta.grundstueck.flaeche = 150;
    const n2 = massNachweis(p);
    expect(n2.garagenFrei).toBeCloseTo(15, 6);
    expect(n2.grz.wert).toBeCloseTo((12 * 11.25 + 3) / 150, 6);
  });

  it('Grundstück, Geländehöhe und Flächenbilanz aus den Lageplan-Flächen', () => {
    const p = haus();
    p.meta.grundstueck.flaeche = undefined;
    delete p.massNutzung!.gelaende;
    lageplan(
      p,
      flaeche(-5, -5, 17, 0, { nutzung: 'garten', versiegelung: 'gruen', hoehe: -0.3 }),
      flaeche(-5, 11.25, 17, 16, { nutzung: 'garten', versiegelung: 'gruen', hoehe: -0.3 }),
      flaeche(-5, 0, 0, 11.25, { nutzung: 'terrasse', versiegelung: 'voll', hoehe: -0.1 }),
      flaeche(12, 0, 17, 11.25, { nutzung: 'zufahrt', versiegelung: 'teil', hoehe: -0.1 }),
      // Nachbar: zählt nicht
      flaeche(17, -5, 40, 16, { nutzung: 'garten', versiegelung: 'gruen', nachbar: true, hoehe: 0 }),
    );
    const n = massNachweis(p);
    const G = 22 * 21;
    expect(n.grundstueck).toMatchObject({ quelle: 'lageplan' });
    expect(n.grundstueck.flaeche).toBeCloseTo(G, 6);
    expect(n.gelaende.quelle).toBe('lageplan');
    expect(n.gelaende.hoehe).toBeGreaterThan(-0.3);
    expect(n.gelaende.hoehe).toBeLessThan(-0.1);
    expect(n.bilanz.gebaeude).toBeCloseTo(135, 6);
    expect(n.bilanz.voll).toBeCloseTo(5 * 11.25, 6);
    expect(n.bilanz.teil).toBeCloseTo(5 * 11.25, 6);
    expect(n.bilanz.gruen).toBeCloseTo(2 * 22 * 5 - 22 * 0.25, 6);
    expect(n.bilanz.summe).toBeCloseTo(G, 6);
    expect(n.bilanz.differenz).toBeCloseTo(0, 6);
    expect(n.lageplan.find((x) => x.nachbar)!.anrechnung).toBe('nein');
  });

  it('Übersteuerung je Geschoss', () => {
    const p = haus('2020-01-01');
    p.storeys[3].vollgeschoss = true;
    const n = massNachweis(p);
    expect(n.vollgeschosse).toMatchObject({ anzahl: 3, status: 'ueberschritten' });
    expect(n.geschosse[3].automatisch).toBe(false);
  });
});

describe('Maß der baulichen Nutzung: Speichern', () => {
  it('Festsetzungen, Lageplan und Kennzeichen überstehen JSON und Archiv; der Nachweis bleibt gleich', async () => {
    const { parseProject, serializeProject } = await import('@core/serialize');
    const { readProjectFile, writeArchive } = await import('@core/archive');
    const p = haus('1967-03-14');
    p.massNutzung = {
      ...p.massNutzung,
      einfamilienhaus: true,
      wandzuschlag: 0.3,
      einstufung: { terrasse: 'nein', zufahrt: 'grz1' },
      gebietsart: 'WA',
      stand: '2026-11-11',
      grAbsolut: 120,
      gfAbsolut: 300,
      bmz: 2.4,
      vollgeschosseMin: 1,
      vollgeschosseZwingend: true,
      traufhoeheMax: 6.5,
      firsthoeheMax: 10,
      aufenthaltNichtVollgeschoss: true,
      variante: 'B',
    };
    const eg = p.storeys[1].shapes[0];
    if (eg.kind === 'outline') eg.anlage = 'garage';
    p.lageplan = {
      flaechen: [{ ...flaeche(12, 0, 15, 10, { name: 'Carport', nutzung: 'garage' }), variante: 'B' }],
      grenze: [{ id: 'g1', name: 'Flurstück 12', points: rectPoints({ x: -5, y: -5 }, { x: 20, y: 20 }) }],
      unterlage: { type: 'raster', name: 'Lageplan.png', dataUrl: 'data:image/png;base64,AAAA', widthPx: 800, heightPx: 600, metersPerPixel: 0.05, x: -10, y: -8, opacity: 0.5, visible: true },
    };
    p.storeys[1].vollgeschoss = true;
    const zimmer = p.storeys[3].shapes.find((s) => s.kind === 'room')!;
    if (zimmer.kind === 'room') zimmer.aufenthalt = 'treppe';
    lageplan(p, flaeche(12, 0, 15, 10, { name: 'Zufahrt', nutzung: 'zufahrt', versiegelung: 'teil', hoehe: -0.2, nachbar: true }));
    for (const back of [parseProject(serializeProject(p)), readProjectFile(writeArchive(p))]) {
      expect(back.massNutzung).toEqual(p.massNutzung);
      expect(back.lageplan).toEqual(p.lageplan);
      expect(back.storeys[1].shapes[0]).toMatchObject({ anlage: 'garage' });
      expect(back.storeys[1].vollgeschoss).toBe(true);
      expect(back.storeys[3].shapes.find((s) => s.kind === 'room')).toMatchObject({ aufenthalt: 'treppe' });
      expect(massNachweis(back)).toEqual(massNachweis(p));
    }
  });
});

describe('Überlagerungen, Gelände am Hang, Split-Level', () => {
  it('überlagernde Lageplan-Flächen zählen nur einmal – mit der stärkeren Anrechnung', () => {
    const p = haus('2020-01-01');
    // Zufahrt (GRZ II) 20 m², darauf ein Stellplatz (GRZ II) und eine Grünfläche, die zur Hälfte darunter liegt
    lageplan(
      p,
      flaeche(12, 0, 16, 5, { name: 'Zufahrt', nutzung: 'zufahrt', versiegelung: 'teil' }),
      flaeche(12, 0, 14, 5, { name: 'Stellplatz', nutzung: 'stellplatz', versiegelung: 'voll' }),
      flaeche(14, 0, 18, 5, { name: 'Garten', nutzung: 'garten', versiegelung: 'gruen' }),
    );
    const n = massNachweis(p);
    const summe = n.lageplan.reduce((a, l) => a + l.flaecheEindeutig, 0);
    // Vereinigung 6 × 5 = 30 m², obwohl die Einzelflächen 20 + 10 + 20 = 50 m² haben
    expect(summe).toBeCloseTo(30, 6);
    const garten = n.lageplan.find((l) => l.name === 'Garten')!;
    expect(garten.flaecheEindeutig).toBeCloseTo(10, 6);
    expect(garten.ueberlagert).toBeCloseTo(10, 6);
    expect(n.ueberlagerungen.length).toBeGreaterThan(0);
    expect(n.grz2!.wert! * 612.5).toBeCloseTo(135 + 20, 6);
  });

  it('Hanglage: Gelände je Geschoss entlang der Außenwände aus den Lageplan-Flächen', () => {
    const p = haus('2020-01-01');
    delete p.massNutzung!.gelaende;
    // talseitig (y < 0) liegt das Gelände bei −2,5, bergseitig (y > 11,25) bei 0,0; seitlich gestaffelt
    lageplan(
      p,
      flaeche(-5, -5, 17, 0, { name: 'Tal', hoehe: -2.5 }),
      flaeche(-5, 11.25, 17, 16, { name: 'Berg', hoehe: 0 }),
      flaeche(-5, 0, 0, 11.25, { name: 'West', hoehe: -1.25 }),
      flaeche(12, 0, 17, 11.25, { name: 'Ost', hoehe: -1.25 }),
    );
    const n = massNachweis(p);
    const ug = n.geschosse.find((g) => g.name === 'UG')!;
    expect(ug.gelaende.min).toBeCloseTo(-2.5, 6);
    expect(ug.gelaende.max).toBeCloseTo(0, 6);
    // Mittel längengewichtet: 12 m × −2,5 + 12 m × 0 + 2 × 11,25 m × −1,25 → ≈ −1,25
    expect(ug.gelaende.mittel).toBeCloseTo(-1.25, 1);
    // UG-Decke (±0,00) im Mittel 1,25 m über Gelände → kein oberirdisches Geschoss (≤ 1,60 m)
    expect(ug.oberirdisch).toBe(false);
  });

  it('BauO NW 1962: „vollständig über der Geländeoberfläche“ gilt am höchsten Geländepunkt', () => {
    const p = haus('1967-03-14');
    delete p.massNutzung!.gelaende;
    // Gelände rundum −0,2, nur bergseitig +0,3 über dem EG-Fußboden
    lageplan(
      p,
      flaeche(-5, -5, 17, 0, { hoehe: -0.2 }),
      flaeche(-5, 11.25, 17, 16, { hoehe: 0.3 }),
      flaeche(-5, 0, 0, 11.25, { hoehe: -0.2 }),
      flaeche(12, 0, 17, 11.25, { hoehe: -0.2 }),
    );
    const eg = massNachweis(p).geschosse.find((g) => g.name === 'EG')!;
    // nicht vollständig über dem Gelände → wie ein Kellergeschoss: zählt, weil es im Mittel mehr als 1,40 m herausragt
    expect(eg.oberirdisch).toBe(false);
    expect(eg.begruendung).toContain('Kellergeschoss ragt im Mittel');
    expect(eg.vollgeschoss).toBe(true);
  });

  it('tiefer liegender Raum (Split-Level) zählt mit größerer lichter Höhe', () => {
    const p = haus('1967-03-14');
    const dg = p.storeys.find((s) => s.name === 'DG')!;
    const zimmer = dg.shapes.find((s) => s.name === 'Zimmer I')!;
    const vorher = massNachweis(p).raeume.find((r) => r.name.includes('Zimmer I'))!.anteil;
    // unveränderlich ändern wie in der App (die Berechnung hält Zwischenergebnisse je Geschoss-Objekt)
    const p2 = { ...p, storeys: p.storeys.map((s) => (s === dg ? { ...dg, shapes: dg.shapes.map((x) => (x === zimmer ? { ...x, versatz: -0.6 } : x)) } : s)) };
    const nachher = massNachweis(p2).raeume.find((r) => r.name.includes('Zimmer I'))!;
    expect(nachher.anteil).toBeGreaterThanOrEqual(vorher);
    expect(nachher.maxHoehe).toBeGreaterThan(5.3);
  });

  it('Aufenthaltsraum ohne die geforderte lichte Höhe wird nicht als solcher vorgeschlagen', () => {
    const p = haus('1967-03-14');
    const dg = p.storeys.find((s) => s.name === 'DG')!;
    // schmaler Raum am Rand unter der Dachschräge: kaum lichte Höhe
    dg.shapes.push(createRoom(rectPoints({ x: 0.2, y: 4 }, { x: 1.2, y: 7 }), '3', 'Kinderzimmer'));
    const r = massNachweis(p).raeume.find((x) => x.name.includes('Kinderzimmer'))!;
    expect(r.nachName).toBe('ja');
    expect(r.erfuellt).toBe(false);
    expect(r.ergebnis).toBe('nein');
  });
});

describe('Gelände aus dem 3D-Modell', () => {
  it('Hanglage aus dem Geländemodell: Gelände je Geschoss aus dem Höhenfeld, Mittel entlang der Wände', () => {
    const p = haus('2020-01-01');
    delete p.massNutzung!.gelaende;
    // Gelände fällt in y-Richtung von 0,0 (y = 11,25) auf −3,0 (y = 0) und weiter
    const z = (y: number) => -3 + (3 * y) / 11.25;
    const tri: number[] = [];
    for (let x = -10; x < 22; x += 2)
      for (let y = -10; y < 22; y += 2) tri.push(x, y, z(y), x + 2, y, z(y), x + 2, y + 2, z(y + 2), x, y, z(y), x + 2, y + 2, z(y + 2), x, y + 2, z(y + 2));
    p.gelaendeModell = { name: 'IFC-Gelände', triangles: tri };
    const n = massNachweis(p);
    const ug = n.geschosse.find((g) => g.name === 'UG')!;
    expect(ug.gelaende.quelle).toBe('modell');
    // Mittel entlang der Wände ≈ −1,5 (Gefälle über die Hauslänge), tiefster Punkt talseitig
    expect(ug.gelaende.mittel).toBeCloseTo(-1.5, 1);
    expect(ug.gelaende.min).toBeLessThan(-3);
    // UG-Decke ±0,00 im Mittel 1,5 m über Gelände → nicht oberirdisch (≤ 1,60 m)
    expect(ug.oberirdisch).toBe(false);
  });
});

describe('Lageplan: Kopieren und Pfeiltasten', () => {
  it('Duplizieren und Verschieben mit Pfeiltasten (ein Undo-Schritt)', async () => {
    const { auswahlVerschieben, flaechenDuplizieren, useGrz } = await import('./store');
    const p = haus();
    lageplan(p, { ...flaeche(12, 0, 16, 5, { name: 'Zufahrt', nutzung: 'zufahrt' }), ifcId: 'G-1' });
    useGrz.getState().load(p);
    const id = p.lageplan!.flaechen[0].id;
    useGrz.getState().select(id);
    expect(flaechenDuplizieren()).toBe(1);
    const fl = useGrz.getState().project.lageplan!.flaechen;
    expect(fl).toHaveLength(2);
    expect(fl[1].ifcId).toBeUndefined();
    expect(fl[1].points[0]).toEqual({ x: 12.5, y: 0.5 });
    const schritte = useGrz.getState().past.length;
    auswahlVerschieben(0.1, 0);
    auswahlVerschieben(0.1, 0);
    expect(useGrz.getState().project.lageplan!.flaechen[1].points[0].x).toBeCloseTo(12.7, 9);
    expect(useGrz.getState().past.length).toBe(schritte + 1);
  });
});

describe('Anzeige der Kennzahlen (G-02, G-03)', () => {
  it('nahe am Grenzwert vier Stellen und Begründung in m², sonst drei Stellen', async () => {
    const { flaechenVergleich, kennzahlText } = await import('./texte');
    expect(kennzahlText(0.5017, 0.5)).toBe('0,5017');
    expect(kennzahlText(0.4003, 0.4)).toBe('0,4003');
    expect(kennzahlText(0.18, 0.4)).toBe('0,180');
    expect(kennzahlText(0.18)).toBe('0,180');
    // nie gleich aussehend wie der Grenzwert
    expect(kennzahlText(0.400001, 0.4)).toBe('0,400001');
    const p = haus('1967-03-14');
    p.massNutzung = { ...p.massNutzung, gfz: 0.5 };
    p.meta.grundstueck.flaeche = 400;
    const n = massNachweis(p);
    expect(n.gfz.status).toBe('ueberschritten');
    expect(flaechenVergleich('GF', n.gfz)).toMatch(/^GF \d+,\d\d m² > 200,00 m² zulässig$/);
  });

  it('ohne Grundstücksfläche: Grundfläche aus der Rechnung, Kennzahl nicht berechnet, keine Ampel „eingehalten“', () => {
    const p = createProject('IFC');
    const eg: Storey = { ...createStorey('EG', 3), elevation: 0, shapes: [createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 }))] };
    const og: Storey = { ...createStorey('OG', 3), elevation: 3, shapes: [createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 }))] };
    p.storeys = [eg, og];
    p.massNutzung = { grz: 0.4, gfz: 0.8, gelaende: -0.2 };
    const n = massNachweis(p);
    expect(n.grz.flaeche).toBeCloseTo(80, 6);
    expect(n.gfz.flaeche).toBeCloseTo(160, 6);
    expect(n.grz.wert).toBeUndefined();
    expect(n.grz.status).toBe('fehlt');
    expect(n.grz2!.status).toBe('fehlt');
    const h = n.hinweise.find((x) => x.feld === 'grundstueck')!;
    expect(h.tipp).toContain('„Grundstücksfläche [m²]“ in den Festsetzungen');
  });
});

describe('Angerechnete Fläche und Hinweise (G-04, G-09)', () => {
  it('Terrasse „zählt nicht“ hat angerechnet 0, Summe der angerechneten Flächen = Kennzahl', () => {
    const p = haus('1978-06-01');
    lageplan(p, flaeche(12, 0, 15, 6, { name: 'Garage', nutzung: 'garage' }), flaeche(-3, 0, 0, 5, { name: 'Terrasse', nutzung: 'terrasse' }));
    p.meta.grundstueck.flaeche = 150;
    const n = massNachweis(p);
    const t = n.lageplan.find((l) => l.name === 'Terrasse')!;
    expect(t.anrechnung).toBe('nein');
    expect(t.angerechnet).toBe(0);
    // Garage 18 m², davon 15 m² frei → 3 m² angerechnet
    expect(n.lageplan.find((l) => l.name === 'Garage')!.angerechnet).toBeCloseTo(3, 6);
    expect(n.hauptanlage + n.lageplan.reduce((a, l) => a + l.angerechnet, 0)).toBeCloseTo(n.grz.flaeche, 9);
    // BauNVO 1990: Zufahrt auf die GR II, „prüfen“ als Spanne
    const q = haus('2020-05-01');
    lageplan(q, flaeche(12, 0, 15, 10, { name: 'Zufahrt', nutzung: 'zufahrt' }), flaeche(-3, 0, 0, 5, { name: 'Terrasse', nutzung: 'terrasse' }));
    const m = massNachweis(q);
    const ter = m.lageplan.find((l) => l.name === 'Terrasse')!;
    expect(ter.angerechnet).toBe(0);
    expect(ter.angerechnetBis).toBeCloseTo(15, 6);
    const unter = m.unterirdisch?.angerechnet ?? 0;
    expect(m.hauptanlage + m.lageplan.reduce((a, l) => a + l.angerechnet, 0) + unter).toBeCloseTo(m.grz2!.flaeche, 9);
  });

  it('„Gelände unbekannt“ ist ein Bedienhinweis und fehlt im Nachweis für die Bauaufsicht', async () => {
    const { sachlicheHinweise } = await import('./massNutzung');
    const p = haus('2020-05-01');
    delete p.massNutzung!.gelaende;
    const n = massNachweis(p);
    const h = n.hinweise.find((x) => x.text.startsWith('Geländeoberfläche unbekannt'))!;
    expect(h.art).toBe('bedienung');
    expect(sachlicheHinweise(n).some((t) => t.startsWith('Geländeoberfläche'))).toBe(false);
    // Recht steht in den Grundlagen, nicht noch einmal in den Hinweisen
    expect(n.hinweise.some((x) => x.text.startsWith('Ohne Plandatum'))).toBe(false);
  });
});

describe('Fachliche Lücken (G-26) und Grundstücksgrenze (G-22)', () => {
  it('Terrasse 1990 mit Einstufung „GRZ I“ zählt zur GR statt zur GR II', () => {
    const p = haus('2020-05-01');
    lageplan(p, flaeche(-3, 0, 0, 5, { name: 'Terrasse', nutzung: 'terrasse' }));
    p.massNutzung = { ...p.massNutzung, einstufung: { terrasse: 'grz1' } };
    const n = massNachweis(p);
    expect(n.grz.flaeche).toBeCloseTo(135 + 15, 6);
    expect(n.grz2!.flaeche).toBeCloseTo(135 + 15, 6);
    p.massNutzung = { ...p.massNutzung, einstufung: { terrasse: 'ja' } };
    const m = massNachweis(p);
    expect(m.grz.flaeche).toBeCloseTo(135, 6);
    expect(m.grz2!.flaeche).toBeCloseTo(150, 6);
  });

  it('angebaute Garage aus der IFC als Anlage: zählt zur GRZ II, nicht zur Hauptanlage', () => {
    const p = haus('2020-05-01');
    const garage = createOutline(rectPoints({ x: 12, y: 0 }, { x: 15, y: 6 }), 'Garage');
    garage.anlage = 'garage';
    p.storeys[1].shapes.push(garage);
    const n = massNachweis(p);
    expect(n.hauptanlage).toBeCloseTo(135, 6);
    expect(n.grz.flaeche).toBeCloseTo(135, 6);
    expect(n.grz2!.flaeche).toBeCloseTo(135 + 18, 6);
    const post = n.lageplan.find((l) => l.ausGebaeude)!;
    expect(post).toMatchObject({ nutzung: 'garage', anrechnung: 'grz2' });
    expect(post.angerechnet).toBeCloseTo(18, 6);
    expect(n.bilanz.gebaeude).toBeCloseTo(153, 6);
    // ohne Kennzeichnung: Hauptanlage
    garage.anlage = undefined;
    expect(massNachweis(p).hauptanlage).toBeCloseTo(153, 6);
  });

  it('BauNVO 1962: Garage in GE nicht angerechnet, in WA angerechnet (§ 19 Abs. 5)', () => {
    const p = haus('1967-03-14');
    lageplan(p, flaeche(12, 0, 15, 6, { name: 'Garage', nutzung: 'garage' }));
    p.massNutzung = { ...p.massNutzung, gebietsart: 'WA' };
    expect(massNachweis(p).grz.flaeche).toBeCloseTo(135 + 18, 6);
    p.massNutzung = { ...p.massNutzung, gebietsart: 'GE' };
    const n = massNachweis(p);
    expect(n.grz.flaeche).toBeCloseTo(135, 6);
    expect(n.lageplan[0].anrechnung).toBe('nein');
  });

  it('absolute GR 120 m² gegen die vorhandene GR; Vollgeschosse mindestens/zwingend; BMZ', () => {
    const p = haus('2020-05-01');
    p.massNutzung = { ...p.massNutzung, grAbsolut: 120, gfAbsolut: 300, bmz: 2 };
    const n = massNachweis(p);
    expect(n.grAbsolut).toMatchObject({ zulaessig: 120, status: 'ueberschritten' });
    expect(n.grAbsolut!.flaeche).toBeCloseTo(135, 6);
    expect(n.gfAbsolut!.status).toBe('ok');
    // Baumasse: EG 3,45 + OG 3,20 Geschosshöhe × 135 m²
    expect(n.baumasse).toBeCloseTo(135 * (3.45 + 3.2), 6);
    expect(n.bmz!.wert).toBeCloseTo((135 * 6.65) / 612.5, 6);
    p.massNutzung = { ...p.massNutzung, vollgeschosseMax: 3, vollgeschosseZwingend: true };
    expect(massNachweis(p).vollgeschosse.status).toBe('unterschritten');
    p.massNutzung = { ...p.massNutzung, vollgeschosseMax: 3, vollgeschosseZwingend: undefined, vollgeschosseMin: 2 };
    expect(massNachweis(p).vollgeschosse.status).toBe('ok');
  });

  it('§ 20 Abs. 3 S. 2 BauNVO 1990: Aufenthaltsräume in Nicht-Vollgeschossen nur bei Festsetzung', () => {
    const p = haus('2020-05-01');
    expect(massNachweis(p).gfAufenthalt).toBe(0);
    p.massNutzung = { ...p.massNutzung, aufenthaltNichtVollgeschoss: true };
    const n = massNachweis(p);
    expect(n.gfAufenthalt).toBeGreaterThan(0);
    expect(n.gf).toBeCloseTo(2 * 135 + n.gfAufenthalt, 6);
  });

  it('BauO NW 1970: Kellergeschoss im Lichten – 1,50 m über Gelände zählt, 1,30 m nicht', () => {
    const p = haus('1975-06-01');
    // UG-Decke bei ±0,00, Decken-/Dachaufbau 0,30 m: im Lichten über Gelände = 0 − 0,30 − Gelände
    p.massNutzung = { ...p.massNutzung, dachaufbau: 0.3, gelaende: -1.8 };
    expect(massNachweis(p).geschosse.find((g) => g.name === 'UG')!.vollgeschoss).toBe(true);
    p.massNutzung = { ...p.massNutzung, gelaende: -1.6 };
    const ug = massNachweis(p).geschosse.find((g) => g.name === 'UG')!;
    expect(ug.vollgeschoss).toBe(false);
    expect(ug.begruendung).toContain('im Lichten 1,30 m');
  });

  it('Grundstücksgrenze 612,50 m² gezeichnet: Linie im Plan; Abweichung zur eingetragenen Fläche wird gemeldet', () => {
    const p = haus('2020-05-01');
    p.lageplan = { flaechen: [], grenze: [{ id: 'g', name: 'Flurstück', points: rectPoints({ x: -5, y: -5 }, { x: 20, y: 19.5 }) }] };
    p.meta.grundstueck.flaeche = undefined;
    const n = massNachweis(p);
    expect(n.grundstueck.quelle).toBe('grenze');
    expect(n.grundstueck.flaeche).toBeCloseTo(612.5, 6);
    expect(n.grenzeGezeichnet).toBe(true);
    expect(n.grundstueckPolygone).toHaveLength(1);
    p.meta.grundstueck.flaeche = 600;
    const m = massNachweis(p);
    expect(m.grundstueck).toMatchObject({ quelle: 'projektdaten', flaeche: 600 });
    expect(m.hinweise.some((h) => h.text.includes('gezeichnete Grenze 612,50 m²') && h.text.includes('Katasterangabe'))).toBe(true);
  });
});

describe('Varianten, 3D-Stufen, IFC-Bericht (G-30 bis G-32)', () => {
  it('Kennzahlen je Variante: Fläche „nur in Variante B“ zählt nur dort', async () => {
    const { variantenVergleich, varianten } = await import('./massNutzung');
    const p = haus('2020-05-01');
    lageplan(p, flaeche(12, 0, 15, 6, { name: 'Zufahrt', nutzung: 'zufahrt' }), { ...flaeche(-3, 0, 0, 5, { name: 'Carport', nutzung: 'garage' }), variante: 'B' });
    expect(varianten(p)).toEqual(['A', 'B']);
    const v = variantenVergleich(p);
    expect(v.find((x) => x.variante === 'A')!.n.grz2!.flaeche).toBeCloseTo(135 + 18, 6);
    expect(v.find((x) => x.variante === 'B')!.n.grz2!.flaeche).toBeCloseTo(135 + 18 + 15, 6);
    // Nachweis der gewählten Variante
    p.massNutzung = { ...p.massNutzung, variante: 'B' };
    expect(massNachweis(p).lageplan.map((l) => l.name)).toEqual(['Zufahrt', 'Carport']);
  });

  it('3D: überlagerte Flächen erhalten verschiedene Stufen, die höher angerechnete liegt oben', async () => {
    const { flaechenStufen } = await import('./flaechen3d');
    const p = haus('2020-05-01');
    lageplan(p, flaeche(10, -5, 20, 20, { name: 'Garten', nutzung: 'garten' }), flaeche(12, 0, 15, 6, { name: 'Zufahrt', nutzung: 'zufahrt' }));
    const n = massNachweis(p);
    const s = flaechenStufen(n);
    const garten = n.lageplan.find((l) => l.name === 'Garten')!.id;
    const zufahrt = n.lageplan.find((l) => l.name === 'Zufahrt')!.id;
    expect(s.get(zufahrt)!).toBeGreaterThan(s.get(garten)!);
  });

  it('IFC-Bericht ohne BRI-/Putz-Zeilen, mit Zusammenfassung; Titel je nach Import oder Abgleich', async () => {
    const { ifcBericht } = await import('./datei');
    const p = haus('2020-05-01');
    lageplan(p, flaeche(12, 0, 15, 6, { name: 'Zufahrt', nutzung: 'zufahrt' }));
    const zeilen = [
      'UG: keine Bodenplatte gefunden – Dicke im Geschoss eintragen, damit der BRI ab UK Sohle rechnet.',
      '3 Räume mit Abzug aus der IFC-Nettofläche übernommen (Nettofläche kleiner als die Zonengeometrie, z. B. 3 % Putzabzug bei Rohbaumaßen).',
      '12 Räume aus IFC-Zonen übernommen.',
      'Geländeoberfläche aus dem Modell übernommen – TERRIO (GRZ-Nachweis) prüft die Geschossigkeit am tatsächlichen Geländeverlauf.',
    ];
    const b = ifcBericht(p, zeilen, 'import');
    expect(b.titel).toBe('IFC-Import');
    expect(b.zeilen).toEqual([zeilen[2], zeilen[3]]);
    expect(b.zusammenfassung).toBe('Lageplan: 1 Fläche, Geländemodell: nein, Geschosse: UG, EG, OG, DG');
    expect(ifcBericht(p, [], 'abgleich').titel).toBe('IFC-Abgleich');
  });
});

