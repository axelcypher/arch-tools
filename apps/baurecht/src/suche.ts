/**
 * Textsuche für Angaben und Vorschriften: jedes Wort muss vorkommen – Zahlen als ganzes Wort („1“ trifft nicht „10“),
 * kurze Wörter bis drei Zeichen (Kürzel) nur am Wortanfang („GK“ trifft nicht „Schwierigkeiten“), längere auch im
 * Wort (zusammengesetzte Wörter: „flächen“ in „Abstandsflächen“). Gängige Kürzel und Synonyme zählen mit.
 */
const SYNONYME: Record<string, string[]> = {
  gk: ['gebäudeklasse'],
  grz: ['grundflächenzahl', 'grz'],
  gfz: ['geschossflächenzahl', 'gfz'],
  bplan: ['bebauungsplan'],
  'b-plan': ['bebauungsplan'],
  fnp: ['flächennutzungsplan'],
  lsg: ['landschaftsschutz'],
  nsg: ['naturschutzgebiet'],
  wsg: ['wasserschutzgebiet'],
  üsg: ['überschwemmungsgebiet'],
  abriss: ['beseitigung', 'abbruch'],
  abbruch: ['beseitigung'],
  rückbau: ['beseitigung', 'abbruch'],
  neubau: ['errichtung'],
  umbau: ['änderung'],
  stellplatz: ['stellpl'],
  lp: ['landschaftsplan'],
  efh: ['einfamilienhaus'],
  zfh: ['zweifamilienhaus'],
  mfh: ['mehrfamilienhaus'],
  // beide Schreibweisen (die Altstadtsatzung sagt „Einfriedigung“, die BauO NRW „Einfriedung“)
  einfriedung: ['einfriedigung'],
  einfriedungen: ['einfriedigung'],
  einfriedigung: ['einfriedung'],
  einfriedigungen: ['einfriedung'],
};

// Satzzeichen zählen nicht („Abstandsflächen.“, „Stellplätze,“)
export const suchNorm = (s: string) => s.toLowerCase().replace(/§/g, ' ').replace(/[.,;:!?()„“"]/g, ' ').replace(/\s+/g, ' ').trim();
const falten = (s: string) => s.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');
const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function wortPasst(text: string, x: string): boolean {
  if (/^\d/.test(x)) return new RegExp(`(^|[^0-9])${esc(x)}([^0-9]|$)`).test(text);
  // römische Ziffern als ganzes Wort („LP I“ trifft nicht „LP II“)
  if (/^[ivx]{1,4}$/.test(x)) return new RegExp(`(^|[^a-zäöüß0-9])${x}([^a-zäöüß0-9]|$)`).test(text);
  if (x.length <= 3) return new RegExp(`(^|[^a-zäöüß0-9])${esc(x)}`).test(text);
  return text.includes(x);
}

/** passt der Text zur Suche? (leere Suche passt immer) */
export function textPasst(text: string, suche: string): boolean {
  const q = suchNorm(suche);
  if (!q) return true;
  const t = suchNorm(text);
  // Synonyme nur am Wortanfang („Umbau“ → „Änderung“, nicht „Veränderungssperre“)
  // auch ohne Umlaute („Stellpla“ trifft „Stellplätze“)
  const tf = falten(t);
  return q.split(' ').every((x) => wortPasst(t, x) || wortPasst(tf, falten(x)) || (SYNONYME[x] ?? []).some((s) => new RegExp(`(^|[^a-zäöüß0-9])${esc(s)}`).test(t)));
}
