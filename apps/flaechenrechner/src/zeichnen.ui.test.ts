// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createOutline, createProject, createRoom } from '@core/model';
import { rectPoints } from '@core/geometry';
import { ablageLeeren, flaechenLoeschen, rueckgaengig, useEditor } from './store/store';
import { App } from './App';
import { nutzungInfo } from '@core/norms';
import { planFuellungDunkel } from '@core/planFarbe';
import { useTheme } from '@core/platform/theme';

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

describe('QUADRIO: Kontextmenü der Zeichenfläche und Werkzeugleiste (gemeinsames Menü und Symbole)', () => {
  beforeEach(() => ablageLeeren());
  const rechtsklick = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('contextmenu', { clientX: 120, clientY: 80, bubbles: true, cancelable: true })));
  const menue = () => document.querySelector('.menue[role="menu"]');
  const punkt = (text: RegExp) => [...document.querySelectorAll<HTMLButtonElement>('.menue [role="menuitem"]')].find((b) => text.test(b.textContent ?? ''))!;

  it('Rechtsklick auf einen Eckpunkt: „Punkt löschen“ im Menü; beim Dreieck gesperrt mit Grund', () => {
    const p = createProject('Haus');
    p.storeys[0].shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 5, y: 4 })));
    useEditor.getState().loadProject(p, p, 'Haus.oap');
    const host = render();
    act(() => useEditor.getState().select(useEditor.getState().project.storeys[0].shapes[0].id));
    rechtsklick(host.querySelector('.vertex-handle')!.parentElement!);
    expect(menue()?.getAttribute('aria-label')).toBe('Eckpunkt');
    // Erstfokus nie auf dem Gefahr-Punkt: ungefährliche Flächenbefehle vorn, „Punkt löschen“ zuletzt hinter Trenner
    expect(document.activeElement?.textContent).toMatch(/Fläche kopieren/);
    const kinder = [...menue()!.children];
    expect(kinder.at(-1)?.textContent).toMatch(/Punkt 1 löschen/);
    expect(kinder.at(-2)?.getAttribute('role')).toBe('separator');
    act(() => punkt(/Punkt 1 löschen/).click());
    expect(useEditor.getState().project.storeys[0].shapes[0].points).toHaveLength(3);
    // Gegenprobe: mit drei Punkten gesperrt, Grund im Tooltip, nichts gelöscht
    rechtsklick(host.querySelector('.vertex-handle')!.parentElement!);
    const gesperrt = punkt(/Punkt 1 löschen/);
    expect(gesperrt.getAttribute('aria-disabled')).toBe('true');
    expect(gesperrt.title).toMatch(/mindestens drei Punkte/);
    act(() => gesperrt.click());
    expect(useEditor.getState().project.storeys[0].shapes[0].points).toHaveLength(3);
  });

  it('Rechtsklick auf eine Fläche wählt sie: Kopieren, Duplizieren, Löschen; Einfügen erst nach Kopieren', () => {
    const p = createProject('Haus');
    p.storeys[0].shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 5, y: 4 })));
    useEditor.getState().loadProject(p, p, 'Haus.oap');
    const host = render();
    const flaeche = host.querySelector('svg.canvas path[fill-rule="evenodd"]')!;
    rechtsklick(flaeche);
    expect(useEditor.getState().selectedShapeId).toBe(useEditor.getState().project.storeys[0].shapes[0].id);
    expect(menue()?.getAttribute('aria-label')).toBe('BGF-Umriss');
    const gesperrt = punkt(/Einfügen/);
    expect(gesperrt.getAttribute('aria-disabled')).toBe('true');
    expect(gesperrt.textContent).toMatch(/Nichts kopiert/);
    expect(gesperrt.hasAttribute('aria-keyshortcuts')).toBe(false); // gesperrt: Grund statt Kürzel
    // Kürzel als tasten (vorgelesen), Löschen zuletzt hinter dem Trenner
    expect(punkt(/Fläche kopieren/).getAttribute('aria-keyshortcuts')).toBe('Control+C');
    expect(punkt(/Fläche duplizieren/).getAttribute('aria-keyshortcuts')).toBe('Control+D');
    const kinder = [...menue()!.children];
    expect(kinder.at(-1)?.classList.contains('gefahr')).toBe(true);
    expect(kinder.at(-1)?.getAttribute('aria-keyshortcuts')).toBe('Delete');
    expect(kinder.at(-2)?.getAttribute('role')).toBe('separator');
    act(() => punkt(/Fläche kopieren/).click());
    rechtsklick(flaeche);
    expect(punkt(/Einfügen/).getAttribute('aria-disabled')).toBeNull();
    expect(punkt(/Einfügen/).getAttribute('aria-keyshortcuts')).toBe('Control+V');
    act(() => punkt(/Einfügen/).click());
    expect(flaechen()).toBe(2);
    rechtsklick(flaeche);
    act(() => punkt(/Fläche duplizieren/).click());
    expect(flaechen()).toBe(3);
    rechtsklick(flaeche);
    act(() => punkt(/löschen/).click());
    expect(flaechen()).toBe(2);
  });

  it('Kontextmenütaste auf der Zeichenfläche mit Auswahl: Flächenmenü; Esc schließt nur das Menü, Fokus zurück auf die Zeichenfläche', () => {
    const p = createProject('Haus');
    p.storeys[0].shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 5, y: 4 })));
    useEditor.getState().loadProject(p, p, 'Haus.oap');
    const host = render();
    const svg = host.querySelector<SVGSVGElement>('svg.canvas')!;
    const id = useEditor.getState().project.storeys[0].shapes[0].id;
    act(() => useEditor.getState().select(id));
    svg.focus();
    // Kontextmenütaste: ohne Mausposition
    act(() => void svg.dispatchEvent(new MouseEvent('contextmenu', { clientX: 0, clientY: 0, bubbles: true, cancelable: true })));
    expect(punkt(/Fläche kopieren/)).toBeDefined();
    act(() => void document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(menue()).toBeNull();
    expect(useEditor.getState().selectedShapeId).toBe(id); // Auswahl bleibt
    expect(document.activeElement).toBe(svg);
    // Gegenprobe: ohne Auswahl das Menü der leeren Zeichenfläche
    act(() => useEditor.getState().select(null));
    act(() => void svg.dispatchEvent(new MouseEvent('contextmenu', { clientX: 0, clientY: 0, bubbles: true, cancelable: true })));
    expect(menue()?.getAttribute('aria-label')).toBe('Zeichenfläche');
    expect(punkt(/Alles zeigen/).getAttribute('aria-keyshortcuts')).toBe('F');
    act(() => void document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  });

  it('in einem Zeichenwerkzeug erscheint beim Rechtsklick kein Menü', () => {
    const p = createProject('Haus');
    p.storeys[0].shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 5, y: 4 })));
    useEditor.getState().loadProject(p, p, 'Haus.oap');
    const host = render();
    act(() => useEditor.getState().setTool('polygon'));
    rechtsklick(host.querySelector('svg.canvas path[fill-rule="evenodd"]')!);
    rechtsklick(host.querySelector('svg.canvas')!);
    expect(menue()).toBeNull();
  });

  it('flaechenLoeschen löscht im aktiven Geschoss, andere Geschosse bleiben', () => {
    const p = createProject('Haus');
    const og = { ...createProject('x').storeys[0], id: 'og', name: 'OG', shapes: [createOutline(rectPoints({ x: 0, y: 0 }, { x: 5, y: 4 }))] };
    p.storeys[0].shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 5, y: 4 })));
    p.storeys.push(og);
    useEditor.getState().loadProject(p, p, 'Haus.oap');
    act(() => useEditor.getState().setActiveStorey('og'));
    act(() => useEditor.getState().select(og.shapes[0].id));
    expect(flaechenLoeschen()).toBe(1);
    const [eg, og2] = useEditor.getState().project.storeys;
    expect(og2.shapes).toHaveLength(0);
    expect(eg.shapes).toHaveLength(1);
    const schritte = useEditor.getState().past.length;
    expect(flaechenLoeschen()).toBe(0); // Gegenprobe: ohne Auswahl kein (leerer) Rückgängig-Schritt
    expect(useEditor.getState().past.length).toBe(schritte);
  });

  it('Werkzeugleiste mit SVG-Symbolen statt Schriftzeichen; reine Symbolknöpfe haben einen Namen', () => {
    useEditor.getState().loadProject(createProject('Haus'), null, 'Haus.oap');
    const host = render();
    const leiste = host.querySelector('.toolbar')!;
    expect(leiste.textContent).not.toMatch(/[⬉⬠▭⊡↔⇔↶↷📏]/);
    expect(leiste.querySelectorAll('svg.symbol').length).toBeGreaterThanOrEqual(12);
    for (const name of ['Rückgängig', 'Wiederholen', 'Neu', 'Öffnen …', 'Speichern']) expect(leiste.querySelector(`button[aria-label="${name}"]`)).not.toBeNull();
  });
});

