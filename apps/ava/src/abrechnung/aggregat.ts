/**
 * Abrechnung je Gewerk aus allen Quellen zusammengeführt:
 *
 * - Kostenkontrolle (Excel): Kostenschätzung, Aufträge (Kostenanschlag), Rechnungen (Kostenfeststellung) und die
 *   Einträge der Rechnungsliste mit laufender Nummer,
 * - LV-Dateien: Kostenansatz, Angebote, beauftragter Bieter und Auftragssumme,
 * - Auftragsordner: abgelegte Rechnungen (PDF, am Dateinamen erkannt),
 * - Projektdatei: geprüfte Rechnungen der App (Prüfung, Status, Versand).
 *
 * Eine Rechnung erscheint einmal, mit allen Quellen, in denen sie vorkommt. Was nicht zusammenpasst (andere
 * Nummer im Gewerkblatt, Rechnung ohne PDF, PDF ohne Eintrag …), steht als Hinweis daneben – nie blockierend.
 */

import type { RechnungsDatensatz } from '../avaDaten';
import type { Gewerk, RechnungsDatei } from '../projekt';
import type { KkGewerkBlatt, KkRechnung, KkUebersichtZeile, KkZeile, Kostenkontrolle } from './kostenkontrolle';

export interface Rechnung {
  /** Schlüssel für die Anzeige */
  schluessel: string;
  gewerk: string;
  nr: number | string | null;
  text: string;
  art?: string;
  lfd?: number;
  datum?: string;
  freigabe?: string;
  betrag: number | null;
  liste?: KkRechnung;
  blatt?: KkZeile;
  datei?: RechnungsDatei;
  datensatz?: RechnungsDatensatz;
  hinweise: string[];
}

export interface GewerkAbrechnung {
  gewerk: string;
  bezeichnung: string;
  firma: string;
  kostenschaetzung: number | null;
  /** Summe der Aufträge laut Kostenkontrolle (brutto) */
  kostenanschlag: number | null;
  auftraege: KkZeile[];
  /** Summe der Zahlungsfreigaben laut Kostenkontrolle (Spalte „Kostenfeststellung“ der Mappe) */
  kostenfeststellung: number | null;
  rechnungen: Rechnung[];
  /** noch auszuzahlen: Kostenanschlag − Zahlungsfreigaben (Kostenfeststellung der Mappe) */
  offen: number | null;
  /** freigegeben in % des Kostenanschlags */
  anteil: number | null;
  blatt?: KkGewerkBlatt;
  uebersicht?: KkUebersichtZeile;
  hinweise: string[];
}

/**
 * Rechnungsart und laufende Nummer aus dem Text der Rechnungsliste („Rohbau Muster, AB2“, „Fenster SR 1“): nur ein
 * Kürzel am Ende des Texts zählt – nicht der Anfang eines Worts („Rohbau“, „Richter“ sind keine Rechnung „R“).
 */
export function artAusText(text: string): { art?: string; lfd?: number } {
  const m = /(?:^|[,;:\s])(TSR|SR|AB|R)\s*(\d{0,3})\s*\.?$/i.exec(text.trim());
  if (!m) return {};
  return { art: m[1].toUpperCase(), ...(m[2] ? { lfd: Number(m[2]) } : {}) };
}

const gleich = (a: number | null | undefined, b: number | null | undefined) => a !== null && a !== undefined && b !== null && b !== undefined && Math.abs(a - b) < 0.015;
const nrGleich = (a: unknown, b: unknown) => a !== null && a !== undefined && b !== null && b !== undefined && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

