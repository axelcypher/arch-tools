import { create } from 'zustand';
import type { AllgemeineEinstellungen, KonfigOrt } from '@core/platform/konfig';
import {
  allgemeinAendern,
  allgemeinAus,
  konfigAendern,
  konfigLesen,
  konfigOrdnerWechseln,
  konfigOrt,
  konfigSchreiben,
  konfigSchreibenWennUnveraendert,
  konfigStand,
  VORGABE_ALLGEMEIN,
} from '@core/platform/konfig';
import { hatDateisystem, tauriDateisystem } from './dateisystem';
import type { Vorlage } from './plan';
import { ladeVorlagen } from './plan';
import type { Sicherung } from './sicherung';
import { SICHERUNGEN, sicherungenAus, sicherungenMit, sicherungsName } from './sicherung';
import type { Stammdaten } from './stammdaten';
import { leereStammdaten } from './stammdaten';
import type { Struktur } from './struktur';
import { alterOapPfad, STANDARD, strukturAusJson } from './struktur';

/**
 * Zustand des Tools. Die Einstellungen liegen im gemeinsamen Konfigurationsordner aller Apps:
 *   allgemein.json       Stammordner der Projekte, Ort neuer Projektdateien, Fotoordner (alle Apps)
 *   projektordner.json   Struktur (samt Vorlagen-Presets) und Vorlagenordner (dieses Tool)
 * projektordner.json wird nur geschrieben, wenn sie seit dem Lesen unverändert ist (sonst Meldung „von einem anderen
 * Rechner geändert“), und entprellt – nicht bei jeder einzelnen Änderung. Vor dem Ersetzen der Struktur entsteht eine
 * Sicherung (projektordner-sicherungen.json, siehe sicherung.ts).
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
  /** die Einstellungen sind aus dem Konfigurationsordner gelesen */
  geladen: boolean;
  /** Stand von projektordner.json beim letzten Lesen bzw. Schreiben (zum Erkennen fremder Änderungen) */
  konfigStandEigen: string | null;
  /** projektordner.json wurde inzwischen anderswo geändert: deren Inhalt; nichts wird geschrieben, bis entschieden ist */
  konflikt: { roh: unknown } | null;
  /**
   * Die Struktur in projektordner.json ließ sich nicht lesen (z. B. Format einer neueren Fassung): der Grund. Angezeigt
   * wird solange die Vorgabe, geschrieben wird nichts (auch nicht das Ordnerschema für alle Apps), bis die Struktur
   * bewusst ersetzt wird (`strukturErsetzen` – vorher wird der unlesbare Inhalt gesichert).
   */
  strukturFehler: string | null;
  /** Rohinhalt von projektordner.json beim letzten Lesen bzw. Schreiben – Felder, die dieses Tool nicht kennt, bleiben beim Schreiben erhalten */
  rohEigen: Record<string, unknown>;
  /** die Struktur vor der letzten Ersetzung („Rückgängig“) – entfällt mit der nächsten Änderung */
  rueckgaengig: { struktur: Struktur; text: string } | null;
  setStamm: (patch: Partial<Stammdaten>) => void;
  setStruktur: (s: Struktur) => void;
  /**
   * Struktur als Ganzes ersetzen (Vorgabe, Laden, Sicherung, Ordnerliste aus der Textansicht): vorher sichern,
   * „Rückgängig“ anbieten. Ohne Sicherung nur auf ausdrücklichen Wunsch (`sicherung: false`); eine unlesbare Struktur
   * (`strukturFehler`) wird immer gesichert.
   */
  strukturErsetzen: (neu: Struktur, grund: string, optionen?: { sicherung?: boolean }) => Promise<void>;
  /** die letzte Ersetzung zurücknehmen */
  strukturRueckgaengig: () => void;
  /** Sicherungen der Struktur im Konfigurationsordner, neueste zuerst */
  sicherungenLesen: () => Promise<Sicherung[]>;
  /** anstehendes Schreiben sofort ausführen (statt nach der Wartezeit) */
  speichernJetzt: () => Promise<void>;
  /** projektordner.json frisch lesen (beim Wechsel in Einstellungen bzw. Vorlagen) – fremde Änderungen übernehmen */
  neuLesen: () => Promise<void>;
  /** Konflikt lösen: die andere Fassung laden oder die eigene trotzdem speichern */
  konfliktLoesen: (wie: 'neu-laden' | 'meine') => Promise<void>;
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

