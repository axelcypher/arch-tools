import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { abbrechen, abschliessen, auswahlLoeschen, klick, punktVerschieben } from './aktionen';
import { entpacken, fotoPfad, packen } from './datei';
import { pdfPlan, passenderMassstab } from './export/export';
import { pdfErzeugen, winAnsi } from './export/pdf';
import { crc32, jpegMitMassstab, pngMitMassstab } from './export/png';
import { entzerrung } from './geo/ebene';
import { neuesFoto } from './model';
import { aktuell, ebeneHinzufuegen, useEntz } from './store';

const bytes = (n: number, v = 7) => new Uint8Array(n).fill(v);

beforeEach(() => {
  useEntz.getState().laden({ fotos: [] }, {}, null);
});

function mitFoto() {
  useEntz.getState().fotoHinzufuegen('f1', 'Fassade Süd', 'image/jpeg', 4000, 3000, bytes(10));
  return useEntz.getState();
}

describe('Projektdatei', () => {
  it('packt Fotos und Daten und liest sie wieder', () => {
    const foto = { ...neuesFoto('a1', 'Hof', 'image/png', 100, 80), hilfslinien: [{ id: 'h', punkte: [{ x: 1, y: 2 }] }] };
    const z = packen({ fotos: [foto] }, { a1: bytes(50, 3) });
    const roh = unzipSync(z);
    expect(Object.keys(roh).sort()).toEqual(['entzerrung.json', fotoPfad(foto)].sort());
    expect(JSON.parse(strFromU8(roh['entzerrung.json'])).format).toBe('arch-tools-entzerrung');
    const { doc, fotos } = entpacken(z);
    expect(doc.fotos[0]).toEqual(foto);
    expect(fotos.a1).toEqual(bytes(50, 3));
  });

  it('meldet fremde und unvollständige Dateien', () => {
    expect(() => entpacken(bytes(20))).toThrow(/kein ZIP/);
    const foto = neuesFoto('a1', 'Hof', 'image/png', 100, 80);
    const z = packen({ fotos: [foto] }, { a1: bytes(5) });
    const roh = unzipSync(z);
    delete roh[fotoPfad(foto)];
    expect(() => entpacken(zipSync(roh))).toThrow(/Foto „Hof“ fehlt/);
    expect(() => entpacken(zipSync({ 'entzerrung.json': strToU8('{"format":"x"}') }))).toThrow(/keine Entzerrungs-Projektdatei/);
    expect(entpacken(packen({ fotos: [] }, {})).doc.fotos).toEqual([]);
    expect(() => packen({ fotos: [foto] }, {})).toThrow(/fehlt/);
  });
});

describe('Maßstab in Bilddateien', () => {
  it('CRC32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('PNG bekommt pHYs nach IHDR', () => {
    // kleinstes gültiges PNG-Gerüst: Signatur, IHDR, IEND
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    const chunk = (typ: string, daten: number[]) => {
      const t = [...typ].map((c) => c.charCodeAt(0));
      const len = [0, 0, 0, daten.length];
      const crc = crc32(new Uint8Array([...t, ...daten]));
      return [...len, ...t, ...daten, crc >>> 24, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255];
    };
    const png = new Uint8Array([...sig, ...chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]), ...chunk('IEND', [])]);
    const out = pngMitMassstab(png, 0.002);
    const dv = new DataView(out.buffer);
    expect(String.fromCharCode(...out.subarray(37, 41))).toBe('pHYs');
    expect(dv.getUint32(41)).toBe(500);
    expect(dv.getUint32(45)).toBe(500);
    expect(out[49]).toBe(1);
    expect(dv.getUint32(50)).toBe(crc32(out.subarray(37, 50)));
    expect(String.fromCharCode(...out.subarray(58, 62))).toBe('IEND');
    // zweimal: kein doppelter pHYs-Block
    expect(pngMitMassstab(out, 0.002).length).toBe(out.length);
  });

  it('JPEG-Dichte in Pixel je cm', () => {
    const jfif = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
    const out = jpegMitMassstab(jfif, 0.002);
    expect([...out.subarray(13, 18)]).toEqual([2, 0, 5, 0, 5]);
  });
});

describe('PDF', () => {
  it('schreibt eine gültige Struktur mit Querverweisen', () => {
    const pdf = pdfErzeugen({
      breite: 210,
      hoehe: 297,
      bild: { jpeg: bytes(100), px: 10, py: 10, x: 10, y: 10, breite: 100, hoehe: 100 },
      linien: [{ punkte: [{ x: 0, y: 0 }, { x: 10, y: 10 }], staerke: 0.3, farbe: [1, 0, 0] }],
      texte: [{ x: 10, y: 20, text: 'Fläche (Süd) 12,5 m²', groesse: 8, winkel: 30, ausrichtung: 'mitte' }],
      titel: 'Test',
    });
    const text = new TextDecoder('latin1').decode(pdf);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    const start = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(start, start + 4)).toBe('xref');
    // jeder Eintrag zeigt auf „n 0 obj“
    const eintraege = text.slice(start).split('\n').slice(3, 11);
    eintraege.forEach((z, i) => expect(text.slice(Number(z.slice(0, 10))).startsWith(`${i + 1} 0 obj
`)).toBe(true));
    // Klammern maskiert, Umlaute als WinAnsi-Oktal
    expect(text).toContain('(Fl\\344che \\(S\\374d\\) 12,5 m\\262) Tj');
    expect(text).toContain('/MediaBox [0 0 595.276 841.89]');
  });

  it('WinAnsi', () => {
    expect(winAnsi('ä–€✓')).toEqual([0xe4, 0x96, 0x80, 0x3f]);
  });

  it('wählt Maßstab und Papier', () => {
    const b = { x0: 0, y0: 0, x1: 12, y1: 7 };
    expect(pdfPlan(b, 50, 'A3')).toMatchObject({ seite: [420, 297], bild: [240, 140], passt: true });
    expect(pdfPlan(b, 25, 'A3').passt).toBe(false);
    expect(passenderMassstab(b, 'A3')).toBe(50);
    expect(passenderMassstab(b, 'A0')).toBe(20);
    expect(pdfPlan(b, 100, 'passend').seite).toEqual([140, 70 + 20 + 16]);
  });
});

