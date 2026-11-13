import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Lv, Position } from '../lv/modell';
import { aendereElement, fuegeEin, leeresLv, neueId, positionen } from '../lv/modell';
import { summen } from '../lv/rechnen';
import { aslvEntpacken, aslvLesen, aslvNeu, aslvPacken, aslvSchreiben, aslvVerluste, datumLesen } from './aslv';
import { eigenLesen } from './eigen';
import { alsText, kurztextRtf, rtfLesen, rtfSchreiben } from './rtf';
import { xmlParsen, xmlSchreiben } from './xmlDom';

/** kleines LV mit Abschnitt, zwei Positionen (eine Bedarfsposition), Hinweis und zwei Bietern */
function musterLv(): Lv {
  const lv = leeresLv('G13 Fliesenarbeiten');
  lv.kopf.nummer = '13';
  lv.bieter.push({ id: 10, name: 'Fliesen Muster GmbH', nachlass: -2 }, { id: 11, name: 'Beispiel Bau' });
  const p1: Position = {
    id: neueId(),
    art: 'position',
    oz: '0010',
    kurztext: 'Bodenfliesen 30x60 cm',
    langtext: [{ laeufe: [{ text: 'Bodenfliesen liefern und verlegen, ' }, { text: 'Dünnbett', fett: true }] }, { laeufe: [] }, { laeufe: [{ text: 'Fuge: Haarfuge < 2 mm' }] }],
    einheit: 'm2',
    menge: 16,
    positionsart: 'normal',
    kostengruppe: '353',
    preise: { '0': { ep: 59.9 }, '10': { ep: 62.5 }, '11': { ep: 58 } },
  };
  const p2: Position = { ...p1, id: neueId(), oz: '0020', kurztext: 'Zulage Gefälle', langtext: [], menge: 2.5, positionsart: 'bedarf', preise: { '0': { ep: 69 }, '10': { ep: 70 } } };
  lv.elemente = [
    { id: neueId(), art: 'hinweis', vorbemerkung: true, kurztext: 'Vorbemerkung', langtext: [{ laeufe: [{ text: 'Alle Normen sind einzuhalten.' }] }] },
    { id: neueId(), art: 'abschnitt', oz: '01', kurztext: 'Fliesenarbeiten', langtext: [], kinder: [p1, p2, { id: neueId(), art: 'hinweis', kurztext: 'Hinweis Abrechnung', langtext: [{ laeufe: [{ text: 'nach Aufmaß' }] }] }] },
  ];
  return lv;
}

describe('RTF', () => {
  it('liest Umlaute, Absätze, Auszeichnung und schreibt sie im Stil des Originals', () => {
    const f = [{ laeufe: [{ text: 'Größe ' }, { text: 'fett', fett: true }, { text: ' {Klammer} \\' }] }, { laeufe: [] }, { laeufe: [{ text: '€ 100' }], liste: 'punkt' as const }];
    const rtf = rtfSchreiben(f);
    expect(rtf).toContain("Gr\\'F6\\'DFe");
    expect(rtf).toContain('\\pard\\plain\\plain\\fs20\\par\n');
    expect(rtf).toContain('{\\generator WPTools_7.270;}'.replace('{', '{\\*'));
    const zurueck = rtfLesen(rtf);
    expect(alsText(zurueck)).toBe('Größe fett {Klammer} \\\n\n• € 100');
    expect(zurueck[0].laeufe[1]).toEqual({ text: 'fett', fett: true });
  });

  it('nimmt Text ohne RTF als einfachen Text', () => {
    expect(alsText(rtfLesen('Abdichtungsanstrich Boden'))).toBe('Abdichtungsanstrich Boden');
    expect(alsText(rtfLesen(kurztextRtf('Bodenfliesen, 30x60cm')))).toBe('Bodenfliesen, 30x60cm');
  });
});

describe('XML ohne Verlust', () => {
  it('schreibt unverändert Byte für Byte zurück', () => {
    const q = '﻿<?xml version="1.0" encoding="UTF-8"?>\r\n<A V="1">\r\n  <B x="&apos;a&amp;b&lt;" y="z"/>\r\n  <C>\r\n    <D/>\r\n  </C>\r\n</A>\r\n';
    expect(xmlSchreiben(xmlParsen(q))).toBe(q);
  });
});

