// @vitest-environment happy-dom
// Werkzeugleiste mit Überlauf ins Menü „Mehr“: Berechnung, Menüinhalt, Tastatur und Fokus
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MenueHost } from './Menue';
import type { LeistenTeil } from './Werkzeugleiste';
import { leistenMessung, leistenStufe, mehrPunkte, ueberlauf, Werkzeugleiste } from './Werkzeugleiste';

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

describe('leistenStufe (Kompaktstufe)', () => {
  const e = [
    { id: 'datei', breite: 100, rang: 1 },
    { id: 'werkzeuge', breite: 300 },
    { id: 'haupt', breite: 150 },
  ];
  const opt = { mehrBreite: 30, abstand: 0, mehrImmer: false };
  it('passt alles: nicht kompakt; reicht der Überlauf: nicht kompakt; reicht auch er nicht: kompakt', () => {
    expect(leistenStufe(e, 600, opt)).toEqual({ weg: new Set(), kompakt: false });
    // ohne datei: 300 + 150 + Mehr 30 = 480
    expect(leistenStufe(e, 500, opt)).toEqual({ weg: new Set(['datei']), kompakt: false });
    expect(leistenStufe(e, 470, opt)).toEqual({ weg: new Set(['datei']), kompakt: true });
  });
  it('Randfälle: genau passend nicht kompakt; ohne Einträge mit Rang kompakt bei leerem weg; „Mehr“ immer zählt mit', () => {
    expect(leistenStufe(e, 480, opt)).toEqual({ weg: new Set(['datei']), kompakt: false });
    const ohneRang = e.map(({ id, breite }) => ({ id, breite }));
    expect(leistenStufe(ohneRang, 500, opt)).toEqual({ weg: new Set(), kompakt: true });
    expect(leistenStufe(ohneRang, 550, opt)).toEqual({ weg: new Set(), kompakt: false });
    expect(leistenStufe(ohneRang, 550, { ...opt, mehrImmer: true })).toEqual({ weg: new Set(), kompakt: true });
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
      if (el.classList.contains('werkzeugleiste')) return leistenBreite;
      if (el.classList.contains('werkzeugleiste-mehr')) return 30;
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
  const mehrKnopf = (host: Element) => host.querySelector<HTMLButtonElement>('.werkzeugleiste-mehr button')!;
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
    expect(host.querySelector<HTMLElement>('.werkzeugleiste-mehr')!.hidden).toBe(true);
    const leiste = host.querySelector('.toolbar.werkzeugleiste')!;
    expect(leiste.getAttribute('role')).toBe('group');
    expect(leiste.getAttribute('aria-label')).toBe('Plan');
    // nicht `.leiste`: das ist die Klasse der Seitenleisten (BreitenLeiste) – ihre Regeln (erstes Kind gestreckt, Breiten
    // angleichen) dürfen in der Werkzeugleiste nicht greifen
    expect(leiste.classList.contains('leiste')).toBe(false);
    expect(host.querySelector('.leiste')).toBeNull();
  });

  it('schmaler: Einträge wandern nach Rang ins Menü „Mehr“ und kommen beim Verbreitern zurück', () => {
    const host = render(teile());
    breiteSetzen(480);
    expect(sichtbar(host)).toEqual(['werkzeuge', 'export', 'haupt']);
    expect(host.querySelector<HTMLElement>('.werkzeugleiste-mehr')!.hidden).toBe(false);
    breiteSetzen(200);
    // Werkzeuge und Hauptknopf haben keinen Rang: sie bleiben, auch wenn es eng wird
    expect(sichtbar(host)).toEqual(['werkzeuge', 'haupt']);
    breiteSetzen(1000);
    expect(sichtbar(host)).toEqual(['datei', 'werkzeuge', 'export', 'haupt']);
    expect(host.querySelector<HTMLElement>('.werkzeugleiste-mehr')!.hidden).toBe(true);
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
    expect(host.querySelector('[data-eintrag="datei"]')!.className).toBe('werkzeugleiste-eintrag');
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

  it('kuerzbar: Eintrag trägt werkzeugleiste-kuerzbar (darf schrumpfen), ohne das Feld nicht', () => {
    const host = render([
      { id: 'status', kuerzbar: true, inhalt: knopf('Rechtsstand 2026-11', 140) },
      { id: 'haupt', inhalt: knopf('Prüfen', 80) },
    ]);
    expect(host.querySelector('[data-eintrag="status"]')!.className).toBe('werkzeugleiste-eintrag werkzeugleiste-kuerzbar');
    expect(host.querySelector('[data-eintrag="haupt"]')!.className).toBe('werkzeugleiste-eintrag');
  });

  it('neue teile bei jedem Render ohne Änderung am Aufbau: kein Neumessen; geänderter Aufbau rechnet neu', () => {
    const host = render(teile());
    breiteSetzen(480);
    expect(sichtbar(host)).toEqual(['werkzeuge', 'export', 'haupt']);
    const messung = leistenMessung.breite;
    let gemessen = 0;
    leistenMessung.breite = (el) => {
      gemessen++;
      return messung(el);
    };
    // gleicher Aufbau, neues Array (wie beim Render der App): nichts messen
    act(() => root!.render(createElement(Fragment, null, createElement(Werkzeugleiste, { teile: teile(), name: 'Plan' }), createElement(MenueHost))));
    expect(gemessen).toBe(0);
    // Gegenprobe: ein Eintrag mehr – neu gerechnet
    const mehrTeile = [...teile(), { id: 'neu', rang: 3, inhalt: knopf('Extra', 60), menue: { text: 'Extra' } }];
    act(() => root!.render(createElement(Fragment, null, createElement(Werkzeugleiste, { teile: mehrTeile, name: 'Plan' }), createElement(MenueHost))));
    expect(gemessen).toBeGreaterThan(0);
    expect(sichtbar(host)).not.toContain('neu');
  });

  it('wird ein Eintrag breiter (z. B. neuer Text), misst der ResizeObserver neu und ein Eintrag mit Rang wandert ins Menü', () => {
    const beobachter: { cb: () => void; ziele: Element[] }[] = [];
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      ziele: Element[] = [];
      constructor(public cb: () => void) {
        beobachter.push(this);
      }
      observe(el: Element) {
        this.ziele.push(el);
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    try {
      const host = render(teile());
      breiteSetzen(520);
      expect(sichtbar(host)).toEqual(['datei', 'werkzeuge', 'export', 'haupt']);
      // beobachtet werden die Leiste und jeder Eintrag
      const ro = beobachter.at(-1)!;
      expect(ro.ziele).toContain(host.querySelector('[data-eintrag="werkzeuge"]'));
      // der Werkzeugknopf wird breiter (200 → 260 px) – ohne Render der App, nur über den ResizeObserver
      host.querySelector('[data-eintrag="werkzeuge"] button')!.setAttribute('data-breite', '260');
      act(() => ro.cb());
      expect(sichtbar(host)).toEqual(['werkzeuge', 'export', 'haupt']);
    } finally {
      globalThis.ResizeObserver = original;
    }
  });

  it('Kompaktstufe: erst wandern die Einträge mit Rang, dann blendet die Leiste Knopftexte aus – und bleibt so, bis die volle Fassung passt', () => {
    // Messung: in der Kompaktstufe zählt data-kompakt statt data-breite
    const messung = leistenMessung.breite;
    leistenMessung.breite = (el) => {
      if (el.closest('.kompakt') && el.hasAttribute('data-eintrag')) return [...el.querySelectorAll('[data-kompakt]')].reduce((n, k) => n + Number(k.getAttribute('data-kompakt')), 0);
      return messung(el);
    };
    const mitText = (text: string, breite: number, kompakt: number) =>
      createElement('button', { 'data-breite': breite, 'data-kompakt': kompakt, 'aria-label': text }, 'S', createElement('span', { className: 'tb-text' }, text));
    const host = render([
      { id: 'datei', rang: 1, inhalt: knopf('Datei', 100), menue: { text: 'Datei' } },
      { id: 'werkzeuge', inhalt: mitText('Werkzeuge', 300, 100) },
      { id: 'haupt', inhalt: mitText('Flächenaufstellung …', 150, 40) },
    ]);
    const leiste = () => host.querySelector('.toolbar.werkzeugleiste')!;
    breiteSetzen(500);
    expect(sichtbar(host)).toEqual(['werkzeuge', 'haupt']);
    expect(leiste().classList.contains('kompakt')).toBe(false);
    breiteSetzen(400);
    expect(leiste().classList.contains('kompakt')).toBe(true);
    // in der Kompaktstufe schaffen die Symbole Platz – „Datei“ springt trotzdem nicht zurück
    breiteSetzen(420);
    expect(sichtbar(host)).toEqual(['werkzeuge', 'haupt']);
    expect(leiste().classList.contains('kompakt')).toBe(true);
    // erst wenn die volle Fassung (ohne Datei) passt, wieder mit Text
    breiteSetzen(480);
    expect(leiste().classList.contains('kompakt')).toBe(false);
    breiteSetzen(1000);
    expect(sichtbar(host)).toEqual(['datei', 'werkzeuge', 'haupt']);
  });

  it('neuer Eintrag in der Kompaktstufe: gemessen wird seine volle Breite, nicht die schmale (Gegenprobe über den Austritt)', () => {
    const messung = leistenMessung.breite;
    leistenMessung.breite = (el) => {
      if (el.closest('.kompakt') && el.hasAttribute('data-eintrag')) return [...el.querySelectorAll('[data-kompakt]')].reduce((n, k) => n + Number(k.getAttribute('data-kompakt')), 0);
      return messung(el);
    };
    const mitText = (text: string, breite: number, kompakt: number) =>
      createElement('button', { 'data-breite': breite, 'data-kompakt': kompakt, 'aria-label': text }, 'S', createElement('span', { className: 'tb-text' }, text));
    const teileA: LeistenTeil[] = [
      { id: 'werkzeuge', inhalt: mitText('Werkzeuge', 300, 100) },
      { id: 'haupt', inhalt: mitText('Flächenaufstellung …', 150, 40) },
    ];
    const host = render(teileA);
    breiteSetzen(400);
    const leiste = () => host.querySelector('.toolbar.werkzeugleiste')!;
    expect(leiste().classList.contains('kompakt')).toBe(true);
    // neuer Eintrag ohne Rang (voll 200, kompakt 30) erscheint, während die Leiste kompakt ist
    const teileB: LeistenTeil[] = [...teileA, { id: 'neu', inhalt: mitText('Neu', 200, 30) }];
    act(() => root!.render(createElement(Fragment, null, createElement(Werkzeugleiste, { teile: teileB, name: 'Plan' }), createElement(MenueHost))));
    // 480 px reichten für die schmale Messung (300+150+30), nicht für die volle (300+150+200): bleibt kompakt
    breiteSetzen(480);
    expect(leiste().classList.contains('kompakt')).toBe(true);
    breiteSetzen(650);
    expect(leiste().classList.contains('kompakt')).toBe(false);
  });

  it('feste Punkte: „Mehr“ steht immer am Ende, auch wenn alles passt; ausgeblendete Knöpfe sind nicht per Tab erreichbar', () => {
    const host = render(teile(), () => [{ text: 'Protokoll …' }]);
    expect(host.querySelector<HTMLElement>('.werkzeugleiste-mehr')!.hidden).toBe(false);
    expect(host.querySelector('.toolbar.werkzeugleiste')!.lastElementChild!.classList.contains('werkzeugleiste-mehr')).toBe(true);
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
