import { create } from 'zustand';
import { pickFile, saveBinaryFile } from '@core/platform/files';
import { logger } from '@core/platform/log';
import type { AblageOrdner } from './ablage';
import { VORGABE_AUSWAHL, ablageSuchen, auswahlBereinigt, zuordnen } from './ablage';
import type { Dateisystem } from './dateisystem';
import { hatDateisystem, tauriDateisystem } from './dateisystem';
import type { Feld } from './forma/felder';
import { felderDerSeite } from './forma/felder';
import type { Formular } from './forma/formular';
import { formularBytes, istAngekreuzt, memoText, parseFormular, setzeAngekreuzt, setzeMemoText } from './forma/formular';
import type { Projektkarte } from './forma/projektkarte';
import { pkSchluessel } from './forma/projektkarte';
import type { Sperre } from './forma/sperre';
import { sperreLesen, sperreSchreiben, sperrPfad, zeitstempel } from './forma/sperre';
import { finde } from './forma/dfm';
import type { FormularEintrag, Projekt } from './projekte';
import { formulareDesProjekts, projekteSuchen } from './projekte';
import type { FeldAenderung, Verlauf } from './verlauf';
import { eintragen, eintragenMehrere, kannRueckgaengig, kannWiederholen, leererVerlauf, springe, verlaufAus } from './verlauf';

/**
 * Zustand der App: Einstellungen, die gefundenen Projekte, das geöffnete Formular und die Projektkarte.
 *
 * Eingaben werden nicht sofort in die Datei geschrieben, sondern als Änderungen je Feld gesammelt und nach
 * jeder Eingabe lokal gesichert (Entwurf und Verlauf, beides übersteht Neustarts). Erst beim Speichern wird die
 * Datei frisch eingelesen, mit den Änderungen versehen und ersetzt – vorher wird geprüft, dass sie seit dem
 * Öffnen niemand geändert hat.
 */

const log = logger('formulare');

export type Ansicht = 'felder' | 'seite';
export type Hauptansicht = 'formular' | 'projektkarte';
type Wert = string | boolean;

const EINSTELLUNGEN = 'formulare:einstellungen';
const ENTWUERFE = 'formulare:entwuerfe';
const VERLAEUFE = 'formulare:verlauf';
const PK_ENTWUERFE = 'formulare:projektkarten';
/** so viele Formulare behalten ihren Verlauf */
const MAX_VERLAEUFE = 60;

