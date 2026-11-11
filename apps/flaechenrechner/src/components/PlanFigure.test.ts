import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { rectPoints } from '@core/geometry';
import { createOutline, createProject, createRoom } from '@core/model';
import { PlanFigure } from './PlanFigure';

describe('Grundriss im Bericht (F-09)', () => {
  it('je Beschriftung genau ein <text>-Element, Name und Fläche nur einmal im Text', () => {
    const p = createProject('Haus');
    const eg = p.storeys[0];
    eg.shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 12, y: 10 })));
    eg.shapes.push(createRoom(rectPoints({ x: 0.5, y: 0.5 }, { x: 6, y: 5 }), '0.01', 'Wohnen'));
    eg.shapes.push(createRoom(rectPoints({ x: 6.5, y: 0.5 }, { x: 11.5, y: 5 }), '0.02', 'Küche'));
    const html = renderToStaticMarkup(createElement(PlanFigure, { storey: eg, showBackground: false }));
    const labels = html.match(/<text[^>]*class="plan-label"[^>]*>.*?<\/text>/g) ?? [];
    // drei Flächen + Maßstab (0 und Länge)
    expect(labels.filter((t) => t.includes('m²'))).toHaveLength(3);
    const text = html.replace(/<[^>]+>/g, '|');
    expect(text.match(/0\.01 Wohnen/g)).toHaveLength(1);
    expect(text.match(/0\.01/g)).toHaveLength(1);
  });
});
