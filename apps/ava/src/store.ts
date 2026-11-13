/**
 * Zustand der App: Einstellungen, geöffnetes Projekt (Ordnerstruktur, Abschnitt „ava“ der Projektdatei,
 * Kostenkontrolle), geöffnetes LV mit Verlauf, Ansicht und Auswahl.
 */

import { create } from 'zustand';
import type { ProjectMeta } from '@core/model';
import { projektdateiRoh } from '@core/projektdatei';
import { logger } from '@core/platform/log';
import type { ZellAenderungen } from '@core/dokumente/xlsx';
import { xlsxAendern } from '@core/dokumente/xlsx';
import type { Kontext, KkStand } from './abrechnung/ablauf';
import { kkLaden } from './abrechnung/ablauf';
import type { AvaProjekt } from './avaDaten';
import { avaAendern, avaAus, leeresAvaProjekt } from './avaDaten';
import type { AvaDateien, DateiStand } from './dateien';
import { tauriDateien } from './dateien';
import type { AvaEinstellungen } from './einstellungen';
import { einstellungenLaden, einstellungenSpeichern, VORGABE } from './einstellungen';
import { aslvLesen, aslvNeu, aslvSchreiben } from './format/aslv';
import { eigenLesen, eigenSchreiben } from './format/eigen';
import type { Lv } from './lv/modell';
import { leeresLv, xmlIdsUebernehmen } from './lv/modell';
import type { Gewerk, LvDatei, LvFormat, Projektstruktur } from './projekt';
import { projektLesen } from './projekt';
import { gewerkZweistellig } from './abrechnung/gewerk';
import { globaleAva, lvDateiname } from './platzhalter';

const log = logger('ava');

export type GewerkTab = 'lv' | 'angebote' | 'auftrag' | 'rechnungen' | 'dateien';

export type Ansicht =
  | { art: 'uebersicht' }
  | { art: 'gewerk'; gewerk: string; tab: GewerkTab }
  | { art: 'rechnungen' }
  | { art: 'eingang' }
  | { art: 'bautagebuch' }
  | { art: 'protokolle' }
  | { art: 'maengel' }
  | { art: 'notizen' }
  | { art: 'beteiligte' }
  | { art: 'mails' };

export interface OffenesProjekt {
  ordner: string;
  /** Projektdatei relativ zum Projektordner */
  oap: string;
  name: string;
  meta: ProjectMeta;
  struktur: Projektstruktur | null;
  ava: AvaProjekt;
  kk: KkStand | null;
  kkFehler: string | null;
}

export interface OffenesLv {
  gewerk: string;
  datei: LvDatei;
  format: LvFormat;
  /** Inhalt der Datei beim Lesen (Grundlage des verlustfreien Schreibens) */
  bytes: Uint8Array;
  stand: DateiStand;
  lv: Lv;
  /** zuletzt gespeicherter Stand */
  basis: Lv;
  verlauf: Lv[];
  zukunft: Lv[];
  roh?: Record<string, unknown>;
  programmVersion?: string;
}

interface AvaZustand {
  fs: AvaDateien;
  einstellungen: AvaEinstellungen;
  projekt: OffenesProjekt | null;
  lv: OffenesLv | null;
  ansicht: Ansicht;
  /** gewähltes Element im LV */
  auswahl: string | null;
  busy: string | null;
  einstellungenOffen: boolean;

  einstellungenLaden(): Promise<void>;
  einstellungenSetzen(e: AvaEinstellungen): Promise<void>;
  setAnsicht(a: Ansicht): void;
  setAuswahl(id: string | null): void;
  setBusy(b: string | null): void;
  setEinstellungenOffen(o: boolean): void;
  projektOeffnen(o: { ordner: string; oap: string; name: string; meta: ProjectMeta }): Promise<void>;
  projektSchliessen(): void;
  neuLaden(): Promise<void>;
  kostenkontrolleWaehlen(pfad: string | null): Promise<void>;
  /** Zellen der Kostenkontrolle ändern (frisch gelesen, nur mit dem Stand vom Lesen) */
  kkSchreiben(f: (kk: KkStand) => ZellAenderungen): Promise<void>;
  avaAendern(f: (a: AvaProjekt) => AvaProjekt): Promise<void>;
  setMeta(meta: ProjectMeta, name: string): void;
  lvOeffnen(gewerk: string, datei: LvDatei): Promise<void>;
  lvSchliessen(): void;
  lvAendern(f: (lv: Lv) => Lv): void;
  lvRueckgaengig(): void;
  lvWiederholen(): void;
  lvSpeichern(): Promise<boolean>;
  lvNeu(g: Gewerk | null, gewerk: string, format: LvFormat, bezeichnung: string, vorlage?: Lv): Promise<void>;
  kontext(): Kontext | null;
}

/** ungespeicherte Änderungen am LV? */
export const lvGeaendert = (lv: OffenesLv | null) => !!lv && lv.lv !== lv.basis;

