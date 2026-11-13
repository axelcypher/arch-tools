/**
 * Maßstab im Bild: PNG bekommt einen pHYs-Block (Pixel je Meter), JPEG die Dichte im JFIF-Kopf
 * (Pixel je Zentimeter bzw. Zoll, nur wenn genau darstellbar). Mit „1 Pixel = s Meter“ entspricht die physische Bildgröße der Wirklichkeit (1:1).
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
    if (ende > png.length) throw new Error('PNG ist unvollständig');
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

/**
 * Dichte für den JFIF-Kopf: ganze Pixel je cm (Einheit 2) oder je Zoll (Einheit 1), sofern einer davon die
 * Auflösung auf 0,1 % genau trifft (der genauere von beiden); sonst null – ein gerundeter Wert ergäbe einen falschen Maßstab.
 */
export function jpegDichte(meterJePixel: number): { einheit: 1 | 2; wert: number } | null {
  if (!(meterJePixel > 0)) return null;
  let best: { einheit: 1 | 2; wert: number; fehler: number } | null = null;
  for (const [einheit, laenge] of [
    [2, 0.01],
    [1, 0.0254],
  ] as const) {
    const genau = laenge / meterJePixel;
    const wert = Math.round(genau);
    const fehler = Math.abs(wert - genau) / genau;
    if (wert >= 1 && wert <= 65535 && fehler <= 1e-3 && (!best || fehler < best.fehler)) best = { einheit, wert, fehler };
  }
  return best && { einheit: best.einheit, wert: best.wert };
}

/**
 * Setzt die Dichte im JFIF-Kopf (APP0), wenn sie sich genau darstellen lässt (siehe `jpegDichte`); sonst wird
 * „ohne Einheit, 1:1“ eingetragen. `mitMassstab` sagt, ob der Maßstab im Bild steht.
 */
export function jpegMitMassstab(jpeg: Uint8Array, meterJePixel: number): { daten: Uint8Array; mitMassstab: boolean } {
  const out = jpeg.slice();
  // SOI, dann APP0 mit „JFIF\0“
  if (out[0] !== 0xff || out[1] !== 0xd8 || out[2] !== 0xff || out[3] !== 0xe0) return { daten: out, mitMassstab: false };
  if (String.fromCharCode(...out.subarray(6, 10)) !== 'JFIF') return { daten: out, mitMassstab: false };
  const d = jpegDichte(meterJePixel) ?? { einheit: 0, wert: 1 };
  out[13] = d.einheit;
  out[14] = d.wert >> 8;
  out[15] = d.wert & 0xff;
  out[16] = d.wert >> 8;
  out[17] = d.wert & 0xff;
  return { daten: out, mitMassstab: d.einheit !== 0 };
}
