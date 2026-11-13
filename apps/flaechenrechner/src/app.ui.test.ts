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

describe('QUADRIO (Oberfläche)', () => {
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

describe('QUADRIO: Prüfliste und Raumtabelle (F-10, F-21)', () => {
  it('Ampel „Prüfen“ zeigt Warnungen; Klick wählt die Fläche; Raumtabelle listet die Räume nach Nummer', async () => {
    const { rectPoints } = await import('@core/geometry');
    const { createOutline, createRoom } = await import('@core/model');
    const p = createProject('Haus');
    p.storeys[0].shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 })));
    const a = createRoom(rectPoints({ x: 0.3, y: 0.3 }, { x: 4.8, y: 7.7 }), '0.02', 'Küche');
    const b = createRoom(rectPoints({ x: 5, y: 0.3 }, { x: 11, y: 7.7 }), '0.01', 'Wohnen'); // ragt über den Umriss
    p.storeys[0].shapes.push(a, b);
    p.settings = { ...p.settings, massgrundlage: 'fertig', planunterlagen: 'Grundrisse 1:100' };
    useEditor.getState().loadProject(p, p, 'Haus.oap');
    const host = render();
    act(() => [...host.querySelectorAll<HTMLButtonElement>('.pw-einstieg button')].find((x) => x.textContent === 'Schließen')?.click());
    const knopf = host.querySelector<HTMLButtonElement>('.pruef-knopf')!;
    expect(knopf.textContent).toMatch(/Prüfen: 1 Warnung/);
    act(() => knopf.click());
    const eintrag = [...host.querySelectorAll<HTMLButtonElement>('.pruef-liste li button')].find((b) => /ragt/.test(b.textContent ?? ''))!;
    act(() => eintrag.click());
    expect(useEditor.getState().selectedIds).toEqual([b.id]);
    act(() => useEditor.getState().select(null));
    act(() => [...host.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.textContent === 'Raumtabelle …')!.click());
    const zeilen = [...document.querySelectorAll('.raumtabelle tbody tr:not(.raumtabelle-geschoss)')].map((tr) => (tr.querySelectorAll('input')[0] as HTMLInputElement).value);
    expect(zeilen).toEqual(['0.01', '0.02']);
  });
});

describe('QUADRIO: Mehrfachauswahl (Eigenschaften)', () => {
  it('Nutzungsgruppe für alle: Anzeige und Rechnung gleich (Nutzungsart der alten Gruppe entfällt), Wohnung in vorhandener Schreibweise', async () => {
    const { rectPoints } = await import('@core/geometry');
    const { createOutline, createRoom } = await import('@core/model');
    const { computeProject } = await import('@core/calc');
    const p = createProject('Haus');
    p.storeys[0].shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 })));
    const bad = {
      ...createRoom(rectPoints({ x: 0.3, y: 0.3 }, { x: 4.3, y: 3.3 }), '0.01', 'Bad'),
      nutzung: 'NUF7' as const,
      nutzungsart: '7.1',
      wofl: { kategorie: 'voll' as const, wohnung: 'WE 01' },
    };
    const flur = { ...createRoom(rectPoints({ x: 4.5, y: 0.3 }, { x: 8.5, y: 3.3 }), '0.02', 'Diele'), wofl: { kategorie: 'voll' as const, wohnung: '' } };
    p.storeys[0].shapes.push(bad, flur);
    useEditor.getState().loadProject(p, p, 'Haus.oap');
    const host = render();
    act(() => [...host.querySelectorAll<HTMLButtonElement>('.pw-einstieg button')].find((x) => x.textContent === 'Schließen')?.click());
    act(() => useEditor.getState().selectMany([bad.id, flur.id]));
    const feld = (name: string) => [...host.querySelectorAll<HTMLLabelElement>('.sidebar-right label.field')].find((l) => l.querySelector('.field-label')?.textContent === name)!;
    const gruppe = feld('Nutzungsgruppe (DIN 277)').querySelector('select')!;
    act(() => {
      gruppe.value = 'VF';
      gruppe.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const raeume = useEditor.getState().project.storeys[0].shapes.filter((s) => s.kind === 'room');
    expect(raeume.map((r) => (r.kind === 'room' ? [r.nutzung, r.nutzungsart] : []))).toEqual([
      ['VF', undefined],
      ['VF', undefined],
    ]);
    expect(computeProject(useEditor.getState().project).total.vf.total).toBeCloseTo(24);
    expect(computeProject(useEditor.getState().project).total.nuf.total).toBeCloseTo(0);

    const wohnung = feld('Wohnung').querySelector('input')!;
    act(() => {
      wohnung.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(wohnung, 'we01');
      wohnung.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => wohnung.blur());
    const wohnungen = useEditor.getState().project.storeys[0].shapes.flatMap((s) => (s.kind === 'room' ? [s.wofl.wohnung] : []));
    expect(wohnungen).toEqual(['WE 01', 'WE 01']);
  });
});

describe('QUADRIO: Flächenaufstellung am Bildschirm', () => {
  it('ist ein Dialog: Fokus auf „Schließen“, Esc schließt und gibt den Fokus zurück', () => {
    useEditor.getState().loadProject(createProject('Haus'), null, 'Haus.oap');
    const host = render();
    act(() => [...host.querySelectorAll<HTMLButtonElement>('.pw-einstieg button')].find((x) => x.textContent === 'Schließen')?.click());
    const oeffnen = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Flächenaufstellung …')!;
    act(() => {
      oeffnen.focus();
      oeffnen.click();
    });
    const bericht = host.querySelector<HTMLElement>('.report')!;
    expect([bericht.getAttribute('role'), bericht.getAttribute('aria-modal'), bericht.getAttribute('aria-label')]).toEqual(['dialog', 'true', 'Flächenaufstellung']);
    expect(document.activeElement?.textContent).toBe('Drucken / PDF'); // Erstfokus auf dem Hauptknopf (docs/design.md)
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(host.querySelector('.report')).toBeNull();
    expect(document.activeElement).toBe(oeffnen);
  });
});
