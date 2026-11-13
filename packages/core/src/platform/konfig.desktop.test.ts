// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attrappe, BASIS, installieren, KOPIE, legeAn, lies, NAS } from '../__fixtures__/konfigAttrappe';

/**
 * Speicherort der Einstellungen in der Desktop-App: Einzelplatz und Netzwerkinstallation, Umzug mit Rückfrage,
 * Notbetrieb ohne Netzlaufwerk, mehrere Rechner. Die Tauri-Befehle laufen gegen ein Dateisystem im Speicher.
 */

const fs = attrappe.dateien;

const laden = () => import('./konfig');

beforeEach(() => {
  // frische Module je Test (der Ort wird je Sitzung zwischengespeichert)
  vi.resetModules();
  installieren();
  localStorage.clear();
});

describe('Zeiger auf den Konfigurationsordner', () => {
  it('neue Form mit Modus; ältere Fassungen kennen nur „ordner“ (gesetzt = Netzwerkinstallation)', async () => {
    const { zeigerAus } = await laden();
    expect(zeigerAus(null)).toEqual({ modus: 'einzelplatz', ordner: '', netzordner: '' });
    expect(zeigerAus({ ordner: '' })).toEqual({ modus: 'einzelplatz', ordner: '', netzordner: '' });
    expect(zeigerAus({ ordner: ' \\\\nas\\konfig ' })).toEqual({ modus: 'netzwerk', ordner: '\\\\nas\\konfig', netzordner: '\\\\nas\\konfig' });
    expect(zeigerAus({ modus: 'netzwerk', ordner: NAS })).toEqual({ modus: 'netzwerk', ordner: NAS, netzordner: NAS });
    // Einzelplatz merkt sich den letzten Netzordner als Vorschlag
    expect(zeigerAus({ modus: 'einzelplatz', ordner: '', netzordner: NAS })).toEqual({ modus: 'einzelplatz', ordner: '', netzordner: NAS });
    // Netzwerkinstallation ohne Ordner gilt nicht
    expect(zeigerAus({ modus: 'netzwerk', ordner: '' }).modus).toBe('einzelplatz');
  });
});

describe('Einzelplatz', () => {
  it('ohne Wahl liegen gemeinsame und lokale Bereiche im lokalen Ordner; keine Prüfung des Netzlaufwerks', async () => {
    const k = await laden();
    expect(await k.konfigOrt()).toMatchObject({ ordner: BASIS, basis: BASIS, modus: 'einzelplatz', notbetrieb: false, gewaehlt: false });
    await k.allgemeinAendern({ buero: 'Muster Architekten' });
    await k.zuletztMerken('/p/2026-001', 'ATLAS', 1);
    expect(lies(`${BASIS}/allgemein.json`)).toEqual({ buero: 'Muster Architekten' });
    expect(lies(`${BASIS}/zuletzt.json`)).toEqual({ eintraege: [{ pfad: '/p/2026-001', zeit: 1, app: 'ATLAS' }] });
    expect(attrappe.aufrufe).not.toContain('ordner_erreichbar');
    expect([...fs.keys()].some((p) => p.startsWith(KOPIE))).toBe(false);
  });
});

