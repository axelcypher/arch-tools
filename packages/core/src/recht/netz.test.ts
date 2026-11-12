import { describe, expect, it } from 'vitest';
import type { Holen } from './netz';
import { holenOk, NetzFehler, tauriFehler } from './netz';

describe('Netz', () => {
  it('Fehler der Tauri-Hülle: nur Verbindungsfehler und Zeitüberschreitungen sind vorübergehend', () => {
    expect(tauriFehler('Nicht erreichbar: https://recht.nrw.de/x (timed out)', 'u')).toBeInstanceOf(NetzFehler);
    expect(tauriFehler('Lesen fehlgeschlagen: https://x (reset)', 'u')).toBeInstanceOf(NetzFehler);
    for (const dauerhaft of ['Host nicht freigegeben: boese.example', 'Antwort zu groß: https://x', 'Umleitung nicht unterstützt: c', 'Zu viele Umleitungen']) {
      const f = tauriFehler(dauerhaft, 'u');
      expect(f).not.toBeInstanceOf(NetzFehler);
      expect(f.message).toBe(dauerhaft);
    }
  });

  it('holenOk wiederholt vorübergehende Fehler, dauerhafte nicht', async () => {
    let n = 0;
    const voruebergehend: Holen = async (url) => {
      n++;
      if (n < 3) throw new NetzFehler('Nicht erreichbar', url);
      return { status: 200, url, daten: new Uint8Array([1]) };
    };
    expect((await holenOk(voruebergehend, 'https://x', { pause: 1 })).status).toBe(200);
    expect(n).toBe(3);
    let m = 0;
    const dauerhaft: Holen = async () => {
      m++;
      throw tauriFehler('Host nicht freigegeben: boese.example', 'https://boese.example');
    };
    await expect(holenOk(dauerhaft, 'https://boese.example', { pause: 1 })).rejects.toThrow(/nicht freigegeben/);
    expect(m).toBe(1);
  });
});
