import type { AreaTotals, ProjectResult } from '@core/calc';
import { outlineVolume, raumBodenVersatz } from '@core/calc';
import { polygonArea } from '@core/geometry';
import type { OutlineShape, Project } from '@core/model';
import { istDachgeschoss } from '@core/model';
import { projektWerte } from '@core/excel/projekt';
import { MASSGRUNDLAGEN, NUF_IDS, NUTZUNGSGRUPPEN, nutzungInfo, WOFL_KATEGORIEN, ZWEITE_BV_KURZ } from '@core/norms';
import { briKoerper, briRechenweg, rechteckMasse } from '@core/rechenweg';
import { planungsunterlagen, statistik } from './bericht';
import { gueltigesKontrollmass, kontrollText } from './background';
import type { ExportContext, Row, Value } from '@core/excel/context';

/**
 * Datengrundlage für Excel-Export und Vorlagen (Syntax siehe docs/excel-vorlagen.md; jeder Platzhalter ist in
 * platzhalterSchema.ts beschrieben – der Vollständigkeitstest verlangt das für jeden neuen Schlüssel).
 *
 *   {{projekt.name}}              Einzelwert
 *   {{summe.bgf}}                 Projektsumme
 *   {{geschoss:EG.bgf}}           Wert eines bestimmten Geschosses (über den Namen)
 *   {{raum.flaeche}}              Zeile wird je Raum wiederholt (ebenso geschoss, bgf, wohnung, nutzung, bri, koerper)
 *   {{raum[wofl].name}}           mit Filter (hier: nur Räume mit Wohnflächenanrechnung)
 *   {{#geschoss}} … {{/geschoss}} Zeilenblock je Geschoss; raum-/bgf-/bri-Zeilen darin nur für dieses Geschoss
 *   {{#wenn raum[wofl]}} … {{/wenn}} Zeilen nur, wenn die Bedingung zutrifft ({{#wenn !…}}: nur, wenn nicht)
 *   {{geschoss.name|einmal}}      nur in der ersten Zeile der jeweiligen Wiederholung
 */

export type { ExportContext, Row, Value } from '@core/excel/context';
export { hasPlaceholder, repeatCollection, resolveText, shiftFormulaForInsert, shiftRelativeRows } from '@core/excel/context';

export const COLLECTIONS = ['geschoss', 'raum', 'bgf', 'wohnung', 'nutzung', 'bri', 'koerper'] as const;
export type Collection = (typeof COLLECTIONS)[number];

/** Kontext von QUADRIO: alle Sammlungen sind immer vorhanden */
export type FlaechenContext = ExportContext & { collections: Record<Collection, Row[]> };

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

/** Fläche eines Raums für die Summen nach DIN 277 (ungerundet) */
interface RaumFlaeche {
  storeyId: string;
  /** Nutzungsgruppe; leer, wenn der Raum nicht zur NRF zählt (außerhalb der BGF, Abzug nur der Wohnfläche) */
  gruppe: string;
  rs: 'R' | 'S';
  flaeche: number;
  roh: number;
}

/** Grundgrößen der Summen nach Nutzungsgruppen: Name → Gruppen (hnf/nnf: Altnamen nach DIN 277-2:2005) */
export const SUMMEN_GRUNDGROESSEN: [string, (g: string) => boolean][] = [
  ['nuf', (g) => g.startsWith('NUF')],
  ...NUF_IDS.map((id, i): [string, (g: string) => boolean] => [`nuf${i + 1}`, (g) => g === id]),
  ['hnf', (g) => g.startsWith('NUF') && g !== 'NUF7'],
  ['nnf', (g) => g === 'NUF7'],
  ['tf', (g) => g === 'TF'],
  ['vf', (g) => g === 'VF'],
  ['nrf', (g) => g !== ''],
];

/**
 * Summen nach Nutzungsgruppe, Raumumschließung (_r, _s) und ohne Putzabzug (_roh) aus den Räumen, z. B. nnf_s_roh;
 * KGF ohne Putzabzug = BGF − NRF ohne Putzabzug. Vorhandene Schlüssel (aus der Berechnung) bleiben unverändert.
 */
