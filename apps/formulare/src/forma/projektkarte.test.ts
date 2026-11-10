import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { pkText } from '../dateisystem';
import { bezeichner, finde } from './dfm';
import { memoText, parseFormular } from './formular';
import type { Projektkarte } from './projektkarte';
import { ausfuellen, pkAnzeige, pkArt, pkMoeglichkeiten, pkWert, pkWertPasst, pkWertVon, teileAus, zuordnungen } from './projektkarte';

const wert = (werte: Record<string, string>) => (g: number, id: number) => werte[`${g}:${id}`] ?? '';

describe('Zuordnung Feld → Projektkarte', () => {
  it('zerlegt Trenner, Gruppe, Eintrag und Texte', () => {
    expect(teileAus('K0201aedt040;0201aedt030')).toEqual([
      { art: 'eintrag', gruppe: 201, id: 40, trenner: ', ' },
      { art: 'eintrag', gruppe: 201, id: 30, trenner: '' },
    ]);
    expect(teileAus('L0201aedt070;"Postfach ";R0101mmo030')).toEqual([
      { art: 'eintrag', gruppe: 201, id: 70, trenner: ' ' },
      { art: 'text', text: 'Postfach ' },
      { art: 'eintrag', gruppe: 101, id: 30, trenner: '\n' },
    ]);
    // mehrere Trenner, Steuerzeichen und Leerzeichen am Rand wie in echten FORMA-Dateien
    expect(teileAus('KR0231aedt010;0201aedt030\x0b; 0101mmo030 ;;')).toEqual([
      { art: 'eintrag', gruppe: 231, id: 10, trenner: ',\n' },
      { art: 'eintrag', gruppe: 201, id: 30, trenner: '' },
      { art: 'eintrag', gruppe: 101, id: 30, trenner: '' },
    ]);
  });

  it('setzt Trenner nur hinter gefüllte Werte und Texte nur vor gefüllte', () => {
    const teile = teileAus('K0201aedt010;L0201aedt030;R0201aedt040;K0201aedt070;"Postfach ";K0201aedt080;L0201aedt090;0201aedt110');
    const w = { '201:30': 'Annemarie', '201:40': 'Muster', '201:70': 'Weg 1', '201:90': '59514', '201:110': 'Welver' };
    expect(ausfuellen(teile, wert(w))).toBe('Annemarie Muster\nWeg 1, 59514 Welver');
    expect(ausfuellen(teile, wert({ ...w, '201:80': '12 34' }))).toBe('Annemarie Muster\nWeg 1, Postfach 12 34, 59514 Welver');
    // einzeilige Felder ohne Zeilenumbruch
    expect(ausfuellen(teile, wert(w), true)).toBe('Annemarie Muster Weg 1, 59514 Welver');
    // Trenner am Ende entfallen, Zeilenumbrüche der Projektkarte (CR LF) werden zu \n
    expect(ausfuellen(teileAus('K0202aedt040;K0202aedt030;0202aedt010'), wert({ '202:40': 'Büro GmbH' }))).toBe('Büro GmbH');
    expect(ausfuellen(teileAus('0101mmo030'), wert({ '101:30': 'Zeile 1\r\nZeile 2\r\n' }))).toBe('Zeile 1\nZeile 2');
  });
});

/* ---------- echte Projekte (SJFORMA_REF bzw. .ref/) ---------- */

const REF = process.env.SJFORMA_REF ?? path.resolve(__dirname, '../../../../.ref');
const projekte = existsSync(REF) ? readdirSync(REF).filter((d) => existsSync(path.join(REF, d, 'sj_prokarte.sdb'))) : [];

/** Projektkarte über node:sqlite – Texte als Bytes, wie die Tauri-Hülle sie liefert */
function pkLesen(datei: string): Projektkarte {
  const db = new DatabaseSync(datei, { readOnly: true });
  const t = (b: unknown) => (b instanceof Uint8Array ? pkText(b) : '');
  try {
    const gruppen = db.prepare('SELECT GruppeID AS id, GruppeTyp AS typ, CAST(GruppeText AS BLOB) AS text FROM Gruppe ORDER BY GruppeID').all() as { id: number; typ: number; text: Uint8Array }[];
    const inhalte = db
      .prepare('SELECT GruppeID AS gruppe, InhalteID AS id, InhalteTyp AS typ, Ganzzahl AS zahl, CAST(Titel AS BLOB) AS titel, CAST(Texte AS BLOB) AS texte FROM Inhalte ORDER BY GruppeID, InhalteID')
      .all() as { gruppe: number; id: number; typ: number; zahl: number | null; titel: Uint8Array; texte: Uint8Array }[];
    return {
      gruppen: gruppen.map((g) => ({ id: g.id, typ: g.typ ?? 0, text: t(g.text) })),
      eintraege: inhalte.map((e) => ({ gruppe: e.gruppe, id: e.id, typ: e.typ ?? 0, titel: t(e.titel), text: t(e.texte), zahl: e.zahl ?? null })),
    };
  } finally {
    db.close();
  }
}

