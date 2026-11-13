// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { useRahmen } from './store';
import { useTheme } from '@core/platform/theme';

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
const knopfMit = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;
const tab = (host: Element, name: string) => [...host.querySelectorAll('.rahmen-tab')].find((k) => k.textContent?.includes(name)) as HTMLElement;

describe('Rahmen-App', () => {
  it('Farbschema: Wahl in einem Tab (localStorage) wirkt sofort im Rahmen', () => {
    render();
    useTheme.getState().setWahl('hell');
    localStorage.setItem('flaechenrechner.theme', 'dunkel');
    window.dispatchEvent(new StorageEvent('storage', { key: 'flaechenrechner.theme' }));
    expect(document.documentElement.dataset.theme).toBe('dunkel');
  });

  it('Apps als Tabs öffnen, wechseln (die anderen bleiben geladen), schließen; offene Tabs bleiben für den nächsten Start', () => {
    const host = render();
    expect(host.querySelectorAll('.rahmen-karte')).toHaveLength(7);
    act(() => karte(host, 'Projekt').click());
    expect(host.querySelector('iframe')?.getAttribute('src')).toBe('apps/ordner/index.html?rahmen=tab&app=ordner');
    // weitere App über „+“
    act(() => (host.querySelector('.rahmen-plus button') as HTMLButtonElement).click());
    act(() => ([...host.querySelectorAll('.rahmen-menue button')].find((b) => b.textContent?.includes('Formulare')) as HTMLButtonElement).click());
    expect([...host.querySelectorAll('.rahmen-tab-name')].map((t) => t.textContent)).toEqual(['Projekt', 'Formulare']);
    expect([...host.querySelectorAll('iframe')].map((f) => f.className)).toEqual(['rahmen-app', 'rahmen-app aktiv']);
    act(() => tab(host, 'Projekt').click());
    expect([...host.querySelectorAll('iframe')].map((f) => f.className)).toEqual(['rahmen-app aktiv', 'rahmen-app']);
    expect(JSON.parse(localStorage.getItem('arch-tools:rahmen')!)).toEqual({ tabs: ['ordner', 'formulare'], aktiv: 'ordner' });
    act(() => (tab(host, 'Projekt').querySelector('button[title="Schließen"]') as HTMLButtonElement).click());
    expect([...host.querySelectorAll('.rahmen-tab-name')].map((t) => t.textContent)).toEqual(['Formulare']);
    expect(useRahmen.getState().aktiv).toBe('formulare');
  });

  it('Meldungen der App im Tab: Projektname und ungespeicherte Änderungen; Rückfrage beim Schließen', async () => {
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
    // Rückfrage mit drei Knöpfen statt window.confirm
    const confirm = vi.fn(() => true);
    window.confirm = confirm;
    act(() => (tab(host, 'Flächenrechner').querySelector('button[title="Schließen"]') as HTMLButtonElement).click());
    const dialog = () => host.querySelector('.modal.rf');
    expect(dialog()?.textContent).toContain('Änderungen an „Flächenrechner – EFH Musterweg“ speichern?');
    expect([...dialog()!.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Abbrechen', 'Nicht speichern', 'Speichern']);
    await act(async () => [...dialog()!.querySelectorAll('button')].find((b) => b.textContent === 'Abbrechen')!.click());
    expect(useRahmen.getState().tabs).toEqual(['flaechenrechner']);
    act(() => (tab(host, 'Flächenrechner').querySelector('button[title="Schließen"]') as HTMLButtonElement).click());
    await act(async () => [...dialog()!.querySelectorAll('button')].find((b) => b.textContent === 'Nicht speichern')!.click());
    expect(useRahmen.getState().tabs).toEqual([]);
    expect(confirm).not.toHaveBeenCalled();
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

  it('Neues Projekt anlegen: aus einer App oder vom Rahmen – der Assistent der Projekt-App, danach zurück mit dem neuen Projekt', () => {
    const host = render();
    // je Tab ein eigenes Fenster (happy-dom lädt keine iframes)
    const frame = (id: string) => {
      const f = host.querySelector<HTMLIFrameElement>(`iframe[src^="apps/${id}/"]`)!;
      if (!(f as unknown as { fake?: boolean }).fake) {
        const win = { postMessage: () => {} } as unknown as Window;
        Object.defineProperty(f, 'contentWindow', { value: win, configurable: true });
        (f as unknown as { fake?: boolean }).fake = true;
      }
      return f;
    };
    const melden = (id: string, data: object) => act(() => window.dispatchEvent(new MessageEvent('message', { data, origin: window.location.origin, source: frame(id).contentWindow })));
    act(() => karte(host, 'Flächenrechner').click());
    const anFlaechen = vi.spyOn(frame('flaechenrechner').contentWindow!, 'postMessage');
    melden('flaechenrechner', { typ: 'arch-tools:bereit', app: 'flaechenrechner' });
    // Auftrag aus dem Flächenrechner: der Projekt-Tab öffnet sich, der Auftrag wartet, bis die App hört
    melden('flaechenrechner', { typ: 'arch-tools:projekt-anlegen', von: 'flaechenrechner', kannOeffnen: true, app: 'flaechenrechner' });
    expect(useRahmen.getState()).toMatchObject({ tabs: ['flaechenrechner', 'ordner'], aktiv: 'ordner' });
    const anProjekt = vi.spyOn(frame('ordner').contentWindow!, 'postMessage');
    expect(anProjekt).not.toHaveBeenCalled();
    melden('ordner', { typ: 'arch-tools:bereit', app: 'ordner' });
    expect(anProjekt).toHaveBeenCalledWith({ typ: 'arch-tools:assistent-neu', von: 'flaechenrechner', vonName: 'Flächenrechner', kannOeffnen: true, an: 'ordner' }, window.location.origin);
    // angelegt: zurück zum Flächenrechner, der das Projekt öffnet
    melden('ordner', { typ: 'arch-tools:zur-app', an: 'flaechenrechner', ordner: 'P:\\Projekte\\2026-014 Neu', app: 'ordner' });
    expect(useRahmen.getState().aktiv).toBe('flaechenrechner');
    expect(anFlaechen).toHaveBeenCalledWith({ typ: 'arch-tools:projekt-angelegt', ordner: 'P:\\Projekte\\2026-014 Neu', an: 'flaechenrechner' }, window.location.origin);
    // vom Rahmen selbst: „+“-Menü – der Projekt-Tab hört schon, der Auftrag geht sofort hin
    anProjekt.mockClear();
    act(() => (host.querySelector('.rahmen-plus button') as HTMLButtonElement).click());
    act(() => ([...host.querySelectorAll('.rahmen-menue button')].find((b) => b.textContent?.includes('Neues Projekt anlegen')) as HTMLButtonElement).click());
    expect(useRahmen.getState().aktiv).toBe('ordner');
    expect(anProjekt).toHaveBeenCalledWith({ typ: 'arch-tools:assistent-neu', von: null, an: 'ordner' }, window.location.origin);
    // unbekannte Apps und fremde Herkunft zählen nicht
    act(() => window.dispatchEvent(new MessageEvent('message', { data: { typ: 'arch-tools:zur-app', an: 'gibtsnicht' }, origin: window.location.origin, source: frame('ordner').contentWindow })));
    act(() => window.dispatchEvent(new MessageEvent('message', { data: { typ: 'arch-tools:projekt-anlegen' }, origin: 'https://example.org', source: frame('flaechenrechner').contentWindow })));
    expect(useRahmen.getState()).toMatchObject({ tabs: ['flaechenrechner', 'ordner'], aktiv: 'ordner' });
  });

  it('Startseite: „Neues Projekt anlegen“ öffnet den Projekt-Tab mit dem Assistenten', () => {
    const host = render();
    act(() => knopfMit(host, '+ Neues Projekt anlegen').click());
    expect(useRahmen.getState()).toMatchObject({ tabs: ['ordner'], aktiv: 'ordner' });
  });
});
