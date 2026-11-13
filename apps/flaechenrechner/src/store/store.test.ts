import { describe, expect, it } from 'vitest';
import { rectPoints } from '@core/geometry';
import { createOutline, createProject, createRoom } from '@core/model';
import { mapShape, projektLeer, useEditor, zwischenstandUebernehmen } from './store';

function laden() {
  const p = createProject('Test');
  const eg = p.storeys[0];
  const a = createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 }));
  const b = createRoom(rectPoints({ x: 1, y: 1 }, { x: 4, y: 4 }), '1', 'Wohnen');
  const c = createRoom(rectPoints({ x: 5, y: 1 }, { x: 8, y: 4 }), '2', 'Bad');
  eg.shapes.push(a, b, c);
  useEditor.getState().loadProject(p, p, 'C:/Projekte/Haus.oap');
  return { p, eg, a, b, c };
}

describe('Mehrfachauswahl', () => {
  it('Umschalt+Klick nimmt hinzu und heraus, die zuletzt gewählte ist die Hauptauswahl', () => {
    const { a, b } = laden();
    const st = useEditor.getState();
    st.select(a.id);
    st.toggleSelect(b.id);
    expect(useEditor.getState().selectedIds).toEqual([a.id, b.id]);
    expect(useEditor.getState().selectedShapeId).toBe(b.id);
    st.toggleSelect(b.id);
    expect(useEditor.getState().selectedIds).toEqual([a.id]);
    expect(useEditor.getState().selectedShapeId).toBe(a.id);
  });

  it('Rückgängig bereinigt die Auswahl um Flächen, die es nicht mehr gibt', () => {
    const { b, c } = laden();
    const st = useEditor.getState();
    // neue Fläche anlegen und mitwählen, dann rückgängig
    const d = createRoom(rectPoints({ x: 1, y: 5 }, { x: 3, y: 7 }), '3', 'Flur');
    st.update((p) => ({ ...p, storeys: p.storeys.map((s, i) => (i === 0 ? { ...s, shapes: [...s.shapes, d] } : s)) }));
    st.selectMany([b.id, c.id, d.id]);
    useEditor.getState().undo();
    expect(useEditor.getState().selectedIds).toEqual([b.id, c.id]);
    expect(useEditor.getState().selectedShapeId).not.toBe(d.id);
  });

  it('Geschosswechsel hebt die Auswahl auf', () => {
    const { a, b } = laden();
    const st = useEditor.getState();
    st.selectMany([a.id, b.id]);
    st.setActiveStorey(useEditor.getState().project.storeys[0].id);
    expect(useEditor.getState().selectedIds).toEqual([]);
  });
});

describe('Änderungen ohne Wirkung', () => {
  it('erzeugen keinen Undo-Schritt und machen das Projekt nicht ungespeichert', () => {
    const { eg } = laden();
    const st = useEditor.getState();
    st.update((p) => mapShape(p, eg.id, 'gibt-es-nicht', (s) => ({ ...s, name: 'x' })));
    st.update((p) => mapShape(p, eg.id, eg.shapes[0].id, (s) => s));
    expect(useEditor.getState().past).toHaveLength(0);
    expect(useEditor.getState().dirty).toBe(false);
  });
});

describe('Speichern', () => {
  it('ohne Weiterarbeiten: gespeicherter Stand wird Basis, Projekt ist gespeichert', () => {
    const { p } = laden();
    const gespeichert = { ...p, name: 'Haus (mit Änderung einer anderen App)' };
    useEditor.getState().markSaved(gespeichert, 'C:/Projekte/Haus.oap', p, useEditor.getState().dokument);
    const s = useEditor.getState();
    expect(s.project).toBe(gespeichert);
    expect(s.basis).toBe(gespeichert);
    expect(s.dirty).toBe(false);
    expect(s.datei).toBe('C:/Projekte/Haus.oap');
  });

  it('während des Speicherns weitergearbeitet: eigene Änderung bleibt ungespeichert, die der anderen App kommt hinzu', () => {
    const { p, eg, b } = laden();
    const vorher = useEditor.getState().project;
    // eigene Änderung während des Speicherns
    useEditor.getState().update((x) => mapShape(x, eg.id, b.id, (s) => ({ ...s, name: 'Wohnen/Essen' })));
    // gespeichert wurde „vorher“ – zusammengeführt mit einer Änderung des GRZ-Nachweises
    const gespeichert = { ...vorher, massNutzung: { grz: 0.4 } };
    useEditor.getState().markSaved(gespeichert, 'C:/Projekte/Haus Neu.oap', vorher, useEditor.getState().dokument);
    const s = useEditor.getState();
    expect(s.dirty).toBe(true);
    expect(s.basis).toBe(gespeichert);
    expect(s.datei).toBe('C:/Projekte/Haus Neu.oap');
    expect(s.project.massNutzung).toEqual({ grz: 0.4 });
    expect(s.project.storeys[0].shapes.find((x) => x.id === b.id)?.name).toBe('Wohnen/Essen');
    void p;
  });
});