function rsSummen(t: AreaTotals, raeume: RaumFlaeche[], row: Row) {
  for (const [name, passt] of SUMMEN_GRUNDGROESSEN)
    for (const rs of ['', '_r', '_s'] as const)
      for (const roh of ['', '_roh'] as const) {
        const key = `${name}${rs}${roh}`;
        if (key in row) continue;
        const v = raeume.filter((r) => r.gruppe && passt(r.gruppe) && (!rs || r.rs === rs.slice(1).toUpperCase())).reduce((a, r) => a + (roh ? r.roh : r.flaeche), 0);
        row[key] = r2(v);
      }
  const nrfRoh = (rs?: 'R' | 'S') => raeume.filter((r) => r.gruppe && (!rs || r.rs === rs)).reduce((a, r) => a + r.roh, 0);
  row.kgf_roh = r2(t.bgf.total - nrfRoh());
  row.kgf_r_roh = r2(t.bgf.R - nrfRoh('R'));
  row.kgf_s_roh = r2(t.bgf.S - nrfRoh('S'));
}

function totalsRow(t: AreaTotals, raeume: RaumFlaeche[]): Row {
  const row: Row = {
    bgf: r2(t.bgf.total),
    bgf_r: r2(t.bgf.R),
    bgf_s: r2(t.bgf.S),
    bri: r2(t.bri.total),
    bri_r: r2(t.bri.R),
    bri_s: r2(t.bri.S),
    nuf: r2(t.nuf.total),
    tf: r2(t.tf.total),
    vf: r2(t.vf.total),
    nrf: r2(t.nrf.total),
    nrf_r: r2(t.nrf.R),
    nrf_s: r2(t.nrf.S),
    kgf: r2(t.kgf.total),
    kgf_r: r2(t.kgf.R),
    kgf_s: r2(t.kgf.S),
    wofl: r2(t.wofl),
  };
  NUF_IDS.forEach((id, i) => (row[`nuf${i + 1}`] = r2(t.nutzung[id])));
  rsSummen(t, raeume, row);
  return row;
}

