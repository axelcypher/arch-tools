/**
 * PDF der Bauleitung: Protokoll einer Baubesprechung, Tagesbericht (Bautagebuch), Mängelliste – zum Ablegen im
 * Ordner Bauleitung des Projekts und zum Verschicken.
 */

import type { ProjectMeta } from '@core/model';
import type { Mangel, Protokoll, Tagesbericht } from '../avaDaten';
import { datumDE } from '../abrechnung/pruefung';
import { gewerkZweistellig } from '../abrechnung/gewerk';
import { PdfDokument } from './pdfDokument';

export interface BerichtKopf {
  meta: ProjectMeta;
  projektName: string;
  buero: string;
}

const kopfVon = (k: BerichtKopf) => ({ links: k.buero.split('\n')[0] ?? '', rechts: `${k.meta.projektcode} ${k.meta.vorhaben || k.projektName}`.trim() });
const adresse = (m: ProjectMeta) => [m.adresse.strasse, `${m.adresse.plz} ${m.adresse.ort}`.trim()].filter(Boolean).join(', ');

export async function protokollPdf(k: BerichtKopf, p: Protokoll): Promise<Uint8Array> {
  const d = await PdfDokument.neu(kopfVon(k), `Protokoll Nr. ${p.nr}`);
  d.titel(`${p.art} Nr. ${p.nr}`, `${k.meta.vorhaben || k.projektName}${adresse(k.meta) ? ` · ${adresse(k.meta)}` : ''}`);
  d.angaben([
    ['Datum', `${datumDE(p.datum)}${p.beginn ? `, ${p.beginn}${p.ende ? `–${p.ende}` : ''} Uhr` : ''}`],
    ['Ort', p.ort ?? ''],
    ['Verfasser', p.verfasser ?? ''],
    ['Nächster Termin', p.naechsterTermin ?? ''],
  ]);
  d.ueberschrift('Teilnehmer');
  d.tabelle(
    [
      { titel: 'Name', breite: 3 },
      { titel: 'Firma / Funktion', breite: 4 },
      { titel: 'anwesend', breite: 1.4 },
    ],
    p.teilnehmer.map((t) => [t.name, t.firma ?? '', t.anwesend ? 'ja' : 'entschuldigt']),
  );
  d.ueberschrift('Besprechungspunkte');
  d.tabelle(
    [
      { titel: 'Nr.', breite: 0.9 },
      { titel: 'Thema', breite: 7 },
      { titel: 'Zuständig', breite: 2 },
      { titel: 'Frist', breite: 1.5 },
    ],
    p.tops.map((t) => [
      { text: t.nr, fett: true },
      { text: `${t.titel}${t.text ? `\n${t.text}` : ''}${t.aus ? `\n(aus Protokoll Nr. ${t.aus})` : ''}${t.erledigt ? '\n– erledigt –' : ''}` },
      t.zustaendig ?? '',
      t.frist ? datumDE(t.frist) : '',
    ]),
  );
  if (p.verteiler) {
    d.ueberschrift('Verteiler');
    d.absatz(p.verteiler);
  }
  d.abstand(4);
  d.absatz('Einwände gegen dieses Protokoll sind innerhalb einer Woche nach Zugang schriftlich mitzuteilen; danach gilt es als anerkannt.', { groesse: 8.5 });
  return d.speichern();
}

export async function tagesberichtPdf(k: BerichtKopf, t: Tagesbericht): Promise<Uint8Array> {
  const d = await PdfDokument.neu(kopfVon(k), `Bautagebuch ${datumDE(t.datum)}`);
  d.titel(`Bautagebuch${t.nr ? ` Nr. ${t.nr}` : ''} – ${datumDE(t.datum)}`, `${k.meta.vorhaben || k.projektName}${adresse(k.meta) ? ` · ${adresse(k.meta)}` : ''}`);
  d.angaben([
    ['Wetter', [t.wetter, t.temperatur].filter(Boolean).join(', ')],
    ['Verfasser', t.verfasser ?? ''],
  ]);
  if (t.firmen.length) {
    d.ueberschrift('Firmen auf der Baustelle');
    d.tabelle(
      [
        { titel: 'Firma', breite: 4 },
        { titel: 'Gewerk', breite: 1.4 },
        { titel: 'Personen', breite: 1.2, rechts: true },
        { titel: 'Tätigkeit', breite: 5 },
      ],
      t.firmen.map((f) => [f.firma, f.gewerk ? gewerkZweistellig(f.gewerk) : '', f.personen ? String(f.personen) : '', f.taetigkeit ?? '']),
    );
  }
  const abschnitt = (titel: string, text?: string) => {
    if (!text?.trim()) return;
    d.ueberschrift(titel);
    d.absatz(text);
  };
  abschnitt('Ausgeführte Leistungen', t.leistungen);
  abschnitt('Behinderungen, Erschwernisse, Mängel', t.behinderungen);
  abschnitt('Anordnungen und Vereinbarungen', t.anordnungen);
  abschnitt('Besucher', t.besucher);
  if (t.fotos.length) {
    d.ueberschrift('Fotos');
    d.absatz(t.fotos.map((f) => f.split('/').pop()).join('\n'), { groesse: 8.5 });
  }
  return d.speichern();
}

export async function maengelPdf(k: BerichtKopf, liste: Mangel[], titel = 'Mängelliste'): Promise<Uint8Array> {
  const d = await PdfDokument.neu(kopfVon(k), titel);
  d.titel(titel, `${k.meta.vorhaben || k.projektName} · Stand ${datumDE(new Date().toISOString().slice(0, 10))}`);
  d.tabelle(
    [
      { titel: 'Nr.', breite: 0.8 },
      { titel: 'Gewerk / Firma', breite: 2.4 },
      { titel: 'Ort', breite: 1.8 },
      { titel: 'Mangel', breite: 5 },
      { titel: 'Frist', breite: 1.4 },
      { titel: 'Status', breite: 1.4 },
    ],
    liste.map((m) => [String(m.nr), [m.gewerk && gewerkZweistellig(m.gewerk), m.firma].filter(Boolean).join(' '), m.ort ?? '', m.beschreibung, m.frist ? datumDE(m.frist) : '', m.status]),
  );
  return d.speichern();
}
