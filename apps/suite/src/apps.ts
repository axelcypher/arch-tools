import { APP_NAMEN } from '@core/appNamen';

/** Die Apps der Rahmen-App – Kennung = Ordner unter apps/ (und unter dist/apps/ der Rahmen-App) */
export interface AppInfo {
  id: string;
  /** Produktname (APP_NAMEN), z. B. „PERMIO“ */
  name: string;
  /** wofür die App da ist, in einem Wort (früherer Name), z. B. „Formulare“ */
  was: string;
  /** kurze Beschreibung für die Startseite (was beim Umzug aus ungespeicherten Änderungen wird: `beimUmzug` in core) */
  text: string;
}

export const APPS: AppInfo[] = [
  { id: 'ordner', ...APP_NAMEN.ordner, text: 'Projekte anlegen und fortschreiben, Struktur, Vorlagen, Ordner prüfen, Katasterpläne' },
  { id: 'formulare', ...APP_NAMEN.formulare, text: 'Bauantragsformulare ausfüllen' },
  { id: 'flaechenrechner', ...APP_NAMEN.flaechenrechner, text: 'Flächen und Rauminhalte nach DIN 277 und WoFlV' },
  { id: 'grz', ...APP_NAMEN.grz, text: 'GRZ/GFZ-Nachweis nach BauNVO und BauO NRW' },
  { id: 'kosten', ...APP_NAMEN.kosten, text: 'Massen und Kosten nach DIN 276' },
  { id: 'entzerrung', ...APP_NAMEN.entzerrung, text: 'Fotos entzerren und darin messen' },
  { id: 'ava', ...APP_NAMEN.ava, text: 'Ausschreibung, Vergabe, Abrechnung und Bauleitung' },
];

export const appInfo = (id: string) => APPS.find((a) => a.id === id);

/** Adresse einer App: im Tab (iframe) bzw. in einem eigenen Fenster */
export const appAdresse = (id: string, modus: 'tab' | 'fenster') => `apps/${id}/index.html?rahmen=${modus}&app=${encodeURIComponent(id)}`;

/** Fensterkennung (Tauri-Label) einer herausgelösten App */
export const fensterLabel = (id: string) => `app-${id}`;
