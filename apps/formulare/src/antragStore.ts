/**
 * Zustand für Antrag und Export: Einstellungen (global und je Projekt), die Angaben der App zum gewählten
 * Projekt (`formulare.json`: Projektumfang, aktive Antragsfassung), die Antragsfassungen im Projektordner und der
 * Status jedes Dokuments im Projektumfang. Dazu der Export als PDF, das Verknüpfen von Dateien und das Anlegen
 * fehlender Formulare.
 *
 * Eigener Store neben dem der Formulare, damit Tastendrücke im Formular hier nur eine leichte Neuberechnung
 * auslösen (verzögert), keine Dateizugriffe.
 */

import { create } from 'zustand';
import { saveBinaryFile } from '@core/platform/files';
import { logger } from '@core/platform/log';
import type { ExportEinstellungen, ExportUeberschreibung, Fassung, Fuellstand, KatalogEintrag, ProjektDatei, Status, UmfangEintrag } from './antrag';
import {
  anzeigeName,
  dateiImAntrag,
  dateiname,
  einstellungenAus,
  einstellungenFuer,
  externStatus,
  fassungenAus,
  formularStatus,
  formularVon,
  fuellstand,
  katalogAus,
  passt,
  projektDateiAus,
  quelleVon,
  standardFassung,
  UEBERSCHREIBBAR,
} from './antrag';
import type { Eintrag } from './dateisystem';
import { PROJEKTDATEI, verbinde } from './dateisystem';
import type { Feld } from './forma/felder';
import { felderDerSeite } from './forma/felder';
import type { Formular } from './forma/formular';
import { formularBytes, kennung, parseFormular, setzeAngekreuzt, setzeMemoText, stand } from './forma/formular';
import { bezeichner } from './forma/dfm';
import { formularPdf } from './forma/pdf';
import type { FormularProfil } from './profil';
import { leeresProfil, profilSchluessel } from './profil';
import type { FormularEintrag, Projekt } from './projekte';
import { formulareDesProjekts } from './projekte';
import { ablageVon, entwurfVon, useFormulare, wertVon } from './store';

const log = logger('formulare');

const EINSTELLUNGEN = 'formulare:export';
const KATALOG = 'formulare:katalog';
const UEBERSCHREIBUNGEN = 'formulare:export-projekte';

function lesen<T>(schluessel: string, vorgabe: T): T {
  try {
    const roh = localStorage.getItem(schluessel);
    return roh ? (JSON.parse(roh) as T) : vorgabe;
  } catch {
    return vorgabe;
  }
}
function schreiben(schluessel: string, wert: unknown) {
  try {
    localStorage.setItem(schluessel, JSON.stringify(wert));
  } catch {
    // nur für diese Sitzung
  }
}

/** Angaben zu einem Formular des Projekts (aus der Datei, mit ungespeicherten Eingaben) */
export interface FormularInfo {
  pfad: string;
  name: string;
  kennung: string | null;
  stand: string | null;
  fuellstand: Fuellstand;
  /** letzte Änderung: Datei oder ungespeicherte Eingaben (ms) */
  letzteAenderung: number;
}

/** Ein Dokument des Projektumfangs mit seinem Status in der aktiven Fassung */
export interface DokZustand {
  eintrag: UmfangEintrag;
  status: Status;
  /** intern: das Formular im FORMA-Projekt */
  formular: FormularInfo | null;
  /** die Datei im Ordner der aktiven Fassung */
  datei: Eintrag | null;
  /** extern: die Quelle (z. B. die Berechnung) */
  quelle: Eintrag | null;
}

/** Wohin exportiert wird: Ordner relativ zum Projektordner und Dateiname mit Endung */
export interface ExportZiel {
  ordner: string;
  name: string;
}

interface AntragState {
  einstellungen: ExportEinstellungen;
  katalog: KatalogEintrag[];
  /** je Projektkürzel */
  ueberschreibungen: Record<string, ExportUeberschreibung>;
  /** `formulare.json` des gewählten Projekts; null = nicht gelesen */
  projektdatei: ProjektDatei | null;
  fassungen: Fassung[];
  /** Dateien im Ordner der aktiven Fassung */
  dateien: Eintrag[];
  /** Quellen externer Dokumente: Ordner (relativ) → Dateien darin */
  quellen: Record<string, Eintrag[]>;
  formularInfo: Record<string, FormularInfo>;
  dokumente: DokZustand[];
  laedt: boolean;

