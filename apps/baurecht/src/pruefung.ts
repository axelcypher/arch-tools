/**
 * Auswertung und Rechtsstand für die Oberfläche: Fakten zusammenführen (Projektdatei, Module, Geodienste, von
 * Hand), Gemeindeschlüssel bestimmen, Ampel je Paragraf berechnen, Texte der aktiven Normen holen.
 */

import { useMemo } from 'react';
import type { Auswertung } from '@core/baurecht/auswertung';
import { auswerten, faktDefinitionen, gueltigeFakten, modulFakten } from '@core/baurecht/auswertung';
import { FAKTEN } from '@core/baurecht/fakten';
import type { Paket } from '@core/baurecht/paket';
import { faktenZurLage, lageKennung } from '@core/baurecht/geodienste';
import { koordinatenVeraltet } from '@core/platform/geokodierung';
import { agsVorschlag, aktiveModule, fehlendeEbenen, regeldateiFuer } from '@core/baurecht/paket';
import type { GebaeudeklasseAbleitung } from '@core/baurecht/projekt';
import { gebaeudeklasseAbleiten, projektFakten, widersprueche } from '@core/baurecht/projekt';
import type { Ampel, FaktDef, FaktWert, Modul, Ort } from '@core/baurecht/typen';
import { ortsgebunden, wertAnzeige, zaehlEinheit } from '@core/baurecht/typen';
import { ortVon, planungsrechtOhneOrt } from '@core/baurecht/ort';
import { VORGABE_MERKMALE } from '@core/bedingung';
import type { Project } from '@core/model';
import { isTauri } from '@core/platform/files';
import { parseNum } from '@core/format';
import { logger } from '@core/platform/log';
import { Rechtsstand } from '@core/recht/rechtsstand';
import { ablage } from './ablage';
import { heute, useBaurecht } from './store';

const log = logger('rechtsstand');

/**
 * Lage des Vorhabens für die Bindung von Geodaten: nur aus Koordinaten, die zur aktuellen Adresse gehören. Fehlen sie
 * oder passen sie nicht mehr (Adresse geändert, Geokodierung gescheitert), gibt es keine Lage.
 */
export function aktuelleLage(project: Project | null): { lage: string | null; problem?: 'fehlen' | 'veraltet' } {
  const k = project?.meta.koordinaten;
  if (!project || !k) return { lage: null, problem: project ? 'fehlen' : undefined };
  if (koordinatenVeraltet(project.meta)) return { lage: null, problem: 'veraltet' };
  return { lage: lageKennung(k.ost, k.nord) };
}

/**
 * Fakten aus Projektdatei und Prüfung; Angaben der Prüfung (von Hand, Geodienst, bestätigt) gehen vor. Ergebnisse
 * der Geodienste und ihre Bestätigungen gelten nur an der Lage, an der sie ermittelt wurden.
 */
