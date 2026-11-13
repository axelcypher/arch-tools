import { isTauri } from '@core/platform/files';
import type { DateiStand } from '@core/platform/projektordner';

/**
 * Stand (Größe, Änderungszeit) einer Datei auf dem Desktop, um beim Speichern zu erkennen, ob sie inzwischen von außen
 * geändert wurde. `null` = es gibt sie nicht; `undefined` = unbekannt (Browser oder Fehler) – dann wird nicht geprüft.
 */
export async function dateiStandLesen(pfad: string): Promise<DateiStand | null | undefined> {
  if (!isTauri()) return undefined;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<DateiStand | null>('datei_stand', { path: pfad });
  } catch {
    return undefined;
  }
}
