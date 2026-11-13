import { standNachSpeichern } from '@core/platform/projektDatei';
import { create } from 'zustand';
import type { Point } from '@core/geometry';
import type { Project, Shape, ShapeKind, Storey } from '@core/model';
import { createProject, createStorey, leereMeta, newId } from '@core/model';
import { parseProject, parseProjectData } from '@core/serialize';
import { gleich } from '@core/zusammenfuehren';
import { logger } from '@core/platform/log';
import { vorDemSchliessen } from '@core/platform/rahmen';
import { zwischenstandErsetzt, zwischenstandLadenErlaubt, zwischenstandWirdGeladen } from '@core/platform/startschutz';
import type { KopieOptionen, Lage } from '../core/geschosse';
import { geschossNameVorschlag, kopieAnpassen, naechsteRaumnummer, neueKote, raumNummernPraefix } from '../core/geschosse';

const log = logger('autosave');

export type Tool = 'select' | 'polygon' | 'rect' | 'detect' | 'measure' | 'calibrate' | 'kontrolle';

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
  /** Dachflächen und Höhenlinien 1 m / 2 m lichte Höhe unter Dachformen (F-12) */
  showHoehenlinien: boolean;
}

const HISTORY_LIMIT = 200;
const AUTOSAVE_KEY = 'arch-flaechen-tool:autosave';
/** Startschutz: nach einem Absturz beim letzten Laden wird der Zwischenstand nicht erneut geladen */
const APP = 'arch-flaechen-tool';

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
  /** zählt bei jedem Laden/Neu weiter – ein Speichern, das erst danach fertig wird, gehört zum alten Dokument */
  dokument: number;
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
  /** IFC-Import-Dialog offen (Werkzeugleiste, Einstieg auf der leeren Zeichenfläche) */
  ifcOpen: boolean;
  /** Zeichenfläche hat einen Entwurf (Punkte, Messung, Kalibrierstrecke): Rückgängig nimmt zuerst dort zurück */
  entwurf: boolean;
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
  /**
   * Zwischenstand nach einem Neustart übernehmen: wie loadProject, aber ungespeichert, wenn er von der Datei
   * (basis) abweicht bzw. – ohne Datei – nicht leer ist. So fragen Öffnen/Neu/Schließen vor dem Verwerfen nach.
   */
  wiederherstellen: (p: Project, basis: Project | null, datei: string | null) => void;
  newProject: () => void;
  /** nach dem Speichern: Datei und das gespeicherte (ggf. mit der Datei zusammengeführte) Projekt */
  markSaved: (gespeichert: Project, datei: string, vorher: Project, dokument: number) => void;

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
  setIfcOpen: (open: boolean) => void;
  setEntwurf: (aktiv: boolean) => void;
  setMainView: (v: '2d' | '3d') => void;
  setIfcModel: (m: IfcReference | null) => void;
  setDetect: (d: Partial<DetectSettings>) => void;
}