describe('Kopieren, Einfügen, Duplizieren, Pfeiltasten', () => {
  it('Strg+C/V ins andere Geschoss deckungsgleich, neue Kennungen ohne IFC-Herkunft', async () => {
    const { flaechenEinfuegen, flaechenKopieren } = await import('./store');
    const { a } = laden();
    useEditor.getState().update((p) => mapShape(p, p.storeys[0].id, a.id, (s) => ({ ...s, ifcId: 'X', ifcStand: { points: s.points } })));
    const og = { ...createProject().storeys[0], name: 'OG' };
    useEditor.getState().update((p) => ({ ...p, storeys: [...p.storeys, og] }));
    useEditor.getState().select(a.id);
    expect(flaechenKopieren()).toBe(1);
    useEditor.getState().setActiveStorey(og.id);
    expect(flaechenEinfuegen()).toBe(1);
    const neu = useEditor.getState().project.storeys[1].shapes[0];
    expect(neu.id).not.toBe(a.id);
    expect(neu.points).toEqual(a.points);
    expect(neu.ifcId).toBeUndefined();
    expect(neu.ifcStand).toBeUndefined();
    expect(useEditor.getState().selectedIds).toEqual([neu.id]);
  });

  it('Duplizieren versetzt um 0,50 m; Pfeiltasten verschieben, mehrere Schritte = ein Undo-Schritt', async () => {
    const { auswahlVerschieben, flaechenDuplizieren } = await import('./store');
    const { b } = laden();
    useEditor.getState().select(b.id);
    flaechenDuplizieren();
    const shapes = useEditor.getState().project.storeys[0].shapes;
    expect(shapes).toHaveLength(4);
    expect(shapes[3].points[0]).toEqual({ x: b.points[0].x + 0.5, y: b.points[0].y + 0.5 });
    const schritte = useEditor.getState().past.length;
    auswahlVerschieben(0.01, 0);
    auswahlVerschieben(0.01, 0);
    expect(useEditor.getState().project.storeys[0].shapes[3].points[0].x).toBeCloseTo(b.points[0].x + 0.52, 9);
    expect(useEditor.getState().past.length).toBe(schritte + 1);
    useEditor.getState().undo();
    expect(useEditor.getState().project.storeys[0].shapes[3].points[0].x).toBeCloseTo(b.points[0].x + 0.5, 9);
  });
});

describe('Speichern und Dokumentwechsel', () => {
  it('ein Speichern, das erst nach „Neu“/„Öffnen“ fertig wird, ändert das neue Dokument nicht', () => {
    const { p } = laden();
    const dokument = useEditor.getState().dokument;
    // während des Speicherns: neues Projekt
    useEditor.getState().newProject();
    const neu = useEditor.getState().project;
    useEditor.getState().markSaved(p, 'C:/Projekte/Haus.oap', p, dokument);
    const s = useEditor.getState();
    expect(s.project).toBe(neu);
    expect(s.datei).toBeNull();
    expect(s.basis).toBeNull();
  });
});

describe('Pfeiltasten nach Rückgängig', () => {
  it('ein Schritt direkt nach Rückgängig ist ein eigener, rückgängig zu machender Schritt', async () => {
    const { auswahlVerschieben } = await import('./store');
    const { b } = laden();
    useEditor.getState().select(b.id);
    auswahlVerschieben(0.01, 0);
    useEditor.getState().undo();
    auswahlVerschieben(0, 0.01);
    expect(useEditor.getState().project.storeys[0].shapes.find((s) => s.id === b.id)!.points[0]).toEqual({ x: b.points[0].x, y: b.points[0].y + 0.01 });
    useEditor.getState().undo();
    expect(useEditor.getState().project.storeys[0].shapes.find((s) => s.id === b.id)!.points[0]).toEqual(b.points[0]);
  });
});

