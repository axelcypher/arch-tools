import { describe, expect, it } from 'vitest';
import { pruefeBlatt } from '@core/excel/pruefung';
import { vorlagenZeilen } from '@core/excel/schema';
import { QUADRIO_SCHEMA } from './platzhalterSchema';
import { platzhalterKontext } from './platzhalterTestdaten';

/** Praxisfälle (Struktur nachgebaut, ohne echte Daten) für die Vorlagenprüfung */
describe('Vorlagenprüfung QUADRIO', () => {
  const ctx = platzhalterKontext();
  const pruefe = (spec: (string | null)[][]) => pruefeBlatt(vorlagenZeilen(spec), ctx, { blatt: 'Wohnflächen', schema: QUADRIO_SCHEMA }).map((h) => `${h.ort} ${h.art}: ${h.text}`);

  it('{{#wenn[wofl,s!=0]}} auf oberster Ebene: Filter ohne Felder, Filtername mit Vergleich, Vorschlag', () => {
    expect(pruefe([['{{#wenn[wofl,s!=0]}}x{{/wenn}}']])).toEqual([
      'A1 vergleichsfeld: „s“ ist ein benannter Filter, kein Feld – ohne Vergleich schreiben: [s].',
      'A1 filterfelder: [wofl], [s] prüft Felder, die es auf oberster Ebene (Projektsummen summe.*) nicht gibt – trifft dort nie zu (gehört zu raum). Meinten Sie {{#wenn raum[wofl,s]}}?',
    ]);
    expect(pruefe([['{{#wenn[nrf_s!=0]}}x{{/wenn}}']])).toEqual([]);
  });

  it('Wohnflächen-Vorlage mit Wohnungsblock, R/S und doppelter Klammer', () => {
    const vorlage = [
      ['{{#wohnung}}{{wohnung.name|einmal}}', '{{raum[wofl,r].name}}', '{{raum[wofl,r].flaeche_roh}}', '{{raum[wofl,r].wofl_faktor}}', '{{raum[wofl,r].wofl_roh}}'],
      ['Brutto-Wohnfläche {{wohnung.name|einmal}} gesamt', null, null, null, '=SUM(E1:E1)'],
      ['Abzug 3% Ausbau, Putz etc.', null, null, null, '=-ROUND(E2*0.03,2)'],
      ['{{#wenn raum[[wofl,s!=0]}}'],
      [null, '{{raum[wofl,s].name}}', '{{raum[wofl,s].flaeche_roh}}', '{{raum[wofl,s].wofl_faktor}}', '{{raum[wofl,s].wofl_roh}}'],
      ['Brutto-Wohnfläche (Loggia/Balkon/Terrasse) {{wohnung.name|einmal}} gesamt', null, null, null, '=SUM(E5:E5)'],
      ['{{/wenn}}'],
      ['Netto-Wohnfläche {{wohnung.name|einmal}} gesamt', null, null, null, '=E2+E3+E6'],
      ['{{/wohnung}}'],
    ];
    expect(pruefe(vorlage)).toEqual(['A4 klammern: Eckige Klammern doppelt oder unpaarig – Filter stehen in genau einem Paar: name[filter].feld.']);
    // richtig: nach der WoFlV-Anrechnung, nicht nach R/S
    const richtig = vorlage.map((z) =>
      z.map(
        (c) =>
          c
            ?.replace('raum[[wofl,s!=0]', 'raum[wofl,freisitz]')
            .replace(/wofl,r\]/g, 'wofl,!freisitz]')
            .replace(/wofl,s\]/g, 'wofl,freisitz]') ?? null,
      ),
    );
    expect(pruefe(richtig)).toEqual([]);
  });
});
