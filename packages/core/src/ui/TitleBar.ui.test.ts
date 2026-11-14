// @vitest-environment happy-dom
// Titelleiste auf dem Desktop: Schließen über das System (Alt+F4) mit Rückfrage; im herausgelösten Fenster der
// Rahmen-App: Andocken mit Rückfrage, Meldungen und Speichern auf Anfrage über Tauri-Ereignisse
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fenster = vi.hoisted(() => ({
  schliessenAngefragt: undefined as undefined | ((e: { preventDefault: () => void }) => void),
  destroy: undefined as undefined | ReturnType<typeof import('vitest').vi.fn>,
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    isMaximized: async () => false,
    onResized: async () => () => {},
    onCloseRequested: async (h: (e: { preventDefault: () => void }) => void) => {
      fenster.schliessenAngefragt = h;
      return () => {};
    },
    destroy: fenster.destroy,
    minimize: async () => {},
    toggleMaximize: async () => {},
  }),
}));

const { TitleBar } = await import('./TitleBar');
const { vorDemSchliessen } = await import('../platform/rahmen');
const { emit, listen } = await import('@tauri-apps/api/event');
const { clearMocks, mockIPC } = await import('@tauri-apps/api/mocks');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
async function render(props: Partial<Parameters<typeof TitleBar>[0]> = {}): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  await act(async () => {
    root = createRoot(host);
    root.render(createElement(TitleBar, { app: 'ATLAS', name: 'P1', dirty: true, onOpenLog: () => {}, ...props }));
  });
  await act(async () => {});
  return host;
}
beforeEach(() => {
  mockIPC(() => null, { shouldMockEvents: true });
  fenster.destroy = vi.fn(async () => {});
  fenster.schliessenAngefragt = undefined;
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  clearMocks();
  delete (window as unknown as { __TAURI_INTERNALS__?: object }).__TAURI_INTERNALS__;
  window.history.replaceState(null, '', '/');
});

const dialog = (host: Element) => host.querySelector('.modal.rf');
const antwort = async (host: Element, knopf: string) => {
  await act(async () => [...dialog(host)!.querySelectorAll('button')].find((b) => b.textContent === knopf)!.click());
  await act(async () => {});
};
const warten = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
/** „Andocken“ steht im Menü der Titelleiste („Einstellungen und Hilfe“) */
const andockenKlicken = async (host: Element) => {
  await act(async () => host.querySelector<HTMLButtonElement>('.titlebar-menue')!.click());
  await act(async () => [...document.querySelectorAll<HTMLButtonElement>('.menue .menue-punkt')].find((b) => b.textContent === 'Andocken')!.click());
};

