/**
 * Adapter der Rechtsquellen: holen eine Fassung und liefern sie im gemeinsamen Format (`Fassung`) mit Prüfsummen.
 *
 *  - gesetze-im-internet.de: XML je Gesetz (ZIP), bedingte Abfrage über ETag
 *  - Rechtsinformationssystem des Bundes (RIS): Fassung zum Stichtag, HTML je Werk
 *  - recht.nrw.de: stabiler Link „aktuellste Fassung“ (Meta-Refresh), Fassungsliste mit künftigen Fassungen
 *  - Dateien (Ortsrecht): PDF oder HTML, Paragrafen aus dem Text; Änderung an der SHA-256 der Datei
 *  - Muster-Verwaltungsvorschrift Technische Baubestimmungen (DIBt): neueste Ausgabe aus der Linkliste
 *
 * Keine Quelle wird blind übernommen: Jeder Adapter prüft, dass er etwas Sinnvolles gelesen hat (`plausibel`).
 */

import { unzipSync } from 'fflate';
import type { Paragraf } from './index';
import type { Holen } from './netz';
import { alsText, holenOk, istFehlerseite, NetzFehler } from './netz';
import { entschluesseln, isoDatum, pruefsummen, sha256, titelOhneFussnote, zeileNormal, zeilen } from './text';
import type { Fassung, QuellenRef } from './typen';

/** Grunddaten einer Norm (aus dem Modul) */
export interface NormKopf {
  id: string;
  kurz: string;
  titel: string;
}

/** Fehler: die Quelle lieferte nichts Brauchbares (Parser gebrochen, Seite umgebaut, Fehlerseite) */
export class QuellenFehler extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuellenFehler';
  }
}

const jetzt = () => new Date().toISOString();

function plausibel(paragrafen: Record<string, Paragraf>, mindestens: number, was: string): void {
  const n = Object.keys(paragrafen).length;
  if (n < mindestens) throw new QuellenFehler(`${was}: nur ${n} Paragrafen gelesen – die Quelle hat sich vermutlich geändert`);
}

/* ---------- gesetze-im-internet.de ---------- */

const GII = 'https://www.gesetze-im-internet.de';

/** Paragrafen aus dem XML von gesetze-im-internet.de */
export function giiParagrafen(xml: string, pfad: string): { paragrafen: Record<string, Paragraf>; stand: string; builddate: string } {
  const paragrafen: Record<string, Paragraf> = {};
  let stand = '';
  let builddate = /builddate="(\d{8})/.exec(xml)?.[1] ?? '';
  for (const m of xml.matchAll(/<norm\b([^>]*)>([\s\S]*?)<\/norm>/g)) {
    const n = m[2];
    const b = /builddate="(\d{8})/.exec(m[1])?.[1];
    if (b && b > builddate) builddate = b;
    if (!stand) {
      const s = [...n.matchAll(/<standkommentar>([\s\S]*?)<\/standkommentar>/g)].map((x) => zeileNormal(entschluesseln(x[1].replace(/<[^>]+>/g, ''))));
      const z = s.find((x) => /zuletzt geändert/i.test(x)) ?? s.find((x) => /neugefasst/i.test(x));
      if (z) stand = z;
    }
    const enbez = entschluesseln(/<enbez>([\s\S]*?)<\/enbez>/.exec(n)?.[1] ?? '').trim();
    const nr = /^§+\s*(\d+[a-z]*)$/i.exec(enbez)?.[1];
    if (!nr) continue;
    const titel = titelOhneFussnote(entschluesseln((/<titel[^>]*>([\s\S]*?)<\/titel>/.exec(n)?.[1] ?? '').replace(/<[^>]+>/g, '')));
    const inhalt = /<text format="XML">([\s\S]*?)<\/text>/.exec(n)?.[1] ?? '';
    const text = zeilen(inhalt.replace(/<FnR[^>]*\/>/g, ''));
    paragrafen[nr] = { titel, url: `${GII}/${pfad}/__${nr}.html`, text: text.length ? text : titel === '(weggefallen)' ? ['(weggefallen)'] : [] };
  }
  const bd = builddate ? `${builddate.slice(0, 4)}-${builddate.slice(4, 6)}-${builddate.slice(6, 8)}` : '';
  return { paragrafen, stand, builddate: bd };
}

