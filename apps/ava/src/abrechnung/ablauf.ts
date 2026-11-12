/**
 * Ablauf einer Rechnungsprüfung, wie im Büro üblich – in zwei Schritten, weil zwischen ihnen gestempelt,
 * unterschrieben und gescannt wird:
 *
 * 1. Erfassen: Gewerk, Firma, Art, Datum, Forderung und (meist) die Korrektur eintragen. Die App vergibt die nächste
 *    freie Nummer der Rechnungsliste, trägt die Rechnung in die Kostenkontrolle ein (Rechnungsliste und
 *    Kostenfeststellung des Gewerkblatts – damit ist die Nummer auch für die Kollegen vergeben), merkt sich die
 *    Prüfung in der Projektdatei und erzeugt das Deckblatt zum Drucken.
 * 2. Ablegen: Den frischen Scan aus dem Scanordner nach dem Muster benennen und in den Auftragsordner des Gewerks
 *    verschieben (auf Wunsch mit digital vorangestelltem Deckblatt), danach den Mailentwurf an den Zahler öffnen.
 */

import type { ProjectMeta } from '@core/model';
import { xlsxAendern } from '@core/dokumente/xlsx';
import type { AvaProjekt, RechnungsDatensatz } from '../avaDaten';
import { avaAendern } from '../avaDaten';
import type { AvaDateien, DateiStand } from '../dateien';
import type { AvaEinstellungen, MailVorlage } from '../einstellungen';
import { neueId } from '../lv/modell';
import type { Gewerk } from '../projekt';
import { nameBilden } from './benennung';
import type { DeckblattDaten } from './deckblatt';
import { deckblattPdf, deckblattVoranstellen } from './deckblatt';
import { gewerkZweistellig } from './gewerk';
import type { Kostenkontrolle } from './kostenkontrolle';
import { kostenkontrolleLesen, rechnungEintragen } from './kostenkontrolle';
import { emlBauen, vorlageFuellen } from './mail';
import type { Pruefung } from './pruefung';
import { datumDE, euro, pruefen } from './pruefung';

export interface Kontext {
  fs: AvaDateien;
  /** Projektordner (vollständig) */
  ordner: string;
  /** Projektdatei relativ zum Projektordner */
  oap: string;
  meta: ProjectMeta;
  projektName: string;
  e: AvaEinstellungen;
}

export interface KkStand {
  pfad: string;
  bytes: Uint8Array;
  stand: DateiStand;
  kk: Kostenkontrolle;
}

export interface Erfassung {
  gewerk: string;
  firma: string;
  art: string;
  lfd?: number;
  rechnungsnummer?: string;
  rechnungsdatum?: string;
  freigabe?: string;
  /** mit Korrektur (Deckblatt) */
  pruefung?: Pruefung;
  /** ohne Korrektur: freigegebener Betrag brutto */
  betrag?: number;
  bemerkung?: string;
  /** Text in der Rechnungsliste; Vorgabe „Firma, AB1“ */
  text?: string;
}

export const artName = (e: AvaEinstellungen, art: string, lfd?: number) => {
  const a = e.rechnungen.arten.find((x) => x.kuerzel === art);
  const name = a?.name ?? art;
  return a?.abschlag ? name : `${name}${lfd ? ` ${lfd}` : ''}`;
};

/** freigegebener Betrag (Zahlung) einer Erfassung */
export const zahlbetrag = (er: Erfassung) => (er.pruefung ? pruefen(er.pruefung).zahlung : (er.betrag ?? 0));

/** Kostenkontrolle neu einlesen */
export async function kkLaden(fs: AvaDateien, ordner: string, pfad: string): Promise<KkStand> {
  const r = await fs.lies(ordner, pfad);
  if (!r) throw new Error(`${pfad}: nicht gefunden`);
  return { pfad, bytes: r.daten, stand: r.stand, kk: kostenkontrolleLesen(r.daten) };
}

/**
 * Schritt 1: Rechnung erfassen – Eintrag in die Kostenkontrolle (frisch gelesen, damit keine Nummer doppelt
 * vergeben wird) und in die Projektdatei. Liefert Datensatz, neuen Stand der Kostenkontrolle und Projekt.
 */
