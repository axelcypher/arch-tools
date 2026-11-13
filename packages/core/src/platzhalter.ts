/**
 * Platzhalter (Variablen) der ganzen Suite – ein gemeinsames Verzeichnis und eine gemeinsame Ersetzungsfunktion.
 *
 * Schreibregel (am Namen erkennbar):
 *  - **global** – gilt überall gleich (Projektdatei, Büro, Datum): GROSSBUCHSTABEN, Wörter mit Unterstrich,
 *    z. B. {PROJEKT_KUERZEL}, {DATUM}.
 *  - **lokal** – nur in einem Zusammenhang gültig (Name eines Dokuments, Nr im Antragsumfang …): erster Buchstabe groß,
 *    sonst klein bzw. Binnenmajuskel, ohne Unterstrich, z. B. {Name}, {Nr}, {FirmaMail}. Lokale Variablen gehören zu
 *    ihrer App, folgen aber derselben Schreibregel und werden mit derselben Funktion ersetzt.
 *
 * Nach einem Doppelpunkt folgt eine Angabe: beim Datum das Format ({DATUM:JJJJ-MM-TT}), bei Zahlen die Stellen ({Nr:3}).
 *
 * Rückwärtskompatibel: Gespeicherte Vorlagen mit alten Namen ({Kürzel}, {nummer}, {jj} …) funktionieren weiter. Alte
 * Namen werden als Alias erkannt – ohne Rücksicht auf Groß-/Kleinschreibung, aber erst nach einem exakten Treffer, also
 * {DATUM} ist immer die globale Variable; Aliase lokaler Variablen gehen denen der globalen vor. Ein Alias kann eine Angabe mitbringen (im Projektordner war {datum}
 * JJJJ-MM-TT). Gespeichertes wird nie stillschweigend umgeschrieben; {@link modernisieren} stellt eine Vorlage auf die
 * neuen Namen um, wenn der Nutzer das will („Vorlage anpassen“).
 */

/** Wert einer Variable: Text, Zahl (Angabe = Stellen) oder Datum (Angabe = Format) */
export type Wert = string | number | Date | null | undefined;

export interface Alias {
  /** alter Name, Groß-/Kleinschreibung egal */
  name: string;
  /** Angabe, die der alte Name mitbrachte (z. B. Datumsformat), wenn im Platzhalter keine steht */
  angabe?: string;
}

export interface Variable {
  /** Name ohne Klammern, z. B. „PROJEKT_KUERZEL“ oder „Name“ */
  name: string;
  /** Erklärung für die Einstellungen */
  text: string;
  /** woher der Wert kommt (nur globale Variablen) */
  quelle?: string;
  /** Beispielwert für Hinweise */
  beispiel?: string;
  /** Angabe, wenn im Platzhalter keine steht (Datumsformat bzw. Stellen) */
  vorgabe?: string;
  /** alte Namen */
  aliase?: (string | Alias)[];
}

/** global: GROSSBUCHSTABEN, Ziffern, Wörter mit Unterstrich */
export const istGlobalerName = (name: string) => /^[A-ZÄÖÜ][A-ZÄÖÜ0-9]*(?:_[A-ZÄÖÜ0-9]+)*$/.test(name);
/** lokal: erster Buchstabe groß, nicht alles groß (außer einem einzelnen Buchstaben), ohne Unterstrich */
export const istLokalerName = (name: string) => /^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9]*$/.test(name) && (/[a-zäöüß]/.test(name) || name.length === 1);
export const istGlobal = (v: Variable | string) => istGlobalerName(typeof v === 'string' ? v : v.name);

/* ---------- globale Variablen ---------- */

export const GLOBALE_VARIABLEN: Variable[] = [
  {
    name: 'PROJEKT_KUERZEL',
    text: 'Projektkürzel bzw. Projektnummer',
    quelle: 'Projektdatei (.oap), Stammdaten „Projektcode“',
    beispiel: 'BS9',
    aliase: ['Kürzel', 'Kuerzel', 'nummer', 'projektcode'],
  },
  { name: 'PROJEKT_KURZNAME', text: 'Kurzname des Projekts', quelle: 'Projektdatei (.oap), Stammdaten „Kurzname“', beispiel: 'EFH Musterweg', aliase: ['Kurzname'] },
  { name: 'PROJEKT_VORHABEN', text: 'Bezeichnung des Vorhabens', quelle: 'Projektdatei (.oap), Stammdaten „Vorhaben“', beispiel: 'Neubau eines Einfamilienhauses', aliase: ['Vorhaben'] },
  { name: 'BEARBEITER', text: 'Bearbeitung (Kürzel bzw. Name)', quelle: 'Projektdatei (.oap), Stammdaten „Bearbeitung“', beispiel: 'TP', aliase: ['Bearbeiter'] },
  {
    name: 'DATUM',
    text: 'Datum des Vorgangs (Export, Anlegen …) als JJMMTT; mit Format z. B. {DATUM:JJJJ-MM-TT}',
    quelle: 'heute bzw. Tag des Vorgangs',
    beispiel: '261113',
    vorgabe: 'JJMMTT',
    aliase: ['Datum'],
  },
  { name: 'JAHR', text: 'Jahr des Vorgangs, vierstellig', quelle: 'heute bzw. Tag des Vorgangs', beispiel: '2026', vorgabe: 'JJJJ', aliase: ['Jahr'] },
  { name: 'JAHR_KURZ', text: 'Jahr des Vorgangs, zweistellig', quelle: 'heute bzw. Tag des Vorgangs', beispiel: '26', vorgabe: 'JJ', aliase: ['jj'] },
];

