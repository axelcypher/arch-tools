// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import type { OffenesFormular } from './store';
import { KEIN_FORMULAR, useFormulare } from './store';

const datei = vi.hoisted(() => ({ inhalt: '' }));
vi.mock('@core/platform/files', async (original) => ({
  ...(await original<typeof import('@core/platform/files')>()),
  pickFile: async () => new File([datei.inhalt], 'package.json'),
}));

describe('Öffnen einer falschen Datei (B-06, Q-6)', () => {
  it('das geöffnete Formular bleibt offen, Meldung in Alltagssprache', async () => {
    const offen = { projekt: null, pfad: 'Bauantrag.frmsjf', name: 'Bauantrag', sperre: { art: 'ohne' }, aenderungen: {} } as unknown as OffenesFormular;
    useFormulare.setState({ offen, meldung: null });
    datei.inhalt = '{"name": "arch-tools", "private": true}';
    await useFormulare.getState().dateiOeffnen();
    expect(useFormulare.getState().offen).toBe(offen);
    const text = useFormulare.getState().meldung?.text ?? '';
    expect(text).toContain('„package.json“ ließ sich nicht öffnen.');
    expect(text).toContain(KEIN_FORMULAR);
    expect(text).toContain('Das geöffnete Formular bleibt unverändert.');
    expect(text).not.toContain('Byte');
  });
});
