import type { Point } from './geometry';
import { isSelfIntersecting, polygonArea } from './geometry';
import { computeStorey, effektiveWofl, raumUmAbzug, raumUmschliessung } from './calc';
import type { OutlineShape, Project, RoomShape, Storey } from './model';
import { istDachgeschoss, istKellergeschoss } from './model';
import { raumNutzung, woflArt } from './norms';
import type { MultiPolygon } from './polygon';
import { areaMP, diffMP, intersectMP, oeffnen, polygoneOf, unionAll } from './polygon';

/**
 * Plausibilitätsprüfung von QUADRIO (F-10): reine Funktion, die Hinweise zu einem Projekt liefert. Alle
 * Einträge sind Hinweise zum Prüfen, keine Fehler – viele Fälle sind fachlich richtig (z. B. Treppenraum ohne
 * Wohnfläche). Abzugsflächen überlappen absichtlich und werden bei Überlappungen nicht gemeldet.
 */

export type PruefArt = 'warnung' | 'hinweis';

export interface PruefEintrag {
  art: PruefArt;
  /** Kennung der Regel, z. B. „raum-ausserhalb“ */
  regel: string;
  storeyId: string;
  /** betroffene Flächen (Klick wählt sie) */
  shapeIds: string[];
  text: string;
}

export interface PruefOptionen {
  /** Bezeichnungen des Raumkatalogs: Räume, deren Name nicht darin steht, werden gemeldet (leer = keine Prüfung) */
  katalog?: readonly string[];
}

/** kleinste gemeldete Fläche [m²] (Zeichenungenauigkeit) */
const MIN_FLAECHE = 0.05;
/** Lücken zwischen Räumen erst ab dieser Breite [m] – darunter sind es Wände (KGF) */
const LUECKE_BREITE = 0.6;
/** … und ab dieser Fläche [m²] */
const LUECKE_FLAECHE = 1;

const f2 = (v: number) => v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const raumText = (r: RoomShape) => [r.nummer, r.name].filter(Boolean).join(' ') || 'Raum';

function sicher(f: () => number): number {
  try {
    return f();
  } catch {
    return 0;
  }
}

/** Überdeckung zweier Polygone [m²] */
function ueberdeckung(a: readonly Point[], b: readonly Point[]): number {
  return sicher(() => areaMP(intersectMP(unionAll([a]), unionAll([b]))));
}

/** Teil eines Polygons außerhalb einer Fläche [m²] */
function ausserhalb(a: readonly Point[], flaeche: MultiPolygon): number {
  return sicher(() => areaMP(diffMP(unionAll([a]), flaeche)));
}

