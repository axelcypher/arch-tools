// @vitest-environment happy-dom
// Kopf in der Desktop-Fassung (isTauri) mit dem gemeinsamen Menü (MenueHost): „Mehr“ und Sammelmarke
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readProjectFile } from '@core/archive';
import { projektdateiRoh } from '@core/projektdatei';

vi.mock('@core/platform/files', async (original) => ({
  ...(await original<typeof import('@core/platform/files')>()),
  isTauri: () => true,
}));

const { Kopf } = await import('./components/Kopf');
const { leistenMessung } = await import('@core/ui/Werkzeugleiste');
const { MenueHost } = await import('@core/ui/Menue');
const { beispielOap } = await import('./beispiel.test');
const { useBaurecht } = await import('./store');
const { pruefstandBerechnen } = await import('./pruefung');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
});

function render(aufrufe: string[] = [], lageLaeuft = false, antraege?: string[], vorher?: () => void): HTMLElement {
  const bytes = beispielOap();
  useBaurecht.getState().projektSetzen({ art: 'datei', name: 'EFH.oap', bytes }, readProjectFile(bytes), projektdateiRoh(bytes));
  const s = useBaurecht.getState();
  if (antraege) useBaurecht.setState({ antraege });
  vorher?.();
  const stand = pruefstandBerechnen(s.paket, s.project, s.merkmale, s.pruefung.fakten, {}, '2026-12-01', {});
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(
      createElement(
        Fragment,
        null,
        createElement(Kopf, {
          key: 'k',
          stand,
          onRechtsstand: () => aufrufe.push('rechtsstand'),
          onLage: () => aufrufe.push('lage'),
          onProtokoll: () => undefined,
          onSpeichern: () => undefined,
          onAntrag: (a: string) => aufrufe.push(`antrag:${a}`),
          lageLaeuft,
        }),
        createElement(MenueHost, { key: 'm' }),
      ),
    );
  });
  return host;
}

/** Klick wie im Browser: pointerdown (das gemeinsame Menü schließt darauf), Fokus, click */
function klick(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    el.focus();
  });
  act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}
