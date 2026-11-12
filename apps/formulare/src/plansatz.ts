/**
 * Plansatz: ein Dokument des Antragsumfangs, das alle Pläne umfasst (Grundrisse, Schnitte, Ansichten, Sonderpläne …),
 * statt je Plan einen Eintrag zu brauchen. Erkannt werden Pläne an der Plannummer (Stelle „nummer“ des Namensschemas,
 * mit Plankürzel: „HVO BAUA 261111 GP-04 Grundriss OG.pdf“) – im Antragsordner und in der Quelle (pdf-Ordner der
 * Genehmigungsplanung, aus dem die Pläne in den Antragsordner verschoben werden).
 *
 * Geprüft wird je Plankürzel:
 *  - Lücken: zwischen der kleinsten und der größten vorhandenen Nummer fehlt eine – nach der Bürovorgabe (fortlaufende
 *    Nummern) fehlt dann ein Plan (die Reihe muss nicht bei 01 beginnen; die Reihenfolge der Planarten spielt keine Rolle);
 *  - noch nicht verschoben: der Plan liegt nur in der Quelle;
 *  - veraltet: die Quelle hat ein neueres Datum im Namen als der Plan im Antragsordner;
 *  - Hinweise (nie sperrend): ältere Fassungen derselben Nummer, ein zusammengefasster Satz (GP01-07) neben
 *    Einzelplänen daraus, ein Index, wo das Schema keinen vorsieht, kein Schnitt bzw. keine Ansicht (§ 4 Abs. 1
 *    BauPrüfVO NRW) und – mit Geschossen aus der Projektdatei – weniger Grundrisse als Geschosse. Diese Hinweise fangen
 *    auch fehlende Pläne am Ende der Reihe auf, die keine Lücke hinterlassen.
 */

import type { Namensschema } from '@core/namensschema';
import { dateinameZerlegen, indexVorgesehen, planNummerAus, planSchluessel } from '@core/namensschema';
import type { Status } from './antrag';
import { passt, standVergleich } from './antrag';
import type { Eintrag } from './dateisystem';

/** aktuell · veraltet (Quelle neuer) · nicht verschoben (nur in der Quelle) · fehlt (Lücke in der Nummernfolge) */
export type PlanZustand = 'aktuell' | 'veraltet' | 'quelle' | 'fehlt';

/** Zustand kurz (Listen) und ausführlich (Tooltip) – überall dieselben Worte */
export const PLAN_ZUSTAND_KURZ: Record<PlanZustand, string> = {
  aktuell: 'aktuell',
  veraltet: 'veraltet',
  quelle: 'nicht verschoben',
  fehlt: 'fehlt',
};

export const PLAN_ZUSTAND_TEXT: Record<PlanZustand, string> = {
  aktuell: 'aktuell im Antragsordner',
  veraltet: 'veraltet – in der Quelle gibt es eine neuere Fassung',
  quelle: 'nicht verschoben – liegt erst in der Quelle',
  fehlt: 'fehlt – Lücke in der fortlaufenden Nummerierung',
};

export interface PlanEintrag {
  /** „GP-04“ */
  schluessel: string;
  kuerzel: string;
  nr: number;
  zustand: PlanZustand;
  /** Datei im Antragsordner (die neueste dieser Nummer) */
  datei?: Eintrag;
  /** Datei in der Quelle (die neueste dieser Nummer) */
  quelle?: Eintrag;
  /** Bezeichnung aus dem Namen („Grundriss OG“) */
  bezeichnung?: string;
  /** stammt aus einem zusammengefassten Satz (GP01-07) */
  satz?: boolean;
}

export interface PlansatzErgebnis {
  plaene: PlanEintrag[];
  /** Nummern, die in der Folge fehlen („GP-07“) */
  luecken: string[];
  /** Hinweise, nie sperrend */
  hinweise: string[];
  status: Status;
}

interface Fund {
  e: Eintrag;
  satz: boolean;
  index?: string;
  bezeichnung: string;
}

const nurName = (pfad: string) => pfad.split('/').pop() ?? pfad;
const istHilfsdatei = (name: string) => /^(~\$|\.~lock\.)/.test(name) || /^(thumbs\.db|desktop\.ini)$/i.test(name);

