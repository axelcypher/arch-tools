import { standNachSpeichern } from '@core/platform/projektDatei';
import { create } from 'zustand';
import type { Point } from '@core/geometry';
import type { Project, Shape, ShapeKind, Storey } from '@core/model';
import { createProject, createStorey, newId } from '@core/model';
import { parseProject, parseProjectData } from '@core/serialize';
import { logger } from '@core/platform/log';

const log = logger('autosave');

export type Tool = 'select' | 'polygon' | 'rect' | 'detect' | 'measure' | 'calibrate';

/** Importiertes IFC-Modell zur Anzeige in der 3D-Ansicht (nur für die Sitzung, nicht im Projekt gespeichert) */
export type { IfcReference } from '@core/platform/ifc';
import type { IfcReference } from '@core/platform/ifc';

export interface DetectSettings {
  /** größte zu schließende Öffnung in m (Türbreite) */
  gap: number;
  /** Bögen/Kreise aus DXF ignorieren (Türaufschläge) */
  skipArcs: boolean;
  /** Helligkeitsschwelle 0–255 für Rasterpläne */
  threshold: number;
  /** dünne Linien in Rasterplänen (Türaufschläge, Möbel) ignorieren, sofern der Raum geschlossen bleibt */
  ignoreThin: boolean;
}

export interface ViewOptions {
  showOutlines: boolean;
  showRooms: boolean;
  showBackground: boolean;
  showGhost: boolean;
  showDimensions: boolean;
  snapGrid: boolean;
  snapVertices: boolean;
  /** Hilfslinien: Verlängerung bestehender Kanten und Gebäudeachsen */
  snapGuides: boolean;
}

const HISTORY_LIMIT = 200;
const AUTOSAVE_KEY = 'arch-flaechen-tool:autosave';

interface EditorState {
  project: Project;
  /** Projekt beim letzten Öffnen/Speichern – Grundlage fürs Zusammenführen mit der Datei (siehe zusammenfuehren.ts) */
  basis: Project | null;
  /** Pfad (Desktop) bzw. Name (Browser) der geöffneten/zuletzt gespeicherten Projektdatei */
  datei: string | null;
  past: Project[];
  future: Project[];
  /** true, wenn seit dem letzten Speichern geändert */
  dirty: boolean;
  activeStoreyId: string;
  /** zuletzt gewählte Fläche (Eigenschaften, Eckpunkte) */
  selectedShapeId: string | null;
  /** alle gewählten Flächen des aktiven Geschosses (Mehrfachauswahl mit Umschalt) – enthält selectedShapeId */
  selectedIds: string[];
  tool: Tool;
  drawKind: ShapeKind;
  view: ViewOptions;
  /** Zähler, um der Zeichenfläche "Zoom auf alles" zu signalisieren */
  fitRequest: number;
  reportOpen: boolean;
  excelOpen: boolean;
  detect: DetectSettings;
  mainView: '2d' | '3d';
  ifcModel: IfcReference | null;

  /** Änderung mit Undo-Schritt */
  update: (fn: (p: Project) => Project) => void;
  /** Änderung ohne Undo-Schritt (z. B. während Ziehen – vorher checkpoint() aufrufen) */
  updateSilent: (fn: (p: Project) => Project) => void;
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;

  /** basis: Stand der Datei, aus der das Projekt stammt (null bei neuem Projekt); datei: deren Pfad bzw. Name */
  loadProject: (p: Project, basis?: Project | null, datei?: string | null) => void;
  newProject: () => void;
  /** nach dem Speichern: Datei und das gespeicherte (ggf. mit der Datei zusammengeführte) Projekt */
  markSaved: (gespeichert: Project, datei: string, vorher: Project) => void;

