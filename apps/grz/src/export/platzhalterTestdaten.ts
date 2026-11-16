import { rectPoints } from '@core/geometry';
import type { Project, Storey } from '@core/model';
import { createLageplanFlaeche, createOutline, createProject, createRoom, createStorey } from '@core/model';
import { buildGrzContext } from './exportData';

/**
 * Erfundene Beispieldaten der Platzhalter-Referenz von TERRIO (Beschreibung in TERRIO_SCHEMA.beispieldaten) – nur für
 * Tests: EG, OG, DG mit Walmdach, Bebauungsplan nach BauNVO 1990 mit Festsetzung nach § 20 Abs. 3 Satz 2, Lageplan-Flächen
 * jeder Anrechnung und Versiegelung sowie eine Nachbarfläche.
 */
export function platzhalterProjekt(): Project {
  const p = createProject('Musterhaus');
  p.meta.projektcode = '2417';
  const rect = rectPoints({ x: 0, y: 0 }, { x: 12, y: 10 });
  const st = (name: string, e: number, h: number): Storey => ({ ...createStorey(name, h), elevation: e, shapes: [createOutline(rect)] });
  const eg = st('EG', 0, 3);
  const og = st('OG', 3, 3);
  const dg = st('DG', 6, 3);
  const o = dg.shapes[0];
  if (o.kind === 'outline') o.dach = { typ: 'walm', traufhoehe: 0, neigung: 45, neigungWalm: 45, firstrichtung: 0 };
  dg.shapes.push(createRoom(rectPoints({ x: 3, y: 3 }, { x: 9, y: 7 }), '2.01', 'Zimmer'));
  const abstell = createRoom(rectPoints({ x: 1, y: 4 }, { x: 2.5, y: 6 }), '2.02', 'Abstellraum');
  abstell.aufenthalt = 'nein';
  dg.shapes.push(abstell);
  eg.shapes.push(createRoom(rectPoints({ x: 1, y: 1 }, { x: 6, y: 5 }), '0.01', 'Wohnen'));
  p.storeys = [eg, og, dg];
  const f = (x: number, w: number, name: string, nutzung: 'zufahrt' | 'terrasse' | 'weg' | 'garten', versiegelung: 'voll' | 'teil' | 'gruen') => ({
    ...createLageplanFlaeche(rectPoints({ x, y: 0 }, { x: x + w, y: 5 }), name),
    nutzung,
    versiegelung,
  });
  p.lageplan = {
    flaechen: [
      { ...f(12, 3, 'Zufahrt', 'zufahrt', 'teil'), hoehe: -0.2 },
      f(-3, 3, 'Terrasse', 'terrasse', 'voll'),
      f(-6, 3, 'Weg', 'weg', 'voll'),
      f(15, 4, 'Garten', 'garten', 'gruen'),
      { ...f(30, 4, 'Nachbarhaus', 'garten', 'voll'), nachbar: true },
    ],
  };
  p.meta.grundstueck.flaeche = 600;
  p.massNutzung = {
    planDatum: '1995-06-01',
    grz: 0.4,
    gfz: 0.8,
    vollgeschosseMax: 2,
    gelaende: -0.2,
    gebietsart: 'WA',
    stand: '2026-11-16',
    grAbsolut: 200,
    gfAbsolut: 500,
    bmz: 2,
    vollgeschosseMin: 1,
    aufenthaltNichtVollgeschoss: true,
    einstufung: { weg: 'grz1' },
  };
  return p;
}

export const platzhalterKontext = () => buildGrzContext(platzhalterProjekt(), new Date(2026, 10, 16));
