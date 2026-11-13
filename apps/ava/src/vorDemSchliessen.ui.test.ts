// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { schliessenVorbereiten } from '@core/platform/rahmen';
import { TextEingabe, useEntwurf } from './components/eingaben';
import { Langtext } from './components/lv/Langtext';
import { ausstehendesSchreibenAbwarten, schreibend, useAva } from './store';
import { berichtAblegen } from './components/bauleitung/gemeinsam';
import { App } from './App';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
/** weitere Wurzeln eines Tests – auch bei gescheiterter Erwartung abgebaut */
const weitere: ReturnType<typeof createRoot>[] = [];
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  act(() => weitere.splice(0).forEach((r) => r.unmount()));
  useEntwurf.setState({ offen: false });
  document.body.innerHTML = '';
});

/** Komponente in einer weiteren Wurzel zeigen; liefert den Host */
function zeigen(el: ReturnType<typeof createElement>): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const r = createRoot(host);
  weitere.push(r);
  act(() => r.render(el));
  return host;
}

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

  it('ein Schreiben, das schon vor dem Aufruf gescheitert ist (z. B. Projektdatei), hält das Schließen nicht auf: im Speicher ist nichts ungespeichert', async () => {
    const p = schreibend(Promise.reject(new Error('Projektdatei gesperrt')));
    p.catch(() => {});
    await takt();
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
    let ok: string | null = null;
    const vorbereitet = schliessenVorbereiten(1000).then((x) => (ok = x));
    await act(takt);
    expect(ok).toBeNull();
    fertig();
    await act(async () => void (await vorbereitet));
    expect(ok).toBe('fertig');
    // gescheitertes Schreiben: Arkly erfährt „nicht gespeichert“ (fehler) statt still zu schließen
    let scheitern!: () => void;
    const kaputt = schreibend(new Promise<void>((_, nein) => (scheitern = () => nein(new Error('Projektdatei gesperrt')))));
    kaputt.catch(() => {});
    const gescheitert = schliessenVorbereiten(1000);
    await act(takt);
    scheitern();
    await act(async () => void (await expect(gescheitert).resolves.toBe('fehler')));
    // geändertes LV ist kein Schreibfehler: das fragt Arkly vorher als „Änderungen speichern?“ (dirty) – hier „fertig“
    const vorher = useAva.getState();
    try {
      useAva.setState({ lv: { lv: { positionen: [1] }, basis: { positionen: [] } } as never });
      await act(async () => void (await expect(schliessenVorbereiten(1000)).resolves.toBe('fertig')));
    } finally {
      useAva.setState(vorher, true);
    }
    // Gegenprobe: nach dem Abbau ist FABRIO abgemeldet – Arkly wartet nicht mehr auf FABRIO
    act(() => root?.unmount());
    root = null;
    let haengt!: () => void;
    void schreibend(new Promise<void>((r) => (haengt = r)));
    await expect(schliessenVorbereiten(50)).resolves.toBe('fertig');
    haengt();
  });

  it('im Arkly-Tab: geändertes LV meldet dirty an Arkly, „Speichern“ auf Anfrage speichert das LV', async () => {
    const rahmen = { postMessage: vi.fn() };
    const adresse = window.location.href;
    const parentVorher = Object.getOwnPropertyDescriptor(window, 'parent');
    const vorher = useAva.getState();
    const lvSpeichern = vi.fn(async () => true);
    try {
      Object.defineProperty(window, 'parent', { configurable: true, value: rahmen });
      window.history.replaceState(null, '', '/?rahmen=tab&app=ava');
      const status = () => rahmen.postMessage.mock.calls.map(([n]) => n).filter((n) => n?.typ === 'arch-tools:status');
      const host = document.createElement('div');
      document.body.appendChild(host);
      act(() => {
        root = createRoot(host);
        root.render(createElement(App));
      });
      // Gegenprobe: ohne Änderung nicht dirty
      expect(status().at(-1)?.dirty).toBe(false);
      const basis = { positionen: [] };
      act(() => useAva.setState({ lv: { lv: { positionen: [1] }, basis, format: 'x83', datei: { name: 'LV 1.x83' } } as never, lvSpeichern }));
      expect(status().at(-1)?.dirty).toBe(true);
      // Arkly fragt „Änderungen speichern?“ → Speichern: Anfrage an den Tab, FABRIO speichert das LV
      await act(async () => {
        window.dispatchEvent(new MessageEvent('message', { data: { typ: 'arch-tools:speichern', anfrage: 'a1' }, origin: window.location.origin, source: rahmen as never }));
        await takt();
      });
      expect(lvSpeichern).toHaveBeenCalledTimes(1);
      expect(rahmen.postMessage).toHaveBeenCalledWith({ typ: 'arch-tools:gespeichert', anfrage: 'a1', ok: true }, window.location.origin);

      // begonnene Eingabe im LV-Feld (Cursor noch im Feld): schon dirty, damit Arkly fragt; Speichern übernimmt sie
      act(() => useAva.setState({ lv: { lv: basis, basis, format: 'x83', datei: { name: 'LV 1.x83' } } as never }));
      expect(status().at(-1)?.dirty).toBe(false);
      const menge = vi.fn(() => useAva.setState({ lv: { ...useAva.getState().lv!, lv: { positionen: [3] } } as never }));
      const feld = zeigen(createElement(TextEingabe, { wert: '1', onChange: menge })).querySelector('input')!;
      act(() => {
        feld.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(feld, '12');
        feld.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(menge).not.toHaveBeenCalled();
      expect(status().at(-1)?.dirty).toBe(true);
      await act(async () => {
        window.dispatchEvent(new MessageEvent('message', { data: { typ: 'arch-tools:speichern', anfrage: 'a2' }, origin: window.location.origin, source: rahmen as never }));
        await takt();
      });
      expect(menge).toHaveBeenCalledWith('12');
      expect(lvSpeichern).toHaveBeenCalledTimes(2);
      expect(rahmen.postMessage).toHaveBeenCalledWith({ typ: 'arch-tools:gespeichert', anfrage: 'a2', ok: true }, window.location.origin);

      // Langtext (contentEditable) ebenso: Tippen macht dirty, Speichern übernimmt ihn
      act(() => useAva.setState({ lv: { lv: basis, basis, format: 'x83', datei: { name: 'LV 1.x83' } } as never }));
      expect(status().at(-1)?.dirty).toBe(false);
      const langtext = vi.fn(() => useAva.setState({ lv: { ...useAva.getState().lv!, lv: { positionen: [4] } } as never }));
      const flaeche = zeigen(createElement(Langtext, { wert: [{ laeufe: [{ text: 'Mauerwerk' }] }] as never, onChange: langtext })).querySelector<HTMLElement>('[role="textbox"]')!;
      act(() => {
        flaeche.focus();
        flaeche.innerHTML = '<p>Mauerwerk aus Kalksandstein</p>';
        flaeche.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(langtext).not.toHaveBeenCalled();
      expect(status().at(-1)?.dirty).toBe(true);
      await act(async () => {
        window.dispatchEvent(new MessageEvent('message', { data: { typ: 'arch-tools:speichern', anfrage: 'a3' }, origin: window.location.origin, source: rahmen as never }));
        await takt();
      });
      expect(langtext).toHaveBeenCalledTimes(1);
      expect(lvSpeichern).toHaveBeenCalledTimes(3);

      // Gegenprobe: ohne offenes LV macht eine begonnene Eingabe (z. B. Stammdaten, speichern beim Verlassen) nicht dirty
      act(() => useAva.setState({ lv: null }));
      const zweit = zeigen(createElement(TextEingabe, { wert: 'a', onChange: () => {} })).querySelector('input')!;
      act(() => {
        zweit.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(zweit, 'ab');
        zweit.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(useEntwurf.getState().offen).toBe(true);
      expect(status().at(-1)?.dirty).toBe(false);
    } finally {
      act(() => root?.unmount());
      root = null;
      useAva.setState(vorher, true);
      window.history.replaceState(null, '', adresse);
      if (parentVorher) Object.defineProperty(window, 'parent', parentVorher);
      else delete (window as { parent?: unknown }).parent;
    }
  });
});
