// @vitest-environment happy-dom
import type { FunctionComponent } from 'react';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@core/model';
import { createProject, createStorey } from '@core/model';
import { App } from './App';
import { KatalogDialog } from './components/KatalogDialog';
import { katalogSpeichern, leseKatalog } from './katalog';
import { setKosten, useKosten } from './store';
import { projektMitKosten } from './testdaten';

/** Speichern und IFC-Aktualisieren ohne Dateisystem: Aufrufe mitschneiden, Ergebnis von außen freigeben */
const mock = vi.hoisted(() => ({
  gespeichert: [] as Project[],
  ifc: null as null | { resolve: (r: { project: Project; bericht: string[] } | null) => void },
}));
vi.mock('./datei', async (original) => ({
  ...(await original<typeof import('./datei')>()),
  speichern: async (p: Project, datei: string | null) => {
    mock.gespeichert.push(p);
    return { datei: datei ?? 'Neu.oap', project: p };
  },
  ifcAktualisierenWaehlen: () =>
    new Promise((resolve) => {
      mock.ifc = { resolve };
    }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
function render<P extends object>(el: FunctionComponent<P>, props?: P): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(createElement(el, props));
  });
  return host;
}
const warten = async () => {
  for (let i = 0; i < 5; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};
beforeEach(() => {
  mock.gespeichert = [];
  mock.ifc = null;
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  katalogSpeichern(null);
  vi.restoreAllMocks();
});

describe('Zwischenstand, Verlauf und Speichern', () => {
  it('wiederhergestellter Zwischenstand gilt als ungespeichert, „Verwerfen“ setzt auf die Datei zurück', () => {
    const datei = projektMitKosten();
    const geaendert = setKosten(datei, { regionalfaktor: 1.1 });
    useKosten.getState().wiederherstellen(geaendert, 'Haus.oap', datei, new Date(2026, 10, 11, 9, 5).getTime());
    expect(useKosten.getState().dirty).toBe(true);
    const host = render(App);
    expect(host.textContent).toContain('Ungespeicherter Stand vom 11.11.2026 09:05 wiederhergestellt');
    expect(document.title.startsWith('• ')).toBe(true);
    // Gegenprobe: gleicher Inhalt in anderen Objekten gilt als gespeichert, ebenso ein leeres Projekt ohne Datei
    act(() => useKosten.getState().wiederherstellen(structuredClone(datei), 'Haus.oap', datei));
    expect(useKosten.getState().dirty).toBe(false);
    expect(host.textContent).not.toContain('wiederhergestellt');
    useKosten.getState().wiederherstellen(createProject(), null, null);
    expect(useKosten.getState().dirty).toBe(false);
    useKosten.getState().wiederherstellen(geaendert, null, null);
    expect(useKosten.getState().dirty).toBe(true);
    // Verwerfen
    useKosten.getState().wiederherstellen(geaendert, 'Haus.oap', datei);
    act(() => useKosten.getState().verwerfen());
    expect(useKosten.getState().project.kosten?.regionalfaktor).toBeUndefined();
    expect(useKosten.getState().dirty).toBe(false);
    expect(useKosten.getState().wiederhergestellt).toBeNull();
  });

  it('Rückgängig und Wiederholen: Stand und „ungespeichert“', () => {
    const p = projektMitKosten();
    useKosten.getState().load(p, 'Haus.oap', p);
    expect(useKosten.getState().dirty).toBe(false);
    useKosten.getState().update((x) => setKosten(x, { mwst: 7 }));
    expect(useKosten.getState().dirty).toBe(true);
    useKosten.getState().undo();
    expect(useKosten.getState().project).toBe(p);
    useKosten.getState().redo();
    expect(useKosten.getState().project.kosten?.mwst).toBe(7);
    // eine Änderung, die nichts ändert, erzeugt keinen Schritt
    useKosten.getState().update((x) => x);
    expect(useKosten.getState().past).toHaveLength(1);
  });

  it('Strg+S übernimmt den Wert eines Zahlenfelds, das noch nicht verlassen wurde', async () => {
    const p = projektMitKosten();
    useKosten.getState().load(p, 'Haus.oap', p);
    const host = render(App);
    const feld = [...host.querySelectorAll<HTMLInputElement>('input')].find((i) => i.placeholder === '1,000')!;
    act(() => {
      feld.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(feld, '1,25');
      feld.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
    });
    await warten();
    expect(mock.gespeichert).toHaveLength(1);
    expect(mock.gespeichert[0].kosten?.regionalfaktor).toBe(1.25);
    expect(useKosten.getState().dirty).toBe(false);
  });

  it('nach dem Speichern: Weiterarbeiten bleibt ungespeichert, anderes Dokument bleibt unberührt, Änderungen anderer Apps werden übernommen', () => {
    const p = projektMitKosten();
    const s = useKosten.getState();
    // während des Speicherns weitergearbeitet
    s.load(p, 'Haus.oap', p);
    const vorher = useKosten.getState().project;
    s.update((x) => setKosten(x, { mwst: 7 }));
    useKosten.getState().markSaved('Haus.oap', vorher, vorher, useKosten.getState().dokument);
    expect(useKosten.getState().dirty).toBe(true);
    expect(useKosten.getState().project.kosten?.mwst).toBe(7);
    // inzwischen ein anderes Projekt geöffnet: das Ergebnis gehört zum vorigen
    const dok = useKosten.getState().dokument;
    const anderes = { ...createProject(), name: 'Anderes' };
    s.load(anderes, 'Anderes.oap', anderes);
    useKosten.getState().markSaved('Haus.oap', vorher, vorher, dok);
    expect(useKosten.getState().project.name).toBe('Anderes');
    expect(useKosten.getState().datei).toBe('Anderes.oap');
    // eine andere App hat inzwischen ein Geschoss ergänzt: kommt ins Projekt, der Verlauf passt nicht mehr
    s.load(p, 'Haus.oap', p);
    s.update((x) => setKosten(x, { mwst: 7 }));
    const stand = useKosten.getState().project;
    const ausDatei = { ...stand, storeys: [...stand.storeys, createStorey('Spitzboden', 2)] };
    useKosten.getState().markSaved('Haus.oap', ausDatei, stand, useKosten.getState().dokument);
    expect(useKosten.getState().project.storeys.map((x) => x.name)).toContain('Spitzboden');
    expect(useKosten.getState().dirty).toBe(false);
    expect(useKosten.getState().past).toHaveLength(0);
  });

  it('IFC aktualisieren: Änderungen während des Lesens bleiben, das Ergebnis wird verworfen', async () => {
    const p = projektMitKosten();
    useKosten.getState().load(p, 'Haus.oap', p);
    const host = render(App);
    const knopf = [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith('IFC aktualisieren'))!;
    await act(async () => knopf.click());
    expect(mock.ifc).not.toBeNull();
    act(() => useKosten.getState().update((x) => setKosten(x, { mwst: 7 })));
    await act(async () => mock.ifc!.resolve({ project: { ...p, name: 'Aus IFC' }, bericht: ['neu'] }));
    await warten();
    expect(useKosten.getState().project.name).toBe('Kosten-Test');
    expect(useKosten.getState().project.kosten?.mwst).toBe(7);
    expect(host.querySelector('.modal.rf')?.textContent).toContain('IFC nicht übernommen');
    // Gegenprobe: ohne Änderung wird das Ergebnis übernommen
    act(() => (host.querySelector('.modal.rf button') as HTMLButtonElement).click());
    await warten();
    await act(async () => knopf.click());
    const stand = useKosten.getState().project;
    await act(async () => mock.ifc!.resolve({ project: { ...stand, name: 'Aus IFC' }, bericht: ['neu'] }));
    await warten();
    expect(useKosten.getState().project.name).toBe('Aus IFC');
  });

  it('Kennwertkatalog: Meldung, wenn der Browserspeicher den Katalog nicht fasst', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const datei = new File(['KG;Bezeichnung;Bezug;Grundlage;von;Mittel;bis\n300;Bauwerk;BGF;;1500;1800;2100'], 'Katalog.csv');
    vi.spyOn(await import('@core/platform/files'), 'pickFile').mockResolvedValue(datei);
    expect(leseKatalog(await datei.text(), datei.name).eintraege).toHaveLength(1);
    useKosten.getState().load(projektMitKosten());
    const host = render(KatalogDialog, { onClose: () => undefined });
    const laden = [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Katalog laden'))!;
    await act(async () => laden.click());
    await warten();
    expect(host.textContent).toContain('zu groß für den Browserspeicher');
  });
});
