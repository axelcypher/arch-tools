import { describe, expect, it } from 'vitest';
import { rectPoints } from './geometry';
import type { IfcImportResult } from './ifcImport';
import { ifcStandVon, LAGEPLAN_FELDER, RAUM_FELDER, STOCKWERK_FELDER, UMRISS_FELDER } from './ifcImport';
import { ifcAbgleichen, projektAusIfc } from './ifcAbgleich';
import type { OutlineShape, RoomShape, Storey } from './model';
import { createLageplanFlaeche, createOutline, createProject, createRoom, createStorey } from './model';

const alle = { raeume: true, umrisse: true, modelle: true, lageplan: true, plaene: true };

/** Import-Ergebnis wie aus buildFromIfc: EG mit Umriss und zwei Zonen, Stand gesetzt */
function importErgebnis(o: { wohnenBreite?: number; mitBad?: boolean; kote?: number } = {}): IfcImportResult {
  const eg: Storey = { ...createStorey('Erdgeschoss', 3), elevation: o.kote ?? 0, ifcId: 'ST-EG' };
  const umriss = createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 }));
  const wohnen = createRoom(rectPoints({ x: 0.2, y: 0.2 }, { x: o.wohnenBreite ?? 6, y: 7.8 }), '1', 'Wohnen');
  wohnen.ifcId = 'R-WOHNEN';
  wohnen.putzabzug = 3;
  eg.shapes.push(umriss, wohnen);
  if (o.mitBad !== false) {
    const bad = createRoom(rectPoints({ x: 6.2, y: 0.2 }, { x: 9.8, y: 4 }), '2', 'Bad');
    bad.ifcId = 'R-BAD';
    bad.nutzung = 'NUF7';
    eg.shapes.push(bad);
  }
  eg.ifcStand = ifcStandVon(eg, STOCKWERK_FELDER);
  for (const s of eg.shapes) s.ifcStand = ifcStandVon(s, s.kind === 'room' ? RAUM_FELDER : UMRISS_FELDER);
  const zufahrt = { ...createLageplanFlaeche(rectPoints({ x: 10, y: 0 }, { x: 14, y: 6 }), 'Zufahrt'), ifcId: 'GEO-1/0', hoehe: -0.1 };
  zufahrt.ifcStand = ifcStandVon(zufahrt, LAGEPLAN_FELDER);
  return { storeys: [eg], report: [], lageplan: { flaechen: [zufahrt] } };
}

function projektAus(r: IfcImportResult) {
  const p = createProject('Haus');
  p.storeys = structuredClone(r.storeys);
  p.lageplan = structuredClone(r.lageplan);
  return p;
}

const raum = (p: ReturnType<typeof projektAus>, id: string) => p.storeys[0].shapes.find((s): s is RoomShape => s.kind === 'room' && s.ifcId === id);

