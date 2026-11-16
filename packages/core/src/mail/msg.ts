/**
 * Outlook-Nachrichten (.msg) lesen – ohne Outlook: Das Format ist eine Compound-File-Binary-Datei (OLE2) mit je einem
 * Strom pro MAPI-Eigenschaft („__substg1.0_<Tag><Typ>“) und den Eigenschaften fester Länge in
 * „__properties_version1.0“; Empfänger und Anhänge sind Unterspeicher. Gelesen werden die Angaben, die zum Ablegen
 * und Benennen gebraucht werden: Betreff, Absender, Empfänger, Sende- und Empfangszeit, Anhänge – und angehängte
 * Nachrichten (eingebettet, als .msg- oder .eml-Datei), etwa das Original einer Weiterleitung.
 * (Gemeinsam für die Apps ATLAS – Mails prüfen und benennen – und FABRIO – Mailverlauf.)
 */

/** Eintrag im Verzeichnis einer Compound-File-Datei */
export interface CfbEintrag {
  name: string;
  typ: number;
  links: number;
  rechts: number;
  kind: number;
  start: number;
  groesse: number;
}

/**
 * Compound File Binary (OLE2) lesen – das Containerformat von Outlook-Nachrichten (.msg): `ordner(id)` liefert die
 * Einträge eines Speichers (0 = Wurzel) nach Namen, `strom(e)` den Inhalt eines Stroms (auch aus dem Mini-Strom).
 */
export function cfbLesen(b: Uint8Array): { ordner: (id: number) => Map<string, CfbEintrag>; strom: (e: CfbEintrag) => Uint8Array; eintraege: CfbEintrag[] } {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (dv.getUint32(0, true) !== 0xe011cfd0 || dv.getUint32(4, true) !== 0xe11ab1a1) throw new Error('Keine Outlook-Nachricht (.msg)');
  const sektor = 1 << dv.getUint16(30, true);
  const miniSektor = 1 << dv.getUint16(32, true);
  const dirStart = dv.getUint32(48, true);
  const miniGrenze = dv.getUint32(56, true);
  const miniFatStart = dv.getUint32(60, true);
  const difatStart = dv.getUint32(68, true);
  const versatz = (s: number) => (s + 1) * sektor;
  const fatSektoren: number[] = [];
  for (let i = 0; i < 109; i++) {
    const s = dv.getUint32(76 + i * 4, true);
    if (s < 0xfffffffa) fatSektoren.push(s);
  }
  for (let s = difatStart, n = 0; s < 0xfffffffa && n < 1000; n++) {
    for (let i = 0; i < sektor / 4 - 1; i++) {
      const x = dv.getUint32(versatz(s) + i * 4, true);
      if (x < 0xfffffffa) fatSektoren.push(x);
    }
    s = dv.getUint32(versatz(s) + sektor - 4, true);
  }
  const fat: number[] = [];
  for (const s of fatSektoren) for (let i = 0; i < sektor / 4; i++) fat.push(dv.getUint32(versatz(s) + i * 4, true));
  const kette = (start: number, tabelle: number[]) => {
    const out: number[] = [];
    for (let s = start; s < 0xfffffffa && out.length < 100000; s = tabelle[s] ?? 0xfffffffe) out.push(s);
    return out;
  };
  const lies = (start: number, groesse: number) => {
    const out = new Uint8Array(groesse);
    let p = 0;
    for (const s of kette(start, fat)) {
      const n = Math.min(sektor, groesse - p);
      if (n <= 0) break;
      out.set(b.subarray(versatz(s), versatz(s) + n), p);
      p += n;
    }
    return out;
  };
  const dirRoh = (() => {
    const sek = kette(dirStart, fat);
    const out = new Uint8Array(sek.length * sektor);
    sek.forEach((s, i) => out.set(b.subarray(versatz(s), versatz(s) + sektor), i * sektor));
    return out;
  })();
  const ddv = new DataView(dirRoh.buffer);
  const eintraege: CfbEintrag[] = [];
  for (let o = 0; o + 128 <= dirRoh.length; o += 128) {
    const laenge = ddv.getUint16(o + 64, true);
    let name = '';
    for (let i = 0; i < Math.max(0, laenge / 2 - 1); i++) name += String.fromCharCode(ddv.getUint16(o + i * 2, true));
    eintraege.push({
      name,
      typ: dirRoh[o + 66],
      links: ddv.getUint32(o + 68, true),
      rechts: ddv.getUint32(o + 72, true),
      kind: ddv.getUint32(o + 76, true),
      start: ddv.getUint32(o + 116, true),
      groesse: ddv.getUint32(o + 120, true),
    });
  }
  const wurzel = eintraege[0];
  const miniStrom = wurzel ? lies(wurzel.start, wurzel.groesse) : new Uint8Array(0);
  const miniFat: number[] = [];
  for (const s of kette(miniFatStart, fat)) for (let i = 0; i < sektor / 4; i++) miniFat.push(dv.getUint32(versatz(s) + i * 4, true));
  const strom = (e: CfbEintrag) => {
    if (e.groesse >= miniGrenze) return lies(e.start, e.groesse);
    const out = new Uint8Array(e.groesse);
    let p = 0;
    for (const s of kette(e.start, miniFat)) {
      const n = Math.min(miniSektor, e.groesse - p);
      if (n <= 0) break;
      out.set(miniStrom.subarray(s * miniSektor, s * miniSektor + n), p);
      p += n;
    }
    return out;
  };
  const ordner = (id: number) => {
    const m = new Map<string, CfbEintrag>();
    const besuche = (i: number, tiefe = 0) => {
      if (i >= eintraege.length || i === 0xffffffff || tiefe > 500) return;
      const e = eintraege[i];
      m.set(e.name, e);
      besuche(e.links, tiefe + 1);
      besuche(e.rechts, tiefe + 1);
    };
    besuche(eintraege[id]?.kind ?? 0xffffffff);
    return m;
  };
  return { ordner, strom, eintraege };
}