export const useAva = create<AvaZustand>((set, get) => ({
  fs: tauriDateien,
  einstellungen: VORGABE,
  projekt: null,
  lv: null,
  ansicht: { art: 'uebersicht' },
  auswahl: null,
  busy: null,
  einstellungenOffen: false,

  async einstellungenLaden() {
    try {
      set({ einstellungen: await einstellungenLaden() });
    } catch (e) {
      log.warn('Einstellungen nicht lesbar – Vorgaben', e);
    }
  },
  async einstellungenSetzen(e) {
    set({ einstellungen: e });
    await einstellungenSpeichern(e);
    await get().neuLaden();
  },
  setAnsicht: (ansicht) => set({ ansicht }),
  setAuswahl: (auswahl) => set({ auswahl }),
  setBusy: (busy) => set({ busy }),
  setEinstellungenOffen: (einstellungenOffen) => set({ einstellungenOffen }),

  async projektOeffnen(o) {
    const { fs } = get();
    set({ busy: 'Projekt wird gelesen …', lv: null, auswahl: null });
    try {
      let ava = leeresAvaProjekt();
      const oap = await fs.lies(o.ordner, o.oap);
      if (oap) ava = avaAus(projektdateiRoh(oap.daten).ava);
      set({ projekt: { ...o, struktur: null, ava, kk: null, kkFehler: null }, ansicht: { art: 'uebersicht' } });
      await get().neuLaden();
    } finally {
      set({ busy: null });
    }
  },
  projektSchliessen: () => set({ projekt: null, lv: null, auswahl: null, ansicht: { art: 'uebersicht' } }),

  async neuLaden() {
    const { fs, projekt, einstellungen } = get();
    if (!projekt) return;
    const oap = await fs.lies(projekt.ordner, projekt.oap).catch(() => null);
    const ava = oap ? avaAus(projektdateiRoh(oap.daten).ava) : projekt.ava;
    const struktur = await projektLesen(fs, projekt.ordner, einstellungen, { kostenkontrolle: ava.kostenkontrolle ?? null });
    let kk: KkStand | null = null;
    let kkFehler: string | null = null;
    if (struktur.kostenkontrolle) {
      try {
        kk = await kkLaden(fs, projekt.ordner, struktur.kostenkontrolle.pfad);
      } catch (e) {
        kkFehler = `${struktur.kostenkontrolle.name}: ${e instanceof Error ? e.message : String(e)}`;
        log.warn('Kostenkontrolle nicht lesbar', e);
      }
    }
    const aktuell = get().projekt;
    if (aktuell?.ordner !== projekt.ordner) return;
    set({ projekt: { ...aktuell, struktur, ava, kk, kkFehler } });
  },

  async kostenkontrolleWaehlen(pfad) {
    await get().avaAendern((a) => {
      const neu = { ...a };
      if (pfad) neu.kostenkontrolle = pfad;
      else delete neu.kostenkontrolle;
      return neu;
    });
    await get().neuLaden();
  },

  async kkSchreiben(f) {
    const { fs, projekt } = get();
    if (!projekt?.kk) throw new Error('Keine Kostenkontrolle im Projekt.');
    const frisch = await kkLaden(fs, projekt.ordner, projekt.kk.pfad);
    if (await fs.inOffice(projekt.ordner, frisch.pfad)) throw new Error('Die Kostenkontrolle ist gerade in Excel geöffnet – bitte dort schließen, dann erneut versuchen.');
    const neu = xlsxAendern(frisch.bytes, f(frisch), { ergebnisseAuffrischen: true, heute: new Date() });
    await fs.ersetzen(projekt.ordner, frisch.pfad, neu, frisch.stand);
    const kk = await kkLaden(fs, projekt.ordner, frisch.pfad);
    // inzwischen ein anderes Projekt geöffnet: nicht in dessen Zustand schreiben
    const p = get().projekt;
    if (p?.ordner === projekt.ordner) set({ projekt: { ...p, kk, kkFehler: null } });
  },

  async avaAendern(f) {
    const { fs, projekt } = get();
    if (!projekt) return;
    const ava = await avaAendern(fs.projektordner, projekt.ordner, projekt.oap, f);
    const p = get().projekt;
    if (p?.ordner === projekt.ordner) set({ projekt: { ...p, ava } });
  },

  setMeta(meta, name) {
    const p = get().projekt;
    if (p) set({ projekt: { ...p, meta, name } });
  },

  async lvOeffnen(gewerk, datei) {
    const { fs, projekt } = get();
    if (!projekt) return;
    set({ busy: `${datei.name} wird gelesen …` });
    try {
      const r = await fs.lies(projekt.ordner, datei.pfad);
      if (!r) throw new Error(`${datei.pfad}: nicht gefunden`);
      if (datei.format === 'aslv') {
        const g = aslvLesen(r.daten);
        set({ lv: { gewerk, datei, format: 'aslv', bytes: r.daten, stand: r.stand, lv: g.lv, basis: g.lv, verlauf: [], zukunft: [], programmVersion: g.programmVersion }, auswahl: null });
      } else {
        const g = eigenLesen(r.daten);
        set({ lv: { gewerk, datei, format: 'oalv', bytes: r.daten, stand: r.stand, lv: g.lv, basis: g.lv, verlauf: [], zukunft: [], roh: g.roh }, auswahl: null });
      }
    } finally {
      set({ busy: null });
    }
  },
  lvSchliessen: () => set({ lv: null, auswahl: null }),
  lvAendern(f) {
    const o = get().lv;
    if (!o) return;
    const neu = f(o.lv);
    if (neu === o.lv) return;
    set({ lv: { ...o, lv: neu, verlauf: [...o.verlauf.slice(-199), o.lv], zukunft: [] } });
  },
  lvRueckgaengig() {
    const o = get().lv;
    if (!o?.verlauf.length) return;
    set({ lv: { ...o, lv: o.verlauf[o.verlauf.length - 1], verlauf: o.verlauf.slice(0, -1), zukunft: [o.lv, ...o.zukunft] } });
  },
  lvWiederholen() {
    const o = get().lv;
    if (!o?.zukunft.length) return;
    set({ lv: { ...o, lv: o.zukunft[0], verlauf: [...o.verlauf, o.lv], zukunft: o.zukunft.slice(1) } });
  },
  async lvSpeichern() {
    const { fs, projekt, lv } = get();
    if (!projekt || !lv) return false;
    const daten = lv.format === 'aslv' ? aslvSchreiben(lv.bytes, lv.lv) : eigenSchreiben(lv.lv, lv.roh);
    if (daten !== lv.bytes) await fs.ersetzen(projekt.ordner, lv.datei.pfad, daten, lv.stand);
    const r = await fs.lies(projekt.ordner, lv.datei.pfad);
    const aktuell = get().lv;
    if (r && aktuell && aktuell.datei.pfad === lv.datei.pfad) {
      // neue Elemente kennen jetzt ihre Kennung in der Datei; weitergearbeitet, während gespeichert wurde? Dann bleibt
      // der neue Stand ungespeichert (mit den Kennungen).
      if (lv.format === 'aslv') {
        const gelesen = aslvLesen(r.daten).lv;
        const basis = xmlIdsUebernehmen(lv.lv, lv.lv, gelesen);
        const jetzt = aktuell.lv === lv.lv ? basis : xmlIdsUebernehmen(aktuell.lv, lv.lv, gelesen);
        set({ lv: { ...aktuell, bytes: r.daten, stand: r.stand, basis, lv: jetzt, verlauf: aktuell.verlauf.map((v) => xmlIdsUebernehmen(v, lv.lv, gelesen)), zukunft: aktuell.zukunft.map((v) => xmlIdsUebernehmen(v, lv.lv, gelesen)) } });
      } else set({ lv: { ...aktuell, bytes: r.daten, stand: r.stand, basis: lv.lv } });
    }
    log.info('LV gespeichert', lv.datei.pfad);
    return true;
  },
  async lvNeu(g, gewerk, format, bezeichnung, vorlage) {
    const { fs, projekt, einstellungen } = get();
    if (!projekt) return;
    const lv = vorlage ? { ...vorlage, kopf: { ...vorlage.kopf, bezeichnung } } : leeresLv(bezeichnung);
    lv.kopf.projektName ??= projekt.meta.vorhaben || projekt.name;
    lv.kopf.projekt ??= [projekt.meta.vorhaben, projekt.meta.adresse.strasse, `${projekt.meta.adresse.plz} ${projekt.meta.adresse.ort}`.trim()].filter(Boolean).join('\n');
    lv.kopf.nummer ??= gewerk.slice(1);
    const ordner = g ? g.pfad : `${einstellungen.ablage.gewerke}/${gewerkZweistellig(gewerk)}`;
    const unter = einstellungen.ablage.lv ? `${ordner}/${einstellungen.ablage.lv}` : ordner;
    const name = lvDateiname(einstellungen.lv.dateiname, { ...globaleAva(projekt.meta, projekt.name, einstellungen.deckblatt.bearbeiter), Gewerk: gewerkZweistellig(gewerk) }) || bezeichnung;
    const pfad = `${unter}/${name} ${bezeichnung.replace(/^G\d+\s*/i, '')}`.replace(/\s+$/, '').replace(/[\\:*?"<>|]/g, ' ') + `.${format}`;
    const daten = format === 'aslv' ? aslvNeu(lv) : eigenSchreiben(lv);
    if (!(await fs.anlegen(projekt.ordner, pfad, daten))) throw new Error(`${pfad}: Die Datei gibt es schon.`);
    await get().neuLaden();
    const r = await fs.lies(projekt.ordner, pfad);
    const datei: LvDatei = { pfad, name: pfad.split('/').pop()!, groesse: daten.length, geaendert: r?.stand.geaendert ?? 0, archiv: false, format };
    await get().lvOeffnen(gewerk, datei);
  },
  kontext() {
    const { fs, projekt, einstellungen } = get();
    if (!projekt) return null;
    return { fs, ordner: projekt.ordner, oap: projekt.oap, meta: projekt.meta, projektName: projekt.name, e: einstellungen };
  },
}));

/** Gewerkordner zu einer Kennung */
export const gewerkOrdner = (p: OffenesProjekt | null, kennung: string) => p?.struktur?.gewerke.find((g) => g.kennung === kennung) ?? null;
