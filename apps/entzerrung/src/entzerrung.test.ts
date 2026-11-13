import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { abbrechen, abschliessen, auswahlLoeschen, klick, punktVerschieben } from './aktionen';
import { entpacken, fotoPfad, packen } from './datei';
import { leistenBreite, leistenFeld, pdfPlan, passenderMassstab, pixelZuEbene, plankopfLayout } from './export/export';
import { abbilden } from './geo/mat';
import { ausgabe } from './geo/messen';
import { pdfErzeugen, winAnsi } from './export/pdf';
import { crc32, jpegDichte, jpegMitMassstab, pngMitMassstab } from './export/png';
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

  it('prüft beim Laden Zahlen, Punkte, Methode und Kennungen', () => {
    const json = (fotos: unknown[]) => zipSync({ 'entzerrung.json': strToU8(JSON.stringify({ format: 'arch-tools-entzerrung', version: 1, fotos })), 'fotos/a1.png': bytes(3) });
    const basis = { id: 'a1', name: 'Hof', mime: 'image/png', breite: 100, hoehe: 80 };
    // kaputte Bildgröße und kein JSON
    expect(() => entpacken(json([{ ...basis, breite: 'x' }]))).toThrow(/Bildgröße/);
    expect(() => entpacken(zipSync({ 'entzerrung.json': strToU8('{kein json') }))).toThrow(/beschädigt/);
    // doppelte Kennungen
    expect(() => entpacken(json([{ ...basis, ebenen: [{ id: 'a1' }] }]))).toThrow(/doppelte/);
    // alter bzw. von Hand bearbeiteter Stand: fehlende Teile ergänzt, Unbrauchbares verworfen
    const { doc } = entpacken(
      json([
        {
          ...basis,
          linse: { k1: null, k2: 0.01 },
          hilfslinien: [{ id: 'h', punkte: [{ x: 1, y: 2 }, { x: 'a', y: 3 }, null] }],
          ebenen: [
            {
              id: 'e1',
              methode: 'kreis',
              rechteck: { ecken: [{ x: 1, y: 1 }, { x: 2 }, { x: 3, y: 3 }], breite: -1 },
              passpunkte: [{ id: 'p1', bild: { x: 1, y: 1 }, x: 2, y: 'z' }, { id: 'p2' }],
              fluchtlinien: { waagerecht: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, { id: 'w2', a: { x: 0, y: 0 } }], masse: [{ id: 'm', a: { x: 0, y: 0 }, b: { x: 0, y: 1 }, laenge: 0 }] },
              ausschnitt: { x0: 0, y0: 0, x1: -1, y1: 1 },
              aufloesung: 'fein',
              messungen: [
                { id: 's1', art: 'strecke', name: 'A', punkte: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
                { id: 's2', art: 'flaeche', name: 'B', punkte: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
                { id: 's3', art: 'kreis', punkte: [] },
              ],
            },
          ],
        },
      ]),
    );
    const f = doc.fotos[0];
    expect(f.linse).toMatchObject({ k1: 0, k2: 0.01 });
    expect(f.hilfslinien[0].punkte).toEqual([{ x: 1, y: 2 }]);
    const e = f.ebenen[0];
    expect(e.methode).toBe('rechteck');
    expect(e.rechteck).toEqual({ ecken: [{ x: 1, y: 1 }, { x: 3, y: 3 }], breite: undefined, hoehe: undefined });
    expect(e.passpunkte).toEqual([{ id: 'p1', bild: { x: 1, y: 1 }, x: 2, y: undefined }]);
    expect(e.fluchtlinien.waagerecht.map((l) => l.id)).toEqual(['w1']);
    expect(e.fluchtlinien.senkrecht).toEqual([]);
    expect(e.fluchtlinien.masse[0].laenge).toBeUndefined();
    expect(e.ausschnitt).toBeUndefined();
    expect(e.aufloesung).toBeUndefined();
    expect(e.messungen.map((m) => m.id)).toEqual(['s1']);
    // ohne Ebenen: eine leere Ebene
    expect(entpacken(json([basis])).doc.fotos[0].ebenen).toHaveLength(1);
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

  it('JPEG-Dichte nur, wenn sie genau darstellbar ist (sonst kein falscher Maßstab)', () => {
    const jfif = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
    const kopf = (s: number) => {
      const r = jpegMitMassstab(jfif, s);
      return { kopf: [...r.daten.subarray(13, 18)], mit: r.mitMassstab };
    };
    expect(kopf(0.002)).toEqual({ kopf: [2, 0, 5, 0, 5], mit: true }); // 5 px/cm
    expect(kopf(0.0025)).toEqual({ kopf: [2, 0, 4, 0, 4], mit: true });
    expect(kopf(0.0254 / 300)).toEqual({ kopf: [1, 1, 44, 1, 44], mit: true }); // 300 dpi
    // Gegenproben: 3 mm/px (3,33 px/cm), 20 und 25 mm/px (unter 1 px/cm) – ohne Einheit, Verhältnis 1:1
    for (const s of [0.003, 0.02, 0.025]) expect(kopf(s)).toEqual({ kopf: [0, 0, 1, 0, 1], mit: false });
    expect(jpegDichte(0.003)).toBeNull();
    expect(jpegDichte(0.001)).toEqual({ einheit: 2, wert: 10 });
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
    // „passend“: mindestens so breit, dass der Plankopf Platz hat
    expect(pdfPlan(b, 100, 'passend').seite).toEqual([150 + 20, 70 + 20 + 26]);
    expect(pdfPlan(b, 20, 'passend').seite).toEqual([600 + 20, 350 + 20 + 26]);
  });

  it('Maßstabsleiste: Felder mindestens 8 mm, übliche Stufen', () => {
    expect(leistenFeld(50)).toBe(0.5); // 10 mm
    expect(leistenFeld(100)).toBe(1); // 10 mm
    expect(leistenFeld(20)).toBe(0.2); // 10 mm
    expect(leistenFeld(25)).toBe(0.2); // 8 mm
    for (const n of [1, 10, 50, 75, 125, 500, 2500]) {
      const mm = (leistenFeld(n) * 1000) / n;
      expect(mm).toBeGreaterThanOrEqual(8);
      expect(mm).toBeLessThan(25.1);
      expect(leistenBreite(n)).toBeCloseTo(4 * mm, 9);
    }
  });

  it('Plankopf: Leiste neben dem Titel, bei langem Titel darunter; nie über den Satzspiegel', () => {
    const zeilen = (titel: string) => [{ text: titel, groesse: 9, fett: true }, { text: 'M 1:50 · Maße in m', groesse: 6.5 }, { text: 'Hinweis', groesse: 6 }];
    const kurz = plankopfLayout(190, 50, zeilen('Fassade – Ebene 1'));
    expect(kurz.leiste.dy).toBeLessThan(0);
    expect(kurz.leiste.x + leistenBreite(50)).toBeCloseTo(10 + 190, 9);
    const lang = plankopfLayout(150, 50, zeilen('Projekt 2026-014 · Umbau und Erweiterung Wohnhaus Musterstraße · IMG_4711 – Ebene Straßenfassade'));
    expect(lang.leiste.dy).toBeGreaterThan(lang.zeilen[lang.zeilen.length - 1].y);
    expect(lang.leiste.x + leistenBreite(50)).toBeCloseTo(10 + 150, 9);
  });

  it('Ausgabe: Bereich auf ganze Pixel, Pixelmitte → Ebene, Bild im PDF genau im Maßstab', () => {
    const a = ausgabe({ x0: 1, y0: 2, x1: 11.001, y1: 8 }, 0.0025);
    expect(a.breite).toBe(4001);
    expect(a.hoehe).toBe(2400); // 6 m / 2,5 mm genau, kein Pixel mehr durch Rundung
    expect(a.bereich.x1).toBeCloseTo(1 + 4001 * 0.0025, 12);
    expect(a.bereich.y0).toBeCloseTo(8 - 2400 * 0.0025, 12);
    const p = abbilden(pixelZuEbene(a), { x: 0.5, y: 0.5 });
    expect(p.x).toBeCloseTo(1 + 0.00125, 12);
    expect(p.y).toBeCloseTo(8 - 0.00125, 12);
    // Bildbreite im PDF = Pixel · Auflösung · 1000 / Maßstab
    expect(pdfPlan(a.bereich, 50, 'A2').bild[0]).toBeCloseTo((a.breite * a.aufloesung * 1000) / 50, 9);
  });

  it('Ausgabe lehnt ungültige Bereiche und Auflösungen ab (keine Endlosschleife)', () => {
    expect(() => ausgabe({ x0: 0, y0: 0, x1: NaN, y1: 1 }, 0.001)).toThrow(/Ausschnitt/);
    expect(() => ausgabe({ x0: 0, y0: 0, x1: Infinity, y1: 1 }, 0.001)).toThrow(/Ausschnitt/);
    expect(() => ausgabe({ x0: 2, y0: 0, x1: 1, y1: 1 }, 0.001)).toThrow(/Ausschnitt/);
    expect(() => ausgabe({ x0: 0, y0: 0, x1: 1, y1: 1 }, 0)).toThrow(/Auflösung/);
    expect(() => ausgabe({ x0: 0, y0: 0, x1: 1, y1: 1 }, NaN)).toThrow(/Auflösung/);
    expect(ausgabe({ x0: 0, y0: 0, x1: 1, y1: 1 }, 0.01).breite).toBe(100);
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

  it('Entf auf einer Ecke löscht nichts; „Ecken neu setzen“ bleibt der Weg', () => {
    const s = mitFoto();
    s.setze({ werkzeug: 'ecken' });
    [{ x: 1, y: 9 }, { x: 9, y: 9 }, { x: 9, y: 1 }, { x: 1, y: 1 }].forEach((p) => klick(p));
    useEntz.getState().setze({ auswahl: { art: 'ecke', id: aktuell(useEntz.getState()).ebene!.id, index: 2 } });
    const vorher = useEntz.getState().doc;
    auswahlLoeschen();
    expect(useEntz.getState().doc).toBe(vorher);
    expect(aktuell(useEntz.getState()).ebene!.rechteck.ecken).toHaveLength(4);
    // Gegenprobe: eine Messung wird gelöscht
    useEntz.getState().setze({ werkzeug: 'strecke' });
    klick({ x: 2, y: 2 });
    klick({ x: 3, y: 3 });
    auswahlLoeschen();
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
