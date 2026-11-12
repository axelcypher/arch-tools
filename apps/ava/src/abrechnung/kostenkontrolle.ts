/**
 * Kostenkontrolle des Büros (Excel): Rechnungsliste mit laufender Nummer, Übersicht nach Kostengruppen mit
 * Kostenschätzung, Kostenanschlag und Kostenfeststellung je Gewerk, dazu ein Blatt je Gewerk mit den Aufträgen
 * (Kostenanschlag) und den Rechnungen (Kostenfeststellung).
 *
 * Die Mappe wird nicht nach festen Zelladressen gelesen, sondern nach ihren Beschriftungen („Kostenanschlag“,
 * „Kostenfeststellung“, „Rechn. Datum“ …) – Blätter mit abweichender Zeilenzahl (z. B. 15 Aufträge) oder
 * Leerzeichen im Blattnamen („G 8“) werden so ebenfalls erkannt. Geschrieben wird nur in einzelne Zellen
 * (Werte, nie Formeln, Formate oder Zeilen); danach sieht die Mappe aus wie vorher und funktioniert ohne die App.
 */

import type { Blatt, GeleseneMappe, ZellAenderungen, ZellInhalt, Zelle } from '@core/dokumente/xlsx';
import { adresse, excelZuDatum, stilIstDatum, xlsxLesen, zellName } from '@core/dokumente/xlsx';
import { gewerkKennung } from './gewerk';

export interface KkZeile {
  /** Zeile im Blatt */
  zeile: number;
  nr: number | string | null;
  text: string;
  /** JJJJ-MM-TT */
  datum?: string;
  betrag: number | null;
}

export interface KkRechnung extends KkZeile {
  /** Gewerk wie eingetragen („G08“) und vereinheitlicht („G8“) */
  gewerkRoh: string;
  gewerk: string | null;
  freigabe?: string;
  bemerkung?: string;
}

export interface KkSpalten {
  gewerk: number;
  nr: number;
  text: number;
  datum: number;
  freigabe: number;
  betrag: number;
  bemerkung: number;
}

export interface KkRechnungsliste {
  blatt: number;
  blattName: string;
  kopfZeile: number;
  spalten: KkSpalten;
  rechnungen: KkRechnung[];
  /** erste leere Zeile (für die nächste Rechnung) */
  freieZeile: number;
  /** nächste freie Rechnungsnummer */
  naechsteNr: number;
}

export interface KkBereich {
  /** Zeile der Beschriftung („Kostenanschlag“) – in Spalte `summenSpalte` die Summe */
  zeile: number;
  von: number;
  bis: number;
  summe: number | null;
  eintraege: KkZeile[];
}

export interface KkGewerkBlatt {
  blatt: number;
  blattName: string;
  /** vereinheitlicht aus E1 bzw. dem Blattnamen */
  gewerk: string | null;
  /** E1, falls abweichend vom Blattnamen (Kopierfehler) */
  kennungImBlatt?: string;
  bezeichnung: string;
  auftragnehmer: string;
  /** Zelle des Auftragnehmers */
  auftragnehmerZelle?: string;
  kostenschaetzung: number | null;
  anschlag: KkBereich;
  feststellung: KkBereich;
  spalten: { nr: number; text: number; datum: number; betrag: number; summe: number };
}

export interface KkUebersichtZeile {
  zeile: number;
  gewerk: string;
  bezeichnung: string;
  schaetzung: number | null;
  anschlag: number | null;
  feststellung: number | null;
}

export interface Kostenkontrolle {
  projekt: string;
  titel: string;
  rechnungsliste: KkRechnungsliste | null;
  gewerke: KkGewerkBlatt[];
  uebersicht: { blatt: number; zeilen: KkUebersichtZeile[]; zielsumme: number | null } | null;
  /** Auffälligkeiten beim Lesen (nie blockierend) */
  hinweise: string[];
  mappe: GeleseneMappe;
}

/* ---------- Zellen ---------- */

const zelle = (b: Blatt, z: number, s: number): Zelle | undefined => b.zellen.get(zellName(z, s));
const textVon = (b: Blatt, z: number, s: number): string => {
  const c = zelle(b, z, s);
  return c?.wert === null || c?.wert === undefined ? '' : String(c.wert).trim();
};
const zahlVon = (b: Blatt, z: number, s: number): number | null => {
  const w = zelle(b, z, s)?.wert;
  return typeof w === 'number' ? w : null;
};
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[.:]/g, '').trim();

