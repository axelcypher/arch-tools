import { describe, expect, it } from 'vitest';
import { pdfAusfuellen, pdfFelder, pdfOeffnen, pdfSchliessen } from './pdf';

/** Kleine PDF mit AcroForm: ein Textfeld „Bauherr“ und ein Kästchen „Neubau“ (Querverweise korrekt berechnet) */
function formularPdf(): Uint8Array {
  const objekte = [
    '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [4 0 R 5 0 R] /NeedAppearances true /DA (/Helv 0 Tf 0 g) /DR << /Font << /Helv 6 0 R >> >> >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Annots [4 0 R 5 0 R] /Resources << /Font << /Helv 6 0 R >> >> >>',
    '<< /Type /Annot /Subtype /Widget /FT /Tx /T (Bauherr) /V (Muster) /Rect [50 700 300 720] /F 4 /P 3 0 R /DA (/Helv 12 Tf 0 g) >>',
    '<< /Type /Annot /Subtype /Widget /FT /Btn /T (Neubau) /V /Off /AS /Off /Rect [50 650 62 662] /F 4 /P 3 0 R /MK << >> /AP << /N << /Ja 7 0 R /Off 8 0 R >> >> >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /XObject /Subtype /Form /BBox [0 0 12 12] /Length 0 >>\nstream\n\nendstream',
    '<< /Type /XObject /Subtype /Form /BBox [0 0 12 12] /Length 0 >>\nstream\n\nendstream',
  ];
  let text = '%PDF-1.7\n';
  const lagen: number[] = [];
  objekte.forEach((o, i) => {
    lagen.push(text.length);
    text += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = text.length;
  text += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n${lagen.map((l) => `${String(l).padStart(10, '0')} 00000 n \n`).join('')}`;
  text += `trailer\n<< /Size ${objekte.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(text);
}

describe('PDF-Formulare', () => {
  it('liest die Formularfelder', async () => {
    const doc = await pdfOeffnen(formularPdf());
    const felder = await pdfFelder(doc);
    await pdfSchliessen(doc);
    expect(felder.map((f) => [f.name, f.art, f.wert, f.seite])).toEqual([
      ['Bauherr', 'text', 'Muster', 1],
      ['Neubau', 'kreuz', false, 1],
    ]);
  });

  it('füllt Felder aus und speichert als Nachtrag – der ursprüngliche Inhalt bleibt unverändert', async () => {
    const vorher = formularPdf();
    const doc = await pdfOeffnen(vorher);
    const [bauherr] = await pdfFelder(doc);
    await pdfSchliessen(doc);
    const nachher = await pdfAusfuellen(vorher, new Map([[bauherr.id, 'Mustermann, Erika']]));
    // inkrementell: die alte Datei steht unverändert am Anfang
    expect(nachher.length).toBeGreaterThan(vorher.length);
    expect(nachher.subarray(0, vorher.length)).toEqual(vorher);
    const wieder = await pdfOeffnen(nachher);
    const felder = await pdfFelder(wieder);
    await pdfSchliessen(wieder);
    expect(felder.find((f) => f.name === 'Bauherr')!.wert).toBe('Mustermann, Erika');
  });
});
