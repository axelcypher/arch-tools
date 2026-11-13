import type { RasterBackground } from '@core/model';

/**
 * Unterlage des Lageplans (G-22): amtlicher Lageplan als Bild (PNG/JPG) oder PDF-Seite, als Rasterbild im Projekt
 * gespeichert. Die Größe wird zunächst grob auf den sichtbaren Ausschnitt gesetzt; den Maßstab legt die Kalibrierung an
 * einer bekannten Strecke fest (core/kalibrierung.ts). pdf.js wird erst bei Bedarf geladen (wie in QUADRIO).
 */

/** längste Bildseite einer PDF-Seite in Pixeln (der Lageplan braucht weniger als ein Grundriss) */
const PDF_MAX = 3000;
/** größere Bilder werden verkleinert: die Unterlage liegt als Bild in der Projektdatei und in jedem Zwischenstand */
export const BILD_MAX = 4000;
/** größere Dateien werden gar nicht erst gelesen */
export const DATEI_MAX_MB = 40;

/** Unterlage zu groß – die Meldung ist für die Oberfläche formuliert */
export class UnterlageZuGross extends Error {}

/** Zielgröße eines Bilds mit höchstens `max` Pixeln an der längsten Seite (Seitenverhältnis bleibt) */
export function zielGroesse(w: number, h: number, max = BILD_MAX): { w: number; h: number; verkleinert: boolean } {
  const s = Math.max(w, h);
  if (s <= max) return { w, h, verkleinert: false };
  const k = max / s;
  return { w: Math.round(w * k), h: Math.round(h * k), verkleinert: true };
}

/** Bild auf die Zielgröße verkleinern (Fotos als JPEG, sonst PNG) */
async function verkleinern(dataUrl: string, w: number, h: number): Promise<{ dataUrl: string; w: number; h: number }> {
  const z = zielGroesse(w, h);
  if (!z.verkleinert) return { dataUrl, w, h };
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Das Bild ließ sich nicht lesen.'));
    img.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = z.w;
  canvas.height = z.h;
  canvas.getContext('2d')!.drawImage(img, 0, 0, z.w, z.h);
  const out = canvas.toDataURL(dataUrl.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png', 0.9);
  canvas.width = 0;
  canvas.height = 0;
  return { dataUrl: out, w: z.w, h: z.h };
}

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
  if (datei.size > DATEI_MAX_MB * 1024 * 1024)
    throw new UnterlageZuGross(
      `Die Datei „${datei.name}“ ist ${Math.round(datei.size / 1024 / 1024)} MB groß; höchstens ${DATEI_MAX_MB} MB sind möglich. Bitte als PDF mit einer Seite oder als kleineres Bild (PNG, JPG) speichern.`,
    );
  const pdf = /\.pdf$/i.test(datei.name) || datei.type === 'application/pdf';
  const { dataUrl, w, h } = pdf
    ? await pdfSeite(await datei.arrayBuffer())
    : await alsDataUrl(datei).then(async (d) => {
        const g = await bildGroesse(d);
        // gelingt das Verkleinern nicht (Speicher), das Bild unverändert übernehmen
        return verkleinern(d, g.w, g.h).catch(() => ({ dataUrl: d, ...g }));
      });
  const metersPerPixel = Math.min(ausschnitt.w / w, ausschnitt.h / h);
  return { type: 'raster', name: datei.name, dataUrl, widthPx: w, heightPx: h, metersPerPixel, x: ausschnitt.x, y: ausschnitt.y, opacity: 0.5, visible: true };
}
