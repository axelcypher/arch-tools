import type { IfcImportResult } from './ifcImport';
import { ifcStandVon, LAGEPLAN_FELDER, RAUM_FELDER, STOCKWERK_FELDER, UMRISS_FELDER } from './ifcImport';
import type { IfcStand, LageplanFlaeche, OutlineShape, Project, RoomShape, Shape, Storey } from './model';
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
 */

export interface AbgleichOptionen {
  raeume: boolean;
  umrisse: boolean;
  /** Dach- und Geländemodell ersetzen */
  modelle: boolean;
  lageplan: boolean;
  /** Geschossschnitte (IFC-Pläne) ersetzen */
  plaene: boolean;
}

export interface AbgleichErgebnis {
  project: Project;
  bericht: string[];
  zaehler: { aktualisiert: number; neu: number; entfernt: number; behalten: number; konflikte: number };
}

type Zaehler = AbgleichErgebnis['zaehler'];

/** Dreiwegeabgleich je Feld; liefert das zusammengeführte Objekt und die Felder mit Konflikt */
function felderAbgleichen<T extends object>(aktuell: T, neu: T, felder: readonly string[], stand: IfcStand | undefined): { obj: T; geaendert: boolean; konflikte: string[] } {
  const obj = { ...aktuell } as Record<string, unknown>;
  const a = aktuell as Record<string, unknown>;
  const n = neu as Record<string, unknown>;
  const konflikte: string[] = [];
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
  }
  return { obj: obj as T, geaendert, konflikte };
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
  const z: Zaehler = { aktualisiert: 0, neu: 0, entfernt: 0, behalten: 0, konflikte: 0 };
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
    if (o.plaene && ns.background && (!os.background || (os.background.type === 'vector' && os.background.source === 'ifc'))) st.background = ns.background;
    st = { ...st, shapes: formenAbgleichen(os, ns, o, z, bericht) };
    storeys.push(st);
  }

  // neue Geschosse an passender Höhe einfügen
  for (const ns of r.storeys) {
    if ([...zuordnung.values()].includes(ns)) continue;
    const e = ns.elevation ?? 0;
    const idx = storeys.findIndex((s) => (s.elevation ?? 0) > e + 1e-6);
    const neu: Storey = { ...ns, shapes: ns.shapes.filter((s) => (s.kind === 'room' ? o.raeume : o.umrisse)) };
    if (idx < 0) storeys.push(neu);
    else storeys.splice(idx, 0, neu);
    z.neu += neu.shapes.length;
    bericht.push(`Neues Geschoss „${ns.name}“ mit ${neu.shapes.length} Flächen übernommen.`);
  }

  let project: Project = { ...p, storeys };
  if (o.modelle) {
    if (r.dachModell) project.dachModell = r.dachModell;
    if (r.gelaendeModell) project.gelaendeModell = r.gelaendeModell;
  }
  if (o.lageplan && r.lageplan) project = { ...project, lageplan: { flaechen: lageplanAbgleichen(p.lageplan?.flaechen ?? [], r.lageplan.flaechen, z, bericht) } };

  bericht.unshift(
    `Abgleich mit der IFC: ${z.aktualisiert} aktualisiert, ${z.neu} neu, ${z.entfernt} entfernt${z.behalten ? `, ${z.behalten} von Hand geänderte behalten` : ''}${z.konflikte ? `, ${z.konflikte} mit Konflikt (Ihre Angabe bleibt)` : ''}.`,
  );
  return { project, bericht, zaehler: z };
}

function formenAbgleichen(os: Storey, ns: Storey, o: AbgleichOptionen, z: Zaehler, bericht: string[]): Shape[] {
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
        const nr = altImport(s);
        if (!nr) {
          out.push(s); // von Hand gezeichnet
          continue;
        }
        raumVerwendet.add(nr);
        // Stand unbekannt: Geometrie, Nummer, Name, Putzabzug und Höhenlage aus der IFC, Nutzung, Wohnfläche, Bemerkung bleiben
        const m = felderAbgleichen(s, nr, RAUM_FELDER, { points: s.points, name: s.name, nummer: s.nummer, putzabzug: s.putzabzug, versatz: s.versatz });
        if (m.geaendert) z.aktualisiert++;
        out.push({ ...m.obj, ifcId: nr.ifcId, ifcStand: ifcStandVon(nr, RAUM_FELDER) });
        continue;
      }
      const nr = neueRaeume.find((x) => x.ifcId === s.ifcId);
      if (!nr) {
        if (vonHandGeaendert(s, RAUM_FELDER, s.ifcStand)) {
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
      const m = felderAbgleichen(s, nr, RAUM_FELDER, s.ifcStand);
      if (m.geaendert) z.aktualisiert++;
      if (m.konflikte.length) {
        z.konflikte++;
        bericht.push(`${os.name}: Raum „${[s.nummer, s.name].filter(Boolean).join(' ')}“ – ${felderText(m.konflikte)} von Hand geändert und auch in der IFC anders; Ihre Angabe bleibt.`);
      }
      out.push({ ...m.obj, ifcStand: ifcStandVon(nr, RAUM_FELDER) });
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
    if (!s.ifcStand && !best) {
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
    if (m.konflikte.length) {
      z.konflikte++;
      bericht.push(`${os.name}: BGF-Umriss „${s.name}“ – ${felderText(m.konflikte)} von Hand geändert und auch in der IFC anders; Ihre Angabe bleibt.`);
    }
    out.push({ ...m.obj, ifcStand: ifcStandVon(best, UMRISS_FELDER) });
  }

  if (o.raeume) {
    for (const nr of neueRaeume) {
      if (raumVerwendet.has(nr)) continue;
      out.push(nr);
      z.neu++;
    }
  }
  if (o.umrisse) {
    for (const nu of neueUmrisse) {
      if (umrissVerwendet.has(nu)) continue;
      out.push(nu);
      z.neu++;
    }
  }
  return out;
}

function lageplanAbgleichen(alt: LageplanFlaeche[], neu: LageplanFlaeche[], z: Zaehler, bericht: string[]): LageplanFlaeche[] {
  const out: LageplanFlaeche[] = [];
  const verwendet = new Set<LageplanFlaeche>();
  for (const f of alt) {
    let nf = f.ifcId ? neu.find((x) => !verwendet.has(x) && x.ifcId === f.ifcId) : undefined;
    if (!nf && !f.ifcId && f.ifcStand === undefined) {
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
    if (m.konflikte.length) {
      z.konflikte++;
      bericht.push(`Lageplan: „${f.name}“ – ${felderText(m.konflikte)} von Hand geändert und auch in der IFC anders; Ihre Angabe bleibt.`);
    }
    out.push({ ...m.obj, ifcId: nf.ifcId, ifcStand: ifcStandVon(nf, LAGEPLAN_FELDER) });
  }
  for (const nf of neu) {
    if (verwendet.has(nf)) continue;
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
