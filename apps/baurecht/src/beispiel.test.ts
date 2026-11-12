/**
 * Beispielprojekt: Einfamilienhaus in der Soester Altstadt (Neubau, vereinfachtes Verfahren). Prüft die Auswertung
 * mit dem echten Regelpaket; mit BEISPIEL_OAP=<Pfad> wird die Projektdatei zum Ausprobieren geschrieben.
 */
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { writeArchive } from '@core/archive';
import { projektdateiAendern } from '@core/projektdatei';
import { createOutline, createProject, createRoom, createStorey } from '@core/model';
import type { Project } from '@core/model';
import { paketAusDateien } from '@core/baurecht/paket';
import { pruefstandBerechnen } from './pruefung';

const rechteck = (b: number, t: number) => [
  { x: 0, y: 0 },
  { x: b, y: 0 },
  { x: b, y: t },
  { x: 0, y: t },
];

export function beispielProjekt(): Project {
  const p = createProject('EFH Musterweg');
  p.meta.projektcode = '2611';
  p.meta.kurzname = 'EFH Musterweg';
  p.meta.vorhaben = 'Neubau eines Einfamilienhauses';
  p.meta.adresse = { strasse: 'Musterweg 1', plz: '59494', ort: 'Soest' };
  p.meta.grundstueck = { gemarkung: 'Soest', flur: '12', flurstueck: '345', flaeche: 520 };
  p.meta.bearbeiter = 'TP';
  p.meta.koordinaten = { epsg: 25832, ost: 438091, nord: 5713737, lat: 51.5713, lon: 8.1067, adresse: 'Musterweg 1, 59494 Soest', quelle: 'Beispiel', stand: '2026-11-12', genauigkeit: 'adresse' };
  p.storeys = ['EG', 'OG'].map((n) => {
    const s = createStorey(n, 2.9);
    const r = createRoom(rechteck(9.4, 7.4), `${n === 'EG' ? 0 : 1}.01`, n === 'EG' ? 'Wohnen' : 'Schlafen');
    r.wofl = { kategorie: 'voll', wohnung: 'WE 01' };
    s.shapes = [createOutline(rechteck(10, 8)), r];
    return s;
  });
  return p;
}

export function beispielOap(): Uint8Array {
  const leer = writeArchive(beispielProjekt(), { app: 'Baurecht' });
  return (
    projektdateiAendern(leer, (roh) => ({
      ...roh,
      formulare: {
        aktiveFassung: 'BAUA 1',
        antraege: { 'BAUA 1': { angelegt: '2026-11-01', merkmale: { Gebäudeart: 'Einfamilienhaus', Vorhaben: 'Errichtung', Verfahren: 'vereinfachtes Verfahren', Planungsrecht: 'Innenbereich', Sonderbau: 'nein', Gebäudeklasse: '1' } } },
      },
    })) ?? leer
  );
}

const dateien = import.meta.glob(['../../../packages/baurecht-regeln/module/**/*.json', '../../../packages/baurecht-regeln/texte/**/*.json'], { eager: true, import: 'default' });

describe('Beispiel: Einfamilienhaus in der Soester Altstadt', () => {
  it('wertet mit dem echten Regelpaket aus (ohne Texte: kein falsches Grün aus geänderten Texten)', () => {
    const paket = paketAusDateien(dateien, 'test');
    const merkmale = { Gebäudeart: 'Einfamilienhaus', Vorhaben: 'Errichtung', Verfahren: 'vereinfachtes Verfahren', Planungsrecht: 'Innenbereich', Sonderbau: 'nein', Gebäudeklasse: '1' };
    const s = pruefstandBerechnen(paket, beispielProjekt(), merkmale, { 'lage.ags': { wert: '05974040', herkunft: 'manuell', sicherheit: 'sicher' } }, {}, '2026-12-01', {});
    expect(s.module.map((m) => m.id)).toContain('bund');
    expect(s.auswertung.paragrafen.length).toBeGreaterThan(0);
    // ohne abgerufene Texte ist nichts grün, das an einer Prüfsumme hängt
    for (const p of s.auswertung.paragrafen) if (p.ampel === 'gruen' && p.regel) expect(p.gruende.join(' ')).not.toMatch(/Text der Norm nicht verfügbar/);
    if (process.env.BEISPIEL_OAP) writeFileSync(process.env.BEISPIEL_OAP, beispielOap());
  });
});
