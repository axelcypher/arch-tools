// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Startschutz = typeof import('./startschutz');
/** neuer Start der App: Modulzustand frisch, localStorage bleibt */
async function start(): Promise<Startschutz> {
  vi.resetModules();
  return import('./startschutz');
}
const vermerk = () => localStorage.getItem('app.zwischenstand');

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('Startschutz für den Zwischenstand', () => {
  it('normaler Start: geladen, nach stabilem Lauf bestätigt, beim nächsten Start wieder geladen', async () => {
    let s = await start();
    expect(s.zwischenstandLadenErlaubt('app')).toBe(true);
    s.zwischenstandWirdGeladen('app');
    expect(vermerk()).toBe('laeuft');
    vi.advanceTimersByTime(10_000);
    expect(vermerk()).toBeNull();
    s = await start();
    expect(s.zwischenstandLadenErlaubt('app')).toBe(true);
    expect(s.zwischenstandAusgesetzt()).toBe(false);
  });

  it('Absturz oder Hänger nach dem Laden: nächster Start ohne Zwischenstand, bis er ersetzt wird', async () => {
    let s = await start();
    s.zwischenstandLadenErlaubt('app');
    s.zwischenstandWirdGeladen('app'); // danach abgestürzt – kein Timer, kein pagehide
    s = await start();
    expect(s.zwischenstandLadenErlaubt('app')).toBe(false);
    expect(s.zwischenstandLadenErlaubt('app')).toBe(false); // je Start nur einmal geprüft
    expect(s.zwischenstandAusgesetzt()).toBe(true);
    // ohne Weiterarbeiten geschlossen: auch der übernächste Start lädt ihn nicht (kein Wechsel Absturz/Start)
    window.dispatchEvent(new Event('pagehide'));
    s = await start();
    expect(s.zwischenstandLadenErlaubt('app')).toBe(false);
    // neuer Zwischenstand geschrieben → wieder normal
    s.zwischenstandErsetzt('app');
    s = await start();
    expect(s.zwischenstandLadenErlaubt('app')).toBe(true);
  });

  it('normales Schließen kurz nach dem Start gilt nicht als Absturz', async () => {
    let s = await start();
    s.zwischenstandLadenErlaubt('app');
    s.zwischenstandWirdGeladen('app');
    window.dispatchEvent(new Event('pagehide'));
    s = await start();
    expect(s.zwischenstandLadenErlaubt('app')).toBe(true);
  });

  it('Darstellungsfehler kurz nach dem Laden: Neuladen startet ohne Zwischenstand; später nicht', async () => {
    let s = await start();
    s.zwischenstandLadenErlaubt('app');
    s.zwischenstandWirdGeladen('app');
    expect(s.absturzMelden()).toBe(true);
    window.dispatchEvent(new Event('pagehide')); // „Neu laden“
    s = await start();
    expect(s.zwischenstandLadenErlaubt('app')).toBe(false);
    // „Trotzdem laden“
    s.zwischenstandFreigeben();
    s = await start();
    expect(s.zwischenstandLadenErlaubt('app')).toBe(true);
    s.zwischenstandWirdGeladen('app');
    vi.advanceTimersByTime(10_000);
    expect(s.absturzMelden()).toBe(false); // Fehler später im Betrieb: Zwischenstand bleibt nutzbar
    expect(vermerk()).toBeNull();
  });

  it('„Ohne Zwischenstand neu starten“', async () => {
    let s = await start();
    s.zwischenstandLadenErlaubt('app');
    s.zwischenstandAussetzen();
    s = await start();
    expect(s.zwischenstandLadenErlaubt('app')).toBe(false);
  });
});