/** Zoom der Formularansicht; 0 = an die Breite anpassen */
export const ZOOMSTUFEN = [0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

interface Gespeichert {
  /** Ordner mit den FORMA-Projekten */
  projektordner: string[];
  /** Ordner mit den echten Projektordnern (Server) */
  ablageordner: string[];
  ansicht: Ansicht;
  zoom: number;
  leisteBreite: number;
  verlaufOffen: boolean;
  /** angezeigte Pfade im echten Projektordner: Vorgabe und je Projektkürzel */
  vorgabeAuswahl: string[];
  auswahl: Record<string, string[]>;
}

export type SperrZustand =
  /** eigene Sperrdatei angelegt (Inhalt zum späteren Löschen) */
  | { art: 'eigen'; daten: Uint8Array }
  /** anderswo geöffnet – nur ansehen */
  | { art: 'fremd'; sperre: Sperre }
  /** Browser: einzelne Datei, keine Sperre möglich */
  | { art: 'ohne' };

export interface OffenesFormular {
  /** null im Browser (einzelne Datei) */
  projekt: Projekt | null;
  /** relativ zum Projektordner; im Browser der Dateiname */
  pfad: string;
  name: string;
  /** Inhalt der Datei beim Öffnen bzw. nach dem letzten Speichern */
  bytes: Uint8Array;
  formular: Formular;
  /** je Seite */
  felder: Feld[][];
  /** geänderte Felder (Schlüssel `<Seite>:<Name>`) */
  aenderungen: Record<string, Wert>;
  verlauf: Verlauf;
  /** Zeitpunkt der letzten lokalen Sicherung (ms) */
  gesichert: number | null;
  sperre: SperrZustand;
  /** Grund, warum nicht gespeichert werden kann (sonst null) */
  nurLesen: string | null;
}

/** Projektkarte des gewählten Projekts mit den noch nicht gespeicherten Änderungen */
export interface OffeneKarte {
  projekt: Projekt;
  karte: Projektkarte;
  /** Schlüssel `<Gruppe>:<Eintrag>` → neuer Text */
  aenderungen: Record<string, string>;
}

export interface Meldung {
  art: 'info' | 'fehler';
  text: string;
}

interface FormulareState extends Gespeichert {
  ds: Dateisystem | null;
  projekte: Projekt[];
  suchfehler: string[];
  sucht: boolean;
  projekt: Projekt | null;
  formulare: FormularEintrag[];
  offen: OffenesFormular | null;
  haupt: Hauptansicht;
  karte: OffeneKarte | null;
  /** echte Projektordner (erste und zweite Ebene) */
  ablage: AblageOrdner[];
  ablageFehler: string[];
  /** Datei wurde seit dem Öffnen außerhalb geändert – Speichern verweigert, bis neu geladen wurde */
  konflikt: boolean;
  meldung: Meldung | null;

  setAnsicht: (a: Ansicht) => void;
  setHaupt: (h: Hauptansicht) => void;
  setZoom: (z: number) => void;
  setLeisteBreite: (b: number) => void;
  setVerlaufOffen: (o: boolean) => void;
  setMeldung: (m: Meldung | null) => void;
  ordnerHinzufuegen: (pfad: string) => Promise<void>;
  ordnerEntfernen: (pfad: string) => Promise<void>;
  ablageHinzufuegen: (pfad: string) => Promise<void>;
  ablageEntfernen: (pfad: string) => Promise<void>;
  setVorgabeAuswahl: (liste: string[]) => void;
  /** Pfadliste für ein Projekt; `null` = wieder die Vorgabe */
  setAuswahl: (kuerzel: string, liste: string[] | null) => void;
  projekteLaden: () => Promise<void>;
  ablageLaden: () => Promise<void>;
  projektWaehlen: (p: Projekt | null) => Promise<void>;
  formularOeffnen: (e: FormularEintrag) => Promise<void>;
  /** Browser: einzelne .frmsjf-Datei über den Dateidialog */
  dateiOeffnen: () => Promise<void>;
  schliessen: () => Promise<void>;
  wertSetzen: (feld: Feld, wert: Wert) => void;
  /** mehrere Felder in einem Schritt (Ausfüllen aus der Projektkarte) */
  werteSetzen: (werte: { feld: Feld; wert: Wert }[], titel: string) => void;
  /** liefert den Schlüssel des betroffenen Felds (zum Hinspringen) */
  rueckgaengig: () => string | null;
  wiederholen: () => string | null;
  zuVerlaufsstand: (position: number) => void;
  speichern: () => Promise<void>;
  /** Datei neu einlesen; eigene Änderungen bleiben erhalten */
  neuLaden: () => Promise<void>;
  karteLaden: () => Promise<void>;
  karteSetzen: (gruppe: number, id: number, text: string) => void;
  karteVerwerfen: () => void;
  karteSpeichern: () => Promise<void>;
}

/* ---------- lokaler Speicher ---------- */

function lesen<T>(schluessel: string, vorgabe: T): T {
  try {
    const roh = localStorage.getItem(schluessel);
    return roh ? (JSON.parse(roh) as T) : vorgabe;
  } catch {
    return vorgabe;
  }
}

function schreiben(schluessel: string, wert: unknown): boolean {
  try {
    localStorage.setItem(schluessel, JSON.stringify(wert));
    return true;
  } catch {
    // ohne Speicher gibt es keinen Entwurf
    return false;
  }
}

const strings = (x: unknown) => (Array.isArray(x) ? x.filter((p): p is string => typeof p === 'string') : []);

function ladeEinstellungen(): Gespeichert {
  const o = lesen<Partial<Gespeichert>>(EINSTELLUNGEN, {});
  const auswahl: Record<string, string[]> = {};
  if (o.auswahl && typeof o.auswahl === 'object') for (const [k, v] of Object.entries(o.auswahl)) auswahl[k] = strings(v);
  return {
    projektordner: strings(o.projektordner),
    ablageordner: strings(o.ablageordner),
    ansicht: o.ansicht === 'felder' ? 'felder' : 'seite',
    zoom: typeof o.zoom === 'number' && (o.zoom === 0 || ZOOMSTUFEN.includes(o.zoom)) ? o.zoom : 0,
    leisteBreite: typeof o.leisteBreite === 'number' ? Math.min(600, Math.max(220, o.leisteBreite)) : 300,
    verlaufOffen: o.verlaufOffen === true,
    vorgabeAuswahl: Array.isArray(o.vorgabeAuswahl) ? strings(o.vorgabeAuswahl) : VORGABE_AUSWAHL,
    auswahl,
  };
}

/* ---------- Entwürfe und Verlauf ---------- */

const dokSchluessel = (o: Pick<OffenesFormular, 'projekt' | 'pfad'>) => (o.projekt ? `${o.projekt.root}|${o.pfad}` : `datei|${o.pfad}`);
const karteSchluessel = (p: Projekt) => `${p.root}|${p.ordner}`;

const entwuerfe = () => lesen<Record<string, Record<string, Wert>>>(ENTWUERFE, {});

export const hatEntwurf = (projekt: Projekt, pfad: string) => !!entwuerfe()[dokSchluessel({ projekt, pfad })];

/** Verlauf je Formular unter eigenem Schlüssel; ein Verzeichnis hält fest, wann er zuletzt geändert wurde */
const verlaufSchluessel = (k: string) => `${VERLAEUFE}:${k}`;

function verlaufLaden(schluessel: string): Verlauf {
  return verlaufAus(lesen<unknown>(verlaufSchluessel(schluessel), null));
}

/** Sichert Entwurf und Verlauf; liefert den Zeitpunkt oder null, wenn der Speicher nicht verfügbar ist */
function sichern(o: OffenesFormular): number | null {
  const k = dokSchluessel(o);
  const alle = entwuerfe();
  if (Object.keys(o.aenderungen).length) alle[k] = o.aenderungen;
  else delete alle[k];
  const jetzt = Date.now();
  const verzeichnis = lesen<Record<string, number>>(VERLAEUFE, {});
  let ok = schreiben(ENTWUERFE, alle);
  if (o.verlauf.schritte.length) {
    ok = schreiben(verlaufSchluessel(k), o.verlauf) && ok;
    verzeichnis[k] = jetzt;
  } else {
    delete verzeichnis[k];
    try {
      localStorage.removeItem(verlaufSchluessel(k));
    } catch {
      // ohne Speicher nichts zu löschen
    }
  }
  // nur die zuletzt bearbeiteten Formulare behalten ihren Verlauf
  const reihe = Object.entries(verzeichnis).sort((a, b) => b[1] - a[1]);
  for (const [alt] of reihe.slice(MAX_VERLAEUFE)) {
    try {
      localStorage.removeItem(verlaufSchluessel(alt));
    } catch {
      // ohne Speicher nichts zu löschen
    }
  }
  return schreiben(VERLAEUFE, Object.fromEntries(reihe.slice(0, MAX_VERLAEUFE))) && ok ? jetzt : null;
}

/* ---------- Formular ---------- */

export const istGeaendert = (o: OffenesFormular | null) => !!o && Object.keys(o.aenderungen).length > 0;

export const wertVon = (o: OffenesFormular, f: Feld): Wert => (f.schluessel in o.aenderungen ? o.aenderungen[f.schluessel] : f.original);

export const kannZurueck = (o: OffenesFormular | null) => !!o && kannRueckgaengig(o.verlauf);
export const kannVor = (o: OffenesFormular | null) => !!o && kannWiederholen(o.verlauf);

const gleich = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

function aufbereiten(bytes: Uint8Array) {
  const formular = parseFormular(bytes);
  const felder = formular.seiten.map((s, i) => felderDerSeite(s, i));
  // Sicherheitsnetz: Was sich nicht unverändert zurückschreiben lässt, wird auch nicht gespeichert
  const nurLesen = gleich(formularBytes(formular), bytes) ? null : 'Die Datei lässt sich nicht verlustfrei zurückschreiben – Speichern ist gesperrt.';
  return { formular, felder, nurLesen };
}

/** Behält nur Änderungen an Feldern, die es gibt und die vom Wert in der Datei abweichen */
function bereinige(aenderungen: Record<string, Wert>, felder: Feld[][]): Record<string, Wert> {
  const out: Record<string, Wert> = {};
  for (const f of felder.flat()) {
    if (!(f.schluessel in aenderungen)) continue;
    const w = aenderungen[f.schluessel];
    if (typeof w === typeof f.original && w !== f.original) out[f.schluessel] = w;
  }
  return out;
}

/** Werte eintragen: gleich dem Wert in der Datei → keine Änderung mehr */
function mitWerten(o: OffenesFormular, werte: Map<string, Wert>): Record<string, Wert> {
  const aenderungen = { ...o.aenderungen };
  const felder = new Map(o.felder.flat().map((f) => [f.schluessel, f]));
  for (const [k, w] of werte) {
    const f = felder.get(k);
    if (!f || typeof w !== typeof f.original) continue;
    if (w === f.original) delete aenderungen[k];
    else aenderungen[k] = w;
  }
  return aenderungen;
}

/** Neue Dateifassung: frisch eingelesen, Änderungen eingetragen und gegengeprüft */
export function mitAenderungen(bytes: Uint8Array, aenderungen: Record<string, Wert>): Uint8Array {
  const f = parseFormular(bytes);
  const eintraege = Object.entries(aenderungen).map(([k, w]) => {
    const i = k.indexOf(':');
    return { seite: Number(k.slice(0, i)), name: k.slice(i + 1), w };
  });
  for (const { seite, name, w } of eintraege) {
    if (typeof w === 'boolean') setzeAngekreuzt(f, seite, name, w);
    else setzeMemoText(f, seite, name, w);
  }
  const neu = formularBytes(f);
  const probe = parseFormular(neu);
  for (const { seite, name, w } of eintraege) {
    const o = finde(probe.seiten[seite].form, name)!;
    const gelesen = typeof w === 'boolean' ? istAngekreuzt(o) : memoText(o);
    const erwartet = typeof w === 'boolean' ? w : memoText(finde(f.seiten[seite].form, name)!);
    if (gelesen !== erwartet) throw new Error(`Gegenprobe fehlgeschlagen bei ${name} (Seite ${seite + 1})`);
  }
  return neu;
}

async function sperren(ds: Dateisystem, root: string, pfad: string): Promise<SperrZustand> {
  const sp = sperrPfad(pfad);
  const vorhanden = await ds.lies(root, sp);
  if (vorhanden) return { art: 'fremd', sperre: sperreLesen(vorhanden) };
  const r = await ds.rechner();
  const daten = sperreSchreiben({ benutzer: r.benutzer, computer: r.computer, angemeldet: zeitstempel(new Date()), inGebrauch: String(r.prozess) });
  if (await ds.sperreSetzen(root, sp, daten)) return { art: 'eigen', daten };
  const jetzt = await ds.lies(root, sp);
  return { art: 'fremd', sperre: jetzt ? sperreLesen(jetzt) : { benutzer: '', computer: '', angemeldet: '', inGebrauch: '' } };
}

/* ---------- Projektkarte ---------- */

/** Zeilenumbrüche wie im Textfeld (FORMA speichert CR LF) */
const normal = (s: string) => s.replace(/\r\n?/g, '\n');

export const karteWert = (k: OffeneKarte, gruppe: number, id: number): string => {
  const s = pkSchluessel(gruppe, id);
  return s in k.aenderungen ? k.aenderungen[s] : normal(k.karte.eintraege.find((e) => e.gruppe === gruppe && e.id === id)?.text ?? '');
};

/** Projektkarte mit den eingetragenen Änderungen – Grundlage fürs Ausfüllen */
export function karteMitAenderungen(k: OffeneKarte): Projektkarte {
  return { gruppen: k.karte.gruppen, eintraege: k.karte.eintraege.map((e) => ({ ...e, text: karteWert(k, e.gruppe, e.id) })) };
}

const fehlertext = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const useFormulare = create<FormulareState>()((set, get) => {
  const fehler = (text: string, e?: unknown) => {
    const t = e === undefined ? text : `${text}: ${fehlertext(e)}`;
    log.error(t);
    set({ meldung: { art: 'fehler', text: t } });
  };

  const oeffnen = async (projekt: Projekt | null, pfad: string, name: string, bytes: Uint8Array, sperre: SperrZustand) => {
    const { formular, felder, nurLesen } = aufbereiten(bytes);
    const offen: OffenesFormular = { projekt, pfad, name, bytes, formular, felder, aenderungen: {}, verlauf: leererVerlauf(), gesichert: null, sperre, nurLesen };
    const k = dokSchluessel(offen);
    const entwurf = entwuerfe()[k];
    if (entwurf) offen.aenderungen = bereinige(entwurf, felder);
    offen.verlauf = verlaufLaden(k);
    const wiederhergestellt = Object.keys(offen.aenderungen).length;
    set({
      offen,
      haupt: 'formular',
      konflikt: false,
      meldung: wiederhergestellt ? { art: 'info', text: `${wiederhergestellt} nicht gespeicherte Eingabe(n) vom letzten Mal wiederhergestellt.` } : null,
    });
  };

  /** Neuer Stand des offenen Formulars: übernehmen und lokal sichern */
  const aktualisieren = (o: OffenesFormular) => {
    const neu = { ...o };
    neu.gesichert = sichern(neu);
    set({ offen: neu });
    return neu;
  };

  return {
    ...ladeEinstellungen(),
    ds: hatDateisystem() ? tauriDateisystem : null,
    projekte: [],
    suchfehler: [],
    sucht: false,
    projekt: null,
    formulare: [],
    offen: null,
    haupt: 'formular',
    karte: null,
    ablage: [],
    ablageFehler: [],
    konflikt: false,
    meldung: null,

    setAnsicht: (ansicht) => set({ ansicht }),
    setHaupt: (haupt) => {
      set({ haupt });
      if (haupt === 'projektkarte' && !get().karte) void get().karteLaden();
    },
    setZoom: (zoom) => set({ zoom }),
    setLeisteBreite: (b) => set({ leisteBreite: Math.min(600, Math.max(220, Math.round(b))) }),
    setVerlaufOffen: (verlaufOffen) => set({ verlaufOffen }),
    setMeldung: (meldung) => set({ meldung }),

    ordnerHinzufuegen: async (pfad) => {
      if (get().projektordner.includes(pfad)) return;
      set({ projektordner: [...get().projektordner, pfad] });
      await get().projekteLaden();
    },

    ordnerEntfernen: async (pfad) => {
      set({ projektordner: get().projektordner.filter((p) => p !== pfad) });
      if (get().projekt?.root === pfad) await get().projektWaehlen(null);
      await get().projekteLaden();
    },

    ablageHinzufuegen: async (pfad) => {
      if (get().ablageordner.includes(pfad)) return;
      set({ ablageordner: [...get().ablageordner, pfad] });
      await get().ablageLaden();
    },

    ablageEntfernen: async (pfad) => {
      set({ ablageordner: get().ablageordner.filter((p) => p !== pfad) });
      await get().ablageLaden();
    },

    setVorgabeAuswahl: (liste) => set({ vorgabeAuswahl: auswahlBereinigt(liste) }),

    setAuswahl: (kuerzel, liste) => {
      const auswahl = { ...get().auswahl };
      if (liste) auswahl[kuerzel] = auswahlBereinigt(liste);
      else delete auswahl[kuerzel];
      set({ auswahl });
    },

    projekteLaden: async () => {
      const ds = get().ds;
      if (!ds) return;
      set({ sucht: true });
      try {
        const { projekte, fehler: suchfehler } = await projekteSuchen(ds, get().projektordner);
        set({ projekte, suchfehler });
      } finally {
        set({ sucht: false });
      }
      await get().ablageLaden();
    },

    ablageLaden: async () => {
      const ds = get().ds;
      if (!ds) return;
      const { ordner, fehler: ablageFehler } = await ablageSuchen(ds, get().ablageordner);
      set({ ablage: ordner, ablageFehler });
    },

    projektWaehlen: async (projekt) => {
      await get().schliessen();
      set({ projekt, formulare: [], karte: null, haupt: 'formular' });
      const ds = get().ds;
      if (!projekt || !ds) return;
      try {
        set({ formulare: await formulareDesProjekts(ds, projekt) });
      } catch (e) {
        fehler(`Formulare von ${projekt.ordner} nicht lesbar`, e);
      }
    },

    formularOeffnen: async (eintrag) => {
      const { ds, projekt } = get();
      if (!ds || !projekt) return;
      await get().schliessen();
      try {
        const bytes = await ds.lies(projekt.root, eintrag.pfad);
        if (!bytes) throw new Error('Datei nicht gefunden');
        // erst prüfen, ob die Datei lesbar ist – dann sperren
        aufbereiten(bytes);
        const sperre = await sperren(ds, projekt.root, eintrag.pfad);
        // Zwischen Lesen und Sperren könnte FORMA gespeichert haben: mit Sperre noch einmal lesen
        const frisch = sperre.art === 'eigen' ? ((await ds.lies(projekt.root, eintrag.pfad)) ?? bytes) : bytes;
        await oeffnen(projekt, eintrag.pfad, eintrag.name, frisch, sperre);
        log.info(`Geöffnet: ${eintrag.pfad}${sperre.art === 'fremd' ? ' (nur ansehen, anderswo geöffnet)' : ''}`);
        set({ formulare: await formulareDesProjekts(ds, projekt) });
      } catch (e) {
        fehler(`${eintrag.name} lässt sich nicht öffnen`, e);
      }
    },

    dateiOeffnen: async () => {
      const datei = await pickFile('.frmsjf');
      if (!datei) return;
      await get().schliessen();
      try {
        await oeffnen(null, datei.name, datei.name.replace(/\.frmsjf$/i, ''), new Uint8Array(await datei.arrayBuffer()), { art: 'ohne' });
      } catch (e) {
        fehler(`${datei.name} lässt sich nicht öffnen`, e);
      }
    },

    schliessen: async () => {
      const { offen, ds } = get();
      if (!offen) return;
      set({ offen: null, konflikt: false });
      if (offen.sperre.art === 'eigen' && offen.projekt && ds) {
        try {
          await ds.sperreLoesen(offen.projekt.root, sperrPfad(offen.pfad), offen.sperre.daten);
        } catch (e) {
          fehler(`Sperrdatei von ${offen.name} nicht entfernt`, e);
        }
      }
    },

    wertSetzen: (feld, wert) => {
      const o = get().offen;
      if (!o) return;
      const vorher = wertVon(o, feld);
      if (vorher === wert) return;
      const verlauf = eintragen(o.verlauf, feld.schluessel, vorher, wert, Date.now());
      aktualisieren({ ...o, verlauf, aenderungen: mitWerten(o, new Map([[feld.schluessel, wert]])) });
    },

    werteSetzen: (werte, titel) => {
      const o = get().offen;
      if (!o) return;
      const aenderungen: FeldAenderung[] = werte.map(({ feld, wert }) => ({ feld: feld.schluessel, vorher: wertVon(o, feld), nachher: wert }));
      const verlauf = eintragenMehrere(o.verlauf, aenderungen, titel, Date.now());
      if (verlauf === o.verlauf) return;
      aktualisieren({ ...o, verlauf, aenderungen: mitWerten(o, new Map(werte.map(({ feld, wert }) => [feld.schluessel, wert]))) });
    },

    rueckgaengig: () => {
      const o = get().offen;
      if (!o || !kannRueckgaengig(o.verlauf)) return null;
      const schritt = o.verlauf.schritte[o.verlauf.position - 1];
      get().zuVerlaufsstand(o.verlauf.position - 1);
      return schritt.aenderungen[0]?.feld ?? null;
    },

    wiederholen: () => {
      const o = get().offen;
      if (!o || !kannWiederholen(o.verlauf)) return null;
      const schritt = o.verlauf.schritte[o.verlauf.position];
      get().zuVerlaufsstand(o.verlauf.position + 1);
      return schritt.aenderungen[0]?.feld ?? null;
    },

    zuVerlaufsstand: (position) => {
      const o = get().offen;
      if (!o) return;
      const { verlauf, werte } = springe(o.verlauf, position);
      aktualisieren({ ...o, verlauf, aenderungen: mitWerten(o, werte) });
    },

    speichern: async () => {
      const { offen: o, ds, konflikt } = get();
      if (!o || !istGeaendert(o)) return;
      if (o.nurLesen) return fehler(o.nurLesen);
      if (o.sperre.art === 'fremd') return fehler(`${o.name} ist bei ${o.sperre.sperre.benutzer || 'jemand anderem'} geöffnet – Speichern nicht möglich`);
      if (konflikt) return fehler('Die Datei wurde inzwischen geändert – bitte erst neu laden');
      try {
        const neu = mitAenderungen(o.bytes, o.aenderungen);
        if (o.projekt && ds) {
          const aktuell = await ds.lies(o.projekt.root, o.pfad);
          if (!aktuell || !gleich(aktuell, o.bytes)) {
            set({ konflikt: true, meldung: { art: 'fehler', text: 'Die Datei wurde seit dem Öffnen außerhalb geändert (z. B. in FORMA). Bitte neu laden – deine Eingaben bleiben erhalten.' } });
            return;
          }
          await ds.ersetze(o.projekt.root, o.pfad, neu);
        } else {
          const ok = await saveBinaryFile({ defaultName: `${o.name}.frmsjf`, data: neu, filterName: 'FORMA-Formular', extension: 'frmsjf', mime: 'application/octet-stream' });
          if (!ok) return;
        }
        const { formular, felder, nurLesen } = aufbereiten(neu);
        aktualisieren({ ...o, bytes: neu, formular, felder, nurLesen, aenderungen: {} });
        set({ meldung: { art: 'info', text: `${o.name} gespeichert.` } });
        log.info(`Gespeichert: ${o.pfad} (${Object.keys(o.aenderungen).length} Feld(er))`);
      } catch (e) {
        fehler(`${o.name} nicht gespeichert`, e);
      }
    },

    neuLaden: async () => {
      const { offen: o, ds } = get();
      if (!o?.projekt || !ds) return;
      try {
        const bytes = await ds.lies(o.projekt.root, o.pfad);
        if (!bytes) throw new Error('Datei nicht gefunden');
        const { formular, felder, nurLesen } = aufbereiten(bytes);
        aktualisieren({ ...o, bytes, formular, felder, nurLesen, aenderungen: bereinige(o.aenderungen, felder) });
        set({ konflikt: false, meldung: { art: 'info', text: 'Neu geladen – deine Eingaben sind eingetragen, aber noch nicht gespeichert.' } });
      } catch (e) {
        fehler(`${o.name} nicht neu geladen`, e);
      }
    },

    karteLaden: async () => {
      const { ds, projekt } = get();
      if (!ds || !projekt) return;
      try {
        const karte = await ds.projektkarteLesen(projekt.root, `${projekt.ordner}/sj_prokarte.sdb`);
        if (!karte) {
          set({ karte: null, meldung: { art: 'info', text: `${projekt.ordner} hat keine Projektkarte.` } });
          return;
        }
        const entwurf = lesen<Record<string, Record<string, string>>>(PK_ENTWUERFE, {})[karteSchluessel(projekt)] ?? {};
        const offen: OffeneKarte = { projekt, karte, aenderungen: {} };
        // nur Entwürfe übernehmen, die noch von der Projektkarte abweichen
        for (const [s, t] of Object.entries(entwurf)) {
          const [g, i] = s.split(':').map(Number);
          if (karte.eintraege.some((e) => e.gruppe === g && e.id === i && normal(e.text) !== t)) offen.aenderungen[s] = t;
        }
        if (get().projekt === projekt) set({ karte: offen });
      } catch (e) {
        fehler(`Projektkarte von ${projekt.ordner} nicht lesbar`, e);
      }
    },

    karteSetzen: (gruppe, id, text) => {
      const k = get().karte;
      if (!k) return;
      const s = pkSchluessel(gruppe, id);
      const original = normal(k.karte.eintraege.find((e) => e.gruppe === gruppe && e.id === id)?.text ?? '');
      const aenderungen = { ...k.aenderungen };
      if (text === original) delete aenderungen[s];
      else aenderungen[s] = text;
      const alle = lesen<Record<string, Record<string, string>>>(PK_ENTWUERFE, {});
      if (Object.keys(aenderungen).length) alle[karteSchluessel(k.projekt)] = aenderungen;
      else delete alle[karteSchluessel(k.projekt)];
      schreiben(PK_ENTWUERFE, alle);
      set({ karte: { ...k, aenderungen } });
    },

    karteVerwerfen: () => {
      const k = get().karte;
      if (!k) return;
      const alle = lesen<Record<string, Record<string, string>>>(PK_ENTWUERFE, {});
      delete alle[karteSchluessel(k.projekt)];
      schreiben(PK_ENTWUERFE, alle);
      set({ karte: { ...k, aenderungen: {} } });
    },

    karteSpeichern: async () => {
      const { ds, karte: k } = get();
      if (!ds || !k || !Object.keys(k.aenderungen).length) return;
      const pfad = `${k.projekt.ordner}/sj_prokarte.sdb`;
      try {
        const aenderungen = Object.entries(k.aenderungen).map(([s, neu]) => {
          const [gruppe, id] = s.split(':').map(Number);
          const alt = k.karte.eintraege.find((e) => e.gruppe === gruppe && e.id === id)?.text ?? '';
          return { gruppe, id, alt, neu: neu.replace(/\n/g, '\r\n') };
        });
        await ds.projektkarteSchreiben(k.projekt.root, pfad, aenderungen);
        const alle = lesen<Record<string, Record<string, string>>>(PK_ENTWUERFE, {});
        delete alle[karteSchluessel(k.projekt)];
        schreiben(PK_ENTWUERFE, alle);
        const frisch = await ds.projektkarteLesen(k.projekt.root, pfad);
        set({ karte: frisch ? { ...k, karte: frisch, aenderungen: {} } : null, meldung: { art: 'info', text: `Projektkarte von ${k.projekt.ordner} gespeichert.` } });
        log.info(`Projektkarte gespeichert: ${pfad} (${aenderungen.length} Einträge)`);
      } catch (e) {
        fehler('Projektkarte nicht gespeichert', e);
      }
    },
  };
});

/** Echter Projektordner des gewählten FORMA-Projekts (über das Kürzel) */
export const ablageVon = (s: Pick<FormulareState, 'ablage'>, p: Projekt | null) => (p ? zuordnen(p.ordner, s.ablage) : null);

/** Angezeigte Pfade im echten Projektordner eines Projekts */
export const auswahlVon = (s: Pick<FormulareState, 'auswahl' | 'vorgabeAuswahl'>, p: Projekt | null) => (p && s.auswahl[p.ordner]) || s.vorgabeAuswahl;

useFormulare.subscribe((s) => {
  const g: Gespeichert = {
    projektordner: s.projektordner,
    ablageordner: s.ablageordner,
    ansicht: s.ansicht,
    zoom: s.zoom,
    leisteBreite: s.leisteBreite,
    verlaufOffen: s.verlaufOffen,
    vorgabeAuswahl: s.vorgabeAuswahl,
    auswahl: s.auswahl,
  };
  schreiben(EINSTELLUNGEN, g);
});
