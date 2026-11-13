// @vitest-environment happy-dom
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attrappe, BASIS, installieren, KOPIE, legeAn, lies, NAS } from '../__fixtures__/konfigAttrappe';

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
const dialog = () => document.querySelector<HTMLElement>('.modal[aria-label="Speicherort der Einstellungen"]');
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
    const k = document.querySelector<HTMLButtonElement>('button[aria-label="Speicherort der Einstellungen"]');
    expect(k?.title).toContain('Einzelplatz');
    expect(document.querySelector('.sp-zeile code')?.textContent).toBe('Einzelplatz – nur auf diesem Rechner');
    await klick(k!);
    expect(dialog()?.querySelector('.sp-aktuell code')?.textContent).toBe(`Einzelplatz – ${BASIS}`);
    expect(knopf('Wechseln', dialog()!)?.disabled).toBe(true);
    // Netzwerkinstallation ohne Ordner: noch kein Wechsel möglich
    await act(async () => dialog()!.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1].click());
    expect(knopf('Wechseln', dialog()!)?.disabled).toBe(true);
    expect(dialog()!.textContent).toContain('noch kein Ordner gewählt');
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

    await klick(knopf('Wechseln', dialog()!));
    expect(rueckfrage()?.textContent).toContain('Gemeinsame Einstellungen aller Apps');
    expect([...rueckfrage()!.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Abbrechen', 'Mit meinen ersetzen', 'Vorhandene übernehmen']);
    await klick(knopf('Abbrechen', rueckfrage()!));
    expect(lies(`${BASIS}/konfig.json`)).toBeUndefined();
    expect(attrappe.dateien.has(`${NAS}/kataster.json`)).toBe(false);

    await klick(knopf('Wechseln', dialog()!));
    await klick(knopf('Vorhandene übernehmen', rueckfrage()!));
    expect(lies(`${BASIS}/konfig.json`)).toEqual({ modus: 'netzwerk', ordner: NAS });
    expect(lies(`${NAS}/allgemein.json`)).toEqual({ buero: 'Büro' });
    expect(lies(`${NAS}/kataster.json`)).toEqual({ zielpfad: 'Lagepläne' });
    expect(dialog()!.querySelector('.sp-meldung')?.textContent).toContain('Mitgenommen: ATLAS: Kataster');
    expect(dialog()!.querySelector('.sp-aktuell code')?.textContent).toBe(`Netzwerkinstallation – ${NAS}`);
    // Titelleiste und Zeile folgen
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="Speicherort der Einstellungen"]')?.title).toContain(NAS);
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
    await klick(knopf('Wechseln', dialog()!));
    expect(dialog()!.querySelector('[role="alert"]')?.textContent).toContain('nicht erreichbar');
    expect(lies(`${BASIS}/konfig.json`)).toBeUndefined();
    attrappe.nasErreichbar = true;
    await klick(knopf('Wechseln', dialog()!));
    expect(rueckfrage()).toBeNull();
    expect(lies(`${NAS}/allgemein.json`)).toEqual({ buero: 'Hier' });
  });

  it('Notbetrieb: deutlicher Knopf, Hinweis im Dialog, „Erneut versuchen“ schaltet zurück', async () => {
    legeAn(`${BASIS}/konfig.json`, { modus: 'netzwerk', ordner: NAS });
    legeAn(`${KOPIE}/allgemein.json`, { buero: 'Büro' });
    attrappe.nasErreichbar = false;
    await zeigen();
    const warn = knopf('⚠ Einstellungen nur lesbar');
    expect(warn?.className).toContain('titlebar-notbetrieb');
    expect(document.querySelector('.sp-zeile .warning')?.textContent).toContain('nur lesbar');
    await klick(warn);
    expect(dialog()!.querySelector('.sp-notbetrieb')?.textContent).toContain('nicht erreichbar');
    expect(knopf('Im Explorer zeigen', dialog()!)?.disabled).toBe(true);
    await klick(knopf('Erneut versuchen', dialog()!));
    expect(dialog()!.querySelector('[role="alert"]')?.textContent).toContain('weiterhin nicht erreichbar');
    attrappe.nasErreichbar = true;
    await klick(knopf('Erneut versuchen', dialog()!));
    expect(dialog()!.querySelector('.sp-notbetrieb')).toBeNull();
    expect(dialog()!.querySelector('.sp-meldung')?.textContent).toContain('wieder erreichbar');
    expect(knopf('⚠ Einstellungen nur lesbar')).toBeUndefined();
  });

  it('Gegenprobe Browser: kein Knopf, Hinweis auf den Browser-Speicher', async () => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    await zeigen();
    expect(document.querySelector('button[aria-label="Speicherort der Einstellungen"]')).toBeNull();
    expect(document.body.textContent).toContain('Im Browser liegen die Einstellungen im Speicher dieses Browsers.');
  });
});
