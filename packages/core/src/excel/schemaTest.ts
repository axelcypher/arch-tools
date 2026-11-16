import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ExportContext } from './context';
import { pruefeVorlage } from './fill';
import { abschnittErsetzen } from './referenz';
import type { PlatzhalterSchema } from './schema';
import { pruefeBlatt } from './pruefung';
import { alleFilterNamen, beispielAusfuehren, vorlagenZeilen, einzelwertGruppen, eingeschraenkt, ermittleNutzbarkeit, NUTZBAR, sammlungen, vollstaendigkeit } from './schema';

/**
 * Gemeinsame Tests für das Platzhalter-Schema einer App (nur von Tests eingebunden): Vollständigkeit in beide
 * Richtungen, Beispiele gegen die Engine, Nutzbarkeit je Art, benannte Filter, „Enthält“ und der erzeugte Abschnitt
 * in docs/excel-vorlagen.md. `ctx` stammt aus erfundenen Testdaten, in denen jede Sammlung mindestens zwei Datensätze hat.
 */
export function schemaTests(schema: PlatzhalterSchema, ctx: () => ExportContext, muster?: () => Promise<Uint8Array>) {
  describe(`Platzhalter-Schema ${schema.app}`, () => {
    const c = ctx();

    it('beschreibt jeden erzeugten Platzhalter, und jede Beschreibung gibt es wirklich', () => {
      expect(vollstaendigkeit(schema, c)).toEqual({ fehlt: [], ueberzaehlig: [] });
    });

    if (muster)
      it('die Muster-Vorlage besteht die Vorlagenprüfung ohne Hinweis', async () => {
        expect(await pruefeVorlage(await muster(), c, schema)).toEqual([]);
      });

    it('Testdaten: jede Sammlung hat mindestens zwei Datensätze', () => {
      for (const x of sammlungen(schema)) expect(c.collections[x.name]?.length ?? 0, x.name).toBeGreaterThanOrEqual(2);
    });

    describe('Beispiele laufen gegen die Engine', () => {
      for (const a of schema.abschnitte)
        for (const b of a.beispiele ?? [])
          it(`${a.art === 'sammlung' ? a.name : a.titel}: ${b.titel}`, () => {
            expect(beispielAusfuehren(b, c)).toEqual(b.ergebnis);
            const arten = [...new Set(pruefeBlatt(vorlagenZeilen(b.vorlage), c, { schema }).map((h) => h.art))].sort();
            expect(arten, 'Vorlagenprüfung').toEqual([...(b.pruefung ?? [])].sort());
          });
    });

    it('Einzelwerte, Sammlungsfelder und Einzelzugriffe wirken genau dort, wo die Tabelle es sagt', () => {
      const fehler: string[] = [];
      const pruefe = (ph: string, art: 'einzelwert' | 'sammlung' | 'zugriff') => {
        const ist = ermittleNutzbarkeit(ph, c);
        if (JSON.stringify(ist) !== JSON.stringify(NUTZBAR[art])) fehler.push(`${ph}: ${JSON.stringify(ist)}`);
      };
      for (const w of einzelwertGruppen(schema).flatMap((g) => g.werte))
        for (const k of Object.keys(c.scalars).filter((k) => (w.muster ? new RegExp(`^(?:${w.muster})$`).test(k) : k === w.schluessel))) if (c.scalars[k] !== '') pruefe(k, 'einzelwert');
      for (const x of sammlungen(schema)) {
        const r0 = c.collections[x.name][0];
        const namen = x.felder.flatMap((f) => (f.muster ? Object.keys(r0).filter((k) => new RegExp(`^(?:${f.muster})$`).test(k)) : [f.name]));
        for (const n of namen) if (r0[n] !== '' && r0[n] !== undefined) pruefe(`${x.name}.${n}`, 'sammlung');
        if (x.zugriff) for (const n of namen) if (r0[n] !== '' && r0[n] !== undefined) pruefe(`${x.name}:${r0[x.zugriff.ueber]}.${n}`, 'zugriff');
      }
      expect(fehler).toEqual([]);
    });

    it('jeder benannte Filter trifft in den Testdaten zu, Aliasse wirken gleich', () => {
      for (const x of sammlungen(schema))
        for (const f of x.filter) {
          const rows = c.collections[x.name];
          const treffer = rows.filter(c.filters![f.name]);
          expect(treffer.length, `${x.name}[${f.name}]`).toBeGreaterThan(0);
          for (const a of f.aliase ?? []) expect(rows.filter(c.filters![a]), `${x.name}[${a}]`).toEqual(treffer);
        }
      // jeder Name nur einmal je Sammlung
      for (const x of sammlungen(schema)) expect(new Set(alleFilterNamen(x)).size, x.name).toBe(alleFilterNamen(x).length);
    });

    it('„Enthält“: genau die genannten Sammlungen sind im Block eingeschränkt', () => {
      const alle = sammlungen(schema).map((x) => x.name);
      for (const x of sammlungen(schema)) {
        const ist = alle.filter((k) => k !== x.name && eingeschraenkt(c, x.name, k));
        expect(ist.sort(), `{{#${x.name}}}`).toEqual(x.enthaelt.map((e) => e.sammlung).sort());
        for (const n of x.nichtEingeschraenkt ?? []) expect(eingeschraenkt(c, x.name, n.sammlung), `${x.name} ⊅ ${n.sammlung}`).toBe(false);
      }
    });
  });
}

/** Prüft (bzw. schreibt mit EXCEL_DOKU_SCHREIBEN=1) einen erzeugten Abschnitt von docs/excel-vorlagen.md */
export function dokuTest(pfad: string, id: string, inhalt: () => string) {
  it(`docs/excel-vorlagen.md, Abschnitt „${id}“ ist aktuell (sonst: node scripts/excel-doku.mjs)`, () => {
    const alt = readFileSync(pfad, 'utf8').replace(/\r\n/g, '\n');
    const neu = abschnittErsetzen(alt, id, inhalt());
    if (process.env.EXCEL_DOKU_SCHREIBEN) writeFileSync(pfad, neu);
    else expect(neu).toBe(alt);
  });
}
