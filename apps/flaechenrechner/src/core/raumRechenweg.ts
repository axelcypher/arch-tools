import { effektiveWofl, raumUmAbzug } from '@core/calc';
import { flaecheZerlegen } from '@core/flaechenZerlegung';
import { polygonArea } from '@core/geometry';
import type { Project, RoomShape, Storey } from '@core/model';
import { roomArea } from '@core/model';
import { woflFaktor } from '@core/norms';

/**
 * Rechenweg je Raum (F-13): Maße → Rohfläche, Putzabzug, Abzugsflächen, Anrechnung – so, dass die Summe der Zeilen
 * exakt das Ergebnis der Auswertung ergibt (sonst passt z. B. 9,40 × 7,40 nicht zu 67,47 m²).
 *  - rechteckig bzw. rechtwinklig: Rechtecke L × B; sonst Dreiecke g × h / 2 (Summe = Polygonfläche);
 *    geht beides nicht: Fläche aus Koordinaten (Gauß’sche Formel)
 *  - Putzabzug als eigene Minuszeile
 *  - Abzugsflächen im Raum als eigene Minuszeilen (FR-03): sie mindern NRF und/oder Wohnfläche
 */

export type ZeilenArt = 'teil' | 'gauss' | 'putz' | 'abzug' | 'nrf' | 'wofl';

export interface RechenwegZeile {
  art: ZeilenArt;
  /** z. B. „Rechteck 1“, „Putzabzug 3 %“, „Abzug Schornstein“ */
  text: string;
  /** Länge bzw. Grundseite [m] (Teile) */
  laenge?: number;
  /** Breite bzw. Höhe [m] (Teile) */
  breite?: number;
  /** 1 Rechteck, ½ Dreieck; Prozentsatz beim Putzabzug; Anrechnungsfaktor bei der Wohnfläche */
  faktor?: number;
  /** Fläche der Zeile mit Vorzeichen [m²] */
  flaeche: number;
  /** nur Abzugsflächen: mindert die NRF bzw. die Wohnfläche */
  nrf?: boolean;
  wofl?: boolean;
}

export interface RaumRechenweg {
  zeilen: RechenwegZeile[];
  /** Polygonfläche ohne Abzug */
  roh: number;
  /** Fläche nach Putzabzug (= Fläche des Raums in der Auswertung) */
  flaeche: number;
  /** NRF des Raums abzüglich seiner Abzugsflächen */
  nrf: number;
  /** angerechnete Wohnfläche abzüglich der Abzugsflächen */
  wofl: number;
}

const z2 = (v: number) => v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const z3 = (v: number) => v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 3 });