export const useEditor = create<EditorState>((set, get) => {
  const altbestand = loadAutosave();
  const initial = altbestand ?? createProject();
  return {
    project: initial,
    basis: null,
    datei: null,
    past: [],
    future: [],
    // Altbestand aus localStorage hat keine Datei: ungespeichert, sobald er etwas enthält
    dirty: !!altbestand && !projektLeer(altbestand),
    dokument: 0,
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
      showHoehenlinien: true,
    },
    fitRequest: 1,
    reportOpen: false,
    excelOpen: false,
    ifcOpen: false,
    entwurf: false,
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
        dokument: get().dokument + 1,
        activeStoreyId: p.storeys[0].id,
        selectedShapeId: null,
        selectedIds: [],
        tool: 'select',
        // ein neues bzw. anderes Projekt beginnt mit dem BGF-Umriss, nicht mit der Zeichenart des vorigen (F-24)
        drawKind: 'outline',
        fitRequest: get().fitRequest + 1,
        ifcModel: null,
      });
    },
    wiederherstellen: (p, basis, datei) => {
      get().loadProject(p, basis, datei);
      const dirty = basis ? !gleich(p, basis) : !projektLeer(p);
      if (dirty) log.info('Ungespeicherter Zwischenstand wiederhergestellt', { datei });
      set({ dirty });
    },
    newProject: () => get().loadProject(createProject()),
    markSaved: (gespeichert, datei, vorher, dokument) => {
      // inzwischen ein anderes Projekt geladen: Ergebnis nicht auf das neue Dokument übertragen
      if (dokument !== get().dokument) {
        log.info('Speichern beendet, inzwischen anderes Projekt geöffnet – Ergebnis gehört zum vorigen', { datei });
        return;
      }
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
    setIfcOpen: (open) => set({ ifcOpen: open }),
    setEntwurf: (aktiv) => set({ entwurf: aktiv }),
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

/**
 * Neues Geschoss. Ohne Bezug ganz oben; mit Bezug darüber bzw. darunter (Höhe wie das Bezugsgeschoss, Kote aus
 * dessen Fußboden – darunter ausdrücklich, damit die Geschosse darüber ihre Höhenlage behalten). Ohne Namen ein
 * Vorschlag nach der Lage (KG, EG, 1. OG …).
 */
export function addStorey(p: Project, name?: string, bezugId?: string, lage: Lage = 'darueber'): { project: Project; id: string } {
  const idx = bezugId ? p.storeys.findIndex((s) => s.id === bezugId) : p.storeys.length - 1;
  const bezug = p.storeys[idx];
  if (!bezug) {
    const st = createStorey(name ?? 'EG', 3);
    return { project: { ...p, storeys: [...p.storeys, st] }, id: st.id };
  }
  const st = createStorey(name ?? geschossNameVorschlag(p, bezug, lage), bezug.hoehe);
  if (lage === 'darunter') st.elevation = neueKote(p, bezug, lage, st.hoehe);
  const storeys = [...p.storeys];
  storeys.splice(lage === 'darueber' ? idx + 1 : idx, 0, st);
  return { project: { ...p, storeys }, id: st.id };
}

/**
 * Kopiert ein Geschoss inkl. aller Flächen (neue IDs), z. B. für Regelgeschosse. Die Kopie ist kein Element des
 * IFC-Modells: ohne GlobalId und Vergleichsstand – sonst hielte ein späterer Abgleich sie für das Original.
 * `ziel`: Name und Lage (über bzw. unter dem Original); ohne Angabe darüber mit Namen nach der Lage.
 */
export function duplicateStorey(
  p: Project,
  storeyId: string,
  o: KopieOptionen = { nummernAnpassen: false, wohnung: null },
  ziel: { name?: string; lage?: Lage } = {},
): { project: Project; id: string } {
  const lage = ziel.lage ?? 'darueber';
  const idx = p.storeys.findIndex((s) => s.id === storeyId);
  if (idx < 0) return { project: p, id: storeyId };
  const src = p.storeys[idx];
  // Name nach der Lage (über dem EG „1. OG“) statt „EG (Kopie)“; eigenes Nummernpräfix entfällt (gilt fürs Original)
  const copy: Storey = {
    ...structuredClone(src),
    id: newId('st'),
    name: ziel.name?.trim() || geschossNameVorschlag(p, src, lage),
  };
  delete copy.ifcId;
  delete copy.ifcStand;
  delete copy.nummernPraefix;
  delete copy.elevation;
  // darunter: Fußbodenhöhe aus der Höhe der Kopie (wie „Geschoss …“ unter einem Geschoss)
  if (lage === 'darunter') copy.elevation = neueKote(p, src, lage, copy.hoehe);
  copy.shapes = copy.shapes.map((s) => {
    const { ifcId: _id, ifcStand: _stand, ...rest } = s;
    void _id;
    void _stand;
    return { ...rest, id: newId('sh') } as Shape;
  });
  const storeys = [...p.storeys];
  storeys.splice(lage === 'darueber' ? idx + 1 : idx, 0, copy);
  const project = { ...p, storeys };
  copy.shapes = kopieAnpassen(copy.shapes, raumNummernPraefix(project, copy), [], o);
  return { project, id: copy.id };
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

/** Nächste Raumnummer im Geschoss, z. B. "0.03" – höchste vorhandene + 1 (siehe core/geschosse.ts) */
export const nextRoomNumber = naechsteRaumnummer;

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
    // z. B. Speicherplatz voll beim Abschluss: ohne onabort bliebe das Schreiben (und alles danach) für immer offen
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaktion abgebrochen', 'AbortError'));
  });
}

