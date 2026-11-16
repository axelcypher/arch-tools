import type { PlatzhalterSchema } from './schema';
import type { ExportContext, Row } from './context';

/**
 * Erfundene Beispieldaten für die Beispiele der gemeinsamen Vorlagen-Syntax (kern.ts) – nur für Tests und die
 * Ergebnisse der Beispiele; die Beschreibung steht in KERN_BEISPIELDATEN.
 */
export function kernBeispielKontext(): ExportContext {
  const geschoss: Row[] = [
    { _id: 'eg', nr: 1, name: 'EG', wofl: 21 },
    { _id: 'og', nr: 2, name: 'OG', wofl: 6 },
    { _id: 'dg', nr: 3, name: 'DG', wofl: 0 },
  ];
  const r = (g: string, nr: number, name: string, flaeche: number, wofl: boolean): Row => ({
    _geschossId: g.toLowerCase(),
    nr,
    geschoss: g,
    name,
    flaeche,
    wohnflaeche: wofl ? 'ja' : '',
  });
  const raum: Row[] = [r('EG', 1, 'Flur', 3, true), r('EG', 2, 'Küche', 18, true), r('EG', 3, 'Abstellraum', 2, false), r('OG', 4, 'Bad', 6, true), r('DG', 5, 'Spitzboden', 10, false)];
  return {
    scalars: { 'projekt.name': 'Musterhaus', 'summe.wofl': 27, 'summe.flaeche': 39, 'DATUM.iso': '2026-11-16' },
    collections: { geschoss, raum },
    byName: { geschoss: new Map(geschoss.map((g) => [String(g.name), g])) },
    filters: { wofl: (x) => x.wohnflaeche === 'ja', nebenflaeche: (x) => x.wohnflaeche !== 'ja' },
    belongsTo: (child, row, parent, p) => {
      if (parent === 'geschoss' && child === 'raum') return row._geschossId === p._id;
      if (parent === 'raum' && child === 'geschoss') return row._id === p._geschossId;
      return true;
    },
  };
}

/** Schema zu den Beispieldaten – für die Vorlagenprüfung („Filter gehört zu raum“) */
export function kernBeispielSchema(): PlatzhalterSchema {
  const feld = (name: string) => ({ name, text: name });
  return {
    app: 'Beispiel',
    beispieldaten: '',
    abschnitte: [
      {
        art: 'sammlung',
        name: 'geschoss',
        titel: 'Geschosse',
        datensatz: 'je Geschoss',
        text: '',
        felder: ['nr', 'name', 'wofl'].map(feld),
        filter: [],
        enthaelt: [{ sammlung: 'raum', text: '' }],
        beispiele: [],
      },
      {
        art: 'sammlung',
        name: 'raum',
        titel: 'Räume',
        datensatz: 'je Raum',
        text: '',
        felder: ['nr', 'geschoss', 'name', 'flaeche', 'wohnflaeche'].map(feld),
        filter: [
          { name: 'wofl', text: '' },
          { name: 'nebenflaeche', text: '' },
        ],
        enthaelt: [{ sammlung: 'geschoss', text: '' }],
        beispiele: [],
      },
    ],
  };
}
