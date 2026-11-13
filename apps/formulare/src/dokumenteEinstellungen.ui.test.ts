// @vitest-environment happy-dom
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RueckfrageHost } from '@core/ui/Rueckfrage';
import { VORGABE_EXPORT, VORGABE_KATALOG, VORGABE_VORLAGEN, vorlagenAus } from './antrag';
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
    expect(document.querySelector('.es-vorlagen th + th + th + th + th + th')).toBeNull();
    const bauantrag = zeile('Bauantrag');
    // Formular, dessen Suchbegriff die Bezeichnung ist bzw. ein Teil des Namens
    expect(bauantrag.querySelector('.es-dok-unter')!.textContent).toBe('Formular des Projekts');
    expect(zeile('Statistischer Erhebungsbogen').querySelector('.es-dok-unter')!.textContent).toBe('Formular mit „Statisti“ im Namen');
    expect([...bauantrag.querySelectorAll('.es-chip')].map((c) => c.textContent)).toEqual(['Bauantrag']);
    // die Vorlagen stehen für Screenreader in der Beschreibung des Knopfs, nicht in seinem Namen
    const knopf = bauantrag.querySelector('.es-dok-knopf')!;
    expect(bauantrag.querySelector('.es-dok-chips')!.getAttribute('aria-hidden')).toBe('true');
    expect(document.getElementById(knopf.getAttribute('aria-describedby')!)!.textContent).toBe('Gehört zu: Bauantrag');
    // zugeklappt: keine Angaben, aria-expanded false
    expect(bauantrag.querySelector('.es-dok-knopf')!.getAttribute('aria-expanded')).toBe('false');
    expect(bauantrag.querySelector('.es-dok-knopf')!.hasAttribute('aria-controls')).toBe(false);
    expect(bauantrag.querySelector('.es-dok-editor')).toBeNull();
  });

  it('Klick öffnet die Angaben als Formular: Bezeichnung, Art, Quelle und Muster ändern', async () => {
    await zeige();
    await oeffnen('Bauantrag');
    const z = zeile('Bauantrag');
    expect(z.querySelector('.es-dok-knopf')!.getAttribute('aria-expanded')).toBe('true');
    expect(z.querySelector('.es-dok-knopf')!.getAttribute('aria-controls')).toBe(z.querySelector('.es-dok-editor')!.id);
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
    // „Schließen“ klappt zu, der Fokus geht zurück auf die Zeile
    await klick(knopf('Schließen', zeile('Bauantrag (Formular)')));
    expect(zeile('Bauantrag (Formular)').querySelector('.es-dok-editor')).toBeNull();
    expect(document.activeElement).toBe(zeile('Bauantrag (Formular)').querySelector('.es-dok-knopf'));
  });

  it('Esc in den Angaben schließt nur die Angaben und gibt den Fokus an die Zeile', async () => {
    await zeige();
    await oeffnen('Lageplan');
    const eingabeFeld = feld(zeile('Lageplan'), 'Bezeichnung')!;
    eingabeFeld.focus();
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => void eingabeFeld.dispatchEvent(esc));
    await warte();
    // vorbehalten: das Ereignis ist verbraucht, die Einstellungen (Esc am Dokument) bleiben offen
    expect(esc.defaultPrevented).toBe(true);
    expect(zeile('Lageplan').querySelector('.es-dok-editor')).toBeNull();
    expect(document.activeElement).toBe(zeile('Lageplan').querySelector('.es-dok-knopf'));
  });

  it('Vorlage wählen: ankreuzen, was dazugehört – die Zahl steht in der Vorlagen-Tabelle', async () => {
    await zeige();
    expect(document.querySelector('.es-dok-haken')).toBeNull();
    waehlen(vorlageWahl(), 'bauva');
    await warte();
    const vorher = vorlage('bauva').dokumente.length;
    expect(document.querySelector('.es-dok-kopf [role="status"]')!.textContent).toBe(`${vorher} von ${VORGABE_KATALOG.length} Dokumenten gehören zu „Bauvoranfrage“ – ankreuzen, was dazugehört.`);
    const haken = zeile('Bauantrag').querySelector<HTMLInputElement>('.es-dok-haken input')!;
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
    // der Fokus springt auf die Auswahl
    expect(document.activeElement).toBe(vorlageWahl());
  });

  it('Einzahl und Mehrzahl: „1 Dokument“, „1 von … gehört“', async () => {
    useAntrag.setState({ vorlagen: [{ id: 'eins', name: 'Nur eins', dokumente: ['lageplan'] }] });
    await zeige();
    expect(knopf('1 Dokument')!.textContent).toBe('1 Dokument');
    waehlen(vorlageWahl(), 'eins');
    await warte();
    expect(document.querySelector('.es-dok-kopf [role="status"]')!.textContent).toBe(`1 von ${VORGABE_KATALOG.length} Dokumenten gehört zu „Nur eins“ – ankreuzen, was dazugehört.`);
  });

  it('Vorlage entfernen fragt nach; die gewählte Vorlage fällt dann auf „– keine –“ zurück', async () => {
    await zeige();
    waehlen(vorlageWahl(), 'denk');
    await warte();
    const muell = () => document.querySelector<HTMLButtonElement>('button[aria-label="Vorlage Denkmalrechtliche Erlaubnis entfernen"]')!;
    const dialog = () => document.querySelector('.modal.rf')!;
    // ohne Fokus auf dem Knopf (WKWebView fokussiert angeklickte Knöpfe nicht): nach „Abbrechen“ trotzdem dorthin
    (document.activeElement as HTMLElement | null)?.blur();
    await klick(muell());
    expect(dialog().textContent).toContain('„Denkmalrechtliche Erlaubnis“ entfernen?');
    await klick(knopf('Abbrechen', dialog()));
    expect(vorlage('denk')).toBeDefined();
    expect(document.activeElement).toBe(muell());
    expect(vorlageWahl().value).toBe('denk');
    await klick(muell());
    await klick(knopf('Entfernen', dialog()));
    expect(useAntrag.getState().vorlagen.some((v) => v.id === 'denk')).toBe(false);
    expect(vorlageWahl().value).toBe('');
    expect(document.querySelector('.es-dok-haken')).toBeNull();
    expect(document.activeElement).toBe(knopf('Vorlage hinzufügen'));
    // kommt die Vorlage wieder (z. B. Vorgabe), bleibt die Auswahl leer
    act(() => useAntrag.setState({ vorlagen: structuredClone(VORGABE_VORLAGEN) }));
    await warte();
    expect(vorlageWahl().value).toBe('');
    expect(document.querySelector('.es-dok-haken')).toBeNull();
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
    // nur beim Anlegen: nach Schließen und erneutem Öffnen kein Fokus (und keine Markierung) mehr
    await klick(knopf('Schließen', z));
    await oeffnen('Neues Dokument');
    expect(document.activeElement).not.toBe(feld(zeile('Neues Dokument'), 'Bezeichnung'));
  });

  it('Entfernen fragt nach – Abbrechen behält es, Entfernen nimmt es auch aus den Vorlagen', async () => {
    await zeige();
    expect(VORGABE_VORLAGEN.filter((v) => v.dokumente.includes('lageplan')).length).toBeGreaterThan(0);
    await oeffnen('Lageplan');
    // wie im Browser: der angeklickte Knopf hat den Fokus
    knopf('Dokument entfernen', zeile('Lageplan')).focus();
    await klick(knopf('Dokument entfernen', zeile('Lageplan')));
    const dialog = () => document.querySelector('.modal.rf')!;
    expect(dialog().textContent).toContain('„Lageplan“ aus den Antragsdokumenten entfernen?');
    await klick(knopf('Abbrechen', dialog()));
    expect(katalogEintrag('lageplan')).toBeDefined();
    // nach „Abbrechen“ wieder auf dem Knopf, der die Rückfrage geöffnet hat
    expect(document.activeElement).toBe(knopf('Dokument entfernen', zeile('Lageplan')));
    const i = VORGABE_KATALOG.findIndex((k) => k.id === 'lageplan');
    await klick(knopf('Dokument entfernen', zeile('Lageplan')));
    await klick(knopf('Entfernen', dialog()));
    expect(katalogEintrag('lageplan')).toBeUndefined();
    expect(useAntrag.getState().vorlagen.some((v) => v.dokumente.includes('lageplan'))).toBe(false);
    // der Fokus steht auf dem Dokument, das nun an seiner Stelle steht
    expect(document.activeElement).toBe(zeile(VORGABE_KATALOG[i + 1].titel).querySelector('.es-dok-knopf'));
  });

  it('ein Dokument ohne Vorlage entfernen schreibt die Vorlagen nicht; das letzte entfernen zeigt den Leerzustand', async () => {
    useAntrag.setState({ katalog: [{ id: 'x1', titel: 'Eigenes', art: 'extern', vorgewaehlt: false }] });
    await zeige();
    const vorher = useAntrag.getState().vorlagen;
    await oeffnen('Eigenes');
    await klick(knopf('Dokument entfernen', zeile('Eigenes')));
    await klick(knopf('Entfernen', document.querySelector('.modal.rf')!));
    expect(useAntrag.getState().vorlagen).toBe(vorher);
    expect(document.querySelector('.es-dok-liste')).toBeNull();
    expect(document.querySelector('.es-dok-leer')!.textContent).toContain('Noch keine Dokumente');
    expect(document.activeElement).toBe(knopf('Dokument hinzufügen'));
    // mit gewählter Vorlage kein „0 von 0 Dokumenten …“
    waehlen(vorlageWahl(), 'baua');
    await warte();
    expect(document.querySelector('.es-dok-kopf [role="status"]')!.textContent).toBe('Noch keine Dokumente zum Ankreuzen.');
  });

  it('„Vorgabe wiederherstellen“ nur bei Abweichung und mit Rückfrage', async () => {
    const host = await zeige();
    const karte = () => [...host.querySelectorAll('.es-karte')].find((k) => k.querySelector('h3')!.textContent === 'Antragsdokumente')!;
    expect(knopf('Vorgabe wiederherstellen', karte())).toBeUndefined();
    await oeffnen('Bauantrag');
    eingabe(feld(zeile('Bauantrag'), 'Bezeichnung')!, 'Eigener Titel');
    await warte();
    // Gegenprobe: „Abbrechen“ behält die Änderung
    await klick(knopf('Vorgabe wiederherstellen', karte()));
    await klick(knopf('Abbrechen', document.querySelector('.modal.rf')!));
    expect(katalogEintrag('bauantrag')!.titel).toBe('Eigener Titel');
    await klick(knopf('Vorgabe wiederherstellen', karte()));
    await klick(knopf('Zurücksetzen', document.querySelector('.modal.rf')!));
    expect(useAntrag.getState().katalog).toEqual(VORGABE_KATALOG);
  });

  it('„Vorgabe wiederherstellen“ der Antragsdokumente lässt auch abgeleitete Vorlagen, wie sie sind', async () => {
    // nie gespeicherte Vorlagen: „Bauantrag“ aus den vorgewählten Dokumenten des Katalogs abgeleitet – mit einem eigenen
    const katalog = [...structuredClone(VORGABE_KATALOG), { id: 'x1', titel: 'Eigenes', art: 'extern' as const, vorgewaehlt: true }];
    useAntrag.setState({ katalog, vorlagen: vorlagenAus(null, katalog) });
    const host = await zeige();
    const karte = [...host.querySelectorAll('.es-karte')].find((k) => k.querySelector('h3')!.textContent === 'Antragsdokumente')!;
    await klick(knopf('Vorgabe wiederherstellen', karte));
    await klick(knopf('Zurücksetzen', document.querySelector('.modal.rf')!));
    expect(useAntrag.getState().katalog).toEqual(VORGABE_KATALOG);
    expect(vorlage('baua').dokumente).toContain('x1');
    expect(JSON.parse(localStorage.getItem('formulare:vorlagen')!).find((v: { id: string }) => v.id === 'baua').dokumente).toContain('x1');
  });

  it('„Vorgabe wiederherstellen“ der Antragsdokumente schreibt Vorlagen, die ohnehin so abgeleitet würden, nicht fest', async () => {
    const host = await zeige();
    const karte = [...host.querySelectorAll('.es-karte')].find((k) => k.querySelector('h3')!.textContent === 'Antragsdokumente')!;
    await oeffnen('Bauantrag');
    eingabe(feld(zeile('Bauantrag'), 'Bezeichnung')!, 'Eigener Titel');
    await warte();
    await klick(knopf('Vorgabe wiederherstellen', karte));
    await klick(knopf('Zurücksetzen', document.querySelector('.modal.rf')!));
    expect(useAntrag.getState().katalog).toEqual(VORGABE_KATALOG);
    expect(localStorage.getItem('formulare:vorlagen')).toBeNull();
  });

  it('„Vorgabe wiederherstellen“ der Antragsvorlagen: nur bei Abweichung, „Abbrechen“ behält, „Zurücksetzen“ setzt zurück', async () => {
    const host = await zeige();
    const karte = () => [...host.querySelectorAll('.es-karte')].find((k) => k.querySelector('h3')!.textContent === 'Antragsvorlagen')!;
    expect(knopf('Vorgabe wiederherstellen', karte())).toBeUndefined();
    const name = [...karte().querySelectorAll<HTMLInputElement>('input[aria-label="Name der Vorlage"]')].find((x) => x.value === 'Bauantrag')!;
    eingabe(name, 'Bauantrag (eigen)');
    await warte();
    expect(vorlage('baua').name).toBe('Bauantrag (eigen)');
    await klick(knopf('Vorgabe wiederherstellen', karte()));
    expect(document.querySelector('.modal.rf')!.textContent).toContain('Antragsvorlagen auf die Vorgabe zurücksetzen?');
    await klick(knopf('Abbrechen', document.querySelector('.modal.rf')!));
    expect(vorlage('baua').name).toBe('Bauantrag (eigen)');
    await klick(knopf('Vorgabe wiederherstellen', karte()));
    await klick(knopf('Zurücksetzen', document.querySelector('.modal.rf')!));
    expect(useAntrag.getState().vorlagen).toEqual(vorlagenAus(null, useAntrag.getState().katalog));
    expect(localStorage.getItem('formulare:vorlagen')).toBeNull();
    expect(knopf('Vorgabe wiederherstellen', karte())).toBeUndefined();
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
    const gruppe = zeile('Bauantrag').querySelector<HTMLElement>('[role="group"][aria-labelledby]')!;
    expect(document.getElementById(gruppe.getAttribute('aria-labelledby')!)!.textContent).toBe('Erforderlich');
    expect(gruppe.querySelector('.bd-satz')!.textContent).toMatch(/^Erforderlich, wenn .*Gebäudeklasse/);
  });
});
