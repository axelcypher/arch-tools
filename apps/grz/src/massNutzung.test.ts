import { describe, expect, it } from 'vitest';
import { rectPoints } from '@core/geometry';
import type { LageplanFlaeche, Project, Storey } from '@core/model';
import { createLageplanFlaeche, createOutline, createProject, createRoom, createStorey } from '@core/model';
import { anrechnung, massNachweis, pctNah, recht } from './massNutzung';
import { flaechenNummern, rechenweg } from './rechenweg';

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

const flaeche = (x0: number, y0: number, x1: number, y1: number, patch: Partial<LageplanFlaeche>): LageplanFlaeche => ({
  ...createLageplanFlaeche(rectPoints({ x: x0, y: y0 }, { x: x1, y: y1 })),
  ...patch,
});

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
    // § 19 Abs. 5 BauNVO 1962: außerhalb MK/GE/GI bis 0,1 frei, in MK/GE/GI nur bei Zulassung
    expect(anrechnung('garage', '1962')).toBe('garage01');
    expect(anrechnung('garage', '1962', undefined, 'GE')).toBe('pruefen');
    expect(anrechnung('garage', '1962', { garage: 'nein' }, 'GE')).toBe('nein');
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
    lageplan(p, flaeche(-5, -5, 17, 0, { hoehe: -0.2 }), flaeche(-5, 11.25, 17, 16, { hoehe: 0.3 }), flaeche(-5, 0, 0, 11.25, { hoehe: -0.2 }), flaeche(12, 0, 17, 11.25, { hoehe: -0.2 }));
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
    for (let x = -10; x < 22; x += 2) for (let y = -10; y < 22; y += 2) tri.push(x, y, z(y), x + 2, y, z(y), x + 2, y + 2, z(y + 2), x, y, z(y), x + 2, y + 2, z(y + 2), x, y + 2, z(y + 2));
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

  it('BauNVO 1962 (§ 19 Abs. 5): Garage im WA bis 0,1 der Grundstücksfläche frei, im GE „prüfen“', () => {
    const p = haus('1967-03-14');
    lageplan(p, flaeche(12, 0, 15, 6, { name: 'Garage', nutzung: 'garage' }));
    p.massNutzung = { ...p.massNutzung, gebietsart: 'WA' };
    // WA: 18 m² ≤ 0,1 · 612,50 m² → ganz anrechnungsfrei
    const wa = massNachweis(p);
    expect(wa.lageplan[0].anrechnung).toBe('garage01');
    expect(wa.garagenFrei).toBeCloseTo(18, 6);
    expect(wa.grz.flaeche).toBeCloseTo(135, 6);
    // Gegenprobe: über 0,1 · G zählt der Rest (G = 150 m² → 15 m² frei, 3 m² angerechnet)
    p.meta.grundstueck.flaeche = 150;
    const klein = massNachweis(p);
    expect(klein.garagenFrei).toBeCloseTo(15, 6);
    expect(klein.grz.flaeche).toBeCloseTo(135 + 3, 6);
    p.meta.grundstueck.flaeche = 612.5;
    // GE: anrechnungsfrei nur bei Zulassung → Spanne ohne/mit Garage
    p.massNutzung = { ...p.massNutzung, gebietsart: 'GE' };
    const ge = massNachweis(p);
    expect(ge.lageplan[0].anrechnung).toBe('pruefen');
    expect(ge.grz.flaeche).toBeCloseTo(135, 6);
    expect(ge.grz.flaecheMitOffenen).toBeCloseTo(135 + 18, 6);
    expect(ge.garagenFrei).toBe(0);
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
    expect(m.hinweise.some((h) => h.text.includes('gezeichnete Grenze 612,50 m²') && h.text.includes('§ 19 Abs. 3 BauNVO'))).toBe(true);
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

describe('Gesamt-Review: Rechenweg, Grundstücksfläche, Nummern', () => {
  it('Rechenweg 1990 mit Einstufung „GRZ I“: jede Formelzeile ergibt die Kennzahl (Gegenprobe ohne Einstufung)', () => {
    const p = haus('2020-05-01');
    lageplan(p, flaeche(-3, 0, 0, 5, { name: 'Terrasse', nutzung: 'terrasse' }), flaeche(12, 0, 15, 10, { name: 'Zufahrt', nutzung: 'zufahrt' }));
    p.massNutzung = { ...p.massNutzung, einstufung: { terrasse: 'grz1' } };
    const n = massNachweis(p);
    const f = rechenweg(n).formeln;
    expect(f[0]).toBe('GR I = Hauptanlage 135,00 m² + der Hauptanlage zugerechnete Flächen 15,00 m² = 150,00 m²');
    expect(f.find((x) => x.startsWith('GR II ='))).toBe(`GR II = GR I 150,00 m² + Anlagen nach § 19 Abs. 4 BauNVO 30,00 m² = 180,00 m²`);
    p.massNutzung = { ...p.massNutzung, einstufung: { terrasse: 'ja' } };
    const g = rechenweg(massNachweis(p)).formeln;
    expect(g[0]).toBe('GR I = Hauptanlage 135,00 m²');
    expect(g.find((x) => x.startsWith('GR II ='))).toBe(`GR II = GR I 135,00 m² + Anlagen nach § 19 Abs. 4 BauNVO 45,00 m² = 180,00 m²`);
  });

  it('Grundstücksfläche 0 oder negativ gilt als fehlend; eine gezeichnete Grenze springt ein (Gegenprobe: positive Angabe gilt)', () => {
    for (const wert of [0, -100]) {
      const p = haus('2020-05-01');
      p.meta.grundstueck.flaeche = wert;
      const n = massNachweis(p);
      expect(n.grundstueck.flaeche).toBeUndefined();
      expect(n.grz.status).toBe('fehlt');
      expect(n.grz.wert).toBeUndefined();
      expect(n.hinweise.some((h) => h.feld === 'grundstueck')).toBe(true);
      p.lageplan = { flaechen: [], grenze: [{ id: 'g', name: 'Flurstück', points: rectPoints({ x: -5, y: -5 }, { x: 20, y: 20 }) }] };
      const m = massNachweis(p);
      expect(m.grundstueck.quelle).toBe('grenze');
      expect(m.grundstueck.flaeche).toBeCloseTo(625, 6);
      expect(m.hinweise.some((h) => h.feld === 'grundstueck')).toBe(false);
    }
    const p = haus('2020-05-01');
    p.lageplan = { flaechen: [], grenze: [{ id: 'g', name: 'Flurstück', points: rectPoints({ x: -5, y: -5 }, { x: 20, y: 20 }) }] };
    expect(massNachweis(p).grundstueck.quelle).toBe('projektdaten');
  });

  it('BauNVO 1968 ohne Grundstücksfläche: Garagen nicht pauschal anrechnungsfrei (Gegenprobe mit Fläche: bis 0,1 frei)', () => {
    const p = haus('1970-05-01');
    lageplan(p, flaeche(12, 0, 15, 6, { name: 'Garage', nutzung: 'garage' }));
    const mit = massNachweis(p);
    expect(mit.garagenFrei).toBeCloseTo(18, 6);
    p.meta.grundstueck.flaeche = undefined;
    p.lageplan = { flaechen: [], ...p.lageplan, grenze: [] };
    const ohne = massNachweis({ ...p, lageplan: { flaechen: p.lageplan!.flaechen.map((f) => ({ ...f, nachbar: true })) } });
    expect(ohne.garagenFrei ?? 0).toBe(0);
  });

  it('Flächennummern zählen nur eigene Flächen (Nachbarfläche ohne Nummer)', () => {
    const p = haus('2020-05-01');
    lageplan(p, flaeche(20, 0, 25, 5, { name: 'Nachbar', nachbar: true }), flaeche(12, 0, 15, 10, { name: 'Zufahrt', nutzung: 'zufahrt' }));
    const n = massNachweis(p);
    const nr = flaechenNummern(n);
    expect(nr.get(p.lageplan!.flaechen[1].id)).toBe(1);
    expect(nr.has(p.lageplan!.flaechen[0].id)).toBe(false);
    expect(rechenweg(n).flaechen.find((f) => f.id === p.lageplan!.flaechen[1].id)?.nr).toBe('1');
  });
});

describe('Fachliche Pflichtbefunde Baurecht (P2–P10)', () => {
  /** Geschoss mit Rechteck-Umrissen; S: Balkon/Loggia/Terrasse */
  const geschoss = (name: string, e: number, h: number, ...umrisse: { x0: number; y0: number; x1: number; y1: number; S?: boolean }[]): Storey => {
    const s: Storey = { ...createStorey(name, h), elevation: e };
    for (const u of umrisse) {
      const o = createOutline(rectPoints({ x: u.x0, y: u.y0 }, { x: u.x1, y: u.y1 }));
      if (u.S) o.umschliessung = 'S';
      s.shapes.push(o);
    }
    return s;
  };
  const projekt = (planDatum: string, ...storeys: Storey[]): Project => {
    const p = createProject('Befund');
    p.storeys = storeys;
    p.meta.grundstueck.flaeche = 612.5;
    p.massNutzung = { planDatum, grz: 0.4, gfz: 0.8, gelaende: -0.2 };
    return p;
  };
  const vg = (p: Project, name: string) => massNachweis(p).geschosse.find((g) => g.name === name)!;

  it('P2: Auslegung 1989, Inkrafttreten 1990 → BauNVO 1968/1977, Vollgeschossbegriff nach dem Inkrafttreten', () => {
    const r = recht({ planDatum: '1990-06-01', auslegungDatum: '1989-10-02' });
    expect(r).toMatchObject({ baunvo: '1968', bauo: 'nw1985', ausDatum: true });
    expect(r.hinweise.some((h) => h.includes('§ 25c'))).toBe(false);
    // Gegenprobe: ohne Auslegungsdatum BauNVO 1990 – mit Hinweis, weil kurz nach dem Fassungswechsel
    const ohne = recht({ planDatum: '1990-06-01' });
    expect(ohne.baunvo).toBe('1990');
    expect(ohne.hinweise.some((h) => h.includes('öffentliche Auslegung') && h.includes('§ 25c'))).toBe(true);
    // weit weg vom Wechsel: kein Hinweis
    expect(recht({ planDatum: '2005-03-01' }).hinweise).toEqual([]);
    // Vollgeschossbegriff folgt dem Plandatum, nicht der Auslegung
    expect(recht({ planDatum: '2019-02-01', auslegungDatum: '2018-06-01' }).bauo).toBe('nrw2019');
  });

  it('P2/P8: Speichern liest auslegungDatum und garagenGfFrei, verwirft ungültige Werte', async () => {
    const { parseProject, serializeProject } = await import('@core/serialize');
    const p = haus('1990-06-01');
    p.massNutzung = { ...p.massNutzung, auslegungDatum: '1989-10-02', garagenGfFrei: true };
    expect(parseProject(serializeProject(p)).massNutzung).toMatchObject({ auslegungDatum: '1989-10-02', garagenGfFrei: true });
    // Gegenprobe: falsches Datumsformat und Nicht-Boolean werden verworfen
    const roh = JSON.parse(serializeProject(p));
    roh.massNutzung.auslegungDatum = '02.10.1989';
    roh.massNutzung.garagenGfFrei = 'ja';
    const back = parseProject(JSON.stringify(roh)).massNutzung!;
    expect(back.auslegungDatum).toBeUndefined();
    expect(back.garagenGfFrei).toBeUndefined();
  });

  it('P3: Rechenweg zeigt den Garagenabzug auch nach BauNVO 1962', async () => {
    const { rechenweg } = await import('./rechenweg');
    const p = haus('1967-03-14');
    lageplan(p, flaeche(12, 0, 15, 6, { name: 'Garage', nutzung: 'garage' }));
    const z = rechenweg(massNachweis(p), new Map()).formeln[0];
    expect(z).toContain('− Garagen anrechnungsfrei (§ 19 Abs. 5 BauNVO 1962) 18,00 m²');
    // Gegenprobe: 1968/77 mit § 21a Abs. 3
    const q = haus('1978-06-01');
    lageplan(q, flaeche(12, 0, 15, 6, { name: 'Garage', nutzung: 'garage' }));
    expect(rechenweg(massNachweis(q), new Map()).formeln[0]).toContain('(§ 21a Abs. 3)');
  });

  it('P5/P6: Staffelgeschoss mit Dachterrasse (S) ist durch die Terrasse kein Vollgeschoss – 2018 und 1985', () => {
    for (const datum of ['2020-05-01', '1995-01-01']) {
      const eg = () => geschoss('EG', 0, 3, { x0: 0, y0: 0, x1: 12, y1: 11.25 });
      // OG: 6 m Raum (R), daneben die Dachterrasse (S) auf dem Rest der EG-Decke
      const p = projekt(datum, eg(), geschoss('OG', 3, 3, { x0: 0, y0: 0, x1: 6, y1: 11.25 }, { x0: 6, y0: 0, x1: 12, y1: 11.25, S: true }));
      const og = vg(p, 'OG');
      expect(og.flaeche).toBeCloseTo(6 * 11.25, 6);
      expect(og.vollgeschoss).toBe(false);
      if (datum === '1995-01-01') expect(og.bezug).toBe('darunter');
      // Gegenprobe: 10 m Raum – mehr als drei Viertel bzw. zwei Drittel der EG-Fläche
      const q = projekt(datum, eg(), geschoss('OG', 3, 3, { x0: 0, y0: 0, x1: 10, y1: 11.25 }, { x0: 10, y0: 0, x1: 12, y1: 11.25, S: true }));
      expect(vg(q, 'OG').vollgeschoss).toBe(true);
    }
  });

  it('P6: EG über größerem UG (BauO NW 1984/1995) bleibt Vollgeschoss; nur das oberste Geschoss ist Staffelgeschoss', () => {
    const ug = () => geschoss('UG', -3, 3, { x0: -5, y0: -5, x1: 15, y1: 15 });
    const eg = () => geschoss('EG', 0, 3, { x0: 0, y0: 0, x1: 12, y1: 11.25 });
    const p = projekt('1995-01-01', ug(), eg(), geschoss('OG', 3, 3, { x0: 0, y0: 0, x1: 12, y1: 11.25 }));
    const e = vg(p, 'EG');
    expect(e.bezug).toBe('eigene');
    expect(e.vollgeschoss).toBe(true);
    // auch als oberstes Geschoss: das UG darunter ist nicht oberirdisch → kein Staffelgeschoss
    expect(vg(projekt('1995-01-01', ug(), eg()), 'EG').vollgeschoss).toBe(true);
    // Gegenprobe: zurückgesetztes oberstes Geschoss über dem oberirdischen EG ist Staffelgeschoss
    const q = projekt('1995-01-01', ug(), eg(), geschoss('OG', 3, 3, { x0: 0, y0: 0, x1: 6, y1: 11.25 }));
    expect(vg(q, 'OG')).toMatchObject({ bezug: 'darunter', vollgeschoss: false });
  });

  it('P6: BauO NRW 2018 – EG über größerer Tiefgarage: Hinweis, wenn nur der größere Bezug zum Nicht-Vollgeschoss führt', () => {
    const p = projekt('2020-05-01', geschoss('TG', -3, 3, { x0: -5, y0: -5, x1: 15, y1: 15 }), geschoss('EG', 0, 3, { x0: 0, y0: 0, x1: 12, y1: 11.25 }));
    const n = massNachweis(p);
    expect(n.geschosse.find((g) => g.name === 'EG')!.vollgeschoss).toBe(false);
    expect(n.hinweise.some((h) => h.art === 'sachlich' && h.text.startsWith('EG: kein Vollgeschoss nur wegen der größeren Grundfläche'))).toBe(true);
    // Gegenprobe: gleich große Geschosse – kein Hinweis
    const q = projekt('2020-05-01', geschoss('TG', -3, 3, { x0: 0, y0: 0, x1: 12, y1: 11.25 }), geschoss('EG', 0, 3, { x0: 0, y0: 0, x1: 12, y1: 11.25 }));
    const m = massNachweis(q);
    expect(m.geschosse.find((g) => g.name === 'EG')!.vollgeschoss).toBe(true);
    expect(m.hinweise.some((h) => h.text.includes('kein Vollgeschoss nur wegen'))).toBe(false);
  });

  it('P7: GRZ I mit offener Terrasse (BauNVO 1990) als Spanne, Status „prüfen“ bei Überschreitung', async () => {
    const { rechenweg } = await import('./rechenweg');
    const p = haus('2020-05-01');
    lageplan(p, flaeche(-3, 0, 0, 5, { name: 'Terrasse', nutzung: 'terrasse' }));
    const n = massNachweis(p);
    expect(n.grz.flaeche).toBeCloseTo(135, 6);
    expect(n.grz.flaecheMitOffenen).toBeCloseTo(150, 6);
    expect(n.grz.mitOffenen).toBeCloseTo(150 / 612.5, 6);
    expect(n.hinweise.some((h) => h.text.includes('GRZ I und GRZ II sind ohne und mit ihnen angegeben'))).toBe(true);
    expect(rechenweg(n, new Map()).formeln.some((f) => f.startsWith('GRZ I mit ungeklärten Flächen'))).toBe(true);
    // zulässige GRZ zwischen ohne und mit Terrasse → „prüfen“
    p.massNutzung = { ...p.massNutzung, grz: 0.23 };
    expect(massNachweis(p).grz.status).toBe('pruefen');
    // Gegenprobe: offene „sonstige“ Fläche zählt nur in der GRZ II-Spanne, nicht in der GRZ I
    const q = haus('2020-05-01');
    lageplan(q, flaeche(-3, 0, 0, 5, { name: 'Sonstiges', nutzung: 'sonstige' }));
    const m = massNachweis(q);
    expect(m.grz.mitOffenen).toBeUndefined();
    expect(m.grz2!.mitOffenen).toBeDefined();
  });

  it('P8: Nebenanlage als Gebäudeteil nicht in der GF; Garage nur nach § 21a Abs. 4', () => {
    const mitAnbau = (datum: string, anlage: 'nebenanlage' | 'garage') => {
      const p = haus(datum);
      const teil = createOutline(rectPoints({ x: 12, y: 0 }, { x: 15, y: 6 }), 'Anbau');
      teil.anlage = anlage;
      p.storeys[1].shapes.push(teil);
      return p;
    };
    const egGf = (p: Project) => massNachweis(p).gfJeGeschoss.find((g) => g.name === 'EG')!;
    const neben = egGf(mitAnbau('2020-05-01', 'nebenanlage'));
    expect(neben.flaeche).toBeCloseTo(135, 6);
    expect(neben.abzug).toBeCloseTo(18, 6);
    // 1990: Garage zählt zur GF, außer bei Festsetzung nach § 21a Abs. 4 Nr. 3
    const g90 = mitAnbau('2020-05-01', 'garage');
    expect(egGf(g90).flaeche).toBeCloseTo(153, 6);
    g90.massNutzung = { ...g90.massNutzung, garagenGfFrei: true };
    expect(egGf(g90).flaeche).toBeCloseTo(135, 6);
    // 1968/77: nicht angerechnete Garage (bis 0,1 frei) auch nicht in der GF (§ 21a Abs. 4 Nr. 2)
    const g77 = mitAnbau('1978-06-01', 'garage');
    expect(egGf(g77).flaeche).toBeCloseTo(135, 6);
    // Gegenprobe: nur 15 von 18 m² frei → 3 m² zählen zur GF
    g77.meta.grundstueck.flaeche = 150;
    expect(egGf(g77).flaeche).toBeCloseTo(138, 6);
    // Gegenprobe: ohne Kennzeichnung zählt der Anbau voll
    const ohne = haus('2020-05-01');
    ohne.storeys[1].shapes.push(createOutline(rectPoints({ x: 12, y: 0 }, { x: 15, y: 6 }), 'Anbau'));
    expect(egGf(ohne).flaeche).toBeCloseTo(153, 6);
  });

  it('P9: Keller nur mit Treppe (BauNVO 1977) ohne GF; mit Aufenthaltsraum zählt die Treppe mit', () => {
    const p = haus('1978-06-01');
    p.storeys[0].shapes.push(createRoom(rectPoints({ x: 1, y: 1 }, { x: 4, y: 5 }), 'K1', 'Treppe'));
    const n = massNachweis(p);
    expect(n.raeume.find((r) => r.name.includes('Treppe'))!.ergebnis).toBe('treppe');
    expect(n.gfJeGeschoss.find((g) => g.name === 'UG')!.flaeche).toBe(0);
    // Gegenprobe: Hobbyraum als Aufenthaltsraum im selben Geschoss → Treppe zählt mit
    const hobby = createRoom(rectPoints({ x: 6, y: 1 }, { x: 10, y: 5 }), 'K2', 'Hobbyraum');
    hobby.aufenthalt = 'ja';
    const q = { ...p, storeys: p.storeys.map((s, i) => (i === 0 ? { ...s, shapes: [...s.shapes, hobby] } : s)) };
    const ugQ = massNachweis(q).gfJeGeschoss.find((g) => g.name === 'UG')!;
    // Hobbyraum 4 × 4 und Treppe 3 × 4, je um 0,25 m erweitert (Ecken gerundet)
    expect(ugQ.flaeche).toBeGreaterThan(4.5 * 4.5 + 3.5 * 4.5 - 1);
  });

  it('P10: BauO NW 1970 erst ab 01.07.1970 – Keller „im Lichten“ nicht für Pläne vom Frühjahr 1970', () => {
    const p = haus('1970-03-01');
    // Decke 1,50 m über Gelände, im Lichten 1,20 m: nach BauO NW 1962 (bis OK Decke) angerechnet
    p.massNutzung = { ...p.massNutzung, dachaufbau: 0.3, gelaende: -1.5 };
    expect(vg(p, 'UG').vollgeschoss).toBe(true);
    // Gegenprobe: Plan vom August 1970 – im Lichten gemessen, kein Vollgeschoss
    p.massNutzung = { ...p.massNutzung, planDatum: '1970-08-01' };
    expect(vg(p, 'UG').vollgeschoss).toBe(false);
  });

  it('P2: nur Auslegung, kein Inkrafttreten – Vollgeschossbegriff nach der Auslegung mit Hinweis, kein § 34/35-Hinweis (Gegenprobe ohne Daten)', () => {
    const r = recht({ auslegungDatum: '1975-03-01' });
    expect(r.baunvo).toBe('1968');
    expect(r.bauo).toBe('nw1962');
    expect(r.hinweise.some((h) => h.startsWith('Inkrafttreten fehlt'))).toBe(true);
    expect(r.hinweise.some((h) => h.includes('§ 34'))).toBe(false);
    const leer = recht({});
    expect(leer.bauo).toBe('nrw2019');
    expect(leer.hinweise.some((h) => h.includes('§ 34'))).toBe(true);
    expect(leer.hinweise.some((h) => h.startsWith('Inkrafttreten fehlt'))).toBe(false);
  });

  it('Auslegung nach Inkrafttreten meldet vertauschte Daten (Gegenprobe: richtige Reihenfolge ohne Hinweis)', () => {
    expect(recht({ planDatum: '1980-01-01', auslegungDatum: '1985-01-01' }).hinweise.some((h) => h.includes('vertauscht'))).toBe(true);
    expect(recht({ planDatum: '1985-01-01', auslegungDatum: '1980-01-01' }).hinweise.some((h) => h.includes('vertauscht'))).toBe(false);
  });
});

describe('Folgerunde: Grenzwerte, absolute GR II, Gemeinschaftsanlagen, Aufenthaltsräume', () => {
  it('Prozente nahe der Schwelle mit Nachkommastellen und Hinweis (Gegenprobe: weit weg ganzzahlig)', () => {
    expect(pctNah(0.7496, 0.75)).toBe('74,96 % (knapp am Grenzwert – Rasterprüfung, im Schnitt nachweisen)');
    expect(pctNah(0.735, 0.75)).toBe('73,5 %');
    expect(pctNah(0.5, 0.75)).toBe('50 %');
  });

  it('BauNVO 1990 mit absoluter GR: GR II höchstens 1,5 × GR (Gegenprobe: ohne absolute GR keine Prüfung)', () => {
    const p = haus('2020-05-01');
    lageplan(p, flaeche(12, 0, 15, 20, { name: 'Zufahrt', nutzung: 'zufahrt' }));
    p.massNutzung = { ...p.massNutzung, grAbsolut: 140 };
    const n = massNachweis(p);
    expect(n.gr2Absolut?.zulaessig).toBeCloseTo(210, 6);
    expect(n.gr2Absolut?.flaeche).toBeCloseTo(195, 6);
    expect(n.gr2Absolut?.status).toBe('ok');
    p.massNutzung = { ...p.massNutzung, grAbsolut: 120 };
    expect(massNachweis(p).gr2Absolut?.status).toBe('ueberschritten');
    p.massNutzung = { ...p.massNutzung, grAbsolut: undefined };
    expect(massNachweis(p).gr2Absolut).toBeUndefined();
  });

  it('§ 21a Abs. 2: Anteil an Gemeinschaftsanlagen wird ab 1968 hinzugerechnet, 1962 nicht (mit Hinweis)', () => {
    const p = haus('2020-05-01');
    p.massNutzung = { ...p.massNutzung, gemeinschaftsanlagen: 37.5 };
    const n = massNachweis(p);
    expect(n.grundstueck.flaeche).toBeCloseTo(650, 6);
    expect(n.grundstueck.basis).toBeCloseTo(612.5, 6);
    expect(rechenweg(n).formeln[0]).toContain('Anteil an Gemeinschaftsanlagen');
    const alt = haus('1965-05-01');
    alt.massNutzung = { ...alt.massNutzung, gemeinschaftsanlagen: 37.5 };
    const m = massNachweis(alt);
    expect(m.grundstueck.flaeche).toBeCloseTo(612.5, 6);
    expect(m.hinweise.some((h) => h.text.includes('BauNVO 1962 kennt keine Regel'))).toBe(true);
  });

  it('Wohnraum ohne lichte Höhe: „prüfen“ mit Hinweis statt stillschweigend kein Aufenthaltsraum (Gegenprobe: von Hand festgelegt)', () => {
    const p = haus('1970-08-01');
    // DG unter Walmdach: Zimmer in der Ecke mit wenig Höhe
    p.storeys[3].shapes.push(createRoom(rectPoints({ x: 0.2, y: 0.2 }, { x: 1.5, y: 1.5 }), '9', 'Kinderzimmer'));
    const n = massNachweis(p);
    const r = n.raeume.find((x) => x.name === '9 Kinderzimmer')!;
    expect(r.zuPruefen).toBe(true);
    expect(r.begruendung.startsWith('prüfen')).toBe(true);
    expect(n.hinweise.some((h) => h.text.includes('9 Kinderzimmer') && h.text.includes('ohne die geforderte lichte Höhe'))).toBe(true);
    const q = structuredClone(p);
    const raum = q.storeys[3].shapes.find((x) => x.kind === 'room' && x.name === 'Kinderzimmer');
    if (raum && raum.kind === 'room') raum.aufenthalt = 'ja';
    expect(massNachweis(q).raeume.find((x) => x.name === '9 Kinderzimmer')!.zuPruefen).toBe(false);
  });

  it('Wohngebäude GK 1/2 nach BauO NRW 2018: 2,30 m statt 2,40 m nur mit Schalter', async () => {
    const { aufenthaltAnforderung } = await import('./massNutzung');
    expect(aufenthaltAnforderung('nrw2019', { dachraumOderKeller: false, kleinesWohngebaeude: true }).hoehe).toBe(2.3);
    expect(aufenthaltAnforderung('nrw2019', { dachraumOderKeller: false, kleinesWohngebaeude: false }).hoehe).toBe(2.4);
  });
});