describe('Wechsel zur Netzwerkinstallation', () => {
  it('leerer Netzordner: alle gemeinsamen Bereiche ziehen mit, die lokalen nicht; danach gilt das Netzlaufwerk', async () => {
    legeAn(`${BASIS}/allgemein.json`, { buero: 'A' });
    legeAn(`${BASIS}/projektordner.json`, { struktur: { name: 'Büro' } });
    legeAn(`${BASIS}/ava-texte.json`, [{ text: 'Baustelleneinrichtung' }]);
    legeAn(`${BASIS}/zuletzt.json`, { eintraege: [] });
    legeAn(`${BASIS}/angeheftet.json`, { pfade: ['/p/1'] });
    fs.set(`${NAS}/.platzhalter`, '');
    const k = await laden();
    expect(await k.konfigZielPruefen({ modus: 'netzwerk', ordner: NAS })).toEqual({ ordner: NAS, erreichbar: true, gleich: false, vorhanden: [] });
    const r = await k.konfigOrtWechseln({ modus: 'netzwerk', ordner: NAS }, 'uebernehmen');
    expect(r).toEqual({ kopiert: ['allgemein', 'ava-texte', 'projektordner'], gesichert: [] });
    expect(lies(`${NAS}/allgemein.json`)).toEqual({ buero: 'A' });
    expect(fs.has(`${NAS}/zuletzt.json`)).toBe(false);
    expect(fs.has(`${NAS}/angeheftet.json`)).toBe(false);
    expect(fs.has(`${NAS}/konfig.json`)).toBe(false);
    // der Zeiger liegt lokal; die Quelle bleibt unverändert
    expect(lies(`${BASIS}/konfig.json`)).toEqual({ modus: 'netzwerk', ordner: NAS });
    expect(lies(`${BASIS}/allgemein.json`)).toEqual({ buero: 'A' });
    expect(await k.konfigOrt()).toMatchObject({ ordner: NAS, modus: 'netzwerk', notbetrieb: false, gewaehlt: true });
    // ab jetzt wird auf dem Netzlaufwerk geschrieben, lokal Benutzereigenes weiter lokal
    await k.allgemeinAendern({ fotoordner: '10 Fotos' });
    expect(lies(`${NAS}/allgemein.json`)).toEqual({ buero: 'A', fotoordner: '10 Fotos' });
    expect(lies(`${BASIS}/allgemein.json`)).toEqual({ buero: 'A' });
    expect(await k.anheftenUmschalten('/p/2')).toEqual(['/p/1', '/p/2']);
    // die lokale Kopie für den Notbetrieb ist gefüllt
    await vi.waitFor(() => expect(lies(`${KOPIE}/allgemein.json`)).toEqual({ buero: 'A', fotoordner: '10 Fotos' }));
    await vi.waitFor(() => expect(lies(`${KOPIE}/ava-texte.json`)).toEqual([{ text: 'Baustelleneinrichtung' }]));
  });

  it('Netzordner mit vorhandenen Einstellungen: „übernehmen“ lässt sie gelten und ergänzt nur Fehlendes', async () => {
    legeAn(`${BASIS}/allgemein.json`, { buero: 'Hier' });
    legeAn(`${BASIS}/kataster.json`, { zielpfad: 'Lagepläne' });
    legeAn(`${NAS}/allgemein.json`, { buero: 'Büro' });
    const k = await laden();
    expect((await k.konfigZielPruefen({ modus: 'netzwerk', ordner: NAS }))?.vorhanden).toEqual(['allgemein']);
    expect(await k.konfigOrtWechseln({ modus: 'netzwerk', ordner: NAS }, 'uebernehmen')).toEqual({ kopiert: ['kataster'], gesichert: [] });
    expect(lies(`${NAS}/allgemein.json`)).toEqual({ buero: 'Büro' });
    expect(lies(`${NAS}/kataster.json`)).toEqual({ zielpfad: 'Lagepläne' });
    expect((await k.allgemeinLaden()).buero).toBe('Büro');
  });

  it('„ersetzen“ überschreibt nach einer Sicherung; was nur am Ziel liegt, bleibt', async () => {
    legeAn(`${BASIS}/allgemein.json`, { buero: 'Hier' });
    legeAn(`${NAS}/allgemein.json`, { buero: 'Büro' });
    legeAn(`${NAS}/raumkatalog.json`, [{ name: 'Büro' }]);
    const k = await laden();
    expect(await k.konfigOrtWechseln({ modus: 'netzwerk', ordner: NAS }, 'ersetzen')).toEqual({ kopiert: ['allgemein'], gesichert: ['allgemein'] });
    expect(lies(`${NAS}/allgemein.json`)).toEqual({ buero: 'Hier' });
    const sicherung = [...fs.keys()].find((p) => p.startsWith(`${NAS}/allgemein.json.vor-umzug-`));
    expect(sicherung).toMatch(/vor-umzug-\d{4}-\d\d-\d\d-\d{4}$/);
    expect(lies(sicherung!)).toEqual({ buero: 'Büro' });
    expect(lies(`${NAS}/raumkatalog.json`)).toEqual([{ name: 'Büro' }]);
    // Sicherungen zählen nicht als Bereich
    expect((await k.konfigZielPruefen({ modus: 'einzelplatz' }))?.vorhanden).toEqual(['allgemein']);
  });

  it('nicht erreichbares Ziel: nichts geändert; lokaler Ordner als Netzordner abgelehnt', async () => {
    legeAn(`${BASIS}/allgemein.json`, { buero: 'Hier' });
    attrappe.nasErreichbar = false;
    const k = await laden();
    expect(await k.konfigZielPruefen({ modus: 'netzwerk', ordner: NAS })).toEqual({ ordner: NAS, erreichbar: false, gleich: false, vorhanden: [] });
    await expect(k.konfigOrtWechseln({ modus: 'netzwerk', ordner: NAS }, 'uebernehmen')).rejects.toThrow('nicht erreichbar');
    expect(fs.has(`${BASIS}/konfig.json`)).toBe(false);
    await expect(k.konfigZielPruefen({ modus: 'netzwerk', ordner: `${BASIS}/` })).rejects.toThrow('Einzelplatz');
    await expect(k.konfigZielPruefen({ modus: 'netzwerk', ordner: ' ' })).rejects.toThrow('Ordner');
  });

  it('zurück zum Einzelplatz: Netzordner bleibt als Vorschlag, gemeinsame Bereiche kommen nach Rückfrage zurück', async () => {
    legeAn(`${BASIS}/konfig.json`, { ordner: NAS });
    legeAn(`${BASIS}/allgemein.json`, { buero: 'Alt' });
    legeAn(`${NAS}/allgemein.json`, { buero: 'Büro' });
    const k = await laden();
    expect(await k.konfigOrt()).toMatchObject({ modus: 'netzwerk', ordner: NAS });
    expect((await k.konfigZielPruefen({ modus: 'einzelplatz' }))?.vorhanden).toEqual(['allgemein']);
    await k.konfigOrtWechseln({ modus: 'einzelplatz' }, 'ersetzen');
    expect(lies(`${BASIS}/konfig.json`)).toEqual({ modus: 'einzelplatz', ordner: '', netzordner: NAS });
    expect(await k.konfigOrt()).toMatchObject({ modus: 'einzelplatz', ordner: BASIS, netzordner: NAS });
    expect((await k.allgemeinLaden()).buero).toBe('Büro');
  });

  it('vor dem Wechsel wird Ausstehendes gespeichert; andere Fenster erfahren den Wechsel', async () => {
    fs.set(`${NAS}/.platzhalter`, '');
    const k = await laden();
    const gesehen: (string | undefined)[] = [];
    k.konfigOrtBeobachten((o) => gesehen.push(o?.modus));
    const ab = k.konfigVorWechsel(() => k.konfigSchreiben('projektordner', { struktur: { name: 'noch nicht gespeichert' } }));
    await k.konfigOrtWechseln({ modus: 'netzwerk', ordner: NAS }, 'uebernehmen');
    ab();
    expect(lies(`${NAS}/projektordner.json`)).toEqual({ struktur: { name: 'noch nicht gespeichert' } });
    expect(gesehen.at(-1)).toBe('netzwerk');
    expect(localStorage.getItem('arch-tools:konfig-ort')).not.toBeNull();
  });
});

