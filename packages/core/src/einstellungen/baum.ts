import { PFAD_EINSTELLUNGEN } from './eintraege';
import { istAbsolut, type PfadEinstellung, type PfadWert } from './verzeichnis';

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
      return `${e.art === 'pfad' ? `Relativ zu ${ort}` : `Liegt in ${ort}`}${b.sonst ? ` – ${b.sonst}` : ''}`;
    }
    case 'suche':
    case 'frei':
      return b.text;
  }
}

/** Teile eines Werts (Pfade an „/“ bzw. „\\“ getrennt; Listen: der erste Eintrag) */
function teileAus(e: PfadEinstellung, wert: PfadWert | undefined): string[] {
  const v = Array.isArray(wert) ? (wert[0] ?? '') : typeof wert === 'string' ? wert : '';
  const pfad = e.art === 'pfad' || e.art === 'ordner' || (e.art === 'liste' && (e.zeilen === 'pfad' || e.zeilen === 'ordner'));
  return pfad
    ? v
        .split(/[\\/]+/)
        .map((t) => t.trim())
        .filter(Boolean)
    : v.trim()
      ? [v.trim()]
      : [];
}

const erster = (wert: PfadWert | undefined) => (Array.isArray(wert) ? (wert[0] ?? '') : typeof wert === 'string' ? wert : '').trim();

/**
 * Teile des vollständigen Orts eines Eintrags – ab dem Projektordner (Bezug `projekt`) bzw. ab dem Laufwerk (`absolut`),
 * mit `wert` je Eintrag und `zwischen` für Ordner dazwischen (z. B. das Gewerk). `null`, wo der Ort nicht fest ist
 * (`suche`, `frei`). Namen schließen den Pfad ab. Ist ein Pfad der Kette absolut angegeben, beginnt der Ort dort.
 * `quellen` nennt je Teil den Eintrag, aus dem er stammt (`null`: Ordner dazwischen) – für die Vorschau mit
 * Beispielwerten; dieselbe Auflösung nutzt die Seite „Pfade und Benennung“.
 */
export function vollerOrt(
  e: PfadEinstellung,
  wert: (id: string) => PfadWert | undefined,
  zwischen: (z: { text: string; beispiel: string }) => string = () => '',
): { von: 'projekt' | 'absolut'; teile: string[]; quellen: (string | null)[] } | null {
  const kette = [...vorfahren(e), e];
  const wurzel = kette[0].bezug;
  if (wurzel.art !== 'projekt' && wurzel.art !== 'absolut') return null;
  let von: 'projekt' | 'absolut' = wurzel.art;
  let teile: string[] = [];
  let quellen: (string | null)[] = [];
  for (const x of kette) {
    if (x.bezug.art === 'eintrag' && x.bezug.zwischen)
      for (const t of zwischen(x.bezug.zwischen)
        .split(/[\\/]+/)
        .filter(Boolean)) {
        teile.push(t);
        quellen.push(null);
      }
    const w = wert(x.id);
    if (x !== kette[0] && x.art === 'pfad' && istAbsolut(erster(w))) {
      von = 'absolut';
      teile = [];
      quellen = [];
    }
    for (const t of teileAus(x, w)) {
      teile.push(t);
      quellen.push(x.id);
    }
  }
  return { von, teile, quellen };
}
