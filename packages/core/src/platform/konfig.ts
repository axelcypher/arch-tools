import type { Namensschema } from '../namensschema';
import { namensschemaAus } from '../namensschema';
import { VORGABE_OAP_PFAD } from '../projektdatei';
import { base64ToBytes, bytesToBase64, isTauri } from './files';
import { verbinde } from './projektordner';
import { APP_NAMEN } from '../appNamen';

/**
 * Gemeinsame Einstellungen aller Apps in einem Konfigurationsordner, je Bereich eine JSON-Datei:
 *
 *   allgemein.json     Einstellungen aller Apps: Stammordner der Projekte, Ort neuer Projektdateien, Fotoordner
 *   <app>.json         Einstellungen einer App (z. B. projektordner.json: Struktur und Vorlagen-Presets)
 *
 * Zwei Arten der Installation, je Benutzer gewählt (Zeiger in %APPDATA%\arch-tools\konfig.json – derselbe Ort für
 * alle Apps, nie auf dem Netzlaufwerk):
 *
 *   Einzelplatz          Der Konfigurationsordner ist der lokale Ordner %APPDATA%\arch-tools selbst.
 *   Netzwerkinstallation Der Konfigurationsordner liegt auf einem Netzlaufwerk (NAS, Server); alle Rechner, die ihn
 *                        wählen, haben denselben Stand. Jede gelesene Datei wird lokal gespiegelt (netz-kopie). Ist das
 *                        Netzlaufwerk nicht erreichbar, lesen die Apps diese Kopie (Notbetrieb) und speichern keine
 *                        gemeinsamen Einstellungen – so überschreibt später niemand die Änderungen anderer.
 *
 * Was nur dem Benutzer gehört (z. B. „Zuletzt geöffnet“, angeheftete Projekte), liegt mit `{ lokal: true }` immer im
 * lokalen Ordner, nie im gemeinsamen (siehe `LOKALE_BEREICHE`). Fenster, Hell/Dunkel und Leistenbreiten speichern die
 * Apps ohnehin je Rechner im Browser-Speicher. Im Browser (ohne Dateizugriff) liegen alle Bereiche im lokalen Speicher.
 *
 * Mehrere Rechner: Ändern heißt frisch lesen, ändern und nur schreiben, wenn die Datei seitdem unverändert ist
 * (Vergleich und Ersetzen unter einer Sperrdatei, Rust `konfig_schreiben_wenn`); sonst von vorn.
 */

export interface AllgemeineEinstellungen {
  /** Stammordner, in denen die Projektordner liegen; der erste ist der Standard */
  projekte: string[];
  /** Ort einer neuen Projektdatei im Projektordner – Platzhalter {nummer}, {kurzname}, {jahr} */
  oapPfad: string;
  /** Ordner der Fotos im Projektordner (Entzerrung); wird rekursiv durchsucht */
  fotoordner: string;
  /** Name des Büros für den Kopf der Ausdrucke und Excel-Dateien (leer = ohne) */
  buero?: string;
  /** Kürzel der Mitarbeiter – Vorschläge für „Bearbeitung“ in den Stammdaten (leer = keine) */
  mitarbeiter?: string[];
  /**
   * Schema der Projektordner-Namen aus der Struktur der App „Projekt“, z. B. „{nummer} {kurzname}“ – damit alle
   * Apps Nummer und Kurzname gleich aus dem Ordnernamen ableiten (fehlt = bis zum ersten Leerzeichen die Nummer)
   */
  ordnerSchema?: string;
  /** Namensschema des Büros (Kürzel, Stellen im Dateinamen, Indizes) – Vorgabe für neue Projektdateien und Projekte ohne eigenes */
  namensschema?: Namensschema;
}

export const VORGABE_ALLGEMEIN: AllgemeineEinstellungen = { projekte: [], oapPfad: VORGABE_OAP_PFAD, fotoordner: '09 Fotos' };

const ZEIGER = 'konfig';
const KOPIE = 'netz-kopie';
/** Bereiche, die immer je Benutzer im lokalen Ordner liegen – sie ziehen beim Wechsel nicht mit */
export const LOKALE_BEREICHE: readonly string[] = [ZEIGER, 'zuletzt', 'angeheftet'];
const SPEICHER = (bereich: string) => `arch-tools:konfig:${bereich}`;
/** Nachricht an die anderen Fenster und Tabs: Der Ort hat sich geändert (Ereignis `storage`) */
const SIGNAL = 'arch-tools:konfig-ort';

export type KonfigModus = 'einzelplatz' | 'netzwerk';