export function gewerkAbrechnung(gewerk: string, kk: Kostenkontrolle | null, g: Gewerk | null, datensaetze: RechnungsDatensatz[]): GewerkAbrechnung {
  const blatt = kk?.gewerke.find((x) => x.gewerk === gewerk);
  const uebersicht = kk?.uebersicht?.zeilen.find((z) => z.gewerk === gewerk);
  const liste = kk?.rechnungsliste?.rechnungen.filter((r) => r.gewerk === gewerk) ?? [];
  const rechnungen: Rechnung[] = [];
  const hinweise: string[] = [];
  // 1. Rechnungsliste
  for (const r of liste) {
    rechnungen.push({ schluessel: `l${r.zeile}`, gewerk, nr: r.nr, text: r.text, datum: r.datum, freigabe: r.freigabe, betrag: r.betrag, liste: r, hinweise: [] });
  }
  // 2. Gewerkblatt: gleiche Nummer und Betrag, sonst gleicher Betrag, sonst gleicher Text
  const offenBlatt = [...(blatt?.feststellung.eintraege ?? [])];
  const zuordnen = <T>(liste: T[], passt: (x: T, r: Rechnung) => boolean, setzen: (r: Rechnung, x: T) => void) => {
    for (const r of rechnungen) {
      const i = liste.findIndex((x) => passt(x, r));
      if (i >= 0) {
        setzen(r, liste[i]);
        liste.splice(i, 1);
      }
    }
  };
  zuordnen(offenBlatt, (b, r) => !r.blatt && nrGleich(b.nr, r.nr) && gleich(b.betrag, r.betrag), (r, b) => (r.blatt = b));
  zuordnen(offenBlatt, (b, r) => !r.blatt && gleich(b.betrag, r.betrag), (r, b) => (r.blatt = b));
  zuordnen(offenBlatt, (b, r) => !r.blatt && !!b.text && b.text.toLowerCase() === r.text.toLowerCase(), (r, b) => (r.blatt = b));
  for (const b of offenBlatt) {
    // im Gewerkblatt, aber nicht in der Rechnungsliste (z. B. Rechnungen vor Beginn der Liste)
    rechnungen.push({ schluessel: `b${b.zeile}`, gewerk, nr: b.nr, text: b.text, datum: b.datum, betrag: b.betrag, blatt: b, hinweise: [] });
  }
  // 3. Datensätze der App (Projektdatei)
  const offenDs = [...datensaetze.filter((d) => d.gewerk === gewerk)];
  zuordnen(offenDs, (d, r) => !r.datensatz && nrGleich(d.nr, r.nr), (r, d) => (r.datensatz = d));
  for (const d of offenDs) rechnungen.push({ schluessel: `d${d.id}`, gewerk, nr: d.nr, text: `${d.firma}, ${d.art}${d.lfd ?? ''}`, datum: d.rechnungsdatum, freigabe: d.freigabe, betrag: d.betrag, datensatz: d, hinweise: [] });
  // 4. PDFs im Auftragsordner: Nummer im Dateinamen, sonst Datum und Art
  const dateien = [...(g?.rechnungen.filter((d) => !d.archiv) ?? [])];
  zuordnen(dateien, (d, r) => !r.datei && d.erkannt.nr !== undefined && nrGleich(d.erkannt.nr, r.nr), (r, d) => (r.datei = d));
  zuordnen(
    dateien,
    (d, r) => !r.datei && !!d.erkannt.datum && d.erkannt.datum === r.datum && !!d.erkannt.art && r.text.toUpperCase().replace(/\s/g, '').includes(`${d.erkannt.art}${d.erkannt.lfd ?? ''}`),
    (r, d) => (r.datei = d),
  );
  zuordnen(dateien, (d, r) => !r.datei && !!r.datensatz?.datei && r.datensatz.datei === d.pfad, (r, d) => (r.datei = d));
  for (const d of dateien) {
    rechnungen.push({ schluessel: `p${d.pfad}`, gewerk, nr: d.erkannt.nr ?? null, text: `${d.erkannt.firma ?? ''} ${d.erkannt.art ?? ''}${d.erkannt.lfd ?? ''}`.trim(), art: d.erkannt.art, lfd: d.erkannt.lfd, datum: d.erkannt.datum, betrag: null, datei: d, hinweise: [] });
  }
  // Hinweise je Rechnung
  for (const r of rechnungen) {
    const ausText = artAusText(r.text);
    const art = r.datei?.erkannt.art ?? r.datensatz?.art ?? ausText.art;
    if (art) r.art = art;
    r.lfd = r.datei?.erkannt.lfd ?? r.datensatz?.lfd ?? ausText.lfd;
    if (r.liste && r.blatt && r.blatt.nr !== null && !nrGleich(r.blatt.nr, r.liste.nr)) r.hinweise.push(`Im Gewerkblatt mit Nr. ${r.blatt.nr}, in der Rechnungsliste Nr. ${r.liste.nr}.`);
    if (r.liste && r.blatt && !gleich(r.blatt.betrag, r.liste.betrag)) r.hinweise.push('Betrag im Gewerkblatt weicht von der Rechnungsliste ab.');
    if (r.liste && !r.blatt && blatt) r.hinweise.push('Fehlt in der Kostenfeststellung des Gewerkblatts.');
    if (!r.liste && r.blatt) r.hinweise.push('Steht nur im Gewerkblatt, nicht in der Rechnungsliste.');
    if (!r.liste && !r.blatt && r.datei) r.hinweise.push('PDF im Auftragsordner ohne Eintrag in der Kostenkontrolle.');
    if ((r.liste || r.blatt) && !r.datei && g) r.hinweise.push('Keine PDF im Auftragsordner gefunden.');
    if (r.datensatz && r.liste && !gleich(r.datensatz.betrag, r.liste.betrag)) r.hinweise.push('Betrag der Prüfung weicht von der Rechnungsliste ab.');
  }
  rechnungen.sort((a, b) => {
    const na = typeof a.nr === 'number' ? a.nr : parseFloat(String(a.nr ?? '')) || Number.POSITIVE_INFINITY;
    const nb = typeof b.nr === 'number' ? b.nr : parseFloat(String(b.nr ?? '')) || Number.POSITIVE_INFINITY;
    return na - nb || (a.datum ?? '').localeCompare(b.datum ?? '');
  });
  const kostenanschlag = blatt?.anschlag.summe ?? uebersicht?.anschlag ?? null;
  const kostenfeststellung = blatt?.feststellung.summe ?? uebersicht?.feststellung ?? null;
  if (blatt?.kennungImBlatt) hinweise.push(`Im Gewerkblatt „${blatt.blattName.trim()}“ steht oben ${blatt.kennungImBlatt}.`);
  const summeListe = liste.reduce((s, r) => s + (r.betrag ?? 0), 0);
  if (blatt && liste.length && kostenfeststellung !== null && !gleich(summeListe, kostenfeststellung)) {
    const diff = kostenfeststellung - summeListe;
    hinweise.push(`Kostenfeststellung im Gewerkblatt ${diff > 0 ? 'höher' : 'niedriger'} als die Summe der Rechnungsliste (${Math.abs(diff).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €).`);
  }
  return {
    gewerk,
    bezeichnung: blatt?.bezeichnung || uebersicht?.bezeichnung || g?.name || gewerk,
    firma: blatt?.auftragnehmer ?? '',
    kostenschaetzung: blatt?.kostenschaetzung ?? uebersicht?.schaetzung ?? null,
    kostenanschlag,
    auftraege: blatt?.anschlag.eintraege ?? [],
    kostenfeststellung,
    rechnungen,
    offen: kostenanschlag !== null ? kostenanschlag - (kostenfeststellung ?? 0) : null,
    anteil: kostenanschlag ? ((kostenfeststellung ?? 0) / kostenanschlag) * 100 : null,
    ...(blatt ? { blatt } : {}),
    ...(uebersicht ? { uebersicht } : {}),
    hinweise,
  };
}

