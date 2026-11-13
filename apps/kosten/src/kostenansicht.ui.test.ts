// @vitest-environment happy-dom
import type { FunctionComponent } from 'react';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { createProject } from '@core/model';
import { App } from './App';
import { KostenView } from './components/KostenView';
import { KG_RISIKO } from './din276';
import { setKosten, useKosten } from './store';
import { projekt, projektMitKosten } from './testdaten';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
function render<P extends object>(el: FunctionComponent<P>, props?: P): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(createElement(el, props));
  });
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});
const knopf = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;
const kosten = () => useKosten.getState().project.kosten!;
const eingabe = (el: HTMLInputElement, value: string) => {
  act(() => {
    el.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => el.blur());
};
const ansicht = () => render(KostenView, { onKatalog: () => undefined });

describe('Kostenansicht: Bedienung', () => {
  it('Startbildschirm zeigt nur den Einstieg; nach „Neues Projekt“ die Kostenansicht', async () => {
    useKosten.getState().load(createProject());
    const host = render(App);
    expect(host.querySelector('.ko-view')).toBeNull();
    expect(host.textContent).toContain('Kostenermittlung nach DIN 276');
    await act(async () => knopf(host.querySelector('main')!, 'Neues Projekt').click());
    expect(host.querySelector('.ko-view')).not.toBeNull();
  });

  it('Stufe ohne Angabe: Auswahl, Überschrift und Leertext sagen dasselbe (Kostenschätzung)', () => {
    const p = projekt();
    p.kosten = { positionen: [] };
    useKosten.getState().load(p);
    const host = ansicht();
    expect((host.querySelector('select') as HTMLSelectElement).value).toBe('schaetzung');
    expect(host.querySelector('.ko-uebersicht h2')!.textContent).toBe('Kostenschätzung');
    expect(host.textContent).toContain('Für die Kostenschätzung passt die Gliederung 2. Ebene');
    expect(host.textContent).toContain('mindestens 2. Ebene');
  });

  it('Gliederung legt nur fehlende Kostengruppen an und ist danach gesperrt', () => {
    useKosten.getState().load(projekt());
    const host = ansicht();
    act(() => knopf(host, 'Gliederung 1. Ebene').click());
    expect(kosten().positionen.map((p) => p.kg)).toEqual(['300', '400', '500', '700']);
    expect(knopf(host, 'Gliederung 1. Ebene').disabled).toBe(true);
    // Gegenprobe: eine gelöschte Kostengruppe wird wieder angelegt, die übrigen nicht doppelt
    act(() => useKosten.getState().update((p) => setKosten(p, { positionen: kosten().positionen.filter((x) => x.kg !== '400') })));
    expect(knopf(host, 'Gliederung 1. Ebene').disabled).toBe(false);
    act(() => knopf(host, 'Gliederung 1. Ebene').click());
    expect(kosten().positionen.map((p) => p.kg)).toEqual(['300', '400', '500', '700']);
  });

  it('Gliederung 2. Ebene neben erfasster 1. Ebene: Rückfrage, dann KG 300/400 ausgeschaltet, keine Doppelerfassung', async () => {
    useKosten.getState().load(projektMitKosten());
    const host = render(App); // mit App: die Rückfrage braucht deren Dialogwurzel
    // 500 ist über 530/540 schon erfasst, 300/400/700 selbst: die 1. Ebene ist vollständig
    expect(knopf(host, 'Gliederung 1. Ebene').disabled).toBe(true);
    const rueckfrage = async () => {
      for (let i = 0; i < 10 && !document.querySelector('.modal.rf'); i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
      return document.querySelector('.modal.rf')!;
    };
    await act(async () => knopf(host, 'Gliederung 2. Ebene').click());
    const dialog = await rueckfrage();
    expect(dialog.textContent).toContain('KG 300, 400 ausschalten?');
    // Gegenprobe: Abbrechen ändert nichts
    await act(async () => knopf(dialog, 'Abbrechen').click());
    for (let i = 0; i < 5; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(kosten().positionen).toHaveLength(5);
    await act(async () => knopf(host, 'Gliederung 2. Ebene').click());
    await act(async () => knopf(await rueckfrage(), 'Ausschalten und anlegen').click());
    for (let i = 0; i < 5; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
    const pos = kosten().positionen;
    expect(pos.filter((p) => p.aus).map((p) => p.kg)).toEqual(['300', '400']);
    expect(pos.map((p) => p.kg)).toContain('310');
    expect(pos.filter((p) => p.kg === '500')).toHaveLength(0);
    expect(host.textContent).not.toContain('Doppelt erfasst');
  });

  it('„Position“ (hinzufügen) legt eine leere Zeile an und setzt den Fokus in die Kostengruppe', async () => {
    useKosten.getState().load(projektMitKosten());
    const host = ansicht();
    act(() => knopf(host, 'Position').click());
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    const neu = kosten().positionen.find((p) => p.kg === '')!;
    expect(neu).toBeDefined();
    const zeile = host.querySelector(`tr[data-pos="${neu.id}"]`)!;
    expect(zeile.textContent).toContain('Kostengruppe eintragen');
    expect(document.activeElement).toBe(zeile.querySelector('input[aria-label="Kostengruppe"]'));
    eingabe(document.activeElement as HTMLInputElement, '361');
    expect(kosten().positionen.find((p) => p.id === neu.id)).toMatchObject({ kg: '361', bezeichnung: '', bezug: 'daf' });
  });

  it('ungültige Kostengruppe und Doppelerfassung stehen an der Zeile', () => {
    const p = projektMitKosten();
    p.kosten!.positionen.push({ id: 'p330', kg: '330', bezeichnung: 'Außenwände', bezug: 'awf', mittel: 400 }, { id: 'px', kg: '999', bezeichnung: 'Tippfehler', bezug: 'pauschal', mittel: 1 });
    useKosten.getState().load(p);
    const host = ansicht();
    const zeile = (id: string) => host.querySelector(`tr[data-pos="${id}"]`)!;
    expect(zeile('p330').textContent).toContain('Doppelt erfasst mit KG 300');
    expect(zeile('p300').textContent).toContain('Doppelt erfasst mit KG 330');
    expect(zeile('px').textContent).toContain('dreistellig, 100–899');
    expect(zeile('px').textContent).toContain('Wird nicht gerechnet');
    expect(zeile('px').querySelector('input[aria-label="Kostengruppe"]')!.className).toContain('feld-fehler');
    // Gegenprobe: ausgeschaltet keine Doppelerfassung
    act(() => (zeile('p330').querySelector('input[type="checkbox"]') as HTMLInputElement).click());
    expect(zeile('p300').textContent).not.toContain('Doppelt erfasst');
    // Felder der Tabelle haben zugängliche Namen
    expect(zeile('p300').querySelector('input[aria-label="Mittel, KG 300"]')).not.toBeNull();
  });

  it('festgelegte Menge: markiert, mit Knopf zurück auf den abgeleiteten Wert', () => {
    const p = projektMitKosten();
    p.kosten!.mengen = { bgf: 600 };
    useKosten.getState().load(p);
    const host = ansicht();
    const zeile = host.querySelector('.ko-mengen tr.festgelegt')!;
    expect(zeile.textContent).toContain('abgeleitet 540,00');
    act(() => (zeile.querySelector('button[aria-label^="BGF auf den abgeleiteten Wert"]') as HTMLButtonElement).click());
    expect(kosten().mengen).toBeUndefined();
    expect(host.querySelector('.ko-mengen tr.festgelegt')).toBeNull();
  });

  it('Kostenrisiko: eigene Gruppe, gesondert vor „Gesamt netto“', () => {
    useKosten.getState().load(projektMitKosten());
    const host = ansicht();
    act(() => knopf(host, 'Kostenrisiko').click());
    const r = kosten().positionen.find((p) => p.kg === KG_RISIKO)!;
    expect(r).toMatchObject({ bezug: 'prozent', basis: ['300', '400'], bezeichnung: 'Kostenrisiken' });
    eingabe(host.querySelector(`tr[data-pos="${r.id}"] input[aria-label="Mittel, Kostenrisiko"]`) as HTMLInputElement, '5');
    const zeilen = [...host.querySelectorAll('.ko-uebersicht tbody tr')].map((z) => z.textContent ?? '');
    const i = zeilen.findIndex((z) => z.startsWith('Kostenrisiken'));
    expect(i).toBeGreaterThan(0);
    expect(zeilen[i + 1]).toContain('Gesamt netto');
    // 5 % von (972.000 + 324.000) = 64.800 €
    expect(zeilen[i]).toContain('64.800 €');
    expect(host.textContent).not.toContain('keine gültige Kostengruppe');
  });

  it('Stand festhalten mit Enter im Bemerkungsfeld', () => {
    useKosten.getState().load(projektMitKosten());
    const host = ansicht();
    const feld = host.querySelector('input[aria-label="Bemerkung zum festgehaltenen Stand"]') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(feld, 'Variante A');
      feld.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      feld.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(kosten().staende?.map((s) => s.bemerkung)).toEqual(['Variante A']);
    expect(feld.value).toBe('');
    expect(host.textContent).toContain('vorherjetztDifferenz');
  });
});