function loadAutosave(): Project | null {
  // Altbestand aus localStorage (Version 0.1) – wird beim nächsten Speichern nach IndexedDB übernommen
  if (!zwischenstandLadenErlaubt(APP)) return null;
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const p = parseProject(raw);
    zwischenstandWirdGeladen(APP);
    return p;
  } catch {
    return null;
  }
}

/** leeres Projekt wie nach „Neu“: keine Flächen, kein Plan, nur ein Geschoss, ohne Name und Stammdaten */
export function projektLeer(p: Project): boolean {
  return p.storeys.length <= 1 && !p.storeys.some((s) => s.shapes.length || s.background) && !p.dateien?.length && p.name === createProject().name && gleich(p.meta, leereMeta());
}

/**
 * Gespeicherten Zwischenstand (IndexedDB) übernehmen – nur, solange seit dem Start weder bearbeitet noch ein
 * anderes Projekt geöffnet wurde (ein langsames Lesen überschreibt sonst das gewählte Projekt).
 * Formate: bis 0.2 JSON-Text, bis 0.10 das Projekt, seither { project, basis, datei } fürs Zusammenführen.
 * Gibt zurück, ob übernommen wurde.
 */
export function zwischenstandUebernehmen(raw: unknown): boolean {
  const st = useEditor.getState();
  if (!raw || st.past.length || st.dirty || st.dokument !== 0) return false;
  const mitBasis = typeof raw === 'object' && raw !== null && 'project' in raw ? (raw as { project: unknown; basis: unknown; datei?: unknown }) : null;
  const p = typeof raw === 'string' ? parseProject(raw) : parseProjectData(mitBasis ? mitBasis.project : raw);
  const basis = mitBasis?.basis ? parseProjectData(mitBasis.basis) : null;
  zwischenstandWirdGeladen(APP);
  st.wiederherstellen(p, basis, typeof mitBasis?.datei === 'string' ? mitBasis.datei : null);
  void restoreIfcModel(p);
  log.info('Zwischenstand wiederhergestellt', { name: p.name, geschosse: p.storeys.length });
  return true;
}

if (typeof indexedDB !== 'undefined' && zwischenstandLadenErlaubt(APP)) {
  idbGet(AUTOSAVE_KEY)
    .then(zwischenstandUebernehmen)
    .catch((e) => {
      // kein Autosave vorhanden oder nicht lesbar
      log.warn('Zwischenstand konnte nicht gelesen werden', e);
    });
}

/** Verzögerung des Zwischenspeicherns nach einer Änderung */
const AUTOSAVE_MS = 600;
/** so lange darf ein einzelnes Schreiben dauern, bevor es als gescheitert gilt – ein hängendes blockiert sonst die Kette */
const SCHREIBEN_MAX_MS = 10_000;

/** Wird eine Transaktion nach dem Zeitlimit doch noch fertig, bleibt die Reihenfolge richtig: IndexedDB führt
 *  readwrite-Transaktionen auf denselben Store in der Reihenfolge ihres Anlegens aus. */
