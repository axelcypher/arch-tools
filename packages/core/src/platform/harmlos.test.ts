import { describe, expect, it } from 'vitest';
import { harmloseMeldung, mitHarmlosenMeldungen } from './harmlos';
import { getEntries } from './log';

describe('harmlose Meldungen (F-08)', () => {
  it('Rückfall-Meldung von web-ifc ist harmlos, echte Fehler nicht', () => {
    expect(harmloseMeldung('wasm streaming compile failed: TypeError: Incorrect response MIME type')).toBe(true);
    expect(harmloseMeldung('falling back to ArrayBuffer instantiation')).toBe(true);
    expect(harmloseMeldung('Unbehandelter Fehler: x is undefined')).toBe(false);
  });

  it('während des Ladens: harmlose Meldung geht nicht an console.warn (zählt nicht als Warnung), andere schon', async () => {
    const orig = console.warn;
    const gesehen: string[] = [];
    console.warn = (...a: unknown[]) => void gesehen.push(String(a[0]));
    try {
      await mitHarmlosenMeldungen(async () => {
        console.warn('wasm streaming compile failed: TypeError');
        console.warn('echte Warnung');
      });
      expect(gesehen).toEqual(['echte Warnung']);
    } finally {
      console.warn = orig;
    }
    expect(getEntries().some((e) => e.level === 'info' && e.message.includes('wasm streaming'))).toBe(true);
  });
});