function datumVon(m: GeleseneMappe, b: Blatt, z: number, s: number): string | undefined {
  const c = zelle(b, z, s);
  if (!c || typeof c.wert !== 'number') return undefined;
  if (!stilIstDatum(m.stile, c.stil) && (c.wert < 20000 || c.wert > 80000)) return undefined;
  const d = excelZuDatum(c.wert, m.intern.datum1904);
  return d.toISOString().slice(0, 10);
}

/** Zeile/Spalte einer Beschriftung im Blatt (erste passende Zelle) */
function finde(b: Blatt, passt: (t: string) => boolean, nurSpalte?: number): { zeile: number; spalte: number } | null {
  let best: { zeile: number; spalte: number } | null = null;
  for (const c of b.zellen.values()) {
    if (typeof c.wert !== 'string' || (nurSpalte && c.spalte !== nurSpalte)) continue;
    if (!passt(norm(c.wert))) continue;
    if (!best || c.zeile < best.zeile || (c.zeile === best.zeile && c.spalte < best.spalte)) best = { zeile: c.zeile, spalte: c.spalte };
  }
  return best;
}

/** SUM-Bereich einer Formel: „SUM(D16:D25)“ → Zeilen 16–25 */
function summenBereich(formel: string | null | undefined): { von: number; bis: number; spalte: number } | null {
  const m = formel ? /SUM\(\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)\)/i.exec(formel) : null;
  if (!m) return null;
  return { von: Number(m[2]), bis: Number(m[4]), spalte: adresse(`${m[1]}1`).spalte };
}

/* ---------- Rechnungsliste ---------- */

function rechnungslisteLesen(m: GeleseneMappe, hinweise: string[]): KkRechnungsliste | null {
  const nr = m.blaetter.findIndex((b) => /rechnungsliste/i.test(b.name));
  const kandidaten = nr >= 0 ? [nr] : m.blaetter.map((_, i) => i);
  for (const i of kandidaten) {
    const b = m.blaetter[i];
    const g = finde(b, (t) => t === 'gewerk');
    if (!g) continue;
    const z = g.zeile;
    const kopf = new Map<string, number>();
    for (let s = 1; s <= b.spalten; s++) kopf.set(norm(textVon(b, z, s)), s);
    const suche = (...namen: RegExp[]) => {
      for (const [t, s] of kopf) if (namen.some((n) => n.test(t))) return s;
      return 0;
    };
    const spalten: KkSpalten = {
      gewerk: g.spalte,
      nr: suche(/^nr$/, /^nummer$/, /^lfd/),
      text: suche(/^rechnung$/, /^firma/, /^bezeichnung/),
      datum: suche(/rechn.*datum/, /^datum$/),
      freigabe: suche(/freigabe/),
      betrag: suche(/betrag/),
      bemerkung: suche(/bemerk/),
    };
    if (!spalten.nr || !spalten.betrag) continue;
    const rechnungen: KkRechnung[] = [];
    let freieZeile = 0;
    let maxNr = 0;
    for (let zeile = z + 1; zeile <= b.zeilen + 1; zeile++) {
      const gewerkRoh = textVon(b, zeile, spalten.gewerk);
      const text = spalten.text ? textVon(b, zeile, spalten.text) : '';
      const betrag = zahlVon(b, zeile, spalten.betrag);
      const nrWert = zelle(b, zeile, spalten.nr)?.wert ?? null;
      if (!gewerkRoh && !text && betrag === null) {
        if (!freieZeile && zeile > z + 1) freieZeile = zeile;
        // nach drei leeren Zeilen ohne Nummernformel ist die Liste zu Ende
        if (zeile > (freieZeile || zeile) + 2 && !zelle(b, zeile, spalten.nr)?.formel) break;
        continue;
      }
      if (freieZeile) {
        hinweise.push(`Rechnungsliste: Eintrag in Zeile ${zeile} nach einer leeren Zeile (${freieZeile}).`);
        freieZeile = 0;
      }
      const nrText = typeof nrWert === 'number' ? nrWert : typeof nrWert === 'string' && nrWert.trim() ? nrWert.trim() : null;
      if (typeof nrText === 'number') maxNr = Math.max(maxNr, nrText);
      rechnungen.push({
        zeile,
        gewerkRoh,
        gewerk: gewerkKennung(gewerkRoh),
        nr: nrText,
        text,
        datum: spalten.datum ? datumVon(m, b, zeile, spalten.datum) : undefined,
        freigabe: spalten.freigabe ? datumVon(m, b, zeile, spalten.freigabe) : undefined,
        betrag,
        bemerkung: spalten.bemerkung ? textVon(b, zeile, spalten.bemerkung) || undefined : undefined,
      });
    }
    if (!freieZeile) freieZeile = (rechnungen[rechnungen.length - 1]?.zeile ?? z) + 1;
    // Nummer der freien Zeile aus ihrer Formel (fortlaufend), sonst die höchste + 1
    const vorgabe = zahlVon(b, freieZeile, spalten.nr);
    const naechsteNr = vorgabe !== null && vorgabe > maxNr ? vorgabe : maxNr + 1;
    return { blatt: i, blattName: b.name, kopfZeile: z, spalten, rechnungen, freieZeile, naechsteNr };
  }
  hinweise.push('Keine Rechnungsliste gefunden (Blatt mit den Spalten „Gewerk“, „Nr.“ und „Betrag“).');
  return null;
}

