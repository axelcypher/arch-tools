import { standNachSpeichern } from '@core/platform/projektDatei';
import { create } from 'zustand';
import type { LageplanFlaeche, MassNutzung, Project } from '@core/model';
import { createProject, newId } from '@core/model';
import { parseProjectData } from '@core/serialize';
import { logger } from '@core/platform/log';
import { zwischenstandErsetzt, zwischenstandLadenErlaubt, zwischenstandWirdGeladen } from '@core/platform/startschutz';

/**
 * Zustand des GRZ-Nachweises: das Projekt im gemeinsamen Format (.oap) – Gebäude und Geschosse
 * kommen aus dem Flächenrechner bzw. der IFC, Lageplan und Festsetzungen pflegt dieses Tool.
 */

const log = logger('projekt');
const HISTORY = 100;

export type Werkzeug = 'auswahl' | 'polygon' | 'rechteck';

interface GrzState {
  project: Project;
  /** Dateiname beim letzten Öffnen/Speichern */
  datei: string | null;
  /** Projekt beim letzten Öffnen/Speichern – Grundlage fürs Zusammenführen mit der Datei (siehe zusammenfuehren.ts) */
  basis: Project | null;
  dirty: boolean;
  /** zählt bei jedem Laden/Neu weiter – ein Speichern, das erst danach fertig wird, gehört zum alten Dokument */
  dokument: number;
  past: Project[];
  future: Project[];
  /** zuletzt gewählte Lageplan-Fläche (Eigenschaften, Eckpunkte) */
  selected: string | null;
  /** alle gewählten Lageplan-Flächen (Mehrfachauswahl mit Umschalt) – enthält selected */
  selectedIds: string[];
  werkzeug: Werkzeug;

  /** basis: Stand der Datei, aus der das Projekt stammt (null bei IFC-Import bzw. neuem Projekt) */
  load: (p: Project, datei?: string | null, basis?: Project | null) => void;
  /** zusammenfassen: aufeinanderfolgende Änderungen mit gleichem Schlüssel (z. B. Pfeiltasten) = ein Undo-Schritt */
  update: (fn: (p: Project) => Project, zusammenfassen?: string) => void;
  undo: () => void;
  redo: () => void;
  /** nach dem Speichern: Dateiname und das gespeicherte (ggf. mit der Datei zusammengeführte) Projekt */
  /** nach dem Speichern: Datei, gespeichertes Projekt und der Stand, der gespeichert wurde */
  markSaved: (datei: string, gespeichert: Project, vorher: Project, dokument: number) => void;
  select: (id: string | null) => void;
  /** Umschalt+Klick: Fläche zur Auswahl hinzufügen bzw. daraus entfernen */
  toggleSelect: (id: string) => void;
  selectMany: (ids: string[]) => void;
  setWerkzeug: (w: Werkzeug) => void;
}

let letzteAenderung: { schluessel?: string; zeit: number; ergebnis?: Project } = { zeit: 0 };