describe('Geschoss duplizieren', () => {
  it('die Kopie trägt keine IFC-Herkunft', async () => {
    const { duplicateStorey } = await import('./store');
    const p = createProject('Haus');
    p.storeys[0].ifcId = 'ST-EG';
    p.storeys[0].ifcStand = { name: 'EG' };
    const r = createRoom(rectPoints({ x: 0, y: 0 }, { x: 2, y: 2 }), '1', 'Bad');
    r.ifcId = 'R-1';
    r.ifcStand = { name: 'Bad' };
    p.storeys[0].shapes.push(r);
    const d = duplicateStorey(p, p.storeys[0].id);
    const kopie = d.project.storeys[1];
    expect(kopie.ifcId).toBeUndefined();
    expect(kopie.ifcStand).toBeUndefined();
    expect(kopie.shapes[0].ifcId).toBeUndefined();
    expect(kopie.shapes[0].ifcStand).toBeUndefined();
    expect(p.storeys[0].shapes[0].ifcId).toBe('R-1');
  });
});

describe('Raumnummern (F-01)', () => {
  it('neue Nummer = höchste vorhandene + 1, nicht Anzahl + 1', async () => {
    const { nextRoomNumber } = await import('./store');
    const p = createProject('Haus');
    const eg = p.storeys[0];
    for (let i = 1; i <= 4; i++) eg.shapes.push(createRoom(rectPoints({ x: i * 3, y: 0 }, { x: i * 3 + 2, y: 2 }), `0.0${i}`, `R${i}`));
    eg.shapes.splice(1, 1); // 0.02 gelöscht
    expect(nextRoomNumber(p, eg)).toBe('0.05');
  });

  it('ein Geschoss unter dem EG ändert die Nummernvergabe im EG nicht', async () => {
    const { addStorey, nextRoomNumber } = await import('./store');
    const p = createProject('Haus');
    p.storeys[0].shapes.push(createRoom(rectPoints({ x: 0, y: 0 }, { x: 2, y: 2 }), '0.01', 'Wohnen'));
    const vorher = nextRoomNumber(p, p.storeys[0]);
    const r = addStorey(p, undefined, p.storeys[0].id, 'darunter');
    const eg = r.project.storeys.find((s) => s.name === 'EG')!;
    const kg = r.project.storeys.find((s) => s.id === r.id)!;
    expect(vorher).toBe('0.02');
    expect(nextRoomNumber(r.project, eg)).toBe('0.02');
    expect(kg.name).toBe('KG');
    expect(nextRoomNumber(r.project, kg)).toBe('-1.01');
  });

  it('Präfix je Geschoss einstellbar, sonst nach Lage zum nächsten benannten Geschoss', async () => {
    const { raumNummernPraefix } = await import('../core/geschosse');
    const p = createProject('Haus');
    p.storeys.push({ ...createProject().storeys[0], name: 'Dachgeschoss' });
    expect(raumNummernPraefix(p, p.storeys[1])).toBe('1');
    p.storeys[1].nummernPraefix = 'D';
    expect(raumNummernPraefix(p, p.storeys[1])).toBe('D');
  });

  it('Neu-Nummerieren nur auf Befehl, Räume aus dem IFC-Import behalten ihre Nummer', async () => {
    const { raeumeNeuNummerieren } = await import('../core/geschosse');
    const p = createProject('Haus');
    const eg = p.storeys[0];
    const a = createRoom(rectPoints({ x: 0, y: 0 }, { x: 2, y: 2 }), '0.07', 'A');
    const b = createRoom(rectPoints({ x: 3, y: 0 }, { x: 5, y: 2 }), '0.01', 'B (IFC)');
    b.ifcId = 'IFC-B';
    const c = createRoom(rectPoints({ x: 6, y: 0 }, { x: 8, y: 2 }), '0.09', 'C');
    eg.shapes.push(a, b, c);
    const r = raeumeNeuNummerieren(p, eg, 'liste');
    expect(r.ifc).toBe(1);
    expect(r.storey.shapes.map((s) => (s.kind === 'room' ? s.nummer : ''))).toEqual(['0.02', '0.01', '0.03']);
  });
});