/** Rohinhalt als Objekt (sonst leer) */
const alsObjekt = (roh: unknown): Record<string, unknown> => (roh && typeof roh === 'object' && !Array.isArray(roh) ? (roh as Record<string, unknown>) : {});

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

/** so lange nach der letzten Änderung wird projektordner.json geschrieben */
export const SPEICHERN_NACH_MS = 400;

/** Felder der Struktur, die dieses Tool selbst schreibt – alle übrigen (von neueren Fassungen) bleiben unverändert */
const STRUKTUR_FELDER = new Set(['name', 'nummernschema', 'ordnername', 'dateischema', 'ordner', 'vorlagenname', 'presets', 'bausteine']);

/**
 * Inhalt von projektordner.json lesen. Lässt sich die Struktur nicht lesen, gilt nicht still die Vorgabe als gespeichert:
 * `strukturFehler` nennt den Grund und sperrt das Schreiben (siehe dort).
 */
const eigenAus = (roh: unknown) => {
  const eigen = alsObjekt(roh);
  let struktur = STANDARD;
  let fehler: string | null = roh != null && roh !== eigen ? 'kein JSON-Objekt' : null;
  if (!fehler && eigen.struktur != null) {
    try {
      struktur = strukturAusJson(JSON.stringify(eigen.struktur));
    } catch (e) {
      fehler = fehlertext(e);
    }
  }
  return {
    struktur,
    vorlagenordner: typeof eigen.vorlagenordner === 'string' ? eigen.vorlagenordner : '',
    rohEigen: eigen,
    strukturFehler: fehler
      ? `Die Struktur in projektordner.json lässt sich nicht lesen (${fehler}). Angezeigt wird die Vorgabe; gespeichert wird nichts, bis Sie die Struktur bewusst ersetzen – über „Struktur laden …“, eine Sicherung oder „Vorgabe wiederherstellen …“. Der bisherige Inhalt wird dann vorher gesichert.`
      : null,
  };
};

/** zu schreibender Inhalt: der Rohinhalt mit der eigenen Struktur und dem Vorlagenordner – unbekannte Felder bleiben */
const eigenesMit = (roh: Record<string, unknown>, struktur: Struktur, vorlagenordner: string) => {
  const fremd = Object.fromEntries(Object.entries(alsObjekt(roh.struktur)).filter(([k]) => !STRUKTUR_FELDER.has(k)));
  return { ...roh, struktur: { ...fremd, ...struktur }, vorlagenordner };
};

