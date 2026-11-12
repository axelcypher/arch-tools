// @vitest-environment happy-dom
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { Ansicht, FeldDef } from './ansicht';
import { AnsichtEditor } from './AnsichtEditor';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

// zwei Textfelder und ein Kästchen: verknüpfen lassen sich nur die beiden Textfelder
const KATALOG: (FeldDef & { art: string })[] = [
  { id: 'ort1', titel: 'Ort', gruppe: 'Bauherr', art: 'text' },
  { id: 'ort2', titel: 'Ort', gruppe: 'Gemeinde', art: 'text' },
  { id: 'kreuz', titel: 'Denkmal', gruppe: 'Projektdaten', art: 'kreuz' },
];
const passt = (a: FeldDef, b: FeldDef) => (a as (typeof KATALOG)[number]).art === (b as (typeof KATALOG)[number]).art;

function Editor({ start }: { start: Ansicht }) {
  const [a, setA] = useState<Ansicht | null>(start);
  return createElement(AnsichtEditor, { titel: 'Test', katalog: KATALOG, ansicht: a, onChange: setA, onSchliessen: () => {}, verknuepfbar: passt });
}

function render(start: Ansicht) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(createElement(Editor, { start }));
  });
  return document.querySelector<HTMLElement>('.av-editor')!;
}
const link = (editor: Element, n: number) => editor.querySelectorAll<HTMLSelectElement>('select.av-ed-link')[n];
const waehle = (el: HTMLSelectElement, value: string) =>
  act(() => {
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

describe('Ansicht-Editor: Verknüpfen', () => {
  it('ohne passendes Feld gesperrt; der Zustand steht im zugänglichen Namen', () => {
    const editor = render({ abschnitte: [{ id: 'a', titel: 'A', felder: ['ort1', 'ort2', 'kreuz'] }] });
    // das Kästchen hat kein passendes Gegenstück
    expect(link(editor, 2).disabled).toBe(true);
    expect(link(editor, 2).title).toContain('Kein passendes Feld');
    // Ort ↔ Ort: angeboten, nur das passende Feld
    expect(link(editor, 0).disabled).toBe(false);
    expect([...link(editor, 0).options].map((o) => o.value)).toEqual(['', 'ort2']);
    expect(link(editor, 0).getAttribute('aria-label')).toBe('Ort verknüpfen');
    waehle(link(editor, 0), 'ort2');
    expect(link(editor, 0).getAttribute('aria-label')).toBe('Ort verknüpfen – verknüpft mit 1 Feld');
    expect(link(editor, 1).getAttribute('aria-label')).toBe('Ort verknüpfen – verknüpft mit 1 Feld');
    expect(link(editor, 0).className).toContain('aktiv');
    // lösen
    waehle(link(editor, 0), '–');
    expect(link(editor, 0).getAttribute('aria-label')).toBe('Ort verknüpfen');
  });
});
