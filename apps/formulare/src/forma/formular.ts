/**
 * Eine FORMA-Formulardatei (`.frmsjf`, SJ Software GmbH, Aachen).
 *
 * Aufbau: Signatur, Kopf mit Formularkennung und Version, dann je Seite eine DFM-Definition. Layout und
 * eingetragene Werte stehen gemeinsam in diesen Definitionen (ohne Zeilenumbrüche zwischen den Abschnitten):
 *
 *   [*SJ_FORMULAR (w) by SJ GmbH Aachen#][*SJ_BEGIN#][*SJ_MODIFIED#]nw010005[*SJ_VERSION#]2026I[*SJ_END#]
 *   [*S01#][*SJ_BEGIN#]object Form1: TFRMABSeiteForm … end⏎[*SJ_END#]
 *   [*S02#][*SJ_BEGIN#]object Form2: TFRMABSeiteForm … end⏎[*SJ_END#]
 *
 * Grundsatz: Das Originalprogramm muss jede Datei weiter lesen können. Geändert wird nur der Inhalt von
 * Feldern, nie das Layout, und alles Unveränderte bleibt Byte für Byte erhalten.
 */

import { stringlisteZeilen } from './delphi';
import type { Eigenschaft, Objekt } from './dfm';
import { FormatFehler, Leser, bezeichner, eigenschaft, eigenschaftsEinrueckung, entferneEigenschaft, finde, schreibeObjekt, setzeEigenschaft, text } from './dfm';

const SIGNATUR = '[*SJ_FORMULAR (w) by SJ GmbH Aachen#]';
const BEGINN = '[*SJ_BEGIN#]';
const ENDE = '[*SJ_END#]';

/** Eigenschaften, die Delphi bei TMemo nach `Lines` schreibt */
const MEMO_NACH_LINES = new Set([
  'MaxLength', 'OEMConvert', 'ParentBiDiMode', 'ParentColor', 'ParentCtl3D', 'ParentDoubleBuffered', 'ParentFont',
  'ParentShowHint', 'PopupMenu', 'ReadOnly', 'ScrollBars', 'ShowHint', 'StyleElements', 'TabOrder', 'TabStop', 'Touch',
  'Visible', 'WantReturns', 'WantTabs', 'WordWrap',
]);

/** Eigenschaften, die Delphi bei TCheckBox nach `Checked` schreibt */
const KREUZ_NACH_CHECKED = new Set([
  'Color', 'Constraints', 'Ctl3D', 'DoubleBuffered', 'DragCursor', 'DragKind', 'DragMode', 'Enabled', 'Font',
  'ParentBiDiMode', 'ParentColor', 'ParentCtl3D', 'ParentDoubleBuffered', 'ParentFont', 'ParentShowHint', 'PopupMenu',
  'ShowHint', 'State', 'StyleElements', 'TabOrder', 'TabStop', 'Touch', 'Visible', 'WordWrap',
]);

/** Eigenschaften, die Delphi bei TCheckBox nach `State` schreibt */
const KREUZ_NACH_STATE = new Set(['StyleElements', 'TabOrder', 'TabStop', 'Touch', 'Visible', 'WordWrap']);

const schreibtDanach = (namen: Set<string>) => (name: string) => namen.has(name) || /^On[A-Z]/.test(name);

export interface Seite {
  /** Abschnittskennung ohne Klammern, z. B. `S01` */
  schluessel: string;
  form: Objekt;
}

export interface Formular {
  kopf: [string, string][];
  seiten: Seite[];
}

export function parseFormular(bytes: Uint8Array): Formular {
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] > 0x7f) throw new FormatFehler(i, 'Nicht-ASCII-Zeichen');
  }
  const p = new Leser(new TextDecoder().decode(bytes), 0);
  p.erwarte(SIGNATUR);
  p.erwarte(BEGINN);
  const kopf: [string, string][] = [];
  while (!p.bei(ENDE)) {
    const schluessel = marke(p);
    kopf.push([schluessel, p.bis('[*')]);
  }
  p.erwarte(ENDE);
  const seiten: Seite[] = [];
  while (!p.amEnde()) {
    const schluessel = marke(p);
    p.erwarte(BEGINN);
    const form = p.objekt();
    p.erwarte(ENDE);
    seiten.push({ schluessel, form });
  }
  if (!seiten.length) p.fehler('keine Formularseiten');
  return { kopf, seiten };
}

