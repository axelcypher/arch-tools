// @vitest-environment happy-dom
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attrappe, BASIS, installieren, KOPIE, legeAn, lies, NAS } from '../__fixtures__/konfigAttrappe';

const fs = () => attrappe.dateien;

/** Speicherort der Einstellungen: Knopf in der Titelleiste, Dialog mit Wechsel und Rückfrage, Notbetrieb */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;

/** Knopf, Dialog und Rückfragen wie in der Titelleiste – mit frischen Modulen (Ort je Sitzung zwischengespeichert) */
async function zeigen() {
  const sp = await import('./Speicherort');
  const { RueckfrageHost } = await import('./Rueckfrage');
  const host = document.createElement('div');
  document.body.appendChild(host);
  await act(async () => {
    root = createRoot(host);
    root.render(createElement(Fragment, null, createElement(sp.SpeicherortKnopf), createElement(sp.SpeicherortZeile), createElement(sp.SpeicherortHost), createElement(RueckfrageHost)));
  });
  await warten();
  return { host, sp };
}

const warten = () => act(() => new Promise((r) => setTimeout(r, 20)));
const knopf = (text: string, in_: ParentNode = document.body) => [...in_.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text);
const klick = async (b: HTMLElement | undefined) => {
  expect(b).toBeTruthy();
  await act(async () => b!.click());
  await warten();
};
const titelKnopf = () => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.title.startsWith('Speicherort der Einstellungen'));
const esc = () => act(async () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
// Dialog mit sichtbarem Kopf: benannt über aria-labelledby
const dialog = () => [...document.querySelectorAll<HTMLElement>('.modal[aria-labelledby]')].find((m) => document.getElementById(m.getAttribute('aria-labelledby')!)?.textContent === 'Speicherort der Einstellungen') ?? null;
const rueckfrage = () => document.querySelector<HTMLElement>('.modal.rf');

beforeEach(() => {
  vi.resetModules();
  installieren();
  localStorage.clear();
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

describe('Speicherort der Einstellungen', () => {
  it('Einzelplatz: Knopf in der Titelleiste öffnet den Dialog mit dem aktuellen Ort; ohne Änderung kein Wechsel', async () => {
    await zeigen();
    const k = titelKnopf();
    expect(k?.textContent?.trim()).toBe('Einzelplatz');
    expect(k?.title).toBe(`Speicherort der Einstellungen: Einzelplatz – nur auf diesem Rechner (${BASIS})`);
    expect(document.querySelector('.sp-zeile code')?.textContent).toBe('Einzelplatz – nur auf diesem Rechner');
    await klick(k!);
    expect(dialog()?.querySelector('.sp-aktuell code')?.textContent).toBe('Einzelplatz – nur auf diesem Rechner');
    expect(knopf('Speicherort wechseln', dialog()!)?.disabled).toBe(true);
    expect(knopf('Speicherort wechseln', dialog()!)?.title).toBe('Der Speicherort ist unverändert');
    // Netzwerkinstallation ohne Ordner: noch kein Wechsel möglich
    await act(async () => dialog()!.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1].click());
    expect(knopf('Speicherort wechseln', dialog()!)?.disabled).toBe(true);
    expect(dialog()!.textContent).toContain('noch kein Ordner gewählt');
    expect(knopf('Speicherort wechseln', dialog()!)?.title).toBe('Erst einen Ordner auf dem Netzlaufwerk wählen');
  });

  it('Wechsel ins Netz mit vorhandenen Einstellungen: Rückfrage mit drei Wegen; „Abbrechen“ ändert nichts, „Vorhandene übernehmen“ ergänzt', async () => {
    legeAn(`${BASIS}/allgemein.json`, { buero: 'Hier' });
    legeAn(`${BASIS}/kataster.json`, { zielpfad: 'Lagepläne' });
    legeAn(`${NAS}/allgemein.json`, { buero: 'Büro' });
    attrappe.ordnerWahl = NAS;
    await zeigen();
    await klick(knopf('Ändern …'));
    await klick(dialog()!.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]);
    await klick(knopf('Ordner wählen …', dialog()!));
    expect(dialog()!.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.parentElement?.textContent).toContain('Netzwerkinstallation');
    expect(dialog()!.querySelector('.sp-ort.indent code')?.textContent).toBe(NAS);

    await klick(knopf('Speicherort wechseln', dialog()!));
    expect(rueckfrage()?.textContent).toContain('Gemeinsame Einstellungen aller Apps');
    expect([...rueckfrage()!.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Abbrechen', 'Mit diesem Rechner überschreiben', 'Vorhandene übernehmen']);
    // Enter und Fokus: „Vorhandene übernehmen“, nie das Ersetzen
    const standard = rueckfrage()!.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(standard?.textContent).toBe('Vorhandene übernehmen');
    expect(document.activeElement).toBe(standard);
    // Esc gilt als Abbrechen
    await esc();
    expect(rueckfrage()).toBeNull();
    expect(lies(`${BASIS}/konfig.json`)).toBeUndefined();
    await klick(knopf('Speicherort wechseln', dialog()!));
    await klick(knopf('Abbrechen', rueckfrage()!));
    expect(lies(`${BASIS}/konfig.json`)).toBeUndefined();
    expect(attrappe.dateien.has(`${NAS}/kataster.json`)).toBe(false);

    await klick(knopf('Speicherort wechseln', dialog()!));
    await klick(knopf('Vorhandene übernehmen', rueckfrage()!));
    expect(lies(`${BASIS}/konfig.json`)).toEqual({ modus: 'netzwerk', ordner: NAS });
    expect(lies(`${NAS}/allgemein.json`)).toEqual({ buero: 'Büro' });
    expect(lies(`${NAS}/kataster.json`)).toEqual({ zielpfad: 'Lagepläne' });
    expect(dialog()!.querySelector('.meldung')?.textContent).toContain('Mitgenommen: ATLAS: Kataster');
    expect(dialog()!.querySelector('.sp-aktuell code')?.textContent).toBe(`Netzwerkinstallation – ${NAS}`);
    // Titelleiste und Zeile folgen
    expect(titelKnopf()?.textContent?.trim()).toBe('Netzwerk');
    expect(titelKnopf()?.title).toContain(NAS);
    expect(document.querySelector('.sp-zeile code')?.textContent).toBe(`Netzwerkinstallation – ${NAS}`);
  });

  it('leerer Netzordner: ohne Rückfrage; nicht erreichbar: Meldung, nichts geändert', async () => {
    legeAn(`${BASIS}/allgemein.json`, { buero: 'Hier' });
    attrappe.ordnerWahl = NAS;
    attrappe.nasErreichbar = false;
    await zeigen();
    await klick(knopf('Ändern …'));
    await klick(dialog()!.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]);
    await klick(knopf('Ordner wählen …', dialog()!));
    await klick(knopf('Speicherort wechseln', dialog()!));
    expect(dialog()!.querySelector('[role="alert"]')?.textContent).toContain('nicht erreichbar');
    expect(lies(`${BASIS}/konfig.json`)).toBeUndefined();
    attrappe.nasErreichbar = true;
    await klick(knopf('Speicherort wechseln', dialog()!));
    expect(rueckfrage()).toBeNull();
    expect(lies(`${NAS}/allgemein.json`)).toEqual({ buero: 'Hier' });
  });

  it('„Mit diesem Rechner überschreiben“: überschreibt nach Sicherung und meldet sie; Gegenprobe „übernehmen“ oben', async () => {
    legeAn(`${BASIS}/allgemein.json`, { buero: 'Hier' });
    legeAn(`${NAS}/allgemein.json`, { buero: 'Büro' });
    attrappe.ordnerWahl = NAS;
    await zeigen();
    await klick(knopf('Ändern …'));
    await klick(dialog()!.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]);
    await klick(knopf('Ordner wählen …', dialog()!));
    await klick(knopf('Speicherort wechseln', dialog()!));
    await klick(knopf('Mit diesem Rechner überschreiben', rueckfrage()!));
    expect(lies(`${NAS}/allgemein.json`)).toEqual({ buero: 'Hier' });
    expect([...attrappe.dateien.keys()].some((p) => p.startsWith(`${NAS}/allgemein.json.vor-umzug-`))).toBe(true);
    expect(dialog()!.querySelector('.meldung')?.textContent).toContain('Gesichert vor dem Ersetzen: Gemeinsame Einstellungen aller Apps');
  });

  it('während des Wechsels schließen weder Esc noch „Schließen“ den Dialog; ein lokaler Ordner als Netzordner wird abgelehnt', async () => {
    attrappe.ordnerWahl = `${BASIS}/netz-kopie`;
    await zeigen();
    await klick(knopf('Ändern …'));
    await klick(dialog()!.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]);
    await klick(knopf('Ordner wählen …', dialog()!));
    await klick(knopf('Speicherort wechseln', dialog()!));
    expect(dialog()!.querySelector('[role="alert"]')?.textContent).toContain('liegt auf diesem Rechner');
    expect(lies(`${BASIS}/konfig.json`)).toBeUndefined();

    fs().set(`${NAS}/.platzhalter`, '');
    attrappe.ordnerWahl = NAS;
    await klick(knopf('Ordner wählen …', dialog()!));
    let los = () => {};
    attrappe.bremse = new Promise<void>((r) => (los = r));
    await act(async () => knopf('Speicherort wechseln', dialog()!)!.click());
    expect(knopf('Bitte warten …', dialog()!)?.disabled).toBe(true);
    expect(knopf('Schließen', dialog()!)?.disabled).toBe(true);
    await esc();
    expect(dialog()).not.toBeNull();
    attrappe.bremse = null;
    los();
    await warten();
    expect(lies(`${BASIS}/konfig.json`)).toEqual({ modus: 'netzwerk', ordner: NAS });
    await esc();
    expect(dialog()).toBeNull();
  });

  it('Ordnerdialog scheitert: Meldung statt stillem Fehler; derselbe Ordner in anderer Schreibweise gilt als unverändert', async () => {
    legeAn(`${BASIS}/konfig.json`, { modus: 'netzwerk', ordner: NAS });
    fs().set(`${NAS}/.platzhalter`, '');
    await zeigen();
    await klick(titelKnopf());
    attrappe.ordnerWahl = `${NAS.toUpperCase()}/`;
    await klick(knopf('Ordner wählen …', dialog()!));
    expect(knopf('Speicherort wechseln', dialog()!)?.disabled).toBe(true);
    const orig = (window as unknown as { __TAURI_INTERNALS__: { invoke: (b: string, a: unknown) => Promise<unknown> } }).__TAURI_INTERNALS__;
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
      invoke: (b: string, a: unknown) => (b === 'ordner_waehlen' ? Promise.reject(new Error('Dialog nicht verfügbar')) : orig.invoke(b, a)),
    };
    await klick(knopf('Ordner wählen …', dialog()!));
    expect(dialog()!.querySelector('[role="alert"]')?.textContent).toBe('Ordner nicht gewählt: Dialog nicht verfügbar');
  });

  it('Notbetrieb: deutlicher Knopf, Hinweis im Dialog, „Erneut versuchen“ schaltet zurück', async () => {
    legeAn(`${BASIS}/konfig.json`, { modus: 'netzwerk', ordner: NAS });
    legeAn(`${KOPIE}/allgemein.json`, { buero: 'Büro' });
    legeAn(`${KOPIE}/.herkunft.json`, { ordner: NAS, bereiche: ['allgemein'] });
    attrappe.nasErreichbar = false;
    await zeigen();
    const warn = knopf('⚠ Einstellungen nur lesbar');
    expect(warn?.className).toContain('titlebar-notbetrieb');
    expect(document.querySelector('.sp-zeile .warning')?.textContent).toContain('nur lesbar');
    await klick(warn);
    expect(dialog()!.querySelector('.sp-notbetrieb')?.textContent).toContain('nicht erreichbar');
    expect(knopf('Ordner öffnen', dialog()!)?.disabled).toBe(true);
    await klick(knopf('Erneut versuchen', dialog()!));
    expect(dialog()!.querySelector('[role="alert"]')?.textContent).toContain('weiterhin nicht erreichbar');
    attrappe.nasErreichbar = true;
    await klick(knopf('Erneut versuchen', dialog()!));
    expect(dialog()!.querySelector('.sp-notbetrieb')).toBeNull();
    expect(dialog()!.querySelector('.meldung')?.textContent).toContain('wieder erreichbar');
    expect(knopf('⚠ Einstellungen nur lesbar')).toBeUndefined();
  });

  it('Gegenprobe Browser: kein Knopf, Hinweis auf den Browser-Speicher', async () => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    await zeigen();
    expect(titelKnopf()).toBeUndefined();
    expect(document.body.textContent).toContain('Im Browser liegen die Einstellungen im Speicher dieses Browsers.');
  });
});
