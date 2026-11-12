/**
 * GAEB DA XML 3.3 – der Austausch mit Bietern und anderer AVA-Software:
 *
 * - Export: X81 (Leistungsbeschreibung), X83 (Angebotsaufforderung, ohne Preise), X84 (Angebot mit den Preisen
 *   eines Bieters), X86 (Auftragserteilung mit den Preisen des Auftragnehmers).
 * - Import: Gliederung, Texte und Mengen jeder Phase als LV; Einheitspreise (X84/X86) als Preise eines Bieters,
 *   zugeordnet über die vollständige Ordnungszahl.
 *
 * Abgebildet werden Abschnitte (BoQCtgy), Positionen (Item: Menge, Einheit, Kurz- und Langtext, Bedarfs-,
 * Wahl- und Grundpositionen, Stundenlohn, Pauschale) und Hinweise (Remark). Texte als <p>/<span> mit fett,
 * kursiv, unterstrichen.
 */

import type { XmlElement } from '@core/dokumente/xml';
import { alleKinder, xmlLesen } from '@core/dokumente/xml';
import type { Absatz, Formattext, Lauf } from './rtf';
import { ersteZeile } from './rtf';
import type { Abschnitt, Bieter, Hinweis, Lv, LvElement, Position, PositionsArt } from '../lv/modell';
import { leeresLv, neueId, ozFormat } from '../lv/modell';

export type GaebPhase = 81 | 83 | 84 | 86;

export const GAEB_PHASEN: { dp: GaebPhase; name: string; text: string; preise: boolean }[] = [
  { dp: 81, name: 'X81 Leistungsbeschreibung', text: 'Texte und Mengen, ohne Preise', preise: false },
  { dp: 83, name: 'X83 Angebotsaufforderung', text: 'für die Bieter: ohne Preise, Preise werden angeboten', preise: false },
  { dp: 84, name: 'X84 Angebotsabgabe', text: 'mit den Preisen eines Bieters', preise: true },
  { dp: 86, name: 'X86 Auftragserteilung', text: 'mit den Preisen des Auftragnehmers', preise: true },
];

/* ---------- Schreiben ---------- */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const zahl = (n: number, stellen: number) => n.toFixed(stellen);

function laufXml(l: Lauf): string {
  const stil = [l.fett && 'font-weight:bold;', l.kursiv && 'font-style:italic;', l.unterstrichen && 'text-decoration:underline;'].filter(Boolean).join('');
  const t = l.text
    .split('\n')
    .map(esc)
    .join('<br/>')
    .replace(/\t/g, '&#9;');
  return stil ? `<span style="${stil}">${t}</span>` : `<span>${t}</span>`;
}

function textXml(f: Formattext): string {
  if (!f.length) return '<p><span></span></p>';
  return f.map((a) => `<p>${a.liste === 'punkt' ? '<span>• </span>' : ''}${a.laeufe.map(laufXml).join('') || '<span></span>'}</p>`).join('');
}

const kurzXml = (s: string) => `<p><span>${esc(s)}</span></p>`;

function beschreibung(kurz: string, lang: Formattext): string {
  return `<Description><CompleteText><DetailTxt><Text>${textXml(lang)}</Text></DetailTxt><OutlineText><OutlTxt><TextOutlTxt>${kurzXml(kurz)}</TextOutlTxt></OutlTxt></OutlineText></CompleteText></Description>`;
}

export interface GaebExport {
  dp: GaebPhase;
  /** Bieter, dessen Preise geschrieben werden (X84/X86) */
  bieterId?: number;
  projektNummer?: string;
  projektName?: string;
  /** Anschrift des Auftraggebers (mehrzeilig) */
  auftraggeber?: string;
  jetzt?: Date;
}