/** Prüft ein Geschoss */
export function pruefeGeschoss(storey: Storey, project: Project, o: PruefOptionen = {}): PruefEintrag[] {
  const out: PruefEintrag[] = [];
  const add = (art: PruefArt, regel: string, shapeIds: string[], text: string) => out.push({ art, regel, storeyId: storey.id, shapeIds, text });
  const umrisse = storey.shapes.filter((s): s is OutlineShape => s.kind === 'outline' && s.points.length >= 3);
  const plus = umrisse.filter((s) => !s.subtract);
  const minus = umrisse.filter((s) => s.subtract);
  const raeume = storey.shapes.filter((s): s is RoomShape => s.kind === 'room' && s.points.length >= 3);
  const echteRaeume = raeume.filter((r) => !r.subtract);
  // Räume der NRF – ohne Flächen außerhalb der BGF (ebenerdige Terrasse), die zu keinem Umriss gehören
  const nrfRaeume = echteRaeume.filter((r) => !r.ausserhalbBgf);

  // BGF-Fläche je Raumumschließung (Umrisse abzüglich Abzugsflächen)
  const bgfFlaeche = (rs: 'R' | 'S'): MultiPolygon => {
    const p = unionAll(plus.filter((u) => u.umschliessung === rs).map((u) => u.points));
    return minus.length ? diffMP(p, unionAll(minus.map((u) => u.points))) : p;
  };
  const flaecheRS = { R: bgfFlaeche('R'), S: bgfFlaeche('S') };

  // Selbstüberschneidung: die Fläche (Gaußsche Formel) ist dann falsch – sie ginge still in Bericht und Excel ein
  for (const s of [...umrisse, ...raeume])
    if (isSelfIntersecting(s.points))
      add('warnung', 'selbstueberschneidung', [s.id], `${s.kind === 'room' ? raumText(s) : `BGF-Umriss „${s.name}“`} überschneidet sich selbst – die Fläche ist so nicht korrekt; Eckpunkte prüfen.`);

  // Räume außerhalb bzw. über den Umriss hinaus – je Raumumschließung (FR-02)
  if (plus.length) {
    for (const r of nrfRaeume) {
      const rs = raumUmschliessung(r, storey);
      const draussen = ausserhalb(r.points, flaecheRS[rs]);
      if (draussen <= MIN_FLAECHE) continue;
      const ganz = draussen >= sicher(() => areaMP(unionAll([r.points]))) - MIN_FLAECHE;
      add(
        'warnung',
        'raum-ausserhalb',
        [r.id],
        ganz
          ? `${raumText(r)} (${rs}) liegt außerhalb aller ${rs}-Umrisse${rs === 'S' ? ' – ebenerdige, nicht unterbaute Terrasse? Dann „außerhalb der BGF“ wählen' : ''}.`
          : `${raumText(r)} (${rs}) ragt ${f2(draussen)} m² über den ${rs}-Umriss hinaus (NRF muss innerhalb der BGF liegen).`,
      );
    }
  } else if (nrfRaeume.length)
    add(
      'warnung',
      'kein-umriss',
      nrfRaeume.map((r) => r.id),
      'Räume ohne BGF-Umriss – BGF und BRI fehlen für dieses Geschoss.',
    );

  // NRF > BGF je Raumumschließung
  const sr = computeStorey(storey, project);
  for (const rs of ['R', 'S'] as const) {
    if (sr.nrf[rs] > sr.bgf[rs] + 0.005 && sr.bgf.total > 0) add('warnung', 'nrf-groesser-bgf', [], `NRF (${rs}) ${f2(sr.nrf[rs])} m² ist größer als BGF (${rs}) ${f2(sr.bgf[rs])} m².`);
  }

  // Umrisse überlappen (BGF doppelt) – z. B. versetzt eingefügte Kopie
  for (let i = 0; i < plus.length; i++)
    for (let j = i + 1; j < plus.length; j++) {
      const a = ueberdeckung(plus[i].points, plus[j].points);
      if (a > MIN_FLAECHE)
        add('warnung', 'umrisse-ueberlappen', [plus[i].id, plus[j].id], `BGF-Umrisse „${plus[i].name}“ und „${plus[j].name}“ überlappen sich um ${f2(a)} m² – die BGF zählt dort doppelt.`);
    }

  // Räume überlappen (Abzugsflächen ausgenommen)
  for (let i = 0; i < echteRaeume.length; i++)
    for (let j = i + 1; j < echteRaeume.length; j++) {
      const a = ueberdeckung(echteRaeume[i].points, echteRaeume[j].points);
      if (a > MIN_FLAECHE)
        add(
          'warnung',
          'raeume-ueberlappen',
          [echteRaeume[i].id, echteRaeume[j].id],
          `${raumText(echteRaeume[i])} und ${raumText(echteRaeume[j])} überlappen sich um ${f2(a)} m² – die NRF zählt dort doppelt.`,
        );
    }

  // Lücken zwischen den Räumen: nur breite Bereiche ohne Raum (schmale Streifen sind Wände = KGF)
  if (nrfRaeume.length && plus.length) {
    const frei = sicher(() => {
      const rest = diffMP(flaecheRS.R, unionAll(nrfRaeume.map((r) => r.points)));
      return areaMP(oeffnen(rest, LUECKE_BREITE / 2));
    });
    if (frei > LUECKE_FLAECHE) add('hinweis', 'luecke', [], `${f2(frei)} m² innerhalb der BGF (R) liegen in keinem Raum (Bereiche breiter als ${f2(LUECKE_BREITE)} m) – fehlt ein Raum?`);
  }

  // doppelte Raumnummern
  const nummern = new Map<string, RoomShape[]>();
  for (const r of echteRaeume) if (r.nummer.trim()) nummern.set(r.nummer.trim(), [...(nummern.get(r.nummer.trim()) ?? []), r]);
  for (const [n, liste] of nummern)
    if (liste.length > 1)
      add(
        'warnung',
        'nummer-doppelt',
        liste.map((r) => r.id),
        `Raumnummer ${n} kommt ${liste.length}-mal vor.`,
      );

  // WoFlV: ohne Wohnung, „keine“ im Wohngeschoss, „voll“ im Dachgeschoss
  const wohngeschoss = !istKellergeschoss(storey) && echteRaeume.some((r) => effektiveWofl(r, storey).kategorie !== 'keine');
  const ohneWofl: RoomShape[] = [];
  for (const r of echteRaeume) {
    const w = effektiveWofl(r, storey);
    if (w.kategorie !== 'keine' && !w.wohnung.trim()) add('hinweis', 'ohne-wohnung', [r.id], `${raumText(r)} zählt zur Wohnfläche, ist aber keiner Wohnung zugeordnet.`);
    if (w.kategorie === 'keine' && wohngeschoss && raumNutzung(r) !== 'TF') ohneWofl.push(r);
    if (w.kategorie === 'voll' && istDachgeschoss(storey))
      add('hinweis', 'dachschraege', [r.id], `${raumText(r)}: im Dachgeschoss voll angerechnet – lichte Höhe prüfen (Raumteile unter 2 m nach § 4 WoFlV).`);
    if (o.katalog?.length && !r.katalog && !o.katalog.includes(r.name.trim()))
      add('hinweis', 'ohne-katalog', [r.id], `${raumText(r)}: Bezeichnung nicht im Raumkatalog – Nutzung und Anrechnung prüfen.`);
  }

  // „keine Wohnfläche“ im Wohngeschoss: eine Meldung je Geschoss statt einer je Raum (§ 2 Abs. 3 WoFlV)
  if (ohneWofl.length)
    add(
      'hinweis',
      'keine-wofl',
      ohneWofl.map((r) => r.id),
      keineWoflText(ohneWofl),
    );

  // Abzugsfläche mit eigener Anrechnung: mindert sonst die Wohnfläche einer anderen Wohnung bzw. mit anderem Faktor
  for (const a of raeume) {
    if (!a.subtract || a.abzugArt === 'din' || a.wofl.kategorie === 'keine') continue;
    const raum = raumUmAbzug(a, storey);
    const text = `Abzugsfläche „${a.name || 'Abzug'}“`;
    if (!raum) add('hinweis', 'abzug-ohne-raum', [a.id], `${text} liegt in keinem Raum, mindert aber die Wohnfläche${a.wofl.wohnung.trim() ? ` von ${a.wofl.wohnung.trim()}` : ''} – Lage prüfen.`);
    else if (raum.wofl.kategorie !== a.wofl.kategorie || raum.wofl.wohnung.trim() !== a.wofl.wohnung.trim() || raum.wofl.faktor !== a.wofl.faktor)
      add('hinweis', 'abzug-abweichend', [a.id, raum.id], `${text} hat eine eigene Anrechnung, die von ${raumText(raum)} abweicht – Anrechnung „keine“ wählen, dann erbt sie die des Raums.`);
  }

  // S-Umriss ohne obere Begrenzung (FR-10, DIN 277:2021-08, 7.1): überdeckt bis OK Überdeckung – Geschosshöhe bestätigen –,
  // nicht überdeckt bis OK Brüstung/Geländer
  for (const u of plus)
    if (u.umschliessung === 'S' && u.hoehe === undefined && !u.ueberdeckt)
      add(
        'warnung',
        's-ohne-hoehe',
        [u.id],
        `S-Umriss „${u.name}“ ohne obere Begrenzung – überdeckt: „bis Oberkante Überdeckung (Geschosshöhe)“ bestätigen; nicht überdeckt: Körperhöhe bis Oberkante Brüstung bzw. Geländer eintragen.`,
      );
  // Umriss zum Prüfen markiert (z. B. aus dem Geschoss darunter übernommen)
  for (const u of umrisse) if (u.pruefen) add('hinweis', 'umriss-pruefen', [u.id], `BGF-Umriss „${u.name}“ ist zum Prüfen markiert (übernommen) – Außenmaße kontrollieren.`);
  return out;
}