const ohneLeerraum = (s: string) => s.replace(/\s+/g, ' ').trim();

describe.skipIf(!projekte.length)('Ausfüllen gegen echte FORMA-Projekte', () => {
  it.each(projekte)('%s: die Projektkarte ergibt die von FORMA ausgefüllten Felder', (projekt) => {
    const dir = path.join(REF, projekt);
    const pk = pkLesen(path.join(dir, 'sj_prokarte.sdb'));
    expect(pk.gruppen.length).toBeGreaterThan(10);
    // Auswahllisten liefern die gewählte Möglichkeit, nicht die Liste
    for (const e of pk.eintraege.filter((x) => x.typ === 4 || x.typ === 8)) expect(pkWert(pk, e.gruppe, e.id)).not.toMatch(/[\r\n]/);

    let gleich = 0;
    const abweichend: string[] = [];
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.frmsjf') && statSync(path.join(dir, n)).isFile())) {
      const f = parseFormular(new Uint8Array(readFileSync(path.join(dir, name))));
      f.seiten.forEach((seite, i) => {
        for (const [feld, teile] of zuordnungen(seite)) {
          const memo = finde(seite.form, feld);
          if (!memo || memo.klasse !== 'TMemo') continue;
          const ist = memoText(memo);
          if (!ist.trim()) continue;
          const soll = ausfuellen(teile, (g, id) => pkWert(pk, g, id), bezeichner(memo, 'WantReturns') === 'False');
          if (ohneLeerraum(soll) === ohneLeerraum(ist)) gleich++;
          else abweichend.push(`${name.slice(0, 3)} S${i + 1} ${feld}: ${JSON.stringify(ist)} ≠ ${JSON.stringify(soll)}`);
        }
      });
    }
    // Felder können nach dem Ausfüllen von Hand geändert worden sein – die meisten müssen aber passen
    console.log(`${projekt}: ${gleich} gleich, ${abweichend.length} abweichend\n  ${abweichend.join('\n  ')}`);
    // leere Vorlagen (Vorlagenordner mit Projektkarte): nichts zu vergleichen
    if (!gleich && !abweichend.length) return;
    expect(gleich).toBeGreaterThan(0);
    expect(gleich /(gleich + abweichend.length)).toBeGreaterThan(0.6);
  });
});

describe('Werte der Projektkarte', () => {
  const eintrag = (typ: number, text: string, zahl: number | null) => ({ gruppe: 201, id: 210, typ, titel: 'Anrede:', text, zahl });
  const anrede = eintrag(4, '\r\nSehr geehrte Frau\r\nSehr geehrter Herr\r\nSehr geehrte Damen und Herren,', 2);

  it('Auswahlliste: die leere erste Zeile zählt mit (Delphi: Items = Texte, ItemIndex = Ganzzahl)', () => {
    expect(pkArt(anrede)).toBe('auswahl');
    expect(pkMoeglichkeiten(anrede)).toEqual(['', 'Sehr geehrte Frau', 'Sehr geehrter Herr', 'Sehr geehrte Damen und Herren,']);
    expect(pkWertVon(anrede)).toBe(2);
    expect(pkAnzeige(anrede, 2)).toBe('Sehr geehrter Herr');
    expect(pkWertVon({ ...anrede, zahl: -1 })).toBeNull();
    expect(pkWertVon({ ...anrede, zahl: null })).toBeNull();
    expect(pkAnzeige(anrede, null)).toBe('');
  });

  it('Optionen ohne leere Zeile, Kästchen mit Beschriftung, Texte mit \n', () => {
    const neigung = eintrag(8, 'eben\r\ngeneigt\r\nHanglage', 1);
    expect(pkAnzeige(neigung, pkWertVon(neigung))).toBe('geneigt');
    const kreuz = eintrag(16, 'Wärmeschutz', 0);
    expect(pkWertVon(kreuz)).toBe(0);
    expect(pkAnzeige(kreuz, 1)).toBe('Wärmeschutz');
    expect(pkWertVon(eintrag(2, 'a\r\nb', null))).toBe('a\nb');
  });

  it('prüft, ob ein Wert zum Eintrag passt', () => {
    expect(pkWertPasst(anrede, 3)).toBe(true);
    expect(pkWertPasst(anrede, 4)).toBe(false);
    expect(pkWertPasst(anrede, 'Herr')).toBe(false);
    expect(pkWertPasst(eintrag(1, '', null), 'x')).toBe(true);
    expect(pkWertPasst(eintrag(16, 'x', 0), 2)).toBe(false);
  });
});
