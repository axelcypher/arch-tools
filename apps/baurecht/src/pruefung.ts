/**
 * Auswertung und Rechtsstand für die Oberfläche: Fakten zusammenführen (Projektdatei, Module, Geodienste, von
 * Hand), Gemeindeschlüssel bestimmen, Ampel je Paragraf berechnen, Texte der aktiven Normen holen.
 */

import { useMemo } from 'react';
import type { Auswertung } from '@core/baurecht/auswertung';
import { auswerten } from '@core/baurecht/auswertung';
import type { Paket } from '@core/baurecht/paket';
import { faktenZurLage, lageKennung } from '@core/baurecht/geodienste';
import { agsVorschlag, aktiveModule, fehlendeEbenen, regeldateiFuer } from '@core/baurecht/paket';
import type { GebaeudeklasseAbleitung } from '@core/baurecht/projekt';
import { gebaeudeklasseAbleiten, projektFakten, widersprueche } from '@core/baurecht/projekt';
import type { Ampel, FaktWert, Modul } from '@core/baurecht/typen';
import type { Project } from '@core/model';
import { isTauri } from '@core/platform/files';
import { logger } from '@core/platform/log';
import { Rechtsstand } from '@core/recht/rechtsstand';
import { ablage } from './ablage';
import { heute, useBaurecht } from './store';

const log = logger('rechtsstand');

/**
 * Fakten aus Projektdatei und Prüfung; Angaben der Prüfung (von Hand, Geodienst, bestätigt) gehen vor. Ergebnisse
 * der Geodienste und ihre Bestätigungen gelten nur an der Lage, an der sie ermittelt wurden.
 */
export function alleFakten(project: Project | null, eigeneRoh: Record<string, FaktWert>, module: Modul[]): Record<string, FaktWert> {
  const k = project?.meta.koordinaten;
  const eigene = faktenZurLage(eigeneRoh, k ? lageKennung(k.ost, k.nord) : null);
  const basis: Record<string, FaktWert> = project ? projektFakten(project, heute()) : {};
  // Gemeindeschlüssel aus der PLZ, wenn ein Gemeindemodul sie nennt – nur Vorschlag, bis er bestätigt ist
  if (project?.meta.adresse.plz) {
    const v = agsVorschlag(module, project.meta.adresse.plz);
    if (v) basis['lage.ags'] = { wert: v, herkunft: 'abgeleitet', quelle: `PLZ ${project.meta.adresse.plz}`, sicherheit: 'hinweis', grund: `aus der Postleitzahl vorgeschlagen – bitte bestätigen${isTauri() ? ' oder über „Lage abfragen“ ermitteln' : ''}`, stand: heute() };
  }
  const out = { ...basis };
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
    out[id] = e;
  }
  return out;
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
}

/** die Auswertung zum aktuellen Stand (memoisiert) */
export function usePruefstand(): Pruefstand {
  const project = useBaurecht((s) => s.project);
  const merkmale = useBaurecht((s) => s.merkmale);
  const pruefung = useBaurecht((s) => s.pruefung);
  const paket = useBaurecht((s) => s.paket);
  const texte = useBaurecht((s) => s.texte);
  return useMemo(() => pruefstandBerechnen(paket, project, merkmale, pruefung.fakten, pruefung.festlegungen, pruefung.einreichung, texte), [paket, project, merkmale, pruefung.fakten, pruefung.festlegungen, pruefung.einreichung, texte]);
}

export function pruefstandBerechnen(
  paket: Paket,
  project: Project | null,
  merkmale: Record<string, string>,
  eigene: Record<string, FaktWert>,
  festlegungen: Parameters<typeof auswerten>[0]['festlegungen'],
  einreichungRoh: string | undefined,
  texte: Record<string, import('@core/baurecht/auswertung').TextStand>,
): Pruefstand {
  const vorab = alleFakten(project, eigene, paket.module);
  const ags = typeof vorab['lage.ags']?.wert === 'string' ? (vorab['lage.ags'].wert as string) : null;
  const module = aktiveModule(paket.module, ags);
  const fakten = alleFakten(project, eigene, module);
  const einreichung = einreichungRoh ?? heute();
  fakten['antrag.einreichung'] = { wert: einreichung, herkunft: einreichungRoh ? 'manuell' : 'abgeleitet', sicherheit: 'sicher' };
  const gk = project ? gebaeudeklasseAbleiten(project, { freistehend: (fakten['gebaeude.freistehend']?.wert as boolean | undefined) ?? null, landwirtschaft: (fakten['gebaeude.landwirtschaft']?.wert as boolean | undefined) ?? null }) : null;
  const w = widersprueche(merkmale, gk, fakten);
  const auswertung = auswerten({ paket, module, merkmale, fakten, einreichung, heute: heute(), texte: new Map(Object.entries(texte)), festlegungen, widersprueche: w.merkmale });
  return { auswertung, module, fehlend: fehlendeEbenen(paket.module, ags), ags, einreichung, gk, widersprueche: w.texte, widerspruchMerkmale: [...w.merkmale] };
}

const RANG = { rot: 2, gelb: 1, gruen: 0 } as const;

/** Paragrafen, die von `alt` nach `neu` schwächer werden (gilt → prüfen/entfällt, prüfen → entfällt) */
export function herabstufungen(alt: Auswertung, neu: Auswertung): { id: string; titel: string; von: Ampel; nach: Ampel }[] {
  const vorher = new Map(alt.paragrafen.map((p) => [p.id, p.ampel]));
  return neu.paragrafen
    .filter((p) => vorher.has(p.id) && RANG[p.ampel] < RANG[vorher.get(p.id)!])
    .map((p) => ({ id: p.id, titel: neu.text.paragraf?.(p.id) ?? p.id, von: vorher.get(p.id)!, nach: p.ampel }));
}

/** Auswertung des aktuellen Stands mit geänderten Angaben der Prüfung (für Vorschau und Bestätigung) */
export function auswertungMit(eigene: Record<string, FaktWert>): Auswertung {
  const s = useBaurecht.getState();
  return pruefstandBerechnen(s.paket, s.project, s.merkmale, eigene, s.pruefung.festlegungen, s.pruefung.einreichung, s.texte).auswertung;
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
