import type { MsgKopf } from '@core/mail/msg';

/**
 * Ursprünglicher Absender einer Mail: Leitet jemand aus dem Büro eine Mail weiter, ist der direkte Absender die
 * Kollegin – die Quelle (für Benennung, von/an, Anzeige) ist aber der, von dem die Mail ursprünglich kam. Hier stehen
 * die reinen Regeln:
 *
 * - **intern**: Absender mit eigener Domain bzw. Adresse („Eigene Domains“) oder nur mit Exchange-interner Adresse
 *   (X.500, „/O=…“). Ohne Adresse zählt der Name, abgeglichen mit den Kontakten (Mails des Projekts, Adressbuch).
 * - **Weiterleitung**: äußerstes Betreff-Präfix ist eine Weiterleitung (WG:, FW:, Fwd:, TR:, RV:, …, auch nach
 *   „[EXTERN]“), oder – ohne Antwort-Präfix vorn – eine angehängte Nachricht bzw. eine Trennzeile wie
 *   „---------- Forwarded message ---------“. Ein „AW:“ vorn ist eine Antwort, keine Weiterleitung.
 * - **Ursprung**: aus der angehängten Nachricht (verlässlich, mit Adresse), sonst aus den Kopfblöcken im Text
 *   („Von: … Gesendet: … An: … Betreff: …“ in Outlook deutsch und englisch, Gmail, Thunderbird). Die Kette wird so lange
 *   zurückverfolgt, wie sie aus internen Weiterleitungen besteht; der erste externe Absender ist die Quelle – bei einer
 *   Kette aus internen Weiterleitungen also der älteste externe. Externe Weiterleitungen werden nicht aufgelöst: Leitet
 *   ein Externer weiter, ist er die Quelle.
 * - Ist der Ursprung intern (rein interne Mail), bleibt es beim direkten Absender.
 * - Nicht eindeutig (kein Kopfblock, nur ein Name ohne Treffer bzw. mit mehreren, mehrere angehängte Nachrichten
 *   verschiedener Absender): „unklar“ – geraten wird nichts; der Absender wird per Auswahl korrigiert.
 */

export interface Person {
  name: string;
  /** SMTP-Adresse; leer, wenn unbekannt */
  mail: string;
}

/** Glied der Kette: Absender einer weitergeleiteten Nachricht */
export interface Glied extends Person {
  /** Versand der weitergeleiteten Mail, soweit lesbar */
  datum?: Date;
  /** Datum, wie es im Kopfblock steht (wenn es sich nicht lesen ließ) */
  datumText?: string;
  betreff?: string;
  quelle: 'anhang' | 'text' | 'mapi';
  /** Adresse über den Namen aus den Kontakten ergänzt */
  ausKontakten?: true;
}

/** Korrektur von Hand: der richtige ursprüngliche Absender – oder „keine Quelle von außen“ (`intern`) */
export type Korrektur = Person | { intern: true };

export interface Ursprung {
  /**
   * direkt: keine interne Weiterleitung (der Absender gilt) · intern: interne Weiterleitung einer internen Mail (der
   * Absender gilt) · weitergeleitet: Quelle ist der ursprüngliche Absender · unklar: interne Weiterleitung, Ursprung nicht
   * eindeutig · korrigiert: von Hand festgelegt
   */
  art: 'direkt' | 'intern' | 'weitergeleitet' | 'unklar' | 'korrigiert';
  /** wer als Absender gilt (bei „unklar“ niemand: leer) */
  quelle: Person;
  /** bei einer internen Weiterleitung: wer weitergeleitet hat und wann */
  weiterleiter?: Person & { datum?: Date };
  /** die zurückverfolgten Absender, neueste zuerst */
  kette: Glied[];
  /** Grund bei „unklar“, sonst ein Hinweis (etwa „Adresse aus den Kontakten“) */
  hinweis?: string;
  /** zur Auswahl bei der Korrektur: Absender aus der Kette und Treffer aus den Kontakten */
  kandidaten: Person[];
  /** Schlüssel, unter dem eine Korrektur gespeichert wird */
  schluessel: string;
  /** Korrektur „keine Quelle von außen“ */
  intern?: true;
}