describe('QUADRIO: Raumfüllung auf der dunklen Zeichenfläche', () => {
  let vorher: ReturnType<typeof useTheme.getState>;
  beforeEach(() => {
    vorher = useTheme.getState();
    act(() => useTheme.setState({ theme: 'hell', canvasDunkel: true }));
  });
  afterEach(() => act(() => useTheme.setState(vorher, true)));

  it('gefiltert (dunkles Schema, Zeichenfläche abgedunkelt): Füllung vorgerechnet; hell bzw. ohne Filter die Nutzungsfarbe', () => {
    const p = createProject('Haus');
    p.storeys[0].shapes.push(createRoom(rectPoints({ x: 0, y: 0 }, { x: 4, y: 4 }), '0.01', 'Wohnen'));
    useEditor.getState().loadProject(p, p, 'Haus.oap');
    const marke = nutzungInfo('NUF1').color;
    const host = render();
    const raum = () => host.querySelector<SVGPathElement>('svg.canvas path[fill-rule="evenodd"]')!;
    expect(raum().getAttribute('fill')).toBe(marke);
    expect(raum().getAttribute('fill-opacity')).toBe('0.45');
    act(() => useTheme.setState({ theme: 'dunkel', canvasDunkel: true }));
    const dunkel = planFuellungDunkel(marke, 0.45);
    expect(raum().getAttribute('fill')).toBe(dunkel.farbe);
    expect(raum().getAttribute('fill-opacity')).toBe(String(dunkel.deckung));
    expect(dunkel.farbe).not.toBe(marke);
    // Gegenprobe: dunkles Schema, aber Zeichenfläche hell gelassen – kein Filter, also die Nutzungsfarbe
    act(() => useTheme.setState({ theme: 'dunkel', canvasDunkel: false }));
    expect(raum().getAttribute('fill')).toBe(marke);
  });
});
