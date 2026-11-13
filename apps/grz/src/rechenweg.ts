import { fmt2 } from '@core/format';
import type { Teilflaeche, Zerlegung } from '@core/flaechenZerlegung';
import { flaecheZerlegen } from '@core/flaechenZerlegung';
import { pointInPolygon } from '@core/geometry';
import type { Point } from '@core/geometry';
import { polygoneOf } from '@core/polygon';
import type { Kennzahl, Nachweis } from './massNutzung';
import { kennzahlWert } from './texte';

/**
 * Prüffähiger Rechenweg des GRZ-Nachweises (G-20): Formelzeilen (GRZ = GR / FGst …) und je Fläche die Zerlegung in
 * Rechtecke und Dreiecke mit Maßen. Gezählt wird der eindeutige Anteil (ohne Gebäude und Überlagerungen) – die Summe
 * der Teilflächen ist exakt die Fläche, die in den Nachweis eingeht.
 */

export interface RechenwegFlaeche {
  /** Nummer wie im Druck („H“ für die Hauptanlage) */
  nr: string;
  /** Lageplan-Fläche (fehlt bei der Hauptanlage) */
  id?: string;
  name: string;
  zerlegung: Zerlegung;
}

export interface Rechenweg {
  formeln: string[];
  flaechen: RechenwegFlaeche[];
}

const m2 = (v: number) => `${fmt2(v)} m²`;

/** Formelzeile einer Kennzahl: „GRZ I = 135,00 m² / 612,50 m² = 0,220“ */
function kennzahlFormel(titel: string, k: Kennzahl, G: number | undefined, mit = false): string {
  const fl = mit ? k.flaecheMitOffenen! : k.flaeche;
  if (G === undefined) return `${titel} = ${m2(fl)} / Grundstücksfläche (fehlt)`;
  return `${titel} = ${m2(fl)} / ${m2(G)} = ${kennzahlWert(k, mit ? k.mitOffenen : k.wert)}`;
}

/** Zerlegung eines MultiPolygons in Ringform (Druck: Hauptanlage als Ringe mit Löchern) */
function zerlegeRinge(ringe: Point[][]): Zerlegung {
  // Außenringe und Löcher trennen: ein Ring in einem anderen ist ein Loch
  const polygone = ringe
    .filter((r) => !ringe.some((o) => o !== r && r.every((p) => pointInPolygon(p, o))))
    .map((aussen) => ({ aussen, loecher: ringe.filter((r) => r !== aussen && r.every((p) => pointInPolygon(p, aussen))) }));
  return flaecheZerlegen(polygone);
}

/**
 * Nummern der Lageplan-Flächen wie im Druck, in der App und im Excel: eigene Flächen in Listenfolge, 1, 2, 3 …
 * (Nachbarflächen ohne Nummer)
 */
export function flaechenNummern(n: Nachweis): Map<string, number> {
  return new Map(n.lageplan.filter((l) => !l.nachbar).map((l, i) => [l.id, i + 1]));
}