describe('IFC erneut importieren', () => {
  it('übernimmt geänderte Geometrie, behält Angaben von Hand und die Flächen-IDs', () => {
    const p = projektAus(importErgebnis());
    const w = raum(p, 'R-WOHNEN')!;
    const id = w.id;
    // von Hand: Wohnfläche und Bemerkung
    w.wofl = { kategorie: 'voll', wohnung: 'WE 1' };
    w.bemerkung = 'Parkett';
    const r = ifcAbgleichen(p, importErgebnis({ wohnenBreite: 6.5 }), alle);
    const w2 = raum(r.project, 'R-WOHNEN')!;
    expect(w2.id).toBe(id);
    expect(Math.max(...w2.points.map((q) => q.x))).toBeCloseTo(6.5, 9);
    expect(w2.wofl).toEqual({ kategorie: 'voll', wohnung: 'WE 1' });
    expect(w2.bemerkung).toBe('Parkett');
    expect(r.zaehler.aktualisiert).toBeGreaterThanOrEqual(1);
  });

  it('von Hand geänderte Geometrie bleibt und wird als Konflikt gemeldet', () => {
    const p = projektAus(importErgebnis());
    const w = raum(p, 'R-WOHNEN')!;
    w.points = rectPoints({ x: 0.2, y: 0.2 }, { x: 5.5, y: 7.8 });
    const r = ifcAbgleichen(p, importErgebnis({ wohnenBreite: 6.5 }), alle);
    expect(Math.max(...raum(r.project, 'R-WOHNEN')!.points.map((q) => q.x))).toBeCloseTo(5.5, 9);
    expect(r.zaehler.konflikte).toBe(1);
    expect(r.bericht.some((z) => z.includes('Geometrie'))).toBe(true);
  });

  it('entfernt Zonen, die es nicht mehr gibt – außer sie wurden von Hand geändert', () => {
    const p = projektAus(importErgebnis());
    let r = ifcAbgleichen(p, importErgebnis({ mitBad: false }), alle);
    expect(raum(r.project, 'R-BAD')).toBeUndefined();
    expect(r.zaehler.entfernt).toBe(1);
    raum(p, 'R-BAD')!.nutzung = 'NUF4';
    r = ifcAbgleichen(p, importErgebnis({ mitBad: false }), alle);
    expect(raum(r.project, 'R-BAD')).toBeDefined();
    expect(r.zaehler.behalten).toBe(1);
  });

  it('neue Zonen kommen hinzu, von Hand gezeichnete Flächen bleiben unberührt', () => {
    const p = projektAus(importErgebnis({ mitBad: false }));
    const eigen = createRoom(rectPoints({ x: 20, y: 0 }, { x: 22, y: 2 }), '9', 'Gartenhaus');
    p.storeys[0].shapes.push(eigen);
    const r = ifcAbgleichen(p, importErgebnis(), alle);
    expect(raum(r.project, 'R-BAD')).toBeDefined();
    expect(r.project.storeys[0].shapes.some((s) => s.id === eigen.id)).toBe(true);
    expect(r.project.storeys).toHaveLength(1);
  });

  it('BGF-Umriss über die Überdeckung, geändertes Dach bleibt', () => {
    const p = projektAus(importErgebnis());
    const ol = p.storeys[0].shapes.find((s): s is OutlineShape => s.kind === 'outline')!;
    ol.dach = { typ: 'sattel', traufhoehe: 3, neigung: 35 };
    const neu = importErgebnis();
    const nu = neu.storeys[0].shapes.find((s): s is OutlineShape => s.kind === 'outline')!;
    nu.points = rectPoints({ x: 0, y: 0 }, { x: 10.5, y: 8 });
    nu.ifcStand = ifcStandVon(nu, UMRISS_FELDER);
    const r = ifcAbgleichen(p, neu, alle);
    const ol2 = r.project.storeys[0].shapes.find((s): s is OutlineShape => s.kind === 'outline')!;
    expect(ol2.id).toBe(ol.id);
    expect(ol2.dach?.typ).toBe('sattel');
    expect(Math.max(...ol2.points.map((q) => q.x))).toBeCloseTo(10.5, 9);
  });

  it('Geschoss über die GlobalId, Kote aus der IFC; Lageplan-Flächen über die Id', () => {
    const p = projektAus(importErgebnis());
    p.storeys[0].name = 'EG'; // von Hand umbenannt
    p.lageplan!.flaechen[0].nutzung = 'stellplatz';
    const neu = importErgebnis({ kote: 0.15 });
    neu.lageplan!.flaechen[0].hoehe = -0.05;
    neu.lageplan!.flaechen[0].ifcStand = ifcStandVon(neu.lageplan!.flaechen[0], LAGEPLAN_FELDER);
    const r = ifcAbgleichen(p, neu, alle);
    expect(r.project.storeys[0].name).toBe('EG');
    expect(r.project.storeys[0].elevation).toBe(0.15);
    expect(r.project.lageplan!.flaechen[0]).toMatchObject({ nutzung: 'stellplatz', hoehe: -0.05 });
  });

  it('Projekte aus älteren Versionen (ohne GlobalId): Räume über Nummer und Name', () => {
    const p = projektAus(importErgebnis());
    // Projekt eines älteren Imports: nirgends GlobalIds oder Vergleichsstände
    delete p.storeys[0].ifcId;
    delete p.storeys[0].ifcStand;
    for (const s of p.storeys[0].shapes) {
      delete s.ifcId;
      delete s.ifcStand;
    }
    for (const f of p.lageplan?.flaechen ?? []) {
      delete f.ifcId;
      delete f.ifcStand;
    }
    const w = p.storeys[0].shapes.find((s): s is RoomShape => s.kind === 'room' && s.name === 'Wohnen')!;
    w.nutzung = 'NUF2';
    const r = ifcAbgleichen(p, importErgebnis({ wohnenBreite: 6.5 }), alle);
    const rooms = r.project.storeys[0].shapes.filter((s): s is RoomShape => s.kind === 'room');
    expect(rooms).toHaveLength(2);
    const w2 = rooms.find((x) => x.name === 'Wohnen')!;
    expect(w2.id).toBe(w.id);
    expect(w2.ifcId).toBe('R-WOHNEN');
    expect(w2.nutzung).toBe('NUF2');
    expect(Math.max(...w2.points.map((q) => q.x))).toBeCloseTo(6.5, 9);
  });

  it('ohne Option „Wohnfläche“ bleibt die Wohnfläche unberührt, auch wenn sie aus einem früheren Import stammt', () => {
    // erster Import mit Wohnfläche (Flächenrechner)
    const erst = importErgebnis();
    for (const sh of erst.storeys[0].shapes) {
      if (sh.kind !== 'room') continue;
      sh.wofl = { kategorie: 'voll', wohnung: 'Erdgeschoss' };
      sh.ifcStand = ifcStandVon(sh, RAUM_FELDER);
    }
    const p = projektAusIfc('Haus', structuredClone(erst));
    // erneuter Import ohne Wohnfläche (GRZ-Nachweis): Räume tragen keine Wohnfläche
    const r = ifcAbgleichen(p, importErgebnis({ wohnenBreite: 6.5 }), { ...alle, wohnflaeche: false });
    const w = raum(r.project, 'R-WOHNEN')!;
    expect(w.wofl).toEqual({ kategorie: 'voll', wohnung: 'Erdgeschoss' });
    expect(Math.max(...w.points.map((q) => q.x))).toBeCloseTo(6.5, 9);
    // der Stand der Wohnfläche bleibt der des ersten Imports: ein späterer Import mit Wohnfläche gleicht weiter ab
    expect(w.ifcStand?.wofl).toEqual({ kategorie: 'voll', wohnung: 'Erdgeschoss' });
    expect(r.zaehler.konflikte).toBe(0);
  });

  it('von Hand gelöschte Elemente werden nicht wieder angelegt', () => {
    const p = projektAusIfc('Haus', importErgebnis());
    expect(p.ifcBekannt).toEqual(expect.arrayContaining(['ST-EG', 'R-WOHNEN', 'R-BAD', 'GEO-1/0']));
    p.storeys[0].shapes = p.storeys[0].shapes.filter((s) => s.ifcId !== 'R-BAD');
    p.lageplan = { flaechen: [] };
    const r = ifcAbgleichen(p, importErgebnis(), alle);
    expect(raum(r.project, 'R-BAD')).toBeUndefined();
    expect(r.project.lageplan?.flaechen).toHaveLength(0);
    expect(r.zaehler.uebersprungen).toBe(2);
    expect(r.zaehler.neu).toBe(0);
    // bleibt auch beim nächsten Abgleich gelöscht
    const r2 = ifcAbgleichen(r.project, importErgebnis(), alle);
    expect(raum(r2.project, 'R-BAD')).toBeUndefined();
    expect(r2.zaehler.uebersprungen).toBe(2);
  });

  it('ein gelöschtes Geschoss kommt samt Räumen nicht wieder', () => {
    const p = projektAusIfc('Haus', importErgebnis());
    p.storeys = [];
    const r = ifcAbgleichen(p, importErgebnis(), alle);
    expect(r.project.storeys).toHaveLength(0);
    expect(r.bericht.some((b) => b.includes('Geschoss „Erdgeschoss“ wurde von Hand gelöscht'))).toBe(true);
  });
});

