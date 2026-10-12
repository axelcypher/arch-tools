/**
 * Minimaler PDF-Schreiber für eine Seite mit einem JPEG-Bild, Linien und Text (Helvetica, WinAnsi).
 * Koordinaten in Millimetern, Ursprung oben links.
 */

export interface PdfLinie {
  punkte: { x: number; y: number }[];
  zu?: boolean;
  /** Strichstärke in mm */
  staerke: number;
  /** RGB 0…1 */
  farbe: [number, number, number];
  /** Füllung (nur bei geschlossenen Linien) */
  fuellung?: [number, number, number];
}

export interface PdfText {
  x: number;
  y: number;
  text: string;
  /** Schriftgröße in pt */
  groesse: number;
  /** Drehung in Grad gegen den Uhrzeigersinn */
  winkel?: number;
  /** horizontale Ausrichtung am Punkt */
  ausrichtung?: 'links' | 'mitte' | 'rechts';
  fett?: boolean;
  farbe?: [number, number, number];
}

export interface PdfInhalt {
  breite: number;
  hoehe: number;
  bild?: { jpeg: Uint8Array; px: number; py: number; x: number; y: number; breite: number; hoehe: number };
  linien: PdfLinie[];
  texte: PdfText[];
  titel?: string;
}

const PT = 72 / 25.4;

/** Zeichen in WinAnsi (cp1252); Unbekanntes wird zu „?“ */
export function winAnsi(s: string): number[] {
  const sonder: Record<string, number> = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '–': 0x96, '—': 0x97, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95 };
  return [...s].map((c) => {
    const k = c.charCodeAt(0);
    if (sonder[c] !== undefined) return sonder[c];
    return k < 256 && !(k >= 0x80 && k < 0xa0) ? k : 0x3f;
  });
}

/** Breite eines Textes in mm (Näherung für Helvetica) */
export function textBreite(text: string, groesse: number, fett = false): number {
  let em = 0;
  for (const c of text) em += /[il.,:;|'!·]/.test(c) ? 0.28 : /[mwMW]/.test(c) ? 0.85 : /[A-ZÄÖÜ0-9]/.test(c) ? 0.64 : c === ' ' ? 0.28 : 0.53;
  return (em * groesse * (fett ? 1.06 : 1)) / PT;
}

const zahl = (v: number) => (Math.abs(v) < 1e-9 ? '0' : v.toFixed(3).replace(/\.?0+$/, ''));

function textBytes(s: string): string {
  return winAnsi(s)
    .map((b) => (b === 0x28 || b === 0x29 || b === 0x5c ? `\\${String.fromCharCode(b)}` : b < 0x20 || b > 0x7e ? `\\${b.toString(8).padStart(3, '0')}` : String.fromCharCode(b)))
    .join('');
}

export function pdfErzeugen(inhalt: PdfInhalt): Uint8Array {
  const H = inhalt.hoehe;
  const x = (mm: number) => zahl(mm * PT);
  const y = (mm: number) => zahl((H - mm) * PT);
  const ops: string[] = [];
  if (inhalt.bild) {
    const b = inhalt.bild;
    ops.push(`q ${zahl(b.breite * PT)} 0 0 ${zahl(b.hoehe * PT)} ${x(b.x)} ${y(b.y + b.hoehe)} cm /Im1 Do Q`);
  }
  for (const l of inhalt.linien) {
    if (l.punkte.length < 2) continue;
    ops.push(`${zahl(l.staerke * PT)} w 1 J 1 j ${l.farbe.map(zahl).join(' ')} RG`);
    if (l.fuellung) ops.push(`${l.fuellung.map(zahl).join(' ')} rg`);
    ops.push(l.punkte.map((p, i) => `${x(p.x)} ${y(p.y)} ${i ? 'l' : 'm'}`).join(' ') + (l.zu ? (l.fuellung ? ' b' : ' s') : ' S'));
  }
  for (const t of inhalt.texte) {
    const w = ((t.winkel ?? 0) * Math.PI) / 180;
    const breite = textBreite(t.text, t.groesse, t.fett);
    const versatz = t.ausrichtung === 'mitte' ? breite / 2 : t.ausrichtung === 'rechts' ? breite : 0;
    // Ausrichtung entlang der gedrehten Grundlinie (y nach oben in PDF)
    const px = t.x - versatz * Math.cos(w);
    const py = t.y + versatz * Math.sin(w);
    const c = Math.cos(w);
    const s = Math.sin(w);
    ops.push(`BT /${t.fett ? 'F2' : 'F1'} ${zahl(t.groesse)} Tf ${(t.farbe ?? [0, 0, 0]).map(zahl).join(' ')} rg ${zahl(c)} ${zahl(s)} ${zahl(-s)} ${zahl(c)} ${x(px)} ${y(py)} Tm (${textBytes(t.text)}) Tj ET`);
  }
  const stream = ops.join('\n');

  const teile: (string | Uint8Array)[] = [];
  const offsets: number[] = [];
  let laenge = 0;
  const raus = (t: string | Uint8Array) => {
    teile.push(t);
    laenge += typeof t === 'string' ? latin1(t).length : t.length;
  };
  const objekt = (nr: number, ...inhaltTeile: (string | Uint8Array)[]) => {
    offsets[nr] = laenge;
    raus(`${nr} 0 obj\n`);
    for (const t of inhaltTeile) raus(t);
    raus('\nendobj\n');
  };

  raus('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  const breitePt = zahl(inhalt.breite * PT);
  const hoehePt = zahl(H * PT);
  objekt(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objekt(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  const xobj = inhalt.bild ? '/XObject << /Im1 6 0 R >> ' : '';
  objekt(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${breitePt} ${hoehePt}] /Resources << /Font << /F1 5 0 R /F2 7 0 R >> ${xobj}>> /Contents 4 0 R >>`);
  const streamBytes = latin1(stream);
  objekt(4, `<< /Length ${streamBytes.length} >>\nstream\n`, streamBytes, '\nendstream');
  objekt(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  if (inhalt.bild) {
    const b = inhalt.bild;
    objekt(6, `<< /Type /XObject /Subtype /Image /Width ${b.px} /Height ${b.py} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${b.jpeg.length} >>\nstream\n`, b.jpeg, '\nendstream');
  } else {
    objekt(6, '<< >>');
  }
  objekt(7, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const info = inhalt.titel ? `(${textBytes(inhalt.titel)})` : '()';
  objekt(8, `<< /Title ${info} /Producer (arch-tools Entzerrung) >>`);
  const xref = laenge;
  let x_ = 'xref\n0 9\n0000000000 65535 f \n';
  for (let i = 1; i <= 8; i++) x_ += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  raus(x_);
  raus(`trailer\n<< /Size 9 /Root 1 0 R /Info 8 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(laenge);
  let o = 0;
  for (const t of teile) {
    const b = typeof t === 'string' ? latin1(t) : t;
    out.set(b, o);
    o += b.length;
  }
  return out;
}

function latin1(s: string): Uint8Array {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
}