/* ---------- Gewerkblätter ---------- */

function bereichLesen(m: GeleseneMappe, b: Blatt, label: { zeile: number; spalte: number }, bisVorgabe: number, sp: KkGewerkBlatt['spalten']): KkBereich {
  // Summe rechts neben der Beschriftung; ihr SUM-Bereich gibt die Zeilen vor
  let summe: number | null = null;
  let bereich: { von: number; bis: number } | null = null;
  for (let s = label.spalte + 1; s <= Math.max(b.spalten, label.spalte + 6); s++) {
    const c = zelle(b, label.zeile, s);
    const sb = summenBereich(c?.formel);
    if (sb) {
      bereich = sb;
      sp.summe = s;
      sp.betrag = sb.spalte;
      summe = typeof c?.wert === 'number' ? c.wert : null;
      break;
    }
  }
  const von = bereich?.von ?? label.zeile + 1;
  const bis = bereich?.bis ?? bisVorgabe;
  const eintraege: KkZeile[] = [];
  for (let z = von; z <= bis; z++) {
    const text = textVon(b, z, sp.text);
    const betrag = zahlVon(b, z, sp.betrag);
    if (!text && betrag === null) continue;
    const nrWert = zelle(b, z, sp.nr)?.wert ?? null;
    eintraege.push({ zeile: z, nr: typeof nrWert === 'number' || typeof nrWert === 'string' ? nrWert : null, text, datum: datumVon(m, b, z, sp.datum), betrag });
  }
  return { zeile: label.zeile, von, bis, summe, eintraege };
}

function gewerkBlattLesen(m: GeleseneMappe, i: number, hinweise: string[]): KkGewerkBlatt | null {
  const b = m.blaetter[i];
  const ka = finde(b, (t) => t === 'kostenanschlag');
  const kf = finde(b, (t) => t === 'kostenfeststellung');
  if (!ka || !kf || kf.zeile <= ka.zeile) return null;
  const sp = { nr: 1, text: ka.spalte, datum: ka.spalte + 1, betrag: ka.spalte + 2, summe: ka.spalte + 3 };
  // Spaltenköpfe „Datum“ / „Einzelsummen“ über dem Bereich, falls vorhanden
  for (let z = ka.zeile - 1; z >= Math.max(1, ka.zeile - 4); z--) {
    for (let s = 1; s <= b.spalten; s++) {
      const t = norm(textVon(b, z, s));
      if (t === 'datum') sp.datum = s;
      if (t.startsWith('einzelsumme')) sp.betrag = s;
      if (t.startsWith('gesamtsumme')) sp.summe = s;
    }
  }
  const wert = (label: RegExp) => {
    const l = finde(b, (t) => label.test(t), sp.text);
    if (!l) return { text: '', zahl: null as number | null, zelle: undefined as string | undefined };
    for (let s = l.spalte + 1; s <= b.spalten + 1; s++) {
      const c = zelle(b, l.zeile, s);
      if (c && c.wert !== null && c.wert !== '') return { text: String(c.wert).trim(), zahl: typeof c.wert === 'number' ? c.wert : null, zelle: zellName(l.zeile, s) };
    }
    return { text: '', zahl: null, zelle: zellName(l.zeile, sp.summe) };
  };
  const anschlag = bereichLesen(m, b, ka, kf.zeile - 2, sp);
  const feststellung = bereichLesen(m, b, kf, b.zeilen, { ...sp });
  const e1 = gewerkKennung(textVon(b, 1, sp.summe) || textVon(b, 1, 5));
  const ausName = gewerkKennung(b.name);
  const gewerk = ausName ?? e1;
  if (e1 && ausName && e1 !== ausName) hinweise.push(`Blatt „${b.name.trim()}“: In der Kopfzeile steht ${e1} – vermutlich beim Kopieren nicht angepasst.`);
  const an = wert(/^auftragnehmer/);
  return {
    blatt: i,
    blattName: b.name,
    gewerk,
    ...(e1 && e1 !== gewerk ? { kennungImBlatt: e1 } : {}),
    bezeichnung: wert(/^gewerk/).text,
    auftragnehmer: an.text,
    auftragnehmerZelle: an.zelle,
    kostenschaetzung: wert(/^kostenschätzung/).zahl,
    anschlag,
    feststellung,
    spalten: sp,
  };
}