export interface KonfigOrt {
  /** der Konfigurationsordner (bei einer Netzwerkinstallation der Ordner auf dem Netzlaufwerk) */
  ordner: string;
  /** der lokale Ordner mit dem Zeiger (%APPDATA%\arch-tools) */
  basis: string;
  modus: KonfigModus;
  /** Netzwerkinstallation, aber das Netzlaufwerk ist nicht erreichbar: gelesen wird die lokale Kopie, gespeichert nichts */
  notbetrieb: boolean;
  /** zuletzt gewählter Ordner einer Netzwerkinstallation (Vorschlag beim Wechsel; leer = keiner) */
  netzordner: string;
  /** true bei einer Netzwerkinstallation (ältere Bezeichnung) */
  gewaehlt: boolean;
}

/** Fehler beim Speichern, weil das Netzlaufwerk mit den Einstellungen nicht erreichbar ist */
export class KonfigNichtErreichbar extends Error {
  constructor(ordner: string) {
    super(`Das Netzlaufwerk mit den Einstellungen (${ordner}) ist nicht erreichbar – die Einstellungen sind nur lesbar, die Änderung wurde nicht gespeichert.`);
    this.name = 'KonfigNichtErreichbar';
  }
}

async function invoke<T>(befehl: string, args: Record<string, unknown> = {}): Promise<T> {
  const api = await import('@tauri-apps/api/core');
  return api.invoke<T>(befehl, args);
}

/** Inhalt einer Einstellungsdatei: Rohdaten (Base64, zum Vergleich vor dem Schreiben) und gelesener Wert */
interface Roh {
  b64: string;
  wert: unknown;
}

async function rohLesen(pfad: string): Promise<Roh | null> {
  const b64 = await invoke<string | null>('read_binary_file', { path: pfad });
  if (b64 == null) return null;
  try {
    return { b64, wert: JSON.parse(new TextDecoder('utf-8').decode(base64ToBytes(b64))) as unknown };
  } catch {
    throw new Error(`${pfad}: keine gültige Einstellungsdatei`);
  }
}

const kodiert = (wert: unknown) => bytesToBase64(new TextEncoder().encode(`${JSON.stringify(wert, null, 2)}\n`));

const datei = (ordner: string, bereich: string) => verbinde(ordner, `${bereich}.json`);
const istLokal = (bereich: string, o: KonfigOptionen) => !!o.lokal || LOKALE_BEREICHE.includes(bereich);

/* ---------- Ort und Zustand ---------- */

let ort: Promise<KonfigOrt | null> | null = null;
let zustand: KonfigOrt | null = null;
const beobachter = new Set<(o: KonfigOrt | null) => void>();
const nachWechsel = new Set<() => void>();
/** zuletzt gemeldeter Zustand – jede Änderung wird genau einmal gemeldet */
let gemeldet: string | undefined;
function melden() {
  const jetzt = JSON.stringify(zustand);
  if (jetzt === gemeldet) return;
  const erstes = gemeldet === undefined;
  gemeldet = jetzt;
  beobachter.forEach((f) => f(zustand));
  if (!erstes) nachWechsel.forEach((f) => f());
}

/** Zeiger aus Rohdaten; ältere Fassungen kennen nur `ordner` (gesetzt = Netzwerkinstallation) */
export function zeigerAus(roh: unknown): { modus: KonfigModus; ordner: string; netzordner: string } {
  const z = (roh && typeof roh === 'object' ? roh : {}) as Record<string, unknown>;
  const ordner = typeof z.ordner === 'string' ? z.ordner.trim() : '';
  const netzordner = typeof z.netzordner === 'string' ? z.netzordner.trim() : '';
  const modus: KonfigModus = z.modus === 'einzelplatz' ? 'einzelplatz' : ordner ? 'netzwerk' : 'einzelplatz';
  return modus === 'netzwerk' && ordner ? { modus, ordner, netzordner: ordner } : { modus: 'einzelplatz', ordner: '', netzordner: netzordner || ordner };
}

/** Ordner erreichbar? (Rust mit Zeitlimit – ein getrenntes Netzlaufwerk darf die App nicht aufhalten) */
const erreichbar = (pfad: string) => invoke<boolean>('ordner_erreichbar', { pfad }).catch(() => false);

let fensterGebunden = false;
function fensterBinden() {
  if (fensterGebunden || typeof window === 'undefined') return;
  fensterGebunden = true;
  // ein anderes Fenster oder ein anderer Tab hat den Ort gewechselt
  window.addEventListener('storage', (e) => {
    if (e.key !== SIGNAL) return;
    ort = null;
    gespiegelt.clear();
    herkunft = null;
    void konfigOrt().catch(() => undefined);
  });
}

