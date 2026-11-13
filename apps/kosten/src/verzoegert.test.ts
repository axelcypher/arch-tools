import { afterEach, describe, expect, it, vi } from 'vitest';
import { inStoreSchreiben, verzoegertSchreiben } from './verzoegert';

afterEach(() => vi.useRealTimers());

/** Schreiber, dessen Aufrufe von außen beendet werden */
function schreiber() {
  const offen: (() => void)[] = [];
  const f = vi.fn(() => new Promise<void>((fertig) => offen.push(fertig)));
  return { f, fertig: () => offen.shift()?.() };
}

describe('Zwischenstand: verzögertes Schreiben und Sichern vor dem Schließen', () => {
  it('schreibt erst nach der Wartezeit, weitere Änderungen schieben es hinaus', async () => {
    vi.useFakeTimers();
    const s = schreiber();
    const z = verzoegertSchreiben(s.f, 600);
    z.anstossen();
    vi.advanceTimersByTime(400);
    z.anstossen();
    vi.advanceTimersByTime(400);
    expect(s.f).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(s.f).toHaveBeenCalledTimes(1);
  });

  it('sichern() schreibt Ausstehendes sofort und wartet darauf; mehrfach aufgerufen schreibt es nicht doppelt', async () => {
    vi.useFakeTimers();
    const s = schreiber();
    const z = verzoegertSchreiben(s.f, 600);
    z.anstossen();
    let fertig1 = false;
    let fertig2 = false;
    void z.sichern().then(() => (fertig1 = true));
    void z.sichern().then(() => (fertig2 = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(s.f).toHaveBeenCalledTimes(1);
    expect([fertig1, fertig2]).toEqual([false, false]);
    s.fertig();
    await vi.advanceTimersByTimeAsync(0);
    expect([fertig1, fertig2]).toEqual([true, true]);
    // der Timer ist abgelöst: nach Ablauf der Wartezeit kein zweites Schreiben
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.f).toHaveBeenCalledTimes(1);
  });

  it('Änderung während eines laufenden Schreibens: das zweite Schreiben folgt erst danach, sichern() wartet auf beide', async () => {
    vi.useFakeTimers();
    const s = schreiber();
    const z = verzoegertSchreiben(s.f, 600);
    z.anstossen();
    await vi.advanceTimersByTimeAsync(600); // erstes Schreiben läuft
    expect(s.f).toHaveBeenCalledTimes(1);
    z.anstossen();
    let fertig = false;
    void z.sichern().then(() => (fertig = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(s.f).toHaveBeenCalledTimes(1); // nicht gleichzeitig
    s.fertig();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.f).toHaveBeenCalledTimes(2);
    expect(fertig).toBe(false);
    s.fertig();
    await vi.advanceTimersByTimeAsync(0);
    expect(fertig).toBe(true);
  });

  it('ohne ausstehende Änderung schreibt sichern() nichts und meldet true', async () => {
    const f = vi.fn().mockResolvedValue(undefined);
    const z = verzoegertSchreiben(f, 600);
    expect(await z.sichern()).toBe(true);
    expect(f).not.toHaveBeenCalled();
    z.anstossen();
    expect(await z.sichern()).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('gescheitertes Schreiben: protokolliert, sichern() meldet false, das nächste sichern() schreibt erneut', async () => {
    const fehler = new Error('voll');
    const f = vi.fn().mockRejectedValueOnce(fehler).mockResolvedValue(undefined);
    const beiFehler = vi.fn();
    const z = verzoegertSchreiben(f, 600, beiFehler);
    z.anstossen();
    expect(await z.sichern()).toBe(false);
    expect(beiFehler).toHaveBeenCalledWith(fehler);
    // „Erneut versuchen“ in Arkly: ohne neue Änderung wird erneut geschrieben, diesmal mit Erfolg
    expect(await z.sichern()).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
    // Gegenprobe: danach ist nichts mehr ausstehend
    expect(await z.sichern()).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
    expect(beiFehler).toHaveBeenCalledTimes(1);
  });

  it('scheitert das Schreiben im Hintergrund, holt das Schließen es nach', async () => {
    vi.useFakeTimers();
    const f = vi.fn().mockRejectedValueOnce(new Error('blockiert')).mockResolvedValue(undefined);
    const z = verzoegertSchreiben(f, 600);
    z.anstossen();
    await vi.advanceTimersByTimeAsync(600);
    expect(f).toHaveBeenCalledTimes(1);
    expect(await z.sichern()).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
  });
});

/** gefälschte IndexedDB-Verbindung: die Transaktion endet, wie der Test es vorgibt */
function falscheDb(ende: 'complete' | 'error' | 'abbruch' | 'werfen') {
  const geschrieben: unknown[] = [];
  // eigene Form statt IDBTransaction: dort sind die Handler nullbar und erwarten ein Ereignis
  const tx: { error: DOMException | null; objectStore: () => { put: (w: unknown) => void }; oncomplete: () => void; onerror: () => void; onabort: () => void } = {
    error: null,
    objectStore: () => ({ put: (w: unknown) => void geschrieben.push(w) }),
    oncomplete: () => undefined,
    onerror: () => undefined,
    onabort: () => undefined,
  };
  const d = {
    close: vi.fn(),
    transaction: () => {
      if (ende === 'werfen') throw new DOMException('nicht klonbar', 'DataCloneError');
      queueMicrotask(() => {
        if (ende === 'complete') tx.oncomplete();
        else if (ende === 'abbruch')
          tx.onabort(); // Abbruch ohne Fehler (tx.error bleibt null)
        else {
          tx.error = new DOMException('voll', 'QuotaExceededError');
          tx.onerror(); // bei einem Fehler feuern beide
          tx.onabort();
        }
      });
      return tx;
    },
  };
  return { d: d as unknown as IDBDatabase & { close: ReturnType<typeof vi.fn> }, geschrieben };
}

describe('Zwischenstand: Schreiben in die IndexedDB', () => {
  it('wartet auf das Ende der Transaktion und schließt die Verbindung', async () => {
    const { d, geschrieben } = falscheDb('complete');
    await inStoreSchreiben(d, 'autosave', 'k', () => ({ a: 1 }));
    expect(geschrieben).toEqual([{ a: 1 }]);
    expect(d.close).toHaveBeenCalledTimes(1);
  });

  it('Fehler und Abbruch: abgelehnt mit dem Fehler der Transaktion, Verbindung genau einmal geschlossen', async () => {
    const { d } = falscheDb('error');
    await expect(inStoreSchreiben(d, 'autosave', 'k', () => ({}))).rejects.toMatchObject({ name: 'QuotaExceededError' });
    expect(d.close).toHaveBeenCalledTimes(1);
  });

  it('Abbruch ohne Fehler: abgelehnt mit Ersatzmeldung', async () => {
    const { d } = falscheDb('abbruch');
    await expect(inStoreSchreiben(d, 'autosave', 'k', () => ({}))).rejects.toThrow('Transaktion abgebrochen');
    expect(d.close).toHaveBeenCalledTimes(1);
  });

  it('Ausnahme beim Anlegen der Transaktion: abgelehnt, Verbindung geschlossen', async () => {
    const { d } = falscheDb('werfen');
    await expect(inStoreSchreiben(d, 'autosave', 'k', () => ({}))).rejects.toMatchObject({ name: 'DataCloneError' });
    expect(d.close).toHaveBeenCalledTimes(1);
  });
});
