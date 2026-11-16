// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { dialogVerhaltenEinrichten } from '../ui/dialoge';
import { kernBeispielSchema } from './beispieldaten';
import { PlatzhalterReferenz } from './PlatzhalterReferenz';
import type { PlatzhalterSchema } from './schema';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
beforeAll(() => dialogVerhaltenEinrichten());
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

const schema: PlatzhalterSchema = {
  ...kernBeispielSchema(),
  app: 'TEST',
  beispieldaten: 'Beispieldaten: Test',
  abschnitte: [
    { art: 'einzelwerte', id: 'summe', titel: 'Projektsummen', werte: [{ schluessel: 'summe.wofl', text: 'Wohnfläche', einheit: 'm²' }] },
    ...kernBeispielSchema().abschnitte.map((a) =>
      a.art === 'sammlung' && a.name === 'geschoss' ? { ...a, zugriff: { ueber: 'name', text: 'über den Namen.', beispiel: '{{geschoss:EG.wofl}}' } } : a,
    ),
  ],
};

function zeigen(onClose = vi.fn()) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(createElement(PlatzhalterReferenz, { schema, onClose }));
  });
  return { host, onClose };
}

const eintraege = () => [...document.querySelectorAll('.nw-eintrag')].map((b) => b.textContent);
const knopf = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === text)!;

describe('Platzhalter-Referenz', () => {
  it('benannter Dialog mit Gruppen: Syntax, Einzelwerte, Sammlungen, benannter Einzelzugriff', () => {
    zeigen();
    const d = document.querySelector<HTMLElement>('.modal')!;
    expect(document.getElementById(d.getAttribute('aria-labelledby')!)?.textContent).toBe('Platzhalter-Referenz TEST');
    expect([...document.querySelectorAll('.nw-gruppe-titel')].map((g) => g.textContent).slice(0, 4)).toEqual([
      'Syntax (alle Apps)',
      'Einzelwerte',
      'Sammlungen (Datensätze)',
      'Benannter Einzelzugriff',
    ]);
    expect(eintraege()).toContain('raum – Räume');
    expect(eintraege()).toContain('geschoss:NAME.feld – Geschosse');
  });

  it('Sammlung zeigt Art, Wo nutzbar, Enthält, Felder und Filter', () => {
    zeigen();
    act(() => knopf('raum – Räume').click());
    const t = document.querySelector('.nw-text')!.textContent!;
    expect(t).toContain('Sammlung, Zeile je Raum');
    expect(t).toContain('nein: Kopf-/Fußzeile, Textfeld');
    expect(t).toContain('geschoss (Geschosse)');
    expect(t).toContain('{{raum.flaeche}}');
    expect(t).toContain('[wofl]');
    expect(document.querySelector('[aria-current="true"]')?.textContent).toBe('raum – Räume');
  });

  it('Suche filtert die Einträge, ↓ springt in die Liste, ↑/↓ wechseln den Eintrag', () => {
    zeigen();
    const suche = document.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(suche, 'nebenflaeche');
      suche.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(eintraege()).toContain('raum – Räume');
    expect(eintraege()).not.toContain('geschoss – Geschosse');
    expect(eintraege()).not.toContain('Projektsummen');
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(suche, '');
      suche.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => suche.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    const liste = document.querySelector('.nw-liste')!;
    act(() => liste.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(document.querySelector('[aria-current="true"]')?.textContent).toBe(eintraege()[1]);
    act(() => liste.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
    expect(document.querySelector('[aria-current="true"]')?.textContent).toBe(eintraege().at(-1));
  });

  it('Kopieren legt den Platzhalter in die Zwischenablage und meldet es', async () => {
    const schreiben = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: schreiben }, configurable: true });
    zeigen();
    act(() => knopf('Projektsummen').click());
    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="{{summe.wofl}} kopieren"]')!.click());
    expect(schreiben).toHaveBeenCalledWith('{{summe.wofl}}');
    expect(document.querySelector('.nw-fuss [role="status"]')?.textContent).toBe('Kopiert: {{summe.wofl}}');
  });

  it('„Schließen“ schließt', () => {
    const { onClose } = zeigen();
    act(() => knopf('Schließen').click());
    expect(onClose).toHaveBeenCalled();
  });
});
