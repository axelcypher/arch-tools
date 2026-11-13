// @vitest-environment happy-dom
import { act, createElement, Fragment } from 'react';
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
import { ablageLeeren, useGrz } from './store';
import { projekt } from './testdaten';
import { einstiegsAktionen, farbschemaWechseln, stammdatenAendern } from '@core/ui/rauchtest';
import { MenueHost, tastenAria } from '@core/ui/Menue';
import { useTheme } from '@core/platform/theme';
import { planFuellungDunkel } from '@core/planFarbe';
import { versiegelungInfo } from '@core/lageplan';

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

/** Lageplan mit dem Menü-Host der Titelleiste (dort hängt er in der App) */
const MitMenue = () => createElement(Fragment, null, createElement(GrzGfzView), createElement(MenueHost));
/** offener Menüpunkt nach seinem Text (ohne Tastenhinweis) */
const menuePunkt = (host: ParentNode, text: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('.menue [role="menuitem"]')].find((b) => b.querySelector('.menue-text')?.textContent === text) as HTMLButtonElement;
const menueTexte = (host: ParentNode) => [...host.querySelectorAll('.menue [role="menuitem"] .menue-text')].map((t) => t.textContent);

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

describe('TERRIO', () => {
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
    expect(render(App).textContent).toContain('TERRIO – GRZ-Nachweis');
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
    const vg = [...host.querySelectorAll('select.grz-wahl')] as HTMLSelectElement[];
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
    const btn = (t: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(t)) as HTMLButtonElement;
    act(() => btn('Nachweis drucken').click());
    expect(host.querySelector('.grz-report')).not.toBeNull();
    act(() => btn('Schließen').click());
    act(() => btn('Excel').click());
    // Vorlagen-Knöpfe erst bei „Eigene Vorlage“
    expect(host.textContent).not.toContain('Muster-Vorlage herunterladen');
    act(() => host.querySelectorAll<HTMLInputElement>('.modal input[type="radio"]')[1].click());
    expect(host.textContent).toContain('Muster-Vorlage herunterladen');
  });

  it('Punkte wie in QUADRIO: ziehen, über ◇ einfügen, per Kontextmenü löschen; Fläche verschieben', () => {
    useGrz.getState().load(projekt());
    const host = render(MitMenue);
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
    // Rechtsklick öffnet das gemeinsame Menü; „Punkt 2 löschen“ löscht, aber nie unter drei
    const loeschen = () => {
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 30 });
      act(() => host.querySelectorAll('.vertex-handle')[1].dispatchEvent(ev));
      expect(ev.defaultPrevented).toBe(true);
      const punkt = menuePunkt(host, 'Punkt 2 löschen');
      act(() => punkt.click());
      return punkt;
    };
    loeschen();
    expect(punkte()).toHaveLength(4);
    loeschen();
    expect(punkte()).toHaveLength(3);
    // bei drei Punkten gesperrt, mit sichtbarem Grund; ein Klick ändert nichts
    const gesperrt = loeschen();
    expect(gesperrt.getAttribute('aria-disabled') === 'true' || gesperrt.hasAttribute('disabled')).toBe(true);
    expect(gesperrt.textContent).toContain('Nur noch 3 Punkte');
    expect(punkte()).toHaveLength(3);
    act(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
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
    const leiste = [...host.querySelectorAll('.grz-bericht')].find((e) => e.textContent?.includes('wiederhergestellt'))!;
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
  const knopf = (host: HTMLElement, t: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === t) as HTMLButtonElement;
  const klick = (svg: Element, q: { x: number; y: number }) => act(() => svg.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, ...bildpunkt(svg, q) })));
  const bewege = (svg: Element, q: { x: number; y: number }) => act(() => svg.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, ...bildpunkt(svg, q) })));
  /** Werkzeug wählen, dann die Nutzung neuer Flächen (Auswahlliste neben den Werkzeugen) */
  const zeichne = (host: HTMLElement, werkzeug: 'Rechteck' | 'Polygon', nutzung: string) => {
    act(() => knopf(host, werkzeug).click());
    change(host.querySelector('select[aria-label="Nutzung neuer Flächen"]') as HTMLSelectElement, nutzung);
  };

  it('Vorlage „Zufahrt“: Nutzung, passende Versiegelung, Name „Zufahrt 1“; keine offene Spanne', () => {
    const p = projekt();
    p.massNutzung = { ...p.massNutzung, planDatum: '2020-05-01' };
    p.lageplan!.flaechen = p.lageplan!.flaechen.filter((f) => f.nutzung !== 'terrasse');
    useGrz.getState().load(p);
    const host = render(GrzGfzView);
    // Nutzung ist nur bei Polygon/Rechteck wählbar; die Wahl wechselt das Werkzeug nicht
    expect((host.querySelector('select[aria-label="Nutzung neuer Flächen"]') as HTMLSelectElement).disabled).toBe(true);
    zeichne(host, 'Rechteck', 'zufahrt');
    expect(useGrz.getState().werkzeug).toBe('rechteck');
    const svg = host.querySelector('svg.grz-skizze')!;
    klick(svg, { x: 16, y: 2 });
    klick(svg, { x: 19, y: 6 });
    const f = useGrz.getState().project.lageplan!.flaechen.at(-1)!;
    expect(f).toMatchObject({ name: 'Zufahrt 1', nutzung: 'zufahrt', versiegelung: 'voll' });
    const n = massNachweis(useGrz.getState().project);
    expect(n.grz2!.mitOffenen).toBeUndefined();
    // Auswahlbereich unter dem Plan: Nutzung, Versiegelung, Nachbar
    const auswahl = host.querySelector('.lp-eigenschaften')!;
    expect(auswahl.textContent).toContain('Nutzung');
    expect(auswahl.textContent).toContain('Versiegelung');
    expect(auswahl.textContent).toContain('Nachbargrundstück');
    // Garten: unversiegelt
    change(host.querySelector('select[aria-label="Nutzung neuer Flächen"]') as HTMLSelectElement, 'garten');
    klick(svg, { x: 16, y: 8 });
    klick(svg, { x: 19, y: 9 });
    expect(useGrz.getState().project.lageplan!.flaechen.at(-1)).toMatchObject({ name: 'Garten 1', nutzung: 'garten', versiegelung: 'gruen' });
  });

  it('Rechteck per Eingabe 3,00 × 5,00 an der Hauswand: exakt diese Maße, ohne Spalt', () => {
    const p = projekt();
    useGrz.getState().load(p);
    const host = render(GrzGfzView);
    zeichne(host, 'Rechteck', 'terrasse');
    const svg = host.querySelector('svg.grz-skizze')!;
    // Eingabezeile steht schon vor dem ersten Punkt (kein Springen des Plans), Felder noch gesperrt
    expect((host.querySelector('.lp-eingabe-feld') as HTMLInputElement).disabled).toBe(true);
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
    zeichne(host, 'Polygon', 'weg');
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

describe('Stammdaten und Bebauungsplan (G-25)', () => {
  it('B-Plan Nr., Gebiet und Stand erscheinen im Druck und im Export; Stand wird im Projekt gespeichert', async () => {
    const p = projekt();
    p.meta.bauherr.name = 'Muster';
    p.meta.grundstueck.flurstueck = '123';
    useGrz.getState().load(p);
    const host = render(App);
    const feld = [...host.querySelectorAll('.field')].find((f) => f.textContent?.startsWith('Nummer'))!.querySelector('input') as HTMLInputElement;
    change(feld, '7');
    act(() => feld.dispatchEvent(new FocusEvent('blur', { bubbles: true })));
    act(() => feld.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(useGrz.getState().project.meta.bebauungsplan?.nummer).toBe('7');
    const gebiet = [...host.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.value === 'WA'))!;
    change(gebiet, 'WA');
    expect(useGrz.getState().project.massNutzung?.gebietsart).toBe('WA');
    act(() => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Nachweis drucken'))!.click());
    const kopf = host.querySelector('.druck-kopf')!.textContent!;
    expect(kopf).toContain('Nr. 7');
    expect(kopf).toContain('Muster');
    expect(kopf).toContain('Flurstück 123');
    expect(host.querySelector('.grz-report')!.textContent).toContain('WA – allgemeines Wohngebiet');
    // Stand eintragen: gespeichert im Projekt, im Kopf
    const stand = host.querySelector('.report-actions input[type="date"]') as HTMLInputElement;
    change(stand, '2026-06-01');
    expect(useGrz.getState().project.massNutzung?.stand).toBe('2026-06-01');
    expect(host.querySelector('.druck-kopf')!.textContent).toContain('01.06.2026');
    const { buildGrzContext } = await import('./export/exportData');
    const ctx = buildGrzContext(useGrz.getState().project);
    expect(ctx.scalars['bplan.angabe']).toBe('Nr. 7 vom 14.03.1967');
    expect(ctx.scalars['gebietsart.text']).toBe('WA – allgemeines Wohngebiet');
    expect(ctx.scalars['stand.text']).toBe('Stand 01.06.2026');
    expect(ctx.scalars['kopf.angaben']).toContain('Muster');
  });
});

describe('Plan und Einstieg (G-22, G-24, G-27)', () => {
  it('G-24: Beschriftung „Nr · Nutzung · m²“ im Plan, ausblendbar; Hilfezeile mit höchstens drei Kürzeln; Maßstab und Nordpfeil', () => {
    useGrz.getState().load(projekt());
    const host = render(GrzGfzView);
    const texte = () => [...host.querySelectorAll('.lp-beschriftung')].map((t) => t.textContent);
    expect(texte()).toContain('1 · Zufahrt · 30,00 m²');
    const schalter = [...host.querySelectorAll('.lp-plan-steuerung label')].find((l) => l.textContent?.includes('Beschriftung'))!.querySelector('input')!;
    act(() => schalter.click());
    expect(texte().some((t) => t?.includes('Zufahrt'))).toBe(false);
    const hilfe = host.querySelector('.lp-hint')!.textContent!;
    expect(hilfe.split(' · ').length).toBeLessThanOrEqual(3);
    expect(host.querySelector('.lp-tasten-liste')!.textContent).toContain('Strg+C');
    expect(host.querySelector('.lp-massstab')).not.toBeNull();
    expect(host.querySelector('.lp-nordpfeil')).not.toBeNull();
  });

  it('G-22: Werkzeug „Grenze“ zeichnet die Grundstücksgrenze; Linie und Legende folgen ihr', () => {
    const p = projekt();
    p.meta.grundstueck.flaeche = undefined;
    useGrz.getState().load(p);
    const host = render(GrzGfzView);
    expect(host.querySelector('.lp-legende')!.textContent).toContain('Umriss der erfassten Flächen');
    act(() => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Grenze')!.click());
    const svg = host.querySelector('svg.grz-skizze')!;
    const klick = (x: number, y: number) => act(() => svg.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, ...bildpunkt(svg, { x, y }) })));
    klick(-5, -4);
    klick(18, -4);
    klick(18, 16);
    klick(-5, 16);
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    const g = useGrz.getState().project.lageplan!.grenze!;
    expect(g).toHaveLength(1);
    expect(g[0].name).toBe('Flurstück 1');
    const n = massNachweis(useGrz.getState().project);
    expect(n.grundstueck.quelle).toBe('grenze');
    expect(n.grundstueck.flaeche).toBeCloseTo(23 * 20, 0);
    expect(host.querySelector('.lp-legende')!.textContent).toContain('Grundstücksgrenze');
    // Flurstück einzeln löschen (Leiste „Grenze“ im Werkzeug Grenze)
    act(() => (host.querySelector('button[aria-label="Flurstück 1 löschen"]') as HTMLButtonElement).click());
    expect(useGrz.getState().project.lageplan!.grenze).toBeUndefined();
  });

  it('G-27: Leerzustand nur mit Einstieg; gesperrte Knöpfe nennen den Grund; „Neu“ setzt zurück', async () => {
    useGrz.getState().load(createProject());
    const host = render(App);
    expect(host.querySelector('.grz-view')).toBeNull();
    const druck = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Nachweis drucken'))!;
    expect(druck.disabled).toBe(true);
    expect(druck.title).toContain('Erst ein Gebäude öffnen');
    // Projekt mit Gebäude, ungespeichert geändert → „Neu“ fragt nach; „Nicht speichern“ setzt zurück
    act(() => useGrz.getState().load(projekt()));
    act(() => useGrz.getState().update((p) => ({ ...p, name: 'geändert' })));
    expect(host.querySelector('.grz-view')).not.toBeNull();
    await act(async () => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Neu')!.click());
    for (let i = 0; i < 10 && !host.querySelector('.modal.rf'); i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
    const nicht = [...host.querySelectorAll('.modal.rf button')].find((b) => b.textContent === 'Nicht speichern') as HTMLButtonElement;
    await act(async () => nicht.click());
    for (let i = 0; i < 10 && useGrz.getState().project.name !== 'Neues Projekt'; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(useGrz.getState().project.name).toBe('Neues Projekt');
    expect(useGrz.getState().dirty).toBe(false);
  });

  it('G-27: Hinweis „Grundstücksfläche fehlt“ springt per Klick in das Feld', () => {
    const p = projekt();
    p.meta.grundstueck.flaeche = undefined;
    p.lageplan = { flaechen: [] };
    useGrz.getState().load(p);
    const host = render(GrzGfzView);
    const knopf = [...host.querySelectorAll('.grz-hinweise button')].find((b) => b.textContent === 'zum Feld') as HTMLButtonElement;
    act(() => knopf.click());
    expect(document.activeElement).toBe(host.querySelector('#grz-grundstueck input'));
  });
});

describe('Nachweis-Spalte, Regeln, Rückgängig (G-28, G-29, G-32)', () => {
  it('G-28: Zahl und Einheit nie getrennt; Begründung als eigene, aufklappbare Zeile; kurze Auswahl', async () => {
    const { existsSync, readFileSync } = await import('node:fs');
    const pfad = ['src/styles.css', 'apps/grz/src/styles.css'].find((x) => existsSync(x))!;
    const css = readFileSync(pfad, 'utf8');
    expect(css).toMatch(/\.nowrap,\s*\.num\s*\{\s*white-space: nowrap;/);
    expect(css).toMatch(/@media \(max-width: 1280px\)/);
    useGrz.getState().load(projekt());
    const host = render(GrzGfzView);
    // Begründungen auf Wunsch als eigene, ganz breite Zeile
    expect(host.querySelectorAll('tr.grz-begruendung')).toHaveLength(0);
    const schalter = [...host.querySelectorAll('label.toggle')].find((l) => l.textContent?.includes('Begründungen zeigen'))!.querySelector('input') as HTMLInputElement;
    act(() => schalter.click());
    const zeilen = host.querySelectorAll('tr.grz-begruendung');
    expect(zeilen).toHaveLength(3);
    expect(zeilen[0].querySelector('td')!.getAttribute('colspan')).toBe('5');
    // eine Auswahl: automatisch (mit Ergebnis) oder von Hand; von Hand sichtbar gekennzeichnet
    const wahl = host.querySelector('select.grz-wahl') as HTMLSelectElement;
    expect([...wahl.options].map((o) => o.textContent)).toEqual(['automatisch: Vollgeschoss', 'Vollgeschoss (von Hand)', 'kein Vollgeschoss (von Hand)']);
    expect(wahl.classList.contains('grz-von-hand')).toBe(false);
    change(wahl, 'nein');
    const neu = host.querySelector('select.grz-wahl') as HTMLSelectElement;
    expect(neu.classList.contains('grz-von-hand')).toBe(true);
    expect(neu.options[0].textContent).toBe('automatisch: Vollgeschoss');
    expect(host.querySelector('.kpis')!.textContent).toContain('davon eines von Hand festgelegt');
  });

  it('G-29: Pille begründet die Anrechnung und öffnet die passende Regel', async () => {
    const { useHilfe } = await import('@core/ui/Nachschlagewerk');
    const p = projekt();
    p.massNutzung = { ...p.massNutzung, planDatum: '2020-05-01' };
    useGrz.getState().load(p);
    const host = render(GrzGfzView);
    const pille = [...host.querySelectorAll('button.pill-knopf')].find((b) => b.textContent === 'prüfen') as HTMLButtonElement;
    expect(pille.title).toContain('Terrasse nach BauNVO 1990: nicht ausdrücklich geregelt');
    expect(pille.dataset.regel).toBe('baunvo-19');
    act(() => pille.click());
    expect(useHilfe.getState()).toMatchObject({ offen: true, regel: 'baunvo-19' });
    act(() => useHilfe.getState().schliessen());
  });

  it('G-32: Rückgängig nennt die Aktion', () => {
    useGrz.getState().load(projekt());
    const host = render(App);
    const id = useGrz.getState().project.lageplan!.flaechen[0].id;
    act(() => useGrz.getState().select(id));
    const nutzung = [...host.querySelectorAll('.lp-eigenschaften select')][0] as HTMLSelectElement;
    change(nutzung, 'stellplatz');
    const undo = host.querySelector<HTMLButtonElement>('.toolbar button[aria-label="Rückgängig"]')!;
    expect(undo.title).toBe('Rückgängig: Nutzung ändern (Strg+Z)');
    act(() => useGrz.getState().undo());
    const redo = host.querySelector<HTMLButtonElement>('.toolbar button[aria-label="Wiederholen"]')!;
    expect(redo.title).toBe('Wiederholen: Nutzung ändern (Strg+Y)');
  });
});

describe('Gesamt-Review: Tastatur, Ausschnitt, Zeichnen, Unterlage, Speichern', () => {
  const knopf = (host: HTMLElement, t: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === t) as HTMLButtonElement;
  const klick = (svg: Element, q: { x: number; y: number }, detail = 1) => act(() => svg.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, detail, ...bildpunkt(svg, q) })));
  const taste = (key: string, ziel: EventTarget = window, extra: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra });
    act(() => {
      ziel.dispatchEvent(e);
    });
    return e;
  };
  const unterlage = { type: 'raster' as const, name: 'Plan', dataUrl: 'data:image/png;base64,', widthPx: 100, heightPx: 100, metersPerPixel: 0.1, x: 0, y: 0, opacity: 0.5, visible: true };

  it('Leertaste und Enter auf einem Knopf bedienen den Knopf, nicht den Plan (Gegenprobe: im Plan verschiebt die Leertaste)', () => {
    useGrz.getState().load(projekt());
    const host = render(GrzGfzView);
    const b = knopf(host, 'Rechteck');
    b.focus();
    expect(taste(' ', b).defaultPrevented).toBe(false);
    expect(taste('Enter', b).defaultPrevented).toBe(false);
    const svg = host.querySelector('svg.grz-skizze') as unknown as HTMLElement;
    svg.focus();
    expect(taste(' ', svg).defaultPrevented).toBe(true);
    act(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' })));
  });

  it('Vollgeschoss umstellen lässt den Ausschnitt stehen; ein anderes Projekt passt neu ein', () => {
    useGrz.getState().load(projekt());
    const host = render(GrzGfzView);
    const svg = host.querySelector('svg.grz-skizze')!;
    const vorher = svg.getAttribute('viewBox');
    act(() => knopf(host, 'Einpassen')?.click());
    // Zoom per Mausrad
    act(() => svg.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, bubbles: true, cancelable: true, ...bildpunkt(svg, { x: 6, y: 5 }) })));
    const gezoomt = svg.getAttribute('viewBox');
    expect(gezoomt).not.toBe(vorher);
    change(host.querySelector('select[aria-label^="Vollgeschoss EG"]') as HTMLSelectElement, 'nein');
    expect(useGrz.getState().project.storeys[0].vollgeschoss).toBe(false);
    expect(svg.getAttribute('viewBox')).toBe(gezoomt);
    act(() => useGrz.getState().undo());
    expect(svg.getAttribute('viewBox')).toBe(gezoomt);
    act(() => useGrz.getState().load(projekt()));
    expect(host.querySelector('svg.grz-skizze')!.getAttribute('viewBox')).toBe(vorher);
  });

  it('Polygon per Doppelklick: genau die geklickten Punkte, kein doppelter Eckpunkt', () => {
    useGrz.getState().load(projekt());
    const host = render(GrzGfzView);
    act(() => knopf(host, 'Polygon').click());
    const svg = host.querySelector('svg.grz-skizze')!;
    klick(svg, { x: 20, y: 0 });
    klick(svg, { x: 26, y: 0 });
    klick(svg, { x: 26, y: 6 }, 1);
    klick(svg, { x: 26, y: 6 }, 2);
    act(() => svg.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, ...bildpunkt(svg, { x: 26, y: 6 }) })));
    const f = useGrz.getState().project.lageplan!.flaechen.at(-1)!;
    expect(f.points).toHaveLength(3);
  });

  it('Deckkraft-Regler: ein Zug ist ein Undo-Schritt', () => {
    const p = projekt();
    p.lageplan!.unterlage = unterlage;
    useGrz.getState().load(p);
    const host = render(GrzGfzView);
    const regler = host.querySelector('input[aria-label="Deckkraft der Unterlage"]') as HTMLInputElement;
    for (const v of ['0.55', '0.6', '0.65', '0.7']) {
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(regler, v);
        regler.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    expect((useGrz.getState().project.lageplan!.unterlage as typeof unterlage).opacity).toBe(0.7);
    expect(useGrz.getState().past).toHaveLength(1);
    expect(useGrz.getState().pastAktionen).toEqual(['Deckkraft ändern']);
  });

  it('Unterlage ausrichten und kalibrieren', async () => {
    const p = projekt();
    p.lageplan!.unterlage = unterlage;
    useGrz.getState().load(p);
    const host = render(App);
    act(() => knopf(host, 'Ausrichten').click());
    let svg = host.querySelector('svg.grz-skizze')!;
    klick(svg, { x: 20, y: 20 });
    klick(svg, { x: 23, y: 24 });
    const u = useGrz.getState().project.lageplan!.unterlage as typeof unterlage;
    expect(u.x).toBeCloseTo(3, 1);
    expect(u.y).toBeCloseTo(4, 1);
    act(() => knopf(host, 'Kalibrieren').click());
    svg = host.querySelector('svg.grz-skizze')!;
    klick(svg, { x: 20, y: 20 });
    klick(svg, { x: 25, y: 20 });
    const feld = document.querySelector('.modal input') as HTMLInputElement;
    expect(feld).not.toBeNull();
    change(feld, '10');
    await act(async () => knopf(document.body, 'Kalibrieren').click());
    expect((useGrz.getState().project.lageplan!.unterlage as typeof unterlage).metersPerPixel).toBeCloseTo(0.2, 2);
  });

  it('Entf löscht die Auswahl, Rückgängig stellt sie wieder her; Strg+A, Strg+C, Strg+V, Umschalt+Klick', () => {
    useGrz.getState().load(projekt());
    const host = render(GrzGfzView);
    const ids = useGrz.getState().project.lageplan!.flaechen.map((f) => f.id);
    const links = [...host.querySelectorAll('.grz-table button.link')] as HTMLButtonElement[];
    act(() => links[0].click());
    act(() => links[1].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })));
    expect(useGrz.getState().selectedIds).toEqual(ids);
    taste('Delete');
    expect(useGrz.getState().project.lageplan!.flaechen).toHaveLength(0);
    expect(useGrz.getState().selectedIds).toEqual([]);
    act(() => useGrz.getState().undo());
    expect(useGrz.getState().project.lageplan!.flaechen.map((f) => f.id)).toEqual(ids);
    taste('a', window, { ctrlKey: true });
    expect(useGrz.getState().selectedIds).toEqual(ids);
    taste('c', window, { ctrlKey: true });
    taste('v', window, { ctrlKey: true });
    const neu = useGrz.getState().project.lageplan!.flaechen;
    expect(neu).toHaveLength(4);
    expect(useGrz.getState().selectedIds).toEqual(neu.slice(2).map((f) => f.id));
    expect(neu[2].points[0].x).toBeCloseTo(useGrz.getState().project.lageplan!.flaechen[0].points[0].x + 0.5, 6);
  });

  it('Strg+Z im Eingabefeld und hinter einem Dialog ändert das Projekt nicht (Gegenprobe: sonst Rückgängig)', () => {
    useGrz.getState().load(projekt());
    const host = render(App);
    act(() => useGrz.getState().update((p) => ({ ...p, name: 'Geändert' }), undefined, 'Name'));
    const feld = host.querySelector('.grz-fest input') as HTMLInputElement;
    taste('z', feld, { ctrlKey: true });
    expect(useGrz.getState().project.name).toBe('Geändert');
    act(() => knopf(host, 'Excel-Export …').click());
    taste('z', document.body, { ctrlKey: true });
    expect(useGrz.getState().project.name).toBe('Geändert');
    taste('Escape', document.body);
    taste('z', document.body, { ctrlKey: true });
    expect(useGrz.getState().project.name).toBe('GRZ-Test');
  });

  it('Speichern: Änderung während des Speicherns bleibt ungespeichert; inzwischen anderes Projekt geöffnet bleibt unberührt', () => {
    useGrz.getState().load(projekt());
    const st = useGrz.getState;
    act(() => st().update((p) => ({ ...p, name: 'A' }), undefined, 'Name'));
    const gespeichert = st().project;
    const dok = st().dokument;
    act(() => st().update((p) => ({ ...p, name: 'B' }), undefined, 'Name'));
    act(() => st().markSaved('x.oap', gespeichert, gespeichert, dok));
    expect(st().dirty).toBe(true);
    expect(st().project.name).toBe('B');
    expect(st().datei).toBe('x.oap');
    // Gegenprobe: ohne Weiterarbeiten gilt der Stand als gespeichert
    act(() => st().markSaved('x.oap', st().project, st().project, st().dokument));
    expect(st().dirty).toBe(false);
    const alt = st().dokument;
    act(() => st().load(createProject('Anderes')));
    act(() => st().markSaved('y.oap', gespeichert, gespeichert, alt));
    expect(st().project.name).toBe('Anderes');
    expect(st().datei).toBeNull();
  });
});