export function buildExportContext(project: Project, result: ProjectResult, date = new Date()): FlaechenContext {
  const scalars: Record<string, Value> = projektWerte(project, date);
  // Maßgrundlage und Normausgaben für den Kopf (FR-05)
  scalars['projekt.massgrundlage'] = MASSGRUNDLAGEN.find((m) => m.id === project.settings.massgrundlage)?.label ?? '';
  scalars['projekt.massgrundlage_text'] = MASSGRUNDLAGEN.find((m) => m.id === project.settings.massgrundlage)?.text ?? '';
  scalars['projekt.normen'] = `${project.settings.zweiteBV ? `Wohnfläche: ${ZWEITE_BV_KURZ}` : 'Wohnfläche nach WoFlV vom 25.11.2003'}; Grundflächen und Rauminhalte nach DIN 277:2021-08`;
  scalars['projekt.planunterlagen'] = planungsunterlagen(project);
  // Kontrollmaß nach dem Kalibrieren (F-16), je Geschoss mit Plan
  scalars['projekt.kontrollmass'] = project.storeys
    .flatMap((s) => {
      const k = gueltigesKontrollmass(project, s);
      return k ? [`${s.name}: ${kontrollText(k)}`] : [];
    })
    .join('; ');

  const shapesById = new Map(project.storeys.flatMap((st) => st.shapes.map((sh) => [sh.id, sh] as const)));
  // Geschossart: „ja“ bei Dachgeschossen – für Filter [dg] / [normal] in allen Sammlungen
  const dg = new Map(project.storeys.map((st) => [st.id, istDachgeschoss(st) ? 'ja' : ''] as const));
  // je Raum einmal: ungerundete Fläche ohne Putzabzug und Nutzungsgruppe für die Summen nach R/S – NRF wie in der
  // Berechnung: ohne Räume außerhalb der BGF und ohne Abzugsflächen, die nur die Wohnfläche mindern
  const flaechen: RaumFlaeche[] = result.storeys.flatMap((s) =>
    s.rooms.map((r) => {
      const sh = shapesById.get(r.shapeId);
      return {
        storeyId: s.storeyId,
        gruppe: r.ausserhalbBgf || r.abzugArt === 'wofl' ? '' : r.nutzung,
        rs: r.umschliessung,
        flaeche: r.area,
        roh: (sh ? polygonArea(sh.points) : Math.abs(r.area)) * (r.subtract ? -1 : 1),
      };
    }),
  );
  let i = 0;
  let nr = 0;
  const raum: Row[] = result.storeys.flatMap((s) =>
    s.rooms.map((r) => {
      const sh = shapesById.get(r.shapeId);
      // Räume in derselben Reihenfolge wie flaechen
      const roh = flaechen[i++].roh;
      const wofl = r.woflKategorie !== 'keine';
      return {
        _geschossId: s.storeyId,
        _wofl: r.woflKategorie,
        nr: ++nr,
        geschoss: r.storeyName,
        dachgeschoss: dg.get(s.storeyId) ?? '',
        nummer: r.nummer,
        name: r.name,
        // außerhalb der BGF (ebenerdige Terrasse): keine Nutzungsgruppe der NRF, nur Wohnfläche
        nutzung: r.ausserhalbBgf ? '' : nutzungInfo(r.nutzung).kurz,
        nutzung_text: r.ausserhalbBgf ? 'außerhalb der BGF' : nutzungInfo(r.nutzung).label,
        umschliessung: r.ausserhalbBgf ? '' : r.umschliessung,
        ausserhalb_bgf: r.ausserhalbBgf ? 'ja' : '',
        flaeche: r2(r.area),
        flaeche_roh: r2(roh),
        putzabzug: sh?.kind === 'room' && sh.putzabzug ? sh.putzabzug : '',
        hoehenlage: (() => {
          // auch die vom Umriss geerbte Höhenlage; leer auf Geschossniveau
          const st = project.storeys.find((x) => x.id === s.storeyId);
          const v = sh?.kind === 'room' && st ? raumBodenVersatz(sh, st) : 0;
          return v ? r3(v) : '';
        })(),
        wohnflaeche: wofl ? 'ja' : '',
        wofl_kategorie: wofl ? (WOFL_KATEGORIEN.find((k) => k.id === r.woflKategorie)?.label ?? '') : '',
        wofl_faktor: wofl ? r2(r.woflFaktor) : '',
        // Raumteile nach lichter Höhe (FR-12): Teilflächen in m², Summe = Raumfläche
        teil_h2: r.woflAnteile ? r2(Math.abs(r.area) * r.woflAnteile.h2) : '',
        teil_h12: r.woflAnteile ? r2(Math.abs(r.area) * r.woflAnteile.h12) : '',
        teil_h01: r.woflAnteile ? r2(Math.abs(r.area) * r.woflAnteile.h01) : '',
        wofl: wofl ? r2(r.woflArea) : '',
        wofl_roh: wofl ? r2(roh * r.woflFaktor) : '',
        wohnung: r.wohnung,
        abzug: r.subtract ? 'Abzug' : '',
        bemerkung: sh?.bemerkung ?? '',
      };
    }),
  );

  const sumBy = (rows: Row[], key: string) => r2(rows.reduce((a, x) => a + (typeof x[key] === 'number' ? (x[key] as number) : 0), 0));

  const geschoss: Row[] = result.storeys.map((s, i) => {
    const rooms = raum.filter((r) => r._geschossId === s.storeyId);
    return {
      _id: s.storeyId,
      nr: i + 1,
      name: s.name,
      dachgeschoss: dg.get(s.storeyId) ?? '',
      art: dg.get(s.storeyId) ? 'Dachgeschoss' : 'Normalgeschoss',
      hoehe: r2(s.hoehe),
      sohle: (() => {
        const st = project.storeys.find((x) => x.id === s.storeyId);
        return st?.sohle ? r3(st.sohle) : '';
      })(),
      anzahl_raeume: s.rooms.length,
      ...totalsRow(s, flaechen.filter((f) => f.storeyId === s.storeyId)),
      wofl_roh: sumBy(rooms, 'wofl_roh'),
      nebenflaeche: sumBy(rooms.filter((r) => !r.wohnflaeche), 'flaeche'),
    };
  });

  // BGF-Teilflächen: je Umriss eine Zeile (Abzugsflächen negativ)
  const bgf: Row[] = project.storeys.flatMap((st) => {
    let n = 0;
    return st.shapes
      .filter((s): s is OutlineShape => s.kind === 'outline' && s.points.length >= 3)
      .map((s) => {
        const sign = s.subtract ? -1 : 1;
        const a = r2(sign * polygonArea(s.points));
        const m = rechteckMasse(s.points);
        return {
          _geschossId: st.id,
          _id: s.id,
          nr: ++n,
          geschoss: st.name,
          dachgeschoss: dg.get(st.id) ?? '',
          name: s.name,
          umschliessung: s.umschliessung,
          flaeche: a,
          bgf_r: s.umschliessung === 'R' ? a : '',
          bgf_s: s.umschliessung === 'S' ? a : '',
          laenge: m ? r3(m.laenge) : '',
          breite: m ? r3(m.breite) : '',
          bri: r2(sign * outlineVolume(s, st, project)),
          hoehenlage: s.versatz ? r3(s.versatz) : '',
          abzug: s.subtract ? 'Abzug' : '',
          bemerkung: s.bemerkung ?? '',
        };
      });
  });

  const sum = totalsRow(result.total, flaechen);
  sum.anzahl_raeume = raum.length;
  sum.wofl_roh = sumBy(raum, 'wofl_roh');
  sum.nebenflaeche = sumBy(raum.filter((r) => !r.wohnflaeche), 'flaeche');
  for (const [k, v] of Object.entries(sum)) scalars[`summe.${k}`] = v;

  const stat = statistik(result);
  scalars['statistik.wohnungen'] = stat.wohnungen.length;
  scalars['statistik.raeume'] = stat.wohnungen.reduce((a, w) => a + w.raeume, 0);
  scalars['statistik.sonstige_nutzflaeche'] = r2(stat.sonstigeNutzflaeche);
  const wohnung: Row[] = result.wohnungen.map((w, i) => ({
    nr: i + 1,
    name: w.wohnung,
    anzahl_raeume: w.rooms.length,
    raeume_statistik: stat.wohnungen[i]?.raeume ?? 0,
    grundflaeche: r2(w.grundflaeche),
    wofl: r2(w.wofl),
  }));

  const nutzung: Row[] = NUTZUNGSGRUPPEN.map((n) => ({ gruppe: n.kurz, bezeichnung: n.label, flaeche: r2(result.total.nutzung[n.id]) }));

  const bri: Row[] = briRechenweg(project).map((b) => ({
    _geschossId: b.geschossId,
    _umrissId: b.umrissId,
    geschoss: b.geschoss,
    dachgeschoss: dg.get(b.geschossId) ?? '',
    umriss: b.umriss,
    umschliessung: b.umschliessung,
    nr: b.nr,
    bezeichnung: b.bezeichnung,
    anzahl: b.anzahl,
    laenge: b.laenge !== undefined ? r3(b.laenge) : '',
    breite: b.breite !== undefined ? r3(b.breite) : '',
    flaeche: r3(b.flaeche),
    hoehe: r3(b.hoehe),
    faktor: r6(b.faktor),
    volumen: r2(b.volumen),
    formel: b.formel,
    unterbau: b.unterbau === 'sohle' ? 'Bodenplatte' : b.unterbau ? 'Split-Level' : '',
  }));

  const koerper: Row[] = briKoerper(project).map((k) => ({
    _geschossId: k.geschossId,
    _umrissId: k.umrissId,
    geschoss: k.geschoss,
    dachgeschoss: dg.get(k.geschossId) ?? '',
    umriss: k.umriss,
    umschliessung: k.umschliessung,
    nr: k.nr,
    art: k.art === 'dach' ? 'Dach' : k.art === 'gaube' ? 'Gaube' : 'Grundkörper',
    bezeichnung: k.bezeichnung,
    parameter: k.parameter,
    formel: k.formel,
    rechnung: k.rechnung,
    flaeche: r2(k.flaeche),
    hoehe: r3(k.hoehe),
    laenge: k.laenge !== undefined ? r3(k.laenge) : '',
    breite: k.breite !== undefined ? r3(k.breite) : '',
    neigung: k.neigung !== undefined ? r2(k.neigung) : '',
    volumen: r2(k.volumen),
    bemerkung: k.bemerkung ?? '',
  }));

  return {
    scalars,
    collections: { geschoss, raum, bgf, wohnung, nutzung, bri, koerper },
    byName: {
      geschoss: new Map(geschoss.map((g) => [String(g.name), g])),
      wohnung: new Map(wohnung.map((w) => [String(w.name), w])),
    },
    filters: NAMED_FILTERS,
    belongsTo: zugehoerig,
  };
}

