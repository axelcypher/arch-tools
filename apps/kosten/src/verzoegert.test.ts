import { afterEach, describe, expect, it, vi } from 'vitest';
import { verzoegertSchreiben } from './verzoegert';

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

  it('ohne ausstehende Änderung schreibt sichern() nichts; ein Fehler beim Schreiben blockiert nicht', async () => {
    const f = vi.fn().mockRejectedValueOnce(new Error('voll')).mockResolvedValue(undefined);
    const z = verzoegertSchreiben(f, 600);
    await z.sichern();
    expect(f).not.toHaveBeenCalled();
    z.anstossen();
    await z.sichern(); // Fehler wird geschluckt
    z.anstossen();
    await z.sichern();
    expect(f).toHaveBeenCalledTimes(2);
  });
});
