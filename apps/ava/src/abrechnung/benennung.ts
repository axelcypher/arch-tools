/**
 * Dateinamen der Rechnungen im Auftragsordner – nach einstellbaren Mustern, damit jedes Büro seine Schreibweise
 * behält. Platzhalter (Groß-/Kleinschreibung egal):
 *
 *   {Kürzel}   Projektnummer („K62“)            {Datum}  Rechnungsdatum JJMMTT („251024“)
 *   {Nr}       Nummer der Rechnungsliste         {Nr:3}   dreistellig („021“)
 *   {Art}      Rechnungsart („AB“, „SR“, „R“)   {Lfd}    laufende Nummer der Art („1“ bei AB1)
 *   {Firma}    Auftragnehmer                     {Gewerk} „G08“
 *
 * Beispiele: „{Kürzel} R{Nr:3} {Firma} {Datum} {Art}{Lfd}“ → „K62 R021 Witthaut 251024 AB1.pdf“,
 * „{Kürzel} {Datum} {Lfd}.{Art} Fa. {Firma}“ → „HVO 261111 1.AB Fa. Tischer.pdf“. Zum Erkennen vorhandener
 * Dateien gibt es mehrere Muster (die Benennung war nicht immer einheitlich); neue Dateien bekommen das erste.
 */

export interface Rechnungsart {
  /** Kürzel im Dateinamen und in der Liste, z. B. „AB“ */
  kuerzel: string;
  name: string;
  /** wird in der Reihe der Abschlagsrechnungen gezählt (Sicherheitseinbehalt) */
  abschlag?: boolean;
  /** Schlussrechnung: zieht alle vorigen Zahlungen ab, ohne Einbehalt */
  schluss?: boolean;
}

export const VORGABE_ARTEN: Rechnungsart[] = [
  { kuerzel: 'AB', name: 'Abschlagsrechnung', abschlag: true },
  { kuerzel: 'SR', name: 'Schlussrechnung', schluss: true },
  { kuerzel: 'TSR', name: 'Teilschlussrechnung', schluss: true },
  { kuerzel: 'R', name: 'Rechnung' },
];

export const VORGABE_MUSTER = ['{Kürzel} R{Nr:3} {Firma} {Datum} {Art}{Lfd}', '{Kürzel} {Datum} {Lfd}.{Art} Fa. {Firma}', '{Kürzel} {Datum} {Art}{Lfd} {Firma}'];

export interface RechnungsName {
  kuerzel?: string;
  nr?: number;
  art?: string;
  lfd?: number;
  firma?: string;
  /** JJJJ-MM-TT */
  datum?: string;
  gewerk?: string;
}

const PLATZHALTER = /\{(Kürzel|Kuerzel|Nr(?::(\d))?|Art|Lfd|Firma|Datum|Gewerk)\}/gi;

const regexText = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** JJMMTT → JJJJ-MM-TT (Jahre 00–79 → 20xx) */
export function datumAusJJMMTT(s: string): string | undefined {
  const m = /^(\d{2})(\d{2})(\d{2})$/.exec(s);
  if (!m) return undefined;
  const j = Number(m[1]);
  const mo = Number(m[2]);
  const t = Number(m[3]);
  if (mo < 1 || mo > 12 || t < 1 || t > 31) return undefined;
  return `${j < 80 ? 2000 + j : 1900 + j}-${m[2]}-${m[3]}`;
}

export const jjmmtt = (iso: string) => `${iso.slice(2, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}`;

