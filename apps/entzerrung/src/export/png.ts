/**
 * Maßstab im Bild: PNG bekommt einen pHYs-Block (Pixel je Meter), JPEG die Dichte im JFIF-Kopf
 * (Pixel je Zentimeter). Mit „1 Pixel = s Meter“ entspricht die physische Bildgröße der Wirklichkeit (1:1).
 */

let tabelle: Uint32Array | null = null;

export function crc32(daten: Uint8Array): number {
  if (!tabelle) {
    tabelle = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tabelle[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < daten.length; i++) c = tabelle[(c ^ daten[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Fügt nach dem IHDR-Block einen pHYs-Block ein (vorhandene pHYs-Blöcke werden ersetzt). */
export function pngMitMassstab(png: Uint8Array, meterJePixel: number): Uint8Array {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!sig.every((b, i) => png[i] === b)) throw new Error('Kein PNG');
  const ppm = Math.max(1, Math.round(1 / meterJePixel));
  const block = new Uint8Array(4 + 4 + 9 + 4);
  const dv = new DataView(block.buffer);
  dv.setUint32(0, 9);
  block.set([0x70, 0x48, 0x59, 0x73], 4); // pHYs
  dv.setUint32(8, ppm);
  dv.setUint32(12, ppm);
  block[16] = 1; // Einheit: Meter
  dv.setUint32(17, crc32(block.subarray(4, 17)));

  const teile: Uint8Array[] = [png.subarray(0, 8)];
  let o = 8;
  const pv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  while (o < png.length) {
    const len = pv.getUint32(o);
    const typ = String.fromCharCode(...png.subarray(o + 4, o + 8));
    const ende = o + 12 + len;
    if (typ !== 'pHYs') teile.push(png.subarray(o, ende));
    if (typ === 'IHDR') teile.push(block);
    o = ende;
  }
  const out = new Uint8Array(teile.reduce((s, t) => s + t.length, 0));
  let p = 0;
  for (const t of teile) {
    out.set(t, p);
    p += t.length;
  }
  return out;
}

/** Setzt die Dichte im JFIF-Kopf (APP0) auf Pixel je Zentimeter, falls vorhanden. */
export function jpegMitMassstab(jpeg: Uint8Array, meterJePixel: number): Uint8Array {
  const out = jpeg.slice();
  // SOI, dann APP0 mit „JFIF\0“
  if (out[0] !== 0xff || out[1] !== 0xd8 || out[2] !== 0xff || out[3] !== 0xe0) return out;
  if (String.fromCharCode(...out.subarray(6, 10)) !== 'JFIF') return out;
  const ppcm = Math.max(1, Math.min(65535, Math.round(0.01 / meterJePixel)));
  out[13] = 2; // Einheit: Pixel je cm
  out[14] = ppcm >> 8;
  out[15] = ppcm & 0xff;
  out[16] = ppcm >> 8;
  out[17] = ppcm & 0xff;
  return out;
}
