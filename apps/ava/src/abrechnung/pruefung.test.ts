import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { musterMappe } from '../__fixtures__/muster';
import { avaAus } from '../avaDaten';
import { empfaengerListe } from './ablauf';
import { artAusText, gewerkAbrechnung, naechsteLfd, vorigeZahlungen } from './aggregat';
import type { Rechnungsart } from './benennung';
import { artTyp, VORGABE_ARTEN } from './benennung';
import { deckblattPdf, MAX_ZAHLUNGEN, zahlungsZeilen } from './deckblatt';
import { kostenkontrolleLesen } from './kostenkontrolle';
import { pdfText } from './pdfText';
import type { PruefVorgaben, VorigeZahlung } from './pruefung';
import { neuePruefung, pruefen, pruefVorschlag, TEXT_EINBEHALT_SCHLUSS, VORGABE_PRUEFUNG } from './pruefung';

const art = (k: string) => VORGABE_ARTEN.find((a) => a.kuerzel === k)!;

describe('Rechnungsart aus dem Text der Rechnungsliste', () => {
  it('liest nur das Kürzel am Ende – Firmennamen mit R am Wortanfang sind keine Rechnung „R“', () => {
    expect(artAusText('Rohbau Muster, AB2')).toEqual({ art: 'AB', lfd: 2 });
    expect(artAusText('Malerei Richter, SR1')).toEqual({ art: 'SR', lfd: 1 });
    expect(artAusText('Fenster Muster TSR 3')).toEqual({ art: 'TSR', lfd: 3 });
    expect(artAusText('Stundenlohn Müller, R')).toEqual({ art: 'R' });
    // Gegenproben: kein Kürzel am Ende
    expect(artAusText('Rohbau Richter')).toEqual({});
    expect(artAusText('Rechnung vom Oktober')).toEqual({});
    expect(artAusText('Abbruch')).toEqual({});
  });

  it('zählt Abschläge aus der Mappe richtig weiter (G08 = G8, „Rohbau Muster, AB1“ ist AB)', async () => {
    const kk = kostenkontrolleLesen(await musterMappe());
    const rohbau = gewerkAbrechnung('G4', kk, null, []);
    expect(rohbau.rechnungen[0]).toMatchObject({ art: 'AB', lfd: 1 });
    expect(naechsteLfd(rohbau, 'AB')).toBe(2);
    // in der Mappe steht „G08“, gefragt wird nach „G8“
    const fenster = gewerkAbrechnung('G8', kk, null, []);
    expect(naechsteLfd(fenster, 'AB')).toBe(2);
    expect(vorigeZahlungen(fenster).map((z) => z.betrag)).toEqual([27824.22]);
    expect(naechsteLfd(fenster, 'SR')).toBe(1);
  });
});

describe('Vorige Zahlungen', () => {
  const a = (rechnungen: { nr: number; art?: string; betrag: number }[]) =>
    ({ rechnungen: rechnungen.map((r) => ({ schluessel: String(r.nr), gewerk: 'G8', text: '', hinweise: [], ...r })) }) as unknown as Parameters<typeof vorigeZahlungen>[0];

  it('nimmt die Abschlags- und Schlussreihe mit Gutschriften, aber keine Einzelrechnungen', () => {
    const z = vorigeZahlungen(
      a([
        { nr: 1, art: 'AB', betrag: 1000 },
        { nr: 2, art: 'R', betrag: 300 },
        { nr: 3, art: 'AB', betrag: -100 },
        { nr: 4, art: 'AB', betrag: 2000 },
      ]),
      4,
    );
    expect(z.map((x) => x.betrag)).toEqual([1000, -100]);
    // Gegenprobe: ohne Ausschluss zählt auch die Einzelrechnung
    expect(
      vorigeZahlungen(
        a([
          { nr: 1, art: 'AB', betrag: 1000 },
          { nr: 2, art: 'R', betrag: 300 },
        ]),
        undefined,
        [],
      ).map((x) => x.betrag),
    ).toEqual([1000, 300]);
  });
});