export const useOrdner = create<OrdnerState>()((set, get) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let schreiben: Promise<void> = Promise.resolve();
  /** jetzt schreiben – nur, wenn die Datei seit dem Lesen unverändert ist; sonst Konflikt melden */
  const jetztSpeichern = (): Promise<void> => {
    schreiben = schreiben.then(async () => {
      const { struktur, vorlagenordner, konfigStandEigen, konflikt, strukturFehler, rohEigen } = get();
      if (konflikt || strukturFehler) return;
      try {
        const wert = eigenesMit(rohEigen, struktur, vorlagenordner);
        const r = await konfigSchreibenWennUnveraendert(BEREICH, wert, konfigStandEigen);
        if (r.ok) set({ konfigStandEigen: r.stand, rohEigen: wert });
        else set({ konflikt: { roh: r.aktuell } });
      } catch (e) {
        set({ konfigFehler: `Einstellungen nicht gespeichert: ${fehlertext(e)}` });
      }
    });
    return schreiben;
  };
  // entprellt: mehrere Änderungen kurz hintereinander ergeben ein Schreiben
  const eigeneSpeichern = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void jetztSpeichern();
    }, SPEICHERN_NACH_MS);
  };
  const speichernJetzt = () => {
    if (!timer) return schreiben;
    clearTimeout(timer);
    timer = null;
    return jetztSpeichern();
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
    geladen: false,
    konfigStandEigen: null,
    konflikt: null,
    strukturFehler: null,
    rohEigen: {},
    rueckgaengig: null,
    setStruktur: (struktur) => {
      set({ struktur, rueckgaengig: null });
      eigeneSpeichern();
    },
    strukturErsetzen: async (neu, grund, { sicherung = true } = {}) => {
      const { struktur: alt, vorlagenordner, strukturFehler, rohEigen } = get();
      if (sicherung || strukturFehler) {
        // eine unlesbare Struktur wird so gesichert, wie sie in der Datei steht
        const inhalt = { struktur: (strukturFehler ? rohEigen.struktur : alt) as Struktur, vorlagenordner };
        try {
          await konfigAendern(SICHERUNGEN, (roh) => sicherungenMit(roh, { name: sicherungsName(new Date()), grund: `vor: ${grund}`, inhalt }));
        } catch (e) {
          throw new Error(`Die Sicherung der bisherigen Struktur ließ sich nicht anlegen – die Struktur bleibt unverändert. (${fehlertext(e)})`);
        }
      }
      // die unlesbare Fassung lässt sich nicht „rückgängig“ herstellen – sie liegt in den Sicherungen
      set({ struktur: neu, strukturFehler: null, rueckgaengig: strukturFehler ? null : { struktur: alt, text: grund } });
      eigeneSpeichern();
    },
    strukturRueckgaengig: () => {
      const r = get().rueckgaengig;
      if (!r) return;
      set({ struktur: r.struktur, rueckgaengig: null });
      eigeneSpeichern();
    },
    sicherungenLesen: async () => sicherungenAus(await konfigLesen(SICHERUNGEN)),
    speichernJetzt,
    neuLesen: async () => {
      await speichernJetzt();
      if (get().konflikt) return;
      try {
        const roh = await konfigLesen(BEREICH);
        // nur übernehmen, wenn es anderswo geändert ist und hier nichts ansteht
        if (roh == null || konfigStand(roh) === get().konfigStandEigen || timer || get().konflikt) return;
        set({ ...eigenAus(roh), konfigStandEigen: konfigStand(roh), rueckgaengig: null });
      } catch (e) {
        set({ konfigFehler: `Einstellungen nicht lesbar: ${fehlertext(e)}` });
      }
    },
    konfliktLoesen: async (wie) => {
      const k = get().konflikt;
      if (!k) return;
      if (wie === 'neu-laden') {
        // die eigene Fassung bleibt über „Rückgängig“ erreichbar
        const eigene = get().struktur;
        set({ ...eigenAus(k.roh), konfigStandEigen: konfigStand(k.roh), konflikt: null, rueckgaengig: { struktur: eigene, text: 'Die Struktur des anderen Rechners wurde geladen.' } });
        return;
      }
      // die Felder der anderen Fassung, die dieses Tool nicht kennt, bleiben erhalten
      set({ konfigStandEigen: konfigStand(k.roh), rohEigen: alsObjekt(k.roh), konflikt: null, strukturFehler: null });
      await jetztSpeichern();
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
        const anfangEigen = { struktur: anfang.struktur, vorlagenordner: anfang.vorlagenordner };
        if (rohEigen == null) await konfigSchreiben(BEREICH, anfangEigen);
        const allgemein = rohAllgemein == null ? allgemeinAus(await konfigLesen('allgemein')) : allgemeinAus(rohAllgemein);
        const eigen = rohEigen ?? anfangEigen;
        set({
          konfig: ort,
          konfigFehler: null,
          allgemein,
          stammordner: allgemein.projekte[0] ?? '',
          ...eigenAus(eigen),
          // Stand wie beim Lesen der Datei (JSON hin und zurück)
          konfigStandEigen: konfigStand(JSON.parse(JSON.stringify(eigen))),
          konflikt: null,
          geladen: true,
        });
      } catch (e) {
        set({ konfigFehler: `Einstellungen nicht lesbar: ${fehlertext(e)}` });
      }
    },
    konfigOrdnerSetzen: async (ordner) => {
      await speichernJetzt();
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

// Schema der Projektordner-Namen für alle Apps (gleiche Ableitung von Nummer und Kurzname, P-09): nachgeführt, sobald
// die Einstellungen gelesen sind und wenn es sich ändert
useOrdner.subscribe((s, vorher) => {
  // eine unlesbare Struktur (es gilt nur vorläufig die Vorgabe) schreibt nichts in die gemeinsamen Einstellungen
  if (!s.geladen || s.strukturFehler || (s.struktur === vorher.struktur && s.geladen === vorher.geladen && s.strukturFehler === vorher.strukturFehler)) return;
  if (s.struktur.ordnername !== s.allgemein.ordnerSchema) s.setAllgemein({ ordnerSchema: s.struktur.ordnername });
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
