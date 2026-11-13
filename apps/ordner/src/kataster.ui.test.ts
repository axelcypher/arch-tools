// @vitest-environment happy-dom
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readProjectFile, writeArchive } from '@core/archive';
import { createProject, leereMeta } from '@core/model';
import { RueckfrageHost } from '@core/ui/Rueckfrage';
import { VORGABE_KATASTER, vorlageLesen } from './kataster/kataster';
import { useKataster } from './kataster/katasterStore';
import { vorlageQgs, vorlageQgz } from './__fixtures__/qgisVorlage';
import { KatasterDialog } from './components/KatasterDialog';
import { KatasterEinstellungen } from './components/KatasterEinstellungen';
import { SpeicherProjektordner } from '@core/platform/projektordner';
import { SpeicherQgis } from './kataster/qgis';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORDNER = 'Z:/Projekte/BS9 Musterstraße 9';
const OAP = `${ORDNER}/Planung/Berechnungen/BS9 Flächen.oap`;
const VORLAGE = 'C:/Vorlagen/Kataster.qgz';
const jjmmtt = (d = new Date()) => `${String(d.getFullYear() % 100).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

let fs: SpeicherProjektordner;
let qgis: SpeicherQgis;
let root: ReturnType<typeof createRoot> | null = null;

function oap(mitKoordinaten = true) {
  const p = createProject('BS9 Flächen');
  p.meta = {
    ...leereMeta(),
    projektcode: 'MUS',
    vorhaben: 'Neubau EFH',
    adresse: { strasse: 'Prinzipalmarkt 10', plz: '48143', ort: 'Münster' },
    ...(mitKoordinaten ? { koordinaten: { epsg: 25832, ost: 405577.31, nord: 5757743.76, lat: 51.9625, lon: 7.6282, quelle: 'Nominatim', adresse: 'Prinzipalmarkt 10, 48143 Münster' } } : {}),
  } as never;
  return writeArchive(p);
}

beforeEach(async () => {
  localStorage.clear();
  fs = new SpeicherProjektordner();
  fs.setze(OAP, oap());
  qgis = new SpeicherQgis(fs);
  qgis.dateien.set(VORLAGE, vorlageQgz());
  qgis.programme = ['C:/Program Files/QGIS 3.40.5/bin/qgis_process-qgis-ltr.bat'];
  useKataster.setState({ fs, qgis, einstellungen: structuredClone(VORGABE_KATASTER), programm: '', vorlageInfo: null, projekt: null, laeuft: false, ausgang: null });
  await useKataster.getState().aendern({ ...useKataster.getState().einstellungen, vorlage: VORLAGE, ziel: 'pfad', zielpfad: 'Kataster' });
  useKataster.getState().programmSetzen('C:/Program Files/QGIS 3.40.5/bin/qgis_process-qgis-ltr.bat');
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

const warte = () => act(async () => new Promise((r) => setTimeout(r, 0)));
const knopf = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement;
const klick = async (el: HTMLElement) => {
  act(() => el.click());
  for (let i = 0; i < 4; i++) await warte();
};
async function zeige(el: React.ReactElement) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(createElement(Fragment, null, el, createElement(RueckfrageHost))));
  for (let i = 0; i < 4; i++) await warte();
  return host;
}
const plaeneInOap = () => readProjectFile(fs.eintraege.get(OAP)!).dateien?.filter((d) => d.art === 'qgis') ?? [];

describe('Katasterpläne exportieren', () => {
  it('übernimmt die Vorlage in die Projektdatei, füllt die Planköpfe und legt die Pläne ab', async () => {
    const host = await zeige(createElement(KatasterDialog, { basis: ORDNER, name: 'BS9 Musterstraße 9', onClose: () => undefined }));
    expect(host.textContent).toContain('beim Export wird Kataster.qgz übernommen');
    expect(host.textContent).toContain('E 405.577,31');
    await klick(knopf(host, '4 Pläne exportieren'));

    // Vorlage liegt jetzt in der .oap
    expect(plaeneInOap()).toEqual([expect.objectContaining({ name: 'Kataster.qgz', art: 'qgis' })]);
    expect(host.textContent).toContain('Kataster.qgz übernommen am');

    const a = qgis.aufrufe[0];
    expect(a.programm).toContain('qgis_process-qgis-ltr.bat');
    expect(a.skript).toContain('class KatasterExport');
    expect(a.vorlageName).toBe('Kataster.qgz');
    expect(vorlageLesen(a.vorlage).layouts).toHaveLength(2);
    const auftrag = a.auftrag as { variablen: Record<string, string>; koordinaten: unknown; plaene: { id: string; ausgabe: string }[] };
    expect(auftrag.variablen).toEqual({ project_title: 'Neubau EFH', project_identifier: 'MUS', project_street: 'Prinzipalmarkt 10', project_city: 'Münster', project_zip_code: '48143' });
    expect(auftrag.koordinaten).toEqual({ ost: 405577.31, nord: 5757743.76, epsg: 25832 });
    const d = jjmmtt();
    // ohne aktiven Antrag in der Projektdatei entfällt {Art}
    const namen = ['Katasterplan A4.pdf', 'Katasterplan A3.pdf', 'Schwarzplan.dxf', 'Katasterplan.dxf'].map((n) => `Kataster/MUS ${d} ${n}`);
    expect(auftrag.plaene.map((p) => p.ausgabe)).toEqual(namen.map((n) => `${ORDNER}/${n}`));
    for (const n of namen) expect(fs.eintraege.has(`${ORDNER}/${n}`)).toBe(true);
    expect(host.querySelectorAll('.ka-ergebnis.ok')).toHaveLength(4);
    // erledigt mit gezeichnetem Häkchen (Symbol statt „✓“)
    expect([...host.querySelectorAll('.ka-ergebnis.ok')].map((e) => e.textContent?.trim())).toContain(`Kataster/MUS ${d} Schwarzplan.dxf`);
    expect(host.querySelectorAll('.ka-ergebnis.ok svg.symbol')).toHaveLength(4);

    // noch einmal: vorhandene Dateien – überspringen heißt hier: nichts zu tun
    await klick(knopf(host, '4 Pläne exportieren'));
    expect(document.body.textContent).toContain('4 Dateien gibt es schon');
    await klick(knopf(document.body, 'Vorhandene überspringen'));
    expect(qgis.aufrufe).toHaveLength(1);

    // mit neuem Namen: nichts wird überschrieben, die neuen heißen „… (2)“
    await klick(knopf(host, '4 Pläne exportieren'));
    await klick(knopf(document.body, 'Mit neuem Namen ablegen'));
    expect(qgis.aufrufe).toHaveLength(2);
    expect(fs.eintraege.has(`${ORDNER}/Kataster/MUS ${d} Schwarzplan (2).dxf`)).toBe(true);
    // die Vorlage der Projektdatei wird weiter verwendet (nicht erneut übernommen)
    expect(plaeneInOap()).toHaveLength(1);
  });

  it('„Vorlage aktualisieren“ ersetzt die Vorlage der Projektdatei durch die globale', async () => {
    const host = await zeige(createElement(KatasterDialog, { basis: ORDNER, name: 'BS9 Musterstraße 9', onClose: () => undefined }));
    await klick(knopf(host, 'Vorlage übernehmen'));
    expect(vorlageLesen(plaeneInOap()[0].daten).layouts.map((l) => l.name)).toEqual(['Katasterauszug A4', 'Katasterauszug A3']);
    qgis.dateien.set(VORLAGE, vorlageQgz(vorlageQgs(['Katasterauszug A4', 'Katasterauszug A3', 'Lageplan A2'])));
    await klick(knopf(host, 'Vorlage aktualisieren'));
    expect(plaeneInOap()).toHaveLength(1);
    expect(vorlageLesen(plaeneInOap()[0].daten).layouts.map((l) => l.name)).toContain('Lageplan A2');
    expect(host.querySelector('.ka-ok')?.textContent?.trim()).toBe('übernommen');
    expect(host.querySelector('.ka-ok svg.symbol')).not.toBeNull();
  });

  it('Fehler je Plan aus QGIS; ohne Koordinaten kein Export', async () => {
    qgis.lauf = (a) => {
      const plaene = (a.auftrag as { plaene: { id: string; ausgabe: string }[] }).plaene;
      return {
        ok: ['a4'],
        ausgabe: plaene
          .map((p) => `ERGEBNIS ${JSON.stringify(p.id === 'a4' ? { id: p.id, ok: true, datei: p.ausgabe } : { id: p.id, ok: false, fehler: `${p.id}: Layer nicht erreichbar` })}`)
          .join('\n'),
      };
    };
    const host = await zeige(createElement(KatasterDialog, { basis: ORDNER, name: 'BS9 Musterstraße 9', onClose: () => undefined }));
    await klick(knopf(host, '4 Pläne exportieren'));
    expect(host.querySelectorAll('.ka-ergebnis.ok')).toHaveLength(1);
    const fehler = [...host.querySelectorAll('.ka-ergebnis.fehler')];
    expect(fehler.map((e) => e.textContent?.trim())).toContain('schwarzplan: Layer nicht erreichbar');
    expect(fehler.every((e) => e.querySelector('svg.symbol'))).toBe(true);

    // QGIS bricht ohne Ergebnis ab: Auszug der Fehlerausgabe
    qgis.lauf = () => ({ code: 1, ausgabe: '', fehler: 'Traceback …\nModuleNotFoundError: No module named qgis' });
    await klick(knopf(host, '4 Pläne exportieren'));
    expect(document.body.textContent).toContain('Eine Datei gibt es schon');
    await klick(knopf(document.body, 'Mit neuem Namen ablegen'));
    expect(host.querySelector('.ka-meldung')!.textContent).toContain('No module named qgis');

    act(() => root!.unmount());
    root = null;
    fs.setze(OAP, oap(false));
    const h2 = await zeige(createElement(KatasterDialog, { basis: ORDNER, name: 'BS9 Musterstraße 9', onClose: () => undefined }));
    expect(h2.textContent).toContain('Keine Koordinaten');
    expect(knopf(h2, 'Pläne exportieren').disabled).toBe(true);
  });
});

describe('Ablage im Ordner des aktiven Antrags', () => {
  it('nimmt den aktiven Antrag aus der Projektdatei (meta.antrag) – ohne ihn kein Export', async () => {
    const p = readProjectFile(fs.eintraege.get(OAP)!);
    p.meta.antrag = { name: 'BAUA 2' };
    fs.setze(OAP, writeArchive(p));
    await useKataster.getState().aendern({ ziel: 'antrag' });
    const host = await zeige(createElement(KatasterDialog, { basis: ORDNER, name: 'BS9', onClose: () => undefined }));
    expect(host.textContent).toContain('Ablage: TÖB/BAUA 2');
    await klick(knopf(host, '4 Pläne exportieren'));
    expect(fs.eintraege.has(`${ORDNER}/TÖB/BAUA 2/MUS BAUA ${jjmmtt()} Katasterplan A4.pdf`)).toBe(true);

    act(() => root!.unmount());
    root = null;
    delete p.meta.antrag;
    fs.setze(OAP, writeArchive(p));
    const h2 = await zeige(createElement(KatasterDialog, { basis: ORDNER, name: 'BS9', onClose: () => undefined }));
    expect(h2.textContent).toContain('Kein aktiver Antrag in der Projektdatei');
    expect(knopf(h2, 'Pläne exportieren').disabled).toBe(true);
  });

  it('säubert den Antragsnamen aus der Projektdatei: kein „/“ oder „..“ führt aus dem Antragsordner', async () => {
    const p = readProjectFile(fs.eintraege.get(OAP)!);
    await useKataster.getState().aendern({ ziel: 'antrag' });
    const ziel = async (name: string) => {
      p.meta.antrag = { name };
      fs.setze(OAP, writeArchive(p));
      await useKataster.getState().projektWaehlen(ORDNER, 'BS9');
      return useKataster.getState().zielOrdner();
    };
    expect(await ziel('BAUA 2/../../Fremd')).toBe('TÖB/BAUA 2 .. .. Fremd');
    expect(await ziel('..')).toBeNull();
    expect(await ziel('BAUA: 3?')).not.toMatch(/[:?]/);
    // Gegenprobe: ein sauberer Name bleibt, wie er ist
    expect(await ziel('BAUA 2')).toBe('TÖB/BAUA 2');
  });

  it('übernimmt die Einstellungen aus PERMIO (Formulare) beim ersten Laden', async () => {
    const { konfigAendern, konfigLesen } = await import('@core/platform/konfig');
    localStorage.clear();
    await konfigAendern('formulare', () => ({ kataster: { vorlage: 'C:/Alt/Kataster.qgz', ziel: 'pfad', zielpfad: 'Lagepläne', dateiname: '{Code} {Name}', plaene: [] } }));
    await useKataster.getState().laden();
    expect(useKataster.getState().einstellungen).toMatchObject({ vorlage: 'C:/Alt/Kataster.qgz', zielpfad: 'Lagepläne', dateiname: '{Code} {Name}' });
    expect(await konfigLesen('kataster')).toMatchObject({ zielpfad: 'Lagepläne' });
  });
});

describe('Einstellungen der Katasterpläne', () => {
  it('zeigt Layouts und Themen der Vorlage, sucht qgis_process, ändert Pläne', async () => {
    useKataster.getState().programmSetzen('');
    const host = await zeige(createElement(KatasterEinstellungen));
    expect(host.textContent).toContain('2 Layouts (Katasterauszug A4, Katasterauszug A3) · 2 Kartenthemen (Katasterplan, Schwarzplan)');
    // Ausschnitt aus Kartenobjekt und Maßstab
    expect(host.textContent).toContain('zeigt bei 1:1.000 einen Ausschnitt von 190 × 190 m');
    await klick(knopf(host, 'Suchen'));
    expect(useKataster.getState().programm).toBe('C:/Program Files/QGIS 3.40.5/bin/qgis_process-qgis-ltr.bat');
    expect(host.textContent).toContain('Gewählt');

    // Thema, das es nicht gibt → Hinweis; Plan entfernen und hinzufügen
    await act(() => useKataster.getState().planAendern('schwarzplan', { thema: 'Luftbild' }));
    await warte();
    expect(host.textContent).toContain('Kartenthema „Luftbild“ gibt es in der Vorlage nicht.');
    // Entfernen erst nach Rückfrage (die Pläne gelten für das ganze Büro)
    await klick(host.querySelector<HTMLButtonElement>('button[aria-label="Katasterplan entfernen"]')!);
    expect(document.body.textContent).toContain('„Katasterplan“ entfernen?');
    await klick(knopf(document.body.querySelector('.rueckfrage, [role="alertdialog"], .modal')!, 'Abbrechen'));
    expect(useKataster.getState().einstellungen.plaene).toHaveLength(4);
    await klick(host.querySelector<HTMLButtonElement>('button[aria-label="Katasterplan entfernen"]')!);
    await klick(knopf(document.body, 'Entfernen'));
    await klick(knopf(host, 'DXF'));
    expect(useKataster.getState().einstellungen.plaene.map((p) => p.name)).toEqual(['Katasterplan A4', 'Katasterplan A3', 'Schwarzplan', 'Neue DXF']);
    // gespeichert im gemeinsamen Konfigurationsbereich
    const roh = JSON.parse(Object.entries(localStorage).find(([k]) => k.includes('kataster') && String(localStorage.getItem(k)).includes('plaene'))![1] as string);
    expect(roh.plaene).toHaveLength(4);

    // „Vorgaben“ ersetzt alle Pläne – erst nach Rückfrage
    await klick(knopf(host, 'Vorgaben'));
    expect(document.body.textContent).toContain('Standardpläne wiederherstellen?');
    await klick(knopf(document.body.querySelector('.modal')!, 'Abbrechen'));
    expect(useKataster.getState().einstellungen.plaene.map((p) => p.name)).toContain('Neue DXF');
    await klick(knopf(host, 'Vorgaben'));
    await klick(knopf(document.body, 'Wiederherstellen'));
    expect(useKataster.getState().einstellungen.plaene.map((p) => p.name)).toEqual(['Katasterplan A4', 'Katasterplan A3', 'Schwarzplan', 'Katasterplan']);
  });

  it('Plankarte: Raster, DXF ohne Beschriftungsfeld, Vorwahl mit Namen, Platzhalter beim festen Ordner', async () => {
    const host = await zeige(createElement(KatasterEinstellungen));
    const karten = [...host.querySelectorAll('.ka-plan')];
    expect(karten.every((k) => k.querySelector('.es-raster'))).toBe(true);
    const beschriftung = (k: Element) => k.querySelector('input[aria-label="Beschriftung"]');
    expect(beschriftung(karten[0])).toBeTruthy();
    expect(beschriftung(karten[2])).toBeNull();
    expect(host.querySelector('input[type="checkbox"][aria-label="Schwarzplan im Export vorwählen"]')).toBeTruthy();
    // die Platzhalter des festen Ordners gehören zur ersten Option
    expect(host.querySelector('.ex-ziel')!.querySelector('.ka-ziel-platzhalter')).toBeTruthy();
    expect(host.textContent).toContain('kein amtlicher Auszug aus dem Liegenschaftskataster');
  });
});

describe('Export: Sperre und Dateinamen', () => {
  it('ein Doppelklick startet nur einen Lauf', async () => {
    await useKataster.getState().projektWaehlen(ORDNER, 'BS9');
    const ids = useKataster.getState().einstellungen.plaene.map((p) => p.id);
    const [a, b] = await Promise.all([useKataster.getState().exportieren(ids), useKataster.getState().exportieren(ids)]);
    expect(qgis.aufrufe).toHaveLength(1);
    expect(a).toHaveLength(4);
    expect(b).toEqual([]);
    expect(useKataster.getState().laeuft).toBe(false);
  });

  it('gleiche Dateinamen im Lauf werden vorher gemeldet', async () => {
    await useKataster.getState().aendern({ dateiname: '{PROJEKT_KUERZEL} {DATUM}' });
    await useKataster.getState().projektWaehlen(ORDNER, 'BS9');
    expect(await useKataster.getState().exportieren(['a4', 'a3', 'schwarzplan'])).toEqual([]);
    expect(qgis.aufrufe).toHaveLength(0);
    expect(useKataster.getState().ausgang?.meldung).toContain(`Mehrere Pläne bekämen denselben Dateinamen: „MUS ${jjmmtt()}.pdf“ (Katasterplan A4, Katasterplan A3)`);
    // Gegenprobe: mit nur einem PDF geht es
    expect(await useKataster.getState().exportieren(['a4', 'schwarzplan'])).toHaveLength(2);
  });

  it('„Mit neuem Namen“ vergibt keinen Namen, den ein anderer Plan desselben Laufs bekommt', async () => {
    await useKataster.getState().aendern({ dateiname: '{Name}' });
    await useKataster.getState().planAendern('a3', { name: 'Katasterplan A4 (2)' });
    fs.setze(`${ORDNER}/Kataster/Katasterplan A4.pdf`, new Uint8Array([1]));
    const host = await zeige(createElement(KatasterDialog, { basis: ORDNER, name: 'BS9', onClose: () => undefined }));
    await klick(knopf(host, '4 Pläne exportieren'));
    await klick(knopf(document.body, 'Mit neuem Namen ablegen'));
    const ausgaben = (qgis.aufrufe[0].auftrag as { plaene: { ausgabe: string }[] }).plaene.map((p) => p.ausgabe.split('/').pop());
    expect(ausgaben).toEqual(['Katasterplan A4 (3).pdf', 'Katasterplan A4 (2).pdf', 'Schwarzplan.dxf', 'Katasterplan.dxf']);
  });

  it('Beschriftung mit Datum ersetzt im Auftrag; Dialog: erster Fokus auf dem ersten Plan, Link zu den Einstellungen', async () => {
    let einstellungen = 0;
    useKataster.getState().programmSetzen('');
    const host = await zeige(createElement(KatasterDialog, { basis: ORDNER, name: 'BS9', onClose: () => undefined, onEinstellungen: () => einstellungen++ }));
    expect(document.activeElement).toBe(host.querySelector('.ka-wahl input[type="checkbox"]'));
    const meldung = [...host.querySelectorAll('.ka-fehlt')].find((p) => p.textContent?.includes('qgis_process'))!;
    await klick(knopf(meldung, 'Einstellungen öffnen'));
    expect(einstellungen).toBe(1);

    act(() => useKataster.getState().programmSetzen('C:/qgis_process.bat'));
    await act(async () => void (await useKataster.getState().exportieren(['a4'])));
    const plan = (qgis.aufrufe[0].auftrag as { plaene: { beschriftung: string }[] }).plaene[0];
    expect(plan.beschriftung).toBe(
      `Kartengrundlage: Liegenschaftskarte (ALKIS), Geobasis NRW, Stand ${new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })} – kein amtlicher Auszug`,
    );
  });
});

describe('Projekt wählen: späte Ergebnisse', () => {
  /** liste() wartet, bis das Tor aufgeht – so ist das Lesen der Projektdatei noch unterwegs */
  const gebremst = () => {
    let auf!: () => void;
    const tor = new Promise<void>((r) => (auf = r));
    const echt = fs.liste.bind(fs);
    fs.liste = async (wurzel, tiefe) => {
      await tor;
      return echt(wurzel, tiefe);
    };
    return () => {
      fs.liste = echt;
      auf();
    };
  };

  it('ein spätes Ergebnis nach projektWaehlen(null) bzw. nach einem anderen Projekt wird verworfen; Gegenprobe ohne Schließen', async () => {
    let auf = gebremst();
    const spaet = useKataster.getState().projektWaehlen(ORDNER, 'BS9');
    await useKataster.getState().projektWaehlen(null);
    auf();
    await spaet;
    expect(useKataster.getState().projekt).toBeNull();
    // ein anderes Projekt inzwischen gewählt: das frühere setzt sich nicht darüber
    auf = gebremst();
    const frueher = useKataster.getState().projektWaehlen(ORDNER, 'BS9');
    auf();
    await useKataster.getState().projektWaehlen('Z:/Projekte/Anderes', 'Anderes');
    await frueher;
    expect(useKataster.getState().projekt?.basis).toBe('Z:/Projekte/Anderes');
    // Gegenprobe: ohne Schließen kommt das Projekt an
    await useKataster.getState().projektWaehlen(ORDNER, 'BS9');
    expect(useKataster.getState().projekt?.basis).toBe(ORDNER);
    expect(useKataster.getState().projekt?.oap).not.toBeNull();
  });

  it('Dialog geschlossen, bevor die Projektdatei gelesen ist: danach ist kein Projekt gewählt', async () => {
    const auf = gebremst();
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(createElement(KatasterDialog, { basis: ORDNER, name: 'BS9 Musterstraße 9', onClose: () => undefined })));
    act(() => root!.unmount());
    root = null;
    auf();
    for (let i = 0; i < 4; i++) await warte();
    expect(useKataster.getState().projekt).toBeNull();
  });
});
