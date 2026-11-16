/**
 * Wann eine Frage gestellt wird – ein Kriterium für Kern (es fehlt, klärt am meisten), App (Angaben-Leiste) und Protokoll.
 */
import type { KurzKontext } from './kurz';
import { werten } from './kurz';
import type { FaktDef, FaktWert } from './typen';
import { faktName, faktStatus, wertAnzeige } from './typen';

/** Rückfragen zu einem Antragsmerkmal: stehen direkt unter dem Merkmal (Umfang der Beseitigung, beim Ersatzbau die Angaben zum Altbau) */
export const RUECKFRAGEN: Record<string, string[]> = { Vorhaben: ['vorhaben.beseitigung_umfang', 'nw.altbau_verfahrensfrei', 'nw.beseitigung_mit_beantragt'] };
export const RUECKFRAGE_IDS: ReadonlySet<string> = new Set(Object.values(RUECKFRAGEN).flat());

/**
 * Wird die Frage zu dieser Angabe gestellt? Ohne Bedingung („wenn“) immer; sonst, solange die Bedingung nicht sicher
 * „nein“ ergibt (ein „nein“ nur aus Hinweisen verbirgt keine Frage – sonst fiele eine Antwort weg, die zählen könnte;
 * ein Widerspruch bzw. Vorbehalt – an einem Merkmal oder einer Angabe – öffnet keine; das Urteil hängt so nicht daran). Eine Rückfrage erst, wenn ihre Bedingung „ja“ ergibt – vorher stünde z. B. „Altbau
 * verfahrensfrei“ vor dem Umfang der Beseitigung. Eine fehlerhafte Bedingung: lieber fragen.
 */
export function frageGestellt(id: string, def: Pick<FaktDef, 'wenn' | 'vorfrage'> | undefined, ctx: KurzKontext): boolean {
  return frageStand(id, def, ctx).gestellt;
}

/**
 * Wie frageGestellt, dazu die Hinweise (nicht bestätigte Angaben), auf denen das „gestellt“ beruht: Eine Frage, die nur
 * wegen eines Hinweises gestellt wird (z. B. „Altbau verfahrensfrei“, weil der Umfang „Abbruch mit Ersatzbau“ nur
 * Hinweis ist), trägt ihre Antwort nicht weiter als dieser Hinweis – die Antwort bekommt in der Auswertung den Auslöser
 * als `ueberHinweis` mit, Regeln zählen dann ihn als nicht gesichert. Ebenso `ueberWiderspruch` für eine widersprüchliche
 * Angabe als Auslöser (die Regel trägt dann deren Widerspruch; Merkmal-Widersprüche ausgenommen, siehe unten).
 */
export function frageStand(id: string, def: Pick<FaktDef, 'wenn' | 'vorfrage'> | undefined, ctx: KurzKontext): { gestellt: boolean; ueberHinweis: string[]; ueberWiderspruch: string[] } {
  // Einzelfrage, deren Vorfrage wirksam „nein“ ist, bzw. Angabe, deren Wert sich aus anderen ergibt: entfällt (der Wert
  // folgt daraus, ableitungenAnwenden)
  // (ein abgeleiteter Wert mit Widerspruch, z. B. aus einem Dienst, bleibt gefragt – der Widerspruch will geklärt sein)
  if ((def?.vorfrage && vorfrageNein(ctx.fakten[def.vorfrage.fakt])) || (ctx.fakten[id]?.ausFolge && !ctx.fakten[id].widerspruch)) return { gestellt: false, ueberHinweis: [], ueberWiderspruch: [] };
  if (!def?.wenn) return { gestellt: true, ueberHinweis: [], ueberWiderspruch: [] };
  try {
    const b = werten(def.wenn, ctx);
    // widersprüchliche Angaben, auf denen ein „ja“ beruht – ohne Merkmale: Widersprüchlich sein können Planungsrecht,
    // Gebäudeklasse und Verfahren (projekt.ts, widersprueche); die Regeln, die Antworten auf an Planungsrecht oder
    // Gebäudeklasse hängende Fragen verwenden, prüfen das Merkmal selbst (Anwendungsbereich), oder das Ergebnis ist bei
    // jedem Wert gleich (nachgerechnet im Fachreview zu #117). Am Verfahren hängt nur nw.beseitigung_mit_beantragt
    // (genehmigungsbedürftig) – widersprüchlich ist allein „verfahrensfrei“, das dort „nein“ ergibt: kein „ja“ daraus
    const wid = b.widerspruch.filter((w) => !w.startsWith('merkmal:'));
    if (RUECKFRAGE_IDS.has(id)) return b.w === 'ja' ? { gestellt: true, ueberHinweis: b.unsicher, ueberWiderspruch: wid } : { gestellt: false, ueberHinweis: [], ueberWiderspruch: [] };
    // „ja“ nur aus Hinweisen: gestellt, die Antwort trägt die Hinweise mit; „nein“ nur aus Hinweisen verbirgt die Frage
    // nicht (die Antwort könnte zählen) – auch dann beruht das Stellen auf Hinweisen
    if (b.w !== 'nein') return { gestellt: true, ueberHinweis: b.w === 'ja' ? b.unsicher : [], ueberWiderspruch: b.w === 'ja' ? wid : [] };
    return { gestellt: b.unsicher.length > 0, ueberHinweis: b.unsicher, ueberWiderspruch: [] };
  } catch {
    return { gestellt: true, ueberHinweis: [], ueberWiderspruch: [] };
  }
}

