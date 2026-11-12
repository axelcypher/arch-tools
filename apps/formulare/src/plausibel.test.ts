/**
 * Plausibilität (U-04, U-05, R-03) an synthetischen Formularen mit den Vorgaben und Prüfregeln der App.
 */
import { describe, expect, it } from 'vitest';
import { nw010001Leer, synthetischesFormular } from './__fixtures__/synthetisch';
import { felderDerSeite } from './forma/felder';
import { parseFormular } from './forma/formular';
import { plausibilitaet } from './plausibel';
import type { FormularProfil } from './profil';
import { ausgefuellt, einheiten, formularKontext, REGELN } from './profil';
import { abschnitte } from './forma/felder';
import { VORGABEN } from './vorgaben';
import { PRUEFREGELN } from './vorgaben/pruefregeln';

function pruefen(bytes: Uint8Array, schluessel: string, merkmale: Record<string, string> = {}, profil: FormularProfil = VORGABEN[schluessel]) {
  const f = parseFormular(bytes);
  const felder = f.seiten.map((s, i) => felderDerSeite(s, i));
  const wert = (x: { original: string | boolean }) => x.original;
  return plausibilitaet(felder, profil, formularKontext(merkmale, felder.flat(), wert), wert, PRUEFREGELN[schluessel]);
}

describe('Plausibilität', () => {
  it('Regel „genau eine“: zählt wie „eine genügt“, mehr als eine Angabe ist ein Widerspruch (U-04)', () => {
    expect(REGELN.map((r) => r.id)).toContain('genau');
    const bytes = nw010001Leer({ '0:CheckBox1': true, '0:CheckBox2': true });
    const felder = parseFormular(bytes).seiten.map((s, i) => felderDerSeite(s, i));
    const antrag = abschnitte(felder[0]).find((a) => a.felder.some((x) => x.name === 'CheckBox1'))!;
    const e = einheiten(antrag, VORGABEN['nw010001|2026I']).find((x) => x.gruppe?.id === 'v:antragsart')!;
    expect(e.gruppe!.regel).toBe('genau');
    expect(ausgefuellt(e, (x) => x.original)).toBe(true);
    const m = pruefen(bytes, 'nw010001|2026I');
    expect(m).toEqual([
      {
        art: 'fehler',
        text: '„Bauantrag oder Antrag auf Vorbescheid“: mehr als eine Angabe angekreuzt – bitte nur eine wählen.',
        felder: ['0:CheckBox1', '0:CheckBox2'],
        abschnitt: '0:Panel3',
      },
    ]);
    expect(pruefen(nw010001Leer({ '0:CheckBox1': true }), 'nw010001|2026I')).toEqual([]);
  });

  it('mehrere Gebäudeklassen: nur ein Hinweis, kein Widerspruch (U-04)', () => {
    const m = pruefen(nw010001Leer({ '0:CheckBox4': true, '0:CheckBox6': true }), 'nw010001|2026I');
    expect(m.map((x) => [x.art, x.text])).toEqual([['hinweis', 'Mehrere Gebäudeklassen angekreuzt – umfasst der Antrag mehrere Gebäude?']]);
  });

  it('Art des Gebäudes („alle zutreffenden“) mehrfach angekreuzt: keine Meldung', () => {
    const bytes = synthetischesFormular(
      'nw010002',
      '2026I',
      [
        [
          {
            name: 'Panel8',
            titel: 'Gebäudeklasse und Art des Gebäudes',
            felder: [
              { art: 'kreuz', name: 'CheckBox27', text: 'Wohngebäude' },
              { art: 'kreuz', name: 'CheckBox26', text: 'Sonderbau' },
              { art: 'kreuz', name: 'CheckBox24', text: 'Garage' },
            ],
          },
        ],
      ],
      { '0:CheckBox27': true, '0:CheckBox26': true, '0:CheckBox24': true },
    );
    expect(pruefen(bytes, 'nw010002|2026I')).toEqual([]);
  });

  it('Genehmigungsfreistellung: ja und nein zugleich ist ein Widerspruch; Sonderbau ja ergibt einen Hinweis (U-04, R-03)', () => {
    const bytes = synthetischesFormular(
      'nw010005',
      '2026I',
      [
        [
          {
            name: 'Panel6',
            titel: 'Behandlung als Bauantrag',
            felder: [
              { art: 'kreuz', name: 'CheckBox1', text: 'ja' },
              { art: 'kreuz', name: 'CheckBox2', text: 'nein' },
            ],
          },
        ],
      ],
      { '0:CheckBox1': true, '0:CheckBox2': true },
    );
    const m = pruefen(bytes, 'nw010005|2026I', { Sonderbau: 'ja' });
    expect(m.map((x) => x.art)).toEqual(['fehler', 'hinweis']);
    expect(m[1].text).toContain('Sonderbauten (außer Solaranlagen) sind von der Genehmigungsfreistellung ausgeschlossen (§ 63 Abs. 1 Satz 2 BauO NRW 2018)');
    expect(m[1].quellen).toEqual([{ gesetz: 'bauo-nrw', paragraf: '63', absatz: 1, satz: 2 }]);
    expect(pruefen(bytes, 'nw010005|2026I', { Sonderbau: 'nein' }).map((x) => x.art)).toEqual(['fehler']);
  });

  it('Abweichung zwischen Antragsmerkmal und Formular (U-05)', () => {
    const m = pruefen(nw010001Leer({ '0:CheckBox4': true }), 'nw010001|2026I', { Gebäudeklasse: '3' });
    expect(m).toEqual([{ art: 'hinweis', text: 'Projekt: GK 3, Formular: GK 1', felder: ['0:CheckBox4'], abschnitt: '0:Panel8' }]);
    // passt oder leer: nichts
    expect(pruefen(nw010001Leer({ '0:CheckBox6': true }), 'nw010001|2026I', { Gebäudeklasse: '3' })).toEqual([]);
    expect(pruefen(nw010001Leer(), 'nw010001|2026I', { Gebäudeklasse: '3' })).toEqual([]);
  });
});
