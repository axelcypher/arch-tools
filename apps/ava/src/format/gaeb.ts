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

import { APP_NAMEN } from '@core/appNamen';
import type { XmlElement } from '@core/dokumente/xml';
import { alleKinder, entschluesseln, xmlLesen } from '@core/dokumente/xml';
import type { Absatz, Formattext, Lauf } from './rtf';
import { ersteZeile } from './rtf';
import type { Abschnitt, Bieter, Hinweis, Lv, LvElement, Position, PositionsArt } from '../lv/modell';
import { heuteIso, leeresLv, neueId, ozDubletten, ozFormat, positionen } from '../lv/modell';
import { gesamtbetrag } from '../lv/rechnen';

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
  let nr = 0;
  return f
    .map((a) => {
      nr = a.liste === 'nummer' ? nr + 1 : 0;
      const marke = a.liste === 'punkt' ? '<span>• </span>' : a.liste === 'nummer' ? `<span>${nr}. </span>` : '';
      return `<p>${marke}${a.laeufe.map(laufXml).join('') || '<span></span>'}</p>`;
    })
    .join('');
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

/** Kennungen, an denen der Import eigene Exporte wiedererkennt (gültige XML-IDs, für andere Programme bedeutungslos) */
const ID_VORBEMERKUNGEN = 'VB_';
/** Langtext des Abschnitts auf Tiefe n: „LT<n>_…“ */
const ID_LANGTEXT = /^LT(\d+)_/;

/**
 * Was beim GAEB-Export nicht sauber abbildbar ist: Positionen neben Abschnitten (GAEB kennt in einem Körper nur
 * entweder Abschnitte oder eine Positionsliste – sie landen in einem eigenen Abschnitt am Ende) und doppelte OZ.
 * Leere Liste = alles in Ordnung. Vor dem Export anzeigen.
 */
export function gaebPruefen(lv: Lv): string[] {
  const out: string[] = [];
  const lose: string[] = [];
  const rek = (liste: LvElement[], pfad: string[]) => {
    const mitAbschnitten = liste.some((e) => e.art === 'abschnitt');
    for (const e of liste) {
      if (e.art === 'abschnitt') rek(e.kinder, [...pfad, e.oz]);
      else if (e.art === 'position' && mitAbschnitten) lose.push([...pfad, e.oz].join('.'));
    }
  };
  rek(lv.elemente, []);
  if (lose.length) out.push(`Positionen neben Abschnitten (${lose.slice(0, 5).join(', ')}${lose.length > 5 ? ' …' : ''}) – GAEB verlangt einen Abschnitt; sie werden in einen eigenen Abschnitt „Positionen ohne Abschnitt“ geschrieben. Besser vorher in einen Abschnitt verschieben.`);
  const d = ozDubletten(lv);
  if (d.length) out.push(`Doppelte Ordnungszahlen: ${d.map((x) => x.oz).slice(0, 5).join(', ')}${d.length > 5 ? ' …' : ''} – Preise der Bieter lassen sich dann nicht eindeutig zuordnen.`);
  return out;
}

/** Einheitspreis mit seinen Nachkommastellen (mindestens 2, höchstens 6) */
const epText = (ep: number) => {
  const nk = (String(Number(ep.toFixed(6))).split('.')[1] ?? '').length;
  return ep.toFixed(Math.max(2, Math.min(6, nk)));
};

