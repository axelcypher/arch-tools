/**
 * Baurecht und Projektdatei: Fakten aus Stammdaten, Festsetzungen (GRZ-Nachweis) und Flächenrechner ableiten;
 * Gebäudeklasse aus dem Modell mit dem Merkmal abgleichen; den Abschnitt `baurecht` (je Antrag) und die
 * Antragsmerkmale (Abschnitt `formulare`, eine Quelle mit der App Formulare) lesen und schreiben.
 */

import { computeProject } from '../calc';
import type { Project } from '../model';
import { istKellergeschoss, storeyElevations } from '../model';
import type { Ampel, FaktWert, Festlegung } from './typen';

/* ---------- Abschnitt „baurecht“ ---------- */

export interface Protokoll {
  am: string;
  von: string;
  paket: string;
  einreichung: string;
  /** verwendete Fassungen je `modul/norm` (Gültig ab) */
  fassungen: Record<string, string>;
  zaehler: Record<Ampel, number>;
  /** Ampel je Paragraf zum Zeitpunkt des Abschlusses */
  ampeln: Record<string, Ampel>;
  /** gelbe Punkte beim Abschluss */
  offen: number;
}

export interface BaurechtPruefung {
  /** geplantes Einreichungsdatum (JJJJ-MM-TT) */
  einreichung?: string;
  fakten: Record<string, FaktWert>;
  festlegungen: Record<string, Festlegung>;
  protokolle: Protokoll[];
}

export interface BaurechtAbschnitt {
  pruefungen: Record<string, BaurechtPruefung>;
}

export const leerePruefung = (): BaurechtPruefung => ({ fakten: {}, festlegungen: {}, protokolle: [] });

const istObjekt = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const AMPELN = new Set(['rot', 'gelb', 'gruen']);
const HERKUNFT = new Set(['stammdaten', 'merkmal', 'flaechen', 'grz', 'geodienst', 'modul', 'abgeleitet', 'manuell']);

function faktAus(roh: unknown): FaktWert | null {
  if (!istObjekt(roh)) return null;
  const w = roh.wert;
  if (!(w === null || typeof w === 'string' || typeof w === 'number' || typeof w === 'boolean')) return null;
  const herkunft = HERKUNFT.has(String(roh.herkunft)) ? (roh.herkunft as FaktWert['herkunft']) : 'manuell';
  // fehlt die Angabe zur Sicherheit, gilt der Wert nur als Hinweis (zur sicheren Seite)
  const f: FaktWert = { wert: w, herkunft, sicherheit: roh.sicherheit === 'sicher' ? 'sicher' : 'hinweis' };
  for (const k of ['quelle', 'stand', 'grund'] as const) if (typeof roh[k] === 'string') f[k] = roh[k] as string;
  if (istObjekt(roh.bestaetigt) && typeof roh.bestaetigt.von === 'string' && typeof roh.bestaetigt.am === 'string') {
    f.bestaetigt = { von: roh.bestaetigt.von, am: roh.bestaetigt.am };
    if (typeof roh.bestaetigt.grund === 'string') f.bestaetigt.grund = roh.bestaetigt.grund;
    if (typeof roh.bestaetigt.lage === 'string') f.bestaetigt.lage = roh.bestaetigt.lage;
  }
  if (typeof roh.lage === 'string') f.lage = roh.lage;
  if (typeof roh.widerspruch === 'string') f.widerspruch = roh.widerspruch;
  if (istObjekt(roh.dienst) && ['string', 'number', 'boolean'].includes(typeof roh.dienst.wert)) {
    const d = roh.dienst;
    f.dienst = { wert: d.wert as string | number | boolean, sicherheit: d.sicherheit === 'sicher' ? 'sicher' : 'hinweis', ...(typeof d.quelle === 'string' ? { quelle: d.quelle } : {}), ...(typeof d.stand === 'string' ? { stand: d.stand } : {}) };
  }
  return f;
}