/** Wo die Einstellungen liegen; `null` im Browser */
export function konfigOrt(): Promise<KonfigOrt | null> {
  if (!isTauri()) return Promise.resolve(null);
  fensterBinden();
  ort ??= (async () => {
    const basis = await invoke<string>('konfig_basis');
    const z = zeigerAus((await rohLesen(datei(basis, ZEIGER)).catch(() => null))?.wert);
    const netz = z.modus === 'netzwerk';
    const notbetrieb = netz && !(await erreichbar(z.ordner));
    const o: KonfigOrt = { ordner: netz ? z.ordner : basis, basis, modus: z.modus, notbetrieb, netzordner: z.netzordner, gewaehlt: netz };
    zustand = o;
    if (netz && !notbetrieb) void kopieAuffrischen(o);
    melden();
    return o;
  })();
  ort.catch(() => {
    ort = null;
  });
  return ort;
}

/** Änderungen des Orts bzw. Zustands (Wechsel, Notbetrieb, wieder erreichbar) verfolgen; liefert das Abmelden */
export function konfigOrtBeobachten(f: (o: KonfigOrt | null) => void): () => void {
  beobachter.add(f);
  return () => beobachter.delete(f);
}

/**
 * Nach einem Wechsel des Orts (auch in einem anderen Fenster), beim Wegfall des Netzlaufwerks und wenn es wieder
 * erreichbar ist: zwischengespeicherte Einstellungen neu lesen. Nicht beim ersten Lesen des Orts. Liefert das Abmelden.
 */
export function konfigNeuLesen(f: () => void): () => void {
  nachWechsel.add(f);
  return () => nachWechsel.delete(f);
}

/** Netzlaufwerk erneut prüfen (nach „Erneut versuchen“) */
export async function konfigOrtNeuPruefen(): Promise<KonfigOrt | null> {
  ort = null;
  return konfigOrt();
}

/** Netzlaufwerk während der Arbeit weggefallen: auf die lokale Kopie umschalten (nur, wenn `o` noch gilt) */
function inNotbetrieb(o: KonfigOrt) {
  if (!zustand || zustand.notbetrieb || zustand.modus !== o.modus || !gleicherPfad(zustand.ordner, o.ordner)) return;
  zustand = { ...o, notbetrieb: true };
  ort = Promise.resolve(zustand);
  melden();
}

/* ---------- Lokale Kopie einer Netzwerkinstallation ---------- */

/**
 * Herkunft der Kopie (`netz-kopie/.herkunft.json`): aus welchem Netzordner sie stammt und welche Bereiche darin von
 * dort sind. Nach einem Wechsel des Netzordners gilt eine Kopie anderer Herkunft im Notbetrieb nicht – sonst läsen die
 * Apps fremde, veraltete Einstellungen. Gelöscht wird dafür nichts.
 */
interface Herkunft {
  ordner: string;
  bereiche: string[];
}
const HERKUNFT = '.herkunft';

const gespiegelt = new Map<string, string>();
let herkunft: Herkunft | null = null;
let spiegelKette: Promise<unknown> = Promise.resolve();

async function herkunftLesen(basis: string): Promise<Herkunft | null> {
  const roh = (await rohLesen(datei(verbinde(basis, KOPIE), HERKUNFT)).catch(() => null))?.wert as Partial<Herkunft> | undefined;
  return roh && typeof roh.ordner === 'string' && Array.isArray(roh.bereiche) ? { ordner: roh.ordner, bereiche: roh.bereiche.filter((b): b is string => typeof b === 'string') } : null;
}

/** einen gelesenen Bereich lokal spiegeln (nacheinander, damit die Herkunft stimmt) */
function spiegeln(o: KonfigOrt, bereich: string, b64: string): Promise<void> {
  if (o.modus !== 'netzwerk' || gespiegelt.get(bereich) === b64) return Promise.resolve();
  const p = spiegelKette.then(async () => {
    const kopie = verbinde(o.basis, KOPIE);
    herkunft ??= await herkunftLesen(o.basis);
    if (!herkunft || !gleicherPfad(herkunft.ordner, o.ordner)) {
      // neue Herkunft: erst vermerken, dann gelten die alten Dateien nicht mehr
      herkunft = { ordner: o.ordner, bereiche: [] };
      await invoke<void>('write_binary_file', { path: datei(kopie, HERKUNFT), contentsBase64: kodiert(herkunft) });
    }
    await invoke<void>('write_binary_file', { path: datei(kopie, bereich), contentsBase64: b64 });
    gespiegelt.set(bereich, b64);
    if (!herkunft.bereiche.includes(bereich)) {
      // frisch lesen und vereinigen: ein anderes Fenster kann inzwischen eigene Bereiche eingetragen haben
      const aufPlatte = await herkunftLesen(o.basis);
      const dazu = aufPlatte && gleicherPfad(aufPlatte.ordner, o.ordner) ? aufPlatte.bereiche : [];
      herkunft = { ordner: o.ordner, bereiche: [...new Set([...herkunft.bereiche, ...dazu, bereich])] };
      await invoke<void>('write_binary_file', { path: datei(kopie, HERKUNFT), contentsBase64: kodiert(herkunft) });
    }
  });
  // die Kopie ist nur für den Notbetrieb; misslingt sie, bleibt der vorige Stand
  spiegelKette = p.catch(() => undefined);
  return p.catch(() => undefined);
}

