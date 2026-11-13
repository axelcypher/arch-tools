/**
 * Verlustfreies XML für die LV-Dateien: Jedes Element behält seinen Start-Tag so, wie er in der Datei steht,
 * jeder Zwischenraum bleibt Text. Unverändert zurückgeschrieben ergibt sich die Datei Byte für Byte; geändert
 * werden nur Attribute, die die App setzt, und Elemente, die sie anlegt oder entfernt. Neue Elemente bekommen
 * die Einrückung ihrer Nachbarn (zwei Leerzeichen je Ebene, CRLF wie im Original).
 */

export interface XText {
  typ: 'text';
  /** Quelltext, wie er in der Datei steht (Entitäten nicht aufgelöst) */
  roh: string;
}

export interface XElement {
  typ: 'element';
  name: string;
  /** Attribute in Dateireihenfolge, Werte entschlüsselt */
  attr: [string, string][];
  kinder: XKnoten[];
  /** leeres Element in Kurzform (<A/>) */
  kurz: boolean;
  /** Start-Tag aus der Datei; fällt weg, sobald ein Attribut geändert wird */
  rohStart?: string;
}

export type XKnoten = XText | XElement;

export interface XDokument {
  /** alles vor dem Wurzelelement (BOM, <?xml …?>, Zeilenumbruch) */
  vorspann: string;
  wurzel: XElement;
  nachspann: string;
  /** Zeilenende der Datei */
  zeilenende: string;
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function entschluesseln(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENT[e.toLowerCase()] ?? m;
  });
}

/** Attributwert verschlüsseln – wie das Originalprogramm (' als &apos;, Zeilenumbrüche bleiben roh) */
export const attrVerschluesseln = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const ATTR = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

export function xmlParsen(quelle: string): XDokument {
  const stapel: XElement[] = [];
  let wurzel: XElement | null = null;
  let vorspann = '';
  let nachspann = '';
  let i = 0;
  const textAnhaengen = (roh: string) => {
    if (!roh) return;
    const oben = stapel[stapel.length - 1];
    if (oben) {
      const letzt = oben.kinder[oben.kinder.length - 1];
      if (letzt?.typ === 'text') letzt.roh += roh;
      else oben.kinder.push({ typ: 'text', roh });
    } else if (wurzel) nachspann += roh;
    else vorspann += roh;
  };
  while (i < quelle.length) {
    const lt = quelle.indexOf('<', i);
    if (lt < 0) {
      textAnhaengen(quelle.slice(i));
      break;
    }
    if (lt > i) textAnhaengen(quelle.slice(i, lt));
    if (quelle.startsWith('<?', lt) || quelle.startsWith('<!--', lt) || quelle.startsWith('<!', lt)) {
      const ende = quelle.startsWith('<?', lt) ? quelle.indexOf('?>', lt) + 2 : quelle.startsWith('<!--', lt) ? quelle.indexOf('-->', lt) + 3 : quelle.indexOf('>', lt) + 1;
      if (ende <= lt) throw new Error('XML: unvollständig');
      textAnhaengen(quelle.slice(lt, ende));
      i = ende;
      continue;
    }
    if (quelle[lt + 1] === '/') {
      const gt = quelle.indexOf('>', lt);
      const name = quelle.slice(lt + 2, gt).trim();
      const el = stapel.pop();
      if (!el || el.name !== name) throw new Error(`XML: </${name}> passt nicht zu <${el?.name}>`);
      i = gt + 1;
      continue;
    }
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
    if (j >= quelle.length) throw new Error('XML: Tag nicht geschlossen');
    const kurz = quelle[j - 1] === '/';
    const inhalt = quelle.slice(lt + 1, kurz ? j - 1 : j);
    const name = /^[^\s/>]+/.exec(inhalt)![0];
    const attr: [string, string][] = [];
    for (const m of inhalt.slice(name.length).matchAll(ATTR)) attr.push([m[1], entschluesseln(m[3] ?? m[4] ?? '')]);
    const el: XElement = { typ: 'element', name, attr, kinder: [], kurz, rohStart: quelle.slice(lt, j + 1) };
    const oben = stapel[stapel.length - 1];
    if (oben) oben.kinder.push(el);
    else if (!wurzel) wurzel = el;
    else throw new Error('XML: mehr als ein Wurzelelement');
    if (!kurz) stapel.push(el);
    i = j + 1;
  }
  if (!wurzel) throw new Error('XML: kein Wurzelelement');
  if (stapel.length) throw new Error(`XML: <${stapel[stapel.length - 1].name}> nicht geschlossen`);
  const zeilenende = /\r\n/.test(quelle) ? '\r\n' : '\n';
  return { vorspann, wurzel, nachspann, zeilenende };
}

