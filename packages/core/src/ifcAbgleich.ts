import type { IfcImportResult } from './ifcImport';
import { ifcStandVon, LAGEPLAN_FELDER, RAUM_FELDER, STOCKWERK_FELDER, UMRISS_FELDER, WOFL_ABGELEITET } from './ifcImport';
import type { IfcStand, LageplanFlaeche, OutlineShape, Project, RoomShape, Shape, Storey } from './model';
import { createProject } from './model';
import { areaMP, intersectMP, unionAll } from './polygon';
import { gleich } from './zusammenfuehren';

/**
 * Erneuter IFC-Import in ein bestehendes Projekt, ohne es neu aufzusetzen.
 *
 * Zuordnung: Geschosse und Räume über die IFC-GlobalId (bleibt über Exporte hinweg stabil), sonst Geschosse über
 * den Namen; BGF-Umrisse (aus Wänden erzeugt, ohne eigene Id) und Lageplan-Flächen ohne Id über die größte
 * Überdeckung. Je Feld gilt (Dreiwegeabgleich mit dem Stand beim letzten Import):
 *   - seit dem letzten Import nicht von Hand geändert → neuer Wert aus der IFC
 *   - von Hand geändert → bleibt; hat sich auch die IFC geändert, steht es im Bericht
 * Neue Zonen/Flächen kommen hinzu. Nicht mehr vorhandene entfallen – außer sie wurden von Hand geändert,
 * dann bleiben sie und werden gemeldet. Von Hand gezeichnete Flächen (ohne IFC-Herkunft) bleiben unberührt.
 * Von Hand gelöschte Elemente (GlobalId in `ifcBekannt`, aber nicht mehr im Projekt) werden nicht wieder angelegt.
 * Felder, die der Import nicht ableitet (Wohnfläche ohne Option „Wohnfläche“), bleiben unberührt.
 */

export interface AbgleichOptionen {
  raeume: boolean;
  umrisse: boolean;
  /** Dach- und Geländemodell ersetzen */
  modelle: boolean;
  lageplan: boolean;
  /** Geschossschnitte (IFC-Pläne) ersetzen */
  plaene: boolean;
  /** Wohnfläche wurde beim Import abgeleitet (Option „Wohnfläche“); sonst bleibt `wofl` unberührt */
  wohnflaeche?: boolean;
}

/** GlobalIds aller Geschosse, Räume und Lageplan-Flächen eines Imports */
export function ifcIdsVon(r: Pick<IfcImportResult, 'storeys' | 'lageplan'>): string[] {
  const ids: string[] = [];
  for (const s of r.storeys) {
    if (s.ifcId) ids.push(s.ifcId);
    for (const sh of s.shapes) if (sh.ifcId) ids.push(sh.ifcId);
  }
  for (const f of r.lageplan?.flaechen ?? []) if (f.ifcId) ids.push(f.ifcId);
  return ids;
}

/** GlobalIds, die im Projekt (noch) vorkommen */
function idsImProjekt(p: Project): Set<string> {
  return new Set(ifcIdsVon({ storeys: p.storeys, lageplan: p.lageplan }));
}

const geschossSchluessel = (s: Storey) => s.ifcId ?? s.name;

/** BGF-Umrisse eines Imports je Geschoss – erkennt beim nächsten Abgleich von Hand gelöschte Umrisse */
export function ifcUmrisseVon(storeys: Storey[]): NonNullable<Project['ifcUmrisse']> {
  return storeys.flatMap((s) => s.shapes.filter((x) => x.kind === 'outline').map((x) => ({ geschoss: geschossSchluessel(s), points: x.points })));
}

/** Neues Projekt aus einem IFC-Import (Geschosse, Dach- und Geländemodell, Lageplan) */
export function projektAusIfc(name: string, r: IfcImportResult): Project {
  const p = createProject(name);
  p.storeys = r.storeys;
  p.dachModell = r.dachModell;
  if (r.gelaendeModell) p.gelaendeModell = r.gelaendeModell;
  if (r.lageplan) p.lageplan = r.lageplan;
  const ids = ifcIdsVon(r);
  if (ids.length) p.ifcBekannt = ids;
  const u = ifcUmrisseVon(r.storeys);
  if (u.length) p.ifcUmrisse = u;
  return p;
}

