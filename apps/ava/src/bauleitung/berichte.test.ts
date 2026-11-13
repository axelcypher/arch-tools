import { describe, expect, it } from 'vitest';
import { createProject } from '@core/model';
import type { Mangel, Protokoll, Tagesbericht } from '../avaDaten';
import { ABNAHME_HINWEIS, istAbnahme, maengelanzeigeText, maengelPdf, PROTOKOLL_SCHLUSS, protokollPdf, tagesberichtPdf, type BerichtKopf } from './berichte';
import { emlLesen } from './mails';

const kopf = (): BerichtKopf => {
  const p = createProject('Musterhaus');
  return { meta: { ...p.meta, projektcode: 'P99', vorhaben: 'Neubau Musterhaus' }, projektName: 'Musterhaus', buero: 'Musterbüro\nMusterplatz 2' };
};

const mangel = (nr: number, frist?: string): Mangel => ({ id: `m${nr}`, nr, beschreibung: `Mangel ${nr}`, festgestellt: '2026-11-01', status: 'offen', fotos: [], ...(frist ? { frist } : {}) });

const protokoll = (art: string): Protokoll & { vorbehaltMaengel?: string; vertragsstrafeVorbehalten?: boolean } => ({
  id: 'p1',
  nr: 3,
  art,
  datum: '2026-11-12',
  teilnehmer: [{ name: 'Łukasz Nowak', firma: 'Łukasz Bau sp. z o.o.', anwesend: true }],
  tops: [{ id: 't1', nr: '1.', titel: 'Fenster – Anschluss „außen“', text: 'Zeile 1\nZeile 2', zustaendig: 'Şahin GmbH' }],
});

describe('Berichte der Bauleitung', () => {
  it('Protokoll ohne Anerkennungsfiktion, Schlusssatz nur als Bitte um Einwände', () => {
    expect(PROTOKOLL_SCHLUSS).not.toMatch(/anerkannt/);
    expect(PROTOKOLL_SCHLUSS).toContain('Einwände bitten wir innerhalb einer Woche nach Zugang mitzuteilen');
  });

  it('erzeugt Protokoll, Tagesbericht und Mängelliste auch mit Zeichen außerhalb der Standardschrift', async () => {
    const pdf = await protokollPdf(kopf(), protokoll('Baubesprechung'));
    expect(new TextDecoder('latin1').decode(pdf.slice(0, 5))).toBe('%PDF-');
    const t: Tagesbericht = { id: 't', datum: '2026-11-12', firmen: [{ firma: 'Łukasz Bau', personen: 3, taetigkeit: 'Mauerwerk ő' }], leistungen: 'Wände EG', fotos: [] };
    expect((await tagesberichtPdf(kopf(), t)).length).toBeGreaterThan(500);
    expect((await maengelPdf(kopf(), [mangel(1, '2026-11-20')])).length).toBeGreaterThan(500);
  });

  it('Abnahmebegehung: auch die frühere Art „Abnahme“ zählt, das PDF wird mit Vorbehalten größer', async () => {
    expect(istAbnahme('Abnahme')).toBe(true);
    expect(istAbnahme('Abnahmebegehung')).toBe(true);
    expect(istAbnahme('Baubesprechung')).toBe(false);
    expect(ABNAHME_HINWEIS).toContain('erklärt der Auftraggeber');
    // nur die Rechte aus § 634 Nr. 1–3 BGB entfallen, nicht „die Ansprüche“ insgesamt (Schadensersatz bleibt)
    expect(ABNAHME_HINWEIS).toContain('Nacherfüllung, Selbstvornahme, Rücktritt und Minderung');
    expect(ABNAHME_HINWEIS).toContain('§ 341 Abs. 3 BGB');
    expect(ABNAHME_HINWEIS).not.toContain('Ansprüche verloren');
    const ohne = await protokollPdf(kopf(), protokoll('Baubesprechung'));
    const mit = await protokollPdf(kopf(), { ...protokoll('Abnahmebegehung'), vorbehaltMaengel: 'Nr. 1: Kratzer am Fensterrahmen', vertragsstrafeVorbehalten: true });
    expect(mit.length).toBeGreaterThan(ohne.length);
  });

  it('Mängelanzeige: einheitliche Frist, je Mangel eigene Fristen oder eine Lücke, wenn Fristen fehlen', () => {
    expect(maengelanzeigeText([mangel(1, '2026-11-20'), mangel(2, '2026-11-20')], 'Max Muster')).toContain('bis spätestens 20.11.2026 zu beseitigen');
    expect(maengelanzeigeText([mangel(1, '2026-11-20'), mangel(2, '2026-11-27')], 'Max Muster')).toContain('je Mangel genannten Fristen');
    const luecke = maengelanzeigeText([mangel(1, '2026-11-20'), mangel(2)], 'Max Muster');
    expect(luecke).toContain('bis spätestens ……… zu beseitigen');
    expect(luecke).not.toContain('genannten Fristen');
    expect(luecke.endsWith('Max Muster')).toBe(true);
  });
});

describe('Mails mit ungewöhnlichen Anhangnamen', () => {
  it('ein „%“ im Anhangnamen bringt die Mail nicht zum Absturz, Prozent-Kodierung wird weiter aufgelöst', () => {
    const roh = (name: string) =>
      new TextEncoder().encode(
        `From: a@example.org\r\nSubject: Angebot\r\nContent-Type: multipart/mixed; boundary="x"\r\n\r\n--x\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nHallo\r\n--x\r\nContent-Type: application/pdf\r\nContent-Disposition: attachment; filename="${name}"\r\nContent-Transfer-Encoding: base64\r\n\r\nAQID\r\n--x--\r\n`,
      );
    const m = emlLesen(roh('100% Rabatt.pdf'));
    expect(m.text?.trim()).toBe('Hallo');
    expect(m.anhaenge).toEqual(['100% Rabatt.pdf']);
    expect(emlLesen(roh('Angebot%20Nr.%205.pdf')).anhaenge).toEqual(['Angebot Nr. 5.pdf']);
  });
});
