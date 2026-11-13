// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { createOutline, createProject } from '@core/model';
import { rectPoints } from '@core/geometry';
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

/** Klick auf die Zeichenfläche (ohne Layout: Bildschirm = Pixel ab links oben) */
function klick(svg: Element, x: number, y: number) {
  act(() => void svg.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: x, clientY: y, bubbles: true })));
  act(() => void svg.dispatchEvent(new PointerEvent('pointerup', { button: 0, clientX: x, clientY: y, bubbles: true })));
}
const taste = (key: string, ctrl = false) => act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: ctrl, bubbles: true })));
const flaechen = () => useEditor.getState().project.storeys[0].shapes.length;

describe('QUADRIO: Zeichenfläche (Einstieg, Rückgängig im Entwurf)', () => {
  it('leere Zeichenfläche zeigt den Einstieg (Plan, IFC, zeichnen); mit Fläche nicht', () => {
    const p = createProject('Leer');
    useEditor.getState().loadProject(p, p, 'Leer.oap');
    const host = render();
    const karte = host.querySelector('.canvas-leer');
    expect(karte?.textContent).toMatch(/Grundriss laden/);
    act(() => [...karte!.querySelectorAll('button')].find((b) => /IFC/.test(b.textContent ?? ''))!.click());
    expect(useEditor.getState().ifcOpen).toBe(true);
    act(() => useEditor.getState().setIfcOpen(false));
    // Gegenprobe: mit einer Fläche kein Einstieg
    act(() => useEditor.getState().update((q) => ({ ...q, storeys: q.storeys.map((s) => ({ ...s, shapes: [createOutline(rectPoints({ x: 0, y: 0 }, { x: 5, y: 4 }))] })) })));
    expect(host.querySelector('.canvas-leer')).toBeNull();
  });

  it('Strg+Z beim Zeichnen nimmt den letzten Entwurfspunkt zurück, die fertige Fläche bleibt; danach wie gewohnt', () => {
    const p = createProject('Haus');
    useEditor.getState().loadProject(p, p, 'Haus.oap');
    const host = render();
    const svg = host.querySelector('svg.canvas')!;
    act(() => useEditor.getState().setTool('rect'));
    klick(svg, 100, 100);
    klick(svg, 300, 260);
    expect(flaechen()).toBe(1);
    act(() => useEditor.getState().setTool('polygon'));
    klick(svg, 400, 100);
    klick(svg, 500, 120);
    expect(host.querySelectorAll('.draft-start, .draft-point').length).toBe(2);
    taste('z', true);
    expect(flaechen()).toBe(1);
    expect(host.querySelectorAll('.draft-start, .draft-point').length).toBe(1);
    taste('z', true);
    expect(host.querySelectorAll('.draft-start, .draft-point').length).toBe(0);
    expect(flaechen()).toBe(1);
    // Gegenprobe: ohne Entwurf macht Strg+Z die letzte Fläche rückgängig
    taste('z', true);
    expect(flaechen()).toBe(0);
  });

  it('Esc verwirft zuerst den Entwurf, eine stehende Messung bleibt', () => {
    const p = createProject('Haus');
    useEditor.getState().loadProject(p, p, 'Haus.oap');
    const host = render();
    const svg = host.querySelector('svg.canvas')!;
    act(() => useEditor.getState().setTool('measure'));
    klick(svg, 100, 100);
    klick(svg, 300, 100);
    taste('Enter');
    expect(host.querySelectorAll('.measure-line').length).toBe(1);
    act(() => useEditor.getState().setTool('polygon'));
    klick(svg, 400, 300);
    taste('Escape');
    expect(host.querySelectorAll('.draft-start').length).toBe(0);
    expect(host.querySelectorAll('.measure-line').length).toBe(1);
    // Gegenprobe: das nächste Esc löscht die Messung
    taste('Escape');
    expect(host.querySelectorAll('.measure-line').length).toBe(0);
  });
});
