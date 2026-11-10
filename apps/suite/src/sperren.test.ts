import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn(async () => undefined);
let desktop = true;
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@core/platform/files', () => ({ isTauri: () => desktop }));

const { sperrenFreigeben } = await import('./sperren');

describe('Sperrdateien der Formulare im Rahmen', () => {
  beforeEach(() => {
    invoke.mockClear();
    desktop = true;
  });

  it('gibt sie frei, wenn Formulare zu ist oder umzieht', async () => {
    await sperrenFreigeben('formulare');
    expect(invoke).toHaveBeenCalledWith('rahmen_formulare_freigeben');
  });

  it('andere Apps und der Browser haben keine', async () => {
    await sperrenFreigeben('flaechenrechner');
    desktop = false;
    await sperrenFreigeben('formulare');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('ein Fehler beim Freigeben bricht nichts ab', async () => {
    invoke.mockRejectedValueOnce(new Error('weg'));
    await expect(sperrenFreigeben('formulare')).resolves.toBeUndefined();
  });
});
