// @vitest-environment happy-dom
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Zentraler Einstellungsdialog: Seiten als senkrechte Registerleiste, Entwurf mit „Übernehmen“, Prüfung, Vorgabe, Übernahme alter Werte */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
const roh = (bereich: string) => JSON.parse(localStorage.getItem(`arch-tools:konfig:${bereich}`) ?? 'null') as Record<string, unknown> | null;
const setze = (bereich: string, wert: unknown) => localStorage.setItem(`arch-tools:konfig:${bereich}`, JSON.stringify(wert));
const warten = () => act(() => new Promise((r) => setTimeout(r, 20)));
const knopf = (text: string, in_: ParentNode = document.body) => [...in_.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text);
const klick = async (b: HTMLElement | undefined | null) => {
  expect(b).toBeTruthy();
  await act(async () => b!.click());
  await warten();
};
const taste = (el: Element, key: string, mehr: KeyboardEventInit = {}) => act(async () => void el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mehr })));
const tippen = (feld: HTMLInputElement | HTMLTextAreaElement, text: string) =>
  act(async () => {
    const proto = feld instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(feld, text);
    feld.dispatchEvent(new Event('input', { bubbles: true }));
  });
const dialog = () => document.querySelector<HTMLElement>('.modal.einst');
const eintrag = (id: string) => document.getElementById(`einst-${id}`)!;
const feldVon = (id: string) => eintrag(id).querySelector<HTMLInputElement>('input.einst-feld, textarea.einst-feld')!;

async function zeigen() {
  const e = await import('./Einstellungen');
  const { RueckfrageHost } = await import('./Rueckfrage');
  const host = document.createElement('div');
  document.body.appendChild(host);
  await act(async () => {
    root = createRoot(host);
    root.render(createElement(Fragment, null, createElement(e.EinstellungenHost), createElement(RueckfrageHost)));
  });
  return e;
}

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

