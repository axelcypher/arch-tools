// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/*
 * Zwischenstand vor dem Schließen (Arkly, vorDemSchliessen): ein ausstehendes, verzögertes Schreiben in IndexedDB wird
 * sofort ausgeführt und abgewartet – mehrfach aufgerufen, ohne doppelt zu schreiben.
 * IndexedDB ist hier ein kleiner Nachbau: jedes put wird gezählt und erst nach einem Takt abgeschlossen.
 */

const puts: unknown[] = [];
let abschliessen: (() => void)[] = [];

function fakeIndexedDb() {
  const store = {
    put(value: unknown) {
      puts.push(value);
    },
    get() {
      const req: { result: unknown; onsuccess?: () => void } = { result: undefined };
      setTimeout(() => req.onsuccess?.());
      return req;
    },
  };
  const db = {
    transaction() {
      const tx: { oncomplete?: () => void; onerror?: () => void; objectStore: () => typeof store } = { objectStore: () => store };
      // Abschluss erst, wenn der Test es erlaubt – so lässt sich „Schreiben läuft noch“ prüfen
      abschliessen.push(() => tx.oncomplete?.());
      return tx;
    },
  };
  return {
    open() {
      const req: { result: typeof db; onsuccess?: () => void; onupgradeneeded?: () => void } = { result: db };
      setTimeout(() => req.onsuccess?.());
      return req;
    },
  };
}

const takt = () => new Promise((r) => setTimeout(r, 0));
async function alleAbschliessen() {
  for (let i = 0; i < 5; i++) {
    await takt();
    const offen = abschliessen;
    abschliessen = [];
    offen.forEach((f) => f());
  }
}

let mod: typeof import('./store');
let rahmen: typeof import('@core/platform/rahmen');

beforeAll(async () => {
  vi.stubGlobal('indexedDB', fakeIndexedDb());
  vi.useFakeTimers({ toFake: ['Date'] });
  mod = await import('./store');
  rahmen = await import('@core/platform/rahmen');
  await alleAbschliessen(); // Lesen beim Start
});
afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('QUADRIO: Zwischenstand vor dem Schließen (vorDemSchliessen)', () => {
  it('ausstehendes Zwischenspeichern läuft sofort; ein zweiter Aufruf schreibt nicht doppelt und wartet auf dasselbe Schreiben', async () => {
    const { useEditor } = mod;
    puts.length = 0;
    useEditor.getState().update((p) => ({ ...p, name: 'Vor dem Schließen' }));
    // Gegenprobe: ohne Schließen wird noch nicht geschrieben (600 ms Verzögerung)
    await takt();
    expect(puts).toHaveLength(0);

    let fertig = false;
    const vorbereitet = rahmen.schliessenVorbereiten(5000).then((ok) => ((fertig = true), ok));
    const zweiter = mod.zwischenstandSichern();
    await takt();
    await takt();
    expect(puts).toHaveLength(1); // sofort geschrieben, genau einmal
    expect((puts[0] as { project: { name: string } }).project.name).toBe('Vor dem Schließen');
    expect(fertig).toBe(false); // wartet, bis das Schreiben abgeschlossen ist

    await alleAbschliessen();
    expect(await vorbereitet).toBe(true);
    await zweiter;
    expect(puts).toHaveLength(1);

    // ohne neue Änderung: nichts zu tun, kein weiteres Schreiben
    await mod.zwischenstandSichern();
    expect(puts).toHaveLength(1);
  });
});
