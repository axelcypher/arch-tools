import { describe, expect, it } from 'vitest';
import { ASSISTENT_ANGABEN, ORDNERSTRUKTUR, satzUngespeichert, type Gegenstand } from './ungespeichert';

describe('Satz für ungespeicherte Änderungen (design.md „Ungespeicherte Änderungen“)', () => {
  it('ein Gegenstand: Einzahl bzw. Mehrzahl, großer Anfang, Punkt', () => {
    expect(satzUngespeichert([ORDNERSTRUKTUR])).toBe('Die Ordnerstruktur hat ungespeicherte Änderungen.');
    expect(satzUngespeichert([ASSISTENT_ANGABEN])).toBe('Die Angaben im Assistenten haben ungespeicherte Änderungen.');
  });

  it('mehrere Gegenstände: mit „und“ bzw. Komma verbunden, immer „haben“', () => {
    expect(satzUngespeichert([ORDNERSTRUKTUR, ASSISTENT_ANGABEN])).toBe('Die Ordnerstruktur und die Angaben im Assistenten haben ungespeicherte Änderungen.');
    const weitere: Gegenstand = { text: 'die Vorlage' };
    expect(satzUngespeichert([ORDNERSTRUKTUR, weitere, ASSISTENT_ANGABEN])).toBe('Die Ordnerstruktur, die Vorlage und die Angaben im Assistenten haben ungespeicherte Änderungen.');
  });

  it('nichts ungespeichert: kein eigener Satz (allgemeiner Rückfall)', () => {
    expect(satzUngespeichert([])).toBeUndefined();
  });
});
