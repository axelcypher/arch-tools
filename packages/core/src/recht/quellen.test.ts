import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Holen, NetzAntwort } from './netz';
import { istFehlerseite } from './netz';
import {
  fassungHolen,
  giiParagrafen,
  links,
  listenAenderung,
  metaRefresh,
  mvvtbAusgabe,
  nrwSeite,
  plusMonate,
  rechtNrwHolen,
  risParagrafen,
  satzungParagrafen,
  satzungsDatum,
} from './quellen';
import { absaetze, aenderungen, isoDatum, pruefsumme, pruefsummen, titelOhneFussnote, zeilen } from './text';

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');

/** Netz aus festen Antworten (Adresse → Text) */
function festesNetz(antworten: Record<string, string>): Holen & { aufrufe: string[] } {
  const aufrufe: string[] = [];
  const f = (async (url: string): Promise<NetzAntwort> => {
    aufrufe.push(url);
    const t = antworten[url];
    if (t === undefined) return { status: 404, url, daten: new Uint8Array() };
    return { status: 200, url, typ: 'text/html; charset=utf-8', daten: new TextEncoder().encode(t) };
  }) as Holen & { aufrufe: string[] };
  f.aufrufe = aufrufe;
  return f;
}

describe('Text und Prüfsummen', () => {
  it('HTML in Zeilen: Absätze, Listenpunkte mit Nummer, Entitäten', () => {
    expect(zeilen('<P>(1) Erster&nbsp;Satz.</P><P>(2) Zweiter <DL><DT>1.</DT><DD><LA>Punkt</LA></DD></DL></P>')).toEqual(['(1) Erster Satz.', '(2) Zweiter', '1. Punkt']);
    expect(zeilen('<p>Ma&szlig; &amp; Zahl&shy;wert</p>')).toEqual(['Maß & Zahlwert']);
  });

  it('Titel ohne Fußnotenzeichen', () => {
    expect(titelOhneFussnote('Gewässerrandstreifen (Fn 9)')).toBe('Gewässerrandstreifen');
    expect(titelOhneFussnote('Begriffe [1]')).toBe('Begriffe');
  });

  it('Absätze eines Paragrafen; ohne Nummern der ganze Paragraf', () => {
    const p = { titel: '', url: '', text: ['(1) eins', '1. Punkt', '(2) zwei'] };
    expect([...absaetze(p).keys()]).toEqual(['1', '2']);
    expect(absaetze(p).get('1')).toEqual(['(1) eins', '1. Punkt']);
    expect([...absaetze({ titel: '', url: '', text: ['Wer Kampfmittel entdeckt …'] }).keys()]).toEqual(['']);
    // eingefügte Absätze mit Buchstaben sind eigene Absätze
    const q = absaetze({ titel: '', url: '', text: ['(3) drei', '1. Punkt', '(3a) drei a', '(3b) drei b', '(4) vier'] });
    expect([...q.keys()]).toEqual(['3', '3a', '3b', '4']);
    expect(q.get('3')).toEqual(['(3) drei', '1. Punkt']);
  });

  it('Prüfsumme hängt nur am Inhalt, nicht am Leerraum', async () => {
    expect(await pruefsumme(['(1)  Ein Text '])).toBe(await pruefsumme(['(1) Ein Text']));
    expect(await pruefsumme(['(1) Ein Text'])).not.toBe(await pruefsumme(['(1) Ein anderer Text']));
    expect(await pruefsumme(['x'])).toMatch(/^[0-9a-f]{8}$/);
  });

  it('Änderungen je Absatz: geändert, neu, weggefallen', async () => {
    const alt = await pruefsummen({ '6': { titel: '', url: '', text: ['(1) a', '(2) b'] }, '7': { titel: '', url: '', text: ['ganz'] } });
    const neu = await pruefsummen({ '6': { titel: '', url: '', text: ['(1) a', '(2) B geändert', '(3) neu'] }, '8': { titel: '', url: '', text: ['neu'] } });
    expect(aenderungen(alt, neu)).toEqual({ geaendert: ['6/2', '6/3'], neu: ['8'], weggefallen: ['7'] });
    expect(aenderungen(alt, alt)).toEqual({ geaendert: [], neu: [], weggefallen: [] });
  });

  it('Datum', () => {
    expect(isoDatum('Gültig ab 01.09.2026')).toBe('2026-09-01');
    expect(isoDatum('1.7.2022')).toBe('2022-07-01');
    expect(plusMonate('2025-05-20', 6)).toBe('2025-11-20');
  });
});

