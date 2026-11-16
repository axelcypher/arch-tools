import { computeProject } from '@core/calc';
import { rectPoints } from '@core/geometry';
import type { Storey } from '@core/model';
import { createOutline, createProject, createRoom, createStorey } from '@core/model';
import { defaultDach } from '@core/roof';
import { buildExportContext } from './exportData';

/**
 * Erfundene Beispieldaten der Platzhalter-Referenz (Beschreibung in QUADRIO_SCHEMA.beispieldaten) – nur für Tests:
 * Beispiele, Vollständigkeit, „Enthält“ und Filter laufen gegen den Kontext aus diesem Projekt.
 */
export function platzhalterProjekt() {
  const p = createProject('Musterhaus');
  p.meta.projektcode = '2417';
  p.meta.adresse = { strasse: 'Lindenweg 7a', plz: '59494', ort: 'Musterstadt' };
  const kg = p.storeys[0];
  kg.name = 'KG';
  kg.hoehe = 2.5;
  const eg = createStorey('EG', 2.75);
  const dg = createStorey('DG', 2.5);
  p.storeys.push(eg, dg);
  const raum = (
    st: Storey,
    nummer: string,
    name: string,
    w: number,
    h: number,
    art: { nutzung?: 'NUF1' | 'NUF7' | 'TF' | 'VF'; wohnung?: string; s?: boolean; abzug?: boolean; freisitz?: boolean; draussen?: boolean; nurWofl?: boolean; wofl?: boolean } = {},
  ) => {
    const r = createRoom(rectPoints({ x: 0, y: 0 }, { x: w, y: h }), nummer, name);
    r.nutzung = art.nutzung ?? 'NUF1';
    if (art.wohnung !== undefined || art.wofl) r.wofl = { kategorie: art.freisitz ? 'freisitz' : 'voll', wohnung: art.wohnung ?? '' };
    if (art.draussen) r.ausserhalbBgf = true;
    if (art.nurWofl) r.abzugArt = 'wofl';
    if (art.s) r.umschliessung = 'S';
    if (art.abzug) r.subtract = true;
    // Putzabzug 3 % nur im Wohnraum – zeigt den Unterschied zu *_roh
    if (nummer === '1.02') r.putzabzug = 3;
    st.shapes.push(r);
  };
  raum(kg, '0.01', 'Keller', 5, 4, { nutzung: 'NUF7' });
  raum(kg, '0.02', 'Heizung', 2, 2, { nutzung: 'TF' });
  raum(eg, '1.01', 'Flur', 2, 1.5, { nutzung: 'VF', wohnung: 'WE 1' });
  raum(eg, '1.02', 'Wohnen', 5, 4, { wohnung: 'WE 1' });
  raum(eg, '1.03', 'Loggia', 2, 1.5, { s: true, freisitz: true, wohnung: 'WE 1' });
  raum(eg, '1.04', 'Schacht', 0.5, 0.5, { abzug: true, wohnung: 'WE 1' });
  raum(eg, '1.05', 'Terrasse', 4, 2, { draussen: true, freisitz: true, wohnung: 'WE 1' });
  raum(eg, '1.06', 'Abstellraum', 2, 1, { nutzung: 'NUF7', s: true });
  raum(eg, '1.07', 'Treppe', 1, 2, { nutzung: 'VF', abzug: true, nurWofl: true, wohnung: 'WE 1' });
  raum(dg, '2.01', 'Zimmer', 3, 3, { wohnung: 'WE 2' });
  raum(dg, '2.02', 'Bad', 2, 2, { wofl: true });
  kg.shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 }), 'Keller'));
  eg.shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 }), 'Haus'));
  const loggia = createOutline(rectPoints({ x: 0, y: 8 }, { x: 4, y: 9.5 }), 'Loggia');
  loggia.umschliessung = 'S';
  const aussparung = createOutline(rectPoints({ x: 0, y: 0 }, { x: 1, y: 1 }), 'Aussparung');
  aussparung.subtract = true;
  eg.shapes.push(loggia, aussparung);
  const dach = createOutline(rectPoints({ x: 0, y: 0 }, { x: 12, y: 10 }), 'Dach');
  dach.dach = { ...defaultDach('walm', 0), neigung: 45, neigungWalm: 45, gauben: [{ typ: 'schlepp', seite: 0, abstand: 3.9, breite: 4, vorne: 0.5, tiefe: 3, neigung: 25 }] };
  dg.shapes.push(dach);
  return p;
}

export function platzhalterKontext() {
  const p = platzhalterProjekt();
  return buildExportContext(p, computeProject(p), new Date(2026, 10, 16));
}
