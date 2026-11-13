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
import { PRUEFREGELN } from './pruefregeln';
import { plausibilitaet } from '../plausibel';

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
  // Innen- und Außenbereichssatzung (§ 34 Abs. 4, § 35 Abs. 6 BauGB): Vorhaben nach §§ 34, 35 – der Katasterauszug gehört dazu
  ['I/2 Nr. 3 Flurkarte, Satzung nach BauGB', I2, '1:CheckBox3', '1:Panel1', { Planungsrecht: 'Satzung nach BauGB' }, BA, 'erforderlich'],
  ['I/2 Nr. 4 Basiskarte, Satzung nach BauGB', I2, '1:CheckBox4', '1:Panel1', { Planungsrecht: 'Satzung nach BauGB' }, BA, 'erforderlich'],
  ['I/1 Nr. 3 Flurkarte, Satzung nach BauGB', I1, '1:CheckBox3', '1:Panel1', { Planungsrecht: 'Satzung nach BauGB' }, BA, 'erforderlich'],
  ['I/2.1 Katasterauszug, Satzung nach BauGB', 'nw010004|2026C', '0:CheckBox1', null, { Planungsrecht: 'Satzung nach BauGB' }, {}, 'erforderlich'],
  ['I/2.1 Katasterauszug, qualifizierter Bebauungsplan', 'nw010004|2026C', '0:CheckBox1', null, { Planungsrecht: 'Bebauungsplan' }, {}, 'entfällt'],

  // Mittelgarage (100–1.000 m²): Bescheinigung nach § 68 Abs. 2 Satz 3 – auch als Sonderbau, die Erklärung genügt nicht
  ['I/2 Nr. 11.2 Bescheinigung, Mittelgarage als Sonderbau', I2, '2:CheckBox5', '2:Panel3', { Gebäudeklasse: '3', Sonderbau: 'ja' }, { ...BA, '0:CheckBox24': true }, 'erforderlich'],
  ['I/2 Nr. 11.1 Erklärung, Mittelgarage als Sonderbau', I2, '2:CheckBox4', '2:Panel3', { Gebäudeklasse: '3', Sonderbau: 'ja' }, { ...BA, '0:CheckBox24': true }, 'entfällt'],
  ['I/2 Nr. 11.2 Bescheinigung, Mittelgarage GK 3 ohne Sonderbau', I2, '2:CheckBox5', '2:Panel3', { Gebäudeklasse: '3', Sonderbau: 'nein' }, { ...BA, '0:CheckBox24': true }, 'erforderlich'],
  ['I/2 Nr. 11.1 Erklärung, Mittelgarage GK 3 ohne Sonderbau', I2, '2:CheckBox4', '2:Panel3', { Gebäudeklasse: '3', Sonderbau: 'nein' }, { ...BA, '0:CheckBox24': true }, 'entfällt'],
  ['I/2 Nr. 11.1 Erklärung, GK 3 ohne Sonderbau, keine Mittelgarage', I2, '2:CheckBox4', '2:Panel3', { Gebäudeklasse: '3', Sonderbau: 'nein' }, BA, 'erforderlich'],
  ['I/2 Nr. 9 Zusätzliche Bauvorlagen, Mittelgarage ohne Sonderbau', I2, '2:CheckBox2', '2:Panel1', { Sonderbau: 'nein' }, { ...BA, '0:CheckBox24': true }, 'erforderlich'],
  ['I/2 Nr. 11, Sonstige bauliche Anlage angekreuzt', I2, '2:CheckBox4', '2:Panel3', { Sonderbau: 'nein' }, { ...BA, '0:CheckBox22': true }, 'entfällt'],
  ['I/2 Art des Gebäudes, Sonstige bauliche Anlage angekreuzt', I2, '0:CheckBox27', '0:Panel8', {}, { ...BA, '0:CheckBox22': true }, 'entfällt'],
  ['I/2 Nr. 12 Baustatistik, Sonstige bauliche Anlage angekreuzt', I2, '2:CheckBox6', '2:Panel4', {}, { ...BA, '0:CheckBox22': true }, 'entfällt'],
  ['I/2 Nr. 12 Baustatistik, Mehrfamilienhaus', I2, '2:CheckBox6', '2:Panel4', { Gebäudeart: 'Mehrfamilienhaus' }, BA, 'erforderlich'],

  // Kosten: bei Änderung oder baulicher Anlage ohne Gebäude muss es die Herstellungssumme sein
  ['I/2 Nr. 7.1 Rauminhalt, Änderung', I2, '1:CheckBox7', '1:Panel1', { Vorhaben: 'Änderung' }, BA, 'entfällt'],
  ['I/2 Nr. 7.2 Rohbaukosten, Sonstige bauliche Anlage angekreuzt', I2, '1:CheckBox8', '1:Panel1', { Vorhaben: 'Errichtung' }, { ...BA, '0:CheckBox22': true }, 'entfällt'],
  ['I/2 Nr. 7.1 Rauminhalt, Errichtung eines Gebäudes', I2, '1:CheckBox7', '1:Panel1', { Vorhaben: 'Errichtung', Gebäudeart: 'Mehrfamilienhaus' }, BA, 'erforderlich'],
  ['I/2 Nr. 7.3 Herstellungssumme, Änderung', I2, '1:CheckBox9', '1:Panel1', { Vorhaben: 'Änderung' }, BA, 'erforderlich'],
  // Erweiterung (Anbau, Aufstockung): Brutto-Rauminhalt wie bei der Errichtung (§ 6 Nr. 1 BauPrüfVO, Tarifstelle 3.1.4.1)
  ['I/2 Nr. 7.1 Rauminhalt, Erweiterung', I2, '1:CheckBox7', '1:Panel1', { Vorhaben: 'Erweiterung' }, BA, 'erforderlich'],
  ['I/1 Nr. 10.1 Rauminhalt, Erweiterung', I1, '1:CheckBox34', '1:Panel1', { Vorhaben: 'Erweiterung' }, BA, 'erforderlich'],
  ['Fertigstellung Gebäudeeinmessung, Erweiterung', FERTIG, '0:CheckBox1', null, { Vorhaben: 'Erweiterung', Gebäudeart: 'Einfamilienhaus' }, {}, 'erforderlich'],
  // Gebäude und weitere Anlage in einem Antrag: eine angekreuzte Gebäudeklasse hält die Angaben für das Gebäude
  ['I/2 Nr. 11.2 Bescheinigung, GK 4 und Sonstige bauliche Anlage angekreuzt', I2, '2:CheckBox5', '2:Panel3', { Gebäudeklasse: '4', Sonderbau: 'nein' }, { ...BA, '0:CheckBox22': true, '0:CheckBox7': true }, 'erforderlich'],
  ['I/2 Nr. 7.1 Rauminhalt, GK 3 und Sonstige bauliche Anlage angekreuzt', I2, '1:CheckBox7', '1:Panel1', { Vorhaben: 'Errichtung' }, { ...BA, '0:CheckBox22': true, '0:CheckBox6': true }, 'erforderlich'],
  ['I/2 (2024D) Nr. 14 Erklärung, GK 2 und Sonstige bauliche Anlagen angekreuzt', I2_24, '1:CheckBox22', '1:Panel1', { Gebäudeklasse: '2', Sonderbau: 'nein' }, { ...BA, '0:CheckBox22': true, '0:CheckBox5': true }, 'erforderlich'],
  ['I/3 Nr. 2.5.1 Rauminhalt, GK 1 und Sonstige bauliche Anlagen angekreuzt', I3, '1:CheckBox15', '1:Panel10', { Vorhaben: 'Errichtung' }, { '0:CheckBox1': true, '0:CheckBox22': true, '0:CheckBox8': true }, 'erforderlich'],
  // Baustatistik nur bei Gebäuden – in allen Bauanträgen
  ['I/1 Nr. 12 Baustatistik, Sonstige bauliche Anlage angekreuzt', I1, '2:CheckBox6', '2:Panel4', {}, { ...BA, '0:CheckBox22': true }, 'entfällt'],
  ['I/2 (2024D) Nr. 12 Baustatistik, Sonstige bauliche Anlagen angekreuzt', I2_24, '1:CheckBox20', '1:Panel1', {}, { ...BA, '0:CheckBox22': true }, 'entfällt'],
  ['I/3 Nr. 4 Baustatistik, Sonstige bauliche Anlagen angekreuzt', I3, '1:CheckBox6', '1:Panel6', {}, { '0:CheckBox22': true }, 'entfällt'],
  ['I/3 Nr. 4 Baustatistik, Gebäude', I3, '1:CheckBox6', '1:Panel6', {}, {}, 'erforderlich'],
  ['I/2 Nr. 7.1 Rauminhalt, Vorhaben nicht festgelegt', I2, '1:CheckBox7', '1:Panel1', {}, BA, 'offen'],
  ['I/1 Nr. 10.1 Rauminhalt, Änderung', I1, '1:CheckBox34', '1:Panel1', { Vorhaben: 'Änderung' }, BA, 'entfällt'],
  ['I/2 (2024D) Nr. 7.1 Rauminhalt, Änderung', I2_24, '1:CheckBox7', '1:Panel1', { Vorhaben: 'Änderung' }, BA, 'entfällt'],
  ['I/3 Nr. 2.5.1 Rauminhalt, Sonstige bauliche Anlagen angekreuzt', I3, '1:CheckBox15', '1:Panel10', { Vorhaben: 'Errichtung' }, { '0:CheckBox1': true, '0:CheckBox22': true }, 'entfällt'],

  // Fassung 2024D nach geltendem § 68 (Brandschutz Abs. 2, Schall/Wärme Abs. 4 Satz 2, Standsicherheit Abs. 3 Satz 5 Nr. 2)
  ['I/2 (2024D) Nr. 14 Erklärung, GK 4 ohne Sonderbau', I2_24, '1:CheckBox22', '1:Panel1', { Gebäudeklasse: '4', Sonderbau: 'nein' }, BA, 'entfällt'],
  ['I/2 (2024D) Nr. 14 Erklärung, GK 3 ohne Sonderbau', I2_24, '1:CheckBox22', '1:Panel1', { Gebäudeklasse: '3', Sonderbau: 'nein' }, BA, 'erforderlich'],
  ['I/2 (2024D) Nr. 10 Bescheinigung, Nichtwohngebäude GK 3', I2_24, '1:CheckBox12', '1:Panel1', { Gebäudeklasse: '3', Sonderbau: 'nein', Gebäudeart: 'Nichtwohngebäude' }, BA, 'entfällt'],
  ['I/2 (2024D) Nr. 10 Bescheinigung, GK 4 ohne Sonderbau', I2_24, '1:CheckBox12', '1:Panel1', { Gebäudeklasse: '4', Sonderbau: 'nein' }, BA, 'erforderlich'],
  ['I/2 (2024D) Nr. 10/14, Sonderbau', I2_24, '1:CheckBox12', '1:Panel1', { Gebäudeklasse: '5', Sonderbau: 'ja' }, BA, 'entfällt'],
  ['I/2 (2024D) Nr. 11 Schallschutz, Einfamilienhaus GK 1', I2_24, '1:CheckBox13', '1:Panel1', { Gebäudeklasse: '1', Gebäudeart: 'Einfamilienhaus' }, BA, 'entfällt'],
  ['I/2 (2024D) Nr. 11 Wärmeschutz, Mehrfamilienhaus GK 3', I2_24, '1:CheckBox14', '1:Panel1', { Gebäudeklasse: '3', Gebäudeart: 'Mehrfamilienhaus' }, BA, 'erforderlich'],
  ['I/2 (2024D) Nr. 11 Wärmeschutz, Sonstige bauliche Anlage', I2_24, '1:CheckBox14', '1:Panel1', { Gebäudeklasse: '3' }, { ...BA, '0:CheckBox22': true }, 'entfällt'],
  ['I/2 (2024D) Nr. 11 Standsicherheit, Zweifamilienhaus GK 2', I2_24, '1:CheckBox15', '1:Panel1', { Gebäudeklasse: '2', Gebäudeart: 'Zweifamilienhaus' }, BA, 'entfällt'],
  ['I/2 (2024D) Nr. 11 Standsicherheit, nicht festgelegt', I2_24, '1:CheckBox15', '1:Panel1', {}, BA, 'offen'],

  // gemischt genutzte Gebäude: Betriebsbeschreibung und Barrierefreiheit erforderlich, keine Ausnahme als Wohngebäude GK 1/2
  ['I/2 Nr. 8 Betriebsbeschreibung, Wohn- und Geschäftshaus', I2, '2:CheckBox1', '2:Panel1', { Gebäudeart: 'Wohn- und Geschäftshaus', Sonderbau: 'nein' }, BA, 'erforderlich'],
  ['I/1 Nr. 9 Betriebsbeschreibung, Wohn- und Geschäftshaus', I1, '1:CheckBox9', '1:Panel1', { Gebäudeart: 'Wohn- und Geschäftshaus' }, BA, 'erforderlich'],
  ['I/7 Barrierefreiheit, Wohn- und Geschäftshaus GK 2', BB, '0:CheckBox10', null, { Gebäudeart: 'Wohn- und Geschäftshaus', Gebäudeklasse: '2' }, {}, 'erforderlich'],
  ['I/7 Barrierefreiheit, Zweifamilienhaus GK 2', BB, '0:CheckBox10', null, { Gebäudeart: 'Zweifamilienhaus', Gebäudeklasse: '2' }, {}, 'entfällt'],
  ['Baubeginn Nr. 1 Schall/Wärme, Wohn- und Geschäftshaus GK 2', BEGINN, '1:CheckBox1', '1:Panel1', { Gebäudeart: 'Wohn- und Geschäftshaus', Gebäudeklasse: '2' }, {}, 'erforderlich'],

  // Genehmigungsfreistellung: Maßberechnung nur im Bebauungsplan; Nr. 6 bei GK 4/5 nicht (Bescheinigung nötig)
  ['I/3 Nr. 1.2 Maß, Innenbereich', I3, '1:CheckBox2', '1:Panel5', { Planungsrecht: 'Innenbereich' }, { '0:CheckBox2': true }, 'entfällt'],
  ['I/3 Nr. 2.2 Maß, Bebauungsplan', I3, '1:CheckBox12', '1:Panel10', { Planungsrecht: 'Bebauungsplan' }, { '0:CheckBox1': true }, 'erforderlich'],
  ['I/3 Nr. 6, „ja“, Gebäudeklasse 4', I3, '1:CheckBox8', '1:Panel6', { Gebäudeklasse: '4' }, { '0:CheckBox1': true }, 'entfällt'],
  ['I/3 Nr. 6, „ja“, Gebäudeklasse nicht festgelegt', I3, '1:CheckBox8', '1:Panel6', {}, { '0:CheckBox1': true }, 'offen'],
  ['I/1 Nr. 3 Flurkarte, einfacher Bebauungsplan', I1, '1:CheckBox3', '1:Panel1', { Planungsrecht: 'einfacher Bebauungsplan' }, BA, 'erforderlich'],
];