  setEinstellungen: (e: Partial<ExportEinstellungen>) => void;
  setKatalog: (k: KatalogEintrag[] | null) => void;
  /** Abweichungen des gewählten Projekts; null = wieder die Vorgabe */
  setUeberschreibung: (u: ExportUeberschreibung | null) => void;
  /** alles für das gewählte Projekt neu lesen */
  laden: () => Promise<void>;
  /** Dateien neu auflisten und Status berechnen */
  aktualisieren: () => Promise<void>;
  /** nur neu berechnen (nach Eingaben im Formular) */
  neuBerechnen: () => void;
  fassungWaehlen: (name: string, anlegen?: boolean) => Promise<void>;
  umfangSetzen: (umfang: UmfangEintrag[] | null) => Promise<void>;
  /** Datei im Ordner der aktiven Fassung mit einem Dokument verknüpfen; null = Verknüpfung lösen */
  verknuepfen: (umfangId: string, dateiname: string | null) => Promise<void>;
  exportieren: (formularPfad: string, ziel: ExportZiel, ersetzen: boolean) => Promise<string | null>;
  speichernUnter: (formularPfad: string) => Promise<boolean>;
  formularAnlegen: (umfangId: string) => Promise<string | null>;
}

/* ---------- Hilfen ---------- */

const ctx = () => {
  const s = useFormulare.getState();
  const ablage = ablageVon(s, s.projekt);
  return { ds: s.ds, projekt: s.projekt, ablage, basis: ablage ? verbinde(ablage.root, ablage.pfad) : null };
};

/** Einstellungen für das gewählte Projekt */
export const wirksameEinstellungen = (s: Pick<AntragState, 'einstellungen' | 'ueberschreibungen'>, p: Projekt | null) =>
  einstellungenFuer(s.einstellungen, p ? s.ueberschreibungen[p.ordner] : undefined);

/** Die aktive Antragsfassung: gewählt, sonst die neueste der Standardart, sonst die Standardart selbst */
export function aktiveFassung(s: Pick<AntragState, 'projektdatei' | 'fassungen' | 'einstellungen' | 'ueberschreibungen'>, p: Projekt | null): string {
  const e = wirksameEinstellungen(s, p);
  return s.projektdatei?.aktiveFassung || standardFassung(s.fassungen, e.arten)?.name || e.arten[0] || 'BAUA';
}

/** Ordner der aktiven Fassung relativ zum Projektordner */
export const antragsOrdner = (s: Parameters<typeof aktiveFassung>[0], p: Projekt | null) => `${wirksameEinstellungen(s, p).antragsordner.replace(/^\/+|\/+$/g, '')}/${aktiveFassung(s, p)}`;

