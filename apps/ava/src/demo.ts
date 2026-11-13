/**
 * Nur in der Entwicklung (npm run dev:ava, Adresse mit ?demo): ein erfundenes Projekt im Speicher, damit sich die
 * Oberfläche ohne Desktop-App und ohne echte Projektordner ansehen lässt. Gehört nicht in den Web-Build.
 */

import { writeArchive } from '@core/archive';
import { createProject } from '@core/model';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { musterLv, musterMappe } from './__fixtures__/muster';
import { emlBauen } from './abrechnung/mail';
import { SpeicherDateien } from './dateien';
import { VORGABE } from './einstellungen';
import { aslvNeu } from './format/aslv';
import { useAva } from './store';

const P = '/demo/P99 Musterhaus';
const SCANS = '/demo/Scans';

async function pdf(text: string, quer = false) {
  const d = await PDFDocument.create();
  const s = d.addPage(quer ? [842, 595] : [595, 842]);
  const f = await d.embedFont(StandardFonts.Helvetica);
  s.drawText(text, { x: 60, y: quer ? 500 : 760, size: 18, font: f });
  return d.save();
}

export async function demoLaden() {
  const fs = new SpeicherDateien();
  const p = createProject('Musterhaus');
  p.meta = {
    ...p.meta,
    projektcode: 'P99',
    vorhaben: 'Neubau Musterhaus',
    adresse: { strasse: 'Musterweg 1', plz: '12345', ort: 'Musterstadt' },
    bauherr: { name: 'Muster', vorname: 'Erika', adresse: { strasse: 'Musterweg 1', plz: '12345', ort: 'Musterstadt' }, kontakte: [{ art: 'email', wert: 'erika@example.org' }] },
    bearbeiter: 'Max Muster',
    koordinaten: { epsg: 25832, ost: 0, nord: 0, lat: 51.57, lon: 8.1, adresse: 'Musterweg 1, 12345 Musterstadt', quelle: 'nominatim', stand: '2026-11-12' } as never,
  };
  fs.setze(P, 'Organisation/P99 Musterhaus.oap', writeArchive(p));
  fs.setze(P, 'Kosten/P99 260519 Kostenkontrolle AKTUELL.xlsx', await musterMappe());
  fs.setze(P, 'Gewerke/G08 Fenster/P99 250317 LV Fenster.aslv', aslvNeu(musterLv()));
  fs.setze(P, 'Gewerke/G08 Fenster/Auftrag/P99 R002 Fenster Muster 251024 AB1.pdf', await pdf('Rechnung AB1 Fenster Muster', true));
  fs.setze(P, 'Gewerke/G08 Fenster/Auftrag/Auftrag Fenster Muster.pdf', await pdf('Auftrag Fenster Muster'));
  fs.setze(P, 'Gewerke/G08 Fenster/Korrespondenz/AW Montagetermin.eml', emlBauen({ von: 'Fenster Muster <info@example.org>', an: ['bauleitung@example.org'], betreff: 'AW: Montagetermin EG', text: 'Guten Tag,\n\nwir bestätigen die Montage am Montag ab 7 Uhr.\n\nGrüße', anhaenge: [] }, new Date(2025, 9, 20, 9, 12)));
  fs.setze(P, 'Gewerke/G04 Rohbau/Auftrag/Auftrag Rohbau.pdf', await pdf('Auftrag Rohbau'));
  fs.setze(SCANS, 'Scan_20261112_093000.pdf', await pdf('Rechnung SR1 Fenster Muster – gestempelt Nr. 3', true));
  useAva.setState({ fs, einstellungen: { ...VORGABE, scan: { ...VORGABE.scan, ordner: SCANS }, deckblatt: { ...VORGABE.deckblatt, buero: 'Musterbüro Architekten GmbH\nMusterplatz 2, 12345 Musterstadt' } } });
  await useAva.getState().projektOeffnen({ ordner: P, oap: 'Organisation/P99 Musterhaus.oap', name: 'Musterhaus', meta: p.meta });
}
