// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { Project } from '@core/model';
import { App } from './App';
import { useKosten } from './store';
import { projektMitAnbau } from './testdaten';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
/** NUMIO mit dem Projekt öffnen und in „Mengen prüfen“ wechseln */
function mengenPruefen(p: Project): HTMLElement {
  useKosten.getState().load(p);
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(createElement(App));
  });
  act(() => knopf(host, 'Mengen prüfen').click());
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

const knopf = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;
const kosten = () => useKosten.getState().project.kosten;
const titel = (host: Element) => host.querySelector('.mv-bild h2')?.textContent;
const zeileDerMenge = (host: Element, kurz: string) => [...host.querySelectorAll('.mv-liste tbody tr')].find((z) => z.querySelector('strong')?.textContent === kurz) as HTMLElement;
const listenKnopf = (host: Element, kurz: string) => zeileDerMenge(host, kurz).querySelector('button') as HTMLButtonElement;
const rechenweg = (host: Element) => [...host.querySelectorAll<HTMLElement>('.mv-rechenweg tbody tr[data-teil]')];
const legende = (host: Element) => [...host.querySelectorAll('.mv-legende span')].map((s) => s.textContent?.trim());
const taste = (el: Element, key: string) => act(() => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));

describe('NUMIO – Mengen prüfen', () => {
  it('Handwert: gültiger Wert groß, abgeleiteter klein darunter; „Handwert entfernen“ löscht ihn', () => {
    const p = projektMitAnbau();
    p.kosten = { positionen: [], mengen: { bgf: 250, nuf: 20 } };
    const host = mengenPruefen(p);
    const bgf = () => zeileDerMenge(host, 'BGF');
    expect(bgf().querySelector('.mv-menge-wert')?.textContent).toBe('250,00 m²');
    expect(bgf().querySelector('.mv-menge-zusatz')?.textContent).toBe('festgelegtabgeleitet 245,00');
    // Gegenprobe: Mengen ohne Handwert haben keine zweite Zeile
    expect(zeileDerMenge(host, 'BRI').querySelector('.mv-menge-zusatz')).toBeNull();
    expect(host.querySelector('.mv-rechenweg')?.textContent).toContain('Die Auswahl wirkt erst ohne Handwert');

    act(() => knopf(host.querySelector('.mv-handwert')!, 'Handwert entfernen').click());
    expect(kosten()?.mengen).toEqual({ nuf: 20 });
    expect(host.querySelector('.mv-handwert')).toBeNull();
    expect(host.querySelector('.mv-rechenweg')?.textContent).not.toContain('Die Auswahl wirkt erst ohne Handwert');
    expect(bgf().querySelector('.mv-menge-wert')?.textContent).toBe('245,00 m²');
    expect(bgf().querySelector('.mv-menge-zusatz')).toBeNull();
  });

  it('Kennzeichen „Auswahl geändert“, solange ein Teil vom Standard abweicht', () => {
    const host = mengenPruefen(projektMitAnbau());
    const zusatz = () => zeileDerMenge(host, 'BGF').querySelector('.mv-menge-zusatz');
    expect(zusatz()).toBeNull();
    act(() => (rechenweg(host)[1].querySelector('input') as HTMLInputElement).click());
    expect(zusatz()?.textContent).toBe('Auswahl geändert');
    expect(zusatz()?.querySelector('[title]')?.getAttribute('title')).toBe('2 von 3 Teilen zählen');
    // andere Mengen bleiben ohne Kennzeichen
    expect(zeileDerMenge(host, 'BRI').querySelector('.mv-menge-zusatz')).toBeNull();
    act(() => knopf(host.querySelector('.mv-auswahl')!, 'Standard').click());
    expect(zusatz()).toBeNull();
  });

  it('Mengenliste per Tastatur: eine Schaltfläche je Menge, ↑/↓ und Pos1/Ende wählen', () => {
    const host = mengenPruefen(projektMitAnbau());
    expect(titel(host)).toContain('BGF');
    // nur die gewählte Menge liegt in der Tab-Reihenfolge
    expect([...host.querySelectorAll('.mv-menge-knopf')].filter((b) => (b as HTMLElement).tabIndex === 0)).toHaveLength(1);
    expect(listenKnopf(host, 'BGF').getAttribute('aria-current')).toBe('true');
    act(() => listenKnopf(host, 'BGF').focus());
    taste(listenKnopf(host, 'BGF'), 'ArrowDown');
    expect(titel(host)).toContain('BRI – Brutto-Rauminhalt');
    expect(document.activeElement).toBe(listenKnopf(host, 'BRI'));
    expect(listenKnopf(host, 'BRI').tabIndex).toBe(0);
    expect(listenKnopf(host, 'BGF').tabIndex).toBe(-1);
    taste(listenKnopf(host, 'BRI'), 'ArrowUp');
    expect(titel(host)).toContain('BGF');
    // am Anfang bleibt ↑ stehen
    taste(listenKnopf(host, 'BGF'), 'ArrowUp');
    expect(titel(host)).toContain('BGF');
    taste(listenKnopf(host, 'BGF'), 'End');
    expect(titel(host)).toContain('WE – Wohneinheiten');
    expect(document.activeElement).toBe(listenKnopf(host, 'WE'));
    // Enter/Leertaste lösen bei der Schaltfläche den Klick aus
    act(() => listenKnopf(host, 'GRF').click());
    expect(titel(host)).toContain('GRF');
  });

  it('Fokus auf dem Häkchen hebt das Teil im Bild hervor', () => {
    const host = mengenPruefen(projektMitAnbau());
    const haekchen = rechenweg(host)[1].querySelector('input') as HTMLInputElement;
    expect(haekchen.getAttribute('aria-label')).toBe('Anbau (R) zählt zur Menge');
    expect(host.querySelectorAll('.mp-teil.aktiv')).toHaveLength(0);
    act(() => haekchen.focus());
    expect(host.querySelectorAll('.mp-teil.aktiv')).toHaveLength(1);
    expect(host.querySelector('.mp-teil.aktiv')?.getAttribute('aria-label')).toBe('Anbau (R): 20,00 (EG) – zählt zur Menge');
    expect(rechenweg(host)[1].className).toContain('mv-aktiv');
    expect(rechenweg(host)[1].className).not.toContain('selected');
    act(() => haekchen.blur());
    expect(host.querySelectorAll('.mp-teil.aktiv')).toHaveLength(0);
  });

  it('Grundriss per Tastatur: Teile sind Kontrollkästchen, Leertaste schaltet', () => {
    const host = mengenPruefen(projektMitAnbau());
    const teil = () => host.querySelectorAll('.mp-teil')[2] as SVGGElement;
    expect(teil().getAttribute('role')).toBe('checkbox');
    expect(teil().getAttribute('tabindex')).toBe('0');
    expect(teil().getAttribute('aria-checked')).toBe('true');
    taste(teil(), ' ');
    expect(teil().getAttribute('aria-checked')).toBe('false');
    expect(titel(host)).toBe('BGF – Brutto-Grundfläche: 225,00 m²');
    taste(teil(), 'Enter');
    expect(teil().getAttribute('aria-checked')).toBe('true');
    expect(host.querySelector('.mp-hilfe')?.textContent).toContain('Klick auf ein Teil: an- oder abwählen');
    // Umschalter als Umschaltknöpfe, nicht als Reiter
    expect(host.querySelector('.mv-kopf .segment')?.getAttribute('role')).toBe('group');
    expect(knopf(host.querySelector('.mv-kopf .segment')!, 'Grundrisse').getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[role="tab"]')).toBeNull();
  });

  it('Legende nur mit vorkommenden Einträgen; Abzüge schraffiert und als „Abzug“ benannt', () => {
    const host = mengenPruefen(projektMitAnbau());
    // BGF: kein Abzug, nichts abgewählt
    expect(legende(host)).toEqual(['zählt zur Menge', 'übrige Geometrie des Projekts']);
    act(() => (rechenweg(host)[0].querySelector('input') as HTMLInputElement).click());
    expect(legende(host)).toEqual(['zählt zur Menge', 'abgewählt, zählt nicht', 'übrige Geometrie des Projekts']);
    act(() => knopf(host.querySelector('.mv-auswahl')!, 'Standard').click());

    // AUF: überbaute Flächen sind Abzüge
    act(() => listenKnopf(host, 'AUF').click());
    expect(legende(host)).toEqual(['zählt zur Menge', 'Abzug', 'übrige Geometrie des Projekts']);
    const abzug = host.querySelector('.mp-teil.abzug') as SVGGElement;
    expect(abzug.getAttribute('style')).toContain('url(#mp-abzug-');
    expect(abzug.querySelector('title')?.textContent).toMatch(/^überbaut: .+: Abzug \d+,00 m²/);
    expect(host.querySelector('.mp-geschoss:not(.leer) figcaption')?.textContent).toBe('EGAbzug 155,00 m²');
    // im Rechenweg mit typografischem Minus
    expect(rechenweg(host).map((z) => z.querySelector('.num')?.textContent)).toEqual(['500,00', '−135,00', '−20,00']);
  });
});