/* ---------- Vorfragen ---------- */

/**
 * Vorfragen und ihre Einzelfragen (FaktDef.vorfrage): je Vorfrage die Angaben, die an ihr hängen, in der Reihenfolge der
 * Definitionen. Eine Einzelfrage kann selbst Vorfrage sein (z. B. Wasserschutzgebiet → Heilquellenschutzgebiet → Zonen).
 */
export function vorfragenKarte(defs: Record<string, Pick<FaktDef, 'vorfrage'>>): Map<string, string[]> {
  const karte = new Map<string, string[]>();
  for (const [id, d] of Object.entries(defs)) if (d.vorfrage && defs[d.vorfrage.fakt]) karte.set(d.vorfrage.fakt, [...(karte.get(d.vorfrage.fakt) ?? []), id]);
  return karte;
}

/** Ist die Vorfrage wirksam „nein“? Nur ein gesichertes „nein“ ohne Widerspruch – ein Hinweis erledigt keine Einzelfrage */
export function vorfrageNein(v: FaktWert | undefined): boolean {
  return v?.wert === false && faktStatus(v) === 'sicher';
}

/** alle Einzelfragen unter einer Vorfrage, auch die der Einzelfragen (Tiefe zuerst, in Definitionsreihenfolge) */
export function einzelfragenVon(v: string, karte: Map<string, string[]>, besucht = new Set<string>()): string[] {
  besucht.add(v);
  return (karte.get(v) ?? []).filter((k) => !besucht.has(k)).flatMap((k) => [k, ...einzelfragenVon(k, karte, besucht)]);
}

/** die Angaben samt ihren Vorfragen (über alle Stufen) – an einer Vorfrage hängt keine Regel, sie gehört zu ihren Einzelfragen */
export function mitVorfragen(ids: Iterable<string>, defs: Record<string, Pick<FaktDef, 'vorfrage'>>): Set<string> {
  const out = new Set<string>();
  for (const id of ids) {
    out.add(id);
    for (let v = defs[id]?.vorfrage?.fakt, n = 0; v && defs[v] && !out.has(v) && n < 20; v = defs[v]?.vorfrage?.fakt, n++) out.add(v);
  }
  return out;
}

/** Spricht eine Einzelfrage für die Vorfrage? Ein anderer Wert als `sonst` – oder ein Widerspruch (z. B. Treffer eines Dienstes gegen „nein“ von Hand) */
const sprichtDafuer = (f: FaktWert | undefined, sonst: FaktDef['wert']): boolean => !!f && ((f.wert != null && f.wert !== '' && f.wert !== sonst) || !!f.widerspruch);

/**
 * Vorfragen anwenden (nach den Werten der Module, vor den Regeln), in zwei Schritten:
 *  1. Von unten nach oben (bis zum Fixpunkt, eine Einzelfrage kann selbst Vorfrage sein): Spricht eine Einzelfrage dafür
 *     (anderer Wert als `sonst`, z. B. ein Treffer der Lage-Abfrage oder eine ältere Antwort „ja“), gilt die Vorfrage als
 *     „ja“ – so gesichert wie die Einzelfrage. Steht die Vorfrage auf „nein“, ist das ein Widerspruch; der zählt seinerseits
 *     für die Vorfrage darüber, bis ganz oben.
 *  2. Von oben nach unten: Ist eine Vorfrage wirksam „nein“ (gesichert, ohne Widerspruch), gilt jede Einzelfrage als
 *     `sonst` – mit der Vorfrage als Quelle (`ausVorfrage`). Eine gesicherte Antwort gleichen Werts lässt diese Funktion
 *     stehen; in der Auswertung zählt sie aber nicht, weil die Frage dann nicht gestellt ist (gestellteAntworten) – es gilt
 *     derselbe Wert, abgeleitet. Gespeichert bleibt sie.
 * „Unklar“ (keine Antwort) bzw. ein „nein“, das nur Hinweis ist, lässt die Einzelfragen offen. Nach Schritt 1 spricht
 * keine Einzelfrage einer wirksam verneinten Vorfrage mehr dafür – Schritt 2 überschreibt nie einen Treffer.
 */
