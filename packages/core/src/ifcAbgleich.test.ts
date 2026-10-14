import { describe, expect, it } from 'vitest';
import { rectPoints } from './geometry';
import type { IfcImportResult } from './ifcImport';
import { ifcStandVon, LAGEPLAN_FELDER, RAUM_FELDER, STOCKWERK_FELDER, UMRISS_FELDER } from './ifcImport';
import { ifcAbgleichen } from './ifcAbgleich';
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
    for (const s of p.storeys[0].shapes) {
      delete s.ifcId;
      delete s.ifcStand;
    }
    raum(p, undefined as never);
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
});