export async function giiHolen(h: Holen, kopf: NormKopf, pfad: string, vorher?: Pick<Fassung, 'etag' | 'geaendert'>): Promise<Fassung | 'unveraendert'> {
  const url = `${GII}/${pfad}/xml.zip`;
  const r = await holenOk(h, url, { etag: vorher?.etag, geaendert: vorher?.geaendert, unveraendertErlaubt: true });
  if (r.status === 304) return 'unveraendert';
  let zip: Record<string, Uint8Array>;
  try {
    zip = unzipSync(r.daten);
  } catch {
    throw new QuellenFehler(`${kopf.kurz}: Antwort von gesetze-im-internet.de ist kein ZIP`);
  }
  const datei = Object.keys(zip).find((k) => k.toLowerCase().endsWith('.xml'));
  if (!datei) throw new QuellenFehler(`${kopf.kurz}: kein XML im Archiv`);
  const xml = new TextDecoder('utf-8').decode(zip[datei]);
  const { paragrafen, stand, builddate } = giiParagrafen(xml, pfad);
  plausibel(paragrafen, 3, kopf.kurz);
  return {
    id: kopf.id,
    kurz: kopf.kurz,
    titel: kopf.titel,
    fassung: stand ? `Stand ${builddate.split('-').reverse().join('.')} (${stand})` : `Stand ${builddate.split('-').reverse().join('.')}`,
    url: `${GII}/${pfad}/`,
    paragrafen,
    gueltigAb: builddate,
    abgerufen: jetzt(),
    quelle: { art: 'gii', pfad },
    summen: await pruefsummen(paragrafen),
    kennung: `gii:${pfad}:${builddate}`,
    etag: r.etag,
    geaendert: r.geaendert,
  };
}

/* ---------- Rechtsinformationssystem des Bundes ---------- */

export const RIS = 'https://testphase.rechtsinformationen.bund.de';

/** Paragrafen aus dem HTML des RIS (LegalDocML) */
export function risParagrafen(html: string, basis: string): Record<string, Paragraf> {
  const paragrafen: Record<string, Paragraf> = {};
  const teile = html.split(/<h2 class="einzelvorschrift"/).slice(1);
  for (const t of teile) {
    const kopf = t.slice(0, t.indexOf('</h2>'));
    const nr = /<span class="akn-num"[^>]*>\s*§+\s*(\d+[a-z]*)\s*<\/span>/.exec(kopf)?.[1];
    if (!nr) continue;
    const titel = titelOhneFussnote(entschluesseln((/<span class="akn-heading"[^>]*>([\s\S]*?)<\/span>/.exec(kopf)?.[1] ?? '').replace(/<[^>]+>/g, '')));
    const rumpf = t.slice(t.indexOf('</h2>') + 5).split(/<div data-period=|<h2 class=/)[0];
    const text = zeilen(rumpf.replace(/(<span class="akn-num"[^>]*>[^<]*<\/span>)/g, '$1 ').replace(/<(sup|a) class="[^"]*fussnote[^"]*"[\s\S]*?<\/\1>/g, ''));
    // Artikel-Adresse nach dem Schema des RIS: …/regelungstext-1/art-z19.html
    paragrafen[nr] = { titel, url: `${basis}/art-z${nr}.html`, text };
  }
  return paragrafen;
}

interface RisEintrag {
  legislationIdentifier: string;
  name?: string;
  abbreviation?: string;
  encoding?: { contentUrl: string; encodingFormat: string }[];
}

/** RIS-Ausdrücke eines Werks (`eli/bund/…`); `mostRelevantOn` liefert genau den am Stichtag geltenden */
async function risAusdruecke(h: Holen, eli: string, q: string): Promise<RisEintrag[]> {
  const r = await holenOk(h, `${RIS}/v1/legislation?eli=${encodeURIComponent(eli)}&${q}`);
  const d = JSON.parse(alsText(r)) as { member?: { item: RisEintrag }[] };
  return (d.member ?? []).map((m) => m.item);
}

/** Fehler: das RIS führt das Werk (noch) nicht – dann gilt der Rückfall auf gesetze-im-internet.de */
export class NichtImRis extends QuellenFehler {}

