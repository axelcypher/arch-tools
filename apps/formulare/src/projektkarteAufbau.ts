/**
 * Aufbau der Projektkarte in der Oberfläche: welche Gruppen wohin gehören, wie die Einträge einer Gruppe in
 * Abschnitte und Zeilen gegliedert sind, wie eine Gruppe in einer Zeile zusammengefasst wird und welche Eingaben
 * wahrscheinlich Tippfehler sind. Die Projektkarte selbst bleibt, wie FORMA sie anlegt – hier geht es nur ums
 * Anzeigen. Einträge, die der Aufbau nicht kennt (andere FORMA-Fassung), erscheinen unter „Weitere Angaben“.
 */

import type { PkEintrag, PkGruppe, Projektkarte } from './forma/projektkarte';
import { pkArt, pkTitel } from './forma/projektkarte';
import { GEBIETSARTEN } from '@core/model';

/** Adressgruppen (Bauherr, Entwurfsverfasser, Behörden …) haben in FORMA den Typ 1 */
export const istAdresse = (g: Pick<PkGruppe, 'typ'>) => g.typ === 1;

export interface AufbauFeld {
  id: number;
  /** Breite in Spalten von 12 */
  breite: number;
}

export interface AufbauAbschnitt {
  titel: string;
  felder: AufbauFeld[];
  /** zugeklappt, solange alle Einträge leer sind */
  einklappbar?: boolean;
}

const f = (id: number, breite: number): AufbauFeld => ({ id, breite });

/** Einträge jeder Adressgruppe (10 Branche … 250 IBAN) */
export const ADRESSE: AufbauAbschnitt[] = [
  { titel: 'Name', felder: [f(40, 8), f(30, 4), f(210, 5), f(20, 3), f(10, 4), f(50, 6), f(60, 6)] },
  { titel: 'Anschrift', felder: [f(70, 12), f(90, 3), f(110, 6), f(120, 3), f(80, 6), f(100, 3)] },
  { titel: 'Kontakt', felder: [f(130, 4), f(140, 4), f(160, 4), f(170, 8), f(150, 4), f(180, 8), f(220, 4)] },
  { titel: 'Bank und Sonstiges', einklappbar: true, felder: [f(240, 6), f(230, 6), f(250, 12), f(190, 4), f(200, 8)] },
];

const AUFBAU: Record<number, AufbauAbschnitt[]> = {
  101: [
    { titel: 'Vorhaben', felder: [f(30, 12), f(40, 12), f(50, 12)] },
    { titel: 'Verwaltung', felder: [f(60, 6), f(70, 6), f(130, 6), f(140, 6)] },
    { titel: 'Termine und Umfang', felder: [f(80, 4), f(90, 4), f(100, 4), f(110, 3), f(120, 5)] },
  ],
  301: [
    // 9010: PLZ – Ergänzung der App (zusatz.ts), in FORMA ohne Eintrag
    { titel: 'Lage', felder: [f(20, 6), f(9010, 2), f(10, 4), f(30, 6), f(40, 6), f(50, 3), f(60, 3)] },
    { titel: 'Grundbuch', felder: [f(70, 6), f(80, 6)] },
    { titel: 'Flächen', felder: [f(90, 3), f(100, 3), f(110, 3), f(120, 3)] },
    { titel: 'Beschaffenheit', felder: [f(130, 6), f(190, 6), f(200, 6), f(210, 6), f(220, 12)] },
  ],
  401: [
    { titel: 'Grundflächen', felder: [f(30, 4), f(40, 4), f(50, 4), f(60, 4), f(70, 4), f(80, 4)] },
    { titel: 'Rauminhalte', felder: [f(90, 4), f(100, 4), f(105, 4)] },
    { titel: 'Wohnfläche', felder: [f(110, 4)] },
  ],
  501: [{ titel: 'Geschosse', felder: [f(10, 4), f(20, 8), f(30, 4), f(40, 8), f(50, 4), f(60, 8), f(70, 4), f(80, 8)] }],
};

/** übliche Breite eines Eintrags ohne festen Aufbau */
function breiteVon(e: PkEintrag): number {
  switch (pkArt(e)) {
    case 'mehrzeilig':
      return 12;
    case 'kreuz':
      return 4;
    default:
      return 6;
  }
}

