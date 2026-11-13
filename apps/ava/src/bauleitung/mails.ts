/**
 * Mails aus den Korrespondenzordnern lesen – für den Mailverlauf eines Gewerks bzw. Projekts:
 *
 * - .eml (RFC 5322/MIME): Kopf (Von, An, Cc, Betreff, Datum), Text (text/plain, sonst text/html ohne Tags),
 *   Anhänge (Namen); Kodierungen quoted-printable/base64, RFC 2047 in Kopfzeilen.
 * - .msg (Outlook, Compound File Binary): Betreff, Absender, Empfänger, Datum und Text aus den
 *   Eigenschaftsströmen („__substg1.0_…“) und „__properties_version1.0“ (Container: @core/mail/msg).
 */

import { cfbLesen } from '@core/mail/msg';

export interface Mail {
  von: string;
  an: string;
  cc?: string;
  betreff: string;
  /** ISO-Zeitpunkt, falls lesbar */
  datum?: string;
  text: string;
  anhaenge: string[];
}

/* ---------- EML ---------- */

const latin1 = new TextDecoder('latin1');

function zeichensatz(name: string | undefined): string {
  const n = (name ?? 'utf-8').toLowerCase().replace(/^"|"$/g, '');
  return n === 'cp1252' ? 'windows-1252' : n;
}

function dekodiere(bytes: Uint8Array, charset?: string): string {
  try {
    return new TextDecoder(zeichensatz(charset)).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function base64Bytes(s: string): Uint8Array {
  const sauber = s.replace(/[^A-Za-z0-9+/=]/g, '');
  try {
    const bin = atob(sauber);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return new Uint8Array(0);
  }
}

function qpBytes(s: string): Uint8Array {
  const t = s.replace(/=\r?\n/g, '');
  const out: number[] = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(t.slice(i + 1, i + 3))) {
      out.push(parseInt(t.slice(i + 1, i + 3), 16));
      i += 2;
    } else out.push(t.charCodeAt(i) & 0xff);
  }
  return new Uint8Array(out);
}

/** RFC 2047: „=?UTF-8?B?…?=“ und „=?iso-8859-1?Q?…?=“ */
export function kopfDekodieren(s: string): string {
  return s.replace(/\?=\s+=\?/g, '?==?').replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, cs: string, art: string, inhalt: string) => {
    const bytes = art.toUpperCase() === 'B' ? base64Bytes(inhalt) : qpBytes(inhalt.replace(/_/g, ' '));
    return dekodiere(bytes, cs);
  });
}

function kopfTeilen(roh: string): { kopf: Map<string, string>; koerper: string } {
  const i = roh.search(/\r?\n\r?\n/);
  const kopfText = i < 0 ? roh : roh.slice(0, i);
  const koerper = i < 0 ? '' : roh.slice(i).replace(/^\r?\n\r?\n/, '');
  const kopf = new Map<string, string>();
  let letzter = '';
  for (const zeile of kopfText.split(/\r?\n/)) {
    if (/^\s/.test(zeile) && letzter) kopf.set(letzter, `${kopf.get(letzter)} ${zeile.trim()}`);
    else {
      const m = /^([^:]+):\s*(.*)$/.exec(zeile);
      if (m) {
        letzter = m[1].toLowerCase();
        kopf.set(letzter, kopf.has(letzter) ? `${kopf.get(letzter)}, ${m[2]}` : m[2]);
      }
    }
  }
  return { kopf, koerper };
}

const param = (wert: string | undefined, name: string) => {
  const m = new RegExp(`${name}\\*?=\\s*("([^"]*)"|[^;\\s]+)`, 'i').exec(wert ?? '');
  return m ? (m[2] ?? m[1]).replace(/^UTF-8''/i, '') : undefined;
};

const ohneHtml = (h: string) =>
  h
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

