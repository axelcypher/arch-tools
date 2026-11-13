import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Gewerk } from '../projekt';
import { gewerkAbrechnung, naechsteLfd, vorigeZahlungen } from './aggregat';
import { nameErkennen, VORGABE_MUSTER } from './benennung';
import { kostenkontrolleLesen } from './kostenkontrolle';

function gewerkMit(dateien: string[]): Gewerk {
  return {
    kennung: 'G8',
    ordner: 'G08 Fenster',
    pfad: 'Gewerke/G08 Fenster',
    name: 'Fenster',
    lvs: [],
    auftrag: [],
    korrespondenz: [],
    sonstige: [],
    rechnungen: dateien.map((name) => ({ pfad: `Gewerke/G08 Fenster/Auftrag/${name}`, name, groesse: 1, geaendert: 1, archiv: false, erkannt: nameErkennen(name, VORGABE_MUSTER)! })),
  };
}

const REF_ORDNER = join(__dirname, '../../../../.ref');
const KK = existsSync(REF_ORDNER) ? readdirSync(REF_ORDNER).find((n) => /kostenkontrolle.*\.xlsx$/i.test(n)) : undefined;

describe.skipIf(!KK)('Abrechnung eines Gewerks aus echter Kostenkontrolle und Auftragsordner', () => {
  it('führt Rechnungsliste, Gewerkblatt und PDFs zusammen und meldet Abweichungen', () => {
    const kk = kostenkontrolleLesen(new Uint8Array(readFileSync(join(REF_ORDNER, KK!))));
    const g = gewerkMit(['K62 R021 Musterbau 251024 AB1.pdf', 'K62 R022 Musterbau 251027 AB2.pdf', 'K62 R029 Musterbau 251024 SR1.pdf', 'K62 R030 Musterbau 251027 SR2.pdf']);
    const a = gewerkAbrechnung('G8', kk, g, []);
    const nr = (n: number) => a.rechnungen.find((r) => r.nr === n)!;
    expect(nr(21).datei?.name).toBe('K62 R021 Musterbau 251024 AB1.pdf');
    expect(nr(29).datei?.name).toBe('K62 R029 Musterbau 251024 SR1.pdf');
    expect(nr(29).betrag).toBeCloseTo(3091.58, 2);
    expect(nr(29).blatt).toBeDefined();
    // im Gewerkblatt stehen SR1–SR3 mit den Nummern 23–25
    expect(nr(29).hinweise.join(' ')).toContain('Im Gewerkblatt mit Nr. 23');
    expect(nr(31).hinweise).toContain('Keine PDF im Auftragsordner gefunden.');
    expect(a.firma).toBe('Musterbau');
    expect(naechsteLfd(a, 'SR')).toBe(4);
    expect(vorigeZahlungen(a, 29).map((z) => z.betrag)).toEqual(expect.arrayContaining([27824.22, 5418.8]));
  });
});
