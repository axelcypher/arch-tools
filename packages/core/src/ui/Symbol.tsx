/**
 * Gemeinsamer Symbolsatz aller Apps als SVG (statt Emojis und Schriftzeichen, die Windows uneinheitlich oder gar nicht
 * darstellt). Raster 24, Linie 2, runde Enden; Strichfarbe folgt dem Text (currentColor), Größe 1em. Ursprung: PERMIO.
 */

const PFADE = {
  liste: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  stift: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  schliessen: 'M6 6l12 12M18 6L6 18',
  auge: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  augeZu: 'M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.5 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.8 9.8 0 0 0 4.4-1M9.9 9.9a3 3 0 0 0 4.2 4.2',
  pfeilRechts: 'M9 6l6 6-6 6',
  pfeilLinks: 'M15 6l-6 6 6 6',
  pfeilUnten: 'M6 9l6 6 6-6',
  ordner: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z',
  ordnerOffen: 'M3 7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1H7.5a2 2 0 0 0-1.9 1.4L3.4 18M3 7v10a2 2 0 0 0 2 2h12.6a2 2 0 0 0 1.9-1.4l1.9-6A1.5 1.5 0 0 0 20 10',
  datei: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM14 3v5h5',
  formular: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM14 3v5h5M9 13h6M9 17h6M9 9h2',
  karte: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM9 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 16c.6-1.5 1.7-2 3-2s2.4.5 3 2M14 9h4M14 13h4',
  schloss: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  extern: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  zahnrad:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  suche: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  rueckgaengig: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  wiederholen: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  drucken: 'M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z',
  verlauf: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  adressen: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  buero: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 10h.01M15 10h.01',
  plus: 'M12 5v14M5 12h14',
  neuLaden: 'M20 11a8 8 0 0 0-14.6-4.5L4 8M4 3v5h5M4 13a8 8 0 0 0 14.6 4.5L20 16M20 21v-5h-5',
  haken: 'M5 12l5 5L20 7',
  tabelle: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM8 12h8M8 16h8M12 12v8',
  bild: 'M4 5h16v14H4zM8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM20 15l-5-5L5 19',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  // Warndreieck – für Hinweise in Warnfarbe (Plansatz)
  warnung: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  /** Klammer um mehrere Zeilen: Felder, die zusammen eine Angabe sind */
  gruppe: 'M7 4H5v16h2M17 4h2v16h-2M9 8h6M9 12h6M9 16h6',
  strich: 'M6 12h12',
  export: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  kopie: 'M9 9h10v12H9zM5 15V3h10',
  muell: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  einfuegen: 'M9 4h6v3H9zM8 5H5v16h14V5h-3M9 13h6M12 10v6',
  textfeld: 'M4 6V4h16v2M12 4v16M9 20h6',
  kreuz: 'M5 5h14v14H5zM8 8l8 8M16 8l-8 8',
  stapel: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  uebertragen: 'M7 4v14M3 14l4 4 4-4M17 20V6M13 10l4-4 4 4',
  griff: 'M8 6h2M14 6h2M8 12h2M14 12h2M8 18h2M14 18h2',
  ziel: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 1v4M12 19v4M1 12h4M19 12h4',
  /** Verzweigung: nur erforderlich, wenn … */
  bedingung: 'M7 4v10M17 8v1a5 5 0 0 1-5 5H7M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  /** Favorit (gefüllt über CSS: fill: currentColor) */
  stern: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3z',
  /** Verknüpfte Einträge (gemeinsam ausgefüllt) – nicht „Datei verknüpfen“ (link) */
  kette: 'M9 17H7a5 5 0 0 1 0-10h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8',
  /** leeres Kästchen (Feld zum Ankreuzen) */
  kaestchen: 'M5 5h14v14H5z',
  // Werkzeuge der Zeichenflächen und Befehle (gemeinsam für alle Apps)
  auswahl: 'M5 3l14 8-6 2-2 6-6-16z',
  polygon: 'M12 3l8 6-3 11H7L4 9l8-6z',
  rechteck: 'M4 6h16v12H4z',
  lineal: 'M3 17L17 3l4 4L7 21l-4-4zM7 13l2 2M10 10l2 2M13 7l2 2',
  kalibrieren: 'M4 12h16M4 8v8M20 8v8M8 10v4M12 10v4M16 10v4',
  speichern: 'M5 3h11l3 3v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V3zM8 3v5h7V3M8 21v-7h8v7',
  einpassen: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  raster: 'M4 4h16v16H4zM4 12h16M12 4v16',
} as const;

export type SymbolName = keyof typeof PFADE;

/** Symbol in Textgröße; ohne `titel` dekorativ (aria-hidden) – dann trägt der Knopf den Namen (Text oder aria-label) */
export function Symbol({ name, titel }: { name: SymbolName; titel?: string }) {
  return (
    <svg
      className="symbol"
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={titel ? undefined : true}
      role={titel ? 'img' : undefined}
    >
      {titel && <title>{titel}</title>}
      <path d={PFADE[name]} />
    </svg>
  );
}

/** alle Namen (für Tests und die Übersicht in docs/design.md) */
export const SYMBOLE = Object.keys(PFADE) as SymbolName[];
