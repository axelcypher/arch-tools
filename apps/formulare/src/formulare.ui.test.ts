// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { SpeicherDateisystem } from './dateisystem';
import { cp1252Lesen, cp1252Schreiben } from './forma/cp1252';
import { mitAenderungen, useFormulare } from './store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MUSTER = new Uint8Array(readFileSync(path.resolve(__dirname, '__fixtures__/muster.frmsjf')));
const FORMULAR = 'C:/FORMA/BS9/001-Muster.frmsjf';
const SPERRE = 'C:/FORMA/BS9/001-Muster.frmtmp';

let ds: SpeicherDateisystem;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  localStorage.clear();
  ds = new SpeicherDateisystem({ benutzer: 't.test', computer: 'HELEN', prozess: 4242 });
  ds.dateien.set(FORMULAR, MUSTER);
  ds.dateien.set('C:/FORMA/BS9/sj_office.ini', cp1252Schreiben('[Allgemeines]\r\nText=Musterstraße 9\r\n\r\n'));
  ds.dateien.set('C:/FORMA/BS9/sj_prokarte.sdb', new Uint8Array([1]));
  ds.dateien.set('C:/FORMA/BS9/_archiv/000-Alt.frmsjf', MUSTER);
  ds.dateien.set('C:/FORMA/Sonstiges/notiz.txt', new Uint8Array([1]));
  useFormulare.setState({ ds, projektordner: ['C:/FORMA'], projekte: [], projekt: null, formulare: [], offen: null, konflikt: false, meldung: null, ansicht: 'felder' });
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

/** wartet, bis die (im Speicher sofort erledigten) Dateizugriffe durch sind */
const warte = () => act(async () => new Promise((r) => setTimeout(r, 0)));

async function render(): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(createElement(App));
  });
  await warte();
  return host;
}

const knopf = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement;
const klick = async (el: HTMLElement) => {
  act(() => el.click());
  await warte();
};
/** Eingabe wie von Hand */
const eingabe = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const feld = (host: Element, label: string, n = 0) => host.querySelectorAll<HTMLInputElement>(`[aria-label="${label}"]`)[n];
const kreuz = (host: Element, beschriftung: string) =>
  [...host.querySelectorAll('label.fo-kreuz')].find((l) => l.textContent === beschriftung)!.querySelector('input') as HTMLInputElement;

async function oeffneMuster(): Promise<HTMLElement> {
  const host = await render();
  await klick(knopf(host, 'BS9'));
  await klick(knopf(host, '001-Muster'));
  return host;
}

