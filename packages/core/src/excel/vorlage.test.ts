import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { vorlagePruefen } from './vorlage';

const xlsx = (blatt: string) =>
  zipSync({ 'xl/workbook.xml': strToU8('<workbook/>'), 'xl/sharedStrings.xml': strToU8(`<sst><si><t>${blatt}</t></si></sst>`), 'xl/worksheets/sheet1.xml': strToU8('<worksheet/>') });

describe('vorlagePruefen', () => {
  it('kaputte Datei und ZIP ohne Arbeitsmappe sind keine gültige Excel-Datei', () => {
    expect(vorlagePruefen(new TextEncoder().encode('kein zip')).fehler).toContain('keine gültige Excel-Datei');
    expect(vorlagePruefen(zipSync({ 'word/document.xml': strToU8('<w/>') })).fehler).toContain('es fehlt die Arbeitsmappe');
  });
  it('gültig ohne Platzhalter: Hinweis; mit Platzhalter: nichts', () => {
    expect(vorlagePruefen(xlsx('Flächen')).hinweis).toContain('keine Platzhalter');
    expect(vorlagePruefen(xlsx('{{projekt.name}}'))).toEqual({});
  });
});
