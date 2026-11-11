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
import type { Abschnitt, Feld } from '../forma/felder';
import { abschnitte, felderDerSeite } from '../forma/felder';
import { parseFormular } from '../forma/formular';
import type { FormularProfil } from '../profil';
import { abschnittId, bereinigt, feldErforderlich, feldZustand, formularKontext, profilSchluessel } from '../profil';
import { absatzZeilen, gesetzBekannt, gesetzLaden } from '../recht';
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
/** Formulare unter .ref ohne Vorgabe (Schlüssel → Datei) */
const ohneVorgabe = new Map<string, string>();
for (const pfad of sammle(REF)) {
  try {
    const f = parseFormular(new Uint8Array(readFileSync(pfad)));
    const k = profilSchluessel(f, pfad);
    if (VORGABEN[k] && !formulare.has(k)) formulare.set(k, f);
    else if (!VORGABEN[k]) ohneVorgabe.set(k, pfad);
  } catch {
    // keine FORMA-Datei
  }
}

/** alle Bedingungen einer Vorgabe */
const bedingungen = (v: FormularProfil): Bedingung[] =>
  [...Object.values(v.abschnitte).map((a) => a.bedingung), ...(v.gruppen ?? []).map((g) => g.bedingung), ...Object.values(v.bedingungen ?? {})].filter((b): b is Bedingung => !!b);

