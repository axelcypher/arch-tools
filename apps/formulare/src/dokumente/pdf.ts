/**
 * PDFs anzeigen und Formularfelder ausfüllen – mit pdf.js (Legacy-Build wie im Flächenrechner, weil der
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