  setActiveStorey: (id: string) => void;
  select: (id: string | null) => void;
  /** Umschalt+Klick: Fläche zur Auswahl hinzufügen bzw. daraus entfernen */
  toggleSelect: (id: string) => void;
  /** Mehrfachauswahl setzen (z. B. Rahmen, Strg+A) */
  selectMany: (ids: string[]) => void;
  setTool: (t: Tool) => void;
  setDrawKind: (k: ShapeKind) => void;
  setView: (v: Partial<ViewOptions>) => void;
  requestFit: () => void;
  setReportOpen: (open: boolean) => void;
  setExcelOpen: (open: boolean) => void;
  setMainView: (v: '2d' | '3d') => void;
  setIfcModel: (m: IfcReference | null) => void;
  setDetect: (d: Partial<DetectSettings>) => void;
}

export const useEditor = create<EditorState>((set, get) => {
  const initial = loadAutosave() ?? createProject();
  return {
    project: initial,
    basis: null,
    datei: null,
    past: [],
    future: [],
    dirty: false,
    activeStoreyId: initial.storeys[0].id,
    selectedShapeId: null,
    selectedIds: [],
    tool: 'select',
    drawKind: 'outline',
    view: {
      showOutlines: true,
      showRooms: true,
      showBackground: true,
      showGhost: false,
      showDimensions: true,
      snapGrid: true,
      snapVertices: true,
      snapGuides: true,
    },
    fitRequest: 1,
    reportOpen: false,
    excelOpen: false,
    detect: loadDetectSettings(),
    mainView: '2d',
    ifcModel: null,

    update: (fn) => {
      const { project, past } = get();
      const next = fn(project);
      if (next === project) return;
      set({ project: next, past: [...past, project].slice(-HISTORY_LIMIT), future: [], dirty: true });
      fixSelection(set, get);
    },
    updateSilent: (fn) => {
      const next = fn(get().project);
      set({ project: next, dirty: true });
    },
    checkpoint: () => {
      const { project, past } = get();
      set({ past: [...past, project].slice(-HISTORY_LIMIT), future: [] });
    },
    undo: () => {
      const { past, project, future } = get();
      if (!past.length) return;
      set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future], dirty: true });
      fixSelection(set, get);
    },
    redo: () => {
      const { past, project, future } = get();
      if (!future.length) return;
      set({ project: future[0], past: [...past, project], future: future.slice(1), dirty: true });
      fixSelection(set, get);
    },

    loadProject: (p, basis = null, datei = null) => {
      set({
        project: p,
        basis,
        datei,
        past: [],
        future: [],
        dirty: false,
        activeStoreyId: p.storeys[0].id,
        selectedShapeId: null,
        selectedIds: [],
        tool: 'select',
        fitRequest: get().fitRequest + 1,
        ifcModel: null,
      });
    },
    newProject: () => get().loadProject(createProject()),
    markSaved: (gespeichert, datei, vorher) => {
      // Änderungen anderer Apps aus der Datei übernommen: neuer Ausgangspunkt, alte Schritte passen nicht mehr;
      // während des Speicherns weitergearbeitet: Änderungen aus der Datei in den aktuellen Stand übernehmen
      const n = standNachSpeichern(get().project, vorher, gespeichert);
      if (n.verlaufVerwerfen) set({ past: [], future: [] });
      set({ project: n.project, basis: gespeichert, datei, dirty: n.dirty });
      fixSelection(set, get);
    },

    setActiveStorey: (id) => set({ activeStoreyId: id, selectedShapeId: null, selectedIds: [] }),
    select: (id) => set({ selectedShapeId: id, selectedIds: id ? [id] : [] }),
    toggleSelect: (id) => {
      const ids = get().selectedIds;
      const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
      set({ selectedIds: next, selectedShapeId: next.length ? next[next.length - 1] : null });
    },
    selectMany: (ids) => set({ selectedIds: ids, selectedShapeId: ids.length ? ids[ids.length - 1] : null }),
    setTool: (t) => set({ tool: t }),
    setDrawKind: (k) => set({ drawKind: k }),
    setView: (v) => set({ view: { ...get().view, ...v } }),
    requestFit: () => set({ fitRequest: get().fitRequest + 1 }),
    setReportOpen: (open) => set({ reportOpen: open }),
    setExcelOpen: (open) => set({ excelOpen: open }),
    setMainView: (v) => set({ mainView: v }),
    setIfcModel: (m) => set({ ifcModel: m }),
    setDetect: (d) => {
      const detect = { ...get().detect, ...d };
      set({ detect });
      try {
        localStorage.setItem(DETECT_KEY, JSON.stringify(detect));
      } catch {
        // ignorieren
      }
    },
  };
});