describe('Vorgaben der App', () => {
  it.each(Object.keys(VORGABEN))('%s: jede Rechtsgrundlage gibt es im Gesetzestext der App', async (k) => {
    for (const b of bedingungen(VORGABEN[k])) {
      for (const q of b.quellen ?? []) {
        expect(gesetzBekannt(q.gesetz), q.gesetz).toBe(true);
        const p = (await gesetzLaden(q.gesetz)).paragrafen[q.paragraf];
        expect(p, `${q.gesetz} § ${q.paragraf}`).toBeDefined();
        if (q.absatz)
          expect(
            p.text.some((z) => z.startsWith(`(${q.absatz})`)),
            `${q.gesetz} § ${q.paragraf} Absatz ${q.absatz}`,
          ).toBe(true);
        if (q.nummer) {
          const { von, bis } = absatzZeilen(p, q.absatz);
          expect(
            p.text.slice(von, bis).some((z) => new RegExp(`^${q.nummer}\\.`).test(z)),
            `${q.gesetz} § ${q.paragraf} Absatz ${q.absatz} Nummer ${q.nummer}`,
          ).toBe(true);
        }
      }
    }
  });

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

    it('jedes Formular unter .ref hat eine Vorgabe', () => {
      expect([...ohneVorgabe].map(([k, pfad]) => `${k} (${pfad})`)).toEqual([]);
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

/**
 * Fallmatrix (R-01 ff.): erforderliche Bauvorlagen nach Vordruck (Verfahren), Gebäudeklasse, Gebäudeart, Sonderbau,
 * Vorhaben und Planungsrecht – auch „nicht festgelegt“. Geprüft wird die Vorgabe selbst (ohne Formulardatei): das Feld
 * mit seiner Bedingung, der seiner Gruppe und – wo angegeben – der seines Abschnitts.
 */
type Soll = 'erforderlich' | 'entfällt' | 'offen';
const ALS: Record<'ja' | 'nein' | 'offen', Soll> = { ja: 'erforderlich', nein: 'entfällt', offen: 'offen' };

function zustand(vorgabe: string, feld: string, abschnitt: string | null, merkmale: Record<string, string>, werte: Record<string, boolean | string> = {}): Soll {
  const [seite, name] = feld.split(':');
  const f = { schluessel: feld, seite: Number(seite), name, art: 'kreuz' } as unknown as Feld;
  const a = abschnitt ? ({ titel: '', felder: [{ ...f, seite: Number(abschnitt.split(':')[0]) }], rahmen: { o: { name: abschnitt.split(':')[1] } } } as unknown as Abschnitt) : undefined;
  if (a) expect(abschnittId(a)).toBe(abschnitt);
  const k = { merkmale, wert: (s: string) => werte[s] ?? false };
  return ALS[feldZustand(f, a, VORGABEN[vorgabe], k)];
}

const BA = { '0:CheckBox1': true };
const VB = { '0:CheckBox2': true };
const I1 = 'nw010001|2026I';
const I2 = 'nw010002|2026I';
const I2_24 = 'nw010002|2024D';
const I3 = 'nw010005|2026I';
const BB = 'nw010010|2026I';
const BEGINN = 'nw030001|2021L';
const FERTIG = 'nw030003|2021L';

// [Fall, Vorgabe, Feld, Abschnitt, Merkmale, Werte der Felder, erwartet]
const FAELLE: [string, string, string, string | null, Record<string, string>, Record<string, boolean | string>, Soll][] = [
  // R-01: ein fehlendes Merkmal lässt keine Pflichtvorlage entfallen
  ['I/2 Nr. 2 Maß, Planungsrecht nicht festgelegt', I2, '1:CheckBox2', '1:Panel1', {}, BA, 'offen'],
  ['I/2 Nr. 3 Flurkarte, Planungsrecht nicht festgelegt', I2, '1:CheckBox3', '1:Panel1', {}, BA, 'offen'],
  ['I/2 Nr. 6 Baubeschreibung, Gebäudeart nicht festgelegt', I2, '1:CheckBox6', '1:Panel1', {}, BA, 'offen'],
  ['I/2 Nr. 6 Baubeschreibung, Einfamilienhaus', I2, '1:CheckBox6', '1:Panel1', { Gebäudeart: 'Einfamilienhaus' }, BA, 'entfällt'],
  ['I/2 Nr. 6 Baubeschreibung, Mehrfamilienhaus', I2, '1:CheckBox6', '1:Panel1', { Gebäudeart: 'Mehrfamilienhaus' }, BA, 'erforderlich'],
  ['I/2 Unterlagen beim Vorbescheid, auch ohne Merkmale', I2, '1:CheckBox6', '1:Panel1', {}, VB, 'entfällt'],
  ['I/1 Nr. 2 Maß, Planungsrecht nicht festgelegt', I1, '1:CheckBox2', '1:Panel1', {}, BA, 'offen'],
  ['I/1 Nr. 9 Betriebsbeschreibung, Gebäudeart nicht festgelegt', I1, '1:CheckBox9', '1:Panel1', {}, BA, 'offen'],
  ['I/7 Nr. 8 Schutz gegen schädliche Einflüsse, Verfahren nicht festgelegt', BB, '1:Nr8', '1:Panel4', {}, {}, 'offen'],
  ['I/7 Nr. 8, vereinfachtes Verfahren', BB, '1:Nr8', '1:Panel4', { Verfahren: 'vereinfachtes Verfahren' }, {}, 'entfällt'],
  ['I/7 Nr. 8, Baugenehmigungsverfahren', BB, '1:Nr8', '1:Panel4', { Verfahren: 'Baugenehmigungsverfahren' }, {}, 'erforderlich'],
  ['Baubeginn Nr. 3 Brandschutz, nichts festgelegt', BEGINN, '1:CheckBox6', '1:Panel3', {}, {}, 'offen'],

  // R-03: nw010005 Nr. 6 Erklärung zum Brandschutz
  ['I/3 Nr. 6, „nein“, Gebäudeklasse 1', I3, '1:CheckBox8', '1:Panel6', { Gebäudeklasse: '1' }, { '0:CheckBox2': true }, 'erforderlich'],
  ['I/3 Nr. 6, „nein“, Kästchen Gebäudeklasse 2 (Merkmal fehlt)', I3, '1:CheckBox8', '1:Panel6', {}, { '0:CheckBox2': true, '0:CheckBox9': true }, 'erforderlich'],
  ['I/3 Nr. 6, „nein“, Gebäudeklasse 3', I3, '1:CheckBox8', '1:Panel6', { Gebäudeklasse: '3' }, { '0:CheckBox2': true }, 'entfällt'],
  ['I/3 Nr. 6, „ja“, Gebäudeklasse 3', I3, '1:CheckBox8', '1:Panel6', { Gebäudeklasse: '3' }, { '0:CheckBox1': true }, 'erforderlich'],
  ['I/3 Nr. 6, „nein“, Gebäudeklasse nicht festgelegt', I3, '1:CheckBox8', '1:Panel6', {}, { '0:CheckBox2': true }, 'offen'],

  // R-04: Betriebsbeschreibung bei jedem Betrieb, nicht nur bei Sonderbauten
  ['I/2 Nr. 8 Betriebsbeschreibung, Nichtwohngebäude ohne Sonderbau', I2, '2:CheckBox1', '2:Panel1', { Gebäudeart: 'Nichtwohngebäude', Sonderbau: 'nein' }, BA, 'erforderlich'],
  ['I/2 Nr. 8 Betriebsbeschreibung, Einfamilienhaus', I2, '2:CheckBox1', '2:Panel1', { Gebäudeart: 'Einfamilienhaus', Sonderbau: 'nein' }, BA, 'entfällt'],
  ['I/2 Nr. 8 Betriebsbeschreibung, Sonderbau ohne Gebäudeart', I2, '2:CheckBox1', '2:Panel1', { Sonderbau: 'ja' }, BA, 'offen'],
  ['I/2 Nr. 8 Betriebsbeschreibung, Vorbescheid', I2, '2:CheckBox1', '2:Panel1', { Gebäudeart: 'Nichtwohngebäude' }, VB, 'entfällt'],
  ['I/2 Nr. 9 Sonderbauten, Sonderbau ja', I2, '2:CheckBox2', '2:Panel1', { Sonderbau: 'ja' }, BA, 'erforderlich'],
  ['I/2 Nr. 9 Sonderbauten, Sonderbau nein', I2, '2:CheckBox2', '2:Panel1', { Sonderbau: 'nein' }, BA, 'entfällt'],
  ['I/2 Nr. 9 Sonderbauten, Kästchen Sonderbau (Merkmal fehlt)', I2, '2:CheckBox2', '2:Panel1', {}, { ...BA, '0:CheckBox26': true }, 'erforderlich'],
  ['I/2 Nr. 9 Sonderbauten, Sonderbau nicht festgelegt', I2, '2:CheckBox2', '2:Panel1', {}, BA, 'offen'],
  ['I/2 (2024D) Nr. 8 Betriebsbeschreibung, Nichtwohngebäude ohne Sonderbau', I2_24, '1:CheckBox10', null, { Gebäudeart: 'Nichtwohngebäude', Sonderbau: 'nein' }, BA, 'erforderlich'],

  // R-06: Nr. 11 – beim Sonderbau weder Erklärung noch Bescheinigung
  ['I/2 Nr. 11.1 Erklärung, Sonderbau GK 5', I2, '2:CheckBox4', '2:Panel3', { Gebäudeklasse: '5', Sonderbau: 'ja' }, BA, 'entfällt'],
  ['I/2 Nr. 11.2 Bescheinigung, Sonderbau GK 5', I2, '2:CheckBox5', '2:Panel3', { Gebäudeklasse: '5', Sonderbau: 'ja' }, BA, 'entfällt'],
  ['I/2 Nr. 11.1 Erklärung, GK 2 ohne Sonderbau', I2, '2:CheckBox4', '2:Panel3', { Gebäudeklasse: '2', Sonderbau: 'nein' }, BA, 'erforderlich'],
  ['I/2 Nr. 11.2 Bescheinigung, GK 2 ohne Sonderbau', I2, '2:CheckBox5', '2:Panel3', { Gebäudeklasse: '2', Sonderbau: 'nein' }, BA, 'entfällt'],
  ['I/2 Nr. 11.1 Erklärung, GK 5 ohne Sonderbau', I2, '2:CheckBox4', '2:Panel3', { Gebäudeklasse: '5', Sonderbau: 'nein' }, BA, 'entfällt'],
  ['I/2 Nr. 11.2 Bescheinigung, GK 5 ohne Sonderbau', I2, '2:CheckBox5', '2:Panel3', { Gebäudeklasse: '5', Sonderbau: 'nein' }, BA, 'erforderlich'],
  ['I/2 Nr. 11.1 Erklärung, GK 2, Sonderbau nicht festgelegt', I2, '2:CheckBox4', '2:Panel3', { Gebäudeklasse: '2' }, BA, 'offen'],

  // R-07: Nr. 4 Basiskarte nur nach §§ 34, 35 BauGB
  ['I/1 Nr. 4 Basiskarte, Bebauungsplan', I1, '1:CheckBox4', '1:Panel1', { Planungsrecht: 'Bebauungsplan' }, BA, 'entfällt'],
  ['I/1 Nr. 4 Basiskarte, Außenbereich', I1, '1:CheckBox4', '1:Panel1', { Planungsrecht: 'Außenbereich' }, BA, 'erforderlich'],
  ['I/1 Nr. 4 Basiskarte, nicht festgelegt', I1, '1:CheckBox4', '1:Panel1', {}, BA, 'offen'],
  ['I/2 Nr. 4 Basiskarte, Bebauungsplan', I2, '1:CheckBox4', '1:Panel1', { Planungsrecht: 'Bebauungsplan' }, BA, 'entfällt'],
  ['I/2 Nr. 4 Basiskarte, Innenbereich', I2, '1:CheckBox4', '1:Panel1', { Planungsrecht: 'Innenbereich' }, BA, 'erforderlich'],
  ['I/2 Nr. 4 Basiskarte, einfacher Bebauungsplan', I2, '1:CheckBox4', '1:Panel1', { Planungsrecht: 'einfacher Bebauungsplan' }, BA, 'erforderlich'],
  ['I/2 Nr. 4 Basiskarte, nicht festgelegt', I2, '1:CheckBox4', '1:Panel1', {}, BA, 'offen'],

  // R-08: Nr. 8 Barrierefrei-Konzept bei der Errichtung
  ['I/1 Nr. 8 Barrierefrei-Konzept, Errichtung', I1, '1:CheckBox8', '1:Panel1', { Vorhaben: 'Errichtung' }, BA, 'erforderlich'],
  ['I/1 Nr. 8 Barrierefrei-Konzept, Änderung', I1, '1:CheckBox8', '1:Panel1', { Vorhaben: 'Änderung' }, BA, 'entfällt'],
  ['I/1 Nr. 8 Barrierefrei-Konzept, nicht festgelegt', I1, '1:CheckBox8', '1:Panel1', {}, BA, 'offen'],

  // R-10: Anzeigen (Fassung 2018) nach geltendem § 68
  ['Baubeginn Nr. 1 Schall/Wärme, Zweifamilienhaus GK 3', BEGINN, '1:CheckBox1', '1:Panel1', { Gebäudeart: 'Zweifamilienhaus', Gebäudeklasse: '3' }, {}, 'erforderlich'],
  ['Baubeginn Nr. 1 Schall/Wärme, Zweifamilienhaus GK 2', BEGINN, '1:CheckBox1', '1:Panel1', { Gebäudeart: 'Zweifamilienhaus', Gebäudeklasse: '2' }, {}, 'entfällt'],
  ['Baubeginn Nr. 1 Schall/Wärme, Einfamilienhaus GK 1', BEGINN, '1:CheckBox1', '1:Panel1', { Gebäudeart: 'Einfamilienhaus', Gebäudeklasse: '1' }, {}, 'entfällt'],
  ['Fertigstellung Nr. 1 Schall/Wärme, Zweifamilienhaus GK 3', FERTIG, '1:CheckBox1', '1:Panel1', { Gebäudeart: 'Zweifamilienhaus', Gebäudeklasse: '3' }, {}, 'erforderlich'],
  ['Fertigstellung Nr. 2 Standsicherheit, Mehrfamilienhaus GK 2', FERTIG, '1:CheckBox3', '1:Panel2', { Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '2' }, {}, 'entfällt'],
  ['Fertigstellung Nr. 3 Brandschutz, GK 3 Sonderbau', FERTIG, '1:CheckBox5', '1:Panel3', { Gebäudeklasse: '3', Sonderbau: 'ja' }, {}, 'erforderlich'],

  // R-25: einfacher Bebauungsplan und Satzungen
  ['I/2 Nr. 2 Maß, einfacher Bebauungsplan', I2, '1:CheckBox2', '1:Panel1', { Planungsrecht: 'einfacher Bebauungsplan' }, BA, 'erforderlich'],
  ['I/2 Nr. 3 Flurkarte, einfacher Bebauungsplan', I2, '1:CheckBox3', '1:Panel1', { Planungsrecht: 'einfacher Bebauungsplan' }, BA, 'erforderlich'],
  ['I/2 Nr. 2 Maß, qualifizierter Bebauungsplan', I2, '1:CheckBox2', '1:Panel1', { Planungsrecht: 'Bebauungsplan' }, BA, 'erforderlich'],
  ['I/2 Nr. 3 Flurkarte, qualifizierter Bebauungsplan', I2, '1:CheckBox3', '1:Panel1', { Planungsrecht: 'Bebauungsplan' }, BA, 'entfällt'],
  ['I/2 Nr. 2 Maß, Innenbereich', I2, '1:CheckBox2', '1:Panel1', { Planungsrecht: 'Innenbereich' }, BA, 'entfällt'],
  ['I/2 Nr. 2 Maß, Satzung nach BauGB', I2, '1:CheckBox2', '1:Panel1', { Planungsrecht: 'Satzung nach BauGB' }, BA, 'erforderlich'],
  ['I/2 Nr. 3 Flurkarte, Satzung nach BauGB', I2, '1:CheckBox3', '1:Panel1', { Planungsrecht: 'Satzung nach BauGB' }, BA, 'entfällt'],
  ['I/1 Nr. 3 Flurkarte, einfacher Bebauungsplan', I1, '1:CheckBox3', '1:Panel1', { Planungsrecht: 'einfacher Bebauungsplan' }, BA, 'erforderlich'],
];

describe('Fallmatrix der Pflichtvorlagen', () => {
  it.each(FAELLE)('%s', (_fall, vorgabe, feld, abschnitt, merkmale, werte, soll) => {
    expect(VORGABEN[vorgabe], vorgabe).toBeDefined();
    expect(zustand(vorgabe, feld, abschnitt, merkmale, werte)).toBe(soll);
  });

  it('R-08: Nr. 8 Barrierefrei-Konzept zählt, Nr. 11 (§ 6) bleibt freiwillig', () => {
    expect(VORGABEN[I1].zaehlt['1:CheckBox8']).toBeUndefined();
    expect(VORGABEN[I1].zaehlt['1:CheckBox37']).toBe(false);
  });

  it('R-04: der Abschnitt Nr. 8/9 hat keine Bedingung mehr – sie hängt an den Feldern', () => {
    expect(VORGABEN[I2].abschnitte['2:Panel1'].bedingung).toBeUndefined();
    expect(VORGABEN[I2].abschnitte['2:Panel1'].titel).toBe('Nr. 8 Betriebsbeschreibung, Nr. 9 Zusätzliche Bauvorlagen für Sonderbauten');
  });
});
