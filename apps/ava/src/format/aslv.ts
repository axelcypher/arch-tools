/**
 * LV-Dateien des Originalprogramms (.aslv): zlib-komprimiertes XML (UTF-8 mit BOM, CRLF), Wurzel
 * `<AVAPLANStudio T="LV">`. Fast alle Angaben stehen als `<Parameter Name="…" Value="…"/>` in ParameterListen.
 *
 * Gelesen wird das LV-Modell der App (Kopf, OZ-Maske, Bieter, Gliederung, Preise, Auftrag). Geschrieben wird,
 * indem die Datei frisch gelesen und nur das geändert wird, was im Modell anders ist – Parameter, Texte,
 * Summen, neue und entfernte Elemente. Alles, was die App nicht kennt (Abrechnung, Druckeinstellungen,
 * Mengenermittlung …), bleibt Byte für Byte erhalten; eine unveränderte Datei wird unverändert zurückgegeben.
 *
 * Bedeutung der Parameter (aus echten Dateien abgeleitet): OZ, EH (Einheit), ME (Menge), EP (Einheitspreis),
 * GB (Gesamtbetrag), GBoA (Gesamtbetrag ohne Auf-/Abschlag), AUF (Auf-/Abschlag in %, −2 = 2 % Nachlass),
 * GBMwSt, GBBrutto, KostGr (Kostengruppe DIN 276), EV=1 (Bedarfsposition), CONo (Nachtragsnummer),
 * Text1 (Kurztext, RTF), Text2 (Langtext, RTF), LVOrderBidderID (beauftragter Bieter, −1 = keiner).
 */

import { unzlibSync, zlibSync } from 'fflate';
import type { Abschnitt, Bieter, Einbehalt, Hinweis, Lv, LvElement, LvKopf, OzMaske, Position, Preis } from '../lv/modell';
import { neueId, STANDARD_OZ_MASKE } from '../lv/modell';
import type { Summen } from '../lv/rechnen';
import { summen } from '../lv/rechnen';
import type { Formattext } from './rtf';
import { alsText, ersteZeile, gleicherText, istRtf, kurztextRtf, rtfLesen, rtfSchreiben } from './rtf';
import type { XDokument, XElement } from './xmlDom';
import { attr, attrSetzen, elemente, erstes, kinderSetzen, kopie, neuesElement, tiefeVon, xmlParsen, xmlSchreiben } from './xmlDom';

export const ASLV_ENDUNG = 'aslv';

/** Kennung des Gesamtauftrags (alle Nachträge) in den Order-Listen */
const ORDER_GESAMT = '2147483647';

export class AslvFehler extends Error {}

/* ---------- Datei ---------- */

export function aslvEntpacken(bytes: Uint8Array): string {
  let roh: Uint8Array;
  try {
    roh = unzlibSync(bytes);
  } catch {
    throw new AslvFehler('Keine LV-Datei (.aslv): Der Inhalt lässt sich nicht entpacken.');
  }
  // BOM behalten, damit die Datei unverändert zurückgeschrieben werden kann
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(roh);
}

export function aslvPacken(xml: string): Uint8Array {
  return zlibSync(new TextEncoder().encode(xml), { level: 6 });
}

export function aslvDokument(bytes: Uint8Array): XDokument {
  const xml = aslvEntpacken(bytes);
  const d = xmlParsen(xml);
  if (d.wurzel.name !== 'AVAPLANStudio' || !erstes(d.wurzel, 'LV')) throw new AslvFehler('Keine LV-Datei (.aslv): Das Leistungsverzeichnis fehlt.');
  return d;
}

/* ---------- Parameter ---------- */

const paramListe = (el: XElement | undefined) => erstes(el, 'ParameterList');

export function param(el: XElement | undefined, name: string): string | undefined {
  for (const p of elemente(paramListe(el), 'Parameter')) if (attr(p, 'Name') === name) return attr(p, 'Value');
  return undefined;
}

export function params(el: XElement | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of elemente(paramListe(el), 'Parameter')) m.set(attr(p, 'Name') ?? '', attr(p, 'Value') ?? '');
  return m;
}

