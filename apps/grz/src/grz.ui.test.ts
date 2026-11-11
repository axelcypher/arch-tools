// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { createLageplanFlaeche, createProject } from '@core/model';
import { fmt2 } from '@core/format';
import { pointInPolygon, rectPoints } from '@core/geometry';
import { App } from './App';
import { innenflaeche, weltpunkt } from './components/LageplanEditor';
import { massNachweis } from './massNutzung';
import { GrzGfzView, kanteSetzen } from './components/GrzGfzView';
import { NachweisDruck } from './components/NachweisDruck';
import { useGrz } from './store';
import { projekt } from './testdaten';
import { einstiegsAktionen, farbschemaWechseln, stammdatenAendern } from '@core/ui/rauchtest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
function render(el: Parameters<typeof createElement>[0]): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(createElement(el));
  });
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

const change = (el: HTMLSelectElement | HTMLInputElement, value: string) =>
  act(() => {
    if (el instanceof HTMLInputElement) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

describe('GRZ-Nachweis', () => {
  it('Esc schließt Druck und Excel-Dialog (gemeinsamer Dialog-Stapel)', () => {
    useGrz.getState().load(projekt());
    const host = render(App);
    const esc = () => act(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    act(() => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Nachweis drucken'))!.click());
    expect(host.querySelector('.report-backdrop')).not.toBeNull();
    esc();
    expect(host.querySelector('.report-backdrop')).toBeNull();
    act(() => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Excel'))!.click());
    expect(host.querySelector('.modal')).not.toBeNull();
    esc();
    expect(host.querySelector('.modal')).toBeNull();
  });

  it('Stammdaten öffnen und ändern, ohne die App zu wechseln; Druckkopf zeigt sie', () => {
    useGrz.getState().load(projekt());
    const host = render(App);
    expect(stammdatenAendern(host, '112')).toBe('Stammdaten des Projekts');
    expect(useGrz.getState().project.meta.bebauungsplan).toEqual({ nummer: '112' });
    act(() => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Nachweis drucken'))!.click());
    expect(host.querySelector('.druck-kopf')!.textContent).toContain('BebauungsplanNr. 112');
  });

  it('Leerzustand: dieselben Aktionen wie in den anderen Apps (Q-5)', () => {
    useGrz.getState().load(createProject());
    expect(einstiegsAktionen(render(App))).toEqual(['Datei öffnen …', 'Neues Projekt']);
  });

  it('Farbschema wechselt sofort (Menü ◐)', () => {
    useGrz.getState().load(createProject());
    const host = render(App);
    expect(farbschemaWechseln(host, 'Dunkel')).toBe('dunkel');
    expect(farbschemaWechseln(host, 'Hell')).toBe('hell');
  });

  it('zeigt ohne Projekt den Einstieg', () => {
    useGrz.getState().load(createProject());
    expect(render(App).textContent).toContain('Projekt oder IFC öffnen');
  });

  it('rechnet nach dem Recht des Plandatums und zeigt Lageplan und Nachweis', () => {
    useGrz.getState().load(projekt());
    const host = render(App);
    const text = host.textContent ?? '';
    expect(text).not.toContain('Projekt oder IFC öffnen');
    expect(text).toContain('automatisch (BauNVO 1962)');
    expect(text).toContain('Vollgeschosse nach BauO NW 1962/1970');
    expect(text).toContain('Räume in Nicht-Vollgeschossen');
    expect(host.querySelectorAll('.grz-skizze path').length).toBeGreaterThan(2);
    expect(host.querySelectorAll('.kpi').length).toBe(3); // vor 1990: eine GRZ
  });

  it('Festsetzungen, Einstufung, Vollgeschoss und Aufenthaltsraum über die Oberfläche', () => {
    useGrz.getState().load(projekt());
    const host = render(GrzGfzView);
    change(host.querySelector('input[type="date"]') as HTMLInputElement, '2020-05-01');
    expect(useGrz.getState().project.massNutzung?.planDatum).toBe('2020-05-01');
    expect(host.textContent).toContain('GRZ II');
    const selects = () => [...host.querySelectorAll('select')];
    change(selects().find((s) => [...s.options].some((o) => o.textContent?.startsWith('offen')))!, 'ja');
    expect(useGrz.getState().project.massNutzung?.einstufung?.terrasse).toBe('ja');
    // Vollgeschoss des DG festlegen
    const vg = selects().filter((s) => [...s.options].some((o) => o.value === 'auto') && [...s.options].some((o) => o.textContent === 'Vollgeschoss'));
    change(vg[vg.length - 1], 'ja');
    expect(useGrz.getState().project.storeys[2].vollgeschoss).toBe(true);
    // zurück auf 1967: Aufenthaltsraum einstufen (DG wieder automatisch)
    change(vg[vg.length - 1], 'auto');
    change(host.querySelector('input[type="date"]') as HTMLInputElement, '1967-03-14');
    const auf = selects().find((s) => [...s.options].some((o) => o.value === 'treppe'))!;
    change(auf, 'treppe');
    const r = useGrz.getState().project.storeys[2].shapes.find((s) => s.kind === 'room');
    expect(r?.kind === 'room' && r.aufenthalt).toBe('treppe');
  });

  it('wählt eine Fläche aus der Liste aus und löscht sie', () => {
    useGrz.getState().load(projekt());
    const host = render(GrzGfzView);
    const link = [...host.querySelectorAll('button.link')].find((b) => b.textContent === 'Terrasse') as HTMLButtonElement;
    act(() => link.click());
    expect(useGrz.getState().selected).toBe(useGrz.getState().project.lageplan!.flaechen[1].id);
    const del = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Fläche löschen') as HTMLButtonElement;
    act(() => del.click());
    expect(useGrz.getState().project.lageplan!.flaechen.map((f) => f.name)).toEqual(['Zufahrt']);
    act(() => useGrz.getState().undo());
    expect(useGrz.getState().project.lageplan!.flaechen).toHaveLength(2);
  });

  it('druckbarer Nachweis mit Grundlagen, Ergebnis, Lageplan und Aufenthaltsräumen', () => {
    useGrz.getState().load(projekt());
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render(createElement(NachweisDruck, { onClose: () => {} }));
    });
    const text = host.textContent ?? '';
    expect(text).toContain('Nachweis des Maßes der baulichen Nutzung');
    expect(text).toContain('14.03.1967');
    expect(text).not.toContain('((');
    expect(text).toContain('BauNVO 1962');
    expect(text).toContain('Hauptanlage (Gebäude)');
    expect(text).toContain('Aufenthaltsräume in Nicht-Vollgeschossen');
    expect(text).toContain('Zimmer I');
    // Lageplan mit Nummern der eigenen Flächen
    expect([...host.querySelectorAll('.plan-svg text[data-flaeche]')].map((t) => t.textContent)).toEqual(['1', '2']);
  });

  it('öffnet Druck und Excel über die Werkzeugleiste', () => {
    useGrz.getState().load(projekt());
    const host = render(App);
    const btn = (t: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith(t)) as HTMLButtonElement;
    act(() => btn('Nachweis drucken').click());
    expect(host.querySelector('.grz-report')).not.toBeNull();
    act(() => btn('Schließen').click());
    act(() => btn('Excel').click());
    expect(host.textContent).toContain('Muster-Vorlage herunterladen');
  });

  it('Punkte wie im Flächenrechner: ziehen, über ◇ einfügen, per Rechtsklick löschen; Fläche verschieben', () => {
    useGrz.getState().load(projekt());
    const host = render(GrzGfzView);
    const id = useGrz.getState().project.lageplan!.flaechen[0].id;
    act(() => useGrz.getState().select(id));
    const svg = host.querySelector('svg.grz-skizze') as SVGSVGElement;
    const punkte = () => useGrz.getState().project.lageplan!.flaechen[0].points;
    const vorher = punkte().map((p) => ({ ...p }));
    // je Ereignis ein eigenes act(), damit der Zustand dazwischen gerendert wird
    const ziehe = (el: Element, x = 50, y = 50) => {
      act(() => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 5, clientY: 5 })));
      act(() => svg.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y })));
      act(() => svg.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y })));
    };
    // Punkt ziehen: ein Punkt ändert sich, die Zahl bleibt
    ziehe(host.querySelectorAll('.vertex-handle')[2]);
    expect(punkte()).toHaveLength(4);
    expect(punkte()[2]).not.toEqual(vorher[2]);
    expect(punkte()[0]).toEqual(vorher[0]);
    act(() => useGrz.getState().undo());
    expect(punkte()).toEqual(vorher);
    // ◇ ohne Bewegung fügt den Mittelpunkt ein
    act(() => host.querySelectorAll('.mid-handle')[0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 5, clientY: 5 })));
    act(() => svg.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 5, clientY: 5 })));
    expect(punkte()).toHaveLength(5);
    expect(punkte()[1]).toEqual({ x: (vorher[0].x + vorher[1].x) / 2, y: (vorher[0].y + vorher[1].y) / 2 });
    // Rechtsklick löscht einen Punkt, aber nie unter drei
    const rechts = () => act(() => host.querySelectorAll('.vertex-handle')[1].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
    rechts();
    expect(punkte()).toHaveLength(4);
    rechts();
    rechts();
    expect(punkte()).toHaveLength(3);
    // Mausrad zoomt, ohne dass die Seite scrollt
    const rad = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 });
    act(() => svg.dispatchEvent(rad));
    expect(rad.defaultPrevented).toBe(true);
  });
});

