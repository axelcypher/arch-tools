import type { Anrechnung, GelaendeQuelle, Kennzahl, Nachweis, Status } from './massNutzung';
import type { BauNVOFassung, LageplanNutzung } from '@core/model';
import { nutzungLabel } from '@core/lageplan';

/** Bezeichnungen für Ansicht, Druck und Excel */

export const STATUS: Record<Status, { label: string; cls: string }> = {
  ok: { label: 'eingehalten', cls: 'ok' },
  ueberschritten: { label: 'überschritten', cls: 'bad' },
  unterschritten: { label: 'unterschritten', cls: 'bad' },
  pruefen: { label: 'prüfen', cls: 'warn' },
  offen: { label: 'Festsetzung fehlt', cls: 'off' },
  fehlt: { label: 'Grundstücksfläche fehlt', cls: 'off' },
};

export const ANRECHNUNG: Record<Anrechnung, string> = {
  hauptanlage: 'zählt',
  grz2: 'GRZ II',
  garage01: 'bis 0,1 frei',
  nein: 'zählt nicht',
  pruefen: 'prüfen',
};

export const GELAENDE_QUELLE: Record<GelaendeQuelle, string> = {
  festgelegt: 'festgelegte Höhe',
  modell: 'Geländemodell der IFC',
  lageplan: 'Lageplan-Flächen mit Höhe',
  annahme: 'angenommen',
};

/** Herkunft der Grundstücksfläche */
export const GRUNDSTUECK_QUELLE = { projektdaten: 'Projektdaten (Kataster)', grenze: 'aus der gezeichneten Grenze', lageplan: 'aus dem Lageplan', fehlt: 'fehlt' } as const;

export const AUFENTHALT = { ja: 'Aufenthaltsraum', nein: 'kein Aufenthaltsraum', treppe: 'Treppenraum' } as const;

export const GF_ART: Record<Nachweis['gfJeGeschoss'][number]['art'], string> = {
  vollgeschoss: 'Vollgeschoss, Außenmaße (ohne Balkone, Loggien, Terrassen)',
  aufenthalt: 'Aufenthaltsräume mit Treppenräumen und Umfassungswänden',
  keine: 'zählt nicht',
};

/** zulässige Vollgeschosse als Text: „zulässig II · “, „mind. I, höchstens III · “, „zwingend II · “ */
export function vollgeschosseZulaessig(v: Nachweis['vollgeschosse'], ende = ' · '): string {
  if (v.zwingend && v.zulaessig !== undefined) return `zwingend ${roemisch(v.zulaessig)}${ende}`;
  const t = [v.mindestens !== undefined && `mind. ${roemisch(v.mindestens)}`, v.zulaessig !== undefined && `höchstens ${roemisch(v.zulaessig)}`].filter(Boolean);
  if (!t.length) return '';
  return `${v.mindestens === undefined ? `zulässig ${roemisch(v.zulaessig!)}` : t.join(', ')}${ende}`;
}

export function roemisch(n: number): string {
  const r = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  return n >= 0 && n <= 10 ? r[n] || '0' : String(n);
}

const fix = (v: number, d: number) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Festsetzung (GRZ/GFZ zulässig) wie eingetragen: mindestens zwei, höchstens vier Nachkommastellen */
export const zahl = (v: number) => v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/**
 * Nachkommastellen einer Kennzahl: mindestens drei; liegt sie näher als 0,005 am Grenzwert, vier – und so viele mehr,
 * bis sie sich in der Anzeige vom Grenzwert unterscheidet (nie „überschritten“ neben gleich aussehenden Zahlen)
 */
export function kennzahlStellen(v: number, grenze?: number): number {
  if (grenze === undefined || Math.abs(v - grenze) < 1e-12) return 3;
  let d = Math.abs(v - grenze) < 0.005 ? 4 : 3;
  while (d < 8 && fix(v, d) === fix(grenze, d)) d++;
  return d;
}

/** Kennzahl (GRZ/GFZ) mit den Stellen nach kennzahlStellen – gleich in Kachel, Druck und Excel */
export const kennzahlText = (v: number, grenze?: number) => fix(v, kennzahlStellen(v, grenze));

/** Stellen für Wert und Spanne einer Kennzahl gemeinsam (beide gegen den zulässigen Wert) */
export function kennzahlStellenVon(k: Kennzahl): number {
  if (k.wert === undefined) return 3;
  return Math.max(kennzahlStellen(k.wert, k.zulaessig), k.mitOffenen !== undefined ? kennzahlStellen(k.mitOffenen, k.zulaessig) : 3);
}

