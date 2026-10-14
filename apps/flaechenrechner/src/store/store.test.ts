import { describe, expect, it } from 'vitest';
import { rectPoints } from '@core/geometry';
import { createOutline, createProject, createRoom } from '@core/model';
import { mapShape, useEditor } from './store';

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