export async function risHolen(h: Holen, kopf: NormKopf, eli: string, stichtag: string): Promise<Fassung> {
  const [eintrag] = await risAusdruecke(h, eli, `mostRelevantOn=${stichtag}&size=1`);
  if (!eintrag) throw new NichtImRis(`${kopf.kurz}: im Rechtsinformationssystem des Bundes nicht vorhanden`);
  const ausdruck = eintrag.legislationIdentifier;
  const zeitpunkt = ausdruck.split('/')[5] ?? '';
  const html = eintrag.encoding?.find((e) => e.encodingFormat === 'text/html')?.contentUrl;
  if (!html) throw new QuellenFehler(`${kopf.kurz}: RIS liefert keinen HTML-Text`);
  const r = await holenOk(h, `${RIS}${html}`);
  const basis = `${RIS}${html.replace(/\.html$/, '')}`;
  const paragrafen = risParagrafen(alsText(r), basis);
  plausibel(paragrafen, 3, kopf.kurz);
  // spätere Ausdrücke (künftige Fassungen), soweit das RIS sie schon führt
  const spaeter = (await risAusdruecke(h, eli, `temporalCoverageFrom=${stichtag}&size=20`).catch(() => [] as RisEintrag[]))
    .map((e) => ({ gueltigAb: e.legislationIdentifier.split('/')[5] ?? '', url: `${RIS}/v1/legislation/${e.legislationIdentifier}` }))
    .filter((e) => e.gueltigAb > zeitpunkt);
  return {
    id: kopf.id,
    kurz: kopf.kurz,
    titel: eintrag.name ?? kopf.titel,
    fassung: `gültig ab ${zeitpunkt.split('-').reverse().join('.')}`,
    url: `${RIS}/v1/legislation/${ausdruck}`,
    paragrafen,
    gueltigAb: zeitpunkt,
    abgerufen: jetzt(),
    quelle: { art: 'ris', eli },
    summen: await pruefsummen(paragrafen),
    kennung: ausdruck,
    ...(spaeter.length ? { kuenftige: spaeter } : {}),
  };
}

/* ---------- recht.nrw.de ---------- */

export const RECHT_NRW = 'https://recht.nrw.de';

/** Ziel eines Meta-Refresh (Term-Link „aktuellste Fassung“) */
export const metaRefresh = (html: string) => /<meta[^>]+http-equiv="refresh"[^>]+content="\d+;\s*url=([^"]+)"/i.exec(html)?.[1];

export interface NrwSeite {
  paragrafen: Record<string, Paragraf>;
  gueltigAb?: string;
  gueltigBis?: string;
  aufgehoben?: string;
  titel?: string;
  /** alle Fassungen der Seite: Datum und Adresse */
  fassungen: { gueltigAb: string; url: string }[];
  term?: number;
}

