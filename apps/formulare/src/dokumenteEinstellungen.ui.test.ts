// @vitest-environment happy-dom
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RueckfrageHost } from '@core/ui/Rueckfrage';
import { VORGABE_EXPORT, VORGABE_KATALOG, VORGABE_VORLAGEN } from './antrag';
import { useAntrag } from './antragStore';
import { VORGABE_MERKMALE } from './bedingung';
import { DokumenteEinstellungen } from './components/DokumenteEinstellungen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  localStorage.clear();
  useAntrag.setState({
    einstellungen: { ...VORGABE_EXPORT },
    merkmalDefinitionen: VORGABE_MERKMALE,
    katalog: structuredClone(VORGABE_KATALOG),
    vorlagen: structuredClone(VORGABE_VORLAGEN),
  });
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

const warte = async () => {
  for (let i = 0; i < 4; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};
const klick = async (el: Element) => {
  act(() => (el as HTMLElement).click());
  await warte();
};
const knopf = (text: string, in_: ParentNode = document) => [...in_.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text || b.textContent?.includes(text))!;
const eingabe = (el: HTMLInputElement, wert: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, wert);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
const waehlen = (el: HTMLSelectElement, wert: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, wert);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
const zeige = async () => {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(createElement(Fragment, null, createElement(DokumenteEinstellungen), createElement(RueckfrageHost))));
  await warte();
  return host;
};
const zeile = (titel: string) => [...document.querySelectorAll<HTMLElement>('.es-dok')].find((z) => z.querySelector('.es-dok-text strong')?.textContent === titel)!;
const oeffnen = (titel: string) => klick(zeile(titel).querySelector('.es-dok-knopf')!);
const feld = (z: HTMLElement, label: string) =>
  [...z.querySelectorAll('label')].find((l) => l.querySelector('.field-label')?.textContent === label)?.querySelector('input') as HTMLInputElement | undefined;
const vorlageWahl = () => document.querySelector<HTMLSelectElement>('.es-dok-kopf select')!;
const katalogEintrag = (id: string) => useAntrag.getState().katalog.find((k) => k.id === id);
const vorlage = (id: string) => useAntrag.getState().vorlagen.find((v) => v.id === id)!;

