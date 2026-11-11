import { VORGABE_OAP_PFAD } from '../projektdatei';
import { base64ToBytes, bytesToBase64, isTauri } from './files';
import { verbinde } from './projektordner';

/**
 * Gemeinsame Einstellungen aller Apps in einem Konfigurationsordner. Er wird einmal angelegt bzw. gewählt –
 * auf einem Server-Laufwerk gilt er für das ganze Büro – und enthält je Bereich eine JSON-Datei:
 *
 *   allgemein.json     Einstellungen aller Apps: Stammordner der Projekte, Ort neuer Projektdateien, Fotoordner
 *   <app>.json         Einstellungen einer App (z. B. projektordner.json: Struktur und Vorlagen-Presets)
 *
 * Welcher Ordner gilt, steht je Benutzer in %APPDATA%\arch-tools\konfig.json – derselbe Ort für alle Apps.
 * Ohne eigene Wahl ist der Konfigurationsordner dieser lokale Ordner selbst. Im Browser (ohne Dateizugriff) liegen
 * die Bereiche im lokalen Speicher.
 *
 * Was nur dem Benutzer gehört (z. B. „Zuletzt geöffnet“), liegt mit `{ lokal: true }` immer in diesem lokalen Ordner,
 * nie im gemeinsamen.
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
}

export const VORGABE_ALLGEMEIN: AllgemeineEinstellungen = { projekte: [], oapPfad: VORGABE_OAP_PFAD, fotoordner: '09 Fotos' };

const ZEIGER = 'konfig.json';
const SPEICHER = (bereich: string) => `arch-tools:konfig:${bereich}`;

export interface KonfigOrt {
  /** der Konfigurationsordner */
  ordner: string;
  /** der lokale Ordner mit dem Zeiger (%APPDATA%\arch-tools) */
  basis: string;
  /** true, wenn ein eigener (z. B. gemeinsamer) Ordner gewählt ist */
  gewaehlt: boolean;
}

async function invoke<T>(befehl: string, args: Record<string, unknown> = {}): Promise<T> {
  const api = await import('@tauri-apps/api/core');
  return api.invoke<T>(befehl, args);
}

async function dateiLesen(pfad: string): Promise<unknown> {
  const b64 = await invoke<string | null>('read_binary_file', { path: pfad });
  if (b64 == null) return null;
  try {
    return JSON.parse(new TextDecoder('utf-8').decode(base64ToBytes(b64))) as unknown;
  } catch {
    throw new Error(`${pfad}: keine gültige Einstellungsdatei`);
  }
}

async function dateiSchreiben(pfad: string, wert: unknown): Promise<void> {
  await invoke<void>('write_binary_file', { path: pfad, contentsBase64: bytesToBase64(new TextEncoder().encode(`${JSON.stringify(wert, null, 2)}\n`)) });
}

let ort: Promise<KonfigOrt | null> | null = null;

/** Wo die Einstellungen liegen; `null` im Browser */
export function konfigOrt(): Promise<KonfigOrt | null> {
  if (!isTauri()) return Promise.resolve(null);
  ort ??= (async () => {
    const basis = await invoke<string>('konfig_basis');
    const z = (await dateiLesen(verbinde(basis, ZEIGER)).catch(() => null)) as { ordner?: unknown } | null;
    const eigen = z && typeof z.ordner === 'string' && z.ordner.trim() ? z.ordner.trim() : '';
    return { ordner: eigen || basis, basis, gewaehlt: !!eigen };
  })();
  ort.catch(() => {
    ort = null;
  });
  return ort;
}

export interface KonfigOptionen {
  /** nur für diesen Benutzer auf diesem Rechner (%APPDATA%\arch-tools), nicht im gemeinsamen Ordner */
  lokal?: boolean;
}

const schluessel = (bereich: string, o: KonfigOptionen) => (o.lokal ? `arch-tools:lokal:${bereich}` : SPEICHER(bereich));

/** Rohinhalt eines Bereichs; `null`, wenn es ihn (noch) nicht gibt */
export async function konfigLesen(bereich: string, optionen: KonfigOptionen = {}): Promise<unknown> {
  const o = await konfigOrt();
  if (!o) {
    try {
      const roh = localStorage.getItem(schluessel(bereich, optionen));
      return roh ? (JSON.parse(roh) as unknown) : null;
    } catch {
      return null;
    }
  }
  return dateiLesen(verbinde(optionen.lokal ? o.basis : o.ordner, `${bereich}.json`));
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
  await dateiSchreiben(verbinde(optionen.lokal ? o.basis : o.ordner, `${bereich}.json`), wert);
}

/** Bereich gezielt ändern: frisch lesen, `aendern` anwenden, schreiben – nacheinander mit anderen Änderungen */
export function konfigAendern<T>(bereich: string, aendern: (roh: unknown) => T, optionen: KonfigOptionen = {}): Promise<T> {
  return nacheinander(async () => {
    const neu = aendern(await konfigLesen(bereich, optionen));
    await schreibenJetzt(bereich, neu, optionen);
    return neu;
  });
}

/**
 * Anderen Konfigurationsordner wählen (`null` = wieder der lokale). Bereiche, die es dort noch nicht gibt, werden
 * aus dem bisherigen Ordner hinübergenommen; was dort schon liegt, gilt und bleibt unverändert. Liefert die
 * übernommenen Bereiche.
 */
export async function konfigOrdnerWechseln(neu: string | null, bereiche: string[]): Promise<string[]> {
  const alt = await konfigOrt();
  if (!alt) return [];
  const ziel = neu?.trim() || alt.basis;
  const uebernommen: string[] = [];
  if (ziel !== alt.ordner) {
    for (const b of bereiche) {
      const dort = await dateiLesen(verbinde(ziel, `${b}.json`)).catch(() => null);
      if (dort != null) continue;
      const bisher = await dateiLesen(verbinde(alt.ordner, `${b}.json`)).catch(() => null);
      if (bisher == null) continue;
      await dateiSchreiben(verbinde(ziel, `${b}.json`), bisher);
      uebernommen.push(b);
    }
  }
  await dateiSchreiben(verbinde(alt.basis, ZEIGER), { ordner: neu?.trim() || '' });
  ort = null;
  return uebernommen;
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
  bueroZuletzt = a.buero ?? '';
  return a;
}

export async function allgemeinLaden(): Promise<AllgemeineEinstellungen> {
  return allgemeinAus(await konfigLesen('allgemein'));
}

/** Gemeinsame Einstellungen ändern: frisch lesen, nur die übergebenen Angaben ersetzen (andere Apps schreiben mit) */
export function allgemeinAendern(patch: Partial<AllgemeineEinstellungen>): Promise<AllgemeineEinstellungen> {
  return nacheinander(async () => {
    const roh = ((await konfigLesen('allgemein')) ?? {}) as Record<string, unknown>;
    const neu = { ...roh, ...patch };
    await schreibenJetzt('allgemein', neu);
    return allgemeinAus(neu);
  });
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

/** Eintrag aus „Zuletzt geöffnet“ nehmen – am Projekt selbst ändert sich nichts */
export async function zuletztVergessen(pfad: string): Promise<ZuletztEintrag[]> {
  return konfigAendern(ZULETZT, (roh) => ({ eintraege: zuletztAus(roh).filter((e) => e.pfad.toLowerCase() !== pfad.toLowerCase()) }), { lokal: true }).then((r) => r.eintraege);
}