/** Abschnitte einer Gruppe mit den Einträgen, die es in dieser Projektkarte gibt */
export function aufbau(g: PkGruppe, eintraege: PkEintrag[]): { titel: string; einklappbar: boolean; felder: { eintrag: PkEintrag; breite: number }[] }[] {
  const vorlage = istAdresse(g) ? ADRESSE : (AUFBAU[g.id] ?? [{ titel: '', felder: eintraege.map((e) => f(e.id, breiteVon(e))) }]);
  const nachId = new Map(eintraege.map((e) => [e.id, e]));
  const benutzt = new Set<number>();
  const out = vorlage.map((a) => ({
    titel: a.titel,
    einklappbar: !!a.einklappbar,
    felder: a.felder.flatMap((x) => {
      const e = nachId.get(x.id);
      if (!e || benutzt.has(x.id)) return [];
      benutzt.add(x.id);
      return [{ eintrag: e, breite: x.breite }];
    }),
  }));
  const rest = eintraege.filter((e) => !benutzt.has(e.id));
  if (rest.length) out.push({ titel: 'Weitere Angaben', einklappbar: false, felder: rest.map((e) => ({ eintrag: e, breite: breiteVon(e) })) });
  return out.filter((a) => a.felder.length);
}

/* ---------- Gruppen ---------- */

/** Reihenfolge der Gruppen, die keine Adressen sind: erst das Vorhaben, dann das Grundstück … */
const PROJEKT_REIHE = [101, 301, 401, 501, 102, 502, 601];

export interface GruppenReihe {
  titel: string;
  gruppen: PkGruppe[];
}

/** Gruppen für die Navigation: „Projekt“ und „Beteiligte“ */
export function gruppenReihen(pk: Projektkarte): GruppenReihe[] {
  const mitEintraegen = pk.gruppen.filter((g) => pk.eintraege.some((e) => e.gruppe === g.id));
  const rang = (g: PkGruppe) => {
    const i = PROJEKT_REIHE.indexOf(g.id);
    return i < 0 ? PROJEKT_REIHE.length + g.id : i;
  };
  return [
    { titel: 'Projekt', gruppen: mitEintraegen.filter((g) => !istAdresse(g)).sort((a, b) => rang(a) - rang(b)) },
    { titel: 'Beteiligte', gruppen: mitEintraegen.filter(istAdresse) },
  ].filter((r) => r.gruppen.length);
}

/** Kurzfassung einer Gruppe für die Navigation, aus den angezeigten Texten der Einträge */
export function zusammenfassung(g: PkGruppe, text: (id: number) => string): string {
  const teile = (...xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);
  if (istAdresse(g)) {
    const name = teile(text(40), text(30)).join(', ');
    return teile(name, text(110)).join(' · ');
  }
  switch (g.id) {
    case 101:
      return text(30).split('\n')[0].trim();
    case 301:
      return teile(teile(text(20), text(10)).join(', '), teile(text(40), text(50) && `Flur ${text(50)}`, text(60) && `Flurstück ${text(60)}`).join(' ')).join(' · ');
    default:
      return '';
  }
}

/** Anschrift einer Adressgruppe, wie sie in Formularen steht */
export function anschrift(text: (id: number) => string): string[] {
  const zeile = (...xs: string[]) => xs.map((x) => x.trim()).filter(Boolean).join(' ');
  return [zeile(text(20), text(30), text(40)), text(50).trim(), text(60).trim() && `z. Hd. ${text(60).trim()}`, text(70).trim(), zeile(text(90), text(110)), text(80).trim() && zeile('Postfach', text(80), '·', text(100), text(110))].filter(Boolean);
}

/* ---------- Eingabehilfen ---------- */

function ibanGueltig(iban: string): boolean {
  const s = iban.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const umgestellt = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const z of umgestellt) rest = (rest * 10 + Number(z)) % 97;
  return rest === 1;
}

