// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rectPoints } from '@core/geometry';
import type { Project } from '@core/model';
import { createOutline, createProject, createRoom } from '@core/model';
import { duplicateStorey, useEditor } from './store/store';
import { nummernAb } from './core/geschosse';
import { pruefZeilen } from './components/Pruefliste';
import { pruefeProjekt } from '@core/pruefung';
import { App } from './App';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
function render(p: Project): HTMLElement {
  useEditor.getState().loadProject(p, p, 'Haus.oap');
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(createElement(App));
  });
  act(() => [...host.querySelectorAll<HTMLButtonElement>('.pw-einstieg button')].find((x) => x.textContent === 'Schließen')?.click());
  return host;
}
beforeEach(() => localStorage.clear());
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

/** Haus mit BGF-Umriss und drei Räumen nebeneinander; Pflichtangaben gesetzt */
function haus(): { p: Project; ids: string[] } {
  const p = createProject('Haus');
  p.settings = { ...p.settings, massgrundlage: 'fertig', planunterlagen: 'Grundrisse 1:100' };
  p.storeys[0].shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 12, y: 5 })));
  const raeume = [0, 1, 2].map((i) => createRoom(rectPoints({ x: i * 4, y: 0 }, { x: i * 4 + 4, y: 5 }), `0.0${i + 1}`, `Raum ${i + 1}`));
  p.storeys[0].shapes.push(...raeume);
  return { p, ids: raeume.map((r) => r.id) };
}

const listenKnoepfe = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('.sidebar-left .shape-list .list-btn')].filter((b) => b.querySelector('.raum-nr'));
const klick = (el: HTMLElement, init: MouseEventInit = {}) => act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true, ...init })));

describe('QUADRIO: Flächenliste mit Mehrfachauswahl (B7)', () => {
  it('Klick wählt einen Raum, Strg+Klick schaltet dazu bzw. weg, Umschalt+Klick wählt den Bereich; die Liste markiert alle gewählten', () => {
    const { p, ids } = haus();
    const host = render(p);
    const [a, b, c] = listenKnoepfe(host);
    klick(a);
    expect(useEditor.getState().selectedIds).toEqual([ids[0]]);
    klick(c, { ctrlKey: true });
    expect(useEditor.getState().selectedIds).toEqual([ids[0], ids[2]]);
    expect(listenKnoepfe(host).map((x) => x.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'true']);
    klick(a, { ctrlKey: true });
    expect(useEditor.getState().selectedIds).toEqual([ids[2]]);
    // Gegenprobe: einfacher Klick ersetzt die Auswahl
    klick(b);
    expect(useEditor.getState().selectedIds).toEqual([ids[1]]);
    klick(listenKnoepfe(host)[0]);
    klick(listenKnoepfe(host)[2], { shiftKey: true });
    expect(useEditor.getState().selectedIds).toEqual(ids);
    expect(host.querySelector('.sidebar-right h2')?.textContent).toContain('3 Flächen gewählt');
  });
});

