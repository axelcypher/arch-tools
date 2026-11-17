// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Flaeche, FlaechenSpalte, Karte, ZeichenFussInhalt, ZeichenKarte } from './Karte';

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
    expect(karte.querySelector('.karte-kopf h2')?.textContent).toBe('Auswertung');
    expect(karte.querySelector('.karte-kopf > .karte-aktionen > button')?.textContent).toBe('Kurzfassung');
    expect(karte.querySelector('.karte-rumpf > p')?.textContent).toBe('Inhalt');
    expect(karte.querySelector('footer.karte-fuss')?.textContent).toBe('NRF/BGF: 84 %');
    // mit sichtbarem Titel benennt das h2 den Bereich
    expect(karte.hasAttribute('aria-label')).toBe(false);
    expect(karte.getAttribute('aria-labelledby')).toBe(karte.querySelector('.karte-kopf h2')!.id);
  });

  it('Hilfe hinter der Überschrift gehört nicht zum Namen der Karte', () => {
    const host = render(h(Karte, { titel: 'Lageplan', hilfe: h('button', { className: 'hilfe-knopf', 'aria-label': 'Berechnungsregeln nachschlagen' }, '?') }, 'x'));
    const karte = host.querySelector('section.karte')!;
    const h2 = karte.querySelector('.karte-kopf > .karte-titel > h2')!;
    expect(h2.textContent).toBe('Lageplan');
    expect(karte.querySelector('.karte-titel > h2 + .hilfe-knopf')).not.toBeNull();
    expect(h2.querySelector('button')).toBeNull();
    expect(karte.getAttribute('aria-labelledby')).toBe(h2.id);
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'base.css'), 'utf8');
    expect(css).toMatch(/\.karte-titel \{[^}]*flex: 1 1 auto;[^}]*display: flex;/);
    // der Titel schrumpft nicht unter sein längstes Wort (das „?“ läge sonst über dem Text); der Kopf bricht um
    expect(css).not.toMatch(/\.karte-titel \{[^}]*min-width: 0;/);
    expect(css).toMatch(/\.karte-kopf \{[^}]*flex-wrap: wrap;/);
    expect(css).toMatch(/\.section-head \{[^}]*flex-wrap: wrap;/);
    expect(css).toMatch(/\.karte-titel > \.hilfe-knopf \{[^}]*flex-shrink: 0;[^}]*margin-left: 0;/);
    // der Rumpf beginnt und endet im eigenen Abstand, gleich welches Element vorn oder hinten steht
    expect(css).toMatch(/\.karte-rumpf > :first-child \{\s*margin-top: 0;/);
    expect(css).toMatch(/\.karte-rumpf > :last-child \{\s*margin-bottom: 0;/);
  });

  it('schmale Fenster: zuerst geben die Seitenkarten nach, dann die Mitte von ihrer Wunschbreite', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'base.css'), 'utf8');
    expect(css).toMatch(/--karte-mitte-wunsch: 480px;/);
    expect(css).toMatch(/\.flaeche > \.flaechen-spalte:not\(\.wachsend\) \{[^}]*flex-shrink: 1000;[^}]*min-width: var\(--leiste-eigen-min, var\(--leiste-min\)\);/);
    expect(css).toMatch(/\.flaeche > \.flaechen-spalte\.wachsend \{[^}]*flex: 1 1 var\(--karte-mitte-wunsch\);[^}]*min-width: var\(--karte-mitte-min\);/);
  });

  it('Karte mit Abschnitten: bündiger Rumpf mit Klasse abschnitte; Linien und Überschriften aus base.css', () => {
    const host = render(h(Karte, { ariaLabel: 'Projekt, Geschosse und Flächen', abschnitte: true }, h('section', null, h('h2', null, 'Projekt')), h('section', null, h('h2', null, 'Geschosse'))));
    expect(host.querySelector('.karte-rumpf')!.className).toBe('karte-rumpf buendig abschnitte');
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'base.css'), 'utf8');
    expect(css).toMatch(/\.karte-rumpf\.abschnitte > section \{[^}]*padding: var\(--s3\) var\(--karte-pad\);[^}]*border-bottom: 1px solid var\(--line-soft\);/);
    expect(css).toMatch(/\.karte-rumpf\.abschnitte > section:last-child \{\s*padding-bottom: var\(--karte-pad\);\s*border-bottom: none;/);
    expect(css).toMatch(/\.karte-rumpf\.abschnitte > section > h2,\s*\.karte-rumpf\.abschnitte > section > \.section-head h2 \{[^}]*font-size: var\(--fs-l\);/);
    expect(css).toMatch(/\.karte-rumpf\.abschnitte > section > :first-child \{\s*margin-top: 0;/);
    expect(css).toMatch(/\.karte-rumpf\.abschnitte > section > :last-child \{\s*margin-bottom: 0;/);
  });

  it('Karte mit Leiste: fest zwischen Kopf und Rumpf, Leiste ohne eigene Fläche', () => {
    const host = render(h(Karte, { titel: 'Rechnungen', leiste: h('div', { className: 'toolbar', role: 'toolbar' }, h('button', null, 'Neu')) }, h('p', null, 'Liste')));
    const karte = host.querySelector('section.karte')!;
    expect([...karte.children].map((c) => c.className)).toEqual(['karte-kopf', 'karte-leiste', 'karte-rumpf']);
    expect(karte.querySelector('.karte-leiste > .toolbar > button')?.textContent).toBe('Neu');
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'base.css'), 'utf8');
    // ohne Kopf ist die Leiste das erste Kind
    const ohneKopf = render(h(Karte, { ariaLabel: 'Positionen', leiste: h('div', { className: 'toolbar' }, 'x') }, 'y'));
    expect([...ohneKopf.querySelector('section.karte')!.children].map((c) => c.className)).toEqual(['karte-leiste', 'karte-rumpf']);
    expect(css).toMatch(/\.karte-leiste \{[^}]*flex: none;[^}]*border-bottom: 1px solid var\(--line-soft\);/);
    expect(css).toMatch(/\.karte-leiste > \.toolbar \{[^}]*background: transparent;[^}]*border-bottom: none;/);
    expect(css).toMatch(/\.karte-kopf:has\(\+ \.karte-leiste\) \{\s*border-bottom-color: transparent;/);
  });

  it('Register in der Kartenleiste zeigen in schmaler Leiste den kurzen Namen; Kennzahlen brechen um', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'base.css'), 'utf8');
    // nur Leisten mit kurzen Namen werden Container (inline-size), gemessen an der Leiste, nicht am Fenster
    expect(css).toMatch(/\.segment \.kurz \{\s*display: none;/);
    expect(css).toMatch(/\.karte-leiste:has\(\.segment \.kurz\) \{\s*container: karte-leiste \/ inline-size;/);
    expect(css).toMatch(/@container karte-leiste \(max-width: 640px\) \{\s*\.segment \.lang \{\s*display: none;\s*\}\s*\.segment \.kurz \{\s*display: inline;/);
    expect(css).toMatch(/\.metric-row \{[^}]*flex-wrap: wrap;/);
    expect(css).toMatch(/\.metric \{[^}]*flex: 1 1 9em;[^}]*border-radius: var\(--radius-s\);/);
    expect(css).toMatch(/\.metric > strong \{[^}]*margin-top: auto;[^}]*font-size: var\(--fs-xl\);[^}]*white-space: nowrap;/);
  });

  it('Karte vorschau: Rumpf bündig auf dem Grund der Fläche', () => {
    const host = render(h(Karte, { titel: 'Vorschau', vorschau: true }, 'x'));
    expect(host.querySelector('.karte-rumpf')?.className).toBe('karte-rumpf buendig vorschau');
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'base.css'), 'utf8');
    expect(css).toMatch(/\.karte-rumpf\.vorschau \{\s*background: var\(--bg\);/);
    expect(css).toMatch(/\.karte-rumpf\.vorschau > \.muted \{[^}]*padding: var\(--s3\) var\(--karte-pad\);/);
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
    const h2 = karte.querySelector('.karte-kopf h2')!;
    expect(h2.textContent).toBe('Lageplan');
    expect(karte.getAttribute('aria-labelledby')).toBe(h2.id);
    expect(karte.querySelector('.karte-kopf > .karte-aktionen > button')?.textContent).toBe('3D');
  });

  it('ZeichenKarte: ZeichenFussInhalt aus der Zeichenfläche landet in der Fußzeile; als="main"; leere Fußzeile verborgen', () => {
    const host = render(
      h(ZeichenKarte, {
        ariaLabel: 'Grundriss',
        als: 'main',
        fuss: h('span', null, 'Hinweis'),
        children: h('div', { className: 'canvas' }, h('div', null, h(ZeichenFussInhalt, null, h('span', { className: 'koord' }, 'x 1,00')))),
      }),
    );
    const karte = host.querySelector('main.karte.zeichen-karte')!;
    expect(karte.getAttribute('aria-label')).toBe('Grundriss');
    const fuss = karte.querySelector('footer.zeichen-fuss')!;
    expect(fuss.textContent).toBe('Hinweisx 1,00');
    expect(karte.querySelector('.zeichen-flaeche .koord')).toBeNull();
    // außerhalb einer ZeichenKarte rendert ZeichenFussInhalt nichts
    const ohne = render(h('div', null, h(ZeichenFussInhalt, null, 'weg')));
    expect(ohne.textContent).toBe('');
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'base.css'), 'utf8');
    expect(css).toMatch(/\.zeichen-fuss:empty \{\s*display: none;/);
  });

  it('als: Spalte und Karte als main bzw. aside', () => {
    const host = render(
      h(Flaeche, {
        children: [h(FlaechenSpalte, { key: 's', als: 'main', wachsend: true, children: h(Karte, { titel: 'Ergebnis', hoehe: 'inhalt' }) }), h(Karte, { key: 'k', titel: 'Quellen', als: 'aside' })],
      }),
    );
    expect(host.querySelector('main.flaechen-spalte.wachsend > section.karte.karte-inhalt')).not.toBeNull();
    const aside = host.querySelector('aside.karte')!;
    expect(aside.getAttribute('aria-labelledby')).toBe(aside.querySelector('h2')!.id);
    expect(host.querySelector('div.flaechen-spalte')).toBeNull();
    // Karte als Hauptbereich behält ihren Namen
    const mitte = render(h(Karte, { titel: 'Ergebnis', als: 'main' }, 'x'));
    const main = mitte.querySelector('main.karte')!;
    expect(main.getAttribute('aria-labelledby')).toBe(main.querySelector('h2')!.id);
    // eine gewöhnliche Spalte (div) trägt keinen Namen
    const schlicht = render(h(FlaechenSpalte, { ariaLabel: 'x', children: 'a' }));
    expect(schlicht.querySelector('div.flaechen-spalte')!.hasAttribute('aria-label')).toBe(false);
    // zwei Nebenspalten mit eigenem Namen
    const zwei = render(
      h(Flaeche, {
        children: [h(FlaechenSpalte, { key: 'l', als: 'aside', ariaLabel: 'Gliederung', children: 'a' }), h(FlaechenSpalte, { key: 'r', als: 'aside', ariaLabel: 'Quellen', children: 'b' })],
      }),
    );
    expect([...zwei.querySelectorAll('aside.flaechen-spalte')].map((e) => e.getAttribute('aria-label'))).toEqual(['Gliederung', 'Quellen']);
  });

  it('ebene und als="div": viele gleichartige Karten ohne eigene Region, Überschrift h3', () => {
    const host = render(h(Karte, { titel: 'Bauherr', ebene: 3, als: 'div' }, 'x'));
    const karte = host.querySelector('div.karte')!;
    expect(karte.querySelector('.karte-kopf h3')?.textContent).toBe('Bauherr');
    expect(karte.querySelector('h2')).toBeNull();
    // kein benannter Bereich: weder aria-labelledby noch aria-label
    expect(karte.hasAttribute('aria-labelledby')).toBe(false);
    expect(karte.hasAttribute('aria-label')).toBe(false);
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'base.css'), 'utf8');
    expect(css).toMatch(/\.karte-kopf :is\(h2, h3\) \{[^}]*font-size: var\(--fs-l\);/);
  });

  it('rollende Spalte: Klasse rollend, Karten in Inhaltshöhe, Luft für Fokussaum', () => {
    const host = render(h(FlaechenSpalte, { wachsend: true, rollend: true, children: h(Karte, { titel: 'A' }) }));
    expect(host.querySelector('.flaechen-spalte')!.className).toBe('flaechen-spalte wachsend rollend');
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'base.css'), 'utf8');
    expect(css).toMatch(/\.flaechen-spalte\.rollend \{[^}]*overflow-y: auto;[^}]*box-sizing: content-box;[^}]*padding: var\(--s1\);/);
    // unten bündig mit den Seitenkarten (kein negativer Rand unten)
    expect(css).toMatch(/\.flaechen-spalte\.rollend \{[^}]*margin: calc\(-1 \* var\(--s1\)\) calc\(-1 \* var\(--s1\)\) 0;/);
    // fester Kopf deckt den Innenabstand ab: um --s1 nach oben versetzt und mit Grund der Fläche
    expect(css).toMatch(/\.flaechen-spalte\.rollend \.rollend-kopf \{[^}]*position: sticky;[^}]*top: calc\(-1 \* var\(--s1\)\);[^}]*background: var\(--bg\);/);
    expect(css).toMatch(/\.flaechen-spalte\.rollend:has\(\.rollend-kopf\) \{\s*scroll-padding-top: var\(--rollend-kopf-h, calc\(var\(--ctl-h\) \+ var\(--s2\) \+ 2 \* var\(--s1\)\)\);/);
    // Ebenen in den Karten bleiben unter dem Kopf, auch wenn die Karten in einer Hülle stehen (Nachfahre, nicht Kind)
    expect(css).toMatch(/\.flaechen-spalte\.rollend:has\(\.rollend-kopf\) \.karte \{\s*isolation: isolate;/);
    // auch Inhaltskarten und die Mindesthöhe der teilenden Karte gelten in der rollenden Spalte nicht
    expect(css).toMatch(
      /\.flaechen-spalte\.rollend > \.karte,\s*\.flaechen-spalte\.rollend > \.karte\.karte-inhalt,\s*\.flaechen-spalte\.rollend:has\(> \.karte-inhalt\) > \.karte:not\(\.karte-inhalt\) \{[^}]*flex: none;[^}]*min-height: 0;[^}]*max-height: none;/,
    );
    expect(css).not.toMatch(/\.placeholder-help/);
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
    // positioniert: absolut gesetzte Kinder bleiben im Rollbereich der Karte
    expect(css).toMatch(/\.karte-rumpf \{[^}]*position: relative;[^}]*overflow: auto;/);
    expect(css).toMatch(/\.flaeche \{[^}]*overflow: hidden;/);
    expect(css).toMatch(/\.app:has\(\.flaeche:not\(\.modal \*\)\) > \.toolbar \{/);
    // Radien aus der Skala, keine festen 6px mehr
    expect(css).not.toMatch(/border-radius: 6px/);
  });

  it('hoehe="inhalt": Klasse karte-inhalt, Vorgabe ohne; base.css begrenzt sie in der Spalte auf die halbe Höhe', () => {
    const host = render(h(FlaechenSpalte, { children: [h(Karte, { key: 'l', titel: 'Referenz' }), h(Karte, { key: 'k', titel: 'Objektiv', hoehe: 'inhalt', className: 'x' })] }));
    const [lang, kurz] = host.querySelectorAll('.karte');
    expect(lang.className).toBe('karte');
    expect(kurz.className).toBe('karte karte-inhalt x');
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'base.css'), 'utf8');
    expect(css).toMatch(/\.flaechen-spalte > \.karte\.karte-inhalt \{[^}]*flex: 0 1 auto;[^}]*max-height: 50%;/);
    // mehrere Inhaltskarten: die teilende Karte behält Kopf und einige Zeilen
    expect(css).toMatch(/\.flaechen-spalte:has\(> \.karte-inhalt\) > \.karte:not\(\.karte-inhalt\) \{[^}]*min-height: calc\(var\(--karte-kopf-h\) \+ 6 \* var\(--s4\)\);/);
    // die Inhaltskarte behält mindestens ihren Kopf
    expect(css).toMatch(/\.flaechen-spalte > \.karte\.karte-inhalt \{[^}]*min-height: var\(--karte-kopf-h\);/);
  });

  it('Zahlentabelle: gemischte Spalten, Felder, Gruppen- und Summenzeilen', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'base.css'), 'utf8');
    expect(css).toMatch(/\.summary-table\.text th\.num,\s*\.summary-table td\.num \{[^}]*text-align: right;/);
    expect(css).toMatch(/\.summary-table\.felder td \{[^}]*vertical-align: top;/);
    // nur Zeilen mit Feld oder Knopf (Anlass: NUMIO, Gruppenzeile ohne Feld wurde höher); :has() prüft happy-dom nicht verlässlich
    expect(css).toMatch(
      /\.summary-table\.felder tr:has\(input, select, textarea, button:not\(\.link\)\) > td:not\(:has\(input, select, textarea, button:not\(\.link\)\)\) \{[^}]*padding-top: calc\(3px \+ \(var\(--ctl-h\) - 1lh\) \/ 2\);/,
    );
    expect(css).toMatch(/\.summary-table tr\.gruppe td \{/);
    expect(css).toMatch(/\.summary-table tr\.summe td \{[^}]*border-top-color: color-mix\(in srgb, var\(--muted\) 60%, transparent\);/);
    // auf Papier bleibt die Gruppentönung hell
    expect(css).toMatch(/\n\.report \{[^}]*--tabelle-gruppe: #f1f3f6;/);
    // Tabellen ohne Felder oben bündig, gewählte Zeile, Verweisknopf als Text
    expect(css).toMatch(/\.summary-table\.oben td \{\s*vertical-align: top;/);
    expect(css).toMatch(/\.summary-table tr\.selected td \{\s*background: var\(--accent-soft\);/);
    expect(css).toMatch(/\nbutton\.link \{[^}]*border: none;[^}]*background: none;[^}]*color: var\(--accent-text\);[^}]*text-decoration: underline;/);
    expect(css).toMatch(/button\.link:hover:not\(:disabled\):not\(\[aria-disabled='true'\]\),\s*button\.link:focus-visible \{[^}]*text-decoration-color: currentColor;/);
    expect(css).toMatch(/\.summary-table tr\.selected td:first-child \{\s*box-shadow: inset 3px 0 var\(--accent\);/);
  });
});