describe('IFC erneut importieren: Räume wechseln das Geschoss', () => {
  it('ein in der IFC ins OG verschobener Raum wandert mit seinen Angaben von Hand mit – ohne Doppel', () => {
    const erst = importErgebnis();
    const og: Storey = { ...createStorey('Obergeschoss', 3), elevation: 3, ifcId: 'ST-OG' };
    og.ifcStand = ifcStandVon(og, STOCKWERK_FELDER);
    erst.storeys.push(og);
    const p = projektAusIfc('Haus', structuredClone(erst));
    const bad = raum(p, 'R-BAD')!;
    bad.nutzung = 'NUF4';
    // neuer Export: Bad liegt im OG
    const neu = structuredClone(erst);
    const b = neu.storeys[0].shapes.find((s) => s.ifcId === 'R-BAD')!;
    neu.storeys[0].shapes = neu.storeys[0].shapes.filter((s) => s !== b);
    neu.storeys[1].shapes.push(b);
    const r = ifcAbgleichen(p, neu, alle);
    const alleBaeder = r.project.storeys.flatMap((s) => s.shapes.filter((x) => x.ifcId === 'R-BAD').map((x) => ({ st: s.name, x })));
    expect(alleBaeder).toHaveLength(1);
    expect(alleBaeder[0].st).toBe('Obergeschoss');
    expect((alleBaeder[0].x as RoomShape).nutzung).toBe('NUF4');
    expect(alleBaeder[0].x.id).toBe(bad.id);
  });
});