describe('LV-Datei (.aslv)', () => {
  it('neu angelegt, gelesen und unverändert geschrieben', () => {
    const lv = musterLv();
    const bytes = aslvNeu(lv, new Date(2026, 10, 12, 9, 30));
    const xml = aslvEntpacken(bytes);
    expect(xml.startsWith('﻿<?xml')).toBe(true);
    expect(xml).toContain('<AVAPLANStudio V="V1.0" T="LV">');
    const { lv: gelesen } = aslvLesen(bytes);
    expect(gelesen.kopf.bezeichnung).toBe('G13 Fliesenarbeiten');
    expect(gelesen.bieter.map((b) => b.name)).toEqual(['Kostenansatz LV', 'Fliesen Muster GmbH', 'Beispiel Bau']);
    expect(gelesen.bieter[1].nachlass).toBe(-2);
    const ps = positionen(gelesen);
    expect(ps).toHaveLength(2);
    expect(ps[0].pos).toMatchObject({ oz: '0010', kurztext: 'Bodenfliesen 30x60 cm', einheit: 'm2', menge: 16, kostengruppe: '353', positionsart: 'normal' });
    expect(ps[1].pos.positionsart).toBe('bedarf');
    expect(ps[0].pos.preise['10'].ep).toBe(62.5);
    expect(alsText(ps[0].pos.langtext)).toBe('Bodenfliesen liefern und verlegen, Dünnbett\n\nFuge: Haarfuge < 2 mm');
    expect(gelesen.elemente[0]).toMatchObject({ art: 'hinweis', vorbemerkung: true });
    // unverändert: dieselben Bytes
    expect(aslvSchreiben(bytes, gelesen)).toBe(bytes);
    // Summen in der Datei wie berechnet (Bedarfsposition zählt nicht)
    expect(xml).toContain('<Parameter Name="GBoA" Value="1000"/>');
    expect(xml).toContain('<Parameter Name="GB" Value="980"/>');
    expect(summen(gelesen).bieter.get(10)!.netto).toBe(980);
  });

  it('ändert nur, was sich geändert hat', () => {
    const bytes = aslvNeu(musterLv(), new Date(2026, 10, 12, 9, 30));
    const { lv } = aslvLesen(bytes);
    const ziel = positionen(lv)[0].pos;
    const neu: Lv = { ...lv, elemente: aendereElement(lv.elemente, ziel.id, (p) => ({ ...(p as Position), preise: { ...(p as Position).preise, '11': { ep: 57 } } })) };
    const geschrieben = aslvSchreiben(bytes, neu, new Date(2026, 10, 13, 8, 0));
    const vorher = aslvEntpacken(bytes).split('\r\n');
    const nachher = aslvEntpacken(geschrieben).split('\r\n');
    expect(nachher.length).toBe(vorher.length);
    const anders = nachher.filter((z, i) => z !== vorher[i]);
    // EP, GB, GBoA der Position, Abschnittssumme, Bietersummen und Änderungsdaten – sonst nichts
    expect(anders.every((z) => /Value="(57|912|173\.28|1085\.28)"|ChangeDate="2026-11-13T08:00:00"/.test(z)), anders.join("\n")).toBe(true);
    expect(positionen(aslvLesen(geschrieben).lv)[0].pos.preise['11'].ep).toBe(57);
  });

  it('legt neue Positionen und Abschnitte an, entfernt und verschiebt', () => {
    const bytes = aslvNeu(musterLv());
    const { lv } = aslvLesen(bytes);
    const abschnitt = lv.elemente[1];
    const neuePos: Position = { id: neueId(), art: 'position', oz: '0030', kurztext: 'Silikonfugen', langtext: [{ laeufe: [{ text: 'elastisch' }] }], einheit: 'm', menge: 70, positionsart: 'normal', preise: { '10': { ep: 5.9 } } };
    let el = fuegeEin(lv.elemente, neuePos, abschnitt.id);
    el = fuegeEin(el, { id: neueId(), art: 'abschnitt', oz: '02', kurztext: 'Stundenlohnarbeiten', langtext: [], kinder: [] }, null);
    const geschrieben = aslvSchreiben(bytes, { ...lv, elemente: el });
    const zurueck = aslvLesen(geschrieben).lv;
    expect(positionen(zurueck).map((p) => p.pos.kurztext)).toEqual(['Bodenfliesen 30x60 cm', 'Zulage Gefälle', 'Silikonfugen']);
    expect(zurueck.elemente.map((e) => e.kurztext)).toEqual(['Vorbemerkung', 'Fliesenarbeiten', 'Stundenlohnarbeiten']);
    expect(summen(zurueck).bieter.get(10)!.ohneNachlass).toBe(1413);
    const xml = aslvEntpacken(geschrieben);
    // neue Elemente mit eigener ID, Einrückung wie im Original
    expect(xml).toMatch(/\r\n {10}<Point CreateDate="[^"]+" ChangeDate="[^"]+" ID="\d+">\r\n {12}<ParameterList>\r\n {14}<Parameter Name="ApsGAEBItemID" Value="AP[A-Z]{14}"\/>/);
    // Entfernen
    const ohne = aslvSchreiben(geschrieben, { ...zurueck, elemente: zurueck.elemente.filter((e) => e.kurztext !== 'Stundenlohnarbeiten') });
    expect(aslvLesen(ohne).lv.elemente).toHaveLength(2);
  });

  it('Bezeichnung als RTF im LV-Kopf bleibt beim Speichern unverändert', () => {
    const lv = musterLv();
    const xml = aslvEntpacken(aslvNeu(lv));
    const rtf = kurztextRtf('G13 Fliesenarbeiten');
    expect(xml).toContain('Name="Text1" Value="G13 Fliesenarbeiten"');
    const mitRtf = aslvPacken(xml.replace('Name="Text1" Value="G13 Fliesenarbeiten"', `Name="Text1" Value="${rtf}"`));
    const gelesen = aslvLesen(mitRtf).lv;
    expect(gelesen.kopf.bezeichnung).toBe('G13 Fliesenarbeiten');
    // unverändert → Byte für Byte gleich
    expect(aslvSchreiben(mitRtf, gelesen)).toBe(mitRtf);
    // geändert → wieder RTF mit neuem Text
    const neu = aslvSchreiben(mitRtf, { ...gelesen, kopf: { ...gelesen.kopf, bezeichnung: 'G13 Fliesen' } });
    expect(aslvEntpacken(neu)).toContain('{\\rtf1');
    expect(aslvLesen(neu).lv.kopf.bezeichnung).toBe('G13 Fliesen');
  });

  it('meldet Angaben, die eine LV-Datei nicht aufnimmt', () => {
    const lv = musterLv();
    const datei = aslvLesen(aslvNeu(lv)).lv;
    expect(aslvVerluste(datei, datei)).toEqual([]);
    const geaendert = {
      ...datei,
      nachtraege: [{ nr: 1, titel: 'Mehrmengen', status: 'angeboten' as const }],
      bieter: datei.bieter.map((b) => (b.id === 10 ? { ...b, ausgeschlossen: true, angebotsdatum: '2026-01-02' } : b)),
    };
    expect(aslvVerluste(datei, geaendert).sort()).toEqual(['bieterAngebotsdatum', 'bieterStatus', 'nachtraege']);
    // Gegenprobe: nach dem Speichern als .aslv sind sie tatsächlich weg
    const zurueck = aslvLesen(aslvSchreiben(aslvNeu(lv), geaendert)).lv;
    expect(zurueck.nachtraege).toEqual([]);
    expect(zurueck.bieter.find((b) => b.id === 10)?.ausgeschlossen).toBeUndefined();
  });

  it('liest Datumsangaben in beiden Schreibweisen', () => {
    expect(datumLesen('2025-04-10T00:00:01')).toBe('2025-04-10');
    expect(datumLesen('01.12.2025 00:00:01')).toBe('2025-12-01');
  });
});

