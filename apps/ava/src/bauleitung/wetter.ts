/**
 * Wetter für das Bautagebuch von Open-Meteo (frei, ohne Schlüssel): Tagesmittel aus Höchst- und Tiefstwert,
 * Niederschlag und Wetterlage am Ort des Vorhabens. Gesendet werden nur die Koordinaten des Vorhabens (aus den
 * Stammdaten) und das Datum – erst auf Knopfdruck.
 */

const LAGE: [number, string][] = [
  [0, 'sonnig'],
  [1, 'überwiegend sonnig'],
  [2, 'teilweise bewölkt'],
  [3, 'bedeckt'],
  [45, 'Nebel'],
  [48, 'Nebel mit Reif'],
  [51, 'leichter Nieselregen'],
  [53, 'Nieselregen'],
  [55, 'starker Nieselregen'],
  [56, 'gefrierender Nieselregen'],
  [61, 'leichter Regen'],
  [63, 'Regen'],
  [65, 'starker Regen'],
  [66, 'gefrierender Regen'],
  [71, 'leichter Schneefall'],
  [73, 'Schneefall'],
  [75, 'starker Schneefall'],
  [77, 'Schneegriesel'],
  [80, 'Regenschauer'],
  [81, 'kräftige Regenschauer'],
  [82, 'heftige Regenschauer'],
  [85, 'Schneeschauer'],
  [86, 'kräftige Schneeschauer'],
  [95, 'Gewitter'],
  [96, 'Gewitter mit Hagel'],
  [99, 'schweres Gewitter mit Hagel'],
];

export const wetterlage = (code: number) => LAGE.find(([c]) => c === code)?.[1] ?? 'wechselhaft';

export interface Wetter {
  lage: string;
  temperatur: string;
}

export async function wetterAbrufen(lat: number, lon: number, datum: string, abruf: typeof fetch = fetch): Promise<Wetter> {
  const heute = new Date().toISOString().slice(0, 10);
  const alt = (Date.parse(heute) - Date.parse(datum)) / 86400000 > 60;
  const basis = alt ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast';
  const p = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum',
    timezone: 'Europe/Berlin',
    start_date: datum,
    end_date: datum,
  });
  const r = await abruf(`${basis}?${p}`);
  if (!r.ok) throw new Error(`Wetterdienst: ${r.status}`);
  const j = (await r.json()) as { daily?: { weather_code?: number[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_sum?: number[] } };
  const d = j.daily;
  if (!d?.temperature_2m_max?.length) throw new Error('Keine Wetterdaten für diesen Tag.');
  const max = d.temperature_2m_max[0];
  const min = d.temperature_2m_min?.[0];
  const regen = d.precipitation_sum?.[0];
  const lage = wetterlage(d.weather_code?.[0] ?? -1);
  return {
    lage: `${lage}${regen ? `, ${regen.toLocaleString('de-DE', { maximumFractionDigits: 1 })} mm Niederschlag` : ''}`,
    temperatur: `${min !== undefined ? `${Math.round(min)} bis ` : ''}${Math.round(max)} °C`,
  };
}
