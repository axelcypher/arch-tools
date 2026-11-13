import type { ProjectResult } from '@core/calc';
import { computeProject } from '@core/calc';
import type { Kosten, KostenPosition, KostenStand, KostenStufe, Project, Spanne } from '@core/model';
import { KOSTEN_STUFEN, newId } from '@core/model';
import { istKg, istRisiko, KG_RISIKO, kg1, kg2, kgInBasis, kgName, kgUnter } from './din276';
import type { Mengen, MengenBezug } from './mengen';
import type { IfcWand } from './waende';
import { MENGEN_INFO, mengen, mengenWerte } from './mengen';

/**
 * Rechenkern der Kostenermittlung (unabhängig von der Oberfläche):
 *   Kosten = Menge × Kennwert × Faktor   (Faktor = Baupreisindex aktuell/Basis × Regionalfaktor)
 * je Position als Bandbreite von / Mittel / bis. Pauschalen gelten unverändert, Prozentpositionen
 * (z. B. Baunebenkosten) beziehen sich auf die Summe der angegebenen Kostengruppen.
 * Gerechnet wird netto; enthalten die Kennwerte die Umsatzsteuer, werden sie vorher herausgerechnet.
 * Kostenrisiken (Kennung KG_RISIKO statt einer Kostengruppe) werden gesondert ausgewiesen (DIN 276:2018-12):
 * nicht in den Summen der Kostengruppen, aber in den Gesamtkosten.
 */

export const MWST_STANDARD = 19;

export interface PositionErgebnis {
  pos: KostenPosition;
  /** Menge in der Bezugseinheit (Pauschale 1, Prozent: Grundlage in €) */
  menge: number;
  einheit: string;
  /** Kennwert nach Faktor, netto (bei Prozent: Prozentsatz) */
  kennwert: Spanne;
  kosten: Spanne;
  aktiv: boolean;
  hinweis?: string;
}

export interface KgSumme {
  kg: string;
  name: string;
  ebene: 1 | 2;
  summe: Spanne;
}

export interface Ergebnis {
  mengen: Mengen;
  faktor: number;
  mwst: number;
  positionen: PositionErgebnis[];
  /** Summen je Kostengruppe der 1. und 2. Ebene (netto), sortiert – ohne Kostenrisiken */
  summen: KgSumme[];
  /** Summe der Kostengruppen der 1. Ebene (netto), ohne Kostenrisiken */
  kgNetto: Spanne;
  /** gesondert ausgewiesene Kostenrisiken (netto), Summe aller aktiven Risiko-Positionen */
  risiko: Spanne;
  /** Gesamtkosten netto = kgNetto + risiko */
  gesamtNetto: Spanne;
  gesamtBrutto: Spanne;
  /** Bauwerkskosten (KG 300 + 400) brutto je Bezugseinheit */
  kennwerte: { kurz: string; einheit: string; wert: Spanne }[];
  hinweise: string[];
}

const NULL: Spanne = [0, 0, 0];
const add = (a: Spanne, b: Spanne): Spanne => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mal = (a: Spanne, f: number): Spanne => [a[0] * f, a[1] * f, a[2] * f];

/** Bandbreite einer Position: fehlende Werte werden aus den vorhandenen ergänzt, vertauschte aufsteigend sortiert */
export function spanneVon(p: Pick<KostenPosition, 'von' | 'mittel' | 'bis'>): Spanne {
  return spannePruefen(p).spanne;
}

/** Bandbreite wie spanneVon, dazu ob von ≤ Mittel ≤ bis verletzt war (dann wird mit Min, Mittel, Max gerechnet) */
export function spannePruefen(p: Pick<KostenPosition, 'von' | 'mittel' | 'bis'>): { spanne: Spanne; sortiert: boolean } {
  const { von, bis } = p;
  const mittel = p.mittel ?? (von !== undefined && bis !== undefined ? (von + bis) / 2 : (von ?? bis));
  if (mittel === undefined) return { spanne: NULL, sortiert: false };
  const roh: Spanne = [von ?? mittel, mittel, bis ?? mittel];
  const spanne = [...roh].sort((a, b) => a - b) as Spanne;
  return { spanne, sortiert: spanne.some((v, i) => v !== roh[i]) };
}