describe('Notbetrieb ohne Netzlaufwerk', () => {
  it('beim Start nicht erreichbar: lokale Kopie lesen, gemeinsame Bereiche nicht speichern, lokale schon', async () => {
    legeAn(`${BASIS}/konfig.json`, { modus: 'netzwerk', ordner: NAS });
    legeAn(`${KOPIE}/allgemein.json`, { buero: 'Büro', projekte: ['/p'] });
    attrappe.nasErreichbar = false;
    const k = await laden();
    expect(await k.konfigOrt()).toMatchObject({ modus: 'netzwerk', ordner: NAS, notbetrieb: true });
    expect(await k.allgemeinLaden()).toMatchObject({ buero: 'Büro', projekte: ['/p'] });
    await expect(k.allgemeinAendern({ buero: 'Neu' })).rejects.toBeInstanceOf(k.KonfigNichtErreichbar);
    await expect(k.konfigSchreiben('formulare', { a: 1 })).rejects.toThrow('nicht erreichbar');
    // die Kopie bleibt, wie sie war – nichts, was später andere überschreiben könnte
    expect(lies(`${KOPIE}/allgemein.json`)).toEqual({ buero: 'Büro', projekte: ['/p'] });
    expect(fs.has(`${KOPIE}/formulare.json`)).toBe(false);
    // Benutzereigenes geht weiter
    expect(await k.anheftenUmschalten('/p/1')).toEqual(['/p/1']);
    // wieder erreichbar
    attrappe.nasErreichbar = true;
    legeAn(`${NAS}/allgemein.json`, { buero: 'Büro', projekte: ['/p', '/q'] });
    expect(await k.konfigOrtNeuPruefen()).toMatchObject({ notbetrieb: false });
    expect((await k.allgemeinLaden()).projekte).toEqual(['/p', '/q']);
    await k.allgemeinAendern({ buero: 'Neu' });
    expect(lies(`${NAS}/allgemein.json`)).toEqual({ buero: 'Neu', projekte: ['/p', '/q'] });
  });

  it('Gegenprobe: erreichbares Netzlaufwerk ist kein Notbetrieb und liest nicht die Kopie', async () => {
    legeAn(`${BASIS}/konfig.json`, { modus: 'netzwerk', ordner: NAS });
    legeAn(`${KOPIE}/allgemein.json`, { buero: 'Alte Kopie' });
    legeAn(`${NAS}/allgemein.json`, { buero: 'Büro' });
    const k = await laden();
    expect((await k.konfigOrt())?.notbetrieb).toBe(false);
    expect((await k.allgemeinLaden()).buero).toBe('Büro');
    await vi.waitFor(() => expect(lies(`${KOPIE}/allgemein.json`)).toEqual({ buero: 'Büro' }));
  });

  it('fällt während der Arbeit weg: Umschalten auf die Kopie mit Meldung an die Oberfläche', async () => {
    legeAn(`${BASIS}/konfig.json`, { modus: 'netzwerk', ordner: NAS });
    legeAn(`${NAS}/allgemein.json`, { buero: 'Büro' });
    const k = await laden();
    expect((await k.allgemeinLaden()).buero).toBe('Büro');
    await vi.waitFor(() => expect(lies(`${KOPIE}/allgemein.json`)).toEqual({ buero: 'Büro' }));
    const zustaende: boolean[] = [];
    k.konfigOrtBeobachten((o) => zustaende.push(!!o?.notbetrieb));
    attrappe.nasErreichbar = false;
    expect((await k.allgemeinLaden()).buero).toBe('Büro');
    expect(zustaende).toEqual([true]);
    await expect(k.allgemeinAendern({ buero: 'X' })).rejects.toBeInstanceOf(k.KonfigNichtErreichbar);
  });

  it('Schreiben scheitert, weil das Netzlaufwerk gerade wegfällt: klare Meldung statt technischem Fehler', async () => {
    legeAn(`${BASIS}/konfig.json`, { modus: 'netzwerk', ordner: NAS });
    const k = await laden();
    await k.konfigOrt();
    attrappe.nasErreichbar = false;
    await expect(k.konfigSchreiben('ava', { a: 1 })).rejects.toBeInstanceOf(k.KonfigNichtErreichbar);
    expect((await k.konfigOrt())?.notbetrieb).toBe(true);
  });

  it('Wechsel zum Einzelplatz im Notbetrieb nimmt die lokale Kopie mit', async () => {
    legeAn(`${BASIS}/konfig.json`, { modus: 'netzwerk', ordner: NAS });
    legeAn(`${KOPIE}/allgemein.json`, { buero: 'Büro' });
    attrappe.nasErreichbar = false;
    const k = await laden();
    expect(await k.konfigOrtWechseln({ modus: 'einzelplatz' }, 'uebernehmen')).toEqual({ kopiert: ['allgemein'], gesichert: [] });
    expect(await k.konfigOrt()).toMatchObject({ modus: 'einzelplatz', notbetrieb: false });
    await k.allgemeinAendern({ fotoordner: 'Fotos' });
    expect(lies(`${BASIS}/allgemein.json`)).toMatchObject({ buero: 'Büro', fotoordner: 'Fotos' });
  });
});

