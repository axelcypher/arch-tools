/**
 * Name der laufenden App (Produktname aus APP_NAMEN), wie ihn die Titelleiste anzeigt – für Stellen, die allen Apps
 * gehören und den Namen sonst nicht kennen (z. B. Kopfzeile und Dateiname des gespeicherten Protokolls).
 */
let name = '';

/** setzt die Titelleiste beim Rendern */
export const appNameSetzen = (n: string): void => {
  name = n;
};

/** Name der App; ohne Titelleiste „Arkly“ */
export const appName = (): string => name || 'Arkly';