function marke(p: Leser): string {
  p.erwarte('[*');
  const s = p.bis('#]');
  p.erwarte('#]');
  return s;
}

export function formularBytes(f: Formular): Uint8Array {
  const out: string[] = [SIGNATUR, BEGINN];
  for (const [k, v] of f.kopf) out.push(`[*${k}#]`, v);
  out.push(ENDE);
  for (const s of f.seiten) {
    out.push(`[*${s.schluessel}#]`, BEGINN);
    schreibeObjekt(s.form, out);
    out.push(ENDE);
  }
  return new TextEncoder().encode(out.join(''));
}

const kopfwert = (f: Formular, k: string) => f.kopf.find(([s]) => s === k)?.[1];

/** Formularkennung, z. B. `nw010005` (NRW, Formular 005) */
export const kennung = (f: Formular) => kopfwert(f, 'SJ_MODIFIED');
/** Stand des Formulars, z. B. `2026I` */
export const stand = (f: Formular) => kopfwert(f, 'SJ_VERSION');
/** Fenstertitel der Seite, z. B. „NRW - 2026 - Anlage I-3 - … - Seite 1 von 3“ */
export const seitenTitel = (s: Seite) => text(s.form, 'Caption');

/** Inhalt eines Textfelds (TMemo); Zeilen sind mit `\n` getrennt. Gegenstück zu `setzeMemoText`. */
export function memoText(memo: Objekt): string {
  const w = eigenschaft(memo, 'Lines.Strings')?.wert;
  const zeilen = w?.art === 'liste' ? w.werte.flatMap((v) => (v.art === 'text' ? [v.text] : [])) : [];
  return zeilen.join('\n') + (zeilen.length && zeilen[zeilen.length - 1] === '' ? '\n' : '');
}

export const istAngekreuzt = (kreuz: Objekt) => bezeichner(kreuz, 'Checked') === 'True';

function komponente(f: Formular, seite: number, name: string, klasse: string): Objekt {
  const s = f.seiten[seite];
  if (!s) throw new Error(`Seite ${seite + 1} gibt es nicht`);
  const o = finde(s.form, name);
  if (!o) throw new Error(`Feld „${name}“ gibt es auf Seite ${seite + 1} nicht`);
  if (o.klasse !== klasse) throw new Error(`„${name}“ ist ein ${o.klasse}, kein ${klasse}`);
  return o;
}

/**
 * Setzt den Inhalt eines Textfelds wie ein Delphi-TMemo: Ein abschließender Zeilenumbruch erzeugt keine eigene
 * Zeile, und ein leeres Feld hat keine Zeilen. Ändert `f`.
 */
export function setzeMemoText(f: Formular, seite: number, name: string, wert: string): void {
  const memo = komponente(f, seite, name, 'TMemo');
  const zeilen = wert.replace(/\r\n?/g, '\n').split('\n');
  if (zeilen[zeilen.length - 1] === '') zeilen.pop();
  if (!zeilen.length) {
    entferneEigenschaft(memo, 'Lines.Strings');
    return;
  }
  const neu: Eigenschaft = {
    typ: 'eigenschaft',
    name: 'Lines.Strings',
    wert: { art: 'liste', werte: zeilen.map((t) => ({ art: 'text', text: t })) },
    zeilen: stringlisteZeilen(eigenschaftsEinrueckung(memo), 'Lines.Strings', zeilen),
  };
  setzeEigenschaft(memo, neu, schreibtDanach(MEMO_NACH_LINES));
}

/** Setzt oder entfernt das Kreuz eines Kästchens (TCheckBox). Ändert `f`. */
export function setzeAngekreuzt(f: Formular, seite: number, name: string, an: boolean): void {
  const kreuz = komponente(f, seite, name, 'TCheckBox');
  if (!an) {
    entferneEigenschaft(kreuz, 'Checked');
    entferneEigenschaft(kreuz, 'State');
    return;
  }
  const e = eigenschaftsEinrueckung(kreuz);
  const zeile = (n: string, w: string): Eigenschaft => ({ typ: 'eigenschaft', name: n, wert: { art: 'name', name: w }, zeilen: [`${e}${n} = ${w}`] });
  setzeEigenschaft(kreuz, zeile('Checked', 'True'), schreibtDanach(KREUZ_NACH_CHECKED));
  setzeEigenschaft(kreuz, zeile('State', 'cbChecked'), schreibtDanach(KREUZ_NACH_STATE));
}
