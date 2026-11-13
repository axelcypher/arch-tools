import { afterEach, describe, expect, it } from 'vitest';
import { schliessenVorbereiten } from '@core/platform/rahmen';
import { ausstehendAbwarten, klammer, laufendeSchreibvorgaenge, mitVerfolgung, verfolgen, vorDemSchliessenAnmelden } from './ausstehend';
import { SpeicherDateisystem } from './dateisystem';

/** Promise, das sich von außen erfüllen bzw. zurückweisen lässt */
function offen() {
  let fertig!: () => void;
  let fehler!: (e: unknown) => void;
  const p = new Promise<void>((a, b) => ((fertig = a), (fehler = b)));
  return { p, fertig, fehler };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

// die Menge ist modulweit: nach jedem Test muss sie leer sein (sonst warteten folgende Tests auf Fremdes)
afterEach(() => {
  expect(laufendeSchreibvorgaenge()).toBe(0);
});

describe('laufende Schreibvorgänge vor dem Schließen', () => {
  it('wartet auf laufendes Schreiben – auch auf ein gescheitertes und auf eines, das währenddessen dazukommt', async () => {
    const a = offen();
    const b = offen();
    void verfolgen(a.p);
    void verfolgen(b.p).catch(() => undefined);
    expect(laufendeSchreibvorgaenge()).toBe(2);
    let fertig = false;
    const warten = ausstehendAbwarten().then(() => (fertig = true));
    await tick();
    expect(fertig).toBe(false);
    b.fehler(new Error('Netzlaufwerk weg'));
    await tick();
    expect(fertig).toBe(false);
    // Folgeschreiben, während noch gewartet wird
    const c = offen();
    void verfolgen(c.p);
    a.fertig();
    await tick();
    expect(fertig).toBe(false);
    c.fertig();
    await warten;
    expect(fertig).toBe(true);
    expect(laufendeSchreibvorgaenge()).toBe(0);
  });

  it('ohne laufendes Schreiben sofort fertig; mehrfach aufgerufen schreibt es nichts (es wartet nur)', async () => {
    let geschrieben = 0;
    const schreiben = () => verfolgen(Promise.resolve().then(() => void geschrieben++));
    void schreiben();
    await Promise.all([ausstehendAbwarten(), ausstehendAbwarten()]);
    await ausstehendAbwarten();
    expect(geschrieben).toBe(1);
    expect(laufendeSchreibvorgaenge()).toBe(0);
  });

  it('beim Rahmen angemeldet: schliessenVorbereiten wartet bis zum Ende des Schreibens; abgemeldet nicht mehr', async () => {
    const abmelden = vorDemSchliessenAnmelden();
    try {
      const a = offen();
      void verfolgen(a.p);
      let bereit: boolean | null = null;
      const vorbereiten = schliessenVorbereiten(2000).then((ok) => (bereit = ok));
      await tick();
      expect(bereit).toBeNull();
      a.fertig();
      await vorbereiten;
      expect(bereit).toBe(true);
    } finally {
      abmelden();
    }
    // Gegenprobe: abgemeldet wartet der Rahmen nicht auf neues Schreiben
    const b = offen();
    void verfolgen(b.p);
    expect(await schliessenVorbereiten(2000)).toBe(true);
    b.fertig();
    await ausstehendAbwarten();
  });

  it('mehrere Vorbereitungen gleichzeitig, während geschrieben wird: es wird genau einmal geschrieben', async () => {
    const abmelden = vorDemSchliessenAnmelden();
    try {
      let geschrieben = 0;
      const a = offen();
      void verfolgen(a.p.then(() => void geschrieben++));
      const beide = Promise.all([schliessenVorbereiten(2000), schliessenVorbereiten(2000)]);
      await tick();
      a.fertig();
      expect(await beide).toEqual([true, true]);
      expect(geschrieben).toBe(1);
    } finally {
      abmelden();
    }
  });

  it('Ergebnis: true, wenn alles geschrieben ist; false, wenn ein abgewartetes Schreiben gescheitert ist', async () => {
    expect(await ausstehendAbwarten()).toBe(true);
    void verfolgen(Promise.resolve());
    expect(await ausstehendAbwarten()).toBe(true);
    const a = offen();
    void verfolgen(a.p).catch(() => undefined);
    void verfolgen(Promise.resolve());
    const ergebnis = ausstehendAbwarten();
    a.fehler(new Error('Netzlaufwerk weg'));
    expect(await ergebnis).toBe(false);
    // danach wieder sauber
    expect(await ausstehendAbwarten()).toBe(true);
  });

  it('Klammer: verfolgt bis zum Aufruf, mehrfacher Aufruf schadet nicht', async () => {
    const fertig = klammer();
    expect(laufendeSchreibvorgaenge()).toBe(1);
    fertig();
    fertig();
    await ausstehendAbwarten();
    expect(laufendeSchreibvorgaenge()).toBe(0);
  });

  it('Dateisystem mit Verfolgung: Schreibbefehle (auch der Projektordner) werden verfolgt, Lesen nicht', async () => {
    const roh = new SpeicherDateisystem();
    const ds = mitVerfolgung(roh);
    const p1 = ds.dokumentAnlegen('C:/P', 'a.pdf', new Uint8Array([1]));
    expect(laufendeSchreibvorgaenge()).toBe(1);
    await p1;
    await tick();
    expect(laufendeSchreibvorgaenge()).toBe(0);
    const lesen = ds.lies('C:/P', 'a.pdf');
    expect(laufendeSchreibvorgaenge()).toBe(0);
    expect(await lesen).toEqual(new Uint8Array([1]));
    // Projektordner: Datei anlegen verfolgt, Lesen nicht; dieselbe Hülle bei jedem Zugriff
    expect(ds.projektordner).toBe(ds.projektordner);
    const p2 = ds.projektordner.dateiAnlegen('C:/P', 'b.oap', new Uint8Array([2]));
    expect(laufendeSchreibvorgaenge()).toBe(1);
    await p2;
    await tick();
    const l2 = ds.projektordner.lies('C:/P', 'b.oap');
    expect(laufendeSchreibvorgaenge()).toBe(0);
    await l2;
    // gescheitertes Schreiben verlässt die Menge ebenso
    await expect(ds.dokumentAnlegen('C:/P', 'a.pdf', new Uint8Array([3]))).rejects.toThrow();
    await tick();
  });
});
