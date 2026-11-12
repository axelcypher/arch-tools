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
const zeile = (editor: Element, n: number) => editor.querySelectorAll<HTMLElement>('.av-ed-feld')[n];
const link = (editor: Element, n: number) => zeile(editor, n).querySelector<HTMLButtonElement>('button.av-ed-link');
const klick = (el: HTMLElement) => act(() => el.click());
const taste = (el: Element, key: string) => act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
const kaestchen = (editor: Element, text: string) => [...editor.querySelectorAll<HTMLLabelElement>('.av-ed-link-liste label')].find((l) => l.textContent?.includes(text))!.querySelector('input')!;

describe('Ansicht-Editor: Verknüpfen', () => {
  it('Knopf mit Liste: ohne passendes Feld nur ein Platzhalter; der Zustand steht im zugänglichen Namen', () => {
    const editor = render({ abschnitte: [{ id: 'a', titel: 'A', felder: ['ort1', 'ort2', 'kreuz'] }] });
    // das Kästchen hat kein passendes Gegenstück: kein Knopf, ein Platzhalter gleicher Breite
    expect(link(editor, 2)).toBeNull();
    expect(zeile(editor, 2).querySelector('.av-ed-link-platz')).not.toBeNull();
    // Ort ↔ Ort: nur das passende Feld wird angeboten
    expect(link(editor, 0)!.getAttribute('aria-label')).toBe('Ort verknüpfen');
    expect(link(editor, 0)!.getAttribute('aria-expanded')).toBe('false');
    klick(link(editor, 0)!);
    expect(link(editor, 0)!.getAttribute('aria-expanded')).toBe('true');
    expect([...editor.querySelectorAll('.av-ed-link-liste label')].map((l) => l.textContent)).toEqual(['Ort (Gemeinde)']);
    klick(kaestchen(editor, 'Ort (Gemeinde)'));
    expect(link(editor, 0)!.getAttribute('aria-label')).toBe('Ort verknüpfen – verknüpft mit 1 Feld');
    expect(link(editor, 1)!.getAttribute('aria-label')).toBe('Ort verknüpfen – verknüpft mit 1 Feld');
    expect(link(editor, 0)!.className).toContain('aktiv');
    // Esc schließt nur die Liste, der Fokus kehrt zum Knopf zurück
    taste(kaestchen(editor, 'Ort (Gemeinde)'), 'Escape');
    expect(editor.querySelector('.av-ed-link-liste')).toBeNull();
    expect(document.activeElement).toBe(link(editor, 0));
    expect(document.querySelector('.av-editor')).not.toBeNull();
    // lösen
    klick(link(editor, 1)!);
    klick(kaestchen(editor, 'Ort (Bauherr)'));
    expect(link(editor, 0)!.getAttribute('aria-label')).toBe('Ort verknüpfen');
  });

  it('die Liste schließt, wenn der Fokus sie verlässt (Tab) – nicht beim Wechsel zwischen ihren Kästchen', () => {
    const editor = render({ abschnitte: [{ id: 'a', titel: 'A', felder: ['ort1', 'ort2'] }] });
    klick(link(editor, 0)!);
    const kasten = kaestchen(editor, 'Ort (Gemeinde)');
    act(() => void kasten.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: link(editor, 0) })));
    expect(editor.querySelector('.av-ed-link-liste')).not.toBeNull();
    act(() => void kasten.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: zeile(editor, 1).querySelector('input') })));
    expect(editor.querySelector('.av-ed-link-liste')).toBeNull();
  });

  it('Pfeiltasten am Knopf verknüpfen nichts (anders als bei einer Auswahlliste)', () => {
    const editor = render({ abschnitte: [{ id: 'a', titel: 'A', felder: ['ort1', 'ort2'] }], verknuepfungen: [['ort1', 'ort2']] });
    link(editor, 0)!.focus();
    for (const k of ['ArrowDown', 'ArrowUp', 'ArrowDown']) taste(link(editor, 0)!, k);
    expect(link(editor, 0)!.getAttribute('aria-label')).toBe('Ort verknüpfen – verknüpft mit 1 Feld');
    expect(editor.querySelector('.av-ed-link-liste')).toBeNull();
  });

  it('ein Feld, das es nicht mehr gibt: Beschriftung gesperrt, keine Breite und kein Verknüpfen – nur entfernen', () => {
    const editor = render({ abschnitte: [{ id: 'a', titel: 'A', felder: ['ort1', 'weg'], optionen: { weg: { label: 'Alt' } } }] });
    const fehlt = zeile(editor, 1);
    expect(fehlt.className).toContain('fehlt');
    expect(fehlt.querySelector<HTMLInputElement>('.av-ed-label')!.disabled).toBe(true);
    expect(fehlt.querySelector('select')).toBeNull();
    expect(fehlt.querySelector('.av-ed-link')).toBeNull();
    expect(fehlt.textContent).toContain('gibt es hier nicht – entfernen');
    klick(fehlt.querySelector<HTMLButtonElement>('.av-ed-weg')!);
    expect(editor.querySelectorAll('.av-ed-feld')).toHaveLength(1);
  });
});