/* ---------- Übersicht ---------- */

function uebersichtLesen(m: GeleseneMappe): Kostenkontrolle['uebersicht'] {
  const i = m.blaetter.findIndex((b) => /übersicht|uebersicht/i.test(b.name));
  if (i < 0) return null;
  const b = m.blaetter[i];
  const ks = finde(b, (t) => t === 'kostenschätzung');
  const ka = finde(b, (t) => t === 'kostenanschlag');
  const kf = finde(b, (t) => t === 'kostenfeststellung');
  const ziel = finde(b, (t) => t === 'zielsumme');
  const zeilen: KkUebersichtZeile[] = [];
  for (let z = 1; z <= b.zeilen; z++) {
    const g = gewerkKennung(textVon(b, z, 1));
    if (!g) continue;
    zeilen.push({
      zeile: z,
      gewerk: g,
      bezeichnung: textVon(b, z, 2),
      schaetzung: ks ? zahlVon(b, z, ks.spalte) : null,
      anschlag: ka ? zahlVon(b, z, ka.spalte) : null,
      feststellung: kf ? zahlVon(b, z, kf.spalte) : null,
    });
  }
  return { blatt: i, zeilen, zielsumme: ziel ? zahlVon(b, ziel.zeile + 1, ziel.spalte) : null };
}

/* ---------- Mappe ---------- */

export function kostenkontrolleLesen(bytes: Uint8Array): Kostenkontrolle {
  const mappe = xlsxLesen(bytes);
  const hinweise: string[] = [];
  const rechnungsliste = rechnungslisteLesen(mappe, hinweise);
  const gewerke: KkGewerkBlatt[] = [];
  mappe.blaetter.forEach((_, i) => {
    const g = gewerkBlattLesen(mappe, i, hinweise);
    if (g) gewerke.push(g);
  });
  const liste = rechnungsliste ? mappe.blaetter[rechnungsliste.blatt] : undefined;
  // Projekt und Titel stehen über der Rechnungsliste rechts (G1, G3)
  let projekt = '';
  let titel = '';
  if (liste && rechnungsliste) {
    for (let s = rechnungsliste.spalten.bemerkung || 7; s >= 1 && !projekt; s--) {
      projekt = textVon(liste, 1, s);
      titel = textVon(liste, 3, s);
    }
  }
  return { projekt, titel, rechnungsliste, gewerke, uebersicht: uebersichtLesen(mappe), hinweise, mappe };
}

/** Gewerkblatt zu einem Gewerk */
export const gewerkBlatt = (kk: Kostenkontrolle, gewerk: string) => kk.gewerke.find((g) => g.gewerk === gewerk) ?? null;

/* ---------- Ändern ---------- */

export interface NeueRechnung {
  gewerk: string;
  /** wie das Gewerk in der Rechnungsliste geschrieben wird (Vorgabe: wie die übrigen Einträge, z. B. „G8“) */
  gewerkText?: string;
  text: string;
  datum?: string;
  freigabe?: string;
  /** freigegebener Betrag (Zahlungsfreigabe) */
  betrag: number;
  bemerkung?: string;
  /** Nummer von Hand (sonst die nächste freie) */
  nr?: number | string;
}

export interface Aenderung {
  aenderungen: ZellAenderungen;
  /** vergebene Rechnungsnummer */
  nr?: number | string;
  /** was eingetragen wird, für die Rückfrage („Rechnungsliste Zeile 63, G8-Blatt Zeile 37“) */
  beschreibung: string[];
}

