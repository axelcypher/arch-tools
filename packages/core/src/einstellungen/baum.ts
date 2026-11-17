import { PFAD_EINSTELLUNGEN } from './eintraege';
import type { PfadEinstellung, PfadWert } from './verzeichnis';

/**
 * Baum der Pfad- und Namenseinstellungen: wovon ein Wert abhängt (`PfadEinstellung.bezug`). Grundlage der Gliederung auf
 * der Seite „Pfade und Benennung“ und der vollständigen Vorschau; die Tests gleichen die Bezüge mit der Auflösung in den
 * Apps ab (`bezug*.test.ts`).
 */

const nachId = new Map(PFAD_EINSTELLUNGEN.map((e) => [e.id, e]));

/** Eltern-Eintrag (nur bei Bezug auf einen anderen Eintrag) */
export function elternVon(e: PfadEinstellung): PfadEinstellung | undefined {
  return e.bezug.art === 'eintrag' ? nachId.get(e.bezug.id) : undefined;
}

/** direkte Kinder eines Eintrags, in der Reihenfolge des Verzeichnisses */
export function kinderVon(id: string, liste: PfadEinstellung[] = PFAD_EINSTELLUNGEN): PfadEinstellung[] {
  return liste.filter((e) => e.bezug.art === 'eintrag' && e.bezug.id === id);
}

/** Vorfahren von der Wurzel bis zum Eltern-Eintrag */
export function vorfahren(e: PfadEinstellung): PfadEinstellung[] {
  const kette: PfadEinstellung[] = [];
  for (let p = elternVon(e); p; p = elternVon(p)) {
    if (kette.includes(p)) throw new Error(`Bezug im Kreis: ${e.id}`);
    kette.unshift(p);
  }
  return kette;
}

/** Bezugszeile für die Anzeige, z. B. „Relativ zu „Ordner der Gewerke“ › je Gewerk ein Ordner“ */
export function bezugText(e: PfadEinstellung): string {
  const b = e.bezug;
  switch (b.art) {
    case 'projekt':
      return e.art === 'name' ? 'Im Projektordner' : 'Relativ zum Projektordner';
    case 'absolut':
      return e.art === 'liste' ? 'Vollständige Ordner (mit Laufwerk oder Netzwerkpfad)' : 'Vollständiger Ordner (mit Laufwerk oder Netzwerkpfad)';
    case 'eintrag': {
      const p = nachId.get(b.id);
      const ort = `„${p?.bezeichnung ?? b.id}“${b.zwischen ? ` › ${b.zwischen.text}` : ''}`;
      return e.art === 'pfad' ? `Relativ zu ${ort}` : `Liegt in ${ort}`;
    }
    case 'suche':
    case 'frei':
      return b.text;
  }
}

/** Teile eines Werts (Pfade an „/“ bzw. „\“ getrennt; Listen: der erste Eintrag) */
function teileAus(e: PfadEinstellung, wert: PfadWert | undefined): string[] {
  const v = Array.isArray(wert) ? (wert[0] ?? '') : typeof wert === 'string' ? wert : '';
  const pfad = e.art === 'pfad' || e.art === 'ordner' || (e.art === 'liste' && (e.zeilen === 'pfad' || e.zeilen === 'ordner'));
  return pfad ? v.split(/[\\/]+/).filter(Boolean) : v.trim() ? [v.trim()] : [];
}

/**
 * Teile des vollständigen Orts eines Eintrags – ab dem Projektordner (Bezug `projekt`) bzw. ab dem Laufwerk (`absolut`),
 * mit `wert` je Eintrag und `zwischen` für Ordner dazwischen (z. B. das Gewerk). `null`, wo der Ort nicht fest ist
 * (`suche`, `frei`). Namen schließen den Pfad ab.
 */
export function vollerOrt(e: PfadEinstellung, wert: (id: string) => PfadWert | undefined, zwischen: (text: string) => string = () => ''): { von: 'projekt' | 'absolut'; teile: string[] } | null {
  const kette = [...vorfahren(e), e];
  const wurzel = kette[0].bezug;
  if (wurzel.art !== 'projekt' && wurzel.art !== 'absolut') return null;
  const teile: string[] = [];
  for (const x of kette) {
    if (x.bezug.art === 'eintrag' && x.bezug.zwischen) teile.push(...zwischen(x.bezug.zwischen.text).split(/[\\/]+/).filter(Boolean));
    teile.push(...teileAus(x, wert(x.id)));
  }
  return { von: wurzel.art, teile };
}
