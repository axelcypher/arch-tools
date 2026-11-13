import { standNachSpeichern } from '@core/platform/projektDatei';
import { create } from 'zustand';
import type { LageplanFlaeche, LageplanNutzung, MassNutzung, Project, Versiegelung } from '@core/model';
import { createLageplanFlaeche, createProject, leereMeta, newId } from '@core/model';
import { gleich } from '@core/zusammenfuehren';
import { parseProjectData } from '@core/serialize';
import { logger } from '@core/platform/log';
import { zwischenstandErsetzt, zwischenstandLadenErlaubt, zwischenstandWirdGeladen } from '@core/platform/startschutz';

/**
 * Zustand von TERRIO: das Projekt im gemeinsamen Format (.oap) – Gebäude und Geschosse
 * kommen aus QUADRIO bzw. der IFC, Lageplan und Festsetzungen pflegt dieses Tool.
 */

const log = logger('projekt');
const HISTORY = 100;

/** grenze: Grundstücksgrenze zeichnen; kalibrieren/ausrichten: Unterlage an zwei Punkten einrichten */
export type Werkzeug = 'auswahl' | 'polygon' | 'rechteck' | 'grenze' | 'kalibrieren' | 'ausrichten';

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
  /** Namen der Schritte zu past/future (gleich lang) – für „Rückgängig: Nutzung ändern“ */
  pastAktionen: string[];
  futureAktionen: string[];
  /** zuletzt gewählte Lageplan-Fläche (Eigenschaften, Eckpunkte) */
  selected: string | null;
  /** alle gewählten Lageplan-Flächen (Mehrfachauswahl mit Umschalt) – enthält selected */
  selectedIds: string[];
  werkzeug: Werkzeug;
  /** Nutzung, mit der neue Flächen gezeichnet werden (Vorlage in der Plan-Leiste) */
  nutzungVorlage: LageplanNutzung;
  /** Zeitpunkt des ungespeicherten Zwischenstands, der beim Start wiederhergestellt wurde (Leiste „Speichern / Verwerfen“) */
  wiederhergestellt: number | null;

  /** basis: Stand der Datei, aus der das Projekt stammt (null bei IFC-Import bzw. neuem Projekt) */
  load: (p: Project, datei?: string | null, basis?: Project | null) => void;
  /**
   * Zwischenstand nach dem Neuladen wiederherstellen: ungespeichert, wenn er von der Datei abweicht (Vergleich der
   * Inhalte) bzw. – ohne Datei – nicht leer ist; zeit: wann er entstand
   */
  wiederherstellen: (p: Project, datei: string | null, basis: Project | null, zeit?: number) => void;
  /** wiederhergestellten Zwischenstand verwerfen: zurück auf den Stand der Datei bzw. ein leeres Projekt */
  verwerfen: () => void;
  /** zusammenfassen: aufeinanderfolgende Änderungen mit gleichem Schlüssel (z. B. Pfeiltasten) = ein Undo-Schritt */
  update: (fn: (p: Project) => Project, zusammenfassen?: string, aktion?: string) => void;
  undo: () => void;
  redo: () => void;
  /** nach dem Speichern: Datei, gespeichertes Projekt und der Stand, der gespeichert wurde */
  markSaved: (datei: string, gespeichert: Project, vorher: Project, dokument: number) => void;
  select: (id: string | null) => void;
  /** Umschalt+Klick: Fläche zur Auswahl hinzufügen bzw. daraus entfernen */
  toggleSelect: (id: string) => void;
  selectMany: (ids: string[]) => void;
  setWerkzeug: (w: Werkzeug) => void;
  setNutzungVorlage: (n: LageplanNutzung) => void;
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
  pastAktionen: [],
  futureAktionen: [],
  selected: null,
  selectedIds: [],
  werkzeug: 'auswahl',
  wiederhergestellt: null,
  nutzungVorlage: 'zufahrt',

  load: (p, datei = null, basis = null) => {
    log.info(`Projekt geladen: ${p.name}`, { geschosse: p.storeys.length, lageplan: p.lageplan?.flaechen.length ?? 0 });
    set({
      project: p,
      datei,
      basis,
      dirty: false,
      dokument: get().dokument + 1,
      past: [],
      future: [],
      pastAktionen: [],
      futureAktionen: [],
      selected: null,
      selectedIds: [],
      werkzeug: 'auswahl',
      wiederhergestellt: null,
    });
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
  update: (fn, zusammenfassen, aktion = 'Änderung') => {
    const { project, past, pastAktionen } = get();
    const next = fn(project);
    if (next === project) return;
    const jetzt = Date.now();
    // zusammenhängend nur, wenn seitdem nichts anderes geschah (auch kein Rückgängig)
    const anschluss = zusammenfassen !== undefined && letzteAenderung.schluessel === zusammenfassen && jetzt - letzteAenderung.zeit < 800 && letzteAenderung.ergebnis === project && past.length > 0;
    letzteAenderung = { schluessel: zusammenfassen, zeit: jetzt, ergebnis: next };
    set({
      project: next,
      past: anschluss ? past : [...past, project].slice(-HISTORY),
      pastAktionen: anschluss ? pastAktionen : [...pastAktionen, aktion].slice(-HISTORY),
      future: [],
      futureAktionen: [],
      dirty: true,
    });
    auswahlBereinigen(set, get);
  },
  undo: () => {
    const { past, project, future, pastAktionen, futureAktionen } = get();
    if (!past.length) return;
    const a = pastAktionen[pastAktionen.length - 1] ?? 'Änderung';
    const zurueck = past[past.length - 1];
    set({
      project: zurueck,
      past: past.slice(0, -1),
      future: [project, ...future],
      pastAktionen: pastAktionen.slice(0, -1),
      futureAktionen: [a, ...futureAktionen],
      dirty: weichtAb(zurueck, get().basis),
    });
    auswahlBereinigen(set, get);
  },
  redo: () => {
    const { past, project, future, pastAktionen, futureAktionen } = get();
    if (!future.length) return;
    set({
      project: future[0],
      past: [...past, project],
      future: future.slice(1),
      pastAktionen: [...pastAktionen, futureAktionen[0] ?? 'Änderung'],
      futureAktionen: futureAktionen.slice(1),
      dirty: weichtAb(future[0], get().basis),
    });
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
    if (n.verlaufVerwerfen) set({ past: [], future: [], pastAktionen: [], futureAktionen: [] });
    set({ project: n.project, dirty: n.dirty, datei, basis: gespeichert, wiederhergestellt: null });
  },
  select: (id) => set({ selected: id, selectedIds: id ? [id] : [] }),
  toggleSelect: (id) => {
    const ids = get().selectedIds;
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    set({ selectedIds: next, selected: next.length ? next[next.length - 1] : null });
  },
  selectMany: (ids) => set({ selectedIds: ids, selected: ids.length ? ids[ids.length - 1] : null }),
  setWerkzeug: (w) => set({ werkzeug: w }),
  setNutzungVorlage: (n) => set({ nutzungVorlage: n }),
}));

