// @vitest-environment happy-dom
// Rahmen-App auf dem Desktop: Herauslösen, Andocken, Beenden (auch über das System), Update – mit nachgebauten Tauri-APIs
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fenster = vi.hoisted(() => ({
  haupt: null as null | { schliessenAngefragt?: (e: { preventDefault: () => void }) => void; destroy: ReturnType<typeof import('vitest').vi.fn> },
  offen: new Map<string, { label: string; opts: unknown; ereignisse: Map<string, () => void>; destroy: () => Promise<void> }>(),
}));
const sperren = vi.hoisted(() => ({ frei: [] as string[] }));
const update = vi.hoisted(() => ({ vorInstallation: undefined as undefined | (() => Promise<boolean>), dirty: false }));

// Ereignisse laufen über den echten Weg (@tauri-apps/api/event) mit nachgebautem IPC (mockIPC); Fenster sind nachgebaut
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => {
    fenster.haupt ??= {
      destroy: vi.fn(async () => {}),
    };
    return Object.assign(fenster.haupt, {
      isMaximized: async () => false,
      onResized: async () => () => {},
      onCloseRequested: async (h: (e: { preventDefault: () => void }) => void) => {
        fenster.haupt!.schliessenAngefragt = h;
        return () => {};
      },
      minimize: async () => {},
      toggleMaximize: async () => {},
    });
  },
}));
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: class {
    label: string;
    ereignisse = new Map<string, () => void>();
    constructor(label: string, opts: unknown) {
      this.label = label;
      fenster.offen.set(label, { label, opts, ereignisse: this.ereignisse, destroy: () => this.destroy() });
    }
    static async getByLabel(label: string) {
      return fenster.offen.get(label) ?? null;
    }
    async once(name: string, f: () => void) {
      this.ereignisse.set(name, f);
    }
    async destroy() {
      if (fenster.offen.get(this.label)?.ereignisse === this.ereignisse) fenster.offen.delete(this.label);
      this.ereignisse.get('tauri://destroyed')?.();
    }
  },
}));
vi.mock('./sperren', () => ({ sperrenFreigeben: async (id: string) => void sperren.frei.push(id) }));
vi.mock('@core/ui/UpdateKnopf', () => ({
  UpdateKnopf: (p: { dirty: boolean; vorInstallation?: () => Promise<boolean> }) => {
    update.vorInstallation = p.vorInstallation;
    update.dirty = p.dirty;
    return null;
  },
}));

const { App } = await import('./App');
const { emit, listen } = await import('@tauri-apps/api/event');
const { clearMocks, mockIPC } = await import('@tauri-apps/api/mocks');
const { useRahmen } = await import('./store');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
async function render(): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  await act(async () => {
    root = createRoot(host);
    root.render(createElement(App));
  });
  await act(async () => {});
  return host;
}
beforeEach(() => {
  mockIPC(() => null, { shouldMockEvents: true });
  localStorage.clear();
  fenster.haupt = null;
  fenster.offen.clear();
  sperren.frei.length = 0;
  useRahmen.setState({ tabs: [], aktiv: null, fenster: [], status: {} });
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  clearMocks();
  delete (window as unknown as { __TAURI_INTERNALS__?: object }).__TAURI_INTERNALS__;
  vi.useRealTimers();
});

const tab = (host: Element, name: string) => [...host.querySelectorAll('.rahmen-tab')].find((k) => k.textContent?.includes(name)) as HTMLElement;
const dialog = (host: Element) => host.querySelector('.modal.rf');
const antwort = async (host: Element, knopf: string) => {
  await act(async () => [...dialog(host)!.querySelectorAll('button')].find((b) => b.textContent === knopf)!.click());
  await act(async () => {});
};
/** happy-dom lädt keine iframes: je Tab ein Ersatz für sein Fenster (für Meldungen und Speichern-Anfragen) */
const frame = (host: Element, id: string) => {
  const f = host.querySelector<HTMLIFrameElement>(`iframe[src^="apps/${id}/"]`)!;
  if (!(f as unknown as { ersatz?: boolean }).ersatz) {
    Object.defineProperty(f, 'contentWindow', { value: { postMessage: vi.fn() }, configurable: true });
    (f as unknown as { ersatz?: boolean }).ersatz = true;
  }
  return f;
};
const statusTab = (host: Element, id: string, name: string, dirty: boolean) =>
  act(() => window.dispatchEvent(new MessageEvent('message', { data: { typ: 'arch-tools:status', app: id, name, dirty }, origin: window.location.origin, source: frame(host, id).contentWindow })));
