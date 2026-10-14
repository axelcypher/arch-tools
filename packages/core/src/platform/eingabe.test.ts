// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { dialogOffen, istEingabeZiel, zeichenKuerzelErlaubt } from './eingabe';

afterEach(() => {
  document.body.innerHTML = '';
});

const taste = (target: EventTarget) => {
  const e = new KeyboardEvent('keydown', { key: 'ArrowDown' });
  Object.defineProperty(e, 'target', { value: target });
  return e;
};

describe('Tastaturkürzel und Eingaben', () => {
  it('Text-, Zahl- und Auswahlfelder sowie Schieberegler sind Eingabeziele, Kontrollkästchen nicht', () => {
    const el = (html: string) => {
      document.body.innerHTML = html;
      return document.body.firstElementChild!;
    };
    expect(istEingabeZiel(el('<input type="text">'))).toBe(true);
    expect(istEingabeZiel(el('<input type="range">'))).toBe(true);
    expect(istEingabeZiel(el('<select></select>'))).toBe(true);
    expect(istEingabeZiel(el('<textarea></textarea>'))).toBe(true);
    expect(istEingabeZiel(el('<input type="checkbox">'))).toBe(false);
    expect(istEingabeZiel(el('<button></button>'))).toBe(false);
  });

  it('Bericht, Druckansicht und Dialoge sperren die Kürzel der Zeichenfläche', () => {
    expect(dialogOffen()).toBe(false);
    document.body.innerHTML = '<div class="report-backdrop"></div>';
    expect(dialogOffen()).toBe(true);
    expect(zeichenKuerzelErlaubt(taste(document.body))).toBe(false);
    document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';
    expect(dialogOffen()).toBe(true);
  });

  it('ausgeblendete Zeichenfläche (3D-Ansicht im Vordergrund) reagiert nicht', () => {
    document.body.innerHTML = '<div class="view-pane hidden"><svg></svg></div><div class="view-pane"><svg id="b"></svg></div>';
    const [a, b] = [...document.querySelectorAll('svg')];
    expect(zeichenKuerzelErlaubt(taste(document.body), a)).toBe(false);
    expect(zeichenKuerzelErlaubt(taste(document.body), b)).toBe(true);
  });
});