function mitZeitlimit<T>(arbeit: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((ok, fehler) => {
    const uhr = setTimeout(() => fehler(new Error(`Zwischenspeichern dauerte länger als ${ms} ms`)), ms);
    arbeit.then(
      (w) => (clearTimeout(uhr), ok(w)),
      (e) => (clearTimeout(uhr), fehler(e)),
    );
  });
}
let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
/** laufendes Schreiben des Zwischenstands (bis es fertig ist) */
let laufend: Promise<boolean> | null = null;
/** ist das letzte Schreiben gescheitert? Dann ist der aktuelle Stand nicht gesichert. Setzt sich nicht von selbst zurück:
 *  neu geschrieben wird mit der nächsten Änderung oder beim nächsten Aufruf vor dem Schließen. */
let letztesGescheitert = false;

/**
 * aktuellen Stand in IndexedDB schreiben – hinter ein laufendes Schreiben gehängt, damit die Reihenfolge stimmt.
 * Liefert, ob es geklappt hat (ein Fehler wird protokolliert, nicht geworfen).
 */
function zwischenstandSchreiben(): Promise<boolean> {
  const davor = laufend ?? Promise.resolve(true);
  const p: Promise<boolean> = davor
    .then(() => {
      const { project, basis, datei } = useEditor.getState();
      return mitZeitlimit(idbSet(AUTOSAVE_KEY, { project, basis, datei }), SCHREIBEN_MAX_MS);
    })
    .then(() => {
      zwischenstandErsetzt(APP);
      try {
        localStorage.removeItem(AUTOSAVE_KEY);
      } catch {
        // ignorieren
      }
      letztesGescheitert = false;
      return true;
    })
    .catch((e) => {
      log.warn('Zwischenspeichern fehlgeschlagen', e);
      letztesGescheitert = true;
      return false;
    })
    .finally(() => {
      if (laufend === p) laufend = null;
    });
  laufend = p;
  return p;
}

/**
 * Vor dem Schließen (Arkly, `vorDemSchliessen`): ausstehendes Zwischenspeichern sofort ausführen und abwarten.
 * `false`, wenn der Stand nicht gesichert ist – Arkly fragt dann „… konnte nicht speichern“, statt still zu schließen.
 * Mehrfach aufrufbar: Ein laufendes Schreiben wird abgewartet statt doppelt geschrieben; ist das letzte gescheitert,
 * wird neu geschrieben (etwa nach „Erneut versuchen“).
 */
export function zwischenstandSichern(): Promise<boolean> {
  if (autosaveTimer !== undefined) {
    clearTimeout(autosaveTimer);
    autosaveTimer = undefined;
    return zwischenstandSchreiben();
  }
  if (laufend) return laufend;
  return letztesGescheitert ? zwischenstandSchreiben() : Promise.resolve(true);
}

useEditor.subscribe((s, prev) => {
  if (s.project === prev.project && s.basis === prev.basis && s.datei === prev.datei) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    autosaveTimer = undefined;
    void zwischenstandSchreiben();
  }, AUTOSAVE_MS);
});
const abmelden = vorDemSchliessen(zwischenstandSichern);
// Entwicklung (Vite-HMR): die alte Fassung abmelden, sonst bleibt sie angemeldet
import.meta.hot?.dispose(abmelden);

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
  if (c.stempel) c.stempel = { x: c.stempel.x + dx, y: c.stempel.y + dy };
  return c;
}

/** Gewählte Flächen in die Zwischenablage (Strg+C); liefert die Anzahl */
export function flaechenKopieren(): number {
  const { storey, shapes } = gewaehlteFlaechen();
  if (!shapes.length) return 0;
  ablage = { storeyId: storey.id, shapes: structuredClone(shapes) };
  return shapes.length;
}

