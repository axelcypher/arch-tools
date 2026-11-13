// @vitest-environment happy-dom
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aenderungenSpeichern, bestaetigen, fragen, frageText, oeffnenFehlgeschlagen, RueckfrageHost } from './Rueckfrage';
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

describe('Rückfrage mit Gefahr-Knopf', () => {
  it('Erstfokus und Enter liegen nie auf dem Gefahr-Knopf: bestaetigen(…, gefahr) – Enter bricht ab', async () => {
    const host = render(createElement(RueckfrageHost));
    let ok: boolean | null = null;
    const p = bestaetigen('Löschen?', 'Die Fläche wird entfernt.', 'Löschen', true).then((v) => (ok = v));
    await act(async () => {});
    const loeschen = [...host.querySelectorAll<HTMLButtonElement>('.modal.rf button')].find((b) => b.textContent === 'Löschen')!;
    expect(loeschen.classList.contains('danger')).toBe(true);
    expect(document.activeElement?.textContent).toBe('Abbrechen');
    expect(loeschen.type).toBe('button');
    // Enter im Dialog: das Formular sendet den Standard – „Abbrechen“
    await act(async () => host.querySelector('.modal.rf form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await p;
    expect(ok).toBe(false);
  });

  it('nur Gefahr-Knöpfe: kein Standard, Enter tut nichts, der Fokus liegt nicht auf dem Knopf', async () => {
    const host = render(createElement(RueckfrageHost));
    let antwort: string | null | undefined;
    void fragen({ titel: 'Alles verwerfen?', knoepfe: [{ id: 'weg', label: 'Verwerfen', art: 'danger' }] }).then((v) => (antwort = v));
    await act(async () => {});
    await act(async () => new Promise((r) => requestAnimationFrame(() => r(undefined))));
    const knopf = host.querySelector<HTMLButtonElement>('.modal.rf button')!;
    expect(knopf.type).toBe('button');
    expect(document.activeElement).not.toBe(knopf);
    await act(async () => host.querySelector('.modal.rf form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(antwort).toBeUndefined();
    expect(host.querySelector('.modal.rf')).not.toBeNull();
    // Esc schließt wie „Abbrechen“ – nie mit der Gefahr-Aktion
    esc();
    await act(async () => {});
    expect(antwort).toBeNull();
  });

  it('nur ein Gefahr-Knopf: Klick neben den Dialog löst die Aktion nicht aus', async () => {
    const host = render(createElement(RueckfrageHost));
    let antwort: string | null | undefined;
    void fragen({ titel: 'Alles verwerfen?', knoepfe: [{ id: 'weg', label: 'Verwerfen', art: 'danger' }] }).then((v) => (antwort = v));
    await act(async () => {});
    const hintergrund = host.querySelector('.modal-backdrop')!;
    await act(async () => {
      hintergrund.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    // geschlossen wie „Abbrechen“
    expect(host.querySelector('.modal.rf')).toBeNull();
    expect(antwort).toBeNull();
  });

  it('ohne Hauptknopf liegt der Standard auf „Abbrechen“, auch wenn weitere ungefährliche Knöpfe folgen', async () => {
    const host = render(createElement(RueckfrageHost));
    let antwort: string | null | undefined;
    void fragen({
      titel: 'Dateien vorhanden',
      knoepfe: [
        { id: 'abbrechen', label: 'Abbrechen' },
        { id: 'ueberspringen', label: 'Vorhandene überspringen' },
        { id: 'ersetzen', label: 'Ersetzen', art: 'danger' },
      ],
    }).then((v) => (antwort = v));
    await act(async () => {});
    expect(document.activeElement?.textContent).toBe('Abbrechen');
    await act(async () => host.querySelector('.modal.rf form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(antwort).toBe('abbrechen');
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