const senden = (name: string, payload: unknown) =>
  act(async () => {
    await emit(name, payload);
    await new Promise((r) => setTimeout(r, 0));
  });
const herausloesen = async (host: Element, name: string) => {
  await act(async () => (tab(host, name).querySelector('button[title="In eigenem Fenster öffnen"]') as HTMLButtonElement).click());
  await act(async () => {});
};
/** herausgelöstes Fenster einer App beantwortet Speichern-Anfragen (wie speichernAnfragenBeantworten im Fenster) */
const fensterSpeichertMit = (kennung: string, ok: boolean) => {
  const anfragen: string[] = [];
  void listen<{ typ: string; anfrage: string; an: string }>('arch-tools:an-app', (e) => {
    const d = e.payload;
    // ausstehendes Schreiben: sofort fertig (wie vorbereitenAnfragenBeantworten ohne Vorbereitungen)
    if (d.typ === 'arch-tools:vorbereiten' && d.an === kennung) void emit('arch-tools:an-rahmen', { typ: 'arch-tools:vorbereitet', anfrage: d.anfrage, ergebnis: 'fertig', app: kennung });
    if (d.typ !== 'arch-tools:speichern' || d.an !== kennung) return;
    anfragen.push(d.anfrage);
    void emit('arch-tools:an-rahmen', { typ: 'arch-tools:speichert', anfrage: d.anfrage, app: kennung }).then(() =>
      emit('arch-tools:an-rahmen', { typ: 'arch-tools:gespeichert', anfrage: d.anfrage, ok, app: kennung }),
    );
  });
  return anfragen;
};