describe('gesetze-im-internet.de', () => {
  const { paragrafen, stand, builddate } = giiParagrafen(fixture('gii-baunvo.xml'), 'baunvo');

  it('Paragrafen mit Titel, Absätzen und Adresse', () => {
    expect(Object.keys(paragrafen)).toEqual(['19', '20', '21a']);
    expect(paragrafen['19'].titel).toBe('Grundflächenzahl, zulässige Grundfläche');
    expect(paragrafen['19'].text[0]).toMatch(/^\(1\) Die Grundflächenzahl gibt an/);
    expect(paragrafen['19'].url).toBe('https://www.gesetze-im-internet.de/baunvo/__19.html');
    expect(builddate).toMatch(/^\d{4}-\d\d-\d\d$/);
    expect(stand).toMatch(/zuletzt geändert/);
  });

  it('dieselbe Fassung aus RIS und gesetze-im-internet.de ergibt dieselben Prüfsummen je Absatz', async () => {
    const ris = risParagrafen(fixture('ris-baunvo.html'), 'https://ris.example/regelungstext-1');
    const a = await pruefsummen({ '19': paragrafen['19'] });
    const b = await pruefsummen({ '19': ris['19'] });
    expect(b['19/1']).toBe(a['19/1']);
    expect(b['19/2']).toBe(a['19/2']);
  });
});

describe('Rechtsinformationssystem des Bundes', () => {
  it('Paragrafen aus dem HTML (LegalDocML)', () => {
    const p = risParagrafen(fixture('ris-baunvo.html'), 'https://ris.example/regelungstext-1');
    expect(p['19'].titel).toBe('Grundflächenzahl, zulässige Grundfläche');
    expect(p['19'].text[0]).toMatch(/^\(1\) Die Grundflächenzahl/);
    expect(p['19'].url).toBe('https://ris.example/regelungstext-1/art-z19.html');
    expect(Object.keys(p)).toContain('20');
  });
});

describe('recht.nrw.de', () => {
  it('Infobox, Paragrafen ohne Überschrift, Fußnoten nicht im Text', () => {
    const s = nrwSeite(fixture('nrw-kampfmittelvo.html'), 'https://recht.nrw.de/lrgv/rechtsverordnung/x');
    expect(s.gueltigAb).toBe('2022-06-01');
    expect(s.term).toBe(28341);
    expect(s.paragrafen['2'].text).toEqual(['Wer Kampfmittel entdeckt oder in Besitz hat, ist verpflichtet, dies unverzüglich der nächsten örtlichen Ordnungs- oder Polizeibehörde anzuzeigen.']);
    expect(s.paragrafen['2'].text.join(' ')).not.toMatch(/geändert durch/);
    expect(Object.keys(s.paragrafen).length).toBeGreaterThanOrEqual(6);
  });

  it('Paragrafennummer ohne §-Zeichen und Fassungsliste mit künftiger Fassung', () => {
    const html = `<title>LWG | recht.nrw.de</title><div id="block-rnrw-legal-document-info-box">Fassung Gültig ab 30.10.2026 Gültig bis 30.04.2027</div>
      <ul><li class="version-item latest-version"><a href='/lrgv/gesetz/01052027-lwg'>vom 01.05.2027</a></li>
      <li class="version-item latest-version">vom 30.10.2026 (aktuelle Seite)</li></ul>
      <section class="legaldoc-article"><h2><span class="field field--field_num">104a</span></h2><span class="field--field_headline">Übergang (Fn 3)</span>
      <div class="field field--field_text"><p>(1) Text.</p></div></section>`;
    const s = nrwSeite(html, 'https://recht.nrw.de/lrgv/gesetz/30102026-lwg');
    expect(s.paragrafen['104a']).toMatchObject({ titel: 'Übergang', text: ['(1) Text.'] });
    expect(s.gueltigBis).toBe('2027-04-30');
    expect(s.fassungen.map((f) => f.gueltigAb)).toEqual(['2027-05-01', '2026-10-30']);
    expect(s.fassungen[0].url).toBe('https://recht.nrw.de/lrgv/gesetz/01052027-lwg');
  });

  it('Term-Link: Meta-Refresh folgen, künftige Fassungen merken, mit Stichtag die künftige holen', async () => {
    const seite = (ab: string, bis: string, text: string) => `<div id="block-rnrw-legal-document-info-box">Fassung Gültig ab ${ab}${bis ? ` Gültig bis ${bis}` : ''}</div>
      <li class="version-item"><a href='/lrgv/gesetz/01052027-g'>vom 01.05.2027</a></li><li class="version-item"><a href='/lrgv/gesetz/30102026-g'>vom 30.10.2026</a></li>
      <section class="legaldoc-article"><span class="field--field_num">§ 1</span><div class="field--field_text"><p>${text}</p></div></section>
      <section class="legaldoc-article"><span class="field--field_num">§ 2</span><div class="field--field_text"><p>Zwei.</p></div></section>`;
    const netz = festesNetz({
      'https://recht.nrw.de/taxonomy/term/7': '<meta http-equiv="refresh" content="0; url=https://recht.nrw.de/lrgv/gesetz/30102026-g">',
      'https://recht.nrw.de/lrgv/gesetz/30102026-g': seite('30.10.2026', '30.04.2027', '(1) heute'),
      'https://recht.nrw.de/lrgv/gesetz/01052027-g': seite('01.05.2027', '', '(1) künftig'),
    });
    const kopf = { id: 'g', kurz: 'G', titel: 'Gesetz' };
    const heute = await rechtNrwHolen(netz, kopf, { term: 7 });
    expect(heute.gueltigAb).toBe('2026-10-30');
    expect(heute.gueltigBis).toBe('2027-04-30');
    expect(heute.kuenftige).toEqual([{ gueltigAb: '2027-05-01', url: 'https://recht.nrw.de/lrgv/gesetz/01052027-g' }]);
    expect(heute.summen['1/1']).toMatch(/^[0-9a-f]{8}$/);
    const spaeter = await rechtNrwHolen(netz, kopf, { term: 7 }, '2027-06-01');
    expect(spaeter.gueltigAb).toBe('2027-05-01');
    expect(spaeter.paragrafen['1'].text).toEqual(['(1) künftig']);
    expect(spaeter.summen['1/1']).not.toBe(heute.summen['1/1']);
  });

  it('Meta-Refresh erkennen', () => {
    expect(metaRefresh('<meta http-equiv="refresh" content="0; url=https://recht.nrw.de/x">')).toBe('https://recht.nrw.de/x');
  });
});