/** passende Versiegelung je Nutzung (Vorgabe beim Zeichnen, änderbar) */
export const VERSIEGELUNG_VORGABE: Record<LageplanNutzung, Versiegelung> = {
  zufahrt: 'voll',
  stellplatz: 'voll',
  garage: 'voll',
  terrasse: 'voll',
  weg: 'voll',
  nebenanlage: 'voll',
  unterirdisch: 'voll',
  garten: 'gruen',
  sonstige: 'voll',
};

/** kurzer Name je Nutzung für neue Flächen („Zufahrt 1“, „Terrasse 2“) */
export const NUTZUNG_NAME: Record<LageplanNutzung, string> = {
  zufahrt: 'Zufahrt',
  stellplatz: 'Stellplatz',
  garage: 'Garage',
  terrasse: 'Terrasse',
  weg: 'Weg',
  nebenanlage: 'Nebenanlage',
  unterirdisch: 'Unterirdische Anlage',
  garten: 'Garten',
  sonstige: 'Fläche',
};

/** neue Lageplan-Fläche mit Nutzung, passender Versiegelung und laufender Nummer je Nutzung */
export function neueFlaeche(p: Project, points: LageplanFlaeche['points'], nutzung: LageplanNutzung): LageplanFlaeche {
  const name = NUTZUNG_NAME[nutzung];
  const re = new RegExp(`^${name} (\\d+)$`);
  const nr = Math.max(0, ...(p.lageplan?.flaechen ?? []).map((f) => Number(re.exec(f.name)?.[1] ?? 0))) + 1;
  return { ...createLageplanFlaeche(points, `${name} ${nr}`), nutzung, versiegelung: VERSIEGELUNG_VORGABE[nutzung] };
}

