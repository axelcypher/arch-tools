import { create } from 'zustand';
import { hatDateisystem, tauriDateisystem } from './dateisystem';
import type { Vorlage } from './plan';
import { ladeVorlagen } from './plan';
import type { Stammdaten } from './stammdaten';
import { leereStammdaten } from './stammdaten';
import type { Struktur } from './struktur';
import { STANDARD, strukturAusJson } from './struktur';

/**
 * Zustand des Tools: die Stammdaten des Projekts, das gerade angelegt wird, die Struktur (Konfiguration samt
 * Vorlagen-Presets) und die zuletzt gewählten Ordner. Das bleibt im Browserspeicher der Anwendung erhalten;
 * die eingelesenen Vorlagen nicht – sie kommen bei jedem Start frisch aus dem Vorlagenordner.
 */

const KEY = 'projektordner:zustand';

interface Gespeichert {
  stamm: Stammdaten;
  struktur: Struktur;
  stammordner: string;
  vorlagenordner: string;
}

interface OrdnerState extends Gespeichert {
  /** Dateien im Vorlagenordner (Desktop: aus `vorlagenordner` gelesen, Browser: über den Dateidialog gewählt) */
  vorlagen: Vorlage[];
  /** im Browser: Name des gewählten Vorlagenordners */
  vorlagenName: string;
  vorlagenFehler: string | null;
  vorlagenLaden: boolean;
  setStamm: (patch: Partial<Stammdaten>) => void;
  setStruktur: (s: Struktur) => void;
  setStammordner: (p: string) => void;
  setVorlagenordner: (p: string) => void;
  /** Desktop: Vorlagenordner (neu) einlesen */
  ladeVorlagen: () => Promise<void>;
  /** Browser: über den Dateidialog gewählter Vorlagenordner */
  setVorlagenImBrowser: (name: string, vorlagen: Vorlage[]) => void;
  /** Formular für das nächste Projekt leeren; Bearbeiter bleibt */
  neuesProjekt: () => void;
}

function lade(): Gespeichert {
  const vorgabe: Gespeichert = { stamm: leereStammdaten(), struktur: STANDARD, stammordner: '', vorlagenordner: '' };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return vorgabe;
    const o = JSON.parse(raw) as Partial<Gespeichert>;
    return {
      stamm: { ...leereStammdaten(), ...(o.stamm ?? {}) },
      struktur: o.struktur ? strukturAusJson(JSON.stringify(o.struktur)) : STANDARD,
      stammordner: typeof o.stammordner === 'string' ? o.stammordner : '',
      vorlagenordner: typeof o.vorlagenordner === 'string' ? o.vorlagenordner : '',
    };
  } catch {
    return vorgabe;
  }
}

export const useOrdner = create<OrdnerState>()((set, get) => ({
  ...lade(),
  vorlagen: [],
  vorlagenName: '',
  vorlagenFehler: null,
  vorlagenLaden: false,
  setStamm: (patch) => set({ stamm: { ...get().stamm, ...patch } }),
  setStruktur: (struktur) => set({ struktur }),
  setStammordner: (stammordner) => set({ stammordner }),
  // eingelesen wird in App (bei jedem Wechsel des Ordners und der Ansicht)
  setVorlagenordner: (vorlagenordner) => set({ vorlagenordner, vorlagenFehler: null, ...(vorlagenordner ? {} : { vorlagen: [], vorlagenName: '' }) }),
  ladeVorlagen: async () => {
    const ordner = get().vorlagenordner;
    if (!hatDateisystem()) return;
    if (!ordner) return set({ vorlagen: [], vorlagenFehler: null });
    set({ vorlagenLaden: true });
    try {
      const vorlagen = await ladeVorlagen(tauriDateisystem, ordner);
      if (get().vorlagenordner === ordner) set({ vorlagen, vorlagenFehler: null });
    } catch (e) {
      if (get().vorlagenordner === ordner) set({ vorlagen: [], vorlagenFehler: `Vorlagenordner: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      set({ vorlagenLaden: false });
    }
  },
  setVorlagenImBrowser: (vorlagenName, vorlagen) => set({ vorlagenName, vorlagen, vorlagenFehler: null }),
  neuesProjekt: () => set({ stamm: { ...leereStammdaten(), bearbeiter: get().stamm.bearbeiter } }),
}));

useOrdner.subscribe((s) => {
  try {
    const g: Gespeichert = { stamm: s.stamm, struktur: s.struktur, stammordner: s.stammordner, vorlagenordner: s.vorlagenordner };
    localStorage.setItem(KEY, JSON.stringify(g));
  } catch {
    // ohne Speicher gilt der Zustand nur bis zum Schließen
  }
});
