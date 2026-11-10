import { describe, expect, it } from 'vitest';
import type { AutoWert, FormularZustand } from './autofill';
import { aktualisierung, beimIgnorieren, nachUebernahme, zustaendeAus, zustandBeimSpeichern } from './autofill';
import type { Feld } from './forma/felder';

const feld = (name: string): Feld => ({ schluessel: `0:${name}`, seite: 0, name, art: 'text', beschriftung: name, einzeilig: true, original: '' }) as unknown as Feld;
const F = { name: feld('Name'), ort: feld('Ort'), strasse: feld('Strasse'), plz: feld('PLZ'), gk: feld('GK') };
const auto = (werte: Partial<Record<keyof typeof F, string>>) =>
  new Map<string, AutoWert>(Object.entries(werte).map(([k, w]) => [F[k as keyof typeof F].schluessel, { feld: F[k as keyof typeof F], wert: w!, quelle: 'Bauherr' }]));

describe('Autofill mit Zustand', () => {
  it('aktualisieren: Auto-Werte und leere Felder ja, Überschreibungen und Unbekanntes nicht – Ausgefülltes wird nie geleert', () => {
    const werte: Record<string, string> = { '0:Name': 'Müller, Anna', '0:Ort': 'Altstadt', '0:Strasse': '', '0:PLZ': 'eigene Angabe', '0:GK': ' ' };
    const zustand: FormularZustand = { felder: { '0:Name': { auto: 'Müller, Anna' }, '0:PLZ': { auto: '12345' }, '0:Ort': { auto: 'Altstadt', manuell: 'Altstadt' } } };
    const schritte = aktualisierung(auto({ name: 'Müller-Lang, Anna', ort: 'Neustadt', strasse: 'Hauptstr. 1', plz: '54321', gk: 'x' }), (f) => werte[f.schluessel], zustand);
    expect(schritte.map((s) => [s.feld.name, s.art, s.vorgewaehlt])).toEqual([
      ['Name', 'auto', true],
      ['Ort', 'manuell', false],
      ['Strasse', 'leer', true],
      ['PLZ', 'unbekannt', false],
      // ein Leerzeichen: erzwungen leer
      ['GK', 'manuell', false],
    ]);
    // nichts in der Projektkarte: kein Vorschlag (Felder werden nicht geleert); gleicher Wert: nichts zu tun
    expect(aktualisierung(auto({ name: 'Müller,  Anna' }), (f) => werte[f.schluessel], zustand)).toEqual([]);
  });

  it('ohne Zustand: ein Feld mit dem alten Wert der Projektkarte gilt als Auto-Wert', () => {
    const werte: Record<string, string> = { '0:Name': 'Müller, Anna', '0:Ort': 'Von Hand' };
    const alt = auto({ name: 'Müller, Anna', ort: 'Altstadt' });
    const schritte = aktualisierung(auto({ name: 'Lang, Anna', ort: 'Neustadt' }), (f) => werte[f.schluessel], undefined, alt);
    expect(schritte.map((s) => [s.feld.name, s.art])).toEqual([
      ['Name', 'auto'],
      ['Ort', 'unbekannt'],
    ]);
  });

  it('übernommene Auto-Werte merken; im Ignorieren-Modus bleibt die Überschreibung gemerkt', () => {
    const a = auto({ name: 'Lang, Anna', ort: 'Neustadt' });
    const werte: Record<string, string> = { '0:Name': 'Müller, Anna', '0:Ort': 'Neustadt' };
    const z = nachUebernahme({ felder: { '0:Name': { auto: 'Müller, Anna' } } }, [{ feld: F.name, neu: 'Lang, Anna' }], a, (f) => werte[f.schluessel]);
    expect(z.felder).toEqual({ '0:Name': { auto: 'Lang, Anna' }, '0:Ort': { auto: 'Neustadt' } });
    const ign = nachUebernahme({ ignorieren: true, felder: { '0:Name': { auto: 'Müller, Anna', manuell: 'Firma X' } } }, [{ feld: F.name, neu: 'Lang, Anna' }], a, (f) => werte[f.schluessel]);
    expect(ign.felder['0:Name']).toEqual({ auto: 'Lang, Anna', manuell: 'Firma X' });
  });

  it('beim Speichern: den Auto-Text ersetzt = fixiert, zurück zum Auto-Wert = nicht mehr fixiert, Leerzeichen = erzwungen leer', () => {
    const zustand: FormularZustand = { felder: { '0:Name': { auto: 'Müller, Anna' }, '0:Ort': { auto: 'Altstadt', manuell: 'Bei Hamburg' }, '0:GK': { auto: '3' } } };
    const werte: Record<string, string> = { '0:Name': 'Firma Müller GmbH', '0:Ort': 'Altstadt', '0:GK': ' ', '0:PLZ': '12345' };
    const bezug = (k: string) => ({ aktuell: { '0:Name': 'Müller, Anna', '0:Ort': 'Altstadt', '0:GK': '3', '0:PLZ': '12345' }[k], zuletzt: zustand.felder[k]?.auto });
    const z = zustandBeimSpeichern(zustand, ['0:Name', '0:Ort', '0:GK', '0:PLZ'], (k) => werte[k], bezug);
    expect(z.felder).toEqual({
      '0:Name': { auto: 'Müller, Anna', manuell: 'Firma Müller GmbH' },
      '0:Ort': { auto: 'Altstadt' },
      '0:GK': { auto: '3', manuell: ' ' },
      // neu angelegtes Feld ohne Zustand, gleich dem Auto-Wert
      '0:PLZ': { auto: '12345' },
    });
  });

  it('„Manuelle Überschreibungen ignorieren“: an = Auto-Werte, aus = die Überschreibungen zurück', () => {
    const z: FormularZustand = { felder: { '0:Name': { auto: 'Müller, Anna', manuell: 'Firma X' }, '0:Ort': { auto: 'Altstadt' } } };
    expect(beimIgnorieren(z, true, auto({ name: 'Lang, Anna' }))).toEqual([{ schluessel: '0:Name', wert: 'Lang, Anna' }]);
    expect(beimIgnorieren(z, false, auto({}))).toEqual([{ schluessel: '0:Name', wert: 'Firma X' }]);
    // beim Speichern im Ignorieren-Modus geht die Überschreibung nicht verloren
    const gespeichert = zustandBeimSpeichern(
      { ...z, ignorieren: true },
      ['0:Name'],
      () => 'Müller, Anna',
      () => ({ aktuell: 'Müller, Anna', zuletzt: 'Müller, Anna' }),
    );
    expect(gespeichert.felder['0:Name']).toEqual({ auto: 'Müller, Anna', manuell: 'Firma X' });
  });

  it('aus der Projektdatei: Unbrauchbares fällt weg', () => {
    expect(zustaendeAus({ 'a.frmsjf': { felder: { '0:A': { auto: 'x', manuell: ' ' }, '0:B': { auto: 3 } }, ignorieren: true }, 'b.frmsjf': { felder: {} }, c: 'x' })).toEqual({
      'a.frmsjf': { felder: { '0:A': { auto: 'x', manuell: ' ' } }, ignorieren: true },
    });
    expect(zustaendeAus(null)).toEqual({});
  });
});
