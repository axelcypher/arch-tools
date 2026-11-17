// @vitest-environment happy-dom
import { act, createElement, Fragment } from 'react';
import { MenueHost } from './Menue';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readProjectFile } from '../archive';
import { createProject } from '../model';
import { projektdateiAnlegen, SpeicherProjektordner } from '../platform/projektordner';
import type { GewaehltesProjekt } from './ProjektWahl';
import { ProjektWahl } from './ProjektWahl';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
beforeEach(() => localStorage.clear());
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});
const warten = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  });
const knopf = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;
const karte = (host: Element, text: string) => [...host.querySelectorAll('.pa-karte')].find((k) => k.textContent?.includes(text)) as HTMLElement;

describe('Projektwahl (QUADRIO, TERRIO, NUMIO)', () => {
  it('öffnet die Projektdatei eines Projektordners; ohne Projektdatei: Stammdaten-Dialog, Projektdatei anlegen, öffnen', async () => {
    localStorage.setItem('arch-tools:konfig:allgemein', JSON.stringify({ projekte: ['/p'], oapPfad: 'Berechnungen/{nummer} {kurzname}.oap' }));
    const fs = new SpeicherProjektordner();
    const p = createProject('Kita am Park');
    p.meta.projektcode = '2025-007';
    await fs.ordnerAnlegen('/p', '2025-007 Kita');
    await projektdateiAnlegen(fs, '/p/2025-007 Kita', 'Berechnungen/2025-007.oap', p, 'Test');
    await fs.ordnerAnlegen('/p', '2019-003 Altbau/Pläne');

    const gewaehlt: GewaehltesProjekt[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render(createElement(ProjektWahl, { app: 'Flächenrechner', fs, onGewaehlt: (g: GewaehltesProjekt) => void gewaehlt.push(g), onSchliessen: () => {} }));
    });
    await warten();
    // genau eine Quelle: aufgeklappt (P-09)
    expect(host.querySelector('.pa-gruppe-kopf')!.getAttribute('aria-expanded')).toBe('true');
    expect(host.textContent).toContain('Kita am Park');
    expect(host.textContent).toContain('ohne Projektdatei');

    act(() => karte(host, 'Kita am Park').click());
    await warten();
    expect(gewaehlt[0]).toMatchObject({ datei: '/p/2025-007 Kita/Berechnungen/2025-007.oap', ordner: '/p/2025-007 Kita', neu: false });
    expect(gewaehlt[0].project.meta.projektcode).toBe('2025-007');

    act(() => karte(host, '2019-003').click());
    await warten();
    expect(host.textContent).toContain('liegt noch keine Projektdatei');
    expect((host.querySelector('.sd-dialog input') as HTMLInputElement).value).toBe('2019-003');
    await act(async () => knopf(host, 'Projektdatei anlegen').click());
    await warten();
    expect(gewaehlt[1]).toMatchObject({ datei: '/p/2019-003 Altbau/Berechnungen/2019-003 Altbau.oap', neu: true });
    const neu = readProjectFile(fs.eintraege.get('/p/2019-003 Altbau/Berechnungen/2019-003 Altbau.oap')!);
    expect(neu.meta).toMatchObject({ projektcode: '2019-003', kurzname: 'Altbau' });
    expect(neu.meta.angelegt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // zuletzt geöffnet: je Benutzer, lokal
    expect(JSON.parse(localStorage.getItem('arch-tools:lokal:zuletzt')!).eintraege.map((e: { pfad: string }) => e.pfad)).toEqual(['/p/2019-003 Altbau', '/p/2025-007 Kita']);
  });

  it('Kontextmenü je Projekt (Öffnen, Projektordner öffnen, Anheften), Nummer und Kurzname nach dem Schema aus den Einstellungen (P-09)', async () => {
    localStorage.setItem('arch-tools:konfig:allgemein', JSON.stringify({ projekte: ['/p'], ordnerSchema: '{kurzname}_{nummer}' }));
    const fs = new SpeicherProjektordner();
    await fs.ordnerAnlegen('/p', 'Altbau_2019-003');
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render(createElement(Fragment, null, createElement(ProjektWahl, { app: 'GRZ-Nachweis', fs, onGewaehlt: () => {} }), createElement(MenueHost)));
    });
    await warten();
    // Ableitung nach dem Schema der Struktur – wie im Projektordner
    expect(karte(host, 'Altbau').querySelector('.pa-kuerzel')!.textContent).toBe('2019-003');
    act(() => karte(host, 'Altbau').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 })));
    const eintraege = () => [...host.querySelectorAll('.menue [role="menuitem"]')].map((b) => b.textContent);
    expect(eintraege()).toEqual(['Öffnen', 'Projektordner öffnen', 'Anheften']);
    await act(async () => (host.querySelector('.menue [role="menuitem"]:nth-of-type(3)') as HTMLButtonElement).click());
    await warten();
    expect(JSON.parse(localStorage.getItem('arch-tools:lokal:angeheftet')!).pfade).toEqual(['/p/Altbau_2019-003']);
    expect(host.querySelector('[aria-label="Angeheftet"]')?.textContent).toContain('2019-003');
  });

  it('ohne Stammordner: Hinweis und Datei öffnen', async () => {
    let dateiOeffnen = 0;
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render(createElement(ProjektWahl, { app: 'X', fs: new SpeicherProjektordner(), onGewaehlt: () => {}, onDateiOeffnen: () => dateiOeffnen++ }));
    });
    await warten();
    expect(host.textContent).toContain('Noch kein Stammordner eingestellt');
    act(() => knopf(host, 'Datei öffnen').click());
    expect(dateiOeffnen).toBe(1);
  });

  it('Browser ohne Ordnerzugriff: einheitlicher Einstieg mit Datei öffnen, Neues Projekt, Schließen', () => {
    const neu = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render(createElement(ProjektWahl, { app: 'TERRIO', fs: undefined, onGewaehlt: () => {}, onSchliessen: () => {}, onDateiOeffnen: () => {}, onNeu: neu }));
    });
    // Reihenfolge wie im Kopf der Übersicht: „Schließen“ links, der Hauptknopf rechts außen
    expect([...host.querySelectorAll('.pw-aktionen button')].map((b) => b.textContent)).toEqual(['Schließen', 'Neues Projekt', 'Datei öffnen …']);
    expect(host.querySelector('.pw-aktionen button:last-child')!.className).toBe('primary');
    // Titel ist der Name der App, darunter wofür sie da ist
    expect(host.querySelector('.pw-einstieg .karte-kopf h2')?.textContent).toBe('TERRIO');
    expect(host.querySelector('.pw-einstieg-was')?.textContent).toBe('GRZ-Nachweis');
    act(() => ([...host.querySelectorAll('.pw-aktionen button')][1] as HTMLButtonElement).click());
    expect(neu).toHaveBeenCalled();
  });
});