export const useGrz = create<GrzState>()((set, get) => ({
  project: createProject('Neues Projekt'),
  datei: null,
  basis: null,
  dirty: false,
  past: [],
  dokument: 0,
  future: [],
  selected: null,
  selectedIds: [],
  werkzeug: 'auswahl',

  load: (p, datei = null, basis = null) => {
    log.info(`Projekt geladen: ${p.name}`, { geschosse: p.storeys.length, lageplan: p.lageplan?.flaechen.length ?? 0 });
    set({ project: p, datei, basis, dirty: false, dokument: get().dokument + 1, past: [], future: [], selected: null, selectedIds: [], werkzeug: 'auswahl' });
  },
  update: (fn, zusammenfassen) => {
    const { project, past } = get();
    const next = fn(project);
    if (next === project) return;
    const jetzt = Date.now();
    // zusammenhängend nur, wenn seitdem nichts anderes geschah (auch kein Rückgängig)
    const anschluss =
      zusammenfassen !== undefined && letzteAenderung.schluessel === zusammenfassen && jetzt - letzteAenderung.zeit < 800 && letzteAenderung.ergebnis === project && past.length > 0;
    letzteAenderung = { schluessel: zusammenfassen, zeit: jetzt, ergebnis: next };
    set({ project: next, past: anschluss ? past : [...past, project].slice(-HISTORY), future: [], dirty: true });
    auswahlBereinigen(set, get);
  },
  undo: () => {
    const { past, project, future } = get();
    if (!past.length) return;
    set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future], dirty: true });
    auswahlBereinigen(set, get);
  },
  redo: () => {
    const { past, project, future } = get();
    if (!future.length) return;
    set({ project: future[0], past: [...past, project], future: future.slice(1), dirty: true });
    auswahlBereinigen(set, get);
  },
  markSaved: (datei, gespeichert, vorher, dokument) => {
    // inzwischen ein anderes Projekt geladen: Ergebnis nicht auf das neue Dokument übertragen
    if (dokument !== get().dokument) {
      log.info('Speichern beendet, inzwischen anderes Projekt geöffnet – Ergebnis gehört zum vorigen', { datei });
      return;
    }
    // Änderungen anderer Apps aus der Datei übernommen: neuer Ausgangspunkt, alte Schritte passen nicht mehr
    const n = standNachSpeichern(get().project, vorher, gespeichert);
    if (n.verlaufVerwerfen) set({ past: [], future: [] });
    set({ project: n.project, dirty: n.dirty, datei, basis: gespeichert });
  },
  select: (id) => set({ selected: id, selectedIds: id ? [id] : [] }),
  toggleSelect: (id) => {
    const ids = get().selectedIds;
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    set({ selectedIds: next, selected: next.length ? next[next.length - 1] : null });
  },
  selectMany: (ids) => set({ selectedIds: ids, selected: ids.length ? ids[ids.length - 1] : null }),
  setWerkzeug: (w) => set({ werkzeug: w }),
}));

/** gewählte Flächen, die es nicht mehr gibt (gelöscht, Rückgängig), aus der Auswahl nehmen */
function auswahlBereinigen(set: (s: Partial<GrzState>) => void, get: () => GrzState) {
  const { project, selected, selectedIds } = get();
  const da = new Set((project.lageplan?.flaechen ?? []).map((f) => f.id));
  const ids = selectedIds.filter((id) => da.has(id));
  if (ids.length !== selectedIds.length || (selected && !da.has(selected))) set({ selectedIds: ids, selected: selected && da.has(selected) ? selected : (ids[ids.length - 1] ?? null) });
}

/* ---------- Änderungen am Projekt ---------- */

export function setMassNutzung(p: Project, patch: Partial<MassNutzung>): Project {
  const next: MassNutzung = { ...(p.massNutzung ?? {}), ...patch };
  for (const k of Object.keys(next) as (keyof MassNutzung)[]) if (next[k] === undefined) delete next[k];
  return { ...p, massNutzung: next };
}

export function mapFlaeche(p: Project, id: string, fn: (f: LageplanFlaeche) => LageplanFlaeche): Project {
  const flaechen = p.lageplan?.flaechen ?? [];
  return { ...p, lageplan: { ...p.lageplan, flaechen: flaechen.map((f) => (f.id === id ? fn(f) : f)) } };
}

export function addFlaeche(p: Project, f: LageplanFlaeche): Project {
  return { ...p, lageplan: { ...p.lageplan, flaechen: [...(p.lageplan?.flaechen ?? []), f] } };
}

export function removeFlaeche(p: Project, id: string | string[]): Project {
  const weg = new Set(Array.isArray(id) ? id : [id]);
  return { ...p, lageplan: { ...p.lageplan, flaechen: (p.lageplan?.flaechen ?? []).filter((f) => !weg.has(f.id)) } };
}

