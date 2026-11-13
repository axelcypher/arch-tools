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
/** Auswahlfenster „Gemeinsam ausfüllen“ (eigenes Modal über dem Editor) */
const auswahl = () => document.querySelector<HTMLElement>('.av-verknuepfen');
const kaestchen = (text: string) => [...auswahl()!.querySelectorAll<HTMLLabelElement>('.av-ed-kat-feld')].find((l) => l.textContent?.includes(text))!.querySelector('input')!;
const angeboten = () => [...auswahl()!.querySelectorAll('.av-ed-kat-feld')].map((l) => l.querySelector('span')!.textContent);
const gruppenTitel = () => [...auswahl()!.querySelectorAll('.av-ed-gruppe-titel')].map((g) => g.textContent);

describe('Ansicht-Editor: Verknüpfen', () => {
  it('Knopf öffnet ein Auswahlfenster mit allen passenden Feldern nach Gruppen – auch außerhalb der Ansicht', () => {
    // nur Ort (Bauherr) und das Kästchen stehen in der Ansicht; Ort (Gemeinde) nur im Katalog
    const editor = render({ abschnitte: [{ id: 'a', titel: 'A', felder: ['ort1', 'kreuz'] }] });
    // das Kästchen hat kein passendes Gegenstück: kein Knopf, ein Platzhalter gleicher Breite
    expect(link(editor, 1)).toBeNull();
    expect(zeile(editor, 1).querySelector('.av-ed-link-platz')).not.toBeNull();
    expect(link(editor, 0)!.getAttribute('aria-label')).toBe('Ort verknüpfen');
    expect(link(editor, 0)!.getAttribute('aria-haspopup')).toBe('dialog');
    klick(link(editor, 0)!);
    expect(auswahl()!.getAttribute('role')).toBe('dialog');
    expect(auswahl()!.getAttribute('aria-label')).toBe('Gemeinsam ausfüllen: Ort (Bauherr)');
    // außerhalb des Editors eingehängt
    expect(auswahl()!.closest('.av-editor')).toBeNull();
    // nur passende Felder (Text), gegliedert nach Gruppen, das eigene nicht
    expect(gruppenTitel()).toEqual(['Gemeinde']);
    expect(angeboten()).toEqual(['Ort']);
    expect(auswahl()!.querySelector('.av-verknuepfen-marke')).toBeNull();
    klick(kaestchen('Ort'));
    expect(link(editor, 0)!.getAttribute('aria-label')).toBe('Ort verknüpfen – verknüpft mit 1 Feld');
    expect(link(editor, 0)!.className).toContain('active');
    expect(auswahl()!.textContent).toContain('verknüpft mit 1 Feld');
    // Esc schließt nur das Auswahlfenster, nicht den Editor
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(auswahl()).toBeNull();
    expect(document.querySelector('.av-editor')).not.toBeNull();
    // der Fokus kehrt zum Knopf zurück
    expect(document.activeElement).toBe(link(editor, 0));
    // lösen
    klick(link(editor, 0)!);
    klick(kaestchen('Ort'));
    expect(link(editor, 0)!.getAttribute('aria-label')).toBe('Ort verknüpfen');
    klick([...auswahl()!.querySelectorAll('button')].find((b) => b.textContent === 'Fertig')!);
    expect(auswahl()).toBeNull();
  });

  it('Suche nach Titel und Gruppe; Felder der Ansicht sind markiert', () => {
    const editor = render({ abschnitte: [{ id: 'a', titel: 'A', felder: ['ort1', 'ort2'] }] });
    klick(link(editor, 0)!);
    expect(auswahl()!.querySelector('.av-ed-kat-feld .av-verknuepfen-marke')!.textContent).toBe('in der Ansicht');
    const suche = auswahl()!.querySelector<HTMLInputElement>('input[type="search"]')!;
    expect(document.activeElement).toBe(suche);
    const tippen = (v: string) =>
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(suche, v);
        suche.dispatchEvent(new Event('input', { bubbles: true }));
      });
    tippen('gemein');
    expect(angeboten()).toEqual(['Ort']);
    tippen('bauherr');
    expect(auswahl()!.textContent).toContain('Kein Feld passt zu „bauherr“');
  });

  it('verknüpft mit einem Feld, das es nicht mehr gibt: im Auswahlfenster zum Lösen angeboten', () => {
    const editor = render({ abschnitte: [{ id: 'a', titel: 'A', felder: ['ort1'] }], verknuepfungen: [['ort1', 'weg']] });
    expect(link(editor, 0)!.getAttribute('aria-label')).toBe('Ort verknüpfen – verknüpft mit 1 Feld');
    klick(link(editor, 0)!);
    expect(gruppenTitel()).toContain('Nicht mehr in der Projektkarte');
    klick(kaestchen('weg'));
    expect(link(editor, 0)!.getAttribute('aria-label')).toBe('Ort verknüpfen');
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
