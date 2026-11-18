import { describe, expect, it } from 'vitest';
import { autoWerte } from './autofill';
import { felderDerSeite } from './forma/felder';
import { parseFormular } from './forma/formular';
import type { Projektkarte } from './forma/projektkarte';
import { strasseUndNummer } from './forma/projektkarte';
import { mitZusatz } from './zusatz';
import { synthetischesFormular } from './__fixtures__/synthetisch';

const adresse = (gruppe: number, name: string, strasse: string) => [
  { gruppe, id: 40, typ: 1, titel: 'Name/Firma:', text: name, zahl: null },
  { gruppe, id: 70, typ: 1, titel: 'Straße/Nr.:', text: strasse, zahl: null },
];
const karte: Projektkarte = {
  gruppen: [
    { id: 201, typ: 1, text: 'Bauherr' },
    { id: 202, typ: 1, text: 'Entwurfsverfasser' },
  ],
  eintraege: [...adresse(201, 'Mustermann', 'Musterweg 1'), ...adresse(202, 'Architektin Beispiel', 'Planweg 2')],
};

/** Vordruck mit Anschriftenfeld und Antragsteller-Feldern, deren Zuordnung auf den Entwurfsverfasser zeigt */
function formular(kennung: string) {
  const bytes = synthetischesFormular(
    kennung,
    '2025I',
    [
      [
        { name: 'Panel1', titel: 'Anschriftenfeld', felder: [{ art: 'memo', name: 'Memo1', text: 'Absender' }] },
        {
          name: 'Panel6',
          titel: 'Antragsteller/in',
          felder: [
            { art: 'memo', name: 'Memo7', text: 'Name' },
            { art: 'memo', name: 'Memo9', text: 'Straße, Hausnummer' },
          ],
        },
      ],
    ],
    {},
    { 0: ['Memo1=0202aedt040', 'Memo7=0202aedt040', 'Memo9=0202aedt070'] },
  );
  const f = parseFormular(bytes);
  return { f, felder: f.seiten.map((s, i) => felderDerSeite(s, i)) };
}

const werte = (kennung: string) => Object.fromEntries([...autoWerte(formular(kennung).f, formular(kennung).felder, karte)].map(([k, a]) => [k, a.wert]));

describe('Korrektur der Zuordnung zur Projektkarte', () => {
  it('Artenschutz (nw020012): Antragsteller/in aus den Bauherrendaten, nicht vom Entwurfsverfasser', () => {
    expect(werte('nw020012')).toEqual({ '0:Memo1': 'Architektin Beispiel', '0:Memo7': 'Mustermann', '0:Memo9': 'Musterweg 1' });
    const quelle = autoWerte(formular('nw020012').f, formular('nw020012').felder, karte).get('0:Memo7')!.quelle;
    expect(quelle).toBe('Bauherr: Name/Firma');
  });

  it('andere Vordrucke behalten die Zuordnung aus FORMA', () => {
    expect(werte('nw019999')).toEqual({ '0:Memo1': 'Architektin Beispiel', '0:Memo7': 'Architektin Beispiel', '0:Memo9': 'Planweg 2' });
  });
});

describe('Grundstück: Straße und Hausnummer getrennt, PLZ als Ergänzung der App', () => {
  const grundstueck = (plz: string): Projektkarte =>
    mitZusatz(
      {
        gruppen: [{ id: 301, typ: 2, text: 'Baugrundstücksdaten' }],
        eintraege: [
          { gruppe: 301, id: 20, typ: 1, titel: 'Straße/Nr.:', text: 'Musterweg 12 a', zahl: null },
          { gruppe: 301, id: 10, typ: 1, titel: 'Ort:', text: 'Münster', zahl: null },
        ],
      },
      { '301:9010': plz },
    );
  /** Kopf der Baustatistik bzw. das Bauvorhaben im Artenschutz-Vordruck; FORMA verknüpft Straße/Nr. und Ort */
  function vordruck(kennung: string, felder: [string, string][], prokarte: string[]) {
    const f = parseFormular(
      synthetischesFormular(kennung, '2025F', [[{ name: 'Panel1', titel: 'Baugrundstück', felder: felder.map(([name, text]) => ({ art: 'memo' as const, name, text })) }]], {}, { 0: prokarte }),
    );
    return { f, felder: f.seiten.map((x, i) => felderDerSeite(x, i)) };
  }
  const auto = (v: ReturnType<typeof vordruck>, pk: Projektkarte) => Object.fromEntries([...autoWerte(v.f, v.felder, pk)].map(([k, a]) => [k, a.wert]));

  it('„Straße Nr.“ zerlegen', () => {
    expect(strasseUndNummer('Musterweg 12 a')).toEqual({ strasse: 'Musterweg', hausnummer: '12 a' });
    expect(strasseUndNummer('Am Mühlenbach 3-5')).toEqual({ strasse: 'Am Mühlenbach', hausnummer: '3-5' });
    expect(strasseUndNummer('Straße des 17. Juni 112b')).toEqual({ strasse: 'Straße des 17. Juni', hausnummer: '112b' });
    expect(strasseUndNummer('Im Feld')).toEqual({ strasse: 'Im Feld', hausnummer: '' });
  });

  it('Baustatistik (nw010020): Straße und Hausnummer in eigenen Feldern, PLZ eingetragen', () => {
    const v = vordruck(
      'nw010020',
      [
        ['Memo25', 'Straße'],
        ['Memo26', 'Hausnummer'],
        ['Memo27', 'Postleitzahl'],
        ['Memo28', 'Ort'],
      ],
      ['Memo25=0301aedt020', 'Memo28=0301aedt010'],
    );
    expect(auto(v, grundstueck('48143'))).toEqual({ '0:Memo25': 'Musterweg', '0:Memo26': '12 a', '0:Memo27': '48143', '0:Memo28': 'Münster' });
    // ohne PLZ bleibt das Feld leer
    expect(auto(v, grundstueck(''))['0:Memo27']).toBeUndefined();
  });

  it('Bauabgang (nw010022) und Artenschutz (nw020012): PLZ des Grundstücks', () => {
    const abgang = vordruck(
      'nw010022',
      [
        ['Memo5', 'Straße'],
        ['Memo34', 'Hausnummer'],
        ['Memo35', 'Postleitzahl'],
      ],
      ['Memo5=0301aedt020'],
    );
    expect(auto(abgang, grundstueck('48143'))).toEqual({ '0:Memo5': 'Musterweg', '0:Memo34': '12 a', '0:Memo35': '48143' });
    const arten = vordruck(
      'nw020012',
      [
        ['Memo3', 'Straße, Hausnummer'],
        ['Memo4', 'PLZ'],
      ],
      ['Memo3=0301aedt020'],
    );
    expect(auto(arten, grundstueck('48143'))).toEqual({ '0:Memo3': 'Musterweg 12 a', '0:Memo4': '48143' });
  });
});

