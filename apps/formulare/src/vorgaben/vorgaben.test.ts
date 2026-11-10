/**
 * Vorgaben der App: in sich stimmig, und jeder Feld- und Abschnittsschlüssel gibt es im Formular. Die Formulare
 * selbst liegen nicht im Repository – geprüft wird gegen `.ref/` (oder `SJFORMA_REF`), ohne sie übersprungen.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Bedingung } from '../bedingung';
import { blaetter, VORGABE_MERKMALE } from '../bedingung';
import { abschnitte, felderDerSeite } from '../forma/felder';
import { parseFormular } from '../forma/formular';
import type { FormularProfil } from '../profil';
import { abschnittId, bereinigt, feldErforderlich, formularKontext, profilSchluessel } from '../profil';
import { VORGABEN } from './index';

function sammle(ordner: string, out: string[] = []): string[] {
  let namen: string[];
  try {
    namen = readdirSync(ordner);
  } catch {
    return out;
  }
  for (const n of namen) {
    const p = join(ordner, n);
    if (statSync(p).isDirectory()) sammle(p, out);
    else if (n.endsWith('.frmsjf')) out.push(p);
  }
  return out;
}

const REF = process.env.SJFORMA_REF ?? fileURLToPath(new URL('../../../../.ref', import.meta.url));
const formulare = new Map<string, ReturnType<typeof parseFormular>>();
for (const pfad of sammle(REF)) {
  try {
    const f = parseFormular(new Uint8Array(readFileSync(pfad)));
    const k = profilSchluessel(f, pfad);
    if (VORGABEN[k] && !formulare.has(k)) formulare.set(k, f);
  } catch {
    // keine FORMA-Datei
  }
}

/** alle Bedingungen einer Vorgabe */
const bedingungen = (v: FormularProfil): Bedingung[] =>
  [...Object.values(v.abschnitte).map((a) => a.bedingung), ...(v.gruppen ?? []).map((g) => g.bedingung), ...Object.values(v.bedingungen ?? {})].filter((b): b is Bedingung => !!b);

describe('Vorgaben der App', () => {
  it.each(Object.keys(VORGABEN))('%s ist in sich stimmig', (k) => {
    const v = VORGABEN[k];
    // nichts geht beim Bereinigen verloren (gültige Bedingungen, jedes Feld in höchstens einer Gruppe …)
    expect(bereinigt(v)).toEqual(bereinigt(bereinigt(v)));
    expect((bereinigt(v).gruppen ?? []).map((g) => g.felder)).toEqual((v.gruppen ?? []).map((g) => g.felder));
    expect(Object.keys(bereinigt(v).bedingungen ?? {}).sort()).toEqual(Object.keys(v.bedingungen ?? {}).sort());
    for (const g of v.gruppen ?? []) expect(g.id).toMatch(/^v:/);
    // Merkmale und Werte gibt es
    for (const t of bedingungen(v).flatMap((b) => blaetter(b))) {
      if (t.art !== 'merkmal') continue;
      const m = VORGABE_MERKMALE.find((x) => x.name === t.merkmal);
      expect(m, t.merkmal).toBeDefined();
      for (const w of t.werte) expect(m!.werte, `${t.merkmal}: ${w}`).toContain(w);
    }
  });

  describe.skipIf(!formulare.size)(`gegen die echten Formulare (${formulare.size} aus ${REF})`, () => {
    it.each([...formulare.keys()])('%s: alle Schlüssel gibt es im Formular', (k) => {
      const v = VORGABEN[k];
      const f = formulare.get(k)!;
      const felder = f.seiten.map((s, i) => felderDerSeite(s, i));
      const feldSchluessel = new Set(felder.flat().map((x) => x.schluessel));
      const abschnittIds = new Set(felder.flatMap((fs) => abschnitte(fs).map(abschnittId)));
      const genutzt = [
        ...Object.keys(v.feldTitel ?? {}),
        ...Object.keys(v.zaehlt),
        ...(v.gruppen ?? []).flatMap((g) => g.felder),
        ...Object.keys(v.bedingungen ?? {}),
        ...bedingungen(v).flatMap((b) => blaetter(b).flatMap((t) => (t.art === 'feld' ? [t.feld] : []))),
      ];
      expect(genutzt.filter((x) => !feldSchluessel.has(x))).toEqual([]);
      expect(Object.keys(v.abschnitte).filter((x) => !abschnittIds.has(x))).toEqual([]);
      // berechnete Felder zählen ohnehin nicht – eine Vorgabe soll sie nicht in Gruppen stecken
      const berechnet = new Set(
        felder
          .flat()
          .filter((x) => x.berechnet)
          .map((x) => x.schluessel),
      );
      expect((v.gruppen ?? []).flatMap((g) => g.felder).filter((x) => berechnet.has(x))).toEqual([]);
    });

    it.skipIf(!formulare.has('nw010002|2026I'))('vereinfachtes Verfahren: Nr. 6 Baubeschreibung entfällt beim Einfamilienhaus', () => {
      const v = VORGABEN['nw010002|2026I'];
      const f = formulare.get('nw010002|2026I')!;
      const felder = f.seiten.flatMap((s, i) => felderDerSeite(s, i));
      const baubeschreibung = felder.find((x) => x.schluessel === '1:CheckBox6')!;
      const abschnitt = abschnitte(felder.filter((x) => x.seite === 1)).find((a) => a.felder.includes(baubeschreibung));
      const erforderlich = (merkmale: Record<string, string>, werte: Record<string, boolean> = { '0:CheckBox1': true }) =>
        feldErforderlich(
          baubeschreibung,
          abschnitt,
          v,
          formularKontext(merkmale, felder, (x) => werte[x.schluessel] ?? false),
        );
      expect(baubeschreibung.beschriftung).toContain('Baubeschreibung');
      expect(erforderlich({ Gebäudeart: 'Einfamilienhaus' })).toBe(false);
      expect(erforderlich({ Gebäudeart: 'Mehrfamilienhaus' })).toBe(true);
      // beim Antrag auf Vorbescheid sind die Unterlagen nicht vorgeschrieben
      expect(erforderlich({ Gebäudeart: 'Mehrfamilienhaus' }, { '0:CheckBox2': true })).toBe(false);
    });
  });
});
