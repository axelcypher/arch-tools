// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearLog, getEntries } from '@core/platform/log';
import { useEditor, zwischenstandSichern } from './store';

/*
 * Ohne IndexedDB (Testumgebung, sehr eingeschränkte Browser) plant eine Änderung kein Zwischenspeichern: sonst
 * schrieb der Zeitgeber 600 ms später eine Warnung auf die Konsole – nach Testende brach das den Testlauf ab
 * („Closing rpc while onUserConsoleLog was pending“, Windows).
 */
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('QUADRIO: Zwischenspeichern ohne IndexedDB', () => {
  it('Änderung ohne IndexedDB: kein verzögertes Schreiben, keine Warnung im Protokoll; vor dem Schließen nichts offen', async () => {
    expect(typeof indexedDB).toBe('undefined');
    vi.useFakeTimers();
    clearLog();
    useEditor.getState().update((p) => ({ ...p, name: 'Ohne IndexedDB' }));
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(getEntries().filter((e) => e.level === 'warn')).toHaveLength(0);
    expect(await zwischenstandSichern()).toBe(true);
  });

  // Gegenprobe – bleibt der letzte Test der Datei: der gelöschte Zeitgeber bleibt im Modul vermerkt
  it('Gegenprobe: mit IndexedDB plant dieselbe Änderung das Zwischenspeichern', () => {
    vi.useFakeTimers();
    vi.stubGlobal('indexedDB', {});
    useEditor.getState().update((p) => ({ ...p, name: 'Mit IndexedDB' }));
    expect(vi.getTimerCount()).toBe(1);
  });
});
