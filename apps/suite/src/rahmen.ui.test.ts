// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { useRahmen } from './store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
function render(): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(createElement(App));
  });
  return host;
}
beforeEach(() => {
  localStorage.clear();
  useRahmen.setState({ tabs: [], aktiv: null, fenster: [], status: {} });
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});
const karte = (host: Element, name: string) => [...host.querySelectorAll('.rahmen-karte')].find((k) => k.textContent?.includes(name)) as HTMLButtonElement;
const tab = (host: Element, name: string) => [...host.querySelectorAll('.rahmen-tab')].find((k) => k.textContent?.includes(name)) as HTMLElement;

describe('Rahmen-App', () => {
  it('Apps als Tabs öffnen, wechseln (die anderen bleiben geladen), schließen; offene Tabs bleiben für den nächsten Start', () => {
    const host = render();
    expect(host.querySelectorAll('.rahmen-karte')).toHaveLength(6);
    act(() => karte(host, 'Projektordner').click());
    expect(host.querySelector('iframe')?.getAttribute('src')).toBe('apps/ordner/index.html?rahmen=tab&app=ordner');
    // weitere App über „+“
    act(() => (host.querySelector('.rahmen-plus button') as HTMLButtonElement).click());
    act(() => ([...host.querySelectorAll('.rahmen-menue button')].find((b) => b.textContent?.includes('Formulare')) as HTMLButtonElement).click());
    expect([...host.querySelectorAll('.rahmen-tab-name')].map((t) => t.textContent)).toEqual(['Projektordner', 'Formulare']);
    expect([...host.querySelectorAll('iframe')].map((f) => f.className)).toEqual(['rahmen-app', 'rahmen-app aktiv']);
    act(() => tab(host, 'Projektordner').click());
    expect([...host.querySelectorAll('iframe')].map((f) => f.className)).toEqual(['rahmen-app aktiv', 'rahmen-app']);
    expect(JSON.parse(localStorage.getItem('arch-tools:rahmen')!)).toEqual({ tabs: ['ordner', 'formulare'], aktiv: 'ordner' });
    act(() => (tab(host, 'Projektordner').querySelector('button[title="Schließen"]') as HTMLButtonElement).click());
    expect([...host.querySelectorAll('.rahmen-tab-name')].map((t) => t.textContent)).toEqual(['Formulare']);
    expect(useRahmen.getState().aktiv).toBe('formulare');
  });

  it('Meldungen der App im Tab: Projektname und ungespeicherte Änderungen; Rückfrage beim Schließen', () => {
    const host = render();
    act(() => karte(host, 'Flächenrechner').click());
    const f = host.querySelector('iframe')!;
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { typ: 'arch-tools:status', app: 'Flächenrechner', name: 'EFH Musterweg', dirty: true }, origin: window.location.origin, source: f.contentWindow }));
    });
    expect(tab(host, 'Flächenrechner').textContent).toContain('EFH Musterweg');
    expect(tab(host, 'Flächenrechner').querySelector('.rahmen-tab-dirty')).toBeTruthy();
    // fremde Herkunft zählt nicht
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { typ: 'arch-tools:status', app: 'X', name: 'fremd', dirty: false }, origin: 'https://example.org', source: f.contentWindow }));
    });
    expect(tab(host, 'Flächenrechner').textContent).toContain('EFH Musterweg');
    const nein = vi.fn(() => false);
    window.confirm = nein;
    act(() => (tab(host, 'Flächenrechner').querySelector('button[title="Schließen"]') as HTMLButtonElement).click());
    expect(nein).toHaveBeenCalled();
    expect(useRahmen.getState().tabs).toEqual(['flaechenrechner']);
  });

  it('Herauslösen (Browser: neues Fenster) nimmt den Tab weg; Andocken holt ihn zurück', () => {
    const host = render();
    act(() => karte(host, 'Entzerrung').click());
    const offen = vi.fn(() => null);
    window.open = offen as unknown as typeof window.open;
    act(() => (tab(host, 'Entzerrung').querySelector('button[title="In eigenem Fenster öffnen"]') as HTMLButtonElement).click());
    expect(offen).toHaveBeenCalledWith('apps/entzerrung/index.html?rahmen=fenster&app=entzerrung', 'arch-tools-entzerrung');
    expect(useRahmen.getState()).toMatchObject({ tabs: [], fenster: ['entzerrung'] });
    expect(karte(host, 'Entzerrung').textContent).toContain('läuft in eigenem Fenster');
    act(() => useRahmen.getState().angedockt('entzerrung'));
    expect(useRahmen.getState()).toMatchObject({ tabs: ['entzerrung'], aktiv: 'entzerrung', fenster: [] });
  });
});
