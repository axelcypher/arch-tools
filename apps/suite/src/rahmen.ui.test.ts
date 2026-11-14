// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { useRahmen } from './store';
import { useTheme } from '@core/platform/theme';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { APPS } from './apps';
import { logger } from '@core/platform/log';
import { UNGESPEICHERT_MAX } from '@core/platform/rahmen';

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
beforeEach(() => {
  localStorage.clear();
  useRahmen.setState({ tabs: [], aktiv: null, fenster: [], status: {} });
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});
const karte = (host: Element, name: string) => [...host.querySelectorAll('.rahmen-karte')].find((k) => k.textContent?.includes(name)) as HTMLButtonElement;
const knopfMit = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;
const tab = (host: Element, name: string) => [...host.querySelectorAll('.rahmen-tab')].find((k) => k.textContent?.includes(name)) as HTMLElement;

describe('Rahmen-App', () => {
  it('Farbschema: Wahl in einem Tab (localStorage) wirkt sofort im Rahmen', () => {
    render();
    useTheme.getState().setWahl('hell');
    localStorage.setItem('flaechenrechner.theme', 'dunkel');
    window.dispatchEvent(new StorageEvent('storage', { key: 'flaechenrechner.theme' }));
    expect(document.documentElement.dataset.theme).toBe('dunkel');
  });

  it('LEXIO öffnet als Tab; die Einbauliste (scripts/apps-einbauen.mjs) kennt dieselben Apps wie der Rahmen', () => {
    const host = render();
    act(() => karte(host, 'LEXIO').click());
    expect(host.querySelector('iframe')?.getAttribute('src')).toBe('apps/baurecht/index.html?rahmen=tab&app=baurecht');
    // fehlt eine App in der Einbauliste, bliebe ihr Tab im Installer leer
    // (happy-dom: import.meta.url ist keine Datei-URL – der Pfad vom Arbeitsverzeichnis, Stamm oder apps/suite)
    const pfad = ['apps/suite/scripts/apps-einbauen.mjs', 'scripts/apps-einbauen.mjs'].map((x) => resolve(process.cwd(), x)).find(existsSync)!;
    const skript = readFileSync(pfad, 'utf8');
    const einbauen = JSON.parse(/export const APPS = (\[[^\]]*\])/.exec(skript)![1].replace(/'/g, '"')) as string[];
    expect([...einbauen].sort()).toEqual(APPS.map((a) => a.id).sort());
  });

  it('Apps als Tabs öffnen, wechseln (die anderen bleiben geladen), schließen; offene Tabs bleiben für den nächsten Start', () => {
    const host = render();
    expect(host.querySelectorAll('.rahmen-karte')).toHaveLength(8);
    act(() => karte(host, 'ATLAS').click());
    expect(host.querySelector('iframe')?.getAttribute('src')).toBe('apps/ordner/index.html?rahmen=tab&app=ordner');
    // weitere App über „+“
    act(() => (host.querySelector('button.rahmen-plus') as HTMLButtonElement).click());
    act(() => ([...host.querySelectorAll('.menue button')].find((b) => b.textContent?.includes('PERMIO')) as HTMLButtonElement).click());
    expect([...host.querySelectorAll('.rahmen-tab-name')].map((t) => t.textContent)).toEqual(['ATLAS', 'PERMIO']);
    expect([...host.querySelectorAll('[role="tabpanel"]')].map((f) => f.className)).toEqual(['rahmen-app', 'rahmen-app aktiv']);
    act(() => (tab(host, 'ATLAS').querySelector('[role="tab"]') as HTMLButtonElement).click());
    expect([...host.querySelectorAll('[role="tabpanel"]')].map((f) => f.className)).toEqual(['rahmen-app aktiv', 'rahmen-app']);
    expect(JSON.parse(localStorage.getItem('arch-tools:rahmen')!)).toEqual({ tabs: ['ordner', 'formulare'], aktiv: 'ordner' });
    act(() => (tab(host, 'ATLAS').querySelector('button[title="Schließen (Entf)"]') as HTMLButtonElement).click());
    expect([...host.querySelectorAll('.rahmen-tab-name')].map((t) => t.textContent)).toEqual(['PERMIO']);
    expect(useRahmen.getState().aktiv).toBe('formulare');
  });

  it('Meldungen der App im Tab: Projektname und ungespeicherte Änderungen; Rückfrage beim Schließen', async () => {
    const host = render();
    act(() => karte(host, 'QUADRIO').click());
    const f = host.querySelector('iframe')!;
    // happy-dom lädt keine iframes: Ersatz für das Fenster des Tabs (Absender der Meldungen)
    Object.defineProperty(f, 'contentWindow', { value: { postMessage: () => {} }, configurable: true });
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { typ: 'arch-tools:status', app: 'QUADRIO', name: 'EFH Musterweg', dirty: true }, origin: window.location.origin, source: f.contentWindow }));
    });
    expect(tab(host, 'QUADRIO').textContent).toContain('EFH Musterweg');
    expect(tab(host, 'QUADRIO').querySelector('.rahmen-tab-dirty')).toBeTruthy();
    // fremde Herkunft zählt nicht
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { typ: 'arch-tools:status', app: 'X', name: 'fremd', dirty: false }, origin: 'https://example.org', source: f.contentWindow }));
    });
    expect(tab(host, 'QUADRIO').textContent).toContain('EFH Musterweg');
    // Rückfrage mit drei Knöpfen statt window.confirm
    const confirm = vi.fn(() => true);
    window.confirm = confirm;
    act(() => (tab(host, 'QUADRIO').querySelector('button[title="Schließen (Entf)"]') as HTMLButtonElement).click());
    const dialog = () => host.querySelector('.modal.rf');
    expect(dialog()?.textContent).toContain('Änderungen an ‚QUADRIO – EFH Musterweg‘ speichern?');
    // ohne eigenen Satz der App der allgemeine
    expect(dialog()?.textContent).toContain('Das Projekt hat ungespeicherte Änderungen.');
    expect([...dialog()!.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Abbrechen', 'Nicht speichern', 'Speichern']);
    await act(async () => [...dialog()!.querySelectorAll('button')].find((b) => b.textContent === 'Abbrechen')!.click());
    expect(useRahmen.getState().tabs).toEqual(['flaechenrechner']);
    act(() => (tab(host, 'QUADRIO').querySelector('button[title="Schließen (Entf)"]') as HTMLButtonElement).click());
    await act(async () => [...dialog()!.querySelectorAll('button')].find((b) => b.textContent === 'Nicht speichern')!.click());
    expect(useRahmen.getState().tabs).toEqual([]);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('Rückfrage beim Schließen mit dem Satz der App (ungespeichert); leer oder überlang: der allgemeine', async () => {
    const host = render();
    act(() => karte(host, 'FABRIO').click());
    const f = host.querySelector('iframe')!;
    Object.defineProperty(f, 'contentWindow', { value: { postMessage: () => {} }, configurable: true });
    const melden = (ungespeichert: unknown) =>
      act(() =>
        window.dispatchEvent(
          new MessageEvent('message', { data: { typ: 'arch-tools:status', app: 'FABRIO', name: 'LV 1', dirty: true, ungespeichert }, origin: window.location.origin, source: f.contentWindow }),
        ),
      );
    const dialog = () => host.querySelector('.modal.rf');
    const schliessenUndAbbrechen = async () => {
      act(() => (tab(host, 'FABRIO').querySelector('button[title="Schließen (Entf)"]') as HTMLButtonElement).click());
      const text = dialog()?.textContent;
      await act(async () => [...dialog()!.querySelectorAll('button')].find((b) => b.textContent === 'Abbrechen')!.click());
      return text;
    };
    melden('  Das LV hat ungespeicherte Änderungen. ');
    expect(useRahmen.getState().status.ava).toEqual({ name: 'LV 1', dirty: true, ungespeichert: 'Das LV hat ungespeicherte Änderungen.' });
    const mitSatz = await schliessenUndAbbrechen();
    expect(mitSatz).toContain('Das LV hat ungespeicherte Änderungen.');
    expect(mitSatz).not.toContain('Das Projekt hat');
    for (const falsch of ['   ', 'x'.repeat(UNGESPEICHERT_MAX + 1), 42]) {
      melden(falsch);
      expect(useRahmen.getState().status.ava).toEqual({ name: 'LV 1', dirty: true });
      expect(await schliessenUndAbbrechen()).toContain('Das Projekt hat ungespeicherte Änderungen.');
    }
    // genau an der Grenze gilt der Satz noch
    melden('x'.repeat(UNGESPEICHERT_MAX));
    expect(useRahmen.getState().status.ava?.ungespeichert).toHaveLength(UNGESPEICHERT_MAX);
    expect(useRahmen.getState().tabs).toEqual(['ava']);
  });

  it('kann die App gerade nicht speichern (kannSpeichern: false): beim Schließen nur Verwerfen oder Abbrechen', async () => {
    const host = render();
    act(() => karte(host, 'LEXIO').click());
    const f = host.querySelector('iframe')!;
    Object.defineProperty(f, 'contentWindow', { value: { postMessage: () => {} }, configurable: true });
    act(() =>
      window.dispatchEvent(
        new MessageEvent('message', { data: { typ: 'arch-tools:status', app: 'LEXIO', name: 'B1', dirty: true, kannSpeichern: false }, origin: window.location.origin, source: f.contentWindow }),
      ),
    );
    expect(useRahmen.getState().status.baurecht).toEqual({ name: 'B1', dirty: true, kannSpeichern: false });
    // kann sie wieder speichern (gleicher Name, weiter geändert), zählt auch das
    const melden = (data: object) => act(() => window.dispatchEvent(new MessageEvent('message', { data, origin: window.location.origin, source: f.contentWindow })));
    melden({ typ: 'arch-tools:status', app: 'LEXIO', name: 'B1', dirty: true });
    expect(useRahmen.getState().status.baurecht).toEqual({ name: 'B1', dirty: true });
    melden({ typ: 'arch-tools:status', app: 'LEXIO', name: 'B1', dirty: true, kannSpeichern: false });
    const dialog = () => host.querySelector('.modal.rf');
    act(() => (tab(host, 'LEXIO').querySelector('button[title="Schließen (Entf)"]') as HTMLButtonElement).click());
    expect(dialog()?.textContent).toContain('Änderungen an ‚LEXIO – B1‘ verwerfen?');
    expect(dialog()?.textContent).toContain('Die Änderungen gehen beim Schließen verloren.');
    expect([...dialog()!.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Abbrechen', 'Verwerfen und schließen']);
    await act(async () => [...dialog()!.querySelectorAll('button')].find((b) => b.textContent === 'Abbrechen')!.click());
    expect(useRahmen.getState().tabs).toEqual(['baurecht']);
    act(() => (tab(host, 'LEXIO').querySelector('button[title="Schließen (Entf)"]') as HTMLButtonElement).click());
    await act(async () => [...dialog()!.querySelectorAll('button')].find((b) => b.textContent === 'Verwerfen und schließen')!.click());
    await act(async () => {});
    expect(useRahmen.getState().tabs).toEqual([]);
  });

  it('Kopfleiste: am Tab nur ×; Farbschema, Speicherort und Fehlerprotokoll im Menü „Einstellungen und Hilfe“, neue Fehler als Marke', async () => {
    const host = render();
    act(() => karte(host, 'QUADRIO').click());
    expect([...tab(host, 'QUADRIO').querySelectorAll('.rahmen-tab-knopf')].map((b) => b.getAttribute('title'))).toEqual(['Schließen (Entf)']);
    const knopf = () => host.querySelector<HTMLButtonElement>('button.titlebar-menue')!;
    expect(knopf().getAttribute('aria-label')).toBe('Einstellungen und Hilfe');
    expect(knopf().getAttribute('aria-haspopup')).toBe('menu');
    // keine eigenen Knöpfe mehr für Protokoll und Farbschema
    expect([...host.querySelectorAll('header button')].map((b) => b.getAttribute('aria-label') ?? b.textContent)).not.toContainEqual(expect.stringMatching(/Protokoll|Farbschema/));
    act(() => knopf().click());
    const punkte = () => [...document.querySelectorAll('.menue [role^="menuitem"]')].map((b) => b.textContent?.trim());
    expect(punkte()).toEqual([expect.stringContaining('Farbschema'), expect.stringContaining('Fehlerprotokoll …')]);
    act(() => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.activeElement).toBe(knopf());
    // neuer Fehler: Marke am Knopf und im Namen; „Fehlerprotokoll …“ öffnet das Protokoll und setzt die Marke zurück
    act(() => logger('test').error('Testfehler'));
    expect(knopf().getAttribute('aria-label')).toBe('Einstellungen und Hilfe – ein neuer Fehler im Fehlerprotokoll');
    expect(knopf().querySelector('.titlebar-badge')?.textContent).toBe('1');
    act(() => knopf().click());
    act(() => ([...document.querySelectorAll('.menue button')].find((b) => b.textContent?.includes('Fehlerprotokoll')) as HTMLButtonElement).click());
    expect(knopf().querySelector('.titlebar-badge')).toBeNull();
    expect(host.querySelector('.modal')).not.toBeNull();
  });

  it('im Browser kein Herauslösen (dort gäbe es kein Andocken); Andocken holt eine App als Tab zurück', () => {
    const host = render();
    act(() => karte(host, 'RECTIO').click());
    act(() => tab(host, 'RECTIO').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 })));
    expect([...document.querySelectorAll('.menue button')].map((b) => b.textContent)).not.toContainEqual(expect.stringContaining('In eigenem Fenster öffnen'));
    act(() => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    act(() => useRahmen.getState().herausgeloest('entzerrung'));
    expect(karte(host, 'RECTIO').textContent).toContain('läuft in eigenem Fenster');
    act(() => useRahmen.getState().angedockt('entzerrung'));
    expect(useRahmen.getState()).toMatchObject({ tabs: ['entzerrung'], aktiv: 'entzerrung', fenster: [] });
  });

  it('Zustand für den nächsten Start: herausgelöste Apps kommen als Tab wieder; kaputter Speicher beginnt leer', () => {
    act(() => useRahmen.getState().oeffnen('grz'));
    act(() => useRahmen.getState().oeffnen('kosten'));
    act(() => useRahmen.getState().herausgeloest('grz'));
    expect(JSON.parse(localStorage.getItem('arch-tools:rahmen')!)).toEqual({ tabs: ['kosten', 'grz'], aktiv: 'kosten' });
    // Nachbar beim Schließen: rechts, sonst links
    act(() => useRahmen.setState({ tabs: ['grz', 'kosten', 'ava'], aktiv: 'kosten', fenster: [] }));
    act(() => useRahmen.getState().schliessen('kosten'));
    expect(useRahmen.getState().aktiv).toBe('ava');
    act(() => useRahmen.getState().schliessen('ava'));
    expect(useRahmen.getState().aktiv).toBe('grz');
  });

  it('Neues Projekt anlegen: aus einer App oder vom Rahmen – der Assistent von ATLAS, danach zurück mit dem neuen Projekt', () => {
    const host = render();
    // je Tab ein eigenes Fenster (happy-dom lädt keine iframes)
    const frame = (id: string) => {
      const f = host.querySelector<HTMLIFrameElement>(`iframe[src^="apps/${id}/"]`)!;
      if (!(f as unknown as { fake?: boolean }).fake) {
        const win = { postMessage: () => {} } as unknown as Window;
        Object.defineProperty(f, 'contentWindow', { value: win, configurable: true });
        (f as unknown as { fake?: boolean }).fake = true;
      }
      return f;
    };
    const melden = (id: string, data: object) => act(() => window.dispatchEvent(new MessageEvent('message', { data, origin: window.location.origin, source: frame(id).contentWindow })));
    act(() => karte(host, 'QUADRIO').click());
    const anFlaechen = vi.spyOn(frame('flaechenrechner').contentWindow!, 'postMessage');
    melden('flaechenrechner', { typ: 'arch-tools:bereit', app: 'flaechenrechner' });
    // Auftrag aus QUADRIO: der Tab von ATLAS öffnet sich, der Auftrag wartet, bis die App hört
    melden('flaechenrechner', { typ: 'arch-tools:projekt-anlegen', von: 'flaechenrechner', kannOeffnen: true, app: 'flaechenrechner' });
    expect(useRahmen.getState()).toMatchObject({ tabs: ['flaechenrechner', 'ordner'], aktiv: 'ordner' });
    const anProjekt = vi.spyOn(frame('ordner').contentWindow!, 'postMessage');
    expect(anProjekt).not.toHaveBeenCalled();
    melden('ordner', { typ: 'arch-tools:bereit', app: 'ordner' });
    expect(anProjekt).toHaveBeenCalledWith({ typ: 'arch-tools:assistent-neu', von: 'flaechenrechner', vonName: 'QUADRIO', kannOeffnen: true, an: 'ordner' }, window.location.origin);
    // angelegt: zurück zu QUADRIO, die App öffnet das Projekt
    melden('ordner', { typ: 'arch-tools:zur-app', an: 'flaechenrechner', ordner: 'P:\\Projekte\\2026-014 Neu', app: 'ordner' });
    expect(useRahmen.getState().aktiv).toBe('flaechenrechner');
    expect(anFlaechen).toHaveBeenCalledWith({ typ: 'arch-tools:projekt-angelegt', ordner: 'P:\\Projekte\\2026-014 Neu', an: 'flaechenrechner' }, window.location.origin);
    // vom Rahmen selbst: „+“-Menü – der Tab von ATLAS hört schon, der Auftrag geht sofort hin
    anProjekt.mockClear();
    act(() => (host.querySelector('button.rahmen-plus') as HTMLButtonElement).click());
    act(() => ([...host.querySelectorAll('.menue button')].find((b) => b.textContent?.includes('Neues Projekt anlegen')) as HTMLButtonElement).click());
    expect(useRahmen.getState().aktiv).toBe('ordner');
    expect(anProjekt).toHaveBeenCalledWith({ typ: 'arch-tools:assistent-neu', von: null, an: 'ordner' }, window.location.origin);
    // unbekannte Apps und fremde Herkunft zählen nicht
    act(() => window.dispatchEvent(new MessageEvent('message', { data: { typ: 'arch-tools:zur-app', an: 'gibtsnicht' }, origin: window.location.origin, source: frame('ordner').contentWindow })));
    act(() => window.dispatchEvent(new MessageEvent('message', { data: { typ: 'arch-tools:projekt-anlegen' }, origin: 'https://example.org', source: frame('flaechenrechner').contentWindow })));
    expect(useRahmen.getState()).toMatchObject({ tabs: ['flaechenrechner', 'ordner'], aktiv: 'ordner' });
  });

  it('Startseite: „Neues Projekt anlegen“ öffnet den Tab von ATLAS mit dem Assistenten', () => {
    const host = render();
    act(() => knopfMit(host, 'Neues Projekt anlegen').click());
    expect(useRahmen.getState()).toMatchObject({ tabs: ['ordner'], aktiv: 'ordner' });
  });

  it('Tabs per Tastatur: nur der gewählte in der Tab-Reihenfolge, ←/→/Pos1/Ende wechseln sofort, Entf schließt; Zustand im Namen', async () => {
    const host = render();
    act(() => useRahmen.getState().oeffnen('grz'));
    act(() => useRahmen.getState().oeffnen('kosten'));
    act(() => useRahmen.getState().oeffnen('ava'));
    const reiter = () => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(reiter().map((r) => r.tabIndex)).toEqual([-1, -1, 0]);
    expect(reiter()[2].getAttribute('aria-controls')).toBe(host.querySelectorAll('[role="tabpanel"]')[2].id);
    const taste = (key: string, extra: KeyboardEventInit = {}) => act(() => (document.activeElement ?? reiter()[0]).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...extra })));
    reiter()[2].focus();
    taste('ArrowRight');
    expect(useRahmen.getState().aktiv).toBe('grz');
    expect(document.activeElement).toBe(reiter()[0]);
    taste('End');
    expect(useRahmen.getState().aktiv).toBe('ava');
    taste('ArrowLeft');
    expect(useRahmen.getState().aktiv).toBe('kosten');
    // ungespeicherte Änderungen stehen im Namen des Tabs (das ● ist nur zu sehen)
    const f = host.querySelector<HTMLIFrameElement>('iframe[src^="apps/kosten/"]')!;
    Object.defineProperty(f, 'contentWindow', { value: { postMessage: () => {} }, configurable: true });
    act(() => window.dispatchEvent(new MessageEvent('message', { data: { typ: 'arch-tools:status', app: 'NUMIO', name: 'K1', dirty: true }, origin: window.location.origin, source: f.contentWindow })));
    expect(reiter()[1].getAttribute('aria-label')).toBe('NUMIO (Kostenermittlung) – K1, ungespeicherte Änderungen');
    expect(reiter()[1].querySelector('.rahmen-tab-dirty')?.getAttribute('aria-hidden')).toBe('true');
    // Entf schließt (ohne Änderungen sofort); der Fokus geht an den nun gewählten Tab
    reiter()[2].focus();
    await act(async () => void taste('Delete'));
    await act(async () => {});
    expect(useRahmen.getState()).toMatchObject({ tabs: ['grz', 'kosten'], aktiv: 'kosten' });
    expect(document.activeElement).toBe(reiter()[1]);
    // Strg+F4 ebenso – bei Änderungen erst die Rückfrage
    await act(async () => void taste('F4', { ctrlKey: true }));
    expect(host.querySelector('.modal.rf')?.textContent).toContain('Änderungen an ‚NUMIO – K1‘ speichern?');
    await act(async () => [...host.querySelector('.modal.rf')!.querySelectorAll('button')].find((b) => b.textContent === 'Nicht speichern')!.click());
    await act(async () => {});
    expect(useRahmen.getState().tabs).toEqual(['grz']);
    // letzter Tab zu: Fokus an „+“
    reiter()[0].focus();
    await act(async () => void taste('Delete'));
    expect(document.activeElement).toBe(host.querySelector('button.rahmen-plus'));
    // ⧉ und × liegen nicht in der Tab-Reihenfolge (Tastatur: Entf, Kontextmenü)
    expect([...host.querySelectorAll<HTMLButtonElement>('.rahmen-tab-knopf')].every((k) => k.tabIndex === -1)).toBe(true);
  });

  it('Menü „+“: gemeinsames Menü mit Tastatur, Esc schließt und gibt den Fokus zurück; Startseite bei offenem Tab', async () => {
    const host = render();
    const plus = host.querySelector<HTMLButtonElement>('button.rahmen-plus')!;
    expect(plus.getAttribute('aria-label')).toBe('App öffnen');
    expect(plus.getAttribute('aria-haspopup')).toBe('menu');
    act(() => plus.click());
    const menue = () => document.querySelector('.menue');
    expect(menue()?.getAttribute('role')).toBe('menu');
    expect(document.activeElement?.textContent).toContain('Neues Projekt anlegen …');
    // „Neues Projekt anlegen …“ und je App ein Eintrag
    expect([...menue()!.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent?.trim())).toHaveLength(APPS.length + 1);
    act(() => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(document.activeElement?.textContent).toContain('ATLAS');
    act(() => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(menue()).toBeNull();
    expect(document.activeElement).toBe(plus);
    // bei offenem Tab: „Startseite“ zeigt die Übersicht, der Tab bleibt
    act(() => useRahmen.getState().oeffnen('grz'));
    act(() => plus.click());
    act(() => ([...menue()!.querySelectorAll('button')].find((b) => b.textContent?.includes('Startseite')) as HTMLButtonElement).click());
    expect(useRahmen.getState()).toMatchObject({ tabs: ['grz'], aktiv: null });
    expect(host.querySelector('.rahmen-start')).not.toBeNull();
  });

  it('Kontextmenü am Tab: Schließen, Andere schließen', async () => {
    const host = render();
    act(() => useRahmen.getState().oeffnen('grz'));
    act(() => useRahmen.getState().oeffnen('kosten'));
    act(() => useRahmen.getState().oeffnen('ava'));
    act(() => tab(host, 'NUMIO').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 })));
    const punkte = [...document.querySelectorAll('.menue [role="menuitem"]')].map((b) => b.textContent?.trim());
    expect(punkte).toEqual(['SchließenEntf / Strg+F4', 'Andere schließen']);
    // Tastenkürzel als aria-keyshortcuts, nicht im Namen
    expect(document.querySelector('.menue [role="menuitem"]')?.getAttribute('aria-keyshortcuts')).toBe('Delete Control+F4');
    await act(async () => ([...document.querySelectorAll('.menue button')].find((b) => b.textContent === 'Andere schließen') as HTMLButtonElement).click());
    expect(useRahmen.getState()).toMatchObject({ tabs: ['kosten'], aktiv: 'kosten' });
    // mit Änderungen: Rückfrage, Abbrechen hört auf (der Tab mit Änderungen ist gewählt und bleibt)
    act(() => useRahmen.getState().oeffnen('grz'));
    act(() => useRahmen.getState().oeffnen('ava'));
    act(() => useRahmen.getState().setStatus('grz', { name: 'N1', dirty: true }));
    act(() => tab(host, 'FABRIO').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 })));
    await act(async () => ([...document.querySelectorAll('.menue button')].find((b) => b.textContent === 'Andere schließen') as HTMLButtonElement).click());
    expect(host.querySelector('.modal.rf')?.textContent).toContain('TERRIO – N1');
    await act(async () => [...host.querySelector('.modal.rf')!.querySelectorAll('button')].find((b) => b.textContent === 'Abbrechen')!.click());
    await act(async () => {});
    expect(useRahmen.getState()).toMatchObject({ tabs: ['grz', 'ava'], aktiv: 'grz' });
  });
});
