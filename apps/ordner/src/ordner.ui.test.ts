// @vitest-environment happy-dom
import type { ReactElement } from 'react';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { strToU8 } from 'fflate';
import { App } from './App';
import { AktualisierenView } from './components/AktualisierenView';
import { SpeicherDateisystem } from './dateisystem';
import { ausfuehren, planen } from './plan';
import { leereStammdaten } from './stammdaten';
import { useOrdner } from './store';
import { STANDARD } from './struktur';

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
beforeEach(() => useOrdner.setState({ stamm: leereStammdaten(), struktur: STANDARD, stammordner: '', vorlagenordner: '', vorlagen: [], vorlagenName: '' }));
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

describe('Projektordner', () => {
  it('Neues Projekt: ohne Nummer und Kurzname gesperrt, Trockenlauf zeigt den Plan', () => {
    const host = render();
    expect(host.textContent).toContain('Die Projektnummer fehlt.');
    expect(knopf(host, 'Als ZIP herunterladen').disabled).toBe(true);

    eingabe(feld(host, 'Projektnummer'), '2026-014');
    eingabe(feld(host, 'Kurzname'), 'EFH Musterweg');
    expect(useOrdner.getState().stamm).toMatchObject({ nummer: '2026-014', kurzname: 'EFH Musterweg' });
    expect(host.querySelector('.po-col h3')?.textContent).toContain('2026-014 EFH Musterweg');
    expect(host.textContent).not.toContain('Die Projektnummer fehlt.');
    expect(knopf(host, 'Als ZIP herunterladen').disabled).toBe(false);
    const zeilen = () => [...host.querySelectorAll('.po-plan tr')].map((z) => z.querySelector('td')!.getAttribute('title'));
    expect(zeilen()).toContain('02 Pläne/Ausführung');
    expect(zeilen()).toContain('projekt.json');
    expect(zeilen()).toContain('03 Berechnungen/Flächen/2026-014 EFH Musterweg.oap');

    // nur LPh 1–3 beauftragt: Ordner der Ausführung, Genehmigung, Ausschreibung und Bauleitung entfallen
    for (const nr of [1, 2, 3]) act(() => ([...host.querySelectorAll('.po-lph input')][nr - 1] as HTMLInputElement).click());
    expect(useOrdner.getState().stamm.leistungsphasen).toEqual([1, 2, 3]);
    expect(zeilen()).not.toContain('02 Pläne/Ausführung');
    expect(zeilen()).not.toContain('08 Bauleitung');
    expect(host.textContent).toContain('gehören zu nicht beauftragten Leistungsphasen');
  });

  it('Nummernvorschlag übernehmen, Beteiligte pflegen, Formular leeren', () => {
    const host = render();
    const jahr = new Date().getFullYear();
    act(() => knopf(host, `Nummer ${jahr}-001 übernehmen`).click());
    expect(useOrdner.getState().stamm.nummer).toBe(`${jahr}-001`);
    eingabe(feld(host, 'Bearbeitung'), 'TP');
    act(() => knopf(host, '+ Beteiligter').click());
    eingabe(host.querySelector('.po-beteiligte input') as HTMLInputElement, 'Tragwerk');
    expect(useOrdner.getState().stamm.beteiligte).toEqual([{ rolle: 'Tragwerk', name: '', kontakt: '' }]);
    eingabe(feld(host, 'E-Mail'), 'a@example.org; b@example.org');
    expect(useOrdner.getState().stamm.bauherr.kontakte).toEqual([
      { art: 'email', wert: 'a@example.org' },
      { art: 'email', wert: 'b@example.org' },
    ]);
    act(() => knopf(host, 'Formular leeren').click());
    expect(useOrdner.getState().stamm).toMatchObject({ nummer: '', beteiligte: [], bearbeiter: 'TP' });
  });

  it('Struktur: Schemata und Ordnerliste ändern, Standard wiederherstellen', () => {
    const host = render();
    act(() => knopf(host, 'Struktur').click());
    expect(host.textContent).toContain('Beispiel: ');
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

    // im neuen Projekt wählen: nur „Alle Vorlagen“ ist Standard
    act(() => knopf(host, 'Neues Projekt').click());
    eingabe(feld(host, 'Projektnummer'), '2026-014');
    eingabe(feld(host, 'Kurzname'), 'Haus');
    const zeilen = () => [...host.querySelectorAll('.po-plan tr')].map((z) => z.querySelector('td')!.getAttribute('title'));
    expect(zeilen()).not.toContain('04 Schriftverkehr/Bauherr/2026-014 Brief an Haus.txt');
    const wahl = (name: string) => [...host.querySelectorAll('.po-presetwahl label')].find((l) => l.textContent?.startsWith(name))!.querySelector('input') as HTMLInputElement;
    act(() => wahl('Alle Vorlagen').click());
    act(() => wahl('Jedes Projekt').click());
    expect(useOrdner.getState().stamm.presets).toEqual(['Jedes Projekt']);
    expect(zeilen()).toContain('04 Schriftverkehr/Bauherr/2026-014 Brief an Haus.txt');
    expect(zeilen()).toContain('03 Berechnungen/Kosten/2026-014 Kostenschätzung.csv');
    expect(zeilen()).not.toContain('Word/Briefbogen.txt');

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

  it('Projekt aktualisieren: Stammdaten aus der projekt.json, nur Fehlendes im Trockenlauf', async () => {
    const vorlagen = [{ pfad: '00 Projekt/Notiz.txt', lies: async () => strToU8('{{projekt.nummer}}') }];
    const fs = new SpeicherDateisystem();
    const stamm = { ...leereStammdaten(), nummer: '2025-007', kurzname: 'Kita', leistungsphasen: [1, 2, 3] };
    await ausfuehren(fs, '/p', planen(stamm, STANDARD, [], [], new Date(2025, 4, 1)));
    const basis = '/p/2025-007 Kita';
    useOrdner.setState({ vorlagen, vorlagenName: 'Vorlagen' });
    const ordner = { pfad: '', name: '2025-007 Kita', eintraege: await fs.liste(basis, 12), lies: (p: string) => fs.lies(basis, p) };
    const host = render(createElement(AktualisierenView, { ordner, setOrdner: () => {} }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(host.textContent).toContain('2025-007 Kita');
    expect(host.textContent).toContain('Struktur „Standard“');
    // aus der projekt.json: LPh 1–3 – nur die Vorlage fehlt
    const lph = [...host.querySelectorAll('.po-lph input')] as HTMLInputElement[];
    expect(lph.map((x) => x.checked)).toEqual([true, true, true, false, false, false, false, false, false]);
    expect(host.textContent).toContain('0 Ordner und 1 Dateien fehlen');
    const zeilen = () => [...host.querySelectorAll('.po-plan tr')].map((z) => z.querySelector('td')!.getAttribute('title'));
    expect(zeilen()).toEqual(['00 Projekt', '00 Projekt/2025-007 Notiz.txt']);
    // LPh 4 dazu: der Ordner für die Genehmigung fehlt auch
    act(() => lph[3].click());
    expect(zeilen()).toContain('06 Genehmigung');
    expect(knopf(host, 'Fehlendes als ZIP herunterladen').disabled).toBe(false);
  });

  it('Projekt aktualisieren: ohne projekt.json die Stammdaten aus „Neues Projekt“ verwenden', async () => {
    const fs = new SpeicherDateisystem();
    await fs.ordnerAnlegen('/p', 'Altprojekt/Pläne');
    useOrdner.setState({ stamm: { ...leereStammdaten(), nummer: '2019-003', kurzname: 'Altbau' } });
    const ordner = { pfad: '', name: 'Altprojekt', eintraege: await fs.liste('/p/Altprojekt', 12), lies: (p: string) => fs.lies('/p/Altprojekt', p) };
    const host = render(createElement(AktualisierenView, { ordner, setOrdner: () => {} }));
    expect(host.textContent).toContain('Im Ordner liegt keine projekt.json');
    expect(host.textContent).toContain('Ohne Stammdaten gibt es keinen Plan');
    act(() => knopf(host, 'Stammdaten aus „Neues Projekt“ verwenden').click());
    const zeilen = [...host.querySelectorAll('.po-plan tr')].map((z) => z.querySelector('td')!.getAttribute('title'));
    expect(zeilen).toContain('projekt.json');
    expect(zeilen).toContain('03 Berechnungen/Flächen/2019-003 Altbau.oap');
  });

  it('Ordner prüfen: Einstieg erklärt, dass nichts verändert wird', () => {
    const host = render();
    act(() => knopf(host, 'Ordner prüfen').click());
    expect(host.textContent).toContain('es verschiebt, benennt und löscht nichts');
    expect(knopf(host, 'Projektordner wählen')).toBeTruthy();
  });
});
