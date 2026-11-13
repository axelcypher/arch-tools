// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '@core/model';
import { RueckfrageHost } from '@core/ui/Rueckfrage';
import { musterMappe } from './__fixtures__/muster';
import { kostenkontrolleLesen } from './abrechnung/kostenkontrolle';
import { leeresAvaProjekt } from './avaDaten';
import { RechnungPruefen } from './components/abrechnung/RechnungPruefen';
import { SpeicherDateien } from './dateien';
import { VORGABE } from './einstellungen';
import { useAva } from './store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
let host: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

beforeEach(async () => {
  const bytes = await musterMappe();
  const p = createProject('Musterhaus');
  p.meta = { ...p.meta, projektcode: 'P99' };
  useAva.setState({
    fs: new SpeicherDateien(),
    einstellungen: VORGABE,
    lv: null,
    projekt: {
      ordner: '/p',
      oap: 'p.oap',
      name: 'Musterhaus',
      meta: p.meta,
      struktur: null,
      ava: leeresAvaProjekt(),
      kk: { pfad: 'kk.xlsx', bytes, stand: { groesse: 1, geaendert: 1 }, kk: kostenkontrolleLesen(bytes) },
      kkFehler: null,
    },
  });
});

function zeigen(onClose = vi.fn()) {
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(createElement('div', null, createElement(RechnungPruefen, { gewerk: 'G4', onClose }), createElement(RueckfrageHost)));
  });
  return onClose;
}

const feld = (label: string) => [...document.querySelectorAll<HTMLLabelElement>('label.ava-feld')].find((l) => l.querySelector('.ava-feld-label')?.textContent?.startsWith(label))!;
const auswahl = (label: string) => feld(label).querySelector('select')!;
const waehlen = (label: string, wert: string) =>
  act(() => {
    const s = auswahl(label);
    s.value = wert;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
const zeile = (text: string) => [...document.querySelectorAll('.ava-rechnung-tabelle tr')].find((tr) => tr.firstElementChild?.textContent?.trim().startsWith(text))!;
const bisher = () => zeile('− bisher freigegeben').querySelector('.num')!.textContent;
const lfd = () => (feld('lfd. Nr.').querySelector('input') as HTMLInputElement).value;

describe('Neue Rechnung prüfen: Gewerk- und Artwechsel', () => {
  it('zieht beim Wechsel immer die Zahlungen des gewählten Gewerks und der gewählten Art ab', () => {
    zeigen();
    // G4: „Rohbau Muster, AB1“ steht in der Mappe → nächste ist AB 2, mit AB 1 als bisher freigegeben
    expect(lfd()).toBe('2');
    expect(bisher()).toBe('10.000,00 €');
    // Gewerk wechseln: die Zahlungen von G4 dürfen nicht stehen bleiben
    waehlen('Gewerk', 'G8');
    expect(lfd()).toBe('2');
    expect(bisher()).toBe('27.824,22 €');
    // Schlussrechnung: alle bisherigen Zahlungen, Sicherheit für Mängelansprüche ohne Satz → Hinweis
    waehlen('Rechnungsart', 'SR');
    expect(lfd()).toBe('1');
    expect(bisher()).toBe('27.824,22 €');
    expect(feld('Sicherheit für Mängelansprüche')).toBeDefined();
    expect(document.body.textContent).toContain('kein Satz hinterlegt');
    // Teilschlussrechnung: kein automatischer Abzug
    waehlen('Rechnungsart', 'TSR');
    expect(bisher()).toBe('0,00 €');
    // zurück zur Abschlagsrechnung (Gegenprobe): wieder mit AB 1
    waehlen('Rechnungsart', 'AB');
    expect(lfd()).toBe('2');
    expect(bisher()).toBe('27.824,22 €');
    // Einzelrechnung: nichts abziehen
    waehlen('Rechnungsart', 'R');
    expect(bisher()).toBe('0,00 €');
  });

  it('Titel im Kopf des Dialogs (Modal kopf): einmal sichtbar, als Name des Dialogs, kein eigenes h2 im Inhalt', () => {
    zeigen();
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const kopf = dialog.querySelector('h3.modal-kopf')!;
    expect(kopf.textContent).toBe('Neue Rechnung prüfen');
    expect(dialog.getAttribute('aria-labelledby')).toBe(kopf.id);
    expect(dialog.querySelector('h2')).toBeNull();
    expect(dialog.textContent!.split('Neue Rechnung prüfen').length - 1).toBe(1);
  });

  it('zeigt sichtbar, was fehlt, und fragt vor dem Verwerfen eingegebener Angaben', async () => {
    const onClose = zeigen();
    expect(document.querySelector('.ava-fehlt')?.textContent).toContain('Netto-Freigabesumme');
    const abbrechen = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Abbrechen')!;
    // unverändert: schließt ohne Rückfrage
    await act(async () => abbrechen.click());
    expect(onClose).toHaveBeenCalledTimes(1);
    // geändert: erst Rückfrage
    waehlen('Rechnungsart', 'SR');
    await act(async () => abbrechen.click());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.modal.rf')?.textContent).toContain('Eingaben verwerfen?');
  });
});