export function gaebSchreiben(lv: Lv, o: GaebExport): Uint8Array {
  const jetzt = o.jetzt ?? new Date();
  const mitPreisen = o.dp === 84 || o.dp === 86;
  const bieter = mitPreisen ? lv.bieter.find((b) => b.id === (o.bieterId ?? lv.auftrag?.bieterId ?? 0)) : undefined;
  let zaehler = 0;
  const id = (praefix = 'ID_') => `${praefix}${(++zaehler).toString(36).toUpperCase().padStart(6, '0')}`;
  const ebenen = lv.ozMaske.ebenen.filter((e) => e.aktiv);
  const z = (n: number) => String(n).padStart(2, '0');
  const datum = `${jetzt.getFullYear()}-${z(jetzt.getMonth() + 1)}-${z(jetzt.getDate())}`;
  const zeit = `${z(jetzt.getHours())}:${z(jetzt.getMinutes())}:${z(jetzt.getSeconds())}`;

  // Grund- und Wahlpositionen: Gruppen fortlaufend; eine Wahlposition gehört zu ihrer Grundposition (bezug)
  // oder, ohne Bezug, zur letzten Grundposition davor
  const gruppe = new Map<string, { nr: number; ser: number }>();
  {
    const grundNr = new Map<string, number>();
    const wahlZahl = new Map<number, number>();
    let n = 0;
    let letzteGrund: number | null = null;
    const alle = positionen(lv).map((x) => x.pos);
    for (const p of alle) if (p.positionsart === 'grund') grundNr.set(p.id, ++n);
    for (const p of alle) {
      if (p.positionsart === 'grund') {
        letzteGrund = grundNr.get(p.id)!;
        gruppe.set(p.id, { nr: letzteGrund, ser: 0 });
      } else if (p.positionsart === 'wahl') {
        const nr = (p.bezug && grundNr.get(p.bezug)) || letzteGrund || ++n;
        const ser = (wahlZahl.get(nr) ?? 0) + 1;
        wahlZahl.set(nr, ser);
        gruppe.set(p.id, { nr, ser });
      }
    }
  }

  const position = (p: Position): string => {
    const teile: string[] = [];
    teile.push(`<Qty>${zahl(p.menge ?? 0, 3)}</Qty>`, `<QU>${esc(p.einheit || 'psch')}</QU>`);
    if (p.positionsart === 'bedarf') teile.push('<Provis>WithoutTotal</Provis>');
    const g = gruppe.get(p.id);
    if (g) teile.push(`<ALNGroupNo>${g.nr}</ALNGroupNo>`, `<ALNSerNo>${g.ser}</ALNSerNo>`);
    if (p.stundenlohn) teile.push('<HourIt>Yes</HourIt>');
    if (/^psch$/i.test(p.einheit.trim())) teile.push('<LumpSumItem>Yes</LumpSumItem>');
    if (mitPreisen && bieter) {
      const ep = p.preise[String(bieter.id)]?.ep;
      const it = gesamtbetrag(p, bieter.id);
      if (ep !== null && ep !== undefined && it !== null) teile.push(`<UP>${epText(ep)}</UP>`, `<IT>${zahl(it, 2)}</IT>`);
    }
    teile.push(beschreibung(p.kurztext, p.langtext));
    return `<Item ID="${id()}" RNoPart="${esc(ozFormat(p.oz, lv.ozMaske.position.stellen))}">${teile.join('')}</Item>`;
  };
  const hinweis = (h: Hinweis, praefix?: string) => `<Remark ID="${id(praefix)}">${beschreibung(h.kurztext, h.langtext)}</Remark>`;
  const stellen = (tiefe: number) => ebenen[tiefe]?.stellen ?? 2;

  /**
   * Körper einer Ebene. GAEB: ein Körper enthält entweder Abschnitte oder eine Positionsliste (Itemlist); Hinweise
   * stehen nur in einer Itemlist. Hinweise zwischen Abschnitten wandern deshalb an den Anfang der Positionsliste des
   * folgenden Abschnitts (am Ende: des vorigen), Positionen neben Abschnitten in einen eigenen Abschnitt am Ende.
   */
  const koerper = (liste: LvElement[], tiefe: number, vorne: string[] = [], hinten: string[] = []): string => {
    const abschnitte = liste.filter((e): e is Abschnitt => e.art === 'abschnitt');
    if (!abschnitte.length) return `<BoQBody><Itemlist>${vorne.join('')}${liste.map((e) => (e.art === 'position' ? position(e) : e.art === 'hinweis' ? hinweis(e) : '')).join('')}${hinten.join('')}</Itemlist></BoQBody>`;
    const teile: { a: Abschnitt; vorne: string[]; hinten: string[] }[] = [];
    const lose: Position[] = [];
    let offen: string[] = [...vorne];
    for (const e of liste) {
      if (e.art === 'hinweis') offen.push(hinweis(e));
      else if (e.art === 'position') lose.push(e);
      else {
        teile.push({ a: e, vorne: offen, hinten: [] });
        offen = [];
      }
    }
    if (lose.length) {
      const nr = Math.max(0, ...abschnitte.map((a) => Number(a.oz)).filter(Number.isFinite)) + 1;
      teile.push({ a: { id: 'lose', art: 'abschnitt', oz: String(nr), kurztext: 'Positionen ohne Abschnitt', langtext: [], kinder: lose }, vorne: [], hinten: [] });
    }
    teile[teile.length - 1].hinten.push(...offen, ...hinten);
    return `<BoQBody>${teile.map((t) => abschnitt(t.a, tiefe, t.vorne, t.hinten)).join('')}</BoQBody>`;
  };
  const abschnitt = (a: Abschnitt, tiefe: number, vorne: string[], hinten: string[]): string => {
    // Langtext des Abschnitts: als erster Hinweis seiner Positionsliste, an der Kennung wiederzuerkennen
    const lt = a.langtext.length ? [hinweis({ id: '', art: 'hinweis', kurztext: a.kurztext, langtext: a.langtext }, `LT${tiefe}_`)] : [];
    return `<BoQCtgy ID="${id()}" RNoPart="${esc(ozFormat(a.oz, stellen(tiefe)))}"><LblTx>${kurzXml(a.kurztext)}</LblTx>${koerper(a.kinder, tiefe + 1, [...vorne, ...lt], hinten)}</BoQCtgy>`;
  };
  const oben = (): string => {
    // Vorbemerkungen vor einer Gliederung mit Abschnitten: eigener Abschnitt „0“ (wird beim Import zurückgeführt)
    const vb: Hinweis[] = [];
    let i = 0;
    while (i < lv.elemente.length && lv.elemente[i].art === 'hinweis' && lv.elemente.some((e) => e.art === 'abschnitt')) vb.push(lv.elemente[i++] as Hinweis);
    if (!vb.length) return koerper(lv.elemente, 0);
    const vbKat = `<BoQCtgy ID="${id(ID_VORBEMERKUNGEN)}" RNoPart="${'0'.repeat(stellen(0))}"><LblTx>${kurzXml('Vorbemerkungen')}</LblTx><BoQBody><Itemlist>${vb.map((h) => hinweis(h)).join('')}</Itemlist></BoQBody></BoQCtgy>`;
    return koerper(lv.elemente.slice(i), 0).replace(/^<BoQBody>/, `<BoQBody>${vbKat}`);
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
    `<GAEBInfo><Version>3.3</Version><VersDate>2021-05</VersDate><Date>${datum}</Date><Time>${zeit}</Time><ProgSystem>${APP_NAMEN.ava.name}</ProgSystem></GAEBInfo>` +
    `<PrjInfo><NamePrj>${esc(o.projektNummer ?? lv.kopf.nummer ?? '')}</NamePrj><LblPrj>${esc(o.projektName ?? lv.kopf.projektName ?? lv.kopf.bezeichnung)}</LblPrj><Cur>${esc(lv.kopf.waehrung)}</Cur><CurLbl>${lv.kopf.waehrung === 'EUR' ? 'Euro' : esc(lv.kopf.waehrung)}</CurLbl></PrjInfo>` +
    `<Award><DP>${o.dp}</DP><AwardInfo><Cur>${esc(lv.kopf.waehrung)}</Cur><CurLbl>${lv.kopf.waehrung === 'EUR' ? 'Euro' : esc(lv.kopf.waehrung)}</CurLbl>${offen}${lv.kopf.abgabeort ? `<SubmLoc>${esc(lv.kopf.abgabeort.replace(/\n/g, ', '))}</SubmLoc>` : ''}</AwardInfo>` +
    adresse +
    ctr +
    `<BoQ ID="${id()}"><BoQInfo><Name>${esc(lv.kopf.nummer ?? '1')}</Name><LblTx>${kurzXml(lv.kopf.bezeichnung)}</LblTx>${lv.kopf.datum ? `<Date>${lv.kopf.datum}</Date>` : ''}${bkdn}${nachlass}</BoQInfo>` +
    oben() +
    `</BoQ></Award></GAEB>\n`;
  return new TextEncoder().encode(xml);
}

/* ---------- Lesen ---------- */

const ohnePraefix = (n: string) => n.replace(/^[^:]+:/, '');
const k = (el: XmlElement | undefined, name: string) => el?.kinder.find((x) => ohnePraefix(x.name) === name);
const alle = (el: XmlElement | undefined, name: string) => el?.kinder.filter((x) => ohnePraefix(x.name) === name) ?? [];
const text = (el: XmlElement | undefined): string => (el ? el.text + el.kinder.map(text).join('') : '');

/** Platzhalter für Leerraum mit Zeilenumbruch (Einrückung im XML): wird zu einem Leerzeichen, am Absatzrand entfernt */
const UMBRUCH = '\u0000';

/** Text eines Abschnitts im Quelltext: Kommentare weg, CDATA wörtlich, Entitäten aufgelöst, Einrückung markiert */
function rohText(roh: string): string {
  return roh
    .replace(/<!--[\s\S]*?-->/g, '')
    .split(/(<!\[CDATA\[[\s\S]*?\]\]>)/)
    .map((t) => (t.startsWith('<![CDATA[') ? t.slice(9, -3) : entschluesseln(t.replace(/[ \t]*[\r\n][ \t\r\n]*/g, UMBRUCH))))
    .join('');
}

/** Inhalt eines Elements in Dokumentreihenfolge: Textstücke und Kindelemente (gemischter Inhalt) */
function inhalt(e: XmlElement, quelle: string | undefined): (string | XmlElement)[] {
  if (quelle === undefined) return [...(e.text ? [e.text] : []), ...e.kinder];
  const out: (string | XmlElement)[] = [];
  let pos = e.innenStart;
  for (const c of e.kinder) {
    if (c.start > pos) out.push(rohText(quelle.slice(pos, c.start)));
    out.push(c);
    pos = c.ende;
  }
  if (e.innenEnde > pos) out.push(rohText(quelle.slice(pos, e.innenEnde)));
  return out.filter((x) => x !== '');
}

/**
 * <p>/<span>/<br> in Absätze mit Auszeichnung. Mit `quelle` (dem gelesenen XML) wird gemischter Inhalt in
 * Dokumentreihenfolge gelesen („Vorher <span>fett</span> nachher“, „Zeile1<br/>Zeile2“); Einrückung im XML zählt
 * als Leerzeichen.
 */
export function gaebText(el: XmlElement | undefined, quelle?: string): Formattext {
  if (!el) return [];
  const absaetze: Absatz[] = [];
  const laeufe = (e: XmlElement, art: { fett?: boolean; kursiv?: boolean; unterstrichen?: boolean }, out: Lauf[]) => {
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
    for (const c of inhalt(e, quelle)) {
      if (typeof c === 'string') out.push({ text: c, ...(neu.fett ? { fett: true } : {}), ...(neu.kursiv ? { kursiv: true } : {}), ...(neu.unterstrichen ? { unterstrichen: true } : {}) });
      else laeufe(c, neu, out);
    }
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
    // Einrückung: am Absatzrand und an Zeilenumbrüchen weg, sonst ein Leerzeichen
    if (zusammen.length) {
      zusammen[0].text = zusammen[0].text.replace(new RegExp(`^${UMBRUCH}+`), '');
      const l = zusammen[zusammen.length - 1];
      l.text = l.text.replace(new RegExp(`${UMBRUCH}+$`), '');
    }
    for (const l of zusammen) l.text = l.text.replace(new RegExp(`${UMBRUCH}*\\n${UMBRUCH}*`, 'g'), '\n').replace(new RegExp(`${UMBRUCH}+`, 'g'), ' ');
    const sauber = zusammen.filter((l) => l.text !== '');
    const t = sauber.map((l) => l.text).join('');
    if (t.startsWith('• ') && sauber[0]) {
      sauber[0] = { ...sauber[0], text: sauber[0].text.replace(/^• /, '') };
      absaetze.push({ laeufe: sauber.filter((l) => l.text !== ''), liste: 'punkt' });
    } else absaetze.push({ laeufe: sauber });
  }
  while (absaetze.length && !absaetze[absaetze.length - 1].laeufe.some((l) => l.text.trim())) absaetze.pop();
  return absaetze;
}

function texteAus(desc: XmlElement | undefined, quelle?: string): { kurz: string; lang: Formattext } {
  const ct = k(desc, 'CompleteText');
  const lang = gaebText(k(k(ct, 'DetailTxt'), 'Text'), quelle);
  const kurzEl = k(k(k(ct, 'OutlineText'), 'OutlTxt'), 'TextOutlTxt');
  const kurz = kurzEl ? ersteZeile(gaebText(kurzEl, quelle)) : ersteZeile(lang);
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

/** Zeichensatz: laut XML-Deklaration (auch in einfachen Anführungszeichen), sonst UTF-8 – und wenn das nicht passt, Windows-1252 */
export function gaebDekodieren(bytes: Uint8Array): string {
  const kopf = new TextDecoder('latin1').decode(bytes.slice(0, 200));
  if (/encoding\s*=\s*["'](iso-8859-1|iso-8859-15|latin-?1|windows-1252|cp1252)["']/i.test(kopf)) return new TextDecoder('windows-1252').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** abgeschnittene Datei erkennen, bevor der Leser sich daran festläuft */
function vollstaendigPruefen(quelle: string) {
  const offen: [string, string, string][] = [
    ['<!--', '-->', 'Kommentar'],
    ['<![CDATA[', ']]>', 'CDATA-Abschnitt'],
    ['<?', '?>', 'Verarbeitungsanweisung'],
  ];
  for (const [auf, zu, was] of offen) {
    let i = quelle.indexOf(auf);
    while (i >= 0) {
      const e = quelle.indexOf(zu, i + auf.length);
      if (e < 0) throw new Error(`Die GAEB-Datei ist unvollständig (${was} nicht geschlossen) – vermutlich abgeschnitten. Bitte die Datei neu anfordern.`);
      i = quelle.indexOf(auf, e + zu.length);
    }
  }
}

export function gaebLesen(bytes: Uint8Array): GaebGelesen {
  const quelle = gaebDekodieren(bytes);
  vollstaendigPruefen(quelle);
  let doc: XmlElement;
  try {
    doc = xmlLesen(quelle);
  } catch (e) {
    throw new Error(`Die GAEB-Datei ist beschädigt oder unvollständig: ${e instanceof Error ? e.message : String(e)}`);
  }
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
  /** Langtexte von Abschnitten (eigene Exporte): Hinweis → Tiefe des Abschnitts */
  const langtextVon = new Map<Hinweis, number>();
  /** Gruppen der Grund- und Wahlpositionen: Gruppennummer → Grundposition bzw. Wahlpositionen */
  const grund = new Map<string, Position>();
  const wahl: [string, Position][] = [];
  const rek = (body: XmlElement | undefined, pfad: string[]): LvElement[] => {
    const out: LvElement[] = [];
    if (!body) return out;
    for (const c of body.kinder) {
      const n = ohnePraefix(c.name);
      if (n === 'BoQCtgy') {
        const oz = c.attr.RNoPart ?? '';
        const kinder = rek(k(c, 'BoQBody'), [...pfad, oz]);
        // eigener Export: Abschnitt der Vorbemerkungen → Vorbemerkungen oben
        if (!pfad.length && c.attr.ID?.startsWith(ID_VORBEMERKUNGEN) && kinder.every((x) => x.art === 'hinweis')) {
          out.push(...kinder.map((x) => ({ ...x, vorbemerkung: true }) as Hinweis));
          continue;
        }
        const a: Abschnitt = { id: neueId(), art: 'abschnitt', oz, kurztext: ersteZeile(gaebText(k(c, 'LblTx'), quelle)), langtext: [], kinder };
        // Hinweise direkt im Abschnitt (ältere Exporte, andere Programme) stehen vorne, in ihrer Reihenfolge; einer
        // mit der Bezeichnung des Abschnitts als Kurztext ist dessen Langtext
        const direkt = alle(c, 'Remark').map((r) => hinweisAus(r));
        const lt = direkt.findIndex((h) => h.kurztext === a.kurztext && h.langtext.length);
        if (lt >= 0) a.langtext = direkt.splice(lt, 1)[0].langtext;
        a.kinder.unshift(...direkt);
        out.push(a);
      } else if (n === 'Itemlist') out.push(...rek(c, pfad));
      else if (n === 'Item') out.push(positionAus(c, pfad));
      else if (n === 'Remark') {
        const h = hinweisAus(c, pfad.length === 0);
        const m = ID_LANGTEXT.exec(c.attr.ID ?? '');
        if (m) langtextVon.set(h, Number(m[1]));
        out.push(h);
      }
    }
    return out;
  };
  const hinweisAus = (r: XmlElement, vorbemerkung = false): Hinweis => {
    const t = texteAus(k(r, 'Description'), quelle);
    return { id: neueId(), art: 'hinweis', kurztext: t.kurz || 'Hinweis', langtext: t.lang, ...(vorbemerkung ? { vorbemerkung: true } : {}) };
  };
  const positionAus = (it: XmlElement, pfad: string[]): Position => {
    const t = texteAus(k(it, 'Description'), quelle);
    const provis = text(k(it, 'Provis')).trim();
    const aln = ZAHL(text(k(it, 'ALNSerNo')));
    const alnGruppe = text(k(it, 'ALNGroupNo')).trim();
    let art: PositionsArt = 'normal';
    if (provis === 'WithoutTotal' || provis === 'WithTotal') art = 'bedarf';
    else if (aln !== null) art = aln === 0 ? 'grund' : 'wahl';
    const oz = it.attr.RNoPart ?? '';
    const ep = ZAHL(text(k(it, 'UP')));
    const voll = [...pfad, oz].join('.');
    if (ep !== null) {
      if (preise.has(voll)) hinweise.push(`Ordnungszahl ${voll} kommt mehrfach vor – der Preis ist nicht eindeutig zuzuordnen.`);
      preise.set(voll, ep);
    }
    const einheit = text(k(it, 'QU')).trim();
    const p: Position = {
      id: neueId(),
      art: 'position',
      oz,
      kurztext: t.kurz,
      langtext: t.lang,
      einheit,
      menge: ZAHL(text(k(it, 'Qty'))),
      positionsart: art,
      preise: {},
      ...(text(k(it, 'HourIt')).trim() === 'Yes' || /^(h|std\.?|stunden?)$/i.test(einheit) ? { stundenlohn: true } : {}),
    };
    if (art === 'grund' && alnGruppe) grund.set(alnGruppe, p);
    else if (art === 'wahl' && alnGruppe) wahl.push([alnGruppe, p]);
    return p;
  };
  lv.elemente = rek(k(boq, 'BoQBody'), []);
  for (const [g, p] of wahl) {
    const gp = grund.get(g);
    if (gp) p.bezug = gp.id;
  }
  // Langtexte der Abschnitte (eigener Export) zurück an ihren Abschnitt
  if (langtextVon.size) {
    const zurueck = (liste: LvElement[], ahnen: Abschnitt[]): LvElement[] =>
      liste
        .filter((e) => {
          const t = e.art === 'hinweis' ? langtextVon.get(e) : undefined;
          if (t === undefined || !ahnen[t]) return true;
          ahnen[t].langtext = (e as Hinweis).langtext;
          return false;
        })
        .map((e) => {
          if (e.art === 'abschnitt') e.kinder = zurueck(e.kinder, [...ahnen, e]);
          return e;
        });
    lv.elemente = zurueck(lv.elemente, []);
  }
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

/** Bieter im LV mit demselben Namen wie in der Angebotsdatei (zum Nachfragen „ersetzen oder neu anlegen?“) */
export function gleicherBieter(lv: Lv, g: GaebGelesen): Bieter | undefined {
  const n = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const name = g.bieter?.name;
  return name ? lv.bieter.find((b) => b.id !== 0 && n(b.name) === n(name)) : undefined;
}

/**
 * Einheitspreise einer Angebotsdatei (X84) als Preise eines Bieters ins LV: Zuordnung über die vollständige OZ.
 * Ohne `bieterId` wird ein neuer Bieter angelegt; mit `bieterId` werden dessen Preise ersetzt (Positionen, die in
 * der Datei keinen Preis haben, verlieren ihren alten).
 */
export function angebotUebernehmen(lv: Lv, g: GaebGelesen, bieterId?: number): AngebotUebernahme {
  const id = bieterId ?? Math.max(9, ...lv.bieter.map((b) => b.id)) + 1;
  const bieter: Bieter[] = bieterId === undefined ? [...lv.bieter, { id, name: g.bieter?.name ?? 'Bieter (GAEB)', ...(g.bieter?.nachlass ? { nachlass: g.bieter.nachlass } : {}), angebotsdatum: heuteIso() }] : lv.bieter.map((b) => (b.id === id && g.bieter?.nachlass ? { ...b, nachlass: g.bieter.nachlass } : b));
  const preise = new Map([...g.preise].map(([oz, ep]) => [ozSchluessel(oz), ep]));
  const benutzt = new Set<string>();
  let zugeordnet = 0;
  const rek = (liste: LvElement[], pfad: string[]): LvElement[] => {
    // Positionen neben Abschnitten stehen im GAEB-Export in einem eigenen Abschnitt am Ende (siehe gaebSchreiben)
    const abschnitte = liste.filter((e) => e.art === 'abschnitt');
    const loseNr = abschnitte.length ? String(Math.max(0, ...abschnitte.map((a) => Number(a.oz)).filter(Number.isFinite)) + 1) : null;
    return liste.map((e) => {
      if (e.art === 'abschnitt') return { ...e, kinder: rek(e.kinder, [...pfad, e.oz]) };
      if (e.art !== 'position') return e;
      let s = ozSchluessel([...pfad, e.oz].join('.'));
      if (!preise.has(s) && loseNr) s = ozSchluessel([...pfad, loseNr, e.oz].join('.'));
      const ep = preise.get(s);
      if (ep === undefined) {
        // vorhandener Bieter: Preise, die in der neuen Datei fehlen, nicht stehen lassen
        if (bieterId === undefined || !e.preise[String(id)]) return e;
        const rest = { ...e.preise };
        delete rest[String(id)];
        return { ...e, preise: rest };
      }
      benutzt.add(s);
      zugeordnet++;
      return { ...e, preise: { ...e.preise, [String(id)]: { ...e.preise[String(id)], ep } } };
    });
  };
  const elemente = rek(lv.elemente, []);
  return { lv: { ...lv, bieter, elemente }, bieterId: id, zugeordnet, ohneZuordnung: [...preise.keys()].filter((oz) => !benutzt.has(oz)) };
}
