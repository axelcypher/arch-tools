import { fmt2 } from '@core/format';
import { bitmap } from '../bilder';
import { zuEbene } from '../geo/ebene';
import type { Entzerrung } from '../geo/ebene';
import { mul } from '../geo/mat';
import type { Pt } from '../geo/mat';
import { ausgabe, flaecheVon } from '../geo/messen';
import type { Ausgabe } from '../geo/messen';
import type { Bereich, Ebene, Foto } from '../model';
import { Renderer } from '../render/gl';
import { pdfErzeugen, textBreite } from './pdf';
import type { PdfLinie, PdfText } from './pdf';
import { jpegMitMassstab, pngMitMassstab } from './png';

export type Format = 'png' | 'jpeg' | 'pdf';
export type Papier = 'passend' | 'A4' | 'A3' | 'A2' | 'A1' | 'A0';

export const PAPIER: Record<Exclude<Papier, 'passend'>, [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  A2: [420, 594],
  A1: [594, 841],
  A0: [841, 1189],
};

export interface Optionen {
  format: Format;
  /** m je Pixel */
  aufloesung: number;
  bereich: Bereich;
  mitMessungen: boolean;
  /** Maßstabszahl (1:N), nur PDF */
  massstab: number;
  papier: Papier;
}

export function dateiName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'Entzerrung';
}

/** Auflösung als Text für Dateinamen: 0,0025 → „2,5mm-px“ */
export function aufloesungText(m: number): string {
  return `${String(+(m * 1000).toFixed(3)).replace('.', ',')}mm-px`;
}

/** Entzerrtes Bild des Bereichs in der gewählten Auflösung */
export async function entzerrtesBild(foto: Foto, daten: Uint8Array, e: Entzerrung, a: Ausgabe, weiss: boolean): Promise<HTMLCanvasElement> {
  const glCanvas = document.createElement('canvas');
  glCanvas.width = 1;
  glCanvas.height = 1;
  const r = new Renderer(glCanvas);
  try {
    await r.setzeFoto(await bitmap(foto.id, daten, foto.mime), foto.breite, foto.hoehe);
    const { x0, y1 } = a.bereich;
    const s = a.aufloesung;
    // Ausgabepixel (Mitte bei +0,5) → Ebene (y nach oben) → idealer Fotopunkt
    const m = mul(e.hInv, [s, 0, x0, 0, -s, y1, 0, 0, 1]);
    const bild = r.rendereBild(m, e.kamera, a.breite, a.hoehe, weiss ? [1, 1, 1, 1] : [0, 0, 0, 0]);
    const c = document.createElement('canvas');
    c.width = a.breite;
    c.height = a.hoehe;
    c.getContext('2d')!.putImageData(bild, 0, 0);
    return c;
  } finally {
    r.freigeben(true);
  }
}

interface Linienzug {
  punkte: Pt[];
  zu: boolean;
  /** Teillängen und Beschriftung */
  texte: { a: Pt; b: Pt; text: string }[];
  flaeche?: { mitte: Pt; text: string };
}

/** Messungen in Ebenenkoordinaten mit Beschriftungen */
function messLinien(e: Entzerrung, ebene: Ebene): Linienzug[] {
  return ebene.messungen.map((m) => {
    const p = m.punkte.map((q) => zuEbene(e, q));
    const zu = m.art === 'flaeche' && p.length > 2;
    const texte: Linienzug['texte'] = [];
    const n = zu ? p.length : p.length - 1;
    for (let i = 0; i < n; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      texte.push({ a, b, text: fmt2(Math.hypot(b.x - a.x, b.y - a.y)) });
    }
    const flaeche = zu
      ? { mitte: { x: p.reduce((s, q) => s + q.x, 0) / p.length, y: p.reduce((s, q) => s + q.y, 0) / p.length }, text: `${m.name}: ${fmt2(flaecheVon(p))} m²` }
      : undefined;
    return { punkte: p, zu, texte, flaeche };
  });
}

