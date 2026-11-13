/**
 * Mailentwurf als .eml (RFC 5322/2045) mit Anhängen. Mit „X-Unsent: 1“ öffnet Outlook die Datei als neue,
 * ungesendete Nachricht – Empfänger, Betreff, Text und Anhang stehen schon da, es bleibt „Senden“.
 * Andere Mailprogramme zeigen sie als Nachricht an („Als neue Nachricht bearbeiten“).
 */

import { bytesToBase64 } from '@core/platform/files';
import { ersetzen, type Variable, type Wert } from '@core/platzhalter';
import { MAIL_RECHNUNG_VARIABLEN } from '../platzhalter';

export interface MailAnhang {
  name: string;
  daten: Uint8Array;
  typ?: string;
}

export interface Mail {
  an: string[];
  cc?: string[];
  betreff: string;
  text: string;
  anhaenge: MailAnhang[];
  /** Absender (optional – sonst setzt das Mailprogramm das eigene Konto) */
  von?: string;
}

/** Kopfzeilen mit Umlauten nach RFC 2047 (UTF-8, Base64) */
export function kopfWert(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  const bytes = new TextEncoder().encode(s);
  // in Stücken zu höchstens 45 Byte, damit die Zeilen kurz bleiben (ganze UTF-8-Zeichen)
  const teile: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    let ende = Math.min(start + 45, bytes.length);
    while (ende < bytes.length && (bytes[ende] & 0xc0) === 0x80) ende--;
    teile.push(`=?UTF-8?B?${bytesToBase64(bytes.slice(start, ende))}?=`);
    start = ende;
  }
  return teile.join('\r\n ');
}

const zeilen76 = (b64: string) => b64.replace(/.{1,76}/g, '$&\r\n');

function mimeTyp(name: string): string {
  const e = name.toLowerCase().split('.').pop();
  return e === 'pdf' ? 'application/pdf' : e === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : e === 'jpg' || e === 'jpeg' ? 'image/jpeg' : e === 'png' ? 'image/png' : 'application/octet-stream';
}

/** Dateiname im Anhang nach RFC 2231 (Umlaute) und zur Sicherheit zusätzlich nach RFC 2047 */
function dateinameKopf(name: string): string {
  if (/^[\x20-\x7e]*$/.test(name) && !/["\\]/.test(name)) return `filename="${name}"`;
  const kodiert = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `filename*=UTF-8''${kodiert};\r\n filename="${kopfWert(name)}"`;
}

export function emlBauen(m: Mail, jetzt = new Date(), grenze = `----=_arch-tools_${jetzt.getTime().toString(36)}`): Uint8Array {
  const kopf: string[] = [];
  if (m.von) kopf.push(`From: ${kopfWert(m.von)}`);
  if (m.an.length) kopf.push(`To: ${m.an.map(kopfWert).join(', ')}`);
  if (m.cc?.length) kopf.push(`Cc: ${m.cc.map(kopfWert).join(', ')}`);
  kopf.push(`Subject: ${kopfWert(m.betreff)}`);
  kopf.push('X-Unsent: 1');
  kopf.push('MIME-Version: 1.0');
  kopf.push(`Content-Type: multipart/mixed; boundary="${grenze}"`);
  const text = m.text.replace(/\r?\n/g, '\r\n');
  const teile: string[] = [
    `--${grenze}\r\nContent-Type: text/plain; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${zeilen76(bytesToBase64(new TextEncoder().encode(text)))}`,
    ...m.anhaenge.map(
      (a) =>
        `--${grenze}\r\nContent-Type: ${a.typ ?? mimeTyp(a.name)}; name="${kopfWert(a.name)}"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; ${dateinameKopf(a.name)}\r\n\r\n${zeilen76(bytesToBase64(a.daten))}`,
    ),
  ];
  const eml = `${kopf.join('\r\n')}\r\n\r\n${teile.join('')}--${grenze}--\r\n`;
  return new TextEncoder().encode(eml);
}

/**
 * Platzhalter in Empfängern, Betreff und Text der Mailvorlagen ersetzen – Variablen siehe ../platzhalter.ts (Rechnung
 * bzw. Protokoll); `werte` nach den neuen Namen. Platzhalter ohne Wert bleiben sichtbar stehen.
 */
export function vorlageFuellen(vorlage: string, werte: Record<string, Wert>, variablen: Variable[] = MAIL_RECHNUNG_VARIABLEN): string {
  return ersetzen(vorlage, variablen, werte, { ohneWert: 'stehen' });
}
