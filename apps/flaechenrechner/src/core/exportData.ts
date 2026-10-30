import type { AreaTotals, ProjectResult } from '@core/calc';
import { outlineVolume, raumBodenVersatz } from '@core/calc';
import { polygonArea } from '@core/geometry';
import type { OutlineShape, Project } from '@core/model';
import { istDachgeschoss } from '@core/model';
import { PROJEKT_DOCS, projektWerte } from '@core/excel/projekt';
import { NUF_IDS, NUTZUNGSGRUPPEN, nutzungInfo, WOFL_KATEGORIEN } from '@core/norms';
import { briKoerper, briRechenweg, rechteckMasse } from '@core/rechenweg';
import type { ExportContext, PlaceholderDocs, Row, Value } from '@core/excel/context';

/**
 * Datengrundlage für Excel-Export und Vorlagen (Syntax siehe docs/excel-vorlagen.md).
 *
 *   {{projekt.name}}              Einzelwert
 *   {{summe.bgf}}                 Projektsumme
 *   {{geschoss:EG.bgf}}           Wert eines bestimmten Geschosses (über den Namen)
 *   {{raum.flaeche}}              Zeile wird je Raum wiederholt (ebenso geschoss, bgf, wohnung, nutzung, bri, koerper)
 *   {{raum[wofl].name}}           mit Filter (hier: nur Räume mit Wohnflächenanrechnung)
 *   {{#geschoss}} … {{/geschoss}} Zeilenblock je Geschoss; raum-/bgf-/bri-Zeilen darin nur für dieses Geschoss
 *   {{geschoss.name|einmal}}      nur in der ersten Zeile der jeweiligen Wiederholung
 */

export type { ExportContext, Row, Value } from '@core/excel/context';
export { hasPlaceholder, repeatCollection, resolveText, shiftFormulaForInsert, shiftRelativeRows } from '@core/excel/context';

export const COLLECTIONS = ['geschoss', 'raum', 'bgf', 'wohnung', 'nutzung', 'bri', 'koerper'] as const;
export type Collection = (typeof COLLECTIONS)[number];

/** Kontext des Flächenrechners: alle Sammlungen sind immer vorhanden */
export type FlaechenContext = ExportContext & { collections: Record<Collection, Row[]> };

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

function totalsRow(t: AreaTotals): Row {
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
    wofl: r2(t.wofl),
  };
  NUF_IDS.forEach((id, i) => (row[`nuf${i + 1}`] = r2(t.nutzung[id])));
  return row;
}