export async function rechnungErfassen(k: Kontext, kkPfad: string | null, er: Erfassung, jetzt = new Date()): Promise<{ datensatz: RechnungsDatensatz; kk: KkStand | null; ava: AvaProjekt; beschreibung: string[] }> {
  const betrag = zahlbetrag(er);
  const text = er.text ?? `${er.firma}, ${er.art}${er.lfd ?? ''}`;
  let kkNeu: KkStand | null = null;
  let nr: number | string = '';
  const beschreibung: string[] = [];
  if (kkPfad) {
    const frisch = await kkLaden(k.fs, k.ordner, kkPfad);
    if (await k.fs.inOffice(k.ordner, kkPfad)) throw new Error('Die Kostenkontrolle ist gerade in Excel geöffnet – bitte dort schließen, dann erneut versuchen.');
    const a = rechnungEintragen(frisch.kk, { gewerk: er.gewerk, text, datum: er.rechnungsdatum, freigabe: er.freigabe, betrag, bemerkung: er.bemerkung });
    nr = a.nr ?? '';
    beschreibung.push(...a.beschreibung);
    const neu = xlsxAendern(frisch.bytes, a.aenderungen, { ergebnisseAuffrischen: true, heute: jetzt });
    await k.fs.ersetzen(k.ordner, kkPfad, neu, frisch.stand);
    kkNeu = await kkLaden(k.fs, k.ordner, kkPfad);
  }
  const datensatz: RechnungsDatensatz = {
    id: neueId('r'),
    gewerk: er.gewerk,
    nr,
    art: er.art,
    ...(er.lfd ? { lfd: er.lfd } : {}),
    firma: er.firma,
    ...(er.rechnungsnummer ? { rechnungsnummer: er.rechnungsnummer } : {}),
    ...(er.rechnungsdatum ? { rechnungsdatum: er.rechnungsdatum } : {}),
    ...(er.freigabe ? { freigabe: er.freigabe } : {}),
    ...(er.pruefung ? { pruefung: er.pruefung } : {}),
    betrag,
    status: 'erfasst',
    erfasst: jetzt.toISOString(),
    ...(er.bemerkung ? { bemerkung: er.bemerkung } : {}),
  };
  const ava = await avaAendern(k.fs.projektordner, k.ordner, k.oap, (a) => ({ ...a, rechnungen: [...a.rechnungen, datensatz] }));
  beschreibung.push('Projektdatei: Prüfung gespeichert');
  return { datensatz, kk: kkNeu, ava, beschreibung };
}

/** Daten fürs Deckblatt aus Projekt, Einstellungen und Datensatz */
export function deckblattDaten(k: Kontext, d: RechnungsDatensatz): DeckblattDaten {
  const m = k.meta;
  const bauherr = [`${m.bauherr.vorname ?? ''} ${m.bauherr.name}`.trim(), m.bauherr.adresse.strasse, `${m.bauherr.adresse.plz} ${m.bauherr.adresse.ort}`.trim()].filter(Boolean).join('\n');
  const adresse = [m.adresse.strasse, `${m.adresse.plz} ${m.adresse.ort}`.trim()].filter(Boolean).join(', ');
  const pruefung: Pruefung = d.pruefung ?? {
    forderungNetto: null,
    freigabeNetto: d.betrag / (1 + k.e.pruefung.mwstProzent / 100),
    nachlassProzent: 0,
    mwstProzent: k.e.pruefung.mwstProzent,
    umlageProzent: 0,
    einbehaltProzent: 0,
    skontoProzent: 0,
    bereits: [],
  };
  return {
    kuerzel: m.projektcode,
    vorhaben: m.vorhaben || k.projektName,
    vorhabenAdresse: adresse,
    empfaenger: bauherr,
    gewerk: gewerkZweistellig(d.gewerk).replace(/^G/, 'G '),
    firma: d.firma,
    zahlungsfreigabe: `${d.art} ${d.lfd ?? ''}`.trim(),
    freigabeDatum: d.freigabe,
    rechnungsart: artName(k.e, d.art, d.lfd),
    rechnungsDatum: d.rechnungsdatum,
    ...(k.e.rechnungen.nrAufDeckblatt ? { nr: d.nr } : {}),
    pruefung,
    buero: k.e.deckblatt.buero,
    bearbeiter: `i.A. ${k.e.deckblatt.bearbeiter || m.bearbeiter || ''}`.trim(),
    fusszeile: k.e.deckblatt.fusszeile,
    schlusstext: k.e.deckblatt.schlusstext,
  };
}

/** Briefbogen lesen (vollständiger Pfad), falls eingestellt */
export async function briefbogenLesen(k: Kontext): Promise<Uint8Array | null> {
  const p = k.e.deckblatt.briefbogen.trim();
  if (!p) return null;
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
  const r = await k.fs.lies(p.slice(0, i), p.slice(i + 1));
  return r?.daten ?? null;
}

export async function deckblattErzeugen(k: Kontext, d: RechnungsDatensatz): Promise<Uint8Array> {
  return deckblattPdf(deckblattDaten(k, d), await briefbogenLesen(k));
}