/** Liegt etwas zum Einfügen bereit? Rückfrage nötig: Räume, die in ein anderes Geschoss eingefügt würden (F-02) */
export function ablageStatus(): { leer: boolean; rueckfrage: boolean } {
  if (!ablage?.shapes.length) return { leer: true, rueckfrage: false };
  const st = useEditor.getState();
  const anderes = ablage.storeyId !== st.activeStoreyId;
  return { leer: false, rueckfrage: anderes && ablage.shapes.some((s) => s.kind === 'room') };
}

/**
 * Ablage ins aktive Geschoss einfügen (Strg+V): in ein anderes Geschoss deckungsgleich, ins selbe um 0,50 m versetzt.
 * In ein anderes Geschoss mit Optionen (Nummern anpassen, Wohnung); ins selbe Geschoss bleiben die Nummern.
 */
export function flaechenEinfuegen(o?: KopieOptionen): number {
  if (!ablage?.shapes.length) return 0;
  const st = useEditor.getState();
  const storey = st.project.storeys.find((s) => s.id === st.activeStoreyId) ?? st.project.storeys[0];
  const d = storey.id === ablage.storeyId ? 0.5 : 0;
  let neu = ablage.shapes.map((s) => kopie(s, d, d));
  if (o && !d) neu = kopieAnpassen(neu, raumNummernPraefix(st.project, storey), storey.shapes, o);
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

/** Gewählte Flächen des aktiven Geschosses löschen (Entf, Kontextmenü); liefert die Anzahl */
export function flaechenLoeschen(): number {
  const { storey, shapes } = gewaehlteFlaechen();
  if (!shapes.length) return 0;
  const ids = new Set(shapes.map((s) => s.id));
  const st = useEditor.getState();
  st.update((p) => mapStorey(p, storey.id, (s) => ({ ...s, shapes: s.shapes.filter((x) => !ids.has(x.id)) })));
  st.select(null);
  return shapes.length;
}

/** Zwischenablage leeren (für Tests; Kopieren zwischen Projekten bleibt möglich) */
export function ablageLeeren() {
  ablage = null;
}

/**
 * Gewählte Flächen verschieben (Pfeiltasten) – zusammenhängende Schritte ergeben einen Undo-Schritt. Zusammenhängend
 * heißt: kurz hintereinander und das Projekt ist noch das Ergebnis des letzten Schritts (kein Rückgängig dazwischen).
 */
let letzterSchritt = 0;
let nachSchritt: Project | null = null;
export function auswahlVerschieben(dx: number, dy: number): void {
  const { storey, shapes } = gewaehlteFlaechen();
  if (!shapes.length) return;
  const ids = new Set(shapes.map((s) => s.id));
  const st = useEditor.getState();
  const jetzt = Date.now();
  if (jetzt - letzterSchritt > 800 || st.project !== nachSchritt) st.checkpoint();
  letzterSchritt = jetzt;
  st.updateSilent((p) =>
    mapStorey(p, storey.id, (s) => ({
      ...s,
      shapes: s.shapes.map((x) =>
        ids.has(x.id) ? { ...x, points: x.points.map((q) => ({ x: q.x + dx, y: q.y + dy })), ...(x.stempel ? { stempel: { x: x.stempel.x + dx, y: x.stempel.y + dy } } : {}) } : x,
      ),
    })),
  );
  nachSchritt = useEditor.getState().project;
}

/** von der Zeichenfläche angemeldet: nimmt den letzten Entwurfsschritt zurück; false, wenn kein Entwurf läuft */
let entwurfZurueck: (() => boolean) | null = null;

export function entwurfZuruecknehmenAnmelden(fn: (() => boolean) | null) {
  entwurfZurueck = fn;
}

/** Strg+Z bzw. ↶: zuerst den laufenden Entwurf (letzter Punkt), erst danach den letzten fertigen Schritt */
export function rueckgaengig() {
  // nur, wenn die Zeichenfläche sichtbar ist – in der 3D-Ansicht wirkt Rückgängig auf das Projekt
  if (useEditor.getState().mainView === '2d' && entwurfZurueck?.()) return;
  useEditor.getState().undo();
}
