// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Bautagebuch } from './components/bauleitung/Bautagebuch';
import { Maengel } from './components/bauleitung/Maengel';
import { Protokolle } from './components/bauleitung/Protokolle';
import { demoLaden } from './demo';
import { useAva } from './store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

async function zeigen(komponente: () => React.ReactNode) {
  await demoLaden();
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(createElement(komponente));
  });
  return host;
}

/** wartet, bis alle Schreibvorgänge der Projektdatei durch sind */
async function warten(bis?: () => boolean) {
  for (let i = 0; i < 40 && !(bis?.() ?? false); i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
}

/** Text in ein Feld schreiben (wie getippt) */
function tippen(feld: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(feld), 'value')!.set!;
  act(() => {
    feld.focus();
    setter.call(feld, text);
    feld.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function waehlen(sel: HTMLSelectElement, wert: string) {
  act(() => {
    sel.value = wert;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

const knopf = (host: HTMLElement, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text))!;

describe('Bautagebuch', () => {
  it('zwei schnelle Änderungen hintereinander gehen nicht verloren (Tätigkeit verlassen, sofort weitere Firma)', async () => {
    const host = await zeigen(Bautagebuch);
    await act(async () => knopf(host, 'Tagesbericht').click());
    await warten(() => useAva.getState().projekt!.ava.bautagebuch.length === 1);
    // neuer Bericht: Fokus steht in „Ausgeführte Leistungen“, Liste per Tastatur erreichbar
    expect(document.activeElement?.getAttribute('aria-label') ?? (document.activeElement as HTMLElement).closest('label')?.textContent).toContain('Ausgeführte Leistungen');
    expect(host.querySelector('[role="listbox"] [role="option"][aria-selected="true"]')?.getAttribute('tabindex')).toBe('0');
    waehlen(host.querySelector<HTMLSelectElement>('select[aria-label="Firma hinzufügen"]')!, '-');
    await warten(() => useAva.getState().projekt!.ava.bautagebuch[0].firmen.length === 1);
    const taetigkeit = host.querySelector<HTMLInputElement>('input[aria-label^="Tätigkeit"]')!;
    tippen(taetigkeit, 'Fenster EG eingebaut');
    // Verlassen und sofort die nächste Änderung – ohne zu warten
    act(() => taetigkeit.blur());
    waehlen(host.querySelector<HTMLSelectElement>('select[aria-label="Firma hinzufügen"]')!, '-');
    await warten(() => useAva.getState().projekt!.ava.bautagebuch[0].firmen.length === 2);
    await warten();
    const firmen = useAva.getState().projekt!.ava.bautagebuch[0].firmen;
    expect(firmen).toHaveLength(2);
    expect(firmen[0].taetigkeit).toBe('Fenster EG eingebaut');
    // das Feld „Personen“ ist eine normale, sichtbare Eingabe mit Beschriftung
    const personen = host.querySelector<HTMLInputElement>('input[aria-label^="Personen"]')!;
    expect(personen.closest('.ava-zelle-eingabe')).toBeNull();
    // Entfernen hat eine Beschriftung
    expect(host.querySelector('button[aria-label$="entfernen"]')).not.toBeNull();
  });
});

describe('Mängel', () => {
  it('erledigt gesetzte Mängel bleiben abgeblendet stehen, bis der Filter wechselt', async () => {
    const host = await zeigen(Maengel);
    expect(host.textContent).toContain('Noch keine Mängel');
    await act(async () => knopf(host, 'Mangel').click());
    await warten(() => useAva.getState().projekt!.ava.maengel.length === 1);
    await warten(() => !!host.querySelector('textarea[aria-label="Beschreibung Mangel 1"]'));
    expect(document.activeElement).toBe(host.querySelector('textarea[aria-label="Beschreibung Mangel 1"]'));
    waehlen(host.querySelector<HTMLSelectElement>('select[aria-label="Status Mangel 1"]')!, 'erledigt');
    await warten(() => useAva.getState().projekt!.ava.maengel[0].status === 'erledigt');
    await warten();
    const zeile = host.querySelector('select[aria-label="Status Mangel 1"]')!.closest('tr')!;
    expect(zeile.className).toContain('ava-abgeblendet');
    expect(useAva.getState().projekt!.ava.maengel[0].erledigtAm).toBeTruthy();
    // Filter wechseln (alle und zurück): jetzt ist der erledigte Mangel ausgeblendet
    const filter = host.querySelector<HTMLSelectElement>('select[aria-label="Anzeigen"]')!;
    waehlen(filter, 'alle');
    waehlen(filter, 'offen');
    expect(host.querySelector('select[aria-label="Status Mangel 1"]')).toBeNull();
    expect(host.textContent).toContain('Keine offenen Mängel');
  });

  it('„angezeigt“ von Hand gesetzt vermerkt das Datum der Anzeige', async () => {
    const host = await zeigen(Maengel);
    await act(async () => knopf(host, 'Mangel').click());
    await warten(() => !!host.querySelector('select[aria-label="Status Mangel 1"]'));
    waehlen(host.querySelector<HTMLSelectElement>('select[aria-label="Status Mangel 1"]')!, 'angezeigt');
    await warten(() => useAva.getState().projekt!.ava.maengel[0].status === 'angezeigt');
    expect((useAva.getState().projekt!.ava.maengel[0] as { angezeigtAm?: string }).angezeigtAm).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('Protokolle', () => {
  it('neuer Punkt bekommt den Fokus, zwei schnelle Änderungen an Punkten gehen nicht verloren, Abnahmebegehung zeigt Vorbehalte', async () => {
    const host = await zeigen(Protokolle);
    await act(async () => knopf(host, 'Protokoll').click());
    await warten(() => useAva.getState().projekt!.ava.protokolle.length === 1);
    await warten(() => !!knopf(host, 'Punkt'));
    expect(host.textContent).toContain('Noch keine Teilnehmer');
    await act(async () => knopf(host, 'Punkt').click());
    await warten(() => !!host.querySelector('input[aria-label="Thema TOP 1."]'));
    const thema = host.querySelector<HTMLInputElement>('input[aria-label="Thema TOP 1."]')!;
    expect(document.activeElement).toBe(thema);
    tippen(thema, 'Fensteranschluss');
    act(() => thema.blur());
    await act(async () => knopf(host, 'Punkt').click());
    await warten(() => useAva.getState().projekt!.ava.protokolle[0].tops.length === 2);
    await warten();
    const tops = useAva.getState().projekt!.ava.protokolle[0].tops;
    expect(tops.map((t) => t.titel)).toEqual(['Fensteranschluss', '']);
    // Abnahmebegehung
    const art = host.querySelector<HTMLInputElement>('.ava-formular input[list="ava-protokollarten"]')!;
    tippen(art, 'Abnahmebegehung');
    act(() => art.blur());
    await warten(() => !!host.querySelector('.ava-abnahme'));
    expect(host.querySelector('.ava-abnahme')!.textContent).toContain('Vertragsstrafe vorbehalten');
    expect(host.querySelector('.ava-abnahme')!.textContent).toContain('erklärt der Auftraggeber');
  });
});