export interface MsgEmpfaenger {
  name: string;
  /** SMTP-Adresse, sonst was in der Nachricht steht (bei internen Exchange-Empfängern ggf. leer) */
  mail: string;
  art: 'an' | 'cc' | 'bcc';
  /** nur eine Exchange-interne Adresse (X.500), keine SMTP-Adresse: ein Empfänger im eigenen Exchange */
  x500?: true;
}

export interface MsgKopf {
  /** Nachrichtenklasse, z. B. „IPM.Note“ */
  klasse: string;
  betreff: string;
  /** Betreff ohne Präfix („AW:“, „WG:“ …), wie Outlook ihn führt */
  thema: string;
  vonName: string;
  vonMail: string;
  /** Absender nur mit Exchange-interner Adresse (X.500 bzw. Adresstyp „EX“): jemand im eigenen Exchange */
  vonX500?: true;
  /** Internet-Kennung der Nachricht (PR_INTERNET_MESSAGE_ID), z. B. „<…@…>“ */
  nachrichtId?: string;
  /**
   * ursprünglicher Absender laut MAPI (PR_ORIGINAL_SENDER_*, PR_ORIGINAL_SENT_REPRESENTING_*), wie ihn etwa eine
   * Umleitung per Regel setzt – fehlt bei gewöhnlichen Weiterleitungen
   */
  original?: { name: string; mail: string; x500?: true };
  /** „im Auftrag von“ (Stellvertretung), falls anders als der Absender */
  imAuftragName?: string;
  imAuftragMail?: string;
  empfaenger: MsgEmpfaenger[];
  /** Anzeigetexte „An“ und „Cc“ */
  anText: string;
  ccText: string;
  /** gesendet (PR_CLIENT_SUBMIT_TIME) */
  gesendet?: Date;
  /** empfangen bzw. zugestellt (PR_MESSAGE_DELIVERY_TIME) */
  empfangen?: Date;
  /** PR_MESSAGE_FLAGS (z. B. 0x8 = nicht gesendet) */
  flags?: number;
  anhaenge: string[];
  /** Text der Nachricht (nur mit `mitText`): PR_BODY, sonst HTML ohne Tags */
  text?: string;
  /** angehängte Nachrichten (nur mit `mitText`): eingebettet oder als .msg-/.eml-Datei – in der Reihenfolge der Anhänge */
  angehaengt?: MsgKopf[];
}

const utf16 = new TextDecoder('utf-16le');
const ansi = new TextDecoder('windows-1252');
const ohneNull = (s: string) => s.replace(/\0+$/, '');

/** Exchange-interne Adresse („/O=EXCHANGELABS/OU=…/CN=…“) statt SMTP */
const istX500 = (s: string) => /^\/o=/i.test(s);

