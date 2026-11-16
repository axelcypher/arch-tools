// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HINWEISE_HOECHSTENS, HinweisHost, hinweisF6Eigen, hinweisFokussieren, hinweiseLeeren, schliesseHinweis, zeigeHinweis } from './Hinweis';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
function render(): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = '<main><button id="aussen">Außen</button></main>';
  document.body.appendChild(host);
  const stelle = document.createElement('div');
  host.appendChild(stelle);
  act(() => {
    root = createRoot(stelle);
    root.render(createElement(HinweisHost));
  });
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  act(() => hinweiseLeeren());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const zeige = (...a: Parameters<typeof zeigeHinweis>) => act(() => void zeigeHinweis(...a));
const hinweise = (host: Element) => [...host.querySelectorAll<HTMLElement>('.hinweis')];
const taste = (key: string, ziel: Element = document.activeElement ?? document.body) => act(() => void ziel.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
const knopf = (host: Element, text: string) => [...host.querySelectorAll<HTMLButtonElement>('.hinweis button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent) === text)!;

describe('Hinweis nach einer Aktion', () => {
  it('Stapel ist als benannter Bereich mit Live-Regionen immer da; Hinweis mit Text, Pfad, Aktion und Schließen', () => {
    const host = render();
    const stapel = host.querySelector('.hinweise')!;
    expect(stapel.getAttribute('role')).toBe('region');
    expect(stapel.getAttribute('aria-label')).toBe('Hinweise');
    expect(stapel.querySelector('[role="status"]')).not.toBeNull();
    expect(stapel.querySelector('[role="alert"]')).not.toBeNull();
    expect(hinweise(host)).toHaveLength(0);

    zeige({ text: 'Gespeichert unter', pfad: 'C:\\Projekte\\Haus\\Berechnung.xlsx', aktionen: [{ text: 'Ordner öffnen', aktion: () => {}, schliesst: true }] });
    const [h] = hinweise(host);
    expect(h.className).toBe('hinweis meldung ok');
    expect(h.querySelector('.hinweis-pfad')!.textContent).toBe('C:\\Projekte\\Haus\\Berechnung.xlsx');
    expect(knopf(host, 'Ordner öffnen')).toBeDefined();
    const zu = knopf(host, 'Hinweis schließen');
    expect(zu.getAttribute('title')).toBe('Hinweis schließen');
    expect(stapel.querySelector('[role="status"]')!.textContent).toBe('Gespeichert unter C:\\Projekte\\Haus\\Berechnung.xlsx');
    expect(stapel.querySelector('[role="alert"]')!.textContent).toBe('');
    // nimmt keinen Fokus
    expect(stapel.contains(document.activeElement)).toBe(false);
  });

  it('verschwindet nicht von selbst; Schließen-Knopf entfernt ihn', () => {
    vi.useFakeTimers();
    try {
      const host = render();
      zeige({ text: 'Fertig' });
      act(() => void vi.advanceTimersByTime(10 * 60_000));
      expect(hinweise(host)).toHaveLength(1);
      act(() => knopf(host, 'Hinweis schließen').click());
      expect(hinweise(host)).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Fehler werden sofort angesagt (role="alert"), Warnung und Fehler bekommen ihre Klasse', () => {
    const host = render();
    zeige({ id: 'a', art: 'warnung', text: 'Vorlage mit Hinweisen' });
    zeige({ id: 'b', art: 'fehler', text: 'Datei ist in Excel geöffnet' });
    expect(hinweise(host).map((h) => h.className)).toEqual(['hinweis meldung warnung', 'hinweis meldung fehler']);
    expect(host.querySelector('[role="alert"]')!.textContent).toBe('Datei ist in Excel geöffnet');
    expect(host.querySelector('[role="status"]')!.textContent).toBe('');
  });

  it('gleiche id ersetzt an derselben Stelle und sagt neu an; verschiedene stapeln sich, der neueste unten', () => {
    const host = render();
    zeige({ id: 'export', text: 'Gespeichert' });
    zeige({ id: 'andere', text: 'Andere Meldung' });
    const vorher = host.querySelector('[role="status"] span');
    zeige({ id: 'export', text: 'Gespeichert' });
    expect(hinweise(host).map((h) => h.dataset.hinweis)).toEqual(['export', 'andere']);
    // gleicher Text, aber neu eingefügt → wird wieder angesagt
    expect(host.querySelector('[role="status"] span')).not.toBe(vorher);
    zeige({ id: 'export', text: 'Erneut gespeichert' });
    expect(hinweise(host)[0].querySelector('.hinweis-text')!.textContent).toBe('Erneut gespeichert');
  });

  it(`höchstens ${HINWEISE_HOECHSTENS}: der älteste fällt weg, aber nicht der mit dem Fokus`, () => {
    const host = render();
    for (const id of ['1', '2', '3']) zeige({ id, text: `Hinweis ${id}` });
    act(() => knopf(host, 'Hinweis schließen').focus()); // im ältesten
    zeige({ id: '4', text: 'Hinweis 4' });
    expect(hinweise(host).map((h) => h.dataset.hinweis)).toEqual(['1', '3', '4']);
    expect(document.activeElement?.closest<HTMLElement>('.hinweis')?.dataset.hinweis).toBe('1');
  });

  it('höchstens zwei Aktionen; „Prüfhinweise …“ lässt ihn stehen, „Ordner öffnen“ schließt ihn', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const host = render();
    const oeffnen = vi.fn();
    const pruef = vi.fn();
    zeige({
      art: 'warnung',
      text: 'Gespeichert',
      aktionen: [
        { text: 'Ordner öffnen', aktion: oeffnen, schliesst: true },
        { text: 'Prüfhinweise …', aktion: pruef },
        { text: 'Zu viel', aktion: () => {} },
      ],
    });
    expect([...hinweise(host)[0].querySelectorAll('.hinweis-aktionen button')].map((b) => b.textContent)).toEqual(['Ordner öffnen', 'Prüfhinweise …']);
    await act(async () => knopf(host, 'Prüfhinweise …').click());
    expect(pruef).toHaveBeenCalledOnce();
    expect(hinweise(host)).toHaveLength(1);
    await act(async () => knopf(host, 'Ordner öffnen').click());
    expect(oeffnen).toHaveBeenCalledOnce();
    expect(hinweise(host)).toHaveLength(0);
  });

  it('eine fehlschlagende Aktion wird sichtbar gemeldet statt still geschlossen', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const host = render();
    zeige({ id: 'export', text: 'Gespeichert', pfad: 'C:\\Ablage', aktionen: [{ text: 'Ordner öffnen', aktion: () => Promise.reject(new Error('kein Ordner')), schliesst: true }] });
    await act(async () => knopf(host, 'Ordner öffnen').click());
    const [h] = hinweise(host);
    expect(h.className).toBe('hinweis meldung fehler');
    expect(h.querySelector('.hinweis-text')!.textContent).toBe('„Ordner öffnen“ hat nicht geklappt.');
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('hat nicht geklappt');
  });

  it('während eine Aktion läuft, sind die Knöpfe gesperrt (kein Doppelstart)', async () => {
    const host = render();
    let fertig = () => {};
    const aktion = vi.fn(() => new Promise<void>((r) => (fertig = r)));
    zeige({ text: 'Gespeichert', aktionen: [{ text: 'Prüfhinweise …', aktion }] });
    await act(async () => knopf(host, 'Prüfhinweise …').click());
    expect(knopf(host, 'Prüfhinweise …').disabled).toBe(true);
    await act(async () => knopf(host, 'Prüfhinweise …').click());
    expect(aktion).toHaveBeenCalledOnce();
    await act(async () => fertig());
    expect(knopf(host, 'Prüfhinweise …').disabled).toBe(false);
    expect(hinweise(host)).toHaveLength(1);
  });

  it('ersetzt ein neuer Hinweis mit derselben id den alten, während dessen Aktion läuft, bleibt der neue stehen', async () => {
    const host = render();
    let fertig = () => {};
    zeige({ id: 'export', text: 'Gespeichert', aktionen: [{ text: 'Ordner öffnen', aktion: () => new Promise<void>((r) => (fertig = r)), schliesst: true }] });
    await act(async () => knopf(host, 'Ordner öffnen').click());
    zeige({ id: 'export', art: 'fehler', text: 'Neuer Fehler' });
    await act(async () => fertig());
    expect(hinweise(host).map((h) => h.querySelector('.hinweis-text')!.textContent)).toEqual(['Neuer Fehler']);
  });

  it('F6 springt in den neuesten Hinweis und wieder zurück; Esc springt zurück, ohne zu schließen', () => {
    const host = render();
    const aussen = host.querySelector<HTMLButtonElement>('#aussen')!;
    act(() => aussen.focus());
    taste('F6');
    expect(document.activeElement).toBe(aussen); // ohne Hinweis tut F6 nichts
    zeige({ id: 'alt', text: 'Alt', aktionen: [{ text: 'Alt öffnen', aktion: () => {} }] });
    zeige({ id: 'neu', text: 'Neu', aktionen: [{ text: 'Neu öffnen', aktion: () => {} }] });
    taste('F6');
    expect(document.activeElement).toBe(knopf(host, 'Neu öffnen'));
    taste('F6');
    expect(document.activeElement).toBe(aussen);
    taste('F6');
    taste('Escape');
    expect(document.activeElement).toBe(aussen);
    expect(hinweise(host)).toHaveLength(2);
  });

  it('F6, das die App schon behandelt hat (defaultPrevented), lässt der Stapel in Ruhe', () => {
    const host = render();
    zeige({ text: 'Neu' });
    const aussen = host.querySelector<HTMLButtonElement>('#aussen')!;
    act(() => aussen.focus());
    const eigen = (e: KeyboardEvent) => e.preventDefault();
    aussen.addEventListener('keydown', eigen);
    taste('F6', aussen);
    expect(document.activeElement).toBe(aussen);
  });

  it('hinweisFokussieren für Apps mit eigenem F6-Kreis: false ohne Hinweis', () => {
    const host = render();
    expect(hinweisFokussieren()).toBe(false);
    zeige({ text: 'Neu' });
    let ok = false;
    act(() => void (ok = hinweisFokussieren()));
    expect(ok).toBe(true);
    expect(document.activeElement).toBe(knopf(host, 'Hinweis schließen'));
  });

  it('Schließen mit Fokus: Fokus an den nächsten Hinweis, beim letzten zurück an den Ausgangspunkt', () => {
    const host = render();
    const aussen = host.querySelector<HTMLButtonElement>('#aussen')!;
    act(() => aussen.focus());
    zeige({ id: 'a', text: 'A' });
    zeige({ id: 'b', text: 'B' });
    act(() => void hinweisFokussieren()); // in „b“
    act(() => document.querySelector<HTMLButtonElement>('[data-hinweis="b"] .hinweis-zu')!.click());
    expect(document.activeElement?.closest<HTMLElement>('.hinweis')?.dataset.hinweis).toBe('a');
    act(() => (document.activeElement as HTMLButtonElement).click());
    expect(document.activeElement).toBe(aussen);
  });

  it('Ausgangspunkt weg: Esc gibt den Fokus an den Hauptbereich', () => {
    const host = render();
    const aussen = host.querySelector<HTMLButtonElement>('#aussen')!;
    act(() => aussen.focus());
    zeige({ text: 'Neu' });
    act(() => void hinweisFokussieren());
    aussen.remove();
    taste('Escape');
    expect(document.activeElement).toBe(host.querySelector('main'));
  });

  it('ersetzt ein neuer Hinweis den fokussierten, bleibt der Fokus darin', () => {
    const host = render();
    zeige({ id: 'export', text: 'Gespeichert', aktionen: [{ text: 'Ordner öffnen', aktion: () => {} }] });
    act(() => void hinweisFokussieren());
    const vorher = document.activeElement;
    zeige({ id: 'export', text: 'Erneut gespeichert', aktionen: [{ text: 'Ordner öffnen', aktion: () => {} }] });
    expect(document.activeElement).toBe(vorher);
    expect(host.querySelector('.hinweis')!.contains(document.activeElement)).toBe(true);
  });

  it('verdeckt nie das fokussierte Element (WCAG 2.4.11): erst darüber schieben, sonst weicht der Stapel aus', () => {
    const host = render();
    host.querySelector('main')!.insertAdjacentHTML('beforeend', '<button id="frei">Frei</button>');
    zeige({ text: 'Gespeichert' });
    const aussen = host.querySelector<HTMLButtonElement>('#aussen')!;
    const frei = host.querySelector<HTMLButtonElement>('#frei')!;
    // Karten unten rechts; „Außen“ liegt darunter und lässt sich nicht verschieben, „Frei“ liegt oben links
    const flaechen = new Map<Element, DOMRect>([
      [host.querySelector('.hinweise')!, new DOMRect(500, 300, 400, 200)],
      [host.querySelector('.hinweis')!, new DOMRect(512, 400, 376, 88)],
      [aussen, new DOMRect(600, 420, 80, 24)],
      [frei, new DOMRect(10, 10, 80, 24)],
    ]);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return flaechen.get(this) ?? new DOMRect();
    });
    const schieben = vi.fn();
    aussen.scrollIntoView = schieben;
    act(() => aussen.focus());
    expect(schieben).toHaveBeenCalledWith({ block: 'nearest' });
    expect(host.querySelector('.hinweise')!.classList.contains('ausweichen')).toBe(true);
    act(() => frei.focus());
    expect(host.querySelector('.hinweise')!.classList.contains('ausweichen')).toBe(false);
  });

  it('bei offenem Dialog lässt der Stapel F6 und den Fokus in Ruhe', () => {
    const host = render();
    zeige({ text: 'Gespeichert' });
    host.insertAdjacentHTML('beforeend', '<div role="dialog" aria-modal="true"><button id="im-dialog">OK</button></div>');
    const imDialog = host.querySelector<HTMLButtonElement>('#im-dialog')!;
    act(() => imDialog.focus());
    taste('F6');
    expect(document.activeElement).toBe(imDialog);
  });

  it('Apps mit eigenem F6-Kreis (hinweisF6Eigen): der Stapel reagiert nicht selbst auf F6', () => {
    const host = render();
    zeige({ text: 'Gespeichert' });
    const aussen = host.querySelector<HTMLButtonElement>('#aussen')!;
    act(() => aussen.focus());
    hinweisF6Eigen();
    taste('F6');
    expect(document.activeElement).toBe(aussen);
    hinweisF6Eigen(false);
    taste('F6');
    expect(document.activeElement).toBe(knopf(host, 'Hinweis schließen'));
  });

  it('ersetzt ein neuer Hinweis mit anderen Aktionen den fokussierten, kommt der Fokus in den neuen', () => {
    const host = render();
    zeige({
      id: 'export',
      art: 'warnung',
      text: 'Gespeichert',
      aktionen: [
        { text: 'Ordner öffnen', aktion: () => {} },
        { text: 'Prüfhinweise …', aktion: () => {} },
      ],
    });
    act(() => knopf(host, 'Prüfhinweise …').focus());
    zeige({ id: 'export', text: 'Erneut gespeichert' });
    expect(document.activeElement).toBe(knopf(host, 'Hinweis schließen'));
  });

  it('Tab-Reihenfolge: die Knöpfe aller Hinweise stehen in Stapelreihenfolge im DOM', () => {
    const host = render();
    zeige({ id: 'a', text: 'A', aktionen: [{ text: 'A öffnen', aktion: () => {} }] });
    zeige({ id: 'b', text: 'B', aktionen: [{ text: 'B öffnen', aktion: () => {} }] });
    expect([...host.querySelectorAll('.hinweise button')].map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['A öffnen', 'Hinweis schließen', 'B öffnen', 'Hinweis schließen']);
  });

  it('ein zweiter Host zeigt nichts; baut der erste ab, übernimmt der zweite', () => {
    const host = render();
    const zweit = document.createElement('div');
    document.body.appendChild(zweit);
    const r2 = createRoot(zweit);
    act(() => r2.render(createElement(HinweisHost)));
    expect(document.querySelectorAll('.hinweise')).toHaveLength(1);
    expect(host.querySelector('.hinweise')).not.toBeNull();
    zeige({ text: 'Gespeichert' });
    act(() => root!.unmount());
    root = null;
    expect(zweit.querySelector('.hinweis')).not.toBeNull();
    let ok = false;
    act(() => void (ok = hinweisFokussieren()));
    expect(ok).toBe(true);
    act(() => r2.unmount());
  });

  it('schliesseHinweis schließt per id', () => {
    const host = render();
    let id = '';
    act(() => void (id = zeigeHinweis({ text: 'Läuft …' })));
    act(() => schliesseHinweis(id));
    expect(hinweise(host)).toHaveLength(0);
  });
});