function festlegungAus(roh: unknown): Festlegung | null {
  if (!istObjekt(roh) || !AMPELN.has(String(roh.ampel)) || typeof roh.grund !== 'string' || !roh.grund.trim()) return null;
  const f: Festlegung = {
    ampel: roh.ampel as Ampel,
    grund: roh.grund,
    von: typeof roh.von === 'string' ? roh.von : '',
    am: typeof roh.am === 'string' ? roh.am : '',
    automatisch: AMPELN.has(String(roh.automatisch)) ? (roh.automatisch as Ampel) : 'gelb',
  };
  if (istObjekt(roh.fakten)) f.fakten = Object.fromEntries(Object.entries(roh.fakten).filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v))) as Festlegung['fakten'];
  if (istObjekt(roh.stand)) f.stand = Object.fromEntries(Object.entries(roh.stand).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  if (istObjekt(roh.sicherheit)) f.sicherheit = Object.fromEntries(Object.entries(roh.sicherheit).filter(([, v]) => v === 'sicher' || v === 'hinweis' || v === 'widerspruch')) as Festlegung['sicherheit'];
  if (typeof roh.bestaetigt === 'string') f.bestaetigt = roh.bestaetigt;
  return f;
}

/** Abschnitt prüfen; Unbekanntes fällt weg, Gültiges bleibt */
export function baurechtAus(roh: unknown): BaurechtAbschnitt {
  const out: BaurechtAbschnitt = { pruefungen: {} };
  if (!istObjekt(roh) || !istObjekt(roh.pruefungen)) return out;
  for (const [antrag, p] of Object.entries(roh.pruefungen)) {
    if (!istObjekt(p)) continue;
    const pr = leerePruefung();
    if (typeof p.einreichung === 'string' && /^\d{4}-\d\d-\d\d$/.test(p.einreichung)) pr.einreichung = p.einreichung;
    if (istObjekt(p.fakten))
      for (const [k, v] of Object.entries(p.fakten)) {
        const f = faktAus(v);
        if (f) pr.fakten[k] = f;
      }
    if (istObjekt(p.festlegungen))
      for (const [k, v] of Object.entries(p.festlegungen)) {
        const f = festlegungAus(v);
        if (f) pr.festlegungen[k] = f;
      }
    if (Array.isArray(p.protokolle)) pr.protokolle = p.protokolle.filter((x): x is Protokoll => istObjekt(x) && typeof x.am === 'string') as Protokoll[];
    out.pruefungen[antrag] = pr;
  }
  return out;
}

/** Abschnitt „baurecht“ aus `projekt.json` (eigener Schlüssel oder unter `erweiterungen`) */
export function baurechtAusRoh(roh: Record<string, unknown>): BaurechtAbschnitt {
  return baurechtAus(roh.baurecht ?? (istObjekt(roh.erweiterungen) ? roh.erweiterungen.baurecht : undefined));
}

/** Abschnitt „baurecht“ roh (für das Zusammenführen: unbekannte Felder neuerer Versionen bleiben erhalten) */
function baurechtRoh(roh: Record<string, unknown>): Record<string, unknown> {
  const b = roh.baurecht ?? (istObjekt(roh.erweiterungen) ? roh.erweiterungen.baurecht : undefined);
  return istObjekt(b) ? structuredClone(b) : {};
}

/**
 * Prüfung eines Antrags in `projekt.json` schreiben, zusammengeführt mit dem, was inzwischen in der Datei steht:
 * Übernommen wird nur, was sich gegenüber `basis` (dem Stand beim Öffnen bzw. letzten Speichern) geändert hat – je
 * Fakt, je Festlegung, neue Protokolle. Gleichzeitige Änderungen einer anderen Instanz an anderen Einträgen bleiben;
 * unbekannte Felder (neuerer App-Versionen) ebenso.
 */