/** Domain einer Adresse (klein) */
export const domainVon = (mail: string) => (/@([^@\s>]+)/.exec(mail)?.[1] ?? '').toLowerCase();

/** Gehört die Adresse zum eigenen Büro? `eigene`: Domains („architekten-beispiel.example“) oder ganze Adressen */
export function istEigene(mail: string, eigene: string[]): boolean {
  const m = mail.trim().toLowerCase();
  if (!m || !eigene.length) return false;
  return eigene.some((e) => {
    const x = e.trim().toLowerCase().replace(/^@/, '');
    return x && (x.includes('@') ? m === x : domainVon(m) === x || domainVon(m).endsWith(`.${x}`));
  });
}

/** Exchange-interne Adresse („/O=EXCHANGELABS/OU=…/CN=…“) */
export const istX500 = (s: string) => /^\/o=/i.test(s.trim());

/* ---------- Betreff ---------- */

/** Präfixe von Weiterleitungen in mehreren Sprachen (de, en, fr, es/pt, it, nl, nordisch, pl …) */
const WEITER = new Set(['wg', 'fw', 'fwd', 'wtr', 'tr', 'rv', 'enc', 'i', 'vb', 'doorst', 'vs', 'vl', 'vid', 'pd', 'fs']);
/** Präfixe von Antworten */
const ANTWORT = new Set(['aw', 're', 'antw', 'antwort', 'sv', 'r', 'res', 'odp', 'rif', 'ynt', 'atb', 'ref']);
const MARKE = /^\s*(?:\[[^\]]{1,20}\]|\*[^*]{1,20}\*)\s*/;
const PRAEFIX_WORT = /^([a-zäöü]{1,7})(?:\s*\[\d+\]|\s*\(\d+\))?\s*:\s*/i;

/** Präfixe des Betreffs von außen nach innen: „AW: WG: …“ → ['antwort', 'weiter'] (unbekannte Wörter beenden die Liste) */
export function betreffPraefixe(betreff: string): ('weiter' | 'antwort')[] {
  const out: ('weiter' | 'antwort')[] = [];
  let t = betreff;
  for (let i = 0; i < 12; i++) {
    t = t.replace(MARKE, '');
    const m = PRAEFIX_WORT.exec(t);
    if (!m) break;
    const w = m[1].toLowerCase();
    if (WEITER.has(w)) out.push('weiter');
    else if (ANTWORT.has(w)) out.push('antwort');
    else break;
    t = t.slice(m[0].length);
  }
  return out;
}

/* ---------- Kopfblöcke im Text ---------- */

