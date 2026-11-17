// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEditor, zwischenstandSichern } from './store';

/*
 * Ohne IndexedDB (Testumgebung, sehr eingeschränkte Browser) plant eine Änderung kein Zwischenspeichern: sonst
 * schrieb der Zeitgeber 600 ms später einen Fehler auf die Konsole – nach Testende brach das den Testlauf ab
 * („Closing rpc while onUserConsoleLog was pending“, Windows).
 */
afterEach(() => vi.useRealTimers());

describe('QUADRIO: Zwischenspeichern ohne IndexedDB', () => {
  it('Änderung ohne IndexedDB: kein verzögertes Schreiben, keine Warnung; vor dem Schließen gilt der Stand als gesichert', async () => {
    expect(typeof indexedDB).toBe('undefined');
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn');
    useEditor.getState().update((p) => ({ ...p, name: 'Ohne IndexedDB' }));
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(2000);
    expect(warn).not.toHaveBeenCalled();
    expect(await zwischenstandSichern()).toBe(true);
    warn.mockRestore();
  });

  it('Gegenprobe: mit IndexedDB plant dieselbe Änderung das Zwischenspeichern', () => {
    vi.useFakeTimers();
    vi.stubGlobal('indexedDB', {});
    try {
      useEditor.getState().update((p) => ({ ...p, name: 'Mit IndexedDB' }));
      expect(vi.getTimerCount()).toBe(1);
    } finally {
      vi.clearAllTimers();
      vi.unstubAllGlobals();
    }
  });
});
