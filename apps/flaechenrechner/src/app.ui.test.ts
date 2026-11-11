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

describe('Flächenrechner: Prüfliste und Raumtabelle (F-10, F-21)', () => {
  it('Ampel „Prüfen“ zeigt Warnungen; Klick wählt die Fläche; Raumtabelle listet die Räume nach Nummer', async () => {
    const { rectPoints } = await import('@core/geometry');
    const { createOutline, createRoom } = await import('@core/model');
    const p = createProject('Haus');
    p.storeys[0].shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 })));
    const a = createRoom(rectPoints({ x: 0.3, y: 0.3 }, { x: 4.8, y: 7.7 }), '0.02', 'Küche');
    const b = createRoom(rectPoints({ x: 5, y: 0.3 }, { x: 11, y: 7.7 }), '0.01', 'Wohnen'); // ragt über den Umriss
    p.storeys[0].shapes.push(a, b);
    useEditor.getState().loadProject(p, p, 'Haus.oap');
    const host = render();
    act(() => [...host.querySelectorAll<HTMLButtonElement>('.pw-einstieg button')].find((x) => x.textContent === 'Schließen')?.click());
    const knopf = host.querySelector<HTMLButtonElement>('.pruef-knopf')!;
    expect(knopf.textContent).toMatch(/Prüfen: 1 Warnung/);
    act(() => knopf.click());
    const eintrag = [...host.querySelectorAll<HTMLLIElement>('.pruef-liste li')].find((li) => /ragt/.test(li.textContent ?? ''))!;
    act(() => eintrag.click());
    expect(useEditor.getState().selectedIds).toEqual([b.id]);
    act(() => useEditor.getState().select(null));
    act(() => [...host.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.textContent === 'Tabelle …')!.click());
    const zeilen = [...document.querySelectorAll('.raumtabelle tbody tr')].map((tr) => (tr.querySelectorAll('input')[0] as HTMLInputElement).value);
    expect(zeilen).toEqual(['0.01', '0.02']);
  });
});
