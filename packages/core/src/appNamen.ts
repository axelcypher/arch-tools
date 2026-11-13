/**
 * Namen der Apps – an einer Stelle für Titelleiste, Rahmen-App, Fenstertitel und Texte, die auf eine andere App
 * verweisen. `name` ist der Produktname (wie im Startmenü und im Installer), `was` sagt in einem Wort, wofür die App
 * da ist (Untertitel und Erklärung neben dem Namen). Die Kennungen (Ordner unter apps/, `?app=`, Speicher-Schlüssel,
 * Bundle-Kennung) bleiben wie bisher.
 */
export interface AppName {
  name: string;
  was: string;
}

export const APP_NAMEN = {
  suite: { name: 'Arkly', was: 'Rahmen-App' },
  ordner: { name: 'ATLAS', was: 'Projektordner' },
  formulare: { name: 'PERMIO', was: 'Formulare' },
  flaechenrechner: { name: 'QUADRIO', was: 'Flächenrechner' },
  grz: { name: 'TERRIO', was: 'GRZ-Nachweis' },
  kosten: { name: 'NUMIO', was: 'Kostenermittlung' },
  entzerrung: { name: 'RECTIO', was: 'Entzerrung' },
  ava: { name: 'FABRIO', was: 'AVA' },
  baurecht: { name: 'LEXIO', was: 'Baurecht' },
} as const satisfies Record<string, AppName>;

export type AppKennung = keyof typeof APP_NAMEN;

/**
 * Name mit Erklärung, z. B. „PERMIO (Formulare)“. Regel für Texte: Verweist ein Text, Dialog oder eine Regelkarte auf
 * eine andere App, steht beim ersten Vorkommen der Name mit Erklärung (`appMitWas`), danach der Name allein; die
 * eigene App ohne Erklärung. Titelleiste, Tabs und Startseite zeigen den Namen, Tooltips und Startseite zusätzlich `was`.
 */
export const appMitWas = (id: AppKennung): string => `${APP_NAMEN[id].name} (${APP_NAMEN[id].was})`;