function fixSelection(set: (s: Partial<EditorState>) => void, get: () => EditorState) {
  const { project, activeStoreyId, selectedShapeId, selectedIds } = get();
  const storey = project.storeys.find((s) => s.id === activeStoreyId) ?? project.storeys[0];
  const patch: Partial<EditorState> = {};
  if (storey.id !== activeStoreyId) patch.activeStoreyId = storey.id;
  const vorhanden = new Set(storey.shapes.map((s) => s.id));
  const ids = selectedIds.filter((id) => vorhanden.has(id));
  if (ids.length !== selectedIds.length) patch.selectedIds = ids;
  if (selectedShapeId && !vorhanden.has(selectedShapeId)) patch.selectedShapeId = ids.length ? ids[ids.length - 1] : null;
  if (Object.keys(patch).length) set(patch);
}

/* ---------- Selektoren ---------- */

export function useActiveStorey(): Storey {
  return useEditor((s) => s.project.storeys.find((st) => st.id === s.activeStoreyId) ?? s.project.storeys[0]);
}

/** alle gewählten Flächen des aktiven Geschosses */
export function useSelectedShapes(): Shape[] {
  const project = useEditor((s) => s.project);
  const activeStoreyId = useEditor((s) => s.activeStoreyId);
  const ids = useEditor((s) => s.selectedIds);
  const st = project.storeys.find((x) => x.id === activeStoreyId);
  return st ? st.shapes.filter((sh) => ids.includes(sh.id)) : [];
}

export function useSelectedShape(): Shape | null {
  return useEditor((s) => {
    const st = s.project.storeys.find((x) => x.id === s.activeStoreyId);
    return st?.shapes.find((sh) => sh.id === s.selectedShapeId) ?? null;
  });
}

/* ---------- Reine Projekt-Transformationen ---------- */

/** Geschoss ändern; ohne Änderung (oder unbekanntes Geschoss) bleibt das Projekt dasselbe Objekt – kein Undo-Schritt */
export function mapStorey(p: Project, storeyId: string, fn: (s: Storey) => Storey): Project {
  let geaendert = false;
  const storeys = p.storeys.map((s) => {
    if (s.id !== storeyId) return s;
    const n = fn(s);
    if (n !== s) geaendert = true;
    return n;
  });
  return geaendert ? { ...p, storeys } : p;
}

export function mapShape(p: Project, storeyId: string, shapeId: string, fn: (s: Shape) => Shape): Project {
  return mapStorey(p, storeyId, (st) => {
    let geaendert = false;
    const shapes = st.shapes.map((sh) => {
      if (sh.id !== shapeId) return sh;
      const n = fn(sh);
      if (n !== sh) geaendert = true;
      return n;
    });
    return geaendert ? { ...st, shapes } : st;
  });
}

export function setShapePoints(p: Project, storeyId: string, shapeId: string, points: Point[]): Project {
  return mapShape(p, storeyId, shapeId, (s) => ({ ...s, points }));
}

export function addStorey(p: Project, name: string): { project: Project; id: string } {
  const last = p.storeys[p.storeys.length - 1];
  const st = createStorey(name, last?.hoehe ?? 3);
  return { project: { ...p, storeys: [...p.storeys, st] }, id: st.id };
}

/** Kopiert ein Geschoss inkl. aller Flächen (neue IDs), z. B. für Regelgeschosse. */
export function duplicateStorey(p: Project, storeyId: string): { project: Project; id: string } {
  const idx = p.storeys.findIndex((s) => s.id === storeyId);
  if (idx < 0) return { project: p, id: storeyId };
  const src = p.storeys[idx];
  const copy: Storey = {
    ...structuredClone(src),
    id: newId('st'),
    name: `${src.name} (Kopie)`,
  };
  copy.shapes = copy.shapes.map((s) => ({ ...s, id: newId('sh') }));
  const storeys = [...p.storeys];
  storeys.splice(idx + 1, 0, copy);
  return { project: { ...p, storeys }, id: copy.id };
}