/** Bereich aus der lokalen Kopie (Notbetrieb) – nur, wenn er vom gewählten Netzordner stammt */
async function kopieLesen(o: KonfigOrt, bereich: string): Promise<Roh | null> {
  const h = herkunft ?? (await herkunftLesen(o.basis));
  if (!h || !gleicherPfad(h.ordner, o.ordner) || !h.bereiche.includes(bereich)) return null;
  return rohLesen(datei(verbinde(o.basis, KOPIE), bereich));
}

/** alle gemeinsamen Bereiche des Netzlaufwerks lokal spiegeln (einmal je Sitzung im Hintergrund) */
async function kopieAuffrischen(o: KonfigOrt): Promise<void> {
  try {
    for (const name of await invoke<string[]>('konfig_dateien', { ordner: o.ordner })) {
      const bereich = name.replace(/\.json$/, '');
      if (LOKALE_BEREICHE.includes(bereich)) continue;
      const b64 = await invoke<string | null>('read_binary_file', { path: verbinde(o.ordner, name) });
      if (b64 != null) await spiegeln(o, bereich, b64);
    }
  } catch {
    // nächster Versuch beim nächsten Start; einzelne Bereiche spiegelt schon das Lesen
  }
}

/* ---------- Lesen und Schreiben ---------- */

export interface KonfigOptionen {
  /** nur für diesen Benutzer auf diesem Rechner (%APPDATA%\arch-tools), nicht im gemeinsamen Ordner */
  lokal?: boolean;
}

const schluessel = (bereich: string, o: KonfigOptionen) => (o.lokal ? `arch-tools:lokal:${bereich}` : SPEICHER(bereich));

function browserLesen(bereich: string, optionen: KonfigOptionen): unknown {
  try {
    const roh = localStorage.getItem(schluessel(bereich, optionen));
    return roh ? (JSON.parse(roh) as unknown) : null;
  } catch {
    return null;
  }
}

/** Rohinhalt eines Bereichs mit Ort (Desktop) */
async function lesenMitOrt(o: KonfigOrt, bereich: string, optionen: KonfigOptionen): Promise<Roh | null> {
  if (istLokal(bereich, optionen)) return rohLesen(datei(o.basis, bereich));
  if (o.notbetrieb) return kopieLesen(o, bereich);
  let r: Roh | null;
  try {
    r = await rohLesen(datei(o.ordner, bereich));
  } catch (e) {
    if (o.modus !== 'netzwerk' || (await erreichbar(o.ordner))) throw e;
    inNotbetrieb(o);
    return kopieLesen(o, bereich);
  }
  if (r) {
    void spiegeln(o, bereich, r.b64);
    return r;
  }
  // „gibt es nicht“ kann bei einem getrennten Laufwerk auch „Pfad nicht gefunden“ heißen – dann nicht die Vorgaben
  if (o.modus === 'netzwerk' && !(await erreichbar(o.ordner))) {
    inNotbetrieb(o);
    return kopieLesen(o, bereich);
  }
  return null;
}

/** Ziel einer Schreibung (Desktop); im Notbetrieb nicht für gemeinsame Bereiche */
function schreibziel(o: KonfigOrt, bereich: string, optionen: KonfigOptionen): string {
  if (istLokal(bereich, optionen)) return datei(o.basis, bereich);
  if (o.notbetrieb) throw new KonfigNichtErreichbar(o.ordner);
  return datei(o.ordner, bereich);
}

/** Schreibfehler auf dem Netzlaufwerk: Ist es weg, Notbetrieb und klare Meldung */
async function schreibfehler(o: KonfigOrt, bereich: string, optionen: KonfigOptionen, e: unknown): Promise<never> {
  if (!istLokal(bereich, optionen) && o.modus === 'netzwerk' && !(await erreichbar(o.ordner))) {
    inNotbetrieb(o);
    throw new KonfigNichtErreichbar(o.ordner);
  }
  throw e;
}

/** Rohinhalt eines Bereichs; `null`, wenn es ihn (noch) nicht gibt */
export async function konfigLesen(bereich: string, optionen: KonfigOptionen = {}): Promise<unknown> {
  const o = await konfigOrt();
  if (!o) return browserLesen(bereich, optionen);
  return (await lesenMitOrt(o, bereich, optionen))?.wert ?? null;
}

/**
 * Schreiben nacheinander: Zwei Änderungen kurz hintereinander (Lesen, Ändern, Schreiben) dürfen sich nicht
 * überholen – sonst ginge die erste verloren.
 */
let kette: Promise<unknown> = Promise.resolve();
function nacheinander<T>(f: () => Promise<T>): Promise<T> {
  const p = kette.then(f, f);
  kette = p.catch(() => undefined);
  return p;
}

