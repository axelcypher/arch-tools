// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { useTheme, useZeichenflaecheGefiltert } from './theme';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('useZeichenflaecheGefiltert', () => {
  it('nur im dunklen Schema mit „Zeichenfläche abdunkeln“ wahr; folgt jedem Wechsel', () => {
    const werte: boolean[] = [];
    function Sonde() {
      werte.push(useZeichenflaecheGefiltert());
      return null;
    }
    const host = document.createElement('div');
    const root = createRoot(host);
    act(() => useTheme.setState({ theme: 'hell', canvasDunkel: true }));
    act(() => root.render(createElement(Sonde)));
    act(() => useTheme.setState({ theme: 'dunkel', canvasDunkel: true }));
    act(() => useTheme.setState({ theme: 'dunkel', canvasDunkel: false }));
    act(() => root.unmount());
    expect(werte.at(0)).toBe(false);
    expect(werte).toContain(true);
    expect(werte.at(-1)).toBe(false);
  });
});