const zahl = (s: string | undefined): number | null => {
  if (s === undefined || s.trim() === '') return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/* ---------- Datum ---------- */

/** „2025-04-10T00:00:01“ oder „01.12.2025 00:00:01“ → „2025-04-10“ */
export function datumLesen(s: string | undefined): string | undefined {
  if (!s) return undefined;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return undefined;
}

/** mit Uhrzeit, wenn sie nicht die Platzhalterzeit 00:00:01 ist: „2025-04-28T12:00“ */
function zeitpunktLesen(s: string | undefined): string | undefined {
  const d = datumLesen(s);
  if (!d || !s) return d;
  const t = /[T ](\d{2}):(\d{2})/.exec(s);
  return t && !(t[1] === '00' && t[2] === '00') ? `${d}T${t[1]}:${t[2]}` : d;
}

/** Datum im Format des bisherigen Werts schreiben (ISO bzw. deutsch, Zeit 00:00:01 wie im Original) */
function datumSchreiben(iso: string, vorher: string | undefined): string {
  const [d, zeit] = iso.split('T');
  const [j, mo, t] = d.split('-');
  const uhr = zeit ? `${zeit}:00` : '00:00:01';
  if (vorher && /^\d{1,2}\.\d{1,2}\.\d{4}/.test(vorher)) return `${t}.${mo}.${j} ${uhr}`;
  return `${j}-${mo}-${t}T${uhr}`;
}

export function jetztText(d = new Date()): string {
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
}

/* ---------- Lesen ---------- */

const text1 = (el: XElement) => {
  const t = param(el, 'Text1') ?? '';
  return istRtf(t) ? ersteZeile(rtfLesen(t)) : t.trim();
};
const text2 = (el: XElement): Formattext => rtfLesen(param(el, 'Text2') ?? '');

function kopfLesen(lv: XElement): LvKopf {
  const p = params(lv);
  const rtfOderText = (s: string | undefined) => (s === undefined ? undefined : istRtf(s) ? alsText(rtfLesen(s)) : s);
  const mwst = zahl(p.get('LVMwSt'));
  return {
    bezeichnung: p.get('Text1') && istRtf(p.get('Text1')) ? ersteZeile(rtfLesen(p.get('Text1')!)) : (p.get('Text1') ?? '').trim(),
    nummer: p.get('LVNr') || undefined,
    datum: datumLesen(p.get('LVDate')),
    eroeffnung: zeitpunktLesen(p.get('LVDateOffen')),
    bindefrist: datumLesen(p.get('LVDateFrist')),
    ausfuehrungVon: datumLesen(p.get('LVDateBegin')),
    ausfuehrungBis: datumLesen(p.get('LVDateEnde')),
    vergabeart: p.get('LVVergabeArt') || undefined,
    projekt: rtfOderText(p.get('LVPrBez'))?.trim() || undefined,
    projektName: p.get('LVPrName')?.trim() || undefined,
    auftraggeber: rtfOderText(p.get('LVAGAdr'))?.trim() || undefined,
    ersteller: rtfOderText(p.get('LVErsteller'))?.trim() || undefined,
    abgabeort: rtfOderText(p.get('LVAdrOffen'))?.trim() || undefined,
    waehrung: p.get('LVWaehrung') || 'EUR',
    mwst: mwst ?? 19,
    kostengliederung: p.get('KGRTyp') || undefined,
  };
}

function ozMaskeLesen(lv: XElement): OzMaske {
  const m = erstes(lv, 'OZMask');
  if (!m) return structuredClone(STANDARD_OZ_MASKE);
  const ebene = (n: string) => {
    const e = erstes(m, n);
    return { name: attr(e, 'Name') ?? '', stellen: Number(attr(e, 'Count') ?? 2), schritt: Number(attr(e, 'Step') ?? 1), aktiv: attr(e, 'Enabled') === 'true' };
  };
  const p = ebene('OZP');
  return { ebenen: ['OZ1', 'OZ2', 'OZ3', 'OZ4'].map(ebene), position: { stellen: p.stellen || 4, schritt: p.schritt || 10 } };
}

function bieterLesen(lv: XElement): Bieter[] {
  const out: Bieter[] = [];
  for (const b of elemente(erstes(lv, 'BieterList'), 'Bieter')) {
    const id = Number(attr(b, 'BieterID'));
    const p = params(b);
    const adresse = params(erstes(erstes(b, 'CTR'), 'Address'));
    const anschrift = ['Name2', 'Name3', 'Street', 'Strasse', 'ZipCity', 'Ort']
      .map((k) => adresse.get(k))
      .filter(Boolean)
      .join('\n');
    const auf = zahl(p.get('AUF'));
    out.push({
      id,
      name: p.get('Name') ?? adresse.get('Name1') ?? (id === 0 ? 'Kostenansatz' : `Bieter ${id}`),
      ...(anschrift ? { anschrift } : {}),
      ...(auf !== null && auf !== 0 ? { nachlass: auf } : {}),
    });
  }
  if (!out.some((b) => b.id === 0)) out.unshift({ id: 0, name: 'Kostenansatz LV' });
  return out.sort((a, b) => a.id - b.id);
}

function preiseLesen(el: XElement, lvMenge: number | null): Record<string, Preis> {
  const out: Record<string, Preis> = {};
  for (const b of elemente(erstes(el, 'BieterList'), 'Bieter')) {
    const p = params(b);
    const ep = zahl(p.get('EP'));
    if (ep === null && !p.has('GB')) continue;
    const menge = zahl(p.get('ME'));
    out[attr(b, 'BieterID') ?? '0'] = { ep, ...(menge !== null && menge !== lvMenge ? { menge } : {}) };
  }
  return out;
}

function elementLesen(el: XElement): LvElement | null {
  const xmlId = zahl(attr(el, 'ID')) ?? undefined;
  const nachtrag = zahl(param(el, 'CONo')) ?? 0;
  const basis = { id: neueId(), xmlId, kurztext: text1(el), langtext: text2(el), ...(nachtrag ? { nachtrag } : {}) };
  switch (el.name) {
    case 'Folder':
      return { ...basis, art: 'abschnitt', oz: param(el, 'OZ') ?? '', kinder: elemente(erstes(el, 'ItemList')).map(elementLesen).filter((x): x is LvElement => !!x) } satisfies Abschnitt;
    case 'Point': {
      // Die LV-Menge steht meist beim Kostenansatz (Bieter 0), seltener an der Position selbst
      const menge = zahl(param(el, 'ME')) ?? zahl(param(bieterIn(el, 0), 'ME'));
      const kg = param(el, 'KostGr');
      const einheit = param(el, 'EH') ?? '';
      return {
        ...basis,
        art: 'position',
        oz: param(el, 'OZ') ?? '',
        einheit,
        menge,
        positionsart: param(el, 'EV') === '1' ? 'bedarf' : 'normal',
        ...(kg ? { kostengruppe: kg } : {}),
        preise: preiseLesen(el, menge),
        ...(/^(h|std\.?|stunden?)$/i.test(einheit.trim()) ? { stundenlohn: true } : {}),
      } satisfies Position;
    }
    case 'Hint':
      return { ...basis, art: 'hinweis' } satisfies Hinweis;
    case 'PreHint':
      return { ...basis, art: 'hinweis', vorbemerkung: true } satisfies Hinweis;
  }
  return null;
}

function einbehalteLesen(lv: XElement): Einbehalt[] {
  return elemente(erstes(erstes(lv, 'Contract'), 'HoldList'), 'Hold').map((h) => {
    const p = params(h);
    const typ = p.get('HoldType');
    const prozent = zahl(p.get('HoldPercent') ?? p.get('Percent'));
    return {
      text: p.get('Text1') ?? '',
      art: typ === 'htCO' ? 'vertragserfuellung' : typ === 'htWY' ? 'gewaehrleistung' : 'sonstig',
      brutto: p.get('HoldBrutto') !== 'False',
      ...(prozent !== null ? { prozent } : {}),
    } satisfies Einbehalt;
  });
}

export interface AslvGelesen {
  lv: Lv;
  /** Summen, wie sie in der Datei stehen (Bieter-ID → netto nach Nachlass) – zum Abgleich */
  dateiSummen: Map<number, number>;
  /** Version des Programms, das die Datei zuletzt geschrieben hat */
  programmVersion?: string;
}

export function aslvLesen(bytes: Uint8Array): AslvGelesen {
  const d = aslvDokument(bytes);
  const lv = erstes(d.wurzel, 'LV')!;
  const auftragBieter = zahl(param(lv, 'LVOrderBidderID'));
  const dateiSummen = new Map<number, number>();
  for (const b of elemente(erstes(lv, 'BieterList'), 'Bieter')) {
    const gb = zahl(param(b, 'GB'));
    if (gb !== null) dateiSummen.set(Number(attr(b, 'BieterID')), gb);
  }
  const preisanteile = elemente(erstes(lv, 'Preisanteile'))
    .filter((e) => /^PA\d$/.test(e.name))
    .map((e) => e.kinder.map((k) => (k.typ === 'text' ? k.roh : '')).join('').trim())
    .filter(Boolean);
  const order0 = elemente(erstes(erstes(lv, 'Ordering'), 'OrderList'), 'Order').find((o) => attr(o, 'OrderID') === '0');
  const auftragSumme = zahl(param(order0, 'GB'));
  return {
    lv: {
      kopf: kopfLesen(lv),
      ozMaske: ozMaskeLesen(lv),
      preisanteile: preisanteile.length ? preisanteile : ['Löhne', 'Stoffe', 'Geräte', 'Sonstige'],
      bieter: bieterLesen(lv),
      elemente: elemente(erstes(lv, 'ItemList')).map(elementLesen).filter((x): x is LvElement => !!x),
      einbehalte: einbehalteLesen(lv),
      auftrag: auftragBieter !== null && auftragBieter >= 0 ? { bieterId: auftragBieter, ...(auftragSumme !== null ? { summeNetto: auftragSumme } : {}) } : null,
      nachtraege: [],
    },
    dateiSummen,
    programmVersion: attr(lv, 'APS-Version'),
  };
}

/* ---------- Schreiben ---------- */

interface Schreiber {
  d: XDokument;
  jetzt: string;
  naechsteId: number;
  /** Elemente nach ID, die es in der Datei schon gibt */
  nachId: Map<number, XElement>;
  /** Tiefe eines Elements für die Einrückung */
  tiefe: (el: XElement) => number;
  /** das LV, wie es in der Datei steht (xmlId → Element) – Summen werden nur geschrieben, wo sich etwas geändert hat */
  basis: Map<number, LvElement>;
  basisSummen: Summen | null;
  basisLv: Lv | null;
}

/** Zahl so, wie das Originalprogramm sie schreibt: Punkt, ohne überflüssige Nullen */
export const zahlText = (n: number) => String(Number(n.toFixed(6)));

/** Parameter setzen (null = entfernen); ändert nur, was anders ist. true, wenn geändert wurde. */
function paramSetzen(s: Schreiber, el: XElement, name: string, wert: string | null): boolean {
  let liste = paramListe(el);
  const vorhanden = elemente(liste, 'Parameter').find((p) => attr(p, 'Name') === name);
  if (wert === null) {
    if (!vorhanden || !liste) return false;
    kinderSetzen(liste, elemente(liste).filter((e) => e !== vorhanden), s.tiefe(liste), s.d.zeilenende);
    return true;
  }
  if (vorhanden) return attrSetzen(vorhanden, 'Value', wert);
  if (!liste) {
    liste = neuesElement('ParameterList');
    kinderSetzen(el, [liste, ...elemente(el)], s.tiefe(el), s.d.zeilenende);
  }
  kinderSetzen(liste, [...elemente(liste), neuesElement('Parameter', [['Name', name], ['Value', wert]])], s.tiefe(liste), s.d.zeilenende);
  return true;
}

/** Zahlparameter: nur schreiben, wenn sich der Wert ändert (nicht bloß die Schreibweise) */
function zahlSetzen(s: Schreiber, el: XElement, name: string, n: number | null): boolean {
  const alt = zahl(param(el, name));
  if (n === null) return alt === null ? false : paramSetzen(s, el, name, null);
  if (alt !== null && Math.abs(alt - n) < 1e-9) return false;
  return paramSetzen(s, el, name, zahlText(n));
}

function textSetzen(s: Schreiber, el: XElement, name: string, t: string | undefined): boolean {
  const alt = param(el, name);
  const neu = t ?? '';
  if ((alt ?? '') === neu) return false;
  if (alt === undefined && !neu) return false;
  return paramSetzen(s, el, name, neu);
}

/** Text, der in der Datei als RTF stehen kann: nur ersetzen, wenn sich der lesbare Inhalt ändert */
function rtfTextSetzen(s: Schreiber, el: XElement, name: string, t: string | undefined): boolean {
  const alt = param(el, name);
  const neu = (t ?? '').trim();
  const altText = alt === undefined ? '' : istRtf(alt) ? alsText(rtfLesen(alt)).trim() : alt.trim();
  if (altText === neu) return false;
  return paramSetzen(s, el, name, istRtf(alt) || neu.includes('\n') ? rtfSchreiben(neu.split('\n').map((z) => ({ laeufe: z ? [{ text: z }] : [] })), alt) : neu);
}

function kurztextSetzen(s: Schreiber, el: XElement, kurztext: string): boolean {
  const alt = param(el, 'Text1');
  const altText = alt === undefined ? '' : istRtf(alt) ? ersteZeile(rtfLesen(alt)) : alt.trim();
  if (altText === kurztext.trim()) return false;
  return paramSetzen(s, el, 'Text1', istRtf(alt) || alt === undefined ? kurztextRtf(kurztext, alt) : kurztext);
}

function langtextSetzen(s: Schreiber, el: XElement, langtext: Formattext): boolean {
  const alt = param(el, 'Text2');
  if (gleicherText(rtfLesen(alt ?? ''), langtext)) return false;
  if (!langtext.length && alt === undefined) return false;
  return paramSetzen(s, el, 'Text2', rtfSchreiben(langtext, alt));
}

function geaendert(s: Schreiber, el: XElement) {
  attrSetzen(el, 'ChangeDate', s.jetzt);
}

/** zufällige Kennung im Stil des Originalprogramms („APNSBVTNVFOUTUCD“) */
function gaebId(): string {
  let s = 'AP';
  for (let i = 0; i < 14; i++) s += String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return s;
}

function zeitAttr(s: Schreiber): [string, string][] {
  return [
    ['CreateDate', s.jetzt],
    ['ChangeDate', s.jetzt],
  ];
}

function orderElement(s: Schreiber, id: string): XElement {
  return neuesElement('Order', [...zeitAttr(s), ['OrderID', id], ['Mirrored', 'true']], [neuesElement('ParameterList')]);
}

/** neues Element in der Form des Originalprogramms (Aufbau aus echten Dateien) */
function neuesItem(s: Schreiber, el: LvElement): XElement {
  const id = String(s.naechsteId++);
  const basis: [string, string][] = [...zeitAttr(s), ['ID', id]];
  const billing = () => neuesElement('Billing', zeitAttr(s), [neuesElement('BillList')]);
  const pl = neuesElement('ParameterList');
  if (el.art === 'abschnitt') {
    return neuesElement('Folder', basis, [
      pl,
      neuesElement('BieterList'),
      neuesElement('ItemList'),
      neuesElement('Ordering', zeitAttr(s), [neuesElement('OrderList', [], [orderElement(s, '0'), orderElement(s, ORDER_GESAMT)])]),
      billing(),
    ]);
  }
  if (el.art === 'position') return neuesElement('Point', basis, [pl, neuesElement('BieterList'), neuesElement('ItemList'), billing(), orderElement(s, '0')]);
  if (el.vorbemerkung) return neuesElement('PreHint', basis, [pl, neuesElement('ItemList')]);
  return neuesElement('Hint', basis, [pl, neuesElement('ItemList'), neuesElement('BieterList')]);
}

/** Einrückung für ein frisch angelegtes Element und alles darin */
function einruecken(s: Schreiber, el: XElement, tiefe: number) {
  const kinder = elemente(el);
  if (!kinder.length || el.kinder.some((k) => k.typ === 'text')) return;
  el.kinder = [];
  el.kurz = true;
  kinderSetzen(el, kinder, tiefe, s.d.zeilenende);
  for (const k of kinder) einruecken(s, k, tiefe + 1);
}

const TAG: Record<string, string> = { abschnitt: 'Folder', position: 'Point', hinweis: 'Hint' };

/** XML-Element zum Modell-Element: vorhandenes (gleiche ID und Art) oder neues */
function xmlFuer(s: Schreiber, el: LvElement): XElement {
  const tag = el.art === 'hinweis' && el.vorbemerkung ? 'PreHint' : TAG[el.art];
  const vorhanden = el.xmlId !== undefined ? s.nachId.get(el.xmlId) : undefined;
  if (vorhanden && vorhanden.name === tag) return vorhanden;
  const neu = neuesItem(s, el);
  paramSetzenNeu(neu, 'ApsGAEBItemID', gaebId());
  paramSetzenNeu(neu, 'MELinked', '');
  if (el.art !== 'abschnitt') {
    paramSetzenNeu(neu, 'CONo', String(el.nachtrag ?? 0));
    paramSetzenNeu(neu, 'CreatedCONo', String(el.nachtrag ?? 0));
  }
  return neu;
}

/** Parameter in einem neuen (noch nicht eingerückten) Element */
function paramSetzenNeu(el: XElement, name: string, wert: string) {
  const pl = erstes(el, 'ParameterList')!;
  pl.kinder.push(neuesElement('Parameter', [['Name', name], ['Value', wert]]));
  pl.kurz = false;
}

function bieterIn(el: XElement, id: number): XElement | undefined {
  return elemente(erstes(el, 'BieterList'), 'Bieter').find((b) => attr(b, 'BieterID') === String(id));
}

function bieterAnlegen(s: Schreiber, el: XElement, id: number, mirrored: string): XElement {
  let liste = erstes(el, 'BieterList');
  if (!liste) {
    liste = neuesElement('BieterList');
    const pl = paramListe(el);
    const kinder = elemente(el);
    const i = pl ? kinder.indexOf(pl) + 1 : 0;
    kinder.splice(i, 0, liste);
    kinderSetzen(el, kinder, s.tiefe(el), s.d.zeilenende);
  }
  const b = neuesElement('Bieter', [...zeitAttr(s), ['BieterID', String(id)], ['Mirrored', mirrored]], [neuesElement('ParameterList')]);
  const alle = [...elemente(liste, 'Bieter'), b].sort((x, y) => Number(attr(x, 'BieterID')) - Number(attr(y, 'BieterID')));
  kinderSetzen(liste, alle, s.tiefe(liste), s.d.zeilenende);
  einruecken(s, b, s.tiefe(b));
  return b;
}

function positionSchreiben(s: Schreiber, x: XElement, pos: Position, bieterIds: number[]) {
  let a = false;
  a = textSetzen(s, x, 'OZ', pos.oz) || a;
  a = kurztextSetzen(s, x, pos.kurztext) || a;
  a = langtextSetzen(s, x, pos.langtext) || a;
  a = textSetzen(s, x, 'EH', pos.einheit) || a;
  // Menge: an der Position, wenn sie dort geführt wird, und beim Kostenansatz (Bieter 0) – dort steht sie meist
  const vorherPos = pos.xmlId !== undefined ? s.basis.get(pos.xmlId) : undefined;
  if (param(x, 'ME') !== undefined) a = zahlSetzen(s, x, 'ME', pos.menge) || a;
  const mengeK = pos.preise['0']?.menge ?? pos.menge;
  const mengeAlt = vorherPos?.art === 'position' ? (vorherPos.preise['0']?.menge ?? vorherPos.menge) : undefined;
  if (mengeAlt === undefined || mengeAlt !== mengeK) {
    let b0 = bieterIn(x, 0);
    if (!b0 && mengeK !== null) b0 = bieterAnlegen(s, x, 0, 'false');
    if (b0 && zahlSetzen(s, b0, 'ME', mengeK)) {
      geaendert(s, b0);
      a = true;
    }
  }
  a = (pos.kostengruppe ? textSetzen(s, x, 'KostGr', pos.kostengruppe) : paramSetzen(s, x, 'KostGr', null)) || a;
  a = (pos.positionsart === 'bedarf' ? textSetzen(s, x, 'EV', '1') : paramSetzen(s, x, 'EV', null)) || a;
  const vorher = vorherPos;
  for (const id of bieterIds) {
    const preis = pos.preise[String(id)];
    let b = bieterIn(x, id);
    const ep = preis?.ep ?? null;
    if (vorher?.art === 'position' && b && gleicherPreis(vorher, pos, id)) continue;
    if (ep === null) {
      if (b) {
        a = paramSetzen(s, b, 'EP', null) || a;
        a = paramSetzen(s, b, 'GB', null) || a;
        a = paramSetzen(s, b, 'GBoA', null) || a;
      }
      continue;
    }
    if (!b) {
      b = bieterAnlegen(s, x, id, 'false');
      a = true;
    }
    const menge = preis?.menge ?? pos.menge ?? 0;
    const gb = Math.round((preis?.pauschal ?? menge * ep) * 100) / 100;
    let ba = zahlSetzen(s, b, 'EP', ep);
    ba = zahlSetzen(s, b, 'GBoA', gb) || ba;
    ba = zahlSetzen(s, b, 'GB', gb) || ba;
    if (ba) geaendert(s, b);
    a = ba || a;
  }
  if (a) geaendert(s, x);
}

/** gleiche Menge und gleicher Preis wie in der Datei? */
function gleicherPreis(alt: Position, neu: Position, id: number): boolean {
  const a = alt.preise[String(id)];
  const n = neu.preise[String(id)];
  if (alt.menge !== neu.menge) return false;
  return (a?.ep ?? null) === (n?.ep ?? null) && (a?.menge ?? null) === (n?.menge ?? null) && (a?.pauschal ?? null) === (n?.pauschal ?? null);
}

function folderSummenSchreiben(s: Schreiber, x: XElement, el: Abschnitt, abschnittSummen: Map<number, number>, bieterIds: number[]) {
  let a = false;
  const alt = el.xmlId !== undefined ? s.basis.get(el.xmlId) : undefined;
  const altSummen = alt && s.basisSummen ? s.basisSummen.abschnitte.get(alt.id) : undefined;
  for (const id of bieterIds) {
    const summe = Math.round((abschnittSummen.get(id) ?? 0) * 100) / 100;
    if (altSummen && Math.abs((altSummen.get(id) ?? 0) - summe) < 0.005) continue;
    let b = bieterIn(x, id);
    if (!b) {
      if (!summe) continue;
      b = bieterAnlegen(s, x, id, 'false');
    }
    let ba = zahlSetzen(s, b, 'GBoA', summe);
    ba = zahlSetzen(s, b, 'GB', summe) || ba;
    if (ba) geaendert(s, b);
    a = ba || a;
  }
  if (a) geaendert(s, x);
}

function elementeSchreiben(s: Schreiber, liste: XElement, model: LvElement[], lv: Lv, sums: ReturnType<typeof summen>, bieterIds: number[]) {
  const neu: XElement[] = [];
  const angelegt: XElement[] = [];
  for (const el of model) {
    const x = xmlFuer(s, el);
    if (!s.nachId.has(Number(attr(x, 'ID')))) angelegt.push(x);
    neu.push(x);
  }
  // Elemente, die die App nicht kennt (andere Tags), bleiben an ihrer Stelle am Ende erhalten
  const fremd = elemente(liste).filter((e) => !['Folder', 'Point', 'Hint', 'PreHint'].includes(e.name));
  kinderSetzen(liste, [...neu, ...fremd], s.tiefe(liste), s.d.zeilenende);
  for (const x of angelegt) einruecken(s, x, s.tiefe(x));
  model.forEach((el, i) => {
    const x = neu[i];
    if (el.art === 'position') positionSchreiben(s, x, el, bieterIds);
    else {
      let a = kurztextSetzen(s, x, el.kurztext);
      a = langtextSetzen(s, x, el.langtext) || a;
      if (el.art === 'abschnitt') {
        a = textSetzen(s, x, 'OZ', el.oz) || a;
        if (a) geaendert(s, x);
        let kinderListe = erstes(x, 'ItemList');
        if (!kinderListe) {
          kinderListe = neuesElement('ItemList');
          const k = elemente(x);
          k.splice(2, 0, kinderListe);
          kinderSetzen(x, k, s.tiefe(x), s.d.zeilenende);
        }
        elementeSchreiben(s, kinderListe, el.kinder, lv, sums, bieterIds);
        folderSummenSchreiben(s, x, el, sums.abschnitte.get(el.id) ?? new Map(), bieterIds);
      } else if (a) geaendert(s, x);
    }
  });
}

function kopfSchreiben(s: Schreiber, lvEl: XElement, k: LvKopf) {
  const p = params(lvEl);
  let a = false;
  a = textSetzen(s, lvEl, 'Text1', k.bezeichnung) || a;
  a = textSetzen(s, lvEl, 'LVNr', k.nummer) || a;
  const datum = (name: string, wert: string | undefined) => {
    const alt = p.get(name);
    const altWert = name === 'LVDateOffen' ? zeitpunktLesen(alt) : datumLesen(alt);
    if ((altWert ?? '') === (wert ?? '')) return false;
    return paramSetzen(s, lvEl, name, wert ? datumSchreiben(wert, alt) : '');
  };
  a = datum('LVDate', k.datum) || a;
  a = datum('LVDateOffen', k.eroeffnung) || a;
  a = datum('LVDateFrist', k.bindefrist) || a;
  a = datum('LVDateBegin', k.ausfuehrungVon) || a;
  a = datum('LVDateEnde', k.ausfuehrungBis) || a;
  a = textSetzen(s, lvEl, 'LVVergabeArt', k.vergabeart) || a;
  a = rtfTextSetzen(s, lvEl, 'LVPrBez', k.projekt) || a;
  a = textSetzen(s, lvEl, 'LVPrName', k.projektName && p.get('LVPrName')?.trim() === k.projektName ? p.get('LVPrName') : k.projektName) || a;
  a = rtfTextSetzen(s, lvEl, 'LVAGAdr', k.auftraggeber) || a;
  a = rtfTextSetzen(s, lvEl, 'LVErsteller', k.ersteller) || a;
  a = rtfTextSetzen(s, lvEl, 'LVAdrOffen', k.abgabeort) || a;
  a = textSetzen(s, lvEl, 'LVWaehrung', k.waehrung) || a;
  a = zahlSetzen(s, lvEl, 'LVMwSt', k.mwst) || a;
  a = textSetzen(s, lvEl, 'KGRTyp', k.kostengliederung) || a;
  if (a) geaendert(s, lvEl);
}

function ozMaskeSchreiben(lvEl: XElement, m: OzMaske) {
  const maske = erstes(lvEl, 'OZMask');
  if (!maske) return;
  ['OZ1', 'OZ2', 'OZ3', 'OZ4'].forEach((n, i) => {
    const e = erstes(maske, n);
    const ebene = m.ebenen[i];
    if (!e || !ebene) return;
    attrSetzen(e, 'Name', ebene.name);
    attrSetzen(e, 'Count', String(ebene.stellen));
    attrSetzen(e, 'Step', String(ebene.schritt));
    attrSetzen(e, 'Enabled', ebene.aktiv ? 'true' : 'false');
  });
  const p = erstes(maske, 'OZP');
  if (p) {
    attrSetzen(p, 'Count', String(m.position.stellen));
    attrSetzen(p, 'Step', String(m.position.schritt));
  }
  attrSetzen(maske, 'Count', String(m.ebenen.filter((e) => e.aktiv).length));
}

function bieterSchreiben(s: Schreiber, lvEl: XElement, lv: Lv, sums: ReturnType<typeof summen>) {
  const liste = erstes(lvEl, 'BieterList');
  const ids = new Set(lv.bieter.map((b) => b.id));
  // entfernte Bieter: in der Liste und in allen Positionen und Abschnitten
  const alle = (el: XElement): XElement[] => [el, ...elemente(el).flatMap(alle)];
  for (const el of alle(lvEl)) {
    const bl = erstes(el, 'BieterList');
    if (!bl) continue;
    const bleiben = elemente(bl).filter((b) => b.name !== 'Bieter' || ids.has(Number(attr(b, 'BieterID'))));
    if (bleiben.length !== elemente(bl).length) kinderSetzen(bl, bleiben, s.tiefe(bl), s.d.zeilenende);
  }
  for (const b of lv.bieter) {
    let x = liste ? bieterIn(lvEl, b.id) : undefined;
    if (!x) {
      x = bieterAnlegen(s, lvEl, b.id, b.id === 0 ? 'false' : 'true');
      const ctr = neuesElement('CTR', zeitAttr(s), [neuesElement('ParameterList'), neuesElement('Address', zeitAttr(s), [neuesElement('ParameterList')])]);
      kinderSetzen(x, [...elemente(x), ctr], s.tiefe(x), s.d.zeilenende);
      einruecken(s, ctr, s.tiefe(ctr));
    }
    const sum = sums.bieter.get(b.id);
    const nameNeu = param(x, 'Name') !== b.name;
    let a = textSetzen(s, x, 'Name', b.name);
    const adresse = erstes(erstes(x, 'CTR'), 'Address');
    if (adresse && (nameNeu || param(adresse, 'Name1') === undefined)) {
      const aa = textSetzen(s, adresse, 'Name1', b.name);
      if (aa) geaendert(s, adresse);
    }
    a = zahlSetzen(s, x, 'AUF', b.nachlass ? b.nachlass : param(x, 'AUF') !== undefined ? 0 : null) || a;
    const altSumme = s.basisSummen?.bieter.get(b.id);
    const altBieter = s.basisLv?.bieter.find((y) => y.id === b.id);
    const unveraendert =
      !!altSumme && !!sum && !!s.basisLv && Math.abs(altSumme.ohneNachlass - sum.ohneNachlass) < 0.005 && (altBieter?.nachlass ?? 0) === (b.nachlass ?? 0) && s.basisLv.kopf.mwst === lv.kopf.mwst;
    if (sum && !unveraendert) {
      a = zahlSetzen(s, x, 'GBoA', sum.ohneNachlass) || a;
      a = zahlSetzen(s, x, 'GB', sum.netto) || a;
      a = zahlSetzen(s, x, 'GBMwSt', sum.mwst) || a;
      a = zahlSetzen(s, x, 'GBBrutto', sum.brutto) || a;
    }
    if (a) geaendert(s, x);
  }
}

function auftragSchreiben(s: Schreiber, lvEl: XElement, lv: Lv, sums: ReturnType<typeof summen>) {
  const alt = zahl(param(lvEl, 'LVOrderBidderID'));
  const neu = lv.auftrag ? lv.auftrag.bieterId : -1;
  if (alt === null && neu === -1) return;
  let a = zahlSetzen(s, lvEl, 'LVOrderBidderID', neu);
  if (lv.auftrag) {
    const sum = sums.bieter.get(lv.auftrag.bieterId);
    const netto = lv.auftrag.summeNetto ?? sum?.netto ?? 0;
    const nachtraege = lv.nachtraege.filter((n) => n.status === 'beauftragt').reduce((x, n) => x + (n.betrag ?? sums.nachtraege.get(n.nr) ?? 0), 0);
    const mwst = lv.kopf.mwst / 100;
    const r = (x: number) => Math.round(x * 100) / 100;
    for (const o of elemente(erstes(erstes(lvEl, 'Ordering'), 'OrderList'), 'Order')) {
      const id = attr(o, 'OrderID');
      const n = id === '0' ? netto : id === ORDER_GESAMT ? netto + nachtraege : null;
      if (n === null) continue;
      let oa = zahlSetzen(s, o, 'GB', r(n));
      oa = zahlSetzen(s, o, 'GBBrutto', r(r(n) * (1 + mwst))) || oa;
      if (oa) geaendert(s, o);
      a = oa || a;
    }
  }
  if (a) geaendert(s, lvEl);
}

/**
 * Schreibt das LV in die vorhandene Datei: liest `bytes` frisch und ändert nur, was im Modell anders ist.
 * Ohne Änderung kommt `bytes` unverändert zurück.
 */
export function aslvSchreiben(bytes: Uint8Array, lv: Lv, jetzt = new Date()): Uint8Array {
  const d = aslvDokument(bytes);
  const vorher = xmlSchreiben(d);
  const lvEl = erstes(d.wurzel, 'LV')!;
  const nachId = new Map<number, XElement>();
  let maxId = Number(attr(lvEl, 'ID') ?? 0);
  const sammle = (el: XElement) => {
    for (const k of elemente(el)) {
      if (['Folder', 'Point', 'Hint', 'PreHint'].includes(k.name)) {
        const id = Number(attr(k, 'ID'));
        if (Number.isFinite(id)) {
          nachId.set(id, k);
          maxId = Math.max(maxId, id);
        }
      }
      sammle(k);
    }
  };
  sammle(lvEl);
  const tiefen = new Map<XElement, number>();
  const basisLv = aslvLesen(bytes).lv;
  const basis = new Map<number, LvElement>();
  const merke = (liste: LvElement[]) => {
    for (const e of liste) {
      if (e.xmlId !== undefined) basis.set(e.xmlId, e);
      if (e.art === 'abschnitt') merke(e.kinder);
    }
  };
  merke(basisLv.elemente);
  const s: Schreiber = {
    d,
    jetzt: jetztText(jetzt),
    naechsteId: maxId + 1,
    nachId,
    basis,
    basisSummen: summen(basisLv),
    basisLv,
    tiefe: (el) => {
      let t = tiefen.get(el);
      if (t === undefined) {
        t = tiefeVon(d.wurzel, el);
        if (t < 0) t = 0;
        tiefen.set(el, t);
      }
      return t;
    },
  };
  const sums = summen(lv);
  const bieterIds = lv.bieter.map((b) => b.id);
  kopfSchreiben(s, lvEl, lv.kopf);
  ozMaskeSchreiben(lvEl, lv.ozMaske);
  bieterSchreiben(s, lvEl, lv, sums);
  tiefen.clear();
  let liste = erstes(lvEl, 'ItemList');
  if (!liste) {
    liste = neuesElement('ItemList');
    const k = elemente(lvEl);
    const nachBieter = k.findIndex((e) => e.name === 'BieterList');
    k.splice(nachBieter >= 0 ? nachBieter + 1 : k.length, 0, liste);
    kinderSetzen(lvEl, k, 1, d.zeilenende);
  }
  elementeSchreiben(s, liste, lv.elemente, lv, sums, bieterIds);
  tiefen.clear();
  auftragSchreiben(s, lvEl, lv, sums);
  const nachher = xmlSchreiben(d);
  if (nachher === vorher) return bytes;
  return aslvPacken(nachher);
}

/** Neue LV-Datei aus dem Modell (z. B. „Als LV-Datei speichern“): aus einer leeren Vorlage im Originalaufbau */
export function aslvNeu(lv: Lv, jetzt = new Date()): Uint8Array {
  const t = jetztText(jetzt);
  const z = (_: string) => `CreateDate="${t}" ChangeDate="${t}"`;
  const xml =
    '﻿<?xml version="1.0" encoding="UTF-8"?>\r\n' +
    `<AVAPLANStudio V="V1.0" T="LV">\r\n` +
    `  <LV ${z('lv')} ID="1" Data-Version="1">\r\n` +
    '    <GRGen ID="0"/>\r\n    <TEGen ID="0"/>\r\n' +
    `    <Preisanteile>\r\n      <Count>${lv.preisanteile.length}</Count>\r\n` +
    [1, 2, 3, 4, 5, 6].map((i) => `      <PA${i}>${(lv.preisanteile[i - 1] ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</PA${i}>\r\n`).join('') +
    '    </Preisanteile>\r\n' +
    `    <OZMask Count="2">\r\n      <OZL Name="" Count="1" Step="1" Enabled="true"/>\r\n      <OZ1 Name="Abschnitt" Count="2" Step="1" Enabled="true"/>\r\n      <OZ2 Name="Titel" Count="2" Step="1" Enabled="false"/>\r\n      <OZ3 Name="" Count="2" Step="1" Enabled="false"/>\r\n      <OZ4 Name="" Count="2" Step="1" Enabled="false"/>\r\n      <OZP Name="" Count="4" Step="10" Enabled="true"/>\r\n    </OZMask>\r\n` +
    '    <ParameterList/>\r\n' +
    '    <BieterList/>\r\n' +
    '    <ItemList/>\r\n' +
    `    <Billing ${z('b')}>\r\n      <BillList/>\r\n    </Billing>\r\n` +
    `    <Ordering ${z('o')}>\r\n      <OrderList>\r\n        <Order ${z('o0')} OrderID="0" Mirrored="true">\r\n          <ParameterList/>\r\n        </Order>\r\n        <Order ${z('om')} OrderID="${ORDER_GESAMT}" Mirrored="true">\r\n          <ParameterList/>\r\n        </Order>\r\n      </OrderList>\r\n    </Ordering>\r\n` +
    `    <Contract ${z('c')}>\r\n      <ParameterList/>\r\n      <HoldList/>\r\n    </Contract>\r\n` +
    `    <Paying ${z('p')}>\r\n      <PayList/>\r\n    </Paying>\r\n` +
    `    <Summary ${z('s')}>\r\n      <ParameterList/>\r\n    </Summary>\r\n` +
    '  </LV>\r\n</AVAPLANStudio>\r\n';
  // Einbehalte wie im Original
  const leer = aslvPacken(xml);
  const d = aslvDokument(leer);
  const lvEl = erstes(d.wurzel, 'LV')!;
  const holds = erstes(erstes(lvEl, 'Contract'), 'HoldList')!;
  const s: Schreiber = { d, jetzt: t, naechsteId: 2, nachId: new Map(), tiefe: (el) => Math.max(0, tiefeVon(d.wurzel, el)), basis: new Map(), basisSummen: null, basisLv: null };
  const neu = lv.einbehalte.map((e) => {
    const h = neuesElement('Hold', zeitAttr(s), [neuesElement('ParameterList')]);
    paramSetzenNeu(h, 'Text1', e.text);
    paramSetzenNeu(h, 'HoldType', e.art === 'vertragserfuellung' ? 'htCO' : e.art === 'gewaehrleistung' ? 'htWY' : 'htOT');
    paramSetzenNeu(h, 'HoldBrutto', e.brutto ? 'True' : 'False');
    return h;
  });
  kinderSetzen(holds, neu, s.tiefe(holds), d.zeilenende);
  for (const h of neu) einruecken(s, h, s.tiefe(h));
  // die OZ-Maske des Modells, dann alles Weitere über den gewöhnlichen Weg
  const ohneIds: Lv = { ...lv, elemente: ohneXmlIds(lv.elemente) };
  return aslvSchreiben(aslvPacken(xmlSchreiben(d)), ohneIds, jetzt);
}

function ohneXmlIds(el: LvElement[]): LvElement[] {
  return el.map((e) => (e.art === 'abschnitt' ? { ...e, xmlId: undefined, kinder: ohneXmlIds(e.kinder) } : { ...e, xmlId: undefined }));
}

/** kopiert ein XML-Element (für Tests und Vorlagen) */
export const elementKopie = kopie;
