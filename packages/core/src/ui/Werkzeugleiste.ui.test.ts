// @vitest-environment happy-dom
// Werkzeugleiste mit Überlauf ins Menü „Mehr“: Berechnung, Menüinhalt, Tastatur und Fokus
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MenueHost } from './Menue';
import type { LeistenTeil } from './Werkzeugleiste';
import { leistenMessung, mehrPunkte, ueberlauf, Werkzeugleiste } from './Werkzeugleiste';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('ueberlauf (Berechnung)', () => {
  const e = [
    { id: 'datei', breite: 100, rang: 3 },
    { id: 'werkzeuge', breite: 200 },
    { id: 'export', breite: 80, rang: 2 },
    { id: 'haupt', breite: 120 },
  ];
  const opt = { mehrBreite: 30, abstand: 4, mehrImmer: false };

  it('passt alles, wandert nichts – ohne feste Punkte auch kein Platz für „Mehr“', () => {
    expect(ueberlauf(e, 500 + 3 * 4, opt).size).toBe(0);
  });
  it('zu schmal: der höchste Rang zuerst, dann der nächste; Einträge ohne Rang nie', () => {
    // ohne export: 100+200+120 + Mehr 30 + 4 Abstände = 466
    expect([...ueberlauf(e, 470, opt)]).toEqual(['datei']);
    expect([...ueberlauf(e, 400, opt)].sort()).toEqual(['datei', 'export']);
    expect([...ueberlauf(e, 10, opt)].sort()).toEqual(['datei', 'export']);
  });
  it('Gegenprobe Reihenfolge: höherer Rang geht vor niedrigerem, bei Gleichstand der weiter rechts', () => {
    expect([...ueberlauf(e, 480, opt)]).toEqual(['datei']);
    const gleich = [
      { id: 'a', breite: 100, rang: 1 },
      { id: 'b', breite: 100, rang: 1 },
    ];
    expect([...ueberlauf(gleich, 150, { ...opt, mehrBreite: 0 })]).toEqual(['b']);
  });
  it('Abstandhalter zählen mit ihrem Abstand mit (je ein gap); Gegenprobe ohne Abstandhalter passt es knapp', () => {
    // 500 + 3 Abstände = 512 passt genau; mit einem Abstandhalter kommt ein Abstand dazu: 516
    expect(ueberlauf(e, 512, opt).size).toBe(0);
    expect([...ueberlauf(e, 512, { ...opt, abstandhalter: 1 })]).toEqual(['datei']);
    expect(ueberlauf(e, 516, { ...opt, abstandhalter: 1 }).size).toBe(0);
  });
  it('mit festen Punkten zählt „Mehr“ immer mit', () => {
    expect(ueberlauf(e, 512, opt).size).toBe(0);
    expect(ueberlauf(e, 512, { ...opt, mehrImmer: true }).size).toBe(1);
  });
});

describe('mehrPunkte', () => {
  it('übergelaufene Einträge in Leistenreihenfolge, Gruppen und feste Punkte durch Trenner getrennt', () => {
    const teile: LeistenTeil[] = [{ id: 'a', inhalt: null, rang: 1, menue: [{ text: 'Neu' }, { text: 'Öffnen …' }] }, { abstand: true }, { id: 'b', inhalt: null, rang: 2, menue: { text: 'CSV …' } }];
    const p = mehrPunkte(teile, new Set(['b', 'a']), [{ text: 'Einstellungen …' }]);
    expect(p.map((x) => ('trenner' in x && x.trenner ? '—' : (x as { text: string }).text))).toEqual(['Neu', 'Öffnen …', '—', 'CSV …', '—', 'Einstellungen …']);
    expect(mehrPunkte(teile, new Set(), [])).toEqual([]);
  });
});