/** Infobox, Fassungsliste und Paragrafen einer Seite von recht.nrw.de */
export function nrwSeite(html: string, url: string): NrwSeite {
  const infobox = /id="block-rnrw-legal-document-info-box"([\s\S]*?)(id="block-rnrw-attachments"|<section class="legaldoc-article">)/.exec(html)?.[1] ?? html.slice(0, 200000);
  const ib = zeilen(infobox).join(' ');
  const gueltigAb = isoDatum(/Gültig ab\s*([0-9.]{8,10})/.exec(ib)?.[1]);
  const gueltigBis = isoDatum(/Gültig bis\s*([0-9.]{8,10})/.exec(ib)?.[1]);
  const aufgehobenText = /Aufgehoben durch[^;.]*/.exec(zeilen(html.slice(html.indexOf('changeHistory') >= 0 ? html.indexOf('changeHistory') : 0)).join(' '))?.[0];
  const term = Number(/href="\/taxonomy\/term\/(\d+)"[^>]*>\s*Link zur aktuellsten Fassung/.exec(html)?.[1]) || undefined;
  const titel = zeileNormal(entschluesseln(/<title>([^<|]*)/.exec(html)?.[1] ?? ''));
  const fassungen: { gueltigAb: string; url: string }[] = [];
  for (const m of html.matchAll(/<li class="version-item[^"]*">([\s\S]*?)<\/li>/g)) {
    const datum = isoDatum(zeilen(m[1]).join(' '));
    const href = /href=['"]([^'"]+)['"]/.exec(m[1])?.[1];
    if (datum) fassungen.push({ gueltigAb: datum, url: href ? new URL(href, RECHT_NRW).toString() : url });
  }
  const paragrafen: Record<string, Paragraf> = {};
  for (const teil of html.split('<section class="legaldoc-article">').slice(1)) {
    const abschnitt = teil.split('</section>')[0];
    // Nummer mit oder ohne §-Zeichen (LWG „104a“); Sektionen ohne Nummer (Eingangsformel, Teil-Überschriften) entfallen
    const nr = /field--field_num">\s*(?:§+\s*)?(\d+[a-z]?)\s*</.exec(abschnitt)?.[1];
    if (!nr) continue;
    const anker = /id="(ss-[^"]+)"/.exec(teil)?.[1];
    const titel = titelOhneFussnote(entschluesseln((/field--field_headline">([\s\S]*?)<\/span>/.exec(abschnitt)?.[1] ?? '').replace(/<[^>]+>/g, '')));
    const start = abschnitt.indexOf('field--field_text');
    // Fußnoten stehen vor dem Text und gehören nicht dazu
    const text = start < 0 ? [] : zeilen(abschnitt.slice(abschnitt.indexOf('>', start) + 1));
    if (paragrafen[nr]) continue;
    paragrafen[nr] = { titel, url: anker ? `${url}#${anker}` : url, text };
  }
  return { paragrafen, gueltigAb, gueltigBis, aufgehoben: aufgehobenText, titel, fassungen, term };
}

/** Seite holen; Meta-Refresh (Term-Link) folgen */
async function nrwLaden(h: Holen, url: string): Promise<{ html: string; url: string }> {
  let r = await holenOk(h, url);
  let html = alsText(r);
  const ziel = metaRefresh(html);
  if (ziel) {
    r = await holenOk(h, new URL(ziel, RECHT_NRW).toString());
    html = alsText(r);
  }
  if (istFehlerseite(html)) throw new QuellenFehler(`${url}: Fehlerseite`);
  return { html, url: r.url.replace(/\/$/, '') };
}

/**
 * Fassung von recht.nrw.de. Ohne Stichtag die heute geltende (Term-Link); mit Stichtag die Fassung aus der
 * Fassungsliste, die an dem Tag gilt – auch eine künftige.
 */
export async function rechtNrwHolen(h: Holen, kopf: NormKopf, ref: { term?: number; url?: string }, stichtag?: string): Promise<Fassung> {
  const start = ref.term ? `${RECHT_NRW}/taxonomy/term/${ref.term}` : ref.url;
  if (!start) throw new QuellenFehler(`${kopf.kurz}: weder Term-ID noch Adresse`);
  let { html, url } = await nrwLaden(h, start);
  let seite = nrwSeite(html, url);
  if (stichtag && seite.fassungen.length) {
    // die Fassung mit dem jüngsten Gültig-ab, das nicht nach dem Stichtag liegt
    const passend = [...seite.fassungen].filter((f) => f.gueltigAb <= stichtag).sort((a, b) => b.gueltigAb.localeCompare(a.gueltigAb))[0];
    if (passend && passend.gueltigAb !== seite.gueltigAb && passend.url.replace(/\/$/, '') !== url) {
      ({ html, url } = await nrwLaden(h, passend.url));
      seite = nrwSeite(html, url);
    }
  }
  plausibel(seite.paragrafen, 2, kopf.kurz);
  const gueltigAb = seite.gueltigAb ?? seite.fassungen.find((f) => f.url.replace(/\/$/, '') === url)?.gueltigAb ?? /\/(\d{2})(\d{2})(\d{4})-/.exec(url)?.slice(1, 4).reverse().join('-');
  if (!gueltigAb) throw new QuellenFehler(`${kopf.kurz}: kein „Gültig ab“ auf der Seite`);
  const kuenftige = seite.fassungen.filter((f) => f.gueltigAb > gueltigAb);
  return {
    id: kopf.id,
    kurz: kopf.kurz,
    titel: kopf.titel,
    fassung: `gültig ab ${gueltigAb.split('-').reverse().join('.')}${seite.gueltigBis ? ` bis ${seite.gueltigBis.split('-').reverse().join('.')}` : ''}`,
    url,
    paragrafen: seite.paragrafen,
    gueltigAb,
    ...(seite.gueltigBis ? { gueltigBis: seite.gueltigBis } : {}),
    ...(seite.aufgehoben ? { aufgehoben: seite.aufgehoben } : {}),
    abgerufen: jetzt(),
    quelle: { art: 'recht-nrw', ...(ref.term ? { term: ref.term } : {}), ...(ref.url ? { url: ref.url } : {}) },
    summen: await pruefsummen(seite.paragrafen),
    kennung: url,
    ...(kuenftige.length ? { kuenftige } : {}),
  };
}

/* ---------- Dateien (Ortsrecht) ---------- */

/**
 * Paragrafen aus dem Text einer Satzung: Ein Paragraf beginnt mit einer kurzen Zeile „§ 3“ bzw. „§ 3 Titel“ am
 * Zeilenanfang (Verweise im Fließtext „gemäß § 3“ zählen nicht). Absätze „(1)“ bleiben eigene Zeilen; Zeilen, die
 * mitten im Satz umbrechen, werden zusammengefügt.
 */
export function satzungParagrafen(textZeilen: string[], url: string): Record<string, Paragraf> {
  const paragrafen: Record<string, Paragraf> = {};
  let aktuell: { nr: string; titel: string; text: string[] } | null = null;
  const fertig = () => {
    if (aktuell && !paragrafen[aktuell.nr]) paragrafen[aktuell.nr] = { titel: aktuell.titel, url, text: zusammenfuegen(aktuell.text) };
  };
  for (const roh of textZeilen) {
    const z = zeileNormal(roh);
    if (!z) continue;
    // Ausfertigung „Soest, den 28.01.2022“ beendet den letzten Paragrafen
    if (/^[A-ZÄÖÜ][\wäöüß .()-]{1,40},\s*(den\s+)?\d{1,2}\.\d{1,2}\.\d{4}/.test(z)) {
      fertig();
      aktuell = null;
      continue;
    }
    const kopf = /^§\s*(\d+[a-z]?)\b\.?\s*(.*)$/.exec(z);
    if (kopf && z.length < 140 && !/^§\s*\d+[a-z]?\s+(Abs|Absatz|Satz|Nr|BauGB|BauO|LNatSchG|BNatSchG|GO|des|der|dieser)\b/i.test(z)) {
      fertig();
      aktuell = { nr: kopf[1], titel: titelOhneFussnote(kopf[2]), text: [] };
      continue;
    }
    if (aktuell && !aktuell.titel && !/^\(\d/.test(z) && aktuell.text.length === 0 && z.length < 120) {
      aktuell.titel = titelOhneFussnote(z);
      continue;
    }
    aktuell?.text.push(z);
  }
  fertig();
  return paragrafen;
}

/** Zeilen eines PDF-Umbruchs zusammenfügen: neue Zeile nur bei Absatz „(n)“, Aufzählung „1.“ / „a)“ / „-“ */
function zusammenfuegen(z: string[]): string[] {
  const out: string[] = [];
  for (const zeile of z) {
    const neu = /^(\(\d+[a-z]?\)|\d+\.\s|[a-z]\)\s|[-–•]\s)/.test(zeile) || !out.length;
    if (neu) out.push(zeile);
    else {
      const letzte = out[out.length - 1];
      out[out.length - 1] = letzte.endsWith('-') && /^[a-zäöüß]/.test(zeile) ? letzte.slice(0, -1) + zeile : `${letzte} ${zeile}`;
    }
  }
  return out;
}

/** Text einer PDF als Zeilen (pdf.js; Zeilen nach der Lage der Textstücke) */
export async function pdfZeilen(daten: Uint8Array): Promise<string[]> {
  const lib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (typeof window !== 'undefined' && typeof Worker !== 'undefined' && !lib.GlobalWorkerOptions.workerSrc) {
    lib.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  }
  const doc = await lib.getDocument({ data: daten.slice(), useSystemFonts: false }).promise;
  const out: string[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const seite = await doc.getPage(n);
      const inhalt = await seite.getTextContent();
      let zeile = '';
      let y: number | null = null;
      for (const it of inhalt.items as { str?: string; transform?: number[]; hasEOL?: boolean }[]) {
        if (typeof it.str !== 'string') continue;
        const ty: number | null = it.transform?.[5] ?? y;
        if (y !== null && ty !== null && Math.abs(ty - y) > 2 && zeile.trim()) {
          out.push(zeile);
          zeile = '';
        }
        zeile += it.str;
        y = ty;
        if (it.hasEOL) {
          out.push(zeile);
          zeile = '';
        }
      }
      if (zeile.trim()) out.push(zeile);
    }
  } finally {
    await doc.loadingTask.destroy();
  }
  return out.map(zeileNormal).filter(Boolean);
}

