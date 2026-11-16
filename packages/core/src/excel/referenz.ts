import { KERN_BEISPIELDATEN, KERN_THEMEN } from './kern';
import type { HinweisArt } from './pruefung';
import { HINWEISARTEN } from './pruefung';
import type { Art, Beispiel, PlatzhalterSchema, Sammlung } from './schema';
import { ARTEN, NUTZBAR, ORTE } from './schema';

/**
 * Erzeugt die Abschnitte von docs/excel-vorlagen.md aus Kern-Syntax und App-Schema. Die Datei enthält sie zwischen
 * <!-- erzeugt:ID --> und <!-- /erzeugt:ID -->; die Tests prüfen, dass sie aktuell sind (scripts/excel-doku.mjs schreibt neu).
 */

/** Platzhalter im Fließtext als Code setzen */
const code = (t: string) => t.replace(/\{\{[^{}]*\}\}/g, (m) => `\`${m}\``);
/** Zelle einer Markdown-Tabelle */
const zelle = (t: string) => t.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const zeile = (cells: string[]) => `| ${cells.map(zelle).join(' | ')} |`;

function tabelle(kopf: string[], zeilen: string[][]): string {
  return [zeile(kopf), zeile(kopf.map(() => '---')), ...zeilen.map(zeile)].join('\n');
}

const spalte = (i: number) => String.fromCharCode(65 + i);

function beispielMd(b: Beispiel): string {
  const breite = Math.max(1, ...b.vorlage.map((z) => z.length), ...b.ergebnis.map((z) => z.length));
  const kopf = ['', ...Array.from({ length: breite }, (_, i) => spalte(i))];
  const vorlage = b.vorlage.map((z, r) => [String(r + 1), ...Array.from({ length: breite }, (_, i) => (z[i] ? `\`${z[i]}\`` : ''))]);
  const ergebnis = b.ergebnis.map((z, r) => [
    String(r + 1),
    ...Array.from({ length: breite }, (_, i) => {
      const v = z[i];
      if (v === null || v === undefined) return '';
      if (typeof v === 'number') return v.toLocaleString('de-DE', { maximumFractionDigits: 6 });
      return v.startsWith('=') || v.includes('{{') ? `\`${v}\`` : v;
    }),
  ]);
  return [
    `**Beispiel: ${b.titel}**${b.text ? ` – ${code(b.text)}` : ''}${b.pruefung?.length ? ` Die Vorlagenprüfung meldet hier: ${b.pruefung.map((a) => HINWEISARTEN[a as HinweisArt] ?? a).join('; ')}.` : ''}`,
    '',
    'Vorlage:',
    '',
    tabelle(kopf, vorlage),
    '',
    'Ergebnis:',
    '',
    tabelle(kopf, ergebnis.length ? ergebnis : [['', '(keine Zeile)']]),
  ].join('\n');
}

/** „ja“-Orte einer Art als Text */
export function nutzbarText(art: Art): string {
  const n = NUTZBAR[art];
  const ja = ORTE.filter((o) => n[o.id] && o.id !== 'filter').map((o) => o.label);
  const nein = ORTE.filter((o) => !n[o.id] && o.id !== 'filter' && o.id !== 'wiederholung').map((o) => o.label);
  return `${ja.join(', ')}${nein.length ? `; nicht: ${nein.join(', ')}` : ''}`;
}

/** Abschnitt „Syntax“ (alle Apps gleich) */
export function kernMarkdown(): string {
  const teile: string[] = [`_${KERN_BEISPIELDATEN}_`];
  for (const t of KERN_THEMEN) {
    teile.push(`### ${t.titel}`);
    for (const a of t.absaetze) teile.push(code(a));
    if (t.tabelle)
      teile.push(
        tabelle(
          t.tabelle[0],
          t.tabelle.slice(1).map((z) => z.map(code)),
        ),
      );
    for (const b of t.beispiele ?? []) teile.push(beispielMd(b));
  }
  return teile.join('\n\n');
}

