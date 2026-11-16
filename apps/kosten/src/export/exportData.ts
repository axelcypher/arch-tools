import type { ExportContext, Row, Value } from '@core/excel/context';
import { projektWerte } from '@core/excel/projekt';
import type { Project } from '@core/model';
import { istRisiko, kg1, kgName } from '../din276';
import type { Ergebnis } from '../kosten';
import { berechne, bezugLabel, HAFTUNG, katalogText } from '../kosten';
import { istSpaeteStufe, ohneBandbreite, SPAETE_STUFE_HINWEIS, STUFEN, stufeLabel, stufeVon } from '../stufen';
import { MENGEN_BEZUEGE, MENGEN_INFO } from '../mengen';
import { datumAnzeige as datum } from '../datum';

/**
 * Datengrundlage für Excel-Export und Vorlagen der Kostenermittlung (Syntax siehe docs/excel-vorlagen.md; jeder
 * Platzhalter ist in platzhalterSchema.ts beschrieben – der Vollständigkeitstest verlangt das für jeden neuen Schlüssel).
 *
 *   {{gesamt.brutto}}                       Einzelwert
 *   {{#kg}} … {{/kg}}                       Zeilenblock je Kostengruppe der 1. Ebene
 *   {{position[aktiv].kosten}}              Zeile je Position – im Block nur die der Kostengruppe
 *   {{mengen.bgf}} / {{menge.label}}        Einzelwert bzw. Zeile je Menge
 */

const r0 = (v: number) => Math.round(v);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
/** Schlüssel der Zeile „Kostenrisiken“ im Block #kg (zählt zu keiner Kostengruppe) */
const RISIKO = 'risiko';

function zugehoerig(child: string, row: Row, parent: string, p: Row): boolean {
  if (parent === 'kg' && (child === 'position' || child === 'kg2')) return row._kg1 === (p._key ?? p.kg);
  if (parent === 'kg2' && child === 'position') return row._kg2 === p.kg;
  return true;
}

const FILTERS: Record<string, (r: Row) => boolean> = {
  aktiv: (r) => r.aktiv === 'ja',
  aus: (r) => r.aktiv !== 'ja',
  festgelegt: (r) => r.festgelegt === 'ja',
};