describe('Mehrere Rechner schreiben gleichzeitig', () => {
  it('Änderung eines anderen Rechners zwischen Lesen und Schreiben geht nicht verloren', async () => {
    legeAn(`${BASIS}/konfig.json`, { modus: 'netzwerk', ordner: NAS });
    legeAn(`${NAS}/allgemein.json`, { buero: 'Büro' });
    const k = await laden();
    let einmal = true;
    attrappe.dazwischen = (pfad) => {
      if (!einmal || !pfad.endsWith('allgemein.json')) return;
      einmal = false;
      legeAn(pfad, { buero: 'Büro', mitarbeiter: ['TP'] });
    };
    const aendern = vi.fn((roh: unknown) => ({ ...(roh as object), fotoordner: '10 Fotos' }));
    await k.konfigAendern('allgemein', aendern);
    expect(lies(`${NAS}/allgemein.json`)).toEqual({ buero: 'Büro', mitarbeiter: ['TP'], fotoordner: '10 Fotos' });
    expect(aendern).toHaveBeenCalledTimes(2);
  });

  it('Gegenprobe: ohne fremde Änderung genügt ein Durchgang', async () => {
    legeAn(`${NAS}/allgemein.json`, { buero: 'Büro' });
    legeAn(`${BASIS}/konfig.json`, { modus: 'netzwerk', ordner: NAS });
    const k = await laden();
    const aendern = vi.fn((roh: unknown) => ({ ...(roh as object), fotoordner: 'F' }));
    await k.konfigAendern('allgemein', aendern);
    expect(aendern).toHaveBeenCalledTimes(1);
  });

  it('ändern andere ständig dazwischen: nach einigen Versuchen eine klare Meldung, nichts überschrieben', async () => {
    legeAn(`${BASIS}/konfig.json`, { modus: 'netzwerk', ordner: NAS });
    let n = 0;
    attrappe.dazwischen = (pfad) => legeAn(pfad, { anderer: ++n });
    const k = await laden();
    await expect(k.allgemeinAendern({ buero: 'X' })).rejects.toThrow('mehreren Rechnern');
    expect(lies(`${NAS}/allgemein.json`)).toEqual({ anderer: n });
  });

  it('Schreiben mit Konfliktprüfung: Änderung zwischen Lesen und Schreiben wird erkannt', async () => {
    legeAn(`${BASIS}/konfig.json`, { modus: 'netzwerk', ordner: NAS });
    legeAn(`${NAS}/projektordner.json`, { struktur: { name: 'A' } });
    const k = await laden();
    const stand = k.konfigStand(await k.konfigLesen('projektordner'));
    attrappe.dazwischen = (pfad) => legeAn(pfad, { struktur: { name: 'B' } });
    expect(await k.konfigSchreibenWennUnveraendert('projektordner', { struktur: { name: 'C' } }, stand)).toEqual({ ok: false, aktuell: { struktur: { name: 'B' } } });
    attrappe.dazwischen = null;
    expect((await k.konfigSchreibenWennUnveraendert('projektordner', { struktur: { name: 'C' } }, k.konfigStand({ struktur: { name: 'B' } }))).ok).toBe(true);
    expect(lies(`${NAS}/projektordner.json`)).toEqual({ struktur: { name: 'C' } });
  });
});

describe('Bezeichnung der Bereiche', () => {
  it('bekannte Bereiche mit App-Namen, unbekannte als Dateiname', async () => {
    const { bereichName } = await laden();
    expect(bereichName('projektordner')).toBe('ATLAS: Ordnerstruktur und Vorlagen');
    expect(bereichName('ava-texte')).toBe('FABRIO: Textbibliothek');
    expect(bereichName('neu')).toBe('neu.json');
  });
});