/** Dateiname der Rechnung im Auftragsordner (erstes Muster) */
export function rechnungsDateiname(k: Kontext, d: RechnungsDatensatz): string {
  return `${nameBilden(k.e.rechnungen.muster[0], { kuerzel: k.meta.projektcode, nr: typeof d.nr === 'number' ? d.nr : Number(d.nr) || undefined, art: d.art, lfd: d.lfd, firma: d.firma, datum: d.rechnungsdatum, gewerk: gewerkZweistellig(d.gewerk) })}.pdf`;
}

/** Zielordner des Gewerks (Auftrag) relativ zum Projektordner */
export function auftragsordner(k: Kontext, g: Gewerk | null, gewerk: string): string {
  if (g) return `${g.pfad}/${k.e.ablage.auftrag}`;
  return `${k.e.ablage.gewerke}/${gewerkZweistellig(gewerk)}/${k.e.ablage.auftrag}`;
}

/**
 * Schritt 2: Scan ablegen – umbenannt in den Auftragsordner; mit `deckblatt` wird es digital vorangestellt.
 * Liefert den Pfad der abgelegten Datei.
 */
export async function scanAblegen(k: Kontext, d: RechnungsDatensatz, g: Gewerk | null, scan: { ordner: string; datei: string }, o: { deckblatt?: boolean; name?: string } = {}): Promise<{ pfad: string; ava: AvaProjekt }> {
  const name = o.name ?? rechnungsDateiname(k, d);
  const ziel = `${auftragsordner(k, g, d.gewerk)}/${name}`;
  let daten: Uint8Array | undefined;
  if (o.deckblatt && /\.pdf$/i.test(scan.datei)) {
    const s = await k.fs.lies(scan.ordner, scan.datei);
    if (!s) throw new Error(`${scan.datei}: Scan nicht gefunden`);
    daten = await deckblattVoranstellen(await deckblattErzeugen(k, d), s.daten);
  }
  await k.fs.scanUebernehmen(scan.ordner, scan.datei, k.ordner, ziel, daten);
  const ava = await avaAendern(k.fs.projektordner, k.ordner, k.oap, (a) => ({
    ...a,
    rechnungen: a.rechnungen.map((r) => (r.id === d.id ? { ...r, datei: ziel, status: r.status === 'versendet' ? 'versendet' : 'abgelegt' } : r)),
  }));
  return { pfad: ziel, ava };
}

/** Werte für die Platzhalter der Mailvorlagen */
export function mailWerte(k: Kontext, d: RechnungsDatensatz, ava: AvaProjekt): Record<string, string> {
  const zahler = ava.gewerke[d.gewerk]?.zahler || ava.zahler || k.meta.bauherr.kontakte.find((c) => c.art === 'email')?.wert || '';
  return {
    Projekt: k.meta.vorhaben || k.projektName,
    Kürzel: k.meta.projektcode,
    Gewerk: `${gewerkZweistellig(d.gewerk)} ${ava.gewerke[d.gewerk]?.kostengruppe ?? ''}`.trim(),
    Firma: d.firma,
    'Firma-Mail': ava.gewerke[d.gewerk]?.email ?? '',
    Rechnung: `${d.art} ${d.lfd ?? ''}`.trim(),
    Nr: String(d.nr),
    Betrag: euro(d.betrag),
    Datum: datumDE(d.rechnungsdatum),
    Zahler: zahler,
    Bearbeiter: k.e.deckblatt.bearbeiter || k.meta.bearbeiter || '',
  };
}

/** Mailentwurf mit der abgelegten Rechnung als Anhang öffnen */
export async function mailEntwurf(k: Kontext, d: RechnungsDatensatz, ava: AvaProjekt, vorlage: MailVorlage, jetzt = new Date()): Promise<AvaProjekt> {
  if (!d.datei) throw new Error('Die Rechnung ist noch nicht abgelegt – zuerst den Scan übernehmen.');
  const pdf = await k.fs.lies(k.ordner, d.datei);
  if (!pdf) throw new Error(`${d.datei}: nicht gefunden`);
  const w = mailWerte(k, d, ava);
  const liste = (s: string) =>
    vorlageFuellen(s, w)
      .split(/[;,]/)
      .map((x) => x.trim())
      .filter(Boolean);
  const an = liste(vorlage.an);
  const name = d.datei.split('/').pop()!;
  const eml = emlBauen({ an, cc: liste(vorlage.cc), betreff: vorlageFuellen(vorlage.betreff, w), text: vorlageFuellen(vorlage.text, w), anhaenge: [{ name, daten: pdf.daten }] }, jetzt);
  await k.fs.mailEntwurf(name.replace(/\.pdf$/i, ''), eml);
  return avaAendern(k.fs.projektordner, k.ordner, k.oap, (a) => ({
    ...a,
    rechnungen: a.rechnungen.map((r) => (r.id === d.id ? { ...r, status: 'versendet', versendet: { an: an.join(', '), am: jetzt.toISOString() } } : r)),
  }));
}