describe('Neues Projekt anlegen aus jeder App (Rahmen-App)', () => {
  const echterParent = window.parent;
  afterEach(() => {
    Object.defineProperty(window, 'parent', { value: echterParent, configurable: true });
    window.history.replaceState(null, '', '/');
  });

  it('eigenständig ohne Knopf; im Tab startet er den Assistenten von ATLAS und öffnet danach das neue Projekt', async () => {
    localStorage.setItem('arch-tools:konfig:allgemein', JSON.stringify({ projekte: ['/p'] }));
    const fs = new SpeicherProjektordner();
    await fs.ordnerAnlegen('/p', '2025-007 Kita');
    const zeigen = (gewaehlt: GewaehltesProjekt[]) => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      act(() => {
        root = createRoot(host);
        root.render(createElement(ProjektWahl, { app: 'Flächenrechner', fs, onGewaehlt: (g: GewaehltesProjekt) => void gewaehlt.push(g), onNeu: () => {}, onSchliessen: () => {} }));
      });
      return host;
    };
    // eigenständige App: kein Knopf, „Neues Projekt“ wie bisher
    let host = zeigen([]);
    await warten();
    expect(knopf(host, 'Neues Projekt anlegen')).toBeUndefined();
    expect(knopf(host, 'Neues Projekt')).toBeTruthy();
    act(() => root?.unmount());
    document.body.innerHTML = '';

    // im Tab der Rahmen-App
    const gesendet: unknown[] = [];
    const rahmen = { postMessage: (d: unknown) => gesendet.push(d) } as unknown as Window;
    Object.defineProperty(window, 'parent', { value: rahmen, configurable: true });
    window.history.replaceState(null, '', '/?rahmen=tab&app=flaechenrechner');
    const gewaehlt: GewaehltesProjekt[] = [];
    host = zeigen(gewaehlt);
    await warten();
    // hört auf den Rahmen; das leere Projekt heißt jetzt „Leeres Projekt“
    expect(gesendet).toContainEqual({ typ: 'arch-tools:bereit', app: 'flaechenrechner' });
    expect(knopf(host, 'Leeres Projekt')).toBeTruthy();
    act(() => knopf(host, 'Neues Projekt anlegen').click());
    expect(gesendet).toContainEqual({ typ: 'arch-tools:projekt-anlegen', von: 'flaechenrechner', kannOeffnen: true, app: 'flaechenrechner' });

    // ATLAS hat angelegt: neu laden und öffnen (ohne Projektdatei: Stammdaten-Dialog wie beim Klick)
    await fs.ordnerAnlegen('/p', '2026-014 Neu');
    const p = createProject('Neubau');
    p.meta.projektcode = '2026-014';
    await projektdateiAnlegen(fs, '/p/2026-014 Neu', 'Berechnungen/2026-014.oap', p, 'Test');
    // fremde Absender zählen nicht
    act(() =>
      window.dispatchEvent(
        new MessageEvent('message', { data: { typ: 'arch-tools:projekt-angelegt', an: 'flaechenrechner', ordner: '/p/2026-014 Neu' }, origin: window.location.origin, source: window }),
      ),
    );
    await warten();
    expect(gewaehlt).toHaveLength(0);
    act(() =>
      window.dispatchEvent(
        new MessageEvent('message', { data: { typ: 'arch-tools:projekt-angelegt', an: 'flaechenrechner', ordner: '/p/2026-014 Neu' }, origin: window.location.origin, source: rahmen }),
      ),
    );
    await warten();
    expect(gewaehlt[0]).toMatchObject({ datei: '/p/2026-014 Neu/Berechnungen/2026-014.oap', ordner: '/p/2026-014 Neu' });
    expect(host.textContent).toContain('Neubau');
  });
});