/** gewählte Flächen, die es nicht mehr gibt (gelöscht, Rückgängig), aus der Auswahl nehmen */
function auswahlBereinigen(set: (s: Partial<GrzState>) => void, get: () => GrzState) {
  const { project, selected, selectedIds } = get();
  const da = new Set((project.lageplan?.flaechen ?? []).map((f) => f.id));
  const ids = selectedIds.filter((id) => da.has(id));
  if (ids.length !== selectedIds.length || (selected && !da.has(selected))) set({ selectedIds: ids, selected: selected && da.has(selected) ? selected : (ids[ids.length - 1] ?? null) });
}

/** leeres Projekt (wie „Neues Projekt“): ohne Gebäude, Lageplan, Festsetzungen, Stammdaten und Dateien */
export function istLeer(p: Project): boolean {
  const m = p.massNutzung;
  return (
    !p.storeys.some((s) => s.shapes.length) &&
    !p.lageplan?.flaechen.length &&
    (!m || Object.keys(m).length === 0) &&
    !p.dateien?.length &&
    gleich(p.meta, leereMeta()) &&
    p.name === createProject().name
  );
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

/** ungespeichert, wenn der Stand vom gespeicherten (Datei) abweicht; ohne Datei immer (Rückgängig zum leeren Projekt bleibt eine Änderung) */
export function weichtAb(p: Project, basis: Project | null): boolean {
  return !basis || (p !== basis && !gleich(p, basis));
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
        // inzwischen ein Projekt geöffnet (Projektwahl, Neu)? Dann bleibt es – der Zwischenstand ersetzt es nicht
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

  let timer: ReturnType<typeof setTimeout> | undefined;
  useGrz.subscribe((s, prev) => {
    if (s.project === prev.project && s.basis === prev.basis) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const { project, datei, basis } = useGrz.getState();
      void db()
        .then((d) => {
          d.transaction(STORE, 'readwrite').objectStore(STORE).put({ project, datei, basis, zeit: Date.now() }, KEY);
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
  st.update((p) => ({ ...p, lageplan: { ...p.lageplan, flaechen: [...(p.lageplan?.flaechen ?? []), ...neu] } }), undefined, neu.length > 1 ? 'Flächen einfügen' : 'Fläche einfügen');
  st.selectMany(neu.map((f) => f.id));
}

/** Strg+C */
export function flaechenKopieren(): number {
  ablage = structuredClone(gewaehlt());
  return ablage.length;
}

/** Ist die Ablage leer? (Kontextmenü sperrt „Einfügen“ dann mit Grund) */
export function ablageLeer(): boolean {
  return ablage.length === 0;
}

/** Ablage leeren (für Tests: definierter Ausgangszustand) */
export function ablageLeeren(): void {
  ablage = [];
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
  useGrz
    .getState()
    .update(
      (p) => ({ ...p, lageplan: { ...p.lageplan, flaechen: (p.lageplan?.flaechen ?? []).map((f) => (ids.has(f.id) ? { ...f, points: f.points.map((q) => ({ x: q.x + dx, y: q.y + dy })) } : f)) } }),
      'pfeil',
      'Fläche verschieben',
    );
}

/** Name eines Änderungsschritts an einer Fläche aus den geänderten Feldern */
export function flaechenAktion(patch: Partial<LageplanFlaeche>): string {
  const k = Object.keys(patch);
  if (k.includes('nutzung')) return 'Nutzung ändern';
  if (k.includes('versiegelung')) return 'Versiegelung ändern';
  if (k.includes('nachbar')) return 'Nachbar ändern';
  if (k.includes('name')) return 'Bezeichnung ändern';
  if (k.includes('hoehe')) return 'Höhe ändern';
  if (k.includes('points')) return 'Fläche ändern';
  if (k.includes('variante')) return 'Variante ändern';
  return 'Fläche ändern';
}