describe('Kopieren in ein anderes Geschoss, Duplizieren (F-02)', () => {
  it('EG-Räume ins 1. OG einfügen mit „Nummern anpassen“ → 1.01 ff., Wohnung wie gewählt', async () => {
    const { flaechenEinfuegen, flaechenKopieren, ablageStatus } = await import('./store');
    const p = createProject('Haus');
    const eg = p.storeys[0];
    const r1 = createRoom(rectPoints({ x: 0, y: 0 }, { x: 2, y: 2 }), '0.01', 'Wohnen');
    r1.wofl = { kategorie: 'voll', wohnung: 'EG' };
    const r2 = createRoom(rectPoints({ x: 3, y: 0 }, { x: 5, y: 2 }), '0.02', 'Bad');
    r2.wofl = { kategorie: 'voll', wohnung: 'EG' };
    eg.shapes.push(r1, r2);
    p.storeys.push({ ...createProject().storeys[0], name: '1. OG' });
    useEditor.getState().loadProject(p);
    useEditor.getState().selectMany([r1.id, r2.id]);
    flaechenKopieren();
    useEditor.getState().setActiveStorey(useEditor.getState().project.storeys[1].id);
    expect(ablageStatus().rueckfrage).toBe(true);
    flaechenEinfuegen({ nummernAnpassen: true, wohnung: 'WE 02' });
    const og = useEditor.getState().project.storeys[1].shapes;
    expect(og.map((s) => (s.kind === 'room' ? [s.nummer, s.wofl.wohnung] : null))).toEqual([
      ['1.01', 'WE 02'],
      ['1.02', 'WE 02'],
    ]);
  });

  it('ohne Anpassen bleiben Nummern und Wohnung; ins selbe Geschoss keine Rückfrage', async () => {
    const { flaechenEinfuegen, flaechenKopieren, ablageStatus } = await import('./store');
    const { b } = laden();
    useEditor.getState().select(b.id);
    flaechenKopieren();
    expect(ablageStatus().rueckfrage).toBe(false);
    flaechenEinfuegen();
    const shapes = useEditor.getState().project.storeys[0].shapes;
    expect(shapes[shapes.length - 1].kind === 'room' && shapes[shapes.length - 1]).toMatchObject({ nummer: '1' });
  });

  it('Duplikat heißt nach seiner Lage und nummeriert nach Wunsch neu', async () => {
    const { duplicateStorey } = await import('./store');
    const p = createProject('Haus');
    const r = createRoom(rectPoints({ x: 0, y: 0 }, { x: 2, y: 2 }), '0.01', 'Wohnen');
    r.wofl = { kategorie: 'voll', wohnung: 'WE 01' };
    p.storeys[0].shapes.push(r);
    const ohne = duplicateStorey(p, p.storeys[0].id);
    expect(ohne.project.storeys[1].name).toBe('1. OG');
    expect(ohne.project.storeys[1].shapes[0]).toMatchObject({ nummer: '0.01', wofl: { wohnung: 'WE 01' } });
    const mit = duplicateStorey(p, p.storeys[0].id, { nummernAnpassen: true, wohnung: 'WE 02' });
    expect(mit.project.storeys[1].shapes[0]).toMatchObject({ nummer: '1.01', wofl: { wohnung: 'WE 02' } });
  });
});

describe('Neues Geschoss (F-03)', () => {
  it('unter dem EG eingefügt heißt es KG und liegt eine Geschosshöhe tiefer; darüber 1. OG', async () => {
    const { addStorey } = await import('./store');
    const { storeyElevations } = await import('@core/model');
    const p = createProject('Haus');
    const unten = addStorey(p, undefined, p.storeys[0].id, 'darunter');
    expect(unten.project.storeys[0].name).toBe('KG');
    expect(storeyElevations(unten.project)).toEqual([-3, 0]);
    const oben = addStorey(unten.project, undefined, unten.project.storeys[1].id, 'darueber');
    expect(oben.project.storeys.map((s) => s.name)).toEqual(['KG', 'EG', '1. OG']);
  });
});

