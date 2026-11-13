/**
 * Bedingungen für die Erforderlichkeit: Abschnitte, Gruppen und Felder eines Formulars (und Dokumente des
 * Antragsumfangs) können von Antragsmerkmalen abhängen – „nur bei Gebäudeklasse 3, 4 oder 5“ – oder von anderen
 * Feldern desselben Formulars – „wenn ‚Sonderbau‘ angekreuzt ist“.
 *
 * Eine Bedingung ist eine Gruppe: Entweder müssen alle Teile zutreffen (und) oder mindestens einer (oder). Teile
 * sind einzelne Prüfungen oder wieder Gruppen – etwa „Gebäudeklasse 3–5 und (Sonderbau angekreuzt oder Verfahren
 * Baugenehmigungsverfahren)“. Ohne Bedingung ist immer erforderlich.
 *
 * Antragsmerkmale (Gebäudeklasse, Sonderbau, Verfahren …) werden in den Einstellungen festgelegt; ihr Wert gilt je
 * Projekt für alle Formulare und steht in der Projektdatei (.oap) unter `meta.merkmale`.
 *
 * Drei Ergebnisse (R-01): Eine Bedingung trifft zu (`ja`: erforderlich), trifft nicht zu (`nein`: entfällt) oder ist
 * **offen** – sie hängt an einem Antragsmerkmal, das noch nicht festgelegt ist. Ein fehlendes Merkmal lässt nichts
 * entfallen (Fail-safe): Offenes gilt als erforderlich, bis das Merkmal festgelegt ist. Ausgewertet wird dreiwertig
 * (und: ein `nein` genügt für `nein`; oder: ein `ja` genügt für `ja`; sonst offen, wenn etwas offen ist) – so entfällt
 * ein Feld trotz fehlendem Merkmal nur, wenn es schon nach den übrigen Angaben feststeht.
 */

export interface Merkmal {
  name: string;
  /** mögliche Werte */
  werte: string[];
  /** Vorgabewert für neue Anträge (globales Preset); fehlt = leer */
  vorgabe?: string;
}

/** Vorgabewerte der Merkmale für einen neuen Antrag: Name → Wert (nur gesetzte, die zu den Werten passen) */
export const merkmalVorgaben = (liste: Merkmal[]): Record<string, string> =>
  Object.fromEntries(liste.filter((m) => m.vorgabe && m.werte.includes(m.vorgabe)).map((m) => [m.name, m.vorgabe!]));

/**
 * Merkmale, die die App mitbringt – die Vorgaben der Formulare (vorgaben/) bauen darauf auf. Sie bleiben deshalb
 * immer in der Liste, auch wenn man eigene Merkmale anlegt; ihre Werte ebenso (eigene Werte kommen dazu).
 */
export const VORGABE_MERKMALE: Merkmal[] = [
  { name: 'Gebäudeklasse', werte: ['1', '2', '3', '4', '5'] },
  { name: 'Sonderbau', werte: ['ja', 'nein'] },
  { name: 'Verfahren', werte: ['verfahrensfrei', 'Genehmigungsfreistellung', 'vereinfachtes Verfahren', 'Baugenehmigungsverfahren'] },
  /** Art des Gebäudes (Wohngebäude nach Zahl der Wohnungen, gemischt genutzt, Nichtwohngebäude) */
  { name: 'Gebäudeart', werte: ['Einfamilienhaus', 'Zweifamilienhaus', 'Mehrfamilienhaus', 'Wohn- und Geschäftshaus', 'Nichtwohngebäude', 'kein Gebäude'] },
  /**
   * Art des Vorhabens (§ 60 BauO NRW 2018; Beseitigung § 62 Absatz 3). „Erweiterung“ (Anbau, Aufstockung) ist
   * bauordnungsrechtlich eine Änderung, für die Kostenangabe aber wie eine Errichtung (Brutto-Rauminhalt)
   */
  { name: 'Vorhaben', werte: ['Errichtung', 'Erweiterung', 'Änderung', 'Nutzungsänderung', 'Beseitigung'] },
  /**
   * planungsrechtliche Lage des Grundstücks (§§ 30, 34, 35 BauGB); „Bebauungsplan“ = qualifiziert oder
   * vorhabenbezogen, der einfache Bebauungsplan und Satzungen nach dem BauGB eigens (R-25)
   */
  { name: 'Planungsrecht', werte: ['Bebauungsplan', 'einfacher Bebauungsplan', 'Innenbereich', 'Außenbereich', 'Satzung nach BauGB'] },
];