describe('Titelleiste auf dem Desktop', () => {
  it('Schließen über das System (Alt+F4) fragt bei ungespeicherten Änderungen wie ×; Abbrechen lässt das Fenster offen', async () => {
    const host = await render();
    const verhindert = vi.fn();
    await act(async () => fenster.schliessenAngefragt!({ preventDefault: verhindert }));
    expect(verhindert).toHaveBeenCalled();
    expect(dialog(host)?.textContent).toContain('Änderungen an ‚ATLAS – P1‘ verwerfen?');
    // ein zweites Alt+F4, solange die Rückfrage offen ist, fragt nicht noch einmal
    await act(async () => fenster.schliessenAngefragt!({ preventDefault: () => {} }));
    expect(host.querySelectorAll('.modal.rf')).toHaveLength(1);
    await antwort(host, 'Abbrechen');
    expect(fenster.destroy).not.toHaveBeenCalled();
    await act(async () => fenster.schliessenAngefragt!({ preventDefault: () => {} }));
    await antwort(host, 'Verwerfen und beenden');
    expect(fenster.destroy).toHaveBeenCalled();
  });

  it('mit Speichern: die Rückfrage nennt den Satz der App (ungespeichert), sonst den allgemeinen', async () => {
    const host = await render({ onSpeichern: async () => true, ungespeichert: 'Das LV hat ungespeicherte Änderungen.' });
    await act(async () => fenster.schliessenAngefragt!({ preventDefault: () => {} }));
    expect(dialog(host)?.textContent).toContain('Das LV hat ungespeicherte Änderungen.');
    await antwort(host, 'Abbrechen');
    await act(async () => root!.render(createElement(TitleBar, { app: 'ATLAS', name: 'P1', dirty: true, onOpenLog: () => {}, onSpeichern: async () => true })));
    await act(async () => fenster.schliessenAngefragt!({ preventDefault: () => {} }));
    expect(dialog(host)?.textContent).toContain('Das Projekt hat ungespeicherte Änderungen.');
    await antwort(host, 'Abbrechen');
    // leerer Satz: ebenso der Rückfall
    await act(async () => root!.render(createElement(TitleBar, { app: 'ATLAS', name: 'P1', dirty: true, onOpenLog: () => {}, onSpeichern: async () => true, ungespeichert: ' ' })));
    await act(async () => fenster.schliessenAngefragt!({ preventDefault: () => {} }));
    expect(dialog(host)?.textContent).toContain('Das Projekt hat ungespeicherte Änderungen.');
    await antwort(host, 'Abbrechen');
    expect(fenster.destroy).not.toHaveBeenCalled();
  });

  it('Menü „Einstellungen und Hilfe“: „Update auf … …“ oben, nur solange ein Update vorliegt', async () => {
    const { useUpdate } = await import('../platform/update');
    act(() => useUpdate.setState({ status: 'aktuell', version: undefined }));
    const host = await render({ dirty: false });
    const knopf = () => host.querySelector<HTMLButtonElement>('button.titlebar-menue')!;
    const punkte = () => [...document.querySelectorAll('.menue [role^="menuitem"]')].map((b) => b.textContent?.trim());
    act(() => knopf().click());
    expect(punkte()).not.toContainEqual(expect.stringContaining('Update'));
    act(() => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    act(() => useUpdate.setState({ status: 'verfuegbar', version: '9.9.9' }));
    act(() => knopf().click());
    expect(punkte()[0]).toBe('Update auf 9.9.9 …');
    act(() => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    act(() => useUpdate.setState({ status: 'aktuell', version: undefined }));
  });

  it('ohne Änderungen schließt das Fenster ohne Rückfrage', async () => {
    await render({ dirty: false });
    await act(async () => fenster.schliessenAngefragt!({ preventDefault: () => {} }));
    expect(fenster.destroy).toHaveBeenCalled();
  });

  it('herausgelöstes Fenster: Andocken fragt (ATLAS verliert Änderungen – Speichern angeboten), meldet sich, speichert auf Anfrage', async () => {
    window.history.replaceState(null, '', '/?rahmen=fenster&app=ordner');
    const anRahmen: { typ: string; kennung?: string; dirty?: boolean; anfrage?: string; ok?: boolean }[] = [];
    await listen<(typeof anRahmen)[number]>('arch-tools:an-rahmen', (e) => void anRahmen.push(e.payload));
    const andocken: unknown[] = [];
    await listen('arch-tools:andocken', (e) => void andocken.push(e.payload));
    const speichern = vi.fn(async () => true);
    const host = await render({ onSpeichern: speichern });
    await warten();
    // Meldung an den Rahmen mit Kennung (für die Rückfrage beim Beenden)
    expect(anRahmen).toContainEqual({ typ: 'arch-tools:status', app: 'ATLAS', kennung: 'ordner', name: 'P1', dirty: true });
    // Andocken: Rückfrage mit Speichern, Abbrechen lässt alles, wie es ist
    await andockenKlicken(host);
    expect(dialog(host)?.textContent).toContain('Beim Andocken startet die App neu. Das Projekt hat ungespeicherte Änderungen.');
    await antwort(host, 'Abbrechen');
    expect(andocken).toEqual([]);
    await andockenKlicken(host);
    await antwort(host, 'Speichern');
    await warten();
    expect(speichern).toHaveBeenCalledTimes(1);
    expect(andocken).toEqual([{ app: 'ordner' }]);
    expect(fenster.destroy).toHaveBeenCalled();
    // Speichern auf Anfrage des Rahmens (beim Beenden): Empfang sofort, dann das Ergebnis
    await act(async () => void (await emit('arch-tools:an-app', { typ: 'arch-tools:speichern', anfrage: 'a1', an: 'ordner' })));
    await warten();
    expect(speichern).toHaveBeenCalledTimes(2);
    expect(anRahmen.filter((d) => d.anfrage === 'a1').map((d) => d.typ)).toEqual(['arch-tools:speichert', 'arch-tools:gespeichert']);
    expect(anRahmen.find((d) => d.typ === 'arch-tools:gespeichert')?.ok).toBe(true);
    // an eine andere App gerichtet: nichts
    await act(async () => void (await emit('arch-tools:an-app', { typ: 'arch-tools:speichern', anfrage: 'a2', an: 'kosten' })));
    await warten();
    expect(speichern).toHaveBeenCalledTimes(2);
  });

  it('Meldung an den Rahmen mit dem Satz für dessen Rückfrage (ungespeichert); ohne ihn ohne das Feld; ohne onSpeichern kannSpeichern: false', async () => {
    window.history.replaceState(null, '', '/?rahmen=fenster&app=ava');
    const gemeldet: object[] = [];
    await listen<object>('arch-tools:an-rahmen', (e) => void gemeldet.push(e.payload));
    await render({ app: 'FABRIO', name: 'LV 1', ungespeichert: 'Das LV hat ungespeicherte Änderungen.', onSpeichern: async () => true });
    await warten();
    expect(gemeldet.at(-1)).toEqual({ typ: 'arch-tools:status', app: 'FABRIO', kennung: 'ava', name: 'LV 1', dirty: true, ungespeichert: 'Das LV hat ungespeicherte Änderungen.' });
    await act(async () => root!.render(createElement(TitleBar, { app: 'FABRIO', name: 'LV 1', dirty: true, onOpenLog: () => {}, onSpeichern: async () => true })));
    await warten();
    expect(gemeldet.at(-1)).toEqual({ typ: 'arch-tools:status', app: 'FABRIO', kennung: 'ava', name: 'LV 1', dirty: true });
    // ohne Speicherfunktion: der Rahmen bietet nur Verwerfen an
    await act(async () => root!.render(createElement(TitleBar, { app: 'FABRIO', name: 'LV 1', dirty: true, onOpenLog: () => {} })));
    await warten();
    expect(gemeldet.at(-1)).toEqual({ typ: 'arch-tools:status', app: 'FABRIO', kennung: 'ava', name: 'LV 1', dirty: true, kannSpeichern: false });
  });

  it('Andocken ohne Speichermöglichkeit (verlierende App): Verwerfen-Rückfrage, Abbrechen lässt alles', async () => {
    window.history.replaceState(null, '', '/?rahmen=fenster&app=baurecht');
    const andocken: unknown[] = [];
    await listen('arch-tools:andocken', (e) => void andocken.push(e.payload));
    const host = await render({ app: 'LEXIO' });
    await andockenKlicken(host);
    expect(dialog(host)?.textContent).toContain('Änderungen an ‚LEXIO – P1‘ verwerfen?');
    expect(dialog(host)?.textContent).toContain('Beim Andocken startet die App neu, die Änderungen gehen verloren.');
    expect([...dialog(host)!.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Abbrechen', 'Verwerfen und andocken']);
    await antwort(host, 'Abbrechen');
    await warten();
    expect(andocken).toEqual([]);
    await andockenKlicken(host);
    await antwort(host, 'Verwerfen und andocken');
    await warten();
    expect(andocken).toEqual([{ app: 'baurecht' }]);
  });

  it('vor dem Schließen wartet das Fenster auf ausstehendes Schreiben (vorDemSchliessen), auch ohne ungespeicherte Änderungen', async () => {
    let schreiben: (() => void) | undefined;
    const aus = vorDemSchliessen(() => new Promise<void>((fertig) => (schreiben = fertig)));
    await render({ dirty: false });
    await act(async () => fenster.schliessenAngefragt!({ preventDefault: () => {} }));
    await warten();
    expect(fenster.destroy).not.toHaveBeenCalled();
    await act(async () => schreiben!());
    await warten();
    expect(fenster.destroy).toHaveBeenCalled();
    aus();
  });

  it('herausgelöstes Fenster: Vorbereitungs-Anfrage des Rahmens wird nach dem Schreiben beantwortet', async () => {
    window.history.replaceState(null, '', '/?rahmen=fenster&app=ordner');
    const antworten: { typ: string; anfrage?: string; ergebnis?: string }[] = [];
    await listen<(typeof antworten)[number]>('arch-tools:an-rahmen', (e) => void antworten.push(e.payload));
    let schreiben: (() => void) | undefined;
    const aus = vorDemSchliessen(() => new Promise<void>((fertig) => (schreiben = fertig)));
    await render({ dirty: false });
    for (let i = 0; i < 5; i++) await warten();
    await act(async () => void (await emit('arch-tools:an-app', { typ: 'arch-tools:vorbereiten', anfrage: 'v1', an: 'ordner' })));
    await warten();
    expect(antworten.some((a) => a.typ === 'arch-tools:vorbereitet')).toBe(false);
    await act(async () => schreiben!());
    await warten();
    expect(antworten.find((a) => a.typ === 'arch-tools:vorbereitet')).toMatchObject({ anfrage: 'v1', ergebnis: 'fertig' });
    aus();
  });

  it('Andocken wartet auf ausstehendes Schreiben; ein zweiter Klick währenddessen tut nichts', async () => {
    window.history.replaceState(null, '', '/?rahmen=fenster&app=kosten');
    const andocken: unknown[] = [];
    await listen('arch-tools:andocken', (e) => void andocken.push(e.payload));
    let schreiben: (() => void) | undefined;
    const aus = vorDemSchliessen(() => new Promise<void>((fertig) => (schreiben = fertig)));
    const host = await render({ app: 'NUMIO', dirty: false });
    await andockenKlicken(host);
    await andockenKlicken(host);
    await warten();
    expect(andocken).toEqual([]);
    await act(async () => schreiben!());
    await warten();
    expect(andocken).toEqual([{ app: 'kosten' }]);
    expect(fenster.destroy).toHaveBeenCalledTimes(1);
    aus();
  });

  it('scheitert das letzte Schreiben (Funktion liefert false), schließt das Fenster nicht ohne Rückfrage', async () => {
    let gelingt = false;
    const aus = vorDemSchliessen(async () => gelingt);
    const host = await render({ dirty: false });
    await act(async () => fenster.schliessenAngefragt!({ preventDefault: () => {} }));
    await warten();
    expect(fenster.destroy).not.toHaveBeenCalled();
    expect(host.querySelector('.modal.rf')?.textContent).toContain('ATLAS konnte nicht speichern');
    gelingt = true;
    await act(async () => [...host.querySelector('.modal.rf')!.querySelectorAll('button')].find((b) => b.textContent === 'Erneut versuchen')!.click());
    await warten();
    expect(fenster.destroy).toHaveBeenCalled();
    aus();
  });
});