describe('Neues Geschoss mit Bezug zum darunterliegenden (F-18)', () => {
  it('Übernahme kopiert nur die Punkte – ohne Dach, Körperhöhe, Höhenversatz, Umschließung – und markiert „prüfen“', async () => {
    const { umrisseUebernehmen, geschossDarunter } = await import('../core/geschosse');
    const { addStorey } = await import('./store');
    const p = createProject('Haus');
    const o = { ...createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 })), umschliessung: 'S' as const, hoehe: 2.2, versatz: -0.5, ifcId: 'X' };
    o.dach = { typ: 'sattel', traufhoehe: 1, neigung: 40 };
    p.storeys[0].shapes.push(o);
    const r = addStorey(p, undefined, p.storeys[0].id, 'darueber');
    const og = r.project.storeys.find((s) => s.id === r.id)!;
    expect(geschossDarunter(r.project, og)?.name).toBe('EG');
    const [neu] = umrisseUebernehmen(geschossDarunter(r.project, og)!);
    expect(neu.points).toEqual(o.points);
    expect(neu.points).not.toBe(o.points);
    expect([neu.dach, neu.hoehe, neu.versatz, neu.umschliessung, neu.ifcId, neu.pruefen]).toEqual([undefined, undefined, undefined, 'R', undefined, true]);
  });
});

describe('Raumliste sortiert (F-21)', () => {
  it('natürliche Sortierung: 0.04 vor 1.01, 0.10 nach 0.09, ohne Nummer zuletzt', async () => {
    const { nachNummer } = await import('../core/geschosse');
    const r = (nummer: string) => ({ nummer });
    expect(nachNummer([r('1.01'), r('0.10'), r(''), r('0.04'), r('0.09'), r('-1.02'), r('-1.01')]).map((x) => x.nummer)).toEqual(['-1.01', '-1.02', '0.04', '0.09', '0.10', '1.01', '']);
  });
});

describe('Zwischenstand nach Neustart', () => {
  it('mit Änderungen gegenüber der Datei: ungespeichert – Öffnen/Neu fragen nach', () => {
    const { p, eg, b } = laden();
    const geaendert = mapShape(p, eg.id, b.id, (s) => ({ ...s, name: 'Wohnen/Essen' }));
    useEditor.getState().wiederherstellen(geaendert, p, 'C:/Projekte/Haus.oap');
    expect(useEditor.getState().dirty).toBe(true);
    expect(useEditor.getState().datei).toBe('C:/Projekte/Haus.oap');
  });

  it('unverändert gegenüber der Datei: gespeichert', () => {
    const { p } = laden();
    useEditor.getState().wiederherstellen(structuredClone(p), p, 'C:/Projekte/Haus.oap');
    expect(useEditor.getState().dirty).toBe(false);
  });

  it('ohne Datei: ungespeichert, sobald er Flächen enthält; ein leeres Projekt nicht', () => {
    const { p } = laden();
    useEditor.getState().wiederherstellen(p, null, null);
    expect(useEditor.getState().dirty).toBe(true);
    const leer = createProject();
    expect(projektLeer(leer)).toBe(true);
    useEditor.getState().wiederherstellen(leer, null, null);
    expect(useEditor.getState().dirty).toBe(false);
  });

  it('wird nicht übernommen, wenn inzwischen ein Projekt geöffnet wurde', () => {
    const { p } = laden();
    const vorher = useEditor.getState().project;
    const anderes = createProject('Anderes');
    expect(zwischenstandUebernehmen({ project: anderes, basis: null })).toBe(false);
    expect(useEditor.getState().project).toBe(vorher);
    expect(useEditor.getState().project.name).toBe(p.name);
  });

  it('beim Start übernommen und als ungespeichert markiert', () => {
    useEditor.setState({ dokument: 0, past: [], dirty: false });
    const p = createProject('Zwischenstand');
    p.storeys[0].shapes.push(createRoom(rectPoints({ x: 0, y: 0 }, { x: 3, y: 3 }), '1', 'Wohnen'));
    expect(zwischenstandUebernehmen({ project: JSON.parse(JSON.stringify(p)), basis: null, datei: null })).toBe(true);
    expect(useEditor.getState().project.name).toBe('Zwischenstand');
    expect(useEditor.getState().dirty).toBe(true);
  });
});