export function pruefungSetzen(roh: Record<string, unknown>, antrag: string, pruefung: BaurechtPruefung, basis: BaurechtPruefung = leerePruefung(), o: { konflikte?: string[] } = {}): Record<string, unknown> {
  const abschnitt = baurechtRoh(roh);
  const pruefungen = istObjekt(abschnitt.pruefungen) ? abschnitt.pruefungen : {};
  const datei = istObjekt(pruefungen[antrag]) ? (pruefungen[antrag] as Record<string, unknown>) : {};
  const gelesen = baurechtAus({ pruefungen: { [antrag]: datei } }).pruefungen[antrag] ?? leerePruefung();
  const gleich = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  /**
   * je Eintrag zusammenführen: unberührte Einträge bleiben roh, wie sie in der Datei stehen (auch Felder neuerer
   * App-Versionen); geänderte werden gesetzt bzw. entfernt. Hat inzwischen auch jemand anderes denselben Eintrag
   * geändert, gilt dieser Stand – und der Konflikt wird gemeldet.
   */
  const zusammen = <T>(art: string, dateiRoh: unknown, dateiWerte: Record<string, T>, alt: Record<string, T>, neu: Record<string, T>): Record<string, unknown> => {
    const out: Record<string, unknown> = istObjekt(dateiRoh) ? { ...dateiRoh } : {};
    for (const k of new Set([...Object.keys(alt), ...Object.keys(neu)])) {
      if (gleich(alt[k], neu[k])) continue;
      if (!gleich(dateiWerte[k], alt[k]) && !gleich(dateiWerte[k], neu[k])) o.konflikte?.push(`${art} ${k}`);
      if (neu[k] === undefined) delete out[k];
      else out[k] = neu[k];
    }
    return out;
  };
  const ziel: Record<string, unknown> = { ...datei };
  if (pruefung.einreichung !== basis.einreichung) {
    if (gelesen.einreichung !== basis.einreichung && gelesen.einreichung !== pruefung.einreichung) o.konflikte?.push('Einreichung');
    if (pruefung.einreichung) ziel.einreichung = pruefung.einreichung;
    else delete ziel.einreichung;
  }
  ziel.fakten = zusammen('Angabe', datei.fakten, gelesen.fakten, basis.fakten, pruefung.fakten);
  ziel.festlegungen = zusammen('Festlegung', datei.festlegungen, gelesen.festlegungen, basis.festlegungen, pruefung.festlegungen);
  const neueProtokolle = pruefung.protokolle.filter((p) => !basis.protokolle.some((b) => b.am === p.am));
  const protokolleRoh = Array.isArray(datei.protokolle) ? (datei.protokolle as unknown[]) : [];
  ziel.protokolle = [...protokolleRoh, ...neueProtokolle.filter((p) => !gelesen.protokolle.some((g) => g.am === p.am))];
  pruefungen[antrag] = ziel;
  abschnitt.pruefungen = pruefungen;
  const out: Record<string, unknown> = { ...roh, baurecht: abschnitt };
  if (istObjekt(out.erweiterungen) && 'baurecht' in out.erweiterungen) {
    const { baurecht: _alt, ...rest } = out.erweiterungen;
    out.erweiterungen = rest;
  }
  return out;
}

/* ---------- Antrag und Merkmale (Abschnitt „formulare“) ---------- */

/** Der aktive Antrag: wie Formulare ihn führt; ohne Formulare „Projekt“ */
export function aktiverAntrag(roh: Record<string, unknown>): string {
  const f = istObjekt(roh.formulare) ? roh.formulare : istObjekt(roh.erweiterungen) && istObjekt(roh.erweiterungen.formulare) ? roh.erweiterungen.formulare : null;
  if (f && typeof f.aktiveFassung === 'string' && f.aktiveFassung.trim()) return f.aktiveFassung;
  const meta = istObjekt(roh.meta) ? roh.meta : null;
  if (meta && istObjekt(meta.antrag) && typeof meta.antrag.name === 'string') return meta.antrag.name;
  if (f && istObjekt(f.antraege)) {
    const namen = Object.keys(f.antraege);
    if (namen.length) return namen.sort().pop()!;
  }
  return 'Projekt';
}

/** Antragsmerkmale des Antrags (Formulare); früher projektweit unter `meta.merkmale` */
export function merkmaleAusRoh(roh: Record<string, unknown>, antrag: string): Record<string, string> {
  const f = istObjekt(roh.formulare) ? roh.formulare : istObjekt(roh.erweiterungen) && istObjekt(roh.erweiterungen.formulare) ? roh.erweiterungen.formulare : null;
  const a = f && istObjekt(f.antraege) && istObjekt(f.antraege[antrag]) ? f.antraege[antrag] : null;
  const m = a && istObjekt(a.merkmale) ? a.merkmale : istObjekt(roh.meta) && istObjekt(roh.meta.merkmale) ? roh.meta.merkmale : {};
  return Object.fromEntries(Object.entries(m).filter((e): e is [string, string] => typeof e[1] === 'string' && !!e[1]));
}