function setze(a: ZellAenderungen, blatt: number, r: string, inhalt: ZellInhalt) {
  if (!a.has(blatt)) a.set(blatt, new Map());
  a.get(blatt)!.set(r, inhalt);
}

/** Schreibweise der Gewerke in der Rechnungsliste übernehmen (G8 oder G08) */
function gewerkSchreibweise(kk: Kostenkontrolle, gewerk: string): string {
  const roh = kk.rechnungsliste?.rechnungen.map((r) => r.gewerkRoh.trim()).filter((g) => gewerkKennung(g)) ?? [];
  const zweistellig = roh.filter((g) => /^G0\d/i.test(g)).length > roh.length / 2;
  const n = Number(gewerk.slice(1));
  return zweistellig ? `G${String(n).padStart(2, '0')}` : `G${n}`;
}

/**
 * Neue Rechnung eintragen: in die nächste freie Zeile der Rechnungsliste (Nummer aus der Formel der Zeile bzw.
 * die nächste freie) und in die Kostenfeststellung des Gewerkblatts (nächste freie Zeile im Summenbereich).
 */
export function rechnungEintragen(kk: Kostenkontrolle, r: NeueRechnung): Aenderung {
  const a: ZellAenderungen = new Map();
  const beschreibung: string[] = [];
  const rl = kk.rechnungsliste;
  if (!rl) throw new Error('Die Kostenkontrolle hat keine Rechnungsliste.');
  const blatt = kk.mappe.blaetter[rl.blatt];
  const z = rl.freieZeile;
  const nrZelle = zelle(blatt, z, rl.spalten.nr);
  let nr: number | string = r.nr ?? rl.naechsteNr;
  if (r.nr === undefined && nrZelle?.formel && typeof nrZelle.wert === 'number') nr = nrZelle.wert;
  else setze(a, rl.blatt, zellName(z, rl.spalten.nr), typeof nr === 'number' ? { zahl: nr } : { text: String(nr) });
  setze(a, rl.blatt, zellName(z, rl.spalten.gewerk), { text: r.gewerkText ?? gewerkSchreibweise(kk, r.gewerk) });
  if (rl.spalten.text) setze(a, rl.blatt, zellName(z, rl.spalten.text), { text: r.text });
  const vorlage = rl.rechnungen[rl.rechnungen.length - 1]?.zeile;
  if (rl.spalten.datum && r.datum) setze(a, rl.blatt, zellName(z, rl.spalten.datum), { datum: r.datum, ...(vorlage ? { stilVon: zellName(vorlage, rl.spalten.datum) } : {}) });
  if (rl.spalten.freigabe && r.freigabe) setze(a, rl.blatt, zellName(z, rl.spalten.freigabe), { datum: r.freigabe, ...(vorlage ? { stilVon: zellName(vorlage, rl.spalten.freigabe) } : {}) });
  setze(a, rl.blatt, zellName(z, rl.spalten.betrag), { zahl: r.betrag });
  if (rl.spalten.bemerkung && r.bemerkung) setze(a, rl.blatt, zellName(z, rl.spalten.bemerkung), { text: r.bemerkung });
  beschreibung.push(`${rl.blattName}: Zeile ${z}, Nr. ${nr}`);
  const g = gewerkBlatt(kk, r.gewerk);
  if (g) {
    const f = g.feststellung;
    const frei = freieZeileIn(kk.mappe.blaetter[g.blatt], f, g.spalten);
    if (frei === null) {
      beschreibung.push(`Blatt „${g.blattName.trim()}“: Kostenfeststellung voll (Zeilen ${f.von}–${f.bis}) – bitte dort von Hand eintragen.`);
    } else {
      const sp = g.spalten;
      const nrZ = zelle(kk.mappe.blaetter[g.blatt], frei, sp.nr);
      if (!nrZ?.formel) setze(a, g.blatt, zellName(frei, sp.nr), typeof nr === 'number' ? { zahl: nr } : { text: String(nr) });
      setze(a, g.blatt, zellName(frei, sp.text), { text: r.text });
      const v = f.eintraege[f.eintraege.length - 1]?.zeile;
      if (r.datum) setze(a, g.blatt, zellName(frei, sp.datum), { datum: r.datum, ...(v ? { stilVon: zellName(v, sp.datum) } : {}) });
      setze(a, g.blatt, zellName(frei, sp.betrag), { zahl: r.betrag });
      beschreibung.push(`Blatt „${g.blattName.trim()}“: Kostenfeststellung Zeile ${frei}`);
    }
  } else beschreibung.push(`Kein Gewerkblatt für ${r.gewerk} – nur in der Rechnungsliste eingetragen.`);
  return { aenderungen: a, nr, beschreibung };
}