export function buildExportContext(project: Project, result: ProjectResult, date = new Date()): FlaechenContext {
  const scalars: Record<string, Value> = projektWerte(project, date);

  const shapesById = new Map(project.storeys.flatMap((st) => st.shapes.map((sh) => [sh.id, sh] as const)));
  // Geschossart: „ja“ bei Dachgeschossen – für Filter [dg] / [normal] in allen Sammlungen
  const dg = new Map(project.storeys.map((st) => [st.id, istDachgeschoss(st) ? 'ja' : ''] as const));
  let nr = 0;
  const raum: Row[] = result.storeys.flatMap((s) =>
    s.rooms.map((r) => {
      const sh = shapesById.get(r.shapeId);
      const roh = (sh ? polygonArea(sh.points) : Math.abs(r.area)) * (r.subtract ? -1 : 1);
      const wofl = r.woflKategorie !== 'keine';
      return {
        _geschossId: s.storeyId,
        nr: ++nr,
        geschoss: r.storeyName,
        dachgeschoss: dg.get(s.storeyId) ?? '',
        nummer: r.nummer,
        name: r.name,
        nutzung: nutzungInfo(r.nutzung).kurz,
        nutzung_text: nutzungInfo(r.nutzung).label,
        umschliessung: r.umschliessung,
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
      ...totalsRow(s),
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

  const sum = totalsRow(result.total);
  sum.anzahl_raeume = raum.length;
  sum.wofl_roh = sumBy(raum, 'wofl_roh');
  sum.nebenflaeche = sumBy(raum.filter((r) => !r.wohnflaeche), 'flaeche');
  for (const [k, v] of Object.entries(sum)) scalars[`summe.${k}`] = v;

  const wohnung: Row[] = result.wohnungen.map((w, i) => ({
    nr: i + 1,
    name: w.wohnung,
    anzahl_raeume: w.rooms.length,
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

/** Beschreibung aller Platzhalter – Grundlage für Hilfe-Tabelle und Musterdatei. */
export const PLACEHOLDER_DOCS: PlaceholderDocs = [
  {
    group: 'Blöcke, Filter, Modifikatoren',
    keys: [
      ['#geschoss … /geschoss', 'Zeilenblock je Geschoss (Markierung in eigener Zeile oder in der ersten/letzten Blockzeile); ebenso #bgf, #wohnung, #nutzung, #raum, #koerper'],
      ['raum-/bgf-/bri-/koerper-Zeilen im Block', 'laufen nur über die Räume, BGF-Teilflächen bzw. Körper des aktuellen Geschosses (im #bgf-Block: bri/koerper dieser Teilfläche)'],
      ['leere Blöcke', 'entfallen: Wiederholungszeilen und innere Blöcke liefern nichts bzw. alle Zahlenwerte des Blocks sind 0'],
      ['#wenn … /wenn', 'Abschnitt einmal ausgeben, wenn die Bedingung zutrifft: {{#wenn raum[nebenflaeche]}} (Datensätze vorhanden), {{#wenn summe.wofl}} (Wert nicht 0/leer), {{#wenn summe.wofl>100}} / {{#wenn raum[wofl]>=3}} (Vergleich, Anzahl), {{#wenn[nebenflaeche!=0]}} (Filter auf den umgebenden Datensatz, oben auf summe.*), {{#wenn !…}} umgekehrt; im Block je Datensatz'],
      ['raum[wofl] / raum[nebenflaeche]', 'Filter: Räume mit bzw. ohne Wohnflächenanrechnung'],
      ['raum[hnf] / raum[nnf] / [nuf] [tf] [vf]', 'Filter nach Nutzungsgruppe (HNF = NUF 1–6, NNF = NUF 7)'],
      ['geschoss[dg] / geschoss[normal]', 'Filter: Dachgeschosse bzw. Normalgeschosse (gilt ebenso für raum, bgf, bri, koerper)'],
      ['koerper[dach] / [gaube] / [grundkoerper]', 'Filter: Dachkörper, Gauben bzw. Grundkörper (Quader)'],
      ['[r] [s] [abzug] [feld=wert] [feld>wert] [!filter]', 'weitere Filter, mehrere mit Komma: raum[wofl,geschoss=EG], geschoss[wofl>0]; Vergleiche = != > < >= <= (leere Felder = 0)'],
      ['…|einmal', 'Wert nur in der ersten Zeile der Wiederholung, z. B. geschoss.name|einmal'],
    ],
  },
  PROJEKT_DOCS,
  {
    group: 'Kennwerte (summe.*, geschoss.*, geschoss:NAME.*)',
    keys: [
      ['bgf, bgf_r, bgf_s', 'Brutto-Grundfläche gesamt / Regelfall / Sonderfall [m²]'],
      ['bri, bri_r, bri_s', 'Brutto-Rauminhalt [m³]'],
      ['nuf, nuf1 … nuf7', 'Nutzungsfläche gesamt bzw. je Nutzungsgruppe [m²]'],
      ['tf, vf', 'Technikfläche, Verkehrsfläche [m²]'],
      ['nrf, nrf_r, nrf_s', 'Netto-Raumfläche [m²]'],
      ['kgf', 'Konstruktions-Grundfläche (BGF − NRF) [m²]'],
      ['wofl, wofl_roh', 'Wohnfläche nach WoFlV [m²] mit bzw. ohne Putzabzug der Räume'],
      ['nebenflaeche', 'Summe der Räume ohne Wohnflächenanrechnung [m²]'],
      ['anzahl_raeume', 'Anzahl Räume'],
      ['name, hoehe, nr', 'nur geschoss.*: Bezeichnung, Geschosshöhe, laufende Nr.'],
      ['sohle', 'nur geschoss.*: Bodenplatte UK Sohle bis Fußboden [m] (BRI ab Unterseite der Sohle)'],
      ['dachgeschoss, art', 'nur geschoss.*: „ja“ bei Dachgeschossen; „Dachgeschoss“ bzw. „Normalgeschoss“'],
    ],
  },
  {
    group: 'raum.* (Zeile je Raum)',
    keys: [
      ['raum.nr', 'laufende Nummer'],
      ['raum.geschoss', 'Geschoss'],
      ['raum.nummer', 'Raumnummer'],
      ['raum.name', 'Raumbezeichnung'],
      ['raum.nutzung', 'Nutzungsgruppe kurz (z. B. NUF 1)'],
      ['raum.nutzung_text', 'Nutzungsgruppe ausgeschrieben'],
      ['raum.umschliessung', 'R oder S'],
      ['raum.flaeche', 'Grundfläche [m²] abzüglich Putzabzug (Abzugsflächen negativ)'],
      ['raum.flaeche_roh', 'Grundfläche ohne Putzabzug [m²]'],
      ['raum.putzabzug', 'Putzabzug in %'],
      ['raum.hoehenlage', 'Höhenlage des Fußbodens gegenüber dem Geschoss [m] (Split-Level, negativ = tiefer)'],
      ['raum.wohnflaeche', '„ja“, wenn auf die Wohnfläche angerechnet'],
      ['raum.wofl_kategorie', 'Anrechnung nach WoFlV'],
      ['raum.wofl_faktor', 'Anrechnungsfaktor'],
      ['raum.wofl', 'anrechenbare Wohnfläche [m²]'],
      ['raum.wofl_roh', 'anrechenbare Wohnfläche ohne Putzabzug [m²] – wenn der Abzug in Excel gerechnet wird'],
      ['raum.wohnung', 'Wohnungszuordnung'],
      ['raum.abzug', '„Abzug“ bei Abzugsflächen, sonst leer'],
      ['raum.bemerkung', 'Bemerkung'],
    ],
  },
  {
    group: 'bgf.* (BGF-Teilflächen, Zeile je BGF-Umriss)',
    keys: [
      ['bgf.geschoss, bgf.nr', 'Geschoss, laufende Nummer im Geschoss'],
      ['bgf.name', 'Bezeichnung der Teilfläche (Name des BGF-Umrisses)'],
      ['bgf.umschliessung', 'R oder S'],
      ['bgf.flaeche', 'Fläche [m²] (negativ bei Abzugsflächen)'],
      ['bgf.bgf_r, bgf.bgf_s', 'Fläche im Regel- bzw. Sonderfall, sonst leer [m²]'],
      ['bgf.laenge, bgf.breite', 'Länge und Breite – bei rechteckigen Teilflächen [m]'],
      ['bgf.bri', 'Brutto-Rauminhalt der Teilfläche [m³]'],
      ['bgf.hoehenlage', 'Höhenversatz des Körpers gegenüber dem Geschoss [m], sonst leer'],
      ['bgf.abzug', '„Abzug“ bei Abzugsflächen, sonst leer'],
      ['bgf.bemerkung, bgf.dachgeschoss', 'Bemerkung; „ja“ im Dachgeschoss'],
      ['bgf[r] / bgf[s] / bgf[abzug] / bgf[!abzug]', 'Filter wie bei raum'],
    ],
  },
  {
    group: 'bri.* (Rechenweg Brutto-Rauminhalt, Zeile je Teilkörper)',
    keys: [
      ['bri.geschoss, bri.umriss, bri.nr', 'Geschoss, BGF-Umriss, laufende Nummer im Geschoss'],
      ['bri.bezeichnung', 'Teilkörper, z. B. „Satteldach: Dreiecksprisma“'],
      ['bri.anzahl', 'Anzahl gleicher Teilkörper (negativ bei Abzügen)'],
      ['bri.laenge, bri.breite', 'Länge (in Firstrichtung) und Breite – bei rechteckigen Grundflächen'],
      ['bri.flaeche', 'Grundfläche des Teilkörpers [m²]'],
      ['bri.hoehe', 'Höhe [m]'],
      ['bri.faktor', 'Formfaktor (1 Quader, 0,5 Prisma/Keil, 0,333 Pyramide …)'],
      ['bri.volumen', 'anzahl × flaeche × hoehe × faktor [m³]'],
      ['bri.formel', 'Rechenweg als Text, z. B. „12,00 × 9,00 × 3,151 × ½“'],
      ['bri.unterbau', '„Bodenplatte“ bzw. „Split-Level“ bei Teilen unter dem Geschossfußboden, sonst leer'],
    ],
  },
  {
    group: 'koerper.* (BRI mit geschlossenen Formeln, Zeile je Körper – Normalgeschosse Höhe × BGF, Dächer als ganzer Körper)',
    keys: [
      ['koerper.geschoss, koerper.umriss, koerper.nr', 'Geschoss, BGF-Umriss, laufende Nummer im Geschoss'],
      ['koerper.art', '„Grundkörper“ (Quader bis Geschosshöhe bzw. Traufe), „Dach“ oder „Gaube“'],
      ['koerper.bezeichnung', 'z. B. „Quader“, „Grundkörper bis Traufe“, „Walmdach“, „Schleppgaube“'],
      ['koerper.parameter', 'Maße als Text, z. B. „H: 5,375 m; B: 10,75 m; L: 12,00 m“'],
      ['koerper.formel', 'Formel mit Formelzeichen, z. B. „B × H × (3 × L − B) / 6“'],
      ['koerper.rechnung', 'Formel mit eingesetzten Werten, z. B. „10,75 × 5,38 × (3 × 12 − 10,75) / 6“'],
      ['koerper.flaeche', 'Grundfläche [m²] (negativ bei Abzugsflächen)'],
      ['koerper.hoehe', 'Höhe [m]: Grundkörper = Geschoss-/Traufhöhe, Dach = Höhe über Traufe, Gaube = Höhe der Vorderwand über der Dachfläche'],
      ['koerper.laenge, koerper.breite, koerper.neigung', 'Länge (Firstrichtung) bzw. Gaubenbreite, Breite bzw. Gaubentiefe [m], Dach-/Gaubenneigung [°]'],
      ['koerper.volumen', 'Volumen [m³]; Summe aller Körper = BRI'],
      ['koerper.dachgeschoss', '„ja“, wenn der Körper in einem Dachgeschoss liegt'],
    ],
  },
  {
    group: 'wohnung.* (Zeile je Wohnung) bzw. wohnung:NAME.*',
    keys: [
      ['wohnung.nr', 'laufende Nummer'],
      ['wohnung.name', 'Bezeichnung'],
      ['wohnung.anzahl_raeume', 'Anzahl Räume'],
      ['wohnung.grundflaeche', 'Summe Grundflächen [m²]'],
      ['wohnung.wofl', 'Wohnfläche [m²]'],
    ],
  },
  {
    group: 'nutzung.* (Zeile je Nutzungsgruppe)',
    keys: [
      ['nutzung.gruppe', 'Kürzel (NUF 1 … VF 9)'],
      ['nutzung.bezeichnung', 'Bezeichnung'],
      ['nutzung.flaeche', 'Fläche gesamt [m²]'],
    ],
  },
];

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

/** Wie hängen Sammlungen in Blöcken zusammen? (Kind-Datensatz passt zum gebundenen Eltern-Datensatz) */
function zugehoerig(child: string, row: Row, parent: string, p: Row, ctx: ExportContext): boolean {
  const raeume = ctx.collections.raum ?? [];
  if (parent === 'geschoss') {
    if (child === 'raum' || child === 'bgf' || child === 'bri' || child === 'koerper') return row._geschossId === p._id;
    if (child === 'wohnung') return raeume.some((r) => r._geschossId === p._id && r.wohnung === row.name);
  }
  if (parent === 'wohnung') {
    if (child === 'raum') return row.wohnung === p.name;
    if (child === 'geschoss') return raeume.some((r) => r._geschossId === row._id && r.wohnung === p.name);
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