function eigenschaften(c: ReturnType<typeof cfbLesen>, speicher: Map<string, CfbEintrag>, kopf: number) {
  const text = (id: string): string => {
    const u = speicher.get(`__substg1.0_${id}001F`);
    if (u) return ohneNull(utf16.decode(c.strom(u)));
    const a = speicher.get(`__substg1.0_${id}001E`);
    if (a) return ohneNull(ansi.decode(c.strom(a)));
    return '';
  };
  const fest = new Map<number, DataView>();
  const props = speicher.get('__properties_version1.0');
  if (props) {
    const p = c.strom(props);
    const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
    for (let o = kopf; o + 16 <= p.length; o += 16) fest.set(dv.getUint32(o, true), new DataView(p.buffer, p.byteOffset + o + 8, 8));
  }
  const zeit = (id: number): Date | undefined => {
    const v = fest.get((id << 16) | 0x0040);
    if (!v) return undefined;
    const ticks = v.getUint32(0, true) + v.getUint32(4, true) * 2 ** 32;
    const ms = ticks / 10000 - 11644473600000;
    return ms > 0 ? new Date(ms) : undefined;
  };
  const zahl = (id: number): number | undefined => fest.get((id << 16) | 0x0003)?.getInt32(0, true);
  return { text, zeit, zahl };
}

/**
 * HTML grob in Text: Zeilenumbrüche im Quelltext zählen nicht (Outlook bricht den HTML-Quelltext mitten im Satz um),
 * Zeilenumbrüche an Blöcken, Tags weg, Entitäten (benannte häufige und numerische)
 */