function sammlungMd(x: Sammlung, alle: Sammlung[]): string {
  const titel = (n: string) => alle.find((s) => s.name === n)?.titel ?? n;
  const teile: string[] = [`### \`${x.name}\` – ${x.titel}`, `**Sammlung**, Zeile ${x.datensatz}. ${code(x.text)}`];
  teile.push(`**Wo nutzbar:** ${nutzbarText('sammlung')}. Filter: benannte (unten) und allgemeine (\`[feld=wert]\` …).`);
  teile.push(
    x.enthaelt.length
      ? `**Enthält** – im Block \`{{#${x.name}}}\` auf den aktuellen Datensatz eingeschränkt:\n\n${x.enthaelt.map((e) => `- \`${e.sammlung}\` (${titel(e.sammlung)}): ${code(e.text)}`).join('\n')}`
      : `**Enthält:** keine Unterpunkte – im Block \`{{#${x.name}}}\` laufen andere Sammlungen über alle Datensätze.`,
  );
  if (x.nichtEingeschraenkt?.length)
    teile.push(`**Nicht eingeschränkt** (laufen im Block über alle Datensätze):\n\n${x.nichtEingeschraenkt.map((e) => `- \`${e.sammlung}\`: ${code(e.text)}`).join('\n')}`);
  if (x.zugriff) teile.push(`**Benannter Einzelzugriff:** \`{{${x.name}:NAME.feld}}\` – ${code(x.zugriff.text)} Beispiel: \`${x.zugriff.beispiel}\`. Nutzbar: ${nutzbarText('zugriff')}.`);
  if (x.tabelle)
    teile.push(
      tabelle(
        x.tabelle[0],
        x.tabelle.slice(1).map((z) => z.map(code)),
      ),
    );
  teile.push(
    tabelle(
      ['Platzhalter', 'Bedeutung', 'Einheit'],
      x.felder.map((f) => [`\`{{${x.name}.${f.name}}}\``, code(f.text), f.einheit ?? '']),
    ),
  );
  teile.push(
    x.filter.length
      ? tabelle(
          ['Benannter Filter', 'Bedeutung'],
          x.filter.map((f) => [[f.name, ...(f.aliase ?? [])].map((n) => `\`[${n}]\``).join(', '), code(f.text)]),
        )
      : 'Benannte Filter: keine – allgemeine Filter gehen.',
  );
  if (x.hinweise?.length) teile.push(x.hinweise.map((h) => `- ${code(h)}`).join('\n'));
  for (const b of x.beispiele) teile.push(beispielMd(b));
  return teile.join('\n\n');
}

/** Abschnitt einer App: alle Einzelwerte und Sammlungen mit Beispielen */
export function schemaMarkdown(s: PlatzhalterSchema): string {
  const alle = s.abschnitte.filter((a): a is Sammlung => a.art === 'sammlung');
  const teile: string[] = [`_${s.beispieldaten}_`];
  for (const a of s.abschnitte) {
    if (a.art === 'sammlung') {
      teile.push(sammlungMd(a, alle));
      continue;
    }
    teile.push(`### ${a.titel}`);
    teile.push(`**${ARTEN.einzelwert.label}e** – nutzbar: ${nutzbarText('einzelwert')}; keine Filter.${a.text ? ` ${code(a.text)}` : ''}`);
    if (a.tabelle)
      teile.push(
        tabelle(
          a.tabelle[0],
          a.tabelle.slice(1).map((z) => z.map(code)),
        ),
      );
    teile.push(
      tabelle(
        ['Platzhalter', 'Bedeutung', 'Einheit'],
        a.werte.map((w) => [`\`{{${w.schluessel}}}\``, code(w.text), w.einheit ?? '']),
      ),
    );
    for (const b of a.beispiele ?? []) teile.push(beispielMd(b));
  }
  return teile.join('\n\n');
}

/** Ersetzt den erzeugten Abschnitt `id` in einer Markdown-Datei */
export function abschnittErsetzen(md: string, id: string, inhalt: string): string {
  const start = `<!-- erzeugt:${id} – nicht von Hand ändern, scripts/excel-doku.mjs -->`;
  const ende = `<!-- /erzeugt:${id} -->`;
  const re = new RegExp(`<!-- erzeugt:${id}\\b[^>]*-->[\\s\\S]*?<!-- /erzeugt:${id} -->`);
  if (!re.test(md)) throw new Error(`Abschnitt ${id} fehlt in der Datei`);
  return md.replace(re, () => `${start}\n\n${inhalt}\n\n${ende}`);
}