function freieZeileIn(b: Blatt, bereich: KkBereich, sp: KkGewerkBlatt['spalten']): number | null {
  for (let z = bereich.von; z <= bereich.bis; z++) {
    const leer = !textVon(b, z, sp.text) && zahlVon(b, z, sp.betrag) === null;
    if (leer) return z;
  }
  return null;
}

export interface NeuerAuftrag {
  gewerk: string;
  text: string;
  datum?: string;
  /** Auftragssumme brutto */
  betrag: number;
  /** Auftragnehmer im Kopf des Gewerkblatts eintragen, falls leer */
  auftragnehmer?: string;
}

/** Auftrag (bzw. Nachtrag) in den Kostenanschlag des Gewerkblatts eintragen */
export function auftragEintragen(kk: Kostenkontrolle, auftrag: NeuerAuftrag): Aenderung {
  const g = gewerkBlatt(kk, auftrag.gewerk);
  if (!g) throw new Error(`Die Kostenkontrolle hat kein Blatt für ${auftrag.gewerk}.`);
  const b = kk.mappe.blaetter[g.blatt];
  const frei = freieZeileIn(b, g.anschlag, g.spalten);
  if (frei === null) throw new Error(`Blatt „${g.blattName.trim()}“: Kostenanschlag voll (Zeilen ${g.anschlag.von}–${g.anschlag.bis}).`);
  const a: ZellAenderungen = new Map();
  setze(a, g.blatt, zellName(frei, g.spalten.text), { text: auftrag.text });
  const v = g.anschlag.eintraege[g.anschlag.eintraege.length - 1]?.zeile;
  if (auftrag.datum) setze(a, g.blatt, zellName(frei, g.spalten.datum), { datum: auftrag.datum, ...(v ? { stilVon: zellName(v, g.spalten.datum) } : {}) });
  setze(a, g.blatt, zellName(frei, g.spalten.betrag), { zahl: auftrag.betrag });
  const beschreibung = [`Blatt „${g.blattName.trim()}“: Kostenanschlag Zeile ${frei}`];
  if (auftrag.auftragnehmer && !g.auftragnehmer && g.auftragnehmerZelle) {
    setze(a, g.blatt, g.auftragnehmerZelle, { text: auftrag.auftragnehmer });
    beschreibung.push(`Auftragnehmer: ${auftrag.auftragnehmer}`);
  }
  return { aenderungen: a, beschreibung };
}

/** Eintrag der Rechnungsliste ändern (Text, Daten, Betrag, Bemerkung) */
export function rechnungAendern(kk: Kostenkontrolle, zeile: number, werte: Partial<Pick<NeueRechnung, 'text' | 'datum' | 'freigabe' | 'betrag' | 'bemerkung'>>): ZellAenderungen {
  const rl = kk.rechnungsliste;
  if (!rl) throw new Error('Die Kostenkontrolle hat keine Rechnungsliste.');
  const a: ZellAenderungen = new Map();
  const sp = rl.spalten;
  if (werte.text !== undefined && sp.text) setze(a, rl.blatt, zellName(zeile, sp.text), { text: werte.text });
  if (werte.datum !== undefined && sp.datum) setze(a, rl.blatt, zellName(zeile, sp.datum), werte.datum ? { datum: werte.datum } : { leer: true });
  if (werte.freigabe !== undefined && sp.freigabe) setze(a, rl.blatt, zellName(zeile, sp.freigabe), werte.freigabe ? { datum: werte.freigabe } : { leer: true });
  if (werte.betrag !== undefined) setze(a, rl.blatt, zellName(zeile, sp.betrag), { zahl: werte.betrag });
  if (werte.bemerkung !== undefined && sp.bemerkung) setze(a, rl.blatt, zellName(zeile, sp.bemerkung), { text: werte.bemerkung });
  return a;
}

/** mehrere Änderungen zusammenführen (spätere gewinnen je Zelle) */
export function zusammen(...liste: ZellAenderungen[]): ZellAenderungen {
  const out: ZellAenderungen = new Map();
  for (const a of liste) for (const [b, zellen] of a) for (const [r, v] of zellen) setze(out, b, r, v as ZellInhalt);
  return out;
}
