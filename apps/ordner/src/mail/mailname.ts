import type { MsgKopf } from '@core/mail/msg';
import { sichererName } from '../struktur';

/**
 * Mails im Projektordner richtig benennen: `<Projektcode> von|an <Name> <JJMMTT> <Thema>.msg`, z. B.
 * „SIS von Peitz 261110 Raumaufteilung.msg“. Hier stehen die reinen Regeln – Name prüfen, aus der Nachricht einen
 * Vorschlag bilden, Name zusammensetzen. Das Datum ist das Empfangs- bzw. Sendedatum aus der Nachricht (nicht das
 * Datum der Datei, das beim Kopieren wechselt).
 */

export type Richtung = 'von' | 'an';

export interface MailTeile {
  code: string;
  richtung: Richtung;
  /** Nachname bzw. kurzer Name des Gegenübers */
  name: string;
  /** JJMMTT */
  datum: string;
  thema: string;
}

export const MAIL_SCHEMA = '<Projektcode> von|an <Name> <JJMMTT> <Thema>.msg';

const MUSTER = /^(\S+) (von|an) (.+?) (\d{6}) (.+)\.msg$/i;

/** Präfixe von Antworten und Weiterleitungen – auch so, wie sie nach dem Ersetzen von „:“ im Dateinamen stehen */
const PRAEFIX = /^(?:(?:aw|wg|re|fw|fwd|wtr|tr|antw|antwort|rv|sv)\s*(?::|_+|\s-)\s*|\[(?:extern|external|ext)\]\s*|\*extern\*\s*)/i;
const ENDUNG = /\.(?:docx?|xlsx?|xlsm|pptx?|pdf|dwg|dxf|jpe?g|png|tiff?|gif|zip|msg|eml|txt|csv|ifc|pln|rtf|odt)\b/gi;
/** Postfächer ohne Personennamen: dann zählt der Name aus der Domain */
const SAMMELPOSTFACH =
  /^(info|kontakt|post|mail|email|office|buero|büro|service|noreply|no-reply|zentrale|poststelle|verwaltung|bauamt|bauaufsicht|team|hallo|hello|anfrage|anfragen|rechnung|rechnungen|buchhaltung|empfang|sekretariat)$/i;
const TITEL = /^(dr\.?|prof\.?|dipl\.?-?\w*\.?|ing\.?|herr|frau|hr\.?|fr\.?|mag\.?|b\.?\s?a\.?|m\.?\s?a\.?)$/i;