describe('Gesamt-Review: Bedienung der Oberfläche', () => {
  const knopf = (host: ParentNode, t: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === t) as HTMLButtonElement;
  const zeiger = (svg: Element, typ: string, q: { x: number; y: number }, extra: PointerEventInit = {}) =>
    act(() => svg.dispatchEvent(new PointerEvent(typ, { bubbles: true, button: 0, pointerId: 1, ...bildpunkt(svg, q), ...extra })));
  const feldMit = (host: HTMLElement, label: string) =>
    [...host.querySelectorAll('.field')].find((f) => f.querySelector('.field-label')?.textContent === label)!.querySelector('input') as HTMLInputElement;

  it('Grenze: Kante anklicken wählt das Flurstück, Punkt ziehen ändert es, Entf löscht nur dieses', () => {
    const p = projekt();
    p.lageplan!.grenze = [
      { id: 'gr1', name: 'Flurstück 1', points: rectPoints({ x: -5, y: -4 }, { x: 18, y: 16 }) },
      { id: 'gr2', name: 'Flurstück 2', points: rectPoints({ x: 18, y: -4 }, { x: 25, y: 16 }) },
    ];
    useGrz.getState().load(p);
    const host = render(GrzGfzView);
    const svg = host.querySelector('svg.grz-skizze')!;
    // Klick auf die linke Kante von Flurstück 1
    zeiger(svg, 'pointerdown', { x: -5, y: 6 });
    zeiger(svg, 'pointerup', { x: -5, y: 6 });
    expect(host.querySelector('.lp-chip.active')!.textContent).toContain('Flurstück 1');
    const griffe = host.querySelectorAll('circle.vertex-handle');
    expect(griffe).toHaveLength(4);
    // Ecke (-5|-4) nach (-6|-4) ziehen
    act(() => griffe[0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, ...bildpunkt(svg, { x: -5, y: -4 }) })));
    zeiger(svg, 'pointermove', { x: -6, y: -4 }, { altKey: true });
    zeiger(svg, 'pointerup', { x: -6, y: -4 });
    const g1 = useGrz.getState().project.lageplan!.grenze![0];
    expect(g1.points[0].x).toBeCloseTo(-6, 1);
    expect(useGrz.getState().pastAktionen.at(-1)).toBe('Punkt verschieben');
    // Gegenprobe: Lageplan-Flächen unverändert
    expect(useGrz.getState().project.lageplan!.flaechen.map((f) => f.points)).toEqual(p.lageplan!.flaechen.map((f) => f.points));
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })));
    expect(useGrz.getState().project.lageplan!.grenze!.map((g) => g.id)).toEqual(['gr2']);
  });

  it('Tastenübersicht schließt mit Esc; Leerzustand bietet Zeichnen an; Tabelle mit Nummern wie im Plan', () => {
    const p = projekt();
    const flaechen = p.lageplan!.flaechen;
    p.lageplan!.flaechen = [];
    useGrz.getState().load(p);
    const host = render(GrzGfzView);
    expect(host.querySelector('.lp-legende')).toBeNull();
    act(() => knopf(host.querySelector('.lp-leer')!, 'Polygon zeichnen').click());
    expect(useGrz.getState().werkzeug).toBe('polygon');
    expect(host.querySelector('.lp-leer')).toBeNull();
    const tasten = host.querySelector('details.lp-tasten') as HTMLDetailsElement;
    tasten.open = true;
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(tasten.open).toBe(false);
    // Gegenprobe: das zweite Esc wechselt zur Auswahl
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(useGrz.getState().werkzeug).toBe('auswahl');
    act(() => useGrz.getState().update((x) => ({ ...x, lageplan: { flaechen } }), undefined, 'Flächen'));
    const nr = [...host.querySelector('.grz-plan .grz-table')!.querySelectorAll('tbody tr:not(.sum) td:first-child')].map((t) => t.textContent);
    expect(nr).toEqual(['1', '2']);
    expect([...host.querySelectorAll('.lp-beschriftung')].map((t) => t.textContent?.split(' · ')[0])).toEqual(expect.arrayContaining(['1', '2']));
  });

  it('Eingaben: Mindestens > höchstens und GRZ II < GRZ melden am Feld; zwingend zeigt ein Feld „Anzahl“', () => {
    const p = projekt();
    p.massNutzung = { ...p.massNutzung, planDatum: '2020-01-01', vollgeschosseMin: 3, vollgeschosseMax: 2, grz: 0.4, grzIIMax: 0.3 };
    useGrz.getState().load(p);
    const host = render(GrzGfzView);
    const meldungen = [...host.querySelectorAll('.grz-fest .feld-meldung')].map((m) => m.textContent);
    expect(meldungen).toEqual(['Kleiner als die GRZ – die GRZ II umfasst die Hauptanlage mit.', 'Mindestens ist größer als höchstens.']);
    const zwingend = [...host.querySelectorAll('label.toggle')].find((l) => l.textContent?.includes('zwingend'))!.querySelector('input') as HTMLInputElement;
    act(() => zwingend.click());
    expect(feldMit(host, 'Anzahl (zwingend)').value).toBe('2');
    expect(host.querySelectorAll('.grz-fest .feld-meldung')).toHaveLength(1);
    // Gebiet mit Klartext
    expect([...host.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.value === 'WA'))!.textContent).toContain('WA – allgemeines Wohngebiet');
  });

  it('Neues Projekt ohne Gebäude zeigt die Ansicht mit Hinweis statt des Einstiegs', async () => {
    useGrz.getState().load(createProject());
    const host = render(App);
    expect(host.querySelector('.grz-view')).toBeNull();
    await act(async () => knopf(host, 'Neues Projekt').click());
    expect(host.querySelector('.grz-view')).not.toBeNull();
    expect(host.textContent).toContain('noch keinen Gebäudeumriss');
    expect(host.querySelector('button[aria-label="Rückgängig"]')).not.toBeNull();
  });

  it('Kennzahl-Karte: kurze Pille, Grund in der Unterzeile, Spanne der ungeklärten Flächen eigene Zeile', () => {
    const p = projekt();
    p.meta.grundstueck.flaeche = undefined;
    p.lageplan!.flaechen = [];
    useGrz.getState().load(p);
    const host = render(GrzGfzView);
    const karte = host.querySelector('.kpi')!;
    expect(karte.querySelector('.pill')!.textContent).toBe('fehlt');
    expect(karte.textContent).toContain('Grundstücksfläche fehlt');
    act(() => useGrz.getState().load(projekt()));
    const k2 = host.querySelector('.kpi')!;
    expect(k2.querySelector('.kpi-offen')!.textContent).toBe('mit ungeklärten Flächen bis 0,294');
    expect(k2.textContent).toContain('Reserve 110,00 m²');
    expect(k2.getAttribute('title')).toContain('GR 135,00 m² < 245,00 m² zulässig');
  });

  it('Wandzuschlag nur, wenn Aufenthaltsräume zur GF zählen – 1990 erst mit Festsetzung nach § 20 Abs. 3 S. 2', () => {
    const p = projekt();
    p.massNutzung = { ...p.massNutzung, planDatum: '2020-01-01' };
    useGrz.getState().load(p);
    const host = render(GrzGfzView);
    const hatFeld = () => [...host.querySelectorAll('.field-label')].some((l) => l.textContent === 'Wandzuschlag [m]');
    expect(hatFeld()).toBe(false);
    const schalter = [...host.querySelectorAll('label.toggle')].find((l) => l.textContent?.replace(/\u00a0/g, ' ').includes('§ 20 Abs. 3 S. 2'))!.querySelector('input') as HTMLInputElement;
    act(() => schalter.click());
    expect(hatFeld()).toBe(true);
  });

  it('Öffnen eines Projekts an anderen Koordinaten passt den Ausschnitt auf das neue Gebäude ein', () => {
    useGrz.getState().load(projekt());
    const host = render(GrzGfzView);
    const verschoben = projekt();
    const um = (pts: { x: number; y: number }[]) => pts.map((q) => ({ x: q.x + 1000, y: q.y + 500 }));
    for (const st of verschoben.storeys) for (const sh of st.shapes) sh.points = um(sh.points);
    verschoben.lageplan = { flaechen: [] };
    act(() => useGrz.getState().load(verschoben));
    const [x, y, w, h] = host.querySelector('svg.grz-skizze')!.getAttribute('viewBox')!.split(' ').map(Number);
    // Gebäude 1000…1012 × 500…511,25 liegt ganz im Ausschnitt, nichts vom alten Ort (vorher begann er bei x < 0)
    expect(x).toBeGreaterThan(900);
    expect(x).toBeLessThan(1000);
    expect(x + w).toBeGreaterThan(1012);
    expect(y).toBeLessThan(500);
    expect(y + h).toBeGreaterThan(511.25);
  });

  it('Flurstück gewählt, dann Fläche aus der Tabelle gewählt: Entf löscht die Fläche, nicht das Flurstück', () => {
    const p = projekt();
    p.lageplan!.grenze = [{ id: 'gr1', name: 'Flurstück 1', points: rectPoints({ x: -5, y: -4 }, { x: 18, y: 16 }) }];
    useGrz.getState().load(p);
    const host = render(GrzGfzView);
    const svg = host.querySelector('svg.grz-skizze')!;
    act(() => svg.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, ...bildpunkt(svg, { x: -5, y: 10 }) })));
    act(() => svg.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1, ...bildpunkt(svg, { x: -5, y: 10 }) })));
    expect(host.querySelector('.lp-chip.active')).not.toBeNull();
    act(() => (host.querySelector('.grz-plan .grz-table button.link') as HTMLButtonElement).click());
    expect(host.querySelector('.lp-chip.active')).toBeNull();
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })));
    expect(useGrz.getState().project.lageplan!.grenze).toHaveLength(1);
    expect(useGrz.getState().project.lageplan!.flaechen).toHaveLength(1);
  });

  it('Baurecht: Auslegungsdatum wählt die BauNVO-Fassung, Inkrafttreten den Vollgeschossbegriff; Kästchen § 21a Abs. 4 Nr. 3 ab 1968', () => {
    const p = projekt();
    p.massNutzung = { ...p.massNutzung, planDatum: '1990-06-01' };
    useGrz.getState().load(p);
    const host = render(GrzGfzView);
    const kopf = () => host.querySelector('.grz-nachweis .muted')!.textContent!;
    expect(kopf()).toContain('BauNVO 1990');
    change(host.querySelector('input[aria-label="Öffentliche Auslegung des Planentwurfs"]') as HTMLInputElement, '1989-10-01');
    expect(useGrz.getState().project.massNutzung?.auslegungDatum).toBe('1989-10-01');
    expect(kopf()).toContain('BauNVO 1968/1977');
    expect([...host.querySelectorAll('label.toggle')].some((l) => l.textContent?.replace(/\u00a0/g, ' ').includes('§ 21a Abs. 4 Nr. 3'))).toBe(true);
    // Gegenprobe: 1962 ohne das Kästchen; Feld heißt „Grundstücksfläche im Bauland“
    act(() => useGrz.getState().update((x) => ({ ...x, massNutzung: { ...x.massNutzung, planDatum: '1965-01-01', auslegungDatum: undefined } }), undefined, 'Datum'));
    expect([...host.querySelectorAll('label.toggle')].some((l) => l.textContent?.replace(/\u00a0/g, ' ').includes('§ 21a Abs. 4 Nr. 3'))).toBe(false);
    expect(host.querySelector('#grz-grundstueck')!.textContent).toContain('Grundstücksfläche im Bauland');
  });
});

