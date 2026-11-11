import { create } from 'zustand';
import type { AllgemeineEinstellungen, KonfigOrt } from '@core/platform/konfig';
import { allgemeinAendern, allgemeinAus, konfigLesen, konfigOrdnerWechseln, konfigOrt, konfigSchreiben, VORGABE_ALLGEMEIN } from '@core/platform/konfig';
import { hatDateisystem, tauriDateisystem } from './dateisystem';
import type { Vorlage } from './plan';
import { ladeVorlagen } from './plan';
import type { Stammdaten } from './stammdaten';
import { leereStammdaten } from './stammdaten';
import type { Struktur } from './struktur';
import { alterOapPfad, STANDARD, strukturAusJson } from './struktur';

/**
 * Zustand des Tools. Die Einstellungen liegen im gemeinsamen Konfigurationsordner aller Apps:
 *   allgemein.json       Stammordner der Projekte, Ort neuer Projektdateien, Fotoordner (alle Apps)
 *   projektordner.json   Struktur (samt Vorlagen-Presets) und Vorlagenordner (dieses Tool)
 * Im lokalen Speicher bleiben nur das angefangene Formular für ein neues Projekt und – als Übergang – die
 * Einstellungen älterer Fassungen, die beim ersten Start in den Konfigurationsordner übernommen werden.
 */

const KEY = 'projektordner:zustand';
export const BEREICH = 'projektordner';
/** Bereiche, die beim Wechsel des Konfigurationsordners mitgenommen werden */
const BEREICHE = ['allgemein', BEREICH];

interface Lokal {
  stamm: Stammdaten;
  /** bis 0.2 lokal gespeichert – nur noch zum Übernehmen */
  struktur?: unknown;
  stammordner?: string;
  vorlagenordner?: string;
}

interface OrdnerState {
  stamm: Stammdaten;
  struktur: Struktur;
  vorlagenordner: string;
  allgemein: AllgemeineEinstellungen;
  /** Stammordner für neue Projekte: der erste der gemeinsamen Einstellungen */
  stammordner: string;
  /** wo die Einstellungen liegen (null im Browser bzw. bevor sie geladen sind) */
  konfig: KonfigOrt | null;
  konfigFehler: string | null;
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
  setAllgemein: (patch: Partial<AllgemeineEinstellungen>) => void;
  /** Einstellungen aus dem Konfigurationsordner laden (beim Start) */
  konfigLaden: () => Promise<void>;
  /** anderen Konfigurationsordner wählen (null = lokal); fehlende Bereiche werden mitgenommen */
  konfigOrdnerSetzen: (ordner: string | null) => Promise<string[]>;
  /** Desktop: Vorlagenordner (neu) einlesen */
  ladeVorlagen: () => Promise<void>;
  /** Browser: über den Dateidialog gewählter Vorlagenordner */
  setVorlagenImBrowser: (name: string, vorlagen: Vorlage[]) => void;
  /** Formular für das nächste Projekt leeren; Bearbeiter bleibt */
  neuesProjekt: () => void;
}

function ladeLokal(): Lokal {
  try {
    const raw = localStorage.getItem(KEY);
    const o = raw ? (JSON.parse(raw) as Partial<Lokal>) : {};
    return { ...o, stamm: { ...leereStammdaten(), ...(o.stamm ?? {}) } };
  } catch {
    return { stamm: leereStammdaten() };
  }
}

const strukturAus = (roh: unknown): Struktur => {
  try {
    return roh ? strukturAusJson(JSON.stringify(roh)) : STANDARD;
  } catch {
    return STANDARD;
  }
};

const lokal = ladeLokal();
// bis die gemeinsamen Einstellungen geladen sind: was ältere Fassungen lokal gespeichert haben
const anfang = {
  struktur: strukturAus(lokal.struktur),
  vorlagenordner: typeof lokal.vorlagenordner === 'string' ? lokal.vorlagenordner : '',
  allgemein: { ...VORGABE_ALLGEMEIN, projekte: lokal.stammordner ? [lokal.stammordner] : [] },
};