describe('Einstellungen › Antrag & Export › Antragsdokumente', () => {
  it('Liste mit Kurzbeschreibung und Vorlagen je Dokument – keine Tabelle mit einer Spalte je Vorlage', async () => {
    await zeige();
    expect(document.querySelectorAll('.es-dok')).toHaveLength(VORGABE_KATALOG.length);
    expect(document.querySelector('.es-vorlage-spalte')).toBeNull();
    const bauantrag = zeile('Bauantrag');
    expect(bauantrag.querySelector('.es-dok-unter')!.textContent).toBe('Formular „Bauantrag“');
    expect([...bauantrag.querySelectorAll('.es-chip')].map((c) => c.textContent)).toEqual(['Bauantrag']);
    // zugeklappt: keine Angaben, aria-expanded false
    expect(bauantrag.querySelector('.es-dok-knopf')!.getAttribute('aria-expanded')).toBe('false');
    expect(bauantrag.querySelector('.es-dok-editor')).toBeNull();
  });

  it('Klick öffnet die Angaben als Formular: Bezeichnung, Art, Quelle und Muster ändern', async () => {
    await zeige();
    await oeffnen('Bauantrag');
    const z = zeile('Bauantrag');
    expect(z.querySelector('.es-dok-knopf')!.getAttribute('aria-expanded')).toBe('true');
    expect(z.querySelector('[role="group"]')!.getAttribute('aria-label')).toBe('Angaben zu Bauantrag');
    // Formular: Feld „Formular“, keine Quelle
    expect(feld(z, 'Formular (Teil des Namens oder Kennung)')!.value).toBe('Bauantrag');
    expect(feld(z, 'Ordner der Quelle (im Projektordner)')).toBeUndefined();
    eingabe(feld(z, 'Bezeichnung')!, 'Bauantrag (Formular)');
    await warte();
    expect(katalogEintrag('bauantrag')!.titel).toBe('Bauantrag (Formular)');
    // Art: Datei aus dem Projektordner – Quelle und Muster mit Vorgaben als Platzhalter
    const z2 = zeile('Bauantrag (Formular)');
    await klick([...z2.querySelectorAll<HTMLInputElement>('.es-dok-art input')][1]);
    expect(katalogEintrag('bauantrag')!.art).toBe('extern');
    const z3 = zeile('Bauantrag (Formular)');
    expect(feld(z3, 'Formular (Teil des Namens oder Kennung)')).toBeUndefined();
    expect(feld(z3, 'Ordner der Quelle (im Projektordner)')!.placeholder).toBe(VORGABE_EXPORT.berechnungsordner);
    eingabe(feld(z3, 'Muster des Dateinamens')!, '*Bauantrag*.pdf');
    await warte();
    expect(zeile('Bauantrag (Formular)').querySelector('.es-dok-unter')!.textContent).toBe(`Datei aus ${VORGABE_EXPORT.berechnungsordner} · *Bauantrag*.pdf`);
    // „Schließen“ klappt zu
    await klick(knopf('Schließen', zeile('Bauantrag (Formular)')));
    expect(zeile('Bauantrag (Formular)').querySelector('.es-dok-editor')).toBeNull();
  });

  it('Vorlage wählen: ankreuzen, was dazugehört – die Zahl steht in der Vorlagen-Tabelle', async () => {
    await zeige();
    expect(document.querySelector('.es-dok-haken')).toBeNull();
    waehlen(vorlageWahl(), 'bauva');
    await warte();
    const vorher = vorlage('bauva').dokumente.length;
    expect(document.querySelector('.es-dok-kopf [role="status"]')!.textContent).toBe(`${vorher} von ${VORGABE_KATALOG.length} Dokumenten gehören zu „Bauvoranfrage“ – ankreuzen, was dazugehört.`);
    const haken = zeile('Bauantrag').querySelector<HTMLInputElement>('.es-dok-haken')!;
    expect(haken.checked).toBe(false);
    expect(haken.getAttribute('aria-label')).toBe('Bauantrag gehört zu Bauvoranfrage');
    await klick(haken);
    expect(vorlage('bauva').dokumente).toContain('bauantrag');
    expect(knopf(`${vorher + 1} Dokumente`)).toBeTruthy();
    expect([...zeile('Bauantrag').querySelectorAll('.es-chip')].map((c) => c.textContent)).toEqual(['Bauantrag', 'Bauvoranfrage']);
  });

  it('„n Dokumente“ in der Vorlagen-Tabelle wählt die Vorlage der Liste', async () => {
    await zeige();
    const reihe = [...document.querySelectorAll('.es-vorlagen tbody tr')].find((r) => r.querySelector<HTMLInputElement>('input')!.value === 'Denkmalrechtliche Erlaubnis')!;
    await klick(knopf('Dokumente', reihe));
    expect(vorlageWahl().value).toBe('denk');
    expect(document.querySelectorAll('.es-dok-haken')).toHaveLength(VORGABE_KATALOG.length);
  });

  it('Dokument hinzufügen: bei gewählter Vorlage gleich dabei, Angaben offen, Bezeichnung im Fokus', async () => {
    await zeige();
    waehlen(vorlageWahl(), 'baua');
    await warte();
    await klick(knopf('Dokument hinzufügen'));
    const k = useAntrag.getState().katalog.at(-1)!;
    expect(k).toMatchObject({ titel: 'Neues Dokument', art: 'extern' });
    expect(vorlage('baua').dokumente).toContain(k.id);
    const z = zeile('Neues Dokument');
    expect(z.querySelector('.es-dok-editor')).not.toBeNull();
    expect(document.activeElement).toBe(feld(z, 'Bezeichnung'));
  });

  it('Entfernen fragt nach – Abbrechen behält es, Entfernen nimmt es auch aus den Vorlagen', async () => {
    await zeige();
    expect(VORGABE_VORLAGEN.filter((v) => v.dokumente.includes('lageplan')).length).toBeGreaterThan(0);
    await oeffnen('Lageplan');
    await klick(knopf('Dokument entfernen', zeile('Lageplan')));
    const dialog = () => document.querySelector('.modal.rf')!;
    expect(dialog().textContent).toContain('„Lageplan“ aus den Antragsdokumenten entfernen?');
    await klick(knopf('Abbrechen', dialog()));
    expect(katalogEintrag('lageplan')).toBeDefined();
    await klick(knopf('Dokument entfernen', zeile('Lageplan')));
    await klick(knopf('Entfernen', dialog()));
    expect(katalogEintrag('lageplan')).toBeUndefined();
    expect(useAntrag.getState().vorlagen.some((v) => v.dokumente.includes('lageplan'))).toBe(false);
  });

  it('„Vorgabe wiederherstellen“ nur bei Abweichung und mit Rückfrage', async () => {
    const host = await zeige();
    const karte = () => [...host.querySelectorAll('.es-karte')].find((k) => k.querySelector('h3')!.textContent === 'Antragsdokumente')!;
    expect(knopf('Vorgabe wiederherstellen', karte())).toBeUndefined();
    await oeffnen('Bauantrag');
    eingabe(feld(zeile('Bauantrag'), 'Bezeichnung')!, 'Eigener Titel');
    await warte();
    await klick(knopf('Vorgabe wiederherstellen', karte()));
    await klick(knopf('Zurücksetzen', document.querySelector('.modal.rf')!));
    expect(useAntrag.getState().katalog).toEqual(VORGABE_KATALOG);
  });

  it('eine Bedingung steht als „nur wenn …“ in der Zeile und als Text in den Angaben', async () => {
    useAntrag.setState({
      katalog: VORGABE_KATALOG.map((k) => (k.id === 'bauantrag' ? { ...k, bedingung: { art: 'gruppe', op: 'und', teile: [{ art: 'merkmal', merkmal: 'Gebäudeklasse', werte: ['3'] }] } } : k)),
    });
    await zeige();
    const chip = zeile('Bauantrag').querySelector('.es-chip.bedingt')!;
    expect(chip.textContent).toBe('nur wenn …');
    expect(chip.getAttribute('title')).toMatch(/^Nur erforderlich, wenn .*Gebäudeklasse/);
    await oeffnen('Bauantrag');
    expect(zeile('Bauantrag').querySelector('.es-dok-bedingung')!.textContent).toMatch(/nur, wenn .*Gebäudeklasse/);
  });
});
