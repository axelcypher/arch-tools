import { describe, expect, it } from 'vitest';
import { parseDfm } from './dfm';
import { felderDerSeite, kaesten } from './felder';
import { formularBytes, kennung, parseFormular, stand } from './formular';

/** Formularseite aus Komponenten: [Klasse, Name, Left, Top, Width, Height, weitere Zeilen, Kinder] */
type K = [string, string, number, number, number, number, string[]?, K[]?];

function seite(...kinder: K[]) {
  const zeilen = (k: K, e: string): string[] => {
    const [klasse, name, x, y, b, h, extra = [], unter = []] = k;
    return [
      `${e}object ${name}: ${klasse}`,
      `${e}  Left = ${x}`,
      `${e}  Top = ${y}`,
      `${e}  Width = ${b}`,
      `${e}  Height = ${h}`,
      ...extra.map((z) => `${e}  ${z}`),
      ...unter.flatMap((u) => zeilen(u, `${e}  `)),
      `${e}end`,
    ];
  };
  const form = parseDfm(['object F: TForm', ...kinder.flatMap((k) => zeilen(k, '  ')), 'end', ''].join('\r\n'));
  return { schluessel: 'S01', form };
}

/** Caption als Delphi-Zeichenkette (Zeichen außerhalb von ASCII als #nnn) */
const cap = (t: string) => `Caption = ${t.replace(/[^ -~]+|[ -~]+/g, (x) => (/^[ -~]/.test(x) ? `'${x}'` : [...x].map((c) => `#${c.charCodeAt(0)}`).join('')))}`;

const beschriftungen = (s: ReturnType<typeof seite>) => Object.fromEntries(felderDerSeite(s, 0).map((f) => [f.name, f.beschriftung]));