export function buildKostenContext(project: Project, date = new Date(), e: Ergebnis = berechne(project)): ExportContext {
  const k = project.kosten;
  const stufe = STUFEN.find((s) => s.id === stufeVon(k?.stufe))!;
  // Kostenfeststellung: tatsächliche Kosten ohne Bandbreite – von und bis gleich dem Wert
  const ohne = ohneBandbreite(k?.stufe);
  const sp = (s: [number, number, number]): [number, number, number] => (ohne ? [s[1], s[1], s[1]] : s);
  const spanne = (name: string, s0: [number, number, number]): Record<string, Value> => {
    const s = sp(s0);
    return { [name]: r0(s[1]), [`${name}.von`]: r0(s[0]), [`${name}.bis`]: r0(s[2]) };
  };
  const scalars: Record<string, Value> = {
    ...projektWerte(project, date),
    stufe: stufeLabel(k?.stufe),
    'stufe.lph': stufe.lph,
    'stufe.hinweis': istSpaeteStufe(k?.stufe) ? SPAETE_STUFE_HINWEIS : '',
    preisstand: k?.datum ? datum(k.datum) : '',
    katalog: katalogText(k?.katalog),
    'katalog.name': k?.katalog?.name ?? '',
    'katalog.quelle': k?.katalog?.quelle ?? '',
    'katalog.stand': k?.katalog?.stand ?? '',
    'index.basis': k?.indexBasis ?? '',
    'index.aktuell': k?.indexAktuell ?? '',
    regionalfaktor: k?.regionalfaktor ?? 1,
    faktor: r4(e.faktor),
    mwst: e.mwst,
    ...spanne('risiko', e.risiko),
    ...spanne('gesamt.netto', e.gesamtNetto),
    ...spanne('gesamt.brutto', e.gesamtBrutto),
    'gesamt.mwst': r0(e.gesamtBrutto[1] - e.gesamtNetto[1]),
    hinweise: e.hinweise.join('\n'),
    haftung: HAFTUNG,
  };
  for (const b of MENGEN_BEZUEGE) scalars[`mengen.${b}`] = e.mengen[b].wert;
  // Kennwerte ohne Bezugsmenge bleiben leer (statt als unbekannter Platzhalter stehen zu bleiben)
  for (const b of ['bgf', 'bri', 'nuf', 'wofl']) {
    const kw = e.kennwerte.find((x) => x.kurz.toLowerCase() === b);
    const key = `kennwert.${b}`;
    scalars[key] = kw ? r0(kw.wert[1]) : '';
    scalars[`${key}.von`] = kw ? r0(kw.wert[0]) : '';
    scalars[`${key}.bis`] = kw ? r0(kw.wert[2]) : '';
  }
  for (const s of e.summen) Object.assign(scalars, spanne(`kg${s.kg}`, s.summe));

  const zeileKg = (kg: string, name: string, s0: [number, number, number]): Row => {
    const s = sp(s0);
    return { kg, name, von: r0(s[0]), mittel: r0(s[1]), bis: r0(s[2]) };
  };
  const kg: Row[] = e.summen.filter((s) => s.ebene === 1).map((s) => zeileKg(s.kg, s.name, s.summe));
  // Kostenrisiken als eigene Zeile nach den Kostengruppen – so enthält die Summe des Blocks das Gesamt netto
  if (e.positionen.some((x) => x.aktiv && istRisiko(x.pos.kg))) kg.push({ ...zeileKg('', 'Kostenrisiken', e.risiko), _key: RISIKO });
  const kg2: Row[] = e.summen
    .filter((s) => s.ebene === 2)
    .map((s) => ({ _kg1: kg1(s.kg), ...zeileKg(s.kg, s.name, s.summe) }));
  const position: Row[] = e.positionen.map((x, i) => ({
    _kg1: istRisiko(x.pos.kg) ? RISIKO : kg1(x.pos.kg),
    _kg2: istRisiko(x.pos.kg) ? '' : x.pos.kg[1] !== '0' ? `${x.pos.kg.slice(0, 2)}0` : '',
    nr: i + 1,
    kg: istRisiko(x.pos.kg) ? '' : x.pos.kg,
    kg_name: istRisiko(x.pos.kg) ? 'Kostenrisiken' : kgName(x.pos.kg),
    bezeichnung: x.pos.bezeichnung,
    bezug: bezugLabel(x.pos),
    menge: x.pos.bezug === 'prozent' ? r0(x.menge) : r2(x.menge),
    einheit: x.pos.bezug === 'prozent' ? '€' : x.einheit,
    kennwert: r2(x.kennwert[1]),
    kennwert_von: r2(x.kennwert[0]),
    kennwert_bis: r2(x.kennwert[2]),
    kosten: r0(x.kosten[1]),
    kosten_von: r0(sp(x.kosten)[0]),
    kosten_bis: r0(sp(x.kosten)[2]),
    aktiv: x.aktiv ? 'ja' : '',
    quelle: x.pos.quelle ?? '',
    bemerkung: x.pos.bemerkung ?? '',
    hinweis: x.hinweis ?? '',
  }));
  const menge: Row[] = MENGEN_BEZUEGE.map((b) => ({
    kurz: MENGEN_INFO[b].kurz,
    label: MENGEN_INFO[b].label,
    wert: e.mengen[b].wert,
    einheit: MENGEN_INFO[b].einheit,
    ermittlung: e.mengen[b].festgelegt ? 'festgelegt' : MENGEN_INFO[b].ermittlung,
    festgelegt: e.mengen[b].festgelegt ? 'ja' : '',
  }));
  const stand: Row[] = (k?.staende ?? []).map((s, i) => ({
    nr: i + 1,
    datum: datum(s.datum),
    stufe: stufeLabel(s.stufe),
    bemerkung: s.bemerkung,
    netto: r0(s.gesamtNetto[1]),
    brutto: r0(s.gesamtBrutto[1]),
    brutto_von: r0(s.gesamtBrutto[0]),
    brutto_bis: r0(s.gesamtBrutto[2]),
  }));
  const hinweis: Row[] = e.hinweise.map((text, i) => ({ nr: i + 1, text }));

  return {
    scalars,
    collections: { kg, kg2, position, menge, stand, hinweis },
    byName: { kg: new Map(kg.map((r) => [String(r.kg), r])) },
    filters: FILTERS,
    belongsTo: zugehoerig,
  };
}