/** Bereich schreiben (ganz ersetzen) */
export function konfigSchreiben(bereich: string, wert: unknown, optionen: KonfigOptionen = {}): Promise<void> {
  return nacheinander(() => schreibenJetzt(bereich, wert, optionen));
}

async function schreibenJetzt(bereich: string, wert: unknown, optionen: KonfigOptionen = {}): Promise<void> {
  const o = await konfigOrt();
  if (!o) {
    try {
      localStorage.setItem(schluessel(bereich, optionen), JSON.stringify(wert));
    } catch {
      // ohne Speicher gilt die Einstellung nur bis zum Schließen
    }
    return;
  }
  // auch das Ersetzen unter der Sperre: Es darf eine laufende Änderung eines anderen Rechners nicht überholen
  for (let i = 0; i < VERSUCHE; i++) {
    schreibziel(o, bereich, optionen);
    if (await schreibenWenn(o, bereich, optionen, await lesenMitOrt(o, bereich, optionen), wert)) return;
  }
  throw new Error(`Einstellungen „${bereich}“ werden gerade von mehreren Rechnern zugleich geändert – bitte erneut versuchen.`);
}

/** Schreiben, wenn die Datei noch `erwartet` enthält (Desktop); false, wenn ein anderer Rechner dazwischen schrieb */
async function schreibenWenn(o: KonfigOrt, bereich: string, optionen: KonfigOptionen, erwartet: Roh | null, wert: unknown): Promise<boolean> {
  const pfad = schreibziel(o, bereich, optionen);
  const b64 = kodiert(wert);
  let ok = false;
  try {
    ok = await invoke<boolean>('konfig_schreiben_wenn', { pfad, erwartetBase64: erwartet?.b64 ?? null, contentsBase64: b64 });
  } catch (e) {
    await schreibfehler(o, bereich, optionen, e);
  }
  if (ok && !istLokal(bereich, optionen)) void spiegeln(o, bereich, b64);
  return ok;
}

/** so oft wird eine Änderung neu angesetzt, wenn andere Rechner dazwischen schreiben */
const VERSUCHE = 5;

/**
 * Bereich gezielt ändern: frisch lesen, `aendern` anwenden, schreiben – nacheinander mit anderen Änderungen dieses
 * Fensters. Hat ein anderer Rechner die Datei inzwischen geändert, wird neu gelesen und `aendern` erneut angewandt
 * (`aendern` muss deshalb ohne Nebenwirkungen sein).
 */
export function konfigAendern<T>(bereich: string, aendern: (roh: unknown) => T, optionen: KonfigOptionen = {}): Promise<T> {
  return nacheinander(async () => {
    const o = await konfigOrt();
    if (!o) {
      const neu = aendern(browserLesen(bereich, optionen));
      await schreibenJetzt(bereich, neu, optionen);
      return neu;
    }
    for (let i = 0; i < VERSUCHE; i++) {
      const roh = await lesenMitOrt(o, bereich, optionen);
      const neu = aendern(roh?.wert ?? null);
      if (await schreibenWenn(o, bereich, optionen, roh, neu)) return neu;
    }
    throw new Error(`Einstellungen „${bereich}“ werden gerade von mehreren Rechnern zugleich geändert – bitte erneut versuchen.`);
  });
}

/** Stand eines Bereichs zum Vergleich vor dem Schreiben: sein Inhalt als JSON-Text; null, wenn es ihn nicht gibt */
export const konfigStand = (roh: unknown): string | null => (roh == null ? null : JSON.stringify(roh));

export type KonfigSchreibErgebnis = { ok: true; stand: string | null } | { ok: false; aktuell: unknown };

/**
 * Bereich nur schreiben, wenn er seit dem Lesen unverändert ist (`stand` aus `konfigStand`) – sonst nichts schreiben
 * und den aktuellen Inhalt liefern. Verhindert, dass zwei Rechner mit offener App sich gegenseitig Änderungen
 * überschreiben („letzter Schreiber gewinnt“). Liefert beim Gelingen den neuen Stand.
 */
export function konfigSchreibenWennUnveraendert(bereich: string, wert: unknown, stand: string | null, optionen: KonfigOptionen = {}): Promise<KonfigSchreibErgebnis> {
  return nacheinander(async () => {
    const o = await konfigOrt();
    if (!o) {
      const aktuell = browserLesen(bereich, optionen);
      if (konfigStand(aktuell) !== stand) return { ok: false, aktuell };
      await schreibenJetzt(bereich, wert, optionen);
      return { ok: true, stand: konfigStand(wert) };
    }
    const roh = await lesenMitOrt(o, bereich, optionen);
    if (konfigStand(roh?.wert ?? null) !== stand || !(await schreibenWenn(o, bereich, optionen, roh, wert))) {
      return { ok: false, aktuell: (await lesenMitOrt(o, bereich, optionen))?.wert ?? null };
    }
    return { ok: true, stand: konfigStand(wert) };
  });
}

