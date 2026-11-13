import { describe, expect, it } from 'vitest';
import { schliessenVorbereiten } from '@core/platform/rahmen';
import { ausstehendAbwarten, laufendeSchreibvorgaenge, verfolgen, vorDemSchliessenAnmelden } from './ausstehend';

/** Promise, das sich von außen erfüllen bzw. zurückweisen lässt */
function offen() {
  let fertig!: () => void;
  let fehler!: (e: unknown) => void;
  const p = new Promise<void>((a, b) => ((fertig = a), (fehler = b)));
  return { p, fertig, fehler };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

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
    const a = offen();
    void verfolgen(a.p);
    let bereit: boolean | null = null;
    const vorbereiten = schliessenVorbereiten(2000).then((ok) => (bereit = ok));
    await tick();
    expect(bereit).toBeNull();
    a.fertig();
    await vorbereiten;
    expect(bereit).toBe(true);
    abmelden();
    // Gegenprobe: abgemeldet wartet der Rahmen nicht auf neues Schreiben
    const b = offen();
    void verfolgen(b.p);
    expect(await schliessenVorbereiten(2000)).toBe(true);
    b.fertig();
    await ausstehendAbwarten();
  });
});