/**
 * Kurzerklärung mit Fundstelle je Merkmal der App und je Wert – bei der Auswahl gezeigt: Die Wahl ist eine rechtliche
 * Einordnung durch die Entwurfsverfassenden (§ 54 Abs. 1 BauO NRW 2018), ohne Erklärung verleitet sie zu falschen
 * Werten.
 */
export const MERKMAL_ERKLAERUNG: Record<string, { text: string; quelle?: Quelle; werte?: Record<string, string> }> = {
  Gebäudeklasse: {
    text: 'Gebäudeklasse (§ 2 Abs. 3 BauO NRW 2018)',
    quelle: { gesetz: 'bauo-nrw', paragraf: '2', absatz: 3 },
    werte: {
      '1': 'freistehend, Höhe bis 7 m, höchstens zwei Nutzungseinheiten mit zusammen bis 400 m²; land- oder forstwirtschaftlich genutzte Gebäude',
      '2': 'Höhe bis 7 m, höchstens zwei Nutzungseinheiten mit zusammen bis 400 m²',
      '3': 'sonstige Gebäude mit einer Höhe bis 7 m',
      '4': 'Höhe bis 13 m, Nutzungseinheiten mit je bis 400 m² in einem Geschoss',
      '5': 'sonstige Gebäude einschließlich unterirdischer',
    },
  },
  Sonderbau: {
    text: 'Sonderbau (§ 50 BauO NRW 2018)',
    quelle: { gesetz: 'bauo-nrw', paragraf: '50' },
    werte: { ja: 'Anlage oder Raum besonderer Art oder Nutzung, z. B. Hochhaus, Verkaufsstätte, Versammlungsstätte, Mittel- und Großgarage', nein: 'kein Sonderbau' },
  },
  Verfahren: {
    text: 'Verfahren (§§ 62 bis 65 BauO NRW 2018)',
    quelle: { gesetz: 'bauo-nrw', paragraf: '64' },
    werte: {
      verfahrensfrei: '§ 62 BauO NRW 2018 – ohne Baugenehmigung; die Anforderungen gelten trotzdem (§ 60 Abs. 2)',
      Genehmigungsfreistellung: '§ 63 BauO NRW 2018',
      'vereinfachtes Verfahren': '§ 64 BauO NRW 2018',
      Baugenehmigungsverfahren: '§ 65 BauO NRW 2018 (große Sonderbauten)',
    },
  },
  Gebäudeart: {
    text: 'Art des Gebäudes (Wohngebäude nach Zahl der Wohnungen, gemischt genutzt oder Nichtwohngebäude)',
    werte: {
      'Wohn- und Geschäftshaus': 'Wohnungen und gewerbliche oder öffentlich zugängliche Nutzung (z. B. Laden, Praxis, Werkstatt) in einem Gebäude',
      Nichtwohngebäude: 'Gebäude ohne Wohnungen (Gewerbe, Landwirtschaft, Büro, öffentliche Nutzung)',
      'kein Gebäude': 'bauliche Anlage, die kein Gebäude ist (z. B. Mast, Werbeanlage, Stützmauer)',
    },
  },
  Vorhaben: {
    text: 'Art des Vorhabens (§ 60 BauO NRW)',
    quelle: { gesetz: 'bauo-nrw', paragraf: '60' },
    werte: {
      Errichtung: 'Neubau einer Anlage; Abbruch und Neubau in einem Antrag: „Beseitigung“ mit Umfang „Abbruch mit Ersatzbau“',
      Erweiterung: 'Anbau oder Aufstockung – bauordnungsrechtlich eine Änderung mit Vergrößerung; für die Kosten zählt wie beim Neubau der Brutto-Rauminhalt (Rohbausumme)',
      Änderung: 'bauliche Änderung einer bestehenden Anlage ohne Vergrößerung (Anbau, Aufstockung: „Erweiterung“) – für die Kosten zählt die Herstellungssumme',
      Nutzungsänderung: 'andere Nutzung einer bestehenden Anlage, auch ohne bauliche Änderung',
      Beseitigung: 'Abbruch einer Anlage (§ 62 Abs. 3 BauO NRW) – ganz oder teilweise, mit oder ohne Ersatzbau; der Umfang steht darunter (Teilabbruch wird wie eine Änderung geprüft, Ersatzbau wie Errichtung und Beseitigung)',
    },
  },
  Planungsrecht: {
    text: 'Planungsrechtliche Lage (§§ 30, 34, 35 BauGB)',
    quelle: { gesetz: 'baugb', paragraf: '30' },
    werte: {
      Bebauungsplan: 'qualifizierter oder vorhabenbezogener Bebauungsplan (§ 30 Abs. 1, 2 BauGB)',
      'einfacher Bebauungsplan': 'Bebauungsplan ohne alle Mindestfestsetzungen, im Übrigen § 34 oder § 35 BauGB (§ 30 Abs. 3 BauGB)',
      Innenbereich: 'im Zusammenhang bebauter Ortsteil (§ 34 BauGB)',
      Außenbereich: '§ 35 BauGB',
      'Satzung nach BauGB': 'z. B. Innenbereichssatzung (§ 34 Abs. 4 BauGB), Außenbereichssatzung (§ 35 Abs. 6 BauGB)',
    },
  },
};