const tag = (d: Date) => `${String(d.getFullYear() % 100).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

/** JJMMTT gültig? */
export function datumGueltig(jjmmtt: string): boolean {
  if (!/^\d{6}$/.test(jjmmtt)) return false;
  const m = Number(jjmmtt.slice(2, 4));
  const t = Number(jjmmtt.slice(4, 6));
  const d = new Date(2000 + Number(jjmmtt.slice(0, 2)), m - 1, t);
  return m >= 1 && m <= 12 && d.getDate() === t;
}

/** Thema aus einem Betreff: ohne „AW:“/„WG:“, ohne Dateiendungen, Unterstriche als Leerzeichen, für Dateinamen bereinigt */
export function themaAus(betreff: string, max = 80): string {
  let t = betreff.trim();
  for (let i = 0; i < 6 && PRAEFIX.test(t); i++) t = t.replace(PRAEFIX, '').trim();
  t = sichererName(t.replace(ENDUNG, '').replace(/_+/g, ' ').replace(/\s+/g, ' ')).replace(/^[-–\s]+/, '');
  if (t.length <= max) return t;
  const kurz = t.slice(0, max);
  return (kurz.lastIndexOf(' ') > max * 0.6 ? kurz.slice(0, kurz.lastIndexOf(' ')) : kurz).trim();
}

const gross = (s: string) => s.replace(/(^|[-\s])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());

/** Nachname bzw. kurzer Name aus Anzeigename und Adresse: „Peitz, Rüdiger“, „Rüdiger Peitz | Firma“, „ruediger.peitz@…“ → „Peitz“ */
export function nachname(anzeige: string, mail = ''): string {
  let n = anzeige
    .split('|')[0]
    .replace(/\(.*?\)|["'„“”]/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .trim();
  if (n.includes('@')) {
    if (!mail) mail = n;
    n = '';
  }
  if (n) {
    if (n.includes(',')) return sichererName(n.split(',')[0].trim());
    const woerter = n.split(/\s+/).filter((w) => w && !TITEL.test(w));
    if (woerter.length) return sichererName(woerter[woerter.length - 1]);
  }
  const m = /^([^@\s]+)@([^@\s]+)$/.exec(mail.trim());
  if (!m) return '';
  const lokal = m[1];
  if (SAMMELPOSTFACH.test(lokal.replace(/[._-]?\d+$/, ''))) {
    const domain = m[2].toLowerCase().split('.').slice(0, -1);
    const label = domain.filter((x) => !/^(mail|www|smtp|post)$/.test(x)).pop() ?? domain.pop() ?? '';
    return gross(label);
  }
  const teile = lokal.split(/[._-]+/).filter((x) => x && !/^\d+$/.test(x));
  return gross(teile[teile.length - 1] ?? lokal);
}

/** Domain einer Adresse (klein) */
export const domainVon = (mail: string) => (/@([^@\s>]+)/.exec(mail)?.[1] ?? '').toLowerCase();

/** Gehört die Adresse zum eigenen Büro? `eigene`: Domains („akh-architektur.de“) oder ganze Adressen */
export function istEigene(mail: string, eigene: string[]): boolean {
  const m = mail.trim().toLowerCase();
  if (!m || !eigene.length) return false;
  return eigene.some((e) => {
    const x = e.trim().toLowerCase().replace(/^@/, '');
    return x && (x.includes('@') ? m === x : domainVon(m) === x || domainVon(m).endsWith(`.${x}`));
  });
}

/** Kopf der weitergeleiteten bzw. zitierten Nachricht im Text: „Von: Peitz, Rüdiger <ruediger.peitz@…>“ */
export function weitergeleitetVon(text: string): { name: string; mail: string } | null {
  const m = /^[ \t>*]*(?:Von|From|De)\s*:\s*(.+?)\s*$/im.exec(text);
  if (!m) return null;
  const roh = m[1].replace(/\[mailto:[^\]]*\]/i, '').trim();
  const mail = /<?([^<>\s@]+@[^<>\s]+?)>?$/.exec(roh)?.[1] ?? '';
  const name = roh
    .replace(/<[^>]*>/, '')
    .replace(mail, '')
    .trim();
  return { name: name || mail, mail };
}

const istWeiterleitung = (betreff: string) => /^\s*(wg|fw|fwd|wtr|tr)\s*:/i.test(betreff);

export interface MailVorschlag {
  teile: MailTeile;
  /** woher Richtung und Name kommen – als Hinweis in der Liste */
  herkunft: string;
}

/**
 * Vorschlag für den Namen aus der Nachricht:
 * - Absender von außen → „von <Absender>“, Datum = Empfang
 * - Absender aus dem Büro → „an <erster Empfänger von außen>“, Datum = Versand
 * - Weiterleitung aus dem Büro (WG:) einer Mail von außen → „von <ursprünglicher Absender>“ (aus dem Text), Datum =
 *   Empfang dieser Nachricht
 * Ohne eigene Domains (`eigene`) gilt die Richtung aus dem bisherigen Dateinamen, sonst „von“.
 */
export function mailVorschlag(k: MsgKopf, o: { code: string; eigene: string[]; bisher?: MailTeile | null }): MailVorschlag {
  const thema = themaAus(k.thema || k.betreff) || o.bisher?.thema || 'ohne Betreff';
  const aussen = k.empfaenger.filter((e) => e.art !== 'bcc' && !istEigene(e.mail, o.eigene));
  const vonEigen = istEigene(k.vonMail, o.eigene);
  const datumVon = k.empfangen ?? k.gesendet;
  const datumAn = k.gesendet ?? k.empfangen;
  let richtung: Richtung;
  let name: string;
  let herkunft: string;
  const weiter = istWeiterleitung(k.betreff) && k.text ? weitergeleitetVon(k.text) : null;
  if (!o.eigene.length) {
    richtung = o.bisher?.richtung ?? 'von';
    const p = richtung === 'an' ? (k.empfaenger.find((e) => e.art === 'an') ?? k.empfaenger[0]) : null;
    name = richtung === 'an' && p ? nachname(p.name, p.mail) : nachname(k.vonName, k.vonMail);
    herkunft = 'Richtung aus dem bisherigen Namen – eigene Domain in den Einstellungen festlegen, dann erkennt die App sie selbst';
  } else if (!vonEigen) {
    richtung = 'von';
    name = nachname(k.vonName, k.vonMail);
    herkunft = `Absender ${k.vonMail || k.vonName}`;
  } else if (weiter && weiter.mail && !istEigene(weiter.mail, o.eigene)) {
    richtung = 'von';
    name = nachname(weiter.name, weiter.mail);
    herkunft = `weitergeleitet von ${k.vonName.split('|')[0].trim()}, ursprünglich von ${weiter.mail || weiter.name}`;
  } else if (aussen.length) {
    richtung = 'an';
    const p = aussen.find((e) => e.art === 'an') ?? aussen[0];
    name = nachname(p.name, p.mail);
    herkunft = `gesendet an ${p.mail || p.name}`;
  } else {
    richtung = 'von';
    name = nachname(k.vonName, k.vonMail);
    herkunft = 'nur Empfänger aus dem Büro';
  }
  const datum = richtung === 'von' ? datumVon : datumAn;
  return {
    teile: { code: o.code, richtung, name: name || o.bisher?.name || '', datum: datum ? tag(datum) : (o.bisher?.datum ?? ''), thema },
    herkunft,
  };
}

/** Name aus den Teilen – jeder Teil für Dateinamen bereinigt */
export function mailName(t: MailTeile): string {
  const teil = (s: string) => sichererName(s.replace(/\s+/g, ' '));
  return `${[teil(t.code), t.richtung, teil(t.name), t.datum, teil(t.thema)].filter(Boolean).join(' ')}.msg`;
}

/** Teile aus einem Dateinamen nach dem Schema; null, wenn er nicht passt */
export function mailNameLesen(datei: string): MailTeile | null {
  const m = MUSTER.exec(datei.trim());
  if (!m) return null;
  return { code: m[1], richtung: m[2].toLowerCase() as Richtung, name: m[3], datum: m[4], thema: m[5] };
}

export interface NamensBefund {
  ok: boolean;
  gruende: string[];
  teile: MailTeile | null;
}

/** Dateiname einer Mail gegen das Schema prüfen (ohne die Nachricht zu lesen) */
export function mailNamePruefen(datei: string, code: string): NamensBefund {
  const teile = mailNameLesen(datei);
  const gruende: string[] = [];
  if (!teile) {
    gruende.push(`entspricht nicht dem Schema ${MAIL_SCHEMA}`);
    return { ok: false, gruende, teile };
  }
  if (code && teile.code.toLowerCase() !== code.toLowerCase()) gruende.push(`Projektcode „${teile.code}“ statt „${code}“`);
  if (/@/.test(teile.name)) gruende.push('Name ist eine E-Mail-Adresse – nur der Nachname');
  else if (/[._]/.test(teile.name)) gruende.push('Name mit Punkt oder Unterstrich');
  if (!datumGueltig(teile.datum)) gruende.push(`Datum „${teile.datum}“ ist kein gültiges JJMMTT`);
  if (PRAEFIX.test(teile.thema)) gruende.push('Thema beginnt mit „AW“/„WG“ – ohne Präfix');
  if (/_/.test(teile.thema)) gruende.push('Unterstriche im Thema');
  const endung = teile.thema.match(ENDUNG);
  if (endung) gruende.push(`Dateiendung im Thema (${endung[0]})`);
  if (/\s{2,}/.test(datei)) gruende.push('doppelte Leerzeichen');
  return { ok: !gruende.length, gruende, teile };
}