/** Projekt um einen weiteren IFC-Import ergänzen (Geschosse anhängen) */
export function ifcHinzufuegen(p: Project, r: IfcImportResult): Project {
  const ids = [...new Set([...(p.ifcBekannt ?? []), ...ifcIdsVon(r)])];
  return {
    ...p,
    storeys: [...p.storeys, ...r.storeys],
    dachModell: r.dachModell ?? p.dachModell,
    gelaendeModell: r.gelaendeModell ?? p.gelaendeModell,
    lageplan: r.lageplan ? { flaechen: [...(p.lageplan?.flaechen ?? []), ...r.lageplan.flaechen] } : p.lageplan,
    ...(ids.length ? { ifcBekannt: ids } : {}),
    ifcUmrisse: [...(p.ifcUmrisse ?? []), ...ifcUmrisseVon(r.storeys)],
  };
}

export interface AbgleichErgebnis {
  project: Project;
  bericht: string[];
  zaehler: { aktualisiert: number; neu: number; entfernt: number; behalten: number; konflikte: number; uebersprungen: number };
}

type Zaehler = AbgleichErgebnis['zaehler'];

interface Kontext {
  o: AbgleichOptionen;
  z: Zaehler;
  bericht: string[];
  /** GlobalIds, die von Hand gelöscht wurden */
  geloescht: Set<string>;
  raumFelder: readonly string[];
  /** IFC-Geschoss je Raum-GlobalId – findet Räume, die in der IFC in ein anderes Geschoss gewandert sind */
  raumOrt: Map<string, Storey>;
  /** GlobalIds der Räume in abgeglichenen Geschossen des Projekts (dort werden sie zugeordnet, nicht neu angelegt) */
  altIds: Set<string>;
  /** BGF-Umrisse des letzten Imports (siehe Project.ifcUmrisse) */
  altUmrisse: NonNullable<Project['ifcUmrisse']>;
  /** in ein anderes Geschoss gewanderte Räume je IFC-Zielgeschoss */
  verschoben: Map<Storey, { raum: Shape; herkunft: Storey; text: string }[]>;
  /**
   * Projekt aus einem Import älterer Versionen (ohne Vergleichsstand): Flächen ohne Stand werden über Nummer/Name
   * bzw. Überdeckung zugeordnet. Sonst sind Flächen ohne Stand von Hand gezeichnet und bleiben unberührt.
   */
  altimport: boolean;
}

/** Stand nach dem Abgleich: abgeglichene Felder aus der IFC, nicht abgeglichene wie bisher */
function neuerStand(nr: object, felder: readonly string[], alle: readonly string[], bisher: IfcStand | undefined): IfcStand {
  const st = ifcStandVon(nr, felder);
  for (const k of alle) if (!felder.includes(k) && bisher && k in bisher) st[k] = bisher[k];
  if (felder.includes('wofl')) st[WOFL_ABGELEITET] = true;
  else if (bisher?.[WOFL_ABGELEITET]) st[WOFL_ABGELEITET] = true;
  return st;
}

/**
 * Felder eines Raums für den Abgleich: Die Wohnfläche nur, wenn dieser Import sie ableitet und sie auch beim
 * letzten Import abgeleitet wurde – sonst ist sie eine Angabe des Nutzers (bzw. eines Imports ohne Wohnfläche).
 */
function raumFelderFuer(k: Kontext, stand: IfcStand | undefined): readonly string[] {
  return stand && !stand[WOFL_ABGELEITET] ? k.raumFelder.filter((f) => f !== 'wofl') : k.raumFelder;
}

/** Dreiwegeabgleich je Feld; liefert das zusammengeführte Objekt und die Felder mit Konflikt */
function felderAbgleichen<T extends object>(aktuell: T, neu: T, felder: readonly string[], stand: IfcStand | undefined): { obj: T; geaendert: boolean; konflikte: string[]; uebernommen: string[] } {
  const obj = { ...aktuell } as Record<string, unknown>;
  const a = aktuell as Record<string, unknown>;
  const n = neu as Record<string, unknown>;
  const konflikte: string[] = [];
  const uebernommen: string[] = [];
  let geaendert = false;
  for (const k of felder) {
    const s = stand ? stand[k] : a[k];
    const vonHand = !gleich(a[k], s);
    const ifcNeu = !gleich(n[k], s);
    if (!ifcNeu) continue;
    if (vonHand) {
      if (!gleich(a[k], n[k])) konflikte.push(k);
      continue;
    }
    if (n[k] === undefined) delete obj[k];
    else obj[k] = structuredClone(n[k]);
    geaendert = true;
    uebernommen.push(k);
  }
  return { obj: obj as T, geaendert, konflikte, uebernommen };
}

