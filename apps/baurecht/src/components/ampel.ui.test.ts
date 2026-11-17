// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { inBereichZeigen, scrollBereich } from './Ampel';

/** Rechteck für getBoundingClientRect (nur top/bottom/height zählen) */
const rechteck = (top: number, height: number) => ({ top, bottom: top + height, height, left: 0, right: 100, width: 100, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

/**
 * Karte mit Rumpf (Scrollbereich 0–400 px), darin eine Liste und eine Zeile; `zeileOben` ist die Lage der Zeile im
 * Fenster, `polster` das scroll-padding-top des Rumpfs (stehendes Suchfeld)
 */
function aufbau(zeileOben: number, polster = '') {
  document.body.innerHTML = '<section class="karte"><div class="karte-rumpf"><div class="liste"><button class="zeile">x</button></div></div></section>';
  const rumpf = document.querySelector<HTMLElement>('.karte-rumpf')!;
  const liste = document.querySelector<HTMLElement>('.liste')!;
  const zeile = document.querySelector<HTMLElement>('.zeile')!;
  rumpf.getBoundingClientRect = () => rechteck(0, 400);
  zeile.getBoundingClientRect = () => rechteck(zeileOben, 20);
  Object.defineProperty(rumpf, 'clientHeight', { value: 400 });
  rumpf.style.scrollPaddingTop = polster;
  rumpf.scrollTop = 1000;
  return { rumpf, liste, zeile };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('inBereichZeigen: scrollt den Rumpf der Karte', () => {
  it('findet den Scrollbereich über die Karte, auch von einer Liste darin aus; ohne Karte das Element selbst', () => {
    const { rumpf, liste } = aufbau(0);
    expect(scrollBereich(liste)).toBe(rumpf);
    const frei = document.createElement('div');
    expect(scrollBereich(frei)).toBe(frei);
    expect(scrollBereich(null)).toBeNull();
  });

  it('„naechst“: eine Zeile oberhalb wird knapp unter den oberen Rand geholt, eine Zeile unterhalb knapp über den unteren', () => {
    const oben = aufbau(-50);
    inBereichZeigen(oben.liste, oben.zeile);
    expect(oben.rumpf.scrollTop).toBe(1000 - 50 - 8);
    const unten = aufbau(420);
    inBereichZeigen(unten.liste, unten.zeile);
    expect(unten.rumpf.scrollTop).toBe(1000 + 40 + 8);
    // sichtbar: nichts zu tun
    const sichtbar = aufbau(100);
    inBereichZeigen(sichtbar.liste, sichtbar.zeile);
    expect(sichtbar.rumpf.scrollTop).toBe(1000);
  });

  it('„naechst“ mit stehendem Suchfeld (scroll-padding-top): eine Zeile unter dem Suchfeld gilt als verdeckt', () => {
    const { rumpf, liste, zeile } = aufbau(20, '46px');
    inBereichZeigen(liste, zeile);
    // die Zeile landet 8 px unter dem Suchfeld (46 px), nicht am oberen Rand des Rumpfs
    expect(rumpf.scrollTop).toBe(1000 + 20 - 46 - 8);
  });

  it('„mitte“: die Zeile steht in der Mitte des freien Bereichs – mit Suchfeld unter ihm', () => {
    const ohne = aufbau(300);
    inBereichZeigen(ohne.liste, ohne.zeile, 'mitte');
    // Mitte des Rumpfs (400 px): Zeile oben bei 190
    expect(ohne.rumpf.scrollTop).toBe(1000 + 300 - 190);
    const mit = aufbau(300, '40px');
    inBereichZeigen(mit.liste, mit.zeile, 'mitte');
    // freier Bereich 40–400 px: Zeile oben bei 40 + (360 − 20) / 2 = 210
    expect(mit.rumpf.scrollTop).toBe(1000 + 300 - 210);
  });
});