/** Merkmal im Antrag setzen (leer = entfernen) – im Abschnitt „formulare“, den auch die App Formulare liest */
export function merkmalSetzen(roh: Record<string, unknown>, antrag: string, name: string, wert: string): Record<string, unknown> {
  const out = structuredClone(roh);
  const ziel = istObjekt(out.formulare) ? out.formulare : istObjekt(out.erweiterungen) && istObjekt(out.erweiterungen.formulare) ? out.erweiterungen.formulare : (out.formulare = {} as Record<string, unknown>);
  if (!istObjekt(ziel.antraege)) ziel.antraege = {};
  const antraege = ziel.antraege as Record<string, unknown>;
  if (!istObjekt(antraege[antrag])) antraege[antrag] = { angelegt: new Date().toISOString().slice(0, 10) };
  const a = antraege[antrag] as Record<string, unknown>;
  const m = istObjekt(a.merkmale) ? { ...(a.merkmale as Record<string, string>) } : {};
  if (wert) m[name] = wert;
  else delete m[name];
  a.merkmale = m;
  if (!ziel.aktiveFassung) ziel.aktiveFassung = antrag;
  return out;
}

/* ---------- Fakten aus dem Projekt ---------- */

const runde = (n: number, stellen = 2) => Math.round(n * 10 ** stellen) / 10 ** stellen;

/** BauNVO-Fassung nach dem Plandatum (statischer Verweis im Bebauungsplan) */
/**
 * BauNVO-Fassung nach einem Datum (Stichtage der Änderungen). Maßgeblich ist das Datum der öffentlichen Auslegung des
 * Plans (§§ 25c ff. BauNVO) – aus dem Plandatum abgeleitet ist das nur ein Hinweis.
 */
export function baunvoNachDatum(datum: string): '1962' | '1968' | '1977' | '1990' | '2013' | '2017' | '2021' | 'aktuell' {
  if (datum < '1969-01-01') return '1962';
  if (datum < '1977-10-01') return '1968';
  if (datum < '1990-01-27') return '1977';
  if (datum < '2013-09-20') return '1990';
  if (datum < '2017-05-13') return '2013';
  if (datum < '2021-06-23') return '2017';
  if (datum < '2023-07-07') return '2021';
  return 'aktuell';
}

export interface GebaeudeklasseAbleitung {
  /** mögliche Gebäudeklassen nach dem Modell */
  klassen: string[];
  hoehe?: number;
  gruende: string[];
  /** Ableitung unsicher (z. B. Gelände nicht festgelegt) */
  hinweis: boolean;
}

/**
 * Gebäudeklasse aus dem Modell (§ 2 Abs. 3 BauO NRW): Höhe = Fußboden des höchsten Geschosses mit möglichem
 * Aufenthaltsraum über der mittleren Geländeoberfläche; Nutzungseinheiten = Wohnungen; ihre Grundfläche nach oben
 * begrenzt durch die BGF ohne Kellergeschosse. Liefert die möglichen Klassen – nie eine einzige, wo das Modell es
 * nicht hergibt (freistehend, Fläche je Nutzungseinheit).
 */
