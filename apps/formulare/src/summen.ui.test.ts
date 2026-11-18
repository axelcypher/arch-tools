// @vitest-environment happy-dom
/**
 * Summenfelder im offenen Formular (summen.ts): Stellplätze der Baubeschreibung (nw010010) rechnen sich beim Tippen,
 * sind schreibgeschützt mit Herkunft, eine abweichende Summe aus der Datei bleibt mit Hinweis stehen, und die Summe
 * landet in der Datei.
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { synthetischesFormular } from './__fixtures__/synthetisch';
import { App } from './App';
import { useAntrag } from './antragStore';
import { felderDerSeite } from './forma/felder';
import { parseFormular } from './forma/formular';
import { useDateiMerkmale } from './merkmalWerte';
import { useFeldFilter } from './pruefen';
import { mitAenderungen, useFormulare, wertVon } from './store';

const datei = vi.hoisted(() => ({ bytes: null as Uint8Array | null }));
vi.mock('@core/platform/files', async (original) => ({
  ...(await original<typeof import('@core/platform/files')>()),
  pickFile: async () => new File([datei.bytes as BlobPart], 'Baubeschreibung.frmsjf'),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const memo = (name: string, text: string) => ({ art: 'memo' as const, name, text });
/** Baubeschreibung mit Nr. 5 (Stellplätze, Seite 1) und Nr. 7 (Fahrradstellplätze, Seite 2) */
const baubeschreibung = (werte: Record<string, string> = {}) =>
  synthetischesFormular(
    'nw010010',
    '2024G',
    [
      [
        {
          name: 'Panel11',
          titel: 'Anzahl der notwendigen Stellplätze',
          felder: [memo('Memo12', 'in Garagen'), memo('Memo13', 'im Freien'), memo('Memo14', 'Summe'), memo('Memo15', 'Baulast'), memo('Memo16', 'Ablösung'), memo('Memo17', 'insgesamt')],
        },
      ],
      [
        {
          name: 'Panel2',
          titel: 'Anzahl der notwendigen Fahrradstellplätze',
          felder: [memo('Memo3', 'in Garagen'), memo('Memo4', 'im Freien'), memo('Memo5', 'Summe'), memo('Memo6', 'Baulast'), memo('Memo7', 'Ablösung'), memo('Memo8', 'insgesamt')],
        },
      ],
    ],
    werte,
  );

