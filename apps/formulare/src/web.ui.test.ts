// @vitest-environment happy-dom
/**
 * Web-Version (ohne Projektordner): Formular per „Formular öffnen …“, Speichern heißt Herunterladen.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { useAntrag } from './antragStore';
import { umfangZeigen } from './components/Antrag';
import { useDateiMerkmale } from './merkmalWerte';
import { useFormulare } from './store';

const MUSTER = new Uint8Array(readFileSync(path.resolve(__dirname, '__fixtures__/muster.frmsjf')));

const datei = vi.hoisted(() => ({ bytes: null as Uint8Array | null, heruntergeladen: [] as string[] }));
vi.mock('@core/platform/files', async (original) => ({
  ...(await original<typeof import('@core/platform/files')>()),
  pickFile: async () => new File([datei.bytes as BlobPart], 'Bauantrag.frmsjf'),
  saveBinaryFile: async (o: { defaultName: string }) => {
    datei.heruntergeladen.push(o.defaultName);
    return true;
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  localStorage.clear();
  datei.bytes = MUSTER;
  datei.heruntergeladen = [];
  useFormulare.setState({ ds: null, projekt: null, offen: null, karte: null, haupt: 'formular', meldung: null, profile: {}, ansicht: 'felder', gliederungOffen: true, verlaufOffen: false });
  useAntrag.setState({ projektdatei: null });
  useDateiMerkmale.setState({ werte: {} });
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

const warte = async () => {
  for (let i = 0; i < 4; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};
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
const knopfGenau = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
const klick = async (el: HTMLElement) => {
  act(() => el.click());
  await warte();
};
const eingabe = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const feld = (host: Element, label: string, n = 0) => host.querySelectorAll<HTMLInputElement>(`[aria-label="${label}"]`)[n];
const oeffnen = async () => {
  await act(() => useFormulare.getState().dateiOeffnen());
  await warte();
};

describe('Web-Version', () => {
  it('„Festlegen …“ führt nicht in eine Sackgasse: ohne Projekt keine Projektkarte, Werkzeugleiste und Gliederung bleiben (B-03)', async () => {
    useFormulare.getState().profilSetzen('nw019999|2026A', {
      abschnitte: { '0:Panel1': { bedingung: { art: 'gruppe', op: 'oder', teile: [{ art: 'merkmal', merkmal: 'Gebäudeklasse', werte: ['3'] }] } } },
      zaehlt: {},
    });
    const host = await render();
    await oeffnen();
    expect(host.querySelector('.fo-gl-merkmal')!.textContent).toContain('Gebäudeklasse');
    // der Sprung in die Projektkarte gibt es ohne Projekt nicht
    expect(knopfGenau(host.querySelector('.fo-gl-merkmal')!, 'Festlegen …')).toBeUndefined();
    act(() => umfangZeigen());
    act(() => useFormulare.getState().setHaupt('projektkarte'));
    await warte();
    expect(useFormulare.getState().haupt).toBe('formular');
    expect(knopfGenau(host, 'Herunterladen')).toBeDefined();
    expect(host.querySelector('nav[aria-label="Inhalt des Formulars"]')).not.toBeNull();
  });

  it('Herunterladen meldet die neue Datei; die Originaldatei wieder geöffnet: Verlauf zeigt die Eingaben als „nicht in dieser Datei“ (B-08)', async () => {
    let host = await render();
    await oeffnen();
    eingabe(feld(host, 'Bauherrschaft', 1), 'Musterweg 7');
    await klick(knopfGenau(host, 'Herunterladen')!);
    expect(datei.heruntergeladen).toEqual(['Bauantrag.frmsjf']);
    const meldung = host.querySelector('.fo-meldung')!.textContent!;
    expect(meldung).toContain('heruntergeladen als „Bauantrag.frmsjf“ – bitte die neue Datei weiterverwenden');
    expect(meldung).not.toContain('gespeichert');
    // weiter in derselben Sitzung: Verlauf passt zur (heruntergeladenen) Fassung
    await klick(knopfGenau(host, 'Verlauf')!);
    expect(host.querySelectorAll('.fo-verlauf-liste .fo-verlauf-schritt')).toHaveLength(1);
    expect(host.querySelector('.fo-verlauf-frueher')).toBeNull();

    // neu laden und die alte Datei (ohne die Eingabe) öffnen
    act(() => root?.unmount());
    document.body.innerHTML = '';
    useFormulare.setState({ offen: null, meldung: null });
    host = await render();
    await oeffnen();
    expect(feld(host, 'Bauherrschaft', 1).value).toBe('');
    const frueher = host.querySelector('.fo-verlauf-frueher')!;
    expect(frueher.textContent).toContain('Frühere Sitzung – nicht in dieser Datei');
    expect(frueher.textContent).toContain('Musterweg 7');
    expect(host.querySelector('.fo-verlauf')!.textContent).toContain('Noch keine Eingaben.');
    // nicht zurückzunehmen
    expect(knopfGenau(host, 'Anfang (vor der ersten Eingabe)')).toBeUndefined();
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="Rückgängig"]')!.disabled).toBe(true);
  });

  it('Antragsmerkmal direkt im Formular festlegen: gilt für diese Datei, abhängige Felder wechseln von „offen“ (U-02)', async () => {
    useFormulare.getState().profilSetzen('nw019999|2026A', {
      abschnitte: {},
      zaehlt: {},
      bedingungen: { '0:Memo2': { art: 'gruppe', op: 'und', teile: [{ art: 'merkmal', merkmal: 'Gebäudeart', werte: ['Einfamilienhaus'], nicht: true }] } },
    });
    const host = await render();
    await act(() => useFormulare.getState().dateiOeffnen());
    await warte();
    await klick(knopfGenau(host, 'Formular')!);
    const memo2 = () => host.querySelector('.fo-papier [data-feld="0:Memo2"]')!;
    expect(memo2().classList.contains('offen')).toBe(true);
    const kasten = host.querySelector('.fo-gl-merkmal')!;
    expect(kasten.textContent).toContain('fehlt für diese Datei');
    // Auswahl mit Kurzerklärung
    const gruppe = kasten.querySelector('[aria-label="Gebäudeart festlegen"]')!;
    expect(gruppe.textContent).toContain('Art des Gebäudes');
    await klick(knopfGenau(gruppe, 'Einfamilienhaus')!);
    expect(host.querySelector('.fo-gl-merkmal')).toBeNull();
    expect(memo2().classList.contains('offen')).toBe(false);
    expect(memo2().classList.contains('entfaellt')).toBe(true);
    expect(JSON.parse(localStorage.getItem('formulare:merkmale-datei')!)).toEqual({ 'datei|Bauantrag.frmsjf': { Gebäudeart: 'Einfamilienhaus' } });
    expect(useAntrag.getState().projektdatei).toBeNull();

    // am offenen Feld: das Info-Symbol öffnet dieselbe Auswahl
    act(() => useDateiMerkmale.getState().setzen('datei|Bauantrag.frmsjf', 'Gebäudeart', ''));
    await warte();
    await klick(host.querySelector<HTMLButtonElement>('.fo-papier .fo-entfall-info.offen')!);
    const fenster = document.querySelector('.fo-gesetz')!;
    expect(fenster.textContent).toContain('Gebäudeart festlegen');
    // hier ohne Quelle: der Kopf nennt das Merkmal, die Zeile darunter wiederholt es nicht
    expect(fenster.querySelector('.modal-kopf')!.textContent).toBe('Gebäudeart festlegen');
    expect(fenster.querySelector('.fo-gesetz-merkmale strong')).toBeNull();
    await klick(knopfGenau(fenster.querySelector('[aria-label="Gebäudeart festlegen"]')!, 'Mehrfamilienhaus')!);
    expect(useDateiMerkmale.getState().werte['datei|Bauantrag.frmsjf']).toEqual({ Gebäudeart: 'Mehrfamilienhaus' });
    expect(memo2().classList.contains('offen') || memo2().classList.contains('entfaellt')).toBe(false);
  });
});