describe('Vorschlag je Rechnungsart', () => {
  const vorige: VorigeZahlung[] = [{ text: 'AB 1', betrag: 1000 }];
  it('Abschlag: Einbehalt nach Vorgabe, bisherige Zahlungen erst ab der zweiten', () => {
    expect(pruefVorschlag(VORGABE_PRUEFUNG, art('AB'), 1, vorige)).toMatchObject({ einbehaltProzent: 10, bereits: [], einbehaltUnklar: false });
    expect(pruefVorschlag(VORGABE_PRUEFUNG, art('AB'), 2, vorige).bereits).toEqual(vorige);
  });

  it('Schlussrechnung: Sicherheit für Mängelansprüche aus dem LV, sonst Einstellung, sonst nachfragen – nie still 0 als „vereinbart“', () => {
    expect(pruefVorschlag(VORGABE_PRUEFUNG, art('SR'), 1, vorige, 5)).toMatchObject({ einbehaltProzent: 5, einbehaltText: TEXT_EINBEHALT_SCHLUSS, bereits: vorige, einbehaltUnklar: false });
    expect(pruefVorschlag({ ...VORGABE_PRUEFUNG, sicherheitMaengelProzent: 3 }, art('SR'), 1, vorige)).toMatchObject({ einbehaltProzent: 3, einbehaltUnklar: false });
    expect(pruefVorschlag(VORGABE_PRUEFUNG, art('SR'), 1, vorige)).toMatchObject({ einbehaltProzent: 0, einbehaltUnklar: true });
  });

  it('Teilschlussrechnung: kein automatischer Abzug aller Zahlungen, Einbehalt nicht auf 0', () => {
    const v = pruefVorschlag({ ...VORGABE_PRUEFUNG, sicherheitMaengelProzent: 3 }, art('TSR'), 1, vorige);
    expect(v).toMatchObject({ einbehaltProzent: 3, bereits: [] });
    // ältere Einstellungen speichern TSR als Schlussrechnung – gilt trotzdem als Teilschluss
    const alt: Rechnungsart = { kuerzel: 'TSR', name: 'Teilschlussrechnung', schluss: true };
    expect(artTyp(alt)).toBe('teilschluss');
    expect(artTyp(art('SR'))).toBe('schluss');
    expect(pruefVorschlag(VORGABE_PRUEFUNG, art('R'), 1, vorige)).toMatchObject({ bereits: [], einbehaltProzent: 10 });
  });
});

describe('Rechnen', () => {
  it('Reihe AB1 → AB2 → AB3 → SR: Summe der Zahlungsfreigaben = Endsumme der Schlussrechnung', () => {
    const v: PruefVorgaben = { ...VORGABE_PRUEFUNG, sicherheitMaengelProzent: 5 };
    const bezahlt: VorigeZahlung[] = [];
    const reihe: [string, number, number][] = [
      ['AB', 1, 10000],
      ['AB', 2, 25000],
      ['AB', 3, 40000.37],
      ['SR', 1, 50000],
    ];
    let letzte = pruefen(neuePruefung(v));
    for (const [k, lfd, netto] of reihe) {
      const vor = pruefVorschlag(v, art(k), lfd, [...bezahlt]);
      letzte = pruefen({ ...neuePruefung(v, { vorschlag: vor }), freigabeNetto: netto });
      bezahlt.push({ text: `${k} ${lfd}`, betrag: letzte.zahlung });
    }
    const summe = Math.round(bezahlt.reduce((s, z) => s + z.betrag, 0) * 100) / 100;
    expect(summe).toBe(letzte.endsumme);
    expect(letzte.einbehalt).toBeGreaterThan(0);
    // Gegenprobe: ohne Sicherheit wäre die Endsumme um genau den Einbehalt höher
    expect(letzte.endsumme + letzte.einbehalt).toBeCloseTo(letzte.zwischen2, 2);
  });

  it('Nachlass, Skonto und Umlage 0 Schritt für Schritt auf Cent', () => {
    const r = pruefen({ forderungNetto: 10000, freigabeNetto: 10000, nachlassProzent: 3, mwstProzent: 19, umlageProzent: 0, einbehaltProzent: 0, skontoProzent: 2, bereits: [] });
    expect(r).toMatchObject({
      nachlass: 300,
      zwischen1: 9700,
      mwst: 1843,
      brutto: 11543,
      umlage: 0,
      zwischen2: 11543,
      einbehalt: 0,
      skonto: 230.86,
      endsumme: 11312.14,
      zahlung: 11312.14,
      kuerzungNetto: 0,
    });
  });

  it('meldet eine Überzahlung als negative Zahlungsfreigabe', () => {
    const r = pruefen({
      forderungNetto: 1000,
      freigabeNetto: 800,
      nachlassProzent: 0,
      mwstProzent: 19,
      umlageProzent: 0,
      einbehaltProzent: 0,
      skontoProzent: 0,
      bereits: [{ text: 'AB 1', betrag: 1000 }],
    });
    expect(r.endsumme).toBe(952);
    expect(r.zahlung).toBe(-48);
    expect(r.kuerzungNetto).toBe(200);
  });
});

