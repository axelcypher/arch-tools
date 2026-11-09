/**
 * Kompatibilitätstests gegen echte FORMA-Dateien.
 *
 * Die Dateien selbst sind das Orakel: Jede Zeichenkette, jedes ausgefüllte Textfeld und jedes Kreuz darin hat
 * FORMA geschrieben. Wer sie entfernt und mit diesem Modul neu schreibt, muss exakt dieselben Bytes erhalten.
 *
 * Neben der Musterdatei in `src/__fixtures__` werden alle `.frmsjf` unter `.ref/` im Repository geprüft (oder
 * unter dem Pfad in `SJFORMA_REF`), falls vorhanden. `.ref/` enthält Kundendaten und wird nicht eingecheckt.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { stringlisteZeilen, zeichenketteZeilen } from './delphi';
import type { Objekt } from './dfm';
import { einrueckung, eigenschaft, eigenschaften, finde, nachfahren, schreibeObjekt } from './dfm';
import type { Formular } from './formular';
import { formularBytes, istAngekreuzt, kennung, memoText, parseFormular, seitenTitel, setzeAngekreuzt, setzeMemoText, stand } from './formular';

function sammle(ordner: string, out: string[]): string[] {
  let namen: string[];
  try {
    namen = readdirSync(ordner);
  } catch {
    return out;
  }
  for (const n of namen) {
    const p = join(ordner, n);
    if (statSync(p).isDirectory()) sammle(p, out);
    else if (n.endsWith('.frmsjf')) out.push(p);
  }
  return out;
}

const fixtures = sammle(fileURLToPath(new URL('../__fixtures__', import.meta.url)), []);
const refOrdner = process.env.SJFORMA_REF ?? fileURLToPath(new URL('../../../../.ref', import.meta.url));
const dateien = [...fixtures, ...sammle(refOrdner, [])].map((pfad) => ({ pfad, bytes: new Uint8Array(readFileSync(pfad)) }));

const gleich = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

function alsText(o: Objekt): string {
  const out: string[] = [];
  schreibeObjekt(o, out);
  return out.join('');
}

/** Alle Komponenten einer Klasse über alle Seiten */
function komponenten(f: Formular, klasse: string): { seite: number; o: Objekt }[] {
  return f.seiten.flatMap((s, seite) => nachfahren(s.form).filter((o) => o.klasse === klasse).map((o) => ({ seite, o })));
}

