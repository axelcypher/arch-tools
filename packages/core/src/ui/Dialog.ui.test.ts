// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Modal } from './Dialog';
import { dialogVerhaltenEinrichten } from './dialoge';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
function render(el: React.ReactElement): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(el);
  });
  return host;
}
beforeAll(() => dialogVerhaltenEinrichten());
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

/** wartet den Erstfokus ab (requestAnimationFrame) */
const erstfokus = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
const knopf = (text: string, className?: string) => createElement('button', { key: text, className }, text);

describe('Dialoge: Erstfokus, Name, Kopf', () => {
  it('ohne Textfeld fällt der Erstfokus auf den Hauptknopf, nicht auf „Abbrechen“ oder eine Auswahlliste', async () => {
    const host = render(
      createElement(
        Modal,
        { titel: 'Excel', onClose: () => {}, children: null },
        createElement('select', { key: 's' }),
        createElement('div', { key: 'k', className: 'dialog-buttons' }, knopf('Abbrechen'), knopf('Exportieren', 'primary')),
      ),
    );
    await erstfokus();
    expect(document.activeElement?.textContent).toBe('Exportieren');
    expect(host.querySelector('.modal')!.getAttribute('aria-label')).toBe('Excel');
  });

  it('ist der Hauptknopf gesperrt, fällt der Erstfokus auf das gewählte Optionsfeld', async () => {
    render(
      createElement(
        Modal,
        { titel: 'Excel', onClose: () => {}, children: null },
        createElement('input', { key: 'a', type: 'radio', name: 'r', defaultChecked: false }),
        createElement('input', { key: 'b', type: 'radio', name: 'r', defaultChecked: true, 'aria-label': 'gewählt' }),
        createElement('button', { key: 'k', className: 'primary', disabled: true }, 'Exportieren'),
      ),
    );
    await erstfokus();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('gewählt');
  });

  it('mit Textfeld fällt der Erstfokus auf das erste Textfeld', async () => {
    render(createElement(Modal, { titel: 'Stammdaten', onClose: () => {}, children: null }, createElement('input', { key: 'i' }), knopf('Übernehmen', 'primary')));
    await erstfokus();
    expect(document.activeElement?.tagName).toBe('INPUT');
  });

  it('Modal mit `kopf`: sichtbarer Titel benennt den Dialog; `tabelle` macht ihn breit', () => {
    const host = render(createElement(Modal, { titel: 'Vorschau', kopf: true, tabelle: true, children: 'x' }));
    const d = host.querySelector('.modal')!;
    const h = d.querySelector('h3.modal-kopf')!;
    expect(h.textContent).toBe('Vorschau');
    expect(d.getAttribute('aria-labelledby')).toBe(h.id);
    expect(d.hasAttribute('aria-label')).toBe(false);
    expect(d.classList.contains('modal-tabelle')).toBe(true);
  });

  it('Druckvorschau (.report in .report-backdrop) wird als Dialog behandelt: Rolle, Name aus der Überschrift, Fokus auf den Hauptknopf (nicht aufs Datum), Tab bleibt drin', async () => {
    const draussen = document.createElement('button');
    draussen.textContent = 'Drucken öffnen';
    document.body.appendChild(draussen);
    draussen.focus();
    const host = render(
      createElement(
        'div',
        { className: 'report-backdrop' },
        createElement(
          'div',
          { className: 'report' },
          createElement('div', { key: 'a', className: 'report-actions' }, createElement('input', { key: 'd', type: 'date' }), knopf('Schließen'), knopf('Drucken', 'primary')),
          createElement('h1', { key: 'h' }, 'GRZ-Nachweis'),
        ),
      ),
    );
    await erstfokus();
    const report = host.querySelector<HTMLElement>('.report')!;
    expect(report.getAttribute('role')).toBe('dialog');
    expect(report.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(report.getAttribute('aria-labelledby')!)?.textContent).toBe('GRZ-Nachweis');
    expect(document.activeElement?.textContent).toBe('Drucken');
    // Tab vom letzten Knopf springt an den Anfang des Dialogs, nicht in den Hintergrund
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })));
    expect(report.contains(document.activeElement)).toBe(true);
  });
});