export function gaebSchreiben(lv: Lv, o: GaebExport): Uint8Array {
  const jetzt = o.jetzt ?? new Date();
  const mitPreisen = o.dp === 84 || o.dp === 86;
  const bieter = mitPreisen ? lv.bieter.find((b) => b.id === (o.bieterId ?? lv.auftrag?.bieterId ?? 0)) : undefined;
  let zaehler = 0;
  const id = () => `ID_${(++zaehler).toString(36).toUpperCase().padStart(6, '0')}`;
  const ebenen = lv.ozMaske.ebenen.filter((e) => e.aktiv);
  const z = (n: number) => String(n).padStart(2, '0');
  const datum = `${jetzt.getFullYear()}-${z(jetzt.getMonth() + 1)}-${z(jetzt.getDate())}`;
  const zeit = `${z(jetzt.getHours())}:${z(jetzt.getMinutes())}:${z(jetzt.getSeconds())}`;

  const position = (p: Position): string => {
    const teile: string[] = [];
    teile.push(`<Qty>${zahl(p.menge ?? 0, 3)}</Qty>`, `<QU>${esc(p.einheit || 'psch')}</QU>`);
    if (p.positionsart === 'bedarf') teile.push('<Provis>WithoutTotal</Provis>');
    if (p.positionsart === 'grund' || p.positionsart === 'wahl') {
      const gruppe = p.positionsart === 'grund' ? p.id : (p.bezug ?? p.id);
      teile.push(`<ALNGroupNo>${(Math.abs([...gruppe].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) % 99) + 1}</ALNGroupNo>`, `<ALNSerNo>${p.positionsart === 'grund' ? 0 : 1}</ALNSerNo>`);
    }
    if (p.stundenlohn) teile.push('<HourIt>Yes</HourIt>');
    if (/^psch$/i.test(p.einheit.trim())) teile.push('<LumpSumItem>Yes</LumpSumItem>');
    if (mitPreisen && bieter) {
      const ep = p.preise[String(bieter.id)]?.ep;
      if (ep !== null && ep !== undefined) {
        const it = Math.round((p.preise[String(bieter.id)]?.pauschal ?? (p.preise[String(bieter.id)]?.menge ?? p.menge ?? 0) * ep) * 100) / 100;
        teile.push(`<UP>${zahl(ep, 2)}</UP>`, `<IT>${zahl(it, 2)}</IT>`);
      }
    }
    teile.push(beschreibung(p.kurztext, p.langtext));
    return `<Item ID="${id()}" RNoPart="${esc(ozFormat(p.oz, lv.ozMaske.position.stellen))}">${teile.join('')}</Item>`;
  };
  const hinweis = (h: Hinweis) => `<Remark ID="${id()}">${beschreibung(h.kurztext, h.langtext)}</Remark>`;

  const koerper = (liste: LvElement[], tiefe: number): string => {
    const abschnitte = liste.filter((e): e is Abschnitt => e.art === 'abschnitt');
    if (abschnitte.length) {
      // GAEB: ein Körper enthält entweder Abschnitte oder eine Positionsliste; Hinweise stehen dann am Anfang des Abschnitts
      return `<BoQBody>${liste
        .map((e) => {
          if (e.art === 'abschnitt') return `<BoQCtgy ID="${id()}" RNoPart="${esc(ozFormat(e.oz, ebenen[tiefe]?.stellen ?? 2))}"><LblTx>${kurzXml(e.kurztext)}</LblTx>${e.langtext.length ? `<Remark ID="${id()}">${beschreibung(e.kurztext, e.langtext)}</Remark>` : ''}${koerper(e.kinder, tiefe + 1)}</BoQCtgy>`;
          if (e.art === 'hinweis') return hinweis(e);
          // Position zwischen Abschnitten: in einen eigenen Abschnitt
          return `<BoQCtgy ID="${id()}" RNoPart="99"><LblTx>${kurzXml('Positionen')}</LblTx><BoQBody><Itemlist>${position(e)}</Itemlist></BoQBody></BoQCtgy>`;
        })
        .join('')}</BoQBody>`;
    }
    return `<BoQBody><Itemlist>${liste.map((e) => (e.art === 'position' ? position(e) : e.art === 'hinweis' ? hinweis(e) : '')).join('')}</Itemlist></BoQBody>`;
  };

  const bkdn = [
    ...ebenen.map((e) => `<BoQBkdn><Type>BoQLevel</Type>${e.name ? `<LblTx>${esc(e.name)}</LblTx>` : ''}<Length>${e.stellen}</Length><Num>Yes</Num></BoQBkdn>`),
    `<BoQBkdn><Type>Item</Type><Length>${lv.ozMaske.position.stellen}</Length><Num>Yes</Num></BoQBkdn>`,
  ].join('');
  const ag = (o.auftraggeber ?? lv.kopf.auftraggeber ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
  const plzOrt = /^(\d{5})\s+(.+)$/.exec(ag[ag.length - 1] ?? '');
  const adresse = ag.length
    ? `<OWN><Address><Name1>${esc(ag[0])}</Name1>${ag.length > 2 ? `<Street>${esc(ag[ag.length - 2])}</Street>` : ''}${plzOrt ? `<PCode>${plzOrt[1]}</PCode><City>${esc(plzOrt[2])}</City>` : ''}</Address></OWN>`
    : '';
  const ctr = bieter && bieter.id !== 0 ? `<CTR><Address><Name1>${esc(bieter.name)}</Name1></Address></CTR>` : '';
  const offen = lv.kopf.eroeffnung ? `<OpenDate>${lv.kopf.eroeffnung.slice(0, 10)}</OpenDate>${lv.kopf.eroeffnung.length > 10 ? `<OpenTime>${lv.kopf.eroeffnung.slice(11, 16)}:00</OpenTime>` : ''}` : '';
  const nachlass = mitPreisen && bieter?.nachlass ? `<Totals><DiscountPcnt>${zahl(-bieter.nachlass, 2)}</DiscountPcnt></Totals>` : '';
  const xml =
    `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA${o.dp}/3.3">` +
    `<GAEBInfo><Version>3.3</Version><VersDate>2021-05</VersDate><Date>${datum}</Date><Time>${zeit}</Time><ProgSystem>arch-tools AVA</ProgSystem></GAEBInfo>` +
    `<PrjInfo><NamePrj>${esc(o.projektNummer ?? lv.kopf.nummer ?? '')}</NamePrj><LblPrj>${esc(o.projektName ?? lv.kopf.projektName ?? lv.kopf.bezeichnung)}</LblPrj><Cur>${esc(lv.kopf.waehrung)}</Cur><CurLbl>${lv.kopf.waehrung === 'EUR' ? 'Euro' : esc(lv.kopf.waehrung)}</CurLbl></PrjInfo>` +
    `<Award><DP>${o.dp}</DP><AwardInfo><Cur>${esc(lv.kopf.waehrung)}</Cur><CurLbl>${lv.kopf.waehrung === 'EUR' ? 'Euro' : esc(lv.kopf.waehrung)}</CurLbl>${offen}${lv.kopf.abgabeort ? `<SubmLoc>${esc(lv.kopf.abgabeort.replace(/\n/g, ', '))}</SubmLoc>` : ''}</AwardInfo>` +
    adresse +
    ctr +
    `<BoQ ID="${id()}"><BoQInfo><Name>${esc(lv.kopf.nummer ?? '1')}</Name><LblTx>${kurzXml(lv.kopf.bezeichnung)}</LblTx>${lv.kopf.datum ? `<Date>${lv.kopf.datum}</Date>` : ''}${bkdn}${nachlass}</BoQInfo>` +
    koerper(lv.elemente, 0) +
    `</BoQ></Award></GAEB>\n`;
  return new TextEncoder().encode(xml);
}

/* ---------- Lesen ---------- */

const ohnePraefix = (n: string) => n.replace(/^[^:]+:/, '');
const k = (el: XmlElement | undefined, name: string) => el?.kinder.find((x) => ohnePraefix(x.name) === name);
const alle = (el: XmlElement | undefined, name: string) => el?.kinder.filter((x) => ohnePraefix(x.name) === name) ?? [];
const text = (el: XmlElement | undefined): string => (el ? el.text + el.kinder.map(text).join('') : '');

/** <p>/<span>/<br> in Absätze mit Auszeichnung */
export function gaebText(el: XmlElement | undefined): Formattext {
  if (!el) return [];
  const absaetze: Absatz[] = [];
  const laeufe = (e: XmlElement, art: { fett?: boolean; kursiv?: boolean; unterstrichen?: boolean }, out: Lauf[]) => {
    // Text vor und zwischen den Kindern: der Leser sammelt ihn gesamt in `text` – bei Spans ohne Kinder genügt das
    const style = e.attr.style ?? '';
    const neu = {
      fett: art.fett || /font-weight\s*:\s*(bold|[6-9]00)/i.test(style) || ohnePraefix(e.name) === 'b',
      kursiv: art.kursiv || /font-style\s*:\s*italic/i.test(style) || ohnePraefix(e.name) === 'i',
      unterstrichen: art.unterstrichen || /underline/i.test(style) || ohnePraefix(e.name) === 'u',
    };
    if (ohnePraefix(e.name) === 'br') {
      out.push({ text: '\n' });
      return;
    }
    if (e.text) out.push({ text: e.text, ...(neu.fett ? { fett: true } : {}), ...(neu.kursiv ? { kursiv: true } : {}), ...(neu.unterstrichen ? { unterstrichen: true } : {}) });
    for (const c of e.kinder) laeufe(c, neu, out);
  };
  const ps = alleKinder(el, 'p').length ? alleKinder(el, 'p') : el.kinder.filter((x) => ohnePraefix(x.name) === 'p');
  for (const p of ps.length ? ps : [el]) {
    const out: Lauf[] = [];
    laeufe(p, {}, out);
    const zusammen: Lauf[] = [];
    for (const l of out) {
      const v = zusammen[zusammen.length - 1];
      if (v && !!v.fett === !!l.fett && !!v.kursiv === !!l.kursiv && !!v.unterstrichen === !!l.unterstrichen) v.text += l.text;
      else zusammen.push({ ...l });
    }
    const t = zusammen.map((l) => l.text).join('');
    if (t.startsWith('• ') && zusammen[0]) {
      zusammen[0] = { ...zusammen[0], text: zusammen[0].text.replace(/^• /, '') };
      absaetze.push({ laeufe: zusammen, liste: 'punkt' });
    } else absaetze.push({ laeufe: zusammen });
  }
  while (absaetze.length && !absaetze[absaetze.length - 1].laeufe.some((l) => l.text.trim())) absaetze.pop();
  return absaetze;
}

function texteAus(desc: XmlElement | undefined): { kurz: string; lang: Formattext } {
  const ct = k(desc, 'CompleteText');
  const lang = gaebText(k(k(ct, 'DetailTxt'), 'Text'));
  const kurzEl = k(k(k(ct, 'OutlineText'), 'OutlTxt'), 'TextOutlTxt');
  const kurz = kurzEl ? ersteZeile(gaebText(kurzEl)) : ersteZeile(lang);
  return { kurz, lang };
}

export interface GaebGelesen {
  dp: number;
  lv: Lv;
  /** vollständige OZ → Einheitspreis (X84/X86) */
  preise: Map<string, number>;
  bieter?: { name: string; nachlass?: number };
  hinweise: string[];
}

const ZAHL = (s: string | undefined) => {
  if (!s?.trim()) return null;
  const n = Number(s.trim());
  return Number.isFinite(n) ? n : null;
};

export function gaebLesen(bytes: Uint8Array): GaebGelesen {
  let quelle = new TextDecoder('utf-8').decode(bytes);
  if (/encoding="(iso-8859-1|windows-1252)"/i.test(quelle.slice(0, 200))) quelle = new TextDecoder('windows-1252').decode(bytes);
  const doc = xmlLesen(quelle);
  const gaeb = doc.kinder.find((x) => ohnePraefix(x.name) === 'GAEB');
  if (!gaeb) throw new Error('Keine GAEB-XML-Datei (Wurzel „GAEB“ fehlt). GAEB 90/2000 (D8x/P8x) bitte als XML exportieren lassen.');
  const award = k(gaeb, 'Award');
  const boq = k(award, 'BoQ');
  if (!boq) throw new Error('Die GAEB-Datei enthält kein Leistungsverzeichnis (BoQ).');
  const dp = ZAHL(text(k(award, 'DP'))) ?? 0;
  const info = k(boq, 'BoQInfo');
  const lv = leeresLv(ersteZeile(gaebText(k(info, 'LblTx'))) || text(k(k(gaeb, 'PrjInfo'), 'LblPrj')) || 'GAEB-Import');
  const hinweise: string[] = [];
  lv.kopf.nummer = text(k(info, 'Name')).trim() || undefined;
  lv.kopf.projektName = text(k(k(gaeb, 'PrjInfo'), 'LblPrj')).trim() || undefined;
  const d = text(k(info, 'Date')).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) lv.kopf.datum = d.slice(0, 10);
  const od = text(k(k(award, 'AwardInfo'), 'OpenDate')).trim();
  const ot = text(k(k(award, 'AwardInfo'), 'OpenTime')).trim();
  if (od) lv.kopf.eroeffnung = `${od.slice(0, 10)}${ot ? `T${ot.slice(0, 5)}` : ''}`;
  const own = k(k(award, 'OWN'), 'Address');
  if (own) lv.kopf.auftraggeber = [text(k(own, 'Name1')), text(k(own, 'Name2')), text(k(own, 'Street')), `${text(k(own, 'PCode'))} ${text(k(own, 'City'))}`.trim()].map((s) => s.trim()).filter(Boolean).join('\n');
  const stufen = alle(info, 'BoQBkdn');
  const level = stufen.filter((s) => text(k(s, 'Type')).trim() === 'BoQLevel' || text(k(s, 'Type')).trim() === 'Lot');
  const item = stufen.find((s) => text(k(s, 'Type')).trim() === 'Item');
  if (level.length || item) {
    lv.ozMaske = {
      ebenen: [0, 1, 2, 3].map((i) => ({ name: level[i] ? text(k(level[i], 'LblTx')).trim() || (i === 0 ? 'Abschnitt' : 'Titel') : '', stellen: ZAHL(text(k(level[i], 'Length'))) ?? 2, schritt: 1, aktiv: i < level.length })),
      position: { stellen: ZAHL(text(k(item, 'Length'))) ?? 4, schritt: 10 },
    };
  }
  const preise = new Map<string, number>();
  const rek = (body: XmlElement | undefined, pfad: string[]): LvElement[] => {
    const out: LvElement[] = [];
    if (!body) return out;
    for (const c of body.kinder) {
      const n = ohnePraefix(c.name);
      if (n === 'BoQCtgy') {
        const oz = c.attr.RNoPart ?? '';
        const kinder = rek(k(c, 'BoQBody'), [...pfad, oz]);
        // Hinweis, der den Langtext des Abschnitts trägt, steht vorne
        const a: Abschnitt = { id: neueId(), art: 'abschnitt', oz, kurztext: ersteZeile(gaebText(k(c, 'LblTx'))), langtext: [], kinder };
        for (const r of alle(c, 'Remark')) a.kinder.unshift(hinweisAus(r));
        out.push(a);
      } else if (n === 'Itemlist') out.push(...rek(c, pfad));
      else if (n === 'Item') out.push(positionAus(c, pfad));
      else if (n === 'Remark') out.push(hinweisAus(c, pfad.length === 0));
    }
    return out;
  };
  const hinweisAus = (r: XmlElement, vorbemerkung = false): Hinweis => {
    const t = texteAus(k(r, 'Description'));
    return { id: neueId(), art: 'hinweis', kurztext: t.kurz || 'Hinweis', langtext: t.lang, ...(vorbemerkung ? { vorbemerkung: true } : {}) };
  };
  const positionAus = (it: XmlElement, pfad: string[]): Position => {
    const t = texteAus(k(it, 'Description'));
    const provis = text(k(it, 'Provis')).trim();
    const aln = ZAHL(text(k(it, 'ALNSerNo')));
    let art: PositionsArt = 'normal';
    if (provis === 'WithoutTotal' || provis === 'WithTotal') art = 'bedarf';
    else if (aln !== null) art = aln === 0 ? 'grund' : 'wahl';
    const oz = it.attr.RNoPart ?? '';
    const ep = ZAHL(text(k(it, 'UP')));
    if (ep !== null) preise.set([...pfad, oz].join('.'), ep);
    const einheit = text(k(it, 'QU')).trim();
    return {
      id: neueId(),
      art: 'position',
      oz,
      kurztext: t.kurz,
      langtext: t.lang,
      einheit,
      menge: ZAHL(text(k(it, 'Qty'))),
      positionsart: art,
      preise: {},
      ...(text(k(it, 'HourIt')).trim() === 'Yes' || /^(h|std)/i.test(einheit) ? { stundenlohn: true } : {}),
    };
  };
  lv.elemente = rek(k(boq, 'BoQBody'), []);
  const ctr = k(k(award, 'CTR'), 'Address');
  const discount = ZAHL(text(k(k(info, 'Totals'), 'DiscountPcnt')));
  const bieter = ctr || discount !== null ? { name: text(k(ctr, 'Name1')).trim() || 'Bieter (GAEB)', ...(discount ? { nachlass: -Math.abs(discount) } : {}) } : undefined;
  if (dp === 84 && !preise.size) hinweise.push('Die Angebotsdatei enthält keine Einheitspreise.');
  return { dp, lv, preise, ...(bieter ? { bieter } : {}), hinweise };
}

