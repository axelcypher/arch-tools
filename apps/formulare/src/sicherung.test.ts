// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { bereicheIn, sicherungDateiname, sicherungEinspielen, sicherungErstellen, sicherungLesen, sicherungText } from './sicherung';

const gk345 = [{ art: 'merkmal', merkmal: 'Gebäudeklasse', werte: ['3', '4', '5'] }];

beforeEach(() => localStorage.clear());

describe('Einstellungen sichern und übertragen', () => {
  it('nimmt nur Einstellungen auf – keine Entwürfe und keinen Verlauf', () => {
    localStorage.setItem('formulare:profile', JSON.stringify({ 'nw01|2026A': { abschnitte: { '0:Panel1': { titel: 'Bauherr' } }, zaehlt: {} } }));
    localStorage.setItem('formulare:merkmale', JSON.stringify([{ name: 'Gebäudeklasse', werte: ['1', '2', '3'] }]));
    localStorage.setItem('formulare:entwuerfe', JSON.stringify({ x: { '0:Name': 'Muster' } }));
    localStorage.setItem('formulare:verlauf', JSON.stringify({ x: 1 }));
    const s = sicherungErstellen('0.11.0', new Date('2026-11-10T12:00:00Z'));
    expect(s).toMatchObject({ art: 'formulare-einstellungen', version: 1, app: '0.11.0', erstellt: '2026-11-10T12:00:00.000Z' });
    expect(Object.keys(s.daten).sort()).toEqual(['formulare:merkmale', 'formulare:profile']);
    expect(bereicheIn(s).map((b) => b.umfang(s.daten[b.schluessel]))).toEqual(['1 Formular', '1 Merkmal']);
    expect(sicherungLesen(sicherungText(s))).toEqual(s);
    expect(sicherungDateiname(new Date(2026, 10, 10))).toBe('Formulare-Einstellungen 261110.json');
  });

  it('fremde oder kaputte Dateien werden mit verständlicher Meldung abgelehnt', () => {
    expect(() => sicherungLesen('kein json')).toThrow('kein gültiges JSON');
    expect(() => sicherungLesen('{"art":"etwas"}')).toThrow('keine Einstellungen der App');
    expect(() => sicherungLesen('{"art":"formulare-einstellungen","version":2,"daten":{}}')).toThrow('neueren Version');
    // unbekannte Schlüssel fallen weg
    expect(sicherungLesen('\uFEFF{"art":"formulare-einstellungen","version":1,"daten":{"fremd":1,"formulare:katalog":[]}}').daten).toEqual({ 'formulare:katalog': [] });
  });

  it('einspielen: ganze Bereiche ersetzt, die Gliederung je Formular ergänzt – Ungültiges fällt weg', () => {
    localStorage.setItem('formulare:katalog', JSON.stringify([{ id: 'alt' }]));
    localStorage.setItem('formulare:profile', JSON.stringify({ eigenes: { abschnitte: { a: { titel: 'Meins' } }, zaehlt: {} }, gleich: { abschnitte: { a: { titel: 'Alt' } }, zaehlt: {} } }));
    localStorage.setItem('formulare:einstellungen', JSON.stringify({ projektordner: ['C:/FORMA'] }));
    const s = sicherungLesen(
      JSON.stringify({
        art: 'formulare-einstellungen',
        version: 1,
        daten: {
          'formulare:katalog': [{ id: 'neu' }],
          'formulare:profile': {
            gleich: { abschnitte: { a: { titel: 'Neu', bedingung: gk345 } }, zaehlt: {} },
            kaputt: 'x',
            leer: { abschnitte: {}, zaehlt: {} },
            halb: { abschnitte: { a: null, b: { sichtbar: false } } },
          },
          'formulare:einstellungen': { projektordner: ['D:/Anderswo'] },
        },
      }),
    );
    const titel = sicherungEinspielen(s, ['formulare:katalog', 'formulare:profile']);
    expect(titel).toEqual(['Gliederung der Formulare (Titel, Gruppen, Bedingungen)', 'Antragsdokumente']);
    expect(JSON.parse(localStorage.getItem('formulare:katalog')!)).toEqual([{ id: 'neu' }]);
    const profile = JSON.parse(localStorage.getItem('formulare:profile')!);
    expect(Object.keys(profile).sort()).toEqual(['eigenes', 'gleich', 'halb']);
    // die frühere Form (Liste) wird beim Prüfen zur Und-Gruppe
    expect(profile.gleich.abschnitte.a).toEqual({ titel: 'Neu', bedingung: { art: 'gruppe', op: 'und', teile: gk345 } });
    expect(profile.halb.abschnitte).toEqual({ b: { sichtbar: false } });
    // nicht angehakt: bleibt
    expect(JSON.parse(localStorage.getItem('formulare:einstellungen')!).projektordner).toEqual(['C:/FORMA']);
  });
});
