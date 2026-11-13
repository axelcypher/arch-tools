// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { VORGABE_NAMENSSCHEMA } from '@core/namensschema';
import type { DokZustand } from './antragStore';
import { dateienVon, dokumentZu } from './antragStore';
import { unterlagenReihenfolge } from './components/UnterlagenVorschau';
import { plansatzPruefen } from './plansatz';

const datei = (pfad: string) => ({ pfad, ordner: false, groesse: 1, geaendert: 1 });

describe('Unterlagen: Dateien den Dokumenten des Antragsumfangs zuordnen', () => {
  const plaene = [datei('A BAUA 261111 GP-01 Grundriss.pdf'), datei('A BAUA 261111 GP-02 Schnitt.pdf'), datei('A BAUA 261111 GP01-02 Plansatz.pdf')];
  const antrag = datei('A BAUA 261111 01 Bauantrag.pdf');
  const dokumente: DokZustand[] = [
    { eintrag: { id: 'bauantrag', titel: 'Bauantrag', art: 'intern' }, status: 'aktuell', formular: null, datei: antrag, quelle: null },
    { eintrag: { id: 'plaene', titel: 'Bauzeichnungen', art: 'plansatz' }, status: 'aktuell', formular: null, datei: null, quelle: null, plansatz: plansatzPruefen(plaene, [], VORGABE_NAMENSSCHEMA) },
  ];

  it('ein Plansatz umfasst jede seiner Plandateien (ein Satz nur einmal)', () => {
    expect(dateienVon(dokumente[0])).toEqual(['A BAUA 261111 01 Bauantrag.pdf']);
    expect(dateienVon(dokumente[1]).sort()).toEqual(['A BAUA 261111 GP-01 Grundriss.pdf', 'A BAUA 261111 GP-02 Schnitt.pdf']);
    expect(dokumentZu(dokumente, 'a baua 261111 gp-02 schnitt.pdf')?.eintrag.titel).toBe('Bauzeichnungen');
    expect(dokumentZu(dokumente, 'Notiz.txt')).toBeUndefined();
  });

  it('Vorschau: Pläne an der Stelle des Plansatzes, nicht hinter allen anderen Dateien', () => {
    const reihe = unterlagenReihenfolge([datei('Notiz.txt'), ...plaene, antrag], dokumente.flatMap(dateienVon)).map((d) => d.pfad);
    expect(reihe.indexOf('A BAUA 261111 01 Bauantrag.pdf')).toBe(0);
    expect(reihe.indexOf('A BAUA 261111 GP-01 Grundriss.pdf')).toBeLessThan(reihe.indexOf('Notiz.txt'));
    expect(reihe.indexOf('A BAUA 261111 GP-02 Schnitt.pdf')).toBeLessThan(reihe.indexOf('Notiz.txt'));
  });
});
