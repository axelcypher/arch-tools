/**
 * Fotos einlesen und dekodieren. Die Ausrichtung aus den EXIF-Daten (Hochformat vom Handy) wird beim
 * Dekodieren angewendet – Breite und Höhe beziehen sich immer auf das aufrecht stehende Bild.
 */

const cache = new Map<string, Promise<ImageBitmap>>();

export function dekodieren(daten: Uint8Array, mime: string): Promise<ImageBitmap> {
  return createImageBitmap(new Blob([daten as BlobPart], { type: mime }), { imageOrientation: 'from-image' });
}

/** dekodiertes Foto (zwischengespeichert, höchstens drei auf einmal) */
export function bitmap(id: string, daten: Uint8Array, mime: string): Promise<ImageBitmap> {
  let p = cache.get(id);
  if (!p) {
    p = dekodieren(daten, mime);
    cache.set(id, p);
    while (cache.size > 3) {
      const [alt, b] = cache.entries().next().value!;
      cache.delete(alt);
      void b.then((x) => x.close()).catch(() => undefined);
    }
  } else {
    // zuletzt benutzt ans Ende
    cache.delete(id);
    cache.set(id, p);
  }
  return p;
}

export interface Eingelesen {
  name: string;
  mime: string;
  breite: number;
  hoehe: number;
  daten: Uint8Array;
}

export async function fotoEinlesen(datei: File): Promise<Eingelesen> {
  const daten = new Uint8Array(await datei.arrayBuffer());
  const mime = datei.type || mimeAusName(datei.name);
  if (/heic|heif/i.test(mime) || /\.(heic|heif)$/i.test(datei.name)) {
    throw new Error(`${datei.name}: HEIC-Fotos kann die Anwendung nicht lesen – am iPhone unter Einstellungen › Kamera › Formate „Maximale Kompatibilität“ wählen oder das Foto als JPEG exportieren.`);
  }
  let bild: ImageBitmap;
  try {
    bild = await dekodieren(daten, mime);
  } catch {
    throw new Error(`${datei.name}: Das Bild konnte nicht gelesen werden (JPEG, PNG oder WebP verwenden).`);
  }
  const ergebnis = { name: datei.name.replace(/\.[^.]+$/, ''), mime, breite: bild.width, hoehe: bild.height, daten };
  bild.close();
  return ergebnis;
}

function mimeAusName(name: string): string {
  const e = name.toLowerCase().split('.').pop();
  return e === 'png' ? 'image/png' : e === 'webp' ? 'image/webp' : 'image/jpeg';
}

export function vorschauUrl(daten: Uint8Array, mime: string): string {
  return URL.createObjectURL(new Blob([daten as BlobPart], { type: mime }));
}
