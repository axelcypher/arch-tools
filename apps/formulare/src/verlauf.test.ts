import { describe, expect, it } from 'vitest';
import type { Verlauf, Wert } from './verlauf';
import { MAX_SCHRITTE, ZUSAMMENFASSEN_MS, eintragen, eintragenMehrere, kannRueckgaengig, kannWiederholen, leererVerlauf, springe, verlaufAus } from './verlauf';

/** Werte nach Anwenden eines Sprungs auf einen Ausgangsstand */
function anwenden(werte: Record<string, Wert>, v: Verlauf, ziel: number) {
  const r = springe(v, ziel);
  return { verlauf: r.verlauf, werte: { ...werte, ...Object.fromEntries(r.werte) } };
}

describe('Verlauf', () => {
  it('fasst Weitertippen im selben Feld zu einem Schritt zusammen', () => {
    let v = leererVerlauf();
    v = eintragen(v, '0:Memo1', '', 'M', 1000);
    v = eintragen(v, '0:Memo1', 'M', 'Mu', 1500);
    v = eintragen(v, '0:Memo1', 'Mu', 'Mus', 2000);
    expect(v.schritte).toEqual([{ zeit: 2000, aenderungen: [{ feld: '0:Memo1', vorher: '', nachher: 'Mus' }] }]);
    // nach einer Pause oder in einem anderen Feld beginnt ein neuer Schritt
    v = eintragen(v, '0:Memo1', 'Mus', 'Must', 2000 + ZUSAMMENFASSEN_MS);
    v = eintragen(v, '0:Memo2', '', 'x', 2000 + ZUSAMMENFASSEN_MS + 10);
    expect(v.schritte).toHaveLength(3);
    expect(v.position).toBe(3);
  });

  it('Zurücktippen auf den alten Wert entfernt den Schritt', () => {
    let v = eintragen(leererVerlauf(), 'a', 'x', 'xy', 0);
    v = eintragen(v, 'a', 'xy', 'x', 100);
    expect(v).toEqual({ schritte: [], position: 0 });
  });

  it('Kästchen werden nie zusammengefasst', () => {
    let v = eintragen(leererVerlauf(), 'k', false, true, 0);
    v = eintragen(v, 'k', true, false, 10);
    expect(v.schritte).toHaveLength(2);
  });

  it('springt rückwärts und vorwärts und setzt je Feld den richtigen Wert', () => {
    let v = leererVerlauf();
    v = eintragen(v, 'a', '', '1', 0);
    v = eintragen(v, 'b', false, true, 5000);
    v = eintragen(v, 'a', '1', '2', 10000);
    let stand: Record<string, Wert> = { a: '2', b: true };

    ({ verlauf: v, werte: stand } = anwenden(stand, v, 2));
    expect(stand).toEqual({ a: '1', b: true });
    ({ verlauf: v, werte: stand } = anwenden(stand, v, 0));
    expect(stand).toEqual({ a: '', b: false });
    expect(kannRueckgaengig(v)).toBe(false);
    expect(kannWiederholen(v)).toBe(true);
    ({ verlauf: v, werte: stand } = anwenden(stand, v, 3));
    expect(stand).toEqual({ a: '2', b: true });
  });

  it('eine neue Eingabe verwirft die wiederherstellbaren Schritte', () => {
    let v = eintragen(eintragen(leererVerlauf(), 'a', '', '1', 0), 'b', '', '2', 5000);
    v = springe(v, 1).verlauf;
    v = eintragen(v, 'c', '', '3', 10000);
    expect(v.schritte.map((s) => s.aenderungen[0].feld)).toEqual(['a', 'c']);
    expect(kannWiederholen(v)).toBe(false);
  });

  it('mehrere Felder in einem Schritt (Ausfüllen) werden gemeinsam zurückgenommen', () => {
    let v = eintragen(leererVerlauf(), 'a', '', 'x', 0);
    v = eintragenMehrere(v, [
      { feld: 'a', vorher: 'x', nachher: 'Muster' },
      { feld: 'b', vorher: '', nachher: 'Weg 1' },
      { feld: 'c', vorher: 'gleich', nachher: 'gleich' },
    ], 'Aus Projektkarte ausgefüllt', 100);
    expect(v.schritte[1]).toMatchObject({ titel: 'Aus Projektkarte ausgefüllt', aenderungen: [{ feld: 'a' }, { feld: 'b' }] });
    // danach weitertippen verlängert den Sammelschritt nicht
    v = eintragen(v, 'b', 'Weg 1', 'Weg 12', 200);
    expect(v.schritte).toHaveLength(3);
    expect(Object.fromEntries(springe(v, 1).werte)).toEqual({ a: 'x', b: '' });
  });

  it('behält höchstens MAX_SCHRITTE Schritte', () => {
    let v = leererVerlauf();
    for (let i = 0; i < MAX_SCHRITTE + 20; i++) v = eintragen(v, `f${i}`, '', 'x', i * 10000);
    expect(v.schritte).toHaveLength(MAX_SCHRITTE);
    expect(v.schritte[0].aenderungen[0].feld).toBe('f20');
  });

  it('liest gespeicherte Verläufe und verwirft Unbrauchbares', () => {
    const v = eintragen(leererVerlauf(), 'a', '', '1', 0);
    expect(verlaufAus(JSON.parse(JSON.stringify(v)))).toEqual(v);
    expect(verlaufAus({ schritte: [{ zeit: 1, aenderungen: [{ feld: 'a', vorher: {}, nachher: '' }] }, 'kaputt'], position: 7 })).toEqual({ schritte: [], position: 0 });
    expect(verlaufAus(null)).toEqual(leererVerlauf());
  });
});