/** Datum der Satzung aus dem Text: „vom 28.01.2022“, „Soest, den 14.11.2023“ – das jüngste Datum der Ausfertigung */
export function satzungsDatum(textZeilen: string[]): string | undefined {
  const kandidaten = textZeilen.flatMap((z) => [...z.matchAll(/(?:vom|den)\s+(\d{1,2}\.\d{1,2}\.\d{4})/g)].map((m) => isoDatum(m[1])!));
  return kandidaten.sort().pop();
}

export async function dateiHolen(
  h: Holen,
  kopf: NormKopf,
  ref: Extract<QuellenRef, { art: 'datei' }>,
  o: { vorher?: Pick<Fassung, 'etag' | 'geaendert' | 'kennung'>; textAusPaket?: (pfad: string) => Promise<Record<string, Paragraf> | null> } = {},
): Promise<Fassung | 'unveraendert'> {
  const r = await holenOk(h, ref.url, { etag: o.vorher?.etag, geaendert: o.vorher?.geaendert, unveraendertErlaubt: true });
  if (r.status === 304) return 'unveraendert';
  const summe = await sha256(r.daten);
  if (o.vorher?.kennung === `sha256:${summe}`) return 'unveraendert';
  let paragrafen: Record<string, Paragraf>;
  let texterkennung = false;
  let datum: string | undefined;
  if (ref.textebene === false) {
    // Scan: Text aus dem Regelpaket – gilt nur, solange die Datei an der Quelle dieselbe ist
    if (ref.sha256 && ref.sha256 !== summe) throw new QuellenFehler(`${kopf.kurz}: Die Datei an der Quelle hat sich geändert – der erkannte Text muss neu erstellt werden`);
    const t = ref.text && o.textAusPaket ? await o.textAusPaket(ref.text) : null;
    if (!t) throw new QuellenFehler(`${kopf.kurz}: Scan ohne Textebene und ohne Text im Regelpaket`);
    paragrafen = t;
    texterkennung = true;
  } else {
    let z: string[];
    if (ref.format === 'pdf') z = await pdfZeilen(r.daten);
    else {
      const html = alsText(r);
      if (istFehlerseite(html)) throw new QuellenFehler(`${kopf.kurz}: Fehlerseite unter ${ref.url}`);
      z = zeilen(html);
    }
    paragrafen = satzungParagrafen(z, ref.url);
    datum = satzungsDatum(z);
    plausibel(paragrafen, 1, kopf.kurz);
  }
  return {
    id: kopf.id,
    kurz: kopf.kurz,
    titel: kopf.titel,
    fassung: datum ? `vom ${datum.split('-').reverse().join('.')}` : `Datei vom ${new Date().toLocaleDateString('de-DE')}`,
    url: ref.url,
    paragrafen,
    gueltigAb: datum ?? new Date().toISOString().slice(0, 10),
    abgerufen: jetzt(),
    quelle: ref,
    summen: await pruefsummen(paragrafen),
    kennung: `sha256:${summe}`,
    etag: r.etag,
    geaendert: r.geaendert,
    ...(texterkennung ? { texterkennung: true } : {}),
  };
}