/** Text der Sammelmeldung „keine Wohnfläche“: bis zu fünf Räume namentlich, danach „und k weitere“ */
export function keineWoflText(raeume: readonly RoomShape[]): string {
  const namen = raeume.slice(0, 5).map(raumText).join(', ');
  const rest = raeume.length > 5 ? ` und ${raeume.length - 5} weitere` : '';
  const kopf = raeume.length === 1 ? '1 Raum zählt' : `${raeume.length} Räume zählen`;
  return `${kopf} nicht zur Wohnfläche: ${namen}${rest} – richtig, wenn es sich um Räume außerhalb der Wohnung, Zubehör- oder Geschäftsräume handelt (§ 2 Abs. 3 WoFlV), z. B. Treppenhaus, Heizungsraum, Keller- oder Abstellraum außerhalb der Wohnung.`;
}

/** Namen typischer Wohnräume (mehrdeutige wie „Raum“, „Büro“, „Praxis“, „Arbeiten“ bewusst nicht) … */
const WOHNRAUM_NAME = /wohn|schlaf|kinderzimmer|^kind\b|eltern|küche|kueche|essen|esszimmer|essplatz|gäste|gaeste/i;
/** … außer Räumen aus Praxis, Büro, Schule, Gastronomie und Kita mit ähnlichem Namen */
const KEIN_WOHNRAUM_NAME =
  /warte|behandl|besprech|lehrer|teeküche|teekueche|gastr|gastraum|gruppe|kita|kindergarten|kindertages|personal|pause|büro|buero|praxis|verkauf|großküche|grossküche|kantine|speise|restaurant|gaststätte/i;

