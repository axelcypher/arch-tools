// @vitest-environment happy-dom
/**
 * Gesetzestexte laden: Die eintreffenden Texte kommen gebündelt in den Store – je Zwischenstand (höchstens alle
 * TEXTE_BUENDELN_MS) ein Update, am Ende der Rest –, nicht je Text eines, das jedes Mal eine volle Auswertung auslöst.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aktiveModule } from '@core/baurecht/paket';
import { Rechtsstand } from '@core/recht/rechtsstand';
import { TEXTE_BUENDELN_MS, texteLaden } from './pruefung';
import { useBaurecht } from './store';

const module = () => aktiveModule(useBaurecht.getState().paket.module, '05974040');
const kennungen = () => module().flatMap((m) => Object.entries(m.normen).flatMap(([norm, d]) => (d.quelle.art === 'verweis' ? [] : [`${m.id}/${norm}`])));

/** zählt die Updates von `texte` im Store */
function updatesZaehlen(): { n: () => number; weg: () => void } {
  let n = 0;
  const weg = useBaurecht.subscribe((s, vorher) => {
    if (s.texte !== vorher.texte) n++;
  });
  return { n: () => n, weg };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Gesetzestexte laden', () => {
  it('alle Texte auf einmal (Web-Version, aus der Ablage): ein Update statt eines je Text, keiner geht verloren', async () => {
    const keys = kennungen();
    expect(keys.length, 'genug Normen, damit das Bündeln etwas bewirkt').toBeGreaterThan(8);
    useBaurecht.setState({ texte: {}, laedt: [] });
    const u = updatesZaehlen();
    try {
      await texteLaden(module(), '2026-12-01');
    } finally {
      u.weg();
    }
    const { texte, laedt } = useBaurecht.getState();
    expect(Object.keys(texte).sort()).toEqual([...keys].sort());
    expect(Object.values(texte).every((t) => t.stichtag === '2026-12-01' || t.fehler)).toBe(true);
    expect(laedt).toEqual([]);
    // vorher ein Update je Text (41)
    expect(u.n()).toBe(1);
  });

  // langsame Quellen (Desktop-App): je Text 100 ms, vier Abrufe parallel – der Fortschritt bleibt sichtbar
  const langsam = () =>
    vi
      .spyOn(Rechtsstand.prototype, 'fuer')
      .mockImplementation((_norm, stichtag) => new Promise((r) => setTimeout(() => r({ fassung: null, fehler: `Text für ${stichtag} nicht erreichbar` } as never), 100)));

  it('langsame Quellen: ein Zwischenstand je TEXTE_BUENDELN_MS mit den bis dahin eingetroffenen Texten und dem Rest als „lädt“', async () => {
    vi.useFakeTimers();
    langsam();
    const keys = kennungen();
    useBaurecht.setState({ texte: {}, laedt: [] });
    const u = updatesZaehlen();
    const fertig = texteLaden(module(), '2026-12-01');
    expect(useBaurecht.getState().laedt.length).toBe(keys.length);
    // die ersten vier treffen nach 100 ms ein, der Zwischenstand kommt TEXTE_BUENDELN_MS danach
    await vi.advanceTimersByTimeAsync(100 + TEXTE_BUENDELN_MS - 1);
    expect(u.n(), 'noch kein Zwischenstand').toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(u.n()).toBe(1);
    const zwischen = Object.keys(useBaurecht.getState().texte).length;
    expect(zwischen).toBeGreaterThan(0);
    expect(zwischen).toBeLessThan(keys.length);
    // „lädt“ nennt genau die noch fehlenden
    expect(useBaurecht.getState().laedt.length).toBe(keys.length - zwischen);
    await vi.runAllTimersAsync();
    await fertig;
    u.weg();
    expect(Object.keys(useBaurecht.getState().texte).sort()).toEqual([...keys].sort());
    expect(useBaurecht.getState().laedt).toEqual([]);
    // je Zwischenstand eines statt eines je Text
    const erwartet = Math.ceil((Math.ceil(keys.length / 4) * 100) / (100 + TEXTE_BUENDELN_MS)) + 1;
    expect(u.n()).toBeLessThanOrEqual(erwartet);
    expect(u.n()).toBeLessThan(keys.length / 4);
  });

  it('ein Lauf, der mit ausstehendem Zwischenstand überholt wird, schreibt nichts mehr – es gilt der neuere', async () => {
    vi.useFakeTimers();
    langsam();
    useBaurecht.setState({ texte: {}, laedt: [] });
    const alt = texteLaden(module(), '2026-01-01');
    // die ersten Texte des alten Laufs sind eingetroffen, sein Zwischenstand ist geplant, aber noch nicht im Store
    await vi.advanceTimersByTimeAsync(150);
    expect(Object.keys(useBaurecht.getState().texte)).toEqual([]);
    // jeder Stichtag, der von hier an im Store auftaucht – der alte darf nie dabei sein (auch nicht kurz, bevor der neue
    // Lauf dieselben Texte überschreibt)
    const gesehen = new Set<string>();
    const weg = useBaurecht.subscribe((st) => Object.values(st.texte).forEach((t) => gesehen.add(t.fehler ?? '')));
    const neu = texteLaden(module(), '2026-12-01');
    await vi.runAllTimersAsync();
    await Promise.all([alt, neu]);
    weg();
    expect([...gesehen].filter((f) => f.includes('2026-01-01'))).toEqual([]);
    const fehler = Object.values(useBaurecht.getState().texte).map((t) => t.fehler);
    expect(fehler.length).toBe(kennungen().length);
    expect(fehler.every((f) => f === 'Text für 2026-12-01 nicht erreichbar')).toBe(true);
    expect(useBaurecht.getState().laedt).toEqual([]);
  });
});