/**
 * Norm aus mehreren Dokumenten (Stammfassung plus Änderungen): je Paragraf zählt das jüngste Dokument, das ihn
 * enthält (z. B. Altstadtsatzung Soest 2023, § 20: nicht geänderte Paragrafen der Fassung 2013 gelten fort).
 */
export async function zusammengesetztHolen(h: Holen, kopf: NormKopf, ref: Extract<QuellenRef, { art: 'zusammengesetzt' }>): Promise<Fassung> {
  const teile = [...ref.teile].sort((a, b) => a.fassung.localeCompare(b.fassung));
  const paragrafen: Record<string, Paragraf> = {};
  const kennungen: string[] = [];
  for (const t of teile) {
    const f = await dateiHolen(h, kopf, { art: 'datei', url: t.url, format: t.format });
    if (f === 'unveraendert') continue;
    kennungen.push(f.kennung);
    Object.assign(paragrafen, f.paragrafen);
  }
  plausibel(paragrafen, 1, kopf.kurz);
  const gueltigAb = teile[teile.length - 1].fassung;
  return {
    id: kopf.id,
    kurz: kopf.kurz,
    titel: kopf.titel,
    fassung: `Fassung vom ${gueltigAb.split('-').reverse().join('.')} (zusammengesetzt aus ${teile.length} Dokumenten)`,
    url: teile[teile.length - 1].url,
    paragrafen,
    gueltigAb,
    abgerufen: jetzt(),
    quelle: ref,
    summen: await pruefsummen(paragrafen),
    kennung: kennungen.join('+'),
  };
}

