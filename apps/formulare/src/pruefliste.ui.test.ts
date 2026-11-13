// @vitest-environment happy-dom
/**
 * Prüfliste „Was fehlt noch?“ (U-03) an einem synthetischen Bauantrag nach Anlage I/1 (nw010001, Vorgabe der App).
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nw010001Leer } from './__fixtures__/synthetisch';
import { App } from './App';
import { useAntrag } from './antragStore';
import { formularBytes, parseFormular } from './forma/formular';
import { useDateiMerkmale } from './merkmalWerte';
import { useFeldFilter } from './pruefen';
import { useFormulare } from './store';

const datei = vi.hoisted(() => ({ bytes: null as Uint8Array | null }));
vi.mock('@core/platform/files', async (original) => ({
  ...(await original<typeof import('@core/platform/files')>()),
  pickFile: async () => new File([datei.bytes as BlobPart], 'Bauantrag.frmsjf'),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
const zeilen = (host: Element) => [...host.querySelectorAll('.fo-pruef-zeile')].map((z) => z.querySelector('strong')!.textContent);

describe('Prüfliste „Was fehlt noch?“ (U-03)', () => {
  it('das synthetische Formular lässt sich verlustfrei zurückschreiben', () => {
    const bytes = nw010001Leer();
    expect(formularBytes(parseFormular(bytes))).toEqual(bytes);
  });

  it('Filter „Offene“: genau was im Füllstand fehlt – ohne Behördenfelder und entfallene, Gruppen als eine Zeile', async () => {
    const host = await oeffnen();
    expect(useFormulare.getState().offen?.nurLesen).toBeNull();
    await klick(knopf(host, 'Offene'));
    expect(zeilen(host)).toEqual(['Untere Bauaufsichtsbehörde (Anschrift)', 'Bauantrag oder Antrag auf Vorbescheid', 'Bauherrschaft: Name, Vorname, Firma', 'Gebäudeklasse']);
    // nicht: Aktenzeichen der Behörde (zählt nicht), die Unterlagen (entfallen ohne Bauantrag)
    expect(host.querySelector('.fo-pruefliste')!.textContent).not.toContain('Aktenzeichen');
    expect(knopf(host, 'Offene').textContent).toBe('Offene (4)');
    // in der Gliederung: die Prüfliste im Kopf
    expect(host.querySelector('.fo-gl-pruefliste')!.textContent).toContain('4 offen');

    // eine Gebäudeklasse angekreuzt: die Zeile verschwindet
    const gk = [...host.querySelectorAll<HTMLLabelElement>('.fo-pruef-zeile label')].find((l) => l.textContent?.includes('Gebäudeklasse 3'))!;
    await klick(gk.querySelector('input')!);
    expect(zeilen(host)).not.toContain('Gebäudeklasse');
    expect(zeilen(host)).toHaveLength(3);

    // Bauantrag angekreuzt: die Unterlagen kommen dazu – die vom Planungsrecht usw. abhängigen als „ungeklärt“
    const ba = [...host.querySelectorAll<HTMLLabelElement>('.fo-pruef-zeile label')].find((l) => l.textContent?.includes('Bauantrag'))!;
    await klick(ba.querySelector('input')!);
    expect(zeilen(host)).toContain('Nr. 1 Lageplan / amtlicher Lageplan (3-fach)');
    const flurkarte = [...host.querySelectorAll('.fo-pruef-zeile')].find((z) => z.textContent?.includes('Nr. 3 Beglaubigter Auszug'))!;
    expect(flurkarte.classList.contains('ungeklaert')).toBe(true);
    expect(flurkarte.querySelector('.fo-gl-offen')!.getAttribute('title')).toContain('Planungsrecht');
    expect(host.querySelector('.fo-gl-pruefliste')!.textContent).toMatch(/\d+ offen\d+ ungeklärt/);
    // Feldansicht zählt wie die Gliederung: „offen“ ohne die ungeklärten, diese getrennt
    const [, offenGl, ungeklaertGl] = /(\d+) offen(\d+) ungeklärt/.exec(host.querySelector('.fo-gl-pruef-zahl')!.textContent!)!;
    expect(knopf(host, 'Offene').textContent).toBe(`Offene (${offenGl}) · ${ungeklaertGl} ungeklärt`);
  });

  it('„Nächste offene Angabe“ (Knopf und F8) springt zum ersten offenen Feld, dann weiter', async () => {
    const host = await oeffnen();
    await klick(knopf(host.querySelector('.fo-felder-kopf')!, 'Nächste offene Angabe'));
    expect((document.activeElement as HTMLElement).dataset.feld).toBe('0:Memo1');
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8', bubbles: true, cancelable: true }));
    });
    await warte();
    // weiter zur nächsten: Antragsart (das erste Kästchen der Gruppe)
    expect((document.activeElement as HTMLElement).dataset.feld).toBe('0:CheckBox1');
  });

  it('Suche: Seiten ohne Treffer fallen weg, die Trefferzahl steht daneben', async () => {
    const host = await oeffnen();
    act(() => useFeldFilter.getState().setSuche('Basiskarte'));
    await warte();
    expect([...host.querySelectorAll('.fo-seite-felder')].map((s) => s.getAttribute('data-seite'))).toEqual(['1']);
    expect(host.querySelector('.fo-treffer')!.textContent).toBe('1 Treffer');
    act(() => useFeldFilter.getState().setSuche('gibt es nicht'));
    await warte();
    expect(host.querySelectorAll('.fo-seite-felder')).toHaveLength(0);
    expect(host.textContent).toContain('Keine passenden Felder.');
  });
});
