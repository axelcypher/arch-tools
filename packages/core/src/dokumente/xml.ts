/**
 * Kleiner XML-Leser für Office-Dateien (xlsx, docx): liefert Elemente mit ihrer Lage im Quelltext, damit sich
 * einzelne Stellen gezielt ersetzen lassen – alles andere bleibt Byte für Byte, wie Excel oder Word es
 * geschrieben haben. Namensräume werden nicht aufgelöst: Namen bleiben mit Präfix („w:t“, „c“).
 */

export interface XmlElement {
  name: string;
  attr: Record<string, string>;
  kinder: XmlElement[];
  /** Text direkt in diesem Element (ohne Kinder), entschlüsselt */
  text: string;
  /** Lage im Quelltext: ganzes Element und Inhalt zwischen Start- und End-Tag */
  start: number;
  ende: number;
  innenStart: number;
  innenEnde: number;
}

const ENTITAETEN: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function entschluesseln(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTITAETEN[e.toLowerCase()] ?? m;
  });
}

/** Text für XML (Inhalt oder Attribut) */
export const verschluesseln = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const ATTR = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

/** Liest ein XML-Dokument; wirft bei grob kaputtem Aufbau */
export function xmlLesen(quelle: string): XmlElement {
  const wurzel: XmlElement = { name: '#dokument', attr: {}, kinder: [], text: '', start: 0, ende: quelle.length, innenStart: 0, innenEnde: quelle.length };
  const stapel: XmlElement[] = [wurzel];
  let i = 0;
  while (i < quelle.length) {
    const lt = quelle.indexOf('<', i);
    const oben = stapel[stapel.length - 1];
    if (lt < 0) {
      oben.text += entschluesseln(quelle.slice(i));
      break;
    }
    if (lt > i) oben.text += entschluesseln(quelle.slice(i, lt));
    if (quelle.startsWith('<?', lt)) {
      i = quelle.indexOf('?>', lt) + 2;
    } else if (quelle.startsWith('<!--', lt)) {
      i = quelle.indexOf('-->', lt) + 3;
    } else if (quelle.startsWith('<![CDATA[', lt)) {
      const e = quelle.indexOf(']]>', lt);
      oben.text += quelle.slice(lt + 9, e);
      i = e + 3;
    } else if (quelle.startsWith('<!', lt)) {
      i = quelle.indexOf('>', lt) + 1;
    } else if (quelle[lt + 1] === '/') {
      const gt = quelle.indexOf('>', lt);
      const name = quelle.slice(lt + 2, gt).trim();
      const el = stapel.pop();
      if (!el || el.name !== name) throw new Error(`XML: </${name}> passt nicht zu <${el?.name}>`);
      el.innenEnde = lt;
      el.ende = gt + 1;
      i = gt + 1;
    } else {
      // Ende des Tags finden – „>“ in Attributwerten überspringen
      let j = lt + 1;
      let q = '';
      while (j < quelle.length) {
        const c = quelle[j];
        if (q) {
          if (c === q) q = '';
        } else if (c === '"' || c === "'") q = c;
        else if (c === '>') break;
        j++;
      }
      const leer = quelle[j - 1] === '/';
      const inhalt = quelle.slice(lt + 1, leer ? j - 1 : j);
      const name = /^[^\s/>]+/.exec(inhalt)![0];
      const attr: Record<string, string> = {};
      for (const m of inhalt.slice(name.length).matchAll(ATTR)) attr[m[1]] = entschluesseln(m[3] ?? m[4] ?? '');
      const el: XmlElement = { name, attr, kinder: [], text: '', start: lt, ende: j + 1, innenStart: j + 1, innenEnde: j + 1 };
      oben.kinder.push(el);
      if (!leer) stapel.push(el);
      i = j + 1;
    }
    if (i <= 0) throw new Error('XML: unvollständig');
  }
  if (stapel.length !== 1) throw new Error(`XML: <${stapel[stapel.length - 1].name}> nicht geschlossen`);
  return wurzel;
}

/** Erstes Kind mit diesem Namen */
export const kind = (el: XmlElement | undefined, name: string) => el?.kinder.find((k) => k.name === name);
export const alleKinder = (el: XmlElement | undefined, name: string) => el?.kinder.filter((k) => k.name === name) ?? [];

/** Alle Nachfahren mit diesem Namen, in Dokumentreihenfolge */
export function nachfahren(el: XmlElement, name: string, out: XmlElement[] = []): XmlElement[] {
  for (const k of el.kinder) {
    if (k.name === name) out.push(k);
    nachfahren(k, name, out);
  }
  return out;
}

/** Wurzelelement eines gelesenen Dokuments */
export const wurzelVon = (doc: XmlElement) => doc.kinder[0];

export interface Ersetzung {
  start: number;
  ende: number;
  text: string;
}

/** Stellen im Quelltext ersetzen (dürfen sich nicht überlappen) */
export function ersetzen(quelle: string, ersetzungen: Ersetzung[]): string {
  const sortiert = [...ersetzungen].sort((a, b) => b.start - a.start);
  let out = quelle;
  let grenze = Infinity;
  for (const e of sortiert) {
    if (e.ende > grenze) throw new Error('Überlappende Ersetzungen');
    out = out.slice(0, e.start) + e.text + out.slice(e.ende);
    grenze = e.start;
  }
  return out;
}