/* ---------- Linklisten (Ortsrecht, Amtsblätter, DIBt) ---------- */

export interface Link {
  url: string;
  text: string;
}

/** Links einer Übersichtsseite (absolut), ohne Anker und Doppelte */
export function links(html: string, basis: string): Link[] {
  const out = new Map<string, Link>();
  for (const m of html.matchAll(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(entschluesseln(m[1]), basis).toString();
      if (!out.has(url)) out.set(url, { url, text: zeileNormal(entschluesseln(m[2].replace(/<[^>]+>/g, ' '))) });
    } catch {
      // ungültige Adresse – übergehen
    }
  }
  return [...out.values()];
}

export async function listeHolen(h: Holen, url: string): Promise<Link[]> {
  const r = await holenOk(h, url);
  const html = alsText(r);
  if (istFehlerseite(html)) throw new QuellenFehler(`${url}: Fehlerseite`);
  const l = links(html, r.url || url);
  if (l.length < 3) throw new QuellenFehler(`${url}: kaum Links gefunden – die Seite hat sich vermutlich geändert`);
  return l;
}

/** Was sich an einer Linkliste geändert hat */
export function listenAenderung(alt: Link[], neu: Link[]): { neu: Link[]; weg: Link[] } {
  const a = new Set(alt.map((l) => l.url));
  const n = new Set(neu.map((l) => l.url));
  return { neu: neu.filter((l) => !a.has(l.url)), weg: alt.filter((l) => !n.has(l.url)) };
}

/* ---------- MVV TB (DIBt) ---------- */

/** Neueste Ausgabe der MVV TB in der Linkliste des DIBt: „MVVTB_2025-1.pdf“ (ohne Druckfehlerberichtigungen) */
export function mvvtbAusgabe(l: Link[]): { ausgabe: string; url: string } | null {
  const a = l
    .map((x) => ({ x, m: /MVV_?TB_(\d{4})-(\d)(?:_inkl[^/]*)?\.pdf$/i.exec(x.url) }))
    .filter((e): e is { x: Link; m: RegExpExecArray } => !!e.m && !/berichtigung|aenderung|mitteilung/i.test(e.x.url))
    .sort((p, q) => q.m[1].localeCompare(p.m[1]) || q.m[2].localeCompare(p.m[2]));
  return a.length ? { ausgabe: `${a[0].m[1]}/${a[0].m[2]}`, url: a[0].x.url } : null;
}

/** Tag + Monate (für „gilt sechs Monate nach Veröffentlichung“) */
export function plusMonate(iso: string, monate: number): string {
  const [j, m, t] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1 + monate, t));
  return d.toISOString().slice(0, 10);
}