/** zeichnet die Messungen ins Rasterbild */
function messungenZeichnen(c: HTMLCanvasElement, e: Entzerrung, ebene: Ebene, a: Ausgabe) {
  const ctx = c.getContext('2d')!;
  const px = (q: Pt) => ({ x: (q.x - a.bereich.x0) / a.aufloesung, y: (a.bereich.y1 - q.y) / a.aufloesung });
  const strich = Math.max(2, Math.round(Math.min(a.breite, a.hoehe) / 700));
  const schrift = Math.max(14, strich * 7);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const l of messLinien(e, ebene)) {
    const p = l.punkte.map(px);
    ctx.beginPath();
    p.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    if (l.zu) ctx.closePath();
    ctx.strokeStyle = '#e8590c';
    ctx.lineWidth = strich;
    ctx.stroke();
    if (l.zu) {
      ctx.fillStyle = 'rgba(232, 89, 12, 0.12)';
      ctx.fill();
    }
    ctx.font = `${schrift}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (const t of l.texte) {
      const s = px(t.a);
      const z = px(t.b);
      if (Math.hypot(z.x - s.x, z.y - s.y) < schrift * 2.5) continue;
      let w = Math.atan2(z.y - s.y, z.x - s.x);
      if (w > Math.PI / 2) w -= Math.PI;
      if (w < -Math.PI / 2) w += Math.PI;
      ctx.save();
      ctx.translate((s.x + z.x) / 2, (s.y + z.y) / 2);
      ctx.rotate(w);
      haloText(ctx, t.text, 0, -strich * 1.5, strich);
      ctx.restore();
    }
    if (l.flaeche) {
      const m = px(l.flaeche.mitte);
      ctx.font = `600 ${schrift * 1.1}px "Segoe UI", sans-serif`;
      ctx.textBaseline = 'middle';
      haloText(ctx, l.flaeche.text, m.x, m.y, strich);
    }
  }
}

function haloText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, strich: number) {
  ctx.lineWidth = strich * 2.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = '#b8400a';
  ctx.fillText(text, x, y);
}

function blobBytes(c: HTMLCanvasElement, mime: string, qualitaet?: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    c.toBlob(
      (b) => (b ? b.arrayBuffer().then((x) => resolve(new Uint8Array(x)), reject) : reject(new Error('Bild konnte nicht erzeugt werden (zu groß?).'))),
      mime,
      qualitaet,
    ),
  );
}

export interface Datei {
  daten: Uint8Array;
  name: string;
  endung: string;
  mime: string;
  filter: string;
}

export interface PdfPlan {
  seite: [number, number];
  bild: [number, number];
  passt: boolean;
}

const RAND = 10;
const FUSS = 16;

/** Seitengröße und Bildgröße (mm) im PDF */
export function pdfPlan(b: Bereich, massstab: number, papier: Papier): PdfPlan {
  const bild: [number, number] = [((b.x1 - b.x0) * 1000) / massstab, ((b.y1 - b.y0) * 1000) / massstab];
  if (papier === 'passend') return { seite: [bild[0] + 2 * RAND, bild[1] + 2 * RAND + FUSS], bild, passt: true };
  const [k, l] = PAPIER[papier];
  const seite: [number, number] = bild[0] > bild[1] ? [l, k] : [k, l];
  const passt = bild[0] <= seite[0] - 2 * RAND + 1e-6 && bild[1] <= seite[1] - 2 * RAND - FUSS + 1e-6;
  return { seite, bild, passt };
}

/** kleinste übliche Maßstabszahl, bei der der Bereich aufs Papier passt */
export function passenderMassstab(b: Bereich, papier: Papier): number {
  const reihe = [1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 200, 250, 500, 1000, 2000, 2500, 5000];
  if (papier === 'passend') return 50;
  return reihe.find((n) => pdfPlan(b, n, papier).passt) ?? 5000;
}

export async function exportieren(foto: Foto, daten: Uint8Array, ebene: Ebene, e: Entzerrung, o: Optionen): Promise<Datei> {
  const a = ausgabe(o.bereich, o.aufloesung);
  const name = dateiName(`${foto.name} – ${ebene.name}`);
  const c = await entzerrtesBild(foto, daten, e, a, o.format !== 'png');
  if (o.mitMessungen && o.format !== 'pdf') messungenZeichnen(c, e, ebene, a);
  if (o.format === 'png') {
    const png = pngMitMassstab(await blobBytes(c, 'image/png'), a.aufloesung);
    return { daten: png, name: `${name} ${aufloesungText(a.aufloesung)}.png`, endung: 'png', mime: 'image/png', filter: 'PNG-Bild' };
  }
  if (o.format === 'jpeg') {
    const jpg = jpegMitMassstab(await blobBytes(c, 'image/jpeg', 0.92), a.aufloesung);
    return { daten: jpg, name: `${name} ${aufloesungText(a.aufloesung)}.jpg`, endung: 'jpg', mime: 'image/jpeg', filter: 'JPEG-Bild' };
  }
  return { daten: await pdfAusBild(c, a, foto, ebene, e, o), name: `${name} M 1-${o.massstab}.pdf`, endung: 'pdf', mime: 'application/pdf', filter: 'PDF' };
}

async function pdfAusBild(c: HTMLCanvasElement, a: Ausgabe, foto: Foto, ebene: Ebene, e: Entzerrung, o: Optionen): Promise<Uint8Array> {
  const plan = pdfPlan(a.bereich, o.massstab, o.papier);
  if (!plan.passt) throw new Error(`Bei 1:${o.massstab} passt der Ausschnitt nicht auf ${o.papier} – größeres Papier oder kleineren Maßstab wählen.`);
  const [sb, sh] = plan.seite;
  const [bb, bh] = plan.bild;
  const jpeg = await blobBytes(c, 'image/jpeg', 0.9);
  const linien: PdfLinie[] = [{ punkte: rechteck(RAND, RAND, bb, bh), zu: true, staerke: 0.15, farbe: [0.4, 0.4, 0.4] }];
  const texte: PdfText[] = [];
  if (o.mitMessungen) pdfMessungen(linien, texte, e, ebene, a.bereich, 1000 / o.massstab);
  const fussY = RAND + bh + 6;
  texte.push({ x: RAND, y: fussY + 3, text: `${foto.name} – ${ebene.name}`, groesse: 9, fett: true });
  const datum = new Date().toLocaleDateString('de-DE');
  texte.push({
    x: RAND,
    y: fussY + 8,
    text: `Maßstab 1:${o.massstab} · Bildauflösung ${fmt2(a.aufloesung * 1000)} mm je Pixel · entzerrt nach ${METHODE[ebene.methode]} · ${datum}`,
    groesse: 6.5,
    farbe: [0.3, 0.3, 0.3],
  });
  texte.push({ x: RAND, y: fussY + 11.5, text: 'Maße gelten nur für Punkte in der entzerrten Ebene.', groesse: 6, farbe: [0.45, 0.45, 0.45] });
  massstabsleiste(linien, texte, RAND + bb, fussY + 1, o.massstab);
  return pdfErzeugen({
    breite: sb,
    hoehe: sh,
    bild: { jpeg, px: c.width, py: c.height, x: RAND, y: RAND, breite: bb, hoehe: bh },
    linien,
    texte,
    titel: `${foto.name} – ${ebene.name}`,
  });
}

const METHODE: Record<Ebene['methode'], string> = { rechteck: 'Rechteck', passpunkte: 'Passpunkten', fluchtlinien: 'Fluchtlinien' };

function rechteck(x: number, y: number, b: number, h: number): Pt[] {
  return [
    { x, y },
    { x: x + b, y },
    { x: x + b, y: y + h },
    { x, y: y + h },
  ];
}

/** Maßstabsleiste rechtsbündig bei (rechts, y): vier Felder im Wechsel schwarz/weiß */
function massstabsleiste(linien: PdfLinie[], texte: PdfText[], rechts: number, y: number, massstab: number) {
  const mmJeM = 1000 / massstab;
  const stufen = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500];
  const feld = stufen.find((s) => s * mmJeM >= 8) ?? 500;
  const fb = feld * mmJeM;
  const links = rechts - 4 * fb;
  for (let i = 0; i < 4; i++) {
    linien.push({ punkte: rechteck(links + i * fb, y, fb, 1.6), zu: true, staerke: 0.15, farbe: [0, 0, 0], fuellung: i % 2 ? [1, 1, 1] : [0, 0, 0] });
  }
  for (let i = 0; i <= 4; i += 2) {
    const v = String(+(i * feld).toFixed(3)).replace('.', ',');
    texte.push({ x: links + i * fb, y: y + 4.6, text: i === 4 ? `${v} m` : v, groesse: 6, ausrichtung: i === 4 ? 'rechts' : 'mitte' });
  }
}

/** Messungen als Vektoren mit Beschriftung in pt-Größen */
function pdfMessungen(linien: PdfLinie[], texte: PdfText[], e: Entzerrung, ebene: Ebene, b: Bereich, mmJeM: number) {
  const mm = (q: Pt) => ({ x: RAND + (q.x - b.x0) * mmJeM, y: RAND + (b.y1 - q.y) * mmJeM });
  const farbe: [number, number, number] = [0.91, 0.35, 0.05];
  for (const l of messLinien(e, ebene)) {
    linien.push({ punkte: l.punkte.map(mm), zu: l.zu, staerke: 0.3, farbe });
    for (const t of l.texte) {
      const s = mm(t.a);
      const z = mm(t.b);
      if (Math.hypot(z.x - s.x, z.y - s.y) < textBreite(t.text, 6) + 2) continue;
      // Winkel gegen den Uhrzeigersinn (PDF), lesbar von unten bzw. rechts
      let w = (Math.atan2(-(z.y - s.y), z.x - s.x) * 180) / Math.PI;
      if (w > 90) w -= 180;
      if (w < -90) w += 180;
      const r = (w * Math.PI) / 180;
      // 0,8 mm über die Linie
      texte.push({ x: (s.x + z.x) / 2 - 0.8 * Math.sin(r), y: (s.y + z.y) / 2 - 0.8 * Math.cos(r), text: t.text, groesse: 6, winkel: w, ausrichtung: 'mitte', farbe: [0.72, 0.25, 0.04] });
    }
    if (l.flaeche) {
      const m = mm(l.flaeche.mitte);
      texte.push({ x: m.x, y: m.y + 1, text: l.flaeche.text, groesse: 7, fett: true, ausrichtung: 'mitte', farbe: [0.72, 0.25, 0.04] });
    }
  }
}
