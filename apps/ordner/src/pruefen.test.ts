import { describe, expect, it } from 'vitest';
import { nameAus } from './nummer';
import { ausserhalbDerStruktur, pruefe } from './pruefung';
import { berichtCsv, sammelCsv } from './sammel';
import type { ProjektAngaben } from './stammdaten';
import { leereStammdaten } from './stammdaten';
import type { Struktur } from './struktur';
import { STANDARD } from './struktur';

/** Struktur mit dem Jahr im Ordnernamen und in einem Ordner */
const MIT_JAHR: Struktur = {
  ...STANDARD,
  name: 'Mit Jahr',
  ordnername: '{PROJEKT_KUERZEL} {JAHR_KURZ} {PROJEKT_KURZNAME}',
  ordner: [{ pfad: '00 Projekt' }, { pfad: 'Archiv {JAHR}' }, { pfad: 'Archiv {JAHR}/Post' }],
};

const angaben = (angelegt: string): ProjektAngaben => ({ ...leereStammdaten(), nummer: 'MUS', kurzname: 'Haus', leistungsphasen: [1, 2, 3, 4], angelegt, struktur: '', dateischema: '' });
const ordner = (...pfade: string[]) => pfade.map((pfad) => ({ pfad, ordner: true, groesse: 0 }));

describe('Prüfen ohne Anlagedatum', () => {
  it('leeres Jahr lässt {JAHR} und {JAHR_KURZ} stehen – nicht „“ bzw. „00“', () => {
    expect(nameAus('{PROJEKT_KUERZEL} {JAHR_KURZ} x {JAHR}', { nummer: 'A', jahr: '' })).toBe('A {JAHR_KURZ} x {JAHR}');
    // Gegenprobe: mit Jahr wie bisher
    expect(nameAus('{PROJEKT_KUERZEL} {JAHR_KURZ} x {JAHR}', { nummer: 'A', jahr: '2024' })).toBe('A 24 x 2024');
  });

  it('Ordner und Ordnername mit {JAHR} sind nicht beurteilbar und werden nicht angelegt', () => {
    const r = pruefe('MUS 24 Haus', ordner('00 Projekt', 'Archiv 2024', 'Archiv 2024/Post'), MIT_JAHR, angaben(''));
    expect(r.fehlendeOrdner).toEqual([]);
    expect(r.befunde.some((b) => b.titel.includes('Ordnername weicht'))).toBe(false);
    expect(r.befunde.find((b) => b.titel === 'Ordnername nicht beurteilbar')?.art).toBe('hinweis');
    expect(r.befunde.find((b) => b.titel.includes('nicht beurteilbar') && b.pfade)?.pfade).toEqual(['Archiv {JAHR}', 'Archiv {JAHR}/Post']);
    // der vorhandene Jahresordner gilt nicht als „außerhalb der Struktur“
    expect(r.befunde.some((b) => b.titel.includes('nicht in der Struktur'))).toBe(false);
    // ohne den Ordner: trotzdem nichts Falsches anzulegen
    expect(pruefe('MUS 24 Haus', ordner('00 Projekt'), MIT_JAHR, angaben('')).fehlendeOrdner).toEqual([]);
  });

  it('Gegenprobe: mit Anlagedatum wird verglichen und angelegt', () => {
    const r = pruefe('MUS 24 Haus', ordner('00 Projekt'), MIT_JAHR, angaben('2026-03-01'));
    expect(r.fehlendeOrdner).toEqual(['Archiv 2026', 'Archiv 2026/Post']);
    expect(r.befunde.find((b) => b.aktion === 'ordnerAnlegen')?.pfade).toEqual(['Archiv 2026', 'Archiv 2026/Post']);
    expect(r.befunde.some((b) => b.titel.includes('Ordnername weicht'))).toBe(true);
    expect(r.befunde.some((b) => b.titel.includes('nicht beurteilbar'))).toBe(false);
  });

  it('außerhalb der Struktur: unbekanntes Jahr passt auf Ziffern, nicht auf beliebigen Text', () => {
    const { fremd } = ausserhalbDerStruktur(MIT_JAHR, ordner('Archiv 2023', 'Archiv alt', 'Archiv 2023/Post', 'Archiv 2023/Sonstiges'), { nummer: 'MUS', jahr: '' });
    expect(fremd).toEqual(['Archiv alt', 'Archiv 2023/Sonstiges']);
  });
});

describe('CSV', () => {
  it('Text mit = + - @ am Anfang wird nicht als Formel ausgeführt', () => {
    const csv = sammelCsv([{ projekt: '=HYPERLINK("x")', pfad: '@Pfad', abweichungen: 1, fehler: 0, projektdatei: true, laengsterPfad: 12, lesefehler: '-kaputt' }]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")";1;0;ja;12;'@Pfad;'-kaputt`);
    const bericht = berichtCsv({ befunde: [{ art: 'hinweis', titel: 'T', pfade: ['+Ordner', 'Normal'] }], fehlendeOrdner: [], ordner: 0, dateien: 0, falscheMails: [] });
    expect(bericht).toContain("Hinweis;T;;'+Ordner");
    // Gegenprobe: gewöhnliche Werte bleiben unverändert
    expect(bericht).toContain('Hinweis;T;;Normal');
  });
});