describe('Fehlerkorrekturen (Phase 1)', () => {
  it('G-01: wiederhergestellter Zwischenstand gilt als ungespeichert, „Verwerfen“ setzt auf die Datei zurück', async () => {
    const datei = projekt();
    const geaendert = { ...datei, name: 'Umbenannt' };
    useGrz.getState().wiederherstellen(geaendert, 'Haus.oap', datei, new Date(2026, 10, 11, 9, 5).getTime());
    expect(useGrz.getState().dirty).toBe(true);
    const host = render(App);
    const leiste = host.querySelector('.grz-wiederhergestellt')!;
    expect(leiste.textContent).toContain('Ungespeicherter Stand vom 11.11.2026 09:05 wiederhergestellt');
    expect(document.title.startsWith('• ')).toBe(true);
    // gleicher Inhalt (andere Objekte): gespeichert
    useGrz.getState().wiederherstellen(structuredClone(datei), 'Haus.oap', datei);
    expect(useGrz.getState().dirty).toBe(false);
    // ohne Datei: ein nicht leeres Projekt ist ungespeichert, ein leeres nicht
    useGrz.getState().wiederherstellen(geaendert, null, null);
    expect(useGrz.getState().dirty).toBe(true);
    useGrz.getState().wiederherstellen(createProject(), null, null);
    expect(useGrz.getState().dirty).toBe(false);
    // Verwerfen
    useGrz.getState().wiederherstellen(geaendert, 'Haus.oap', datei);
    act(() => useGrz.getState().verwerfen());
    expect(useGrz.getState().project.name).toBe('GRZ-Test');
    expect(useGrz.getState().dirty).toBe(false);
    expect(useGrz.getState().wiederhergestellt).toBeNull();
  });

  it('G-04/G-08: Druck mit angerechneter Fläche, Nummer im eindeutigen Anteil, Maßstab und Nordpfeil', () => {
    const p = projekt();
    // Garten umschließt das Gebäude
    p.lageplan!.flaechen.push({ ...createLageplanFlaeche(rectPoints({ x: -6, y: -5 }, { x: 20, y: 16 }), 'Garten'), nutzung: 'garten', versiegelung: 'gruen' });
    p.massNutzung = { ...p.massNutzung, planDatum: '1978-06-01' };
    useGrz.getState().load(p);
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render(createElement(NachweisDruck, { onClose: () => {} }));
    });
    const n = massNachweis(p);
    // Terrasse zählt 1968/77 nicht: angerechnet 0; Summe GR = Kachel
    const zeile = [...host.querySelectorAll('.grz-report tr')].find((tr) => tr.children[1]?.textContent === 'Terrasse')!;
    expect(zeile.children[6].textContent).toBe('0,00');
    expect(host.querySelector('.grz-summe-gr td.num')!.textContent).toBe(fmt2(n.grz.flaeche));
    // Garten-Nummer im Garten, nicht im Gebäude
    const gid = p.lageplan!.flaechen[2].id;
    const t = host.querySelector(`.plan-svg text[data-flaeche="${gid}"]`)!;
    const q = { x: Number(t.getAttribute('x')), y: Number(t.getAttribute('y')) };
    expect(pointInPolygon(q, p.lageplan!.flaechen[2].points)).toBe(true);
    expect(pointInPolygon(q, rectPoints({ x: 0, y: 0 }, { x: 12, y: 11.25 }))).toBe(false);
    expect(host.querySelector('.plan-massstab')).not.toBeNull();
    expect(host.querySelector('.plan-nordpfeil')).not.toBeNull();
    // Haftungssatz nur auf Wunsch; Stand wie eingetragen (nicht automatisch heute)
    expect(host.querySelector('.grz-haftung')).toBeNull();
    expect(host.querySelector('.druck-kopf')!.textContent).not.toContain('Stand');
  });

  it('G-13: weltpunkt rechnet mit der Innenfläche (ohne Rahmen) – exakt bei jedem Zoom', () => {
    // Plan 600 × 400 px Innenfläche, Rahmen 1 px: getBoundingClientRect wäre 602 × 402
    const innen = { left: 101, top: 51, width: 600, height: 400 };
    for (const zoom of [1, 0.2, 5]) {
      const vb = { x: -20 / zoom, y: -15 / zoom, w: 60 / zoom, h: 40 / zoom };
      const s = vb.w / 600;
      const ziel = { x: 13, y: 6 };
      const p = weltpunkt(vb, innen, innen.left + (ziel.x - vb.x) / s, innen.top + (ziel.y - vb.y) / s);
      expect(p.x).toBeCloseTo(13, 9);
      expect(p.y).toBeCloseTo(6, 9);
    }
    const el = document.createElement('div');
    el.style.border = '1px solid black';
    document.body.appendChild(el);
    el.getBoundingClientRect = () => ({ left: 100, top: 50, width: 602, height: 402, right: 702, bottom: 452, x: 100, y: 50, toJSON: () => '' });
    expect(innenflaeche(el)).toEqual(innen);
  });
});