describe('Rahmen-App auf dem Desktop', () => {
  it('Herauslösen: Rückfrage je nach App (ATLAS: Speichern angeboten, QUADRIO: Zwischenstand), eigenes Fenster, Sperren frei', async () => {
    const host = await render();
    act(() => useRahmen.getState().oeffnen('ordner'));
    act(() => useRahmen.getState().oeffnen('flaechenrechner'));
    statusTab(host, 'ordner', 'P1', true);
    statusTab(host, 'flaechenrechner', 'EFH', true);
    await herausloesen(host, 'ATLAS');
    expect(dialog(host)?.textContent).toContain('Änderungen an „ATLAS – P1“ speichern?');
    expect(dialog(host)?.textContent).toContain('Beim Herauslösen startet die App neu');
    await antwort(host, 'Abbrechen');
    expect(useRahmen.getState().tabs).toEqual(['ordner', 'flaechenrechner']);
    await herausloesen(host, 'ATLAS');
    await antwort(host, 'Nicht speichern');
    expect(useRahmen.getState()).toMatchObject({ tabs: ['flaechenrechner'], fenster: ['ordner'] });
    expect(fenster.offen.get('app-ordner')?.opts).toMatchObject({ url: 'apps/ordner/index.html?rahmen=fenster&app=ordner', decorations: false });
    expect(sperren.frei).toEqual(['ordner']);
    // QUADRIO verliert nichts: nur Bestätigen, kein Speichern
    await herausloesen(host, 'QUADRIO');
    expect(dialog(host)?.textContent).toContain('QUADRIO herauslösen?');
    expect([...dialog(host)!.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Abbrechen', 'Herauslösen']);
    await antwort(host, 'Herauslösen');
    expect(useRahmen.getState().fenster).toEqual(['ordner', 'flaechenrechner']);
    // für den nächsten Start: herausgelöste Apps kommen als Tab wieder
    expect(JSON.parse(localStorage.getItem('arch-tools:rahmen')!).tabs).toEqual(['ordner', 'flaechenrechner']);
  });

  it('Andocken: erst Sperren frei, dann der Tab; das alte Fenster stört ein neues Herauslösen nicht', async () => {
    const host = await render();
    act(() => useRahmen.getState().oeffnen('formulare'));
    await herausloesen(host, 'PERMIO');
    expect(useRahmen.getState().fenster).toEqual(['formulare']);
    sperren.frei.length = 0;
    await senden('arch-tools:andocken', { app: 'formulare' });
    expect(useRahmen.getState()).toMatchObject({ tabs: ['formulare'], aktiv: 'formulare', fenster: [] });
    expect(sperren.frei).toEqual(['formulare']);
    // sofort wieder herauslösen, bevor das alte Fenster weg ist: es wird ersetzt, sein Ende zählt nicht
    await herausloesen(host, 'PERMIO');
    expect(useRahmen.getState().fenster).toEqual(['formulare']);
    expect(fenster.offen.has('app-formulare')).toBe(true);
    // das Ende des neuen Fensters (Schließen dort) gibt die Sperren frei
    sperren.frei.length = 0;
    await act(async () => fenster.offen.get('app-formulare')!.destroy());
    expect(useRahmen.getState().fenster).toEqual([]);
    expect(sperren.frei).toEqual(['formulare']);
  });

  it('Beenden über das System (Alt+F4): Rückfrage je Tab und Fenster, Speichern im Fenster, dann alle Fenster zu', async () => {
    const host = await render();
    act(() => useRahmen.getState().oeffnen('kosten'));
    act(() => useRahmen.getState().oeffnen('ordner'));
    await herausloesen(host, 'ATLAS');
    // das Fenster meldet Projekt und Änderungen; der Tab ebenso
    await senden('arch-tools:an-rahmen', { typ: 'arch-tools:status', app: 'ATLAS', kennung: 'ordner', name: 'P1', dirty: true });
    statusTab(host, 'kosten', 'Kosten 1', true);
    expect(useRahmen.getState().status.ordner).toEqual({ name: 'P1', dirty: true });
    expect(update.dirty).toBe(true);
    const verhindert = vi.fn();
    await act(async () => fenster.haupt!.schliessenAngefragt!({ preventDefault: verhindert }));
    expect(verhindert).toHaveBeenCalled();
    expect(dialog(host)?.textContent).toContain('Änderungen an „NUMIO – Kosten 1“ speichern?');
    await antwort(host, 'Nicht speichern');
    expect(dialog(host)?.textContent).toContain('Änderungen an „ATLAS – P1“ speichern?');
    // Abbrechen: nichts wird geschlossen
    await antwort(host, 'Abbrechen');
    expect(fenster.haupt!.destroy).not.toHaveBeenCalled();
    expect(fenster.offen.has('app-ordner')).toBe(true);
    // noch einmal: Speichern lässt das Fenster speichern; danach schließt alles
    const anfragen = fensterSpeichertMit('ordner', true);
    await act(async () => fenster.haupt!.schliessenAngefragt!({ preventDefault: () => {} }));
    await antwort(host, 'Nicht speichern');
    await antwort(host, 'Speichern');
    await act(async () => {});
    expect(anfragen).toHaveLength(1);
    expect(fenster.offen.has('app-ordner')).toBe(false);
    expect(fenster.haupt!.destroy).toHaveBeenCalled();
  });

  it('Fenster schließt, während es speichert: die Rückfrage endet, Beenden bleibt möglich', async () => {
    const host = await render();
    act(() => useRahmen.getState().oeffnen('kosten'));
    await herausloesen(host, 'NUMIO');
    await senden('arch-tools:an-rahmen', { typ: 'arch-tools:status', app: 'NUMIO', kennung: 'kosten', name: 'K1', dirty: true });
    // das Fenster bestätigt nur (Speichern-Dialog offen) und wird dann über sein eigenes × geschlossen
    void listen<{ typ: string; anfrage: string; an: string }>('arch-tools:an-app', (e) => {
      if (e.payload.typ === 'arch-tools:speichern') void emit('arch-tools:an-rahmen', { typ: 'arch-tools:speichert', anfrage: e.payload.anfrage, app: 'kosten' });
    });
    await act(async () => fenster.haupt!.schliessenAngefragt!({ preventDefault: () => {} }));
    await antwort(host, 'Speichern');
    await senden('x', null);
    expect(fenster.haupt!.destroy).not.toHaveBeenCalled();
    await act(async () => fenster.offen.get('app-kosten')!.destroy());
    await act(async () => {});
    // nicht gespeichert: nichts geschlossen; ein neues Beenden geht (das Fenster ist weg, keine Rückfrage mehr)
    expect(fenster.haupt!.destroy).not.toHaveBeenCalled();
    await act(async () => fenster.haupt!.schliessenAngefragt!({ preventDefault: () => {} }));
    await act(async () => {});
    expect(fenster.haupt!.destroy).toHaveBeenCalled();
  });

  it('Kontextmenü am Tab: „In eigenem Fenster öffnen“ löst heraus', async () => {
    const host = await render();
    act(() => useRahmen.getState().oeffnen('entzerrung'));
    act(() => tab(host, 'RECTIO').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 })));
    await act(async () => ([...document.querySelectorAll('.menue button')].find((b) => b.textContent?.includes('In eigenem Fenster öffnen')) as HTMLButtonElement).click());
    await act(async () => {});
    expect(useRahmen.getState()).toMatchObject({ tabs: [], fenster: ['entzerrung'] });
    expect(fenster.offen.has('app-entzerrung')).toBe(true);
  });

  it('ausstehendes Schreiben im Tab (vorDemSchliessen): Schließen wartet darauf; hängt es, Rückfrage „speichert noch“', async () => {
    const host = await render();
    act(() => useRahmen.getState().oeffnen('ordner'));
    const f = frame(host, 'ordner');
    let schreiben: (() => void) | undefined;
    const vorbereiten = vi.fn((ms: number) => new Promise<string>((fertig) => (schreiben = () => fertig(ms > 0 ? 'fertig' : 'fehler'))));
    Object.assign(f.contentWindow!, { __archToolsVorbereiten: vorbereiten, __archToolsVorbereitenNoetig: () => true });
    await act(async () => (tab(host, 'ATLAS').querySelector('button[title="Schließen (Entf)"]') as HTMLButtonElement).click());
    // wartet: der Tab ist noch da, bis das Schreiben fertig ist
    expect(vorbereiten).toHaveBeenCalledWith(5000);
    expect(useRahmen.getState().tabs).toEqual(['ordner']);
    await act(async () => schreiben!());
    await act(async () => {});
    expect(useRahmen.getState().tabs).toEqual([]);
    // hängt es (Zeitlimit): Rückfrage, Abbrechen lässt den Tab offen
    act(() => useRahmen.getState().oeffnen('ordner'));
    const g = frame(host, 'ordner');
    Object.assign(g.contentWindow!, { __archToolsVorbereiten: async () => 'zeitlimit', __archToolsVorbereitenNoetig: () => true });
    await act(async () => (tab(host, 'ATLAS').querySelector('button[title="Schließen (Entf)"]') as HTMLButtonElement).click());
    await act(async () => {});
    expect(dialog(host)?.textContent).toContain('ATLAS speichert noch');
    // Hauptknopf (Enter, Erstfokus) ist „Weiter warten“, nie der Gefahr-Knopf
    expect([...dialog(host)!.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Abbrechen', 'Trotzdem schließen', 'Weiter warten']);
    expect(dialog(host)!.querySelector('button[type="submit"]')?.textContent).toBe('Weiter warten');
    await antwort(host, 'Weiter warten');
    expect(dialog(host)?.textContent).toContain('ATLAS speichert noch');
    await antwort(host, 'Abbrechen');
    expect(useRahmen.getState().tabs).toEqual(['ordner']);
    await act(async () => (tab(host, 'ATLAS').querySelector('button[title="Schließen (Entf)"]') as HTMLButtonElement).click());
    await act(async () => {});
    await antwort(host, 'Trotzdem schließen');
    expect(useRahmen.getState().tabs).toEqual([]);
  });

  it('Speichern im Tab gescheitert (Netzlaufwerk weg): Rückfrage „konnte nicht speichern“ mit Erneut versuchen', async () => {
    const host = await render();
    act(() => useRahmen.getState().oeffnen('ordner'));
    const f = frame(host, 'ordner');
    const ergebnisse = ['fehler', 'fertig'];
    const vorbereiten = vi.fn(async () => ergebnisse.shift());
    Object.assign(f.contentWindow!, { __archToolsVorbereiten: vorbereiten, __archToolsVorbereitenNoetig: () => true });
    await act(async () => (tab(host, 'ATLAS').querySelector('button[title="Schließen (Entf)"]') as HTMLButtonElement).click());
    await act(async () => {});
    expect(dialog(host)?.textContent).toContain('ATLAS konnte nicht speichern');
    expect([...dialog(host)!.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Abbrechen', 'Trotzdem schließen', 'Erneut versuchen']);
    expect(dialog(host)!.querySelector('button[type="submit"]')?.textContent).toBe('Erneut versuchen');
    // erneut versuchen: diesmal gelingt es, der Tab schließt
    await antwort(host, 'Erneut versuchen');
    expect(vorbereiten).toHaveBeenCalledTimes(2);
    expect(useRahmen.getState().tabs).toEqual([]);
  });

  it('Beenden mit herausgelöstem Fenster: wartet auf dessen Schreiben; meldet es „nicht fertig“, Rückfrage – Abbrechen beendet nicht', async () => {
    const host = await render();
    act(() => useRahmen.getState().oeffnen('kosten'));
    await herausloesen(host, 'NUMIO');
    // das Fenster hört (bereit) und antwortet auf „vorbereiten“ erst, wenn es soll
    await senden('arch-tools:an-rahmen', { typ: 'arch-tools:bereit', app: 'kosten' });
    let antworten: ((ergebnis: string) => void) | undefined;
    void listen<{ typ: string; anfrage: string; an: string }>('arch-tools:an-app', (e) => {
      const d = e.payload;
      if (d.typ === 'arch-tools:vorbereiten' && d.an === 'kosten') antworten = (ergebnis) => void emit('arch-tools:an-rahmen', { typ: 'arch-tools:vorbereitet', anfrage: d.anfrage, ergebnis, app: 'kosten' });
    });
    await act(async () => fenster.haupt!.schliessenAngefragt!({ preventDefault: () => {} }));
    await senden('x', null);
    expect(antworten).toBeDefined();
    expect(fenster.haupt!.destroy).not.toHaveBeenCalled();
    await act(async () => antworten!('zeitlimit'));
    await senden('x', null);
    expect(dialog(host)?.textContent).toContain('NUMIO speichert noch');
    expect(dialog(host)?.textContent).toContain('Trotzdem beenden');
    await antwort(host, 'Abbrechen');
    expect(fenster.haupt!.destroy).not.toHaveBeenCalled();
    // erneut: diesmal fertig – alles schließt
    await act(async () => fenster.haupt!.schliessenAngefragt!({ preventDefault: () => {} }));
    await senden('x', null);
    await act(async () => antworten!('fertig'));
    await senden('x', null);
    expect(fenster.haupt!.destroy).toHaveBeenCalled();
  });

  it('Update: vor der Installation dieselben Rückfragen; Abbrechen verhindert sie', async () => {
    const host = await render();
    act(() => useRahmen.getState().oeffnen('grz'));
    statusTab(host, 'grz', 'Nachweis', true);
    let weiter: Promise<boolean> | undefined;
    await act(async () => void (weiter = update.vorInstallation!()));
    expect(dialog(host)?.textContent).toContain('Änderungen an „TERRIO – Nachweis“ speichern?');
    await antwort(host, 'Abbrechen');
    expect(await weiter).toBe(false);
    expect(fenster.haupt!.destroy).not.toHaveBeenCalled();
  });

  it('Speichern antwortet nicht (App hängt): nach dem Zeitlimit gilt „nicht gespeichert“, der Tab bleibt', async () => {
    const host = await render();
    act(() => useRahmen.getState().oeffnen('entzerrung'));
    statusTab(host, 'entzerrung', 'Foto', true);
    vi.useFakeTimers();
    await act(async () => (tab(host, 'RECTIO').querySelector('button[title="Schließen (Entf)"]') as HTMLButtonElement).click());
    await antwort(host, 'Speichern');
    await act(async () => void vi.advanceTimersByTime(3100));
    await act(async () => {});
    expect(useRahmen.getState().tabs).toEqual(['entzerrung']);
    // der Nutzer erfährt, warum nichts geschieht
    expect(dialog(host)?.textContent).toContain('RECTIO antwortet nicht');
  });

  it('ein geschlossener Tab nimmt wartende Aufträge mit (kein Assistent beim nächsten Öffnen)', async () => {
    const host = await render();
    // „Neues Projekt anlegen“ öffnet ATLAS, das noch nicht hört
    await act(async () => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Neues Projekt anlegen'))!.click());
    expect(useRahmen.getState().tabs).toEqual(['ordner']);
    await act(async () => (tab(host, 'ATLAS').querySelector('button[title="Schließen (Entf)"]') as HTMLButtonElement).click());
    act(() => useRahmen.getState().oeffnen('ordner'));
    const f = frame(host, 'ordner');
    act(() => window.dispatchEvent(new MessageEvent('message', { data: { typ: 'arch-tools:bereit', app: 'ordner' }, origin: window.location.origin, source: f.contentWindow })));
    expect(f.contentWindow!.postMessage).not.toHaveBeenCalled();
  });
});
