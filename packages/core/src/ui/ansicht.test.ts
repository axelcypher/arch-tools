import { describe, expect, it } from 'vitest';
import { abschnittVerschieben, ansichtAus, felderDerAnsicht, feldEntfernen, feldHinzufuegen, feldVerschieben } from './ansicht';
import { einfuegeStelle } from './ziehen';

const a = { abschnitte: [{ id: 'a', titel: 'Bauherr', felder: ['201:40', '201:30'] }, { id: 'b', titel: 'Grundstück', felder: ['301:10'] }] };

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

  it('Einfügestelle nach den Mitten der Zeilen, ohne die gezogene', () => {
    const zeile = (top: number) => ({ getBoundingClientRect: () => ({ top, height: 20 }) }) as unknown as HTMLElement;
    const zeilen = [zeile(0), zeile(20), zeile(40)];
    expect(einfuegeStelle(zeilen, 5)).toBe(0);
    expect(einfuegeStelle(zeilen, 35)).toBe(2);
    expect(einfuegeStelle(zeilen, 35, 0)).toBe(1);
    expect(einfuegeStelle(zeilen, 99, 2)).toBe(2);
  });
});