export function removeStorey(p: Project, storeyId: string): Project {
  if (p.storeys.length <= 1) return p;
  return { ...p, storeys: p.storeys.filter((s) => s.id !== storeyId) };
}

export function moveStorey(p: Project, storeyId: string, delta: -1 | 1): Project {
  const i = p.storeys.findIndex((s) => s.id === storeyId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= p.storeys.length) return p;
  const storeys = [...p.storeys];
  [storeys[i], storeys[j]] = [storeys[j], storeys[i]];
  return { ...p, storeys };
}

/** Nächste freie Raumnummer im Geschoss, z. B. "0.03". */
export function nextRoomNumber(p: Project, storey: Storey): string {
  const idx = p.storeys.findIndex((s) => s.id === storey.id);
  const rooms = storey.shapes.filter((s) => s.kind === 'room').length;
  return `${Math.max(0, idx)}.${String(rooms + 1).padStart(2, '0')}`;
}

/* ---------- Einstellungen & Autosave ---------- */

const DETECT_KEY = 'arch-flaechen-tool:detect';

function loadDetectSettings(): DetectSettings {
  const d: DetectSettings = { gap: 1.1, skipArcs: true, threshold: 200, ignoreThin: true };
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(DETECT_KEY) ?? '{}') };
  } catch {
    return d;
  }
}

/** Mitgespeichertes IFC-Modell im Hintergrund wieder für die 3D-Ansicht aufbereiten */
export async function restoreIfcModel(p: Project) {
  const ifc = p.dateien?.filter((d) => d.art === 'ifc').pop();
  if (!ifc) return;
  try {
    const { loadIfc, ifcReference } = await import('@core/platform/ifc');
    const x = await loadIfc(ifc.daten.slice());
    if (useEditor.getState().project === p) useEditor.getState().setIfcModel(ifcReference(x, ifc.name));
  } catch {
    // nur Anzeige – das Projekt selbst ist vollständig geladen
  }
}

/*
 * Autosave in IndexedDB (deutlich mehr Platz als localStorage – wichtig bei Planbildern).
 * Beim Start wird der letzte Stand asynchron geladen, solange noch nichts bearbeitet wurde.
 */

const DB_NAME = 'arch-flaechen-tool';
const STORE = 'autosave';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<unknown> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function loadAutosave(): Project | null {
  // Altbestand aus localStorage (Version 0.1) – wird beim nächsten Speichern nach IndexedDB übernommen
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? parseProject(raw) : null;
  } catch {
    return null;
  }
}

if (typeof indexedDB !== 'undefined') {
  idbGet(AUTOSAVE_KEY)
    .then((raw) => {
      const st = useEditor.getState();
      if (!raw || st.past.length || st.dirty) return;
      // bis 0.2 als JSON-Text, bis 0.10 als Projekt, seither mit Basis fürs Zusammenführen
      const mitBasis = typeof raw === 'object' && raw !== null && 'project' in raw ? (raw as { project: unknown; basis: unknown; datei?: unknown }) : null;
      const p = typeof raw === 'string' ? parseProject(raw) : parseProjectData(mitBasis ? mitBasis.project : raw);
      st.loadProject(p, mitBasis?.basis ? parseProjectData(mitBasis.basis) : null, typeof mitBasis?.datei === 'string' ? mitBasis.datei : null);
      void restoreIfcModel(p);
      log.info('Zwischenstand wiederhergestellt', { name: p.name, geschosse: p.storeys.length });
    })
    .catch((e) => {
      // kein Autosave vorhanden oder nicht lesbar
      log.warn('Zwischenstand konnte nicht gelesen werden', e);
    });
}

let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
useEditor.subscribe((s, prev) => {
  if (s.project === prev.project && s.basis === prev.basis && s.datei === prev.datei) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    const { project, basis, datei } = useEditor.getState();
    idbSet(AUTOSAVE_KEY, { project, basis, datei })
      .then(() => {
        try {
          localStorage.removeItem(AUTOSAVE_KEY);
        } catch {
          // ignorieren
        }
      })
      .catch((e) => {
        // Autosave ist nur ein Komfortmerkmal
        log.warn('Zwischenspeichern fehlgeschlagen', e);
      });
  }, 600);
});

