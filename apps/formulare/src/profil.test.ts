import { describe, expect, it } from 'vitest';
import type { Abschnitt, Feld } from './forma/felder';
import type { FormularProfil } from './profil';
import { ausGruppe, ausgefuellt, bereinigt, einheiten, einheitTitel, gruppeBilden, istLeer, leeresProfil } from './profil';

/** Feld an einer Stelle auf dem Papier (nur was die Zählung braucht) */
const feld = (name: string, art: 'text' | 'kreuz', y: number, x = 0): Feld =>
  ({ schluessel: `0:${name}`, seite: 0, name, art, beschriftung: name, abschnitt: 'A', kasten: { x, y, b: 20, h: 14 }, einzeilig: true, original: '' }) as unknown as Feld;

// ein Textfeld, darunter eine Mehrfachauswahl über drei Zeilen und ein zweites Textfeld
const name = feld('Name', 'text', 0);
const k1 = feld('Massiv', 'kreuz', 20);
const k2 = feld('Holz', 'kreuz', 40);
const k3 = feld('Stahl', 'kreuz', 60);
const ort = feld('Ort', 'text', 80);
const abschnitt: Abschnitt = { titel: 'A', felder: [name, k1, k2, k3, ort], rahmen: null };

const werte: Record<string, string | boolean> = { '0:Name': 'Muster', '0:Holz': true };
const wert = (f: Feld) => werte[f.schluessel] ?? (f.art === 'kreuz' ? false : '');
const zaehlung = (p: FormularProfil) => {
  const e = einheiten(abschnitt, p);
  return `${e.filter((x) => ausgefuellt(x, wert)).length}/${e.length}`;
};

describe('Formularprofil: Gruppen', () => {
  it('ohne Gruppen zählt jede Zeile mit Kästchen für sich', () => {
    expect(zaehlung(leeresProfil())).toBe('2/5');
  });

  it('eine Gruppe zählt als eine Angabe – je nach Regel', () => {
    const p = gruppeBilden(leeresProfil(), ['0:Massiv', '0:Holz', '0:Stahl']);
    expect(zaehlung(p)).toBe('2/3');
    // in Lesereihenfolge: die Gruppe steht zwischen Name und Ort
    expect(einheiten(abschnitt, p).map((e) => einheitTitel(e, p))).toEqual(['Name', 'Massiv / Holz / Stahl', 'Ort']);
    expect(zaehlung({ ...p, gruppen: [{ ...p.gruppen![0], regel: 'alle' }] })).toBe('1/3');
    expect(zaehlung({ ...p, gruppen: [{ ...p.gruppen![0], regel: 'nie' }] })).toBe('1/2');
  });

  it('eigene Namen für Gruppen und Felder; ausgenommene Felder in einer Gruppe zählen trotzdem mit ihr', () => {
    let p = gruppeBilden(leeresProfil(), ['0:Massiv', '0:Holz']);
    p = { ...p, gruppen: [{ ...p.gruppen![0], titel: 'Bauart' }], feldTitel: { '0:Ort': 'Baugrundstück' }, zaehlt: { '0:Massiv': false } };
    expect(einheiten(abschnitt, p).map((e) => einheitTitel(e, p))).toEqual(['Name', 'Bauart', 'Stahl', 'Baugrundstück']);
  });

  it('ein Feld gehört höchstens zu einer Gruppe; leere Gruppen entfallen', () => {
    let p = gruppeBilden(leeresProfil(), ['0:Massiv', '0:Holz']);
    p = gruppeBilden(p, ['0:Holz', '0:Stahl']);
    expect(p.gruppen!.map((g) => [g.id, g.felder])).toEqual([
      ['g1', ['0:Massiv']],
      ['g2', ['0:Holz', '0:Stahl']],
    ]);
    p = ausGruppe(p, '0:Massiv');
    expect(p.gruppen!.map((g) => g.id)).toEqual(['g2']);
    // neue Kennung kollidiert nicht mit einer vorhandenen
    expect(gruppeBilden(p, ['0:Name', '0:Ort']).gruppen!.map((g) => g.id)).toEqual(['g2', 'g3']);
  });

  it('bereinigt: leere Titel und Gruppen fallen weg, doppelte Felder bleiben bei der ersten Gruppe', () => {
    const p: FormularProfil = {
      abschnitte: {},
      zaehlt: { '0:Name': true },
      feldTitel: { '0:Name': '  ', '0:Ort': ' Grundstück ' },
      gruppen: [
        { id: 'g1', titel: ' Bauart ', regel: 'eins', felder: ['0:Massiv', '0:Holz'] },
        { id: 'g2', regel: 'alle', felder: ['0:Holz'] },
        { id: 'g3', regel: 'unbekannt' as 'eins', felder: ['0:Stahl'] },
      ],
    };
    expect(bereinigt(p)).toEqual({
      abschnitte: {},
      zaehlt: {},
      feldTitel: { '0:Ort': 'Grundstück' },
      gruppen: [
        { id: 'g1', titel: 'Bauart', regel: 'eins', felder: ['0:Massiv', '0:Holz'] },
        { id: 'g3', regel: 'eins', felder: ['0:Stahl'] },
      ],
    });
    expect(istLeer(bereinigt({ ...leeresProfil(), feldTitel: { '0:Name': '' }, gruppen: [{ id: 'g1', regel: 'eins', felder: [] }] }))).toBe(true);
  });
});
