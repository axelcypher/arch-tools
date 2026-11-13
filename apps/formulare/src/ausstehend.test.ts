import { afterEach, describe, expect, it } from 'vitest';
import { schliessenVorbereiten } from '@core/platform/rahmen';
import { ausstehendAbwarten, gescheitertVergessen, klammer, laufendeSchreibvorgaenge, mitVerfolgung, standSpeichern, verfolgen, vorDemSchliessenAnmelden } from './ausstehend';
import { createProject } from '@core/model';
import { writeArchive } from '@core/archive';
import { projektdateiSchreiben } from '@core/platform/projektordner';
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
  gescheitertVergessen();
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
      let bereit: string | null = null;
      const vorbereiten = schliessenVorbereiten(2000).then((ok) => (bereit = ok));
      await tick();
      expect(bereit).toBeNull();
      a.fertig();
      await vorbereiten;
      expect(bereit).toBe('fertig');
    } finally {
      abmelden();
    }
    // Gegenprobe: abgemeldet wartet der Rahmen nicht auf neues Schreiben
    const b = offen();
    void verfolgen(b.p);
    expect(await schliessenVorbereiten(2000)).toBe('fertig');
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
      expect(await beide).toEqual(['fertig', 'fertig']);
      expect(geschrieben).toBe(1);
    } finally {
      abmelden();
    }
  });

  it('beim Rahmen angemeldet: ein gescheitertes Schreiben ergibt „fehler“ (Arkly fragt „… konnte nicht speichern“)', async () => {
    const abmelden = vorDemSchliessenAnmelden();
    try {
      const a = offen();
      void verfolgen(a.p).catch(() => undefined);
      const vorbereiten = schliessenVorbereiten(2000);
      await tick();
      a.fehler(new Error('Netzlaufwerk weg'));
      expect(await vorbereiten).toBe('fehler');
      // Gegenprobe: danach ist nichts mehr offen – fertig
      expect(await schliessenVorbereiten(2000)).toBe('fertig');
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
  it('gescheitertes Speichern eines Stands bleibt gemerkt: weiter false, bis dieselbe Datei gelingt (Vertrag von vorDemSchliessen)', async () => {
    const roh = new SpeicherDateisystem();
    const ds = mitVerfolgung(roh);
    const speichern = (pfad: string) => standSpeichern('C:/F', pfad, ds.ersetze('C:/F', pfad, new Uint8Array([1])));
    // Formular gibt es (noch) nicht: Speichern scheitert
    await expect(speichern('a.frmsjf')).rejects.toThrow('nicht gefunden');
    await tick();
    expect(laufendeSchreibvorgaenge()).toBe(0);
    // Schließen lange nach dem Fehler bzw. „Erneut versuchen“ ohne neues Speichern: weiter false
    expect(await ausstehendAbwarten()).toBe(false);
    expect(await ausstehendAbwarten()).toBe(false);
    // Gegenprobe: eine andere Datei gelingt – die gescheiterte bleibt offen
    roh.dateien.set('C:/F/b.frmsjf', new Uint8Array([0]));
    await speichern('b.frmsjf');
    await tick();
    expect(await ausstehendAbwarten()).toBe(false);
    // dieselbe Datei gelingt: gespeichert, true
    roh.dateien.set('C:/F/a.frmsjf', new Uint8Array([0]));
    await speichern('a.frmsjf');
    await tick();
    expect(await ausstehendAbwarten()).toBe(true);
  });

  it('beim Rahmen angemeldet: nach gescheitertem Speichern bleibt es „fehler“, nach gelungenem „fertig“', async () => {
    const abmelden = vorDemSchliessenAnmelden();
    try {
      const roh = new SpeicherDateisystem();
      const ds = mitVerfolgung(roh);
      const speichern = () => standSpeichern('C:/P', 'liste.xlsx', ds.dokumentErsetzen('C:/P', 'liste.xlsx', new Uint8Array([1])));
      await expect(speichern()).rejects.toThrow();
      await tick();
      expect(await schliessenVorbereiten(2000)).toBe('fehler');
      expect(await schliessenVorbereiten(2000)).toBe('fehler');
      roh.dateien.set('C:/P/liste.xlsx', new Uint8Array([0]));
      await speichern();
      await tick();
      expect(await schliessenVorbereiten(2000)).toBe('fertig');
    } finally {
      abmelden();
    }
  });

  it('einmalige Aktionen (PDF-Export ersetzt eine Datei, anlegen) zählen nur, solange sie abgewartet werden – kein bleibender Fehler', async () => {
    const ds = mitVerfolgung(new SpeicherDateisystem());
    // Export: dokumentErsetzen ohne standSpeichern (z. B. PDF im Reader gesperrt bzw. nicht vorhanden)
    await expect(ds.dokumentErsetzen('C:/P', 'Export.pdf', new Uint8Array([1]))).rejects.toThrow();
    await ds.dokumentAnlegen('C:/P', 'a.pdf', new Uint8Array([1]));
    await expect(ds.dokumentAnlegen('C:/P', 'a.pdf', new Uint8Array([2]))).rejects.toThrow();
    await tick();
    expect(await ausstehendAbwarten()).toBe(true);
  });

  it('umbenannt wandert der Merker mit, gelöscht entfällt er', async () => {
    const roh = new SpeicherDateisystem();
    const ds = mitVerfolgung(roh);
    const scheitern = (pfad: string) => standSpeichern('C:/F', pfad, Promise.reject(new Error('Netzlaufwerk weg'))).catch(() => undefined);
    roh.dateien.set('C:/F/alt.pdf', new Uint8Array([0]));
    await scheitern('alt.pdf');
    await ds.umbenennen('C:/F', 'alt.pdf', 'neu.pdf');
    await tick();
    expect(await ausstehendAbwarten()).toBe(false);
    // unter dem neuen Namen gespeichert: erledigt (der alte Name hängt nicht mehr)
    await standSpeichern('C:/F', 'neu.pdf', ds.dokumentErsetzen('C:/F', 'neu.pdf', new Uint8Array([1])));
    await tick();
    expect(await ausstehendAbwarten()).toBe(true);
    // gelöscht: nichts mehr zu speichern
    await scheitern('neu.pdf');
    expect(await ausstehendAbwarten()).toBe(false);
    await ds.loeschen('C:/F', 'neu.pdf');
    await tick();
    expect(await ausstehendAbwarten()).toBe(true);
    // Gegenprobe: gescheitertes Umbenennen lässt den Merker am alten Namen
    roh.dateien.set('C:/F/x.pdf', new Uint8Array([0]));
    await scheitern('x.pdf');
    await expect(ds.umbenennen('C:/F', 'fehlt.pdf', 'y.pdf')).rejects.toThrow();
    await tick();
    expect(await ausstehendAbwarten()).toBe(false);
  });

  it('Projektdatei „inzwischen geändert“, zweiter Versuch gelingt (projektdateiSchreiben): danach ist nichts offen', async () => {
    const roh = new SpeicherDateisystem();
    const ds = mitVerfolgung(roh);
    roh.dateien.set('C:/P/Projekt.oap', writeArchive(createProject('Muster')));
    // beim ersten Ersetzen hat „jemand anderes“ die Datei eben geändert: Konflikt, neu lesen, zweiter Versuch
    let versuche = 0;
    const po = new Proxy(ds.projektordner, {
      get(t, k) {
        const w = Reflect.get(t, k) as unknown;
        if (k !== 'projektdateiErsetzen') return w;
        return (root: string, pfad: string, daten: Uint8Array, stand: { groesse: number; geaendert: number }) => {
          if (++versuche === 1) roh.beruehren('C:/P/Projekt.oap');
          return (w as typeof t.projektdateiErsetzen)(root, pfad, daten, stand);
        };
      },
    });
    const geschrieben = await standSpeichern(
      'C:/P',
      'Projekt.oap',
      projektdateiSchreiben(po, 'C:/P', 'Projekt.oap', (roh2) => ({ ...roh2, notiz: 'neu' })),
    );
    await tick();
    expect(geschrieben).toBe(true);
    expect(versuche).toBe(2);
    expect(await ausstehendAbwarten()).toBe(true);
  });
});