// Echte LV-Dateien (Kundendaten, nicht eingecheckt): in .ref/ im Repository oder im Ordner aus AVAPLAN_REF
const REF = process.env.AVAPLAN_REF ?? join(__dirname, '../../../../.ref');
const echte = existsSync(REF) ? readdirSync(REF).filter((n) => n.toLowerCase().endsWith('.aslv')) : [];

describe.skipIf(!echte.length)('echte LV-Dateien', () => {
  for (const name of echte) {
    it(`${name}: unverändert byte-genau, Summen wie in der Datei`, () => {
      const bytes = new Uint8Array(readFileSync(join(REF, name)));
      const xml = aslvEntpacken(bytes);
      expect(xmlSchreiben(xmlParsen(xml))).toBe(xml);
      const { lv, dateiSummen } = aslvLesen(bytes);
      expect(aslvSchreiben(bytes, lv)).toBe(bytes);
      const s = summen(lv);
      for (const [id, gb] of dateiSummen) expect(s.bieter.get(id)?.netto, `Bieter ${id}`).toBeCloseTo(gb, 2);
    });

    it(`${name}: eine Preisänderung ändert nur Preis, Summen und Änderungsdatum`, () => {
      const bytes = new Uint8Array(readFileSync(join(REF, name)));
      const { lv } = aslvLesen(bytes);
      const p = positionen(lv).find((x) => x.pos.preise['0']?.ep);
      if (!p) return;
      const ep = p.pos.preise['0'].ep! + 1;
      const neu = { ...lv, elemente: aendereElement(lv.elemente, p.pos.id, (e) => ({ ...(e as Position), preise: { ...(e as Position).preise, '0': { ...(e as Position).preise['0'], ep } } })) };
      const geschrieben = aslvSchreiben(bytes, neu, new Date(2026, 10, 13, 8, 0));
      const vorher = aslvEntpacken(bytes).split('\r\n');
      const nachher = aslvEntpacken(geschrieben).split('\r\n');
      expect(nachher.length).toBe(vorher.length);
      const anders = nachher.filter((z, i) => z !== vorher[i]);
      expect(anders.every((z) => /Name="(EP|GB|GBoA|GBMwSt|GBBrutto)"|ChangeDate="2026-11-13T08:00:00"/.test(z)), anders.join('\n')).toBe(true);
      const zurueck = aslvLesen(geschrieben).lv;
      expect(positionen(zurueck).find((x) => x.pos.xmlId === p.pos.xmlId)!.pos.preise['0'].ep).toBe(ep);
      // Langtexte unverändert
      expect(positionen(zurueck).map((x) => alsText(x.pos.langtext))).toEqual(positionen(lv).map((x) => alsText(x.pos.langtext)));
    });
  }
});