describe('Projektübersicht: Sammelordner und Reihenfolge der Stammordner', () => {
  it('Projekte in Gruppen-, Akquise- und Archivordnern als eigene Abschnitte; Archiv gilt als abgeschlossen; Stammordner per Ziehen umsortieren', async () => {
    localStorage.setItem('arch-tools:konfig:allgemein', JSON.stringify({ projekte: ['/a', '/b'] }));
    const fs = new SpeicherProjektordner();
    for (const p of ['2026-014 EFH/00 Projekt', '2026-014 EFH/01 Grundlagen', 'Akquise/2026-099 Kita/00 Projekt', '_Archiv/2023-010 Halle/Pläne', 'Wohnungsbau/2025-007 MFH/00 Projekt'])
      await fs.ordnerAnlegen('/a', p);
    await fs.ordnerAnlegen('/b', '2026-200 Büro/Pläne');
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render(createElement(ProjektWahl, { app: 'Flächenrechner', fs, onGewaehlt: () => {}, onSchliessen: () => {} }));
    });
    await warten();
    expect([...host.querySelectorAll('.pa-gruppe-name')].map((x) => x.textContent)).toEqual(['a', 'a › Wohnungsbau', 'a › Akquise', 'a › _Archiv', 'b']);
    // mehrere Stammordner: eingeklappt; aufklappen zeigt die Projekte, das Archiv ist als abgeschlossen ausgeblendet
    const kopf = (name: string) => [...host.querySelectorAll<HTMLButtonElement>('.pa-gruppe-kopf')].find((k) => k.querySelector('.pa-gruppe-name')?.textContent === name)!;
    act(() => kopf('a › _Archiv').click());
    expect(kopf('a › _Archiv').closest('section')!.textContent).toContain('1 abgeschlossenes Projekt ausgeblendet');
    act(() => kopf('a › Akquise').click());
    expect(kopf('a › Akquise').closest('section')!.textContent).toContain('2026-099');
    // ziehen: „b“ vor „a“ – die Abschnitte von „a“ wandern zusammen
    const ziehen = (von: HTMLElement, nach: HTMLElement) => {
      act(() => von.dispatchEvent(new Event('dragstart', { bubbles: true })));
      act(() => nach.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true })));
      act(() => nach.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true })));
    };
    ziehen(kopf('b'), kopf('a'));
    await warten();
    expect(JSON.parse(localStorage.getItem('arch-tools:konfig:allgemein')!).projekte).toEqual(['/b', '/a']);
    expect([...host.querySelectorAll('.pa-gruppe-name')].map((x) => x.textContent)).toEqual(['b', 'a', 'a › Wohnungsbau', 'a › Akquise', 'a › _Archiv']);
  });
});