describe('IFC erneut importieren: von Hand Gezeichnetes', () => {
  it('ein von Hand gezeichneter Umriss ohne Stand folgt nicht der IFC, auch wenn er sie überdeckt', () => {
    const p = projektAusIfc('Haus', importErgebnis());
    const eigen = createOutline(rectPoints({ x: 0, y: 0 }, { x: 10.2, y: 8 }));
    // IFC-Umriss weg, eigener daneben
    p.storeys[0].shapes = [...p.storeys[0].shapes.filter((s) => s.kind !== 'outline'), eigen];
    const r = ifcAbgleichen(p, importErgebnis(), alle);
    const e = r.project.storeys[0].shapes.find((s) => s.id === eigen.id)!;
    expect(Math.max(...e.points.map((q) => q.x))).toBeCloseTo(10.2, 9);
  });
});

describe('IFC erneut importieren: Wohnfläche nur, wo sie abgeleitet wurde', () => {
  it('Import ohne Wohnfläche, Abgleich mit Wohnfläche (Kostenermittlung): Räume bekommen keine geratene Wohnfläche', () => {
    const erst = importErgebnis();
    for (const sh of erst.storeys[0].shapes) if (sh.kind === 'room') delete sh.ifcStand!.wofl; // wie buildFromIfc ohne Option
    const p = projektAusIfc('Haus', structuredClone(erst));
    const neu = importErgebnis();
    for (const sh of neu.storeys[0].shapes) if (sh.kind === 'room') sh.wofl = { kategorie: 'voll', wohnung: 'Erdgeschoss' };
    const r = ifcAbgleichen(p, neu, { ...alle, wohnflaeche: true });
    expect(raum(r.project, 'R-WOHNEN')!.wofl).toEqual({ kategorie: 'keine', wohnung: '' });
    expect(raum(r.project, 'R-BAD')!.wofl).toEqual({ kategorie: 'keine', wohnung: '' });
  });

  it('Import mit Wohnfläche: eine geänderte Ableitung kommt beim Abgleich mit Wohnfläche an', async () => {
    const { WOFL_ABGELEITET } = await import('./ifcImport');
    const erst = importErgebnis();
    for (const sh of erst.storeys[0].shapes)
      if (sh.kind === 'room') {
        sh.wofl = { kategorie: 'voll', wohnung: 'Erdgeschoss' };
        sh.ifcStand = { ...ifcStandVon(sh, RAUM_FELDER), [WOFL_ABGELEITET]: true };
      }
    const p = projektAusIfc('Haus', structuredClone(erst));
    const neu = importErgebnis();
    for (const sh of neu.storeys[0].shapes) if (sh.kind === 'room') sh.wofl = { kategorie: 'individuell', faktor: 0.8, wohnung: 'Erdgeschoss' };
    const r = ifcAbgleichen(p, neu, { ...alle, wohnflaeche: true });
    expect(raum(r.project, 'R-WOHNEN')!.wofl).toEqual({ kategorie: 'individuell', faktor: 0.8, wohnung: 'Erdgeschoss' });
    expect(raum(r.project, 'R-WOHNEN')!.ifcStand?.[WOFL_ABGELEITET]).toBe(true);
  });
});

