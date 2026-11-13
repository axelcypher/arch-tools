// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { schliessenVorbereiten } from '@core/platform/rahmen';
import { TextEingabe } from './components/eingaben';
import { ausstehendesSchreibenAbwarten, schreibend, useAva } from './store';
import { berichtAblegen } from './components/bauleitung/gemeinsam';
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

  it('ein gescheiterter Schreibvorgang beendet das Warten und meldet „nicht gespeichert“ (false)', async () => {
    const p = schreibend(Promise.reject(new Error('gesperrt')));
    p.catch(() => {});
    await expect(ausstehendesSchreibenAbwarten()).resolves.toBe(false);
    // Gegenprobe: erfolgreiches Schreiben → true
    void schreibend(Promise.resolve());
    await expect(ausstehendesSchreibenAbwarten()).resolves.toBe(true);
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

  it('Blur speichert die laufende Eingabe, und das Abwarten wartet genau auf dieses Speichern', async () => {
    let fertig!: () => void;
    const onChange = vi.fn(() => void schreibend(new Promise<void>((r) => (fertig = r))));
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
    let erledigt = false;
    const warten = ausstehendesSchreibenAbwarten().then(() => (erledigt = true));
    await act(takt);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(erledigt).toBe(false);
    fertig();
    await act(async () => void (await warten));
    expect(erledigt).toBe(true);
  });

  it('PDF in der Bauleitung ablegen ist angemeldet: das Abwarten wartet auf das langsame Schreiben', async () => {
    let fertig!: () => void;
    const anlegen = vi.fn(() => new Promise<boolean>((r) => (fertig = () => r(true))));
    const vorher = useAva.getState();
    try {
      useAva.setState({ fs: { anlegen } as never, projekt: { ordner: '/p' } as never });
      const abgelegt = berichtAblegen('Bautagebuch 1', new Uint8Array([1]), 'Bautagebuch');
      let erledigt = false;
      const warten = ausstehendesSchreibenAbwarten().then(() => (erledigt = true));
      await takt();
      expect(erledigt).toBe(false);
      fertig();
      await warten;
      expect(erledigt).toBe(true);
      await expect(abgelegt).resolves.toBe('Bauleitung/Bautagebuch/Bautagebuch 1.pdf');
      expect(anlegen).toHaveBeenCalledTimes(1);
    } finally {
      useAva.setState(vorher, true);
    }
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
