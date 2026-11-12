import { describe, expect, it } from 'vitest';
import type { Holen, NetzAntwort } from './netz';
import { fassungZumStichtag, Rechtsstand, speicherImArbeitsspeicher } from './rechtsstand';

/** recht.nrw.de im Kleinen: Term-Link → Seite der Fassung; `stand` lässt sich ändern */
function nrw() {
  const zustand = { aktuell: '30102026', text: '(1) Erster Text', erreichbar: true, aufrufe: 0 };
  const seite = (ab: string, text: string) => `<div id="block-rnrw-legal-document-info-box">Fassung Gültig ab ${ab.slice(0, 2)}.${ab.slice(2, 4)}.${ab.slice(4)}</div>
    <section class="legaldoc-article"><span class="field--field_num">§ 1</span><div class="field--field_text"><p>${text}</p></div></section>
    <section class="legaldoc-article"><span class="field--field_num">§ 2</span><div class="field--field_text"><p>(1) bleibt</p></div></section>`;
  const h: Holen = async (url): Promise<NetzAntwort> => {
    zustand.aufrufe++;
    if (!zustand.erreichbar) return { status: 503, url, daten: new Uint8Array() };
    const t = url.endsWith('/taxonomy/term/1')
      ? `<meta http-equiv="refresh" content="0; url=https://recht.nrw.de/lrgv/gesetz/${zustand.aktuell}-g">`
      : seite(zustand.aktuell, zustand.text);
    return { status: 200, url, typ: 'text/html; charset=utf-8', daten: new TextEncoder().encode(t) };
  };
  return { h, zustand };
}

const norm = { id: 'g', kurz: 'G', titel: 'Gesetz', quelle: { art: 'recht-nrw' as const, term: 1 } };

describe('Rechtsstand', () => {
  it('holt, legt ab, prüft höchstens einmal am Tag und erkennt neue Fassungen mit Änderungen je Absatz', async () => {
    const { h, zustand } = nrw();
    let uhr = new Date('2026-11-12T08:00:00Z');
    const rs = new Rechtsstand(speicherImArbeitsspeicher(), h, { jetzt: () => uhr });
    const a = await rs.fuer(norm, '2026-11-12');
    expect(a.fassung?.gueltigAb).toBe('2026-10-30');
    expect(a.neu).toBe(true);
    const aufrufe = zustand.aufrufe;
    await rs.fuer(norm, '2026-11-12');
    expect(zustand.aufrufe).toBe(aufrufe); // innerhalb eines Tages kein neuer Abruf

    zustand.aktuell = '01112026';
    zustand.text = '(1) Geänderter Text';
    uhr = new Date('2026-11-13T09:00:00Z');
    const b = await rs.fuer(norm, '2026-11-13');
    expect(b.fassung?.gueltigAb).toBe('2026-11-01');
    expect(b.neu).toBe(true);
    expect(b.aenderungen).toEqual({ geaendert: ['1/1'], neu: [], weggefallen: [] });
    // frühere Stichtage behalten ihre Fassung
    expect((await rs.fuer(norm, '2026-10-31')).fassung?.gueltigAb).toBe('2026-10-30');
    expect(await rs.fassungen('g')).toHaveLength(2);
  });

  it('Quelle nicht erreichbar: letzter Stand bleibt, Fehler wird gemeldet', async () => {
    const { h, zustand } = nrw();
    let uhr = new Date('2026-11-12T08:00:00Z');
    const rs = new Rechtsstand(speicherImArbeitsspeicher(), h, { jetzt: () => uhr });
    await rs.fuer(norm, '2026-11-12');
    zustand.erreichbar = false;
    uhr = new Date('2026-11-14T08:00:00Z');
    const r = await rs.fuer(norm, '2026-11-14');
    expect(r.fassung?.gueltigAb).toBe('2026-10-30');
    expect(r.fehler).toMatch(/503/);
  });

  it('ohne jede Fassung und ohne Netz: keine Fassung, Fehler', async () => {
    const { h, zustand } = nrw();
    zustand.erreichbar = false;
    const r = await new Rechtsstand(speicherImArbeitsspeicher(), h).fuer(norm, '2026-11-12');
    expect(r.fassung).toBeNull();
    expect(r.fehler).toBeTruthy();
  });

  it('Fassung zum Stichtag', () => {
    const l = [{ gueltigAb: '2024-01-01' }, { gueltigAb: '2026-09-01' }, { gueltigAb: '2027-05-01' }];
    expect(fassungZumStichtag(l, '2026-11-12')?.gueltigAb).toBe('2026-09-01');
    expect(fassungZumStichtag(l, '2027-05-01')?.gueltigAb).toBe('2027-05-01');
    expect(fassungZumStichtag(l, '2020-01-01')).toBeUndefined();
  });
});