export function gebaeudeklasseAbleiten(p: Project, o: { freistehend?: boolean | null; landwirtschaft?: boolean | null } = {}): GebaeudeklasseAbleitung | null {
  const mitFlaechen = p.storeys.filter((s) => s.shapes.length);
  if (!mitFlaechen.length) return null;
  const elev = storeyElevations(p);
  const gruende: string[] = [];
  const gelaende = p.massNutzung?.gelaende;
  const hinweis = gelaende === undefined;
  // höchstes Geschoss, in dem ein Aufenthaltsraum möglich ist: oberstes Geschoss mit Räumen, ohne Kellergeschosse
  const kandidaten = p.storeys.map((s, i) => ({ s, z: elev[i] ?? 0 })).filter(({ s }) => !istKellergeschoss(s) && s.shapes.some((x) => x.kind === 'room'));
  if (!kandidaten.length) return null;
  const oben = kandidaten.reduce((a, b) => (b.z > a.z ? b : a));
  const hoehe = runde(oben.z - (gelaende ?? 0));
  gruende.push(`Höhe ${hoehe.toLocaleString('de-DE')} m: Fußboden „${oben.s.name}“ über ${gelaende === undefined ? '±0,00 (Geländeoberfläche nicht festgelegt)' : `Gelände ${gelaende.toLocaleString('de-DE')} m`}`);
  const r = computeProject(p);
  const wohnungen = r.wohnungen.filter((w) => w.wohnung.trim()).length;
  const bgfOhneKeller = r.storeys.filter((_, i) => !istKellergeschoss(p.storeys[i])).reduce((s, x) => s + x.bgf.total, 0);
  const groessteGeschossBgf = Math.max(0, ...r.storeys.filter((_, i) => !istKellergeschoss(p.storeys[i])).map((x) => x.bgf.total));
  gruende.push(`${wohnungen} Nutzungseinheit(en) (Wohnungen), BGF ohne Keller ${runde(bgfOhneKeller, 0).toLocaleString('de-DE')} m²`);
  if (o.landwirtschaft) return { klassen: ['1'], hoehe, gruende: [...gruende, 'land- oder forstwirtschaftlich genutzt (Gebäudeklasse 1 b)'], hinweis };
  let klassen: string[];
  if (hoehe <= 7) {
    if (wohnungen <= 2 && wohnungen > 0 && bgfOhneKeller <= 400) klassen = o.freistehend === true ? ['1'] : o.freistehend === false ? ['2'] : ['1', '2'];
    else if (wohnungen <= 2 && wohnungen > 0) klassen = o.freistehend === false ? ['2', '3'] : ['1', '2', '3'];
    else if (wohnungen === 0) klassen = ['1', '2', '3'];
    else klassen = ['3'];
  } else if (hoehe <= 13) klassen = groessteGeschossBgf <= 400 ? ['4'] : ['4', '5'];
  else klassen = ['5'];
  return { klassen, hoehe, gruende, hinweis };
}

/** Fakten aus der Projektdatei (Stammdaten, Festsetzungen, Flächenrechner) */
export function projektFakten(p: Project, heute = new Date().toISOString().slice(0, 10)): Record<string, FaktWert> {
  const f: Record<string, FaktWert> = {};
  const setze = (id: string, wert: FaktWert['wert'], herkunft: FaktWert['herkunft'], quelle: string, sicherheit: FaktWert['sicherheit'] = 'sicher', grund?: string) => {
    if (wert === undefined || wert === null || wert === '') return;
    f[id] = { wert, herkunft, quelle, stand: heute, sicherheit, ...(grund ? { grund } : {}) };
  };
  setze('lage.gemeinde', p.meta.adresse.ort.trim(), 'stammdaten', 'Stammdaten');
  if (p.meta.bebauungsplan?.nummer) setze('planung.bplan_nr', p.meta.bebauungsplan.nummer, 'stammdaten', 'Stammdaten');
  const mn = p.massNutzung;
  if (mn?.gebietsart) setze('planung.gebietsart', mn.gebietsart, 'grz', 'GRZ-Nachweis (Festsetzungen)');
  if (mn?.planDatum) {
    setze('planung.bplan_datum', mn.planDatum, 'grz', 'GRZ-Nachweis (Festsetzungen)');
    // der GRZ-Nachweis fasst 1968/1977 zusammen – für die Regeln zählt die genaue Fassung nach dem Plandatum
    const nachDatum = baunvoNachDatum(mn.planDatum);
    const fassung = !mn.baunvo ? nachDatum : mn.baunvo === '1968' && nachDatum === '1977' ? '1977' : mn.baunvo;
    setze('planung.baunvo', fassung, 'grz', 'GRZ-Nachweis (Plandatum)', 'hinweis', 'aus dem Plandatum abgeleitet – maßgeblich ist die Fassung zum Zeitpunkt der öffentlichen Auslegung (§§ 25c ff. BauNVO); bitte im Plan prüfen');
  }
  if (p.storeys.some((s) => s.shapes.length)) {
    // Werte aus dem Modell sind nur so gut wie das Modell: Hinweis, bis bestätigt ist, dass es vollständig ist
    const MODELL = 'aus dem Modell des Flächenrechners – bitte bestätigen, dass das Modell vollständig ist';
    const r = computeProject(p);
    if (r.total.bgf.total > 0) setze('gebaeude.bgf', runde(r.total.bgf.total), 'flaechen', 'Flächenrechner', 'hinweis', MODELL);
    if (r.total.bri.total > 0) setze('gebaeude.bri', runde(r.total.bri.total), 'flaechen', 'Flächenrechner', 'hinweis', MODELL);
    if (r.total.nuf.total > 0) setze('gebaeude.nutzflaeche', runde(r.total.nuf.total), 'flaechen', 'Flächenrechner (NUF nach DIN 277)', 'hinweis', MODELL);
    const wohnungen = r.wohnungen.filter((w) => w.wohnung.trim()).length;
    if (wohnungen) setze('gebaeude.wohnungen', wohnungen, 'flaechen', 'Flächenrechner (Wohnungen der Räume)', 'hinweis', MODELL);
    const gk = gebaeudeklasseAbleiten(p);
    if (gk?.hoehe !== undefined) setze('gebaeude.hoehe', gk.hoehe, 'abgeleitet', 'Flächenrechner (Geschosskoten)', 'hinweis', gk.hinweis ? `Geländeoberfläche nicht festgelegt (±0,00 angenommen); ${MODELL}` : `Fußboden des obersten Geschosses mit Räumen – § 2 Abs. 3 BauO NRW meint das oberste Geschoss, in dem ein Aufenthaltsraum möglich ist; ${MODELL}`);
    const garagen = (p.lageplan?.flaechen ?? []).filter((x) => x.nutzung === 'garage' && !x.nachbar);
    if (garagen.length) {
      const flaeche = garagen.reduce((s, g) => s + Math.abs(polygonFlaeche(g.points)), 0);
      setze('gebaeude.garage_nutzflaeche', runde(flaeche), 'grz', 'Lageplan (Garagen, Grundfläche als Näherung)', 'hinweis', 'Grundfläche der Garagen im Lageplan, nicht die Nutzfläche');
    }
  }
  return f;
}

