import { describe, expect, it } from 'vitest';
import { computeProject } from '@core/calc';
import { buildExportContext, repeatCollection, resolveText, shiftFormulaForInsert, shiftRelativeRows } from './exportData';
import { rectPoints } from '@core/geometry';
import { createOutline, createProject, createRoom } from '@core/model';

function ctx() {
  const p = createProject('Haus A');
  p.storeys[0].shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 })));
  const r = createRoom(rectPoints({ x: 0, y: 0 }, { x: 4, y: 5 }), '0.01', 'Wohnen');
  r.wofl = { kategorie: 'voll', wohnung: 'WE 1' };
  p.storeys[0].shapes.push(r);
  return buildExportContext(p, computeProject(p), new Date(2026, 8, 28));
}

describe('Excel-Vorlagen', () => {
  it('ersetzt Einzelwerte typgerecht', () => {
    const c = ctx();
    expect(resolveText('{{summe.bgf}}', c)).toBe(80);
    expect(resolveText(' {{ projekt.name }} ', c)).toBe('Haus A');
    expect(resolveText('Projekt: {{projekt.name}}, BGF {{summe.bgf}} m²', c)).toBe('Projekt: Haus A, BGF 80 m²');
    expect(resolveText('{{geschoss:EG.nrf}}', c)).toBe(20);
    expect(resolveText('{{wohnung:WE 1.wofl}}', c)).toBe(20);
    expect(resolveText('{{gibtsnicht}}', c)).toBe('{{gibtsnicht}}');
    expect(resolveText('{{datum}}', c)).toBe('28.09.2026');
  });

  it('erkennt Wiederholungszeilen und setzt Zeilenwerte ein', () => {
    const c = ctx();
    expect(repeatCollection(['Summe', '{{raum.name}}'], c)).toBe('raum');
    expect(repeatCollection(['{{summe.bgf}}'], c)).toBeNull();
    const row = c.collections.raum[0];
    expect(resolveText('{{raum.flaeche}}', c, { collection: 'raum', row })).toBe(20);
    expect(resolveText('{{raum.nummer}} {{raum.name}}', c, { collection: 'raum', row })).toBe('0.01 Wohnen');
  });

  it('passt Formeln beim Einfügen von Zeilen an', () => {
    expect(shiftFormulaForInsert('SUM(C5:C5)', 5, 3)).toBe('SUM(C5:C8)');
    expect(shiftFormulaForInsert('SUM(C4:C5)+D6*$B$7', 5, 2)).toBe('SUM(C4:C7)+D8*$B$9');
    expect(shiftFormulaForInsert('C3+LOG10(A2)', 5, 2)).toBe('C3+LOG10(A2)');
    expect(shiftFormulaForInsert('"A9"&A9&Tabelle2!A9', 5, 1)).toBe('"A9"&A10&Tabelle2!A9');
    expect(shiftRelativeRows('C5*D$5+SUM($E$1:E5)', 2)).toBe('C7*D$5+SUM($E$1:E7)');
  });
});

describe('Putzabzug und Maßgrundlage (FR-05)', () => {
  it('Raum mit 3 % Putzabzug: roh, Abzug und Fläche stimmen; Maßgrundlage im Kopf', () => {
    const p = createProject('Haus');
    const r = createRoom(rectPoints({ x: 0, y: 0 }, { x: 9.4, y: 7.4 }), '0.01', 'Wohnen');
    r.putzabzug = 3;
    p.storeys[0].shapes.push(r);
    p.settings.massgrundlage = 'rohbau';
    const c = buildExportContext(p, computeProject(p));
    const row = c.collections.raum[0];
    expect(row.flaeche_roh).toBe(69.56);
    expect(row.putzabzug).toBe(3);
    expect(row.flaeche).toBe(Math.round(69.556 * 0.97 * 100) / 100);
    expect(c.scalars['projekt.massgrundlage']).toBe('Planmaß Rohbau');
    expect(c.scalars['projekt.normen']).toMatch(/DIN 277:2021-08/);
  });
});

