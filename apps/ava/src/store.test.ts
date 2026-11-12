import { describe, expect, it } from 'vitest';
import { auftragEintragen } from './abrechnung/kostenkontrolle';
import { demoLaden } from './demo';
import { aslvLesen } from './format/aslv';
import type { Position } from './lv/modell';
import { fuegeEin, neueId, positionen } from './lv/modell';
import { gewerkOrdner, lvGeaendert, useAva } from './store';

describe('Zustand der App mit einem Projekt im Speicher', () => {
  it('öffnet das Projekt, bearbeitet und speichert das LV, schreibt in die Kostenkontrolle', async () => {
    await demoLaden();
    const p = useAva.getState().projekt!;
    expect(p.struktur?.gewerke.map((g) => g.kennung)).toEqual(['G4', 'G8']);
    expect(p.kk?.kk.rechnungsliste?.naechsteNr).toBe(3);
    const g8 = gewerkOrdner(p, 'G8')!;
    await useAva.getState().lvOeffnen('G8', g8.lvs[0]);
    const lv = useAva.getState().lv!;
    expect(lv.lv.kopf.bezeichnung).toBe('G08 Fensterarbeiten');
    expect(lvGeaendert(lv)).toBe(false);
    const abschnitt = lv.lv.elemente[2];
    const neu: Position = { id: neueId(), art: 'position', oz: '0060', kurztext: 'Fensterbank außen', langtext: [], einheit: 'm', menge: 18.5, positionsart: 'normal', preise: { '0': { ep: 52.4 } } };
    useAva.getState().lvAendern((l) => ({ ...l, elemente: fuegeEin(l.elemente, neu, abschnitt.id) }));
    expect(lvGeaendert(useAva.getState().lv)).toBe(true);
    useAva.getState().lvRueckgaengig();
    expect(lvGeaendert(useAva.getState().lv)).toBe(false);
    useAva.getState().lvWiederholen();
    expect(await useAva.getState().lvSpeichern()).toBe(true);
    expect(lvGeaendert(useAva.getState().lv)).toBe(false);
    const datei = await useAva.getState().fs.lies(p.ordner, g8.lvs[0].pfad);
    expect(positionen(aslvLesen(datei!.daten).lv).map((x) => x.pos.kurztext)).toContain('Fensterbank außen');
    // zweites Speichern nach einer weiteren Änderung legt die neue Position nicht noch einmal an
    useAva.getState().lvAendern((l) => ({ ...l, kopf: { ...l.kopf, vergabeart: 'Beschränkte Ausschreibung' } }));
    expect(await useAva.getState().lvSpeichern()).toBe(true);
    const zweimal = await useAva.getState().fs.lies(p.ordner, g8.lvs[0].pfad);
    expect(positionen(aslvLesen(zweimal!.daten).lv).filter((x) => x.pos.kurztext === 'Fensterbank außen')).toHaveLength(1);
    expect(aslvLesen(zweimal!.daten).lv.kopf.vergabeart).toBe('Beschränkte Ausschreibung');
    // ohne Änderung bleibt die Datei, wie sie ist
    expect(await useAva.getState().lvSpeichern()).toBe(true);
    expect((await useAva.getState().fs.lies(p.ordner, g8.lvs[0].pfad))!.daten).toBe(zweimal!.daten);
    await useAva.getState().kkSchreiben((kk) => auftragEintragen(kk.kk, { gewerk: 'G8', text: 'Nachtrag 1', betrag: 1000 }).aenderungen);
    expect(useAva.getState().projekt!.kk!.kk.gewerke.find((g) => g.gewerk === 'G8')!.anschlag.summe).toBeCloseTo(55269.87, 2);
    await useAva.getState().avaAendern((a) => ({ ...a, zahler: 'bank@example.org' }));
    await useAva.getState().neuLaden();
    expect(useAva.getState().projekt!.ava.zahler).toBe('bank@example.org');
  });
});
