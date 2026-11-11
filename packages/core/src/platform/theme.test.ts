// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { themeAnwenden, useTheme } from './theme';
import { ThemeMenu } from '../ui/TitleBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Farbschema', () => {
  it('Wechsel setzt data-theme sofort – ohne weiteren Aufruf', () => {
    themeAnwenden();
    useTheme.getState().setWahl('dunkel');
    expect(document.documentElement.dataset.theme).toBe('dunkel');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    useTheme.setState({ theme: 'hell' });
    expect(document.documentElement.dataset.theme).toBe('hell');
    useTheme.getState().setCanvasDunkel(false);
    expect(document.documentElement.dataset.canvas).toBe('hell');
    useTheme.getState().setCanvasDunkel(true);
    expect(document.documentElement.dataset.canvas).toBe('dunkel');
  });

  it('übernimmt die Wahl aus einem anderen Fenster bzw. Tab (localStorage)', () => {
    useTheme.getState().setWahl('hell');
    localStorage.setItem('flaechenrechner.theme', 'dunkel');
    window.dispatchEvent(new StorageEvent('storage', { key: 'flaechenrechner.theme' }));
    expect(useTheme.getState().wahl).toBe('dunkel');
    expect(document.documentElement.dataset.theme).toBe('dunkel');
  });

  it('Menü: „Hell“ wirkt sofort; ohne Zeichenfläche keine Option „abdunkeln“', () => {
    useTheme.getState().setWahl('dunkel');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(createElement(ThemeMenu, { zeichenflaeche: false })));
    act(() => host.querySelector('button')!.click());
    expect(host.textContent).not.toContain('Zeichenfläche');
    const hell = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Hell'))!;
    act(() => hell.click());
    expect(document.documentElement.dataset.theme).toBe('hell');
    act(() => root.render(createElement(ThemeMenu, {})));
    act(() => host.querySelector('button')!.click());
    expect(host.textContent).toContain('Zeichenfläche');
    act(() => root.unmount());
  });
});