export function vorfragenAnwenden(fakten: Record<string, FaktWert>, defs: Record<string, FaktDef>): Record<string, FaktWert> {
  const karte = vorfragenKarte(defs);
  if (!karte.size) return fakten;
  const out = { ...fakten };
  vorfragenSchritte(out, defs, karte);
  return out;
}

/** die zwei Schritte der Vorfragen an Ort und Stelle; true, wenn sich etwas geändert hat */
function vorfragenSchritte(out: Record<string, FaktWert>, defs: Record<string, FaktDef>, karte: Map<string, string[]>): boolean {
  let irgendwas = false;
  const name = (id: string) => faktName(defs[id], id);
  for (let runde = 0; runde <= karte.size + 1; runde++) {
    let geaendert = false;
    for (const [v, kinder] of karte) {
      const dafuer = kinder.find((k) => sprichtDafuer(out[k], defs[k].vorfrage!.sonst));
      if (!dafuer) continue;
      const vw = out[v];
      const f = out[dafuer];
      const wie = f.widerspruch && (f.wert == null || f.wert === defs[dafuer].vorfrage!.sonst) ? 'widersprüchlich' : `„${wertAnzeige(f.wert, defs[dafuer])}“`;
      if (vw?.wert === false) {
        if (!vw.widerspruch) {
          out[v] = { ...vw, widerspruch: `„${name(dafuer)}“ ist ${wie} – das spricht gegen „nein“` };
          geaendert = true;
        }
      } else if (vw?.wert !== true) {
        const sicher = faktStatus(f) === 'sicher';
        out[v] = {
          wert: true,
          herkunft: 'abgeleitet',
          quelle: `aus „${name(dafuer)}“${f.quelle ? ` (${f.quelle})` : ''}`,
          sicherheit: sicher ? 'sicher' : 'hinweis',
          ...(sicher ? {} : { grund: `folgt aus „${name(dafuer)}“, das nicht gesichert ist` }),
          ...(f.lage ? { lage: f.lage } : {}),
        };
        geaendert = true;
      }
    }
    irgendwas ||= geaendert;
    if (!geaendert) break;
  }
  for (let runde = 0; runde <= karte.size + 1; runde++) {
    let geaendert = false;
    for (const [v, kinder] of karte) {
      const vw = out[v];
      if (!vorfrageNein(vw)) continue;
      for (const k of kinder) {
        const f = out[k];
        if (f?.ausVorfrage === v || (f && f.wert != null && faktStatus(f) === 'sicher')) continue;
        out[k] = { wert: defs[k].vorfrage!.sonst, herkunft: 'abgeleitet', quelle: `Vorfrage „${name(v)}“: nein`, sicherheit: 'sicher', ausVorfrage: v, ...(vw!.stand ? { stand: vw!.stand } : {}) };
        geaendert = true;
      }
    }
    irgendwas ||= geaendert;
    if (!geaendert) break;
  }
  return irgendwas;
}

/**
 * Werte, die sich zwingend aus anderen Angaben ergeben (FaktDef.folgt): Trifft eine Zeile gesichert zu (`wenn` „ja“ ohne
 * Hinweis bzw. Widerspruch, auch über Merkmale), gilt ihr Wert – abgeleitet, Quelle der Grund (`ausFolge`), die Frage
 * entfällt (eine Angabe gleichen Werts zählt dann nicht eigens, sie bleibt gespeichert). Eine abweichende Angabe mit
 * Beleg überstimmt (Sonderfall); jede andere abweichende (auch ein Hinweis, z. B. aus dem Modell) bleibt stehen und wird
 * zum Widerspruch – nie still überschrieben.
 */