function teilLesen(roh: string, out: { text?: string; html?: string; anhaenge: string[] }) {
  const { kopf, koerper } = kopfTeilen(roh);
  const typ = kopf.get('content-type') ?? 'text/plain';
  const enc = (kopf.get('content-transfer-encoding') ?? '').toLowerCase().trim();
  const disp = kopf.get('content-disposition') ?? '';
  if (/^multipart\//i.test(typ)) {
    const grenze = param(typ, 'boundary');
    if (!grenze) return;
    for (const teil of koerper.split(`--${grenze}`).slice(1)) {
      if (teil.startsWith('--')) break;
      teilLesen(teil.replace(/^\r?\n/, ''), out);
    }
    return;
  }
  const name = param(disp, 'filename') ?? param(typ, 'name');
  if (/attachment/i.test(disp) || (name && !/^text\//i.test(typ))) {
    if (name) out.anhaenge.push(kopfDekodieren(decodeURIComponent(name)));
    return;
  }
  const bytes = enc === 'base64' ? base64Bytes(koerper) : enc === 'quoted-printable' ? qpBytes(koerper) : new Uint8Array([...koerper].map((c) => c.charCodeAt(0) & 0xff));
  const text = dekodiere(bytes, param(typ, 'charset'));
  if (/^text\/plain/i.test(typ) && out.text === undefined) out.text = text;
  else if (/^text\/html/i.test(typ) && out.html === undefined) out.html = text;
}

export function emlLesen(bytes: Uint8Array): Mail {
  const roh = latin1.decode(bytes);
  const { kopf } = kopfTeilen(roh);
  const out: { text?: string; html?: string; anhaenge: string[] } = { anhaenge: [] };
  teilLesen(roh, out);
  const k = (n: string) => kopfDekodieren(utf8Neu(kopf.get(n) ?? ''));
  const d = kopf.get('date') ? new Date(kopf.get('date')!) : null;
  return {
    von: k('from'),
    an: k('to'),
    ...(kopf.get('cc') ? { cc: k('cc') } : {}),
    betreff: k('subject'),
    ...(d && !Number.isNaN(d.getTime()) ? { datum: d.toISOString() } : {}),
    text: (out.text ?? (out.html ? ohneHtml(out.html) : '')).replace(/\r\n/g, '\n').trim(),
    anhaenge: out.anhaenge,
  };
}

/** Kopfzeilen ohne Kodierung, aber in UTF-8 (manche Programme schreiben sie roh) */
function utf8Neu(latin: string): string {
  const bytes = new Uint8Array([...latin].map((c) => c.charCodeAt(0) & 0xff));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return latin;
  }
}

/* ---------- MSG (Compound File Binary) ---------- */

export function msgLesen(bytes: Uint8Array): Mail {
  const c = cfbLesen(bytes);
  const wurzel = c.ordner(0);
  const text = (id: string): string => {
    const u = wurzel.get(`__substg1.0_${id}001F`);
    if (u) return new TextDecoder('utf-16le').decode(c.strom(u)).replace(/\0+$/, '');
    const a = wurzel.get(`__substg1.0_${id}001E`);
    if (a) return new TextDecoder('windows-1252').decode(c.strom(a)).replace(/\0+$/, '');
    return '';
  };
  let datum: string | undefined;
  const props = wurzel.get('__properties_version1.0');
  if (props) {
    const p = c.strom(props);
    const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
    for (let o = 32; o + 16 <= p.length; o += 16) {
      const tag = dv.getUint32(o, true);
      if (tag === 0x0e060040 || tag === 0x00390040) {
        const ticks = dv.getUint32(o + 8, true) + dv.getUint32(o + 12, true) * 2 ** 32;
        const ms = ticks / 10000 - 11644473600000;
        if (ms > 0) {
          datum = new Date(ms).toISOString();
          if (tag === 0x0e060040) break;
        }
      }
    }
  }
  const anhaenge: string[] = [];
  for (const [name, e] of wurzel) {
    if (!name.startsWith('__attach_version1.0_')) continue;
    const idx = c.eintraege.indexOf(e);
    const a = c.ordner(idx);
    const s = a.get('__substg1.0_3707001F') ?? a.get('__substg1.0_3704001F');
    if (s) anhaenge.push(new TextDecoder('utf-16le').decode(c.strom(s)).replace(/\0+$/, ''));
  }
  const vonName = text('0C1A');
  const vonMail = text('5D01') || text('0C1F');
  return {
    von: vonMail && vonName && vonName !== vonMail ? `${vonName} <${vonMail}>` : vonName || vonMail,
    an: text('0E04'),
    ...(text('0E03') ? { cc: text('0E03') } : {}),
    betreff: text('0037'),
    ...(datum ? { datum } : {}),
    text: (text('1000') || ohneHtml(text('1013'))).replace(/\r\n/g, '\n').trim(),
    anhaenge,
  };
}

export function mailLesen(name: string, bytes: Uint8Array): Mail {
  return /\.msg$/i.test(name) ? msgLesen(bytes) : emlLesen(bytes);
}