/** wurde ein aus der IFC stammendes Element seit dem letzten Import von Hand geändert? */
function vonHandGeaendert(o: object, felder: readonly string[], stand: IfcStand | undefined): boolean {
  if (!stand) return false;
  return felder.some((k) => !gleich((o as Record<string, unknown>)[k], stand[k]));
}

function ueberdeckung(a: { x: number; y: number }[], b: { x: number; y: number }[]): number {
  try {
    const A = unionAll([a]);
    const B = unionAll([b]);
    const schnitt = areaMP(intersectMP(A, B));
    const vereinigt = areaMP(A) + areaMP(B) - schnitt;
    return vereinigt > 1e-9 ? schnitt / vereinigt : 0;
  } catch {
    return 0;
  }
}

const FELD_TEXT: Record<string, string> = {
  points: 'Geometrie',
  name: 'Bezeichnung',
  nummer: 'Nummer',
  nutzung: 'Nutzung',
  putzabzug: 'Putzabzug',
  versatz: 'Höhenlage',
  wofl: 'Wohnfläche',
  bemerkung: 'Bemerkung',
  dach: 'Dach',
  elevation: 'Höhenkote',
  hoehe: 'Höhe',
  sohle: 'Bodenplatte',
  versiegelung: 'Versiegelung',
  nachbar: 'Nachbar',
};
const felderText = (k: string[]) => k.map((x) => FELD_TEXT[x] ?? x).join(', ');

