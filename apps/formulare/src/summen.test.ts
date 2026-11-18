import { describe, expect, it } from 'vitest';
import { ganzeZahl, herkunft, rechne, SUMMEN, summenHinweise, summenNachAenderung } from './summen';

const KFZ = SUMMEN.nw010010.slice(0, 2);
const werte = (w: Record<string, string>) => (s: string) => w[s] ?? '';
const titel = (s: string) => ({ '0:Memo12': 'in Garagen', '0:Memo13': 'im Freien', '0:Memo14': 'auf dem Baugrundstück' })[s] ?? s;

describe('Summenfelder: Rechnen', () => {
  it('ganze Zahlen mit Leerzeichen und Tausenderpunkt; anderes ist keine Zahl', () => {
    expect(ganzeZahl('3')).toBe(3);
    expect(ganzeZahl(' 3 ')).toBe(3);
    expect(ganzeZahl('1 000')).toBe(1000);
    expect(ganzeZahl('1\u00a0000')).toBe(1000);
    expect(ganzeZahl('1.000')).toBe(1000);
    expect(ganzeZahl('12.345.678')).toBe(12345678);
    expect(ganzeZahl('')).toBeNull();
    expect(ganzeZahl('  ')).toBeNull();
    // Leerzeichen innen nur als Tausendertrennung: „2 3“ ist keine 23; gemischte Trennung und zu große Zahlen auch nicht
    for (const x of ['ca. 3', '2-3', '1,5', '1.5', '-1', 'drei', '2 3', '12 34', '1 2 3', '1.000 000', '99999999999999999999']) expect(ganzeZahl(x), x).toBeNaN();
  });

  it('alle Teile leer: Summe leer; ein Teil gefüllt: leere zählen als 0; Unsinn: keine Summe', () => {
    expect(rechne(['a', 'b'], werte({}))).toEqual({ wert: '', ungueltig: [] });
    expect(rechne(['a', 'b'], werte({ a: '3' }))).toEqual({ wert: '3', ungueltig: [] });
    expect(rechne(['a', 'b'], werte({ a: '3', b: '0' }))).toEqual({ wert: '3', ungueltig: [] });
    expect(rechne(['a', 'b'], werte({ a: '2', b: ' 4 ' }))).toEqual({ wert: '6', ungueltig: [] });
    expect(rechne(['a', 'b'], werte({ a: '2', b: 'ca. 3' }))).toEqual({ wert: '', ungueltig: ['b'] });
  });

  it('Stellplätze: Baugrundstück aus Garagen und Freiem, insgesamt darauf aufbauend – Kfz und Fahrrad mit derselben Regel', () => {
    expect(SUMMEN.nw010010).toEqual([
      { ziel: '0:Memo14', teile: ['0:Memo12', '0:Memo13'] },
      { ziel: '0:Memo17', teile: ['0:Memo14', '0:Memo15', '0:Memo16'] },
      { ziel: '1:Memo5', teile: ['1:Memo3', '1:Memo4'] },
      { ziel: '1:Memo8', teile: ['1:Memo5', '1:Memo6', '1:Memo7'] },
    ]);
    const vorher = { '0:Memo12': '', '0:Memo13': '', '0:Memo14': '', '0:Memo15': '1', '0:Memo16': '', '0:Memo17': '1' };
    const nachher = { ...vorher, '0:Memo12': '2', '0:Memo13': '3' };
    const neu = summenNachAenderung(
      KFZ,
      (s) => vorher[s as keyof typeof vorher],
      (s) => nachher[s as keyof typeof nachher],
    );
    expect(Object.fromEntries(neu)).toEqual({ '0:Memo14': '5', '0:Memo17': '6' });
  });

  it('neu gerechnet wird nur, wenn sich ein Teil ändert – eine abweichende Summe aus der Datei bleibt sonst stehen', () => {
    const datei = { '0:Memo12': '2', '0:Memo13': '3', '0:Memo14': '7', '0:Memo15': '', '0:Memo16': '1', '0:Memo17': '8' };
    const get = (w: Record<string, string>) => (s: string) => w[s];
    expect(summenNachAenderung(KFZ, get(datei), get(datei)).size).toBe(0);
    // Ablösung geändert: nur „insgesamt“ neu – aus der eingetragenen Summe auf dem Baugrundstück
    expect(Object.fromEntries(summenNachAenderung(KFZ, get(datei), get({ ...datei, '0:Memo16': '2' })))).toEqual({ '0:Memo17': '9' });
    // Garagen geändert: beide neu
    expect(Object.fromEntries(summenNachAenderung(KFZ, get(datei), get({ ...datei, '0:Memo12': '1' })))).toEqual({ '0:Memo14': '4', '0:Memo17': '5' });
    // alle Teile geleert: Summen leer
    const leer = { '0:Memo12': '', '0:Memo13': '', '0:Memo14': '5', '0:Memo15': '', '0:Memo16': '', '0:Memo17': '5' };
    expect(Object.fromEntries(summenNachAenderung(KFZ, get({ ...leer, '0:Memo13': '3', '0:Memo12': '2' }), get(leer)))).toEqual({ '0:Memo14': '', '0:Memo17': '' });
    // Unsinn in einem Teil: die Summe wird leer, nie falsch
    expect(Object.fromEntries(summenNachAenderung(KFZ, get(datei), get({ ...datei, '0:Memo12': '2-3' })))).toEqual({ '0:Memo14': '', '0:Memo17': '1' });
  });

  it('Teile wieder wie in der Datei (Rückgängig): die Summe der Datei gilt wieder – außer sie wurde neu berechnet', () => {
    const datei = { '0:Memo12': '2', '0:Memo13': '3', '0:Memo14': '7', '0:Memo15': '', '0:Memo16': '', '0:Memo17': '7' };
    const get = (w: Record<string, string>) => (s: string) => w[s];
    const geaendert = { ...datei, '0:Memo12': '4', '0:Memo14': '7', '0:Memo17': '7' };
    // Teil zurück auf den Dateiwert: Summen wie in der Datei (hier unverändert 7 – also keine neuen Werte)
    const zurueck = summenNachAenderung(KFZ, get({ ...geaendert, '0:Memo14': '7' }), get(datei), get(datei));
    expect(zurueck.size).toBe(0);
    const ausGerechnet = summenNachAenderung(KFZ, get({ ...datei, '0:Memo12': '4', '0:Memo14': '7' }), get({ ...datei, '0:Memo14': '7' }), get(datei));
    expect(ausGerechnet.size).toBe(0);
    // nach „Neu berechnen“ (Summe im Verlauf): es wird gerechnet
    const neu = summenNachAenderung(KFZ, get({ ...datei, '0:Memo12': '4', '0:Memo14': '7' }), get({ ...datei, '0:Memo14': '5' }), get(datei), new Set(['0:Memo14']));
    expect(Object.fromEntries(neu)).toEqual({ '0:Memo17': '5' });
    const neu2 = summenNachAenderung(KFZ, get({ ...datei, '0:Memo12': '4', '0:Memo14': '6' }), get({ ...datei, '0:Memo14': '6' }), get(datei), new Set(['0:Memo14']));
    expect(neu2.get('0:Memo14')).toBe('5');
  });

  it('Felder, die es im Formular nicht gibt, bleiben unberührt', () => {
    expect(
      summenNachAenderung(
        KFZ,
        () => undefined,
        () => undefined,
      ).size,
    ).toBe(0);
  });
});