export function raumRechenweg(r: RoomShape, storey: Storey, project: Project): RaumRechenweg {
  const zeilen: RechenwegZeile[] = [];
  const roh = polygonArea(r.points);
  const z = flaecheZerlegen([{ aussen: r.points }], { maxTeile: 8 });
  if (z.zerlegt) {
    z.teile.forEach((t, i) =>
      zeilen.push({ art: 'teil', text: `${t.art === 'rechteck' ? 'Rechteck' : 'Dreieck'} ${i + 1}`, laenge: t.laenge, breite: t.breite, faktor: t.faktor, flaeche: t.flaeche }),
    );
  } else zeilen.push({ art: 'gauss', text: 'Fläche aus Koordinaten (Gauß’sche Formel)', flaeche: roh });
  const p = r.putzabzug ?? 0;
  if (p > 0) zeilen.push({ art: 'putz', text: `Putzabzug ${z2(p)} %`, faktor: p, flaeche: -roh * (p / 100) });
  const flaeche = roomArea(r);

  // Abzugsflächen, die in diesem Raum liegen
  const abzuege = storey.shapes.filter((s): s is RoomShape => s.kind === 'room' && s.subtract && s.points.length >= 3 && raumUmAbzug(s, storey) === r);
  const fRaum = woflFaktor(r.wofl, project.settings);
  // außerhalb der BGF (ebenerdige Terrasse): keine NRF, auch nicht über die Abzüge darin
  const draussen = !!r.ausserhalbBgf;
  let nrf = draussen ? 0 : flaeche;
  let woflBasis = flaeche;
  // Wohnfläche wie in der Auswertung: Raum × Faktor − Σ Abzug × Faktor des Abzugs
  let wofl = r.wofl.kategorie === 'keine' ? 0 : flaeche * fRaum;
  let gleicherFaktor = true;
  for (const a of abzuege) {
    const art = a.abzugArt ?? 'beide';
    const f = roomArea(a);
    const nrfJa = art !== 'wofl' && !draussen;
    const fa = art === 'din' ? 0 : woflFaktor(effektiveWofl(a, storey), project.settings);
    const woflJa = fa > 0;
    zeilen.push({
      art: 'abzug',
      text: `Abzug ${a.name || 'Abzugsfläche'}${art === 'wofl' ? ' (nur Wohnfläche)' : art === 'din' ? ' (nur NRF)' : ''}`,
      flaeche: -f,
      nrf: nrfJa,
      wofl: woflJa,
      faktor: fa,
    });
    if (nrfJa) nrf -= f;
    if (woflJa) {
      woflBasis -= f;
      wofl -= f * fa;
      if (Math.abs(fa - fRaum) > 1e-9) gleicherFaktor = false;
    }
  }
  if (!draussen && abzuege.some((a) => (a.abzugArt ?? 'beide') !== 'wofl')) zeilen.push({ art: 'nrf', text: 'NRF des Raums', flaeche: nrf });

  // Anrechnung nach WoFlV
  if (r.wofl.kategorie !== 'keine' && !gleicherFaktor) {
    // Abzüge mit eigener Anrechnung: Raum und Abzüge je mit ihrem Faktor
    zeilen.push({ art: 'wofl', text: `Wohnfläche Raum: ${z2(flaeche)} m² × ${z3(fRaum)}`, faktor: fRaum, flaeche: flaeche * fRaum });
    for (const z of zeilen.filter((x) => x.art === 'abzug' && x.wofl))
      zeilen.push({ art: 'wofl', text: `− ${z.text.replace(/^Abzug /, '')}: ${z2(-z.flaeche)} m² × ${z3(z.faktor!)}`, faktor: z.faktor, flaeche: z.flaeche * z.faktor! });
  } else if (r.wofl.kategorie !== 'keine') {
    const f = fRaum;
    if (r.wofl.kategorie === 'hoehen' && r.wofl.anteile) {
      const a = r.wofl.anteile;
      zeilen.push({ art: 'wofl', text: `Raumteile ≥ 2 m: ${z2(woflBasis * a.h2)} m² × 1`, faktor: 1, flaeche: woflBasis * a.h2 });
      zeilen.push({ art: 'wofl', text: `Raumteile 1–2 m: ${z2(woflBasis * a.h12)} m² × 0,5`, faktor: 0.5, flaeche: woflBasis * a.h12 * 0.5 });
      if (a.h01 > 0) zeilen.push({ art: 'wofl', text: `Raumteile < 1 m: ${z2(woflBasis * a.h01)} m² × 0`, faktor: 0, flaeche: 0 });
    } else zeilen.push({ art: 'wofl', text: `Wohnfläche: ${z2(woflBasis)} m² × ${z3(f)}`, faktor: f, flaeche: wofl });
  }
  return { zeilen, roh, flaeche, nrf, wofl };
}

/** Rechenweg als eine Textzeile, z. B. „4,00 × 5,00 = 20,00 m²; − 3,00 % Putzabzug = 19,40 m²; WoFl 19,40 m² × 1 = 19,40 m²“ */
export function rechenwegText(w: RaumRechenweg): string {
  const teile: string[] = [];
  const geo = w.zeilen.filter((z) => z.art === 'teil' || z.art === 'gauss');
  if (geo.length === 1 && geo[0].art === 'gauss') teile.push(`A (Koordinaten) = ${z2(w.roh)} m²`);
  else teile.push(`${geo.map((z) => `${z2(z.laenge!)} × ${z2(z.breite!)}${z.faktor === 0.5 ? ' / 2' : ''}`).join(' + ')} = ${z2(w.roh)} m²`);
  for (const z of w.zeilen) if (z.art === 'putz') teile.push(`− ${z2(z.faktor!)} % Putzabzug = ${z2(w.flaeche)} m²`);
  for (const z of w.zeilen) if (z.art === 'abzug') teile.push(`− ${z.text.replace(/^Abzug /, '')} ${z2(-z.flaeche)} m²`);
  const nrf = w.zeilen.find((z) => z.art === 'nrf');
  if (nrf) teile.push(`NRF ${z2(nrf.flaeche)} m²`);
  const wz = w.zeilen.filter((z) => z.art === 'wofl');
  if (wz.length) teile.push(`WoFl ${wz.map((z) => z.text.replace(/^Wohnfläche: /, '')).join(' + ')} = ${z2(w.wofl)} m²`);
  return teile.join('; ');
}
