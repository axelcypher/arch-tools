import { describe, expect, it } from 'vitest';
import { direktExportZielAus } from '../excel/direktExport';
import { projektordnerAusDatei } from '../excel/projektordner';
import { verbinde } from '../platform/projektordner';
import { VORGABE_OAP_PFAD } from '../projektdatei';
import { bezugText, elternVon, kinderVon, vollerOrt, vorfahren } from './baum';
import { PFAD_EINSTELLUNGEN } from './eintraege';
import { pfadEinstellung } from './pfade';

/** Baum der Pfad- und Namenseinstellungen: jeder Eintrag sagt, wovon er abhängt – stimmig und so, wie die Apps auflösen */
describe('Baum der Pfadeinstellungen: Bezüge', () => {
  it('jeder Bezug ist gültig: Eltern gibt es, sind Ordner, ohne Kreis, Kinder in der Gruppe ihrer Eltern', () => {
    for (const e of PFAD_EINSTELLUNGEN) {
      expect(() => vorfahren(e), e.id).not.toThrow();
      const p = elternVon(e);
      if (e.bezug.art !== 'eintrag') continue;
      expect(p, `${e.id}: Eltern ${e.bezug.id}`).toBeDefined();
      expect(p!.art === 'pfad' || p!.art === 'ordner' || (p!.art === 'liste' && p!.zeilen === 'ordner'), `${e.id}: Eltern ist ein Ordner`).toBe(true);
      expect(e.thema, `${e.id}: Gruppe der Eltern`).toBe(p!.thema);
    }
  });

  it('Art und Bezug passen: vollständige Ordner absolut, Pfade mit festem Ort, Schalter ohne Ort', () => {
    for (const e of PFAD_EINSTELLUNGEN) {
      if (e.art === 'ordner' || e.zeilen === 'ordner') expect(e.bezug.art, e.id).toBe('absolut');
      if (e.art === 'pfad' || e.zeilen === 'pfad') expect(['projekt', 'eintrag'], e.id).toContain(e.bezug.art);
      if (e.art === 'schalter') expect(e.bezug.art, e.id).toBe('frei');
      expect(bezugText(e), e.id).not.toBe('');
    }
  });

  it('Kinder in der Reihenfolge des Verzeichnisses; Bezugszeile nennt Eltern und den Ordner dazwischen', () => {
    expect(kinderVon('ablage.fabrio.gewerke').map((e) => e.id)).toEqual(['ablage.fabrio.lv', 'ablage.fabrio.auftrag', 'ablage.fabrio.korrespondenz']);
    expect(bezugText(pfadEinstellung('ablage.fabrio.auftrag'))).toBe('Relativ zu „Ordner der Gewerke“ › je Gewerk ein Ordner');
    expect(bezugText(pfadEinstellung('plaene.fabrio.rechnungen'))).toBe('Liegt in „Aufträge und Rechnungen“');
    expect(vorfahren(pfadEinstellung('plaene.fabrio.rechnungen')).map((e) => e.id)).toEqual(['ablage.fabrio.gewerke', 'ablage.fabrio.auftrag']);
  });

  it('suchende und anderswo festgelegte Einträge haben keinen festen Ort', () => {
    for (const id of ['ablage.fabrio.mailOrdner', 'ablage.fabrio.archive', 'ablage.fabrio.kostenkontrolle', 'plaene.dateischema'])
      expect(
        vollerOrt(pfadEinstellung(id), () => 'x'),
        id,
      ).toBeNull();
  });
});

/** Abgleich mit der Auflösung im Kern (Export der Rechen-Apps, Projektdatei); die Apps gleichen in ihren bezug.test.ts ab */
describe('Baum der Pfadeinstellungen: Abgleich mit dem Export', () => {
  const werte = { projektcode: 'BS9', kurzname: 'EFH', datum: new Date(2026, 10, 12) };
  const projekt = 'Z:/Projekte/BS9 EFH';
  const datei = verbinde(projekt, '03 Berechnungen/Flächen/BS9 EFH.oap');

  it('Projektdatei relativ zum Projektordner: aus ihrem Ort ergibt sich der Projektordner', () => {
    expect(pfadEinstellung('projekt.oapPfad').bezug).toEqual({ art: 'projekt' });
    expect(projektordnerAusDatei(datei, VORGABE_OAP_PFAD)).toBe(projekt);
  });

  for (const app of ['flaechenrechner', 'grz', 'kosten'] as const)
    it(`${app}: Excel und PDF im Unterordner der App im gemeinsamen Berechnungsordner, der relativ zum Projektordner liegt`, async () => {
      const w: Record<string, string> = {
        'export.berechnungsordner': 'Ber',
        [`export.unterordner.${app}`]: 'Ergebnis',
        [`export.excel.abweichend.${app}`]: 'A',
        [`export.pdf.abweichend.${app}`]: 'B',
      };
      const { exportAusWerten } = await import('./pfade');
      const pfade = exportAusWerten(app, (id) => w[id] ?? pfadEinstellung(id).vorgabe);
      const ziel = direktExportZielAus(pfade, { datei, werte, inhalt: 'X' });
      expect('ordner' in ziel && ziel).toMatchObject({ xlsx: 'A.xlsx', pdf: 'B.pdf' });
      const ordner = vollerOrt(pfadEinstellung(`export.unterordner.${app}`), (x) => w[x])!;
      expect(ordner).toMatchObject({ von: 'projekt', teile: ['Ber', 'Ergebnis'] });
      expect('ordner' in ziel && ziel.ordner.replace(/\\/g, '/')).toBe([projekt, ...ordner.teile].join('/'));
      // die Dateinamen der App hängen an ihrem Unterordner
      for (const n of [`export.excel.abweichend.${app}`, `export.pdf.abweichend.${app}`]) expect(vollerOrt(pfadEinstellung(n), (x) => w[x])!.teile, n).toEqual([...ordner.teile, w[n]]);
    });

  it('PERMIO sucht Berechnungen relativ zum Projektordner: in den Berechnungsordnern der Rechen-Apps und den zusätzlichen', async () => {
    const { berechnungenSuchordner } = await import('./pfade');
    const w: Record<string, unknown> = { 'ablage.permio.berechnungsordner': ['Planung/Statik'] };
    const ordner = berechnungenSuchordner({}, (id) => (w[id] as never) ?? pfadEinstellung(id).vorgabe);
    expect(pfadEinstellung('ablage.permio.berechnungsordner').bezug).toEqual({ art: 'projekt' });
    expect(ordner).toContain(vollerOrt(pfadEinstellung('ablage.permio.berechnungsordner'), (id) => w[id] as never)!.teile.join('/'));
    expect(ordner).toContain(vollerOrt(pfadEinstellung('export.unterordner.grz'), (id) => pfadEinstellung(id).vorgabe)!.teile.join('/'));
  });
});