/** Hinweis auf einen wahrscheinlichen Tippfehler (nur Hinweis – gespeichert wird trotzdem) */
export function pruefung(g: PkGruppe, e: PkEintrag, wert: string, land: string): string | null {
  const w = wert.trim();
  if (!w) return null;
  const titel = pkTitel(e.titel).toLowerCase();
  const deutsch = !land.trim() || /^(d|de|deu|deutschland|germany)$/i.test(land.trim());
  if (istAdresse(g) && (e.id === 90 || e.id === 100) && deutsch && !/^\d{5}$/.test(w)) return 'Postleitzahlen in Deutschland haben fünf Ziffern.';
  if (titel.startsWith('e-mail') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(w)) return 'Sieht nicht wie eine E-Mail-Adresse aus.';
  if (titel.startsWith('iban') && !ibanGueltig(w)) return 'Die Prüfziffer der IBAN stimmt nicht.';
  if (/(telefon|telefax|mobil)/.test(titel) && !/^[+\d][\d\s/()\-.]*$/.test(w)) return 'Telefonnummern bestehen aus Ziffern, Leerzeichen und + / ( ) -.';
  return null;
}

/** Einheit aus dem Titel („Bebaute Fläche [m²]:“ → „m²“) */
export const einheit = (titel: string) => /\[([^\]]+)\]/.exec(titel)?.[1] ?? '';
/** Titel ohne Einheit und Doppelpunkt */
export const feldTitel = (titel: string) => pkTitel(titel).replace(/\s*\[[^\]]+\]\s*$/, '');

/* ---------- Eingaben mit fester Form ---------- */

/**
 * Einträge mit einer Anzahl („Anzahl der Wohnungen“): nur ganze Zahlen – nicht die Zahl der Vollgeschosse, die als
 * Festsetzung auch „II“, „II–III“ oder „zwingend“ lauten kann (§ 16 Abs. 4 BauNVO)
 */
export const istAnzahl = (titel: string) => /^anzahl\b/i.test(titel.trim()) && !/vollgeschoss/i.test(titel);

/**
 * Für „Art der baulichen Nutzung“: die Baugebiete der BauNVO (§ 1 Abs. 2, §§ 2–11) in der Schreibweise des
 * GRZ-Nachweises (packages/core GEBIETSARTEN), das Sondergebiet nach §§ 10 und 11 getrennt, dazu die Fälle ohne
 * Baugebiet (§§ 34, 35 BauGB), die Fläche für den Gemeinbedarf (§ 9 Abs. 1 Nr. 5 BauGB, z. B. Schule, Kita) und
 * der vorhabenbezogene Bebauungsplan (§ 12 BauGB). Im faktischen Baugebiet (§ 34 Abs. 2 BauGB) gilt das Baugebiet.
 */
export const BAUGEBIETE = [
  ...GEBIETSARTEN.filter((g) => g.id !== 'SO').map((g) => g.label),
  'SO – Sondergebiet, das der Erholung dient (§ 10 BauNVO)',
  'SO – sonstiges Sondergebiet (§ 11 BauNVO)',
  'Fläche für den Gemeinbedarf (§ 9 Abs. 1 Nr. 5 BauGB)',
  'Vorhabenbezogener Bebauungsplan (§ 12 BauGB)',
  // entspricht die nähere Umgebung einem Baugebiet (§ 34 Abs. 2 BauGB), wählt man das Baugebiet selbst
  'Innenbereich ohne Baugebiet (§ 34 Abs. 1 BauGB)',
  'Außenbereich (§ 35 BauGB)',
];

/** Gängige Nutzungen eines Gebäudes – für „Art der Nutzung“ (eigene Angaben bleiben möglich) */
export const NUTZUNGSARTEN = [
  'Wohnen',
  'Ferienwohnungen (§ 13a BauNVO)',
  'Wohnen und Gewerbe (gemischt)',
  'Büro und Verwaltung',
  'Handel',
  'Gewerbe und Handwerk',
  'Produktion und Industrie',
  'Lager und Logistik',
  'Gastronomie',
  'Beherbergung',
  'Vergnügungsstätte',
  'Tankstelle',
  'Landwirtschaft',
  'Bildung und Betreuung (Schule, Kita)',
  'Gesundheit und Pflege',
  'Kultur und Versammlung',
  'Sport und Freizeit',
  'Religiöse Zwecke',
  'Garage und Stellplätze',
  'Nebengebäude',
];

/** Vorschläge für einen Eintrag, falls er eine Art der Nutzung ist – „baulichen“ heißt die Gebietsart nach BauNVO */
export function nutzungsarten(titel: string): string[] | null {
  const t = titel.trim().toLowerCase();
  if (/^art der baulichen nutzung/.test(t)) return BAUGEBIETE;
  if (/^(art der nutzung|nutzungsart|nutzung)$/.test(t.replace(/:$/, ''))) return NUTZUNGSARTEN;
  return null;
}