/* ---------- Filter ---------- */

const NUF_HNF = new Set(['NUF 1', 'NUF 2', 'NUF 3', 'NUF 4', 'NUF 5', 'NUF 6']);

/** vordefinierte Filter; sonst „feld=wert“, „feld>wert“ … */
const NAMED_FILTERS: Record<string, (r: Row) => boolean> = {
  wofl: (r) => r.wohnflaeche === 'ja',
  wohnflaeche: (r) => r.wohnflaeche === 'ja',
  'wohnfläche': (r) => r.wohnflaeche === 'ja',
  nebenflaeche: (r) => r.wohnflaeche !== 'ja',
  'nebenfläche': (r) => r.wohnflaeche !== 'ja',
  nuf: (r) => String(r.nutzung).startsWith('NUF'),
  tf: (r) => String(r.nutzung).startsWith('TF'),
  vf: (r) => String(r.nutzung).startsWith('VF'),
  hnf: (r) => NUF_HNF.has(String(r.nutzung)),
  freisitz: (r) => r._wofl === 'freisitz',
  freisitze: (r) => r._wofl === 'freisitz',
  nnf: (r) => r.nutzung === 'NUF 7',
  r: (r) => r.umschliessung === 'R',
  s: (r) => r.umschliessung === 'S',
  abzug: (r) => r.abzug === 'Abzug',
  dg: (r) => r.dachgeschoss === 'ja',
  dachgeschoss: (r) => r.dachgeschoss === 'ja',
  normal: (r) => r.dachgeschoss !== 'ja',
  normalgeschoss: (r) => r.dachgeschoss !== 'ja',
  dach: (r) => r.art === 'Dach',
  gaube: (r) => r.art === 'Gaube',
  gauben: (r) => r.art === 'Gaube',
  grundkoerper: (r) => r.art === 'Grundkörper',
  'grundkörper': (r) => r.art === 'Grundkörper',
};

