/**
 * Darstellung einer Formularseite wie auf Papier: Farben, Maße, Drehung und eingebettete Bilder aus den
 * Delphi-Eigenschaften. Nur Lesen – nichts hiervon wird je geschrieben.
 */

import type { Objekt } from './dfm';
import { eigenschaft, zahl } from './dfm';
import type { Kasten } from './felder';

/** Papierbreite der FORMA-Seiten (alle bekannten Formulare sind 700 Pixel breit) */
export const PAPIERBREITE = 700;

/**
 * Farben auf Papier. Systemfarben werden so gewählt, wie sie gedruckt erscheinen: Fensterhintergründe weiß,
 * Fenstertext schwarz.
 */
const FARBEN: Record<string, string> = {
  clBlack: '#000000',
  clMaroon: '#800000',
  clGreen: '#008000',
  clOlive: '#808000',
  clNavy: '#000080',
  clPurple: '#800080',
  clTeal: '#008080',
  clGray: '#808080',
  clSilver: '#c0c0c0',
  clRed: '#ff0000',
  clLime: '#00ff00',
  clYellow: '#ffff00',
  clBlue: '#0000ff',
  clFuchsia: '#ff00ff',
  clAqua: '#00ffff',
  clWhite: '#ffffff',
  clMoneyGreen: '#c0dcc0',
  clSkyBlue: '#a6caf0',
  clCream: '#fffbf0',
  clMedGray: '#a0a0a4',
  clGold: '#ffd700',
  clWindowText: '#000000',
  clBtnText: '#000000',
  clCaptionText: '#000000',
  clGrayText: '#808080',
  clWindow: '#ffffff',
  clBtnFace: '#ffffff',
  clBtnShadow: '#808080',
  clBtnHighlight: '#ffffff',
  cl3DDkShadow: '#404040',
  cl3DLight: '#e3e3e3',
  clInfoBk: '#ffffe1',
  clInfoText: '#000000',
  clHighlight: '#0078d7',
  clHighlightText: '#ffffff',
};

/** Delphi-Farbe (Name oder Zahl $00BBGGRR) als CSS-Farbe; `undefined` bei Unbekanntem */
export function delphiFarbe(wert: string | undefined): string | undefined {
  if (!wert) return undefined;
  if (wert in FARBEN) return FARBEN[wert];
  const n = /^-?\d+$/.test(wert) ? Number(wert) : /^\$[0-9a-f]+$/i.test(wert) ? parseInt(wert.slice(1), 16) : NaN;
  if (!Number.isInteger(n) || n < 0 || n > 0xffffff) return undefined;
  const r = n & 0xff;
  const g = (n >> 8) & 0xff;
  const b = (n >> 16) & 0xff;
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/** Farbe einer Eigenschaft (`Color`, `Font.Color`) – als Name oder Zahl gespeichert */
export function farbe(o: Objekt, name: string): string | undefined {
  const w = eigenschaft(o, name)?.wert;
  if (!w) return undefined;
  if (w.art === 'name') return delphiFarbe(w.name);
  if (w.art === 'zahl') return delphiFarbe(w.roh);
  return undefined;
}

/**
 * Papiermaße einer Seite. Die Breite ist die der FORMA-Seite; Beschriftungen mit fester Größe können rechts
 * darüber hinausragen, ohne sichtbaren Text – sie zählen nicht mit. Die Höhe reicht bis zum untersten Element.
 */
export function seitenMasse(kaesten: Kasten[]): { breite: number; hoehe: number } {
  const oben = kaesten.filter((k) => k.eltern === null && k.o.klasse !== 'TLabel' && k.o.klasse !== 'TExtendedLabel');
  const breite = Math.max(PAPIERBREITE, ...oben.map((k) => k.x + k.b));
  const hoehe = Math.max(100, ...kaesten.map((k) => k.y + lage(k).h));
  return { breite, hoehe };
}

/** Drehwinkel einer Beschriftung (TExtendedLabel: `Angle`), auf 0/90/180/270 gerundet */
export function drehung(o: Objekt): 0 | 90 | 180 | 270 {
  const w = (((zahl(o, 'Angle') ?? 0) % 360) + 360) % 360;
  return ([0, 90, 180, 270] as const).reduce((best, x) => (Math.abs(x - w) < Math.abs(best - w) ? x : best), 0);
}

/**
 * Sichtbare Lage eines Elements: Bei 90° oder 270° gedrehten Beschriftungen beschreiben Width/Height den
 * ungedrehten Text – auf dem Papier sind Breite und Höhe vertauscht.
 */
export function lage(k: Kasten): { x: number; y: number; b: number; h: number } {
  const d = k.o.klasse === 'TExtendedLabel' ? drehung(k.o) : 0;
  return d === 90 || d === 270 ? { x: k.x, y: k.y, b: k.h, h: k.b } : { x: k.x, y: k.y, b: k.b, h: k.h };
}

function hexBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

/**
 * Eingebettetes Bild einer TImage (`Picture.Data`): Delphi speichert den Klassennamen (Länge + Name) und
 * danach die Bilddaten – bei TBitmap mit vorangestellter Länge, als Windows-BMP. Andere Formate (JPEG, PNG)
 * folgen direkt dem Namen.
 */
export function bild(o: Objekt): { daten: Uint8Array; typ: string } | null {
  const w = eigenschaft(o, 'Picture.Data')?.wert;
  if (w?.art !== 'binaer' || w.hex.length < 4) return null;
  const b = hexBytes(w.hex);
  const n = b[0];
  const klasse = String.fromCharCode(...b.subarray(1, 1 + n));
  const rest = b.subarray(1 + n);
  if (klasse === 'TBitmap') {
    if (rest.length < 4) return null;
    const laenge = rest[0] | (rest[1] << 8) | (rest[2] << 16) | (rest[3] << 24);
    const bmp = rest.subarray(4, 4 + laenge);
    return bmp[0] === 0x42 && bmp[1] === 0x4d ? { daten: bmp, typ: 'image/bmp' } : null;
  }
  if (klasse === 'TJPEGImage') return { daten: rest, typ: 'image/jpeg' };
  if (klasse === 'TPngImage' || klasse === 'TPNGObject') return { daten: rest, typ: 'image/png' };
  return null;
}
