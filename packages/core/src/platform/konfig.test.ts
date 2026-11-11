// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { allgemeinAendern, allgemeinLaden, konfigLesen, konfigSchreiben, konfigSchreibenWennUnveraendert, konfigStand, zuletztLesen, zuletztMerken, zuletztVergessen } from './konfig';

beforeEach(() => localStorage.clear());

describe('Gemeinsame Einstellungen im Browser', () => {
  it('Bereiche gemeinsam und lokal getrennt; Änderungen kurz hintereinander gehen nicht verloren', async () => {
    await konfigSchreiben('formulare', { a: 1 });
    await konfigSchreiben('formulare', { lokal: true }, { lokal: true });
    expect(await konfigLesen('formulare')).toEqual({ a: 1 });
    expect(await konfigLesen('formulare', { lokal: true })).toEqual({ lokal: true });
    await Promise.all([allgemeinAendern({ oapPfad: 'A/{nummer}.oap' }), allgemeinAendern({ fotoordner: '10 Fotos' }), allgemeinAendern({ projekte: ['P:\\Projekte'] })]);
    expect(await allgemeinLaden()).toEqual({ projekte: ['P:\\Projekte'], oapPfad: 'A/{nummer}.oap', fotoordner: '10 Fotos' });
  });

  it('Zuletzt geöffnet: je Benutzer, für alle Apps, neueste zuerst, jeder Ordner einmal', async () => {
    await zuletztMerken('P:\\Projekte\\BS5', 'Formulare', 1000);
    await zuletztMerken('P:\\Projekte\\2026-014', 'Projektordner', 2000);
    await zuletztMerken('p:\\projekte\\bs5', 'Flächenrechner', 3000);
    expect(await zuletztLesen()).toEqual([
      { pfad: 'p:\\projekte\\bs5', zeit: 3000, app: 'Flächenrechner' },
      { pfad: 'P:\\Projekte\\2026-014', zeit: 2000, app: 'Projektordner' },
    ]);
    // lokal, nicht im gemeinsamen Bereich
    expect(localStorage.getItem('arch-tools:konfig:zuletzt')).toBeNull();
    expect(await zuletztVergessen('P:\\Projekte\\2026-014')).toEqual([{ pfad: 'p:\\projekte\\bs5', zeit: 3000, app: 'Flächenrechner' }]);
  });
});

describe('Schreiben mit Konfliktprüfung (P-02)', () => {
  it('Schreiben mit veraltetem Stand schlägt fehl und liefert den aktuellen Inhalt; mit aktuellem Stand gelingt es', async () => {
    await konfigSchreiben('projektordner', { struktur: { name: 'A' } });
    const stand = konfigStand(await konfigLesen('projektordner'));
    // ein anderer Rechner schreibt dazwischen
    await konfigSchreiben('projektordner', { struktur: { name: 'B' } });
    expect(await konfigSchreibenWennUnveraendert('projektordner', { struktur: { name: 'C' } }, stand)).toEqual({ ok: false, aktuell: { struktur: { name: 'B' } } });
    expect(await konfigLesen('projektordner')).toEqual({ struktur: { name: 'B' } });
    // mit dem aktuellen Stand gelingt es; der neue Stand passt zum Inhalt
    const r = await konfigSchreibenWennUnveraendert('projektordner', { struktur: { name: 'C' } }, konfigStand({ struktur: { name: 'B' } }));
    expect(r).toEqual({ ok: true, stand: konfigStand({ struktur: { name: 'C' } }) });
    expect(r.ok && r.stand).toBe(konfigStand(await konfigLesen('projektordner')));
    // ein Bereich, den es noch nicht gibt: Stand null
    expect(konfigStand(await konfigLesen('neu'))).toBeNull();
    expect((await konfigSchreibenWennUnveraendert('neu', { a: 1 }, null)).ok).toBe(true);
  });
});
