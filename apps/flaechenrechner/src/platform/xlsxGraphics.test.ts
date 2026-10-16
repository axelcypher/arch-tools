import ExcelJS from 'exceljs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { computeProject } from '@core/calc';
import { rectPoints } from '@core/geometry';
import { createProject, createRoom } from '@core/model';
import { exportWithTemplate } from './excel';

// 1×1-PNG
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

/** Vorlage mit Logo in den Zellen (ExcelJS) und Logo im Seitenkopf (VML, wie Excel es speichert) */
async function template(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Wohnflächen');
  ws.getCell('A1').value = 'Wohnflächen-Berechnung';
  ws.getRow(4).values = ['{{#geschoss}}{{geschoss.name|einmal}}', '{{raum[wofl].name}}', '{{raum[wofl].wofl}}'];
  ws.getRow(5).values = ['{{/geschoss}}'];
  ws.headerFooter.oddFooter = '&LAusgegeben am &D';
  const id = wb.addImage({ buffer: PNG as never, extension: 'png' });
  ws.addImage(id, { tl: { col: 3, row: 0 }, ext: { width: 120, height: 40 } });
  const files = unzipSync(new Uint8Array(await wb.xlsx.writeBuffer()));
  const sheet = 'xl/worksheets/sheet1.xml';
  files[sheet] = strToU8(
    strFromU8(files[sheet])
      .replace('<headerFooter>', '<headerFooter><oddHeader>&amp;L&amp;G&amp;R{{projekt.code}} {{projekt.name}}</oddHeader>')
      .replace('</worksheet>', '<legacyDrawingHF r:id="rIdHF"/></worksheet>'),
  );
  const rels = 'xl/worksheets/_rels/sheet1.xml.rels';
  files[rels] = strToU8(
    strFromU8(files[rels]).replace(
      '</Relationships>',
      '<Relationship Id="rIdHF" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing" Target="../drawings/vmlDrawingHF1.vml"/></Relationships>',
    ),
  );
  files['xl/drawings/vmlDrawingHF1.vml'] = strToU8('<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><v:shape id="LH" type="#_x0000_t75" style="width:90pt;height:30pt"><v:imagedata o:relid="rId1" o:title="logo"/></v:shape></xml>');
  files['xl/drawings/_rels/vmlDrawingHF1.vml.rels'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/kopflogo.png"/></Relationships>',
  );
  files['xl/media/kopflogo.png'] = PNG;
  return zipSync(files);
}

describe('Grafiken der Vorlage', () => {
  it('übernimmt Logo in Zellen und im Seitenkopf', async () => {
    const p = createProject('Test & Co');
    p.meta.projektcode = '0815';
    const r = createRoom(rectPoints({ x: 0, y: 0 }, { x: 4, y: 5 }), '1', 'Wohnen');
    r.wofl = { kategorie: 'voll', wohnung: '' };
    p.storeys[0].shapes.push(r);
    const out = unzipSync(await exportWithTemplate(await template(), p, computeProject(p)));

    const sheet = strFromU8(out['xl/worksheets/sheet1.xml']);
    expect(sheet).toMatch(/<drawing r:id="[^"]+"\/>/);
    expect(sheet).toMatch(/<legacyDrawingHF r:id="[^"]+"\/>/);
    expect(sheet.indexOf('<drawing')).toBeLessThan(sheet.indexOf('<legacyDrawingHF'));
    expect(sheet).toContain('&amp;L&amp;G&amp;R0815 Test &amp;&amp; Co');

    const rels = strFromU8(out['xl/worksheets/_rels/sheet1.xml.rels']);
    const hfTarget = /Target="([^"]*vmlDrawingHF1\.vml)"/.exec(rels)![1];
    const vmlPath = `xl/worksheets/${hfTarget}`.replace('worksheets/../', '');
    expect(out[vmlPath]).toBeDefined();
    const vmlRels = strFromU8(out[vmlPath.replace('drawings/', 'drawings/_rels/') + '.rels']);
    const img = /Target="\.\.\/media\/([^"]+)"/.exec(vmlRels)![1];
    expect(out[`xl/media/${img}`]).toEqual(PNG);

    const drawTarget = /Type="[^"]*\/drawing" Target="([^"]+)"/.exec(rels)![1];
    const drawPath = `xl/worksheets/${drawTarget}`.replace('worksheets/../', '');
    expect(out[drawPath]).toBeDefined();
    expect(strFromU8(out['[Content_Types].xml'])).toMatch(/Extension="vml"/);
    // Inhalt trotzdem gefüllt
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(zipSync(out).buffer as ArrayBuffer);
    expect(wb.getWorksheet('Wohnflächen')!.getCell('B4').value).toBe('Wohnen');
  });

  it('ersetzt Platzhalter in Textfeldern, auch wenn Excel sie auf mehrere Läufe verteilt', async () => {
    const files = unzipSync(await template());
    const draw = Object.keys(files).find((k) => /^xl\/drawings\/drawing\d+\.xml$/.test(k))!;
    // Textfeld neben dem Logo, wie Excel es speichert: Projektname fett und auf zwei Läufe verteilt, darunter die Adresse
    const textfeld =
      '<xdr:twoCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>' +
      '<xdr:to><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>2</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>' +
      '<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="3" name="Textfeld 2"/><xdr:cNvSpPr txBox="1"/></xdr:nvSpPr>' +
      '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2000000" cy="400000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>' +
      '<xdr:txBody><a:bodyPr wrap="square" rtlCol="0"/><a:lstStyle/>' +
      '<a:p><a:r><a:rPr lang="de-DE" sz="1100" b="1"/><a:t>{{projekt.</a:t></a:r><a:r><a:rPr lang="de-DE" sz="1100" b="1"/><a:t>name}}</a:t></a:r></a:p>' +
      '<a:p><a:pPr algn="l"/><a:r><a:rPr lang="de-DE" sz="1100"/><a:t>{{projekt.adresse}}</a:t></a:r><a:endParaRPr lang="de-DE" sz="1100"/></a:p>' +
      '</xdr:txBody></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>';
    files[draw] = strToU8(strFromU8(files[draw]).replace(/<\/xdr:wsDr>\s*$/, `${textfeld}</xdr:wsDr>`));

    const p = createProject('EFH Sander');
    p.meta.adresse = { strasse: 'Deiringser Weg 7a', plz: '59494', ort: 'Soest' };
    const out = unzipSync(await exportWithTemplate(zipSync(files), p, computeProject(p)));
    const rels = strFromU8(out['xl/worksheets/_rels/sheet1.xml.rels']);
    const drawPath = `xl/worksheets/${/Type="[^"]*\/drawing" Target="([^"]+)"/.exec(rels)![1]}`.replace('worksheets/../', '');
    const xml = strFromU8(out[drawPath]);
    expect(xml).toContain('<a:t>EFH Sander</a:t>');
    expect(xml).toContain('<a:t>Deiringser Weg 7a, 59494 Soest</a:t>');
    expect(xml).not.toContain('{{');
  });
});
