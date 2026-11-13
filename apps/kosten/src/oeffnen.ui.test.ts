// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '@core/model';
import { App } from './App';
import { useKosten } from './store';

vi.mock('@core/platform/projektDatei', async (original) => ({
  ...(await original<typeof import('@core/platform/projektDatei')>()),
  projektDateiWaehlen: async () => ({ name: 'Haus kaputt.oap', pfad: null, bytes: new TextEncoder().encode('{kaputt') }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

describe('Öffnen einer defekten Projektdatei (Q-6)', () => {
  it('verständliche Meldung mit Dateiname, das geöffnete Projekt bleibt unverändert, kein alert', async () => {
    const alert = vi.fn();
    window.alert = alert;
    const p = { ...createProject(), name: 'Bestand' };
    useKosten.getState().load(p, 'Bestand.oap', p);
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render(createElement(App));
    });
    const knopf = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Öffnen')!;
    await act(async () => knopf.click());
    for (let i = 0; i < 10 && !host.querySelector('.modal.rf'); i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
    const meldung = host.querySelector('.modal.rf')!;
    expect(meldung.textContent).toContain('Die Datei „Haus kaputt.oap“ ließ sich nicht lesen: Keine gültige Projektdatei (.oap)');
    expect(meldung.textContent).toContain('Das geöffnete Projekt bleibt unverändert.');
    expect(useKosten.getState().project.name).toBe('Bestand');
    expect(alert).not.toHaveBeenCalled();
  });
});