/** Pläne einer Dateiliste je Plannummer; ein Satz (GP01-07) zählt für jede seiner Nummern */
function sammeln(dateien: Eintrag[], schema: Namensschema, muster: string | undefined, hinweise: string[]): Map<string, Fund[]> {
  const nach = new Map<string, Fund[]>();
  for (const e of dateien) {
    const name = nurName(e.pfad);
    if (e.ordner || istHilfsdatei(name)) continue;
    if (muster?.trim() && !passt(name, muster)) continue;
    const teile = dateinameZerlegen(name, schema);
    const pn = planNummerAus(teile.nummer, schema);
    if (!pn) continue;
    if (pn.index && !indexVorgesehen(schema, pn.kuerzel)) {
      const h = `${planSchluessel(pn.kuerzel, pn.von)}${pn.index}: Index bei ${pn.kuerzel} nicht vorgesehen (erst ab Leistungsphase ${schema.indexAbLph}) – zählt als neuere Fassung`;
      if (!hinweise.includes(h)) hinweise.push(h);
    }
    for (let nr = pn.von; nr <= pn.bis; nr++) {
      const k = planSchluessel(pn.kuerzel, nr);
      nach.set(k, [...(nach.get(k) ?? []), { e, satz: pn.bis > pn.von, ...(pn.index ? { index: pn.index } : {}), bezeichnung: teile.rest }]);
    }
  }
  return nach;
}

/** Die neueste Fassung einer Nummer: Datum im Namen, dann Index, dann Änderungszeit; Einzelpläne vor Sätzen */
function neueste(funde: Fund[], codes: string[]): Fund {
  return funde.reduce((best, f) => {
    const v = standVergleich(f.e, best.e, codes);
    if (v !== 0) return v > 0 ? f : best;
    if ((f.index ?? '') !== (best.index ?? '')) return (f.index ?? '') > (best.index ?? '') ? f : best;
    if (f.satz !== best.satz) return f.satz ? best : f;
    return (f.e.geaendert ?? 0) > (best.e.geaendert ?? 0) ? f : best;
  });
}

const grundriss = (bezeichnung: string) => /grundri|(^|\s)gr(\s|$)/i.test(bezeichnung);
const schnitt = (bezeichnung: string) => /schnitt|(^|\s)sn(\s|$)/i.test(bezeichnung);
const ansicht = (bezeichnung: string) => /ansicht/i.test(bezeichnung);

/**
 * Plansatz prüfen: `antrag` sind die Dateien im Ordner der aktiven Antragsfassung, `quelle` die im Quellordner (auch
 * leer – die Pläne werden verschoben). `geschosse` aus der Projektdatei (fehlt = kein Abgleich).
 */
