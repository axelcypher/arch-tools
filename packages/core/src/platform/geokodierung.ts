import type { Anschrift, Koordinaten, ProjectMeta } from '../model';
import { anschriftEinzeilig } from '../model';
import { nachUtm32 } from '../geo/utm32';
import { logger } from './log';

/**
 * Koordinaten zur Adresse des Vorhabens: Abfrage bei OpenStreetMap (Nominatim, strukturierte Suche, Deutschland),
 * Umrechnung nach ETRS89 / UTM 32N (EPSG:25832, wie ALKIS in NRW) – damit sich das Projekt z. B. in QGIS finden lässt.
 * Gesendet wird nur die Adresse des Vorhabens (Straße, PLZ, Ort); eine Abfrage je geänderter Adresse.
 * Die Desktop-Apps erlauben dafür in ihrer CSP genau diesen Dienst (tauri.conf.json, connect-src).
 */

const log = logger('geokodierung');

export const GEOKODIERER = 'https://nominatim.openstreetmap.org/search';
export const QUELLE = 'OpenStreetMap (Nominatim)';

type Abruf = (url: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

/** in Tests ersetzbar; ohne Abruf (Testumgebung) gibt es keine automatische Abfrage */
let abruf: Abruf | null = typeof fetch === 'function' && (import.meta as { env?: { MODE?: string } }).env?.MODE !== 'test' ? (u, i) => fetch(u, i) : null;
export function geokodiererSetzen(f: Abruf | null): void {
  abruf = f;
}
export const geokodierungMoeglich = () => abruf !== null;

/** Adresse als Text – Schlüssel, ob neu abgefragt werden muss */
export const adresseSchluessel = (a: Anschrift) => anschriftEinzeilig(a).replace(/\s+/g, ' ').trim();

/** Ist die Adresse vollständig genug für eine Abfrage (Straße und PLZ oder Ort)? */
export const abfragbar = (a: Anschrift) => !!a.strasse.trim() && !!(a.plz.trim() || a.ort.trim());

/** Muss für diese Stammdaten (neu) abgefragt werden? */
export const koordinatenVeraltet = (m: ProjectMeta) => abfragbar(m.adresse) && m.koordinaten?.adresse !== adresseSchluessel(m.adresse);

/** Koordinaten für QGIS kopieren: „Ost, Nord“ mit Punkt als Dezimalzeichen, dazu das Bezugssystem */
export const koordinatenFuerQgis = (k: Pick<Koordinaten, 'ost' | 'nord'>) => `${k.ost.toFixed(2)}, ${k.nord.toFixed(2)}`;

const heute = () => new Date().toISOString().slice(0, 10);

/** Abfrage beim Dienst; null, wenn nichts gefunden wurde. Wirft bei Netz- oder Dienstfehlern. */
export async function koordinatenAbfragen(a: Anschrift, signal?: AbortSignal): Promise<Koordinaten | null> {
  if (!abruf) throw new Error('Die Abfrage ist hier nicht verfügbar.');
  const p = new URLSearchParams({ format: 'jsonv2', limit: '1', countrycodes: 'de', 'accept-language': 'de', street: a.strasse.trim() });
  if (a.plz.trim()) p.set('postalcode', a.plz.trim());
  if (a.ort.trim()) p.set('city', a.ort.trim());
  const antwort = await abruf(`${GEOKODIERER}?${p}`, { signal, headers: { Accept: 'application/json' } });
  if (!antwort.ok) throw new Error(`Der Dienst antwortet mit ${antwort.status}.`);
  const liste = (await antwort.json()) as { lat?: string; lon?: string; place_rank?: number }[];
  const t = Array.isArray(liste) ? liste[0] : undefined;
  const lat = Number(t?.lat);
  const lon = Number(t?.lon);
  if (!t || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const u = nachUtm32(lat, lon);
  const rang = t.place_rank ?? 0;
  return {
    epsg: 25832,
    ost: Math.round(u.ost * 100) / 100,
    nord: Math.round(u.nord * 100) / 100,
    lat,
    lon,
    adresse: adresseSchluessel(a),
    quelle: QUELLE,
    stand: heute(),
    genauigkeit: rang >= 30 ? 'adresse' : rang >= 26 ? 'strasse' : 'ort',
  };
}

/**
 * Stammdaten mit Koordinaten zur aktuellen Adresse: fragt nur, wenn die Adresse abfragbar ist und sich seit der
 * letzten Abfrage geändert hat. Findet der Dienst nichts oder ist er nicht erreichbar, entfallen veraltete
 * Koordinaten (eine alte Lage zur neuen Adresse wäre irreführend); `hinweis` sagt dann, warum.
 */
export async function mitKoordinaten(m: ProjectMeta, zeitlimit = 8000): Promise<{ meta: ProjectMeta; hinweis?: string }> {
  if (!koordinatenVeraltet(m) || !abruf) return { meta: m };
  const ab = typeof AbortController === 'function' ? new AbortController() : null;
  const uhr = ab ? setTimeout(() => ab.abort(), zeitlimit) : null;
  const ohne = (): ProjectMeta => {
    const x = { ...m };
    delete x.koordinaten;
    return x;
  };
  try {
    const k = await koordinatenAbfragen(m.adresse, ab?.signal);
    if (!k) return { meta: ohne(), hinweis: `Zur Adresse „${adresseSchluessel(m.adresse)}“ wurden keine Koordinaten gefunden.` };
    log.info(`Koordinaten: ${k.adresse} → ${koordinatenFuerQgis(k)} (EPSG:25832, ${k.genauigkeit})`);
    return { meta: { ...m, koordinaten: k } };
  } catch (e) {
    log.warn(`Koordinaten nicht ermittelt: ${e instanceof Error ? e.message : String(e)}`);
    return { meta: ohne(), hinweis: 'Die Koordinaten ließen sich nicht abfragen (keine Verbindung zum Dienst) – später über „Koordinaten abfragen“ erneut versuchen.' };
  } finally {
    if (uhr) clearTimeout(uhr);
  }
}