describe('Ortsrecht (Dateien)', () => {
  it('Paragrafen einer Satzung aus PDF-Zeilen; Verweise im Text beginnen keinen Paragrafen', () => {
    const z = [
      'Stellplatzsatzung der Stadt Soest vom 28.01.2022',
      '§ 1',
      'Geltungsbereich',
      '(1) Diese Satzung gilt für das gesamte',
      'Stadtgebiet.',
      '§ 2 Anzahl notwendiger Stellplätze',
      '(1) Die Zahl richtet sich nach Anlage 3. Abweichungen nach',
      '§ 4 dieser Satzung bleiben unberührt.',
      '(2) Bei Ände-',
      'rungen gilt …',
      'Soest, den 28.01.2022',
    ];
    const p = satzungParagrafen(z, 'https://example/s.pdf');
    expect(Object.keys(p)).toEqual(['1', '2']);
    expect(p['1']).toMatchObject({ titel: 'Geltungsbereich', text: ['(1) Diese Satzung gilt für das gesamte Stadtgebiet.'] });
    expect(p['2'].titel).toBe('Anzahl notwendiger Stellplätze');
    expect(p['2'].text[0]).toBe('(1) Die Zahl richtet sich nach Anlage 3. Abweichungen nach § 4 dieser Satzung bleiben unberührt.');
    expect(p['2'].text[1]).toBe('(2) Bei Änderungen gilt …');
    expect(satzungsDatum(z)).toBe('2022-01-28');
  });

  it('Scan ohne Textebene: Text aus dem Regelpaket, nur solange die Datei gleich bleibt', async () => {
    const netz = festesNetz({ 'https://example/scan.pdf': 'PDF-Bytes' });
    const kopf = { id: 's', kurz: 'S', titel: 'Satzung' };
    const text = async () => ({ '3': { titel: 'Erlaubnis', url: '', text: ['(1) erlaubnispflichtig'] } });
    const f = await fassungHolen(netz, kopf, { art: 'datei', url: 'https://example/scan.pdf', format: 'pdf', textebene: false, text: 'texte/x.json' }, { textAusPaket: text });
    expect(f !== 'unveraendert' && f.texterkennung).toBe(true);
    await expect(fassungHolen(netz, kopf, { art: 'datei', url: 'https://example/scan.pdf', format: 'pdf', textebene: false, text: 'texte/x.json', sha256: '00' }, { textAusPaket: text })).rejects.toThrow(/neu erstellt/);
  });

  it('Fehlerseiten mit HTTP 200 erkennen', () => {
    expect(istFehlerseite('<title>Fehler - 404 | Kreis Soest</title>')).toBe(true);
    expect(istFehlerseite('<title>Ortsrecht | Stadt Soest</title>')).toBe(false);
  });

  it('Linkliste: neue und weggefallene Links', () => {
    const alt = links('<a href="/a.pdf">A</a><a href="/b.pdf">B</a>', 'https://www.soest.de/');
    const neu = links('<a href="/a.pdf">A</a><a href="/c.pdf">C neu</a>', 'https://www.soest.de/');
    expect(listenAenderung(alt, neu)).toEqual({ neu: [{ url: 'https://www.soest.de/c.pdf', text: 'C neu' }], weg: [{ url: 'https://www.soest.de/b.pdf', text: 'B' }] });
  });

  it('neueste MVV TB ohne Druckfehlerberichtigung', () => {
    const l = links(
      ['MVVTB_2024-1.pdf', 'MVVTB_2025-1.pdf', 'MVVTB_2025-1_Zweite_Druckfehlerberichtigung_Mitteilung.pdf', 'MVV_TB_2024-1_Mit_Aenderungen.pdf'].map((d) => `<a href="/fileadmin/T/${d}">${d}</a>`).join(''),
      'https://www.dibt.de/',
    );
    expect(mvvtbAusgabe(l)).toEqual({ ausgabe: '2025/1', url: 'https://www.dibt.de/fileadmin/T/MVVTB_2025-1.pdf' });
  });
});