function startTag(el: XElement): string {
  if (el.rohStart && el.kurz === el.rohStart.endsWith('/>')) return el.rohStart;
  const a = el.attr.map(([k, v]) => ` ${k}="${attrVerschluesseln(v)}"`).join('');
  return `<${el.name}${a}${el.kurz ? '/>' : '>'}`;
}

export function xmlSchreiben(d: XDokument): string {
  const teile: string[] = [d.vorspann];
  const schreib = (el: XElement) => {
    teile.push(startTag(el));
    if (el.kurz) return;
    for (const k of el.kinder) {
      if (k.typ === 'text') teile.push(k.roh);
      else schreib(k);
    }
    teile.push(`</${el.name}>`);
  };
  schreib(d.wurzel);
  teile.push(d.nachspann);
  return teile.join('');
}

/* ---------- Zugriff ---------- */

export const elemente = (el: XElement | undefined, name?: string): XElement[] =>
  (el?.kinder.filter((k): k is XElement => k.typ === 'element' && (name === undefined || k.name === name)) ?? []);

export const erstes = (el: XElement | undefined, name: string): XElement | undefined => elemente(el, name)[0];

export const attr = (el: XElement | undefined, name: string): string | undefined => el?.attr.find(([k]) => k === name)?.[1];

/** Attribut setzen; ändert nichts, wenn der Wert schon so ist */
export function attrSetzen(el: XElement, name: string, wert: string): boolean {
  const a = el.attr.find(([k]) => k === name);
  if (a && a[1] === wert) return false;
  if (a) a[1] = wert;
  else el.attr.push([name, wert]);
  el.rohStart = undefined;
  return true;
}

/** Einrückung eines Kindes von `el` – aus den vorhandenen Kindern, sonst eine Ebene tiefer als `el` selbst */
function einrueckung(el: XElement, tiefe: number, zeilenende: string): { kind: string; schluss: string } {
  for (let i = 0; i < el.kinder.length - 1; i++) {
    const k = el.kinder[i];
    if (k.typ === 'text' && el.kinder[i + 1].typ === 'element') {
      const m = /(\r?\n)([ \t]*)$/.exec(k.roh);
      if (m) {
        const letzt = el.kinder[el.kinder.length - 1];
        const s = letzt.typ === 'text' ? /(\r?\n[ \t]*)$/.exec(letzt.roh)?.[1] : undefined;
        return { kind: m[1] + m[2], schluss: s ?? `${m[1]}${'  '.repeat(tiefe)}` };
      }
    }
  }
  return { kind: `${zeilenende}${'  '.repeat(tiefe + 1)}`, schluss: `${zeilenende}${'  '.repeat(tiefe)}` };
}

/** Tiefe eines Elements unter der Wurzel (Wurzel = 0) */
export function tiefeVon(wurzel: XElement, ziel: XElement): number {
  const suche = (el: XElement, t: number): number => {
    if (el === ziel) return t;
    for (const k of elemente(el)) {
      const r = suche(k, t + 1);
      if (r >= 0) return r;
    }
    return -1;
  };
  return suche(wurzel, 0);
}

/**
 * Kinder eines Elements neu setzen (Reihenfolge, neue, entfernte) und dabei die Einrückung pflegen: Zwischen
 * den Elementen steht der Zeilenumbruch mit der Einrückung der Ebene, wie im Original.
 */
export function kinderSetzen(el: XElement, neu: XElement[], tiefe: number, zeilenende: string): void {
  const alt = elemente(el);
  if (alt.length === neu.length && alt.every((a, i) => a === neu[i])) return;
  const { kind, schluss } = einrueckung(el, tiefe, zeilenende);
  if (!neu.length) {
    el.kinder = [];
    el.kurz = true;
    return;
  }
  const kinder: XKnoten[] = [];
  for (const k of neu) {
    kinder.push({ typ: 'text', roh: kind }, k);
  }
  kinder.push({ typ: 'text', roh: schluss });
  el.kinder = kinder;
  if (el.kurz) {
    el.kurz = false;
    el.rohStart = undefined;
  }
}

/** Neues Element (Kurzform, wenn ohne Kinder) */
export function neuesElement(name: string, attribute: [string, string][] = [], kinder: XElement[] = []): XElement {
  const el: XElement = { typ: 'element', name, attr: attribute, kinder: [], kurz: true };
  if (kinder.length) {
    el.kurz = false;
    el.kinder = kinder;
  }
  return el;
}

/** Tiefe Kopie eines Elements (für Vorlagen neuer Elemente) */
export function kopie(el: XElement): XElement {
  return { ...el, attr: el.attr.map(([k, v]) => [k, v] as [string, string]), kinder: el.kinder.map((k) => (k.typ === 'text' ? { ...k } : kopie(k))) };
}