/** Veröffentlichung einer MVV-TB-Ausgabe aus dem Text der PDF („Ausgabe 2025/1 vom 20. Mai 2025“ o. ä.) */
export function mvvtbDatum(textZeilen: string[]): string | undefined {
  const kopf = textZeilen.slice(0, 80).join(' ');
  return isoDatum(/(?:vom|Stand|Fassung)\s*:?\s*(\d{1,2}\.\d{1,2}\.\d{4})/.exec(kopf)?.[1]) ?? (() => {
    const m = /(\d{1,2})\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/.exec(kopf);
    if (!m) return undefined;
    const i = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'].indexOf(m[2]);
    return `${m[3]}-${String(i + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  })();
}

export async function mvvtbHolen(h: Holen, kopf: NormKopf, ref: Extract<QuellenRef, { art: 'mvvtb' }>): Promise<Fassung> {
  const l = await listeHolen(h, ref.seite);
  const a = mvvtbAusgabe(l);
  if (!a) throw new QuellenFehler(`${kopf.kurz}: keine Ausgabe der MVV TB in der Liste des DIBt gefunden`);
  const r = await holenOk(h, a.url);
  const z = await pdfZeilen(r.daten);
  const veroeffentlicht = mvvtbDatum(z);
  // Gliederung der MVV TB: Abschnitte „A 1.2.3“ usw. – bewertet werden diese Nummern, nicht die DIN-Normen
  const paragrafen: Record<string, Paragraf> = {};
  let nr: string | null = null;
  for (const zeile of z) {
    const m = /^([A-D])\s?(\d+(?:\.\d+){0,3})\s+(.{3,120})$/.exec(zeile);
    if (m) {
      nr = `${m[1]} ${m[2]}`;
      paragrafen[nr] ??= { titel: m[3], url: a.url, text: [] };
      continue;
    }
    if (nr) paragrafen[nr].text.push(zeile);
  }
  plausibel(paragrafen, 5, kopf.kurz);
  const gueltigAb = veroeffentlicht ? plusMonate(veroeffentlicht, ref.monate) : '';
  if (!gueltigAb) throw new NetzFehler(`${kopf.kurz}: Datum der Veröffentlichung nicht erkennbar`, a.url);
  return {
    id: kopf.id,
    kurz: kopf.kurz,
    titel: `${kopf.titel} (Ausgabe ${a.ausgabe})`,
    fassung: `Ausgabe ${a.ausgabe}, veröffentlicht ${veroeffentlicht!.split('-').reverse().join('.')}, gilt ab ${gueltigAb.split('-').reverse().join('.')}`,
    url: a.url,
    paragrafen,
    gueltigAb,
    abgerufen: jetzt(),
    quelle: ref,
    summen: await pruefsummen(paragrafen),
    kennung: `mvvtb:${a.ausgabe}`,
  };
}

/* ---------- eine Quelle holen ---------- */

export interface HolenOptionen {
  /** Stichtag (JJJJ-MM-TT): welche Fassung; ohne Angabe die heute geltende */
  stichtag?: string;
  /** zuletzt geholte Fassung (für bedingte Abfragen) */
  vorher?: Fassung;
  /** Text eines Scans aus dem Regelpaket */
  textAusPaket?: (pfad: string) => Promise<Record<string, Paragraf> | null>;
}

/** Fassung einer Norm aus ihrer Quelle; `unveraendert`, wenn die Quelle seit `vorher` gleich geblieben ist */
export async function fassungHolen(h: Holen, kopf: NormKopf, quelle: QuellenRef, o: HolenOptionen = {}): Promise<Fassung | 'unveraendert'> {
  const stichtag = o.stichtag ?? new Date().toISOString().slice(0, 10);
  switch (quelle.art) {
    case 'gii':
      return giiHolen(h, kopf, quelle.pfad, o.vorher);
    case 'ris':
      try {
        return await risHolen(h, kopf, quelle.eli, stichtag);
      } catch (e) {
        if (e instanceof NichtImRis && quelle.gii) return giiHolen(h, kopf, quelle.gii, o.vorher?.quelle.art === 'gii' ? o.vorher : undefined);
        throw e;
      }
    case 'recht-nrw':
      return rechtNrwHolen(h, kopf, quelle, o.stichtag);
    case 'datei':
      return dateiHolen(h, kopf, quelle, { vorher: o.vorher, textAusPaket: o.textAusPaket });
    case 'zusammengesetzt':
      return zusammengesetztHolen(h, kopf, quelle);
    case 'mvvtb':
      return mvvtbHolen(h, kopf, quelle);
    case 'verweis':
      throw new QuellenFehler(`${kopf.kurz}: nur Fundstelle, kein Text`);
  }
}
