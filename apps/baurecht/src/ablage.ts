/**
 * Ablage des Rechtsstands (geholte Fassungen) und des nachgeladenen Regelpakets: in der Desktop-App im gemeinsamen
 * Konfigurationsordner unter `baurecht/` (für alle Projekte und Apps des Büros gleich), im Browser nur im
 * Arbeitsspeicher.
 */

import { isTauri } from '@core/platform/files';
import { konfigOrt } from '@core/platform/konfig';
import { verbinde } from '@core/platform/projektordner';
import type { RechtSpeicher } from '@core/recht/rechtsstand';
import { speicherImArbeitsspeicher } from '@core/recht/rechtsstand';

async function invoke<T>(befehl: string, args: Record<string, unknown>): Promise<T> {
  const api = await import('@tauri-apps/api/core');
  return api.invoke<T>(befehl, args);
}

/** Pfad einer Datei der Ablage (Schlüssel „recht/bauo-nrw/verzeichnis“ → …/baurecht/recht/bauo-nrw/verzeichnis.json) */
async function pfad(schluessel: string, endung = 'json'): Promise<string> {
  const o = await konfigOrt();
  if (!o) throw new Error('Kein Konfigurationsordner');
  return verbinde(o.ordner, `baurecht/${schluessel}.${endung}`);
}

/** Ablage im Konfigurationsordner (Desktop) */
export const konfigAblage: RechtSpeicher = {
  async lesen(schluessel) {
    const t = await invoke<string | null>('baurecht_ablage_lesen', { pfad: await pfad(schluessel) });
    if (t == null) return null;
    try {
      return JSON.parse(t) as unknown;
    } catch {
      return null;
    }
  },
  async schreiben(schluessel, wert) {
    await invoke<void>('baurecht_ablage_schreiben', { pfad: await pfad(schluessel), inhalt: JSON.stringify(wert) });
  },
};

/** Ablage je nach Umgebung */
export const ablage: RechtSpeicher = isTauri() ? konfigAblage : speicherImArbeitsspeicher();

/** Text einer Datei der Ablage (Signatur des Regelpakets) */
export async function ablageTextLesen(schluessel: string, endung: string): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string | null>('baurecht_ablage_lesen', { pfad: await pfad(schluessel, endung) });
}

export async function ablageTextSchreiben(schluessel: string, endung: string, inhalt: string): Promise<void> {
  if (!isTauri()) return;
  await invoke<void>('baurecht_ablage_schreiben', { pfad: await pfad(schluessel, endung), inhalt });
}
