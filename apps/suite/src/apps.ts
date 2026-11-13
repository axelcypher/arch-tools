import { APP_NAMEN } from '@core/appNamen';

/** Die Apps der Rahmen-App – Kennung = Ordner unter apps/ (und unter dist/apps/ der Rahmen-App) */
export interface AppInfo {
  id: string;
  /** Produktname (APP_NAMEN), z. B. „PERMIO“ */
  name: string;
  /** wofür die App da ist, in einem Wort (früherer Name), z. B. „Formulare“ */
  was: string;
  /** kurze Beschreibung für die Startseite */
  text: string;
  /** was beim Herauslösen bzw. Andocken (die App startet neu) aus ungespeicherten Änderungen wird */
  beimUmzug: string;
}

const ZWISCHENSTAND = 'Ungespeicherte Änderungen bleiben im Zwischenstand und werden im neuen Fenster wiederhergestellt.';

export const APPS: AppInfo[] = [
  { id: 'ordner', ...APP_NAMEN.ordner, text: 'Projekte anlegen und fortschreiben, Struktur, Vorlagen, Ordner prüfen, Katasterpläne', beimUmzug: 'Ungespeicherte Änderungen gehen verloren – bitte vorher speichern.' },
  { id: 'formulare', ...APP_NAMEN.formulare, text: 'Bauantragsformulare ausfüllen', beimUmzug: 'Nicht gespeicherte Eingaben bleiben als Entwurf erhalten und erscheinen beim erneuten Öffnen des Formulars wieder; ungespeicherte Bearbeitungen in PDF-, Excel- und Word-Dokumenten der Dateiansicht gehen verloren.' },
  { id: 'flaechenrechner', ...APP_NAMEN.flaechenrechner, text: 'Flächen und Rauminhalte nach DIN 277 und WoFlV', beimUmzug: ZWISCHENSTAND },
  { id: 'grz', ...APP_NAMEN.grz, text: 'GRZ/GFZ-Nachweis nach BauNVO und BauO NRW', beimUmzug: ZWISCHENSTAND },
  { id: 'kosten', ...APP_NAMEN.kosten, text: 'Massen und Kosten nach DIN 276', beimUmzug: ZWISCHENSTAND },
  { id: 'entzerrung', ...APP_NAMEN.entzerrung, text: 'Fotos entzerren und darin messen', beimUmzug: ZWISCHENSTAND },
  { id: 'ava', ...APP_NAMEN.ava, text: 'Ausschreibung, Vergabe, Abrechnung und Bauleitung', beimUmzug: 'Ungespeicherte Änderungen am LV gehen verloren – bitte vorher speichern (alles andere speichert die App sofort).' },
];

export const appInfo = (id: string) => APPS.find((a) => a.id === id);

/** Adresse einer App: im Tab (iframe) bzw. in einem eigenen Fenster */
export const appAdresse = (id: string, modus: 'tab' | 'fenster') => `apps/${id}/index.html?rahmen=${modus}&app=${encodeURIComponent(id)}`;

/** Fensterkennung (Tauri-Label) einer herausgelösten App */
export const fensterLabel = (id: string) => `app-${id}`;
