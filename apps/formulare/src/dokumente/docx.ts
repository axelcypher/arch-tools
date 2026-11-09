/**
 * Word-Dokumente (.docx) anzeigen und Text korrigieren. Gelesen werden Absätze (Ausrichtung, Überschriften,
 * Aufzählungen), Textläufe (fett, kursiv, unterstrichen, Größe, Farbe), Tabellen und Platzhalter für Bilder.
 * Bearbeiten heißt: den Text vorhandener Textstücke (w:t) ändern. Beim Speichern werden nur diese Stellen im
 * Dokument ersetzt – Formatierung, Kopf- und Fußzeilen, Bilder, Felder bleiben unverändert.
 */

import type { XmlElement } from './xml';
import { alleKinder, ersetzen, kind, verschluesseln, wurzelVon, xmlLesen } from './xml';
import { archivLesen, archivSchreiben, beziehungen, teilText, textTeil } from './zip';

export interface Lauf {
  /** Nummer des Textstücks (w:t) im Dokument – zum Bearbeiten; null bei Tab, Umbruch, Bild */
  id: number | null;
  text: string;
  fett: boolean;
  kursiv: boolean;
  unterstrichen: boolean;
  /** Schriftgröße in Punkt */
  groesse: number | null;
  farbe: string | null;
  art: 'text' | 'tab' | 'umbruch' | 'bild';
}

export type Block =
  | { art: 'absatz'; ausrichtung: 'left' | 'center' | 'right' | 'justify'; ebene: number; liste: boolean; laeufe: Lauf[] }
  | { art: 'tabelle'; zeilen: Block[][][] };

export interface WordDokument {
  bloecke: Block[];
  /** Text je Textstück (für Änderungen) */
  texte: string[];
}

interface Textstueck {
  innenStart: number;
  innenEnde: number;
  start: number;
  /** <w:t/> ohne Inhalt */
  leer: boolean;
  preserve: boolean;
}

interface Gelesen {
  dok: WordDokument;
  teil: string;
  quelle: string;
  stuecke: Textstueck[];
}

const an = (el: XmlElement | undefined) => !!el && el.attr['w:val'] !== '0' && el.attr['w:val'] !== 'false' && el.attr['w:val'] !== 'none';

function lesenIntern(bytes: Uint8Array): Gelesen {
  const a = archivLesen(bytes);
  const rels = beziehungen(a, '');
  const teil = [...rels.values()].find((r) => r.typ.endsWith('/officeDocument'))?.ziel ?? 'word/document.xml';
  const quelle = teilText(a, teil);
  if (!quelle) throw new Error('Kein Word-Dokument (document.xml fehlt)');
  const body = kind(wurzelVon(xmlLesen(quelle)), 'w:body');
  const stuecke: Textstueck[] = [];
  const texte: string[] = [];

  const lauf = (r: XmlElement, out: Lauf[]) => {
    const pr = kind(r, 'w:rPr');
    const sz = kind(pr, 'w:sz')?.attr['w:val'];
    const col = kind(pr, 'w:color')?.attr['w:val'];
    const basis = {
      fett: an(kind(pr, 'w:b')),
      kursiv: an(kind(pr, 'w:i')),
      unterstrichen: an(kind(pr, 'w:u')),
      groesse: sz ? Number(sz) / 2 : null,
      farbe: col && /^[0-9a-f]{6}$/i.test(col) ? `#${col}` : null,
    };
    for (const k of r.kinder) {
      if (k.name === 'w:t') {
        const id = stuecke.length;
        stuecke.push({ innenStart: k.innenStart, innenEnde: k.innenEnde, start: k.start, leer: k.innenStart === k.ende, preserve: k.attr['xml:space'] === 'preserve' });
        texte.push(k.text);
        out.push({ ...basis, id, text: k.text, art: 'text' });
      } else if (k.name === 'w:tab') out.push({ ...basis, id: null, text: '\t', art: 'tab' });
      else if (k.name === 'w:br' || k.name === 'w:cr') out.push({ ...basis, id: null, text: '\n', art: 'umbruch' });
      else if (k.name === 'w:drawing' || k.name === 'w:pict') out.push({ ...basis, id: null, text: '', art: 'bild' });
    }
  };

  // Läufe auch in Hyperlinks, Feldern, Änderungsverfolgung (eingefügt) und Inhaltssteuerelementen
  const laeufe = (el: XmlElement, out: Lauf[]) => {
    for (const k of el.kinder) {
      if (k.name === 'w:r') lauf(k, out);
      else if (['w:hyperlink', 'w:ins', 'w:smartTag', 'w:fldSimple', 'w:sdtContent'].includes(k.name)) laeufe(k, out);
      else if (k.name === 'w:sdt') laeufe(kind(k, 'w:sdtContent') ?? k, out);
    }
    return out;
  };

  const absatz = (p: XmlElement): Block => {
    const pr = kind(p, 'w:pPr');
    const jc = kind(pr, 'w:jc')?.attr['w:val'];
    const stil = kind(pr, 'w:pStyle')?.attr['w:val'] ?? '';
    const ueberschrift = /heading|berschrift|title|titel/i.test(stil) ? Number(/(\d)/.exec(stil)?.[1] ?? 1) : 0;
    return {
      art: 'absatz',
      ausrichtung: jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : jc === 'both' ? 'justify' : 'left',
      ebene: ueberschrift,
      liste: !!kind(pr, 'w:numPr'),
      laeufe: laeufe(p, []),
    };
  };

  const bloecke = (el: XmlElement | undefined): Block[] => {
    const out: Block[] = [];
    for (const k of el?.kinder ?? []) {
      if (k.name === 'w:p') out.push(absatz(k));
      else if (k.name === 'w:tbl') out.push({ art: 'tabelle', zeilen: alleKinder(k, 'w:tr').map((tr) => alleKinder(tr, 'w:tc').map((tc) => bloecke(tc))) });
      else if (k.name === 'w:sdt') out.push(...bloecke(kind(k, 'w:sdtContent')));
    }
    return out;
  };

  return { dok: { bloecke: bloecke(body), texte }, teil, quelle, stuecke };
}

export function docxLesen(bytes: Uint8Array): WordDokument {
  return lesenIntern(bytes).dok;
}

/** Neue Fassung mit geänderten Textstücken (Nummer → neuer Text) */
export function docxAendern(bytes: Uint8Array, aenderungen: Map<number, string>): Uint8Array {
  const { teil, quelle, stuecke } = lesenIntern(bytes);
  const ersetzungen: { start: number; ende: number; text: string }[] = [];
  for (const [id, text] of aenderungen) {
    const s = stuecke[id];
    if (!s) throw new Error(`Textstück ${id} gibt es nicht`);
    const braucht = /^\s|\s$/.test(text);
    if (s.leer) {
      // <w:t/> → <w:t>Text</w:t>
      ersetzungen.push({ start: s.start, ende: s.innenEnde, text: `<w:t${braucht ? ' xml:space="preserve"' : ''}>${verschluesseln(text)}</w:t>` });
      continue;
    }
    ersetzungen.push({ start: s.innenStart, ende: s.innenEnde, text: verschluesseln(text) });
    if (braucht && !s.preserve) {
      const kopf = quelle.slice(s.start, s.innenStart);
      ersetzungen.push({ start: s.start, ende: s.innenStart, text: kopf.replace(/^<w:t\b/, '<w:t xml:space="preserve"') });
    }
  }
  const a = archivLesen(bytes);
  a.set(teil, textTeil(ersetzen(quelle, ersetzungen)));
  return archivSchreiben(a);
}