describe('QUADRIO: Raumtabelle (B3)', () => {
  const taste = (el: Element, key: string, shiftKey = false) => act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true })));

  it('Enter springt in Nr. zur nächsten Zeile, Umschalt+Enter zurück; Geschosse von oben nach unten mit Summen', () => {
    const { p } = haus();
    const og = createProject('x').storeys[0];
    og.name = 'OG';
    og.shapes.push(createRoom(rectPoints({ x: 0, y: 0 }, { x: 2, y: 2 }), '1.01', 'Bad'));
    p.storeys.push(og);
    const host = render(p);
    act(() => [...host.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.textContent === 'Raumtabelle …')!.click());
    expect([...document.querySelectorAll('.raumtabelle-geschoss th')].map((t) => t.textContent)).toEqual(['OG', 'EG']);
    expect(document.querySelector('.raumtabelle tfoot td')?.textContent).toBe('64,00');
    const nr = () => [...document.querySelectorAll<HTMLInputElement>('td[data-spalte="nummer"] input')];
    expect(nr().map((i) => i.value)).toEqual(['1.01', '0.01', '0.02', '0.03']);
    nr()[1].focus();
    taste(nr()[1], 'Enter');
    expect(document.activeElement).toBe(nr()[2]);
    taste(nr()[2], 'Enter', true);
    expect(document.activeElement).toBe(nr()[1]);
    // Gegenprobe: Putzabzug ist keine Sprungspalte, Enter bleibt in der Zeile
    const putz = document.querySelectorAll<HTMLInputElement>('.raumtabelle tbody input[aria-label="Putzabzug"]')[1];
    putz.focus();
    taste(putz, 'Enter');
    expect(nr()).not.toContain(document.activeElement);
  });

  it('beim Umnummerieren bleibt die Zeilenreihenfolge stehen; erst beim nächsten Öffnen wird neu sortiert', () => {
    const { p } = haus();
    const host = render(p);
    const oeffnen = () => act(() => [...host.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.textContent === 'Raumtabelle …')!.click());
    oeffnen();
    const nr = () => [...document.querySelectorAll<HTMLInputElement>('td[data-spalte="nummer"] input')].map((i) => i.value);
    expect(nr()).toEqual(['0.01', '0.02', '0.03']);
    const st = useEditor.getState();
    const erster = st.project.storeys[0].shapes.find((x) => x.kind === 'room' && x.nummer === '0.01')!;
    act(() => st.update((q) => ({ ...q, storeys: q.storeys.map((g) => ({ ...g, shapes: g.shapes.map((x) => (x.id === erster.id && x.kind === 'room' ? { ...x, nummer: '9.01' } : x)) })) })));
    expect(nr()).toEqual(['9.01', '0.02', '0.03']);
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.querySelector('.raumtabelle')).toBeNull();
    oeffnen();
    expect(nr()).toEqual(['0.02', '0.03', '9.01']); // Gegenprobe: neu geöffnet nach Nummer
  });
});

describe('QUADRIO: Prüfliste (B8)', () => {
  const pruefKnopf = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('.pruef-knopf')!;

  it('meldet fehlendes Messverfahren und fehlende Planungsunterlagen als Warnung; mit Angaben nicht', () => {
    const { p } = haus();
    p.settings = { ...p.settings, massgrundlage: undefined, planunterlagen: undefined };
    const host = render(p);
    expect(pruefKnopf(host).textContent).toMatch(/2 Warnungen/);
    act(() => pruefKnopf(host).click());
    const texte = [...host.querySelectorAll('.pruef-liste li')].map((li) => li.textContent);
    expect(texte[0]).toMatch(/^Projekt Messverfahren nicht angegeben/);
    expect(texte[1]).toMatch(/Planungsunterlagen nicht angegeben/);
    // Gegenprobe: Angaben gesetzt → keine Projektmeldung
    act(() => useEditor.getState().update((q) => ({ ...q, settings: { ...q.settings, massgrundlage: 'aufmass', planunterlagen: 'Aufmaß 2026' } })));
    expect(pruefKnopf(host).textContent).not.toMatch(/Warnung/);
  });

  it('fasst gleichartige Raummeldungen eines Geschosses zusammen; Klick wählt alle betroffenen Räume', () => {
    const { p, ids } = haus();
    for (const s of p.storeys[0].shapes) if (s.kind === 'room') s.wofl = { ...s.wofl, kategorie: 'voll', wohnung: '' };
    const zeilen = pruefZeilen(p, [
      ...ids.map((id, i) => ({ art: 'hinweis' as const, regel: 'ohne-wohnung', storeyId: p.storeys[0].id, shapeIds: [id], text: `Raum ${i + 1} ohne Wohnung` })),
      { art: 'warnung' as const, regel: 'nrf-groesser-bgf', storeyId: p.storeys[0].id, shapeIds: [], text: 'NRF größer' },
    ]);
    expect(zeilen.map((z) => z.text)).toEqual(['NRF größer', '3 Räume zählen zur Wohnfläche, aber ohne Wohnung – alle wählen und Wohnung eintragen.']);
    expect(zeilen[1].shapeIds).toEqual(ids);
    // Gegenprobe: eine einzelne Meldung bleibt im Wortlaut (auch die schon in core zusammengefasste „keine-wofl“)
    expect(pruefZeilen(p, [{ art: 'hinweis', regel: 'ohne-wohnung', storeyId: p.storeys[0].id, shapeIds: [ids[0]], text: 'Raum 1 ohne Wohnung' }])[0].text).toBe('Raum 1 ohne Wohnung');
  });

  it('„keine Wohnfläche“ kommt als eine Zeile mit allen Räumen an; der Projekt-Hinweis erscheint bei Wohnräumen ohne Anrechnung', () => {
    const p = createProject('Haus');
    p.storeys[0].shapes.push(createRoom(rectPoints({ x: 0, y: 0 }, { x: 4, y: 4 }), '0.01', 'Wohnen'), createRoom(rectPoints({ x: 5, y: 0 }, { x: 9, y: 4 }), '0.02', 'Schlafen'));
    const zeilen = pruefZeilen(p, pruefeProjekt(p));
    const projekt = zeilen.filter((z) => z.text.startsWith('Keine Wohnfläche erfasst'));
    expect(projekt).toHaveLength(1);
    expect(projekt[0].shapeIds).toHaveLength(2);
    // ein Raum zählt: kein Projekt-Hinweis mehr, der andere steht in der Geschossmeldung
    p.storeys[0].shapes[0] = { ...(p.storeys[0].shapes[0] as ReturnType<typeof createRoom>), wofl: { kategorie: 'voll', wohnung: 'WE 01' } };
    const z2 = pruefZeilen(p, pruefeProjekt(p));
    expect(z2.some((z) => z.text.startsWith('Keine Wohnfläche erfasst'))).toBe(false);
    const geschoss = z2.filter((z) => z.text.includes('nicht zur Wohnfläche'));
    expect(geschoss).toHaveLength(1);
    expect(geschoss[0].text).toMatch(/^1 Raum zählt nicht zur Wohnfläche: 0\.02 Schlafen/);
  });
});

