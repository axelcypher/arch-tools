/** Die Apps der Rahmen-App – Kennung = Ordner unter apps/ (und unter dist/apps/ der Rahmen-App) */
export interface AppInfo {
  id: string;
  name: string;
  /** kurze Beschreibung für die Startseite */
  text: string;
  /** was beim Herauslösen bzw. Andocken (die App startet neu) aus ungespeicherten Änderungen wird */
  beimUmzug: string;
}

const ZWISCHENSTAND = 'Ungespeicherte Änderungen bleiben im Zwischenstand und werden im neuen Fenster wiederhergestellt.';

export const APPS: AppInfo[] = [
  { id: 'ordner', name: 'Projektordner', text: 'Projekte anlegen und ergänzen, Vorlagen, Ordner prüfen', beimUmzug: 'Ungespeicherte Änderungen gehen verloren – bitte vorher speichern.' },
  { id: 'formulare', name: 'Formulare', text: 'Bauantragsformulare ausfüllen', beimUmzug: 'Nicht gespeicherte Eingaben bleiben als Entwurf erhalten und erscheinen beim erneuten Öffnen des Formulars wieder; ungespeicherte Bearbeitungen in PDF-, Excel- und Word-Dokumenten der Dateiansicht gehen verloren.' },
  { id: 'flaechenrechner', name: 'Flächenrechner', text: 'Flächen und Rauminhalte nach DIN 277 und WoFlV', beimUmzug: ZWISCHENSTAND },
  { id: 'grz', name: 'GRZ-Nachweis', text: 'GRZ/GFZ-Nachweis nach BauNVO und BauO NRW', beimUmzug: ZWISCHENSTAND },
  { id: 'kosten', name: 'Kostenermittlung', text: 'Massen und Kosten nach DIN 276', beimUmzug: ZWISCHENSTAND },
  { id: 'entzerrung', name: 'Entzerrung', text: 'Fotos entzerren und darin messen', beimUmzug: ZWISCHENSTAND },
];

export const appInfo = (id: string) => APPS.find((a) => a.id === id);

/** Adresse einer App: im Tab (iframe) bzw. in einem eigenen Fenster */
export const appAdresse = (id: string, modus: 'tab' | 'fenster') => `apps/${id}/index.html?rahmen=${modus}&app=${encodeURIComponent(id)}`;

/** Fensterkennung (Tauri-Label) einer herausgelösten App */
export const fensterLabel = (id: string) => `app-${id}`;
