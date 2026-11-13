// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BASIS, installieren, legeAn, lies, NAS } from '@core/__fixtures__/konfigAttrappe';

/** PERMIO und der Speicherort der Einstellungen: eigenes Adressbuch geht weder bei einem Wechsel noch zwischen Rechnern verloren */

beforeEach(() => {
  vi.resetModules();
  installieren();
  localStorage.clear();
});

const adresse = (schluessel: string, name: string) => ({ schluessel, texte: { '10': name }, geaendert: 1 });
const namen = (roh: unknown) => ((roh as { adressen?: { texte: Record<string, string> }[] })?.adressen ?? []).map((a) => a.texte['10']).sort();

async function laden() {
  const { useFormulare } = await import('./store');
  const konfig = await import('@core/platform/konfig');
  return { useFormulare, konfig };
}

describe('PERMIO: eigenes Adressbuch im gemeinsamen Konfigurationsordner', () => {
  it('eine Adresse, die ein anderer Rechner inzwischen ergänzt hat, bleibt beim Speichern und Entfernen erhalten', async () => {
    legeAn(`${BASIS}/konfig.json`, { modus: 'netzwerk', ordner: NAS });
    legeAn(`${NAS}/formulare.json`, { adressen: [adresse('e:1', 'Statik Meier')], anderes: 1 });
    const { useFormulare } = await laden();
    await useFormulare.getState().gemeinsamLaden();
    expect(useFormulare.getState().eigeneAdressen.map((a) => a.texte['10'])).toEqual(['Statik Meier']);
    // anderer Rechner
    legeAn(`${NAS}/formulare.json`, { adressen: [adresse('e:1', 'Statik Meier'), adresse('e:2', 'Vermessung Schulz')], anderes: 1 });
    await useFormulare.getState().eigeneAdresseSpeichern(adresse('e:3', 'Brandschutz Kühn'));
    expect(namen(lies(`${NAS}/formulare.json`))).toEqual(['Brandschutz Kühn', 'Statik Meier', 'Vermessung Schulz']);
    expect(lies(`${NAS}/formulare.json`)).toMatchObject({ anderes: 1 });
    expect(useFormulare.getState().eigeneAdressen).toHaveLength(3);
    await useFormulare.getState().eigeneAdresseEntfernen('e:1');
    expect(namen(lies(`${NAS}/formulare.json`))).toEqual(['Brandschutz Kühn', 'Vermessung Schulz']);
  });

  it('nach einem Wechsel mit „übernehmen“ gilt das Adressbuch am Ziel; eine neue Adresse kommt dazu, statt es zu ersetzen', async () => {
    legeAn(`${BASIS}/formulare.json`, { adressen: [adresse('e:1', 'Lokal')] });
    legeAn(`${NAS}/formulare.json`, { adressen: [adresse('e:9', 'Büro')] });
    const { useFormulare, konfig } = await laden();
    await useFormulare.getState().gemeinsamLaden();
    expect(useFormulare.getState().eigeneAdressen.map((a) => a.texte['10'])).toEqual(['Lokal']);
    await konfig.konfigOrtWechseln({ modus: 'netzwerk', ordner: NAS }, 'uebernehmen');
    await vi.waitFor(() => expect(useFormulare.getState().eigeneAdressen.map((a) => a.texte['10'])).toEqual(['Büro']));
    await useFormulare.getState().eigeneAdresseSpeichern(adresse('e:5', 'Neu'));
    expect(namen(lies(`${NAS}/formulare.json`))).toEqual(['Büro', 'Neu']);
  });
});