/* ---------- Wechsel zwischen Einzelplatz und Netzwerkinstallation ---------- */

export interface KonfigZiel {
  modus: KonfigModus;
  /** Ordner auf dem Netzlaufwerk (nur bei einer Netzwerkinstallation) */
  ordner?: string;
}

export interface KonfigZielPruefung {
  /** der Ordner, in den die Einstellungen kämen */
  ordner: string;
  /** ist der Ordner erreichbar? */
  erreichbar: boolean;
  /** derselbe Ordner wie jetzt – es zieht nichts um */
  gleich: boolean;
  /** gemeinsame Bereiche, die dort schon liegen */
  vorhanden: string[];
}

const bereicheIn = async (ordner: string) => (await invoke<string[]>('konfig_dateien', { ordner })).map((n) => n.replace(/\.json$/, '')).filter((b) => !LOKALE_BEREICHE.includes(b));

/** derselbe Ordner? (Windows: ohne Rücksicht auf Groß-/Kleinschreibung und Schrägstrich am Ende) */
export const gleicherPfad = (a: string, b: string) => a.replace(/[\\/]+$/, '').toLowerCase() === b.replace(/[\\/]+$/, '').toLowerCase();

function zielOrdner(o: KonfigOrt, ziel: KonfigZiel): string {
  if (ziel.modus === 'einzelplatz') return o.basis;
  const p = ziel.ordner?.trim() ?? '';
  if (!p) throw new Error('Für die Netzwerkinstallation bitte einen Ordner auf dem Netzlaufwerk wählen.');
  if (gleicherPfad(p, o.basis) || gleicherPfad(p, verbinde(o.basis, KOPIE))) throw new Error('Dieser Ordner liegt auf diesem Rechner – dafür „Einzelplatz“ wählen.');
  return p;
}

/** Vor dem Wechsel: Wohin, erreichbar, was liegt dort schon? `null` im Browser */
export async function konfigZielPruefen(ziel: KonfigZiel): Promise<KonfigZielPruefung | null> {
  const o = await konfigOrt();
  if (!o) return null;
  const ordner = zielOrdner(o, ziel);
  const gleich = gleicherPfad(ordner, o.ordner) && ziel.modus === o.modus;
  if (!(await erreichbar(ordner))) return { ordner, erreichbar: false, gleich, vorhanden: [] };
  return { ordner, erreichbar: true, gleich, vorhanden: gleich ? [] : await bereicheIn(ordner) };
}

/** Was mit Einstellungen geschieht, die am Ziel schon liegen */
export type KonfigUmzug = 'uebernehmen' | 'ersetzen';

export interface KonfigWechselErgebnis {
  /** Bereiche, die mitgenommen wurden */
  kopiert: string[];
  /** Bereiche am Ziel, die vor dem Ersetzen gesichert wurden (`<bereich>.json.vor-umzug-JJJJ-MM-TT-hhmmss`) */
  gesichert: string[];
}

const vorWechsel = new Set<() => Promise<void> | void>();
/** Vor einem Wechsel ausführen (z. B. ausstehende Änderungen speichern); liefert das Abmelden */
export function konfigVorWechsel(f: () => Promise<void> | void): () => void {
  vorWechsel.add(f);
  return () => vorWechsel.delete(f);
}

const zweistellig = (n: number) => String(n).padStart(2, '0');
const zeitstempel = (d: Date) =>
  `${d.getFullYear()}-${zweistellig(d.getMonth() + 1)}-${zweistellig(d.getDate())}-${zweistellig(d.getHours())}${zweistellig(d.getMinutes())}${zweistellig(d.getSeconds())}`;

/**
 * Zwischen Einzelplatz und Netzwerkinstallation wechseln bzw. einen anderen Netzordner wählen. Die gemeinsamen
 * Bereiche ziehen mit (im Notbetrieb aus der lokalen Kopie): Was am Ziel fehlt, wird immer hinübergenommen; was dort
 * schon liegt, gilt bei „uebernehmen“ und wird bei „ersetzen“ nach einer Sicherung überschrieben. Gelöscht wird
 * nichts – auch der bisherige Ordner bleibt, wie er ist. Danach gilt der neue Ort in allen Fenstern.
 */