const gleicherName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Eigene Merkmalliste samt den Merkmalen der App: fehlende kommen ans Ende, fehlende Werte der App ebenso */
export function mitVorgabeMerkmalen(liste: Merkmal[]): Merkmal[] {
  const out = liste.map((m) => {
    const v = VORGABE_MERKMALE.find((x) => gleicherName(x.name, m.name));
    return v ? { ...m, werte: [...m.werte, ...v.werte.filter((w) => !m.werte.includes(w))] } : m;
  });
  for (const v of VORGABE_MERKMALE) if (!out.some((m) => gleicherName(m.name, v.name))) out.push({ ...v, werte: [...v.werte] });
  return out;
}

/** Merkmal der App (kann nicht entfernt werden) */
export const istVorgabeMerkmal = (name: string) => VORGABE_MERKMALE.some((v) => gleicherName(v.name, name));

export type FeldPruefung = 'ausgefuellt' | 'leer' | 'gleich' | 'ungleich';

export type Teilbedingung =
  /** das Antragsmerkmal hat einen dieser Werte (`nicht`: keinen davon) */
  | { art: 'merkmal'; merkmal: string; werte: string[]; nicht?: boolean }
  /** ein Feld desselben Formulars ist ausgefüllt (Kästchen: angekreuzt), leer, hat einen Wert oder nicht */
  | { art: 'feld'; feld: string; pruefung: FeldPruefung; wert?: string };

export type Verknuepfung = 'und' | 'oder';

/** Gruppe: alle Teile (und) bzw. mindestens einer (oder) */
export interface BedingungGruppe {
  art: 'gruppe';
  op: Verknuepfung;
  teile: BedingungTeil[];
  /** warum es diese Bedingung gibt (Vorgaben der App) – erscheint, wenn ein Feld deshalb entfällt */
  grund?: string;
  /** Rechtsgrundlage(n) – öffnen den Gesetzestext */
  quellen?: Quelle[];
}

