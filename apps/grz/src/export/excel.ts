import type { Workbook, Worksheet } from 'exceljs';
import { APP_NAMEN } from '@core/appNamen';
import { excel, fuelleVorlage, platzhalterBlatt } from '@core/excel/fill';
import type { Project } from '@core/model';
import { massNachweis } from '../massNutzung';
import { kennzahlStellenVon } from '../texte';
import { buildGrzContext, GRZ_PLACEHOLDER_DOCS } from './exportData';

/**
 * Excel-Export des GRZ-Nachweises. Das Standardlayout ist die Muster-Vorlage selbst (ohne Hilfeblatt),
 * gefüllt über dieselbe Vorlagen-Engine wie eigene Vorlagen – was die Muster-Vorlage zeigt, kommt auch
 * im Standardexport heraus.
 */

const M2 = '#,##0.00 "m²"';
const M = '0.00 "m"';
/** zulässige Kennzahl wie eingetragen: zwei bis vier Stellen */
const RATIO_FEST = '0.00##';
const PROZENT = '0 %';
const THIN = { style: 'thin' as const, color: { argb: 'FF1F2328' } };
const GRAU = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFD9D9D9' } };

type Zelle = string | number | { formula: string } | null;

/** über dem Grenzwert erst ab diesem Abstand (wie der Rechenkern, 1e-9) */
const EPS = '0.000000001';

/** Ergebnis-Formel einer Kennzahl wie im Rechenkern: Zeile r, offene Spanne in Zeile o (nur, wenn dort eine Fläche steht) */
function ergebnisFormel(r: number, o?: number): string {
  const offen = o ? `IF(C${o}>0,IF(D${o}>E${r}+${EPS},"prüfen","eingehalten"),"eingehalten")` : '"eingehalten"';
  return `IF(C$12>0,IF(E${r}>0,IF(D${r}>E${r}+${EPS},"überschritten",${offen}),"Festsetzung fehlt"),"Grundstücksfläche fehlt")`;
}

/**
 * Blatt „GRZ GFZ“: Grundlagen, Kennzahlen, Vollgeschosse, Geschossfläche, Flächenbilanz, Lageplan, Hinweise.
 * Kennzahlen, zulässige Flächen und Ergebnis sind Formeln aus den Zellen – Prüfer können nachrechnen.
 * stellen: Nachkommastellen der Kennzahlen wie in der App (Standardexport), sonst drei
 */