/* ---------- Kopieren, Einfügen, Duplizieren, mit Pfeiltasten verschieben ---------- */

/** Zwischenablage für Flächen (innerhalb der App; Geschoss der Quelle, um beim Einfügen zu versetzen) */
let ablage: { storeyId: string; shapes: Shape[] } | null = null;

function gewaehlteFlaechen(): { storey: Storey; shapes: Shape[] } {
  const st = useEditor.getState();
  const storey = st.project.storeys.find((s) => s.id === st.activeStoreyId) ?? st.project.storeys[0];
  const ids = st.selectedIds.length ? st.selectedIds : st.selectedShapeId ? [st.selectedShapeId] : [];
  return { storey, shapes: storey.shapes.filter((s) => ids.includes(s.id)) };
}

/** Kopie mit neuer Kennung, ohne IFC-Herkunft (eine Kopie ist kein Element des Modells), optional versetzt */
function kopie(s: Shape, dx = 0, dy = 0): Shape {
  const c = structuredClone(s);
  c.id = newId(s.kind === 'room' ? 'room' : 'ol');
  delete c.ifcId;
  delete c.ifcStand;
  c.points = c.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  return c;
}

/** Gewählte Flächen in die Zwischenablage (Strg+C); liefert die Anzahl */
export function flaechenKopieren(): number {
  const { storey, shapes } = gewaehlteFlaechen();
  if (!shapes.length) return 0;
  ablage = { storeyId: storey.id, shapes: structuredClone(shapes) };
  return shapes.length;
}

/** Ablage ins aktive Geschoss einfügen (Strg+V): in ein anderes Geschoss deckungsgleich, ins selbe um 0,50 m versetzt */
export function flaechenEinfuegen(): number {
  if (!ablage?.shapes.length) return 0;
  const st = useEditor.getState();
  const storey = st.project.storeys.find((s) => s.id === st.activeStoreyId) ?? st.project.storeys[0];
  const d = storey.id === ablage.storeyId ? 0.5 : 0;
  const neu = ablage.shapes.map((s) => kopie(s, d, d));
  // mehrfaches Einfügen ins selbe Geschoss staffelt weiter
  if (d) ablage = { storeyId: storey.id, shapes: neu.map((s) => structuredClone(s)) };
  st.update((p) => mapStorey(p, storey.id, (s) => ({ ...s, shapes: [...s.shapes, ...neu] })));
  st.selectMany(neu.map((s) => s.id));
  return neu.length;
}

/** Gewählte Flächen duplizieren (Strg+D), um 0,50 m versetzt */
export function flaechenDuplizieren(): number {
  const { storey, shapes } = gewaehlteFlaechen();
  if (!shapes.length) return 0;
  const neu = shapes.map((s) => kopie(s, 0.5, 0.5));
  const st = useEditor.getState();
  st.update((p) => mapStorey(p, storey.id, (s) => ({ ...s, shapes: [...s.shapes, ...neu] })));
  st.selectMany(neu.map((s) => s.id));
  return neu.length;
}

/** Gewählte Flächen verschieben (Pfeiltasten) – zusammenhängende Schritte ergeben einen Undo-Schritt */
let letzterSchritt = 0;
export function auswahlVerschieben(dx: number, dy: number): void {
  const { storey, shapes } = gewaehlteFlaechen();
  if (!shapes.length) return;
  const ids = new Set(shapes.map((s) => s.id));
  const st = useEditor.getState();
  const jetzt = Date.now();
  if (jetzt - letzterSchritt > 800) st.checkpoint();
  letzterSchritt = jetzt;
  st.updateSilent((p) => mapStorey(p, storey.id, (s) => ({ ...s, shapes: s.shapes.map((x) => (ids.has(x.id) ? { ...x, points: x.points.map((q) => ({ x: q.x + dx, y: q.y + dy })) } : x)) })));
}