describe('Felder einer Seite', () => {
  it('Kästchen mit der Beschriftung links davor („1 ☐ 2 ☐ … Sonstige ☐“)', () => {
    const s = seite([
      'TPanel',
      'P',
      0,
      0,
      700,
      55,
      [],
      [
        ['TLabel', 'L0', 5, 7, 190, 32, [cap('Gebäudeklasse')]],
        ['TLabel', 'L1', 237, 15, 7, 16, ["Caption = '1'"]],
        ['TLabel', 'L2', 280, 15, 7, 16, ["Caption = '2'"]],
        ['TLabel', 'L3', 323, 15, 146, 16, ["Caption = 'Sonstige bauliche Anlage'"]],
        ['TCheckBox', 'C1', 247, 15, 17, 17],
        ['TCheckBox', 'C2', 290, 15, 17, 17],
        ['TCheckBox', 'C3', 475, 15, 17, 17],
      ],
    ]);
    expect(beschriftungen(s)).toEqual({ C1: '1', C2: '2', C3: 'Sonstige bauliche Anlage' });
  });

  it('Kästchen mit der Beschriftung rechts daneben bleiben so', () => {
    const s = seite(
      ['TLabel', 'L1', 25, 0, 100, 16, [cap('Wohngebäude')]],
      ['TLabel', 'L2', 225, 0, 100, 16, ["Caption = 'Sonderbau'"]],
      ['TCheckBox', 'C1', 5, 0, 17, 17],
      ['TCheckBox', 'C2', 205, 0, 17, 17],
    );
    expect(beschriftungen(s)).toEqual({ C1: 'Wohngebäude', C2: 'Sonderbau' });
  });

  it('„☐ 3-fach Lageplan“: der Text mit der Anzahl dahinter', () => {
    const s = seite(['TLabel', 'A', 50, 0, 40, 16, ["Caption = '3-fach'"]], ['TLabel', 'T', 100, 0, 300, 16, ["Caption = 'Lageplan/amtlicher Lageplan'"]], ['TCheckBox', 'C1', 30, 0, 17, 17]);
    expect(beschriftungen(s)).toEqual({ C1: 'Lageplan/amtlicher Lageplan (3-fach)' });
  });

  it('Beschriftung über dem Feld, auch wenn ihre Höhe bis ins Feld reicht', () => {
    const s = seite(
      ['TLabel', 'L1', 5, 0, 260, 28, ["Caption = 'Name, Vorname'"]],
      ['TMemo', 'M1', 5, 30, 340, 30],
      // zwei Zeilen Text (≈ 31 px), die Beschriftung ist aber 42 px hoch und ragt in das Feld darunter
      ['TLabel', 'L2', 5, 70, 465, 42, ["Caption = 'Mitgliedsnummer der Architekten- oder der'#13#10'Ingenieurkammer des Landes'", 'Font.Height = -13']],
      ['TMemo', 'M2', 5, 104, 340, 22],
    );
    expect(beschriftungen(s)).toEqual({ M1: 'Name, Vorname', M2: 'Mitgliedsnummer der Architekten- oder der Ingenieurkammer des Landes' });
  });

  it('Felder ganz außerhalb ihres Rahmens sind in FORMA nicht zu sehen', () => {
    const s = seite([
      'TPanel',
      'P',
      0,
      500,
      700,
      200,
      [],
      [
        ['TMemo', 'Weg', 458, -363, 436, 22],
        ['TMemo', 'Halb', 400, 10, 400, 22],
        ['TMemo', 'Da', 5, 10, 100, 22],
      ],
    ]);
    expect(kaesten(s).map((k) => k.o.name)).toEqual(['P', 'Halb', 'Da']);
    expect(felderDerSeite(s, 0).map((f) => f.name)).toEqual(['Da', 'Halb']);
  });

  it('gesperrte Textfelder rechnet FORMA aus', () => {
    const s = seite(['TMemo', 'Summe', 5, 10, 100, 22, ['Enabled = False']], ['TMemo', 'Eingabe', 5, 40, 100, 22]);
    expect(Object.fromEntries(felderDerSeite(s, 0).map((f) => [f.name, f.berechnet]))).toEqual({ Summe: true, Eingabe: false });
  });

  it('Tabellen: Spaltenkopf aus einem anderen Rahmen, Spaltennummern übersprungen, mehrzeilige Köpfe zusammen', () => {
    const s = seite(
      [
        'TPanel',
        'Kopf',
        0,
        0,
        700,
        60,
        [],
        [
          ['TLabel', 'K1', 100, 5, 160, 14, ["Caption = 'Bezeichnung und Lage'"]],
          ['TLabel', 'K2', 100, 19, 160, 14, [cap('(Ort, Straße)')]],
          ['TLabel', 'N1', 170, 40, 10, 14, ["Caption = '2'"]],
        ],
      ],
      ['TPanel', 'Zeile', 0, 60, 700, 30, [], [['TMemo', 'M', 100, 4, 160, 22]]],
    );
    expect(beschriftungen(s)).toEqual({ M: 'Bezeichnung und Lage (Ort, Straße)' });
  });
});

describe('FORMA-Dateien: Sonderfälle', () => {
  const datei = (kopf: string, seite: string) => new TextEncoder().encode(`[*SJ_FORMULAR (w) by SJ GmbH Aachen#][*SJ_BEGIN#]${kopf}[*SJ_END#][*S01#][*SJ_BEGIN#]${seite}[*SJ_END#]`);
  const form = ['object Form1: TForm1', '  object TLabel', "    Caption = 'ohne Namen'", '  end', 'end', ''].join('\r\n');

  it('leere Vorlagen: Kennung ohne Marke, byte-genau zurückgeschrieben', () => {
    const bytes = datei('nw010005[*SJ_VERSION#]2026I', form);
    const f = parseFormular(bytes);
    expect([kennung(f), stand(f)]).toEqual(['nw010005', '2026I']);
    expect(formularBytes(f)).toEqual(bytes);
  });

  it('Komponenten ohne Namen („object TLabel“)', () => {
    const f = parseFormular(datei('[*SJ_MODIFIED#]nw010005[*SJ_VERSION#]2026I', form));
    const [label] = kaesten(f.seiten[0]);
    expect([label.o.name, label.o.klasse]).toEqual(['', 'TLabel']);
  });
});