export function ifcAbgleichen(p: Project, r: IfcImportResult, o: AbgleichOptionen): AbgleichErgebnis {
  const bericht: string[] = [];
  const z: Zaehler = { aktualisiert: 0, neu: 0, entfernt: 0, behalten: 0, konflikte: 0, uebersprungen: 0 };
  const vorhanden = idsImProjekt(p);
  const geloescht = new Set((p.ifcBekannt ?? []).filter((id) => !vorhanden.has(id)));
  const raumOrt = new Map<string, Storey>();
  for (const ns of r.storeys) for (const sh of ns.shapes) if (sh.kind === 'room' && sh.ifcId) raumOrt.set(sh.ifcId, ns);
  const k: Kontext = {
    o,
    z,
    bericht,
    geloescht,
    raumFelder: o.wohnflaeche === false ? RAUM_FELDER.filter((f) => f !== 'wofl') : RAUM_FELDER,
    raumOrt,
    altIds: new Set(),
    altUmrisse: p.ifcUmrisse ?? [],
    verschoben: new Map(),
    altimport: !p.ifcBekannt && !p.storeys.some((s) => s.ifcStand || s.shapes.some((x) => x.ifcStand)) && !(p.lageplan?.flaechen ?? []).some((f) => f.ifcStand),
  };
  const alt = [...p.storeys];
  const verwendet = new Set<string>();
  const storeys: Storey[] = [];

  // Geschosse zuordnen
  const finde = (ns: Storey): Storey | undefined =>
    alt.find((s) => !verwendet.has(s.id) && ns.ifcId && s.ifcId === ns.ifcId) ??
    alt.find((s) => !verwendet.has(s.id) && s.name.trim().toLowerCase() === ns.name.trim().toLowerCase()) ??
    alt.find((s) => !verwendet.has(s.id) && s.elevation !== undefined && ns.elevation !== undefined && Math.abs(s.elevation - ns.elevation) < 0.01);

  const zuordnung = new Map<string, Storey>(); // alte Geschoss-ID → neues IFC-Geschoss
  for (const ns of r.storeys) {
    const os = finde(ns);
    if (os) {
      verwendet.add(os.id);
      zuordnung.set(os.id, ns);
    }
  }

  for (const os of alt) if (zuordnung.has(os.id)) for (const sh of os.shapes) if (sh.kind === 'room' && sh.ifcId) k.altIds.add(sh.ifcId);
  const ergebnis = new Map<Storey, Storey>(); // IFC-Geschoss → Geschoss im Ergebnis

  for (const os of alt) {
    const ns = zuordnung.get(os.id);
    if (!ns) {
      storeys.push(os);
      if (os.ifcId) bericht.push(`Geschoss „${os.name}“ gibt es in der IFC nicht mehr – unverändert behalten.`);
      continue;
    }
    const m = felderAbgleichen(os, ns, STOCKWERK_FELDER, os.ifcStand);
    let st: Storey = { ...m.obj, ifcId: ns.ifcId ?? os.ifcId, ifcStand: ifcStandVon(ns, STOCKWERK_FELDER) };
    if (m.konflikte.length) {
      z.konflikte++;
      bericht.push(`Geschoss „${os.name}“: ${felderText(m.konflikte)} von Hand geändert und auch in der IFC anders – Ihre Angabe bleibt.`);
    }
    // ohne Vergleichsstand (Import einer älteren Version) ist nicht erkennbar, was von Hand kam – offen nennen
    if (!os.ifcStand && m.uebernommen.length) bericht.push(`Geschoss „${os.name}“: ${felderText(m.uebernommen)} aus der IFC übernommen (früherer Import ohne Vergleichsstand).`);
    if (o.plaene && ns.background && (!os.background || (os.background.type === 'vector' && os.background.source === 'ifc'))) st.background = ns.background;
    st = { ...st, shapes: formenAbgleichen(os, ns, k) };
    storeys.push(st);
    ergebnis.set(ns, st);
  }

  // neue Geschosse an passender Höhe einfügen
  for (const ns of r.storeys) {
    if ([...zuordnung.values()].includes(ns)) continue;
    if (ns.ifcId && geloescht.has(ns.ifcId)) {
      z.uebersprungen++;
      bericht.push(`Geschoss „${ns.name}“ wurde von Hand gelöscht – nicht wieder angelegt.`);
      continue;
    }
    const e = ns.elevation ?? 0;
    const idx = storeys.findIndex((s) => (s.elevation ?? 0) > e + 1e-6);
    const neu: Storey = {
      ...ns,
      // Räume, die im Projekt schon in einem anderen Geschoss stehen, kommen als verschobene hinzu (unten)
      shapes: ns.shapes.filter((s) => (s.kind === 'room' ? o.raeume && !(s.ifcId && k.altIds.has(s.ifcId)) : o.umrisse) && !(s.ifcId && geloescht.has(s.ifcId))),
    };
    if (idx < 0) storeys.push(neu);
    else storeys.splice(idx, 0, neu);
    z.neu += neu.shapes.length;
    bericht.push(`Neues Geschoss „${ns.name}“ mit ${neu.shapes.length} Flächen übernommen.`);
    ergebnis.set(ns, neu);
  }
  // in der IFC in ein anderes Geschoss gewanderte Räume dort einfügen – mit ihren Angaben von Hand
  for (const [ns, formen] of k.verschoben) {
    for (const f of formen) {
      const ziel = ergebnis.get(ns);
      if (ziel) {
        ziel.shapes = [...ziel.shapes, f.raum];
        bericht.push(`${f.text} – verschoben.`);
        continue;
      }
      // Zielgeschoss von Hand gelöscht: Raum bleibt, wo er war, statt mit seinen Angaben zu verschwinden
      const bleibt = ergebnis.get(f.herkunft);
      if (bleibt) bleibt.shapes = [...bleibt.shapes, f.raum];
      bericht.push(`${f.text}, das Geschoss wurde aber von Hand gelöscht – Raum bleibt im bisherigen Geschoss.`);
    }
  }

  let project: Project = { ...p, storeys };
  if (o.modelle) {
    if (r.dachModell) project.dachModell = r.dachModell;
    if (r.gelaendeModell) project.gelaendeModell = r.gelaendeModell;
  }
  if (o.lageplan && r.lageplan) project = { ...project, lageplan: { flaechen: lageplanAbgleichen(p.lageplan?.flaechen ?? [], r.lageplan.flaechen, k) } };
  // bekannt bleibt: alles schon Bekannte (auch aus Teil-Importen, z. B. ohne Räume), alles aus diesem Import und
  // was das Projekt enthält – Gelöschtes bleibt so gelöscht
  const bekannt = [...new Set([...(p.ifcBekannt ?? []), ...ifcIdsVon(r), ...idsImProjekt(project)])];
  if (bekannt.length) project.ifcBekannt = bekannt;
  else delete project.ifcBekannt;
  if (o.umrisse) {
    // Umrisse dieses Imports; Geschosse, die nicht abgeglichen wurden, behalten ihre bisherigen
    const neueGeschosse = new Set(r.storeys.map(geschossSchluessel));
    const u = [...(p.ifcUmrisse ?? []).filter((x) => !neueGeschosse.has(x.geschoss)), ...ifcUmrisseVon(r.storeys)];
    if (u.length) project.ifcUmrisse = u;
    else delete project.ifcUmrisse;
  }

  bericht.unshift(
    `Abgleich mit der IFC: ${z.aktualisiert} aktualisiert, ${z.neu} neu, ${z.entfernt} entfernt${z.behalten ? `, ${z.behalten} von Hand geänderte behalten` : ''}${z.konflikte ? `, ${z.konflikte} mit Konflikt (Ihre Angabe bleibt)` : ''}${z.uebersprungen ? `, ${z.uebersprungen} von Hand gelöschte nicht wieder angelegt` : ''}.`,
  );
  return { project, bericht, zaehler: z };
}