/** alle Gewerke: aus Ordnern, Kostenkontrolle und Datensätzen */
export function alleGewerke(kk: Kostenkontrolle | null, gewerke: Gewerk[], datensaetze: RechnungsDatensatz[]): string[] {
  const s = new Set<string>();
  for (const g of gewerke) s.add(g.kennung);
  for (const g of kk?.gewerke ?? []) if (g.gewerk) s.add(g.gewerk);
  for (const z of kk?.uebersicht?.zeilen ?? []) s.add(z.gewerk);
  for (const d of datensaetze) s.add(d.gewerk);
  return [...s].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

/**
 * Vorige Zahlungen eines Gewerks für das Deckblatt („Davon bisher freigegeben“): Rechnungen vor dieser aus der Reihe
 * der Abschlags- und Schlussrechnungen. Einzelrechnungen (Art „R“, z. B. Stundenlohn) gehören nicht dazu;
 * Gutschriften (negative Beträge) zählen mit.
 */
export function vorigeZahlungen(a: GewerkAbrechnung, bisNr?: number | string | null, ohneArten: string[] = ['R']): { text: string; datum?: string; betrag: number }[] {
  const grenze = typeof bisNr === 'number' ? bisNr : Number.POSITIVE_INFINITY;
  const ohne = new Set(ohneArten.map((x) => x.toUpperCase()));
  return a.rechnungen
    .filter((r) => r.betrag !== null && r.betrag !== 0 && !(r.art && ohne.has(r.art.toUpperCase())) && (typeof r.nr !== 'number' || r.nr < grenze))
    .map((r) => ({ text: r.art ? `${r.art} ${r.lfd ?? ''}`.trim() : r.text, datum: r.datum, betrag: r.betrag! }));
}

/** nächste laufende Nummer einer Rechnungsart im Gewerk (AB 1, AB 2 …) */
export function naechsteLfd(a: GewerkAbrechnung, art: string): number {
  const n = a.rechnungen.filter((r) => r.art === art).map((r) => r.lfd ?? 1);
  return n.length ? Math.max(...n) + 1 : 1;
}
