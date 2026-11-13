// @vitest-environment happy-dom
import type { ReactElement } from 'react';
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8 } from 'fflate';
import { VORGABE_ALLGEMEIN } from '@core/platform/konfig';
import { App } from './App';
import { AssistentView } from './components/AssistentView';
import { PruefView } from './components/PruefView';
import { SpeicherDateisystem } from './dateisystem';
import { ausfuehren, planen } from './plan';
import { leereStammdaten } from './stammdaten';
import { useOrdner } from './store';
import { STANDARD } from './struktur';
import { farbschemaWechseln } from '@core/ui/rauchtest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// der echte Ladevorgang (die Tests ersetzen ihn sonst durch einen leeren)
const echtesKonfigLaden = useOrdner.getState().konfigLaden;

let root: ReturnType<typeof createRoot> | null = null;
function render(element: ReactElement = createElement(App)): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(element);
  });
  return host;
}
beforeEach(() => {
  localStorage.clear();
  // die gemeinsamen Einstellungen setzen die Tests selbst
  useOrdner.setState({
    stamm: leereStammdaten(),
    struktur: STANDARD,
    stammordner: '',
    vorlagenordner: '',
    vorlagen: [],
    vorlagenName: '',
    allgemein: VORGABE_ALLGEMEIN,
    konfigLaden: async () => {},
    konfigStandEigen: null,
    konflikt: null,
    rueckgaengig: null,
  });
});
afterEach(async () => {
  // anstehendes (entprelltes) Schreiben nicht in den nächsten Test tragen
  await act(() => useOrdner.getState().speichernJetzt());
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

/** Eingabe wie von Hand: Wert setzen und das Feld verlassen (die Felder übernehmen bei Fokusverlust) */
const eingabe = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    el.focus();
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => el.blur());
};
const knopf = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;
const feld = (host: Element, label: string) => [...host.querySelectorAll('label.field')].find((l) => l.querySelector('.field-label')?.textContent?.replace(/\s*\*$/, '') === label)!.querySelector('input') as HTMLInputElement;
const zeilen = (host: Element) => [...host.querySelectorAll('.po-plan tr')].map((z) => z.querySelector('td')!.getAttribute('title'));
const warten = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
const weiter = (host: Element) => act(() => knopf(host, 'Weiter:').click());