export function alleFakten(project: Project | null, eigeneRoh: Record<string, FaktWert>, module: Modul[]): Record<string, FaktWert> {
  const l = aktuelleLage(project);
  const eigene = faktenZurLage(
    eigeneRoh,
    l.lage,
    l.problem === 'veraltet' ? 'Die Adresse wurde geändert, die Koordinaten passen nicht mehr dazu – Ergebnis einer früheren Lage, nur Hinweis; „Lage abfragen“ bzw. Koordinaten aktualisieren' : undefined,
  );
  const basis: Record<string, FaktWert> = project ? projektFakten(project, heute()) : {};
  // Gemeindeschlüssel aus der PLZ, wenn ein Gemeindemodul sie nennt – nur Vorschlag, bis er bestätigt ist
  if (project?.meta.adresse.plz) {
    const v = agsVorschlag(module, project.meta.adresse.plz);
    if (v) basis['lage.ags'] = { wert: v, herkunft: 'abgeleitet', quelle: `PLZ ${project.meta.adresse.plz}`, sicherheit: 'hinweis', grund: `aus der Postleitzahl vorgeschlagen – bitte bestätigen${isTauri() ? ' oder über „Lage abfragen“ ermitteln' : ''}`, stand: heute() };
  }
  const out = { ...basis };
  const defs = { ...FAKTEN, ...faktDefinitionen(module) };
  // frühere Angabe „vollständiger Abbruch ohne Ersatzbau: ja“ (bis Regelpaket 2026.11.12.9): als Vorschlag für den
  // Umfang übernehmen – nur Hinweis, bis er bestätigt bzw. neu gewählt ist
  const alt = eigene['vorhaben.beseitigung_vollstaendig'];
  // (als Wert aus der Projektdatei, damit „Bestätigen …“ wie bei anderen Vorschlägen greift)
  if (alt?.wert === true && defs['vorhaben.beseitigung_umfang'])
    out['vorhaben.beseitigung_umfang'] = basis['vorhaben.beseitigung_umfang'] = { wert: 'vollständiger Abbruch ohne Ersatzbau', herkunft: 'abgeleitet', sicherheit: 'hinweis', quelle: 'frühere Angabe', grund: 'aus der früheren Angabe „Vollständiger Abbruch ohne Ersatzbau: ja“ übernommen – bitte bestätigen oder neu wählen' };
  for (const [id, e] of Object.entries(eigene)) {
    // eine Bestätigung eines Werts aus der Projektdatei (Modell, Stammdaten, Vorschlag) gilt nur für genau diesen Wert –
    // ändert sich das Modell, gilt wieder der neue Wert als Hinweis
    if (e.bestaetigt && (e.herkunft === 'flaechen' || e.herkunft === 'grz' || e.herkunft === 'stammdaten' || e.herkunft === 'abgeleitet' || e.herkunft === 'merkmal')) {
      const b = basis[id];
      if (!b || b.wert !== e.wert) {
        if (b) out[id] = { ...b, sicherheit: 'hinweis', grund: `Wert seit der Bestätigung geändert (bestätigt war ${wertText(e.wert)}) – bitte erneut prüfen` };
        continue;
      }
    }
    out[id] = pruefeEigene(id, e, defs[id]);
  }
  return out;
}

/** Kennung „ohne Lagebezug“ (Angabe zur Lage aus einer älteren Datei, nie an eine Lage gebunden) */
export const OHNE_LAGEBEZUG = '?';

/**
 * Angaben von Hand aus der Datei wie bei der Eingabe prüfen (ältere Dateien kennen die Regeln noch nicht): Zahlen wie
 * angezeigt (zwei Stellen), negative Werte und halbe Anzahlen nur als Hinweis (sonst fielen sie in die Lücke zwischen
 * „höchstens 35“ und „mindestens 36“); Angaben zur Lage ohne jeden Lagebezug nur als Hinweis.
 */
function pruefeEigene(id: string, e: FaktWert, def: FaktDef | undefined): FaktWert {
  if (e.herkunft !== 'manuell') return e;
  let f = e;
  const hinweis = (grund: string, extra: Partial<FaktWert> = {}): FaktWert => {
    const { bestaetigt: _b, ...ohne } = f;
    return { ...ohne, ...extra, sicherheit: 'hinweis', grund };
  };
  // Zahl als Text (ältere Datei, Import): lesen wie eine Eingabe, sonst nur Hinweis
  if (def?.typ === 'zahl' && typeof f.wert === 'string') {
    // genau wie das Eingabefeld (parseNum: „7,5“, „1.234,5“, „7.5“ → 7,5)
    const n = parseNum(f.wert);
    if (n === null) return hinweis(`keine Zahl („${f.wert}“) – bitte korrigieren`);
    f = { ...f, wert: n };
  }
  if (typeof f.wert === 'number') {
    if (f.wert < 0) return hinweis(`negativer Wert (${wertAnzeige(f.wert, def)}) – bitte korrigieren`);
    if (zaehlEinheit(def?.einheit) && def?.typ === 'zahl' && !Number.isInteger(f.wert)) return hinweis(`Anzahl nicht ganzzahlig (${String(f.wert).replace('.', ',')}) – bitte korrigieren`);
    const gerundet = Math.round(f.wert * 100) / 100;
    if (gerundet !== f.wert) f = { ...f, wert: gerundet };
  }
  if (def && ortsgebunden(def) && !f.lage && !f.bestaetigt?.lage && f.sicherheit === 'sicher' && id !== 'antrag.einreichung')
    return hinweis('Angabe zur Lage ohne Lagebezug (ältere Datei) – bitte für diese Lage übernehmen oder neu angeben', { lage: OHNE_LAGEBEZUG });
  return f;
}