function formenAbgleichen(os: Storey, ns: Storey, k: Kontext): Shape[] {
  const { o, z, bericht, raumFelder } = k;
  const out: Shape[] = [];
  const neueRaeume = ns.shapes.filter((s): s is RoomShape => s.kind === 'room');
  const neueUmrisse = ns.shapes.filter((s): s is OutlineShape => s.kind === 'outline');
  const raumVerwendet = new Set<RoomShape>();
  const umrissVerwendet = new Set<OutlineShape>();

  // Räume aus Importen älterer Versionen (ohne GlobalId): über Nummer und Name bzw. die Überdeckung zuordnen
  const altImport = (s: RoomShape): RoomShape | undefined =>
    neueRaeume.find((x) => !raumVerwendet.has(x) && x.nummer === s.nummer && x.name === s.name) ??
    neueRaeume.find((x) => !raumVerwendet.has(x) && ueberdeckung(s.points, x.points) > 0.8);

  for (const s of os.shapes) {
    if (s.kind === 'room') {
      if (!o.raeume) {
        out.push(s);
        continue;
      }
      if (!s.ifcId) {
        const nr = k.altimport ? altImport(s) : undefined;
        if (!nr) {
          out.push(s); // von Hand gezeichnet
          continue;
        }
        raumVerwendet.add(nr);
        // Stand unbekannt: Geometrie, Nummer, Name, Putzabzug und Höhenlage aus der IFC, Nutzung, Wohnfläche, Bemerkung bleiben
        const m = felderAbgleichen(s, nr, raumFelder, { points: s.points, name: s.name, nummer: s.nummer, putzabzug: s.putzabzug, versatz: s.versatz });
        if (m.geaendert) {
          z.aktualisiert++;
          bericht.push(`${os.name}: Raum „${[s.nummer, s.name].filter(Boolean).join(' ')}“ (früherer Import) zugeordnet – ${felderText(m.uebernommen)} aus der IFC übernommen.`);
        }
        // Stand der Felder, die der Nutzer vergeben hat (Nutzung, Wohnfläche, Bemerkung): sein Wert
        out.push({ ...m.obj, ifcId: nr.ifcId, ifcStand: { ...ifcStandVon(m.obj, RAUM_FELDER), ...ifcStandVon(nr, ['points', 'name', 'nummer', 'putzabzug', 'versatz']) } });
        continue;
      }
      const nr = neueRaeume.find((x) => x.ifcId === s.ifcId);
      const zielGeschoss = !nr ? k.raumOrt.get(s.ifcId) : undefined;
      if (zielGeschoss && zielGeschoss !== ns) {
        // in der IFC in ein anderes Geschoss gewandert: dorthin mitnehmen, Abgleich wie sonst
        const nz = zielGeschoss.shapes.find((x): x is RoomShape => x.kind === 'room' && x.ifcId === s.ifcId)!;
        const fz = raumFelderFuer(k, s.ifcStand);
        const m = felderAbgleichen(s, nz, fz, s.ifcStand);
        z.aktualisiert++;
        const name = [s.nummer, s.name].filter(Boolean).join(' ');
        if (m.konflikte.length) {
          z.konflikte++;
          bericht.push(`${os.name}: Raum „${name}“ – ${felderText(m.konflikte)} von Hand geändert und auch in der IFC anders; Ihre Angabe bleibt.`);
        }
        const liste = k.verschoben.get(zielGeschoss) ?? [];
        liste.push({
          raum: { ...m.obj, ifcStand: neuerStand(nz, fz, RAUM_FELDER, s.ifcStand) },
          herkunft: ns,
          text: `Raum „${name}“ liegt in der IFC jetzt im Geschoss „${zielGeschoss.name}“ (bisher „${os.name}“)`,
        });
        k.verschoben.set(zielGeschoss, liste);
        continue;
      }
      if (!nr) {
        if (vonHandGeaendert(s, raumFelderFuer(k, s.ifcStand), s.ifcStand)) {
          out.push(s);
          z.behalten++;
          bericht.push(`${os.name}: Raum „${[s.nummer, s.name].filter(Boolean).join(' ')}“ fehlt in der IFC, wurde aber von Hand geändert – behalten.`);
        } else {
          z.entfernt++;
          bericht.push(`${os.name}: Raum „${[s.nummer, s.name].filter(Boolean).join(' ')}“ gibt es in der IFC nicht mehr – entfernt.`);
        }
        continue;
      }
      raumVerwendet.add(nr);
      const felder = raumFelderFuer(k, s.ifcStand);
      const m = felderAbgleichen(s, nr, felder, s.ifcStand);
      if (m.geaendert) z.aktualisiert++;
      if (m.konflikte.length) {
        z.konflikte++;
        bericht.push(`${os.name}: Raum „${[s.nummer, s.name].filter(Boolean).join(' ')}“ – ${felderText(m.konflikte)} von Hand geändert und auch in der IFC anders; Ihre Angabe bleibt.`);
      }
      out.push({ ...m.obj, ifcStand: neuerStand(nr, felder, RAUM_FELDER, s.ifcStand) });
      continue;
    }
    // BGF-Umriss: nur solche aus der IFC (mit Stand) werden abgeglichen; ältere Importe ohne Stand über die Überdeckung
    if (!o.umrisse) {
      out.push(s);
      continue;
    }
    let best: OutlineShape | undefined;
    let bestU = 0.5;
    for (const nu of neueUmrisse) {
      if (umrissVerwendet.has(nu)) continue;
      const u = ueberdeckung(s.points, nu.points);
      if (u > bestU) {
        bestU = u;
        best = nu;
      }
    }
    if (!s.ifcStand && (!best || !k.altimport)) {
      out.push(s); // von Hand gezeichnet
      continue;
    }
    if (!best) {
      if (vonHandGeaendert(s, UMRISS_FELDER, s.ifcStand)) {
        out.push(s);
        z.behalten++;
        bericht.push(`${os.name}: BGF-Umriss „${s.name}“ passt zu keinem Umriss der IFC mehr, wurde aber von Hand geändert – behalten.`);
      } else {
        z.entfernt++;
        bericht.push(`${os.name}: BGF-Umriss „${s.name}“ entfällt (in der IFC nicht mehr vorhanden).`);
      }
      continue;
    }
    umrissVerwendet.add(best);
    // ohne Stand (Import einer älteren Version): Geometrie aus der IFC, Dach nur, wenn es aus dem Modell kam
    const stand = s.ifcStand ?? { points: s.points, ...(s.dach?.typ === 'modell' ? { dach: s.dach } : {}) };
    const m = felderAbgleichen(s, best, UMRISS_FELDER, stand);
    if (m.geaendert) z.aktualisiert++;
    if (!s.ifcStand && m.uebernommen.length) bericht.push(`${os.name}: BGF-Umriss „${s.name}“ (früherer Import) über die Überdeckung zugeordnet – ${felderText(m.uebernommen)} aus der IFC übernommen.`);
    if (m.konflikte.length) {
      z.konflikte++;
      bericht.push(`${os.name}: BGF-Umriss „${s.name}“ – ${felderText(m.konflikte)} von Hand geändert und auch in der IFC anders; Ihre Angabe bleibt.`);
    }
    out.push({ ...m.obj, ifcStand: ifcStandVon(best, UMRISS_FELDER) });
  }

  if (o.raeume) {
    for (const nr of neueRaeume) {
      if (raumVerwendet.has(nr)) continue;
      // steht im Projekt in einem anderen Geschoss – wird dort zugeordnet und hierher verschoben
      if (nr.ifcId && k.altIds.has(nr.ifcId)) continue;
      if (nr.ifcId && k.geloescht.has(nr.ifcId)) {
        z.uebersprungen++;
        bericht.push(`${os.name}: Raum „${[nr.nummer, nr.name].filter(Boolean).join(' ')}“ wurde von Hand gelöscht – nicht wieder angelegt.`);
        continue;
      }
      out.push(nr);
      z.neu++;
    }
  }
  if (o.umrisse) {
    // von Hand gelöschte Umrisse: im letzten Import vorhanden, im Projekt nicht mehr
    const schluessel = geschossSchluessel(ns);
    const frueher = k.altUmrisse.filter((x) => x.geschoss === schluessel).map((x) => x.points);
    const geloescht = frueher.filter((q) => !os.shapes.some((s) => s.kind === 'outline' && ueberdeckung(s.points, q) > 0.5));
    for (const nu of neueUmrisse) {
      if (umrissVerwendet.has(nu)) continue;
      if (geloescht.some((q) => ueberdeckung(q, nu.points) > 0.5)) {
        z.uebersprungen++;
        bericht.push(`${os.name}: BGF-Umriss „${nu.name}“ wurde von Hand gelöscht – nicht wieder angelegt.`);
        continue;
      }
      out.push(nu);
      z.neu++;
    }
  }
  return out;
}

