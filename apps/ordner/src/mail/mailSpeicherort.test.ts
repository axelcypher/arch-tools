// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attrappe, BASIS, installieren, legeAn, lies, NAS } from '@core/__fixtures__/konfigAttrappe';

/** eigene Domains (Mails): Ergänzungen eines anderen Rechners bleiben erhalten */

beforeEach(() => {
  vi.resetModules();
  installieren();
  localStorage.clear();
});

describe('ATLAS: eigene Domains im gemeinsamen Konfigurationsordner', () => {
  it('Hinzufügen und Entfernen wirken auf den frisch gelesenen Stand', async () => {
    legeAn(`${BASIS}/konfig.json`, { modus: 'netzwerk', ordner: NAS });
    legeAn(`${NAS}/mails.json`, { eigene: ['buero.de'] });
    const { useMails } = await import('./mailStore');
    await useMails.getState().laden();
    // ein anderer Rechner ergänzt
    legeAn(`${NAS}/mails.json`, { eigene: ['buero.de', 'partner.de'] });
    await useMails.getState().setEigene(['buero.de', 'neu.de']);
    expect(lies(`${NAS}/mails.json`)).toEqual({ eigene: ['buero.de', 'partner.de', 'neu.de'] });
    expect(useMails.getState().eigene).toEqual(['buero.de', 'partner.de', 'neu.de']);
    await useMails.getState().setEigene(['partner.de', 'neu.de']);
    expect(lies(`${NAS}/mails.json`)).toEqual({ eigene: ['partner.de', 'neu.de'] });
  });

  it('nicht gespeichert (Netzlaufwerk weg): Anzeige zurück auf den gültigen Stand, Meldung', async () => {
    legeAn(`${BASIS}/konfig.json`, { modus: 'netzwerk', ordner: NAS });
    legeAn(`${NAS}/mails.json`, { eigene: ['buero.de'] });
    const { useMails } = await import('./mailStore');
    await useMails.getState().laden();
    attrappe.nasErreichbar = false;
    await useMails.getState().setEigene(['buero.de', 'neu.de']);
    expect(useMails.getState().eigene).toEqual(['buero.de']);
    expect(useMails.getState().fehler).toContain('nicht erreichbar');
  });
});