function nachweisBlatt(wb: Workbook, stellen: { grz?: number; grz2?: number; gfz?: number } = {}): Worksheet {
  const ws = wb.addWorksheet('GRZ GFZ');
  [22, 30, 13, 12, 12, 13, 18].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.pageSetup = {
    ...ws.pageSetup,
    paperSize: 9,
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.6, right: 0.5, top: 0.6, bottom: 0.7, header: 0.3, footer: 0.3 },
  };
  ws.headerFooter.oddFooter = '&L{{projekt.name}} {{stand.text}}&RSeite &P/&N';
  const SP = 7;
  const letzte = String.fromCharCode(64 + SP);

  const put = (ref: string, v: Zelle, o: { fmt?: string; bold?: boolean; wrap?: boolean; right?: boolean } = {}) => {
    const c = ws.getCell(ref);
    c.value = v as never;
    if (o.fmt) c.numFmt = o.fmt;
    if (o.bold) c.font = { bold: true };
    if (o.wrap || o.right) c.alignment = { wrapText: !!o.wrap, vertical: 'top', horizontal: o.right ? 'right' : undefined };
  };
  const zeile = (r: number, werte: Zelle[], o: { bold?: boolean; fmts?: (string | undefined)[]; wrap?: number[] } = {}) =>
    werte.forEach((v, i) => {
      if (v === null) return;
      put(`${String.fromCharCode(65 + i)}${r}`, v, { bold: o.bold, fmt: o.fmts?.[i], wrap: o.wrap?.includes(i) });
    });
  const kopf = (r: number, werte: string[]) => {
    zeile(r, werte, { bold: true });
    for (let i = 0; i < SP; i++) ws.getCell(r, i + 1).border = { bottom: THIN };
  };
  const abschnitt = (r: number, text: string) => {
    put(`A${r}`, text, { bold: true });
    ws.mergeCells(`A${r}:${letzte}${r}`);
    ws.getCell(`A${r}`).fill = GRAU;
  };
  const summe = (r: number, spalten: string[], von: number, bis: number) => {
    put(`B${r}`, 'Summe', { bold: true });
    for (const spalte of spalten) put(`${spalte}${r}`, { formula: `SUM(${spalte}${von}:${spalte}${bis})` }, { fmt: M2, bold: true });
    for (let i = 0; i < SP; i++) ws.getCell(r, i + 1).border = { top: THIN };
  };
  const ratio = (d: number | undefined) => `0.${'0'.repeat(d ?? 3)}`;

  // Kopf
  put('A1', 'Nachweis des Maßes der baulichen Nutzung');
  ws.getCell('A1').font = { size: 11, color: { argb: 'FF6B7280' } };
  put('A3', '{{projekt.name}}');
  ws.getCell('A3').font = { bold: true, size: 12 };
  put(`${letzte}3`, 'Projekt {{projekt.code}}', { right: true });
  put('A4', '{{projekt.adresse}}');
  put('A5', '{{grundstueck.flurtext}}');
  put('A6', '{{stand.text}}');
  put(`${letzte}6`, '{{projekt.bearbeiter}}', { right: true });
  ws.getCell('A6').font = { size: 9 };
  put('A7', '{{kopf.angaben}}');
  ws.getCell('A7').font = { size: 9 };
  ws.getCell(`${letzte}6`).font = { size: 9 };

  abschnitt(8, 'Grundlagen');
  zeile(9, ['Bebauungsplan', '{{bplan.angabe}}']);
  zeile(10, ['Baunutzungsverordnung', '{{baunvo.fassung}}']);
  zeile(11, ['Vollgeschossbegriff', '{{bauo.fassung}}']);
  zeile(12, ['Grundstücksfläche', '{{grundstueck.quelle}}', '{{grundstueck.flaeche_nachweis}}'], { fmts: [undefined, undefined, M2] });
  zeile(13, ['Geländeoberfläche', '{{gelaende.quelle}}', '{{gelaende}}'], { fmts: [undefined, undefined, M] });
  zeile(14, ['Hauptanlage', 'Grundfläche der Gebäude', '{{hauptanlage}}'], { fmts: [undefined, undefined, M2] });
  zeile(15, ['{{gebietsart.bezeichnung}}', '{{gebietsart.text}}']);

  // Kennzahlen: vorhanden = Fläche / Grundstücksfläche, zulässige Fläche = zulässig × Grundstücksfläche, Ergebnis als Vergleich
  abschnitt(16, 'Kennzahlen');
  kopf(17, ['', '', 'Fläche', 'vorhanden', 'zulässig', 'zulässig [m²]', 'Ergebnis']);
  const zulM2 = (r: number) => ({ formula: `IF(E${r}>0,E${r}*C$12,"")` });
  zeile(
    18,
    [
      '{{grz.bezeichnung}}',
      'Grundfläche',
      '{{grz.flaeche}}',
      { formula: 'IF(C$12>0,C18/C$12,"–")' },
      '{{grz.zulaessig}}',
      zulM2(18),
      { formula: `IF(C19>0,${ergebnisFormel(18)},${ergebnisFormel(18, 20)})` },
    ],
    {
      fmts: [undefined, undefined, M2, ratio(stellen.grz), RATIO_FEST, M2],
    },
  );
  zeile(
    19,
    [
      '{{grz.ii.bezeichnung}}',
      '',
      '{{grz.ii.flaeche}}',
      { formula: 'IF(C19>0,IF(C$12>0,C19/C$12,"–"),"")' },
      '{{grz.ii.zulaessig}}',
      { formula: 'IF(C19>0,IF(E19>0,E19*C$12,""),"")' },
      { formula: `IF(C19>0,${ergebnisFormel(19, 20)},"")` },
    ],
    { fmts: [undefined, undefined, M2, ratio(stellen.grz2), RATIO_FEST, M2] },
  );
  zeile(20, ['{{grz.offen.bezeichnung}}', '', '{{grz.offen.flaeche}}', { formula: 'IF(C20>0,IF(C$12>0,C20/C$12,"–"),"")' }], { fmts: [undefined, undefined, M2, ratio(stellen.grz2 ?? stellen.grz)] });
  zeile(21, ['GFZ', 'Geschossfläche', '{{gf}}', { formula: 'IF(C$12>0,C21/C$12,"–")' }, '{{gfz.zulaessig}}', zulM2(21), { formula: ergebnisFormel(21) }], {
    fmts: [undefined, undefined, M2, ratio(stellen.gfz), RATIO_FEST, M2],
  });
  zeile(22, ['Vollgeschosse', '{{vollgeschosse.namen}}', null, '{{vollgeschosse}}', '{{vollgeschosse.zulaessig}}', null, '{{vollgeschosse.status}}'], {
    fmts: [undefined, undefined, undefined, '0', '0'],
  });
  for (const r of [18, 21, 22]) ws.getCell(`D${r}`).font = { bold: true };

  zeile(23, ['{{gr_absolut.bezeichnung}}', '', '{{gr_absolut}}', null, null, '{{gr_absolut.zulaessig}}', '{{gr_absolut.status}}'], { fmts: [undefined, undefined, M2, undefined, undefined, M2] });
  zeile(24, ['{{gf_absolut.bezeichnung}}', '', '{{gf_absolut}}', null, null, '{{gf_absolut.zulaessig}}', '{{gf_absolut.status}}'], { fmts: [undefined, undefined, M2, undefined, undefined, M2] });
  zeile(25, ['{{bmz.bezeichnung}}', '{{bmz.text}}', '{{bmz.baumasse}}', '{{bmz}}', '{{bmz.zulaessig}}', null, '{{bmz.status}}'], {
    fmts: [undefined, undefined, '#,##0.00 "m³"', '0.000', RATIO_FEST],
  });

  // ab hier dynamisch (Wiederholungszeilen)
  abschnitt(27, 'Vollgeschosse');
  kopf(28, ['Geschoss', 'Begründung', 'über Gelände', 'Anteil', 'Ergebnis', '', '']);
  zeile(29, ['{{geschoss.name}}', '{{geschoss.begruendung}}', '{{geschoss.ueber_gelaende}}', '{{geschoss.anteil}}', '{{geschoss.ergebnis}}'], {
    fmts: [undefined, undefined, M, PROZENT],
    wrap: [1],
  });
  ws.mergeCells(`E29:${letzte}29`);

  abschnitt(31, 'Geschossfläche');
  kopf(32, ['Geschoss', 'Ermittlung', 'Fläche', '', '', '', '']);
  zeile(33, ['{{geschoss.name}}', '{{geschoss.gf_art}}', '{{geschoss.gf}}'], { fmts: [undefined, undefined, M2], wrap: [1] });
  summe(34, ['C'], 33, 33);

  put('A36', '{{aufenthalt.titel}}', { bold: true });
  zeile(37, ['{{raum[gf].geschoss}}', '{{raum[gf].nummer}} {{raum[gf].name}}', '{{raum[gf].flaeche}}', '{{raum[gf].aufenthalt}}'], { fmts: [undefined, undefined, M2] });
  ws.mergeCells(`D37:${letzte}37`);

  abschnitt(39, 'Flächenbilanz des Grundstücks');
  zeile(40, [null, 'Gebäude', '{{bilanz.gebaeude}}'], { fmts: [undefined, undefined, M2] });
  zeile(41, [null, 'vollversiegelt', '{{bilanz.vollversiegelt}}'], { fmts: [undefined, undefined, M2] });
  zeile(42, [null, 'teilversiegelt', '{{bilanz.teilversiegelt}}'], { fmts: [undefined, undefined, M2] });
  zeile(43, [null, 'Grünfläche', '{{bilanz.gruen}}'], { fmts: [undefined, undefined, M2] });
  summe(44, ['C'], 40, 43);

  // Lageplan: „eindeutig“ zählt Überlagerungen nur einmal – Summe = Wert der App; „angerechnet“ auf GR II bzw. GR
  abschnitt(46, 'Lageplan-Flächen');
  kopf(47, ['Fläche', 'Nutzung', 'Fläche', 'eindeutig', 'Versiegelung', 'angerechnet', 'Anrechnung']);
  zeile(
    48,
    [
      '{{lageplan[eigen].name}}',
      '{{lageplan[eigen].nutzung}}',
      '{{lageplan[eigen].flaeche}}',
      '{{lageplan[eigen].flaeche_eindeutig}}',
      '{{lageplan[eigen].versiegelung}}',
      '{{lageplan[eigen].angerechnet}}',
      '{{lageplan[eigen].anrechnung}}',
    ],
    { fmts: [undefined, undefined, M2, M2, undefined, M2] },
  );
  summe(49, ['D', 'F'], 48, 48);

  // Rechenweg: Formeln und Teilflächen, deren Fläche als Formel Länge × Breite × Faktor
  abschnitt(51, 'Rechenweg');
  put('A52', '{{formel.text}}');
  ws.mergeCells(`A52:${letzte}52`);
  kopf(53, ['Fläche', 'Teilfläche', 'Länge', 'Breite', 'Faktor', 'Fläche', '']);
  zeile(54, ['{{teil.flaeche_nr}} {{teil.flaeche_name}}', '{{teil.name}}', '{{teil.laenge}}', '{{teil.breite}}', '{{teil.faktor}}', { formula: 'C54*D54*E54' }], {
    fmts: [undefined, undefined, M, M, '0.0', M2],
  });

  abschnitt(56, 'Hinweise');
  put('A57', '{{hinweis.text}}', { wrap: true });
  ws.mergeCells(`A57:${letzte}57`);
  return ws;
}

