import { describe, expect, it } from 'vitest';
import { autoWerte } from './autofill';
import { felderDerSeite } from './forma/felder';
import { parseFormular } from './forma/formular';
import type { Projektkarte } from './forma/projektkarte';
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
