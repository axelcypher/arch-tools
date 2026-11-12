/**
 * Plansatz: ein Dokument des Antragsumfangs, das alle Pläne umfasst (Grundrisse, Schnitte, Ansichten, Sonderpläne …),
 * statt je Plan einen Eintrag zu brauchen. Erkannt werden Pläne an der Plannummer (Stelle „nummer“ des Namensschemas,
 * mit Plankürzel: „HVO BAUA 261111 GP-04 Grundriss OG.pdf“) – direkt im Antragsordner und direkt in der Quelle
 * (pdf-Ordner der Genehmigungsplanung, aus dem die Pläne in den Antragsordner verschoben werden). Unterordner wie
 * „_Archiv“ oder „alt“ zählen nicht: zurückgezogene oder umnummerierte Pläne ergäben sonst Scheinnummern und -lücken.
 * Liegt ein Plan auch in einem anderen Format vor (dwg neben pdf), zählt das PDF.
 *
 * Geprüft wird je Plankürzel:
 *  - Lücken: zwischen der kleinsten und der größten vorhandenen Nummer fehlt eine – nach der Bürovorgabe (fortlaufende
 *    Nummern) fehlt dann ein Plan (die Reihe muss nicht bei 01 beginnen; die Reihenfolge der Planarten spielt keine Rolle);
 *  - noch nicht verschoben: der Plan liegt nur in der Quelle;
 *  - veraltet: die Quelle hat eine neuere Fassung als der Antragsordner (Datum im Namen, dann Index);
 *  - Hinweise (nie sperrend): ältere Fassungen derselben Nummer, ein zusammengefasster Satz (GP01-07) neben
 *    Einzelplänen daraus, ein Index, wo das Namensschema des Büros keinen vorsieht, eine Datei mit Plannummer, die
 *    nicht an ihrer Stelle im Namensschema steht (nicht gezählt), kein Schnitt bzw. keine Ansicht (§ 4 Abs. 1, 3, 4
 *    BauPrüfVO NRW bei Plänen einer Leistungsphase; bei DENK und ABGE ohne Paragraphen, auch für Pläne ohne LPH; nicht
 *    beim Entwässerungsantrag ENTW) und – mit Geschossen aus der Projektdatei – weniger Grundrisse als Geschosse.
 *    Diese Hinweise fangen auch fehlende Pläne am Ende der Reihe auf, die keine Lücke hinterlassen.
 */

import type { Namensschema } from '@core/namensschema';
import { dateinameZerlegen, indexVorgesehen, kuerzelZu, planNummerAus, planSchluessel } from '@core/namensschema';
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
  // „Lücke“ (rot, nicht vollständig) – grau „fehlt“ heißt in der Legende ein ganzes fehlendes Dokument
  fehlt: 'Lücke',
};

