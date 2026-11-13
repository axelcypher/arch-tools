// @vitest-environment happy-dom
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aenderungenSpeichern, bestaetigen, frageText, oeffnenFehlgeschlagen, RueckfrageHost } from './Rueckfrage';
import { Modal } from './Dialog';
import { NumberField } from './fields';
import { DateiLesenFehler, oeffnenFehlerText } from '../platform/dateiFehler';
import { readProjectFile } from '../archive';
import { ProjectFormatError } from '../serialize';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
function render(el: React.ReactElement): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(el);
  });
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const esc = (ziel: Element = document.body) => act(() => ziel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
const knoepfe = (host: Element) => [...host.querySelectorAll('.modal.rf button')].map((b) => b.textContent);
const klick = (host: Element, text: string) => act(async () => [...host.querySelectorAll<HTMLButtonElement>('.modal.rf button')].find((b) => b.textContent === text)!.click());

describe('Rückfrage „Änderungen speichern?“', () => {
  it('drei Knöpfe; „Speichern“ speichert vor der Aktion, „Abbrechen“ und Esc lassen sie aus; kein window.confirm', async () => {
    const confirm = vi.fn(() => true);
    window.confirm = confirm;
    const host = render(createElement(RueckfrageHost));
    const reihenfolge: string[] = [];
    const speichern = vi.fn(async () => {
      reihenfolge.push('gespeichert');
      return true;
    });
    let p: Promise<unknown> = aenderungenSpeichern('EFH Musterweg', speichern).then((ok) => reihenfolge.push(`weiter: ${ok}`));
    await act(async () => {});
    expect(host.textContent).toContain('Änderungen an „EFH Musterweg“ speichern?');
    expect(knoepfe(host)).toEqual(['Abbrechen', 'Nicht speichern', 'Speichern']);
    await klick(host, 'Speichern');
    await p;
    expect(reihenfolge).toEqual(['gespeichert', 'weiter: true']);

    // Speichern abgebrochen (z. B. Dateidialog) → die Aktion unterbleibt
    let ergebnis: boolean | null = null;
    p = aenderungenSpeichern('X', async () => false).then((ok) => (ergebnis = ok));
    await act(async () => {});
    await klick(host, 'Speichern');
    await p;
    expect(ergebnis).toBe(false);

    p = aenderungenSpeichern('X', speichern).then((ok) => (ergebnis = ok));
    await act(async () => {});
    await klick(host, 'Abbrechen');
    await p;
    expect(ergebnis).toBe(false);

    p = aenderungenSpeichern('X', speichern).then((ok) => (ergebnis = ok));
    await act(async () => {});
    esc();
    await p;
    expect(ergebnis).toBe(false);
    expect(host.querySelector('.modal.rf')).toBeNull();

    p = aenderungenSpeichern('X', speichern).then((ok) => (ergebnis = ok));
    await act(async () => {});
    await klick(host, 'Nicht speichern');
    await p;
    expect(ergebnis).toBe(true);
    expect(speichern).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('destruktive Aktion: „Ersetzen / Abbrechen“; Eingabe-Rückfrage liefert den Text', async () => {
    const host = render(createElement(RueckfrageHost));
    let ok: boolean | null = null;
    const p = bestaetigen('Struktur ersetzen?', '6 Ordner entfallen.', 'Ersetzen', true).then((v) => (ok = v));
    await act(async () => {});
    expect(knoepfe(host)).toEqual(['Abbrechen', 'Ersetzen']);
    await klick(host, 'Ersetzen');
    await p;
    expect(ok).toBe(true);
    let text: string | null = 'x';
    const q = frageText('Neuer Name', 'Plan.pdf').then((v) => (text = v));
    await act(async () => {});
    expect(host.querySelector<HTMLInputElement>('.modal.rf input')!.value).toBe('Plan.pdf');
    await klick(host, 'OK');
    await q;
    expect(text).toBe('Plan.pdf');
  });
});

describe('Dialoge: Esc', () => {
  it('Esc schließt den Dialog, verschachtelt nur den obersten; Esc im Zahlenfeld mit Eingabe verwirft nur die Eingabe', () => {
    const zu: string[] = [];
    function Zwei() {
      const [innen, setInnen] = useState(true);
      return createElement(
        Modal,
        {
          titel: 'Außen',
          onClose: () => {
            zu.push('außen');
          },
          children: null,
        },
        createElement(NumberField, { value: 1, onChange: () => {} }),
        innen
          ? createElement(Modal, {
              titel: 'Innen',
              onClose: () => {
                zu.push('innen');
                setInnen(false);
              },
              children: 'innen',
            })
          : null,
      );
    }
    const host = render(createElement(Zwei));
    esc();
    expect(zu).toEqual(['innen']);
    const feld = host.querySelector('input')!;
    // mit Eingabe: das erste Esc verwirft nur die Eingabe, das zweite schließt den Dialog
    act(() => {
      feld.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(feld, '5');
      feld.dispatchEvent(new Event('input', { bubbles: true }));
    });
    esc(feld);
    expect(zu).toEqual(['innen']);
    esc();
    expect(zu).toEqual(['innen', 'außen']);
  });
});

describe('Fehlermeldung beim Öffnen', () => {
  it('kaputte Projektdatei: verständliche Meldung mit Dateiname, technische Einzelheit getrennt', async () => {
    let fehler: unknown;
    try {
      readProjectFile(new TextEncoder().encode('{kaputt'));
    } catch (e) {
      fehler = e;
    }
    expect(fehler).toBeInstanceOf(ProjectFormatError);
    expect((fehler as Error).message).toBe('Keine gültige Projektdatei (.oap) – beschädigt oder aus einer anderen Anwendung.');
    expect((fehler as ProjectFormatError).technisch).toContain('JSON');
    const text = oeffnenFehlerText(new DateiLesenFehler('C:\\Projekte\\Haus.oap', fehler));
    expect(text).toBe('Die Datei „Haus.oap“ ließ sich nicht lesen: Keine gültige Projektdatei (.oap) – beschädigt oder aus einer anderen Anwendung.\nDas geöffnete Projekt bleibt unverändert.');

    const alert = vi.fn();
    window.alert = alert;
    const host = render(createElement(RueckfrageHost));
    const p = oeffnenFehlgeschlagen(new DateiLesenFehler('Haus.oap', fehler));
    await act(async () => {});
    expect(host.querySelector('.modal.rf')!.textContent).toContain('„Haus.oap“ ließ sich nicht lesen');
    expect(host.querySelector('.rf-details summary')!.textContent).toBe('Technische Einzelheiten');
    expect(host.querySelector('.rf-details pre')!.textContent).toContain('kein gültiges JSON');
    await klick(host, 'OK');
    await p;
    expect(alert).not.toHaveBeenCalled();
  });
});