describe('Startseite: Kopf, Meldung und Leerzustand in jeder App gleich', () => {
  const echterParent = window.parent;
  afterEach(() => {
    Object.defineProperty(window, 'parent', { value: echterParent, configurable: true });
    window.history.replaceState(null, '', '/');
  });
  const zeigen = (props: Record<string, unknown>) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render(createElement(ProjektWahl, { app: 'QUADRIO', onGewaehlt: () => {}, ...props }));
    });
    return host;
  };
  const kopfKnoepfe = (host: Element) => [...host.querySelectorAll('.pa > .karte-kopf .karte-aktionen button')].map((b) => b.textContent?.trim());

  it('Kopf: Schließen, weitere, Datei öffnen, Hauptknopf rechts; mit geöffnetem Projekt „Zurück zu …“ statt „Schließen“', async () => {
    localStorage.setItem('arch-tools:konfig:allgemein', JSON.stringify({ projekte: ['/p'] }));
    const fs = new SpeicherProjektordner();
    await fs.ordnerAnlegen('/p', '2025-007 Kita');
    const p = createProject('Kita');
    await projektdateiAnlegen(fs, '/p/2025-007 Kita', 'Berechnungen/2025-007.oap', p, 'Test');
    let host = zeigen({ fs, onSchliessen: () => {}, onDateiOeffnen: () => {}, onNeu: () => {} });
    await warten();
    expect(kopfKnoepfe(host)).toEqual(['Schließen', 'Datei öffnen …', 'Neues Projekt']);
    expect(host.querySelector('.pa > .karte-kopf .karte-aktionen button:last-child')!.className).toContain('primary');
    // Leiste mit Suche, Sortierung, Anzahl und Neu einlesen – die App-Farbe nur als Akzent
    expect(host.querySelector('.pa .karte-leiste input[type="search"]')).not.toBeNull();
    expect(host.querySelector('.pa .karte-leiste [aria-label="Projekte neu einlesen"]')).not.toBeNull();
    act(() => root?.unmount());
    document.body.innerHTML = '';
    // geöffnetes Projekt: „Zurück zu ‹Kürzel›“, kein zusätzliches „Schließen“
    host = zeigen({ fs, onSchliessen: () => {}, offeneDatei: '/p/2025-007 Kita/Berechnungen/2025-007.oap' });
    await warten();
    expect(kopfKnoepfe(host)).toEqual(['Zurück zu 2025-007']);
  });

  it('Meldung beim Öffnen steht in der Karte (role="alert" bei Fehlern)', async () => {
    localStorage.setItem('arch-tools:konfig:allgemein', JSON.stringify({ projekte: ['/p'] }));
    const fs = new SpeicherProjektordner();
    await fs.ordnerAnlegen('/p', '2025-007 Kita');
    // die Projektdatei ist kaputt: Lesen schlägt fehl
    fs.setze('/p/2025-007 Kita/Berechnungen/2025-007.oap', new Uint8Array([1, 2, 3]));
    const host = zeigen({ fs, onSchliessen: () => {} });
    await warten();
    act(() => karte(host, '2025-007').click());
    await warten();
    const meldung = host.querySelector('.pa [role="alert"], .pa [role="status"]');
    expect(meldung).not.toBeNull();
  });

  it('Leerzustand ohne Stammordner in der Rahmen-App: Einstieg mit „Neues Projekt anlegen …“ (Assistent von ATLAS)', async () => {
    const gesendet: unknown[] = [];
    Object.defineProperty(window, 'parent', { value: { postMessage: (d: unknown) => gesendet.push(d) } as unknown as Window, configurable: true });
    window.history.replaceState(null, '', '/?rahmen=tab&app=flaechenrechner');
    const host = zeigen({ fs: new SpeicherProjektordner(), onSchliessen: () => {}, onDateiOeffnen: () => {} });
    await warten();
    expect(host.querySelector('.pw-einstieg .karte-kopf h2')?.textContent).toBe('QUADRIO');
    // Stammordner bleibt der Hauptknopf (rechts außen), der Assistent steht daneben
    expect([...host.querySelectorAll('.pw-aktionen button')].map((b) => b.textContent?.trim())).toEqual(['Schließen', 'Datei öffnen …', 'Neues Projekt anlegen …', 'Stammordner wählen …']);
    act(() => knopf(host, 'Neues Projekt anlegen').click());
    expect(gesendet).toContainEqual({ typ: 'arch-tools:projekt-anlegen', von: 'flaechenrechner', kannOeffnen: true, app: 'flaechenrechner' });
  });
});