export const PLAN_ZUSTAND_TEXT: Record<PlanZustand, string> = {
  aktuell: 'aktuell im Antragsordner',
  veraltet: 'veraltet – in der Quelle gibt es eine neuere Fassung',
  quelle: 'nicht verschoben – liegt erst in der Quelle',
  fehlt: 'Lücke – diese Nummer fehlt in der fortlaufenden Nummerierung',
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

const nurName = (pfad: string) => pfad.split(/[\\/]/).pop() ?? pfad;
const istHilfsdatei = (name: string) => /^(~\$|\.~lock\.)/.test(name) || /^(thumbs\.db|desktop\.ini)$/i.test(name);
const ohneEndung = (name: string) => name.replace(/\.[^.]+$/, '').toLowerCase();
const istPdf = (name: string) => /\.pdf$/i.test(name);

/** Hinweis zu einem Index, den das Namensschema des Büros für diese Phase nicht vorsieht */
function indexHinweis(schema: Namensschema, kuerzel: string, plan: string): string {
  const lph = kuerzelZu(schema.phasen, kuerzel)?.lph;
  return lph === undefined
    ? `${plan}: für ${kuerzel} sieht das Namensschema des Büros keinen Index vor – zählt als neuere Fassung`
    : `${plan}: Index bei ${kuerzel} (LPH ${lph}) – nach dem Namensschema des Büros erst ab LPH ${schema.indexAbLph}; zählt als neuere Fassung`;
}

/**
 * Pläne einer Dateiliste je Plannummer; ein Satz (GP01-07) zählt für jede seiner Nummern. Nur Dateien direkt im
 * Ordner (keine Unterordner wie „_Archiv“, „alt“); gibt es zu einem Namen ein PDF, zählt nur das PDF.
 */
function sammeln(dateien: Eintrag[], schema: Namensschema, muster: string | undefined, hinweise: string[], codes: string[]): Map<string, Fund[]> {
  const nach = new Map<string, Fund[]>();
  const direkt = dateien.filter((e) => !e.ordner && !/[\\/]/.test(e.pfad) && !istHilfsdatei(e.pfad));
  const pdfs = new Set(direkt.filter((e) => istPdf(e.pfad)).map((e) => ohneEndung(e.pfad)));
  for (const e of direkt) {
    const name = e.pfad;
    if (!istPdf(name) && pdfs.has(ohneEndung(name))) continue;
    if (muster?.trim() && !passt(name, muster)) continue;
    // mit den Projektcodes: auch ein mehrteiliger Code („BS 9“) steht an seiner Stelle
    const teile = dateinameZerlegen(name, schema, codes);
    const pn = planNummerAus(teile.nummer, schema);
    if (!pn) {
      // sieht nach einem Plan aus, die Plannummer steht aber nicht an ihrer Stelle (etwa ohne Projektcode) – ohne
      // Hinweis fiele er still heraus, und weil die Reihe nicht bei 01 beginnen muss, auch ohne Lücke
      const nr =
        teile.nummer === undefined &&
        name
          .replace(/\.[^.]+$/, '')
          .split(/\s+/)
          .find((w) => planNummerAus(w, schema));
      const h = nr && `${name}: sieht nach Plan ${nr} aus, der Name folgt aber nicht dem Namensschema – nicht gezählt`;
      if (h && !hinweise.includes(h)) hinweise.push(h);
      continue;
    }
    if (pn.index && !indexVorgesehen(schema, pn.kuerzel)) {
      const h = indexHinweis(schema, pn.kuerzel, `${planSchluessel(pn.kuerzel, pn.von)}${pn.index}`);
      if (!hinweise.includes(h)) hinweise.push(h);
    }
    for (let nr = pn.von; nr <= pn.bis; nr++) {
      const k = planSchluessel(pn.kuerzel, nr);
      nach.set(k, [...(nach.get(k) ?? []), { e, satz: pn.bis > pn.von, ...(pn.index ? { index: pn.index } : {}), bezeichnung: teile.rest }]);
    }
  }
  return nach;
}

/** Stand zweier Fassungen derselben Nummer: Datum im Namen (sonst Änderungszeit), dann Index (AP-03a nach AP-03) */
function standVon(a: Fund, b: Fund, codes: string[]): number {
  const v = standVergleich(a.e, b.e, codes);
  if (v !== 0) return v;
  return (a.index ?? '').localeCompare(b.index ?? '');
}

/** Die neueste Fassung einer Nummer: nach dem Stand; bei gleichem Stand Einzelpläne vor Sätzen, dann Änderungszeit */
function neueste(funde: Fund[], codes: string[]): Fund {
  return funde.reduce((best, f) => {
    const v = standVon(f, best, codes);
    if (v !== 0) return v > 0 ? f : best;
    if (f.satz !== best.satz) return f.satz ? best : f;
    return (f.e.geaendert ?? 0) > (best.e.geaendert ?? 0) ? f : best;
  });
}

/** Planarten an der Bezeichnung: Grundriss, Schnitt („Längsschnitt“, „Schnitt A-A“ – nicht „Ausschnitt“), Ansicht */
const grundriss = (bezeichnung: string) => /grundri|(^|\s)gr(\s|$)/i.test(bezeichnung);
const schnitt = (bezeichnung: string) => /(?<!aus)schnitt|(^|\s)sn(\s|$)/i.test(bezeichnung);
const ansicht = (bezeichnung: string) => /ansicht/i.test(bezeichnung);

/**
 * Antragsarten, für deren Pläne Schnitt bzw. Ansicht nicht geprüft werden: Entwässerungsantrag (Grundlage in der
 * Regel die Entwässerungssatzung der Gemeinde)
 */
export const ARTEN_OHNE_BAUPRUEFVO = ['ENTW'];

/**
 * Antragsarten mit eigener Rechtsgrundlage, bei denen Grundrisse, Schnitte und Ansichten trotzdem üblich sind: die
 * denkmalrechtliche Erlaubnis (§ 9 DSchG NRW) und die Abgeschlossenheitsbescheinigung (Aufteilungspläne nach § 7 Abs. 4
 * WEG und der Verwaltungsvorschrift dazu) – Hinweise ohne Paragraphen der BauPrüfVO, auch für Pläne ohne LPH (AB)
 */
export const ARTEN_OHNE_PARAGRAF = ['DENK', 'ABGE'];

/** Längere Lücken (mehr fehlende Nummern am Stück) gelten als vermutlicher Tippfehler – ein Hinweis statt „fehlt“ */
export const MAX_LUECKE = 10;

/**
 * Plansatz prüfen: `antrag` sind die Dateien im Ordner der aktiven Antragsfassung, `quelle` die im Quellordner (auch
 * leer – die Pläne werden verschoben). `geschosse` aus der Projektdatei (fehlt = kein Abgleich).
 */
export function plansatzPruefen(
  antrag: Eintrag[],
  quelle: Eintrag[],
  schema: Namensschema,
  o: { codes?: string[]; geschosse?: number; muster?: string; /** Hauptkürzel der Antragsart (BAUA, ENTW …) */ art?: string } = {},
): PlansatzErgebnis {
  const codes = o.codes ?? [];
  const hinweise: string[] = [];
  const imAntrag = sammeln(antrag, schema, o.muster, hinweise, codes);
  const inQuelle = sammeln(quelle, schema, o.muster, hinweise, codes);

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
        // eine sehr große Lücke ist eher ein Tippfehler in einer Plannummer (GP-41 statt GP-04): ein Hinweis statt
        // Dutzender fehlender Pläne
        const naechste = liste.find((x) => x > nr)!;
        if (naechste - nr > MAX_LUECKE) {
          hinweise.push(`${k} bis ${planSchluessel(kuerzel, naechste - 1)} fehlen – ungewöhnlich große Lücke vor ${planSchluessel(kuerzel, naechste)}: Tippfehler in der Plannummer?`);
          nr = naechste - 1;
          continue;
        }
        luecken.push(k);
        plaene.push({ schluessel: k, kuerzel, nr, zustand: 'fehlt' });
        continue;
      }
      const na = a ? neueste(a, codes) : undefined;
      const nq = q ? neueste(q, codes) : undefined;
      const zustand: PlanZustand = !na ? 'quelle' : nq && standVon(nq, na, codes) > 0 ? 'veraltet' : 'aktuell';
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
    // Bauzeichnungen sind Grundrisse, Schnitte und Ansichten (§ 4 Abs. 1, 3, 4 BauPrüfVO NRW) – fehlt eine Art, ein
    // Hinweis. Er sperrt nicht: Die Behörde kann auf Bauvorlagen verzichten (§ 1 Abs. 2 BauPrüfVO), ein Vorbescheid
    // braucht nur die zur Beurteilung seiner Fragen erforderlichen (§ 16 BauPrüfVO). Nur bei Plänen einer
    // Leistungsphase – für Sonderfälle ohne LPH (AB, Aufteilungspläne nach § 7 Abs. 4 WEG) gilt die BauPrüfVO nicht.
    // Bei DENK und ABGE (eigene Rechtsgrundlage) wird trotzdem geprüft, auch ohne LPH, nur ohne Paragraphen; beim
    // Entwässerungsantrag (ENTW) gar nicht.
    const art = o.art ?? '';
    const pruefen = !ARTEN_OHNE_BAUPRUEFVO.includes(art) && (ARTEN_OHNE_PARAGRAF.includes(art) || plaene.some((p) => kuerzelZu(schema.phasen, p.kuerzel)?.lph !== undefined));
    const mitParagraf = pruefen && !ARTEN_OHNE_PARAGRAF.includes(art);
    const vorbescheid = art === 'BAUVA' ? ' – beim Vorbescheid nur, soweit für die Fragen erforderlich (§ 16 BauPrüfVO NRW)' : '';
    const grundlage = (absatz: string) =>
      mitParagraf ? `Bauzeichnungen umfassen Grundrisse, Schnitte und Ansichten – § 4 Abs. 1, ${absatz} BauPrüfVO NRW${vorbescheid}` : 'übliche Bauzeichnungen: Grundrisse, Schnitte, Ansichten';
    if (pruefen && !da.some(schnitt)) hinweise.push(`kein Schnitt erkannt (${grundlage('3')})`);
    if (pruefen && !da.some(ansicht)) hinweise.push(`keine Ansicht erkannt (${grundlage('4')})`);
    // Geschosse der Projektdatei: weniger Grundrisse als Geschosse? (nicht beim Entwässerungsantrag – dort genügen die
    // Geschosse mit Entwässerungsanlagen)
    if (o.geschosse && o.geschosse > 0 && art !== 'ENTW') {
      const gr = da.filter(grundriss).length;
      const grundlage = mitParagraf ? ` (Grundrisse für alle Geschosse – § 4 Abs. 2 BauPrüfVO NRW${vorbescheid})` : '';
      if (gr < o.geschosse) hinweise.push(`Projektdatei: ${o.geschosse} ${o.geschosse === 1 ? 'Geschoss' : 'Geschosse'}, ${gr} ${gr === 1 ? 'Grundriss' : 'Grundrisse'} erkannt${grundlage}`);
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
