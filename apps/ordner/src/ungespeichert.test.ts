import { describe, expect, it } from 'vitest';
import { ORDNERSTRUKTUR, STAMMDATEN, TROCKENLAUF_AUSWAHL, satzUngespeichert } from './ungespeichert';

describe('Satz für ungespeicherte Änderungen (design.md „Ungespeicherte Änderungen“)', () => {
  it('ein Gegenstand: Einzahl bzw. Mehrzahl, großer Anfang, Punkt', () => {
    expect(satzUngespeichert([ORDNERSTRUKTUR])).toBe('Die Ordnerstruktur hat ungespeicherte Änderungen.');
    expect(satzUngespeichert([STAMMDATEN])).toBe('Die Stammdaten haben ungespeicherte Änderungen.');
    expect(satzUngespeichert([TROCKENLAUF_AUSWAHL])).toBe('Die Auswahl im Trockenlauf hat ungespeicherte Änderungen.');
  });

  it('mehrere Gegenstände: mit „und“ bzw. Komma verbunden, immer „haben“', () => {
    expect(satzUngespeichert([ORDNERSTRUKTUR, TROCKENLAUF_AUSWAHL])).toBe('Die Ordnerstruktur und die Auswahl im Trockenlauf haben ungespeicherte Änderungen.');
    expect(satzUngespeichert([ORDNERSTRUKTUR, STAMMDATEN, TROCKENLAUF_AUSWAHL])).toBe('Die Ordnerstruktur, die Stammdaten und die Auswahl im Trockenlauf haben ungespeicherte Änderungen.');
  });

  it('nichts ungespeichert: kein eigener Satz (allgemeiner Rückfall)', () => {
    expect(satzUngespeichert([])).toBeUndefined();
  });
});