const menue = () => document.querySelector<HTMLElement>('[role="menu"]');
const punkte = () => [...document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')];
const taste = (key: string) => act(() => void (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));

describe('Kopf (Desktop): Menü „Mehr“ und Sammelmarke', () => {
  it('Sammelmarke öffnet das gemeinsame Menü mit „Lage abfragen“ und „Rechtsstand prüfen“; Esc gibt den Fokus an die Marke zurück', () => {
    const host = render();
    const marke = host.querySelector<HTMLButtonElement>('.br-marke-knopf')!;
    expect(marke, 'Sammelmarke der Warnungen').toBeTruthy();
    expect(marke.getAttribute('aria-haspopup')).toBe('menu');
    klick(marke);
    expect(menue()).not.toBeNull();
    expect(marke.getAttribute('aria-expanded')).toBe('true');
    expect(punkte().map((p) => p.textContent)).toEqual([expect.stringContaining('Lage abfragen'), expect.stringContaining('Rechtsstand prüfen')]);
    // die Warnungen stehen kurz als Hinweis an „Rechtsstand prüfen“, vollständig im Tooltip
    expect(punkte()[1].getAttribute('title')).toBe(`Alle Texte sofort an der Quelle prüfen · ${marke.title}`);
    const n = marke.title.split(' · ').length;
    expect(punkte()[1].textContent).toContain(n > 1 ? `${n} Warnungen` : marke.title);
    expect(document.activeElement).toBe(punkte()[0]);
    taste('Escape');
    expect(menue()).toBeNull();
    expect(document.activeElement).toBe(marke);
    // zweiter Klick auf den Öffner eines offenen Menüs schließt es
    klick(marke);
    expect(menue()).not.toBeNull();
    klick(marke);
    expect(menue()).toBeNull();
  });

  it('„Mehr“ (Werkzeugleiste) ist ein Symbolknopf am Ende; ein Punkt führt die Aktion aus', () => {
    const aufrufe: string[] = [];
    const host = render(aufrufe);
    const mehr = host.querySelector<HTMLButtonElement>('.br-kopf .werkzeugleiste-mehr button[aria-label="Mehr"]')!;
    expect(mehr.closest('.werkzeugleiste-mehr')!.hasAttribute('hidden'), 'feste Punkte: immer sichtbar').toBe(false);
    expect(mehr.getAttribute('aria-haspopup')).toBe('menu');
    expect(mehr.title).toBe('Mehr – weitere Befehle');
    expect(mehr.querySelector('svg.symbol')).not.toBeNull();
    expect(mehr.textContent).not.toContain('▾');
    klick(mehr);
    expect(document.activeElement).toBe(punkte()[0]);
    taste('ArrowDown');
    expect(document.activeElement).toBe(punkte()[1]);
    act(() => punkte()[1].click());
    expect(aufrufe).toEqual(['rechtsstand']);
    expect(menue()).toBeNull();
  });

  it('„Speichern“ zeigt ungespeicherte Änderungen mit der Klasse „ungespeichert“ und im Namen', () => {
    const host = render();
    const speichern = () => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Speichern')!;
    expect(speichern().classList.contains('ungespeichert')).toBe(false);
    expect(speichern().getAttribute('aria-label')).toBe('Speichern');
    act(() => useBaurecht.getState().einreichungSetzen('2027-03-01'));
    expect(speichern().classList.contains('ungespeichert')).toBe(true);
    expect(speichern().getAttribute('aria-label')).toBe('Speichern – ungespeicherte Änderungen');
  });

  it('gesperrte Punkte: aria-disabled mit Grund im Hinweis, ohne Wirkung, Erstfokus auf dem ersten bedienbaren Punkt', () => {
    const aufrufe: string[] = [];
    const host = render(aufrufe, true);
    const mehr = () => host.querySelector<HTMLButtonElement>('.br-kopf .werkzeugleiste-mehr button[aria-label="Mehr"]')!;
    klick(mehr());
    const [lage, rechtsstand] = punkte();
    expect(lage.getAttribute('aria-disabled')).toBe('true');
    expect(lage.textContent).toContain('läuft');
    // die laufende Abfrage steht in der stehenden Live-Region der Leiste
    expect(host.querySelector('.br-kopf > [data-eintrag="rechtsstand"] .br-rechtsstand')!.textContent).toBe('Lage wird abgefragt …');
    expect(rechtsstand.getAttribute('aria-disabled')).toBeNull();
    expect(document.activeElement).toBe(rechtsstand);
    act(() => lage.click());
    expect(aufrufe).toEqual([]);
    expect(menue()).not.toBeNull();
    taste('Escape');
    // Texte werden geholt: auch „Rechtsstand prüfen“ gesperrt – erreichbar, der Grund steht daneben
    act(() => useBaurecht.setState({ laedt: ['bund/baugb'] }));
    klick(mehr());
    expect(punkte()[1].getAttribute('aria-disabled')).toBe('true');
    expect(punkte()[1].textContent).toContain('Texte werden geholt');
    act(() => punkte()[1].click());
    expect(aufrufe).toEqual([]);
    act(() => useBaurecht.setState({ laedt: [] }));
  });

  it('Aufbau nach der Leisten-Regel: „Speichern“ links, Hauptknopf „Prüfprotokoll …“ rechts, seltene Befehle nur in „Mehr“', () => {
    const host = render();
    const leiste = host.querySelector<HTMLElement>('.br-kopf')!;
    expect(leiste.classList.contains('werkzeugleiste'), 'Werkzeugleiste').toBe(true);
    expect(leiste.getAttribute('role')).toBe('group');
    expect(leiste.getAttribute('aria-label')).toBe('Prüfung');
    const eintraege = [...leiste.querySelectorAll<HTMLElement>(':scope > [data-eintrag]')].map((e) => e.dataset.eintrag);
    expect(eintraege[0]).toBe('speichern');
    expect(eintraege.at(-1)).toBe('protokoll');
    const knoepfe = [...leiste.querySelectorAll<HTMLButtonElement>('button')];
    const protokoll = knoepfe.find((b) => b.textContent?.trim() === 'Prüfprotokoll …')!;
    expect(protokoll.classList.contains('primary'), 'Hauptknopf').toBe(true);
    const speichern = knoepfe.find((b) => b.textContent?.trim() === 'Speichern')!;
    expect(speichern.classList.contains('primary'), 'nur ein Hauptknopf').toBe(false);
    // „Lage abfragen“ und „Rechtsstand prüfen“ stehen nicht mehr als eigene Knöpfe in der Leiste
    expect(knoepfe.map((b) => b.textContent?.trim())).not.toContain('Lage abfragen');
    expect(knoepfe.map((b) => b.textContent?.trim())).not.toContain('Rechtsstand prüfen');
  });

  it('zu schmal: die Wahl des Antrags wandert als Einfachauswahl ins Menü „Mehr“ (über den festen Punkten); Auswahl wechselt den Antrag', () => {
    const aufrufe: string[] = [];
    // jede Leiste 600 px breit, jeder Eintrag 100 px: Speichern, Antrag, Einreichung, Module, Rechtsstand, Protokoll, Mehr passen nicht
    const breite = vi.spyOn(leistenMessung, 'breite').mockImplementation((el) => (el.classList.contains('werkzeugleiste') ? 600 : 100));
    try {
      const host = render(aufrufe, false, ['BAUA 1', 'BAUA 2']);
      act(() => window.dispatchEvent(new Event('resize')));
      expect(host.querySelector<HTMLElement>('.br-kopf > [data-eintrag="antrag"]')!.hidden).toBe(true);
      // Status bleibt: Einreichung, Module und Speichern haben keinen Rang
      for (const id of ['speichern', 'einreichung', 'module', 'protokoll']) expect(host.querySelector<HTMLElement>(`.br-kopf > [data-eintrag="${id}"]`)!.hidden, id).toBe(false);
      klick(host.querySelector<HTMLButtonElement>('.br-kopf .werkzeugleiste-mehr button')!);
      const texte = punkte().map((p) => p.textContent ?? '');
      expect(texte[0]).toContain('Antrag: BAUA 1');
      expect(texte.slice(1)).toEqual([expect.stringContaining('Lage abfragen'), expect.stringContaining('Rechtsstand prüfen')]);
      // Untermenü: die Anträge als Einfachauswahl
      act(() => punkte()[0].click());
      const wahl = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
      expect(wahl.map((w) => [w.textContent, w.getAttribute('aria-checked')])).toEqual([
        [expect.stringContaining('BAUA 1'), 'true'],
        [expect.stringContaining('BAUA 2'), 'false'],
      ]);
      act(() => wahl[1].click());
      expect(aufrufe).toEqual(['antrag:BAUA 2']);
    } finally {
      breite.mockRestore();
      useBaurecht.setState({ antraege: ['BAUA 1'] });
    }
  });

  it('ohne Koordinaten: Marke „Keine Koordinaten“ fragt die Lage ab, gesperrt, solange die Abfrage läuft; die Live-Region bleibt leer im DOM', () => {
    const aufrufe: string[] = [];
    const ohneKoordinaten = () => {
      const p = useBaurecht.getState().project!;
      useBaurecht.setState({ project: { ...p, meta: { ...p.meta, koordinaten: undefined } } });
    };
    const marke = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('.br-kopf button.br-modul-chip')].find((b) => b.textContent === 'Keine Koordinaten')!;
    let host = render(aufrufe, false, undefined, ohneKoordinaten);
    expect(marke(host).disabled).toBe(false);
    act(() => marke(host).click());
    expect(aufrufe).toEqual(['lage']);
    act(() => root?.unmount());
    document.body.innerHTML = '';
    host = render(aufrufe, true, undefined, ohneKoordinaten);
    expect(marke(host).disabled).toBe(true);
    expect(marke(host).title).toContain('Die Lage wird gerade abgefragt.');
  });

  it('Kompaktstufe: reicht der Platz auch ohne Antrag nicht, zeigt „Speichern“ nur das Symbol (tb-text); der Name bleibt', () => {
    // Leiste 400 px, jeder Eintrag 100 px: auch ohne Antrag zu breit → kompakt
    const breite = vi.spyOn(leistenMessung, 'breite').mockImplementation((el) => (el.classList.contains('werkzeugleiste') ? 400 : 100));
    try {
      const host = render();
      act(() => window.dispatchEvent(new Event('resize')));
      const leiste = host.querySelector<HTMLElement>('.br-kopf')!;
      expect(leiste.classList.contains('kompakt')).toBe(true);
      expect(host.querySelector<HTMLElement>('.br-kopf > [data-eintrag="antrag"]')!.hidden, 'zuerst wandert der Antrag').toBe(true);
      const speichern = host.querySelector<HTMLButtonElement>('.br-kopf > [data-eintrag="speichern"] button')!;
      // Text in tb-text (blendet die Kompaktstufe aus), Symbol davor, Name in aria-label und title
      expect(speichern.querySelector(':scope > .tb-text')!.textContent).toBe('Speichern');
      expect(speichern.querySelector(':scope > svg.symbol')).not.toBeNull();
      expect(speichern.getAttribute('aria-label')).toBe('Speichern');
      expect(speichern.title).toContain('Strg+S');
    } finally {
      breite.mockRestore();
    }
  });

  it('Sammelmarke: sichtbar kurz „N Warnungen“, vorgelesen „Rechtsstand: N Warnungen“ (ohne tb-text – sie hat kein Symbol)', () => {
    const host = render();
    const marke = host.querySelector<HTMLButtonElement>('.br-marke-knopf')!;
    const n = marke.title.split(' · ').length;
    if (n > 1) {
      expect(marke.textContent).toBe(`${n} Warnungen`);
      expect(marke.getAttribute('aria-label')).toBe(`Rechtsstand: ${n} Warnungen`);
    } else {
      expect(marke.textContent).toBe(marke.title);
      expect(marke.hasAttribute('aria-label')).toBe(false);
    }
    expect(marke.querySelector('.tb-text')).toBeNull();
  });
});
