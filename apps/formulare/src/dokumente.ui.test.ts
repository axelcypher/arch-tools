// @vitest-environment happy-dom
import ExcelJS from 'exceljs';
import { strToU8, zipSync } from 'fflate';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { SpeicherDateisystem } from './dateisystem';
import { docxLesen } from './dokumente/docx';
import { xlsxLesen } from './dokumente/xlsx';
import { cp1252Schreiben } from './forma/cp1252';
import { useFormulare } from './store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORDNER = 'Z:/Projekte/BS9 Musterstraße 9';
const MAPPE = `${ORDNER}/Berechnungen/Flächen.xlsx`;
const BRIEF = `${ORDNER}/Berechnungen/Baubeschreibung.docx`;

async function mappe(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Flächen');
  ws.getCell('A1').value = 'Raum';
  ws.getCell('B1').value = 'Fläche';
  ws.getCell('A2').value = 'Wohnen';
  ws.getCell('B2').value = 24.5;
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

function brief(): Uint8Array {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    '_rels/.rels': strToU8(
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    'word/document.xml': strToU8(`<?xml version="1.0"?><w:document ${W}><w:body><w:p><w:r><w:t>Bauherr: Max Mustermann</w:t></w:r></w:p></w:body></w:document>`),
  });
}

let ds: SpeicherDateisystem;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(async () => {
  localStorage.clear();
  ds = new SpeicherDateisystem({ benutzer: 't.test', computer: 'HELEN', prozess: 4242 });
  ds.dateien.set('C:/FORMA/BS9/001-Muster.frmsjf', new Uint8Array([1]));
  ds.dateien.set('C:/FORMA/BS9/sj_office.ini', cp1252Schreiben('[Allgemeines]\r\nText=Musterstraße 9\r\n\r\n'));
  ds.dateien.set(MAPPE, await mappe());
  ds.dateien.set(BRIEF, brief());
  useFormulare.setState({
    ds,
    projektordner: ['C:/FORMA'],
    ablageordner: ['Z:/Projekte'],
    vorgabeAuswahl: ['Berechnungen'],
    auswahl: {},
    projekte: [],
    projekt: null,
    formulare: [],
    offen: null,
    karte: null,
    datei: null,
    dateiEntwuerfe: {},
    haupt: 'formular',
    meldung: null,
  });
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

const warte = () => act(async () => new Promise((r) => setTimeout(r, 0)));
const knopf = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement;
const knopfGenau = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement;
const klick = async (el: HTMLElement) => {
  act(() => el.click());
  await warte();
};
const taste = (el: EventTarget, key: string) => act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
const eingabe = (el: HTMLInputElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

async function oeffne(datei: string): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(createElement(App));
  });
  await warte();
  await klick(knopf(host, 'BS9'));
  await warte();
  await klick(knopf(host, 'Berechnungen'));
  await warte();
  await klick(knopf(host, datei));
  await warte();
  return host;
}

describe('Dokumente aus dem Projektordner', () => {
  it('Excel: Zelle wählen, tippen, Enter – gespeichert wird nur die Zelle', async () => {
    const host = await oeffne('Flächen.xlsx');
    expect(host.querySelector('.dok-art')!.textContent).toBe('Excel');
    const b2 = host.querySelector<HTMLElement>('[data-zelle="B2"]')!;
    expect(b2.textContent).toBe('24,5');
    await klick(b2);
    taste(host.querySelector('.xl-flaeche')!, '3');
    await warte();
    const feld = host.querySelector<HTMLInputElement>('.xl-zellen-eingabe')!;
    eingabe(feld, '30,25');
    taste(feld, 'Enter');
    await warte();
    expect(host.querySelector('[data-zelle="B2"]')!.classList.contains('geaendert')).toBe(true);
    expect(host.textContent).toContain('1 Zelle(n) geändert');
    // Seitenleiste markiert die ungespeicherte Datei
    expect(knopf(host, 'Flächen.xlsx').textContent).toContain('●');

    await klick(knopfGenau(host, 'Speichern'));
    expect(ds.schreibvorgaenge).toEqual(['dokument Berechnungen/Flächen.xlsx']);
    const neu = xlsxLesen(ds.dateien.get(MAPPE)!);
    expect(neu.blaetter[0].zellen.get('B2')!.eingabe).toBe('30,25');
    expect(neu.blaetter[0].zellen.get('A2')!.eingabe).toBe('Wohnen');
    expect(host.textContent).toContain('Flächen.xlsx gespeichert');
  });

  it('Excel: in Excel geöffnet – nur ansehen', async () => {
    ds.dateien.set(`${ORDNER}/Berechnungen/~$Flächen.xlsx`, new Uint8Array([1]));
    const host = await oeffne('Flächen.xlsx');
    expect(host.textContent).toContain('Nur ansehen: Die Mappe ist gerade in Excel geöffnet.');
    // die Besitzerdatei selbst erscheint nicht im Ordnerbaum
    expect(knopf(host, '~$Flächen')).toBeUndefined();
    expect(knopfGenau(host, 'Speichern')).toBeUndefined();
  });

  it('Word: Text bearbeiten und speichern; außerhalb geändert → nicht überschreiben', async () => {
    const host = await oeffne('Baubeschreibung.docx');
    expect(host.querySelector('.wd-blatt')!.textContent).toContain('Bauherr: Max Mustermann');
    await klick(knopfGenau(host, 'Text bearbeiten'));
    const lauf = host.querySelector<HTMLElement>('.wd-lauf')!;
    act(() => {
      lauf.textContent = 'Bauherrin: Erika Mustermann';
      lauf.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await warte();
    // in der Zwischenzeit speichert jemand anderes die Datei
    const vonAussen = brief();
    vonAussen[vonAussen.length - 1] ^= 0;
    ds.dateien.set(BRIEF, new Uint8Array([...vonAussen, 0]));
    await klick(knopfGenau(host, 'Speichern'));
    expect(host.textContent).toContain('seit dem Öffnen außerhalb geändert');
    expect(ds.schreibvorgaenge).toEqual([]);

    ds.dateien.set(BRIEF, brief());
    await klick(knopfGenau(host, 'Neu laden'));
    // die Bearbeitung bleibt als Entwurf erhalten
    expect(host.querySelector('.wd-blatt')!.textContent).toContain('Bauherrin: Erika Mustermann');
    await klick(knopfGenau(host, 'Speichern'));
    expect(docxLesen(ds.dateien.get(BRIEF)!).texte).toEqual(['Bauherrin: Erika Mustermann']);
  });
});