/** voreingestellter Zielordner des Exports (relativ zum Projektordner) */
export function zielOrdner(s: Parameters<typeof aktiveFassung>[0], p: Projekt | null): string {
  const e = wirksameEinstellungen(s, p);
  if (e.ziel === 'aktiv' || !e.zielpfad.trim()) return antragsOrdner(s, p);
  return e.zielpfad
    .replace(/\{antrag\}/gi, aktiveFassung(s, p))
    .replace(/\{k(ü|ue)rzel\}/gi, p?.ordner ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

const ohneEndung = (n: string) => n.replace(/\.[^.]+$/, '');
const nurName = (pfad: string) => pfad.split('/').pop() ?? pfad;

/** Zerlegte Formulare je Datei (nach Größe und Änderungszeit), damit Neuberechnungen nichts neu einlesen */
const zerlegt = new Map<string, { formular: Formular; felder: Feld[][] }>();

async function formularLesen(projekt: Projekt, pfad: string, eintrag: Eintrag | undefined) {
  const s = useFormulare.getState();
  if (s.offen?.projekt === projekt && s.offen.pfad === pfad) return { formular: s.offen.formular, felder: s.offen.felder };
  const k = `${projekt.root}|${pfad}|${eintrag?.groesse ?? 0}|${eintrag?.geaendert ?? 0}`;
  const da = zerlegt.get(k);
  if (da) return da;
  const bytes = await s.ds!.lies(projekt.root, pfad);
  if (!bytes) throw new Error(`${pfad}: nicht gefunden`);
  const formular = parseFormular(bytes);
  const neu = { formular, felder: formular.seiten.map((x, i) => felderDerSeite(x, i)) };
  zerlegt.set(k, neu);
  return neu;
}

const profilFuer = (formular: Formular, name: string): FormularProfil => useFormulare.getState().profile[profilSchluessel(formular, name)] ?? leeresProfil();

/** Werte eines Formulars: im geöffneten die aktuellen Eingaben, sonst Datei plus ungespeicherter Entwurf */
function werteVon(projekt: Projekt, pfad: string): { wert: (f: Feld) => string | boolean; entwurfZeit: number | null } {
  const s = useFormulare.getState();
  const offen = s.offen;
  if (offen?.projekt === projekt && offen.pfad === pfad) {
    const geaendert = Object.keys(offen.aenderungen).length > 0;
    return { wert: (f) => wertVon(offen, f), entwurfZeit: geaendert ? (offen.gesichert ?? Date.now()) : null };
  }
  const e = entwurfVon(projekt, pfad);
  return { wert: (f) => (e && f.schluessel in e.aenderungen ? e.aenderungen[f.schluessel] : f.original), entwurfZeit: e?.zeit ?? null };
}

/** Werte zum Ausfüllen leeren: Textfelder (außer schreibgeschützten) und Kästchen */
function geleert(bytes: Uint8Array): Uint8Array {
  const f = parseFormular(bytes);
  f.seiten.forEach((s, i) => {
    for (const feld of felderDerSeite(s, i)) {
      if (feld.art === 'kreuz') {
        if (feld.original === true) setzeAngekreuzt(f, i, feld.name, false);
      } else if (bezeichner(feld.kasten.o, 'ReadOnly') !== 'True' && feld.original !== '') setzeMemoText(f, i, feld.name, '');
    }
  });
  return formularBytes(f);
}

/* ---------- Store ---------- */

let dateienFormaProjekt: Eintrag[] = [];

export const useAntrag = create<AntragState>((set, get) => {
  const projektdateiSchreiben = async (neu: ProjektDatei) => {
    const { ds, projekt } = ctx();
    if (!ds || !projekt) return;
    await ds.projektdateiSchreiben(projekt.root, `${projekt.ordner}/${PROJEKTDATEI}`, new TextEncoder().encode(`${JSON.stringify(neu, null, 2)}\n`));
    set({ projektdatei: neu });
  };
  const meldung = (art: 'info' | 'fehler', text: string) => useFormulare.getState().setMeldung({ art, text });
  const fehler = (was: string, e: unknown) => {
    const text = `${was}: ${e instanceof Error ? e.message : String(e)}`;
    log.error(text);
    meldung('fehler', text);
  };

  return {
    einstellungen: einstellungenAus(lesen<unknown>(EINSTELLUNGEN, null)),
    katalog: katalogAus(lesen<unknown>(KATALOG, null)),
    ueberschreibungen: lesen<Record<string, ExportUeberschreibung>>(UEBERSCHREIBUNGEN, {}),
    projektdatei: null,
    fassungen: [],
    dateien: [],
    quellen: {},
    formularInfo: {},
    dokumente: [],
    laedt: false,

    setEinstellungen: (teil) => {
      const einstellungen = einstellungenAus({ ...get().einstellungen, ...teil });
      schreiben(EINSTELLUNGEN, einstellungen);
      set({ einstellungen });
      void get().laden();
    },
    setKatalog: (k) => {
      const katalog = k ?? katalogAus(null);
      if (k) schreiben(KATALOG, katalog);
      else
        try {
          localStorage.removeItem(KATALOG);
        } catch {
          // nichts zu löschen
        }
      set({ katalog });
    },
    setUeberschreibung: (u) => {
      const p = useFormulare.getState().projekt;
      if (!p) return;
      const alle = { ...get().ueberschreibungen };
      const sauber = u ? Object.fromEntries(UEBERSCHREIBBAR.filter((k) => u[k] !== undefined && u[k] !== '').map((k) => [k, u[k]])) : {};
      if (Object.keys(sauber).length) alle[p.ordner] = sauber;
      else delete alle[p.ordner];
      schreiben(UEBERSCHREIBUNGEN, alle);
      set({ ueberschreibungen: alle });
      void get().laden();
    },

    laden: async () => {
      const { ds, projekt, basis } = ctx();
      if (!ds || !projekt) {
        set({ projektdatei: null, fassungen: [], dateien: [], quellen: {}, formularInfo: {}, dokumente: [] });
        return;
      }
      set({ laedt: true });
      try {
        let projektdatei: ProjektDatei = {};
        try {
          const roh = await ds.lies(projekt.root, `${projekt.ordner}/${PROJEKTDATEI}`);
          if (roh) projektdatei = projektDateiAus(JSON.parse(new TextDecoder().decode(roh)));
        } catch (e) {
          fehler(`${PROJEKTDATEI} von ${projekt.ordner} nicht lesbar`, e);
        }
        let fassungen: Fassung[] = [];
        const e = wirksameEinstellungen(get(), projekt);
        if (basis && e.antragsordner.trim()) {
          try {
            const ordner = (await ds.liste(verbinde(basis, e.antragsordner), 1)).filter((x) => x.ordner).map((x) => x.pfad);
            fassungen = fassungenAus(ordner, e.arten);
          } catch {
            // Antragsordner gibt es (noch) nicht
          }
        }
        // inzwischen ein anderes Projekt gewählt?
        if (useFormulare.getState().projekt !== projekt) return;
        set({ projektdatei, fassungen });
        await get().aktualisieren();
      } finally {
        set({ laedt: false });
      }
    },

    aktualisieren: async () => {
      const { ds, projekt, basis } = ctx();
      if (!ds || !projekt) return;
      const e = wirksameEinstellungen(get(), projekt);
      let dateien: Eintrag[] = [];
      const quellen: Record<string, Eintrag[]> = {};
      if (basis) {
        try {
          dateien = await ds.liste(verbinde(basis, antragsOrdner(get(), projekt)), 1);
        } catch {
          // Ordner der Fassung gibt es noch nicht
        }
        const ordner = new Set((get().projektdatei?.umfang ?? []).filter((u) => u.art === 'extern').map((u) => (u.quelle ?? e.berechnungsordner).trim()));
        for (const o of ordner) {
          try {
            quellen[o] = o ? await ds.liste(verbinde(basis, o), 2) : [];
          } catch {
            quellen[o] = [];
          }
        }
      }
      try {
        dateienFormaProjekt = await ds.liste(verbinde(projekt.root, projekt.ordner), 1);
      } catch {
        dateienFormaProjekt = [];
      }
      if (useFormulare.getState().projekt !== projekt) return;
      set({ dateien, quellen });
      // Formulare zerlegen (zwischengespeichert), dann rechnen
      const formulare = useFormulare.getState().formulare;
      await Promise.all(
        formulare.map(async (f) => {
          try {
            await formularLesen(projekt, f.pfad, dateienFormaProjekt.find((d) => d.pfad === nurName(f.pfad)));
          } catch {
            // nicht lesbar: ohne Füllstand
          }
        }),
      );
      get().neuBerechnen();
    },

    neuBerechnen: () => {
      const s = useFormulare.getState();
      const projekt = s.projekt;
      if (!projekt) return;
      const formularInfo: Record<string, FormularInfo> = {};
      for (const f of s.formulare) {
        const eintrag = dateienFormaProjekt.find((d) => d.pfad === nurName(f.pfad));
        const k = `${projekt.root}|${f.pfad}|${eintrag?.groesse ?? 0}|${eintrag?.geaendert ?? 0}`;
        const offen = s.offen?.projekt === projekt && s.offen.pfad === f.pfad ? s.offen : null;
        const z = offen ? { formular: offen.formular, felder: offen.felder } : zerlegt.get(k);
        if (!z) continue;
        const { wert, entwurfZeit } = werteVon(projekt, f.pfad);
        formularInfo[f.pfad] = {
          pfad: f.pfad,
          name: f.name,
          kennung: kennung(z.formular) ?? null,
          stand: stand(z.formular) ?? null,
          fuellstand: fuellstand(z.felder, profilFuer(z.formular, f.name), wert),
          letzteAenderung: Math.max(eintrag?.geaendert ?? 0, entwurfZeit ?? 0),
        };
      }
      const st = get();
      const e = wirksameEinstellungen(st, projekt);
      const fassung = aktiveFassung(st, projekt);
      const infos = Object.values(formularInfo);
      const dokumente = (st.projektdatei?.umfang ?? []).map((u): DokZustand => {
        const datei = dateiImAntrag(u, st.dateien, fassung);
        if (u.art === 'intern') {
          const formular = formularVon(u, infos);
          if (!formular) return { eintrag: u, status: 'fehlt', formular: null, datei, quelle: null };
          return { eintrag: u, status: formularStatus(formular.fuellstand, formular.letzteAenderung, datei), formular, datei, quelle: null };
        }
        const quelle = quelleVon(u, st.quellen[(u.quelle ?? e.berechnungsordner).trim()] ?? []);
        return { eintrag: u, status: externStatus(quelle, datei), formular: null, datei, quelle };
      });
      set({ formularInfo, dokumente });
    },

    fassungWaehlen: async (name, anlegen = false) => {
      const { ds, projekt, basis } = ctx();
      if (!ds || !projekt) return;
      try {
        if (anlegen && basis) await ds.ordnerAnlegen(basis, `${wirksameEinstellungen(get(), projekt).antragsordner}/${name}`);
        await projektdateiSchreiben({ ...(get().projektdatei ?? {}), aktiveFassung: name });
        await get().laden();
        if (anlegen) meldung('info', `Neue Antragsfassung „${name}“ angelegt – sie ist jetzt das Ziel des Exports.`);
      } catch (e) {
        fehler(`Antragsfassung ${name}`, e);
      }
    },

    umfangSetzen: async (umfang) => {
      try {
        const neu: ProjektDatei = { ...(get().projektdatei ?? {}) };
        if (umfang) neu.umfang = umfang;
        else delete neu.umfang;
        await projektdateiSchreiben(neu);
        await get().aktualisieren();
      } catch (e) {
        fehler('Projektumfang nicht gespeichert', e);
      }
    },

    verknuepfen: async (umfangId, name) => {
      const projekt = useFormulare.getState().projekt;
      const umfang = get().projektdatei?.umfang;
      if (!umfang || !projekt) return;
      const fassung = aktiveFassung(get(), projekt);
      await get().umfangSetzen(
        umfang.map((u) => {
          if (u.id !== umfangId) return u;
          const dateien = { ...u.dateien };
          if (name) dateien[fassung] = name;
          else delete dateien[fassung];
          return { ...u, dateien };
        }),
      );
    },

    exportieren: async (formularPfad, ziel, ersetzen) => {
      const { ds, projekt, basis } = ctx();
      if (!ds || !projekt || !basis) return null;
      try {
        const pdf = await pdfVon(projekt, formularPfad);
        const pfad = `${ziel.ordner ? `${ziel.ordner}/` : ''}${ziel.name}`;
        const da = await ds.lies(basis, pfad).catch(() => null);
        if (da && !ersetzen) throw new Error(`${ziel.name} gibt es in ${ziel.ordner || 'diesem Ordner'} schon`);
        if (da) await ds.dokumentErsetzen(basis, pfad, pdf);
        else await ds.dokumentAnlegen(basis, pfad, pdf);
        log.info(`Exportiert: ${formularPfad} → ${verbinde(basis, pfad)}`);
        // im Ordner der aktiven Fassung: mit dem Dokument des Projektumfangs verknüpfen
        const st = get();
        const umfang = st.projektdatei?.umfang;
        const doc = st.dokumente.find((d) => d.formular?.pfad === formularPfad);
        if (umfang && doc && ziel.ordner === antragsOrdner(st, projekt)) {
          const fassung = aktiveFassung(st, projekt);
          await get().umfangSetzen(
            umfang.map((u) => (u.id === doc.eintrag.id ? { ...u, formularDatei: nurName(formularPfad), dateien: { ...u.dateien, [fassung]: ziel.name } } : u)),
          );
        } else await get().aktualisieren();
        meldung('info', `Als PDF exportiert: ${pfad}`);
        return verbinde(basis, pfad);
      } catch (e) {
        fehler('PDF-Export', e);
        return null;
      }
    },

    speichernUnter: async (formularPfad) => {
      const { projekt, basis } = ctx();
      if (!projekt) return false;
      try {
        const pdf = await pdfVon(projekt, formularPfad);
        const v = exportVorschlag(formularPfad);
        const ordner = basis ? verbinde(basis, zielOrdner(get(), projekt)) : null;
        const ok = await saveBinaryFile({ defaultName: v.name, defaultDir: ordner, data: pdf, filterName: 'PDF', extension: 'pdf', mime: 'application/pdf' });
        if (ok) {
          meldung('info', `${v.name} gespeichert.`);
          void get().aktualisieren();
        }
        return ok;
      } catch (e) {
        fehler('Speichern unter', e);
        return false;
      }
    },

    formularAnlegen: async (umfangId) => {
      const s = useFormulare.getState();
      const { ds, projekt } = ctx();
      const u = get().projektdatei?.umfang?.find((x) => x.id === umfangId);
      if (!ds || !projekt || !u) return null;
      try {
        const vorlage = await vorlageSuchen(u);
        if (!vorlage) throw new Error(`Keine Vorlage für „${u.titel}“ gefunden – bitte in den Einstellungen einen Vorlagenordner mit leeren FORMA-Formularen angeben`);
        const name = neuerName(vorlage.name, s.formulare);
        const pfad = `${projekt.ordner}/${name}`;
        await ds.formularAnlegen(projekt.root, pfad, geleert(vorlage.bytes));
        log.info(`Formular angelegt: ${pfad} (Vorlage: ${vorlage.herkunft})`);
        const umfang = get().projektdatei?.umfang ?? [];
        await projektdateiSchreiben({ ...(get().projektdatei ?? {}), umfang: umfang.map((x) => (x.id === u.id ? { ...x, formularDatei: name } : x)) });
        useFormulare.setState({ formulare: await formulareDesProjekts(ds, projekt) });
        const eintrag = useFormulare.getState().formulare.find((f) => f.pfad === pfad);
        if (eintrag) await useFormulare.getState().formularOeffnen(eintrag);
        meldung('info', `„${name}“ aus ${vorlage.herkunft} angelegt (leer). „Aus Projektkarte ausfüllen“ übernimmt die Projektdaten.`);
        return pfad;
      } catch (e) {
        fehler(`Formular für „${u.titel}“ anlegen`, e);
        return null;
      }
    },
  };
});

/* ---------- Export ---------- */

/** PDF eines Formulars des Projekts – mit allen Eingaben, auch den noch nicht gespeicherten */
export async function pdfVon(projekt: Projekt, pfad: string): Promise<Uint8Array> {
  const eintrag = dateienFormaProjekt.find((d) => d.pfad === nurName(pfad));
  const { formular, felder } = await formularLesen(projekt, pfad, eintrag);
  const { wert } = werteVon(projekt, pfad);
  return formularPdf(formular, felder, wert, { titel: `${projekt.ordner} – ${anzeigeName(ohneEndung(nurName(pfad)))}` });
}

/** Vorschlag für den Export: Zielordner und Dateiname nach den Einstellungen */
export function exportVorschlag(formularPfad: string, datum = new Date()): ExportZiel {
  const s = useFormulare.getState();
  const st = useAntrag.getState();
  const projekt = s.projekt;
  const e = wirksameEinstellungen(st, projekt);
  const info = st.formularInfo[formularPfad];
  const doc = st.dokumente.find((d) => d.formular?.pfad === formularPfad);
  const formularName = ohneEndung(nurName(formularPfad));
  const name = dateiname(e.namensvorlage, {
    kuerzel: projekt?.ordner ?? '',
    phase: e.phase,
    datum,
    nr: doc?.eintrag.nr,
    name: doc?.eintrag.titel ?? anzeigeName(formularName),
    formular: formularName,
    antrag: aktiveFassung(st, projekt),
    kennung: info?.kennung ?? undefined,
    stand: info?.stand ?? undefined,
  });
  return { ordner: zielOrdner(st, projekt), name: `${name}.pdf` };
}

/* ---------- Formular anlegen ---------- */

/**
 * Vorlage für ein fehlendes Formular: zuerst im Vorlagenordner, sonst das neueste passende Formular aus einem
 * anderen FORMA-Projekt (seine Eingaben werden beim Anlegen geleert).
 */
async function vorlageSuchen(u: UmfangEintrag): Promise<{ name: string; bytes: Uint8Array; herkunft: string } | null> {
  const s = useFormulare.getState();
  const ds = s.ds!;
  const st = useAntrag.getState();
  const muster = u.formular || u.titel;
  const kandidaten = async (root: string, ordner: string) => {
    const liste = await ds.liste(ordner ? verbinde(root, ordner) : root, 1).catch(() => [] as Eintrag[]);
    return liste.filter((e) => !e.ordner && /\.frmsjf$/i.test(e.pfad)).map((e) => ({ ...e, root, rel: ordner ? `${ordner}/${e.pfad}` : e.pfad }));
  };
  const passend = async (liste: Awaited<ReturnType<typeof kandidaten>>) => {
    // Name genügt; sonst die Kennung im Kopf des Formulars
    const nachName = liste.filter((e) => passt(ohneEndung(e.pfad), muster));
    if (nachName.length) return nachName;
    const out: typeof liste = [];
    for (const e of liste) {
      const b = await ds.lies(e.root, e.rel).catch(() => null);
      try {
        if (b && kennung(parseFormular(b))?.toLowerCase() === muster.toLowerCase()) out.push(e);
      } catch {
        // keine FORMA-Datei
      }
    }
    return out;
  };
  const neueste = <T extends Eintrag>(l: T[]) => l.reduce<T | null>((b, e) => (!b || (e.geaendert ?? 0) > (b.geaendert ?? 0) ? e : b), null);

  if (st.einstellungen.vorlagenordner.trim()) {
    const v = neueste(await passend(await kandidaten(st.einstellungen.vorlagenordner.trim(), '')));
    const b = v && (await ds.lies(v.root, v.rel));
    if (v && b) return { name: v.pfad, bytes: b, herkunft: 'dem Vorlagenordner' };
  }
  const andere = s.projekte.filter((p) => !(p.root === s.projekt?.root && p.ordner === s.projekt?.ordner));
  const alle = (await Promise.all(andere.map((p) => kandidaten(p.root, p.ordner)))).flat();
  const v = neueste(await passend(alle));
  const b = v && (await ds.lies(v.root, v.rel));
  return v && b ? { name: v.pfad, bytes: b, herkunft: `Projekt ${v.rel.split('/')[0]}` } : null;
}

/** Name im Projekt: mit der nächsten laufenden Nummer, wenn die Formulare des Projekts so heißen („006-…“) */
export function neuerName(vorlage: string, formulare: FormularEintrag[]): string {
  const nummern = formulare.map((f) => /^(\d+)\s*-/.exec(f.name)?.[1]).filter((n): n is string => !!n);
  const rest = vorlage.replace(/^\s*\d+\s*-\s*/, '');
  let name = rest;
  if (nummern.length) {
    const stellen = Math.max(...nummern.map((n) => n.length));
    name = `${String(Math.max(...nummern.map(Number)) + 1).padStart(stellen, '0')}-${rest}`;
  }
  const vorhanden = new Set(formulare.map((f) => `${f.name}.frmsjf`.toLowerCase()));
  let kandidat = name;
  for (let i = 2; vorhanden.has(kandidat.toLowerCase()); i++) kandidat = name.replace(/\.frmsjf$/i, ` (${i}).frmsjf`);
  return kandidat;
}

/* ---------- mit dem Formulare-Store verbinden ---------- */

let verzoegert: ReturnType<typeof setTimeout> | undefined;
useFormulare.subscribe((s, vorher) => {
  if (s.projekt !== vorher.projekt || s.ablage !== vorher.ablage || s.ds !== vorher.ds) {
    zerlegt.clear();
    if (s.projekt !== vorher.projekt) useAntrag.setState({ projektdatei: null, fassungen: [], dateien: [], quellen: {}, formularInfo: {}, dokumente: [] });
    void useAntrag.getState().laden();
  } else if (s.formulare !== vorher.formulare || s.offen?.bytes !== vorher.offen?.bytes) {
    void useAntrag.getState().aktualisieren();
  } else if (s.offen !== vorher.offen || s.profile !== vorher.profile) {
    clearTimeout(verzoegert);
    verzoegert = setTimeout(() => useAntrag.getState().neuBerechnen(), 300);
  }
});