describe(`FORMA-Dateien (${fixtures.length} Muster, ${dateien.length - fixtures.length} aus ${refOrdner})`, () => {
  it('Musterdatei ist vorhanden und lesbar', () => {
    expect(fixtures.length).toBeGreaterThan(0);
    const f = parseFormular(dateien[0].bytes);
    expect([kennung(f), stand(f), f.seiten.length]).toEqual(['nw019999', '2026A', 2]);
    expect(seitenTitel(f.seiten[0])).toBe('NRW - 2026 - Anlage I-3 - Antrag auf Genehmigungsfreistellung - Seite 1 von 2');
    expect(memoText(finde(f.seiten[0].form, 'Memo3')!)).toBe(
      'Neubau eines Einfamilienhauses mit Einliegerwohnung und Doppelgarage\nMusterstraße 1, 12345 Musterstadt\n\n',
    );
  });

  it('unveränderte Dateien werden byte-genau zurückgeschrieben', () => {
    for (const { pfad, bytes } of dateien) expect(gleich(formularBytes(parseFormular(bytes)), bytes), pfad).toBe(true);
  });

  it('Komponentennamen sind je Seite eindeutig', () => {
    for (const { pfad, bytes } of dateien) {
      for (const s of parseFormular(bytes).seiten) {
        const namen = [s.form.name, ...nachfahren(s.form).map((o) => o.name)];
        expect(new Set(namen).size, `${pfad} ${s.schluessel}`).toBe(namen.length);
      }
    }
  });

  it('jede Zeichenkette wird genau wie von Delphi kodiert', () => {
    let geprueft = 0;
    for (const { pfad, bytes } of dateien) {
      for (const s of parseFormular(bytes).seiten) {
        for (const o of [s.form, ...nachfahren(s.form)]) {
          for (const e of eigenschaften(o)) {
            let erwartet: string[];
            if (e.wert.art === 'text') erwartet = zeichenketteZeilen(einrueckung(e), e.name, e.wert.text);
            else if (e.wert.art === 'liste' && e.wert.werte.length && e.wert.werte.every((w) => w.art === 'text'))
              erwartet = stringlisteZeilen(einrueckung(e), e.name, e.wert.werte.map((w) => (w.art === 'text' ? w.text : '')));
            else continue;
            expect(erwartet, `${pfad} ${s.schluessel} ${o.name}.${e.name}`).toEqual(e.zeilen);
            geprueft++;
          }
        }
      }
    }
    expect(geprueft).toBeGreaterThan(0);
  });

  // Je Änderung wird die Komponente verglichen, am Ende jeder Datei einmal die ganze Datei: Eine Änderung
  // außerhalb der Komponente bliebe bis dahin stehen und fiele dort auf. (Die ganze Datei je Feld zu schreiben,
  // dauert beim Statistikbogen mit eingebettetem Bild zu lange.)
  it('Textfeld leeren und neu füllen ergibt das Original', () => {
    let geprueft = 0;
    for (const { pfad, bytes } of dateien) {
      const f = parseFormular(bytes);
      for (const { seite, o } of komponenten(f, 'TMemo')) {
        const t = memoText(o);
        if (!t) continue;
        const vorher = alsText(o);
        setzeMemoText(f, seite, o.name, '');
        expect(eigenschaft(o, 'Lines.Strings')).toBeUndefined();
        expect(memoText(o)).toBe('');
        setzeMemoText(f, seite, o.name, t);
        expect(alsText(o), `${pfad} Seite ${seite + 1} ${o.name}`).toBe(vorher);
        geprueft++;
      }
      expect(gleich(formularBytes(f), bytes), pfad).toBe(true);
    }
    expect(geprueft).toBeGreaterThan(0);
  });

  it('Kästchen umschalten und zurück ergibt das Original', () => {
    let an = 0;
    let aus = 0;
    for (const { pfad, bytes } of dateien) {
      const f = parseFormular(bytes);
      for (const { seite, o } of komponenten(f, 'TCheckBox')) {
        const war = istAngekreuzt(o);
        const vorher = alsText(o);
        setzeAngekreuzt(f, seite, o.name, !war);
        expect(istAngekreuzt(o)).toBe(!war);
        setzeAngekreuzt(f, seite, o.name, war);
        expect(alsText(o), `${pfad} Seite ${seite + 1} ${o.name}`).toBe(vorher);
        if (war) an++;
        else aus++;
      }
      expect(gleich(formularBytes(f), bytes), pfad).toBe(true);
    }
    expect(an).toBeGreaterThan(0);
    expect(aus).toBeGreaterThan(0);
  });

  it('State = cbChecked genau bei angekreuzten Kästchen', () => {
    for (const { pfad, bytes } of dateien) {
      for (const { seite, o } of komponenten(parseFormular(bytes), 'TCheckBox')) {
        const state = eigenschaft(o, 'State')?.wert;
        expect(state, `${pfad} Seite ${seite + 1} ${o.name}`).toEqual(istAngekreuzt(o) ? { art: 'name', name: 'cbChecked' } : undefined);
      }
    }
  });

  it('Änderungen betreffen nur die Wertzeilen', () => {
    const f = parseFormular(dateien[0].bytes);
    setzeMemoText(f, 0, 'Memo2', 'Musterweg 7\n12345 Musterstadt');
    setzeAngekreuzt(f, 0, 'CheckBox2', true);
    setzeAngekreuzt(f, 0, 'CheckBox1', false);
    // Zeilen als Multimenge vergleichen: Das Kreuz wandert von CheckBox1 zu CheckBox2 (gleicher Wortlaut)
    const zaehle = (b: Uint8Array) => {
      const m = new Map<string, number>();
      for (const z of new TextDecoder().decode(b).split('\r\n')) m.set(z, (m.get(z) ?? 0) + 1);
      return m;
    };
    const vorher = zaehle(dateien[0].bytes);
    const nachher = zaehle(formularBytes(f));
    const differenz = (a: Map<string, number>, b: Map<string, number>) =>
      [...a].flatMap(([z, n]) => Array<string>(Math.max(0, n - (b.get(z) ?? 0))).fill(z));
    expect(differenz(vorher, nachher)).toEqual([]);
    expect(differenz(nachher, vorher)).toEqual(['          Lines.Strings = (', "            'Musterweg 7'", "            '12345 Musterstadt')"]);
  });

  it('meldet unbekannte Felder und falsche Typen', () => {
    const f = parseFormular(dateien[0].bytes);
    expect(() => setzeMemoText(f, 0, 'Gibtsnicht', 'x')).toThrow(/gibt es auf Seite 1 nicht/);
    expect(() => setzeMemoText(f, 0, 'CheckBox1', 'x')).toThrow(/TCheckBox, kein TMemo/);
    expect(() => setzeAngekreuzt(f, 5, 'CheckBox1', true)).toThrow(/Seite 6 gibt es nicht/);
  });
});
