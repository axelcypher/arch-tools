import { writeArchive } from '@core/archive';
import { createProject } from '@core/model';
import { projektdateiRoh } from '@core/projektdatei';
import { strFromU8 } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { musterMappe } from '../__fixtures__/muster';
import { avaAus } from '../avaDaten';
import { SpeicherDateien } from '../dateien';
import { VORGABE } from '../einstellungen';
import { projektLesen } from '../projekt';
import type { Kontext } from './ablauf';
import { kkLaden, mailEntwurf, rechnungErfassen, scanAblegen } from './ablauf';
import { neuePruefung, VORGABE_PRUEFUNG } from './pruefung';

const P = '/server/Projekte/P99 Musterhaus';
const SCANS = '/server/Scans';

async function aufbau() {
  const fs = new SpeicherDateien();
  const projekt = createProject('Musterhaus');
  projekt.meta = { ...projekt.meta, projektcode: 'P99', vorhaben: 'Neubau Musterhaus', adresse: { strasse: 'Musterweg 1', plz: '12345', ort: 'Musterstadt' }, bauherr: { name: 'Muster', vorname: 'Erika', adresse: { strasse: 'Musterweg 1', plz: '12345', ort: 'Musterstadt' }, kontakte: [{ art: 'email', wert: 'erika@example.org' }] }, bearbeiter: 'Max Muster' };
  fs.setze(P, 'Organisation/P99 Musterhaus.oap', writeArchive(projekt));
  fs.setze(P, 'Kosten/P99 260519 Kostenkontrolle AKTUELL.xlsx', await musterMappe());
  fs.setze(P, 'Kosten/Archiv/P99 250101 Kostenkontrolle.xlsx', await musterMappe());
  fs.setze(P, 'Gewerke/G08 Fenster/P99 250317 LV Fenster.aslv', new Uint8Array([1]));
  fs.setze(P, 'Gewerke/G08 Fenster/Auftrag/P99 R002 Fenster Muster 251024 AB1.pdf', new Uint8Array([2]));
  fs.setze(P, 'Gewerke/G08 Fenster/Auftrag/Auftrag Fenster Muster.pdf', new Uint8Array([3]));
  fs.setze(P, 'Gewerke/G08 Fenster/Korrespondenz/AW Termin.eml', new Uint8Array([4]));
  fs.setze(P, 'Gewerke/G04 Rohbau/Archiv/P99 240101 LV Rohbau.aslv', new Uint8Array([5]));
  const scan = await PDFDocument.create();
  scan.addPage([595, 842]);
  fs.setze(SCANS, 'Scan_20261112_093000.pdf', await scan.save());
  const k: Kontext = { fs, ordner: P, oap: 'Organisation/P99 Musterhaus.oap', meta: projekt.meta, projektName: 'Musterhaus', e: { ...VORGABE, scan: { ...VORGABE.scan, ordner: SCANS } } };
  return { fs, k };
}

describe('Projekt einlesen', () => {
  it('findet Gewerke, LV-Dateien, Rechnungen, Korrespondenz und die aktuelle Kostenkontrolle', async () => {
    const { fs, k } = await aufbau();
    const s = await projektLesen(fs, P, k.e);
    expect(s.gewerke.map((g) => [g.kennung, g.name])).toEqual([
      ['G4', 'Rohbau'],
      ['G8', 'Fenster'],
    ]);
    const g8 = s.gewerke[1];
    expect(g8.lvs.map((l) => l.name)).toEqual(['P99 250317 LV Fenster.aslv']);
    expect(g8.rechnungen.map((r) => r.erkannt.nr)).toEqual([2]);
    expect(g8.auftrag.map((d) => d.name)).toEqual(['Auftrag Fenster Muster.pdf']);
    expect(g8.korrespondenz.map((d) => d.name)).toEqual(['AW Termin.eml']);
    expect(s.gewerke[0].lvs[0].archiv).toBe(true);
    expect(s.kostenkontrolle?.pfad).toBe('Kosten/P99 260519 Kostenkontrolle AKTUELL.xlsx');
  });
});

describe('Rechnungsprüfung von der Erfassung bis zur Mail', () => {
  it('vergibt die Nummer, trägt ein, legt den Scan ab und öffnet den Mailentwurf', async () => {
    const { fs, k } = await aufbau();
    const s = await projektLesen(fs, P, k.e);
    const kkPfad = s.kostenkontrolle!.pfad;
    const pruefung = { ...neuePruefung(VORGABE_PRUEFUNG, { schluss: true }), forderungNetto: 26110.22, freigabeNetto: 26110.22, bereits: [{ text: 'AB 1', datum: '2025-10-24', betrag: 27824.22 }] };
    const r = await rechnungErfassen(k, kkPfad, { gewerk: 'G8', firma: 'Fenster Muster', art: 'SR', lfd: 1, rechnungsdatum: '2025-10-24', freigabe: '2026-01-22', pruefung }, new Date(2026, 0, 22));
    expect(r.datensatz).toMatchObject({ nr: 3, betrag: 3091.58, status: 'erfasst' });
    const kk = (await kkLaden(fs, P, kkPfad)).kk;
    expect(kk.rechnungsliste!.rechnungen.at(-1)).toMatchObject({ nr: 3, text: 'Fenster Muster, SR1', betrag: 3091.58, gewerk: 'G8' });
    expect(avaAus(projektdateiRoh((await fs.lies(P, k.oap))!.daten).ava).rechnungen).toHaveLength(1);
    // Scan ablegen, mit Deckblatt davor
    const abgelegt = await scanAblegen(k, r.datensatz, s.gewerke[1], { ordner: SCANS, datei: 'Scan_20261112_093000.pdf' }, { deckblatt: true });
    expect(abgelegt.pfad).toBe('Gewerke/G08 Fenster/Auftrag/P99 R003 Fenster Muster 251024 SR1.pdf');
    expect(await fs.lies(SCANS, 'Scan_20261112_093000.pdf')).toBeNull();
    const pdf = await PDFDocument.load((await fs.lies(P, abgelegt.pfad))!.daten);
    expect(pdf.getPageCount()).toBe(2);
    // Mail an den Zahler
    const d = abgelegt.ava.rechnungen[0];
    const ava = await mailEntwurf(k, d, abgelegt.ava, k.e.mail.vorlagen[0], new Date(2026, 0, 22));
    expect(fs.mails).toHaveLength(1);
    const eml = strFromU8(fs.mails[0].eml);
    expect(eml).toContain('To: erika@example.org');
    expect(eml).toContain('Content-Disposition: attachment;');
    expect(ava.rechnungen[0].status).toBe('versendet');
  });
});
