import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { rectPoints } from '@core/geometry';
import { createOutline, createProject, createRoom } from '@core/model';
import { useEditor } from '../store/store';
import { Report } from './Report';

describe('Bericht (F-17)', () => {
  it('„Bauantrag NRW“: Kopf mit Normausgaben, BRI-Rechenweg, Unterschriftszeile; ohne Wohnfläche kein WoFlV-Abschnitt', () => {
    const p = createProject('Haus');
    p.storeys[0].shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 })));
    p.storeys[0].shapes.push(createRoom(rectPoints({ x: 0.3, y: 0.3 }, { x: 9.7, y: 7.7 }), '0.01', 'Lager'));
    p.settings.bericht = { vorlage: 'bauantrag', abschnitte: ['wofl'] };
    useEditor.getState().loadProject(p);
    const html = renderToStaticMarkup(createElement(Report));
    expect(html).toContain('Brutto-Rauminhalt – Rechenweg');
    expect(html).toContain('DIN 277-1:2016-01, § 6 BauPrüfVO NRW');
    expect(html).toContain('Entwurfsverfasserin / Entwurfsverfasser');
    expect(html).not.toContain('Wohnflächen nach WoFlV');
    expect(html).not.toContain('BGF S [m²]');
  });
});