function lageplanAbgleichen(alt: LageplanFlaeche[], neu: LageplanFlaeche[], k: Kontext): LageplanFlaeche[] {
  const { z, bericht } = k;
  const out: LageplanFlaeche[] = [];
  const verwendet = new Set<LageplanFlaeche>();
  for (const f of alt) {
    let nf = f.ifcId ? neu.find((x) => !verwendet.has(x) && x.ifcId === f.ifcId) : undefined;
    if (!nf && !f.ifcId && f.ifcStand === undefined && k.altimport) {
      // ältere Importe: über die Überdeckung; von Hand gezeichnete Flächen bleiben ohne Gegenstück
      let bestU = 0.8;
      for (const x of neu) {
        if (verwendet.has(x)) continue;
        const u = ueberdeckung(f.points, x.points);
        if (u > bestU) {
          bestU = u;
          nf = x;
        }
      }
    }
    if (!nf) {
      if (!f.ifcId || vonHandGeaendert(f, LAGEPLAN_FELDER, f.ifcStand)) {
        out.push(f);
        if (f.ifcId) z.behalten++;
      } else {
        z.entfernt++;
        bericht.push(`Lageplan: „${f.name}“ gibt es in der IFC nicht mehr – entfernt.`);
      }
      continue;
    }
    verwendet.add(nf);
    // ohne Stand: Nutzung, Versiegelung und Nachbar-Kennzeichen sind Angaben des Nutzers
    const stand = f.ifcStand ?? { points: f.points, name: f.name, hoehe: f.hoehe };
    const m = felderAbgleichen(f, nf, LAGEPLAN_FELDER, stand);
    if (m.geaendert) z.aktualisiert++;
    if (!f.ifcStand && m.uebernommen.length) bericht.push(`Lageplan: „${f.name}“ (früherer Import) über die Überdeckung zugeordnet – ${felderText(m.uebernommen)} aus der IFC übernommen.`);
    if (m.konflikte.length) {
      z.konflikte++;
      bericht.push(`Lageplan: „${f.name}“ – ${felderText(m.konflikte)} von Hand geändert und auch in der IFC anders; Ihre Angabe bleibt.`);
    }
    out.push({ ...m.obj, ifcId: nf.ifcId, ifcStand: ifcStandVon(nf, LAGEPLAN_FELDER) });
  }
  for (const nf of neu) {
    if (verwendet.has(nf)) continue;
    if (nf.ifcId && k.geloescht.has(nf.ifcId)) {
      z.uebersprungen++;
      bericht.push(`Lageplan: „${nf.name}“ wurde von Hand gelöscht – nicht wieder angelegt.`);
      continue;
    }
    out.push(nf);
    z.neu++;
  }
  return out;
}

/** Enthält das Projekt Elemente aus einem IFC-Import, die sich abgleichen lassen? */
export function hatIfcHerkunft(p: Project): boolean {
  return (
    p.storeys.some((s) => !!s.ifcId || s.shapes.some((x) => !!x.ifcId || !!x.ifcStand)) ||
    (p.lageplan?.flaechen ?? []).some((f) => !!f.ifcId) ||
    (p.dateien ?? []).some((d) => d.art === 'ifc')
  );
}
