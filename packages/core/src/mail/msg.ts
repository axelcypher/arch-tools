/**
 * Outlook-Nachrichten (.msg) lesen – ohne Outlook: Das Format ist eine Compound-File-Binary-Datei (OLE2) mit je einem
 * Strom pro MAPI-Eigenschaft („__substg1.0_<Tag><Typ>“) und den Eigenschaften fester Länge in
 * „__properties_version1.0“; Empfänger und Anhänge sind Unterspeicher. Gelesen werden die Angaben, die zum Ablegen
 * und Benennen gebraucht werden: Betreff, Absender, Empfänger, Sende- und Empfangszeit, Anhänge.
 * (Gemeinsam für die Apps „Projekt“ – Mails prüfen und benennen – und „AVA“ – Mailverlauf.)
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
}

export interface MsgKopf {
  /** Nachrichtenklasse, z. B. „IPM.Note“ */
  klasse: string;
  betreff: string;
  /** Betreff ohne Präfix („AW:“, „WG:“ …), wie Outlook ihn führt */
  thema: string;
  vonName: string;
  vonMail: string;
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

/** HTML grob in Text: Zeilenumbrüche an Blöcken, Tags weg, die häufigsten Entitäten */
function htmlText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

/**
 * Kopf einer Outlook-Nachricht (.msg): Betreff, Absender, Empfänger, Zeiten, Anhänge; mit `mitText` auch der Text
 * (etwa für den Kopf einer weitergeleiteten Nachricht).
 */
export function msgKopf(bytes: Uint8Array, o: { mitText?: boolean } = {}): MsgKopf {
  const c = cfbLesen(bytes);
  const wurzel = c.ordner(0);
  const { text, zeit, zahl } = eigenschaften(c, wurzel, 32);
  const smtp = (...werte: string[]) => werte.find((w) => w && !istX500(w)) ?? '';
  const empfaenger: MsgEmpfaenger[] = [];
  const anhaenge: string[] = [];
  for (const [name, e] of wurzel) {
    const idx = c.eintraege.indexOf(e);
    if (name.startsWith('__recip_version1.0_')) {
      const r = eigenschaften(c, c.ordner(idx), 8);
      const typ = r.zahl(0x0c15) ?? 1;
      empfaenger.push({ name: r.text('3001'), mail: smtp(r.text('39FE'), r.text('3003')), art: typ === 2 ? 'cc' : typ === 3 ? 'bcc' : 'an' });
    } else if (name.startsWith('__attach_version1.0_')) {
      const a = eigenschaften(c, c.ordner(idx), 8);
      const n = a.text('3707') || a.text('3704') || a.text('3001');
      if (n) anhaenge.push(n);
    }
  }
  // Reihenfolge wie in der Nachricht (die Speicher heißen …_#00000000, …_#00000001 …)
  const betreff = text('0037');
  const praefix = text('003D');
  const vonName = text('0C1A') || text('0042');
  const vonMail = smtp(text('5D01'), text('0C1F'), text('5D02'), text('0065'));
  const imName = text('0042');
  const imMail = smtp(text('5D02'), text('0065'));
  return {
    klasse: text('001A'),
    betreff,
    thema: text('0E1D') || (praefix && betreff.startsWith(praefix) ? betreff.slice(praefix.length) : betreff).trim(),
    vonName,
    vonMail,
    ...(imName && imName !== vonName ? { imAuftragName: imName, ...(imMail ? { imAuftragMail: imMail } : {}) } : {}),
    empfaenger,
    anText: text('0E04'),
    ccText: text('0E03'),
    ...(zeit(0x0039) ? { gesendet: zeit(0x0039) } : {}),
    ...(zeit(0x0e06) ? { empfangen: zeit(0x0e06) } : {}),
    ...(zahl(0x0e07) !== undefined ? { flags: zahl(0x0e07) } : {}),
    anhaenge,
    ...(o.mitText ? { text: nachrichtenText(c, wurzel, text) } : {}),
  };
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