/** eine globale Variable nach Namen */
export function globaleVariable(name: string): Variable {
  const v = GLOBALE_VARIABLEN.find((x) => x.name === name);
  if (!v) throw new Error(`Unbekannte globale Variable ${name}`);
  return v;
}

/**
 * Globale Variable mit anderen bzw. zusätzlichen alten Namen für einen Zusammenhang – z. B. war {datum} im
 * Projektordner JJJJ-MM-TT, {Projekt} in den Formularen das Kürzel. `ersetzen` = nur diese Aliase.
 */
export function mitAliasen(name: string, aliase: (string | Alias)[], ersetzen = false): Variable {
  const v = globaleVariable(name);
  return { ...v, aliase: ersetzen ? aliase : [...aliase, ...(v.aliase ?? [])] };
}

/** Quelle der globalen Werte – Stammdaten der Projektdatei und Tag des Vorgangs */
export interface GlobaleQuelle {
  projektcode?: string;
  kurzname?: string;
  vorhaben?: string;
  bearbeiter?: string;
  /** Tag des Vorgangs; Vorgabe heute */
  datum?: Date;
}

/** Werte der globalen Variablen */
export function globaleWerte(q: GlobaleQuelle): Record<string, Wert> {
  const tag = q.datum ?? new Date();
  return { PROJEKT_KUERZEL: q.projektcode ?? '', PROJEKT_KURZNAME: q.kurzname ?? '', PROJEKT_VORHABEN: q.vorhaben ?? '', BEARBEITER: q.bearbeiter ?? '', DATUM: tag, JAHR: tag, JAHR_KURZ: tag };
}

/* ---------- Datum ---------- */

/** zulässige Datumsformate: nur JJJJ, JJ, MM, TT und Trenner */
export const DATUMSFORMAT = /^(?=.*(?:JJ|MM|TT))[JMT.\-_ ]+$/i;

/**
 * Datum nach Format: JJJJ (Jahr), JJ (zweistellig), MM, TT, dazwischen Trenner – „JJJJ-MM-TT“ → 2026-11-11, „JJMMTT“ →
 * 261111.
 */
export function datumNachFormat(d: Date, format: string): string {
  const zwei = (n: number) => String(n).padStart(2, '0');
  return format.replace(/JJJJ|JJ|MM|TT/g, (t) => (t === 'JJJJ' ? String(d.getFullYear()) : t === 'JJ' ? zwei(d.getFullYear() % 100) : t === 'MM' ? zwei(d.getMonth() + 1) : zwei(d.getDate())));
}

/* ---------- Platzhalter finden und auflösen ---------- */

/** {Name}, {Name:Angabe}, auch in doppelten Klammern ({{nummer}} aus alten Vorlagen); Namen ohne Leer- und Sonderzeichen */
const TOKEN = /\{\{?\s*([\p{L}\p{N}_.-]+)\s*(?::\s*([^{}]*?)\s*)?\}\}?/gu;

export interface Aufgeloest {
  variable: Variable;
  /** Angabe aus dem Platzhalter, sonst aus dem Alias, sonst die Vorgabe der Variable */
  angabe?: string;
  /** alter Name bzw. abweichende Schreibweise */
  veraltet: boolean;
}

const aliasName = (a: string | Alias) => (typeof a === 'string' ? a : a.name);
const klein = (s: string) => s.toLocaleLowerCase('de');

/** passt die Angabe zur Variable? Datum: Format aus JJJJ, JJ, MM, TT; sonst Stellen (Ziffern) */
function angabePasst(v: Variable, angabe: string | undefined): boolean {
  if (!angabe) return true;
  return v.vorgabe && DATUMSFORMAT.test(v.vorgabe) ? DATUMSFORMAT.test(angabe) : /^\d+$/.test(angabe);
}

/**
 * Variable zu einem Namen: exakter Name, dann alter Name (Alias), dann Name in anderer Schreibweise. null, wenn es
 * keine gibt oder die Angabe nicht passt ({DATUM:xyz}).
 */
export function aufloesen(name: string, angabe: string | undefined, variablen: Variable[]): Aufgeloest | null {
  const t = finden(name, angabe?.trim() || undefined, variablen);
  return t && angabePasst(t.variable, angabe?.trim() || undefined) ? t : null;
}

