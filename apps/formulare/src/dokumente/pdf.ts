/**
 * PDFs anzeigen und Formularfelder ausfüllen – mit pdf.js (Legacy-Build wie in QUADRIO, weil der
 * Standard-Build sehr neue JS-Funktionen voraussetzt). Ausgefüllte Werte speichert pdf.js als Nachtrag ans Ende
 * der Datei (inkrementelles Speichern): der ursprüngliche Inhalt bleibt Byte für Byte erhalten.
 */

import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

let geladen: Promise<PdfJs> | null = null;

/** pdf.js erst bei Bedarf laden (im Browser mit Worker; in Tests ohne) */
export function pdfjs(): Promise<PdfJs> {
  geladen ??= (async () => {
    const lib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
      lib.GlobalWorkerOptions.workerSrc = workerUrl;
    }
    return lib;
  })();
  return geladen;
}

export async function pdfOeffnen(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const lib = await pdfjs();
  // pdf.js übernimmt den Puffer – Kopie, damit die Bytes des Aufrufers erhalten bleiben
  return lib.getDocument({ data: bytes.slice(), enableXfa: false }).promise;
}

/** Dokument schließen und den Worker freigeben */
export const pdfSchliessen = (doc: PDFDocumentProxy) => doc.loadingTask.destroy();

export interface PdfFeld {
  /** Kennung des Widgets (für annotationStorage) */
  id: string;
  name: string;
  art: 'text' | 'kreuz' | 'auswahl' | 'sonst';
  wert: string | boolean;
  seite: number;
}

/** Formularfelder der PDF (leer, wenn es keine gibt) */
export async function pdfFelder(doc: PDFDocumentProxy): Promise<PdfFeld[]> {
  const out: PdfFeld[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const seite = await doc.getPage(n);
    for (const a of (await seite.getAnnotations()) as { id: string; subtype: string; fieldType?: string; fieldName?: string; fieldValue?: unknown; checkBox?: boolean; exportValue?: string }[]) {
      if (a.subtype !== 'Widget' || !a.fieldName) continue;
      const art = a.fieldType === 'Tx' ? 'text' : a.fieldType === 'Btn' && a.checkBox ? 'kreuz' : a.fieldType === 'Ch' ? 'auswahl' : 'sonst';
      const wert = art === 'kreuz' ? a.fieldValue !== undefined && a.fieldValue !== 'Off' && a.fieldValue === (a.exportValue ?? a.fieldValue) : String(a.fieldValue ?? '');
      out.push({ id: a.id, name: a.fieldName, art, wert, seite: n });
    }
  }
  return out;
}

/** Werte setzen (wie bei Eingabe im Formular) und die PDF mit Nachtrag speichern */
export async function pdfAusfuellen(bytes: Uint8Array, werte: Map<string, string | boolean>): Promise<Uint8Array> {
  const doc = await pdfOeffnen(bytes);
  try {
    for (const [id, wert] of werte) doc.annotationStorage.setValue(id, { value: wert });
    return await doc.saveDocument();
  } finally {
    await pdfSchliessen(doc);
  }
}

/* ---------- Text und Kreuze eintragen (auch in PDFs ohne Formularfelder) ---------- */

/** Eingetragener Text: Seite (ab 1), Rechteck in PDF-Koordinaten [x1, y1, x2, y2], Schriftgröße in pt */
export interface PdfText {
  seite: number;
  rect: [number, number, number, number];
  text: string;
  groesse: number;
  /** Drehung der Seite, damit der Text aufrecht steht */
  drehung?: number;
}

/** Kennung im annotationStorage von pdf.js: Einträge mit diesem Anfang speichert pdf.js als neue Anmerkungen */
const EDITOR = 'pdfjs_internal_editor_formulare_';
/** pdf.js: AnnotationEditorType.FREETEXT */
const FREITEXT = 3;

/** Größe eines Textfelds für den Text (Helvetica, grob geschätzt) in pt */
export function textGroesse(text: string, groesse: number): { breite: number; hoehe: number } {
  const zeilen = text.split('\n');
  const breite = Math.max(...zeilen.map((z) => z.length)) * groesse * 0.56 + groesse * 0.4;
  return { breite, hoehe: zeilen.length * groesse * 1.2 + groesse * 0.3 };
}

/**
 * Text als Freitext-Anmerkung vormerken – pdf.js schreibt sie beim Speichern als Nachtrag (mit Erscheinungsbild,
 * druckbar), der ursprüngliche Inhalt der PDF bleibt unverändert.
 */
export function textVormerken(doc: PDFDocumentProxy, id: string, t: PdfText) {
  doc.annotationStorage.setValue(`${EDITOR}${id}`, {
    annotationType: FREITEXT,
    color: [0, 0, 0],
    fontSize: t.groesse,
    value: t.text,
    pageIndex: t.seite - 1,
    rect: t.rect,
    rotation: t.drehung ?? 0,
    id: null,
  });
}

/** Vorgemerkten Text wieder entfernen */
export function textEntfernen(doc: PDFDocumentProxy, id: string) {
  doc.annotationStorage.remove(`${EDITOR}${id}`);
}

/** Text in eine PDF eintragen und mit Nachtrag speichern */
export async function pdfMitText(bytes: Uint8Array, texte: PdfText[]): Promise<Uint8Array> {
  const doc = await pdfOeffnen(bytes);
  try {
    texte.forEach((t, i) => textVormerken(doc, String(i), t));
    return await doc.saveDocument();
  } finally {
    await pdfSchliessen(doc);
  }
}
