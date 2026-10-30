// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
let host: HTMLElement;

async function anzeigen(kaputt: boolean) {
  const { ErrorBoundary } = await import('./Absturz');
  const Kind = () => {
    if (kaputt) throw new Error('Geschoss ohne Punkte');
    return createElement('p', null, 'App läuft');
  };
  host = document.createElement('div');
  document.body.appendChild(host);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await act(async () => {
    root = createRoot(host);
    root.render(createElement(ErrorBoundary, null, createElement(Kind)));
  });
}
const knopf = (text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === text);

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});
afterEach(() => {
  act(() => root?.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe('Absturzanzeige', () => {
  it('Fehler direkt nach dem Laden des Zwischenstands: Neuladen startet ohne ihn', async () => {
    const s = await import('../platform/startschutz');
    s.zwischenstandLadenErlaubt('app');
    s.zwischenstandWirdGeladen('app');
    await anzeigen(true);
    expect(host.textContent).toContain('kurz nach dem Laden des Zwischenstands');
    expect(host.textContent).toContain('Geschoss ohne Punkte');
    expect(knopf('Ohne Zwischenstand neu starten')).toBeUndefined();
    expect(localStorage.getItem('app.zwischenstand')).toBe('aussetzen');
  });

  it('Fehler im Betrieb: Neu laden oder ohne Zwischenstand neu starten', async () => {
    const s = await import('../platform/startschutz');
    s.zwischenstandLadenErlaubt('app');
    await anzeigen(true);
    expect(host.textContent).toContain('Nach dem Neuladen geht es an derselben Stelle weiter');
    const reload = vi.fn();
    vi.stubGlobal('location', { ...location, reload });
    act(() => knopf('Ohne Zwischenstand neu starten')!.click());
    expect(localStorage.getItem('app.zwischenstand')).toBe('aussetzen');
    expect(reload).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('Hinweis, wenn der Zwischenstand beim Start ausgesetzt wurde', async () => {
    localStorage.setItem('app.zwischenstand', 'laeuft'); // letzter Start abgestürzt
    const s = await import('../platform/startschutz');
    expect(s.zwischenstandLadenErlaubt('app')).toBe(false);
    await anzeigen(false);
    expect(host.textContent).toContain('App läuft');
    expect(host.textContent).toContain('Der letzte Zwischenstand wurde nicht geladen');
    act(() => knopf('Ausblenden')!.click());
    expect(host.textContent).not.toContain('Der letzte Zwischenstand wurde nicht geladen');
  });
});
