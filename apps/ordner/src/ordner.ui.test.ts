// @vitest-environment happy-dom
import type { ReactElement } from 'react';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8 } from 'fflate';
import { VORGABE_ALLGEMEIN } from '@core/platform/konfig';
import { App } from './App';
import { AssistentView } from './components/AssistentView';
import { SpeicherDateisystem } from './dateisystem';
import { ausfuehren, planen } from './plan';
import { leereStammdaten } from './stammdaten';
import { useOrdner } from './store';
import { STANDARD } from './struktur';
import { farbschemaWechseln } from '@core/ui/rauchtest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
  useOrdner.setState({ stamm: leereStammdaten(), struktur: STANDARD, stammordner: '', vorlagenordner: '', vorlagen: [], vorlagenName: '', allgemein: VORGABE_ALLGEMEIN, konfigLaden: async () => {} });
});
afterEach(() => {
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
const feld = (host: Element, label: string) => [...host.querySelectorAll('label.field')].find((l) => l.querySelector('.field-label')?.textContent === label)!.querySelector('input') as HTMLInputElement;
const zeilen = (host: Element) => [...host.querySelectorAll('.po-plan tr')].map((z) => z.querySelector('td')!.getAttribute('title'));
const warten = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
const weiter = (host: Element) => act(() => knopf(host, 'Weiter:').click());

describe('Projektordner', () => {
  it('Farbschema wechselt sofort (Menü ◐), ohne Option „Zeichenfläche abdunkeln“', () => {
    const host = render();
    expect(farbschemaWechseln(host, 'Dunkel')).toBe('dunkel');
    expect(farbschemaWechseln(host, 'Hell')).toBe('hell');
  });

  it('Assistent: neues Projekt Schritt für Schritt – Stammdaten, Umfang, Vorlagen, Anlegen', () => {
    const host = render();
    expect(host.textContent).toContain('Neues Projekt anlegen');
    expect(host.textContent).toContain('Bestehendes Projekt ergänzen');
    act(() => knopf(host, 'Neues Projekt').click());

    // Stammdaten: ohne Nummer und Kurzname geht es nicht weiter
    expect(host.textContent).toContain('Die Projektnummer fehlt.');
    expect(knopf(host, 'Weiter:').disabled).toBe(true);
    eingabe(feld(host, 'Projektnummer'), '2026-014');
    eingabe(feld(host, 'Kurzname'), 'EFH Musterweg');
    eingabe(feld(host, 'Name bzw. Firma'), 'Familie Beispiel');
    expect(useOrdner.getState().stamm).toMatchObject({ nummer: '2026-014', kurzname: 'EFH Musterweg', bauherr: { name: 'Familie Beispiel' } });
    expect(host.querySelector('.po-kontext')?.textContent).toContain('2026-014 EFH Musterweg');
    expect(knopf(host, 'Weiter:').disabled).toBe(false);

    // Umfang: nur LPh 1–3
    weiter(host);
    for (const nr of [1, 2, 3]) act(() => ([...host.querySelectorAll('.sd-lph input')][nr - 1] as HTMLInputElement).click());
    expect(useOrdner.getState().stamm.leistungsphasen).toEqual([1, 2, 3]);
    eingabe(feld(host, 'Bearbeitung'), 'TP');
    act(() => knopf(host, '+ Beteiligter').click());
    eingabe(host.querySelector('.sd-beteiligte input') as HTMLInputElement, 'Tragwerk');
    expect(useOrdner.getState().stamm.beteiligte).toEqual([{ rolle: 'Tragwerk', name: '', kontakt: '' }]);

    // Vorlagen: Standard-Preset vorausgewählt
    weiter(host);
    expect((host.querySelector('.po-presetwahl input') as HTMLInputElement).checked).toBe(true);

    // Anlegen: Projektdatei statt projekt.json, Ordner nach Leistungsphasen
    weiter(host);
    expect(zeilen(host)).toContain('03 Berechnungen/Flächen/2026-014 EFH Musterweg.oap');
    expect(zeilen(host)).not.toContain('projekt.json');
    expect(zeilen(host)).not.toContain('02 Pläne/Ausführung');
    expect(zeilen(host)).not.toContain('08 Bauleitung');
    expect(host.textContent).toContain('gehören zu nicht beauftragten Leistungsphasen');
    expect(knopf(host, 'Als ZIP herunterladen').disabled).toBe(false);

    // zurück zu den Stammdaten über die Schrittleiste, Formular leeren
    act(() => knopf(host, '2Stammdaten').click());
    act(() => knopf(host, 'Formular leeren').click());
    expect(useOrdner.getState().stamm).toMatchObject({ nummer: '', beteiligte: [], bearbeiter: 'TP' });
    // ohne Stammdaten sind die späteren Schritte gesperrt
    expect(knopf(host, '5Anlegen').disabled).toBe(true);
  });

  it('Einstellungen: gemeinsame Einstellungen, Schemata und Ordnerliste, Standard wiederherstellen', async () => {
    const host = render();
    act(() => knopf(host, 'Einstellungen').click());
    expect(host.textContent).toContain('Gemeinsame Einstellungen');
    eingabe(feld(host, 'Projektdatei (.oap) in neuen Projekten'), 'Planung/Berechnungen/{nummer}');
    expect(useOrdner.getState().allgemein.oapPfad).toBe('Planung/Berechnungen/{nummer}');
    expect(host.textContent).toContain('Beispiel: Planung/Berechnungen/');
    eingabe(feld(host, 'Fotoordner im Projekt'), '10 Fotos');
    expect(useOrdner.getState().allgemein.fotoordner).toBe('10 Fotos');
    eingabe(feld(host, 'Name des Projektordners'), '{nummer}_{kurzname}');
    expect(useOrdner.getState().struktur.ordnername).toBe('{nummer}_{kurzname}');
    const text = host.querySelector('textarea') as HTMLTextAreaElement;
    expect(text.value.split('\n')).toHaveLength(STANDARD.ordner.length);
    eingabe(text, 'A\nB/C | LPh 5-6 | Dateischema');
    expect(useOrdner.getState().struktur.ordner).toEqual([{ pfad: 'A' }, { pfad: 'B/C', lph: [5, 6], dateischema: true }]);
    // leere Liste wird nicht übernommen
    eingabe(text, '# nichts');
    expect(useOrdner.getState().struktur.ordner).toHaveLength(2);
    expect(host.textContent).toContain('Die Liste enthält keinen Ordner');
    act(() => knopf(host, 'Standard').click());
    expect(useOrdner.getState().struktur).toEqual(STANDARD);
    // gespeichert im Konfigurationsordner (im Browser: lokaler Speicher)
    await warten();
    expect(JSON.parse(localStorage.getItem('arch-tools:konfig:allgemein')!)).toMatchObject({ oapPfad: 'Planung/Berechnungen/{nummer}', fotoordner: '10 Fotos' });
    expect(JSON.parse(localStorage.getItem('arch-tools:konfig:projektordner')!).struktur.ordnername).toBe(STANDARD.ordnername);
  });

  it('Vorlagen: Preset anlegen, Vorlagen aus dem Vorlagenordner zuordnen, im neuen Projekt wählen', async () => {
    const dateien: Record<string, string> = { 'Word/Briefbogen.txt': 'Bauherr: {{bauherr.name}}', 'Excel/Kosten/Kostenschätzung.csv': 'x', 'Excel/Kosten/Massen.csv': 'y' };
    useOrdner.setState({ vorlagenName: 'Büro-Vorlagen', vorlagen: Object.entries(dateien).map(([pfad, inhalt]) => ({ pfad, lies: async () => strToU8(inhalt) })) });
    const host = render();
    act(() => knopf(host, 'Vorlagen').click());
    expect(host.textContent).toContain('Büro-Vorlagen');
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

    // im Assistenten wählen: nur „Alle Vorlagen“ ist Standard
    act(() => knopf(host, 'Projekt').click());
    act(() => knopf(host, 'Neues Projekt').click());
    eingabe(feld(host, 'Projektnummer'), '2026-014');
    eingabe(feld(host, 'Kurzname'), 'Haus');
    weiter(host);
    weiter(host);
    const wahl = (name: string) => [...host.querySelectorAll('.po-presetwahl label')].find((l) => l.textContent?.startsWith(name))!.querySelector('input') as HTMLInputElement;
    act(() => wahl('Alle Vorlagen').click());
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
    // das Formular für neue Projekte bleibt unberührt
    eingabe(feld(host, 'Bezeichnung des Vorhabens'), 'Neubau Kita am Park');
    expect(useOrdner.getState().stamm.nummer).toBe('');

    weiter(host);
    const lph = [...host.querySelectorAll('.sd-lph input')] as HTMLInputElement[];
    expect(lph.map((x) => x.checked)).toEqual([true, true, true, false, false, false, false, false, false]);
    act(() => lph[3].click());
    weiter(host);
    weiter(host);
    expect(knopf(host, '5Ergänzen')).toBeTruthy();
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
    weiter(host);
    weiter(host);
    weiter(host);
    expect(zeilen(host)).toContain('03 Berechnungen/Flächen/2019-003 Altbau.oap');
    const oap = [...host.querySelectorAll('.po-plan tr')].find((z) => z.querySelector('td')!.getAttribute('title') === '03 Berechnungen/Flächen/2019-003 Altbau.oap')!;
    expect(oap.querySelector('.po-status')?.textContent).toBe('neu');
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

  it('Ordner prüfen: Einstieg erklärt, dass nichts verändert wird', () => {
    const host = render();
    act(() => knopf(host, 'Ordner prüfen').click());
    expect(host.textContent).toContain('es verschiebt, benennt und löscht nichts');
    expect(knopf(host, 'Projektordner wählen')).toBeTruthy();
  });
});

describe('Startseite mit der gemeinsamen Projektübersicht', () => {
  it('Projektordner der Stammordner mit Stammdaten aus der Projektdatei, zuletzt geöffnet, Öffnen und Neues Projekt', async () => {
    // dynamisch geladen: derselbe Modulstand wie die Komponente (ein Test oben setzt die Module zurück)
    const { ProjektStart } = await import('./components/ProjektStart');
    const { useOrdner: store } = await import('./store');
    const { zuletztMerken } = await import('@core/platform/konfig');
    const fs = new SpeicherDateisystem();
    // ein Projekt mit Projektdatei, eines ohne
    await ausfuehren(fs, 'P:/Projekte', planen({ ...leereStammdaten(), nummer: '2026-014', kurzname: 'EFH Musterweg', bezeichnung: 'Neubau EFH', leistungsphasen: [1, 2] }, STANDARD, [], [], new Date(2026, 9, 1)));
    await fs.ordnerAnlegen('P:/Projekte', '2019-003 Altbau/Pläne');
    await zuletztMerken('P:/Projekte/2019-003 Altbau', 'Formulare', 1000);
    store.setState({ allgemein: { ...VORGABE_ALLGEMEIN, projekte: ['P:/Projekte'] }, struktur: STANDARD });
    const geoeffnet: string[] = [];
    let neu = 0;
    const host = render(createElement(ProjektStart, { fs, entwurf: '', onNeu: () => neu++, onLeerNeu: () => {}, onOeffnen: (p: string) => geoeffnet.push(p), onAndererOrdner: () => {} }));
    await warten();
    await warten();
    expect(host.textContent).toContain('Projekte');
    // zuletzt geöffnet (auch aus einer anderen App) steht vorne, mit Marke ohne Projektdatei
    expect(host.textContent).toContain('2019-003');
    expect(host.textContent).toContain('ohne Projektdatei');
    // Gruppe aufklappen: Titel aus der Projektdatei
    act(() => knopf(host, 'Projekte').click());
    expect(host.textContent).toContain('Neubau EFH');
    expect(host.textContent).toContain('LPh 1, 2');
    act(() => knopf(host, 'Neues Projekt').click());
    expect(neu).toBe(1);
    const karte = [...host.querySelectorAll('button, [role="button"], .pa-karte')].find((k) => k.textContent?.includes('Neubau EFH')) as HTMLElement;
    act(() => karte.click());
    expect(geoeffnet).toEqual(['P:/Projekte/2026-014 EFH Musterweg']);
  });
});