/** Fundstelle im Gesetz, z. B. § 68 Absatz 2 Satz 3 BauO NRW 2018 (Gesetze siehe recht/) */
export interface Quelle {
  /** Kennung des Gesetzes: `bauo-nrw`, `baupruefvo`, `baugb`, `baunvo`, `bnatschg`, `geig` */
  gesetz: string;
  paragraf: string;
  absatz?: number;
  satz?: number;
  nummer?: number;
}

function quelleAus(roh: unknown): Quelle | null {
  if (!roh || typeof roh !== 'object') return null;
  const o = roh as Record<string, unknown>;
  if (typeof o.gesetz !== 'string' || !o.gesetz || typeof o.paragraf !== 'string' || !o.paragraf) return null;
  const zahl = (x: unknown) => (typeof x === 'number' && Number.isInteger(x) && x > 0 ? x : undefined);
  const q: Quelle = { gesetz: o.gesetz, paragraf: o.paragraf };
  for (const k of ['absatz', 'satz', 'nummer'] as const) if (zahl(o[k])) q[k] = zahl(o[k]);
  return q;
}

export type BedingungTeil = Teilbedingung | BedingungGruppe;

/** Eine Bedingung ist immer eine Gruppe; `undefined` = immer erforderlich */
export type Bedingung = BedingungGruppe;

export interface BedingungKontext {
  /** Antragsmerkmale des Projekts: Name → Wert */
  merkmale: Record<string, string>;
  /** Wert eines Felds im Formular (Text oder angekreuzt) */
  wert?: (schluessel: string) => string | boolean | undefined;
}

export const gruppe = (op: Verknuepfung, teile: BedingungTeil[] = []): BedingungGruppe => ({ art: 'gruppe', op, teile });

const gefuellt = (w: string | boolean | undefined) => w === true || (typeof w === 'string' && w.trim() !== '');
const gleichText = (w: string | boolean | undefined, soll: string | undefined) => typeof w === 'string' && w.trim().toLowerCase() === (soll ?? '').trim().toLowerCase();

/** Gibt es überhaupt etwas zu prüfen? */
export const hatBedingung = (b: Bedingung | undefined): b is Bedingung => !!b && blaetter(b).length > 0;

/** alle einzelnen Prüfungen (über alle Ebenen) */
export function blaetter(b: BedingungTeil | undefined): Teilbedingung[] {
  if (!b) return [];
  return b.art === 'gruppe' ? b.teile.flatMap(blaetter) : [b];
}

/** Ergebnis einer Bedingung: trifft zu, trifft nicht zu, offen (hängt an einem nicht festgelegten Antragsmerkmal) */
export type Wahrheit = 'ja' | 'nein' | 'offen';

const aus = (b: boolean): Wahrheit => (b ? 'ja' : 'nein');

function trifft(t: BedingungTeil, k: BedingungKontext): Wahrheit {
  if (t.art === 'gruppe') {
    const geprueft = t.teile.filter((x) => x.art !== 'gruppe' || blaetter(x).length);
    if (!geprueft.length) return 'ja';
    const teile = geprueft.map((x) => trifft(x, k));
    const entscheidet: Wahrheit = t.op === 'oder' ? 'ja' : 'nein';
    if (teile.includes(entscheidet)) return entscheidet;
    return teile.includes('offen') ? 'offen' : t.op === 'oder' ? 'nein' : 'ja';
  }
  if (t.art === 'merkmal') {
    const v = k.merkmale[t.merkmal];
    // ohne Wert im Projekt offen – auch verneint (nie „trifft nicht zu“, sonst entfiele eine Pflichtangabe)
    if (!v) return 'offen';
    return aus(t.nicht ? !t.werte.includes(v) : t.werte.includes(v));
  }
  const w = k.wert?.(t.feld);
  if (t.pruefung === 'ausgefuellt') return aus(gefuellt(w));
  if (t.pruefung === 'leer') return aus(!gefuellt(w));
  if (t.pruefung === 'ungleich') return aus(!gleichText(w, t.wert));
  return aus(gleichText(w, t.wert));
}