/** Wert einer Kennzahl als Text, „–“ ohne Grundstücksfläche */
export const kennzahlWert = (k: Kennzahl, v: number | undefined = k.wert) => (v === undefined ? '–' : fix(v, kennzahlStellenVon(k)));

const m2 = (v: number) => `${fix(v, 2)} m²`;

/**
 * Begründung der Ampel in m², z. B. „GF 307,28 m² > 306,25 m² zulässig“ – die Flächen sind ehrlicher als gerundete
 * Kennzahlen. kurz: GR, GR II bzw. GF
 */
export function flaechenVergleich(kurz: string, k: Kennzahl): string | undefined {
  if (k.zulaessigFlaeche === undefined) return undefined;
  const z = k.zulaessigFlaeche;
  const op = (a: number) => (a > z + 1e-9 ? '>' : a < z - 1e-9 ? '<' : '=');
  const zl = `${m2(z)} zulässig`;
  let t = `${kurz} ${m2(k.flaeche)} ${op(k.flaeche)} ${zl}`;
  if (fix(k.flaeche, 2) === fix(z, 2) && k.flaeche !== z) t = `${kurz} ${fix(k.flaeche, 4)} m² ${op(k.flaeche)} ${fix(z, 4)} m² zulässig`;
  if (k.flaecheMitOffenen !== undefined) t += `; mit offenen Flächen ${m2(k.flaecheMitOffenen)}`;
  return t;
}

export const HAFTUNG =
  'Das Tool rechnet nach und zeigt die angewandte Fassung; die Verantwortung für den Nachweis bleibt bei der Entwurfsverfasserin bzw. dem Entwurfsverfasser.';

/** Regel im Nachschlagewerk, die eine Anrechnung begründet */
export function anrechnungRegelId(a: Anrechnung): string {
  return a === 'garage01' ? 'baunvo-21a' : 'baunvo-19';
}

const FASSUNG_TEXT: Record<BauNVOFassung, string> = { '1962': 'BauNVO 1962', '1968': 'BauNVO 1968/1977', '1990': 'BauNVO 1990' };

/** Begründung der Anrechnung je Nutzung und Fassung – Tooltip der Pille („prüfen“, „zählt nicht“, „GRZ II“ …) */
export function anrechnungErklaerung(n: LageplanNutzung, f: BauNVOFassung, a: Anrechnung, regel: Anrechnung): string {
  const was = `${nutzungLabel(n)} nach ${FASSUNG_TEXT[f]}`;
  const fest = regel === 'pruefen' && a !== 'pruefen' ? ' – so festgelegt unter „Einstufung offener Fälle“' : '';
  switch (a) {
    case 'pruefen':
      return n === 'terrasse' && f === '1990'
        ? `${was}: nicht ausdrücklich geregelt. Praxis A: angebaute, ebenerdige Terrasse gehört zur Hauptanlage (GRZ I); Praxis B: Nebenanlage (GRZ II) bzw. nicht überdeckt außer Betracht. Mit der Bauaufsicht klären.`
        : `${was}: nicht eindeutig geregelt – ohne und mit dieser Fläche gerechnet; Einstufung mit der Bauaufsicht klären.`;
    case 'grz2':
      return `${was}: zählt zur GRZ II (§ 19 Abs. 4 BauNVO – Garagen, Stellplätze mit Zufahrten, Nebenanlagen, Unterbauungen)${fest}.`;
    case 'garage01':
      return `${was}: bis 0,1 der Grundstücksfläche anrechnungsfrei (§ 21a Abs. 3 BauNVO 1968/1977).`;
    case 'hauptanlage':
      return `${was}: zählt zur Grundfläche${f === '1990' ? ' der Hauptanlage (GRZ I)' : ''}${fest}.`;
    default:
      return n === 'garage' && f === '1962'
        ? `${was}: im Kern-, Gewerbe- und Industriegebiet nicht angerechnet (§ 19 Abs. 5 BauNVO 1962)${fest}.`
        : `${was}: zählt nicht zur Grundfläche${f === '1968' ? ' (§ 19 Abs. 4 BauNVO 1968/1977)' : n === 'garten' ? ' (nicht überbaut)' : ''}${fest}.`;
  }
}