const fehlertext = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const useOrdner = create<OrdnerState>()((set, get) => {
  const eigeneSpeichern = () => {
    const { struktur, vorlagenordner } = get();
    konfigSchreiben(BEREICH, { struktur, vorlagenordner }).catch((e) => set({ konfigFehler: `Einstellungen nicht gespeichert: ${fehlertext(e)}` }));
  };
  const allgemeinSetzen = (patch: Partial<AllgemeineEinstellungen>) => {
    const allgemein = { ...get().allgemein, ...patch };
    set({ allgemein, stammordner: allgemein.projekte[0] ?? '' });
    allgemeinAendern(patch).catch((e) => set({ konfigFehler: `Einstellungen nicht gespeichert: ${fehlertext(e)}` }));
  };
  return {
    stamm: lokal.stamm,
    ...anfang,
    stammordner: anfang.allgemein.projekte[0] ?? '',
    konfig: null,
    konfigFehler: null,
    vorlagen: [],
    vorlagenName: '',
    vorlagenFehler: null,
    vorlagenLaden: false,
    setStamm: (patch) => set({ stamm: { ...get().stamm, ...patch } }),
    setStruktur: (struktur) => {
      set({ struktur });
      eigeneSpeichern();
    },
    setStammordner: (p) => allgemeinSetzen({ projekte: [p, ...get().allgemein.projekte.filter((x) => x !== p)].filter(Boolean) }),
    // eingelesen wird in App (bei jedem Wechsel des Ordners und der Ansicht)
    setVorlagenordner: (vorlagenordner) => {
      set({ vorlagenordner, vorlagenFehler: null, ...(vorlagenordner ? {} : { vorlagen: [], vorlagenName: '' }) });
      eigeneSpeichern();
    },
    setAllgemein: allgemeinSetzen,
    konfigLaden: async () => {
      try {
        const [ort, rohAllgemein, rohEigen] = await Promise.all([konfigOrt(), konfigLesen('allgemein'), konfigLesen(BEREICH)]);
        // erster Start mit dem Konfigurationsordner: Einstellungen älterer Fassungen übernehmen
        if (rohAllgemein == null) {
          const oap = alterOapPfad(lokal.struktur);
          await allgemeinAendern({ projekte: anfang.allgemein.projekte, ...(oap ? { oapPfad: oap } : {}) });
        }
        if (rohEigen == null) await konfigSchreiben(BEREICH, { struktur: anfang.struktur, vorlagenordner: anfang.vorlagenordner });
        const allgemein = rohAllgemein == null ? allgemeinAus(await konfigLesen('allgemein')) : allgemeinAus(rohAllgemein);
        const eigen = (rohEigen ?? { struktur: anfang.struktur, vorlagenordner: anfang.vorlagenordner }) as { struktur?: unknown; vorlagenordner?: unknown };
        set({
          konfig: ort,
          konfigFehler: null,
          allgemein,
          stammordner: allgemein.projekte[0] ?? '',
          struktur: strukturAus(eigen.struktur),
          vorlagenordner: typeof eigen.vorlagenordner === 'string' ? eigen.vorlagenordner : '',
        });
      } catch (e) {
        set({ konfigFehler: `Einstellungen nicht lesbar: ${fehlertext(e)}` });
      }
    },
    konfigOrdnerSetzen: async (ordner) => {
      const uebernommen = await konfigOrdnerWechseln(ordner, BEREICHE);
      await get().konfigLaden();
      return uebernommen;
    },
    ladeVorlagen: async () => {
      const ordner = get().vorlagenordner;
      if (!hatDateisystem()) return;
      if (!ordner) return set({ vorlagen: [], vorlagenFehler: null });
      set({ vorlagenLaden: true });
      try {
        const vorlagen = await ladeVorlagen(tauriDateisystem, ordner);
        if (get().vorlagenordner === ordner) set({ vorlagen, vorlagenFehler: null });
      } catch (e) {
        if (get().vorlagenordner === ordner) set({ vorlagen: [], vorlagenFehler: `Vorlagenordner: ${fehlertext(e)}` });
      } finally {
        set({ vorlagenLaden: false });
      }
    },
    setVorlagenImBrowser: (vorlagenName, vorlagen) => set({ vorlagenName, vorlagen, vorlagenFehler: null }),
    neuesProjekt: () => set({ stamm: { ...leereStammdaten(), bearbeiter: get().stamm.bearbeiter } }),
  };
});

// nur das angefangene Formular bleibt lokal
useOrdner.subscribe((s, vorher) => {
  if (s.stamm === vorher.stamm) return;
  try {
    const roh = localStorage.getItem(KEY);
    const alt = roh ? (JSON.parse(roh) as Record<string, unknown>) : {};
    localStorage.setItem(KEY, JSON.stringify({ ...alt, stamm: s.stamm }));
  } catch {
    // ohne Speicher gilt das Formular nur bis zum Schließen
  }
});