describe('Folgerunde: Undo, Einstieg, Gesten, Unterlage', () => {
  it('Rückgängig bis zum gespeicherten Stand gilt als gespeichert; Wiederholen wieder als geändert (ohne Datei bleibt es geändert)', () => {
    const p = projekt();
    useGrz.getState().load(p, 'a.oap', p);
    act(() => useGrz.getState().update((x) => ({ ...x, name: 'Neu' }), undefined, 'Name'));
    expect(useGrz.getState().dirty).toBe(true);
    act(() => useGrz.getState().undo());
    expect(useGrz.getState().dirty).toBe(false);
    act(() => useGrz.getState().redo());
    expect(useGrz.getState().dirty).toBe(true);
    useGrz.getState().load(projekt());
    act(() => useGrz.getState().update((x) => ({ ...x, name: 'Neu' }), undefined, 'Name'));
    act(() => useGrz.getState().undo());
    expect(useGrz.getState().dirty).toBe(true);
  });

  it('„Speichern“ ist auf der Einstiegsseite gesperrt, nach „Neues Projekt“ frei', async () => {
    useGrz.getState().load(createProject());
    const host = render(App);
    const speichern = () => [...host.querySelectorAll('.toolbar button')].find((b) => b.textContent?.trim().startsWith('Speichern')) as HTMLButtonElement;
    expect(speichern().disabled).toBe(true);
    await act(async () => ([...host.querySelectorAll('button')].find((b) => b.textContent === 'Neues Projekt') as HTMLButtonElement).click());
    expect(speichern().disabled).toBe(false);
  });

  it('Abgebrochene Geste (pointercancel) übernimmt nichts (Gegenprobe: pointerup übernimmt)', () => {
    useGrz.getState().load(projekt());
    const host = render(GrzGfzView);
    const svg = host.querySelector('svg.grz-skizze')!;
    const vorher = useGrz.getState().project.lageplan!.flaechen[0].points;
    const ev = (typ: string, q: { x: number; y: number }) => act(() => svg.dispatchEvent(new PointerEvent(typ, { bubbles: true, button: 0, pointerId: 1, ...bildpunkt(svg, q) })));
    ev('pointerdown', { x: 13.5, y: 5 });
    ev('pointermove', { x: 15.5, y: 5 });
    ev('pointercancel', { x: 15.5, y: 5 });
    ev('pointerup', { x: 15.5, y: 5 });
    expect(useGrz.getState().project.lageplan!.flaechen[0].points).toEqual(vorher);
    ev('pointerdown', { x: 13.5, y: 5 });
    ev('pointermove', { x: 15.5, y: 5 });
    ev('pointerup', { x: 15.5, y: 5 });
    expect(useGrz.getState().project.lageplan!.flaechen[0].points[0].x).toBeCloseTo(vorher[0].x + 2, 1);
  });

  it('Unterlage: große Bilder werden verkleinert, zu große Dateien mit verständlicher Meldung abgelehnt', async () => {
    const { zielGroesse, unterlageLesen, UnterlageZuGross, BILD_MAX } = await import('./unterlage');
    expect(zielGroesse(8000, 4000)).toEqual({ w: BILD_MAX, h: BILD_MAX / 2, verkleinert: true });
    expect(zielGroesse(3000, 2000)).toEqual({ w: 3000, h: 2000, verkleinert: false });
    const gross = { name: 'plan.png', type: 'image/png', size: 60 * 1024 * 1024 } as File;
    await expect(unterlageLesen(gross, { x: 0, y: 0, w: 10, h: 10 })).rejects.toBeInstanceOf(UnterlageZuGross);
    await expect(unterlageLesen(gross, { x: 0, y: 0, w: 10, h: 10 })).rejects.toThrow(/höchstens 40 MB/);
  });
});

