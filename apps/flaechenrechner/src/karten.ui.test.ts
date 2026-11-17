// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rectPoints } from '@core/geometry';
import { createOutline, createProject, createRoom } from '@core/model';
import { useEditor } from './store/store';
import { App } from './App';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
function render(): HTMLElement {
  const p = createProject('Haus');
  p.storeys[0].shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 8, y: 5 })));
  p.storeys[0].shapes.push(createRoom(rectPoints({ x: 0, y: 0 }, { x: 4, y: 5 }), '0.01', 'Wohnen'));
  useEditor.getState().loadProject(p, p, 'Haus.oap');
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(createElement(App));
  });
  act(() => [...host.querySelectorAll<HTMLButtonElement>('.pw-einstieg button')].find((x) => x.textContent === 'Schließen')?.click());
  return host;
}
beforeEach(() => localStorage.clear());
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

/** Name einer Karte: über aria-labelledby (h2 im Kopf) oder aria-label */
const name = (el: Element) => {
  const id = el.getAttribute('aria-labelledby');
  return id ? (document.getElementById(id)?.textContent ?? '') : (el.getAttribute('aria-label') ?? '');
};

describe('QUADRIO: Kartenlayout (Richtung C, docs/design.md „Fläche und Karten“)', () => {
  it('Fläche mit drei Bereichen: links die Projektkarte, Mitte die Zeichenkarte, rechts Geschoss über Auswertung – alle benannt', () => {
    const host = render();
    const flaeche = host.querySelector('.app > .flaeche')!;
    expect(flaeche).not.toBeNull();
    const bereiche = [...flaeche.children];
    expect(bereiche).toHaveLength(3);
    const [links, mitte, rechts] = bereiche;
    // links: ziehbare Seitenkarte mit einer benannten Karte, Abschnitte Projekt, Geschosse, Flächen
    expect(links.matches('.leiste')).toBe(true);
    const projekt = links.querySelector(':scope > section.karte')!;
    expect(name(projekt)).toBe('Projekt, Geschosse und Flächen');
    expect([...projekt.querySelectorAll('.karte-rumpf.abschnitte > section h2')].map((h) => h.textContent)).toEqual(['Projekt', 'Geschosse', 'Flächen – EG']);
    expect(links.querySelector(':scope > .leiste-griff')?.getAttribute('aria-label')).toBe('Breite der Projektkarte');
    // Mitte: Zeichenkarte mit Ansicht-Umschalter und Zeichenfläche im Planbereich
    // Hauptbereich der App: genau ein main je Fenster
    expect(mitte.matches('main.karte.zeichen-karte')).toBe(true);
    expect(host.querySelectorAll('main')).toHaveLength(1);
    expect(name(mitte)).toBe('Grundriss');
    expect(mitte.querySelector('.zeichen-flaeche .view-switch')).not.toBeNull();
    expect(mitte.querySelector('.zeichen-flaeche svg.canvas')).not.toBeNull();
    // rechts: Spalte mit zwei Karten, Griff links
    expect(rechts.matches('.leiste')).toBe(true);
    expect(rechts.querySelector(':scope > .leiste-griff.leiste-griff-links')).not.toBeNull();
    const karten = [...rechts.querySelectorAll(':scope > .flaechen-spalte > section.karte')];
    // Name wie ein Vorleseprogramm ihn hört: nur der Titel – das „?“ steht hinter dem h2 (core `hilfe`), nicht darin
    expect(karten.map(name)).toEqual(['Geschoss', 'Auswertung']);
    for (const k of karten) {
      expect(k.querySelector('.karte-kopf h2 button')).toBeNull();
      expect(k.querySelector('.karte-kopf .karte-titel > h2 + .hilfe-knopf')).not.toBeNull();
    }
    // Gegenprobe: die alten Layout-Klassen sind weg
    expect(host.querySelector('.workspace, .sidebar, .sidebar-left, .sidebar-right, main.main')).toBeNull();
  });

  it('die Karte rechts oben folgt der Auswahl (Raum mit Löschen im Kopf), die Auswertung bleibt darunter', () => {
    const host = render();
    const raum = useEditor.getState().project.storeys[0].shapes.find((s) => s.kind === 'room')!;
    act(() => useEditor.getState().select(raum.id));
    const karten = [...host.querySelectorAll('.qu-eigenschaften > section.karte')];
    expect(karten.map((k) => k.querySelector('.karte-kopf h2')?.textContent)).toEqual(['Raum', 'Auswertung']);
    // „?“ hinter dem Titel, Löschen rechts in den Aktionen
    expect(karten[0].querySelector('.karte-titel .hilfe-knopf')).not.toBeNull();
    expect([...karten[0].querySelectorAll('.karte-aktionen button')].map((b) => b.textContent)).toEqual(['Löschen']);
  });

  it('Bedienhinweis, Eingabe, Koordinaten und Maßstab stehen in der Fußzeile der Zeichenkarte, nicht im Planbereich', () => {
    const host = render();
    const karte = host.querySelector('main.zeichen-karte')!;
    const fuss = karte.querySelector(':scope > footer.karte-fuss.zeichen-fuss')!;
    const plan = karte.querySelector(':scope > .zeichen-flaeche')!;
    expect(fuss.querySelector('.hud-zeile .hud-hint-text')?.textContent).toMatch(/Klicken: wählen/);
    expect(fuss.querySelector('button[aria-label="Alle Tastenkürzel …"]')).not.toBeNull();
    expect(fuss.querySelector('button[aria-label="Bedienhinweise ausblenden"]')).not.toBeNull();
    expect(fuss.querySelector('.scalebar[role="img"]')?.getAttribute('aria-label')).toMatch(/^Maßstab: [\d,]+ m$/);
    // Gegenprobe: nichts davon liegt über dem Plan
    expect(plan.querySelector('.hud, .hud-zeile, .hud-hint, .scalebar, .hud-coords')).toBeNull();
    // Koordinaten dauerhaft da (die Fußzeile springt nicht): außerhalb des Plans „–“
    expect(fuss.querySelector('.hud-coords')?.textContent).toBe('–');
    // Koordinaten erscheinen beim Überfahren ebenfalls in der Fußzeile
    act(() => useEditor.getState().setTool('rect'));
    const svg = plan.querySelector('svg.canvas')!;
    act(() => void svg.dispatchEvent(new PointerEvent('pointermove', { clientX: 120, clientY: 80, bubbles: true })));
    expect(fuss.querySelector('.hud-coords')?.textContent).toMatch(/^X [-\d,]+ {2}Y [-\d,]+ m/);
    expect(plan.querySelector('.hud-coords')).toBeNull();
    // ausgeblendeter Hinweis: der Knopf zum Einblenden bleibt in der Fußzeile
    act(() => fuss.querySelector<HTMLButtonElement>('button[aria-label="Bedienhinweise ausblenden"]')!.click());
    expect(fuss.querySelector('.hud-hint-text')).toBeNull();
    expect([...fuss.querySelectorAll('.hud-hint-knopf')].map((b) => b.textContent)).toContain('? Hinweise');
  });

  it('3D-Ansicht: kein Grundriss-Hinweis und kein Maßstab in der Fußzeile, stattdessen die Bedienung der 3D-Ansicht', () => {
    const host = render();
    act(() => useEditor.getState().setMainView('3d'));
    const karte = host.querySelector('main.zeichen-karte')!;
    expect(name(karte)).toBe('3D-Ansicht');
    const fuss = karte.querySelector(':scope > footer.zeichen-fuss')!;
    expect(fuss.querySelector('.scalebar, .hud-zeile')).toBeNull();
    expect(fuss.querySelector('.qu-fuss-text')?.textContent).toMatch(/drehen/);
    // zurück: Hinweis und Maßstab wieder da
    act(() => useEditor.getState().setMainView('2d'));
    expect(fuss.querySelector('.scalebar')).not.toBeNull();
    expect(fuss.querySelector('.qu-fuss-text')).toBeNull();
  });

  it('Auswertung: gemeinsame Zahlentabelle .summary-table, Kennzahlen-Verhältnis in der Fußzeile der Karte', () => {
    localStorage.setItem('arch-flaechen-tool:auswertung-offen', '1');
    const host = render();
    const auswertung = host.querySelector('.qu-auswertung')!;
    const tabelle = auswertung.querySelector('.karte-rumpf table')!;
    expect(tabelle.className).toBe('summary-table');
    expect([...tabelle.querySelectorAll('tbody td:first-child')].map((t) => t.textContent)).toEqual(['BGF', 'BRI', 'NUF', 'TF', 'VF', 'NRF', 'KGF', 'WoFl']);
    expect(auswertung.querySelector('.karte-rumpf .pruef-knopf')).not.toBeNull();
    expect(auswertung.querySelector(':scope > footer.karte-fuss')?.textContent).toMatch(/^NRF\/BGF: [\d,]+ % · KGF\/BGF: [\d,]+ %$/);
  });

  it('styles.css: keine eigene Layout-CSS der alten Muster mehr; feste Farben nur noch für Zeichenfläche und Papier', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'styles.css'), 'utf8');
    expect(css).not.toMatch(/\.(sidebar|sidebar-left|sidebar-right|workspace|hud)\s*[{,]/);
    expect(css).not.toMatch(/\.scalebar\s*\{[^}]*position:\s*absolute/);
    // Maßstab und Hinweis in Variablen (hell und dunkel)
    const scalebar = css.match(/\.scalebar(-bar)?\s*\{[^}]*\}/g) ?? [];
    expect(scalebar.length).toBeGreaterThan(1);
    for (const regel of scalebar) expect(regel).not.toMatch(/#[0-9a-f]{3,6}\b|rgba?\(/i);
    // Hinweis in der Fußzeile: Knöpfe schrumpfen nicht (nur der Text kürzt), Fokusrahmen nach innen
    expect(css).toMatch(/\.hud-hint \.hud-hint-knopf\s*\{[^}]*flex:\s*none/);
    expect(css).toMatch(/\.karte-fuss button:focus-visible\s*\{[^}]*outline-offset:\s*-2px/);
  });

  it('Seitenkarten merken ihre Breite (BreitenLeiste, localStorage) – auch nach erneutem Öffnen', () => {
    localStorage.setItem('flaechenrechner:breite:rechts', '360');
    let host = render();
    const rechts = () => host.querySelector<HTMLElement>('.app > .flaeche > .leiste:last-child')!;
    expect(rechts().style.width).toBe('360px');
    act(() => root?.unmount());
    document.body.innerHTML = '';
    host = render();
    expect(rechts().style.width).toBe('360px');
    // per Tastatur am Griff verschmälern (rechte Leiste: → macht schmaler) – die neue Breite wird gespeichert
    const griff = rechts().querySelector<HTMLElement>(':scope > .leiste-griff')!;
    act(() => griff.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(rechts().style.width).toBe('344px');
    expect(localStorage.getItem('flaechenrechner:breite:rechts')).toBe('344');
    // Gegenprobe: ohne gemerkten Wert die Vorgabe (Fenster bis 1280 px: 270 px)
    act(() => root?.unmount());
    document.body.innerHTML = '';
    localStorage.clear();
    expect(window.innerWidth).toBeLessThanOrEqual(1280);
    host = render();
    expect(rechts().style.width).toBe('270px');
  });
});