export async function konfigOrtWechseln(ziel: KonfigZiel, umzug: KonfigUmzug): Promise<KonfigWechselErgebnis> {
  for (const f of vorWechsel) await f();
  return nacheinander(async () => {
    const o = await konfigOrt();
    if (!o) return { kopiert: [], gesichert: [] };
    const nach = zielOrdner(o, ziel);
    const ergebnis: KonfigWechselErgebnis = { kopiert: [], gesichert: [] };
    if (!gleicherPfad(nach, o.ordner)) {
      if (!(await erreichbar(nach))) throw new Error(`${nach} ist nicht erreichbar – es wurde nichts geändert.`);
      const von = o.notbetrieb ? verbinde(o.basis, KOPIE) : o.ordner;
      const dort = new Set(await bereicheIn(nach));
      const stempel = zeitstempel(new Date());
      // im Notbetrieb nur, was in der Kopie wirklich vom gewählten Netzordner stammt
      const h = o.notbetrieb ? await herkunftLesen(o.basis) : null;
      const quelle = o.notbetrieb ? (h && gleicherPfad(h.ordner, o.ordner) ? h.bereiche.filter((b) => !LOKALE_BEREICHE.includes(b)) : []) : await bereicheIn(von);
      for (const b of quelle) {
        if (dort.has(b) && umzug === 'uebernehmen') continue;
        const inhalt = await invoke<string | null>('read_binary_file', { path: datei(von, b) });
        if (inhalt == null) continue;
        if (dort.has(b)) {
          const alt = await invoke<string | null>('read_binary_file', { path: datei(nach, b) });
          if (alt === inhalt) continue;
          if (alt != null) {
            // nie eine frühere Sicherung überschreiben (zweites Ersetzen in derselben Sekunde: mit Zähler)
            let sicherung = verbinde(nach, `${b}.json.vor-umzug-${stempel}`);
            for (let n = 2; (await invoke<string | null>('read_binary_file', { path: sicherung })) != null; n++) sicherung = verbinde(nach, `${b}.json.vor-umzug-${stempel}-${n}`);
            await invoke<void>('write_binary_file', { path: sicherung, contentsBase64: alt });
            ergebnis.gesichert.push(b);
          }
        }
        await invoke<void>('write_binary_file', { path: datei(nach, b), contentsBase64: inhalt });
        ergebnis.kopiert.push(b);
      }
    }
    const zeiger = ziel.modus === 'netzwerk' ? { modus: 'netzwerk', ordner: nach } : { modus: 'einzelplatz', ordner: '', netzordner: o.modus === 'netzwerk' ? o.ordner : o.netzordner };
    await invoke<void>('write_binary_file', { path: datei(o.basis, ZEIGER), contentsBase64: kodiert(zeiger) });
    gespiegelt.clear();
    herkunft = null;
    ort = null;
    await konfigOrt();
    try {
      localStorage.setItem(SIGNAL, String(Date.now()));
    } catch {
      // ohne Speicher erfahren andere Fenster den Wechsel beim nächsten Start
    }
    return ergebnis;
  });
}

const texte = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()))] : []);

let bueroZuletzt = '';
/** zuletzt gelesener Büroname (für den Kopf der Excel-Dateien; leer, solange die Einstellungen nicht gelesen sind) */
export const bueroName = (): string => bueroZuletzt;

/** Gemeinsame Einstellungen aus Rohdaten; Fehlendes aus der Vorgabe */
export function allgemeinAus(roh: unknown): AllgemeineEinstellungen {
  const o = (roh && typeof roh === 'object' ? roh : {}) as Record<string, unknown>;
  const text = (v: unknown, vorgabe: string) => (typeof v === 'string' ? v.trim() : vorgabe);
  const a: AllgemeineEinstellungen = {
    projekte: texte(o.projekte),
    oapPfad: text(o.oapPfad, VORGABE_ALLGEMEIN.oapPfad) || VORGABE_ALLGEMEIN.oapPfad,
    fotoordner: text(o.fotoordner, VORGABE_ALLGEMEIN.fotoordner),
  };
  if (text(o.buero, '')) a.buero = text(o.buero, '');
  if (texte(o.mitarbeiter).length) a.mitarbeiter = texte(o.mitarbeiter);
  if (text(o.ordnerSchema, '')) a.ordnerSchema = text(o.ordnerSchema, '');
  const schema = namensschemaAus(o.namensschema);
  if (schema) a.namensschema = schema;
  bueroZuletzt = a.buero ?? '';
  return a;
}

export async function allgemeinLaden(): Promise<AllgemeineEinstellungen> {
  return allgemeinAus(await konfigLesen('allgemein'));
}

/** Gemeinsame Einstellungen ändern: frisch lesen, nur die übergebenen Angaben ersetzen (andere Apps schreiben mit) */
export function allgemeinAendern(patch: Partial<AllgemeineEinstellungen>): Promise<AllgemeineEinstellungen> {
  return konfigAendern('allgemein', (roh) => ({ ...((roh && typeof roh === 'object' ? roh : {}) as Record<string, unknown>), ...patch })).then(allgemeinAus);
}

/* ---------- Zuletzt geöffnet: je Benutzer, gemeinsam für alle Apps ---------- */

