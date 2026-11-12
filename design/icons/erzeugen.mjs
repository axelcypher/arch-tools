// Erzeugt das arch-tools-Iconset (Entwurf) – eine Quelle für Farben, Raster und Symbole aller Apps.
// Aufruf: node design/icons/erzeugen.mjs   → schreibt <app>.svg neben dieses Skript
//
// Regeln (siehe README.md):
//  - Raster 64 × 64, Kachel vollflächig mit Radius 14
//  - Linien 4 breit (= 1 px bei 16 px), auf Koordinaten ≡ 2 (mod 4) – scharf bei 16, 32 und 48 px
//  - Symbol in Weiß, Freiraum ringsum mind. 10
//  - genau ein Element in Bernstein: das, was die App ermittelt bzw. hervorbringt
//  - Bernstein steht nur auf der Kachelfarbe, nie auf Weiß (zu wenig Kontrast); wo es Weiß überlappt,
//    trennt eine Fuge in Kachelfarbe
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** OKLCH → sRGB-Hex (gleiche Helligkeit L für alle App-Kacheln, nur der Farbton wechselt) */
function oklch(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const enc = (x) => {
    x = Math.min(1, Math.max(0, x));
    x = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
    return Math.round(x * 255).toString(16).padStart(2, '0');
  };
  return '#' + rgb.map(enc).join('');
}

const W = '#ffffff';
/** Bernstein – Akzent der ganzen Suite */
export const BERNSTEIN = oklch(0.83, 0.15, 78);

/** Kachelfarben: L 0,47 für alle Apps (Weiß ≥ 6,4 : 1, Bernstein ≥ 3,7 : 1), der Rahmen dunkler und fast unbunt */
export const FARBEN = {
  suite: oklch(0.3, 0.04, 265),
  ordner: oklch(0.47, 0.085, 190),
  formulare: oklch(0.47, 0.12, 48),
  flaechenrechner: oklch(0.47, 0.15, 262),
  grz: oklch(0.47, 0.11, 148),
  kosten: oklch(0.47, 0.14, 18),
  entzerrung: oklch(0.47, 0.13, 296),
  ava: oklch(0.47, 0.13, 335),
};

const A = BERNSTEIN;
const rund = 'fill="none" stroke-linecap="round" stroke-linejoin="round"';
/** Bernstein-Fläche mit Fuge in Kachelfarbe */
const fuge = (T, w = 2.5) => `stroke="${T}" stroke-width="${w}" stroke-linejoin="round" paint-order="stroke"`;

const SYMBOL = {
  // Rundbogen mit Kämpfern; der Schlussstein hält alles zusammen – wie der Rahmen die Apps
  suite: (T) => `
  <path d="M15 34h8v18h-8zM41 34h8v18h-8zM12 30h14v4H12zM38 30h14v4H38z" fill="${W}"/>
  <path d="M14 30a18 18 0 0 1 36 0H40a8 8 0 0 0-16 0z" fill="${W}"/>
  <path d="M26.5 10h11l-2.4 12h-6.2z" fill="${A}" ${fuge(T)}/>`,

  // Projektordner: Reiter = das Projekt, eingerückte Zeilen = Ordnerstruktur
  ordner: (T) => `
  <path d="M12 18a4 4 0 0 1 4-4h8.3a4 4 0 0 1 2.8 1.2L31 19h17a4 4 0 0 1 4 4v1H12z" fill="${A}"/>
  <path d="M12 26h40v20a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4z" fill="${W}"/>
  <path d="M19 33h14M25 39h16M25 45h10" ${rund} stroke="${T}" stroke-width="3.5"/>`,

  // Antragsformular mit Eselsohr, Stift trägt aus
  formulare: (T) => `
  <path d="M16 10h18l12 12v28a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4z" fill="${W}"/>
  <path d="M34 10v8a4 4 0 0 0 4 4h8" fill="none" stroke="${T}" stroke-width="2.5" stroke-linejoin="round" opacity=".35"/>
  <path d="M19 26h12M19 34h18M19 42h10" ${rund} stroke="${T}" stroke-width="3.5"/>
  <path d="M53.5 27.5l-17 17-2.5 8 8-2.5 17-17z" fill="${A}" ${fuge(T, 3.5)}/>
  <path d="M34 52.5l1.2-4 2.8 2.8z" fill="${T}"/>`,

  // Grundriss, der berechnete Raum in Bernstein
  flaechenrechner: (T) => `
  <rect x="34" y="16" width="14" height="16" fill="${A}"/>
  <path d="M14 14h36v36H14zM32 14v12M32 34v16M32 34h18" fill="none" stroke="${W}" stroke-width="4" stroke-linecap="square"/>`,

  // Grundstücksgrenze gestrichelt, überbaute Fläche in Bernstein
  grz: (T) => `
  <rect x="14" y="14" width="36" height="36" fill="${W}" opacity=".16"/>
  <path d="M14 14h36v36H14z" fill="none" stroke="${W}" stroke-width="4" stroke-dasharray="8 4" stroke-dashoffset="4"/>
  <path d="M22 22h16v10h-6v10H22z" fill="${A}"/>`,

  // Baukosten: Euro unter dem Dach
  kosten: (T) => `
  <path d="M10 28L32 10l22 18" ${rund} stroke="${W}" stroke-width="4"/>
  <path d="M42 30.5a12 12 0 1 0 0 17M21 36.5h15M21 42h15" ${rund} stroke="${A}" stroke-width="5"/>`,

  // Fassade in Perspektive, die vier Passpunkte in Bernstein
  entzerrung: (T) => `
  <path d="M16 14l32 6v24l-32 6z" fill="${W}" opacity=".16"/>
  <path d="M32 17v30M16 32h32" stroke="${W}" stroke-width="2" opacity=".55"/>
  <path d="M16 14l32 6v24l-32 6z" ${rund} stroke="${W}" stroke-width="4"/>
  <g fill="${A}" ${fuge(T)}>
    <rect x="11" y="9" width="10" height="10" rx="2"/><rect x="43" y="15" width="10" height="10" rx="2"/>
    <rect x="43" y="39" width="10" height="10" rx="2"/><rect x="11" y="45" width="10" height="10" rx="2"/>
  </g>`,

  // Klemmbrett der Bauleitung: LV, Aufmaß, Bautagebuch, Mängel
  ava: (T) => `
  <rect x="14" y="14" width="36" height="40" rx="4" fill="none" stroke="${W}" stroke-width="4"/>
  <rect x="23" y="9" width="18" height="10" rx="3" fill="${A}" ${fuge(T, 3)}/>
  <path d="M22 30h4M30 30h12M22 38h4M30 38h12M22 46h4M30 46h8" ${rund} stroke="${W}" stroke-width="4"/>`,
};

export const svg = (id) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${FARBEN[id]}"/>${SYMBOL[id](FARBEN[id])}
</svg>
`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const hier = dirname(fileURLToPath(import.meta.url));
  for (const id of Object.keys(FARBEN)) writeFileSync(join(hier, `${id}.svg`), svg(id));
  console.log(`${Object.keys(FARBEN).length} Icons → ${hier}`);
  console.log({ ...FARBEN, bernstein: BERNSTEIN });
}