/** Dateiname (ohne Endung) nach einem Muster zerlegen; null, wenn er nicht passt */
export function nameLesen(name: string, muster: string, arten: Rechnungsart[] = VORGABE_ARTEN): RechnungsName | null {
  const ohneEndung = name.replace(/\.[a-z0-9]{2,4}$/i, '').trim();
  const felder: string[] = [];
  const artMuster = [...arten].sort((a, b) => b.kuerzel.length - a.kuerzel.length).map((a) => regexText(a.kuerzel)).join('|');
  let quelle = '';
  let letzt = 0;
  for (const m of muster.matchAll(PLATZHALTER)) {
    quelle += regexText(muster.slice(letzt, m.index)).replace(/ /g, '[ _]+');
    letzt = m.index! + m[0].length;
    const p = m[1].toLowerCase();
    if (p === 'kürzel' || p === 'kuerzel') {
      felder.push('kuerzel');
      quelle += '([A-Za-z]{1,4}\\d{1,4}[A-Za-z]?|[A-ZÄÖÜ]{2,5})';
    } else if (p.startsWith('nr')) {
      felder.push('nr');
      quelle += '(\\d{1,4})';
    } else if (p === 'art') {
      felder.push('art');
      quelle += `(${artMuster})`;
    } else if (p === 'lfd') {
      felder.push('lfd');
      quelle += '(\\d{0,2})';
    } else if (p === 'firma') {
      felder.push('firma');
      quelle += '(.+?)';
    } else if (p === 'datum') {
      felder.push('datum');
      quelle += '(\\d{6})';
    } else if (p === 'gewerk') {
      felder.push('gewerk');
      quelle += '(G[ _]?\\d{1,3})';
    }
  }
  quelle += regexText(muster.slice(letzt)).replace(/ /g, '[ _]+');
  const m = new RegExp(`^${quelle}$`, 'i').exec(ohneEndung);
  if (!m) return null;
  const out: RechnungsName = {};
  felder.forEach((f, i) => {
    const v = m[i + 1];
    if (v === undefined || v === '') return;
    if (f === 'nr') out.nr = Number(v);
    else if (f === 'lfd') out.lfd = Number(v);
    else if (f === 'datum') {
      const d = datumAusJJMMTT(v);
      if (d) out.datum = d;
    } else if (f === 'art') out.art = arten.find((a) => a.kuerzel.toLowerCase() === v.toLowerCase())?.kuerzel ?? v.toUpperCase();
    else if (f === 'firma') out.firma = v.replace(/_/g, ' ').trim();
    else if (f === 'gewerk') out.gewerk = v.replace(/[ _]/g, '');
    else if (f === 'kuerzel') out.kuerzel = v;
  });
  if (m.length > 1 && out.datum === undefined && felder.includes('datum')) return null;
  return out;
}

/** mit dem ersten passenden Muster erkennen */
export function nameErkennen(name: string, muster: string[], arten: Rechnungsart[] = VORGABE_ARTEN): (RechnungsName & { muster: string }) | null {
  for (const mu of muster) {
    const r = nameLesen(name, mu, arten);
    if (r) return { ...r, muster: mu };
  }
  return null;
}

/** Zeichen, die in Windows-Dateinamen nicht erlaubt sind, fallen weg */
export const dateinameSicher = (s: string) =>
  s
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Dateiname (ohne Endung) aus einem Muster */
export function nameBilden(muster: string, w: RechnungsName): string {
  const n = muster.replace(PLATZHALTER, (_, p: string, stellen?: string) => {
    const k = p.toLowerCase();
    if (k === 'kürzel' || k === 'kuerzel') return w.kuerzel ?? '';
    if (k.startsWith('nr')) return w.nr === undefined ? '' : stellen ? String(w.nr).padStart(Number(stellen), '0') : String(w.nr);
    if (k === 'art') return w.art ?? '';
    if (k === 'lfd') return w.lfd === undefined ? '' : String(w.lfd);
    if (k === 'firma') return w.firma ?? '';
    if (k === 'datum') return w.datum ? jjmmtt(w.datum) : '';
    if (k === 'gewerk') return w.gewerk ?? '';
    return '';
  });
  return dateinameSicher(n);
}

/** unbekannte Platzhalter im Muster (für den Hinweis in den Einstellungen) */
export const unbekanntePlatzhalter = (muster: string) => [...muster.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]).filter((p) => !/^(Kürzel|Kuerzel|Nr(:\d)?|Art|Lfd|Firma|Datum|Gewerk)$/i.test(p));