export interface ZuletztEintrag {
  /** vollständiger Pfad des Projektordners (bzw. der Datei) – der Schlüssel */
  pfad: string;
  /** zuletzt geöffnet (ms seit 1970) */
  zeit: number;
  /** in welcher App */
  app?: string;
}

const ZULETZT = 'zuletzt';
const ZULETZT_MAX = 50;

const zuletztAus = (roh: unknown): ZuletztEintrag[] =>
  (Array.isArray((roh as { eintraege?: unknown })?.eintraege) ? (roh as { eintraege: unknown[] }).eintraege : [])
    .filter((e): e is ZuletztEintrag => !!e && typeof e === 'object' && typeof (e as ZuletztEintrag).pfad === 'string' && typeof (e as ZuletztEintrag).zeit === 'number')
    .map((e) => ({ pfad: e.pfad, zeit: e.zeit, ...(typeof e.app === 'string' ? { app: e.app } : {}) }));

/** Zuletzt geöffnete Projekte dieses Benutzers (aller Apps), neueste zuerst */
export async function zuletztLesen(): Promise<ZuletztEintrag[]> {
  return zuletztAus(await konfigLesen(ZULETZT, { lokal: true }).catch(() => null)).sort((a, b) => b.zeit - a.zeit);
}

/** Projekt als zuletzt geöffnet vermerken (gleicher Pfad ohne Rücksicht auf Groß-/Kleinschreibung zählt einmal) */
export async function zuletztMerken(pfad: string, app?: string, zeit = Date.now()): Promise<ZuletztEintrag[]> {
  return konfigAendern(
    ZULETZT,
    (roh) => ({ eintraege: [{ pfad, zeit, ...(app ? { app } : {}) }, ...zuletztAus(roh).filter((e) => e.pfad.toLowerCase() !== pfad.toLowerCase())].slice(0, ZULETZT_MAX) }),
    { lokal: true },
  ).then((r) => r.eintraege);
}

/* ---------- Angeheftete Projekte: je Benutzer, gemeinsam für alle Apps ---------- */

const ANGEHEFTET = 'angeheftet';
const pfadeAus = (roh: unknown): string[] => texte((roh as { pfade?: unknown } | null)?.pfade);

/** angeheftete Projektordner dieses Benutzers (vollständige Pfade), in der Reihenfolge des Anheftens */
export async function angeheftetLesen(): Promise<string[]> {
  return pfadeAus(await konfigLesen(ANGEHEFTET, { lokal: true }).catch(() => null));
}

/** Projekt anheften bzw. lösen (Groß-/Kleinschreibung egal); liefert die neue Liste */
export async function anheftenUmschalten(pfad: string): Promise<string[]> {
  return konfigAendern(
    ANGEHEFTET,
    (roh) => {
      const alt = pfadeAus(roh);
      const da = alt.some((p) => p.toLowerCase() === pfad.toLowerCase());
      return { pfade: da ? alt.filter((p) => p.toLowerCase() !== pfad.toLowerCase()) : [...alt, pfad] };
    },
    { lokal: true },
  ).then((r) => r.pfade);
}

/** Eintrag aus „Zuletzt geöffnet“ nehmen – am Projekt selbst ändert sich nichts */
export async function zuletztVergessen(pfad: string): Promise<ZuletztEintrag[]> {
  return konfigAendern(ZULETZT, (roh) => ({ eintraege: zuletztAus(roh).filter((e) => e.pfad.toLowerCase() !== pfad.toLowerCase()) }), { lokal: true }).then((r) => r.eintraege);
}

/* ---------- Bezeichnung der Bereiche (Anzeige beim Wechsel) ---------- */

const BEREICH_NAMEN: Record<string, string> = {
  allgemein: 'Gemeinsame Einstellungen aller Apps',
  projektordner: `${APP_NAMEN.ordner.name}: Ordnerstruktur und Vorlagen`,
  'projektordner-sicherungen': `${APP_NAMEN.ordner.name}: Sicherungen der Ordnerstruktur`,
  mails: `${APP_NAMEN.ordner.name}: Mails`,
  kataster: `${APP_NAMEN.ordner.name}: Kataster`,
  formulare: `${APP_NAMEN.formulare.name}: Adressen und Einstellungen`,
  raumkatalog: `${APP_NAMEN.flaechenrechner.name}: Raumkatalog`,
  nutzungsarten: `${APP_NAMEN.flaechenrechner.name}: Nutzungsarten`,
  ava: `${APP_NAMEN.ava.name}: Einstellungen`,
  'ava-texte': `${APP_NAMEN.ava.name}: Textbibliothek`,
};

/** lesbarer Name eines Bereichs, z. B. „ATLAS: Ordnerstruktur und Vorlagen“; unbekannte als Dateiname */
export const bereichName = (bereich: string): string => BEREICH_NAMEN[bereich] ?? `${bereich}.json`;
