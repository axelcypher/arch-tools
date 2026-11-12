/**
 * Abruf aus dem Netz für Rechtsstand und Geodienste. In der Desktop-App über den Tauri-Befehl `netz_holen`
 * (Host-Liste in Rust, keine Änderung der CSP nötig); in Tests und Werkzeugen (Node) über `fetch`. Im Browser
 * scheitern die meisten Quellen an CORS – die Web-Version arbeitet mit dem mitgelieferten Stand.
 */

import { base64ToBytes, isTauri } from '../platform/files';

export interface NetzAntwort {
  /** HTTP-Status; 304 = unverändert (bei bedingter Abfrage) */
  status: number;
  /** Adresse nach Umleitungen */
  url: string;
  etag?: string;
  geaendert?: string;
  typ?: string;
  daten: Uint8Array;
}

export interface NetzOptionen {
  etag?: string;
  geaendert?: string;
  /** Zeitlimit in ms (Vorgabe 30 s) */
  zeit?: number;
}

export type Holen = (url: string, o?: NetzOptionen) => Promise<NetzAntwort>;

/** Fehler beim Abruf – mit verständlichem Text für die Oberfläche */
export class NetzFehler extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'NetzFehler';
  }
}

async function tauriHolen(url: string, o: NetzOptionen = {}): Promise<NetzAntwort> {
  const api = await import('@tauri-apps/api/core');
  let r: { status: number; url: string; etag?: string; geaendert?: string; typ?: string; daten: string };
  try {
    r = await api.invoke('netz_holen', { url, etag: o.etag ?? null, geaendert: o.geaendert ?? null, zeitMs: o.zeit ?? 30000 });
  } catch (e) {
    // Fehler der Rust-Seite sind Texte – als NetzFehler, damit holenOk vorübergehende Fehler wiederholt
    throw new NetzFehler(typeof e === 'string' ? e : e instanceof Error ? e.message : String(e), url);
  }
  return { status: r.status, url: r.url, etag: r.etag ?? undefined, geaendert: r.geaendert ?? undefined, typ: r.typ ?? undefined, daten: base64ToBytes(r.daten) };
}

async function fetchHolen(url: string, o: NetzOptionen = {}): Promise<NetzAntwort> {
  const headers: Record<string, string> = {};
  if (o.etag) headers['If-None-Match'] = o.etag;
  if (o.geaendert) headers['If-Modified-Since'] = o.geaendert;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), o.zeit ?? 30000);
  try {
    const r = await fetch(url, { headers, redirect: 'follow', signal: ctrl.signal });
    return {
      status: r.status,
      url: r.url || url,
      etag: r.headers.get('etag') ?? undefined,
      geaendert: r.headers.get('last-modified') ?? undefined,
      typ: r.headers.get('content-type') ?? undefined,
      daten: new Uint8Array(await r.arrayBuffer()),
    };
  } catch (e) {
    throw new NetzFehler(ctrl.signal.aborted ? `Zeitüberschreitung: ${url}` : `Nicht erreichbar: ${url} (${e instanceof Error ? e.message : String(e)})`, url);
  } finally {
    clearTimeout(t);
  }
}

/** Abruf je nach Umgebung: Desktop über Tauri, sonst fetch */
export const holen: Holen = (url, o) => (isTauri() ? tauriHolen(url, o) : fetchHolen(url, o));

const warten = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Abruf, der nur 200 (und 304, wenn erlaubt) gelten lässt. Vorübergehende Fehler (HTTP 429, 5xx, Zeitüberschreitung)
 * werden bis zu `versuche`-mal mit wachsender Pause wiederholt – amtliche Server antworten gelegentlich mit 503.
 */
export async function holenOk(h: Holen, url: string, o: NetzOptionen & { unveraendertErlaubt?: boolean; versuche?: number; pause?: number } = {}): Promise<NetzAntwort> {
  const versuche = o.versuche ?? 3;
  let letzter: unknown;
  for (let i = 0; i < versuche; i++) {
    if (i) await warten((o.pause ?? 1500) * i);
    try {
      const r = await h(url, o);
      if (r.status === 304 && o.unveraendertErlaubt) return r;
      if (r.status >= 200 && r.status < 300) return r;
      letzter = new NetzFehler(`${url}: HTTP ${r.status}`, url, r.status);
      if (r.status !== 429 && r.status < 500) break;
    } catch (e) {
      letzter = e;
      if (!(e instanceof NetzFehler)) break;
    }
  }
  throw letzter;
}

/** Text einer Antwort; Kodierung aus dem Content-Type, sonst UTF-8 (gesetze-im-internet.de: ISO-8859-1) */
export function alsText(r: NetzAntwort, vorgabe = 'utf-8'): string {
  const m = /charset=([\w-]+)/i.exec(r.typ ?? '');
  try {
    return new TextDecoder(m?.[1] ?? vorgabe).decode(r.daten);
  } catch {
    return new TextDecoder('utf-8').decode(r.daten);
  }
}

/**
 * Seiten, die einen Fehler mit HTTP 200 melden (z. B. kreis-soest.de: Titel „Fehler - 404“) – der Inhalt zählt,
 * nicht nur der Status.
 */
export function istFehlerseite(html: string): boolean {
  const titel = /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? '';
  return /fehler\s*-?\s*404|seite nicht gefunden|page not found|wartungsarbeiten/i.test(titel);
}
