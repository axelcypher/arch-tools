// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectMeta } from '../model';
import { leereMeta } from '../model';
import { StammdatenDialog } from './Stammdaten';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

const eingabe = (el: HTMLInputElement, value: string) => {
  act(() => {
    el.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => el.blur());
};
const feld = (host: Element, label: string) => [...host.querySelectorAll('label.field')].find((l) => l.querySelector('.field-label')?.textContent === label)!.querySelector('input') as HTMLInputElement;
const knopf = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;

describe('Stammdaten-Dialog', () => {
  it('ohne Projektnummer gesperrt; legt mit den eingegebenen Stammdaten an', async () => {
    const gespeichert = vi.fn<(m: ProjectMeta) => void>();
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render(createElement(StammdatenDialog, { titel: 'Projektdatei anlegen', text: 'Im Ordner liegt noch keine Projektdatei.', meta: leereMeta(), onSpeichern: gespeichert, onAbbrechen: () => {} }));
    });
    expect(host.textContent).toContain('Im Ordner liegt noch keine Projektdatei.');
    expect(knopf(host, 'Projektdatei anlegen').disabled).toBe(true);
    eingabe(feld(host, 'Projektnummer'), ' BS5 ');
    eingabe(feld(host, 'Kurzname'), 'Birkenstraße');
    eingabe(feld(host, 'Name bzw. Firma'), 'Mustermann');
    eingabe(feld(host, 'E-Mail'), 'a@example.org, b@example.org');
    act(() => ([...host.querySelectorAll('.sd-lph input')][3] as HTMLInputElement).click());
    act(() => knopf(host, '+ Beteiligter').click());
    eingabe(host.querySelector('.sd-beteiligte input') as HTMLInputElement, 'Tragwerk');
    expect(knopf(host, 'Projektdatei anlegen').disabled).toBe(false);
    await act(async () => knopf(host, 'Projektdatei anlegen').click());
    expect(gespeichert).toHaveBeenCalledTimes(1);
    expect(gespeichert.mock.calls[0][0]).toMatchObject({
      projektcode: 'BS5',
      kurzname: 'Birkenstraße',
      leistungsphasen: [4],
      beteiligte: [{ rolle: 'Tragwerk', name: '', kontakt: '' }],
      bauherr: { name: 'Mustermann', kontakte: [{ art: 'email', wert: 'a@example.org' }, { art: 'email', wert: 'b@example.org' }] },
    });
  });

  it('ein Fehler beim Anlegen erscheint im Dialog', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render(createElement(StammdatenDialog, { titel: 'X', meta: { ...leereMeta(), projektcode: 'BS5' }, onSpeichern: () => Promise.reject(new Error('Ordner schreibgeschützt')), onAbbrechen: () => {} }));
    });
    await act(async () => knopf(host, 'Projektdatei anlegen').click());
    expect(host.textContent).toContain('Ordner schreibgeschützt');
  });
});
