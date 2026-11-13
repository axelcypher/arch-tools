// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { rectPoints } from '@core/geometry';
import { createOutline, createProject, createRoom } from '@core/model';
import { useEditor } from '../store/store';
import { Report } from './Report';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// echtes Rendern statt renderToStaticMarkup: dort liefert zustand den Anfangszustand, nicht das geladene Projekt
let root: ReturnType<typeof createRoot> | null = null;
function bericht(): string {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(createElement(Report));
  });
  return host.innerHTML;
}
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

describe('Bericht (F-17)', () => {
  it('„Bauantrag NRW“: Kopf mit Normausgaben, BRI-Rechenweg, Unterschriftszeile; ohne Wohnfläche kein WoFlV-Abschnitt', () => {
    const p = createProject('Haus');
    p.storeys[0].shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 })));
    p.storeys[0].shapes.push(createRoom(rectPoints({ x: 0.3, y: 0.3 }, { x: 9.7, y: 7.7 }), '0.01', 'Lager'));
    p.settings.bericht = { vorlage: 'bauantrag', abschnitte: ['wofl'] };
    useEditor.getState().loadProject(p);
    const html = bericht();
    expect(html).toContain('Berechnung des Brutto-Rauminhalts und der Flächen');
    expect(html).toContain('Brutto-Rauminhalt – Rechenweg');
    expect(html).toContain('§ 6 Nr. 1 BauPrüfVO NRW nennt DIN 277-1:2016-01');
    expect(html).toContain('Entwurfsverfasserin / Entwurfsverfasser');
    expect(html).not.toContain('Wohnflächen nach WoFlV');
    expect(html).not.toContain('BGF S [m²]');
  });

  it('Kopf nennt Messverfahren und Planungsunterlagen (DIN 277:2021-08, 5.1); fehlen sie, warnt der Bericht', () => {
    const p = createProject('Haus');
    p.storeys[0].shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 })));
    useEditor.getState().loadProject(p);
    expect(bericht()).toContain('Messverfahren nicht angegeben (DIN 277:2021-08, 5.1)');
    act(() => root?.unmount());
    const q = createProject('Haus');
    q.storeys[0].shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 })));
    q.settings.massgrundlage = 'rohbau';
    q.settings.planunterlagen = 'Grundrisse 1:100, Stand 01.10.2026';
    useEditor.getState().loadProject(q);
    const html = bericht();
    expect(html).toContain('Planungsunterlagen: Grundrisse 1:100, Stand 01.10.2026');
    expect(html).not.toContain('nicht angegeben (DIN 277:2021-08, 5.1)');
  });

  it('Bedienhinweise nur am Bildschirm (no-print), Zahlenspalten mit rechtsbündigem Kopf, Raumzeile samt Rechenweg als Einheit', () => {
    const p = createProject('Haus');
    p.storeys[0].shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 })));
    p.storeys[0].shapes.push(createRoom(rectPoints({ x: 0.3, y: 0.3 }, { x: 9.7, y: 7.7 }), '0.01', 'Wohnen'));
    useEditor.getState().loadProject(p);
    bericht();
    const warnung = [...document.querySelectorAll('.report .warning')].find((e) => e.textContent?.includes('Messverfahren nicht angegeben'));
    expect(warnung?.classList.contains('no-print')).toBe(true);
    const kopf = [...document.querySelectorAll('.report th')];
    expect(kopf.find((t) => t.textContent === 'BGF [m²]')?.classList.contains('num')).toBe(true);
    expect(kopf.find((t) => t.textContent === 'Geschoss')?.classList.contains('num')).toBe(false); // Gegenprobe: Textspalte links
    expect(document.querySelectorAll('tbody.raum-zeilen')).toHaveLength(1);
  });

  it('Nutzungsgruppen-Tabelle nur mit Spalten, die Fläche haben; die übrigen stehen in der Anmerkung', () => {
    const p = createProject('Haus');
    p.storeys[0].shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 })));
    p.storeys[0].shapes.push(createRoom(rectPoints({ x: 0.3, y: 0.3 }, { x: 5, y: 7.7 }), '0.01', 'Wohnen'));
    const flur = createRoom(rectPoints({ x: 5, y: 0.3 }, { x: 9.7, y: 7.7 }), '0.02', 'Flur');
    flur.nutzung = 'VF';
    p.storeys[0].shapes.push(flur);
    useEditor.getState().loadProject(p);
    bericht();
    const abschnitt = [...document.querySelectorAll('.bericht-abschnitt')].find((e) => e.querySelector('h2')?.textContent === 'Netto-Raumfläche nach Nutzungsgruppen')!;
    const kopf = [...abschnitt.querySelectorAll('th')].map((t) => t.textContent);
    expect(kopf).toEqual(['Geschoss', 'NUF 1', 'VF 9']);
    expect(abschnitt.textContent).toContain('Nicht aufgeführt, weil ohne Fläche: NUF 2');
    expect(abschnitt.textContent).toContain('TF 8');
    expect(abschnitt.textContent).not.toMatch(/ohne Fläche:[^.]*VF 9/); // Gegenprobe: VF hat Fläche
  });

  it('Anzeige (Grundrisse, Rechenweg) wird gemerkt und beim nächsten Öffnen übernommen', () => {
    const p = createProject('Haus');
    p.storeys[0].shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 })));
    p.storeys[0].shapes.push(createRoom(rectPoints({ x: 0.3, y: 0.3 }, { x: 9.7, y: 7.7 }), '0.01', 'Wohnen'));
    useEditor.getState().loadProject(p);
    localStorage.clear();
    bericht();
    expect(document.querySelector('tr.rechenweg')).toBeNull();
    const rechenweg = [...document.querySelectorAll<HTMLLabelElement>('.report-actions label')].find((l) => l.textContent?.startsWith('Rechenweg je Raum'))!;
    act(() => rechenweg.querySelector('input')!.click());
    expect(document.querySelector('tr.rechenweg')).not.toBeNull();
    act(() => root?.unmount());
    document.body.innerHTML = '';
    bericht();
    expect(document.querySelector('tr.rechenweg')).not.toBeNull();
    localStorage.clear();
  });
});
