import { describe, expect, it } from 'vitest';
import {
  abschnittVerschieben,
  ansichtAus,
  feldBreite,
  felderDerAnsicht,
  feldEntfernen,
  feldHinzufuegen,
  feldOptionen,
  feldOptionenSetzen,
  feldVerschieben,
  abschnittEntfernen,
  verknuepfen,
  verknuepfteFelder,
  verknuepfungLoesen,
} from './ansicht';
import { einfuegeStelle } from './ziehen';

const a = {
  abschnitte: [
    { id: 'a', titel: 'Bauherr', felder: ['201:40', '201:30'] },
    { id: 'b', titel: 'Grundstück', felder: ['301:10'] },
  ],
};

describe('eigene Ansichten', () => {
  it('liest robust: ungültige Einträge weg, doppelte Felder und Kennungen bereinigt', () => {
    expect(ansichtAus(null)).toBeNull();
    expect(ansichtAus({ abschnitte: [] })).toBeNull();
    expect(ansichtAus({ abschnitte: [{ id: 'x', titel: 1, felder: ['a', 'a', 3, ''] }, { id: 'x', felder: 'nein' }, 'kaputt'] })).toEqual({
      abschnitte: [
        { id: 'x', titel: '', felder: ['a'] },
        { id: 'x_', titel: '', felder: [] },
      ],
    });
  });

  it('Felder hinzufügen, entfernen und verschieben – auch zwischen Abschnitten, jedes Feld nur einmal', () => {
    expect(felderDerAnsicht(feldHinzufuegen(a, 'b', '201:40'))).toEqual(['201:30', '301:10', '201:40']);
    expect(feldEntfernen(a, '201:30').abschnitte[0].felder).toEqual(['201:40']);
    expect(feldVerschieben(a, '201:40', 'a', 1).abschnitte[0].felder).toEqual(['201:30', '201:40']);
    expect(feldVerschieben(a, '301:10', 'a', 0).abschnitte.map((x) => x.felder)).toEqual([['301:10', '201:40', '201:30'], []]);
    expect(abschnittVerschieben(a, 'b', 0).abschnitte.map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('Beschriftung, Breite und neue Zeile je Feld – bleiben beim Verschieben, entfallen beim Entfernen', () => {
    let b = feldOptionenSetzen(a, '201:40', { label: 'Bauherrschaft', breite: 8 });
    b = feldOptionenSetzen(b, '201:30', { neueZeile: true });
    expect(feldOptionen(b, '201:40')).toEqual({ label: 'Bauherrschaft', breite: 8 });
    expect(feldBreite(feldOptionen(b, '201:40'), undefined)).toBe(8);
    expect(feldBreite(undefined, { breit: true })).toBe(12);
    expect(feldBreite(undefined, {})).toBe(4);
    b = feldVerschieben(b, '201:40', 'b', 0);
    expect(b.abschnitte[1].optionen).toEqual({ '201:40': { label: 'Bauherrschaft', breite: 8 } });
    expect(b.abschnitte[0].optionen).toEqual({ '201:30': { neueZeile: true } });
    // leere Beschriftung entfällt
    expect(feldOptionen(feldOptionenSetzen(b, '201:40', { label: ' ' }), '201:40')).toEqual({ breite: 8 });
    expect(feldEntfernen(b, '201:40').abschnitte[1].optionen).toBeUndefined();
    // robust gelesen
    expect(ansichtAus({ abschnitte: [{ id: 'x', felder: ['f'], optionen: { f: { label: 'L', breite: 'breit', neueZeile: 'ja' }, fremd: { label: 'x' } } }] })).toEqual({
      abschnitte: [{ id: 'x', titel: '', felder: ['f'], optionen: { f: { label: 'L' } } }],
    });
    // Breiten: nur die angebotenen (¼ ⅓ ½ ⅔ ¾ ganz) – andere auf die nächste gebracht
    const breite = (b: unknown) => ansichtAus({ abschnitte: [{ id: 'x', felder: ['f'], optionen: { f: { breite: b } } }] })!.abschnitte[0].optionen?.f.breite;
    expect([5, 7, 10, 11, 99, 1, 6].map(breite)).toEqual([4, 6, 9, 12, 12, 3, 6]);
  });

  it('Verknüpfungen: Gruppen verschmelzen, lösen, entfallen mit dem Feld; auch Felder außerhalb, eins muss in der Ansicht stehen', () => {
    let b = verknuepfen(a, '201:40', '301:10');
    b = verknuepfen(b, '201:30', '201:40');
    expect(b.verknuepfungen).toEqual([['201:30', '201:40', '301:10']]);
    expect(verknuepfteFelder(b, '301:10')).toEqual(['201:30', '201:40']);
    expect(verknuepfungLoesen(b, '201:30').verknuepfungen).toEqual([['201:40', '301:10']]);
    expect(feldEntfernen(verknuepfungLoesen(b, '201:30'), '301:10').verknuepfungen).toBeUndefined();
    expect(
      ansichtAus({
        ...b,
        verknuepfungen: [
          ['201:40', 'ausserhalb'],
          ['201:30', '301:10', '201:30'],
          ['nur-aussen-1', 'nur-aussen-2'],
        ],
      })!.verknuepfungen,
    ).toEqual([
      ['201:40', 'ausserhalb'],
      ['201:30', '301:10'],
    ]);
    // mit einem Feld außerhalb verknüpft: bleibt, solange das eigene in der Ansicht steht
    const c = verknuepfen(a, '201:40', 'ausserhalb');
    expect(c.verknuepfungen).toEqual([['201:40', 'ausserhalb']]);
    expect(feldEntfernen(c, '201:40').verknuepfungen).toBeUndefined();
    // die Gruppe hängt am einzigen Feld der Ansicht: Abschnitt entfernt bzw. es gelöst – sie entfällt
    const d = verknuepfen(verknuepfen(a, '201:40', 'aussen-1'), '201:40', 'aussen-2');
    expect(d.verknuepfungen).toEqual([['201:40', 'aussen-1', 'aussen-2']]);
    expect(abschnittEntfernen(d, d.abschnitte.find((x) => x.felder.includes('201:40'))!.id).verknuepfungen).toBeUndefined();
    expect(verknuepfungLoesen(d, '201:40').verknuepfungen).toBeUndefined();
    // ein Feld außerhalb gelöst: die übrigen bleiben verknüpft
    expect(verknuepfungLoesen(d, 'aussen-1').verknuepfungen).toEqual([['201:40', 'aussen-2']]);
  });

  it('Einfügestelle nach den Mitten der Zeilen, ohne die gezogene', () => {
    const zeile = (top: number) => ({ getBoundingClientRect: () => ({ top, height: 20 }) }) as unknown as HTMLElement;
    const zeilen = [zeile(0), zeile(20), zeile(40)];
    expect(einfuegeStelle(zeilen, 5)).toBe(0);
    expect(einfuegeStelle(zeilen, 35)).toBe(2);
    expect(einfuegeStelle(zeilen, 35, 0)).toBe(1);
    expect(einfuegeStelle(zeilen, 99, 2)).toBe(2);
  });
});
