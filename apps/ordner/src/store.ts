import { create } from 'zustand';
import type { AllgemeineEinstellungen, KonfigOrt } from '@core/platform/konfig';
import {
  allgemeinAendern,
  allgemeinAus,
  konfigAendern,
  konfigLesen,
  konfigOrt,
  konfigOrtBeobachten,
  konfigSchreiben,
  konfigSchreibenWennUnveraendert,
  konfigStand,
  konfigVorWechsel,
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
  /** die Struktur vor der letzten Ersetzung („Rückgängig“) – entfällt mit der nächsten Änderung */
  rueckgaengig: { struktur: Struktur; text: string } | null;
  setStamm: (patch: Partial<Stammdaten>) => void;
  setStruktur: (s: Struktur) => void;
  /** Struktur als Ganzes ersetzen (Standard, Laden, Sicherung, Ordnerliste): vorher sichern, „Rückgängig“ anbieten */
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

/** so lange nach der letzten Änderung wird projektordner.json geschrieben */
export const SPEICHERN_NACH_MS = 400;

const eigenAus = (roh: unknown) => {
  const eigen = (roh ?? {}) as { struktur?: unknown; vorlagenordner?: unknown };
  return { struktur: strukturAus(eigen.struktur), vorlagenordner: typeof eigen.vorlagenordner === 'string' ? eigen.vorlagenordner : '' };
};

export const useOrdner = create<OrdnerState>()((set, get) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let schreiben: Promise<void> = Promise.resolve();
  /** jetzt schreiben – nur, wenn die Datei seit dem Lesen unverändert ist; sonst Konflikt melden */
  const jetztSpeichern = (): Promise<void> => {
    schreiben = schreiben.then(async () => {
      const { struktur, vorlagenordner, konfigStandEigen, konflikt } = get();
      if (konflikt) return;
      try {
        const r = await konfigSchreibenWennUnveraendert(BEREICH, { struktur, vorlagenordner }, konfigStandEigen);
        if (r.ok) set({ konfigStandEigen: r.stand });
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
    rueckgaengig: null,
    setStruktur: (struktur) => {
      set({ struktur, rueckgaengig: null });
      eigeneSpeichern();
    },
    strukturErsetzen: async (neu, grund, { sicherung = true } = {}) => {
      const { struktur: alt, vorlagenordner } = get();
      if (sicherung) {
        try {
          await konfigAendern(SICHERUNGEN, (roh) => sicherungenMit(roh, { name: sicherungsName(new Date()), grund: `vor: ${grund}`, inhalt: { struktur: alt, vorlagenordner } }));
        } catch (e) {
          throw new Error(`Die Sicherung der bisherigen Struktur ließ sich nicht anlegen – die Struktur bleibt unverändert. (${fehlertext(e)})`);
        }
      }
      set({ struktur: neu, rueckgaengig: { struktur: alt, text: grund } });
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
      set({ konfigStandEigen: konfigStand(k.roh), konflikt: null });
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
        const [rohAllgemein, rohEigen] = await Promise.all([konfigLesen('allgemein'), konfigLesen(BEREICH)]);
        // nach dem Lesen: Fällt das Netzlaufwerk dabei weg, gilt schon der Notbetrieb
        const ort = await konfigOrt();
        // erster Start mit dem Konfigurationsordner: Einstellungen älterer Fassungen übernehmen – nicht im Notbetrieb
        // (Netzlaufwerk nicht erreichbar): dann gelten die Vorgaben, gespeichert wird nichts
        const schreiben = !ort?.notbetrieb;
        if (rohAllgemein == null && schreiben) {
          const oap = alterOapPfad(lokal.struktur);
          await allgemeinAendern({ projekte: anfang.allgemein.projekte, ...(oap ? { oapPfad: oap } : {}) });
        }
        const anfangEigen = { struktur: anfang.struktur, vorlagenordner: anfang.vorlagenordner };
        if (rohEigen == null && schreiben) await konfigSchreiben(BEREICH, anfangEigen);
        const allgemein = rohAllgemein == null && schreiben ? allgemeinAus(await konfigLesen('allgemein')) : allgemeinAus(rohAllgemein);
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
  if (!s.geladen || (s.struktur === vorher.struktur && s.geladen === vorher.geladen)) return;
  if (s.struktur.ordnername !== s.allgemein.ordnerSchema) s.setAllgemein({ ordnerSchema: s.struktur.ordnername });
});

// Speicherort der Einstellungen (core, für alle Apps): vor dem Wechsel Ausstehendes speichern, danach neu lesen –
// auch nach einem Wechsel in einem anderen Fenster und wenn das Netzlaufwerk wieder erreichbar ist
konfigVorWechsel(() => useOrdner.getState().speichernJetzt());
konfigOrtBeobachten((o) => {
  const s = useOrdner.getState();
  if (!s.geladen || (s.konfig && o && s.konfig.ordner === o.ordner && s.konfig.modus === o.modus && s.konfig.notbetrieb === o.notbetrieb)) return;
  void s.konfigLaden();
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
