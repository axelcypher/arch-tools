// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MenueHost } from '@core/ui/Menue';
import { demoLaden } from './demo';
import { useAva } from './store';
import { zeilenVon } from './components/lv/LvEditor';
import { GewerkAnsicht } from './components/GewerkAnsicht';
import { Maengel } from './components/bauleitung/Maengel';
import { Bautagebuch } from './components/bauleitung/Bautagebuch';
import { Preisspiegel } from './components/lv/Angebote';
import { MailListe } from './components/bauleitung/Mailverlauf';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
let host: HTMLDivElement;

const warte = async (bis: () => unknown, n = 40) => {
  for (let i = 0; i < n && !bis(); i++) await act(async () => new Promise((r) => setTimeout(r, 5)));
};

const zeige = (el: React.ReactElement) =>
  act(() => {
    root = createRoot(host);
    root.render(createElement('div', null, el, createElement(MenueHost)));
  });

/** Gewerk wie in der App: der Tab kommt aus dem Store */
function Gewerk() {
  const a = useAva((s) => s.ansicht);
  return a.art === 'gewerk' ? createElement(GewerkAnsicht, { gewerk: a.gewerk, tab: a.tab }) : null;
}

beforeEach(async () => {
  host = document.createElement('div');
  document.body.appendChild(host);
  await demoLaden();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

/** Selektorliste an den Kommas der obersten Ebene teilen (nicht in :has(…)/:not(…)) */
const selektoren = (liste: string) => {
  const teile: string[] = [];
  let tiefe = 0;
  let aktuell = '';
  for (const z of liste) {
    if (z === ',' && tiefe === 0) {
      teile.push(aktuell);
      aktuell = '';
      continue;
    }
    if (z === '(') tiefe++;
    if (z === ')') tiefe--;
    aktuell += z;
  }
  return [...teile, aktuell];
};

describe('Kartenlayout (docs/design.md „Fläche und Karten“)', () => {
  it('Gewerk: eine Hauptkarte mit dem Gewerk als Titel, Tabs und Werkzeugleiste in der Kartenleiste, Tabpanel passend zum Tab', async () => {
    act(() => useAva.getState().setAnsicht({ art: 'gewerk', gewerk: 'G8', tab: 'lv' }));
    await zeige(createElement(Gewerk));
    await warte(() => useAva.getState().lv && host.querySelector('.ava-lv-zeilen'));
    const mains = host.querySelectorAll('main.karte');
    expect(mains.length).toBe(1);
    const karte = mains[0];
    expect(karte.querySelector('.karte-kopf h2')?.textContent).toContain('Fenster');
    const leiste = karte.querySelector('.karte-leiste')!;
    expect(leiste.querySelector('[role="tablist"]')).not.toBeNull();
    expect(leiste.querySelector('.toolbar.werkzeugleiste[aria-label="Werkzeuge Leistungsverzeichnis"]')).not.toBeNull();
    const panel = karte.querySelector('[role="tabpanel"]')!;
    expect(panel.id).toBe('ava-gewerk-inhalt');
    expect(panel.getAttribute('aria-labelledby')).toBe('ava-tab-lv');
    expect(document.getElementById('ava-tab-lv')?.getAttribute('aria-controls')).toBe('ava-gewerk-inhalt');
    // Summen im Kartenfuß, Eigenschaften als benannte Seitenkarte
    expect(karte.querySelector('.karte-fuss .ava-lv-fuss')).not.toBeNull();
    const aside = host.querySelector('aside.karte')!;
    expect(aside.querySelector('.karte-kopf h2')?.textContent).toBe('Eigenschaften');
  });

  it('Tabs mit kurzem und langem Namen (core .lang/.kurz): zugänglicher Name enthält den kurzen, title den vollen', async () => {
    act(() => useAva.getState().setAnsicht({ art: 'gewerk', gewerk: 'G8', tab: 'lv' }));
    await zeige(createElement(Gewerk));
    await warte(() => host.querySelector('#ava-tab-lv'));
    const lv = document.getElementById('ava-tab-lv')!;
    expect(lv.getAttribute('aria-label')).toBe('Leistungsverzeichnis (LV)');
    expect(lv.getAttribute('title')).toMatch(/^Leistungsverzeichnis: /);
    expect(lv.querySelector('.lang')?.textContent).toBe('Leistungsverzeichnis');
    expect(lv.querySelector('.kurz[aria-hidden="true"]')?.textContent).toBe('LV');
    expect(document.getElementById('ava-tab-angebote')?.getAttribute('aria-label')).toBe('Angebote & Preisspiegel');
  });

  it('Tabwechsel per Klick: der neue Tab hat den Fokus, das Tabpanel gehört zu ihm', async () => {
    act(() => useAva.getState().setAnsicht({ art: 'gewerk', gewerk: 'G8', tab: 'lv' }));
    await zeige(createElement(Gewerk));
    await warte(() => host.querySelector('#ava-tab-angebote'));
    const tab = document.getElementById('ava-tab-angebote') as HTMLButtonElement;
    tab.focus();
    await act(async () => tab.click());
    await warte(() => document.activeElement?.id === 'ava-tab-angebote');
    expect(document.activeElement?.id).toBe('ava-tab-angebote');
    expect(document.activeElement?.getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe('ava-tab-angebote');
    expect(host.querySelectorAll('main.karte').length).toBe(1);
  });

  it('Tabwechsel mit →: Fokus wandert mit', async () => {
    act(() => useAva.getState().setAnsicht({ art: 'gewerk', gewerk: 'G8', tab: 'lv' }));
    await zeige(createElement(Gewerk));
    await warte(() => host.querySelector('#ava-tab-lv'));
    const tab = document.getElementById('ava-tab-lv')!;
    tab.focus();
    await act(async () => void tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })));
    await warte(() => document.activeElement?.id === 'ava-tab-angebote');
    expect(document.activeElement?.id).toBe('ava-tab-angebote');
  });

  it('LV: Enter in der Tabelle springt in den Kurztext der Karte „Eigenschaften“, Esc zurück in die Tabelle', async () => {
    act(() => useAva.getState().setAnsicht({ art: 'gewerk', gewerk: 'G8', tab: 'lv' }));
    await zeige(createElement(Gewerk));
    await warte(() => useAva.getState().lv && host.querySelector('.ava-lv-zeilen'));
    const z = zeilenVon(useAva.getState().lv!.lv).find((x) => x.el.art === 'position')!;
    act(() => useAva.getState().setAuswahl(z.el.id));
    await warte(() => host.querySelector('.ava-panel [data-feld="kurztext"]'));
    const tabelle = host.querySelector<HTMLElement>('.ava-lv-tabelle')!;
    tabelle.focus();
    await act(async () => void tabelle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    const kurztext = host.querySelector<HTMLElement>('.ava-panel [data-feld="kurztext"]')!;
    expect(document.activeElement).toBe(kurztext);
    expect(kurztext.closest('aside.karte')).not.toBeNull();
    await act(async () => void kurztext.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(tabelle);
  });

  it('Ansichten außerhalb des Gewerks: eigene Hauptkarte mit Titel; Bautagebuch mit Liste als Seitenkarte', async () => {
    await zeige(createElement(Maengel));
    await warte(() => host.querySelector('main.karte'));
    expect(host.querySelectorAll('main.karte').length).toBe(1);
    expect(host.querySelector('main.karte .karte-kopf h2')?.textContent).toBe('Mängel');
    expect(host.querySelector('main.karte [role="tabpanel"]')).toBeNull();
    act(() => root?.unmount());
    await zeige(createElement(Bautagebuch));
    await warte(() => host.querySelector('aside.karte'));
    expect(host.querySelector('aside.karte .karte-kopf h2')?.textContent).toBe('Bautagebuch');
    expect(host.querySelectorAll('main.karte').length).toBe(1);
  });

  it('Tabellen auf der gemeinsamen Zahlentabelle: LV mit Gruppenzeilen und gewählter Zeile, Preisspiegel mit Gruppen und Summe', async () => {
    act(() => useAva.getState().setAnsicht({ art: 'gewerk', gewerk: 'G8', tab: 'lv' }));
    await zeige(createElement(Gewerk));
    await warte(() => useAva.getState().lv && host.querySelector('.ava-lv-zeilen'));
    const lv = host.querySelector('table.ava-lv-zeilen')!;
    // fester Kopf, wählbare Zeilen und Zellenfelder aus core
    for (const k of ['summary-table', 'felder', 'fest', 'waehlbar']) expect(lv.classList.contains(k)).toBe(true);
    expect(lv.querySelectorAll('td.num > input.num.zelle').length).toBeGreaterThan(0);
    expect(lv.querySelectorAll('tbody tr.gruppe').length).toBeGreaterThan(0);
    expect(lv.querySelector('tbody tr.gruppe')?.classList.contains('ava-z-abschnitt')).toBe(true);
    const z = zeilenVon(useAva.getState().lv!.lv).find((x) => x.el.art === 'position')!;
    act(() => useAva.getState().setAuswahl(z.el.id));
    await warte(() => lv.querySelector('tbody tr.selected'));
    expect(lv.querySelectorAll('tbody tr.selected').length).toBe(1);
    expect(host.querySelector('tr.active')).toBeNull();
    // Preisspiegel
    act(() => useAva.getState().setAnsicht({ art: 'gewerk', gewerk: 'G8', tab: 'angebote' }));
    await warte(() => host.querySelector('table.ava-spiegel-tabelle'));
    const spiegel = host.querySelector('table.ava-spiegel-tabelle')!;
    expect(spiegel.querySelectorAll('tbody tr.gruppe').length).toBeGreaterThan(0);
    expect(spiegel.querySelector('tfoot tr')?.classList.contains('summe')).toBe(true);
    expect(spiegel.classList.contains('fest')).toBe(true);
    // Bieterliste: wählbar nur im Modus „Preise erfassen“
    const bieter = () => host.querySelector('.ava-bieter-liste table')!;
    expect(bieter().classList.contains('fest')).toBe(true);
    expect(bieter().classList.contains('waehlbar')).toBe(false);
    const erfassen = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Preise erfassen')!;
    await act(async () => erfassen.click());
    await warte(() => host.querySelector('table.ava-erfassen-tabelle'));
    expect(bieter().classList.contains('waehlbar')).toBe(true);
    expect(bieter().querySelectorAll('tbody tr[aria-selected="true"]').length).toBe(1);
    const tabelle = host.querySelector('table.ava-erfassen-tabelle')!;
    for (const k of ['felder', 'fest']) expect(tabelle.classList.contains(k)).toBe(true);
    expect(tabelle.querySelectorAll('input.num.zelle').length).toBeGreaterThan(0);
    expect(host.querySelector('.ava-tabelle')).toBeNull();
  });

  it('Mails ohne Treffer: Leertext als tr.leer im tbody, kein tfoot', async () => {
    await zeige(createElement(MailListe, { dateien: [] }));
    await warte(() => host.querySelector('.ava-mail-tabelle'));
    const leer = host.querySelector('.ava-mail-tabelle tbody tr.leer');
    expect(leer?.textContent).toContain('Keine Mails.');
    expect(host.querySelector('.ava-mail-tabelle tfoot')).toBeNull();
  });

  it('Preisspiegel im Druck ohne festen Kopf (fest nur auf dem Bildschirm)', async () => {
    act(() => useAva.getState().setAnsicht({ art: 'gewerk', gewerk: 'G8', tab: 'lv' }));
    await zeige(createElement(Gewerk));
    await warte(() => useAva.getState().lv);
    act(() => root?.unmount());
    await zeige(createElement(Preisspiegel, { druck: true }));
    await warte(() => host.querySelector('table.ava-spiegel-tabelle'));
    expect(host.querySelector('table.ava-spiegel-tabelle')!.classList.contains('fest')).toBe(false);
  });

  it('styles.css: keine eigene Grundtabelle, kein eigener fester Kopf, keine eigenen Zellenfelder; Ergänzungen zur Zahlentabelle nur in der Fläche', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'styles.css'), 'utf8');
    expect(css).not.toMatch(/\.ava-tabelle\s*[{,]/);
    expect(css).not.toMatch(/tr\.active/);
    expect(css).not.toMatch(/\.ava-zwischensumme/);
    expect(css).not.toMatch(/thead[^{]*\{[^}]*position: sticky/);
    expect(css).not.toMatch(/\.ava-(zelle-eingabe|klickbar|tabelle-rolle|tabelle-rahmen|fehler)\b/);
    // seit core #216: Platz unter festen Köpfen, Breite der Zellenfelder und Fokusrahmen wählbarer Zeilen aus core
    expect(css).not.toMatch(/scroll-padding-top/);
    expect(css).not.toMatch(/input\.zelle\s*\{/);
    expect(css).not.toMatch(/waehlbar[^{]*:focus-visible/);
    // alle App-Regeln auf .summary-table hängen an .ava-flaeche (der Druck liegt als Portal außerhalb)
    const ohneKommentare = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of ohneKommentare.matchAll(/([^{}]+)\{/g))
      for (const sel of selektoren(m[1].replace(/\s+/g, ' '))) if (sel.includes('.summary-table') && !sel.trim().startsWith('@')) expect(sel.trim()).toMatch(/^\.ava-(flaeche|spiegel-druck|druck)\b/);
  });
});
