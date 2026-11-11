// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { einstiegsAktionen, farbschemaWechseln, stammdatenAendern } from '@core/ui/rauchtest';
import { createProject } from '@core/model';
import { useEditor } from './store/store';
import { App } from './App';

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
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

describe('Flächenrechner (Oberfläche)', () => {
  it('Farbschema wechselt sofort (Menü ◐), ohne eigene Kopie in der App', () => {
    const host = render();
    expect(farbschemaWechseln(host, 'Dunkel')).toBe('dunkel');
    expect(farbschemaWechseln(host, 'Hell')).toBe('hell');
  });

  it('Stammdaten öffnen und ändern (gemeinsamer Dialog)', () => {
    const host = render();
    expect(stammdatenAendern(host, '12')).toBe('Stammdaten des Projekts');
    expect(useEditor.getState().project.meta.bebauungsplan).toEqual({ nummer: '12' });
    expect(host.textContent).toContain('Bebauungsplan Nr. 12');
  });

  it('Start ohne Projekt (Browser): Projektübersicht mit denselben Aktionen wie in den anderen Apps (Q-5)', () => {
    useEditor.getState().loadProject(createProject());
    const host = render();
    expect(einstiegsAktionen(host)).toEqual(['Datei öffnen …', 'Neues Projekt', 'Schließen']);
    act(() => [...host.querySelectorAll<HTMLButtonElement>('.pw-einstieg button')].find((b) => b.textContent === 'Schließen')!.click());
    expect(host.querySelector('.pw-einstieg')).toBeNull();
  });
});