function finden(name: string, a: string | undefined, variablen: Variable[]): Aufgeloest | null {
  const exakt = variablen.find((v) => v.name === name);
  if (exakt) return { variable: exakt, angabe: a ?? exakt.vorgabe, veraltet: false };
  const n = klein(name);
  // alte Namen: die der lokalen Variablen zuerst ({Datum} ist in der AVA das Rechnungsdatum, nicht {DATUM})
  for (const v of [...variablen.filter((x) => !istGlobal(x)), ...variablen.filter((x) => istGlobal(x))]) {
    const alias = v.aliase?.find((x) => klein(aliasName(x)) === n);
    if (alias) return { variable: v, angabe: a ?? (typeof alias === 'string' ? undefined : alias.angabe) ?? v.vorgabe, veraltet: true };
  }
  const anders = variablen.find((v) => klein(v.name) === n);
  return anders ? { variable: anders, angabe: a ?? anders.vorgabe, veraltet: true } : null;
}

export interface Fundstelle {
  /** der Platzhalter, wie er in der Vorlage steht */
  roh: string;
  index: number;
  name: string;
  angabe?: string;
  /** null = unbekannt */
  treffer: Aufgeloest | null;
}

/** alle Platzhalter einer Vorlage, in Reihenfolge */
export function platzhalterIn(vorlage: string, variablen: Variable[]): Fundstelle[] {
  return [...vorlage.matchAll(TOKEN)].map((m) => ({ roh: m[0], index: m.index ?? 0, name: m[1], angabe: m[2], treffer: aufloesen(m[1], m[2], variablen) }));
}

/** Platzhalter ohne Variable (bleiben so stehen) */
export const unbekanntePlatzhalter = (vorlage: string, variablen: Variable[]) => [
  ...new Set(
    platzhalterIn(vorlage, variablen)
      .filter((f) => !f.treffer)
      .map((f) => f.roh),
  ),
];

/** Platzhalter mit altem Namen und ihr neuer Name – für den Hinweis „Vorlage anpassen“ */
export function veraltetePlatzhalter(vorlage: string, variablen: Variable[]): { alt: string; neu: string }[] {
  const out = new Map<string, string>();
  for (const f of platzhalterIn(vorlage, variablen)) if (f.treffer?.veraltet) out.set(f.roh, neuerPlatzhalter(f.treffer));
  return [...out].map(([alt, neu]) => ({ alt, neu }));
}

/** Platzhalter mit neuem Namen; die Angabe bleibt, wenn sie von der Vorgabe abweicht */
function neuerPlatzhalter(t: Aufgeloest): string {
  return t.angabe && t.angabe !== t.variable.vorgabe ? `{${t.variable.name}:${t.angabe}}` : `{${t.variable.name}}`;
}

/** Vorlage mit den neuen Namen – nur auf Wunsch des Nutzers („Vorlage anpassen“), nie stillschweigend */
export function modernisieren(vorlage: string, variablen: Variable[]): string {
  return vorlage.replace(TOKEN, (roh: string, name: string, angabe?: string) => {
    const t = aufloesen(name, angabe, variablen);
    return t?.veraltet ? neuerPlatzhalter(t) : roh;
  });
}

/** Wert nach Angabe als Text; null, wenn die Angabe nicht passt */
function alsText(wert: Wert, angabe: string | undefined): string | null {
  if (wert === null || wert === undefined) return '';
  if (wert instanceof Date) {
    const f = (angabe ?? 'JJMMTT').trim();
    return DATUMSFORMAT.test(f) ? datumNachFormat(wert, f.toUpperCase()) : null;
  }
  if (typeof wert === 'number') {
    if (!angabe) return String(wert);
    return /^\d+$/.test(angabe.trim()) ? String(wert).padStart(Number(angabe), '0') : null;
  }
  // Text: Stellen bei Ziffern, ein Datum JJJJ-MM-TT im gewünschten Format
  if (angabe && /^\d+$/.test(angabe.trim()) && /^\d+$/.test(wert)) return wert.padStart(Number(angabe), '0');
  if (angabe && DATUMSFORMAT.test(angabe.trim())) {
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(wert);
    if (iso) return datumNachFormat(new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])), angabe.trim().toUpperCase());
  }
  return wert;
}

export interface ErsetzenOptionen {
  /** Wert vor dem Einsetzen bereinigen (z. B. unzulässige Zeichen im Dateinamen) */
  saeubern?: (text: string, variable: Variable) => string;
  /** Variable ohne Wert: leer einsetzen (Vorgabe) oder den Platzhalter stehen lassen */
  ohneWert?: 'leer' | 'stehen';
}

/**
 * Platzhalter einer Vorlage ersetzen. `werte` nach dem (neuen) Namen der Variable. Unbekannte Platzhalter und solche
 * mit unpassender Angabe bleiben stehen.
 */
export function ersetzen(vorlage: string, variablen: Variable[], werte: Record<string, Wert>, opt: ErsetzenOptionen = {}): string {
  return vorlage.replace(TOKEN, (roh: string, name: string, angabe?: string) => {
    const t = aufloesen(name, angabe, variablen);
    if (!t) return roh;
    if (!(t.variable.name in werte) || werte[t.variable.name] === undefined) return opt.ohneWert === 'stehen' ? roh : '';
    const text = alsText(werte[t.variable.name], t.angabe);
    if (text === null) return roh;
    return opt.saeubern ? opt.saeubern(text, t.variable) : text;
  });
}