const wertText = (w: FaktWert['wert']) => (w === true ? 'ja' : w === false ? 'nein' : String(w));

export interface Pruefstand {
  auswertung: Auswertung;
  module: Modul[];
  fehlend: ('land' | 'kreis' | 'gemeinde')[];
  ags: string | null;
  einreichung: string;
  gk: GebaeudeklasseAbleitung | null;
  widersprueche: string[];
  /** Merkmale, die den Geodaten bzw. dem Modell widersprechen */
  widerspruchMerkmale: string[];
  /** Planungsrecht ist nicht für diesen Ort bestätigt (Grund) – Hinweis mit „Bestätigen“ */
  planungsrechtFrueher?: string;
  /** derselbe Hinweis als ganzer Satz (steht auch in `widersprueche`, fürs Protokoll) */
  planungsrechtHinweis?: string;
}

/** Planungsrecht und Ort (siehe planungsrechtOhneOrt): Grund, warum es nicht als gesichert zählt, sonst undefined */
export function planungsrechtVerschoben(project: Project | null, merkmale: Record<string, string>, gemerkt?: Ort): string | undefined {
  // ein Wert außerhalb der Liste zählt ohnehin nicht (offen) – dafür gibt es keine Ortsbestätigung
  const wert = merkmale['Planungsrecht'];
  if (wert && !VORGABE_MERKMALE.find((m) => m.name === 'Planungsrecht')?.werte.includes(wert)) return undefined;
  return planungsrechtOhneOrt(wert, gemerkt, ortVon(project));
}

/** die Auswertung zum aktuellen Stand (memoisiert) */
export function usePruefstand(): Pruefstand {
  const project = useBaurecht((s) => s.project);
  const merkmale = useBaurecht((s) => s.merkmale);
  const pruefung = useBaurecht((s) => s.pruefung);
  const paket = useBaurecht((s) => s.paket);
  const texte = useBaurecht((s) => s.texte);
  return useMemo(
    () => pruefstandBerechnen(paket, project, merkmale, pruefung.fakten, pruefung.festlegungen, pruefung.einreichung, texte, pruefung.planungsrechtOrt),
    [paket, project, merkmale, pruefung.fakten, pruefung.festlegungen, pruefung.einreichung, texte, pruefung.planungsrechtOrt],
  );
}

