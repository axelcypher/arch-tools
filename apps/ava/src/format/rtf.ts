/**
 * Texte der LV-Dateien: Kurz- und Langtexte stehen als RTF (Windows-1252, „\'fc“ für ü) in den Attributen. Gelesen
 * werden Absätze mit fett, kursiv und unterstrichen, Zeilenumbrüche, Tabulatoren und Aufzählungen; alles
 * andere (Schriften, Farben, Seitenformat) wird übersprungen. Geschrieben wird im Stil des Originalprogramms –
 * mit dessen Kopf (Schriften, Farben), falls der bisherige Text einen hatte.
 */

export interface Lauf {
  text: string;
  fett?: boolean;
  kursiv?: boolean;
  unterstrichen?: boolean;
}

export interface Absatz {
  laeufe: Lauf[];
  /** Aufzählungspunkt bzw. Nummer vor dem Absatz */
  liste?: 'punkt' | 'nummer';
}

/** Formatierter Text: Absätze aus Läufen */
export type Formattext = Absatz[];

const cp1252 = new TextDecoder('windows-1252');
const ZEICHEN_ZU_BYTE = (() => {
  const m = new Map<string, number>();
  for (let b = 0x80; b <= 0xff; b++) m.set(cp1252.decode(new Uint8Array([b])), b);
  return m;
})();

const OHNE_INHALT = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'listtable', 'listoverridetable', 'generator', 'pict', 'header', 'footer', 'headerl', 'headerr', 'footerl', 'footerr', 'xmlnstbl', 'rsidtbl', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'filetbl', 'revtbl', 'pgdsctbl']);