describe('Formulare', () => {
  it('findet Projekte mit Titel und ihre Formulare (ohne Archiv)', async () => {
    const host = await render();
    expect(knopf(host, 'BS9').textContent).toContain('Musterstraße 9');
    expect(knopf(host, 'Sonstiges')).toBeUndefined();
    await klick(knopf(host, 'BS9'));
    expect(knopf(host, '001-Muster')).toBeDefined();
    expect(knopf(host, '000-Alt')).toBeUndefined();
  });

  it('sperrt beim Öffnen, speichert nur die geänderten Wertzeilen und entsperrt beim Schließen', async () => {
    const host = await oeffneMuster();
    const sperre = cp1252Lesen(ds.dateien.get(SPERRE)!);
    expect(sperre).toMatch(/^\[Zugriff\]\r\nUser=t\.test\r\nComputer=HELEN\r\nAngemeldet=\d\d\.\d\d\.\d{4} \d\d:\d\d:\d\d\r\nInGebrauch=4242\r\n\r\n$/);

    expect(feld(host, 'Bauherrschaft', 0).value).toBe('Mustermann, Max');
    eingabe(feld(host, 'Bauherrschaft', 1), 'Musterweg 7');
    act(() => kreuz(host, 'Sonderbau').click());
    act(() => kreuz(host, 'Wohngebäude').click());
    expect(host.textContent).toContain('3 Feld(er) geändert');
    expect(ds.dateien.get(FORMULAR)).toBe(MUSTER);

    await klick(knopf(host, 'Speichern'));
    const gespeichert = ds.dateien.get(FORMULAR)!;
    expect(gespeichert).toEqual(mitAenderungen(MUSTER, { '0:Memo2': 'Musterweg 7', '0:CheckBox2': true, '0:CheckBox1': false }));
    const text = new TextDecoder().decode(gespeichert);
    expect(text).toContain("          Lines.Strings = (\r\n            'Musterweg 7')\r\n          ParentFont = False");
    expect(gespeichert.length - MUSTER.length).toBe("          Lines.Strings = (\r\n            'Musterweg 7')\r\n".length);
    expect(host.textContent).toContain('gespeichert');
    expect(knopf(host, 'Speichern').disabled).toBe(true);

    await klick(knopf(host, 'BS9'));
    expect(ds.dateien.has(SPERRE)).toBe(false);
    expect(ds.schreibvorgaenge).toEqual(['sperre BS9/001-Muster.frmtmp', 'ersetze BS9/001-Muster.frmsjf', 'entsperre BS9/001-Muster.frmtmp']);
  });

  it('ist das Formular in FORMA geöffnet, lässt es sich nur ansehen', async () => {
    const fremd = cp1252Schreiben('[Zugriff]\r\nUser=kollegin\r\nComputer=CAD02\r\nAngemeldet=09.11.2026 10:17:12\r\nInGebrauch=67802\r\n\r\n');
    ds.dateien.set(SPERRE, fremd);
    const host = await oeffneMuster();
    expect(host.textContent).toContain('Nur ansehen: Das Formular ist bei kollegin auf CAD02 geöffnet (seit 09.11.2026 10:17:12).');
    expect(feld(host, 'Bauherrschaft', 1).disabled).toBe(true);
    expect(knopf(host, 'Speichern').disabled).toBe(true);
    await klick(knopf(host, 'BS9'));
    expect(ds.dateien.get(SPERRE)).toBe(fremd);
    expect(ds.schreibvorgaenge).toEqual([]);
  });

  it('wurde die Datei inzwischen geändert, wird erst nach dem Neuladen gespeichert – mit beiden Änderungen', async () => {
    const host = await oeffneMuster();
    eingabe(feld(host, 'Bauherrschaft', 1), 'Musterweg 7');
    const vonFORMA = mitAenderungen(MUSTER, { '0:CheckBox4': true });
    ds.dateien.set(FORMULAR, vonFORMA);

    await klick(knopf(host, 'Speichern'));
    expect(ds.dateien.get(FORMULAR)).toBe(vonFORMA);
    expect(host.textContent).toContain('seit dem Öffnen außerhalb geändert');

    await klick(knopf(host, 'Neu laden'));
    expect(feld(host, 'Bauherrschaft', 1).value).toBe('Musterweg 7');
    await klick(knopf(host, 'Speichern'));
    expect(ds.dateien.get(FORMULAR)).toEqual(mitAenderungen(MUSTER, { '0:CheckBox4': true, '0:Memo2': 'Musterweg 7' }));
  });

  it('nicht gespeicherte Eingaben bleiben als Entwurf erhalten', async () => {
    let host = await oeffneMuster();
    eingabe(feld(host, 'Bauherrschaft', 1), 'Musterweg 7');
    await klick(knopf(host, 'BS9'));
    expect(knopf(host, '001-Muster').textContent).toContain('●');
    act(() => root?.unmount());
    document.body.innerHTML = '';

    useFormulare.setState({ projekt: null, formulare: [], offen: null, meldung: null });
    host = await oeffneMuster();
    expect(feld(host, 'Bauherrschaft', 1).value).toBe('Musterweg 7');
    expect(host.textContent).toContain('1 nicht gespeicherte Eingabe(n) vom letzten Mal wiederhergestellt');
    expect(ds.dateien.get(FORMULAR)).toBe(MUSTER);
  });

  it('Seitenansicht zeigt alle Felder an ihrer Stelle', async () => {
    const host = await oeffneMuster();
    await klick(knopf(host, 'Seite'));
    expect(host.querySelectorAll('textarea.fo-memo')).toHaveLength(3);
    expect(host.querySelectorAll('label.fo-check input')).toHaveLength(4);
    const memo = host.querySelector<HTMLTextAreaElement>('textarea.fo-memo')!;
    expect([memo.style.left, memo.style.top, memo.value]).toEqual(['5px', '40px', 'Mustermann, Max']);
    eingabe(memo, 'Musterfrau, Erika');
    await klick(knopf(host, 'Felder'));
    expect(feld(host, 'Bauherrschaft', 0).value).toBe('Musterfrau, Erika');
  });
});
