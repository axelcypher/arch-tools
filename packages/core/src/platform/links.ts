import { isTauri } from './files';
import { logger } from './log';

const log = logger('links');

/** Externen Link im Standardbrowser öffnen (Desktop über das Opener-Plugin, im Browser in einem neuen Tab) */
export async function externOeffnen(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return;
  try {
    if (isTauri()) {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
    } else window.open(url, '_blank', 'noopener,noreferrer');
  } catch (e) {
    log.error(`Link konnte nicht geöffnet werden: ${url}`, e);
  }
}