describe('IFC erneut importieren: Löschungen bleiben', () => {
  it('ein von Hand gelöschter BGF-Umriss kommt nicht wieder', () => {
    const p = projektAusIfc('Haus', importErgebnis());
    expect(p.ifcUmrisse).toHaveLength(1);
    p.storeys[0].shapes = p.storeys[0].shapes.filter((s) => s.kind !== 'outline');
    const r = ifcAbgleichen(p, importErgebnis(), alle);
    expect(r.project.storeys[0].shapes.some((s) => s.kind === 'outline')).toBe(false);
    expect(r.zaehler.uebersprungen).toBe(1);
    // und auch beim übernächsten Abgleich nicht
    expect(ifcAbgleichen(r.project, importErgebnis(), alle).project.storeys[0].shapes.some((s) => s.kind === 'outline')).toBe(false);
  });

  it('ein Abgleich ohne Räume vergisst gelöschte Räume nicht', () => {
    const p = projektAusIfc('Haus', importErgebnis());
    p.storeys[0].shapes = p.storeys[0].shapes.filter((s) => s.ifcId !== 'R-BAD');
    // Teil-Import ohne Räume (z. B. nur Umrisse und Dach)
    const ohneRaeume = importErgebnis();
    ohneRaeume.storeys[0].shapes = ohneRaeume.storeys[0].shapes.filter((s) => s.kind !== 'room');
    const r1 = ifcAbgleichen(p, ohneRaeume, { ...alle, raeume: false });
    const r2 = ifcAbgleichen(r1.project, importErgebnis(), alle);
    expect(raum(r2.project, 'R-BAD')).toBeUndefined();
  });
});

describe('IFC erneut importieren: Raum wandert in ein gelöschtes Geschoss', () => {
  it('der Raum bleibt im bisherigen Geschoss', () => {
    const erst = importErgebnis();
    const og: Storey = { ...createStorey('Obergeschoss', 3), elevation: 3, ifcId: 'ST-OG' };
    og.ifcStand = ifcStandVon(og, STOCKWERK_FELDER);
    erst.storeys.push(og);
    const p = projektAusIfc('Haus', structuredClone(erst));
    p.storeys = p.storeys.filter((s) => s.ifcId !== 'ST-OG'); // OG von Hand gelöscht
    raum(p, 'R-BAD')!.nutzung = 'NUF4';
    const neu = structuredClone(erst);
    const b = neu.storeys[0].shapes.find((s) => s.ifcId === 'R-BAD')!;
    neu.storeys[0].shapes = neu.storeys[0].shapes.filter((s) => s !== b);
    neu.storeys[1].shapes.push(b);
    const r = ifcAbgleichen(p, neu, alle);
    expect(r.project.storeys).toHaveLength(1);
    expect(raum(r.project, 'R-BAD')?.nutzung).toBe('NUF4');
    expect(r.bericht.some((x) => x.includes('bleibt im bisherigen Geschoss'))).toBe(true);
  });
});