describe('Werkzeugleiste (Komponente)', () => {
  let root: ReturnType<typeof createRoot> | null = null;
  let leistenBreite = 1000;
  const originalBreite = leistenMessung.breite;
  beforeEach(() => {
    leistenBreite = 1000;
    // Breiten aus data-breite der Knöpfe; die Leiste selbst aus leistenBreite, „Mehr“ 30px
    leistenMessung.breite = (el: Element) => {
      if (el.classList.contains('leiste')) return leistenBreite;
      if (el.classList.contains('leiste-mehr')) return 30;
      return [...el.querySelectorAll('[data-breite]')].reduce((n, k) => n + Number(k.getAttribute('data-breite')), 0);
    };
  });
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = '';
    leistenMessung.breite = originalBreite;
  });

  const knopf = (text: string, breite: number, onClick?: () => void) => createElement('button', { 'data-breite': breite, onClick }, text);
  function render(teile: LeistenTeil[], mehr?: () => { text: string; aktion?: () => void }[]) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render(createElement(Fragment, null, createElement(Werkzeugleiste, { teile, mehr, name: 'Plan' }), createElement(MenueHost)));
    });
    return host;
  }
  const breiteSetzen = (b: number) => {
    leistenBreite = b;
    act(() => void window.dispatchEvent(new Event('resize')));
  };
  const sichtbar = (host: Element) => [...host.querySelectorAll<HTMLElement>('[data-eintrag]')].filter((g) => !g.hidden).map((g) => g.dataset.eintrag);
  const mehrKnopf = (host: Element) => host.querySelector<HTMLButtonElement>('.leiste-mehr button')!;
  const menuePunkte = () => [...document.querySelectorAll('.menue [role="menuitem"]')].map((b) => b.textContent);

  const neu = vi.fn();
  const teile = (): LeistenTeil[] => [
    { id: 'datei', rang: 2, inhalt: knopf('Neu', 100, neu), menue: { text: 'Neu', aktion: neu, tasten: 'Strg+N' } },
    { id: 'werkzeuge', inhalt: knopf('Polygon', 200) },
    { abstand: true },
    { id: 'export', rang: 1, inhalt: knopf('Excel …', 80), menue: { text: 'Excel …' } },
    { id: 'haupt', inhalt: knopf('Flächenaufstellung …', 120) },
  ];

  it('breit genug: alles in der Leiste, ohne feste Punkte kein „Mehr“; Name der Leiste für Screenreader', () => {
    const host = render(teile());
    expect(sichtbar(host)).toEqual(['datei', 'werkzeuge', 'export', 'haupt']);
    expect(host.querySelector<HTMLElement>('.leiste-mehr')!.hidden).toBe(true);
    const leiste = host.querySelector('.toolbar.leiste')!;
    expect(leiste.getAttribute('role')).toBe('group');
    expect(leiste.getAttribute('aria-label')).toBe('Plan');
  });

  it('schmaler: Einträge wandern nach Rang ins Menü „Mehr“ und kommen beim Verbreitern zurück', () => {
    const host = render(teile());
    breiteSetzen(480);
    expect(sichtbar(host)).toEqual(['werkzeuge', 'export', 'haupt']);
    expect(host.querySelector<HTMLElement>('.leiste-mehr')!.hidden).toBe(false);
    breiteSetzen(200);
    // Werkzeuge und Hauptknopf haben keinen Rang: sie bleiben, auch wenn es eng wird
    expect(sichtbar(host)).toEqual(['werkzeuge', 'haupt']);
    breiteSetzen(1000);
    expect(sichtbar(host)).toEqual(['datei', 'werkzeuge', 'export', 'haupt']);
    expect(host.querySelector<HTMLElement>('.leiste-mehr')!.hidden).toBe(true);
  });

  it('„Mehr“: Symbolknopf mit Namen, ohne Aufklapp-Pfeil; Menü mit den übergelaufenen Befehlen, Tastenkürzel, Fokus zurück', () => {
    const host = render(teile(), () => [{ text: 'Einstellungen …' }]);
    breiteSetzen(200);
    const m = mehrKnopf(host);
    expect(m.getAttribute('aria-label')).toBe('Mehr');
    expect(m.getAttribute('title')).toBe('Mehr – weitere Befehle');
    expect(m.classList.contains('icon')).toBe(true);
    expect(m.getAttribute('aria-haspopup')).toBe('menu');
    expect(m.querySelectorAll('svg')).toHaveLength(1);
    act(() => m.focus());
    act(() => m.click());
    expect(m.getAttribute('aria-expanded')).toBe('true');
    expect(menuePunkte()).toEqual(['NeuStrg+N', 'Excel …', 'Einstellungen …']);
    expect(document.querySelector('.menue')!.getAttribute('aria-label')).toBe('Mehr');
    expect(document.activeElement?.textContent).toBe('NeuStrg+N');
    expect(document.activeElement?.getAttribute('aria-keyshortcuts')).toBe('Control+N');
    act(() => void document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(document.activeElement?.textContent).toBe('Excel …');
    act(() => void document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.querySelector('.menue')).toBeNull();
    expect(document.activeElement).toBe(m);
    // Befehl aus dem Menü führt dasselbe aus wie der Knopf in der Leiste
    act(() => m.click());
    act(() => (document.querySelector('.menue [role="menuitem"]') as HTMLButtonElement).click());
    expect(neu).toHaveBeenCalledTimes(1);
  });

  it('Einzelne Einträge ohne Trennstrich, Gruppen mit (.tb-group); wandert der fokussierte Knopf ins Menü, bekommt „Mehr“ den Fokus', () => {
    const host = render([
      { id: 'datei', rang: 2, inhalt: knopf('Neu', 100), menue: { text: 'Neu' } },
      { id: 'werkzeuge', gruppe: true, inhalt: knopf('Polygon', 200) },
      { id: 'haupt', inhalt: knopf('Flächenaufstellung …', 120) },
    ]);
    expect(host.querySelector('[data-eintrag="datei"]')!.className).toBe('leiste-eintrag');
    expect(host.querySelector('[data-eintrag="werkzeuge"]')!.className).toBe('tb-group');
    const neuKnopf = host.querySelector<HTMLButtonElement>('[data-eintrag="datei"] button')!;
    act(() => neuKnopf.focus());
    expect(document.activeElement).toBe(neuKnopf);
    breiteSetzen(350);
    expect(sichtbar(host)).toEqual(['werkzeuge', 'haupt']);
    expect(document.activeElement).toBe(mehrKnopf(host));
    // Gegenprobe: liegt der Fokus anderswo, bleibt er dort
    breiteSetzen(1000);
    const haupt = host.querySelector<HTMLButtonElement>('[data-eintrag="haupt"] button')!;
    act(() => haupt.focus());
    breiteSetzen(350);
    expect(document.activeElement).toBe(haupt);
  });

  it('feste Punkte: „Mehr“ steht immer am Ende, auch wenn alles passt; ausgeblendete Knöpfe sind nicht per Tab erreichbar', () => {
    const host = render(teile(), () => [{ text: 'Protokoll …' }]);
    expect(host.querySelector<HTMLElement>('.leiste-mehr')!.hidden).toBe(false);
    expect(host.querySelector('.toolbar.leiste')!.lastElementChild!.classList.contains('leiste-mehr')).toBe(true);
    act(() => mehrKnopf(host).click());
    expect(menuePunkte()).toEqual(['Protokoll …']);
    act(() => void document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    breiteSetzen(200);
    // [hidden] blendet die Gruppe aus (display: none) – ihre Knöpfe fallen aus der Tab-Reihenfolge
    const versteckt = host.querySelector<HTMLElement>('[data-eintrag="datei"]')!;
    expect(versteckt.hidden).toBe(true);
    expect(versteckt.querySelector('button')!.closest('[hidden]')).toBe(versteckt);
  });
});
