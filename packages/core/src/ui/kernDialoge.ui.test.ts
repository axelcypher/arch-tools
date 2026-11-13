// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LogDialog } from './LogDialog';
import { Nachschlagewerk, useHilfe } from './Nachschlagewerk';
import { StammdatenDialog } from './Stammdaten';
import { dialogVerhaltenEinrichten } from './dialoge';
import { leereMeta } from '../model';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
beforeAll(() => dialogVerhaltenEinrichten());
function render(el: React.ReactElement): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(el);
  });
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  act(() => useHilfe.getState().schliessen());
});

const esc = () => act(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
const naechsterFrame = () => act(async () => new Promise((r) => requestAnimationFrame(() => r(undefined))));

/** gemeinsames Modal: Rolle dialog, aria-modal, sichtbarer Kopf als Name, kein h3 im Inhalt */
function pruefeModal(host: Element, titel: string) {
  const dialog = host.querySelector<HTMLElement>('.modal[role="dialog"]')!;
  expect(dialog).not.toBeNull();
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  const kopf = dialog.querySelector<HTMLElement>(':scope > .modal-kopf')!;
  expect(kopf.textContent).toBe(titel);
  expect(dialog.getAttribute('aria-labelledby')).toBe(kopf.id);
  // der Titel steht nur im Kopf, nicht noch einmal als h3 im Inhalt
  expect([...dialog.querySelectorAll('h3')].filter((h) => h.textContent === titel).length).toBe(1);
  return dialog;
}

describe('core-Dialoge im gemeinsamen Modal', () => {
  it('Fehlerprotokoll: Kopf, Filter als Umschalter, Erstfokus im Suchfeld (nicht auf „Leeren“), Esc schließt', async () => {
    const zu = vi.fn();
    const host = render(createElement(LogDialog, { onClose: zu }));
    const dialog = pruefeModal(host, 'Fehlerprotokoll');
    expect(dialog.classList.contains('modal-log')).toBe(true);
    const filter = dialog.querySelector('.segment[role="group"]')!;
    expect(filter.getAttribute('aria-label')).toBe('Einträge zeigen');
    expect(filter.querySelector('[aria-pressed="true"]')?.textContent).toBe('Info');
    await naechsterFrame();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Fehlerprotokoll durchsuchen');
    esc();
    expect(zu).toHaveBeenCalledTimes(1);
  });

  it('Stammdaten: Kopf, Esc bricht ab, Klick daneben schließt nicht (Formular mit Eingaben)', () => {
    const abbrechen = vi.fn();
    const host = render(createElement(StammdatenDialog, { titel: 'Projekt anlegen', meta: leereMeta(), onSpeichern: vi.fn(), onAbbrechen: abbrechen }));
    pruefeModal(host, 'Projekt anlegen');
    act(() => host.querySelector('.modal-backdrop')!.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(abbrechen).not.toHaveBeenCalled();
    esc();
    expect(abbrechen).toHaveBeenCalledTimes(1);
  });

  it('Nachschlagewerk: Kopf „Berechnungsregeln“, Esc und Klick daneben schließen', () => {
    act(() => useHilfe.getState().oeffnen());
    const host = render(createElement(Nachschlagewerk, { app: 'flaechen' }));
    pruefeModal(host, 'Berechnungsregeln');
    esc();
    expect(useHilfe.getState().offen).toBe(false);
    expect(host.querySelector('.modal')).toBeNull();
    act(() => useHilfe.getState().oeffnen());
    act(() => host.querySelector('.modal-backdrop')!.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(useHilfe.getState().offen).toBe(false);
  });
});
