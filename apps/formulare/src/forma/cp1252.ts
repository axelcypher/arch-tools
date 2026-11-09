/**
 * Windows-1252 – so schreibt FORMA seine INI-Dateien (`sj_office.ini`, Sperrdateien `.frmtmp`).
 */

/** Zeichen der Bytes 0x80–0x9F (sonst wie Latin-1); undefinierte Bytes bleiben U+0080… */
const OBEN = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ';

export function cp1252Lesen(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b >= 0x80 && b <= 0x9f ? OBEN[b - 0x80] : String.fromCharCode(b);
  return s;
}

/** Zeichen ohne Entsprechung werden zu „?“ */
export function cp1252Schreiben(s: string): Uint8Array {
  const out: number[] = [];
  for (const c of s) {
    const u = c.codePointAt(0)!;
    const oben = OBEN.indexOf(c);
    if (u < 0x80 || (u >= 0xa0 && u <= 0xff)) out.push(u);
    else if (oben >= 0) out.push(0x80 + oben);
    else out.push(0x3f);
  }
  return new Uint8Array(out);
}

/** Einfache INI-Datei: Abschnitt → Schlüssel → Wert (Schlüssel ohne Rücksicht auf Groß-/Kleinschreibung) */
export function iniLesen(text: string): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  let abschnitt = new Map<string, string>();
  out.set('', abschnitt);
  for (const roh of text.split(/\r?\n/)) {
    const z = roh.trim();
    const kopf = /^\[(.*)\]$/.exec(z);
    if (kopf) {
      abschnitt = new Map();
      out.set(kopf[1].toLowerCase(), abschnitt);
    } else if (z.includes('=') && !z.startsWith(';')) {
      const i = z.indexOf('=');
      abschnitt.set(z.slice(0, i).trim().toLowerCase(), z.slice(i + 1).trim());
    }
  }
  return out;
}
