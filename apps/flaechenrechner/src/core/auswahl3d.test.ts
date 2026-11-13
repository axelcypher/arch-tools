import { describe, expect, it } from 'vitest';
import { trefferWaehlen } from './auswahl3d';

const t = (shapeId: string, raum = false) => ({ object: { userData: { shapeId, raum } } });

describe('Auswahl in der 3D-Ansicht', () => {
  it('ein getroffener Raum geht vor den Körper, der ihn umschließt', () => {
    expect(trefferWaehlen([t('bgf'), t('raum', true), t('bgf')])?.object.userData.shapeId).toBe('raum');
  });
  it('ohne Raumtreffer der vorderste Körper (Gegenprobe); ohne Treffer nichts', () => {
    expect(trefferWaehlen([t('bgf'), t('bgf2')])?.object.userData.shapeId).toBe('bgf');
    expect(trefferWaehlen([{ object: { userData: {} } }])).toBeUndefined();
    expect(trefferWaehlen([])).toBeUndefined();
  });
  it('Klick auf den schon gewählten Raum wählt den Körper dahinter', () => {
    expect(trefferWaehlen([t('bgf'), t('raum', true)], 'raum')?.object.userData.shapeId).toBe('bgf');
    expect(trefferWaehlen([t('raum', true)], 'raum')?.object.userData.shapeId).toBe('raum'); // ohne Körper bleibt der Raum
  });
});