/** Bildschirmpunkt eines Planpunkts (wie weltpunkt, Innenfläche ohne Layout: 600 × 400 px ab 0|0) */
function bildpunkt(svg: Element, q: { x: number; y: number }) {
  const [x, y, w, h] = svg.getAttribute('viewBox')!.split(' ').map(Number);
  const s = Math.max(w / 600, h / 400);
  return { clientX: (q.x - (x - (600 * s - w) / 2)) / s, clientY: (q.y - (y - (400 * s - h) / 2)) / s };
}

describe('Zeichnen (G-21, G-23)', () => {
  const knopf = (host: HTMLElement, t: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === t) as HTMLButtonElement;
  const klick = (svg: Element, q: { x: number; y: number }) => act(() => svg.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, ...bildpunkt(svg, q) })));
  const bewege = (svg: Element, q: { x: number; y: number }) => act(() => svg.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, ...bildpunkt(svg, q) })));

  it('Vorlage „Zufahrt“: Nutzung, passende Versiegelung, Name „Zufahrt 1“; keine offene Spanne', () => {
    const p = projekt();
    p.massNutzung = { ...p.massNutzung, planDatum: '2020-05-01' };
    p.lageplan!.flaechen = p.lageplan!.flaechen.filter((f) => f.nutzung !== 'terrasse');
    useGrz.getState().load(p);
    const host = render(GrzGfzView);
    act(() => knopf(host, 'Zufahrt').click());
    expect(useGrz.getState().werkzeug).toBe('rechteck');
    const svg = host.querySelector('svg.grz-skizze')!;
    klick(svg, { x: 16, y: 2 });
    klick(svg, { x: 19, y: 6 });
    const f = useGrz.getState().project.lageplan!.flaechen.at(-1)!;
    expect(f).toMatchObject({ name: 'Zufahrt 1', nutzung: 'zufahrt', versiegelung: 'voll' });
    const n = massNachweis(useGrz.getState().project);
    expect(n.grz2!.mitOffenen).toBeUndefined();
    // Auswahlbereich unter dem Plan: Nutzung, Versiegelung, Nachbar
    const auswahl = host.querySelector('.lp-auswahl')!;
    expect(auswahl.textContent).toContain('Nutzung');
    expect(auswahl.textContent).toContain('Versiegelung');
    expect(auswahl.textContent).toContain('Nachbargrundstück');
    // Garten: unversiegelt
    act(() => knopf(host, 'Garten').click());
    klick(svg, { x: 16, y: 8 });
    klick(svg, { x: 19, y: 9 });
    expect(useGrz.getState().project.lageplan!.flaechen.at(-1)).toMatchObject({ name: 'Garten 1', nutzung: 'garten', versiegelung: 'gruen' });
  });

  it('Rechteck per Eingabe 3,00 × 5,00 an der Hauswand: exakt diese Maße, ohne Spalt', () => {
    const p = projekt();
    useGrz.getState().load(p);
    const host = render(GrzGfzView);
    act(() => knopf(host, 'Terrasse').click());
    const svg = host.querySelector('svg.grz-skizze')!;
    // erste Ecke an der Hausecke (wird gefangen), Richtung mit der Maus
    klick(svg, { x: 12.05, y: 11.3 });
    bewege(svg, { x: 14, y: 14 });
    expect(host.querySelector('.lp-mass')!.textContent).toMatch(/× .* m · Fläche/);
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true })));
    const [breite, tiefe] = [...host.querySelectorAll('.lp-eingabe-feld')] as HTMLInputElement[];
    expect(breite.value).toBe('3');
    change(tiefe, '5');
    act(() => tiefe.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    const f = useGrz.getState().project.lageplan!.flaechen.at(-1)!;
    expect(f.name).toBe('Terrasse 1');
    expect(f.points).toEqual([
      { x: 12, y: 11.25 },
      { x: 15, y: 11.25 },
      { x: 15, y: 16.25 },
      { x: 12, y: 16.25 },
    ]);
  });

  it('Polygon per Länge und Winkel; Kantenlänge in der Auswahl bearbeiten', () => {
    useGrz.getState().load(projekt());
    const host = render(GrzGfzView);
    act(() => knopf(host, 'Weg').click());
    act(() => knopf(host, 'Polygon').click());
    const svg = host.querySelector('svg.grz-skizze')!;
    klick(svg, { x: 0, y: 11.25 }); // Hausecke
    const setze = (l: string, w: string) => {
      act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: l[0], bubbles: true })));
      const [a, b] = [...host.querySelectorAll('.lp-eingabe-feld')] as HTMLInputElement[];
      change(a, l);
      change(b, w);
      act(() => b.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    };
    setze('2', '-90'); // 2 m nach unten (Bildschirm)
    setze('4', '0'); // 4 m entlang der Achse
    setze('2', '90');
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    const f = useGrz.getState().project.lageplan!.flaechen.at(-1)!;
    expect(f.nutzung).toBe('weg');
    expect(f.points.map((q) => [Math.round(q.x * 1e6) / 1e6, Math.round(q.y * 1e6) / 1e6])).toEqual([
      [0, 11.25],
      [0, 13.25],
      [4, 13.25],
      [4, 11.25],
    ]);
    // Rechteck bleibt beim Ändern einer Kantenlänge ein Rechteck
    const r = kanteSetzen(rectPoints({ x: 0, y: 0 }, { x: 3, y: 5 }), 0, 3.5);
    expect(r).toEqual([
      { x: 0, y: 0 },
      { x: 3.5, y: 0 },
      { x: 3.5, y: 5 },
      { x: 0, y: 5 },
    ]);
  });
});