/** gültiger Faktor bzw. Index: endlich und größer als 0 */
const gueltig = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v) && v > 0;
const zahlText = (v: number | undefined) => (v === undefined ? '–' : Number.isFinite(v) ? v.toLocaleString('de-DE', { maximumFractionDigits: 4 }) : 'ungültig');

/**
 * Faktor auf die Kennwerte mit Prüfung: Ein angegebener Baupreisindex oder Regionalfaktor, der nicht endlich
 * oder nicht größer als 0 ist, gilt als ungültig – dieser Anteil wird mit 1 gerechnet und gemeldet. Ist nur
 * einer der beiden Indizes eingetragen, bleibt der Index-Anteil wie bisher still 1 (Eingabe unvollständig).
 */
export function faktorPruefen(k: Kosten | undefined): { faktor: number; hinweise: string[] } {
  const hinweise: string[] = [];
  let index = 1;
  const { indexBasis: basis, indexAktuell: aktuell } = k ?? {};
  if ((basis !== undefined && !gueltig(basis)) || (aktuell !== undefined && !gueltig(aktuell))) {
    hinweise.push(`Baupreisindex ungültig (Stand der Kennwerte ${zahlText(basis)}, aktuell ${zahlText(aktuell)}) – ohne Index gerechnet. Beide Werte müssen größer als 0 sein.`);
  } else if (gueltig(basis) && gueltig(aktuell)) index = aktuell / basis;
  let regional = 1;
  if (k?.regionalfaktor !== undefined) {
    if (gueltig(k.regionalfaktor)) regional = k.regionalfaktor;
    else hinweise.push(`Regionalfaktor ungültig (${zahlText(k.regionalfaktor)}) – mit 1,000 gerechnet. Der Faktor muss größer als 0 sein.`);
  }
  return { faktor: index * regional, hinweise };
}

export function faktorVon(k: Kosten | undefined): number {
  return faktorPruefen(k).faktor;
}

/** Umsatzsteuersatz mit Prüfung: außerhalb 0–100 % oder nicht endlich gilt der Standardsatz (19 %) */
export function mwstPruefen(k: Kosten | undefined): { mwst: number; hinweis?: string } {
  const v = k?.mwst;
  if (v === undefined) return { mwst: MWST_STANDARD };
  if (Number.isFinite(v) && v >= 0 && v <= 100) return { mwst: v };
  return { mwst: MWST_STANDARD, hinweis: `Umsatzsteuersatz ungültig (${zahlText(v)} %) – mit ${MWST_STANDARD} % gerechnet. Erlaubt sind 0 bis 100 %.` };
}

export function einheitVon(p: KostenPosition): string {
  if (p.bezug === 'pauschal') return 'psch';
  if (p.bezug === 'prozent') return '%';
  if (p.bezug === 'menge') return p.einheit || 'Stk';
  return MENGEN_INFO[p.bezug].einheit;
}

/** Bezugsgröße als Text: „m² BGF“, „Stk“, „psch“, „% von KG 300 + 400“ */
export function bezugLabel(p: Pick<KostenPosition, 'bezug' | 'einheit' | 'basis'>): string {
  if (p.bezug === 'pauschal') return 'psch';
  if (p.bezug === 'prozent') return `% von KG ${(p.basis ?? []).join(' + ')}`;
  if (p.bezug === 'menge') return p.einheit || 'Stk';
  return `${MENGEN_INFO[p.bezug].einheit} ${MENGEN_INFO[p.bezug].kurz}`;
}

/** Hinweise einer Position, getrennt nach Art – zusammengefasst in PositionErgebnis.hinweis */
interface PositionHinweise {
  /** fehlende Menge, fehlender Kennwert oder Grundlage (zählt zu „ohne Menge oder Kennwert“) */
  fehlt?: string;
  /** Zirkelbezug zwischen Prozentpositionen */
  zirkel?: string;
  /** unplausible Eingaben (vertauschte Spanne, negative Werte) – gerechnet wird trotzdem */
  pruefen: string[];
}

