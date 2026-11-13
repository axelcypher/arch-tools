// @vitest-environment happy-dom
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Field, NumberField, TextField, zahlLesen } from './fields';
import { Modal } from './Dialog';
import { email, ordnername, plz } from './pruefen';

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
});

const tippen = (el: HTMLInputElement, value: string) =>
  act(() => {
    el.focus();
    el.dispatchEvent(new FocusEvent('focus'));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

describe('Eingabefelder', () => {
  it('Auswahlwechsel per Klick vor Enter: die Eingabe landet beim bisherigen Ziel', () => {
    const werte: Record<string, string> = { a: 'Wohnen', b: 'Bad' };
    let wechseln: (id: string) => void = () => {};
    // wie das Eigenschaftenfeld: dasselbe Feld zeigt nach dem Wechsel das neue Ziel
    function Eigenschaften() {
      const [ziel, setZiel] = useState('a');
      wechseln = setZiel;
      return createElement(TextField, { value: werte[ziel], onChange: (v: string) => (werte[ziel] = v) });
    }
    const host = render(createElement(Eigenschaften));
    const input = host.querySelector('input')!;
    tippen(input, 'Wohnen/Essen');
    // Klick auf die Zeichenfläche: wählt eine andere Fläche (Handler der App im Bubbling)
    const flaeche = document.createElement('div');
    document.body.appendChild(flaeche);
    flaeche.addEventListener('pointerdown', () => act(() => wechseln('b')));
    act(() => {
      flaeche.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(werte).toEqual({ a: 'Wohnen/Essen', b: 'Bad' });
    expect(host.querySelector('input')!.value).toBe('Bad');
  });

  it('wird das Feld entfernt, geht die offene Eingabe an das bisherige Ziel', () => {
    const werte: Record<string, string> = { a: 'Wohnen' };
    let zeigen: (v: boolean) => void = () => {};
    function Huelle() {
      const [da, setDa] = useState(true);
      zeigen = setDa;
      return da ? createElement(TextField, { value: werte.a, onChange: (v: string) => (werte.a = v) }) : null;
    }
    const host = render(createElement(Huelle));
    tippen(host.querySelector('input')!, 'Küche');
    act(() => zeigen(false));
    expect(werte.a).toBe('Küche');
  });

  it('Zahlenfeld: Hinein- und Herausklicken rundet nichts, Esc verwirft, Enter übernimmt', () => {
    const aufrufe: (number | undefined)[] = [];
    const host = render(createElement(NumberField, { value: 2.875, digits: 2, onChange: (v: number | undefined) => aufrufe.push(v) }));
    const input = host.querySelector('input')!;
    act(() => {
      input.focus();
      input.blur();
    });
    expect(aufrufe).toEqual([]);
    tippen(input, '3,1');
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(aufrufe).toEqual([]);
    tippen(input, '3,1');
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(aufrufe).toEqual([3.1]);
  });

  it('Zahlenfeld: „4“ bei höchstens 1 wird nicht gekappt, sondern gemeldet; „abc“ sichtbar abgelehnt; Tausenderpunkte', () => {
    const aufrufe: (number | undefined)[] = [];
    const host = render(createElement(NumberField, { value: 0.4, min: 0, max: 1, onChange: (v: number | undefined) => aufrufe.push(v) }));
    const input = host.querySelector('input')!;
    tippen(input, '4');
    // Meldung erst nach dem Verlassen
    expect(host.querySelector('.feld-meldung')).toBeNull();
    act(() => input.blur());
    expect(aufrufe).toEqual([]);
    expect(input.classList.contains('feld-fehler')).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector('.feld-meldung')!.textContent).toBe('Höchstens 1,0 – gemeint 0,4?');
    expect(input.value).toBe('4'); // Eingabe bleibt zum Korrigieren stehen
    tippen(input, 'abc');
    act(() => input.blur());
    expect(aufrufe).toEqual([]);
    expect(host.querySelector('.feld-meldung')!.textContent).toContain('„abc“ ist keine Zahl');
    // Esc verwirft Eingabe und Meldung
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(host.querySelector('.feld-meldung')).toBeNull();
    expect(input.value).toBe('0,40');
  });

  it('Zahlenfeld liest deutsche Schreibweise mit Einheit', () => {
    const aufrufe: (number | undefined)[] = [];
    const host = render(createElement(NumberField, { value: undefined, allowEmpty: true, onChange: (v: number | undefined) => aufrufe.push(v) }));
    const input = host.querySelector('input')!;
    tippen(input, '1.234,5 m²');
    act(() => input.blur());
    expect(aufrufe).toEqual([1234.5]);
  });

  it('Textfeld mit Prüfung: Meldung erst nach dem Verlassen, Pflichtfeld markiert', () => {
    const host = render(createElement(Field, { label: 'PLZ', pflicht: true, children: createElement(TextField, { value: '', pflicht: true, pruefen: plz, onChange: () => {} }) }));
    expect(host.querySelector('.pflicht')).not.toBeNull();
    const input = host.querySelector('input')!;
    expect(input.required).toBe(true);
    expect(host.querySelector('.feld-meldung')).toBeNull();
    act(() => {
      input.focus();
      input.blur();
    });
    expect(host.querySelector('.feld-meldung')!.textContent).toBe('Angabe fehlt.');
  });
});

describe('Prüfregeln', () => {
  it('PLZ, E-Mail je Eintrag, Zeichen im Ordnernamen', () => {
    expect(plz('4814')).toBe('PLZ mit fünf Ziffern, z. B. 48143.');
    expect(plz('48143')).toBeNull();
    expect(plz('')).toBeNull();
    expect(email('anna@mueller.example, kein-mail')).toBe('Keine gültige E-Mail-Adresse: kein-mail');
    expect(email('anna@mueller, a@b.example')).toBe('Keine gültige E-Mail-Adresse: anna@mueller');
    expect(email('a@b.example; c@d.example')).toBeNull();
    expect(ordnername('EFH Müller/Weg: 3?')).toBe('/ : ? werden im Ordnernamen entfernt.');
    expect(ordnername('EFH Müller')).toBeNull();
  });

  it('Esc ohne Eingabe schließt den Dialog sofort; mit Eingabe verwirft das erste Esc nur die Eingabe', () => {
    let zu = 0;
    const host = render(
      createElement(
        Modal,
        { titel: 'Test', onClose: () => zu++, children: null },
        createElement(TextField, { value: 'a', onChange: () => {} }),
        createElement(NumberField, { value: 1, onChange: () => {} }),
      ),
    );
    const [text, zahl] = [...host.querySelectorAll('input')];
    const esc = (el: HTMLInputElement) => act(() => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    act(() => text.focus());
    esc(text);
    expect(zu).toBe(1);
    act(() => zahl.focus());
    esc(zahl);
    expect(zu).toBe(2);
    tippen(text, 'ab');
    esc(text);
    expect(zu).toBe(2);
    expect(text.value).toBe('a');
    tippen(zahl, '5');
    esc(zahl);
    expect(zu).toBe(2);
    expect(zahl.value).toBe('1,00');
  });

  it('Zahlenfeld: Tausenderpunkte in der Anzeige, Fokus ändert den Text nicht (Auswahl bleibt), Punkte nach dem Bearbeiten werden gelesen', () => {
    const aufrufe: (number | undefined)[] = [];
    const host = render(createElement(NumberField, { value: 45000, onChange: (v: number | undefined) => aufrufe.push(v) }));
    const input = host.querySelector('input')!;
    expect(input.value).toBe('45.000,00');
    act(() => {
      input.focus();
      input.select();
    });
    expect(input.value).toBe('45.000,00');
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, input.value.length]);
    act(() => input.blur());
    expect(aufrufe).toEqual([]);
    // eine Ziffer gelöscht: Dreiergruppen stimmen nicht mehr, gemeint ist trotzdem 4.500,00
    tippen(input, '4.500,00');
    act(() => input.blur());
    tippen(input, '4.50,00');
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(aufrufe).toEqual([4500, 450]);
    // Enter verlässt das Feld (Strg+Z und Werkzeugtasten gehören danach wieder der Arbeitsfläche)
    expect(document.activeElement).not.toBe(input);
  });

  it('Zahlenfeld ohne Nachkommastellen bleibt ohne Tausenderpunkte (eindeutig beim Bearbeiten)', () => {
    const host = render(createElement(NumberField, { value: 45000, digits: 0, onChange: () => {} }));
    expect(host.querySelector('input')!.value).toBe('45000');
  });

  it('zahlLesen: Punkte vor dem Komma sind Tausendertrenner, auch nach dem Bearbeiten; Einheit und Minus wie parseNum', () => {
    expect(zahlLesen('1.234,50')).toBe(1234.5);
    expect(zahlLesen('4.50,00 m²')).toBe(450);
    expect(zahlLesen('-1.2,5')).toBe(-12.5);
    expect(zahlLesen('1,2,3')).toBeNull();
    // ohne Komma gilt parseNum: „45.00“ ist 45 (sichtbar, weil das Feld danach „45,00“ zeigt)
    expect(zahlLesen('45.00')).toBe(45);
  });

  it('Enter im Formular ohne Absendeknopf: übernimmt den Wert und sendet danach ab (der Handler sieht den neuen Wert)', async () => {
    const gesendet: (number | undefined)[] = [];
    function Formular() {
      const [wert, setWert] = useState<number | undefined>(1);
      return createElement(
        'form',
        {
          onSubmit: (e: React.FormEvent) => {
            e.preventDefault();
            gesendet.push(wert);
          },
        },
        createElement(NumberField, { value: wert, onChange: setWert }),
        createElement('button', { type: 'button' }, 'Abbrechen'),
      );
    }
    const host = render(createElement(Formular));
    const input = host.querySelector('input')!;
    tippen(input, '7');
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(gesendet).toEqual([7]);
  });
});