function polygonFlaeche(pts: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Merkmale, deren festgelegter Wert der Ableitung aus dem Modell widerspricht */
export function widersprueche(merkmale: Record<string, string>, gk: GebaeudeklasseAbleitung | null, fakten: Record<string, FaktWert> = {}): { merkmale: Set<string>; texte: string[] } {
  const out = new Set<string>();
  const texte: string[] = [];
  // Planungsrecht gegen Geodaten und Stammdaten: die Grenze Innen-/Außenbereich ist die typische Fehleinordnung
  const pr = merkmale['Planungsrecht'];
  // „ja“ auch, wenn nur ein Dienst „ja“ meldet und die Angabe von Hand dagegen steht – der Widerspruch darf den Abgleich
  // nicht aufheben
  const ja = (id: string) => fakten[id]?.wert === true || fakten[id]?.dienst?.wert === true;
  const bplan = [fakten['planung.bplan_nr']?.wert, fakten['soest.bplan']?.wert].find((w) => typeof w === 'string' && w.trim());
  if ((pr === 'Innenbereich' || pr === 'Außenbereich') && bplan) {
    out.add('Planungsrecht');
    texte.push(`Planungsrecht „${pr}“ festgelegt, für das Grundstück ist aber ein Bebauungsplan angegeben (${String(bplan)}) – bitte klären`);
  }
  if ((pr === 'Innenbereich' || pr === 'Bebauungsplan') && (ja('schutz.landschaftsplan') || ja('schutz.lsg'))) {
    out.add('Planungsrecht');
    texte.push(`Planungsrecht „${pr}“ festgelegt, die Geodaten melden aber einen Landschaftsplan bzw. ein Landschaftsschutzgebiet – Grenze Innen-/Außenbereich prüfen`);
  }
  const m = merkmale['Gebäudeklasse'];
  if (m && gk && !gk.klassen.includes(m)) {
    out.add('Gebäudeklasse');
    texte.push(`Gebäudeklasse ${m} festgelegt, nach dem Modell ${gk.klassen.length > 1 ? `${gk.klassen.slice(0, -1).join(', ')} oder ${gk.klassen.at(-1)}` : gk.klassen[0]} (${gk.gruende.join('; ')})`);
  }
  return { merkmale: out, texte };
}
