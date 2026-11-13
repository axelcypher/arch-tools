/**
 * Deckblatt der Rechnungsprüfung als PDF („Kostenfeststellung / Anhang Rechnungsprüfung“) im Aufbau des
 * Büro-Vordrucks: Bauherr, Projekt, Gewerk, Firma, Zahlungsfreigabe, Rechnung, Netto-Forderung, die Rechnung
 * Schritt für Schritt bis zum Überweisungsbetrag, bereits erhaltene Zahlungen, Gruß und Unterschrift.
 *
 * Mit einem Briefbogen (PDF, erste Seite) als Hintergrund sieht es aus wie bisher aus Word/Excel; ohne steht der
 * Büroname oben rechts und die Fußzeile aus den Einstellungen unten. Das Deckblatt lässt sich drucken (zum
 * Unterschreiben) oder direkt vor die gescannte Rechnung setzen.
 */

import type { PDFFont, PDFPage } from 'pdf-lib';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { APP_NAMEN } from '@core/appNamen';
import type { Pruefung } from './pruefung';
import { datumDE, euro, pruefen } from './pruefung';

export interface DeckblattDaten {
  kuerzel: string;
  /** Bauvorhaben (erste Zeile fett) und Adresse */
  vorhaben: string;
  vorhabenAdresse: string;
  /** Empfänger (Bauherr) – mehrzeilig */
  empfaenger: string;
  gewerk: string;
  firma: string;
  /** z. B. „AB 1“, „SR1“ */
  zahlungsfreigabe: string;
  freigabeDatum?: string;
  /** z. B. „Abschlagsrechnung“, „Schlussrechnung 1“ */
  rechnungsart: string;
  rechnungsDatum?: string;
  /** Nummer der Rechnungsliste (optional auf dem Deckblatt) */
  nr?: number | string;
  pruefung: Pruefung;
  /** Büro (Name, mehrzeilig) unter dem Gruß */
  buero: string;
  /** „i.A. Name“ */
  bearbeiter: string;
  /** Fußzeile ohne Briefbogen (Spalten durch Tabulator, Zeilen durch Zeilenumbruch) */
  fusszeile?: string;
  /** Text vor dem Gruß */
  schlusstext?: string;
}

export const VORGABE_SCHLUSSTEXT =
  'Wir bitten um kurzfristige Überweisung der von uns nach Rechnungsprüfung zur Auszahlung freigegebenen und verbuchten Summe und stehen für Rückfragen gerne zur Verfügung.';

/** Zeilen- und Absatztrenner (U+2028/2029) kennt die Standardschrift nicht */
const ZEILENTRENNER = new RegExp('[\\u2028\\u2029]', 'g');

const A4: [number, number] = [595.28, 841.89];
const MM = 72 / 25.4;
const SCHWARZ = rgb(0, 0, 0);
const GRAU = rgb(0.35, 0.35, 0.35);

interface Stift {
  page: PDFPage;
  font: PDFFont;
  fett: PDFFont;
}

/** Text an Position (x in mm von links, y in mm von oben); `rechts`: x ist die rechte Kante */
function schreib(s: Stift, text: string, x: number, y: number, o: { groesse?: number; fett?: boolean; rechts?: boolean; farbe?: ReturnType<typeof rgb> } = {}) {
  const font = o.fett ? s.fett : s.font;
  const size = o.groesse ?? 9;
  const sauber = text.replace(ZEILENTRENNER, ' ');
  const w = font.widthOfTextAtSize(sauber, size);
  s.page.drawText(sauber, { x: x * MM - (o.rechts ? w : 0), y: A4[1] - y * MM, size, font, color: o.farbe ?? SCHWARZ });
}

function kasten(s: Stift, x: number, y: number, b: number, h: number, fuellung?: ReturnType<typeof rgb>) {
  s.page.drawRectangle({ x: x * MM, y: A4[1] - (y + h) * MM, width: b * MM, height: h * MM, borderColor: SCHWARZ, borderWidth: 0.6, ...(fuellung ? { color: fuellung } : {}) });
}

function linie(s: Stift, x1: number, y: number, x2: number, dicke = 0.6) {
  s.page.drawLine({ start: { x: x1 * MM, y: A4[1] - y * MM }, end: { x: x2 * MM, y: A4[1] - y * MM }, thickness: dicke, color: SCHWARZ });
}

