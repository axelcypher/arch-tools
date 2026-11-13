import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { schliessenVorbereiten, vorDemSchliessen } from '@core/platform/rahmen';
import { verzoegertesSchreiben } from './store';

describe('Zwischenstand: verzögertes Schreiben und vorDemSchliessen', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('schreibt 600 ms nach der letzten Änderung genau einmal (Gegenprobe: vorher nicht)', async () => {
    const schreiben = vi.fn(async () => undefined);
    const z = verzoegertesSchreiben(schreiben);
    z.planen();
    vi.advanceTimersByTime(400);
    z.planen();
    vi.advanceTimersByTime(599);
    expect(schreiben).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await z.jetzt();
    expect(schreiben).toHaveBeenCalledTimes(1);
  });

  it('jetzt: schreibt Ausstehendes sofort, wartet bis zum Ende, und der Timer schreibt danach nicht noch einmal', async () => {
    let fertig!: () => void;
    const schreiben = vi.fn(() => new Promise<void>((r) => (fertig = r)));
    const z = verzoegertesSchreiben(schreiben);
    z.planen();
    let erledigt = false;
    const warten = z.jetzt().then(() => (erledigt = true));
    await Promise.resolve();
    await Promise.resolve();
    expect(schreiben).toHaveBeenCalledTimes(1);
    expect(erledigt).toBe(false);
    // mehrfacher Aufruf (z. B. „Weiter warten“): kein zweites Schreiben, wartet auf das laufende
    const nochmal = z.jetzt();
    expect(schreiben).toHaveBeenCalledTimes(1);
    fertig();
    await warten;
    await nochmal;
    expect(erledigt).toBe(true);
    vi.advanceTimersByTime(1000);
    await z.jetzt();
    expect(schreiben).toHaveBeenCalledTimes(1);
  });

  it('nichts ausstehend: jetzt schreibt nicht; Änderung während des Schreibens wird danach geschrieben (neuester Stand zuletzt)', async () => {
    const reihenfolge: number[] = [];
    let n = 0;
    let fertig!: () => void;
    const schreiben = vi.fn(() => {
      const nr = ++n;
      return new Promise<void>((r) => (fertig = () => (reihenfolge.push(nr), r())));
    });
    const z = verzoegertesSchreiben(schreiben);
    await z.jetzt();
    expect(schreiben).not.toHaveBeenCalled();
    z.planen();
    const erstes = z.jetzt();
    await Promise.resolve();
    await Promise.resolve();
    z.planen();
    const zweites = z.jetzt();
    // das zweite Schreiben beginnt erst nach dem ersten
    expect(schreiben).toHaveBeenCalledTimes(1);
    fertig();
    await erstes;
    await Promise.resolve();
    await Promise.resolve();
    expect(schreiben).toHaveBeenCalledTimes(2);
    fertig();
    await zweites;
    expect(reihenfolge).toEqual([1, 2]);
  });

  it('Fehler beim Schreiben: jetzt liefert false, der Stand bleibt ausstehend und der nächste Aufruf schreibt neu (Gegenprobe: Erfolg → true)', async () => {
    const schreiben = vi.fn().mockRejectedValueOnce(new Error('voll')).mockResolvedValue(undefined);
    const z = verzoegertesSchreiben(schreiben);
    z.planen();
    await expect(z.jetzt()).resolves.toBe(false);
    // „Erneut versuchen“ ohne neue Änderung: schreibt noch einmal und meldet jetzt Erfolg
    await expect(z.jetzt()).resolves.toBe(true);
    expect(schreiben).toHaveBeenCalledTimes(2);
    // nichts mehr ausstehend: kein drittes Schreiben, weiterhin true
    await expect(z.jetzt()).resolves.toBe(true);
    expect(schreiben).toHaveBeenCalledTimes(2);
  });

  it('Rennen: das laufende Schreiben scheitert, während ein neueres schon angehängt ist – kein drittes Schreiben (Gegenprobe: das neuere meldet true)', async () => {
    const fertig: Array<{ ok: () => void; weg: (e: Error) => void }> = [];
    const schreiben = vi.fn(() => new Promise<void>((ok, weg) => fertig.push({ ok, weg })));
    const z = verzoegertesSchreiben(schreiben);
    z.planen();
    const a = z.jetzt();
    await Promise.resolve();
    z.planen();
    const b = z.jetzt();
    fertig[0].weg(new Error('voll'));
    await expect(a).resolves.toBe(false);
    await Promise.resolve();
    fertig[1].ok();
    await expect(b).resolves.toBe(true);
    await expect(z.jetzt()).resolves.toBe(true);
    expect(schreiben).toHaveBeenCalledTimes(2);
  });

  it('scheitert das Schreiben aus dem Timer, schreibt der nächste Aufruf (vor dem Schließen) neu und meldet „fertig“', async () => {
    const schreiben = vi.fn().mockRejectedValueOnce(new Error('voll')).mockResolvedValue(undefined);
    const z = verzoegertesSchreiben(schreiben);
    const abmelden = vorDemSchliessen(z.jetzt);
    try {
      z.planen();
      await vi.advanceTimersByTimeAsync(700);
      expect(schreiben).toHaveBeenCalledTimes(1);
      await expect(schliessenVorbereiten(1000)).resolves.toBe('fertig');
      expect(schreiben).toHaveBeenCalledTimes(2);
    } finally {
      abmelden();
    }
  });

  it('gescheitertes Schreiben vor dem Schließen: schliessenVorbereiten meldet „fehler“, nach erfolgreichem Wiederholen „fertig“', async () => {
    const schreiben = vi.fn().mockRejectedValueOnce(new Error('Laufwerk weg')).mockResolvedValue(undefined);
    const z = verzoegertesSchreiben(schreiben);
    const abmelden = vorDemSchliessen(z.jetzt);
    try {
      z.planen();
      await expect(schliessenVorbereiten(1000)).resolves.toBe('fehler');
      await expect(schliessenVorbereiten(1000)).resolves.toBe('fertig');
      expect(schreiben).toHaveBeenCalledTimes(2);
    } finally {
      abmelden();
    }
  });

  it('über vorDemSchliessen angemeldet: schliessenVorbereiten schreibt den ausstehenden Stand vor dem Schließen (Gegenprobe: abgemeldet nicht)', async () => {
    const schreiben = vi.fn(async () => undefined);
    const z = verzoegertesSchreiben(schreiben);
    const abmelden = vorDemSchliessen(z.jetzt);
    z.planen();
    await expect(schliessenVorbereiten(1000)).resolves.toBe('fertig');
    expect(schreiben).toHaveBeenCalledTimes(1);
    abmelden();
    z.planen();
    await schliessenVorbereiten(1000);
    expect(schreiben).toHaveBeenCalledTimes(1);
  });
});