const hinweisText = (h: PositionHinweise) => [h.fehlt ?? h.zirkel, ...h.pruefen].filter(Boolean).join('; ') || undefined;
/** Kostengruppe bzw. Kostenrisiken als Text in Hinweisen */
const kgText = (kg: string) => (istRisiko(kg) ? 'Kostenrisiken' : `KG ${kg}`);
const kgListe = (kgs: string[]) => kgs.map(kgText).join(', ');

export function berechne(project: Project, result: ProjectResult = computeProject(project), waende?: IfcWand[] | null): Ergebnis {
  const k = project.kosten;
  const m = waende === undefined ? mengen(project, result) : mengen(project, result, waende);
  const fp = faktorPruefen(k);
  const faktor = fp.faktor;
  const mp = mwstPruefen(k);
  const mwst = mp.mwst;
  const netto = k?.kennwerteBrutto ? 1 / (1 + mwst / 100) : 1;
  const hinweise: string[] = [];
  const positionen = k?.positionen ?? [];
  const aktivPos = (pos: KostenPosition) => !pos.aus && (istKg(pos.kg) || istRisiko(pos.kg));

  // zuerst alle Positionen mit Menge bzw. Betrag, dann Prozentpositionen auf deren Summen
  const ergebnisse = new Map<string, PositionErgebnis>();
  const notizen = new Map<string, PositionHinweise>();
  const ablegen = (e: Omit<PositionErgebnis, 'hinweis'>, h: PositionHinweise) => {
    notizen.set(e.pos.id, h);
    ergebnisse.set(e.pos.id, { ...e, hinweis: hinweisText(h) });
  };
  for (const pos of positionen) {
    if (pos.bezug === 'prozent') continue;
    const { spanne: kw, sortiert } = spannePruefen(pos);
    const h: PositionHinweise = { pruefen: [] };
    let menge = 1;
    let kennwert: Spanne;
    if (pos.bezug === 'pauschal') kennwert = mal(kw, netto);
    else {
      menge = pos.bezug === 'menge' ? (pos.menge ?? 0) : m[pos.bezug as MengenBezug].wert;
      kennwert = mal(kw, faktor * netto);
      if (menge === 0) h.fehlt = pos.bezug === 'menge' ? 'Menge fehlt' : `${MENGEN_INFO[pos.bezug as MengenBezug].kurz} ist 0`;
      else if (menge < 0) h.pruefen.push('Menge negativ');
    }
    if (kw[1] === 0) h.fehlt = h.fehlt ?? 'Kennwert fehlt';
    if (sortiert) h.pruefen.push('von/Mittel/bis nicht aufsteigend – sortiert gerechnet');
    if (kw[0] < 0) h.pruefen.push(pos.bezug === 'pauschal' ? 'Betrag negativ' : 'Kennwert negativ');
    ablegen({ pos, menge, einheit: einheitVon(pos), kennwert, kosten: mal(kennwert, menge), aktiv: aktivPos(pos) }, h);
  }

  // Prozentpositionen nach Abhängigkeiten: Liegt die Kostengruppe einer aktiven Prozentposition in der Grundlage
  // einer anderen, wird sie zuerst gerechnet – das Ergebnis hängt nicht von der Reihenfolge in der Liste ab.
  const prozent = positionen.filter((p) => p.bezug === 'prozent');
  const basisVon = (pos: KostenPosition) => (pos.basis ?? []).filter(istKg);
  const eigeneBasis = (pos: KostenPosition) => basisVon(pos).some((b) => pos.kg === b || kgUnter(pos.kg, b) || kgUnter(b, pos.kg));
  const abhaengig = new Map<string, KostenPosition[]>(
    prozent.map((p) => [p.id, eigeneBasis(p) ? [] : prozent.filter((q) => q !== p && aktivPos(q) && kgInBasis(q.kg, basisVon(p)))]),
  );
  /** alle Prozentpositionen, von denen `id` direkt oder über mehrere Stufen abhängt */
  const erreichbar = (id: string): Set<string> => {
    const seen = new Set<string>();
    const stapel = [...abhaengig.get(id)!];
    while (stapel.length) {
      const q = stapel.pop()!;
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      stapel.push(...abhaengig.get(q.id)!);
    }
    return seen;
  };
  const prozentRechnen = (pos: KostenPosition, zirkel?: string[]) => {
    const basis = basisVon(pos);
    const eigene = eigeneBasis(pos);
    const { spanne: kennwert, sortiert } = spannePruefen(pos);
    const grundlage = eigene || zirkel ? NULL : [...ergebnisse.values()].filter((e) => e.aktiv && kgInBasis(e.pos.kg, basis)).reduce((a, e) => add(a, e.kosten), NULL);
    // von/bis: niedriger Satz auf niedrige Grundlage, hoher auf hohe
    const kosten: Spanne = [(grundlage[0] * kennwert[0]) / 100, (grundlage[1] * kennwert[1]) / 100, (grundlage[2] * kennwert[2]) / 100];
    const h: PositionHinweise = { pruefen: [] };
    if (eigene) h.fehlt = 'Grundlage enthält die eigene Kostengruppe';
    else if (zirkel) h.zirkel = `Zirkelbezug mit ${kgListe(zirkel)} – mit 0 € gerechnet`;
    else if (!basis.length) h.fehlt = 'Grundlage fehlt';
    else if (grundlage.every((v) => v === 0)) h.fehlt = `Grundlage ohne Kosten (KG ${basis.join(' + ')})`;
    else if (kennwert[1] === 0) h.fehlt = 'Prozentsatz fehlt';
    if (sortiert) h.pruefen.push('von/Mittel/bis nicht aufsteigend – sortiert gerechnet');
    if (kennwert[0] < 0) h.pruefen.push('Prozentsatz negativ');
    if ((pos.basis ?? []).some(istRisiko)) h.pruefen.push('Kostenrisiken sind keine Grundlage – nicht berücksichtigt');
    ablegen({ pos, menge: grundlage[1], einheit: '%', kennwert, kosten, aktiv: aktivPos(pos) }, h);
  };
  const zirkelGruppen: string[][] = [];
  let offen = [...prozent];
  while (offen.length) {
    const bereit = offen.filter((p) => abhaengig.get(p.id)!.every((q) => ergebnisse.has(q.id)));
    if (bereit.length) {
      for (const p of bereit) prozentRechnen(p);
    } else {
      // keine Position rechenbar: die verbleibenden enthalten Zirkelbezüge (auch über mehrere Stufen). Wer von sich
      // selbst abhängt, wird mit 0 € gerechnet; was nur auf einem Zirkel aufbaut, danach mit diesen 0 €.
      const reich = new Map(offen.map((p) => [p.id, erreichbar(p.id)]));
      for (const p of offen) {
        if (!reich.get(p.id)!.has(p.id) || ergebnisse.has(p.id)) continue;
        const gruppe = offen.filter((q) => q === p || (reich.get(p.id)!.has(q.id) && reich.get(q.id)!.has(p.id)));
        const kgs = gruppe.map((q) => q.kg);
        for (const q of gruppe) prozentRechnen(q, kgs.filter((_, i) => gruppe[i] !== q));
        zirkelGruppen.push(kgs);
      }
    }
    offen = offen.filter((p) => !ergebnisse.has(p.id));
  }

  const liste = positionen.map((p) => ergebnisse.get(p.id)!);
  const aktiv = liste.filter((e) => e.aktiv);

  // Summen je Kostengruppe (1. und 2. Ebene); Kostenrisiken gesondert
  const sum = new Map<string, Spanne>();
  let risiko = NULL;
  for (const e of aktiv) {
    if (istRisiko(e.pos.kg)) {
      risiko = add(risiko, e.kosten);
      continue;
    }
    for (const g of [kg1(e.pos.kg), kg2(e.pos.kg)]) if (g) sum.set(g, add(sum.get(g) ?? NULL, e.kosten));
  }
  const summen: KgSumme[] = [...sum.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kg, s]) => ({ kg, name: kgName(kg), ebene: kg[1] === '0' ? 1 : 2, summe: s }));
  const kgNetto = summen.filter((s) => s.ebene === 1).reduce((a, s) => add(a, s.summe), NULL);
  const gesamtNetto = add(kgNetto, risiko);
  const gesamtBrutto = mal(gesamtNetto, 1 + mwst / 100);

  // Doppelerfassung: Position und eine Position in einer übergeordneten Kostengruppe gleichzeitig aktiv (Kostenrisiken haben keine Kostengruppe)
  const doppelt = new Set<string>();
  for (const a of aktiv) for (const b of aktiv) if (kgUnter(a.pos.kg, b.pos.kg)) doppelt.add(`KG ${b.pos.kg} und KG ${a.pos.kg}`);
  for (const d of doppelt) hinweise.push(`${d} sind beide erfasst – die Kosten werden doppelt gezählt. Eine der Positionen ausschalten.`);
  for (const e of liste) if (!istKg(e.pos.kg) && !istRisiko(e.pos.kg)) hinweise.push(`„${e.pos.bezeichnung || 'Position'}“: keine gültige Kostengruppe (dreistellig, 100–899) – wird nicht gerechnet.`);
  for (const z of zirkelGruppen)
    hinweise.push(`Zirkelbezug zwischen Prozentpositionen (${kgListe(z)}): Ihre Grundlagen beziehen sich gegenseitig aufeinander – sie werden mit 0 € gerechnet. Eine der Grundlagen ändern.`);
  const fehlend = aktiv.filter((e) => notizen.get(e.pos.id)!.fehlt);
  if (fehlend.length) hinweise.push(`${fehlend.length} Position${fehlend.length > 1 ? 'en' : ''} ohne Menge oder Kennwert: ${fehlend.map((e) => `${kgText(e.pos.kg)} (${notizen.get(e.pos.id)!.fehlt})`).join(', ')}.`);
  const unplausibel = aktiv.filter((e) => notizen.get(e.pos.id)!.pruefen.length);
  if (unplausibel.length)
    hinweise.push(
      `${unplausibel.length} Position${unplausibel.length > 1 ? 'en' : ''} mit unplausiblen Eingaben – bitte prüfen: ${unplausibel.map((e) => `${kgText(e.pos.kg)} (${notizen.get(e.pos.id)!.pruefen.join(', ')})`).join(', ')}.`,
    );
  hinweise.push(...fp.hinweise);
  if (mp.hinweis) hinweise.push(mp.hinweis);
  if (faktor !== 1) hinweise.push(`Kennwerte mit Faktor ${faktor.toLocaleString('de-DE', { maximumFractionDigits: 4 })} angepasst (Baupreisindex/Regionalfaktor); Pauschalen und Prozentsätze unverändert.`);
  if (!positionen.length) hinweise.push('Noch keine Positionen – Gliederung anlegen oder Kennwerte aus dem Katalog übernehmen.');

  const bauwerk = mal(
    summen.filter((s) => s.kg === '300' || s.kg === '400').reduce((a, s) => add(a, s.summe), NULL),
    1 + mwst / 100,
  );
  const kennwerte = (['bgf', 'bri', 'nuf', 'wofl'] as MengenBezug[])
    .filter((b) => m[b].wert > 0 && bauwerk[1] > 0)
    .map((b) => ({ kurz: MENGEN_INFO[b].kurz, einheit: MENGEN_INFO[b].einheit, wert: mal(bauwerk, 1 / m[b].wert) }));

  return { mengen: m, faktor, mwst, positionen: liste, summen, kgNetto, risiko, gesamtNetto, gesamtBrutto, kennwerte, hinweise };
}

