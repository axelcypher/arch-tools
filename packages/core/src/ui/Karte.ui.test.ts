// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Flaeche, FlaechenSpalte, Karte, ZeichenKarte } from './Karte';

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
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

describe('Fläche und Karten', () => {
  it('Karte: Kopf mit h2 und Aktionen, scrollender Rumpf, Fußzeile', () => {
    const host = render(h(Karte, { titel: 'Auswertung', aktionen: h('button', null, 'Kurzfassung'), fuss: 'NRF/BGF: 84 %' }, h('p', null, 'Inhalt')));
    const karte = host.querySelector('section.karte')!;
    expect(karte.querySelector('.karte-kopf > h2')?.textContent).toBe('Auswertung');
    expect(karte.querySelector('.karte-kopf > .karte-aktionen > button')?.textContent).toBe('Kurzfassung');
    expect(karte.querySelector('.karte-rumpf > p')?.textContent).toBe('Inhalt');
    expect(karte.querySelector('footer.karte-fuss')?.textContent).toBe('NRF/BGF: 84 %');
    // mit sichtbarem Titel benennt das h2 den Bereich
    expect(karte.hasAttribute('aria-label')).toBe(false);
    expect(karte.getAttribute('aria-labelledby')).toBe(karte.querySelector('.karte-kopf > h2')!.id);
  });

  it('Karte ohne Titel: kein Kopf, Name über ariaLabel; bündiger Rumpf', () => {
    const host = render(h(Karte, { ariaLabel: 'Räume', buendig: true }, 'x'));
    const karte = host.querySelector('section.karte')!;
    expect(karte.querySelector('.karte-kopf')).toBeNull();
    expect(karte.getAttribute('aria-label')).toBe('Räume');
    expect(karte.hasAttribute('aria-labelledby')).toBe(false);
    expect(karte.querySelector('.karte-rumpf')!.className).toBe('karte-rumpf buendig');
    expect(karte.querySelector('.karte-fuss')).toBeNull();
  });

  it('ZeichenKarte: Zeichenfläche füllt die Karte, Fußzeile für Hinweis, Koordinaten und Maßstab', () => {
    const host = render(h(ZeichenKarte, { ariaLabel: 'Grundriss', fuss: h('span', null, 'Klicken: wählen'), children: h('canvas', { className: 'canvas' }) }));
    const karte = host.querySelector('section.karte.zeichen-karte')!;
    expect(karte.getAttribute('aria-label')).toBe('Grundriss');
    expect(karte.querySelector('.zeichen-flaeche > canvas.canvas')).not.toBeNull();
    expect(karte.querySelector('footer.karte-fuss.zeichen-fuss')?.textContent).toBe('Klicken: wählen');
    expect(karte.querySelector('.karte-kopf')).toBeNull();
  });

  it('ZeichenKarte mit Titel: derselbe Kopf wie bei Karte (h2 benennt, Aktionen rechts)', () => {
    const host = render(h(ZeichenKarte, { titel: 'Lageplan', aktionen: h('button', null, '3D'), children: h('div', { className: 'canvas' }) }));
    const karte = host.querySelector('section.zeichen-karte')!;
    const h2 = karte.querySelector('.karte-kopf > h2')!;
    expect(h2.textContent).toBe('Lageplan');
    expect(karte.getAttribute('aria-labelledby')).toBe(h2.id);
    expect(karte.querySelector('.karte-kopf > .karte-aktionen > button')?.textContent).toBe('3D');
  });

  it('Fläche und Spalte setzen ihre Klassen; Spalte mit fester Breite', () => {
    const host = render(h(Flaeche, { className: 'qu-flaeche', children: h(FlaechenSpalte, { breite: 300, children: [h(Karte, { key: 'a', titel: 'A' }), h(Karte, { key: 'b', titel: 'B' })] }) }));
    const f = host.querySelector('.flaeche.qu-flaeche')!;
    const spalte = f.querySelector<HTMLElement>(':scope > .flaechen-spalte')!;
    expect(spalte.style.width).toBe('300px');
    expect(spalte.querySelectorAll(':scope > .karte')).toHaveLength(2);
  });

  it('base.css hat das Muster: Spalt, Karten-Schatten hell und dunkel, Scrollen im Rumpf, Werkzeugleiste auf der Fläche', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'base.css'), 'utf8');
    expect(css).toMatch(/--spalt: 8px;/);
    expect(css.match(/--karte-schatten:/g)?.length).toBe(2);
    expect(css).toMatch(/\.karte-rumpf \{[^}]*overflow: auto;/);
    expect(css).toMatch(/\.flaeche \{[^}]*overflow: hidden;/);
    expect(css).toMatch(/\.app:has\(\.flaeche\) > \.toolbar \{/);
  });
});