describe('Summenfelder: Hinweise und Herkunft', () => {
  it('Herkunft nennt die Teile – kurz ohne den gemeinsamen Anfang bis zu einem Wortende', () => {
    expect(herkunft(KFZ[0], titel)).toBe('Summe aus „in Garagen“ und „im Freien“');
    expect(herkunft(KFZ[1], (s) => s)).toBe('Summe aus „0:Memo14“, „0:Memo15“ und „0:Memo16“');
    const lang = (s: string) =>
      ({
        '0:Memo12': 'Stellplätze auf dem Baugrundstück: in Garagen',
        '0:Memo13': 'Stellplätze auf dem Baugrundstück: im Freien',
        '0:Memo14': 'Stellplätze insgesamt auf dem Baugrundstück',
        '0:Memo15': 'Stellplätze auf fremdem Grundstück mit Baulast',
        '0:Memo16': 'Stellplätze durch Ablösung',
      })[s] ?? s;
    expect(herkunft(KFZ[0], lang, true)).toBe('Summe aus „in Garagen“ und „im Freien“');
    expect(herkunft(KFZ[1], lang, true)).toBe('Summe aus „insgesamt auf dem Baugrundstück“, „auf fremdem Grundstück mit Baulast“ und „durch Ablösung“');
    expect(herkunft(KFZ[0], lang)).toBe('Summe aus „Stellplätze auf dem Baugrundstück: in Garagen“ und „Stellplätze auf dem Baugrundstück: im Freien“');
  });

  it('Teil keine ganze Zahl: Hinweis an Teil und Summe', () => {
    const h = summenHinweise([KFZ[0]], werte({ '0:Memo12': 'ca. 3', '0:Memo14': '' }), titel);
    expect(h).toEqual([{ art: 'hinweis', text: '„in Garagen“ („ca. 3“): bitte als ganze Zahl eintragen – „auf dem Baugrundstück“ wird erst dann berechnet.', felder: ['0:Memo12', '0:Memo14'] }]);
  });

  it('eingetragene Summe weicht ab (z. B. von Hand in einer älteren Fassung): Hinweis mit beiden Werten', () => {
    const h = summenHinweise([KFZ[0]], werte({ '0:Memo12': '2', '0:Memo13': '3', '0:Memo14': '7' }), titel);
    expect(h).toHaveLength(1);
    expect(h[0].felder).toEqual(['0:Memo14']);
    expect(h[0].text).toBe('„auf dem Baugrundstück“: eingetragen ist 7, die Angaben ergeben 5. „Neu berechnen“ am Feld übernimmt die Summe.');
    expect(summenHinweise([KFZ[0]], werte({ '0:Memo14': '4' }), titel)[0].text).toContain('die Angaben ergeben keine Summe (alle leer)');
  });

  it('kein Hinweis, wenn die Summe stimmt (auch mit Leerzeichen) oder alles leer ist', () => {
    expect(summenHinweise([KFZ[0]], werte({ '0:Memo12': '2', '0:Memo13': '3', '0:Memo14': ' 5' }), titel)).toEqual([]);
    expect(summenHinweise([KFZ[0]], werte({}), titel)).toEqual([]);
    expect(summenHinweise([KFZ[0]], () => undefined, titel)).toEqual([]);
  });
});