describe('ATLAS (Projektordner)', () => {
  it('„Projekte“ in der Titelleiste wie in den anderen Apps: führt zur Startseite des Assistenten (Q-5, P-13)', () => {
    const host = render();
    act(() => knopf(host, 'Ordner prüfen').click());
    const projekte = host.querySelector<HTMLButtonElement>('.titlebar-projekte')!;
    expect(projekte.textContent).toBe('Projekte');
    act(() => projekte.click());
    expect(knopf(host, 'Assistent').className).toContain('active');
  });

  it('Farbschema wechselt sofort (Menü ◐), ohne Option „Zeichenfläche abdunkeln“', () => {
    const host = render();
    expect(farbschemaWechseln(host, 'Dunkel')).toBe('dunkel');
    expect(farbschemaWechseln(host, 'Hell')).toBe('hell');
  });

  it('Assistent: neues Projekt Schritt für Schritt – Stammdaten, Umfang, Vorlagen, Anlegen', async () => {
    const host = render();
    expect(host.textContent).toContain('Neues Projekt anlegen');
    expect(host.textContent).toContain('Bestehendes Projekt ergänzen');
    act(() => knopf(host, 'Neues Projekt').click());

    // Stammdaten (P-08): frisch geöffnet keine Fehlerkästen, Pflichtfelder markiert
    expect(host.querySelector('.warning')).toBeNull();
    expect(host.querySelector('.feld-meldung')).toBeNull();
    expect(feld(host, 'Projektnummer').required).toBe(true);
    expect(feld(host, 'Kurzname').required).toBe(true);
    // aktiver Schritt für Hilfsmittel gekennzeichnet (P-12)
    expect([...host.querySelectorAll('.po-schritte li[aria-current="step"]')].map((l) => l.textContent)).toEqual(['2Stammdaten']);
    // „Weiter“ ohne Nummer und Kurzname: bleibt stehen und nennt den Grund sichtbar, Meldungen an den Feldern
    weiter(host);
    expect(host.querySelector('.po-weiter-grund')?.textContent).toBe('Noch offen: Die Projektnummer fehlt, Der Kurzname fehlt');
    expect(feld(host, 'Projektnummer').closest('label')!.querySelector('.feld-meldung')!.textContent).toBe('Angabe fehlt.');
    expect(host.querySelector('h2')?.textContent).toBe('Stammdaten');
    // Kurzname: Hinweis zu unzulässigen Zeichen schon beim Tippen, Ordnername direkt darunter
    eingabe(feld(host, 'Kurzname'), 'EFH Müller/Weg: 3?');
    expect(feld(host, 'Kurzname').closest('label')!.querySelector('.feld-meldung')!.textContent).toContain('/ : ? werden im Ordnernamen entfernt');
    // Nummer passt nicht zum Schema: Hinweis am Feld, kein Blocker (P-03)
    eingabe(feld(host, 'Projektnummer'), '26-14');
    expect(feld(host, 'Projektnummer').closest('label')!.querySelector('.feld-meldung')!.textContent).toContain('Passt nicht zum Schema {JAHR}-{Nr:3}');
    expect(host.querySelector('.sd-ordnername')?.textContent).toBe('Ordnername: 26-14 EFH Müller Weg 3');
    eingabe(feld(host, 'Projektnummer'), '2026-014');
    eingabe(feld(host, 'Kurzname'), 'EFH Musterweg');
    // Stand: Akquise
    act(() => [...host.querySelectorAll<HTMLInputElement>('.po-statuswahl input')][1].click());
    expect(useOrdner.getState().stamm.status).toBe('akquise');
    expect(host.querySelector('.po-kontext')?.textContent).toContain('2026-014 EFH Musterweg');
    expect(knopf(host, 'Weiter:').disabled).toBe(false);

    // Grundstück: Bebauungsplan bleibt erhalten
    weiter(host);
    expect(host.querySelector('h2')?.textContent).toBe('Grundstück');
    eingabe(feld(host, 'Flurstück'), '17/3');
    eingabe(feld(host, 'Bebauungsplan Nr.'), '112');
    expect(useOrdner.getState().stamm).toMatchObject({ grundstueck: { flurstueck: '17/3' }, bebauungsplan: { nummer: '112' } });
    // Bauherr
    weiter(host);
    expect(host.querySelector('h2')?.textContent).toBe('Bauherr');
    eingabe(feld(host, 'Name bzw. Firma'), 'Familie Beispiel');
    expect(useOrdner.getState().stamm).toMatchObject({ nummer: '2026-014', kurzname: 'EFH Musterweg', bauherr: { name: 'Familie Beispiel' } });

    // Umfang: Namen der Leistungsphasen sichtbar, Schnellwahl (P-07); dann nur LPh 1–3
    weiter(host);
    expect(host.querySelector('.sd-lph')?.textContent).toContain('4 Genehmigungsplanung');
    act(() => knopf(host, '1–4 bis Bauantrag').click());
    expect(useOrdner.getState().stamm.leistungsphasen).toEqual([1, 2, 3, 4]);
    act(() => knopf(host, 'ohne Einschränkung').click());
    expect(useOrdner.getState().stamm.leistungsphasen).toEqual([]);
    for (const nr of [1, 2, 3]) act(() => ([...host.querySelectorAll('.sd-lph input')][nr - 1] as HTMLInputElement).click());
    expect(useOrdner.getState().stamm.leistungsphasen).toEqual([1, 2, 3]);
    eingabe(feld(host, 'Bearbeitung'), 'TP');
    expect(host.querySelector('.sd-beteiligte')).toBeNull();

    // Beteiligte: eigener Schritt, typische Rollen mit einem Klick
    weiter(host);
    expect(host.querySelector('h2')?.textContent).toBe('Beteiligte');
    act(() => knopf(host, '+ Beteiligter').click());
    eingabe(host.querySelector('.sd-beteiligte input') as HTMLInputElement, 'Tragwerk');
    expect(useOrdner.getState().stamm.beteiligte).toEqual([{ rolle: 'Tragwerk', name: '', kontakt: '' }]);
    act(() => knopf(host, '+ Vermessung (ÖbVI)').click());
    expect(useOrdner.getState().stamm.beteiligte[1]).toEqual({ rolle: 'Vermessung (ÖbVI)', name: '', kontakt: '' });
    expect(knopf(host, '+ Vermessung (ÖbVI)')).toBeUndefined();

    // Vorlagen: Standard-Preset vorausgewählt – mit Strg+Enter (P-12)
    act(() => host.querySelector('.po-col')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })));
    await warten();
    expect(host.querySelector('h2')?.textContent).toBe('Vorlagen');
    expect((host.querySelector('.po-presetwahl input') as HTMLInputElement).checked).toBe(true);

    // Anlegen: Zusammenfassung mit Sprung zurück, Projektdatei statt projekt.json, Ordner nach Leistungsphasen
    weiter(host);
    const steckbrief = host.querySelector('.po-steckbrief')!.textContent!;
    expect(steckbrief).toContain('2026-014 EFH Musterweg');
    expect(steckbrief).toContain('Akquise');
    expect(steckbrief).toContain('Bebauungsplan Nr. 112');
    expect(steckbrief).toContain('Familie Beispiel');
    expect(steckbrief).toContain('LPh 1, 2, 3');
    expect(steckbrief).toContain('Vermessung (ÖbVI)');
    expect(zeilen(host)).toContain('03 Berechnungen/Flächen/2026-014 EFH Musterweg.oap');
    expect(zeilen(host)).not.toContain('projekt.json');
    expect(zeilen(host)).not.toContain('02 Pläne/Ausführung');
    expect(zeilen(host)).not.toContain('08 Bauleitung');
    expect(host.textContent).toContain('gehören zu nicht beauftragten Leistungsphasen');
    expect(knopf(host, 'Als ZIP herunterladen').disabled).toBe(false);
    // Texte passend zur Lage (PB-05): Singular, kein Satz zur Sicherung beim neuen Projekt, Ausgabe im Browser erklärt
    expect(host.querySelector('h3')?.textContent).toMatch(/– \d+ Ordner und 1 Datei neu$/);
    expect(host.textContent).toContain('Die Projektdatei wird neu angelegt.');
    expect(host.textContent).not.toContain('vorher gesichert');
    expect(host.textContent).not.toContain('Stammordner für Projekte');
    expect(host.textContent).toContain('ZIP-Datei zum Herunterladen');

    // zurück zu den Stammdaten über die Schrittleiste, Formular leeren
    act(() => knopf(host, '2Stammdaten').click());
    act(() => knopf(host, 'Formular leeren').click());
    expect(useOrdner.getState().stamm).toMatchObject({ nummer: '', beteiligte: [], bearbeiter: 'TP' });
    // ohne Stammdaten sind die späteren Schritte gesperrt
    expect(knopf(host, '8Anlegen').disabled).toBe(true);
  });

  it('Einstellungen: gemeinsame Einstellungen aller Apps', () => {
    const host = render();
    act(() => knopf(host, 'Einstellungen').click());
    expect(host.textContent).toContain('Gemeinsame Einstellungen');
    eingabe(feld(host, 'Projektdatei (.oap) in neuen Projekten'), 'Planung/Berechnungen/{nummer}');
    expect(useOrdner.getState().allgemein.oapPfad).toBe('Planung/Berechnungen/{nummer}');
    expect(host.textContent).toContain('Beispiel: Planung/Berechnungen/');
    eingabe(feld(host, 'Fotoordner im Projekt'), '10 Fotos');
    expect(useOrdner.getState().allgemein.fotoordner).toBe('10 Fotos');
    // Kürzel der Mitarbeiter: Vorschläge für „Bearbeitung“ (P-14)
    eingabe(feld(host, 'Mitarbeiter (Kürzel)'), 'TP, AK; TP');
    expect(useOrdner.getState().allgemein.mitarbeiter).toEqual(['TP', 'AK']);
    // die Struktur steht im eigenen Reiter
    expect(host.querySelector('[role="tree"]')).toBeNull();
  });

  it('Einstellungen: Stammordner per Ziehen bzw. ↑ ↓ umsortieren – der erste nimmt neue Projekte auf', () => {
    useOrdner.setState({ allgemein: { ...VORGABE_ALLGEMEIN, projekte: ['/srv/Projekte', '/srv/Akquise', '/srv/Archiv'] }, stammordner: '/srv/Projekte' });
    const host = render();
    act(() => knopf(host, 'Einstellungen').click());
    const eintraege = () => [...host.querySelectorAll('.po-stammordner li')];
    const reihe = () => useOrdner.getState().allgemein.projekte;
    // Archiv ganz nach oben ziehen
    act(() => eintraege()[2].dispatchEvent(new Event('dragstart', { bubbles: true })));
    act(() => eintraege()[0].dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true })));
    act(() => eintraege()[0].dispatchEvent(new Event('drop', { bubbles: true, cancelable: true })));
    expect(reihe()).toEqual(['/srv/Archiv', '/srv/Projekte', '/srv/Akquise']);
    expect(useOrdner.getState().stammordner).toBe('/srv/Archiv');
    expect(eintraege()[0].textContent).toContain('neue Projekte');
    // mit den Pfeilen
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="/srv/Archiv nach unten"]')!.click());
    expect(reihe()).toEqual(['/srv/Projekte', '/srv/Archiv', '/srv/Akquise']);
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="/srv/Akquise nach oben"]')!.click());
    expect(reihe()).toEqual(['/srv/Projekte', '/srv/Akquise', '/srv/Archiv']);
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="/srv/Projekte nach oben"]')!.disabled).toBe(true);
  });

  it('Struktur: Klick-Editor – auswählen, umbenennen, anlegen, Leistungsphasen, ziehen, kopieren, Bausteine, rückgängig', async () => {
    useOrdner.setState({ struktur: { ...STANDARD, ordner: [{ pfad: '05 Protokolle' }, { pfad: '07 Ausschreibung', lph: [6, 7] }, { pfad: '09 Fotos' }] } });
    const host = render();
    act(() => knopf(host, 'Struktur').click());
    const baum = host.querySelector<HTMLElement>('[role="tree"]')!;
    const z = (pfad: string) => host.querySelector<HTMLElement>(`[role="treeitem"][aria-label="${pfad}"]`)!;
    const klick = (pfad: string, mod: MouseEventInit = {}) => act(() => z(pfad).dispatchEvent(new MouseEvent('click', { bubbles: true, ...mod })));
    const taste = (key: string, mod: KeyboardEventInit = {}) => act(() => baum.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...mod })));
    const pfade = () => useOrdner.getState().struktur.ordner.map((o) => o.pfad);
    const neuerName = (name: string) => {
      const el = host.querySelector<HTMLInputElement>('input[aria-label="Neuer Name"]')!;
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, name);
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
    };
    expect([...host.querySelectorAll('[role="treeitem"]')].map((e) => e.getAttribute('aria-label'))).toEqual(['05 Protokolle', '07 Ausschreibung', '09 Fotos']);

    // auswählen: Leistungsphasen und Dateischema rechts
    klick('09 Fotos');
    expect(z('09 Fotos').getAttribute('aria-selected')).toBe('true');
    act(() => host.querySelector<HTMLButtonElement>('.po-auswahl-panel button[aria-label="LPh 9"]')!.click());
    expect(useOrdner.getState().struktur.ordner.find((o) => o.pfad === '09 Fotos')!.lph).toEqual([9]);
    expect(z('09 Fotos').textContent).toContain('LPh 9');
    // umbenennen per Doppelklick
    act(() => z('09 Fotos').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    neuerName('10 Fotos');
    expect(pfade()).toEqual(['05 Protokolle', '07 Ausschreibung', '10 Fotos']);
    expect(z('10 Fotos').getAttribute('aria-selected')).toBe('true');
    // Unterordner mit Strg+N: entsteht im gewählten Ordner, gleich zum Benennen
    klick('07 Ausschreibung');
    taste('n', { ctrlKey: true });
    neuerName('Rohbau');
    expect(pfade()).toContain('07 Ausschreibung/Rohbau');
    // geerbte Leistungsphasen: Hinweis am Unterordner
    expect(z('07 Ausschreibung/Rohbau').querySelector('.po-k-marke.geerbt')?.textContent).toBe('LPh 6-7');
    expect(host.querySelector('.po-auswahl-panel')!.textContent).toContain('Entsteht nur, wenn auch „07 Ausschreibung“ (LPh 6-7) entsteht');

    // mehrere Unterordner auf einmal (eingerückt)
    act(() => knopf(host, 'Mehrere anlegen').click());
    const liste = host.querySelector<HTMLTextAreaElement>('.modal textarea')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(liste, 'Angebote\nVergabe\n\tVerträge');
      liste.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(host.querySelector('.po-mehrere-vorschau')!.textContent).toContain('Vergabe\n  Verträge');
    act(() => knopf(host.querySelector('.modal')!, 'Anlegen').click());
    expect(pfade()).toEqual([
      '05 Protokolle',
      '07 Ausschreibung',
      '07 Ausschreibung/Rohbau',
      '07 Ausschreibung/Rohbau/Angebote',
      '07 Ausschreibung/Rohbau/Vergabe',
      '07 Ausschreibung/Rohbau/Vergabe/Verträge',
      '10 Fotos',
    ]);

    // Unterordner von Rohbau als Baustein speichern …
    klick('07 Ausschreibung/Rohbau');
    act(() => knopf(host, 'Als Baustein').click());
    await warten();
    eingabe(host.querySelector<HTMLInputElement>('.modal.rf input')!, 'Gewerk');
    act(() => knopf(host.querySelector('.modal.rf')!, 'Speichern').click());
    await warten();
    expect(useOrdner.getState().struktur.bausteine).toEqual([{ name: 'Gewerk', ordner: [{ pfad: 'Angebote' }, { pfad: 'Vergabe' }, { pfad: 'Vergabe/Verträge' }] }]);
    // … zwei neue Gewerke anlegen und den Baustein in beide auf einmal einfügen
    klick('07 Ausschreibung');
    taste('n', { ctrlKey: true });
    neuerName('Dach');
    taste('n', { ctrlKey: true, shiftKey: true });
    neuerName('Fenster');
    expect(pfade()).toContain('07 Ausschreibung/Fenster');
    klick('07 Ausschreibung/Dach', { ctrlKey: true });
    expect(host.querySelector('.po-auswahl-panel h3')!.textContent).toBe('2 Ordner gewählt');
    act(() => knopf(host.querySelector('.po-bausteine')!, 'In 2 einfügen').click());
    expect(pfade().filter((p) => p.startsWith('07 Ausschreibung/Dach/') || p.startsWith('07 Ausschreibung/Fenster/'))).toEqual([
      '07 Ausschreibung/Dach/Angebote',
      '07 Ausschreibung/Dach/Vergabe',
      '07 Ausschreibung/Dach/Vergabe/Verträge',
      '07 Ausschreibung/Fenster/Angebote',
      '07 Ausschreibung/Fenster/Vergabe',
      '07 Ausschreibung/Fenster/Vergabe/Verträge',
    ]);
    expect(host.querySelector('.po-editor-meldung')!.textContent).toContain('in 2 Ordner eingefügt');
    // Leistungsphasen für beide auf einmal
    act(() => host.querySelector<HTMLButtonElement>('.po-auswahl-panel button[aria-label="LPh 6"]')!.click());
    expect(useOrdner.getState().struktur.ordner.filter((o) => o.lph?.includes(6)).map((o) => o.pfad)).toEqual(['07 Ausschreibung', '07 Ausschreibung/Dach', '07 Ausschreibung/Fenster']);

    // kopieren und in einen anderen Ordner einfügen
    klick('05 Protokolle');
    taste('n', { ctrlKey: true });
    neuerName('Baubesprechungen');
    klick('07 Ausschreibung/Dach');
    taste('c', { ctrlKey: true });
    klick('05 Protokolle');
    taste('v', { ctrlKey: true });
    expect(pfade()).toContain('05 Protokolle/Dach/Vergabe/Verträge');
    // duplizieren
    klick('10 Fotos');
    taste('d', { ctrlKey: true });
    neuerName('11 Videos');
    expect(pfade().slice(-2)).toEqual(['10 Fotos', '11 Videos']);

    // ziehen & ablegen: „11 Videos“ in „10 Fotos“
    act(() => z('11 Videos').dispatchEvent(new Event('dragstart', { bubbles: true })));
    act(() => z('10 Fotos').dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true })));
    act(() => z('10 Fotos').dispatchEvent(new Event('drop', { bubbles: true, cancelable: true })));
    expect(pfade().slice(-2)).toEqual(['10 Fotos', '10 Fotos/11 Videos']);
    // nicht in sich selbst
    act(() => z('10 Fotos').dispatchEvent(new Event('dragstart', { bubbles: true })));
    act(() => z('10 Fotos/11 Videos').dispatchEvent(new Event('drop', { bubbles: true, cancelable: true })));
    expect(host.querySelector('.po-editor-meldung')!.textContent).toContain('nicht in sich selbst');
    // Alt+← rückt aus, Rückgängig nimmt es zurück, Wiederholen wieder vor
    klick('10 Fotos/11 Videos');
    taste('ArrowLeft', { altKey: true });
    expect(pfade().slice(-2)).toEqual(['10 Fotos', '11 Videos']);
    taste('z', { ctrlKey: true });
    expect(pfade().slice(-2)).toEqual(['10 Fotos', '10 Fotos/11 Videos']);
    taste('y', { ctrlKey: true });
    expect(pfade().slice(-1)).toEqual(['11 Videos']);
    // löschen (ohne Unterordner ohne Rückfrage), Kontextmenü
    taste('Delete');
    expect(pfade()).not.toContain('11 Videos');
    act(() => z('05 Protokolle').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
    expect([...host.querySelectorAll('.po-menue button')].map((b) => b.textContent)).toEqual(
      expect.arrayContaining(['Unterordner anlegen', 'Baustein „Gewerk“ einfügen', 'Umbenennen', 'Duplizieren', 'Kopieren', 'Einfügen', 'Unterordner als Baustein speichern …', 'Löschen']),
    );
    // Vorschau für Leistungsphasen: Ordner, die bei LPh 1–4 nicht entstehen, sind blass
    act(() => knopf(host, 'Unterordner anlegen').click());
    neuerName('Intern');
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Vorschau LPh 4"]')!.click());
    expect(z('07 Ausschreibung/Dach/Angebote').className).toContain('entfaellt');
    expect(z('05 Protokolle/Intern').className).not.toContain('entfaellt');
  });

  it('Struktur: Schemata, Textansicht, Standard wiederherstellen und Sicherungen', async () => {
    const host = render();
    act(() => knopf(host, 'Struktur').click());
    eingabe(feld(host, 'Name des Projektordners'), '{nummer}_{kurzname}');
    expect(useOrdner.getState().struktur.ordnername).toBe('{nummer}_{kurzname}');
    // Platzhalter einfügen (Chips, global und lokal unterscheidbar), Vorschau und unbekannte Platzhalter schon beim Tippen (P-06)
    const chips = host.querySelector<HTMLElement>('[role="group"][aria-label="Platzhalter: Name des Projektordners"]')!;
    expect(chips.querySelectorAll('.ph-global').length).toBeGreaterThan(5);
    act(() => chips.querySelector<HTMLButtonElement>('button[aria-label^="{JAHR} einfügen"]')!.click());
    expect(useOrdner.getState().struktur.ordnername).toBe('{nummer}_{kurzname} {JAHR}');
    // alte Namen funktionieren weiter; „Vorlage anpassen“ stellt erst auf Wunsch um
    const ordnerFeld = feld(host, 'Name des Projektordners');
    const veraltet = ordnerFeld.closest('label')!.querySelector('.ph-veraltet')!;
    expect(veraltet.textContent).toContain('{nummer} → {PROJEKT_KUERZEL}');
    act(() => veraltet.querySelector('button')!.click());
    expect(useOrdner.getState().struktur.ordnername).toBe('{PROJEKT_KUERZEL}_{PROJEKT_KURZNAME} {JAHR}');
    expect(ordnerFeld.closest('label')!.querySelector('.ph-veraltet')).toBeNull();
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(ordnerFeld, '{nummer} {Bauherr}');
      ordnerFeld.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(ordnerFeld.closest('label')!.querySelector('.feld-meldung')!.textContent).toContain('{Bauherr}');
    expect(ordnerFeld.closest('label')!.querySelector('.po-vorschau')!.textContent).toBe('Beispiel: 2026-014 {Bauherr}');
    eingabe(ordnerFeld, '{nummer}_{kurzname}');
    // Ordner im Baum ändern: LPh und Dateischema
    act(() => host.querySelector<HTMLElement>('[role="treeitem"][aria-label="09 Fotos"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    act(() => host.querySelector<HTMLButtonElement>('.po-auswahl-panel button[aria-label="LPh 9"]')!.click());
    act(() => host.querySelector<HTMLElement>('[role="treeitem"][aria-label="05 Protokolle"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    act(() => host.querySelector<HTMLInputElement>('.po-auswahl-panel input[type="checkbox"]')!.click());
    expect(useOrdner.getState().struktur.ordner.find((o) => o.pfad === '05 Protokolle')!.dateischema).toBe(true);
    act(() => host.querySelector<HTMLElement>('[role="treeitem"][aria-label="09 Fotos"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    eingabe(host.querySelector<HTMLInputElement>('input[aria-label="Name des Ordners"]')!, '10 Fotos');
    expect(useOrdner.getState().struktur.ordner.some((o) => o.pfad === '10 Fotos' && o.lph?.[0] === 9)).toBe(true);
    // dieselbe Liste in der Textansicht
    act(() => knopf(host, 'Text (Experte)').click());
    const text = host.querySelector('textarea') as HTMLTextAreaElement;
    expect(text.value).toContain('05 Protokolle | Dateischema');
    expect(text.value).toContain('10 Fotos | LPh 9');
    expect(text.value.split('\n')).toHaveLength(STANDARD.ordner.length);
    eingabe(text, 'A\nB/C | LPh 5-6 | Dateischema');
    expect(useOrdner.getState().struktur.ordner).toEqual([{ pfad: 'A' }, { pfad: 'B/C', lph: [5, 6], dateischema: true }]);
    // fehlerhafte Liste (PB-03): Meldungen mit Zeilennummer, beim Verlassen nicht übernommen – erst über den Knopf
    eingabe(text, 'A\nB/C | LPh 5-6 | Dateischema\nX | LPh 10\na\nTest<>Ordner');
    expect(useOrdner.getState().struktur.ordner).toEqual([{ pfad: 'A' }, { pfad: 'B/C', lph: [5, 6], dateischema: true }]);
    const meldungen = host.querySelector('.po-ordnermeldungen')!.textContent;
    expect(meldungen).toContain('Zeile 3: LPh 10 gibt es nicht');
    expect(meldungen).toContain('Zeile 4 doppelt zu Zeile 1');
    expect(meldungen).toContain('Zeile 5: Zeichen < > werden entfernt');
    act(() => knopf(host, 'Ordnerliste übernehmen').click());
    expect(useOrdner.getState().struktur.ordner.map((o) => o.pfad)).toEqual(['A', 'B/C', 'X', 'Test Ordner']);
    expect(host.querySelector('.po-ordnermeldungen')).toBeNull();
    eingabe(text, 'A\nB/C | LPh 5-6 | Dateischema');
    expect(useOrdner.getState().struktur.ordner).toHaveLength(2);
    // leere Liste wird nicht übernommen
    eingabe(text, '# nichts');
    expect(useOrdner.getState().struktur.ordner).toHaveLength(2);
    expect(host.textContent).toContain('Die Liste enthält keinen Ordner');
    // Standard: erst Rückfrage mit Vorschau, Abbrechen ändert nichts (P-01)
    act(() => knopf(host, 'Standard').click());
    await warten();
    expect(host.querySelector('.modal')?.textContent).toContain('Standardstruktur wiederherstellen?');
    expect(host.querySelector('.modal')?.textContent).toMatch(/2 Ordner entfallen, \d+ neu/);
    act(() => knopf(host, 'Abbrechen').click());
    await warten();
    expect(useOrdner.getState().struktur.ordner).toHaveLength(2);
    // Bestätigen ersetzt – vorher gesichert
    act(() => knopf(host, 'Standard').click());
    await warten();
    act(() => knopf(host, 'Ersetzen').click());
    await warten();
    expect(useOrdner.getState().struktur).toEqual(STANDARD);
    const sicherungen = JSON.parse(localStorage.getItem('arch-tools:konfig:projektordner-sicherungen')!).sicherungen;
    expect(sicherungen).toHaveLength(1);
    expect(sicherungen[0].name).toMatch(/^projektordner\.json\.bak-\d{4}-\d{2}-\d{2}-\d{4}$/);
    expect(sicherungen[0].inhalt.struktur.ordner).toEqual([{ pfad: 'A' }, { pfad: 'B/C', lph: [5, 6], dateischema: true }]);
    // „Rückgängig“ stellt wieder her
    act(() => knopf(host, 'Rückgängig').click());
    expect(useOrdner.getState().struktur.ordner).toHaveLength(2);
    // Sicherung wiederherstellen: die Liste zeigt sie, gleicher Stand = keine Änderung
    act(() => knopf(host, 'Sicherungen').click());
    await warten();
    expect(host.querySelector('.po-sicherungen')?.textContent).toContain('vor: Neutrale Standardstruktur wiederhergestellt');
    act(() => knopf(host, 'Wiederherstellen').click());
    await warten();
    expect(host.textContent).toContain('Keine Änderung');
    act(() => knopf(host, 'Standard').click());
    await warten();
    act(() => knopf(host, 'Ersetzen').click());
    await warten();
    // gespeichert im Konfigurationsordner (im Browser: lokaler Speicher), entprellt
    await act(() => useOrdner.getState().speichernJetzt());
    expect(JSON.parse(localStorage.getItem('arch-tools:konfig:projektordner')!).struktur.ordnername).toBe(STANDARD.ordnername);
  });

  it('Einstellungen: Kürzel und Plannummern – Stellen tauschen, Kürzel ändern, ungültige Kürzel melden, Vorgabe wiederherstellen', async () => {
    const host = render();
    act(() => knopf(host, 'Einstellungen').click());
    const bereich = host.querySelector<HTMLElement>('.po-namensschema')!;
    const schema = () => useOrdner.getState().allgemein.namensschema!;
    const beispiel = () => bereich.querySelector('code')!.textContent;
    const eingabeMit = (label: string) => bereich.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    expect(beispiel()).toBe('HVO GP 261111 GP-04 Grundriss OG.pdf');
    // noch keine eigene Fassung: es gilt die Vorgabe, „Vorgabe wiederherstellen“ ist aus
    expect(knopf(bereich, 'Vorgabe wiederherstellen').disabled).toBe(true);

    // Stelle 2 auf Plannummer: die beiden Teile tauschen die Plätze, das Beispiel folgt
    const stelle = (n: number) => [...bereich.querySelectorAll('.po-stellen label')].find((l) => l.textContent?.startsWith(`Stelle ${n}`))!.querySelector('select')!;
    act(() => {
      stelle(2).value = 'nummer';
      stelle(2).dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(schema().reihenfolge).toEqual(['code', 'nummer', 'datum', 'art']);
    expect(beispiel()).toBe('HVO GP-04 261111 GP Grundriss OG.pdf');
    expect(bereich.textContent).toContain('Phase GP, Datum 261111, Plannummer GP-04');
    expect(bereich.querySelectorAll('code')[1].textContent).toBe('HVO GP-04 261111 BAUA …');

    // Index ab Leistungsphase: beim Verlassen übernommen; außerhalb des Bereichs nicht gekappt, sondern gemeldet
    const index = bereich.querySelector<HTMLInputElement>('.po-index input')!;
    eingabe(index, '4');
    expect(schema().indexAbLph).toBe(4);
    eingabe(index, '12');
    expect(schema().indexAbLph).toBe(4);
    expect(index.value).toBe('12');
    expect(index.className).toContain('feld-fehler');
    expect(bereich.querySelector('.po-index .feld-meldung')!.textContent).toBe('„12“: Leistungsphase 0 bis 9 (ganze Zahl).');
    eingabe(index, '');
    expect(bereich.querySelector('.po-index .feld-meldung')!.textContent).toBe('Bitte eine Leistungsphase von 0 bis 9 eintragen.');
    eingabe(index, '5');
    expect(schema().indexAbLph).toBe(5);
    expect(bereich.querySelector('.po-index .feld-meldung')).toBeNull();

    // Kürzel ändern: klein getippt, groß übernommen
    const kuerzel = (liste: string, k: string) => eingabeMit(`${liste}: Kürzel ${k}`);
    eingabe(kuerzel('Planphasen', 'BP'), 'bp');
    expect(schema().phasen[0].kuerzel).toBe('BP');
    // umbenennen und mit Tab weiter zur Bedeutung: die Zeile bleibt, der Fokus auch
    const feldBp = kuerzel('Planphasen', 'BP');
    const bedeutung = eingabeMit('Planphasen: Bedeutung von BP');
    act(() => {
      feldBp.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(feldBp, 'bs');
      feldBp.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => bedeutung.focus());
    expect(schema().phasen.map((k) => k.kuerzel)).toEqual(['BS', 'EP', 'GP', 'AP', 'AB']);
    expect(bedeutung.isConnected).toBe(true);
    expect(document.activeElement).toBe(bedeutung);
    act(() => bedeutung.blur());
    // ungültig oder doppelt: das Feld zeigt wieder das alte Kürzel, die Meldung sagt warum
    eingabe(kuerzel('Planphasen', 'EP'), 'E-P');
    expect(schema().phasen[1].kuerzel).toBe('EP');
    expect(kuerzel('Planphasen', 'EP').value).toBe('EP');
    // die zuletzt erschienene Meldung
    const meldung = () => [...bereich.querySelectorAll<HTMLElement>('.feld-meldung[role="alert"]')].at(-1)!;
    expect(meldung().textContent).toBe('„E-P“: nur Großbuchstaben und Ziffern, höchstens 8 Zeichen – es bleibt EP.');
    expect(kuerzel('Planphasen', 'EP').getAttribute('aria-describedby')).toBe(meldung().id);
    eingabe(kuerzel('Planphasen', 'EP'), 'gp');
    expect(meldung().textContent).toBe('„gp“: gibt es schon – es bleibt EP.');
    expect(schema().phasen[1].kuerzel).toBe('EP');

    // Bedeutung, Schreibweisen (bereinigt angezeigt) und Leistungsphase (begrenzt, leer = keine)
    eingabe(eingabeMit('Antrags- und Verfahrensarten: Bedeutung von ENTW'), ' Entwässerungsgesuch ');
    expect(schema().antragsarten.find((k) => k.kuerzel === 'ENTW')!.name).toBe('Entwässerungsgesuch');
    expect(eingabeMit('Antrags- und Verfahrensarten: Bedeutung von ENTW').value).toBe('Entwässerungsgesuch');
    eingabe(eingabeMit('Antrags- und Verfahrensarten: Schreibweisen von BAUA'), 'ba, BA,  baua');
    expect(schema().antragsarten.find((k) => k.kuerzel === 'BAUA')!.synonyme).toEqual(['BA']);
    expect(eingabeMit('Antrags- und Verfahrensarten: Schreibweisen von BAUA').value).toBe('BA');
    // eine Schreibweise, die schon vergeben ist (Kürzel einer Phase, Schreibweise einer anderen Art), wird nicht gespeichert
    eingabe(eingabeMit('Antrags- und Verfahrensarten: Schreibweisen von BAUA'), 'BA, GP');
    expect(meldung().textContent).toBe('„GP“: gibt es schon – es bleibt „BA“.');
    expect(eingabeMit('Antrags- und Verfahrensarten: Schreibweisen von BAUA').value).toBe('BA');
    eingabe(eingabeMit('Antrags- und Verfahrensarten: Schreibweisen von DENK'), 'bva');
    expect(meldung().textContent).toBe('„BVA“: gibt es schon – es bleibt keine Schreibweise.');
    expect(schema().antragsarten.find((k) => k.kuerzel === 'DENK')!.synonyme).toBeUndefined();
    // Leistungsphase: ungültig gemeldet, leer = keine
    eingabe(eingabeMit('Planphasen: Leistungsphase von AB'), '15');
    expect(schema().phasen.find((k) => k.kuerzel === 'AB')!.lph).toBeUndefined();
    expect(eingabeMit('Planphasen: Leistungsphase von AB').getAttribute('aria-invalid')).toBe('true');
    // die Meldung steht in der Meldungszeile der Tabelle, nicht in der schmalen LPH-Spalte
    const lphMeldung = eingabeMit('Planphasen: Leistungsphase von AB').closest('tr')!.nextElementSibling!.querySelector<HTMLElement>('.feld-meldung')!;
    expect(lphMeldung.textContent).toBe('„15“: Leistungsphase 0 bis 9 (ganze Zahl).');
    expect(lphMeldung.closest('td')!.getAttribute('colspan')).toBe('4');
    expect(eingabeMit('Planphasen: Leistungsphase von AB').getAttribute('aria-describedby')).toBe(lphMeldung.id);
    eingabe(eingabeMit('Planphasen: Leistungsphase von AB'), '6');
    expect(schema().phasen.find((k) => k.kuerzel === 'AB')!.lph).toBe(6);
    eingabe(eingabeMit('Planphasen: Leistungsphase von AB'), '');
    expect(schema().phasen.find((k) => k.kuerzel === 'AB')!.lph).toBeUndefined();

    // neues Kürzel: erst gespeichert, wenn die Zeile mit einem gültigen Kürzel verlassen wird
    const antragsarten = bereich.querySelectorAll<HTMLElement>('.po-kuerzel')[1];
    act(() => knopf(antragsarten, '+ Kürzel').click());
    expect(knopf(antragsarten, '+ Kürzel').disabled).toBe(true);
    expect(schema().antragsarten.map((k) => k.kuerzel)).not.toContain('');
    eingabe(eingabeMit('Antrags- und Verfahrensarten: Bedeutung von neues Kürzel'), 'Wohnungseigentum');
    expect(schema().antragsarten).toHaveLength(6);
    eingabe(eingabeMit('Antrags- und Verfahrensarten: Kürzel neues Kürzel'), 'baua');
    expect(meldung().textContent).toBe('„baua“: gibt es schon – noch nicht gespeichert.');
    expect(schema().antragsarten).toHaveLength(6);
    eingabe(eingabeMit('Antrags- und Verfahrensarten: Kürzel neues Kürzel'), 'weg');
    expect(schema().antragsarten.at(-1)).toEqual({ kuerzel: 'WEG', name: 'Wohnungseigentum' });
    expect(knopf(antragsarten, '+ Kürzel').disabled).toBe(false);
    // verwerfen (× oder Esc) speichert nichts
    act(() => knopf(antragsarten, '+ Kürzel').click());
    act(() => bereich.querySelector<HTMLButtonElement>('button[aria-label="Neues Kürzel verwerfen"]')!.click());
    expect(schema().antragsarten).toHaveLength(7);
    act(() => knopf(antragsarten, '+ Kürzel').click());
    act(() => void eingabeMit('Antrags- und Verfahrensarten: Kürzel neues Kürzel').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(bereich.querySelector('button[aria-label="Neues Kürzel verwerfen"]')).toBeNull();
    expect(schema().antragsarten).toHaveLength(7);
    // entfernen: mit Rückfrage
    act(() => bereich.querySelector<HTMLButtonElement>('button[aria-label="WEG entfernen"]')!.click());
    await warten();
    expect(host.querySelector('.modal')?.textContent).toContain('WEG entfernen?');
    act(() => knopf(host.querySelector('.modal')!, 'Abbrechen').click());
    await warten();
    expect(schema().antragsarten.map((k) => k.kuerzel)).toContain('WEG');
    act(() => bereich.querySelector<HTMLButtonElement>('button[aria-label="WEG entfernen"]')!.click());
    await warten();
    act(() => knopf(host.querySelector('.modal')!, 'Entfernen').click());
    await warten();
    expect(schema().antragsarten.map((k) => k.kuerzel)).not.toContain('WEG');

    // Vorgabe wiederherstellen: mit Rückfrage, danach gilt wieder die eingebaute Vorgabe – auch in den Feldern
    act(() => knopf(bereich, 'Vorgabe wiederherstellen').click());
    await warten();
    expect(host.querySelector('.modal')?.textContent).toContain('Vorgabe wiederherstellen?');
    act(() => knopf(host.querySelector('.modal')!, 'Wiederherstellen').click());
    await warten();
    expect(schema().reihenfolge).toEqual(['code', 'art', 'datum', 'nummer']);
    expect(schema().phasen[0].kuerzel).toBe('BP');
    expect(beispiel()).toBe('HVO GP 261111 GP-04 Grundriss OG.pdf');
    expect(eingabeMit('Antrags- und Verfahrensarten: Bedeutung von ENTW').value).toBe('Entwässerungsantrag');
    expect(eingabeMit('Antrags- und Verfahrensarten: Schreibweisen von BAUA').value).toBe('');
    expect(eingabeMit('Planphasen: Leistungsphase von AB').value).toBe('');
    expect(index.value).toBe('5');
    // wieder die Vorgabe: nichts mehr wiederherzustellen
    expect(knopf(bereich, 'Vorgabe wiederherstellen').disabled).toBe(true);
  });

  it('Struktur von einem anderen Rechner geändert: Meldung statt Überschreiben, neu laden oder eigene Fassung speichern (P-02)', async () => {
    useOrdner.setState({ konfigLaden: echtesKonfigLaden });
    await act(() => useOrdner.getState().konfigLaden());
    const fremd = (name: string) => localStorage.setItem('arch-tools:konfig:projektordner', JSON.stringify({ struktur: { ...STANDARD, name }, vorlagenordner: '' }));
    const host = render();
    act(() => knopf(host, 'Struktur').click());
    await warten();
    // das Schema der Ordnernamen steht für alle Apps in den gemeinsamen Einstellungen (P-09)
    expect(JSON.parse(localStorage.getItem('arch-tools:konfig:allgemein')!).ordnerSchema).toBe(STANDARD.ordnername);
    // ein anderer Rechner speichert dazwischen
    fremd('Fremd');
    eingabe(feld(host, 'Name der Struktur'), 'Meine');
    await act(() => useOrdner.getState().speichernJetzt());
    expect(host.querySelector('.po-konflikt')?.textContent).toContain('von einem anderen Rechner geändert');
    expect(JSON.parse(localStorage.getItem('arch-tools:konfig:projektordner')!).struktur.name).toBe('Fremd');
    // neu laden: die fremde Fassung gilt, die eigene bleibt über „Rückgängig“ erreichbar
    await act(() => knopf(host, 'Neu laden').click());
    expect(useOrdner.getState().struktur.name).toBe('Fremd');
    expect(host.querySelector('.po-konflikt')).toBeNull();
    act(() => knopf(host, 'Rückgängig').click());
    expect(useOrdner.getState().struktur.name).toBe('Meine');
    await act(() => useOrdner.getState().speichernJetzt());
    expect(JSON.parse(localStorage.getItem('arch-tools:konfig:projektordner')!).struktur.name).toBe('Meine');
    // noch einmal fremd geändert: eigene Fassung trotzdem speichern
    fremd('Wieder fremd');
    eingabe(feld(host, 'Name der Struktur'), 'Meine 2');
    await act(() => useOrdner.getState().speichernJetzt());
    expect(host.querySelector('.po-konflikt')).not.toBeNull();
    await act(async () => knopf(host, 'Meine Fassung trotzdem speichern').click());
    await warten();
    expect(JSON.parse(localStorage.getItem('arch-tools:konfig:projektordner')!).struktur.name).toBe('Meine 2');
    // beim Wechsel in die Einstellungen wird frisch gelesen
    fremd('Vom Server');
    act(() => knopf(host, 'Vorlagen').click());
    await warten();
    expect(useOrdner.getState().struktur.name).toBe('Vom Server');
  });

  it('Vorlagen: Preset anlegen, Vorlagen aus dem Vorlagenordner zuordnen, im neuen Projekt wählen', async () => {
    const dateien: Record<string, string> = {
      'Word/Briefbogen.txt': 'Bauherr: {{bauherr.name}}',
      'Excel/Kosten/Kostenschätzung.csv': 'x',
      'Excel/Kosten/Massen.csv': 'y',
      'LIESMICH.txt': 'Anleitung',
      ...Object.fromEntries(['A', 'B', 'C', 'D', 'E'].map((x) => [`Bauantrag/${x}.txt`, x])),
    };
    useOrdner.setState({ vorlagenName: 'Büro-Vorlagen', vorlagen: Object.entries(dateien).map(([pfad, inhalt]) => ({ pfad, lies: async () => strToU8(inhalt) })) });
    const host = render();
    act(() => knopf(host, 'Vorlagen').click());
    expect(host.textContent).toContain('Büro-Vorlagen');
    // LIESMICH.txt zählt nicht mit (P-05)
    expect(host.textContent).toContain('Vorlagenordner – 8 Dateien');
    // „Alle Vorlagen“ nach den Regeln des Prüfmodus: der Vorlagenordner ist nach Dateiart gegliedert
    expect(host.textContent).toContain('Der Vorlagenordner ist anders gegliedert als die Struktur');
    const abweichung = host.querySelector('.po-abweichung')!;
    expect(abweichung.querySelector('summary')!.textContent).toBe('3 Ordner liegen außerhalb der Struktur');
    expect([...abweichung.querySelectorAll('li')].map((l) => l.textContent)).toEqual(['Bauantrag', 'Excel', 'Word']);
    // Vorschau aufklappbar
    const mehr = knopf(host, '… und 4 weitere');
    act(() => mehr.click());
    expect(host.querySelectorAll('.po-zuordnungen > li')[0].querySelector('.po-z-vorschau')!.textContent).toContain('→ Word/2026-014 Briefbogen.txt');
    expect(knopf(host, 'weniger zeigen')).toBeTruthy();
    expect(host.textContent).toContain('{{projekt.nummer}}'); // Platzhalter-Hilfe
    // Dateinamenschema mit Beispiel
    expect(host.textContent).toContain('Kostenschätzung.xlsx → 2026-014 Kostenschätzung.xlsx');

    act(() => knopf(host, '+ Preset').click());
    expect(useOrdner.getState().struktur.presets.map((p) => p.name)).toEqual(['Alle Vorlagen', 'Neues Preset']);
    eingabe(feld(host, 'Name'), 'Jedes Projekt');
    expect(useOrdner.getState().struktur.presets[1].name).toBe('Jedes Projekt');

    // Datei und Ordner aus dem Vorlagenordner hinzufügen
    const plus = (name: string) => [...host.querySelectorAll('.po-quellen tr')].find((z) => z.querySelector('td')?.getAttribute('title') === name)!.querySelector('button') as HTMLButtonElement;
    act(() => plus('Word/Briefbogen.txt').click());
    act(() => plus('Excel/Kosten').click());
    expect(useOrdner.getState().struktur.presets[1].eintraege).toEqual([
      { quelle: 'Word/Briefbogen.txt', ziel: '' },
      { quelle: 'Excel/Kosten', ziel: '' },
    ]);
    expect(host.textContent).toContain('Die Datei landet im Stamm des Projektordners');
    const zuordnung = (i: number) => host.querySelectorAll('.po-zuordnungen > li')[i];
    const zielFeld = (i: number, label: string) => [...zuordnung(i).querySelectorAll('label.field')].find((l) => l.querySelector('.field-label')?.textContent?.startsWith(label))!.querySelector('input') as HTMLInputElement;
    eingabe(zielFeld(0, 'Zielordner'), '04 Schriftverkehr/Bauherr');
    eingabe(zielFeld(0, 'Dateiname'), '{nummer} Brief an {kurzname}');
    eingabe(zielFeld(1, 'Zielordner'), '03 Berechnungen/Kosten');
    // Vorschau mit Beispielwerten
    expect(zuordnung(0).querySelector('.po-z-vorschau')?.textContent).toContain('→ 04 Schriftverkehr/Bauherr/2026-014 Brief an EFH Musterweg.txt');
    expect(zuordnung(1).querySelector('.po-z-vorschau')?.textContent).toContain('→ 03 Berechnungen/Kosten/2026-014 Massen.csv');
    // Zuordnung an Leistungsphasen binden
    eingabe(zuordnung(1).querySelector('.po-z-lph input') as HTMLInputElement, '6-7');
    expect(useOrdner.getState().struktur.presets[1].eintraege[1].lph).toEqual([6, 7]);

    // im Assistenten wählen: „Alle Vorlagen“ ist Standard, aber wegen des anders gegliederten Vorlagenordners nicht vorausgewählt
    act(() => knopf(host, 'Assistent').click());
    act(() => knopf(host, 'Neues Projekt').click());
    eingabe(feld(host, 'Projektnummer'), '2026-014');
    eingabe(feld(host, 'Kurzname'), 'Haus');
    act(() => knopf(host, '7Vorlagen').click());
    const wahl = (name: string) => [...host.querySelectorAll('.po-presetwahl label')].find((l) => l.textContent?.startsWith(name))!.querySelector('input') as HTMLInputElement;
    expect(wahl('Alle Vorlagen').checked).toBe(false);
    expect(host.querySelector('.po-nicht-automatisch')?.textContent).toContain('„Alle Vorlagen“ ist nicht vorausgewählt');
    act(() => wahl('Jedes Projekt').click());
    expect(useOrdner.getState().stamm.presets).toEqual(['Jedes Projekt']);
    weiter(host);
    expect(zeilen(host)).toContain('04 Schriftverkehr/Bauherr/2026-014 Brief an Haus.txt');
    expect(zeilen(host)).toContain('03 Berechnungen/Kosten/2026-014 Kostenschätzung.csv');
    expect(zeilen(host)).not.toContain('Word/Briefbogen.txt');

    // einzelne Einträge abwählen
    const zeile = [...host.querySelectorAll('.po-plan tr')].find((z) => z.querySelector('td')!.getAttribute('title') === '03 Berechnungen/Kosten/2026-014 Massen.csv')!;
    act(() => (zeile.querySelector('input.po-wahl') as HTMLInputElement).click());
    expect(zeile.className).toContain('abgewaehlt');

    // Preset löschen: erst nach Bestätigung
    act(() => knopf(host, 'Vorlagen').click());
    act(() => [...host.querySelectorAll('.po-presets li')][1].dispatchEvent(new MouseEvent('click', { bubbles: true })));
    act(() => knopf(host, 'Löschen').click());
    expect(useOrdner.getState().struktur.presets).toHaveLength(2);
    act(() => knopf(host, '„Jedes Projekt“ wirklich löschen').click());
    expect(useOrdner.getState().struktur.presets.map((p) => p.name)).toEqual(['Alle Vorlagen']);
  });

  it('Assistent: bestehendes Projekt ergänzen – Stammdaten aus der Projektdatei, nur was sich ändert', async () => {
    const vorlagen = [{ pfad: '00 Projekt/Notiz.txt', lies: async () => strToU8('{{projekt.nummer}}') }];
    const fs = new SpeicherDateisystem();
    const stamm = { ...leereStammdaten(), nummer: '2025-007', kurzname: 'Kita', leistungsphasen: [1, 2, 3] };
    await ausfuehren(fs, '/p', planen(stamm, STANDARD, [], [], new Date(2025, 4, 1)));
    const basis = '/p/2025-007 Kita';
    useOrdner.setState({ vorlagen, vorlagenName: 'Vorlagen' });
    const ordner = { pfad: '', name: '2025-007 Kita', eintraege: await fs.liste(basis, 12), lies: (p: string) => fs.lies(basis, p) };
    const host = render(createElement(AssistentView, { start: ordner }));
    await warten();
    expect(host.querySelector('.po-kontext')?.textContent).toContain('Projektdatei 03 Berechnungen/Flächen/2025-007 Kita.oap');
    expect(feld(host, 'Projektnummer').value).toBe('2025-007');
    expect(feld(host, 'Kurzname').value).toBe('Kita');
    // beim Ergänzen wird der Ordner nicht umbenannt (PB-05)
    expect(host.textContent).not.toContain('wird Teil des Ordnernamens');
    expect(host.textContent).toContain('Der Ordner wird nicht umbenannt.');
    // das Formular für neue Projekte bleibt unberührt
    eingabe(feld(host, 'Bezeichnung des Vorhabens'), 'Neubau Kita am Park');
    expect(useOrdner.getState().stamm.nummer).toBe('');

    act(() => knopf(host, '5Umfang').click());
    const lph = [...host.querySelectorAll('.sd-lph input')] as HTMLInputElement[];
    expect(lph.map((x) => x.checked)).toEqual([true, true, true, false, false, false, false, false, false]);
    act(() => lph[3].click());
    weiter(host);
    weiter(host);
    weiter(host);
    expect(knopf(host, '8Ergänzen')).toBeTruthy();
    expect(host.querySelector('.po-steckbrief')?.textContent).toContain('Neubau Kita am Park');
    // nur zeigen, was sich ändert: Vorlage, Genehmigungsordner, Projektdatei wird ergänzt
    expect(zeilen(host)).toContain('00 Projekt/2025-007 Notiz.txt');
    expect(zeilen(host)).toContain('06 Genehmigung');
    expect(zeilen(host)).not.toContain('01 Grundlagen');
    const oap = [...host.querySelectorAll('.po-plan tr')].find((z) => z.querySelector('td')!.getAttribute('title') === '03 Berechnungen/Flächen/2025-007 Kita.oap')!;
    expect(oap.querySelector('.po-status')?.textContent).toBe('wird ergänzt');
    expect(oap.querySelector('.po-status')?.getAttribute('title')).toBe('wird ergänzt: Bezeichnung, Leistungsphasen');
    expect(knopf(host, 'Neues als ZIP herunterladen').disabled).toBe(false);
    expect(host.textContent).toContain('lässt sich nur in der Desktop-App ergänzen');
  });

  it('Assistent: Projektordner ohne Projektdatei – Stammdaten erfassen, Nummer und Kurzname aus dem Ordnernamen', async () => {
    const fs = new SpeicherDateisystem();
    await fs.ordnerAnlegen('/p', '2019-003 Altbau/Pläne');
    const ordner = { pfad: '', name: '2019-003 Altbau', eintraege: await fs.liste('/p/2019-003 Altbau', 12), lies: (p: string) => fs.lies('/p/2019-003 Altbau', p) };
    const host = render(createElement(AssistentView, { start: ordner }));
    await warten();
    expect(host.textContent).toContain('In diesem Ordner liegt noch keine Projektdatei (.oap)');
    expect(feld(host, 'Projektnummer').value).toBe('2019-003');
    expect(feld(host, 'Kurzname').value).toBe('Altbau');
    act(() => knopf(host, '8Ergänzen').click());
    expect(zeilen(host)).toContain('03 Berechnungen/Flächen/2019-003 Altbau.oap');
    const oap = [...host.querySelectorAll('.po-plan tr')].find((z) => z.querySelector('td')!.getAttribute('title') === '03 Berechnungen/Flächen/2019-003 Altbau.oap')!;
    expect(oap.querySelector('.po-status')?.textContent).toBe('neu');
    // ohne Leistungsphasen: deutlicher Hinweis mit Sprung zum Umfang (P-07)
    expect(host.textContent).toContain('Keine Leistungsphasen gewählt – alle Ordner werden vorgeschlagen');
    act(() => knopf(host, 'Alle neuen Einträge abwählen').click());
    expect([...host.querySelectorAll('.po-plan tr.abgewaehlt')].length).toBeGreaterThan(5);
    expect(knopf(host, 'Neues als ZIP herunterladen').disabled).toBe(true);
    act(() => knopf(host, 'Alle wieder wählen').click());
    expect(host.querySelector('.po-plan tr.abgewaehlt')).toBeNull();
    act(() => knopf(host, 'Leistungsphasen wählen').click());
    expect(host.querySelector('h2')?.textContent).toBe('Umfang');
  });

  it('Ergänzen mit beschädigter alter projekt.json: Hinweis statt nur „Bitte die Stammdaten erfassen“', async () => {
    const fs = new SpeicherDateisystem();
    await fs.ordnerAnlegen('/p', '2019-003 Altbau/Pläne');
    await fs.dateiAnlegen('/p/2019-003 Altbau', 'projekt.json', new TextEncoder().encode('{kaputt'));
    const ordner = { pfad: '', name: '2019-003 Altbau', eintraege: await fs.liste('/p/2019-003 Altbau', 12), lies: (p: string) => fs.lies('/p/2019-003 Altbau', p) };
    const host = render(createElement(AssistentView, { start: ordner }));
    await warten();
    expect(host.textContent).toContain('Die alte projekt.json im Ordner ist nicht lesbar');
  });

  it('Einstellungen älterer Fassungen werden beim ersten Start in den Konfigurationsordner übernommen', async () => {
    localStorage.setItem('projektordner:zustand', JSON.stringify({ stamm: { nummer: 'X' }, stammordner: 'P:\\Projekte', vorlagenordner: 'P:\\Vorlagen', struktur: { name: 'Büro', ordner: ['A'], flaechenprojekt: 'A/{nummer}.oap' } }));
    vi.resetModules();
    const { useOrdner: frisch } = await import('./store');
    expect(frisch.getState()).toMatchObject({ stammordner: 'P:\\Projekte', vorlagenordner: 'P:\\Vorlagen', stamm: { nummer: 'X' } });
    await frisch.getState().konfigLaden();
    expect(JSON.parse(localStorage.getItem('arch-tools:konfig:allgemein')!)).toMatchObject({ projekte: ['P:\\Projekte'], oapPfad: 'A/{nummer}.oap' });
    expect(JSON.parse(localStorage.getItem('arch-tools:konfig:projektordner')!)).toMatchObject({ vorlagenordner: 'P:\\Vorlagen', struktur: { name: 'Büro' } });
    expect(frisch.getState()).toMatchObject({ allgemein: { oapPfad: 'A/{nummer}.oap', projekte: ['P:\\Projekte'] }, struktur: { name: 'Büro' } });
    // ein zweiter Start nimmt die gemeinsamen Einstellungen, nicht mehr die lokalen
    localStorage.setItem('arch-tools:konfig:allgemein', JSON.stringify({ projekte: ['S:\\Server'], oapPfad: 'B.oap' }));
    await frisch.getState().konfigLaden();
    expect(frisch.getState()).toMatchObject({ stammordner: 'S:\\Server', allgemein: { oapPfad: 'B.oap' } });
  });

  it('Nach dem Anlegen: Abschlussseite mit Ordnername, Entwurf geleert, „Rückgängig“ stellt ihn wieder her (P-11)', async () => {
    const url = URL as unknown as { createObjectURL: (b: Blob) => string; revokeObjectURL: (u: string) => void };
    url.createObjectURL = () => 'blob:test';
    url.revokeObjectURL = () => {};
    useOrdner.setState({ stamm: { ...leereStammdaten(), nummer: '2026-020', kurzname: 'Haus am See', bearbeiter: 'TP' } });
    const host = render();
    act(() => knopf(host, 'Weiter mit 2026-020').click());
    act(() => knopf(host, '8Anlegen').click());
    await act(async () => knopf(host, 'Als ZIP herunterladen').click());
    await warten();
    // Entwurf geleert (Bearbeitung bleibt), Abschlussseite nennt den Ordner, kein ZIP-Knopf mehr als Hauptaktion
    expect(useOrdner.getState().stamm).toMatchObject({ nummer: '', kurzname: '', bearbeiter: 'TP' });
    expect(host.querySelector('.po-abschluss h2')?.textContent).toBe('Projekt als ZIP heruntergeladen');
    expect(host.querySelector('.po-abschluss-name')?.textContent).toContain('2026-020 Haus am See');
    expect(knopf(host, 'Als ZIP herunterladen')).toBeUndefined();
    expect(knopf(host, 'Nächstes Projekt').className).toContain('primary');
    // Rückgängig: der Entwurf ist wieder da
    act(() => knopf(host, 'Rückgängig').click());
    expect(useOrdner.getState().stamm).toMatchObject({ nummer: '2026-020', kurzname: 'Haus am See' });
    act(() => knopf(host, 'Nächstes Projekt').click());
    expect(host.textContent).toContain('Neues Projekt anlegen');
  });

  it('Ordner prüfen: Projektliste der Stammordner – Klick prüft; alle Projekte mit Übersicht; Befunde nach Schwere (P-10)', async () => {
    const fs = new SpeicherDateisystem();
    await ausfuehren(fs, 'P:/Projekte', planen({ ...leereStammdaten(), nummer: '2026-014', kurzname: 'EFH', leistungsphasen: [1, 2] }, STANDARD, [], [], new Date(2026, 9, 1)));
    await fs.ordnerAnlegen('P:/Projekte', '2019-003 Altbau/Sonstiges');
    useOrdner.setState({ allgemein: { ...VORGABE_ALLGEMEIN, projekte: ['P:/Projekte'] } });
    const host = render(createElement(PruefView, { fs, onErgaenzen: () => {} }));
    await warten();
    await warten();
    const projekt = (name: string) => [...host.querySelectorAll<HTMLButtonElement>('.po-projektliste button')].find((b) => b.textContent === name)!;
    await act(async () => projekt('2019-003 Altbau').click());
    await warten();
    expect(host.querySelector('h3')?.textContent).toContain('2019-003 Altbau');
    // gruppiert nach Schwere: Abweichungen vor Hinweisen
    const gruppen = [...host.querySelectorAll('.po-befundgruppe h4')].map((h) => h.textContent);
    expect(gruppen[0]).toMatch(/^Abweichungen/);
    expect(gruppen.indexOf(gruppen.find((x) => x?.startsWith('Hinweise'))!)).toBeGreaterThan(0);
    act(() => knopf(host, 'Zur Projektliste').click());
    await act(async () => knopf(host, 'Alle Projekte prüfen').click());
    await warten();
    const zeilen = [...host.querySelectorAll('.po-sammel tbody tr')].map((z) => [...z.querySelectorAll('td')].map((t) => t.textContent));
    expect(zeilen).toHaveLength(2);
    expect(zeilen.find((z) => z[0] === '2026-014 EFH')![2]).toBe('ja');
    expect(zeilen.find((z) => z[0] === '2019-003 Altbau')![2]).toBe('nein');
  });

  it('Ordner prüfen: Einstieg erklärt, dass nichts verändert wird', () => {
    const host = render();
    act(() => knopf(host, 'Ordner prüfen').click());
    expect(host.textContent).toContain('es verschiebt, benennt und löscht nichts');
    expect(knopf(host, 'Projektordner wählen')).toBeTruthy();
  });
});

describe('Auftrag aus einer anderen App (Rahmen-App)', () => {
  const echterParent = window.parent;
  afterEach(() => {
    Object.defineProperty(window, 'parent', { value: echterParent, configurable: true });
    (window as unknown as { happyDOM: { setURL: (u: string) => void } }).happyDOM.setURL('http://localhost:3000/');
  });

  it('„Neues Projekt anlegen“ in QUADRIO: Assistent beginnt mit den Stammdaten, „Zurück zu QUADRIO“', async () => {
    const gesendet: unknown[] = [];
    const rahmen = { postMessage: (d: unknown) => gesendet.push(d) } as unknown as Window;
    Object.defineProperty(window, 'parent', { value: rahmen, configurable: true });
    // frühere Tests (Herunterladen) lassen die Seite auf about:blank zurück
    (window as unknown as { happyDOM: { setURL: (u: string) => void } }).happyDOM.setURL('http://localhost:3000/?rahmen=tab&app=ordner');
    const host = render();
    expect(gesendet).toContainEqual({ typ: 'arch-tools:bereit', app: 'ordner' });
    act(() => knopf(host, 'Struktur').click());
    act(() =>
      window.dispatchEvent(
        new MessageEvent('message', { data: { typ: 'arch-tools:assistent-neu', von: 'flaechenrechner', vonName: 'QUADRIO', kannOeffnen: true, an: 'ordner' }, origin: window.location.origin, source: rahmen }),
      ),
    );
    expect(knopf(host, 'Assistent').className).toContain('active');
    expect(host.querySelector('h2')?.textContent).toBe('Stammdaten');
    expect(host.querySelector('.po-kontext')?.textContent).toContain('aus QUADRIO');
    act(() => knopf(host, 'Zurück zu QUADRIO').click());
    expect(gesendet).toContainEqual({ typ: 'arch-tools:zur-app', an: 'flaechenrechner', app: 'ordner' });
  });
});

describe('Startseite mit der gemeinsamen Projektübersicht', () => {
  it('Projektordner der Stammordner mit Stammdaten aus der Projektdatei, zuletzt geöffnet, Öffnen und Neues Projekt', async () => {
    // dynamisch geladen: derselbe Modulstand wie die Komponente (ein Test oben setzt die Module zurück)
    const { ProjektStart } = await import('./components/ProjektStart');
    // das gemeinsame Kontextmenü (in der App steckt es in der Titelleiste) – nach resetModules aus derselben Modulinstanz
    const { MenueHost } = await import('@core/ui/Menue');
    const { useOrdner: store } = await import('./store');
    const { zuletztMerken } = await import('@core/platform/konfig');
    const fs = new SpeicherDateisystem();
    // ein Projekt mit Projektdatei, eines ohne
    await ausfuehren(fs, 'P:/Projekte', planen({ ...leereStammdaten(), nummer: '2026-014', kurzname: 'EFH Musterweg', bezeichnung: 'Neubau EFH', leistungsphasen: [1, 2] }, STANDARD, [], [], new Date(2026, 9, 1)));
    await fs.ordnerAnlegen('P:/Projekte', '2019-003 Altbau/Pläne');
    await zuletztMerken('P:/Projekte/2019-003 Altbau', 'PERMIO', 1000);
    store.setState({ allgemein: { ...VORGABE_ALLGEMEIN, projekte: ['P:/Projekte'] }, struktur: STANDARD });
    const geoeffnet: string[] = [];
    let neu = 0;
    const host = render(
      createElement(
        Fragment,
        null,
        createElement(ProjektStart, { fs, entwurf: '', onNeu: () => neu++, onLeerNeu: () => {}, onOeffnen: (p: string) => geoeffnet.push(p), onAndererOrdner: () => {} }),
        createElement(MenueHost),
      ),
    );
    await warten();
    await warten();
    expect(host.textContent).toContain('Projekte');
    // zuletzt geöffnet (auch aus einer anderen App) steht vorne, mit Marke ohne Projektdatei
    expect(host.textContent).toContain('2019-003');
    expect(host.textContent).toContain('ohne Projektdatei');
    // genau ein Stammordner: Gruppe aufgeklappt (P-09), Titel aus der Projektdatei
    expect(host.textContent).toContain('Neubau EFH');
    expect(host.textContent).toContain('LPh 1, 2');
    act(() => knopf(host, 'Neues Projekt').click());
    expect(neu).toBe(1);
    // Kontextmenü (P-09): ergänzen, prüfen, Katasterpläne, Explorer, abschließen (P-15), anheften
    const karteVon = (text: string) => [...host.querySelectorAll('.pa-karte')].find((k) => k.textContent?.includes(text)) as HTMLElement;
    act(() => karteVon('Neubau EFH').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 5, clientY: 5 })));
    expect([...host.querySelectorAll('.menue [role="menuitem"]')].map((b) => b.textContent)).toEqual(['Ergänzen …', 'Katasterpläne …', 'Im Explorer öffnen', 'Projekt abschließen', 'Als Akquise kennzeichnen', 'Anheften']);
    await act(async () => ([...host.querySelectorAll('.menue [role="menuitem"]')].find((b) => b.textContent === 'Projekt abschließen') as HTMLButtonElement).click());
    await warten();
    await warten();
    const { readProjectFile: lesen } = await import('@core/archive');
    expect(lesen(fs.eintraege.get('P:/Projekte/2026-014 EFH Musterweg/03 Berechnungen/Flächen/2026-014 EFH Musterweg.oap')!).meta.status).toBe('abgeschlossen');
    // abgeschlossen: in der Standardansicht ausgeblendet, über den Filter sichtbar
    const gruppe = host.querySelector('.pa-gruppe')!;
    expect(gruppe.textContent).not.toContain('Neubau EFH');
    expect(gruppe.textContent).toContain('1 abgeschlossenes Projekt ausgeblendet');
    act(() => knopf(gruppe, '1 abgeschlossenes Projekt ausgeblendet').click());
    expect(host.querySelector('.pa-gruppe')!.textContent).toContain('Neubau EFH');
    const karte = [...host.querySelectorAll('.pa-gruppe .pa-karte')].find((k) => k.textContent?.includes('Neubau EFH')) as HTMLElement;
    act(() => karte.click());
    expect(geoeffnet).toEqual(['P:/Projekte/2026-014 EFH Musterweg']);
  });
});