describe('Bearbeiten', () => {
  it('setzt die Ecken der Reihe nach und wechselt danach zur Auswahl', () => {
    let s = mitFoto();
    expect(s.fotoId).toBe('f1');
    s.setze({ werkzeug: 'ecken' });
    const ecken = [
      { x: 1000, y: 2000 },
      { x: 3000, y: 2100 },
      { x: 2900, y: 800 },
      { x: 1100, y: 600 },
    ];
    ecken.forEach((p) => klick(p));
    s = useEntz.getState();
    expect(aktuell(s).ebene!.rechteck.ecken).toEqual(ecken);
    expect(s.werkzeug).toBe('auswahl');
    // fünfte Ecke wird ignoriert
    s.setze({ werkzeug: 'ecken' });
    klick({ x: 5, y: 5 });
    expect(aktuell(useEntz.getState()).ebene!.rechteck.ecken).toHaveLength(4);
  });

  it('Linienzug mit Enter abschließen, Rückgängig und Wiederholen', () => {
    const s = mitFoto();
    s.setze({ werkzeug: 'linienzug' });
    klick({ x: 1, y: 1 });
    abschliessen(); // ein Punkt reicht nicht
    expect(useEntz.getState().entwurf).toHaveLength(1);
    klick({ x: 5, y: 1 });
    klick({ x: 5, y: 9 });
    abschliessen();
    const e = aktuell(useEntz.getState()).ebene!;
    expect(e.messungen).toHaveLength(1);
    expect(e.messungen[0]).toMatchObject({ art: 'linienzug', name: 'Linienzug 1' });
    expect(useEntz.getState().auswahl).toEqual({ art: 'messung', id: e.messungen[0].id });

    useEntz.getState().rueckgaengig();
    expect(aktuell(useEntz.getState()).ebene!.messungen).toHaveLength(0);
    useEntz.getState().wiederholen();
    expect(aktuell(useEntz.getState()).ebene!.messungen).toHaveLength(1);
  });

  it('Punkt ziehen ergibt einen Rückgängig-Schritt, Entf löscht Punkt bzw. Messung', () => {
    const s = mitFoto();
    s.setze({ werkzeug: 'flaeche' });
    for (const p of [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ])
      klick(p);
    abschliessen();
    const id = aktuell(useEntz.getState()).ebene!.messungen[0].id;
    const vorher = useEntz.getState().vergangenheit.length;
    useEntz.getState().merken();
    punktVerschieben({ art: 'messung', id, index: 2 }, { x: 11, y: 11 });
    punktVerschieben({ art: 'messung', id, index: 2 }, { x: 12, y: 12 });
    expect(useEntz.getState().vergangenheit.length).toBe(vorher + 1);
    expect(aktuell(useEntz.getState()).ebene!.messungen[0].punkte[2]).toEqual({ x: 12, y: 12 });

    useEntz.getState().setze({ auswahl: { art: 'messung', id, index: 1 } });
    auswahlLoeschen();
    expect(aktuell(useEntz.getState()).ebene!.messungen[0].punkte).toHaveLength(3);
    useEntz.getState().setze({ auswahl: { art: 'messung', id, index: 1 } });
    auswahlLoeschen(); // Fläche braucht drei Punkte → ganze Messung weg
    expect(aktuell(useEntz.getState()).ebene!.messungen).toHaveLength(0);
  });

  it('Fluchtlinien-Werkzeuge stellen die Methode um, Esc bricht ab', () => {
    const s = mitFoto();
    s.setze({ werkzeug: 'waagerecht' });
    klick({ x: 0, y: 0 });
    abbrechen();
    expect(useEntz.getState().entwurf).toEqual([]);
    klick({ x: 0, y: 0 });
    klick({ x: 100, y: 5 });
    const e = aktuell(useEntz.getState()).ebene!;
    expect(e.methode).toBe('fluchtlinien');
    expect(e.fluchtlinien.waagerecht).toHaveLength(1);
    expect(entzerrung(aktuell(useEntz.getState()).foto!, e).ok).toBe(false);
  });

  it('weitere Ebene wird gewählt, Fotowechsel wählt die erste Ebene', () => {
    mitFoto();
    ebeneHinzufuegen('f1');
    const s = useEntz.getState();
    const f = aktuell(s).foto!;
    expect(f.ebenen.map((e) => e.name)).toEqual(['Ebene 1', 'Ebene 2']);
    expect(s.ebeneId).toBe(f.ebenen[1].id);
    expect(s.werkzeug).toBe('ecken');
    useEntz.getState().fotoHinzufuegen('f2', 'Nord', 'image/jpeg', 100, 100, bytes(3));
    useEntz.getState().waehleFoto('f1');
    expect(useEntz.getState().ebeneId).toBe(f.ebenen[0].id);
  });
});
