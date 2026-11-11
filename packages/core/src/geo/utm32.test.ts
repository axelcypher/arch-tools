import { describe, expect, it } from 'vitest';
import { nachUtm32 } from './utm32';

describe('Umrechnung nach ETRS89 / UTM 32N (EPSG:25832)', () => {
  // Sollwerte: PROJ (pyproj 3.8, EPSG:4258 → EPSG:25832)
  const soll: [number, number, number, number][] = [
    [50.94133, 6.95833, 356562.46, 5645285.413], // Köln, Dom
    [51.96236, 7.62571, 405577.306, 5757743.763], // Münster
    [52.51628, 13.3777, 796986.969, 5827473.629], // Berlin (erweiterte Zone 32)
    [0, 9, 500000, 0],
    [47.3, 6, 273211.253, 5242868.244],
  ];
  it.each(soll)('%f, %f', (lat, lon, ost, nord) => {
    const u = nachUtm32(lat, lon);
    expect(Math.abs(u.ost - ost)).toBeLessThan(0.002);
    expect(Math.abs(u.nord - nord)).toBeLessThan(0.002);
  });
});