describe('R/S getrennt (FR-09)', () => {
  it('Projekt mit S-Umriss liefert getrennte Werte für BGF, BRI, NRF und KGF, Summen stimmen', () => {
    const p = createProject('Haus');
    const eg = p.storeys[0];
    eg.shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 })));
    eg.shapes.push({ ...createOutline(rectPoints({ x: 10, y: 0 }, { x: 12, y: 4 }), 'Balkon'), umschliessung: 'S' as const, hoehe: 1.1 });
    eg.shapes.push(createRoom(rectPoints({ x: 0.3, y: 0.3 }, { x: 9.7, y: 7.7 }), '0.01', 'Wohnen'));
    eg.shapes.push(createRoom(rectPoints({ x: 10, y: 0 }, { x: 12, y: 3.5 }), '0.02', 'Balkon'));
    const c = buildExportContext(p, computeProject(p));
    const g = c.collections.geschoss[0];
    expect([g.bgf_r, g.bgf_s, g.bri_s, g.nrf_s, g.kgf_s]).toEqual([80, 8, 8.8, 7, 1]);
    expect((g.nrf_r as number) + (g.nrf_s as number)).toBeCloseTo(g.nrf as number, 6);
    expect((g.kgf_r as number) + (g.kgf_s as number)).toBeCloseTo(g.kgf as number, 6);
    expect(c.scalars['summe.kgf_s']).toBe(1);
  });
});

describe('Kontrollmaß in Excel (F-16)', () => {
  function mitPlan(massstabBeimMessen: number | undefined) {
    const p = createProject('Haus');
    const eg = p.storeys[0];
    eg.background = { type: 'raster', name: 'EG.png', dataUrl: 'data:,', widthPx: 1000, heightPx: 800, x: 0, y: 0, metersPerPixel: 0.01, opacity: 0.6, visible: true };
    p.settings.kontrollmasse = { [eg.id]: { soll: 8, ist: 8.0096, abweichung: 0.0012, ...(massstabBeimMessen ? { massstab: massstabBeimMessen } : {}) } };
    return p;
  }
  const text = (p: ReturnType<typeof createProject>) => buildExportContext(p, computeProject(p)).scalars['projekt.kontrollmass'];

  it('steht im Kopf, solange der Plan im gemessenen Maßstab vorliegt', () => {
    expect(text(mitPlan(0.01))).toBe('EG: aus Plan abgegriffen, Maßstab kalibriert, Kontrollmaß 8,00 m: Abweichung +0,12 %');
    // ältere Projekte ohne gespeicherten Maßstab: gilt, solange der Plan da ist
    expect(text(mitPlan(undefined))).toMatch(/^EG: /);
  });

  it('entfällt nach Maßstabsänderung, ohne Plan und nach ohneKontrollmass (neuer Plan)', async () => {
    const { ohneKontrollmass } = await import('./background');
    const p = mitPlan(0.01);
    const eg = p.storeys[0];
    if (eg.background?.type === 'raster') eg.background.metersPerPixel = 0.02;
    expect(text(p)).toBe('');
    const q = mitPlan(0.01);
    delete q.storeys[0].background;
    expect(text(q)).toBe('');
    const neu = mitPlan(0.01);
    expect(ohneKontrollmass(neu, neu.storeys[0].id).settings.kontrollmasse).toEqual({});
  });
});

describe('Normangaben und Planungsunterlagen in Excel', () => {
  it('projekt.normen nennt die Vergleichsrechnung, projekt.planunterlagen Eingabe bzw. hinterlegte Pläne', () => {
    const p = createProject('Haus');
    expect(buildExportContext(p, computeProject(p)).scalars['projekt.normen']).toMatch(/^Wohnfläche nach WoFlV vom 25\.11\.2003; /);
    p.settings.zweiteBV = true;
    p.settings.planunterlagen = 'Grundrisse 1:100, Stand 01.10.2026';
    const c = buildExportContext(p, computeProject(p));
    expect(c.scalars['projekt.normen']).toMatch(/^Wohnfläche: Vergleichsrechnung WoFlV mit Freisitzen zu ½/);
    expect(c.scalars['projekt.planunterlagen']).toBe('Grundrisse 1:100, Stand 01.10.2026');
  });
});
