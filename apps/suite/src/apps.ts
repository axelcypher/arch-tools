/** Die Apps der Rahmen-App – Kennung = Ordner unter apps/ (und unter dist/apps/ der Rahmen-App) */
export interface AppInfo {
  id: string;
  name: string;
  /** kurze Beschreibung für die Startseite */
  text: string;
}

export const APPS: AppInfo[] = [
  { id: 'ordner', name: 'Projektordner', text: 'Projekte anlegen und ergänzen, Vorlagen, Ordner prüfen' },
  { id: 'formulare', name: 'Formulare', text: 'Bauantragsformulare aus SJ FORMA ausfüllen' },
  { id: 'flaechenrechner', name: 'Flächenrechner', text: 'Flächen und Rauminhalte nach DIN 277 und WoFlV' },
  { id: 'grz', name: 'GRZ-Nachweis', text: 'GRZ/GFZ-Nachweis nach BauNVO und BauO NRW' },
  { id: 'kosten', name: 'Kostenermittlung', text: 'Massen und Kosten nach DIN 276' },
  { id: 'entzerrung', name: 'Entzerrung', text: 'Fotos entzerren und darin messen' },
];

export const appInfo = (id: string) => APPS.find((a) => a.id === id);

/** Adresse einer App: im Tab (iframe) bzw. in einem eigenen Fenster */
export const appAdresse = (id: string, modus: 'tab' | 'fenster') => `apps/${id}/index.html?rahmen=${modus}&app=${encodeURIComponent(id)}`;

/** Fensterkennung (Tauri-Label) einer herausgelösten App */
export const fensterLabel = (id: string) => `app-${id}`;