/** Herkunft der Kennwerte in einer Zeile: „Name (Quelle), Stand …“ */
export function katalogText(k: Kosten['katalog']): string {
  if (!k) return '';
  return `${k.name}${k.quelle ? ` (${k.quelle})` : ''}${k.stand ? `, Stand ${k.stand}` : ''}`;
}

export const HAFTUNG =
  'Die Kennwerte sind Eingaben des Anwenders; das Tool rechnet transparent mit den hinterlegten Werten und liefert keine Preise. Die Verantwortung für die Kostenermittlung bleibt bei der Verfasserin bzw. dem Verfasser.';

/* ---------- Kostenstände ---------- */

export const stufeLabel = (s: KostenStufe | undefined) => KOSTEN_STUFEN.find((x) => x.id === s)?.label ?? 'Kostenermittlung';

export function standAus(e: Ergebnis, stufe: KostenStufe, bemerkung: string, datum = new Date().toISOString().slice(0, 10)): KostenStand {
  return {
    id: newId('ks'),
    datum,
    stufe,
    bemerkung,
    mengen: mengenWerte(e.mengen),
    summen: { ...Object.fromEntries(e.summen.map((s) => [s.kg, s.summe])), ...(e.risiko.some((v) => v !== 0) ? { [KG_RISIKO]: e.risiko } : {}) },
    gesamtNetto: e.gesamtNetto,
    gesamtBrutto: e.gesamtBrutto,
  };
}