export function plansatzPruefen(antrag: Eintrag[], quelle: Eintrag[], schema: Namensschema, o: { codes?: string[]; geschosse?: number; muster?: string } = {}): PlansatzErgebnis {
  const codes = o.codes ?? [];
  const hinweise: string[] = [];
  const imAntrag = sammeln(antrag, schema, o.muster, hinweise);
  const inQuelle = sammeln(quelle, schema, o.muster, hinweise);

  // ältere Fassungen und Satz neben Einzelplänen im Antragsordner
  const saetzeMitEinzeln = new Set<string>();
  for (const [k, funde] of imAntrag) {
    if (funde.length < 2) continue;
    const einzeln = funde.filter((f) => !f.satz);
    const saetze = funde.filter((f) => f.satz);
    if (saetze.length && einzeln.length) for (const s of saetze) saetzeMitEinzeln.add(nurName(s.e.pfad));
    if (einzeln.length > 1) {
      const n = neueste(einzeln, codes);
      for (const f of einzeln) if (f !== n) hinweise.push(`${k}: ältere Fassung „${nurName(f.e.pfad)}“ liegt auch im Antragsordner – alte Fassung?`);
    }
  }
  for (const s of saetzeMitEinzeln) hinweise.push(`„${s}“ (Satz) und einzelne Pläne daraus liegen beide im Antragsordner`);

  // je Plankürzel: alle Nummern, Lücken dazwischen
  const nummern = new Map<string, Set<number>>();
  for (const k of [...imAntrag.keys(), ...inQuelle.keys()]) {
    const [kuerzel, nr] = [k.slice(0, k.lastIndexOf('-')), Number(k.slice(k.lastIndexOf('-') + 1))];
    nummern.set(kuerzel, (nummern.get(kuerzel) ?? new Set()).add(nr));
  }
  const plaene: PlanEintrag[] = [];
  const luecken: string[] = [];
  for (const [kuerzel, set] of [...nummern].sort((a, b) => schema.phasen.findIndex((p) => p.kuerzel === a[0]) - schema.phasen.findIndex((p) => p.kuerzel === b[0]) || a[0].localeCompare(b[0]))) {
    const liste = [...set].sort((a, b) => a - b);
    for (let nr = liste[0]; nr <= liste[liste.length - 1]; nr++) {
      const k = planSchluessel(kuerzel, nr);
      const a = imAntrag.get(k);
      const q = inQuelle.get(k);
      if (!a && !q) {
        luecken.push(k);
        plaene.push({ schluessel: k, kuerzel, nr, zustand: 'fehlt' });
        continue;
      }
      const na = a ? neueste(a, codes) : undefined;
      const nq = q ? neueste(q, codes) : undefined;
      const zustand: PlanZustand = !na ? 'quelle' : nq && standVergleich(nq.e, na.e, codes) > 0 ? 'veraltet' : 'aktuell';
      plaene.push({
        schluessel: k,
        kuerzel,
        nr,
        zustand,
        ...(na ? { datei: na.e } : {}),
        ...(nq ? { quelle: nq.e } : {}),
        bezeichnung: (na ?? nq)!.bezeichnung,
        ...((na ?? nq)!.satz ? { satz: true } : {}),
      });
    }
  }

  // Nur mit Einzelplänen zählbar (ein Satz verrät nicht, was er enthält):
  if (plaene.length && !plaene.some((p) => p.satz)) {
    const da = plaene.filter((p) => p.zustand !== 'fehlt').map((p) => p.bezeichnung ?? '');
    // Bauzeichnungen sind Grundrisse, Schnitte und Ansichten (§ 4 Abs. 1 BauPrüfVO NRW) – fehlt eine Art, ein Hinweis;
    // er sperrt nicht, weil die Behörde auf Bauvorlagen verzichten kann (§ 1 Abs. 2 BauPrüfVO) und ein Vorbescheid weniger braucht
    if (!da.some(schnitt)) hinweise.push('kein Schnitt erkannt (Bauzeichnungen: Grundrisse, Schnitte, Ansichten – § 4 Abs. 1 BauPrüfVO NRW)');
    if (!da.some(ansicht)) hinweise.push('keine Ansicht erkannt (Bauzeichnungen: Grundrisse, Schnitte, Ansichten – § 4 Abs. 1 BauPrüfVO NRW)');
    // Geschosse der Projektdatei: weniger Grundrisse als Geschosse?
    if (o.geschosse && o.geschosse > 0) {
      const gr = da.filter(grundriss).length;
      if (gr < o.geschosse) hinweise.push(`Projektdatei: ${o.geschosse} ${o.geschosse === 1 ? 'Geschoss' : 'Geschosse'}, ${gr} ${gr === 1 ? 'Grundriss' : 'Grundrisse'} erkannt`);
    }
  }

  const status: Status = !plaene.length ? 'fehlt' : luecken.length ? 'unvollstaendig' : plaene.some((p) => p.zustand === 'quelle' || p.zustand === 'veraltet') ? 'offen' : 'aktuell';
  return { plaene, luecken, hinweise, status };
}

/** Kurzfassung für die Zeile: „8 Pläne · GP-01 bis GP-08 · GP-07 fehlt“ */
export function plansatzKurz(r: PlansatzErgebnis): string {
  if (!r.plaene.length) return 'keine Pläne mit Plannummer gefunden';
  const da = r.plaene.filter((p) => p.zustand !== 'fehlt');
  const reihen = [...new Set(r.plaene.map((p) => p.kuerzel))].map((k) => {
    const n = r.plaene.filter((p) => p.kuerzel === k);
    return n.length > 1 ? `${n[0].schluessel} bis ${n[n.length - 1].schluessel}` : n[0].schluessel;
  });
  const teile = [`${da.length} ${da.length === 1 ? 'Plan' : 'Pläne'}`, reihen.join(', ')];
  if (r.luecken.length) teile.push(`${r.luecken.join(', ')} ${r.luecken.length === 1 ? 'fehlt' : 'fehlen'}`);
  const q = r.plaene.filter((p) => p.zustand === 'quelle').length;
  const v = r.plaene.filter((p) => p.zustand === 'veraltet').length;
  if (q) teile.push(`${q} ${PLAN_ZUSTAND_KURZ.quelle}`);
  if (v) teile.push(`${v} ${PLAN_ZUSTAND_KURZ.veraltet}`);
  return teile.join(' · ');
}
