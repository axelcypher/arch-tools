import type { RasterBackground } from '@core/model';

/**
 * Unterlage des Lageplans (G-22): amtlicher Lageplan als Bild (PNG/JPG) oder PDF-Seite, als Rasterbild im Projekt
 * gespeichert. Die Größe wird zunächst grob auf den sichtbaren Ausschnitt gesetzt; den Maßstab legt die Kalibrierung an
 * einer bekannten Strecke fest (core/kalibrierung.ts). pdf.js wird erst bei Bedarf geladen (wie im Flächenrechner).
 */

/** längste Bildseite einer PDF-Seite in Pixeln (der Lageplan braucht weniger als ein Grundriss) */
const PDF_MAX = 3000;

async function bildGroesse(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error('Das Bild ließ sich nicht lesen.'));
    img.src = dataUrl;
  });
}

function alsDataUrl(datei: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('Die Datei ließ sich nicht lesen.'));
    r.readAsDataURL(datei);
  });
}

async function pdfSeite(daten: ArrayBuffer): Promise<{ dataUrl: string; w: number; h: number }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  const task = pdfjs.getDocument({ data: new Uint8Array(daten) });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: Math.min(300 / 72, PDF_MAX / Math.max(base.width, base.height)) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    await page.render({ canvas, viewport: vp, background: '#ffffff' }).promise;
    const out = { dataUrl: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height };
    canvas.width = 0;
    canvas.height = 0;
    return out;
  } finally {
    void task.destroy();
  }
}

/** Datei als Unterlage einlesen; `ausschnitt` (Weltmaß) bestimmt Lage und vorläufigen Maßstab */
export async function unterlageLesen(datei: File, ausschnitt: { x: number; y: number; w: number; h: number }): Promise<RasterBackground> {
  const pdf = /\.pdf$/i.test(datei.name) || datei.type === 'application/pdf';
  const { dataUrl, w, h } = pdf ? await pdfSeite(await datei.arrayBuffer()) : await alsDataUrl(datei).then(async (d) => ({ dataUrl: d, ...(await bildGroesse(d)) }));
  const metersPerPixel = Math.min(ausschnitt.w / w, ausschnitt.h / h);
  return { type: 'raster', name: datei.name, dataUrl, widthPx: w, heightPx: h, metersPerPixel, x: ausschnitt.x, y: ausschnitt.y, opacity: 0.5, visible: true };
}