type Feld = 'von' | 'datum' | 'an' | 'cc' | 'betreff';
const FELDER: [Feld, string[]][] = [
  ['von', ['von', 'from', 'de', 'van', 'da', 'fra', 'från', 'od', 'absender']],
  ['datum', ['gesendet', 'sent', 'date', 'datum', 'envoyé', 'enviado', 'enviada', 'verzonden', 'inviato', 'sendt', 'skickat', 'wysłano']],
  ['an', ['an', 'to', 'à', 'a', 'para', 'aan', 'til', 'till', 'do', 'empfänger']],
  ['cc', ['cc', 'kopie']],
  ['betreff', ['betreff', 'subject', 'objet', 'asunto', 'assunto', 'onderwerp', 'oggetto', 'emne', 'ämne', 'temat']],
];
const FELD_NACH_WORT = new Map(FELDER.flatMap(([f, w]) => w.map((x) => [x, f] as const)));
/** „Von: …“, „*From:* …“, „Betreff:<Tab>…“ – auch zitiert („> “) */
const KOPFZEILE = /^[\s>]*\*?([\p{L}]+)\*?\s*:\*?[ \t]*(.*)$/u;
/** Trennzeilen über einem weitergeleiteten Kopfblock */
const TRENNZEILE =
  /^[\s>]*-{2,}\s*(?:forwarded message|weitergeleitete nachricht|original message|ursprüngliche nachricht|message transféré|message d'origine|mensaje reenviado|messaggio inoltrato|doorgestuurd bericht)\s*-{2,}\s*$|^[\s>]*(?:begin forwarded message|anfang der weitergeleiteten nachricht)\s*:?\s*$/i;
/** Trennzeilen, die nur bei Weiterleitungen vorkommen (Outlooks „Ursprüngliche Nachricht“ steht auch über Antworten) */
const TRENNZEILE_WEITER = /forwarded message|weitergeleitete nachricht|message transféré|mensaje reenviado|messaggio inoltrato|doorgestuurd bericht|begin forwarded|anfang der weitergeleiteten/i;

export interface Kopfblock {
  von: Person & { x500?: true };
  datum?: string;
  betreff?: string;
  /** über dem Block steht eine Trennzeile, die nur Weiterleitungen haben */
  weiterMarke: boolean;
}

/** „Muster, Max <max@…>“, „Max Muster [mailto:max@…]“, „max@…“, „Muster, Max“, „Name </O=…>“ */
export function personAus(roh: string): Person & { x500?: true } {
  let s = roh.trim();
  let mail = '';
  const mailto = /\[mailto:([^\]\s]+)\]/i.exec(s);
  if (mailto) {
    mail = mailto[1];
    s = s.replace(mailto[0], '');
  }
  const spitz = /<\s*(?:mailto:)?([^<>]+?)\s*>/i.exec(s);
  if (spitz) {
    mail ||= spitz[1];
    s = s.replace(spitz[0], '');
  }
  const nackt = /(?:^|\s)((?:mailto:)?[^\s<>@"]+@[^\s<>@"]+\.[^\s<>@"]+)(?=\s|$)/i.exec(s);
  if (nackt) {
    mail ||= nackt[1].replace(/^mailto:/i, '');
    s = s.replace(nackt[1], '');
  }
  const name = s
    .replace(/["'„“”]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:]+|[\s,;:]+$/g, '')
    .trim();
  if (istX500(mail)) return { name, mail: '', x500: true };
  return { name: name || mail, mail };
}

/** Kopfblöcke weitergeleiteter bzw. zitierter Nachrichten im Text, von oben (neueste) nach unten */
export function kopfbloecke(text: string): Kopfblock[] {
  const zeilen = text.replace(/\r\n?/g, '\n').split('\n');
  const feld = (z: string): [Feld, string] | null => {
    const m = KOPFZEILE.exec(z);
    const f = m && FELD_NACH_WORT.get(m[1].toLowerCase());
    return m && f ? [f, m[2].trim()] : null;
  };
  const out: Kopfblock[] = [];
  for (let i = 0; i < zeilen.length; i++) {
    if (!feld(zeilen[i])) continue;
    // zusammenhängende Kopfzeilen sammeln: einzelne Leerzeilen und umbrochene Empfängerlisten dürfen dazwischen stehen
    const werte = new Map<Feld, string>();
    let j = i;
    let letztes: Feld | null = null;
    while (j < zeilen.length) {
      const f = feld(zeilen[j]);
      if (f && !werte.has(f[0])) {
        werte.set(f[0], f[1]);
        letztes = f[0];
      } else if (f) break;
      else if (!zeilen[j].trim() && j + 1 < zeilen.length && feld(zeilen[j + 1]) && !werte.has(feld(zeilen[j + 1])![0])) letztes = null;
      else if (zeilen[j].trim() && (letztes === 'an' || letztes === 'cc') && /[;,@]/.test(zeilen[j])) {
        // Fortsetzung einer langen Empfängerliste
      } else break;
      j++;
    }
    const von = werte.get('von');
    if (von !== undefined && (werte.has('datum') || werte.has('betreff') || werte.has('an'))) {
      const davor = zeilen.slice(Math.max(0, i - 3), i).filter((z) => z.trim());
      const marke = davor.find((z) => TRENNZEILE.test(z));
      out.push({
        von: personAus(von),
        ...(werte.get('datum') ? { datum: werte.get('datum') } : {}),
        ...(werte.has('betreff') ? { betreff: werte.get('betreff') } : {}),
        weiterMarke: !!marke && TRENNZEILE_WEITER.test(marke),
      });
    }
    i = Math.max(i, j - 1);
  }
  return out;
}

const MONATE: Record<string, number> = {
  jan: 0,
  januar: 0,
  january: 0,
  jänner: 0,
  feb: 1,
  februar: 1,
  february: 1,
  mär: 2,
  märz: 2,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  mai: 4,
  may: 4,
  jun: 5,
  juni: 5,
  june: 5,
  jul: 6,
  juli: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  okt: 9,
  oktober: 9,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dez: 11,
  dezember: 11,
  dec: 11,
  december: 11,
};

/**
 * Datum aus einem Kopfblock: „Montag, 9. November 2026 10:10“, „Monday, November 9, 2026 10:10 AM“, „Mon, Nov 9, 2026
 * at 10:10 AM“, „Mo., 9. Nov. 2026 um 10:10 Uhr“, „Mon, 9 Nov 2026 10:10:00 +0100“, „09.11.2026 10:10“ – als Ortszeit;
 * nicht lesbar: null
 */
export function datumAusText(s: string): Date | null {
  const t = s.toLowerCase().replace(/[.,]/g, ' ');
  const zeit = /(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/.exec(t);
  let tag: number | undefined, monat: number | undefined, jahr: number | undefined;
  const zahlen = /\b(\d{1,2})\s+(\d{1,2})\s+(\d{4})\b/.exec(s.replace(/[.,/]/g, ' '));
  // „11/9/2026“ (englisches Outlook): Monat/Tag/Jahr, sonst „09.11.2026“: Tag.Monat.Jahr
  const amerikanisch = /\d\/\d/.test(s);
  if (zahlen) [tag, monat, jahr] = amerikanisch ? [Number(zahlen[2]), Number(zahlen[1]) - 1, Number(zahlen[3])] : [Number(zahlen[1]), Number(zahlen[2]) - 1, Number(zahlen[3])];
  else {
    const wort = Object.keys(MONATE).find((m) => new RegExp(`(^|\\s)${m}(\\s|$)`).test(t));
    const j = /\b(\d{4})\b/.exec(t);
    const d = /(?:^|\s)(\d{1,2})(?=\s)/.exec(t.replace(/\d{1,2}:\d{2}(:\d{2})?/, ' ').replace(/\b\d{4}\b/, ' '));
    if (!wort || !j || !d) return null;
    [tag, monat, jahr] = [Number(d[1]), MONATE[wort], Number(j[1])];
  }
  let h = zeit ? Number(zeit[1]) : 0;
  if (zeit?.[3] === 'pm' && h < 12) h += 12;
  if (zeit?.[3] === 'am' && h === 12) h = 0;
  const datum = new Date(jahr, monat, tag, h, zeit ? Number(zeit[2]) : 0);
  return datum.getDate() === tag && datum.getMonth() === monat ? datum : null;
}

/** Datum eines Kopfblocks fürs Kettenglied: gelesen, sonst wie im Text */
const datumAusKopf = (s?: string): { datum?: Date; datumText?: string } => {
  if (!s) return {};
  const d = datumAusText(s);
  return d ? { datum: d } : { datumText: s };
};

/* ---------- Kontakte ---------- */

const TITEL = /^(dr|prof|dipl|ing|herr|frau|hr|fr|mag|von|van|der|de)$/;
/** Name als Menge von Wörtern: „Muster, Max“ = „Max Muster“ = „Dr. Max Muster“ */
const namensSchluessel = (name: string) =>
  [
    ...new Set(
      name
        .split('|')[0]
        .replace(/\(.*?\)/g, ' ')
        .toLowerCase()
        .split(/[\s,.;"'„“”]+/)
        .filter((w) => w && !TITEL.test(w)),
    ),
  ]
    .sort()
    .join(' ');

/** Adressen zu einem Namen aus den Kontakten (verschiedene, klein) */
export function adressenZumNamen(name: string, kontakte: Person[]): string[] {
  const s = namensSchluessel(name);
  if (!s) return [];
  return [...new Set(kontakte.filter((k) => k.mail && !istX500(k.mail) && namensSchluessel(k.name) === s).map((k) => k.mail.trim().toLowerCase()))];
}

/** derselbe Absender? gleiche Adresse bzw. – fehlt eine – gleicher Name */
const gleicherAbsender = (a: Person, b: Person) =>
  a.mail && b.mail ? a.mail.trim().toLowerCase() === b.mail.trim().toLowerCase() : !!namensSchluessel(a.name) && namensSchluessel(a.name) === namensSchluessel(b.name);

/* ---------- Bestimmen ---------- */

export interface UrsprungOptionen {
  eigene: string[];
  /** Kontakte zum Abgleich von Namen ohne Adresse */
  kontakte?: Person[];
  /** gespeicherte Korrekturen (nach `mailSchluessel`) */
  korrekturen?: Record<string, Korrektur>;
}

/** Schlüssel einer Mail für Korrekturen: die Internet-Kennung, sonst Betreff, Versand und Absender */
export const mailSchluessel = (k: MsgKopf) => k.nachrichtId?.trim() || `${k.betreff}|${k.gesendet?.toISOString() ?? ''}|${k.vonName}`;

/** Weiterleitung? Äußerstes Präfix „WG:“ …; ohne Antwort-Präfix vorn auch eine angehängte Nachricht bzw. Trennzeile */
export function istWeiterleitung(k: MsgKopf): boolean {
  const p = betreffPraefixe(k.betreff)[0];
  if (p === 'weiter') return true;
  if (p === 'antwort') return false;
  if (k.angehaengt?.length) return true;
  if (k.original && (k.original.mail || k.original.name) && k.original.mail.toLowerCase() !== k.vonMail.toLowerCase()) return true;
  return k.text ? kopfbloecke(k.text).some((b) => b.weiterMarke) : false;
}

type Einordnung = { art: 'extern' | 'intern'; person: Person; ausKontakten?: true } | { art: 'unbekannt'; kandidaten: Person[]; grund: string };

type Ergebnis = { art: 'extern'; glied: Glied } | { art: 'intern' } | { art: 'unklar'; grund: string; kandidaten: Person[] };

export function ursprungBestimmen(k: MsgKopf, o: UrsprungOptionen): Ursprung {
  const kontakte = o.kontakte ?? [];
  const schluessel = mailSchluessel(k);
  const direkt: Person = { name: k.vonName, mail: k.vonMail };
  const korrektur = o.korrekturen?.[schluessel];
  const direktIntern = !!k.vonX500 || istEigene(k.vonMail, o.eigene);
  if (!direktIntern || !istWeiterleitung(k)) return { art: 'direkt', quelle: direkt, kette: [], kandidaten: [], schluessel };

  const einordnen = (p: Person & { x500?: true }): Einordnung => {
    if (p.x500) return { art: 'intern', person: p };
    // ohne eigene Domains lässt sich an einer SMTP-Adresse nicht ablesen, ob sie zum Büro gehört: nicht raten
    const nachAdresse = (mail: string, ausKontakten?: true): Einordnung =>
      o.eigene.length
        ? { art: istEigene(mail, o.eigene) ? 'intern' : 'extern', person: { name: p.name, mail }, ...(ausKontakten ? { ausKontakten } : {}) }
        : { art: 'unbekannt', kandidaten: [{ name: p.name, mail }], grund: 'ohne eigene Domains ist nicht zu erkennen, ob der Absender zum Büro gehört' };
    if (p.mail) return nachAdresse(p.mail);
    const treffer = adressenZumNamen(p.name, kontakte);
    if (treffer.length === 1) return nachAdresse(treffer[0], true);
    return {
      art: 'unbekannt',
      kandidaten: treffer.length ? treffer.map((mail) => ({ name: p.name, mail })) : p.name ? [{ name: p.name, mail: '' }] : [],
      grund: p.name ? `„${p.name}“ ohne Adresse – ${treffer.length > 1 ? 'mehrere Treffer' : 'nicht'} in den Kontakten` : 'Absender nicht lesbar',
    };
  };
  const kette: Glied[] = [];
  const merke = (g: Glied) => {
    if (!kette.some((x) => x.name === g.name && x.mail === g.mail && x.quelle === g.quelle)) kette.push(g);
  };

  /** Ursprung einer weitergeleiteten Nachricht `n` (Absender intern) */
  const aufloesen = (n: MsgKopf, tiefe: number): Ergebnis => {
    if (tiefe > 5) return { art: 'unklar', grund: 'die Kette ist zu lang', kandidaten: [] };
    // 1. angehängte Nachrichten – verlässlich, mit Adresse. Steht im Text ein Kopfblock (Weiterleitung im Text), zählen
    // nur Anhänge vom selben Absender wie dieser Kopf: andere sind Anhänge der weitergeleiteten Mail selbst (etwa die
    // .msg des Prüfingenieurs in der Mail des Statikers) und nicht ihr Ursprung
    const bloecke = n.text ? kopfbloecke(n.text) : [];
    const anhaenge = (n.angehaengt ?? []).filter((a) => !bloecke.length || gleicherAbsender({ name: a.vonName, mail: a.vonMail }, bloecke[0].von));
    if (anhaenge.length) {
      const ergebnisse = anhaenge.map((a): Ergebnis => {
        const e = einordnen({ name: a.vonName, mail: a.vonMail, ...(a.vonX500 ? { x500: true as const } : {}) });
        const glied: Glied = {
          name: a.vonName,
          mail: e.art === 'unbekannt' ? a.vonMail : e.person.mail,
          quelle: 'anhang',
          ...(a.gesendet ? { datum: a.gesendet } : {}),
          betreff: a.betreff,
          ...(e.art !== 'unbekannt' && e.ausKontakten ? { ausKontakten: true as const } : {}),
        };
        merke(glied);
        if (e.art === 'extern') return { art: 'extern', glied };
        if (e.art === 'unbekannt') return { art: 'unklar', grund: `angehängte Mail: ${e.grund}`, kandidaten: e.kandidaten };
        return istWeiterleitung(a) ? aufloesen(a, tiefe + 1) : { art: 'intern' };
      });
      const extern = ergebnisse.filter((e): e is Extract<Ergebnis, { art: 'extern' }> => e.art === 'extern');
      const verschiedene = new Set(extern.map((e) => e.glied.mail.toLowerCase()));
      if (verschiedene.size > 1) return { art: 'unklar', grund: 'mehrere angehängte Mails von verschiedenen Absendern', kandidaten: extern.map((e) => e.glied) };
      if (extern.length && ergebnisse.every((e) => e.art !== 'unklar')) return extern[0];
      const unklar = ergebnisse.find((e): e is Extract<Ergebnis, { art: 'unklar' }> => e.art === 'unklar');
      if (unklar) return { ...unklar, kandidaten: [...extern.map((e) => e.glied), ...unklar.kandidaten] };
      return { art: 'intern' };
    }
    // 2. ursprünglicher Absender laut MAPI (Umleitung per Regel)
    if (n.original && (n.original.mail || n.original.name || n.original.x500)) {
      const e = einordnen(n.original);
      const glied: Glied = { name: n.original.name, mail: e.art === 'unbekannt' ? n.original.mail : e.person.mail, quelle: 'mapi' };
      merke(glied);
      if (e.art === 'extern') return { art: 'extern', glied };
      if (e.art !== 'unbekannt') return { art: 'intern' };
      return { art: 'unklar', grund: e.grund, kandidaten: e.kandidaten };
    }
    // 3. Kopfblöcke im Text: zurück, solange es interne Weiterleitungen sind
    if (!bloecke.length) return { art: 'unklar', grund: 'kein Kopf der weitergeleiteten Mail gefunden', kandidaten: [] };
    for (let i = 0; i < bloecke.length; i++) {
      const b = bloecke[i];
      const e = einordnen(b.von);
      const glied: Glied = {
        name: b.von.name,
        mail: e.art === 'unbekannt' ? b.von.mail : e.person.mail,
        quelle: 'text',
        ...datumAusKopf(b.datum),
        ...(b.betreff !== undefined ? { betreff: b.betreff } : {}),
        ...(e.art !== 'unbekannt' && e.ausKontakten ? { ausKontakten: true as const } : {}),
      };
      merke(glied);
      if (e.art === 'extern') return { art: 'extern', glied };
      if (e.art === 'unbekannt') return { art: 'unklar', grund: e.grund, kandidaten: e.kandidaten };
      // intern: weiter zurück, wenn es selbst eine Weiterleitung war (bzw. der Betreff fehlt)
      const weiter = b.betreff === undefined || betreffPraefixe(b.betreff)[0] === 'weiter' || bloecke[i + 1]?.weiterMarke;
      if (!weiter) return { art: 'intern' };
      if (i === bloecke.length - 1) return b.betreff === undefined ? { art: 'intern' } : { art: 'unklar', grund: 'die Kette der Weiterleitungen bricht ab', kandidaten: [] };
    }
    return { art: 'intern' };
  };

  const ergebnis = aufloesen(k, 0);
  const weiterleiter = { ...direkt, ...((k.gesendet ?? k.empfangen) ? { datum: k.gesendet ?? k.empfangen } : {}) };
  const kandidaten: Person[] = [];
  for (const p of [...(ergebnis.art === 'unklar' ? ergebnis.kandidaten : []), ...kette]) {
    const doppelt = p.mail ? kandidaten.some((x) => x.mail.toLowerCase() === p.mail.toLowerCase()) : kandidaten.some((x) => namensSchluessel(x.name) === namensSchluessel(p.name));
    if ((p.name || p.mail) && !doppelt && !(p.mail && istEigene(p.mail, o.eigene))) kandidaten.push({ name: p.name, mail: p.mail });
  }
  const basis = { weiterleiter, kette, kandidaten, schluessel };
  if (korrektur) {
    if ('intern' in korrektur) return { ...basis, art: 'korrigiert', quelle: direkt, intern: true, hinweis: 'von Hand: keine Quelle von außen' };
    return { ...basis, art: 'korrigiert', quelle: { name: korrektur.name, mail: korrektur.mail }, hinweis: 'von Hand festgelegt' };
  }
  if (ergebnis.art === 'extern')
    return {
      ...basis,
      art: 'weitergeleitet',
      quelle: { name: ergebnis.glied.name, mail: ergebnis.glied.mail },
      ...(ergebnis.glied.ausKontakten ? { hinweis: 'Adresse über den Namen aus den Kontakten' } : {}),
    };
  if (ergebnis.art === 'intern') return { ...basis, art: 'intern', quelle: direkt, hinweis: 'intern weitergeleitet, ursprünglich ebenfalls aus dem Büro' };
  return { ...basis, art: 'unklar', quelle: { name: '', mail: '' }, hinweis: ergebnis.grund };
}

/** „Muster, Max <max@…>“ bzw. nur Name oder Adresse */
export const personText = (p: Person) => (p.name && p.mail && p.name.toLowerCase() !== p.mail.toLowerCase() ? `${p.name.split('|')[0].trim()} <${p.mail}>` : p.name || p.mail);
