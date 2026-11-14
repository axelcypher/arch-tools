import { create } from 'zustand';
import { appInfo } from './apps';

/**
 * Zustand der Rahmen-App: offene Tabs (Reihenfolge, aktiver), herausgelöste Fenster und was die Tabs melden
 * bzw. Fenster melden (Projektname, ungespeicherte Änderungen). Die offenen Tabs bleiben bis zum nächsten Start erhalten;
 * herausgelöste Apps kommen dann als Tab wieder (hinten angehängt).
 */

const KEY = 'arch-tools:rahmen';

interface TabStatus {
  name: string;
  dirty: boolean;
  /** Satz der App für die Rückfrage bei ungespeicherten Änderungen (sonst der allgemeine) */
  ungespeichert?: string;
  /** false: die App kann gerade nicht speichern (dann nur Verwerfen) */
  kannSpeichern?: false;
}

interface RahmenState {
  tabs: string[];
  aktiv: string | null;
  /** herausgelöste Apps (eigene Fenster) */
  fenster: string[];
  /** Meldungen der Tabs und Fenster je Kennung */
  status: Record<string, TabStatus>;
  /** App als Tab öffnen (oder zu ihrem Tab wechseln) */
  oeffnen: (id: string) => void;
  waehlen: (id: string) => void;
  /** Startseite zeigen (die Tabs bleiben offen) */
  startseite: () => void;
  schliessen: (id: string) => void;
  setStatus: (id: string, s: TabStatus) => void;
  /** Tab in ein eigenes Fenster verschoben */
  herausgeloest: (id: string) => void;
  /** eigenes Fenster wieder als Tab */
  angedockt: (id: string) => void;
  /** eigenes Fenster geschlossen */
  fensterZu: (id: string) => void;
}

function lade(): Pick<RahmenState, 'tabs' | 'aktiv'> {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { tabs?: unknown; aktiv?: unknown };
    const tabs = Array.isArray(o.tabs) ? o.tabs.filter((x): x is string => typeof x === 'string' && !!appInfo(x)) : [];
    const aktiv = typeof o.aktiv === 'string' && tabs.includes(o.aktiv) ? o.aktiv : (tabs[0] ?? null);
    return { tabs: [...new Set(tabs)], aktiv };
  } catch {
    return { tabs: [], aktiv: null };
  }
}

/** Nachbar eines geschlossenen Tabs: rechts davon, sonst links */
const nachbar = (tabs: string[], id: string) => {
  const i = tabs.indexOf(id);
  const rest = tabs.filter((t) => t !== id);
  return rest[Math.min(i, rest.length - 1)] ?? null;
};

export const useRahmen = create<RahmenState>()((set, get) => ({
  ...lade(),
  fenster: [],
  status: {},
  oeffnen: (id) => set((s) => ({ tabs: s.tabs.includes(id) ? s.tabs : [...s.tabs, id], aktiv: id })),
  waehlen: (id) => set({ aktiv: id }),
  startseite: () => set({ aktiv: null }),
  schliessen: (id) =>
    set((s) => {
      const { [id]: _weg, ...status } = s.status;
      return { tabs: s.tabs.filter((t) => t !== id), aktiv: s.aktiv === id ? nachbar(s.tabs, id) : s.aktiv, status };
    }),
  setStatus: (id, st) => {
    const alt = get().status[id];
    if (alt && alt.name === st.name && alt.dirty === st.dirty && alt.ungespeichert === st.ungespeichert && alt.kannSpeichern === st.kannSpeichern) return;
    set((s) => ({ status: { ...s.status, [id]: st } }));
  },
  herausgeloest: (id) => {
    get().schliessen(id);
    set((s) => ({ fenster: s.fenster.includes(id) ? s.fenster : [...s.fenster, id] }));
  },
  angedockt: (id) => {
    get().fensterZu(id);
    get().oeffnen(id);
  },
  // die Meldung des Fensters gilt nicht mehr (der neue Tab meldet sich selbst)
  fensterZu: (id) =>
    set((s) => {
      const { [id]: _weg, ...status } = s.status;
      return { fenster: s.fenster.filter((f) => f !== id), status: s.fenster.includes(id) ? status : s.status };
    }),
}));

useRahmen.subscribe((s, vorher) => {
  if (s.tabs === vorher.tabs && s.aktiv === vorher.aktiv && s.fenster === vorher.fenster) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ tabs: [...s.tabs, ...s.fenster.filter((f) => !s.tabs.includes(f))], aktiv: s.aktiv }));
  } catch {
    // ohne Speicher beginnt der nächste Start leer
  }
});
