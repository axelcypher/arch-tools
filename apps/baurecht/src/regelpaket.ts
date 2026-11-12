/**
 * Regelpaket der App: mitgeliefert (Stand des Builds, aus packages/baurecht-regeln) oder nachgeladen aus dem
 * Release „regeln“ – nur mit gültiger Signatur (Ed25519) und nur, wenn jede Datei zu ihrer SHA-256 im Index passt.
 * Danach gibt die App die Hosts frei, die die Module brauchen (Tauri: netz_hosts_erweitern).
 */

import type { Paket, PaketIndex } from '@core/baurecht/paket';
import { dateiPasst, PAKET_FORMAT, paketAusDateien, signaturPruefen } from '@core/baurecht/paket';
import { isTauri } from '@core/platform/files';
import { logger } from '@core/platform/log';
import { alsText, holen, holenOk } from '@core/recht/netz';
import oeffentlicherSchluessel from '@regeln/schluessel/regeln.pub?raw';
import paketInfo from '@regeln/package.json';
import { ablage, ablageTextLesen, ablageTextSchreiben } from './ablage';

const log = logger('regelpaket');

/** Adresse des Release „regeln“ (Index, Signatur, Dateien) */
export const PAKET_ADRESSE = 'https://github.com/axelcypher/arch-tools/releases/download/regeln';

const dateien = import.meta.glob(['../../../packages/baurecht-regeln/module/**/*.json', '../../../packages/baurecht-regeln/texte/**/*.json'], { eager: true, import: 'default' });

/** Das mitgelieferte Paket */
export const mitgeliefert: Paket = paketAusDateien(dateien, paketInfo.version, 'mitgeliefert');

/** Paketversionen vergleichen („2026.11.12-1“): größer = neuer */
export function neuer(a: string, b: string): boolean {
  const teile = (v: string) => v.split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  const [x, y] = [teile(a), teile(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}

const schluessel = oeffentlicherSchluessel.split('\n').filter((z) => z.trim() && !z.startsWith('#')).join('').trim();

export interface Nachladen {
  paket: Paket | null;
  meldung: string;
}

async function hostsFreigeben(hosts: string[]) {
  if (!isTauri() || !hosts.length) return;
  const api = await import('@tauri-apps/api/core');
  await api.invoke('netz_hosts_erweitern', { hosts });
}

/** zuletzt nachgeladenes Paket aus der Ablage (ohne Netz) */
export async function abgelegtesPaket(): Promise<Paket | null> {
  if (!isTauri() || !schluessel) return null;
  try {
    const indexText = await ablageTextLesen('regeln/index', 'json');
    const sig = await ablageTextLesen('regeln/index', 'sig');
    if (!indexText || !sig || !(await signaturPruefen(new TextEncoder().encode(indexText), sig, schluessel))) return null;
    const index = JSON.parse(indexText) as PaketIndex;
    if (index.format !== PAKET_FORMAT || !neuer(index.paket, mitgeliefert.version)) return null;
    const inhalt: Record<string, unknown> = {};
    for (const p of Object.keys(index.dateien)) inhalt[p] = await ablage.lesen(`regeln/${p.replace(/\.json$/, '')}`);
    await hostsFreigeben(index.hosts);
    return paketAusDateien(inhalt, index.paket, 'nachgeladen');
  } catch (e) {
    log.warn('Abgelegtes Regelpaket nicht lesbar', { fehler: String(e) });
    return null;
  }
}

/**
 * Neueres Regelpaket aus dem Release holen. Ohne öffentlichen Schlüssel (noch nicht eingerichtet) oder ohne gültige
 * Signatur bleibt das bisherige Paket.
 */
export async function paketNachladen(aktuell: Paket): Promise<Nachladen> {
  if (!isTauri()) return { paket: null, meldung: 'Web-Version: Regelpaket des Builds' };
  if (!schluessel) return { paket: null, meldung: 'Nachladen nicht eingerichtet (öffentlicher Schlüssel fehlt) – Regelpaket des Builds' };
  try {
    const indexAntwort = await holenOk(holen, `${PAKET_ADRESSE}/index.json`);
    const sigAntwort = await holenOk(holen, `${PAKET_ADRESSE}/index.json.sig`);
    const indexText = alsText(indexAntwort);
    const sig = alsText(sigAntwort).trim();
    if (!(await signaturPruefen(new TextEncoder().encode(indexText), sig, schluessel))) return { paket: null, meldung: 'Regelpaket: Signatur ungültig – nicht übernommen' };
    const index = JSON.parse(indexText) as PaketIndex;
    if (index.format !== PAKET_FORMAT) return { paket: null, meldung: `Regelpaket ${index.paket} braucht eine neuere App-Version` };
    if (!neuer(index.paket, aktuell.version)) return { paket: null, meldung: `Regelpaket aktuell (${aktuell.version})` };
    const inhalt: Record<string, unknown> = {};
    for (const [p] of Object.entries(index.dateien)) {
      const vorhanden = await ablage.lesen(`regeln/${p.replace(/\.json$/, '')}`);
      const bytes = vorhanden ? new TextEncoder().encode(JSON.stringify(vorhanden)) : null;
      if (vorhanden && bytes && (await dateiPasst(index, p, bytes))) {
        inhalt[p] = vorhanden;
        continue;
      }
      const r = await holenOk(holen, `${PAKET_ADRESSE}/${encodeURIComponent(p.replace(/\//g, '__'))}`);
      if (!(await dateiPasst(index, p, r.daten))) return { paket: null, meldung: `Regelpaket: ${p} passt nicht zum Index – nicht übernommen` };
      inhalt[p] = JSON.parse(new TextDecoder().decode(r.daten)) as unknown;
    }
    for (const [p, w] of Object.entries(inhalt)) await ablage.schreiben(`regeln/${p.replace(/\.json$/, '')}`, w);
    await ablageTextSchreiben('regeln/index', 'json', indexText);
    await ablageTextSchreiben('regeln/index', 'sig', sig);
    await hostsFreigeben(index.hosts);
    return { paket: paketAusDateien(inhalt, index.paket, 'nachgeladen'), meldung: `Regelpaket ${index.paket} übernommen` };
  } catch (e) {
    return { paket: null, meldung: `Regelpaket nicht nachgeladen: ${e instanceof Error ? e.message : String(e)}` };
  }
}