describe('eigenes Format (.oalv)', () => {
  it('liest fehlerhafte Elemente robust (ohne preise, kinder, langtext)', () => {
    const roh = { format: 'arch-tools-lv', version: 1, lv: { kopf: { bezeichnung: 'X' }, elemente: [{ art: 'abschnitt', oz: '01', kurztext: 'A' }, { art: 'position', oz: '0010', kurztext: 'P' }, { art: 'unbekannt' }, null] } };
    const { lv } = eigenLesen(new TextEncoder().encode(JSON.stringify(roh)));
    expect(lv.elemente.map((e) => e.art)).toEqual(['abschnitt', 'position']);
    const pos = lv.elemente[1] as Position;
    expect(pos.preise).toEqual({});
    expect(pos.menge).toBeNull();
    expect(pos.positionsart).toBe('normal');
    expect(() => summen(lv)).not.toThrow();
  });

  it('lehnt neuere Formatversionen und Fremddateien ab', () => {
    expect(() => eigenLesen(new TextEncoder().encode(JSON.stringify({ format: 'arch-tools-lv', version: 99, lv: {} })))).toThrow(/neueren Version/);
    expect(() => eigenLesen(new TextEncoder().encode('{"format":"anders","lv":{}}'))).toThrow(/Keine LV-Datei/);
    expect(() => eigenLesen(new TextEncoder().encode('kein json'))).toThrow(/kein gültiges JSON/);
  });
});