function folgenSchritt(out: Record<string, FaktWert>, eingang: Record<string, FaktWert>, defs: Record<string, FaktDef>, rest: Omit<KurzKontext, 'fakten'>): boolean {
  let geaendert = false;
  // `out` ändert sich in der Schleife an Ort und Stelle – derselbe Kontext sieht immer den neuesten Stand
  const ctx: KurzKontext = { ...rest, fakten: out };
  for (const [id, d] of Object.entries(defs)) {
    if (!d.folgt?.length) continue;
    const zeile = d.folgt.find((z) => {
      try {
        const b = werten(z.wenn, ctx);
        return b.w === 'ja' && !b.unsicher.length && !b.widerspruch.length;
      } catch {
        return false;
      }
    });
    const f = out[id];
    if (!zeile) {
      // trifft nichts (mehr) zu: ein früher abgeleiteter Wert dieses Laufs fällt weg – die eigene Angabe gilt wieder
      if (f?.ausFolge || f?.gegenFolge) {
        if (eingang[id]) out[id] = eingang[id];
        else delete out[id];
        geaendert = true;
      }
      continue;
    }
    if (f?.ausFolge === zeile.grund && f.wert === zeile.wert) continue;
    const eigen = f && f.wert != null && f.wert !== '' && !f.ausFolge;
    if (eigen && f.wert !== zeile.wert) {
      // abweichende Angabe: mit Beleg überstimmt sie, sonst Widerspruch (sichtbar, die Frage bleibt)
      if (!f.bestaetigt && !f.gegenFolge) {
        out[id] = { ...f, gegenFolge: zeile.grund, ...(f.widerspruch ? {} : { widerspruch: `ergibt sich aus anderen Angaben als „${wertAnzeige(zeile.wert, d)}“ (${zeile.grund})` }) };
        geaendert = true;
      }
      continue;
    }
    // ein Widerspruch der eigenen Angabe (z. B. aus einem Dienst) geht mit – er macht den Wert unsicher
    out[id] = {
      wert: zeile.wert,
      herkunft: 'abgeleitet',
      quelle: `ergibt sich: ${zeile.grund}`,
      sicherheit: 'sicher',
      ausFolge: zeile.grund,
      ...(f?.widerspruch ? { widerspruch: f.widerspruch } : {}),
    };
    geaendert = true;
  }
  return geaendert;
}

/**
 * Ableitungen zwischen den Angaben (nach den Werten der Module, vor den Regeln): Vorfragen (vorfragenAnwenden) und Werte,
 * die sich aus anderen ergeben (FaktDef.folgt) – abwechselnd bis zum Fixpunkt, denn das eine kann am anderen hängen.
 * `rest`: Merkmale, Bausteine, Widersprüche (für die Bedingungen von `folgt`). Zyklen lehnt paketPruefen ab
 * (fragenZyklen); deshalb steht der Fixpunkt nach wenigen Runden.
 */
export function ableitungenAnwenden(fakten: Record<string, FaktWert>, defs: Record<string, FaktDef>, rest: Omit<KurzKontext, 'fakten'>): Record<string, FaktWert> {
  const karte = vorfragenKarte(defs);
  const mitFolge = Object.values(defs).some((d) => d.folgt?.length);
  if (!karte.size && !mitFolge) return fakten;
  const out = { ...fakten };
  for (let runde = 0; runde < 8; runde++) {
    const v = karte.size ? vorfragenSchritte(out, defs, karte) : false;
    const f = mitFolge && folgenSchritt(out, fakten, defs, rest);
    if (!v && !f) break;
  }
  return out;
}

/**
 * Hinweis an einer offenen Vorfrage, wenn die Lage-Abfrage für einige Einzelfragen keinen Treffer fand: Das deckt die
 * Vorfrage nicht ab (andere Einzelfragen, Umfeld bzw. Einwirkungsbereich über den Umkreis der Abfrage hinaus) – deshalb
 * wird sie nicht vorbelegt. Ohne solche Ergebnisse: nichts.
 */
export function vorfrageHinweis(v: string, fakten: Record<string, FaktWert>, defs: Record<string, FaktDef>): string | undefined {
  if (fakten[v]?.wert != null) return undefined;
  const kinder = vorfragenKarte(defs).get(v) ?? [];
  const ohne = kinder.filter((k) => fakten[k]?.herkunft === 'geodienst' && fakten[k].wert === defs[k].vorfrage?.sonst);
  if (!ohne.length) return undefined;
  const puffer = Math.max(...ohne.map((k) => defs[k].geodienst?.puffer ?? 25));
  const rest = kinder.filter((k) => !ohne.includes(k) && fakten[k]?.wert == null);
  const namen = (ids: string[]) => ids.map((k) => faktName(defs[k], k)).join(', ');
  return `Lage-Abfrage: kein Treffer im Umkreis von ${puffer} m (${namen(ohne)}). ${rest.length ? `Nicht geprüft: ${namen(rest)}` : 'Das weitere Umfeld prüft sie nicht'} – deshalb nicht vorbelegt.`;
}
