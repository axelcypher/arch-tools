// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GesetzModal, useGesetz } from './components/GesetzModal';
import { keinEinfamilienhaus } from './vorgaben/grundlagen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
let fehler: ReturnType<typeof vi.spyOn>;
const vorher = Element.prototype.scrollIntoView;

beforeEach(() => {
  // wie in Chromium/WebView2: scrollIntoView liefert ein Promise (in happy-dom/jsdom fehlt es sonst)
  Element.prototype.scrollIntoView = function () {
    return Promise.resolve() as unknown as void;
  };
  fehler = vi.spyOn(console, 'error');
  useGesetz.setState({ quellen: null });
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  Element.prototype.scrollIntoView = vorher;
  fehler.mockRestore();
});

const warte = async () => {
  for (let i = 0; i < 4; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};
const zeigen = async () => {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(createElement(GesetzModal)));
  // Fundstellen wie am entfallenden Feld „Baubeschreibung“ (nw010002 1:CheckBox6, Einfamilienhaus): zwei Quellen
  act(() => useGesetz.getState().oeffnen(keinEinfamilienhaus.quellen!));
  // der Gesetzestext wird erst beim Öffnen geladen
  for (let i = 0; i < 50 && !host.querySelector('.fo-gesetz-zeile'); i++) await warte();
  return host;
};
const fehlerMeldungen = () => fehler.mock.calls.map((c: unknown[]) => c.map(String).join(' ')).filter((t: string) => /useEffect must not return|destroy is not a function/.test(t));

describe('Gesetzestext-Fenster (B-01)', () => {
  it('zwei Fundstellen: Reiterwechsel und Schließen per Knopf stürzen nicht ab', async () => {
    const host = await zeigen();
    const reiter = host.querySelectorAll<HTMLButtonElement>('.fo-gesetz-reiter button');
    expect(reiter).toHaveLength(2);
    expect(host.querySelector('.fo-gesetz-zeile.markiert')).not.toBeNull();
    act(() => reiter[1].click());
    await warte();
    // Titel im Kopf des gemeinsamen Modal, der Paragraf darunter als Unterüberschrift
    expect(host.querySelector('.fo-gesetz > .modal-kopf')!.textContent).toBe('Gesetzestext');
    expect(host.querySelector('.fo-gesetz h4.fo-gesetz-para')!.textContent).toContain('§ 10');
    act(() => [...host.querySelectorAll('button')].find((b) => b.textContent === 'Schließen')!.click());
    await warte();
    expect(host.querySelector('.fo-gesetz')).toBeNull();
    expect(fehlerMeldungen()).toEqual([]);
  });

  it('Schließen mit Esc und mit Klick daneben', async () => {
    let host = await zeigen();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await warte();
    expect(host.querySelector('.fo-gesetz')).toBeNull();

    act(() => root?.unmount());
    host = await zeigen();
    const hinten = host.querySelector<HTMLElement>('.modal-backdrop')!;
    act(() => {
      hinten.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    await warte();
    expect(host.querySelector('.fo-gesetz')).toBeNull();
    expect(fehlerMeldungen()).toEqual([]);
  });
});