describe('Baubeschreibung (nw010010): Nr. 2 Art der Nutzung aus der Projektkarte', () => {
  const nutzung = (id: number, text: string) => ({ gruppe: 101, id, typ: 1, titel: 'Art der Nutzung:', text, zahl: null });
  const mitNutzung = (...e: Projektkarte['eintraege']): Projektkarte => ({ gruppen: [{ id: 101, typ: 1, text: 'Projektdaten' }], eintraege: e });
  /** Baubeschreibung mit dem Feld Nr. 2 – mit oder ohne Verknüpfung im Vordruck */
  function baubeschreibung(prokarte: string[] = []) {
    const bytes = synthetischesFormular(
      'nw010010',
      '2024G',
      [[{ name: 'Panel3', titel: 'Art der Nutzung', felder: [{ art: 'memo', name: 'Memo5', text: 'Art der Nutzung' }] }]],
      {},
      prokarte.length ? { 0: prokarte } : {},
    );
    const f = parseFormular(bytes);
    return { f, felder: f.seiten.map((s, i) => felderDerSeite(s, i)) };
  }
  const auto = (pk: Projektkarte, prokarte?: string[]) => {
    const { f, felder } = baubeschreibung(prokarte);
    return autoWerte(f, felder, pk).get('0:Memo5');
  };

  it('Vordruck ohne Verknüpfung: das Feld bekommt den Eintrag „Art der Nutzung“, gleich unter welcher Nummer', () => {
    expect(auto(mitNutzung(nutzung(100, 'Wohnen')))?.wert).toBe('Wohnen');
    expect(auto(mitNutzung(nutzung(370, 'Büro und Verwaltung')))?.wert).toBe('Büro und Verwaltung');
    expect(auto(mitNutzung(nutzung(100, 'Wohnen')))?.quelle).toBe('Projektdaten: Art der Nutzung');
  });

  it('Verknüpfung auf einen Eintrag, den die Projektkarte nicht führt: Ersatz nach Titel', () => {
    expect(auto(mitNutzung(nutzung(100, 'Gastronomie')), ['Memo5=0101aedt090'])?.wert).toBe('Gastronomie');
  });

  it('eine Verknüpfung, die einen vorhandenen Eintrag trifft, gilt weiter – auch wenn er leer ist', () => {
    const pk = mitNutzung(nutzung(100, 'Wohnen'), { gruppe: 101, id: 90, typ: 1, titel: 'Nutzung laut Vordruck:', text: 'Handel', zahl: null });
    expect(auto(pk, ['Memo5=0101aedt090'])?.wert).toBe('Handel');
    expect(auto(mitNutzung(nutzung(100, 'Wohnen'), { gruppe: 101, id: 90, typ: 1, titel: 'Leer:', text: '', zahl: null }), ['Memo5=0101aedt090'])).toBeUndefined();
  });

  it('ohne Eintrag oder ohne Wert bleibt das Feld ohne Auto-Wert', () => {
    expect(auto(mitNutzung())).toBeUndefined();
    expect(auto(mitNutzung(nutzung(100, '')))).toBeUndefined();
  });

  it('nur die Baubeschreibung: andere Vordrucke mit einem Feld „Art der Nutzung“ bleiben bei der Zuordnung aus FORMA', () => {
    const bytes = synthetischesFormular('nw019999', '2025I', [[{ name: 'Panel3', titel: 'Art der Nutzung', felder: [{ art: 'memo', name: 'Memo5', text: 'Art der Nutzung' }] }]]);
    const f = parseFormular(bytes);
    expect(
      autoWerte(
        f,
        f.seiten.map((s, i) => felderDerSeite(s, i)),
        mitNutzung(nutzung(100, 'Wohnen')),
      ).size,
    ).toBe(0);
  });
});
