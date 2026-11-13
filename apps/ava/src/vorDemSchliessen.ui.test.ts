// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { schliessenVorbereiten } from '@core/platform/rahmen';
import { TextEingabe } from './components/eingaben';
import { ausstehendesSchreibenAbwarten, schreibend } from './store';
import { App } from './App';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

const takt = () => new Promise((r) => setTimeout(r, 0));

describe('Vor dem Schließen: laufendes Schreiben abwarten (Arkly vorDemSchliessen)', () => {
  it('wartet, bis ein laufender Schreibvorgang fertig ist; ohne laufendes Schreiben sofort fertig', async () => {
    // Gegenprobe: nichts läuft → sofort fertig
    let leer = false;
    await ausstehendesSchreibenAbwarten().then(() => (leer = true));
    expect(leer).toBe(true);

    let fertig!: () => void;
    void schreibend(new Promise<void>((r) => (fertig = r)));
    let erledigt = false;
    const warten = ausstehendesSchreibenAbwarten().then(() => (erledigt = true));
    await takt();
    expect(erledigt).toBe(false);
    fertig();
    await warten;
    expect(erledigt).toBe(true);
  });

  it('ein fehlgeschlagener Schreibvorgang zählt als fertig (kein Hängen)', async () => {
    const p = schreibend(Promise.reject(new Error('gesperrt')));
    p.catch(() => {});
    await expect(ausstehendesSchreibenAbwarten()).resolves.toBeUndefined();
  });

  it('übernimmt die laufende Eingabe genau einmal, auch bei mehrfachem Aufruf', async () => {
    const onChange = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render(createElement(TextEingabe, { wert: 'alt', onChange }));
    });
    const input = host.querySelector('input')!;
    act(() => {
      input.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'neu');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => Promise.all([ausstehendesSchreibenAbwarten(), ausstehendesSchreibenAbwarten()]));
    await act(async () => ausstehendesSchreibenAbwarten());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('neu');
  });

  it('die App meldet sich an: Arkly wartet beim Schließen auf laufendes Schreiben', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render(createElement(App));
    });
    let fertig!: () => void;
    void schreibend(new Promise<void>((r) => (fertig = r)));
    let ok: boolean | null = null;
    const vorbereitet = schliessenVorbereiten(1000).then((x) => (ok = x));
    await act(takt);
    expect(ok).toBeNull();
    fertig();
    await act(async () => void (await vorbereitet));
    expect(ok).toBe(true);
    // Gegenprobe: nach dem Abbau ist FABRIO abgemeldet – Arkly wartet nicht mehr auf FABRIO
    act(() => root?.unmount());
    root = null;
    let haengt!: () => void;
    void schreibend(new Promise<void>((r) => (haengt = r)));
    await expect(schliessenVorbereiten(50)).resolves.toBe(true);
    haengt();
  });
});