let root: ReturnType<typeof createRoot> | null = null;
beforeEach(() => {
  localStorage.clear();
  datei.bytes = baubeschreibung();
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
const offen = () => useFormulare.getState().offen!;
const feldVon = (s: string) =>
  offen()
    .felder.flat()
    .find((f) => f.schluessel === s)!;
const wert = (s: string) => wertVon(offen(), feldVon(s));
const tippe = async (s: string, w: string) => {
  act(() => useFormulare.getState().wertSetzen(feldVon(s), w));
  await warte();
};
const eingabe = (host: Element, s: string) => host.querySelector<HTMLInputElement>(`[data-feld="${s}"]`)!;
/** Text der Hinweise am Abschnitt (Zähler in der Gliederung) */
const hinweise = (host: Element) => [...host.querySelectorAll('.fo-gl-hinweise')].map((h) => h.getAttribute('title') ?? '').join('\n');

describe('Summenfelder der Stellplätze (Baubeschreibung)', () => {
  it('rechnen beim Tippen, sind schreibgeschützt und nennen ihre Herkunft; leer bleibt leer', async () => {
    const host = await oeffnen();
    expect(wert('0:Memo14')).toBe('');
    await tippe('0:Memo12', '2');
    expect([wert('0:Memo14'), wert('0:Memo17')]).toEqual(['2', '2']);
    await tippe('0:Memo13', '3 ');
    await tippe('0:Memo16', '1');
    expect([wert('0:Memo14'), wert('0:Memo17')]).toEqual(['5', '6']);
    const summe = eingabe(host, '0:Memo14');
    expect(summe.value).toBe('5');
    // schreibgeschützt, aber fokussierbar (und Tab-Stopp); die kurze Herkunft hängt am Feld, die lange steht im Tooltip
    expect([summe.readOnly, summe.disabled, summe.tabIndex]).toEqual([true, false, 0]);
    const herkunft = summe.closest('.fo-feld')!.querySelector('.field-hint')!;
    expect(herkunft.textContent).toBe('Summe aus „in Garagen“ und „im Freien“');
    expect(summe.getAttribute('aria-describedby')).toBe(herkunft.id);
    expect(summe.closest('.fo-feld')!.getAttribute('title')).toContain('Summe aus „Stellplätze auf dem Baugrundstück: in Garagen“');
    // Rückgängig und Wiederholen: die Summe folgt den Angaben
    act(() => void useFormulare.getState().rueckgaengig());
    await warte();
    expect([wert('0:Memo14'), wert('0:Memo17')]).toEqual(['5', '5']);
    act(() => void useFormulare.getState().wiederholen());
    await warte();
    expect([wert('0:Memo14'), wert('0:Memo17')]).toEqual(['5', '6']);
    // mehrere Angaben in einem Schritt
    act(() =>
      useFormulare.getState().werteSetzen(
        [
          { feld: feldVon('0:Memo12'), wert: '10' },
          { feld: feldVon('0:Memo15'), wert: '2' },
        ],
        'Test',
      ),
    );
    await warte();
    expect([wert('0:Memo14'), wert('0:Memo17')]).toEqual(['13', '16']);
    // Angaben auf dem Grundstück geleert: Summe dort leer, nicht 0 – „insgesamt“ zählt Baulast und Ablösung weiter
    for (const s of ['0:Memo12', '0:Memo13']) await tippe(s, '');
    expect([wert('0:Memo14'), wert('0:Memo17')]).toEqual(['', '3']);
    for (const s of ['0:Memo15', '0:Memo16']) await tippe(s, '');
    expect([wert('0:Memo14'), wert('0:Memo17')]).toEqual(['', '']);
  });

  it('Summenfelder nehmen keine Eingaben an – nur „Neu berechnen“ schreibt dort', async () => {
    await oeffnen();
    await tippe('0:Memo12', '2');
    await tippe('0:Memo14', '9');
    expect(wert('0:Memo14')).toBe('2');
    await tippe('0:Memo12', '');
    act(() => useFormulare.getState().feldVerlassen(feldVon('0:Memo14')));
    await warte();
    expect(wert('0:Memo14')).toBe('');
  });

  it('im Vordruck gesperrte Felder: schreibgeschützt (fokussierbar), kein Tab-Stopp, neutraler Hinweis – und ohne Eingaben', async () => {
    // Blatt 2: eine freie Angabe, die gesperrte Kopfzeile (mit Zuordnung zur Projektkarte) und noch eine freie Angabe
    datei.bytes = synthetischesFormular(
      'nw010010',
      '2024G',
      [
        [],
        [
          {
            name: 'Panel1',
            titel: 'Kopf Blatt 2',
            felder: [
              { art: 'memo', name: 'Memo2', text: 'Bauantrag vom' },
              { art: 'memo', name: 'Memo1', text: 'Bauherrschaft', berechnet: true },
              { art: 'memo', name: 'Memo3', text: 'in Garagen' },
            ],
          },
        ],
      ],
      {},
      { 1: ['Memo1=0201aedt040', 'Memo3=0201aedt040'] },
    );
    const host = await oeffnen();
    const kopf = eingabe(host, '1:Memo1');
    expect([kopf.readOnly, kopf.disabled, kopf.classList.contains('berechnet'), kopf.tabIndex]).toEqual([true, false, true, -1]);
    // Herkunft am Feld, neutral (der Vordruck sperrt auch Felder, die die Behörde ausfüllt); kein anderes Programm genannt
    const hinweis = document.getElementById(kopf.getAttribute('aria-describedby')!)!;
    expect(hinweis.textContent).toBe('Im Vordruck gesperrt');
    expect(kopf.closest('.fo-feld')!.getAttribute('title')).toBe('Bauherrschaft (Blatt 2) – Im Vordruck schreibgeschützt – hier nicht einzutragen');
    expect(host.textContent).not.toContain('FORMA');
    // Tab überspringt das gesperrte Feld (die App steuert Tab selbst)
    eingabe(host, '1:Memo2').focus();
    act(() => void eingabe(host, '1:Memo2').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(eingabe(host, '1:Memo3'));
    // Eingabe und Verlassen tragen nichts ein – auch nicht den Wert aus der Projektkarte, den ein freies Feld bekommt
    const projekt = { root: 'C:/Projekte', ordner: 'BS9', titel: 'Muster' };
    useFormulare.setState({
      offen: { ...offen(), projekt },
      karte: {
        projekt,
        karte: { gruppen: [{ id: 201, typ: 1, text: 'Bauherr' }], eintraege: [{ gruppe: 201, id: 40, typ: 1, titel: 'Name/Firma:', text: 'Mustermann', zahl: null }] },
        aenderungen: {},
        verlauf: { schritte: [], position: 0 },
        gesichert: null,
      },
    });
    await tippe('1:Memo1', 'X');
    act(() => useFormulare.getState().feldVerlassen(feldVon('1:Memo1')));
    act(() => useFormulare.getState().feldVerlassen(feldVon('1:Memo3')));
    await warte();
    expect([wert('1:Memo1'), wert('1:Memo3')]).toEqual(['', 'Mustermann']);
  });

  it('Summenfelder bleiben Tab-Stopps', async () => {
    const host = await oeffnen();
    eingabe(host, '0:Memo13').focus();
    act(() => void eingabe(host, '0:Memo13').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(eingabe(host, '0:Memo14'));
  });

  it('Fahrradstellplätze mit derselben Regel', async () => {
    await oeffnen();
    await tippe('1:Memo3', '4');
    await tippe('1:Memo6', '2');
    expect([wert('1:Memo5'), wert('1:Memo8')]).toEqual(['4', '6']);
    expect(wert('0:Memo14')).toBe('');
  });

  it('keine ganze Zahl: keine Summe, Hinweis am Feld', async () => {
    const host = await oeffnen();
    await tippe('0:Memo12', '2');
    await tippe('0:Memo13', 'ca. 3');
    expect(wert('0:Memo14')).toBe('');
    expect(hinweise(host)).toContain('„Stellplätze auf dem Baugrundstück: im Freien“ („ca. 3“): bitte als ganze Zahl eintragen');
    // Hinweissymbol am Feld
    expect(eingabe(host, '0:Memo13').closest('label')!.querySelector('.fo-entfall-info.warnung, .fo-entfall-info.hinweis')).not.toBeNull();
  });

  it('abweichende Summe aus der Datei: nicht still überschrieben, sondern ein Hinweis', async () => {
    datei.bytes = baubeschreibung({ '0:Memo12': '2', '0:Memo13': '3', '0:Memo14': '7', '0:Memo17': '7' });
    const host = await oeffnen();
    expect(offen().aenderungen).toEqual({});
    expect(wert('0:Memo14')).toBe('7');
    expect(hinweise(host)).toContain('eingetragen ist 7, die Angaben ergeben 5');
    // ändert sich eine Angabe, wird neu gerechnet – der Hinweis verschwindet
    await tippe('0:Memo13', '4');
    expect([wert('0:Memo14'), wert('0:Memo17')]).toEqual(['6', '6']);
    expect(hinweise(host)).not.toContain('eingetragen ist');
    // Rückgängig: die Angaben sind wieder wie in der Datei – damit auch die Summe aus der Datei, nichts bleibt geändert
    act(() => void useFormulare.getState().rueckgaengig());
    await warte();
    expect([wert('0:Memo14'), wert('0:Memo17')]).toEqual(['7', '7']);
    expect(offen().aenderungen).toEqual({});
    // „Neu berechnen“ am Feld übernimmt die Summe (ein Schritt im Verlauf, rückgängig zu machen)
    const knopf = () => [...eingabe(host, '0:Memo14').closest('.fo-feld')!.querySelectorAll('button')].find((b) => b.textContent === 'Neu berechnen');
    // der Knopf gehört nicht zur Beschreibung des Felds und nennt sein Feld
    expect(knopf()!.closest('label, .field-hint')).toBeNull();
    expect(knopf()!.getAttribute('aria-label')).toBe('„Stellplätze insgesamt auf dem Baugrundstück“ neu berechnen');
    act(() => knopf()!.click());
    await warte();
    expect([wert('0:Memo14'), wert('0:Memo17')]).toEqual(['5', '5']);
    expect(knopf()).toBeUndefined();
    act(() => void useFormulare.getState().rueckgaengig());
    await warte();
    expect([wert('0:Memo14'), wert('0:Memo17')]).toEqual(['7', '7']);
  });

  it('die Summe landet in der Formulardatei', async () => {
    await oeffnen();
    await tippe('0:Memo12', '2');
    await tippe('0:Memo15', '3');
    const bytes = mitAenderungen(datei.bytes!, offen().aenderungen);
    const gelesen = parseFormular(bytes);
    const felder = gelesen.seiten.flatMap((s, i) => felderDerSeite(s, i));
    const original = (s: string) => felder.find((f) => f.schluessel === s)!.original;
    expect([original('0:Memo12'), original('0:Memo14'), original('0:Memo17')]).toEqual(['2', '2', '5']);
  });
});
