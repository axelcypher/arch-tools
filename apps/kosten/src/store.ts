import { standNachSpeichern } from '@core/platform/projektDatei';
import { create } from 'zustand';
import type { Kosten, KostenPosition, Project } from '@core/model';
import { createProject, leereMeta } from '@core/model';
import { gleich } from '@core/zusammenfuehren';
import { parseProjectData } from '@core/serialize';
import { logger } from '@core/platform/log';
import { vorDemSchliessen } from '@core/platform/rahmen';
import { zwischenstandErsetzt, zwischenstandLadenErlaubt, zwischenstandWirdGeladen } from '@core/platform/startschutz';
import { inStoreSchreiben, verzoegertSchreiben } from './verzoegert';

/**
 * Zustand von NUMIO: das Projekt im gemeinsamen Format (.oap) – Gebäude, Geschosse und
 * Flächen kommen aus QUADRIO bzw. der IFC, Kostenpositionen und Kostenstände pflegt dieses Tool.
 */

const log = logger('projekt');
const HISTORY = 100;

interface KostenState {
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
  /** Zeitpunkt des ungespeicherten Zwischenstands, der beim Start wiederhergestellt wurde (Leiste „Speichern / Verwerfen“) */
  wiederhergestellt: number | null;

  /** basis: Stand der Datei, aus der das Projekt stammt (null bei IFC-Import bzw. neuem Projekt) */
  load: (p: Project, datei?: string | null, basis?: Project | null) => void;
  /**
   * Zwischenstand nach dem Neuladen wiederherstellen: ungespeichert, wenn er von der Datei abweicht (bzw. ohne Datei
   * nicht leer ist) – sonst ginge er beim nächsten Öffnen ohne Rückfrage verloren
   */
  wiederherstellen: (p: Project, datei: string | null, basis: Project | null, zeit?: number) => void;
  /** wiederhergestellten Zwischenstand verwerfen: zurück auf den Stand der Datei bzw. ein leeres Projekt */
  verwerfen: () => void;
  update: (fn: (p: Project) => Project) => void;
  undo: () => void;
  redo: () => void;
  /** nach dem Speichern: Datei, gespeichertes Projekt und der Stand, der gespeichert wurde */
  markSaved: (datei: string, gespeichert: Project, vorher: Project, dokument: number) => void;
}

export const useKosten = create<KostenState>()((set, get) => ({
  project: createProject('Neues Projekt'),
  datei: null,
  basis: null,
  dirty: false,
  past: [],
  dokument: 0,
  future: [],
  wiederhergestellt: null,

  load: (p, datei = null, basis = null) => {
    log.info(`Projekt geladen: ${p.name}`, { geschosse: p.storeys.length, positionen: p.kosten?.positionen.length ?? 0 });
    set({ project: p, datei, basis, dirty: false, dokument: get().dokument + 1, past: [], future: [], wiederhergestellt: null });
  },
  wiederherstellen: (p, datei, basis, zeit) => {
    get().load(p, datei, basis);
    const dirty = basis ? !gleich(p, basis) : !istLeer(p);
    if (dirty) log.info('Ungespeicherter Zwischenstand wiederhergestellt', { datei, zeit });
    set({ dirty, wiederhergestellt: dirty ? (zeit ?? Date.now()) : null });
  },
  verwerfen: () => {
    const { basis, datei } = get();
    if (basis) get().load(basis, datei, basis);
    else get().load(createProject());
  },
  update: (fn) => {
    const { project, past } = get();
    const next = fn(project);
    if (next === project) return;
    set({ project: next, past: [...past, project].slice(-HISTORY), future: [], dirty: true });
  },
  undo: () => {
    const { past, project, future } = get();
    if (!past.length) return;
    set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future], dirty: true });
  },
  redo: () => {
    const { past, project, future } = get();
    if (!future.length) return;
    set({ project: future[0], past: [...past, project], future: future.slice(1), dirty: true });
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
    set({ project: n.project, dirty: n.dirty, datei, basis: gespeichert, wiederhergestellt: null });
  },
}));

/** leeres Projekt (wie „Neues Projekt“) – ein solcher Zwischenstand gilt nicht als ungespeichert */
export function istLeer(p: Project): boolean {
  return !p.storeys.some((s) => s.shapes.length) && !p.kosten && !p.dateien?.length && gleich(p.meta, leereMeta()) && p.name === createProject().name;
}

/* ---------- Änderungen am Projekt ---------- */

const leer = (): Kosten => ({ positionen: [] });

export function setKosten(p: Project, patch: Partial<Kosten>): Project {
  const next: Kosten = { ...(p.kosten ?? leer()), ...patch };
  for (const k of Object.keys(next) as (keyof Kosten)[]) if (next[k] === undefined) delete next[k];
  return { ...p, kosten: next };
}

export function mapPosition(p: Project, id: string, fn: (x: KostenPosition) => KostenPosition): Project {
  return setKosten(p, { positionen: (p.kosten?.positionen ?? []).map((x) => (x.id === id ? fn(x) : x)) });
}

/** Positionen anhängen; nach Kostengruppe einsortiert (stabil) */
export function addPositionen(p: Project, neu: KostenPosition[]): Project {
  const alle = [...(p.kosten?.positionen ?? []), ...neu];
  return setKosten(p, { positionen: alle.map((x, i) => ({ x, i })).sort((a, b) => a.x.kg.localeCompare(b.x.kg) || a.i - b.i).map(({ x }) => x) });
}

export function removePosition(p: Project, id: string): Project {
  return setKosten(p, { positionen: (p.kosten?.positionen ?? []).filter((x) => x.id !== id) });
}

/* ---------- Zwischenspeicher (IndexedDB) ---------- */

const DB = 'kostenermittlung';
const STORE = 'autosave';
const KEY = 'projekt';

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    // eine ältere Verbindung blockiert das Öffnen: als Fehler werten, sonst hinge die Schreibkette (verzoegert.ts)
    req.onblocked = () => reject(new Error('Zwischenspeicher blockiert'));
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
        const st = useKosten.getState();
        // inzwischen schon ein Projekt geöffnet bzw. bearbeitet: den Zwischenstand nicht darüberlegen
        if (!raw || st.dirty || st.past.length || st.dokument !== 0) return;
        const r = raw as { project: unknown; datei: string | null; basis?: unknown; zeit?: number };
        const project = parseProjectData(r.project);
        const basis = r.basis ? parseProjectData(r.basis) : null;
        zwischenstandWirdGeladen(DB);
        st.wiederherstellen(project, r.datei, basis, typeof r.zeit === 'number' ? r.zeit : undefined);
      })
      .catch(() => {
        // kein Zwischenstand
      });

  // Zwischenstand 600 ms nach der letzten Änderung schreiben; vor dem Schließen (Arkly) sofort und abgewartet –
  // scheitert das Schreiben, meldet sichern() false und Arkly fragt nach, statt still zu schließen
  const zwischenstand = verzoegertSchreiben(
    () =>
      db().then(
        (d) =>
          inStoreSchreiben(d, STORE, KEY, () => {
            const { project, datei, basis } = useKosten.getState();
            return { project, datei, basis, zeit: Date.now() };
          }).then(() => zwischenstandErsetzt(DB)),
      ),
    600,
    (e) => log.warn('Zwischenstand ließ sich nicht schreiben', e),
  );
  useKosten.subscribe((s, prev) => {
    if (s.project === prev.project && s.basis === prev.basis) return;
    zwischenstand.anstossen();
  });
  vorDemSchliessen(zwischenstand.sichern);
}