/** Bedingung dreiwertig auswerten; ohne Bedingung `ja` */
export function auswerten(b: Bedingung | undefined, k: BedingungKontext): Wahrheit {
  return hatBedingung(b) ? trifft(b, k) : 'ja';
}

/**
 * Ist erforderlich, was an der Bedingung hängt? Ohne Bedingung: ja. Fail-safe: Hängt sie an einem nicht festgelegten
 * Antragsmerkmal (offen), gilt sie als erfüllt – nur ein sicheres „trifft nicht zu“ lässt etwas entfallen.
 */
export function erfuellt(b: Bedingung | undefined, k: BedingungKontext): boolean {
  return auswerten(b, k) !== 'nein';
}

/** Hängt die Bedingung an einem nicht festgelegten Antragsmerkmal und ist deshalb noch offen? */
export const istOffen = (b: Bedingung | undefined, k: BedingungKontext) => auswerten(b, k) === 'offen';

/** Gesamtergebnis mehrerer Ebenen (Abschnitt, Gruppe, Feld): ein `nein` entscheidet, sonst offen vor ja */
export function zusammenfassen(...w: Wahrheit[]): Wahrheit {
  return w.includes('nein') ? 'nein' : w.includes('offen') ? 'offen' : 'ja';
}

/** Fehlt im Projekt ein Merkmal, von dem die Bedingung abhängt? (für den Hinweis „Gebäudeklasse festlegen“) */
export const fehlendeMerkmale = (b: Bedingung | undefined, merkmale: Record<string, string>) =>
  blaetter(b).flatMap((t) => (t.art === 'merkmal' && !merkmale[t.merkmal] ? [t.merkmal] : []));

/** Nur die Teile mit Antragsmerkmalen (für Dokumente des Antragsumfangs, die keine Felder kennen) */
export function nurMerkmale(b: Bedingung | undefined): Bedingung | undefined {
  const filtern = (g: BedingungGruppe): BedingungGruppe => ({ ...g, teile: g.teile.flatMap((t): BedingungTeil[] => (t.art === 'gruppe' ? [filtern(t)] : t.art === 'merkmal' ? [t] : [])) });
  const out = b && filtern(b);
  return hatBedingung(out) ? out : undefined;
}

/** Werte als Text: „3, 4 oder 5“ */
function liste(werte: string[], wort = 'oder'): string {
  if (werte.length <= 1) return werte[0] ?? '–';
  return `${werte.slice(0, -1).join(', ')} ${wort} ${werte[werte.length - 1]}`;
}

type FeldName = (schluessel: string) => { titel: string; kreuz: boolean } | undefined;

function teilText(t: BedingungTeil, feldName: FeldName, oben: boolean): string {
  if (t.art === 'gruppe') {
    const teile = t.teile.filter((x) => blaetter(x).length).map((x) => teilText(x, feldName, false));
    const text = teile.join(t.op === 'oder' ? ' oder ' : ' und ');
    return !oben && teile.length > 1 ? `(${text})` : text;
  }
  if (t.art === 'merkmal') {
    if (!t.werte.length) return `${t.merkmal} (noch kein Wert gewählt)`;
    return t.nicht ? `${t.merkmal} nicht ${liste(t.werte)}` : `${t.merkmal} ${liste(t.werte)}`;
  }
  const f = feldName(t.feld);
  const name = `„${f?.titel ?? t.feld}“`;
  if (t.pruefung === 'ausgefuellt') return `${name} ${f?.kreuz ? 'angekreuzt' : 'ausgefüllt'}`;
  if (t.pruefung === 'leer') return `${name} ${f?.kreuz ? 'nicht angekreuzt' : 'leer'}`;
  if (t.pruefung === 'ungleich') return `${name} ≠ „${t.wert ?? ''}“`;
  return `${name} = „${t.wert ?? ''}“`;
}

