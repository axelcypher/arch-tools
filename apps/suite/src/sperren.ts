import { isTauri } from '@core/platform/files';
import { logger } from '@core/platform/log';

const log = logger('rahmen');

/**
 * Formulare hält für jedes geöffnete Formular eine Sperrdatei (für FORMA und die Kollegen). Das Programm gibt sie
 * sonst erst beim Beenden frei – im Rahmen also auch dann, wenn die App zu ist oder umzieht (Tab ↔ Fenster).
 */
export async function sperrenFreigeben(id: string) {
  if (id !== 'formulare' || !isTauri()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('rahmen_formulare_freigeben');
  } catch (e) {
    log.warn('Sperrdateien der Formulare nicht freigegeben', e);
  }
}
