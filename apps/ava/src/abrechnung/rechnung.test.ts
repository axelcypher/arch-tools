import { PDFDocument } from 'pdf-lib';
import { strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { veraltetePlatzhalter } from '@core/platzhalter';
import { nameBilden, nameErkennen, nameLesen, unbekanntePlatzhalter, VORGABE_MUSTER } from './benennung';
import { VORGABE_MAIL } from '../einstellungen';
import { mailVariablen, MAIL_PROTOKOLL_VARIABLEN } from '../platzhalter';
import { deckblattPdf, deckblattVoranstellen, seitenzahl } from './deckblatt';
import { emlBauen, kopfWert, vorlageFuellen } from './mail';
import { neuePruefung, pruefen, VORGABE_PRUEFUNG } from './pruefung';

describe('Benennung der Rechnungen', () => {
  it('erkennt beide Schreibweisen des Büros', () => {
    expect(nameErkennen('K62 R021 Witthaut 251024 AB1.pdf', VORGABE_MUSTER)).toMatchObject({ kuerzel: 'K62', nr: 21, firma: 'Witthaut', datum: '2025-10-24', art: 'AB', lfd: 1 });
    expect(nameErkennen('K62_R029_Witthaut_251024_SR1.pdf', VORGABE_MUSTER)).toMatchObject({ nr: 29, art: 'SR', lfd: 1 });
    expect(nameErkennen('HVO 261111 1.AB Fa. Tischer.pdf', VORGABE_MUSTER)).toMatchObject({ kuerzel: 'HVO', datum: '2026-11-11', lfd: 1, art: 'AB', firma: 'Tischer' });
    expect(nameErkennen('Angebot Fenster.pdf', VORGABE_MUSTER)).toBeNull();
  });

  it('bildet Dateinamen nach dem Muster und ohne unzulässige Zeichen', () => {
    const w = { kuerzel: 'K62', nr: 53, firma: 'Witthaut', datum: '2026-11-12', art: 'SR', lfd: 4 };
    expect(nameBilden(VORGABE_MUSTER[0], w)).toBe('K62 R053 Witthaut 261112 SR4');
    expect(nameBilden('{Kürzel} {Datum} {Lfd}.{Art} Fa. {Firma}', { ...w, firma: 'Müller/Söhne' })).toBe('HVO'.length && 'K62 261112 4.SR Fa. Müller Söhne');
    expect(nameLesen(`${nameBilden(VORGABE_MUSTER[0], w)}.pdf`, VORGABE_MUSTER[0])).toMatchObject(w);
    // alte Muster ({Kürzel}, {Datum}) bilden und erkennen dasselbe wie die neuen (Gegenprobe)
    const alt = '{Kürzel} R{Nr:3} {Firma} {Datum} {Art}{Lfd}';
    expect(nameBilden(alt, w)).toBe(nameBilden(VORGABE_MUSTER[0], w));
    expect(nameLesen('K62 R053 Witthaut 261112 SR4.pdf', alt)).toEqual(nameLesen('K62 R053 Witthaut 261112 SR4.pdf', VORGABE_MUSTER[0]));
    // weitere globale Variablen: Wert aus der Projektdatei, beim Erkennen beliebiger Text
    expect(nameBilden('{PROJEKT_KUERZEL} {PROJEKT_KURZNAME} {Rechnungsdatum:JJJJ-MM-TT}', w, { PROJEKT_KURZNAME: 'Kita' })).toBe('K62 Kita 2026-11-12');
    expect(nameLesen('K62 Kita 261112 SR4.pdf', '{PROJEKT_KUERZEL} {PROJEKT_KURZNAME} {Rechnungsdatum} {Art}{Lfd}')).toMatchObject({ kuerzel: 'K62', datum: '2026-11-12', art: 'SR', lfd: 4 });
    expect(unbekanntePlatzhalter('{Kürzel} {Foo} {Nr:3}')).toEqual(['{Foo}']);
  });
});

describe('Rechnungsprüfung', () => {
  it('rechnet wie das Deckblatt des Büros (Abschlag mit Einbehalt, Schluss mit Abzug der Abschläge)', () => {
    const ab = pruefen({ ...neuePruefung(VORGABE_PRUEFUNG), forderungNetto: 26110.22, freigabeNetto: 26110.22 });
    expect(ab).toMatchObject({ zwischen1: 26110.22, mwst: 4960.94, brutto: 31071.16, umlage: 155.36, zwischen2: 30915.8, einbehalt: 3091.58, zwischen3: 27824.22, endsumme: 27824.22, zahlung: 27824.22 });
    const sr = pruefen({ ...neuePruefung(VORGABE_PRUEFUNG, { schluss: true }), freigabeNetto: 26110.22, bereits: [{ text: 'AB 1', datum: '2025-10-24', betrag: 27824.22 }] });
    expect(sr).toMatchObject({ einbehalt: 0, endsumme: 30915.8, bereits: 27824.22, zahlung: 3091.58 });
  });
});

describe('Deckblatt', () => {
  it('erzeugt eine Seite und setzt sie vor den Scan', async () => {
    const pdf = await deckblattPdf({
      kuerzel: 'P99',
      vorhaben: 'Neubau Musterhaus',
      vorhabenAdresse: 'Musterweg 1, 12345 Musterstadt',
      empfaenger: 'Frau\nErika Muster\nMusterweg 1\n12345 Musterstadt',
      gewerk: 'G 08',
      firma: 'Fenster Muster',
      zahlungsfreigabe: 'AB 1',
      freigabeDatum: '2025-11-12',
      rechnungsart: 'Abschlagsrechnung',
      rechnungsDatum: '2025-10-24',
      pruefung: { ...neuePruefung(VORGABE_PRUEFUNG), forderungNetto: 26110.22, freigabeNetto: 26110.22 },
      buero: 'Musterbüro GmbH\nArchitekten',
      bearbeiter: 'i.A. Max Muster',
      fusszeile: 'Musterbüro GmbH\nMusterweg 2\tTelefon 0123 456',
    });
    expect(await seitenzahl(pdf)).toBe(1);
    const scan = await PDFDocument.create();
    scan.addPage([841.68, 595.2]);
    scan.addPage([841.68, 595.2]);
    const zusammen = await deckblattVoranstellen(pdf, await scan.save());
    const d = await PDFDocument.load(zusammen);
    expect(d.getPageCount()).toBe(3);
    expect(d.getPage(0).getWidth()).toBeCloseTo(595.28, 1);
    expect(d.getPage(1).getWidth()).toBeCloseTo(841.68, 1);
  });
});

describe('Mailentwurf', () => {
  it('baut eine ungesendete Nachricht mit Anhang und Umlauten', () => {
    const eml = strFromU8(
      emlBauen({ an: ['buchhaltung@example.org'], betreff: 'K62 Rechnung Nr. 53 – Fenster Müller', text: 'Guten Tag,\nanbei die geprüfte Rechnung.', anhaenge: [{ name: 'K62 R053 Müller 261112 SR4.pdf', daten: new Uint8Array([37, 80, 68, 70]) }] }, new Date(2026, 10, 12)),
    );
    expect(eml).toContain('X-Unsent: 1');
    expect(eml).toContain('To: buchhaltung@example.org');
    expect(eml).toMatch(/Subject: =\?UTF-8\?B\?/);
    expect(eml).toContain("filename*=UTF-8''K62%20R053%20M%C3%BCller%20261112%20SR4.pdf");
    expect(eml).toContain('JVBERg=='); // %PDF
    expect(eml.endsWith('--\r\n')).toBe(true);
    expect(kopfWert('Größe')).toBe('=?UTF-8?B?R3LDtsOfZQ==?=');
  });

  it('füllt Vorlagen', () => {
    const w = { PROJEKT_KUERZEL: 'K62', PROJEKT_VORHABEN: 'Neubau', Nr: '53', Firma: 'Witthaut', FirmaMail: 'a@b.de', Rechnungsdatum: '12.11.2026', BEARBEITER: 'TP' };
    expect(vorlageFuellen('{PROJEKT_KUERZEL} – Rechnung {Nr} {Firma}', w)).toBe('K62 – Rechnung 53 Witthaut');
    // gespeicherte Vorlagen mit alten Namen ergeben dasselbe (Gegenprobe)
    expect(vorlageFuellen('{Kürzel} {Projekt} – {Firma-Mail} {Datum} {Bearbeiter}', w)).toBe(vorlageFuellen('{PROJEKT_KUERZEL} {PROJEKT_VORHABEN} – {FirmaMail} {Rechnungsdatum} {BEARBEITER}', w));
    expect(vorlageFuellen('{Kürzel} {Datum}', w)).toBe('K62 12.11.2026');
    // im Protokoll ist {Datum} das Datum der Besprechung; Unbekanntes und Werte anderer Vorlagen bleiben stehen
    expect(vorlageFuellen('Protokoll {Nr} vom {Datum} {Gewerk} {Foo}', { Nr: '3', Protokolldatum: '01.02.2026' }, MAIL_PROTOKOLL_VARIABLEN)).toBe('Protokoll 3 vom 01.02.2026 {Gewerk} {Foo}');
    for (const v of VORGABE_MAIL) expect(veraltetePlatzhalter([v.an, v.betreff, v.text].join(' '), mailVariablen(v.id))).toEqual([]);
  });
});