export const istRtf = (s: string | undefined) => !!s && /^\s*\{\\rtf/.test(s);

interface Zustand {
  fett: boolean;
  kursiv: boolean;
  unterstrichen: boolean;
  /** Gruppe ohne sichtbaren Inhalt */
  ueberspringen: boolean;
  /** Zeichen nach \uN überspringen */
  uc: number;
  /** \listtext: Aufzählungszeichen – nicht Teil des Textes */
  listtext: boolean;
}

/** RTF lesen; Text ohne RTF-Kopf wird als einfacher Text genommen (je Zeile ein Absatz) */
export function rtfLesen(rtf: string): Formattext {
  if (!istRtf(rtf)) return textAlsAbsaetze(rtf);
  const absaetze: Absatz[] = [];
  let absatz: Absatz = { laeufe: [] };
  let listeImAbsatz: Absatz['liste'];
  const stapel: Zustand[] = [];
  let z: Zustand = { fett: false, kursiv: false, unterstrichen: false, ueberspringen: false, uc: 1, listtext: false };
  let ueberspringeZeichen = 0;
  const text = (t: string) => {
    if (z.ueberspringen || !t) return;
    if (z.listtext) {
      listeImAbsatz = /^\s*\d/.test(t) ? 'nummer' : listeImAbsatz ?? 'punkt';
      return;
    }
    const letzt = absatz.laeufe[absatz.laeufe.length - 1];
    const art = { fett: z.fett || undefined, kursiv: z.kursiv || undefined, unterstrichen: z.unterstrichen || undefined };
    if (letzt && !!letzt.fett === !!art.fett && !!letzt.kursiv === !!art.kursiv && !!letzt.unterstrichen === !!art.unterstrichen) letzt.text += t;
    else absatz.laeufe.push({ text: t, ...(art.fett ? { fett: true } : {}), ...(art.kursiv ? { kursiv: true } : {}), ...(art.unterstrichen ? { unterstrichen: true } : {}) });
  };
  const absatzEnde = () => {
    if (listeImAbsatz) absatz.liste = listeImAbsatz;
    absaetze.push(absatz);
    absatz = { laeufe: [] };
    listeImAbsatz = undefined;
  };
  let i = 0;
  let tiefe = 0;
  while (i < rtf.length) {
    const c = rtf[i];
    if (c === '{') {
      stapel.push({ ...z });
      tiefe++;
      i++;
      // {\*\ziel …}: unbekannte Ziele überspringen
      if (rtf.startsWith('\\*', i)) z.ueberspringen = true;
      continue;
    }
    if (c === '}') {
      z = stapel.pop() ?? z;
      tiefe--;
      i++;
      if (tiefe <= 0) break;
      continue;
    }
    if (c === '\r' || c === '\n') {
      i++;
      continue;
    }
    if (c === '\\') {
      const n = rtf[i + 1];
      if (n === '\\' || n === '{' || n === '}') {
        if (ueberspringeZeichen > 0) ueberspringeZeichen--;
        else text(n);
        i += 2;
        continue;
      }
      if (n === '\r' || n === '\n') {
        // „\“ + Zeilenumbruch = Absatz
        if (!z.ueberspringen) absatzEnde();
        i += 2;
        if (n === '\r' && rtf[i] === '\n') i++;
        continue;
      }
      if (n === "'") {
        const hex = rtf.slice(i + 2, i + 4);
        i += 4;
        if (ueberspringeZeichen > 0) {
          ueberspringeZeichen--;
          continue;
        }
        text(cp1252.decode(new Uint8Array([parseInt(hex, 16)])));
        continue;
      }
      if (n === '~') {
        text('\u00a0');
        i += 2;
        continue;
      }
      if (n === '-' || n === '_') {
        if (n === '_') text('\u2011');
        i += 2;
        continue;
      }
      const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i));
      if (!m) {
        i += 2;
        continue;
      }
      i += m[0].length;
      const wort = m[1];
      const zahl = m[2] === undefined ? null : Number(m[2]);
      if (OHNE_INHALT.has(wort)) {
        z.ueberspringen = true;
        continue;
      }
      switch (wort) {
        case 'par':
          if (!z.ueberspringen) absatzEnde();
          break;
        case 'line':
          text('\n');
          break;
        case 'tab':
          text('\t');
          break;
        case 'b':
          z.fett = zahl !== 0;
          break;
        case 'i':
          z.kursiv = zahl !== 0;
          break;
        case 'ul':
          z.unterstrichen = zahl !== 0;
          break;
        case 'ulnone':
          z.unterstrichen = false;
          break;
        case 'plain':
          z.fett = z.kursiv = z.unterstrichen = false;
          break;
        case 'listtext':
          z.listtext = true;
          break;
        case 'uc':
          z.uc = zahl ?? 1;
          break;
        case 'u':
          if (zahl !== null) {
            text(String.fromCharCode(zahl < 0 ? zahl + 65536 : zahl));
            ueberspringeZeichen = z.uc;
          }
          break;
        case 'emdash':
          text('—');
          break;
        case 'endash':
          text('–');
          break;
        case 'bullet':
          text('•');
          break;
        case 'lquote':
          text('‘');
          break;
        case 'rquote':
          text('’');
          break;
        case 'ldblquote':
          text('„');
          break;
        case 'rdblquote':
          text('“');
          break;
      }
      continue;
    }
    if (ueberspringeZeichen > 0) {
      ueberspringeZeichen--;
      i++;
      continue;
    }
    // gewöhnlicher Text bis zum nächsten Steuerzeichen
    let j = i;
    while (j < rtf.length && !'\\{}\r\n'.includes(rtf[j])) j++;
    text(rtf.slice(i, j));
    i = j;
  }
  if (absatz.laeufe.length) absatzEnde();
  // abschließende leere Absätze gehören nicht zum Text
  while (absaetze.length && !absatzText(absaetze[absaetze.length - 1]).trim()) absaetze.pop();
  return absaetze;
}

export function textAlsAbsaetze(s: string): Formattext {
  const t = s.replace(/\r\n?/g, '\n');
  if (!t.trim()) return [];
  return t.split('\n').map((zeile) => ({ laeufe: zeile ? [{ text: zeile }] : [] }));
}

export const absatzText = (a: Absatz) => a.laeufe.map((l) => l.text).join('');

/** Formattext als einfacher Text (Absätze durch Zeilenumbruch getrennt, Aufzählungen mit „• “) */
export function alsText(f: Formattext): string {
  return f.map((a) => (a.liste === 'punkt' ? '• ' : a.liste === 'nummer' ? '– ' : '') + absatzText(a)).join('\n');
}

/** erste Zeile, z. B. als Kurztext */
export const ersteZeile = (f: Formattext) => alsText(f).split('\n').find((z) => z.trim())?.trim() ?? '';

/* ---------- Schreiben ---------- */