export function htmlText(html: string): string {
  const benannt: Record<string, string> = {
    nbsp: ' ',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    amp: '&',
    auml: 'ä',
    ouml: 'ö',
    uuml: 'ü',
    Auml: 'Ä',
    Ouml: 'Ö',
    Uuml: 'Ü',
    szlig: 'ß',
    ndash: '–',
    mdash: '—',
  };
  return html
    .replace(/<(head|script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .replace(/<br\s*\/?>|<hr(\s[^>]*)?>|<\/(p|div|tr|li|h\d|blockquote|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (x, n: string) => benannt[n] ?? x)
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+/, '');
}

/**
 * Kopf einer Outlook-Nachricht (.msg): Betreff, Absender, Empfänger, Zeiten, Anhänge; mit `mitText` auch der Text
 * (etwa für den Kopf einer weitergeleiteten Nachricht) und die angehängten Nachrichten.
 */
export function msgKopf(bytes: Uint8Array, o: { mitText?: boolean } = {}): MsgKopf {
  const c = cfbLesen(bytes);
  return nachricht(c, 0, 32, !!o.mitText, 0);
}

/** so tief werden angehängte Nachrichten gelesen (Weiterleitung einer Weiterleitung …) */
const TIEFE = 4;

function nachricht(c: ReturnType<typeof cfbLesen>, id: number, kopfGroesse: number, mitText: boolean, tiefe: number): MsgKopf {
  const wurzel = c.ordner(id);
  const { text, zeit, zahl } = eigenschaften(c, wurzel, kopfGroesse);
  const smtp = (...werte: string[]) => werte.find((w) => w && !istX500(w)) ?? '';
  const empfaenger: MsgEmpfaenger[] = [];
  const anhaenge: string[] = [];
  const angehaengt: MsgKopf[] = [];
  // Reihenfolge wie in der Nachricht (die Speicher heißen …_#00000000, …_#00000001 …)
  for (const [name, e] of [...wurzel].sort((a, b) => a[0].localeCompare(b[0]))) {
    const idx = c.eintraege.indexOf(e);
    if (name.startsWith('__recip_version1.0_')) {
      const r = eigenschaften(c, c.ordner(idx), 8);
      const typ = r.zahl(0x0c15) ?? 1;
      const mail = smtp(r.text('39FE'), r.text('3003'));
      const x500 = !mail && (istX500(r.text('3003')) || r.text('3002').toUpperCase() === 'EX');
      empfaenger.push({ name: r.text('3001'), mail, art: typ === 2 ? 'cc' : typ === 3 ? 'bcc' : 'an', ...(x500 ? { x500: true as const } : {}) });
    } else if (name.startsWith('__attach_version1.0_')) {
      const speicher = c.ordner(idx);
      const a = eigenschaften(c, speicher, 8);
      const n = a.text('3707') || a.text('3704') || a.text('3001');
      if (n) anhaenge.push(n);
      if (mitText && tiefe < TIEFE) {
        const k = angehaengteNachricht(c, speicher, a, n, tiefe + 1);
        if (k) angehaengt.push(k);
      }
    }
  }
  const betreff = text('0037');
  const praefix = text('003D');
  const vonName = text('0C1A') || text('0042');
  const vonMail = smtp(text('5D01'), text('0C1F'), text('5D02'), text('0065'));
  const vonX500 = !vonMail && (istX500(text('0C1F')) || istX500(text('0065')) || text('0C1E').toUpperCase() === 'EX' || text('0064').toUpperCase() === 'EX');
  const imName = text('0042');
  const imMail = smtp(text('5D02'), text('0065'));
  const nachrichtId = text('1035');
  const orgName = text('005A') || text('005D');
  const orgRoh = text('0067') || text('0069');
  const orgMail = smtp(orgRoh);
  const original = orgName || orgMail ? { name: orgName, mail: orgMail, ...(!orgMail && istX500(orgRoh) ? { x500: true as const } : {}) } : null;
  return {
    klasse: text('001A'),
    betreff,
    thema: text('0E1D') || (praefix && betreff.startsWith(praefix) ? betreff.slice(praefix.length) : betreff).trim(),
    vonName,
    vonMail,
    ...(vonX500 ? { vonX500: true as const } : {}),
    ...(nachrichtId ? { nachrichtId } : {}),
    ...(original ? { original } : {}),
    ...(imName && imName !== vonName ? { imAuftragName: imName, ...(imMail ? { imAuftragMail: imMail } : {}) } : {}),
    empfaenger,
    anText: text('0E04'),
    ccText: text('0E03'),
    ...(zeit(0x0039) ? { gesendet: zeit(0x0039) } : {}),
    ...(zeit(0x0e06) ? { empfangen: zeit(0x0e06) } : {}),
    ...(zahl(0x0e07) !== undefined ? { flags: zahl(0x0e07) } : {}),
    anhaenge,
    ...(mitText ? { text: nachrichtenText(c, wurzel, text), ...(angehaengt.length ? { angehaengt } : {}) } : {}),
  };
}

/**
 * Nachricht in einem Anhang: eingebettet (PR_ATTACH_METHOD 5, Unterspeicher „__substg1.0_3701000D“; dessen
 * Eigenschaftskopf ist 24 Bytes lang), als .msg-Datei oder als .eml bzw. message/rfc822. Nicht lesbar: null.
 */
function angehaengteNachricht(c: ReturnType<typeof cfbLesen>, speicher: Map<string, CfbEintrag>, a: ReturnType<typeof eigenschaften>, name: string, tiefe: number): MsgKopf | null {
  try {
    const eingebettet = speicher.get('__substg1.0_3701000D');
    if (eingebettet && eingebettet.typ === 1) return nachricht(c, c.eintraege.indexOf(eingebettet), 24, true, tiefe);
    const datei = speicher.get('__substg1.0_37010102');
    if (!datei) return null;
    const mime = a.text('370E').toLowerCase();
    if (/\.msg$/i.test(name)) return nachricht(cfbLesen(c.strom(datei)), 0, 32, true, tiefe);
    if (/\.eml$/i.test(name) || mime === 'message/rfc822') return emlKopf(c.strom(datei));
  } catch {
    // beschädigter Anhang: zählt nicht
  }
  return null;
}

function nachrichtenText(c: ReturnType<typeof cfbLesen>, wurzel: Map<string, CfbEintrag>, text: (id: string) => string): string {
  const t = text('1000');
  if (t) return t.replace(/\r\n/g, '\n');
  const h = wurzel.get('__substg1.0_10130102');
  if (!h) return '';
  const bytes = c.strom(h);
  let html: string;
  try {
    html = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    html = ansi.decode(bytes);
  }
  return htmlText(html).replace(/\r\n/g, '\n');
}

/* ---------- Internet-Nachricht (.eml, message/rfc822) ---------- */

const dekodierer = (zeichensatz: string): TextDecoder => {
  try {
    return new TextDecoder(zeichensatz.trim().toLowerCase() || 'utf-8');
  } catch {
    return new TextDecoder('utf-8');
  }
};

/** Bytes aus einem Latin-1-String (so liest `emlKopf` die Nachricht zunächst) */
const bytesAus = (s: string) => Uint8Array.from(s, (z) => z.charCodeAt(0) & 0xff);

/** „=?utf-8?Q?M=C3=BCller?=“ bzw. „=?utf-8?B?…?=“ in Kopfzeilen */
function kopfDekodieren(s: string): string {
  return s.replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=(\s+(?==\?))?/gi, (_, cs: string, art: string, inhalt: string) => {
    const roh = art.toLowerCase() === 'b' ? atob(inhalt.replace(/[^a-z0-9+/=]/gi, '')) : inhalt.replace(/_/g, ' ').replace(/=([0-9a-f]{2})/gi, (_x, h: string) => String.fromCharCode(parseInt(h, 16)));
    return dekodierer(cs).decode(bytesAus(roh));
  });
}

function teilLesen(roh: string, tiefe = 0): { kopf: Map<string, string>; text: string } {
  const trenn = /\r?\n\r?\n/.exec(roh);
  const kopfRoh = trenn ? roh.slice(0, trenn.index) : roh;
  const rumpf = trenn ? roh.slice(trenn.index + trenn[0].length) : '';
  const kopf = new Map<string, string>();
  for (const zeile of kopfRoh.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const m = /^([\w-]+)\s*:\s*(.*)$/.exec(zeile);
    if (m && !kopf.has(m[1].toLowerCase())) kopf.set(m[1].toLowerCase(), m[2].trim());
  }
  const typ = kopf.get('content-type') ?? 'text/plain';
  const grenze = /boundary="?([^";]+)"?/i.exec(typ)?.[1];
  if (/^multipart\//i.test(typ) && grenze && tiefe < 5) {
    const teile = rumpf
      .split(`--${grenze}`)
      .slice(1, -1)
      .map((t) => teilLesen(t.replace(/^\r?\n/, ''), tiefe + 1));
    const passend = teile.find((t) => /^text\/plain/i.test(t.kopf.get('content-type') ?? 'text/plain') && t.text) ?? teile.find((t) => t.text);
    return { kopf, text: passend?.text ?? '' };
  }
  if (!/^text\//i.test(typ)) return { kopf, text: '' };
  const kodierung = (kopf.get('content-transfer-encoding') ?? '').toLowerCase();
  let bin = rumpf;
  if (kodierung === 'base64') {
    try {
      bin = atob(rumpf.replace(/[^a-z0-9+/=]/gi, ''));
    } catch {
      bin = '';
    }
  } else if (kodierung === 'quoted-printable') bin = rumpf.replace(/=\r?\n/g, '').replace(/=([0-9a-f]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
  const text = dekodierer(/charset="?([^";]+)"?/i.exec(typ)?.[1] ?? 'utf-8').decode(bytesAus(bin));
  return { kopf, text: /^text\/html/i.test(typ) ? htmlText(text) : text.replace(/\r\n/g, '\n') };
}

/** Adresse „Name <mail>“ bzw. „mail (Name)“ zerlegen */
function adresseZerlegen(s: string): { name: string; mail: string } {
  const spitz = /^(.*?)<([^<>]+)>\s*$/.exec(s);
  if (spitz) return { name: spitz[1].trim().replace(/^"(.*)"$/, '$1'), mail: spitz[2].trim() };
  const klammer = /^(\S+@\S+)\s*\((.*)\)\s*$/.exec(s);
  if (klammer) return { name: klammer[2].trim(), mail: klammer[1] };
  return { name: '', mail: s.trim() };
}

/**
 * Internet-Nachricht (.eml, message/rfc822) – nur was zum Bestimmen des Absenders gebraucht wird: Betreff, Absender,
 * Empfänger, Versand, Text (text/plain, sonst HTML ohne Tags). Die Form ist dieselbe wie bei `msgKopf` (Klasse „eml“).
 */
export function emlKopf(bytes: Uint8Array): MsgKopf {
  let roh = '';
  for (let i = 0; i < bytes.length; i += 0x8000) roh += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const { kopf, text } = teilLesen(roh);
  if (!kopf.has('from')) throw new Error('Keine Internet-Nachricht (.eml)');
  const von = adresseZerlegen(kopfDekodieren(kopf.get('from') ?? ''));
  const liste = (feld: string, art: 'an' | 'cc'): MsgEmpfaenger[] =>
    kopfDekodieren(kopf.get(feld) ?? '')
      .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => ({ ...adresseZerlegen(x), art }));
  const betreff = kopfDekodieren(kopf.get('subject') ?? '');
  const datum = kopf.has('date') ? new Date(kopf.get('date')!) : undefined;
  const id = kopf.get('message-id');
  return {
    klasse: 'eml',
    betreff,
    thema: betreff,
    vonName: von.name,
    vonMail: von.mail,
    ...(id ? { nachrichtId: id } : {}),
    empfaenger: [...liste('to', 'an'), ...liste('cc', 'cc')],
    anText: kopfDekodieren(kopf.get('to') ?? ''),
    ccText: kopfDekodieren(kopf.get('cc') ?? ''),
    ...(datum && !isNaN(datum.getTime()) ? { gesendet: datum } : {}),
    anhaenge: [],
    text,
  };
}
