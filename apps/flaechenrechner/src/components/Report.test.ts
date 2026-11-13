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
});