/** Kopf, wie ihn das Originalprogramm schreibt (Schriften Arial, Symbol, Wingdings; 16 Farben; A4-Ränder) */
export const STANDARD_KOPF =
  '{\\rtf1\\ansi\\deff0\\uc1\\ansicpg1252\\deftab720{\\fonttbl{\\f0\\fnil\\fcharset1 Arial;}{\\f1\\fnil\\fcharset2 Symbol;}{\\f2\\fnil\\fcharset2 Wingdings;}}' +
  '{\\colortbl\\red0\\green0\\blue0;\\red255\\green0\\blue0;\\red0\\green128\\blue0;\\red0\\green0\\blue255;\\red255\\green255\\blue0;\\red255\\green0\\blue255;\\red128\\green0\\blue128;\\red128\\green0\\blue0;\\red0\\green255\\blue0;\\red0\\green255\\blue255;\\red0\\green128\\blue128;\\red0\\green0\\blue128;\\red255\\green255\\blue255;\\red192\\green192\\blue192;\\red128\\green128\\blue128;\\red0\\green0\\blue0;}' +
  '\\wpprheadfoot1\\paperw12240\\paperh15840\\margl1880\\margr1880\\margt1440\\margb1440\\headery720\\footery720\\endnhere\\sectdefaultcl{\\*\\generator WPTools_7.270;}';

/** Kopf eines vorhandenen RTF (alles bis vor den ersten Absatz) – damit Schriften und Farben bleiben */
export function rtfKopf(rtf: string | undefined): string {
  if (!istRtf(rtf)) return STANDARD_KOPF;
  const m = /\{\\\*\\generator[^}]*\}/.exec(rtf!);
  if (m) return rtf!.slice(0, m.index + m[0].length);
  return STANDARD_KOPF;
}

function zeichen(t: string): string {
  let out = '';
  for (const c of t) {
    if (c === '\\' || c === '{' || c === '}') out += `\\${c}`;
    else if (c === '\n') out += '\\line ';
    else if (c === '\t') out += '\\tab ';
    else if (c === '\u00a0') out += '\\~';
    else if (c.charCodeAt(0) < 0x80) out += c;
    else {
      const b = ZEICHEN_ZU_BYTE.get(c);
      if (b !== undefined) out += `\\'${b.toString(16).toUpperCase().padStart(2, '0')}`;
      else {
        const code = c.codePointAt(0)!;
        if (code > 0xffff) {
          // Zeichen außerhalb der Grundebene als Ersatzpaar
          const s = c;
          for (let k = 0; k < s.length; k++) {
            const u = s.charCodeAt(k);
            out += `\\u${u > 32767 ? u - 65536 : u}?`;
          }
        } else out += `\\u${code > 32767 ? code - 65536 : code}?`;
      }
    }
  }
  return out;
}

function laufRtf(l: Lauf): string {
  const t = zeichen(l.text);
  if (!l.fett && !l.kursiv && !l.unterstrichen) return t;
  const an = `${l.fett ? '\\b' : ''}${l.kursiv ? '\\i' : ''}${l.unterstrichen ? '\\ul' : ''}`;
  return `{${an} ${t}}`;
}

/**
 * Langtext als RTF im Stil des Originalprogramms: je Absatz „\plain\fs20 …\par“, leere Absätze
 * „\pard\plain\plain\fs20\par“, Zeilen durch LF getrennt. `vorher` liefert den Kopf (Schriften, Farben).
 */
export function rtfSchreiben(f: Formattext, vorher?: string): string {
  const kopf = rtfKopf(vorher);
  let nr = 0;
  const zeilen = f.map((a) => {
    const inhalt = a.laeufe.map(laufRtf).join('');
    nr = a.liste === 'nummer' && inhalt ? nr + 1 : 0;
    if (!inhalt) return '\\pard\\plain\\plain\\fs20\\par\n';
    const punkt = a.liste === 'punkt' ? '{\\listtext\\bullet\\tab}' : a.liste === 'nummer' ? `{\\listtext ${nr}.\\tab}` : '';
    return `\\plain\\fs20 ${punkt}${inhalt}\\par\n`;
  });
  return `${kopf}{${zeilen.join('')}}}`;
}

/** Kurztext (eine Zeile) als RTF wie im Original: „{\wpparid0\plain\fs20 …\par}“ */
export function kurztextRtf(text: string, vorher?: string): string {
  return `${rtfKopf(vorher)}{\\wpparid0\\plain\\fs20 ${zeichen(text.replace(/\s*\n\s*/g, ' '))}\\par\n}}`;
}

/** Sind zwei Formattexte gleich (Text und Auszeichnung)? */
export function gleicherText(a: Formattext, b: Formattext): boolean {
  return JSON.stringify(normal(a)) === JSON.stringify(normal(b));
}

function normal(f: Formattext): Formattext {
  return f.map((a) => ({
    laeufe: a.laeufe.filter((l) => l.text).map((l) => ({ text: l.text, ...(l.fett ? { fett: true } : {}), ...(l.kursiv ? { kursiv: true } : {}), ...(l.unterstrichen ? { unterstrichen: true } : {}) })),
    ...(a.liste ? { liste: a.liste } : {}),
  }));
}