describe('Designsystem: Kontextmenü, Symbole, Druckvorschau, Feldfehler', () => {
  const kontext = (el: Element, q?: { x: number; y: number }) => {
    const svg = el.closest('svg') ?? el;
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, ...(q ? bildpunkt(svg, q) : { clientX: 0, clientY: 0 }) });
    act(() => el.dispatchEvent(ev));
    return ev;
  };
  const schwerpunkt = (pts: { x: number; y: number }[]) => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
  const esc = () => act(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));

  it('Rechtsklick auf eine Fläche wählt sie und bietet kopieren, duplizieren, Einfügen, löschen – wie die Tastenkürzel', () => {
    useGrz.getState().load(projekt());
    const host = render(MitMenue);
    const svg = host.querySelector('svg.grz-skizze')!;
    const flaechen = () => useGrz.getState().project.lageplan!.flaechen;
    const oben = flaechen().at(-1)!;
    const zahl = flaechen().length;
    expect(kontext(svg, schwerpunkt(oben.points)).defaultPrevented).toBe(true);
    expect(useGrz.getState().selectedIds).toEqual([oben.id]);
    expect(host.querySelector('.menue')!.getAttribute('aria-label')).toBe(oben.name);
    expect(menueTexte(host)).toEqual(['Fläche kopieren', 'Fläche duplizieren', 'Einfügen', 'Fläche löschen']);
    // Tastenkürzel als tasten (rechts, aria-keyshortcuts), nicht im Namen
    expect(menuePunkt(host, 'Fläche kopieren').getAttribute('aria-keyshortcuts')).toBe(tastenAria('Strg+C'));
    expect(menuePunkt(host, 'Fläche löschen').getAttribute('aria-keyshortcuts')).toBe(tastenAria('Entf / Rücktaste'));
    // duplizieren: eine Fläche mehr, die Kopie ist gewählt
    act(() => menuePunkt(host, 'Fläche duplizieren').click());
    expect(flaechen()).toHaveLength(zahl + 1);
    expect(host.querySelector('.menue')).toBeNull();
    // kopieren, dann ist „Einfügen“ frei und fügt ein
    kontext(svg, schwerpunkt(oben.points));
    act(() => menuePunkt(host, 'Fläche kopieren').click());
    kontext(svg, schwerpunkt(oben.points));
    expect(menuePunkt(host, 'Einfügen').getAttribute('aria-disabled')).toBeNull();
    act(() => menuePunkt(host, 'Einfügen').click());
    expect(flaechen()).toHaveLength(zahl + 2);
    // löschen: ein Rückgängig-Schritt mit Namen
    const gewaehlt = useGrz.getState().selectedIds[0];
    kontext(svg, schwerpunkt(flaechen().find((f) => f.id === gewaehlt)!.points));
    act(() => menuePunkt(host, 'Fläche löschen').click());
    expect(flaechen().some((f) => f.id === gewaehlt)).toBe(false);
    expect(useGrz.getState().pastAktionen.at(-1)).toBe('Fläche löschen');
  });

  it('Rechtsklick im Leeren: Einfügen (gesperrt mit Grund, solange nichts kopiert ist) und Einpassen; Flurstück-Kante: Flurstück löschen', () => {
    const p = projekt();
    p.lageplan!.grenze = [{ id: 'gr1', name: 'Flurstück 1', points: rectPoints({ x: -5, y: -4 }, { x: 18, y: 16 }) }];
    // Ablage ist modulweit: definiert leer beginnen
    ablageLeeren();
    useGrz.getState().load(p);
    const host = render(MitMenue);
    const svg = host.querySelector('svg.grz-skizze')!;
    // weit außerhalb von Flächen und Grenze (Ausschnitt reicht über die Grenze hinaus)
    const [x, y] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    kontext(svg, { x: x + 0.5, y: y + 0.5 });
    expect(host.querySelector('.menue')!.getAttribute('aria-label')).toBe('Lageplan');
    expect(menueTexte(host)).toEqual(['Einfügen', 'Einpassen']);
    const einfuegen = menuePunkt(host, 'Einfügen');
    expect(einfuegen.getAttribute('aria-disabled')).toBe('true');
    expect(einfuegen.textContent).toContain('Nichts kopiert');
    expect(einfuegen.title).toBe('Zuerst Flächen kopieren (Strg+C)');
    esc();
    // Kante des Flurstücks: wählt es und bietet „Flurstück löschen“
    kontext(svg, { x: -5, y: 6 });
    expect(host.querySelector('.lp-chip.active')!.textContent).toContain('Flurstück 1');
    expect(menueTexte(host)).toEqual(['Flurstück löschen']);
    act(() => menuePunkt(host, 'Flurstück löschen').click());
    expect(useGrz.getState().project.lageplan!.grenze).toBeUndefined();
    expect(useGrz.getState().pastAktionen.at(-1)).toBe('Flurstück löschen');
  });

  it('Kontextmenütaste (ohne Mausposition) öffnet das Menü der Auswahl; beim Zeichnen gibt es kein Menü', () => {
    useGrz.getState().load(projekt());
    const host = render(MitMenue);
    const svg = host.querySelector('svg.grz-skizze')!;
    const f = useGrz.getState().project.lageplan!.flaechen;
    act(() => useGrz.getState().selectMany([f[0].id, f[1].id]));
    kontext(svg);
    expect(host.querySelector('.menue')!.getAttribute('aria-label')).toBe('2 Flächen');
    expect(menueTexte(host)).toEqual(['2 Flächen kopieren', '2 Flächen duplizieren', 'Einfügen', '2 Flächen löschen']);
    esc();
    // Gegenprobe: im Werkzeug Polygon kein Menü, aber auch kein Browsermenü
    act(() => useGrz.getState().setWerkzeug('polygon'));
    const ev = kontext(svg, schwerpunkt(f[0].points));
    expect(ev.defaultPrevented).toBe(true);
    expect(host.querySelector('.menue')).toBeNull();
  });

  it('Werkzeugleisten mit Symbolen statt Schriftzeichen; Druckvorschau: „Schließen“ links, „Drucken / PDF …“ als Hauptknopf', () => {
    useGrz.getState().load(projekt());
    const host = render(App);
    const undo = host.querySelector('.toolbar button[aria-label="Rückgängig"]')!;
    expect(undo.querySelector('svg.symbol')).not.toBeNull();
    expect(undo.textContent).toBe('');
    // Werkzeuge im Lageplan: Symbol vor dem Namen
    const werkzeuge = [...host.querySelectorAll('.lp-gruppe[aria-label="Werkzeug"] button')];
    expect(werkzeuge.map((b) => b.textContent?.trim())).toEqual(['Auswahl', 'Polygon', 'Rechteck', 'Grenze']);
    expect(werkzeuge.every((b) => b.querySelector('svg.symbol[aria-hidden="true"]'))).toBe(true);
    // bekannte Befehle tragen ihren Namen im aria-label (in schmalen Fenstern nur das Symbol)
    expect(host.querySelector('.toolbar button[aria-label="Neu"] .tb-text')!.textContent).toBe('Neu');
    expect(host.querySelector('.toolbar button[aria-label="Speichern"]')!.classList.contains('ungespeichert')).toBe(false);
    expect(host.querySelector('.toolbar')!.textContent).not.toMatch(/[↶↷×?]/);
    // Tastenübersicht im Lageplan: Symbol statt „?“, Name über aria-label
    const tasten = host.querySelector('.lp-tasten-knopf')!;
    expect(tasten.querySelector('svg.symbol')).not.toBeNull();
    expect(tasten.textContent).toBe('');
    expect(tasten.getAttribute('aria-label')).toBe('Tastenübersicht');
    act(() => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Nachweis drucken'))!.click());
    const knoepfe = [...host.querySelectorAll('.report-actions > button')];
    expect(knoepfe.map((b) => b.textContent)).toEqual(['Schließen', 'Drucken / PDF …']);
    expect(knoepfe[1].classList.contains('primary')).toBe(true);
    expect(knoepfe[0].classList.contains('primary')).toBe(false);
  });

  it('Meldungen über dem Inhalt nutzen .meldung: neutral beim fehlenden Gebäude, Warnung beim wiederhergestellten Stand', () => {
    const p = projekt();
    p.storeys = [];
    useGrz.getState().load(p);
    const host = render(App);
    const hinweis = [...host.querySelectorAll('.grz-bericht')].find((e) => e.textContent?.includes('noch keinen Gebäudeumriss'))!;
    expect(hinweis.className).toBe('meldung grz-bericht');
    expect(hinweis.getAttribute('role')).toBe('status');
    act(() => root?.unmount());
    const datei = projekt();
    useGrz.getState().wiederherstellen({ ...datei, name: 'Umbenannt' }, 'Haus.oap', datei, Date.now());
    const host2 = render(App);
    const leiste = [...host2.querySelectorAll('.grz-bericht')].find((e) => e.textContent?.includes('wiederhergestellt'))!;
    expect(leiste.className).toBe('meldung warnung grz-bericht');
    // ungespeichert: Punkt an „Speichern“ statt Zeichen im Text, Zustand im Namen des Knopfs
    const speichern = host2.querySelector('.toolbar button.ungespeichert')!;
    expect(speichern.getAttribute('aria-label')).toBe('Speichern – ungespeicherte Änderungen');
    expect(speichern.textContent?.trim()).toBe('Speichern');
    // Gegenprobe: kein Hinweis auf fehlendes Gebäude, wenn eins da ist
    expect(host2.textContent).not.toContain('noch keinen Gebäudeumriss');
  });

  it('Fehler über zwei Felder (mindestens > höchstens, GRZ II < GRZ): beide Felder rot und von der einen Meldung beschrieben', () => {
    const p = projekt();
    p.massNutzung = { ...p.massNutzung, vollgeschosseZwingend: undefined, vollgeschosseMin: 3, vollgeschosseMax: 2, grz: 0.4, grzIIMax: 0.3, planDatum: '2020-05-01' };
    useGrz.getState().load(p);
    const host = render(GrzGfzView);
    const vg = host.querySelector('#grz-vg-fehler')!;
    expect(vg.getAttribute('role')).toBe('alert');
    const vgFelder = [...host.querySelectorAll('input[aria-describedby~="grz-vg-fehler"]')];
    expect(vgFelder).toHaveLength(2);
    expect(vgFelder.every((i) => i.getAttribute('aria-invalid') === 'true' && i.classList.contains('feld-fehler'))).toBe(true);
    const grzFelder = [...host.querySelectorAll('input[aria-describedby~="grz-grz2-fehler"]')];
    expect(grzFelder).toHaveLength(2);
    expect(host.querySelector('#grz-grz2-fehler')!.textContent).toContain('Kleiner als die GRZ');
    // Gegenprobe: stimmig → keine Meldung, keine Markierung
    act(() => useGrz.getState().update((q) => ({ ...q, massNutzung: { ...q.massNutzung, vollgeschosseMin: 1, grzIIMax: 0.6 } })));
    expect(host.querySelector('#grz-vg-fehler')).toBeNull();
    expect(host.querySelector('#grz-grz2-fehler')).toBeNull();
    expect(host.querySelectorAll('input[aria-invalid="true"]')).toHaveLength(0);
  });

  it('Lageplan im dunklen Schema mit abgedunkelter Zeichenfläche: Füllungen vorgerechnet (planFuellungDunkel), Legende in Originalfarbe', () => {
    const ausgang = useTheme.getState();
    try {
      useGrz.getState().load(projekt());
      act(() => useTheme.setState({ theme: 'hell', canvasDunkel: true }));
      const host = render(GrzGfzView);
      const f = useGrz.getState().project.lageplan!.flaechen.find((x) => !x.nachbar && !x.variante)!;
      const pfad = () => [...host.querySelectorAll('svg.grz-skizze path')].find((e) => e.querySelector('title')?.textContent?.startsWith(f.name))!;
      const farbe = versiegelungInfo(f.versiegelung).color;
      // hell: Originalfarbe mit Deckung 0,55
      expect(pfad().getAttribute('fill')).toBe(farbe);
      expect(pfad().getAttribute('fill-opacity')).toBe('0.55');
      act(() => useTheme.setState({ theme: 'dunkel', canvasDunkel: true }));
      const dunkel = planFuellungDunkel(farbe, 0.55);
      expect(pfad().getAttribute('fill')).toBe(dunkel.farbe);
      expect(Number(pfad().getAttribute('fill-opacity'))).toBeCloseTo(dunkel.deckung, 6);
      expect(dunkel.farbe).not.toBe(farbe);
      // Legende bleibt in der Originalfarbe, ohne Filter
      const marke = [...host.querySelectorAll<HTMLElement>('.grz-table .swatch')].find((m) => m.parentElement?.textContent?.includes(versiegelungInfo(f.versiegelung).label))!;
      expect(marke.style.background).not.toBe('');
      expect(marke.style.filter).toBe('');
      // Gegenprobe: dunkles Schema ohne Abdunkeln der Zeichenfläche → wieder die Originalfarbe
      act(() => useTheme.setState({ theme: 'dunkel', canvasDunkel: false }));
      expect(pfad().getAttribute('fill')).toBe(farbe);
    } finally {
      useTheme.setState({ theme: ausgang.theme, canvasDunkel: ausgang.canvasDunkel });
    }
  });

  it('GRZ II < GRZ markiert nur bei BauNVO 1990 (Gegenprobe 1968/1977: altes grzIIMax macht die GRZ nicht ungültig)', () => {
    const p = projekt();
    p.massNutzung = { ...p.massNutzung, grz: 0.4, grzIIMax: 0.3, baunvo: '1968' };
    useGrz.getState().load(p);
    const host = render(GrzGfzView);
    expect(host.querySelector('#grz-grz2-fehler')).toBeNull();
    expect(host.querySelectorAll('input[aria-invalid="true"]')).toHaveLength(0);
    act(() => useGrz.getState().update((q) => ({ ...q, massNutzung: { ...q.massNutzung, baunvo: '1990' } })));
    expect(host.querySelectorAll('input[aria-describedby~="grz-grz2-fehler"][aria-invalid="true"]')).toHaveLength(2);
  });
});