/* ---------- Angebot ins LV ---------- */

/** vollständige OZ aller Positionen (ohne führende Nullen verglichen) */
function ozSchluessel(oz: string): string {
  return oz
    .split('.')
    .map((t) => t.replace(/^0+(?=\d)/, ''))
    .join('.');
}

export interface AngebotUebernahme {
  lv: Lv;
  bieterId: number;
  zugeordnet: number;
  ohneZuordnung: string[];
}

/**
 * Einheitspreise einer Angebotsdatei (X84) als Preise eines Bieters ins LV: Zuordnung über die vollständige OZ.
 * Ohne `bieterId` wird ein neuer Bieter angelegt.
 */
export function angebotUebernehmen(lv: Lv, g: GaebGelesen, bieterId?: number): AngebotUebernahme {
  const id = bieterId ?? Math.max(9, ...lv.bieter.map((b) => b.id)) + 1;
  const bieter: Bieter[] = bieterId === undefined ? [...lv.bieter, { id, name: g.bieter?.name ?? 'Bieter (GAEB)', ...(g.bieter?.nachlass ? { nachlass: g.bieter.nachlass } : {}), angebotsdatum: new Date().toISOString().slice(0, 10) }] : lv.bieter.map((b) => (b.id === id && g.bieter?.nachlass ? { ...b, nachlass: g.bieter.nachlass } : b));
  const preise = new Map([...g.preise].map(([oz, ep]) => [ozSchluessel(oz), ep]));
  const benutzt = new Set<string>();
  let zugeordnet = 0;
  const rek = (liste: LvElement[], pfad: string[]): LvElement[] =>
    liste.map((e) => {
      if (e.art === 'abschnitt') return { ...e, kinder: rek(e.kinder, [...pfad, e.oz]) };
      if (e.art !== 'position') return e;
      const s = ozSchluessel([...pfad, e.oz].join('.'));
      const ep = preise.get(s);
      if (ep === undefined) return e;
      benutzt.add(s);
      zugeordnet++;
      return { ...e, preise: { ...e.preise, [String(id)]: { ...e.preise[String(id)], ep } } };
    });
  const elemente = rek(lv.elemente, []);
  return { lv: { ...lv, bieter, elemente }, bieterId: id, zugeordnet, ohneZuordnung: [...preise.keys()].filter((oz) => !benutzt.has(oz)) };
}
