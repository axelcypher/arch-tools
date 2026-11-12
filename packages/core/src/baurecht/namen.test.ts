import { describe, expect, it } from 'vitest';
import type { TextKontext } from './kurz';
import { kurzBaum } from './kurz';
import { einheitName, einheitVoll, normTitel, normVoll } from './typen';

describe('Namen ohne Doppelung', () => {
  it('benannte Einheiten: Schlüssel nicht neben dem Titel, Paragrafen mit Nummer', () => {
    expect(einheitName('5', 'Zugänge')).toEqual({ nr: '§ 5', titel: 'Zugänge' });
    expect(einheitName('SO-060', 'SO-060 Standortübungsplatz bei Büecke')).toEqual({ nr: '', titel: 'SO-060 Standortübungsplatz bei Büecke' });
    expect(einheitName('Massnahmenplan', 'Maßnahmenplan')).toEqual({ nr: '', titel: 'Maßnahmenplan' });
    expect(einheitName('Anlage 1', 'Gebietsabgrenzung')).toEqual({ nr: '', titel: 'Anlage 1 – Gebietsabgrenzung' });
    expect(einheitName('C.1', 'Naturschutzgebiete (Festsetzungen C.1)')).toEqual({ nr: '', titel: 'C.1 – Naturschutzgebiete' });
    expect(einheitVoll('SO-060', 'SO-060 Standortübungsplatz')).toBe('SO-060 Standortübungsplatz');
    expect(einheitVoll('42a', 'Gebäude mit mehr als drei Wohnungen')).toBe('§ 42a Gebäude mit mehr als drei Wohnungen');
  });

  it('Normen: Kurzform genau einmal', () => {
    expect(normTitel({ kurz: 'LWG', titel: 'Landeswassergesetz (LWG)' })).toBe('Landeswassergesetz');
    expect(normTitel({ kurz: 'BauO NRW', titel: 'Landesbauordnung 2018 (BauO NRW 2018)' })).toBe('Landesbauordnung 2018');
    expect(normVoll({ kurz: 'DSchG NRW', titel: 'Denkmalschutzgesetz (DSchG NRW)' })).toBe('Denkmalschutzgesetz (DSchG NRW)');
    expect(normVoll({ kurz: 'BauGB', titel: 'Baugesetzbuch' })).toBe('Baugesetzbuch (BauGB)');
    // eine Klammer, die nichts mit der Kurzform zu tun hat, bleibt
    expect(normTitel({ kurz: 'LSG-VO', titel: 'Landschaftsschutzverordnung (Kreis Soest)' })).toBe('Landschaftsschutzverordnung (Kreis Soest)');
  });
});

describe('Regel als Baum', () => {
  const t: TextKontext = {
    fakt: (id) => ({ titel: { a: 'Angabe A', b: 'Angabe B', c: 'Angabe C' }[id] ?? id, typ: 'janein', gruppe: 'vorhaben' }) as never,
    bausteine: { bs: { oder: [{ f: 'b', ist: true }, { f: 'c', ist: true }] } },
  };
  it('und/oder werden zu eingerückten Gruppen, Bausteine aufgelöst, einzelne Glieder ohne Gruppe', () => {
    const b = kurzBaum({ und: [{ f: 'a', ist: true }, { $: 'bs' }] }, t);
    expect(b.text).toBe('alle folgenden:');
    expect(b.kinder?.[0].text).toBe('Angabe A: ja');
    expect(b.kinder?.[1]).toEqual({ text: 'mindestens eines davon:', kinder: [{ text: 'Angabe B: ja' }, { text: 'Angabe C: ja' }] });
    expect(kurzBaum({ und: [{ f: 'a', ist: false }] }, t)).toEqual({ text: 'Angabe A: nein' });
    expect(kurzBaum({ nicht: { f: 'a', ist: true } }, t)).toEqual({ text: 'nicht: Angabe A: ja' });
  });
});