export function rechenweg(n: Nachweis, nr: Map<string, number> = flaechenNummern(n)): Rechenweg {
  const G = n.grundstueck.flaeche;
  const vor1990 = n.recht.baunvo !== '1990';
  const eigene = n.lageplan.filter((l) => !l.nachbar);
  const angerechnet = eigene.reduce((a, l) => a + l.angerechnet, 0) + (n.unterirdisch?.angerechnet ?? 0);
  const formeln: string[] = [];
  if (n.grundstueck.gemeinschaftsanlagen !== undefined && n.grundstueck.basis !== undefined)
    formeln.push(`FGst = Grundstück ${m2(n.grundstueck.basis)} + Anteil an Gemeinschaftsanlagen (§ 21a Abs. 2 BauNVO) ${m2(n.grundstueck.gemeinschaftsanlagen)} = ${m2(G!)}`);
  if (vor1990) {
    const garagen = n.garagenFrei ?? 0;
    const teile = [`Hauptanlage ${m2(n.hauptanlage)}`];
    if (angerechnet + garagen > 0.005) teile.push(`angerechnete Anlagen ${m2(angerechnet + garagen)}`);
    if (garagen > 0.005) teile.push(`− Garagen anrechnungsfrei (${n.recht.baunvo === '1962' ? '§ 19 Abs. 5 BauNVO 1962' : '§ 21a Abs. 3'}) ${m2(garagen)}`);
    formeln.push(`GR = ${teile.join(' + ').replace('+ −', '−')} = ${m2(n.grz.flaeche)}`);
    formeln.push(kennzahlFormel('GRZ = GR / FGst', n.grz, G));
    if (n.grz.flaecheMitOffenen !== undefined) formeln.push(kennzahlFormel('GRZ mit ungeklärten Flächen', n.grz, G, true));
  } else {
    // GR I: Hauptanlage und Flächen, die ihr zugerechnet werden (Einstufung „GRZ I“)
    const zugerechnet = n.grz.flaeche - n.hauptanlage;
    formeln.push(
      zugerechnet > 0.005 ? `GR I = Hauptanlage ${m2(n.hauptanlage)} + der Hauptanlage zugerechnete Flächen ${m2(zugerechnet)} = ${m2(n.grz.flaeche)}` : `GR I = Hauptanlage ${m2(n.hauptanlage)}`,
    );
    formeln.push(kennzahlFormel('GRZ I = GR I / FGst', n.grz, G));
    if (n.grz.flaecheMitOffenen !== undefined) formeln.push(kennzahlFormel('GRZ I mit ungeklärten Flächen (Terrassen, Wege)', n.grz, G, true));
    if (n.grz2) {
      formeln.push(`GR II = GR I ${m2(n.grz.flaeche)} + Anlagen nach § 19 Abs. 4 BauNVO ${m2(n.grz2.flaeche - n.grz.flaeche)} = ${m2(n.grz2.flaeche)}`);
      formeln.push(kennzahlFormel('GRZ II = GR II / FGst', n.grz2, G));
      if (n.grz2.flaecheMitOffenen !== undefined) formeln.push(kennzahlFormel('GRZ II mit ungeklärten Flächen', n.grz2, G, true));
    }
  }
  const gf = n.gfJeGeschoss.filter((g) => g.flaeche > 0.005);
  formeln.push(
    `GF = ${gf.length ? gf.map((g) => (g.abzug ? `${g.name} (${m2(g.flaeche + g.abzug)} − nicht mitgerechnet ${m2(g.abzug)})` : `${g.name} ${m2(g.flaeche)}`)).join(' + ') : '0,00 m²'} = ${m2(n.gf)}`,
  );
  formeln.push(kennzahlFormel('GFZ = GF / FGst', n.gfz, G));
  if (n.gfz.flaecheMitOffenen !== undefined) formeln.push(kennzahlFormel('GFZ mit zu prüfenden Aufenthaltsräumen', n.gfz, G, true));

  const flaechen: RechenwegFlaeche[] = [];
  if (n.hauptanlagePolygone.length) flaechen.push({ nr: 'H', name: 'Hauptanlage (Gebäude)', zerlegung: zerlegeRinge(n.hauptanlagePolygone) });
  for (const l of eigene) {
    if (l.flaecheEindeutig < 0.005) continue;
    flaechen.push({ nr: String(nr.get(l.id) ?? ''), id: l.id, name: l.name || 'Fläche', zerlegung: flaecheZerlegen(polygoneOf(l.eindeutig)) });
  }
  return { formeln, flaechen };
}

/** Bezeichnung einer Teilfläche: „1.2 Rechteck“ */
export const teilName = (nr: string, i: number, t: Teilflaeche) => `${nr}.${i + 1} ${t.art === 'rechteck' ? 'Rechteck' : 'Dreieck'}`;
