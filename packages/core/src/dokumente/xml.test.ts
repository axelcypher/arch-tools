import { describe, expect, it } from 'vitest';
import { xmlLesen } from './xml';

describe('xmlLesen bei abgeschnittenen Dateien', () => {
  it.each([
    ['Verarbeitungsanweisung ohne ?>', '<?xml version="1.0"'],
    ['Verarbeitungsanweisung nur „<?>“', '<a><?></a>'],
    ['Kommentar ohne -->', '<GAEB><Award><!-- abgeschnitten'],
    ['CDATA ohne ]]>', '<a><![CDATA[Text'],
    ['Deklaration ohne >', '<!DOCTYPE a'],
    ['Endtag ohne >', '<a>Text</a'],
    ['Starttag ohne >', '<a><b x="1"'],
  ])('%s: einheitlicher Fehler „XML: unvollständig“', (_, quelle) => {
    expect(() => xmlLesen(quelle)).toThrow('XML: unvollständig');
  });

  it('Gegenprobe: vollständige Datei mit Anweisung, Kommentar, CDATA und Deklaration', () => {
    const doc = xmlLesen('<?xml version="1.0"?><!DOCTYPE a><a x="1"><!-- k --><b><![CDATA[1 < 2]]></b><c/></a>');
    const a = doc.kinder[0];
    expect(a.name).toBe('a');
    expect(a.attr.x).toBe('1');
    expect(a.kinder.map((k) => k.name)).toEqual(['b', 'c']);
    expect(a.kinder[0].text).toBe('1 < 2');
  });

  it('Gegenprobe: „-->“ darf nicht mit dem Kommentaranfang „<!--“ zusammenfallen', () => {
    expect(() => xmlLesen('<a><!--></a>')).toThrow('XML: unvollständig');
    expect(xmlLesen('<a><!---->x</a>').kinder[0].text).toBe('x');
  });
});