describe('Fallmatrix der Pflichtvorlagen', () => {
  it.each(FAELLE)('%s', (_fall, vorgabe, feld, abschnitt, merkmale, werte, soll) => {
    expect(VORGABEN[vorgabe], vorgabe).toBeDefined();
    expect(zustand(vorgabe, feld, abschnitt, merkmale, werte)).toBe(soll);
  });

  it('„Gebäudeart: kein Gebäude“ kreuzt „Sonstige bauliche Anlage“ vor – daran hängen Kosten, Brandschutz und Baustatistik', () => {
    for (const k of [I1, I2, I2_24, I3]) expect(PRUEFREGELN[k].merkmalFelder?.Gebäudeart, k).toEqual({ 'kein Gebäude': '0:CheckBox22' });
  });

  it('Hinweise zu Vordrucken mit geänderter Rechtsgrundlage erscheinen immer (referenzielles Verfahren, Adressat der Anzeige)', () => {
    const k = { merkmale: {}, wert: () => false };
    const texte = (v: string) => plausibilitaet([], VORGABEN[v], k, () => false, PRUEFREGELN[v]).map((p) => p.text);
    expect(texte('nw010003|2022B').join()).toContain('seit 01.01.2024 aufgehoben');
    expect(texte('nw010004|2026C').join()).toContain('bei der Bauaufsichtsbehörde einzureichen');
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
