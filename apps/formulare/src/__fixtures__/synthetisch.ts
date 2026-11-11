/**
 * Synthetische FORMA-Formulare für Tests: Kennung und Stand wie ein echter Vordruck (damit die Vorgabe der App
 * greift), Rahmen mit fetter Überschrift, Textfeldern und Kästchen an den Komponentennamen der Vorgabe. Keine echten
 * Formulare im Repository (öffentlich) – nur so viel Aufbau, wie die Tests brauchen.
 */

export interface SynFeld {
  art: 'memo' | 'kreuz';
  /** Komponentenname, z. B. `CheckBox4` */
  name: string;
  /** Beschriftung: beim Kästchen die eigene, beim Textfeld eine Beschriftung darüber */
  text: string;
  wert?: string | boolean;
}

export interface SynRahmen {
  /** Komponentenname, z. B. `Panel8` */
  name: string;
  titel: string;
  felder: SynFeld[];
}

/** Delphi-Zeichenkette (Zeichen außerhalb von ASCII als #nnn) */
const zk = (t: string) => t.replace(/[^ -~]+|[ -~]+/g, (x) => (/^[ -~]/.test(x) ? `'${x.replace(/'/g, "''")}'` : [...x].map((c) => `#${c.charCodeAt(0)}`).join(''))) || "''";

function rahmen(r: SynRahmen, top: number, nr: { label: number }): { zeilen: string[]; hoehe: number } {
  const e = '    ';
  const z: string[] = [];
  let y = 24;
  const kind = (zeilen: string[]) => z.push(...zeilen.map((x) => `${e}${x}`));
  kind([`object Label${nr.label++}: TLabel`, '  Left = 5', '  Top = 2', '  Width = 400', '  Height = 16', `  Caption = ${zk(r.titel)}`, '  Font.Style = [fsBold]', 'end']);
  for (const f of r.felder) {
    if (f.art === 'kreuz') {
      kind([
        `object ${f.name}: TCheckBox`,
        '  Left = 10',
        `  Top = ${y}`,
        '  Width = 500',
        '  Height = 17',
        `  Caption = ${zk(f.text)}`,
        ...(f.wert === true ? ['  Checked = True', '  State = cbChecked'] : []),
        'end',
      ]);
      y += 22;
    } else {
      kind([`object Label${nr.label++}: TLabel`, '  Left = 10', `  Top = ${y}`, '  Width = 400', '  Height = 16', `  Caption = ${zk(f.text)}`, 'end']);
      y += 18;
      const text = typeof f.wert === 'string' && f.wert ? ['  Lines.Strings = (', `    ${zk(f.wert)})`] : [];
      kind([`object ${f.name}: TMemo`, '  Left = 10', `  Top = ${y}`, '  Width = 400', '  Height = 22', ...text, '  WantReturns = False', 'end']);
      y += 28;
    }
  }
  const hoehe = y + 6;
  return { zeilen: [`  object ${r.name}: TPanel`, '    Left = 0', `    Top = ${top}`, '    Width = 700', `    Height = ${hoehe}`, ...z, '  end'], hoehe };
}

/** Formulardatei (`.frmsjf`) mit Kennung, Stand und Seiten aus Rahmen; `werte` (`<Seite>:<Name>`) setzt Eingaben */
export function synthetischesFormular(kennung: string, stand: string, seiten: SynRahmen[][], werte: Record<string, string | boolean> = {}): Uint8Array {
  seiten = seiten.map((rs, i) => rs.map((r) => ({ ...r, felder: r.felder.map((f) => (`${i}:${f.name}` in werte ? { ...f, wert: werte[`${i}:${f.name}`] } : f)) })));
  const teile = [`[*SJ_FORMULAR (w) by SJ GmbH Aachen#][*SJ_BEGIN#][*SJ_MODIFIED#]${kennung}[*SJ_VERSION#]${stand}[*SJ_END#]`];
  seiten.forEach((rahmenListe, i) => {
    const nr = { label: 1 };
    let top = 20;
    const zeilen = [`object Form${i + 1}: TFRMABSeiteForm`, `  Caption = ${zk(`Synthetisch - Seite ${i + 1}`)}`, '  ClientHeight = 1061', '  ClientWidth = 1214'];
    for (const r of rahmenListe) {
      const x = rahmen(r, top, nr);
      zeilen.push(...x.zeilen);
      top += x.hoehe + 10;
    }
    zeilen.push('end', '');
    teile.push(`[*S${String(i + 1).padStart(2, '0')}#][*SJ_BEGIN#]${zeilen.join('\r\n')}[*SJ_END#]`);
  });
  return new TextEncoder().encode(teile.join(''));
}

/** Bauantrag nach Anlage I/1 (nw010001, Stand 2026I) im Aufbau der Vorgabe – leer bzw. mit `werte` */
export function nw010001Leer(werte: Record<string, string | boolean> = {}): Uint8Array {
  return synthetischesFormular('nw010001', '2026I', NW010001, werte);
}

const NW010001: SynRahmen[][] = [
  [
    { name: 'Panel1', titel: 'Untere Bauaufsichtsbehörde', felder: [{ art: 'memo', name: 'Memo1', text: 'Anschrift' }] },
    { name: 'Panel2', titel: 'Eingangsstempel', felder: [{ art: 'memo', name: 'Memo3', text: 'Aktenzeichen' }] },
    {
      name: 'Panel3',
      titel: 'Antrag',
      felder: [
        { art: 'kreuz', name: 'CheckBox1', text: 'Bauantrag' },
        { art: 'kreuz', name: 'CheckBox2', text: 'Antrag auf Vorbescheid' },
      ],
    },
    { name: 'Panel4', titel: 'Bauherrschaft', felder: [{ art: 'memo', name: 'Memo5', text: 'Name, Vorname, Firma' }] },
    {
      name: 'Panel8',
      titel: 'Gebäudeklasse',
      felder: [
        { art: 'kreuz', name: 'CheckBox4', text: 'Gebäudeklasse 1' },
        { art: 'kreuz', name: 'CheckBox5', text: 'Gebäudeklasse 2' },
        { art: 'kreuz', name: 'CheckBox6', text: 'Gebäudeklasse 3' },
        { art: 'kreuz', name: 'CheckBox7', text: 'Gebäudeklasse 4' },
        { art: 'kreuz', name: 'CheckBox8', text: 'Gebäudeklasse 5' },
      ],
    },
  ],
  [
    {
      name: 'Panel1',
      titel: 'Erforderliche Unterlagen',
      felder: [
        { art: 'kreuz', name: 'CheckBox1', text: 'Lageplan' },
        { art: 'kreuz', name: 'CheckBox2', text: 'Maß der baulichen Nutzung' },
        { art: 'kreuz', name: 'CheckBox3', text: 'Flurkarte' },
        { art: 'kreuz', name: 'CheckBox4', text: 'Basiskarte' },
        { art: 'kreuz', name: 'CheckBox5', text: 'Bauzeichnungen' },
        { art: 'kreuz', name: 'CheckBox6', text: 'Baubeschreibung' },
        { art: 'kreuz', name: 'CheckBox7', text: 'Brandschutzkonzept' },
        { art: 'kreuz', name: 'CheckBox8', text: 'Barrierefrei-Konzept' },
        { art: 'kreuz', name: 'CheckBox9', text: 'Betriebsbeschreibung' },
      ],
    },
  ],
];
