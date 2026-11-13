// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { createOutline, createProject } from '@core/model';
import { rectPoints } from '@core/geometry';
import { rueckgaengig, useEditor } from './store/store';
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
// happy-dom kennt kein Pointer-Capture
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;
const ziehen = (el: Element, svg: Element, von: { x: number; y: number }, nach: { x: number; y: number }) => {
  act(() => void el.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: von.x, clientY: von.y, pointerId: 1, bubbles: true })));
  act(() => void svg.dispatchEvent(new PointerEvent('pointermove', { button: 0, clientX: nach.x, clientY: nach.y, pointerId: 1, bubbles: true })));
  act(() => void svg.dispatchEvent(new PointerEvent('pointerup', { button: 0, clientX: nach.x, clientY: nach.y, pointerId: 1, bubbles: true })));
};
const rueckKnopf = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('button[aria-label="Rückgängig"]')!;
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

  it('Knopf ↶ nimmt beim Zeichnen den Entwurfspunkt zurück; in der 3D-Ansicht wirkt er nicht auf den unsichtbaren Entwurf', () => {
    const p = createProject('Haus');
    useEditor.getState().loadProject(p, p, 'Haus.oap');
    const host = render();
    const svg = host.querySelector('svg.canvas')!;
    expect(rueckKnopf(host).disabled).toBe(true);
    act(() => useEditor.getState().setTool('polygon'));
    klick(svg, 100, 100);
    klick(svg, 200, 100);
    expect(rueckKnopf(host).disabled).toBe(false); // nur Entwurf, noch keine Projektänderung
    act(() => rueckKnopf(host).click());
    expect(host.querySelectorAll('.draft-start, .draft-point').length).toBe(1);
    // Gegenprobe: in der 3D-Ansicht ist ↶ gesperrt und Rückgängig lässt den Entwurf stehen
    act(() => useEditor.getState().setMainView('3d'));
    expect(rueckKnopf(host).disabled).toBe(true);
    act(() => rueckgaengig());
    act(() => useEditor.getState().setMainView('2d'));
    expect(host.querySelectorAll('.draft-start, .draft-point').length).toBe(1);
  });

  it('Strg+Z nimmt den letzten Messpunkt zurück; Rückgängig verwirft die Kalibrierstrecke', () => {
    const p = createProject('Haus');
    p.storeys[0].background = { type: 'raster', name: 'plan.png', dataUrl: 'data:,', widthPx: 1000, heightPx: 700, x: 0, y: 0, metersPerPixel: 0.01, opacity: 1, visible: true };
    useEditor.getState().loadProject(p, p, 'Haus.oap');
    const host = render();
    const svg = host.querySelector('svg.canvas')!;
    act(() => useEditor.getState().setTool('measure'));
    klick(svg, 100, 100);
    klick(svg, 300, 100);
    klick(svg, 300, 200);
    const messpunkte = () => host.querySelector('.measure-line')?.parentElement?.querySelectorAll('circle.draft-point').length ?? 0;
    expect(messpunkte()).toBe(3);
    taste('z', true);
    expect(messpunkte()).toBe(2);
    act(() => useEditor.getState().setTool('calibrate'));
    klick(svg, 100, 300);
    klick(svg, 300, 300);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    act(() => rueckgaengig());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('beim Abbau der Zeichenfläche wird der Entwurf abgemeldet', () => {
    const p = createProject('Haus');
    useEditor.getState().loadProject(p, p, 'Haus.oap');
    const host = render();
    act(() => useEditor.getState().setTool('polygon'));
    klick(host.querySelector('svg.canvas')!, 100, 100);
    expect(useEditor.getState().entwurf).toBe(true);
    act(() => root?.unmount());
    root = null;
    expect(useEditor.getState().entwurf).toBe(false);
  });

  it('Eckpunkt ziehen: unter 4 px keine Änderung; darüber wird verschoben und „prüfen“ entfällt', () => {
    const p = createProject('Haus');
    p.storeys[0].shapes.push({ ...createOutline(rectPoints({ x: 0, y: 0 }, { x: 5, y: 4 })), pruefen: true });
    useEditor.getState().loadProject(p, p, 'Haus.oap');
    const host = render();
    const svg = host.querySelector('svg.canvas')!;
    const id = useEditor.getState().project.storeys[0].shapes[0].id;
    act(() => useEditor.getState().select(id));
    const griff = host.querySelector('.griff circle.vertex-handle')!;
    const von = { x: Number(griff.getAttribute('cx')), y: Number(griff.getAttribute('cy')) };
    const umriss = () => useEditor.getState().project.storeys[0].shapes[0] as ReturnType<typeof createOutline>;
    const vorher = umriss().points;
    // Gegenprobe: Zittern unter der Schwelle
    ziehen(griff.parentElement!, svg, von, { x: von.x + 2, y: von.y + 1 });
    expect(umriss().points).toEqual(vorher);
    expect(umriss().pruefen).toBe(true);
    ziehen(host.querySelector('.griff')!, svg, von, { x: von.x + 40, y: von.y });
    expect(umriss().points).not.toEqual(vorher);
    expect(umriss().pruefen).toBeFalsy();
  });
});