describe('QUADRIO: Auswertung ein- und ausklappbar (B1)', () => {
  it('eingeklappt nur die Kurzfassung; „Alle Kennzahlen“ zeigt die Tabelle und merkt sich das', () => {
    localStorage.setItem('arch-flaechen-tool:auswertung-offen', '0');
    const { p } = haus();
    let host = render(p);
    expect(host.querySelector('.summary-table')).toBeNull();
    expect(host.querySelector('.summary-kurz')?.textContent).toContain('BGF 60,00');
    act(() => [...host.querySelectorAll<HTMLButtonElement>('.summary button')].find((b) => b.textContent === 'Alle Kennzahlen')!.click());
    expect(host.querySelector('.summary-table')).not.toBeNull();
    expect(localStorage.getItem('arch-flaechen-tool:auswertung-offen')).toBe('1');
    act(() => root?.unmount());
    document.body.innerHTML = '';
    host = render(p);
    expect(host.querySelector('.summary-table')).not.toBeNull();
    // Gegenprobe: wieder einklappen
    act(() => [...host.querySelectorAll<HTMLButtonElement>('.summary button')].find((b) => b.textContent === 'Kurzfassung')!.click());
    expect(host.querySelector('.summary-table')).toBeNull();
  });
});

describe('QUADRIO: Nummern und Geschoss duplizieren (B7, B10)', () => {
  it('nummernAb zählt mit gleicher Stellenzahl weiter; ohne Ziffern am Ende null', () => {
    expect(nummernAb('1.08', 3)).toEqual(['1.08', '1.09', '1.10']);
    expect(nummernAb('R9', 2)).toEqual(['R9', 'R10']);
    expect(nummernAb('Bad', 2)).toBeNull();
  });

  it('Duplikat mit eigenem Namen unter dem Original; ohne Angabe darüber mit Namensvorschlag', () => {
    const { p } = haus();
    const unten = duplicateStorey(p, p.storeys[0].id, undefined, { name: 'KG', lage: 'darunter' });
    expect(unten.project.storeys.map((s) => s.name)).toEqual(['KG', 'EG']);
    expect(unten.project.storeys[0].elevation).toBe(-3);
    const oben = duplicateStorey(p, p.storeys[0].id);
    expect(oben.project.storeys.map((s) => s.name)).toEqual(['EG', '1. OG']);
  });
});