/** Name der Wohnung eines Raums wie in der Berechnung: Wohnflächen ohne Zuordnung unter „(ohne Zuordnung)“ */
const OHNE_ZUORDNUNG = '(ohne Zuordnung)';
const wohnungVon = (r: Row) => (r.wohnung ? r.wohnung : r.wohnflaeche === 'ja' ? OHNE_ZUORDNUNG : '');

/** Wie hängen Sammlungen in Blöcken zusammen? (Kind-Datensatz passt zum gebundenen Eltern-Datensatz) */
function zugehoerig(child: string, row: Row, parent: string, p: Row, ctx: ExportContext): boolean {
  const raeume = ctx.collections.raum ?? [];
  if (parent === 'geschoss') {
    if (child === 'raum' || child === 'bgf' || child === 'bri' || child === 'koerper') return row._geschossId === p._id;
    if (child === 'wohnung') return raeume.some((r) => r._geschossId === p._id && wohnungVon(r) === row.name);
  }
  if (parent === 'wohnung') {
    if (child === 'raum') return wohnungVon(row) === p.name;
    if (child === 'geschoss') return raeume.some((r) => r._geschossId === row._id && wohnungVon(r) === p.name);
  }
  if (parent === 'nutzung' && child === 'raum') return row.nutzung === p.gruppe;
  if (parent === 'bgf') {
    // Körper dieser Teilfläche; Räume des Geschosses (ohne Zuordnung zu einzelnen Teilflächen)
    if (child === 'bri' || child === 'koerper') return row._umrissId === p._id;
    if (child === 'raum') return row._geschossId === p._geschossId;
  }
  if (child === 'bgf' && (parent === 'bri' || parent === 'koerper')) return row._id === p._umrissId;
  if ((parent === 'raum' || parent === 'bgf' || parent === 'bri' || parent === 'koerper') && child === 'geschoss') return row._id === p._geschossId;
  return true;
}