/** Stellen der Kennzahlen wie in der App (für das Zahlenformat im Standardexport) */
function stellenVon(project: Project) {
  const n = massNachweis(project);
  return { grz: kennzahlStellenVon(n.grz), grz2: n.grz2 ? kennzahlStellenVon(n.grz2) : undefined, gfz: kennzahlStellenVon(n.gfz) };
}

async function vorlage(mitHilfe: boolean, stellen?: Parameters<typeof nachweisBlatt>[1]): Promise<Uint8Array> {
  const ExcelJS = await excel();
  const wb: Workbook = new ExcelJS.Workbook();
  wb.creator = APP_NAMEN.grz.name;
  wb.created = new Date();
  nachweisBlatt(wb, stellen);
  if (mitHilfe)
    platzhalterBlatt(
      wb,
      GRZ_PLACEHOLDER_DOCS,
      'Platzhalter in doppelten geschweiften Klammern werden beim Export ersetzt. Zeilen mit geschoss.*, lageplan.*, raum.* oder hinweis.* werden je Datensatz wiederholt, #geschoss … /geschoss wiederholt ganze Zeilenblöcke. #wenn … /wenn gibt Zeilen nur aus, wenn es passende Datensätze gibt (#wenn ! … nur, wenn nicht). Formeln (z. B. SUMME über eine Wiederholungszeile) werden automatisch auf die erzeugten Zeilen erweitert. Steht nur ein Platzhalter in der Zelle, wird eine Zahl eingetragen und das Zellformat der Vorlage bleibt erhalten. Dieses Blatt kann gelöscht werden.',
    );
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** Erzeugt die Muster-Vorlage (Blatt „GRZ GFZ“ und Platzhalter-Hilfe) – Ausgangspunkt für eigene Vorlagen. */
export const buildSampleTemplate = () => vorlage(true);

export async function exportWithTemplate(template: Uint8Array, project: Project, date = new Date()): Promise<Uint8Array> {
  return fuelleVorlage(template, buildGrzContext(project, date));
}

export async function exportDefault(project: Project, date = new Date()): Promise<Uint8Array> {
  return exportWithTemplate(await vorlage(false, stellenVon(project)), project, date);
}
