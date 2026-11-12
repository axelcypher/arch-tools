// @vitest-environment happy-dom
/**
 * Widersprüche (U-04), Abgleich mit den Antragsmerkmalen (U-05) und Info-Symbole (U-06) an einem synthetischen
 * Bauantrag nach Anlage I/1 (nw010001, Vorgabe der App) in der Web-Version (Merkmale je Datei).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nw010001Leer } from './__fixtures__/synthetisch';
import { App } from './App';
import { useAntrag } from './antragStore';
import { VORBELEGT } from './merkmalAbgleich';
import { useDateiMerkmale } from './merkmalWerte';
import { useFeldFilter } from './pruefen';
import { useFormulare } from './store';

const datei = vi.hoisted(() => ({ bytes: null as Uint8Array | null }));
vi.mock('@core/platform/files', async (original) => ({
  ...(await original<typeof import('@core/platform/files')>()),
  pickFile: async () => new File([datei.bytes as BlobPart], 'Bauantrag.frmsjf'),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DATEI = 'datei|Bauantrag.frmsjf';
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  localStorage.clear();
  datei.bytes = nw010001Leer();
  useFormulare.setState({ ds: null, projekt: null, offen: null, karte: null, haupt: 'formular', meldung: null, profile: {}, ansicht: 'felder', gliederungOffen: true, verlaufOffen: false });
  useAntrag.setState({ projektdatei: null });
  useDateiMerkmale.setState({ werte: {} });
  useFeldFilter.setState({ filter: 'alle', suche: '' });
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

const warte = async () => {
  for (let i = 0; i < 4; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};
async function oeffnen(): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(createElement(App));
  });
  await act(() => useFormulare.getState().dateiOeffnen());
  await warte();
  return host;
}
const knopf = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;
const klick = async (el: HTMLElement) => {
  act(() => el.click());
  await warte();
};
const feld = (host: Element, schluessel: string) => host.querySelector<HTMLInputElement>(`[data-feld="${schluessel}"]`)!;
const gliederungsPunkt = (host: Element, titel: string) => [...host.querySelectorAll('.fo-gl-punkt')].find((p) => p.querySelector('.fo-gl-titel')?.textContent === titel)!;

describe('Widersprüchliche Kreuze (U-04)', () => {
  it('Bauantrag und Vorbescheid: Widerspruch am Abschnitt und in der Prüfliste; Felderansicht mit Optionsfeldern', async () => {
    let host = await oeffnen();
    // Entweder-oder als Optionsfelder: ein Klick wählt um
    expect(feld(host, '0:CheckBox1').type).toBe('radio');
    await klick(feld(host, '0:CheckBox1'));
    await klick(feld(host, '0:CheckBox2'));
    expect(feld(host, '0:CheckBox1').checked).toBe(false);
    expect(feld(host, '0:CheckBox2').checked).toBe(true);
    // Gebäudeklassen sind keine Optionsfelder
    expect(feld(host, '0:CheckBox4').type).toBe('checkbox');

    // aus der Datei beide angekreuzt: Kästchen statt Optionsfelder, Widerspruch gemeldet
    act(() => root?.unmount());
    datei.bytes = nw010001Leer({ '0:CheckBox1': true, '0:CheckBox2': true });
    host = await oeffnen();
    expect(feld(host, '0:CheckBox1').type).toBe('checkbox');
    const chip = gliederungsPunkt(host, 'Antrag').querySelector('.fo-gl-hinweise')!;
    expect(chip.classList.contains('fehler')).toBe(true);
    expect(chip.getAttribute('title')).toContain('mehr als eine Angabe');
    expect(host.querySelector('.fo-gl-pruefliste')!.textContent).toContain('1 Hinweis');
    await klick(knopf(host, 'Offene'));
    const hinweis = host.querySelector('.fo-pruef-zeile.hinweis.fehler')!;
    expect(hinweis.textContent).toContain('Widerspruch');
    expect(hinweis.textContent).toContain('„Bauantrag oder Antrag auf Vorbescheid“');
    expect(host.querySelector('.fo-feld .fo-entfall-info.hinweis.fehler')).not.toBeNull();
  });

  it('Gebäudeklasse 1 und 3: nur ein Hinweis, kein Widerspruch', async () => {
    datei.bytes = nw010001Leer({ '0:CheckBox4': true, '0:CheckBox6': true });
    const host = await oeffnen();
    const chip = gliederungsPunkt(host, 'Gebäudeklasse').querySelector('.fo-gl-hinweise')!;
    expect(chip.classList.contains('fehler')).toBe(false);
    expect(chip.getAttribute('title')).toBe('Mehrere Gebäudeklassen angekreuzt – umfasst der Antrag mehrere Gebäude?');
  });
});

describe('Formular und Antragsmerkmale abgleichen (U-05)', () => {
  it('leeres Kästchen aus dem Merkmal vorbelegt und gekennzeichnet – ein Schritt im Verlauf, rückgängig zu machen', async () => {
    useDateiMerkmale.getState().setzen(DATEI, 'Gebäudeklasse', '3');
    const host = await oeffnen();
    expect(feld(host, '0:CheckBox6').checked).toBe(true);
    expect(feld(host, '0:CheckBox6').closest('.fo-feld')!.classList.contains('vorbelegt')).toBe(true);
    const o = useFormulare.getState().offen!;
    expect(o.verlauf.schritte.map((s) => s.titel)).toEqual([VORBELEGT]);
    expect(o.aenderungen).toEqual({ '0:CheckBox6': true });
    await klick(host.querySelector<HTMLButtonElement>('button[aria-label="Rückgängig"]')!);
    expect(feld(host, '0:CheckBox6').checked).toBe(false);
    // die Vorbelegung kommt nicht ungefragt wieder
    await warte();
    expect(feld(host, '0:CheckBox6').checked).toBe(false);
  });

  it('bereits angekreuzt: nichts überschrieben, die Abweichung erscheint in der Prüfliste und am Feld', async () => {
    datei.bytes = nw010001Leer({ '0:CheckBox4': true });
    useDateiMerkmale.getState().setzen(DATEI, 'Gebäudeklasse', '3');
    const host = await oeffnen();
    expect(feld(host, '0:CheckBox4').checked).toBe(true);
    expect(feld(host, '0:CheckBox6').checked).toBe(false);
    expect(useFormulare.getState().offen!.aenderungen).toEqual({});
    expect(host.querySelector('.fo-gl-pruefliste')!.textContent).toContain('1 Hinweis');
    const symbol = feld(host, '0:CheckBox4').closest('.fo-feld')!.querySelector('.fo-entfall-info.hinweis')!;
    expect(symbol.getAttribute('aria-label')).toBe('Hinweis: Projekt: GK 3, Formular: GK 1');
  });

  it('beim Ankreuzen von Hand: „Gebäudeklasse 4 als Antragsmerkmal übernehmen?“ – mit Rückfrage', async () => {
    const host = await oeffnen();
    await klick(feld(host, '0:CheckBox7'));
    const dialog = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].find((d) => d.textContent?.includes('als Antragsmerkmal übernehmen?'))!;
    expect(dialog.textContent).toContain('Gebäudeklasse 4 als Antragsmerkmal übernehmen?');
    await klick(knopf(dialog, 'Übernehmen'));
    expect(useDateiMerkmale.getState().werte[DATEI]).toEqual({ Gebäudeklasse: '4' });
  });
});

describe('Info-Symbole (U-06)', () => {
  it('leeres Formular: deutlich weniger Symbole als entfallende Felder – ein Abschnitt aus demselben Grund hat genau eines', async () => {
    const host = await oeffnen();
    await klick(knopf(host, 'Formular'));
    const seite2 = host.querySelector('.fo-blatt[data-seite="1"]')!;
    // alle neun Unterlagen entfallen ohne Bauantrag – ein Symbol am Abschnitt
    expect(seite2.querySelectorAll('.fo-check.entfaellt')).toHaveLength(9);
    expect(seite2.querySelectorAll('.fo-entfall-info')).toHaveLength(1);
    expect(host.querySelectorAll('.fo-entfall-info').length).toBeLessThan(host.querySelectorAll('.entfaellt, .offen').length / 3);
  });

  it('per Tastatur erreichbar: im Tab-Ablauf, F1 im Feld zeigt den Hinweis, Esc führt zurück', async () => {
    datei.bytes = nw010001Leer({ '0:CheckBox1': true });
    const host = await oeffnen();
    await klick(knopf(host, 'Formular'));
    const symbol = host.querySelector<HTMLButtonElement>('.fo-blatt[data-seite="1"] .fo-entfall-info')!;
    expect(symbol.tabIndex).toBeGreaterThanOrEqual(0);
    // F1 in „Maß der baulichen Nutzung“ (offen: Planungsrecht fehlt)
    const mass = feld(host, '1:CheckBox2');
    act(() => mass.focus());
    act(() => {
      mass.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true, cancelable: true }));
    });
    const aktiv = document.activeElement as HTMLElement;
    expect(aktiv.classList.contains('fo-entfall-info')).toBe(true);
    expect(aktiv.dataset.info!.split(' ')).toContain('1:CheckBox2');
    expect(document.querySelector('.fo-tipp')!.textContent).toContain('Offen – hängt ab von: Planungsrecht');
    act(() => {
      aktiv.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(mass);
  });

  it('klein: Symbol höchstens 13 px (Trefferfläche über das Polster)', () => {
    const css = readFileSync(path.resolve(__dirname, 'styles.css'), 'utf8');
    const regel = (sel: string) => new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`).exec(css)?.[2] ?? '';
    for (const sel of ['.fo-entfall-info', '.fo-entfall-info svg']) {
      const r = regel(sel);
      for (const m of r.matchAll(/(?:^|\s)(width|height):\s*(\d+)px/g)) expect(Number(m[2]), `${sel} ${m[1]}`).toBeLessThanOrEqual(13);
      expect(r).toMatch(/width:\s*\d+px/);
    }
  });
});