describe('Deckblatt', () => {
  it('fasst mehr als zwölf Zahlungen zusammen, ohne dass die Summe sich ändert', () => {
    const viele = Array.from({ length: 15 }, (_, i) => ({ text: `AB ${i + 1}`, betrag: 1000 + i * 0.01 }));
    const z = zahlungsZeilen(viele);
    expect(z).toHaveLength(MAX_ZAHLUNGEN);
    expect(z[0].text).toBe('AB 1 bis AB 4 (4 Zahlungen)');
    expect(z.reduce((s, x) => s + x.betrag, 0)).toBeCloseTo(
      viele.reduce((s, x) => s + x.betrag, 0),
      2,
    );
    // Gegenprobe: bis zwölf unverändert
    expect(zahlungsZeilen(viele.slice(0, 12))).toEqual(viele.slice(0, 12));
  });

  it('schreibt Namen mit Zeichen außerhalb der Standardschrift (Łukasz, ş, 漢)', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    expect(pdfText('Łukasz Bau', font)).toBe('Lukasz Bau');
    expect(pdfText('Kılıç Yapı ş', font)).toBe('Kiliç Yapi s');
    expect(pdfText('Müller „Haus“ 漢', font)).toBe('Müller „Haus“ ?');
    const pdf = await deckblattPdf({
      kuerzel: 'P99',
      vorhaben: 'Neubau Musterhaus',
      vorhabenAdresse: 'Musterweg 1',
      empfaenger: 'Łukasz Nowak\nul. Długa 1',
      gewerk: 'G 08',
      firma: 'Łukasz Bau sp. z o.o.',
      zahlungsfreigabe: 'SR 1',
      rechnungsart: 'Schlussrechnung 1',
      pruefung: { ...neuePruefung(VORGABE_PRUEFUNG), freigabeNetto: 1000, anmerkung: 'Prüfung durch Đorđe' },
      buero: 'Musterbüro',
      bearbeiter: 'i.A. Max Muster',
    });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });
});

describe('Projektdatei', () => {
  it('behält unbekannte Schlüssel (neuere Version eines Kollegen) und verwirft Ungültiges', () => {
    const a = avaAus({ rechnungen: [], zukunft: { x: 1 }, kostenkontrolle: 42, zahler: 'z@example.org' });
    expect((a as unknown as Record<string, unknown>).zukunft).toEqual({ x: 1 });
    expect(a.kostenkontrolle).toBeUndefined();
    expect(a.zahler).toBe('z@example.org');
    expect(a.maengel).toEqual([]);
    expect(avaAus([1, 2])).toEqual(avaAus({}));
  });
});

describe('Empfänger der Mail', () => {
  it('trennt an Semikolon und Komma, Anzeigenamen mit Komma bleiben zusammen', () => {
    expect(empfaengerListe('a@example.org, b@example.org; c@example.org')).toEqual(['a@example.org', 'b@example.org', 'c@example.org']);
    expect(empfaengerListe('Müller, Hans <h@example.org>; Buchhaltung <b@example.org>')).toEqual(['Müller, Hans <h@example.org>', 'Buchhaltung <b@example.org>']);
    expect(empfaengerListe(' ; ')).toEqual([]);
  });
});