describe('Einstellungen', () => {
  it('Strg+, öffnet „Allgemein“; Seiten als senkrechte Registerleiste (↑/↓, Pos1/Ende, nur die gewählte in der Tab-Folge); Titel im Navigationskopf', async () => {
    await zeigen();
    expect(dialog()).toBeNull();
    await taste(document.body, ',', { ctrlKey: true });
    await warten();
    const d = dialog()!;
    expect(d.getAttribute('aria-label')).toBe('Einstellungen');
    expect(d.classList.contains('modal-tabelle')).toBe(true);
    expect(d.querySelector('nav h3')?.textContent).toBe('Einstellungen');
    const liste = d.querySelector('[role="tablist"]')!;
    expect(liste.getAttribute('aria-orientation')).toBe('vertical');
    const tabs = () => [...d.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs().map((t) => t.querySelector('.einst-nav-titel')?.textContent)).toEqual(['Allgemein', 'Pfade und Benennung']);
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1]);
    const panel = d.querySelector('[role="tabpanel"]')!;
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs()[0].id);
    expect(panel.querySelector('h3')?.textContent).toBe('Allgemein');
    // Farbschema steht nicht hier (Menü der Titelleiste), Speicherort und Büro schon
    expect(panel.textContent).not.toContain('Farbschema');
    expect(panel.textContent).toContain('Speicherort der Einstellungen');
    expect(panel.querySelectorAll('h4').length).toBe(2);
    await taste(tabs()[0], 'ArrowDown');
    await warten();
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
    expect(d.querySelector('[role="tabpanel"] h3')?.textContent).toBe('Pfade und Benennung');
    await taste(tabs()[1], 'Home');
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    await taste(tabs()[0], 'End');
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
  });

  it('Pfade und Benennung: nach Thema gegliedert, App gekennzeichnet, Platzhalter-Chips, Vorschau; Änderung gilt erst mit „Übernehmen“', async () => {
    setze('allgemein', { buero: 'Muster' });
    const e = await zeigen();
    await act(async () => e.einstellungenOeffnen('pfade', 'export.excel'));
    await warten();
    const d = dialog()!;
    expect([...d.querySelectorAll('.einst-gruppe > h4')].map((h) => h.textContent)).toEqual(['Projekt', 'Ablage', 'Pläne und Dokumente', 'Export', 'Vorlagen']);
    const ex = eintrag('export.excel');
    expect(ex.querySelector('.marke.pille')?.textContent).toBe('QUADRIO');
    expect(ex.querySelector('[role="group"][aria-label="Platzhalter: Dateiname Excel-Export"]')).not.toBeNull();
    // gemeinsame Angabe: die Vorschau je App, mit dem Inhalt der App
    expect([...ex.querySelectorAll('.einst-wirksam li')].map((li) => li.textContent)).toEqual([
      expect.stringMatching(/^QUADRIO BS9 \d{6} Flächenaufstellung\.xlsx$/),
      expect.stringMatching(/^TERRIO BS9 \d{6} GRZ-Nachweis\.xlsx$/),
      expect.stringMatching(/^NUMIO BS9 \d{6} Kostenschätzung\.xlsx$/),
    ]);
    expect(ex.querySelector('.einst-vorschau')).toBeNull();
    // Fokus aus dem Aufruf: das Feld des Eintrags
    expect(document.activeElement).toBe(feldVon('export.excel'));
    const uebernehmen = knopf('Übernehmen', d)!;
    expect(uebernehmen.type).toBe('submit');

    await tippen(feldVon('export.excel'), '{PROJEKT_KUERZEL} Flächen');
    expect(ex.classList.contains('geaendert')).toBe(true);
    expect(d.querySelector('[role="tab"][aria-selected="true"] .einst-geaendert')).not.toBeNull();
    // noch nichts gespeichert
    expect(roh('allgemein')).toEqual({ buero: 'Muster' });
    // Chip an der Schreibmarke (hier am Ende)
    await tippen(feldVon('export.excel'), '{PROJEKT_KUERZEL} Flächen ');
    await klick(ex.querySelector<HTMLButtonElement>('button[aria-label^="{DATUM} einfügen"]'));
    expect(feldVon('export.excel').value).toBe('{PROJEKT_KUERZEL} Flächen {DATUM}');
    await klick(uebernehmen);
    expect(dialog()).toBeNull();
    // gemeinsam für QUADRIO, TERRIO und NUMIO; die bisherigen Schlüssel je App für ältere Versionen mitgeschrieben
    const neu = '{PROJEKT_KUERZEL} Flächen {DATUM}';
    expect(roh('allgemein')).toEqual({ buero: 'Muster', pfade: { 'export.excel': neu, 'export.excel.flaechenrechner': neu, 'export.excel.grz': neu, 'export.excel.kosten': neu } });
  });

  it('gemeinsame Angaben: einmal für alle Apps; Abweichungen je App eingeklappt bis gesetzt, Vorschau je App, App-Filter', async () => {
    setze('allgemein', { pfade: { 'export.excel.kosten': 'K {Inhalt}' } });
    const e = await zeigen();
    await act(async () => e.einstellungenOeffnen('pfade'));
    await warten();
    const d = dialog()!;
    // der Berechnungsordner steht einmal, mit den Marken aller drei Apps; die Unterordner je App sind gesetzt und offen
    expect(d.querySelectorAll('[id^="einst-export.berechnungsordner"]').length).toBe(1);
    expect([...eintrag('export.berechnungsordner').querySelectorAll(':scope > .einst-eintrag-kopf .marke.pille')].map((x) => x.textContent)).toEqual(['QUADRIO', 'TERRIO', 'NUMIO']);
    const wirksam = () => [...eintrag('export.berechnungsordner').querySelectorAll('.einst-wirksam li')].map((li) => li.textContent);
    expect(wirksam()).toEqual(['QUADRIO 03 Berechnungen / Flächen', 'TERRIO 03 Berechnungen / Nachweise', 'NUMIO 03 Berechnungen / Kosten']);
    const unter = knopf('Unterordner je App (3)', d)!;
    expect(unter.getAttribute('aria-expanded')).toBe('true');
    expect(d.querySelector('[role="group"][aria-label="Unterordner je App: Berechnungsordner"]')?.hasAttribute('hidden')).toBe(false);
    // sichtbare Einleitung der Liste je App, daran hängt ihr Name
    const liste = eintrag('export.berechnungsordner').querySelector('.einst-wirksam ul')!;
    expect(document.getElementById(liste.getAttribute('aria-labelledby')!)?.textContent).toBe('Gilt je App:');
    // der gemeinsame Ordner wirkt sofort in der Vorschau je App
    await tippen(feldVon('export.berechnungsordner'), 'Ber');
    expect(wirksam()[0]).toBe('QUADRIO Ber / Flächen');
    // Excel-Name: übernommen – NUMIO weicht ab, deshalb offen; PDF: keine Abweichung, eingeklappt
    const [excelAuf, pdfAuf] = [...d.querySelectorAll<HTMLButtonElement>('.einst-aufklappen')].filter((b) => b.textContent?.startsWith('Je App abweichend'));
    expect(excelAuf.textContent).toBe('Je App abweichend (1)');
    expect(excelAuf.getAttribute('aria-expanded')).toBe('true');
    expect(feldVon('export.excel.abweichend.kosten').value).toBe('K {Inhalt}');
    expect(pdfAuf.getAttribute('aria-expanded')).toBe('false');
    expect(eintrag('export.pdf.abweichend.grz').closest('[hidden]')).not.toBeNull();
    expect(document.getElementById(pdfAuf.getAttribute('aria-controls')!)).not.toBeNull();
    await klick(pdfAuf);
    expect(pdfAuf.getAttribute('aria-expanded')).toBe('true');
    expect(eintrag('export.pdf.abweichend.grz').closest('[hidden]')).toBeNull();
    expect(feldVon('export.pdf.abweichend.grz').value).toBe('');
    // leer gilt der gemeinsame Name – er steht als Platzhalter im Feld
    expect(feldVon('export.pdf.abweichend.grz').placeholder).toBe('{PROJEKT_KUERZEL} {DATUM} {Inhalt}');
    // App-Filter: die gemeinsame Angabe bleibt, nur die Abweichung der App
    const filter = d.querySelector<HTMLSelectElement>('.einst-filter select')!;
    await act(async () => {
      filter.value = 'grz';
      filter.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(document.getElementById('einst-export.berechnungsordner')).not.toBeNull();
    expect(document.getElementById('einst-export.unterordner.grz')).not.toBeNull();
    expect(document.getElementById('einst-export.unterordner.kosten')).toBeNull();
    expect(wirksam()).toEqual(['TERRIO Ber / Nachweise']);
  });

  it('Baum: was von einem Eintrag abhängt, steht eingerückt darunter – mit Bezugszeile und vollständiger Vorschau, die den Eltern folgt', async () => {
    const e = await zeigen();
    await act(async () => e.einstellungenOeffnen('pfade'));
    await warten();
    const gewerke = eintrag('ablage.fabrio.gewerke');
    const gruppe = gewerke.nextElementSibling as HTMLElement;
    expect(gruppe.getAttribute('role')).toBe('group');
    expect(gruppe.getAttribute('aria-label')).toBe('Unterordner von „Ordner der Gewerke“');
    // je Unterordner seine Karte, dahinter die Gruppe der von ihm abhängigen (neue LV-Dateien, Rechnungsmuster)
    expect([...gruppe.children].map((x) => x.id || x.getAttribute('aria-label'))).toEqual([
      'einst-ablage.fabrio.lv',
      'Dateien in „LV-Dateien im Unterordner“',
      'einst-ablage.fabrio.auftrag',
      'Dateien in „Aufträge und Rechnungen“',
      'einst-ablage.fabrio.korrespondenz',
    ]);
    const auftrag = eintrag('ablage.fabrio.auftrag');
    expect(auftrag.querySelector('.einst-bezug')?.textContent).toBe('Relativ zu „Ordner der Gewerke“ › je Gewerk ein Ordner.');
    expect(auftrag.querySelector('.einst-vorschau')?.textContent).toBe('Vorschau: Projektordner / Gewerke / G08 Fenster / Auftrag');
    // die Rechnungsmuster hängen am Auftragsordner (zweite Ebene)
    expect(eintrag('plaene.fabrio.rechnungen').parentElement?.getAttribute('aria-label')).toBe('Dateien in „Aufträge und Rechnungen“');
    // Eltern ändern: die Vorschau der Kinder folgt sofort
    await tippen(feldVon('ablage.fabrio.gewerke'), 'Ausführung/Gewerke');
    expect(auftrag.querySelector('.einst-vorschau')?.textContent).toBe('Vorschau: Projektordner / Ausführung / Gewerke / G08 Fenster / Auftrag');
    // absolut getippt: die Karte bleibt an ihrem Platz, der Fokus im Feld – Fehler und Bezugszeile stehen dort
    const feld = feldVon('ablage.fabrio.auftrag');
    feld.focus();
    for (const t of ['Z', 'Z:', 'Z:\\', 'Z:\\Auftrag']) {
      await tippen(feld, t);
      expect(document.activeElement, t).toBe(feld);
    }
    expect(auftrag.parentElement).toBe(gruppe);
    expect(auftrag.querySelector('.einst-bezug')?.textContent).toBe('Absolut angegeben – gehört unter „Ordner der Gewerke“ und gilt nur relativ dazu.');
    expect(auftrag.querySelector('.feld-meldung')?.textContent).toBe('Relativ zu „Ordner der Gewerke“ angeben, ohne Laufwerk.');
  });

  it('Baum: ein absolut gespeichertes Kind löst sich aus dem Baum und steht auf oberster Ebene der Gruppe', async () => {
    setze('ava', { ablage: { auftrag: 'Z:\\Auftrag' } });
    const e = await zeigen();
    await act(async () => e.einstellungenOeffnen('pfade'));
    await warten();
    const los = eintrag('ablage.fabrio.auftrag');
    expect(los.parentElement?.classList.contains('einst-gruppe')).toBe(true);
    expect(los.querySelector('.einst-bezug')?.classList.contains('los')).toBe(true);
    // die Vorschau beginnt beim absoluten Wert, nicht im Projektordner
    expect(eintrag('plaene.fabrio.rechnungen').querySelector('.einst-vorschau')?.textContent).toMatch(/^Vorschau \(erstes Muster\): Z: \/ Auftrag \/ /);
  });

  it('Zielordner der Antragsdokumente: im Antragsordner; ein übernommener außerhalb steht direkt dahinter und ersetzt ihn', async () => {
    setze('allgemein', { pfade: { 'plaene.permio.zielpfad': 'Ausgang/{Antrag}' } });
    const e = await zeigen();
    await act(async () => e.einstellungenOeffnen('pfade'));
    await warten();
    const ziel = eintrag('plaene.permio.zielordner');
    expect(ziel.parentElement?.getAttribute('aria-label')).toBe('Abhängig von „Antragsordner“');
    expect(ziel.querySelector('.einst-bezug')?.textContent).toBe('Relativ zu „Antragsordner“. Gilt nicht, solange „Fester Zielordner außerhalb des Antragsordners“ gesetzt ist.');
    expect(ziel.querySelector('.einst-vorschau')).toBeNull();
    // die Karte außerhalb folgt direkt auf den Baum des Antragsordners
    const baum = eintrag('ablage.permio.antragsordner').nextElementSibling!;
    expect(baum.nextElementSibling?.id).toBe('einst-plaene.permio.zielpfad');
    expect(feldVon('plaene.permio.zielpfad').value).toBe('Ausgang/{Antrag}');
  });

  it('Sprungziel des Aufrufs gilt einmal: spätere Änderungen auf der Seite holen den Fokus nicht dorthin zurück', async () => {
    const e = await zeigen();
    await act(async () => e.einstellungenOeffnen('pfade', 'ablage.fotoordner'));
    await warten();
    expect(document.activeElement).toBe(feldVon('ablage.fotoordner'));
    // anderswo weiterarbeiten, dann den Filter wechseln (neu zeichnen)
    feldVon('ablage.fabrio.gewerke').focus();
    await tippen(feldVon('ablage.fabrio.gewerke'), 'Gewerke neu');
    const filter = dialog()!.querySelector<HTMLSelectElement>('.einst-filter select')!;
    await act(async () => {
      filter.value = 'ava';
      filter.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await warten();
    expect(document.activeElement).not.toBe(feldVon('ablage.fotoordner'));
  });

  it('Zielordner außerhalb nicht gesetzt: keine Karte dafür, der Zielordner im Antragsordner gilt mit Vorschau', async () => {
    const e = await zeigen();
    await act(async () => e.einstellungenOeffnen('pfade'));
    await warten();
    expect(document.getElementById('einst-plaene.permio.zielpfad')).toBeNull();
    expect(eintrag('plaene.permio.zielordner').querySelector('.einst-vorschau')?.textContent).toBe('Vorschau: Projektordner / TÖB / BAUA 2');
  });

  it('Baum mit App-Filter: Eltern einer anderen App abgeblendet zur Orientierung, ohne Feld; „Alle Apps zeigen“', async () => {
    const e = await zeigen();
    await act(async () => e.einstellungenOeffnen('pfade'));
    await warten();
    const filter = dialog()!.querySelector<HTMLSelectElement>('.einst-filter select')!;
    await act(async () => {
      filter.value = 'ordner';
      filter.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // „Name des Projektordners“ nutzt ATLAS, sein Eltern-Eintrag „Stammordner“ auch – beide mit Feld; Katasterpläne: Ordner und Dateiname
    expect(eintrag('plaene.kataster.dateiname').parentElement?.getAttribute('aria-label')).toBe('Dateien in „Ablageordner der Katasterpläne“');
    await act(async () => {
      filter.value = 'grz';
      filter.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // TERRIO nutzt den gemeinsamen Berechnungsordner selbst: mit Feld, nicht abgeblendet
    expect(eintrag('export.berechnungsordner').classList.contains('einst-bezugseintrag')).toBe(false);
    expect(feldVon('export.berechnungsordner')).not.toBeNull();
    // Baustein für Eltern einer anderen App: abgeblendet, ohne Feld, mit dem, was gilt, und „Alle Apps zeigen“
    const host = document.body.appendChild(document.createElement('div'));
    const alle = vi.fn();
    const wurzel = createRoot(host);
    await act(async () => wurzel.render(createElement(e.PfadBezugsZeile, { e: (await import('../einstellungen/pfade')).pfadEinstellung('ablage.fabrio.gewerke'), werte: {}, onAlle: alle })));
    const z = host.querySelector('.einst-bezugseintrag')!;
    expect(z.querySelector('input, textarea')).toBeNull();
    expect(z.querySelector('.einst-vorschau')?.textContent).toBe('Gilt: Projektordner / Gewerke');
    await klick(knopf('Alle Apps zeigen', z));
    expect(alle).toHaveBeenCalledTimes(1);
    act(() => wurzel.unmount());
    host.remove();
  });

  it('gemeinsame Angaben: gilt für alle Apps dasselbe, steht keine Liste je App', async () => {
    setze('allgemein', { pfade: { 'export.unterordner.flaechenrechner': '', 'export.unterordner.grz': '', 'export.unterordner.kosten': '' } });
    const e = await zeigen();
    await act(async () => e.einstellungenOeffnen('pfade'));
    await warten();
    expect(eintrag('export.berechnungsordner').querySelector('.einst-wirksam')).toBeNull();
    // dann bleibt die Vorschau
    expect(eintrag('export.berechnungsordner').querySelector(':scope > .einst-vorschau')?.textContent).toBe('Vorschau: Projektordner / 03 Berechnungen');
    expect(knopf('Unterordner je App', dialog()!)?.getAttribute('aria-expanded')).toBe('false');
  });

  it('gemeinsame Angaben: ein Aufruf zu einer Abweichung klappt sie auf und setzt den Fokus', async () => {
    const e = await zeigen();
    await act(async () => e.einstellungenOeffnen('pfade', 'export.pdf.abweichend.grz'));
    await warten();
    expect(document.activeElement).toBe(feldVon('export.pdf.abweichend.grz'));
  });

  it('Prüfung: ungültige Zeichen und leere Pflichtfelder am Feld, „Übernehmen“ gesperrt mit Grund; „Vorgabe wiederherstellen“', async () => {
    setze('allgemein', { fotoordner: '10 Fotos' });
    const e = await zeigen();
    await act(async () => e.einstellungenOeffnen('pfade'));
    await warten();
    const d = dialog()!;
    // Erstfokus ohne Angabe eines Eintrags: das erste Feld der Seite (Filter „App“)
    expect(document.activeElement?.tagName).toBe('SELECT');
    const foto = eintrag('ablage.fotoordner');
    expect(feldVon('ablage.fotoordner').value).toBe('10 Fotos');
    expect(foto.textContent).toContain('Eigener Wert');
    await tippen(feldVon('ablage.fotoordner'), 'Fotos|alt');
    expect(foto.querySelector('.feld-meldung')?.textContent).toBe('Nicht erlaubt in Ordner- und Dateinamen: |');
    expect(feldVon('ablage.fotoordner').getAttribute('aria-invalid')).toBe('true');
    expect(knopf('Übernehmen', d)!.disabled).toBe(true);
    expect(knopf('Übernehmen', d)!.title).toContain('Fotoordner');
    // der Grund steht sichtbar neben den Knöpfen, „Zum Feld“ springt hin
    const grund = d.querySelector<HTMLElement>('.einst-sperrgrund')!;
    expect(grund.textContent).toContain('„Fotoordner“ berichtigen');
    (document.activeElement as HTMLElement | null)?.blur();
    await klick(knopf('Zum Feld', grund));
    await warten();
    expect(document.activeElement).toBe(feldVon('ablage.fotoordner'));
    await tippen(feldVon('ablage.fotoordner'), '');
    expect(foto.querySelector('.feld-meldung')?.textContent).toMatch(/^Angabe fehlt/);
    await klick(knopf('Vorgabe wiederherstellen', foto));
    expect(feldVon('ablage.fotoordner').value).toBe('09 Fotos');
    expect(knopf('Übernehmen', d)!.disabled).toBe(false);
    await klick(knopf('Übernehmen', d));
    // bisheriger Schlüssel, die Vorgabe ausdrücklich geschrieben
    expect(roh('allgemein')).toEqual({ fotoordner: '09 Fotos' });
  });

  it('Abbrechen bzw. Esc mit Änderungen: Rückfrage „Änderungen an ‚Einstellungen‘ verwerfen?“; ohne Änderungen schließt es gleich', async () => {
    const e = await zeigen();
    await act(async () => e.einstellungenOeffnen('pfade'));
    await warten();
    await klick(knopf('Abbrechen', dialog()!));
    expect(dialog()).toBeNull();
    await act(async () => e.einstellungenOeffnen('pfade'));
    await warten();
    await tippen(feldVon('export.pdf'), 'Kosten');
    await klick(knopf('Abbrechen', dialog()!));
    const rf = document.querySelector<HTMLElement>('.modal.rf')!;
    expect(rf.textContent).toContain('Änderungen an ‚Einstellungen‘ verwerfen?');
    expect(rf.textContent).toContain('Die Änderungen an den Einstellungen gehen verloren.');
    await klick(knopf('Abbrechen', rf));
    expect(dialog()).not.toBeNull();
    expect(feldVon('export.pdf').value).toBe('Kosten');
    await klick(knopf('Abbrechen', dialog()!));
    await klick(knopf('Verwerfen und schließen'));
    expect(dialog()).toBeNull();
    expect(roh('allgemein')).toBeNull();
    // beim nächsten Öffnen beginnt der Entwurf frisch
    await act(async () => e.einstellungenOeffnen('pfade'));
    await warten();
    expect(feldVon('export.pdf').value).toBe('{PROJEKT_KUERZEL} {DATUM} {Inhalt}');
  });

  it('Allgemein: Büro und Mitarbeiter gelten erst mit „Übernehmen“', async () => {
    setze('allgemein', { buero: 'Alt', fotoordner: 'F' });
    const e = await zeigen();
    await act(async () => e.einstellungenOeffnen());
    await warten();
    const felder = [...dialog()!.querySelectorAll<HTMLInputElement>('[role="tabpanel"] input')];
    // Erstfokus: das erste Feld der Seite
    expect(document.activeElement).toBe(felder[0]);
    await tippen(felder[0], 'Architekturbüro Beispiel');
    await tippen(felder[1], 'TP; AK, TP');
    expect(roh('allgemein')!.buero).toBe('Alt');
    await klick(knopf('Übernehmen', dialog()!));
    expect(roh('allgemein')).toEqual({ buero: 'Architekturbüro Beispiel', fotoordner: 'F', mitarbeiter: ['TP', 'AK'] });
  });

  it('Listen je Zeile; Liste der Rechnungsmuster bleibt im Schlüssel von FABRIO, übrige Einstellungen dort unverändert', async () => {
    setze('ava', { ablage: { gewerke: 'Gewerke', archive: ['Archiv'] }, rechnungen: { arten: [{ kuerzel: 'AB', name: 'Abschlag' }] } });
    const e = await zeigen();
    await act(async () => e.einstellungenOeffnen('pfade'));
    await warten();
    const archive = feldVon('ablage.fabrio.archive');
    expect(archive.tagName).toBe('TEXTAREA');
    await tippen(archive, 'Archiv\n_alt\n');
    // Enter in der Liste beginnt eine neue Zeile, übernimmt nichts
    await taste(archive, 'Enter');
    expect(dialog()).not.toBeNull();
    await klick(knopf('Übernehmen', dialog()!));
    expect(roh('ava')).toEqual({ ablage: { gewerke: 'Gewerke', archive: ['Archiv', '_alt'] }, rechnungen: { arten: [{ kuerzel: 'AB', name: 'Abschlag' }] } });
  });

  it('alter Wert dieses Rechners weicht vom gemeinsamen ab: Hinweis mit Wahl; ohne gemeinsamen Wert still übernommen', async () => {
    localStorage.setItem('formulare:export', JSON.stringify({ antragsordner: 'Anträge', zielpfad: 'Ausgang/{Antrag}' }));
    setze('allgemein', { pfade: { 'ablage.permio.antragsordner': 'TÖB-Ablage' } });
    const e = await zeigen();
    await act(async () => e.einstellungenOeffnen('pfade'));
    await warten();
    // der Zielordner stand gemeinsam noch nicht: übernommen
    expect((roh('allgemein')!.pfade as Record<string, unknown>)['plaene.permio.zielpfad']).toBe('Ausgang/{Antrag}');
    const hinweis = document.querySelector<HTMLElement>('.einst-abweichung')!;
    expect(hinweis.textContent).toContain('Antragsordner');
    expect(hinweis.textContent).toContain('Anträge');
    expect(hinweis.textContent).toContain('TÖB-Ablage');
    await klick(knopf('Wert dieses Rechners', hinweis));
    expect(document.querySelector('.einst-abweichung')).toBeNull();
    expect(feldVon('ablage.permio.antragsordner').value).toBe('Anträge');
    await klick(knopf('Übernehmen', dialog()!));
    expect((roh('allgemein')!.pfade as Record<string, unknown>)['ablage.permio.antragsordner']).toBe('Anträge');
    // entschieden: kein Hinweis mehr (der alte Eintrag bleibt unverändert stehen)
    await act(async () => e.einstellungenOeffnen('pfade'));
    await warten();
    expect(document.querySelector('.einst-abweichung')).toBeNull();
    expect(JSON.parse(localStorage.getItem('formulare:export')!)).toEqual({ antragsordner: 'Anträge', zielpfad: 'Ausgang/{Antrag}' });
  });

  it('Erweiterungspunkt: Seiten der Apps hinter den gemeinsamen, nach App-Namen; ihr Entwurf zählt für „Übernehmen“', async () => {
    const e = await zeigen();
    let geaendert = false;
    const uebernommen = vi.fn(async () => undefined);
    e.einstellungsSeiteAnmelden({ id: 'ordner', app: 'ordner', titel: 'ATLAS', text: 'Struktur', symbol: 'ordner', inhalt: () => createElement('p', null, 'Seite von ATLAS') });
    e.einstellungsSeiteAnmelden({
      id: 'ava',
      app: 'ava',
      titel: 'FABRIO',
      text: 'Prüfung',
      symbol: 'zahnrad',
      inhalt: () => createElement('p', null, 'Seite von FABRIO'),
      entwurf: { geaendert: () => geaendert, uebernehmen: uebernommen, verwerfen: () => (geaendert = false) },
    });
    e.einstellungenStartseite('ava');
    await act(async () => e.einstellungenOeffnen());
    await warten();
    const d = dialog()!;
    expect([...d.querySelectorAll('[role="tab"] .einst-nav-titel')].map((t) => t.textContent)).toEqual(['Allgemein', 'Pfade und Benennung', 'ATLAS', 'FABRIO']);
    // die Seite heißt wie die App: der Name steht nicht noch einmal in der Zeile darunter
    expect([...d.querySelectorAll('[role="tab"] .einst-nav-text')].slice(2).map((t) => t.textContent)).toEqual(['Struktur', 'Prüfung']);
    expect(d.querySelector('[role="tabpanel"]')!.textContent).toContain('Seite von FABRIO');
    geaendert = true;
    act(() => e.einstellungenEntwurfMelden());
    await klick(knopf('Übernehmen', d));
    expect(uebernommen).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
  });

  it('Stammordner der Projekte: bestehende Liste unverändert gelesen, Reihenfolge per Tastatur (Fokus bleibt), Entfernen, Eintragen nur vollständiger Ordner', async () => {
    setze('allgemein', { projekte: ['Z:\\Projekte', '\\\\server\\Akquise', 'Y:\\Archiv'], oapPfad: 'x.oap' });
    const e = await zeigen();
    act(() => e.einstellungenOeffnen('pfade', 'projekt.stammordner'));
    await warten();
    const liste = () => [...eintrag('projekt.stammordner').querySelectorAll('.einst-ordnerliste code')].map((c) => c.textContent);
    expect(liste()).toEqual(['Z:\\Projekte', '\\\\server\\Akquise', 'Y:\\Archiv']);
    expect(eintrag('projekt.stammordner').querySelector('.einst-ordnerliste li')!.textContent).toContain('neue Projekte');
    const knopfMit = (label: string) => [...eintrag('projekt.stammordner').querySelectorAll<HTMLButtonElement>('button')].find((x) => x.getAttribute('aria-label') === label)!;
    expect(knopfMit('Z:\\Projekte nach oben').disabled).toBe(true);
    // Akquise nach oben: gilt dann für neue Projekte; der Fokus bleibt an ihrem Knopf
    await klick(knopfMit('\\\\server\\Akquise nach oben'));
    expect(liste()).toEqual(['\\\\server\\Akquise', 'Z:\\Projekte', 'Y:\\Archiv']);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('\\\\server\\Akquise nach unten');
    await klick(knopfMit('Y:\\Archiv entfernen'));
    expect(liste()).toEqual(['\\\\server\\Akquise', 'Z:\\Projekte']);
    // eintragen: relativ geht nicht (Fehler am Feld), vollständig schon – Enter trägt ein statt zu übernehmen
    const feld = eintrag('projekt.stammordner').querySelector<HTMLInputElement>('input.einst-feld')!;
    await tippen(feld, 'Projekte');
    await taste(feld, 'Enter');
    expect(eintrag('projekt.stammordner').querySelector('.feld-meldung')!.textContent).toContain('Vollständigen Ordner');
    await tippen(feld, 'z:\\projekte\\');
    await taste(feld, 'Enter');
    expect(eintrag('projekt.stammordner').querySelector('.feld-meldung')!.textContent).toContain('schon in der Liste');
    await tippen(feld, 'W:\\Neu');
    await taste(feld, 'Enter');
    expect(liste()).toEqual(['\\\\server\\Akquise', 'Z:\\Projekte', 'W:\\Neu']);
    expect(dialog()).not.toBeNull();
    // gespeichert erst mit „Übernehmen“, unter dem bisherigen Schlüssel
    expect(roh('allgemein')!.projekte).toEqual(['Z:\\Projekte', '\\\\server\\Akquise', 'Y:\\Archiv']);
    await klick(knopf('Übernehmen', dialog()!));
    expect(roh('allgemein')).toMatchObject({ projekte: ['\\\\server\\Akquise', 'Z:\\Projekte', 'W:\\Neu'], oapPfad: 'x.oap' });
  });

  it('Stammordner: ein ungültiger Eintrag aus älteren Daten ist gekennzeichnet und lässt sich entfernen', async () => {
    setze('allgemein', { projekte: ['Z:\\Projekte', 'Projekte'] });
    const e = await zeigen();
    act(() => e.einstellungenOeffnen('pfade', 'projekt.stammordner'));
    await warten();
    const falsch = eintrag('projekt.stammordner').querySelector('.einst-ordner-falsch')!;
    expect(falsch.textContent).toContain('nicht vollständig');
    await klick([...falsch.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === 'Projekte entfernen'));
    expect(eintrag('projekt.stammordner').querySelector('.einst-ordner-falsch')).toBeNull();
    await klick(knopf('Übernehmen', dialog()!));
    expect(roh('allgemein')!.projekte).toEqual(['Z:\\Projekte']);
  });

  it('herausgelöst bzw. im Tab von Arkly: der Rahmen bittet um den Dialog – er öffnet auf der Seite der App', async () => {
    window.history.replaceState(null, '', '/?rahmen=fenster&app=ava');
    try {
      const e = await zeigen();
      e.einstellungsSeiteAnmelden({ id: 'ava', app: 'ava', titel: 'FABRIO', text: 'Prüfung', symbol: 'liste', inhalt: () => createElement('p', null, 'Seite von FABRIO') });
      e.einstellungenStartseite('ava');
      // fremde Herkunft zählt nicht
      await act(async () => void window.dispatchEvent(new MessageEvent('message', { data: { typ: 'arch-tools:einstellungen-oeffnen', an: 'ava' }, origin: 'https://example.org', source: window })));
      expect(dialog()).toBeNull();
      await act(async () => void window.dispatchEvent(new MessageEvent('message', { data: { typ: 'arch-tools:einstellungen-oeffnen', an: 'ava' }, origin: window.location.origin, source: window })));
      await warten();
      expect(dialog()!.querySelector('[role="tabpanel"]')!.textContent).toContain('Seite von FABRIO');
      // Strg+, mit vorab abgefangenem Ereignis (Rahmen hat weitergegeben): der Dialog öffnet nicht noch einmal
      act(() => e.useEinstellungen.getState().schliessen());
      const ev = new KeyboardEvent('keydown', { key: ',', ctrlKey: true, bubbles: true, cancelable: true });
      ev.preventDefault();
      await act(async () => void window.dispatchEvent(ev));
      expect(dialog()).toBeNull();
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });

  it('Menüpunkt und Verweis: „Einstellungen …“ mit Strg+, bzw. „Pfade und Benennung …“ öffnen den Dialog', async () => {
    const e = await zeigen();
    expect(e.einstellungenPunkt()).toMatchObject({ text: 'Einstellungen …', symbol: 'zahnrad', tasten: 'Strg+,' });
    act(() => {
      (e.einstellungenPunkt('pfade') as { aktion: () => void }).aktion();
    });
    await warten();
    expect(e.useEinstellungen.getState()).toMatchObject({ offen: true, seite: 'pfade' });
  });
});
