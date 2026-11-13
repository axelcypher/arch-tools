// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/*
 * Zwischenstand vor dem Schließen (Arkly, vorDemSchliessen): ein ausstehendes, verzögertes Schreiben in IndexedDB wird
 * sofort ausgeführt und abgewartet – mehrfach aufgerufen, ohne doppelt zu schreiben.
 * IndexedDB ist hier ein kleiner Nachbau: jedes put wird gezählt und erst nach einem Takt abgeschlossen.
 */

const puts: unknown[] = [];
let abschliessen: (() => void)[] = [];
/** nächste Transaktion: normal abschließen, mit Fehler oder mit Abbruch (z. B. Speicherplatz voll) */
let ausgang: 'ok' | 'fehler' | 'abbruch' = 'ok';

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
      const tx: { error: DOMException | null; oncomplete?: () => void; onerror?: () => void; onabort?: () => void; objectStore: () => typeof store } = {
        error: null,
        objectStore: () => store,
      };
      const art = ausgang;
      ausgang = 'ok';
      // Abschluss erst, wenn der Test es erlaubt – so lässt sich „Schreiben läuft noch“ prüfen
      abschliessen.push(() => {
        if (art === 'ok') tx.oncomplete?.();
        else if (art === 'fehler') {
          tx.error = new DOMException('kaputt', 'UnknownError');
          tx.onerror?.();
        } else tx.onabort?.(); // Abbruch ohne error-Ereignis
      });
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
  mod = await import('./store');
  rahmen = await import('@core/platform/rahmen');
  await alleAbschliessen(); // Lesen beim Start
});
afterAll(() => vi.unstubAllGlobals());

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

  it('Änderung während eines laufenden Schreibens: zweites Schreiben erst danach, mit dem neuen Stand; wartet auf beide', async () => {
    const { useEditor } = mod;
    puts.length = 0;
    useEditor.getState().update((p) => ({ ...p, name: 'Erster Stand' }));
    const erstes = mod.zwischenstandSichern();
    await takt();
    await takt();
    expect(puts).toHaveLength(1); // läuft, noch nicht abgeschlossen

    useEditor.getState().update((p) => ({ ...p, name: 'Zweiter Stand' }));
    let fertig = false;
    const zweites = mod.zwischenstandSichern().then(() => void (fertig = true));
    await takt();
    await takt();
    expect(puts).toHaveLength(1); // wartet, bis das erste abgeschlossen ist – Reihenfolge bleibt
    expect(fertig).toBe(false);

    await alleAbschliessen();
    await Promise.all([erstes, zweites]);
    expect(puts.map((x) => (x as { project: { name: string } }).project.name)).toEqual(['Erster Stand', 'Zweiter Stand']);
  });

  it.each(['fehler', 'abbruch'] as const)('Schreiben scheitert (%s): Schließen wartet nicht ewig, späteres Zwischenspeichern läuft wieder', async (art) => {
    const { useEditor } = mod;
    puts.length = 0;
    ausgang = art;
    useEditor.getState().update((p) => ({ ...p, name: `Scheitert (${art})` }));
    const vorbereitet = rahmen.schliessenVorbereiten(5000);
    await alleAbschliessen();
    expect(await vorbereitet).toBe(true); // erledigt (Fehler ist protokolliert), kein Hängen bis zum Zeitlimit

    useEditor.getState().update((p) => ({ ...p, name: `Danach (${art})` }));
    const danach = mod.zwischenstandSichern();
    await alleAbschliessen();
    await danach;
    expect(puts).toHaveLength(2);
    expect((puts[1] as { project: { name: string } }).project.name).toBe(`Danach (${art})`);
  });
});
