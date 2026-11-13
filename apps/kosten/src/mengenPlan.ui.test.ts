// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { rectPoints } from '@core/geometry';
import { versiegelungInfo } from '@core/lageplan';
import { createLageplanFlaeche } from '@core/model';
import { planFuellungDunkel } from '@core/planFarbe';
import { useTheme } from '@core/platform/theme';
import { MengenPlan } from './components/MengenPlan';
import { mengenNachweis } from './nachweis';
import { projektMitAnbau } from './testdaten';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

function zeichne() {
  const p = projektMitAnbau();
  p.lageplan = { flaechen: [createLageplanFlaeche(rectPoints({ x: -5, y: -5 }, { x: 20, y: 15 }), 'Zufahrt')] };
  const menge = mengenNachweis(p).mengen.auf;
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(createElement(MengenPlan, { project: p, menge, einheit: 'm²', aktiv: null, onAktiv: () => undefined }));
  });
  return host.querySelector('path.mp-lageplan')!;
}

describe('Grundrisse auf der dunklen Zeichenfläche', () => {
  it('Lageplanfüllung wird vorgerechnet, wenn die Zeichenfläche gefiltert ist (Deckung 0,3)', () => {
    const farbe = versiegelungInfo('voll').color;
    // Gegenprobe: hell bzw. ungefiltert die Originalfarbe
    act(() => useTheme.setState({ theme: 'hell', canvasDunkel: true }));
    let pfad = zeichne();
    expect(pfad.getAttribute('fill')).toBe(farbe);
    expect(pfad.getAttribute('fill-opacity')).toBe('0.3');
    act(() => root?.unmount());
    document.body.innerHTML = '';
    act(() => useTheme.setState({ theme: 'dunkel', canvasDunkel: true }));
    pfad = zeichne();
    const soll = planFuellungDunkel(farbe, 0.3);
    expect(pfad.getAttribute('fill')).toBe(soll.farbe);
    expect(Number(pfad.getAttribute('fill-opacity'))).toBeCloseTo(soll.deckung, 6);
    expect(soll.farbe).not.toBe(farbe);
  });
});
