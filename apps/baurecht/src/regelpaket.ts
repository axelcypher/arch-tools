/**
 * Regelpaket der App: mitgeliefert (Stand des Builds, aus packages/baurecht-regeln) oder nachgeladen aus dem
 * Release „regeln“ – nur mit gültiger Signatur (Ed25519) und nur, wenn jede Datei zu ihrer SHA-256 im Index passt.
 * Danach gibt die App die Hosts frei, die die Module brauchen (Tauri: netz_hosts_erweitern).
 */

import type { Paket } from '@core/baurecht/paket';
import { indexLesen, paketAusDateien, paketNeuer, signiertesPaket } from '@core/baurecht/paket';
import { VORGABE_MERKMALE } from '@core/bedingung';
import { isTauri } from '@core/platform/files';
import { logger } from '@core/platform/log';
import { alsText, holen, holenOk } from '@core/recht/netz';
import { sha256 } from '@core/recht/text';
import oeffentlicherSchluessel from '@regeln/schluessel/regeln.pub?raw';
import paketInfo from '@regeln/package.json';
import { ablage, ablageTextLesen, ablageTextSchreiben } from './ablage';

const log = logger('regelpaket');

/** Adresse des Release „regeln“ (Index, Signatur, Dateien) */
export const PAKET_ADRESSE = 'https://github.com/axelcypher/arch-tools/releases/download/regeln';

const dateien = import.meta.glob(['../../../packages/baurecht-regeln/module/**/*.json', '../../../packages/baurecht-regeln/texte/**/*.json'], { eager: true, import: 'default' });

/** Das mitgelieferte Paket */
export const mitgeliefert: Paket = paketAusDateien(dateien, paketInfo.version, 'mitgeliefert');

/** öffentlicher Schlüssel (Base64, 32 Byte) aus packages/baurecht-regeln/schluessel/regeln.pub; leer = nicht eingerichtet */
export const schluessel = oeffentlicherSchluessel.split('\n').filter((z) => z.trim() && !z.startsWith('#')).join('').trim();

export interface Nachladen {
  paket: Paket | null;
  meldung: string;
}

/** Hosts des Pakets freigeben – die Tauri-Hülle prüft die Signatur des Index selbst noch einmal */
async function hostsFreigeben(indexText: string, signatur: string) {
  if (!isTauri()) return;
  const api = await import('@tauri-apps/api/core');
  await api.invoke('netz_hosts_erweitern', { index: indexText, signatur });
}

const schluesselDatei = (p: string) => `regeln/${p.replace(/\.json$/, '')}`;

/** Datei der Ablage als Bytes, wie sie im Index steht (kompaktes JSON) */
async function ausAblage(p: string): Promise<Uint8Array | null> {
  const w = await ablage.lesen(schluesselDatei(p));
  return w == null ? null : new TextEncoder().encode(JSON.stringify(w));
}

/** zuletzt nachgeladenes Paket aus der Ablage (ohne Netz) – nur, wenn Signatur und jede Datei passen */
export async function abgelegtesPaket(aktuell: Paket = mitgeliefert): Promise<Paket | null> {
  if (!isTauri() || !schluessel) return null;
  try {
    const indexText = await ablageTextLesen('regeln/index', 'json');
    const signatur = await ablageTextLesen('regeln/index', 'sig');
    if (!indexText || !signatur) return null;
    const r = await signiertesPaket({ indexText, signatur, schluessel, datei: ausAblage, merkmale: VORGABE_MERKMALE });
    if ('fehler' in r) {
      log.warn('Abgelegtes Regelpaket verworfen', { fehler: r.fehler });
      return null;
    }
    if (!paketNeuer(r.index.paket, aktuell.version)) return null;
    await hostsFreigeben(indexText, signatur);
    return r.paket;
  } catch (e) {
    log.warn('Abgelegtes Regelpaket nicht lesbar', { fehler: String(e) });
    return null;
  }
}

/**
 * Neueres Regelpaket aus dem Release holen. Ohne öffentlichen Schlüssel (noch nicht eingerichtet), ohne gültige
 * Signatur, mit einer Datei, die nicht zum Index passt, oder mit Regeln, die diese App-Version nicht kennt, bleibt das
 * bisherige Paket. Erst ein vollständig geprüftes Paket wird abgelegt.
 */
export async function paketNachladen(aktuell: Paket): Promise<Nachladen> {
  if (!isTauri()) return { paket: null, meldung: 'Web-Version: Regelpaket des Builds' };
  if (!schluessel) return { paket: null, meldung: 'Nachladen nicht eingerichtet (öffentlicher Schlüssel fehlt) – Regelpaket des Builds' };
  try {
    const indexText = alsText(await holenOk(holen, `${PAKET_ADRESSE}/index.json`));
    const signatur = alsText(await holenOk(holen, `${PAKET_ADRESSE}/index.json.sig`)).trim();
    // ungeprüft nur, um nichts zu laden, wenn das Release nicht neuer ist – übernommen wird erst nach der Prüfung
    const vorab = indexLesen(indexText);
    if (typeof vorab !== 'string' && !paketNeuer(vorab.paket, aktuell.version)) return { paket: null, meldung: `Regelpaket aktuell (${aktuell.version})` };
    const geholt: Record<string, Uint8Array> = {};
    const r = await signiertesPaket({
      indexText,
      signatur,
      schluessel,
      merkmale: VORGABE_MERKMALE,
      // erst die Ablage (unverändert seit dem letzten Paket?), sonst aus dem Release – geprüft wird beides gleich
      datei: async (p) => {
        const soll = typeof vorab === 'string' ? undefined : vorab.dateien[p];
        const vorhanden = await ausAblage(p);
        if (vorhanden && soll && vorhanden.length === soll.groesse && (await sha256(vorhanden)) === soll.sha256) return vorhanden;
        const d = (await holenOk(holen, `${PAKET_ADRESSE}/${encodeURIComponent(p.replace(/\//g, '__'))}`)).daten;
        geholt[p] = d;
        return d;
      },
    });
    if ('fehler' in r) return { paket: null, meldung: `Regelpaket nicht übernommen: ${r.fehler}` };
    if (!paketNeuer(r.index.paket, aktuell.version)) return { paket: null, meldung: `Regelpaket aktuell (${aktuell.version})` };
    for (const [p, d] of Object.entries(geholt)) await ablage.schreiben(schluesselDatei(p), JSON.parse(new TextDecoder().decode(d)) as unknown);
    await ablageTextSchreiben('regeln/index', 'json', indexText);
    await ablageTextSchreiben('regeln/index', 'sig', signatur);
    await hostsFreigeben(indexText, signatur);
    return { paket: r.paket, meldung: `Regelpaket ${r.index.paket} übernommen` };
  } catch (e) {
    return { paket: null, meldung: `Regelpaket nicht nachgeladen: ${e instanceof Error ? e.message : String(e)}` };
  }
}