export function pruefstandBerechnen(
  paket: Paket,
  project: Project | null,
  merkmale: Record<string, string>,
  eigene: Record<string, FaktWert>,
  festlegungen: Parameters<typeof auswerten>[0]['festlegungen'],
  einreichungRoh: string | undefined,
  texte: Record<string, import('@core/baurecht/auswertung').TextStand>,
  planungsrechtOrt?: Ort,
): Pruefstand {
  const vorab = alleFakten(project, eigene, paket.module);
  const ags = typeof vorab['lage.ags']?.wert === 'string' ? (vorab['lage.ags'].wert as string) : null;
  const module = aktiveModule(paket.module, ags);
  const fakten = alleFakten(project, eigene, module);
  const einreichung = einreichungRoh ?? heute();
  fakten['antrag.einreichung'] = { wert: einreichung, herkunft: einreichungRoh ? 'manuell' : 'abgeleitet', sicherheit: 'sicher' };
  // Ableitung der Gebäudeklasse und Widersprüche nur aus gültigen Werten („nein“ als Text ist kein false) und strikt
  const geprueft = gueltigeFakten(modulFakten(module, gueltigeFakten(fakten, faktDefinitionen(module))), faktDefinitionen(module));
  const janein = (id: string) => (geprueft[id]?.wert === true ? true : geprueft[id]?.wert === false ? false : null);
  const gk = project ? gebaeudeklasseAbleiten(project, { freistehend: janein('gebaeude.freistehend'), landwirtschaft: janein('gebaeude.landwirtschaft') }) : null;
  // Widersprüche aus den Rohwerten (zur sicheren Seite: auch eine als Zahl gespeicherte Plannummer zählt als angegeben)
  const w = widersprueche(merkmale, gk, fakten);
  const ort = ortVon(project);
  const planungsrechtFrueher = planungsrechtVerschoben(project, merkmale, planungsrechtOrt);
  // Planungsrecht ohne bestätigten Ort: nicht gesichert – was daran hängt, kann nicht sicher entfallen; im Protokoll
  // und in den Begründungen mit eigenem Grund (kein „Widerspruch“)
  const vorbehalte: Record<string, string> = {};
  if (planungsrechtFrueher) {
    const text = `Planungsrecht „${merkmale['Planungsrecht']}“ ${planungsrechtFrueher}`;
    // widerspricht es zugleich den Geodaten, bleibt der Widerspruch der Grund (der Vorbehalt steht als Hinweis daneben)
    if (!w.merkmale.has('Planungsrecht')) vorbehalte['Planungsrecht'] = text;
    w.merkmale.add('Planungsrecht');
    w.texte.push(text);
  }
  const planungsrechtHinweis = planungsrechtFrueher ? w.texte[w.texte.length - 1] : undefined;
  const auswertung = auswerten({ paket, module, merkmale, fakten, einreichung, heute: heute(), texte: new Map(Object.entries(texte)), festlegungen, widersprueche: w.merkmale, vorbehalte, ort });
  return { auswertung, module, fehlend: fehlendeEbenen(paket.module, ags), ags, einreichung, gk, widersprueche: w.texte, widerspruchMerkmale: [...w.merkmale], planungsrechtFrueher, planungsrechtHinweis };
}

const RANG = { rot: 2, gelb: 1, gruen: 0 } as const;

/** Paragrafen, die von `alt` nach `neu` schwächer werden (gilt → prüfen/entfällt, prüfen → entfällt) */
export function herabstufungen(alt: Auswertung, neu: Auswertung): { id: string; titel: string; von: Ampel; nach: Ampel }[] {
  const vorher = new Map(alt.paragrafen.map((p) => [p.id, p.ampel]));
  return neu.paragrafen
    .filter((p) => vorher.has(p.id) && RANG[p.ampel] < RANG[vorher.get(p.id)!])
    .map((p) => ({ id: p.id, titel: neu.text.paragraf?.(p.id) ?? p.id, von: vorher.get(p.id)!, nach: p.ampel }));
}

/**
 * Auswertung des aktuellen Stands mit geänderten Angaben der Prüfung (für Vorschau und Bestätigung). `mit.planungsrechtOrt`:
 * ein anderer Ort des Planungsrechts (auch keiner) als der aktuelle – z. B. der Stand der Datei
 */
export function auswertungMit(eigene: Record<string, FaktWert>, mit?: { planungsrechtOrt: Ort | undefined }): Auswertung {
  const s = useBaurecht.getState();
  const planungsrechtOrt = mit ? mit.planungsrechtOrt : s.pruefung.planungsrechtOrt;
  // derselbe Stand wie in der Ansicht (auch der Ort des Planungsrechts) – sonst verglichen Vorschau und Speichern
  // ungleiche Stände
  return pruefstandBerechnen(s.paket, s.project, s.merkmale, eigene, s.pruefung.festlegungen, s.pruefung.einreichung, s.texte, planungsrechtOrt).auswertung;
}

/**
 * Wie viele Paragrafen die Bestätigung des Planungsrechts für den jetzigen Ort ändern würde („klärt N“) – dieselbe
 * Rechnung wie danach in der Ansicht (Ort und Wert wie beim Bestätigen)
 */