/** Bedingung in Worten: „Gebäudeklasse 3, 4 oder 5 und („Sonderbau“ angekreuzt oder Verfahren …)“ */
export function bedingungText(b: Bedingung | undefined, feldName: FeldName = () => undefined): string {
  return hatBedingung(b) ? teilText(b, feldName, true) : '';
}

/** eine gelesene Prüfung; Unbekanntes → null */
function teilAus(roh: unknown, tiefe: number): BedingungTeil | null {
  if (!roh || typeof roh !== 'object') return null;
  const o = roh as Record<string, unknown>;
  if (o.art === 'gruppe' || Array.isArray(roh)) {
    if (tiefe > 4) return null;
    const teile = (Array.isArray(roh) ? roh : Array.isArray(o.teile) ? o.teile : []).map((t) => teilAus(t, tiefe + 1)).filter((t): t is BedingungTeil => !!t);
    const g = gruppe(o.op === 'oder' ? 'oder' : 'und', teile);
    if (typeof o.grund === 'string' && o.grund.trim()) g.grund = o.grund.trim();
    const quellen = (Array.isArray(o.quellen) ? o.quellen : []).map(quelleAus).filter((q): q is Quelle => !!q);
    if (quellen.length) g.quellen = quellen;
    return g;
  }
  if (o.art === 'merkmal' && typeof o.merkmal === 'string' && o.merkmal && Array.isArray(o.werte)) {
    // auch ohne gewählten Wert behalten (beim Bearbeiten) – trifft dann nicht zu (ohne Wert im Projekt: offen)
    return { art: 'merkmal', merkmal: o.merkmal, werte: o.werte.filter((w): w is string => typeof w === 'string' && !!w), ...(o.nicht === true ? { nicht: true } : {}) };
  }
  if (o.art === 'feld' && typeof o.feld === 'string' && o.feld && (o.pruefung === 'ausgefuellt' || o.pruefung === 'leer' || o.pruefung === 'gleich' || o.pruefung === 'ungleich')) {
    return { art: 'feld', feld: o.feld, pruefung: o.pruefung, ...(o.pruefung === 'gleich' || o.pruefung === 'ungleich' ? { wert: typeof o.wert === 'string' ? o.wert : '' } : {}) };
  }
  return null;
}

/**
 * Gelesene Bedingung prüfen; Unbekanntes fällt weg. Die frühere Form (eine Liste, alle Teile müssen zutreffen)
 * wird zur Und-Gruppe.
 */
export function bedingungAus(roh: unknown): Bedingung | undefined {
  if (!roh || typeof roh !== 'object') return undefined;
  const t = teilAus(Array.isArray(roh) ? roh : (roh as { art?: unknown }).art === 'gruppe' ? roh : null, 0);
  return t && t.art === 'gruppe' && hatBedingung(t) ? t : undefined;
}

export function merkmaleAus(roh: unknown): Merkmal[] {
  if (!Array.isArray(roh)) return VORGABE_MERKMALE;
  return mitVorgabeMerkmalen(eigeneMerkmale(roh));
}

function eigeneMerkmale(roh: unknown[]): Merkmal[] {
  return roh
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object' && typeof (m as { name?: unknown }).name === 'string' && !!(m as { name: string }).name.trim())
    .map((m) => {
      const werte = (Array.isArray(m.werte) ? m.werte : []).filter((w): w is string => typeof w === 'string' && !!w.trim()).map((w) => w.trim());
      const vorgabe = typeof m.vorgabe === 'string' ? m.vorgabe.trim() : '';
      return { name: String(m.name).trim(), werte, ...(vorgabe ? { vorgabe } : {}) };
    });
}