/** Zeilenumbruch nach Breite (mm) */
function umbrechen(font: PDFFont, text: string, size: number, breite: number): string[] {
  const out: string[] = [];
  for (const absatz of text.split('\n')) {
    let zeile = '';
    for (const wort of absatz.split(/\s+/)) {
      const probe = zeile ? `${zeile} ${wort}` : wort;
      if (font.widthOfTextAtSize(probe, size) > breite * MM && zeile) {
        out.push(zeile);
        zeile = wort;
      } else zeile = probe;
    }
    out.push(zeile);
  }
  return out;
}

const prozentText = (n: number) => `${n.toLocaleString('de-DE', { maximumFractionDigits: 2 })}%`;

export async function deckblattPdf(d: DeckblattDaten, briefbogen?: Uint8Array | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${d.kuerzel} ${d.gewerk} ${d.firma} ${d.zahlungsfreigabe} – Rechnungsprüfung`);
  doc.setCreator(APP_NAMEN.ava.name);
  const page = doc.addPage(A4);
  const s: Stift = { page, font: await doc.embedFont(StandardFonts.Helvetica), fett: await doc.embedFont(StandardFonts.HelveticaBold) };
  if (briefbogen) {
    const quelle = await PDFDocument.load(briefbogen, { ignoreEncryption: true });
    const [hinter] = await doc.embedPdf(quelle, [0]);
    page.drawPage(hinter, { x: 0, y: 0, width: A4[0], height: A4[1] });
  } else {
    const kopf = d.buero.split('\n');
    kopf.forEach((z, i) => schreib(s, z, 190, 20 + i * 5, { groesse: i === 0 ? 13 : 9, fett: i === 0, rechts: true }));
  }
  const L = 20;
  const R = 190;
  // Empfänger
  d.empfaenger
    .split('\n')
    .filter((z, i, a) => z.trim() || (i > 0 && a[i - 1].trim()))
    .slice(0, 7)
    .forEach((z, i) => schreib(s, z, L, 52 + i * 4.6, { groesse: 9.5 }));
  // Projekt
  schreib(s, d.kuerzel, L, 92, { groesse: 15, fett: true });
  schreib(s, d.vorhaben, 55, 89, { groesse: 9.5, fett: true });
  schreib(s, d.vorhabenAdresse, 55, 95, { groesse: 9.5, fett: true });
  schreib(s, 'Kostenfeststellung/ Anhang Rechnungsprüfung', R, 101, { groesse: 9.5, fett: true, rechts: true });
  const r = pruefen(d.pruefung);
  // Kopfzeilen
  let y = 110;
  schreib(s, 'Gewerk:', L, y);
  schreib(s, 'Firma:', 55, y);
  schreib(s, 'Zahlungsfreigabe:', 120, y);
  schreib(s, 'Freigabe Datum:', R, y, { rechts: true });
  y += 5;
  schreib(s, d.gewerk + (d.nr !== undefined && d.nr !== '' ? `   Nr. ${d.nr}` : ''), L, y, { fett: true });
  schreib(s, d.firma, 55, y, { fett: true });
  schreib(s, d.zahlungsfreigabe, 145, y, { fett: true, groesse: 10.5 });
  schreib(s, datumDE(d.freigabeDatum), R, y, { rechts: true });
  y += 6;
  schreib(s, 'Rechnung:', L, y);
  schreib(s, 'Datum:', 55, y);
  schreib(s, 'Netto- Forderung bisher:', 120, y);
  y += 4.6;
  schreib(s, d.rechnungsart, L, y, { fett: true });
  schreib(s, datumDE(d.rechnungsDatum), 55, y);
  schreib(s, euro(d.pruefung.forderungNetto ?? r.freigabeNetto), 120, y, { fett: true });
  // Rechnung
  y += 12;
  const wert = (text: string, betrag: number, o: { fett?: boolean; minus?: boolean; kasten?: boolean } = {}) => {
    schreib(s, text, L, y, { fett: o.fett });
    if (o.minus) schreib(s, '-', 160, y);
    schreib(s, euro(betrag).replace(' €', ''), R - 4, y, { rechts: true, fett: o.fett });
    schreib(s, '€', R, y, { rechts: true, fett: o.fett });
    if (o.kasten) kasten(s, 160, y - 4, 31, 5.6);
    y += 5;
  };
  const vereinbart = (pz: number, mitText = true) => {
    if (mitText) schreib(s, 'vereinbarungsgemäß', 105, y);
    kasten(s, 135, y - 3.8, 17, 5);
    schreib(s, prozentText(pz), 145, y, { rechts: true });
  };
  wert('Netto- Freigabesumme:', r.freigabeNetto, { kasten: true });
  y += 3;
  vereinbart(d.pruefung.nachlassProzent);
  wert('Abzüglich Nachlass', r.nachlass, { minus: true });
  wert('1. Zwischensumme:', r.zwischen1);
  schreib(s, prozentText(d.pruefung.mwstProzent), 145, y, { rechts: true });
  wert(`${prozentText(d.pruefung.mwstProzent).replace('%', ' %')} Mwst.`, r.mwst);
  wert('Brutto-Freigabesumme:', r.brutto, { fett: true });
  vereinbart(d.pruefung.umlageProzent);
  wert('Gemeinkostenumlage', r.umlage, { minus: true });
  wert('2. Zwischensumme:', r.zwischen2);
  vereinbart(d.pruefung.einbehaltProzent);
  if (d.pruefung.einbehaltText) schreib(s, d.pruefung.einbehaltText, 55, y);
  wert('Sicherheitseinbehalt', r.einbehalt, { minus: true });
  wert('3. Zwischensumme:', r.zwischen3);
  vereinbart(d.pruefung.skontoProzent);
  wert('Abzüglich Skonto', r.skonto, { minus: true });
  wert('Endsumme:', r.endsumme, { fett: true });
  linie(s, L, y - 4.2, R, 0.8);
  y += 4;
  schreib(s, 'Davon bereits erhalten:', L, y);
  y += 7;
  for (const z of d.pruefung.bereits.slice(0, 12)) {
    schreib(s, z.text, 85, y);
    schreib(s, datumDE(z.datum), 125, y);
    schreib(s, '-', 150, y);
    schreib(s, euro(z.betrag), R, y, { rechts: true });
    y += 4.6;
  }
  y = Math.max(y + 6, 205);
  kasten(s, L, y - 4.5, R - L, 6.5, rgb(0.86, 0.86, 0.86));
  schreib(s, 'Zahlungsfreigabe / Überweisungsbetrag:', L + 1.5, y, { fett: true });
  kasten(s, 158, y - 4.5, R - 158, 6.5);
  schreib(s, euro(r.zahlung), R - 1.5, y, { fett: true, rechts: true });
  y += 12;
  for (const z of umbrechen(s.font, d.schlusstext ?? VORGABE_SCHLUSSTEXT, 9, R - L)) {
    schreib(s, z, L, y);
    y += 4.4;
  }
  y += 4;
  schreib(s, 'Mit freundlichen Grüßen', L, y);
  const bueroZeilen = d.buero.split('\n').slice(0, 2);
  bueroZeilen.forEach((z, i) => schreib(s, z, R - 15, y + 4 + i * 4, { rechts: true, groesse: 8.5 }));
  schreib(s, d.bearbeiter, R - 15, y + 22, { rechts: true, groesse: 9 });
  schreib(s, 'Anlage', L, y + 18);
  if (d.pruefung.anmerkung) {
    let ya = y + 30;
    schreib(s, 'Anmerkungen zur Prüfung:', L, ya, { fett: true, groesse: 8.5 });
    ya += 4.4;
    for (const z of umbrechen(s.font, d.pruefung.anmerkung, 8.5, R - L).slice(0, 6)) {
      schreib(s, z, L, ya, { groesse: 8.5 });
      ya += 4;
    }
  }
  if (!briefbogen && d.fusszeile) {
    const spalten = d.fusszeile.split('\t');
    const b = (R - L) / Math.max(1, spalten.length);
    spalten.forEach((sp, i) => sp.split('\n').forEach((z, k) => schreib(s, z, L + i * b, 275 + k * 3.4, { groesse: 6.5, farbe: GRAU })));
  }
  return doc.save();
}

/** Deckblatt vor die gescannte Rechnung setzen (die Seiten der Rechnung bleiben, wie sie sind) */
export async function deckblattVoranstellen(deckblatt: Uint8Array, scan: Uint8Array): Promise<Uint8Array> {
  const ziel = await PDFDocument.load(scan, { ignoreEncryption: true, updateMetadata: false });
  const quelle = await PDFDocument.load(deckblatt);
  const [seite] = await ziel.copyPages(quelle, [0]);
  ziel.insertPage(0, seite);
  return ziel.save();
}

/** Anzahl der Seiten einer PDF (für die Vorschau der Übernahme) */
export async function seitenzahl(pdf: Uint8Array): Promise<number> {
  const d = await PDFDocument.load(pdf, { ignoreEncryption: true, updateMetadata: false });
  return d.getPageCount();
}