export function planungsrechtWirkung(jetzt: Auswertung): number {
  const s = useBaurecht.getState();
  const o = ortVon(s.project);
  const wert = s.merkmale['Planungsrecht'];
  if (!o || !wert) return 0;
  const dann = auswertungMit(s.pruefung.fakten, { planungsrechtOrt: { ...o, wert } });
  const vorher = new Map(jetzt.paragrafen.map((p) => [p.id, p.ampel]));
  return dann.paragrafen.filter((p) => vorher.has(p.id) && vorher.get(p.id) !== p.ampel).length;
}

/* ---------- Rechtsstand ---------- */

let rechtsstand: Rechtsstand | null = null;

function rs(paket: Paket): Rechtsstand {
  rechtsstand ??= new Rechtsstand(ablage, undefined, { textAusPaket: async (pfad) => useBaurecht.getState().paket.texte.get(pfad) ?? paket.texte.get(pfad) ?? null });
  return rechtsstand;
}

let lauf = 0;

/**
 * Texte aller Normen der aktiven Module zum Stichtag holen (je Norm höchstens einmal am Tag an der Quelle, sonst aus
 * der Ablage). `aktualisieren` prüft sofort an der Quelle. In der Web-Version ohne Netz (CORS).
 */
export async function texteLaden(module: Modul[], stichtag: string, o: { aktualisieren?: boolean } = {}): Promise<void> {
  const nr = ++lauf;
  const st = useBaurecht.getState();
  // Kennung in der Ablage: Modul und Norm (zwei Gemeinden können eine „stellplatzsatzung“ haben)
  const normen = module.flatMap((m) => Object.entries(m.normen).map(([norm, def]) => ({ key: `${m.id}/${norm}`, norm: { id: `${m.id}/${norm}`, kurz: def.kurz, titel: def.titel, quelle: def.quelle } })));
  const offen = new Set(normen.filter((n) => n.norm.quelle.art !== 'verweis').map((n) => n.key));
  st.laedtSetzen([...offen]);
  const schlange = [...normen];
  const arbeiter = async () => {
    for (let n = schlange.shift(); n; n = schlange.shift()) {
      if (nr !== lauf) return;
      if (n.norm.quelle.art === 'verweis') continue;
      try {
        // für alt/neu: die Prüfsummen der Regeln (Fassung, an der sie geprüft sind)
        // die Regeldatei, die zum Stichtag gilt (nicht einfach die neueste – z. B. FStrG mit zwei Fassungen)
        const regeln = regeldateiFuer(st.paket.regeln.get(n.key), undefined, stichtag);
        const regelStand = Object.assign({}, ...Object.values(regeln?.regel.paragrafen ?? {}).map((p) => p.stand ?? {})) as Record<string, string>;
        const r = await rs(st.paket).fuer(n.norm, stichtag, { aktualisieren: o.aktualisieren, offline: !isTauri(), regelStand });
        if (nr !== lauf) return;
        useBaurecht.getState().textSetzen(n.key, { fassung: r.fassung, ...(r.vorige ? { vorige: r.vorige } : {}), ...(r.fehler ? { fehler: r.fehler } : {}), ...(r.kuenftige ? { kuenftige: r.kuenftige } : {}), ...(r.geprueft ? { geprueft: r.geprueft } : {}), ...(r.ueberholtAb ? { ueberholtAb: r.ueberholtAb } : {}), stichtag });
      } catch (e) {
        log.warn('Text nicht geholt', { norm: n.key, fehler: String(e) });
        useBaurecht.getState().textSetzen(n.key, { fassung: null, fehler: e instanceof Error ? e.message : String(e) });
      }
      offen.delete(n.key);
      useBaurecht.getState().laedtSetzen([...offen]);
    }
  };
  await Promise.all([arbeiter(), arbeiter(), arbeiter(), arbeiter()]);
  if (nr === lauf && isTauri()) useBaurecht.getState().rechtsstandGeprueftSetzen(new Date().toISOString());
}

/** Fassungen (Gültig ab) aller Normen – für das Protokoll */
export function verwendeteFassungen(a: Auswertung): Record<string, string> {
  return Object.fromEntries(a.normen.filter((n) => n.fassung).map((n) => [n.id, n.fassung!.gueltigAb]));
}
