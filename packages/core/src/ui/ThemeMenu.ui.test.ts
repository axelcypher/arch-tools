// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeMenu } from './TitleBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
function render(): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(createElement(ThemeMenu, { zeichenflaeche: true }));
  });
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

const taste = (ziel: Element, key: string) => act(() => ziel.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));

describe('Farbschema-Menü der Titelleiste', () => {
  it('Knopf mit Symbol, Namen der Wahl und zugänglichem Namen „Farbschema: …“', () => {
    const host = render();
    const knopf = host.querySelector<HTMLButtonElement>('.titlebar-menu > button')!;
    expect(knopf.querySelector('svg.schema-symbol')).not.toBeNull();
    expect(knopf.getAttribute('aria-label')).toMatch(/^Farbschema: /);
    expect(knopf.getAttribute('aria-haspopup')).toBe('menu');
    expect(knopf.getAttribute('aria-expanded')).toBe('false');
  });

  it('öffnen fokussiert die aktuelle Wahl, ↑/↓ wechseln, Esc schließt und gibt den Fokus an den Knopf zurück', async () => {
    const host = render();
    const knopf = host.querySelector<HTMLButtonElement>('.titlebar-menu > button')!;
    act(() => knopf.click());
    expect(knopf.getAttribute('aria-expanded')).toBe('true');
    const eintraege = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
    expect(eintraege.map((b) => b.textContent?.trim())).toEqual(['Auto (wie System)', 'Hell', 'Dunkel']);
    const aktiv = eintraege.find((b) => b.getAttribute('aria-checked') === 'true')!;
    expect(document.activeElement).toBe(aktiv);
    // nur die aktuelle Wahl liegt in der Tab-Reihenfolge
    expect(eintraege.filter((b) => b.tabIndex === 0)).toEqual([aktiv]);

    const i = eintraege.indexOf(aktiv);
    taste(aktiv, 'ArrowDown');
    expect(document.activeElement).toBe(eintraege[(i + 1) % 3]);
    taste(document.activeElement!, 'ArrowUp');
    expect(document.activeElement).toBe(aktiv);
    taste(document.activeElement!, 'End');
    expect(document.activeElement).toBe(eintraege[2]);
    taste(document.activeElement!, 'Home');
    expect(document.activeElement).toBe(eintraege[0]);

    taste(document.activeElement!, 'Escape');
    expect(host.querySelector('.titlebar-dropdown')).toBeNull();
    expect(knopf.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(knopf);
  });

  it('die Option „Zeichenfläche abdunkeln“ liegt außerhalb der Menürolle', () => {
    const host = render();
    act(() => host.querySelector<HTMLButtonElement>('.titlebar-menu > button')!.click());
    const menue = host.querySelector('[role="menu"]')!;
    const option = host.querySelector('.titlebar-dropdown label.toggle')!;
    expect(option).not.toBeNull();
    expect(menue.contains(option)).toBe(false);
  });
});