export interface VergleichZeile {
  kg: string;
  name: string;
  vorher: number;
  jetzt: number;
  differenz: number;
}

/** Vorher/Nachher (Mittelwerte, netto) gegenüber einem Kostenstand – je Kostengruppe der 1. Ebene (dazu Kostenrisiken, kg = KG_RISIKO) und Mengen */
export function vergleiche(stand: KostenStand, e: Ergebnis): { zeilen: VergleichZeile[]; gesamt: VergleichZeile; mengen: { bezug: MengenBezug; vorher: number; jetzt: number }[] } {
  const jetzt = new Map(e.summen.filter((s) => s.ebene === 1).map((s) => [s.kg, s.summe[1]]));
  const kgs = [...new Set([...Object.keys(stand.summen).filter((kg) => kg[1] === '0'), ...jetzt.keys()])].sort();
  const zeilen = kgs.map((kg) => {
    const v = stand.summen[kg]?.[1] ?? 0;
    const j = jetzt.get(kg) ?? 0;
    return { kg, name: kgName(kg), vorher: v, jetzt: j, differenz: j - v };
  });
  // Kostenrisiken als eigene Zeile, damit die Zeilen die Gesamtsumme ergeben
  const risikoVorher = stand.summen[KG_RISIKO]?.[1] ?? 0;
  if (risikoVorher || e.risiko[1]) zeilen.push({ kg: KG_RISIKO, name: kgName(KG_RISIKO), vorher: risikoVorher, jetzt: e.risiko[1], differenz: e.risiko[1] - risikoVorher });
  const gesamt = { kg: '', name: 'Gesamt netto', vorher: stand.gesamtNetto[1], jetzt: e.gesamtNetto[1], differenz: e.gesamtNetto[1] - stand.gesamtNetto[1] };
  const mengenDiff = (Object.keys(stand.mengen) as MengenBezug[])
    .filter((b) => b in e.mengen && Math.abs((stand.mengen[b] ?? 0) - e.mengen[b].wert) > 0.005)
    .map((b) => ({ bezug: b, vorher: stand.mengen[b], jetzt: e.mengen[b].wert }));
  return { zeilen, gesamt, mengen: mengenDiff };
}

/* ---------- Formatierung ---------- */

/** auf ganze Euro gerundet; −0 und nicht endliche Werte als 0 (kein „-0 €“, kein „NaN €“) */
const ganz = (v: number) => (Number.isFinite(v) ? Math.round(v) || 0 : 0);
export const euro = (v: number) => `${ganz(v).toLocaleString('de-DE')} €`;
export const euroSpanne = (s: Spanne) => (ganz(s[0]) === ganz(s[2]) ? euro(s[1]) : `${ganz(s[0]).toLocaleString('de-DE')} – ${ganz(s[2]).toLocaleString('de-DE')} €`);