/* ---------- Zwischenspeicher (IndexedDB) ---------- */

const DB = 'grz-nachweis';
const STORE = 'autosave';
const KEY = 'projekt';

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

if (typeof indexedDB !== 'undefined') {
  // nach einem Absturz beim letzten Laden nicht erneut laden (Startschutz)
  if (zwischenstandLadenErlaubt(DB))
    void db()
      .then(
        (d) =>
          new Promise<unknown>((resolve, reject) => {
            const req = d.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          }),
      )
      .then((raw) => {
        const st = useGrz.getState();
        if (!raw || st.dirty || st.past.length) return;
        const r = raw as { project: unknown; datei: string | null; basis?: unknown };
        const project = parseProjectData(r.project);
        const basis = r.basis ? parseProjectData(r.basis) : null;
        zwischenstandWirdGeladen(DB);
        st.load(project, r.datei, basis);
      })
      .catch(() => {
        // kein Zwischenstand
      });

  let timer: ReturnType<typeof setTimeout> | undefined;
  useGrz.subscribe((s, prev) => {
    if (s.project === prev.project && s.basis === prev.basis) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const { project, datei, basis } = useGrz.getState();
      void db()
        .then((d) => {
          d.transaction(STORE, 'readwrite').objectStore(STORE).put({ project, datei, basis }, KEY);
          zwischenstandErsetzt(DB);
        })
        .catch(() => undefined);
    }, 600);
  });
}

/* ---------- Kopieren, Einfügen, Duplizieren, Pfeiltasten ---------- */

let ablage: LageplanFlaeche[] = [];

function gewaehlt(): LageplanFlaeche[] {
  const st = useGrz.getState();
  const ids = new Set(st.selectedIds.length ? st.selectedIds : st.selected ? [st.selected] : []);
  return (st.project.lageplan?.flaechen ?? []).filter((f) => ids.has(f.id));
}

/** Kopie mit neuer Kennung und ohne IFC-Herkunft, versetzt */
function kopie(f: LageplanFlaeche, d: number): LageplanFlaeche {
  const c = structuredClone(f);
  c.id = newId('lp');
  delete c.ifcId;
  delete c.ifcStand;
  c.points = c.points.map((p) => ({ x: p.x + d, y: p.y + d }));
  return c;
}

function einsetzen(neu: LageplanFlaeche[]) {
  const st = useGrz.getState();
  st.update((p) => ({ ...p, lageplan: { flaechen: [...(p.lageplan?.flaechen ?? []), ...neu] } }));
  st.selectMany(neu.map((f) => f.id));
}

/** Strg+C */
export function flaechenKopieren(): number {
  ablage = structuredClone(gewaehlt());
  return ablage.length;
}

/** Strg+V: um 0,50 m versetzt (mehrfaches Einfügen staffelt weiter) */
export function flaechenEinfuegen(): number {
  if (!ablage.length) return 0;
  const neu = ablage.map((f) => kopie(f, 0.5));
  ablage = structuredClone(neu);
  einsetzen(neu);
  return neu.length;
}

/** Strg+D */
export function flaechenDuplizieren(): number {
  const g = gewaehlt();
  if (!g.length) return 0;
  einsetzen(g.map((f) => kopie(f, 0.5)));
  return g.length;
}

/** Pfeiltasten: Auswahl verschieben; zusammenhängende Schritte = ein Undo-Schritt */
export function auswahlVerschieben(dx: number, dy: number): void {
  const ids = new Set(gewaehlt().map((f) => f.id));
  if (!ids.size) return;
  useGrz.getState().update(
    (p) => ({ ...p, lageplan: { flaechen: (p.lageplan?.flaechen ?? []).map((f) => (ids.has(f.id) ? { ...f, points: f.points.map((q) => ({ x: q.x + dx, y: q.y + dy })) } : f)) } }),
    'pfeil',
  );
}