/**
 * Kein einziger Raum zählt zur Wohnfläche, obwohl Räume nach Name typisch Wohnräume sind (z. B. Wohnen, Schlafen,
 * Kind): neue Räume starten mit „keine Wohnfläche“ (bei Büro- und Gewerbebauten richtig), die Wohnfläche bliebe sonst
 * still 0. Räume wie „Büro“ oder „Raum“ lösen den Hinweis nicht aus – Geschäftsräume zählen nicht zur Wohnfläche
 * (§ 2 Abs. 3 Nr. 3 WoFlV).
 */
function keineWohnflaecheImProjekt(project: Project): PruefEintrag | null {
  const alle = project.storeys.flatMap((st) => st.shapes.filter((s): s is RoomShape => s.kind === 'room' && !s.subtract && s.points.length >= 3).map((r) => ({ r, st })));
  if (!alle.length || alle.some(({ r, st }) => effektiveWofl(r, st).kategorie !== 'keine')) return null;
  const wohnraeume = alle.filter(
    ({ r, st }) => raumNutzung(r) === 'NUF1' && !istKellergeschoss(st) && WOHNRAUM_NAME.test(r.name) && !KEIN_WOHNRAUM_NAME.test(r.name) && woflArt(r.name, st, raumNutzung(r)) === 'wohnen',
  );
  if (!wohnraeume.length) return null;
  // ein Hinweis für das Projekt; ein Klick führt ins erste betroffene Geschoss und wählt dort die Räume
  const geschosse = new Set(wohnraeume.map((x) => x.st.id)).size;
  const wo = geschosse > 1 ? ` (Wohnräume in ${geschosse} Geschossen)` : '';
  return {
    art: 'hinweis',
    regel: 'keine-wohnflaeche',
    storeyId: wohnraeume[0].st.id,
    shapeIds: wohnraeume.filter((x) => x.st.id === wohnraeume[0].st.id).map((x) => x.r.id),
    text: `Keine Wohnfläche erfasst${wo} – alle Räume stehen auf „keine Wohnfläche“. Bei Wohnungen die Anrechnung wählen (z. B. „voll“) und die Wohnung zuordnen oder Räume über den Raumkatalog benennen.`,
  };
}

/** Prüft alle Geschosse und das Projekt als Ganzes */
export function pruefeProjekt(project: Project, o: PruefOptionen = {}): PruefEintrag[] {
  const projekt = keineWohnflaecheImProjekt(project);
  return [...(projekt ? [projekt] : []), ...project.storeys.flatMap((s) => pruefeGeschoss(s, project, o))];
}

/** Raum auf die BGF-Fläche seiner Raumumschließung beschneiden: größtes Teilstück, oder null, wenn nichts übrig bleibt */
export function raumAufUmriss(r: RoomShape, storey: Storey): Point[] | null {
  const rs = raumUmschliessung(r, storey);
  const umrisse = storey.shapes.filter((s): s is OutlineShape => s.kind === 'outline' && s.umschliessung === rs && s.points.length >= 3);
  const plus = unionAll(umrisse.filter((u) => !u.subtract).map((u) => u.points));
  const minus = umrisse.filter((u) => u.subtract).map((u) => u.points);
  try {
    const mp = intersectMP(unionAll([r.points]), minus.length ? diffMP(plus, unionAll(minus)) : plus);
    let best: Point[] | null = null;
    let bestA = 0;
    for (const { aussen } of polygoneOf(mp)) {
      // geschlossene Ringe: letzter Punkt = erster
      const n = aussen.length;
      const pts = n > 1 && aussen[0].x === aussen[n - 1].x && aussen[0].y === aussen[n - 1].y ? aussen.slice(0, -1) : aussen;
      const a = polygonArea(pts);
      if (a > bestA && pts.length >= 3) {
        bestA = a;
        best = pts;
      }
    }
    return best;
  } catch {
    return null;
  }
}
