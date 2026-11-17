// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjektUebersicht } from './ProjektUebersicht';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

describe('Marken der Projektübersicht', () => {
  it('nutzen die gemeinsame .marke; die Art „hinweis“ wird zu .info, nie zur globalen Klasse .hinweis', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render(
        createElement(ProjektUebersicht, {
          gruppen: [{ id: 'g', name: 'Projekte' }],
          projekte: [{ schluessel: 'p1', gruppe: 'g', kuerzel: '2026-001', titel: 'Kita' }],
          zuletzt: [],
          onOeffnen: () => {},
          marken: () => [
            { text: 'ungespeichert', art: 'hinweis' },
            { text: 'Frist', art: 'warnung' },
            { text: 'Stand', art: 'neutral' },
          ],
        }),
      );
    });
    const marken = [...host.querySelectorAll('.pa-marken > span')];
    expect(marken.map((m) => m.className)).toEqual(['marke pa-marke info', 'marke pa-marke warnung', 'marke pa-marke neutral']);
    expect(host.querySelector('.marke.hinweis')).toBeNull();
  });
});
