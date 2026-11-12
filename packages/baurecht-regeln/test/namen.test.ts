import { describe, expect, it } from 'vitest';
import { faktDefinitionen } from '@core/baurecht/auswertung';
import { FAKTEN } from '@core/baurecht/fakten';
import { faktName } from '@core/baurecht/typen';
import { paketLaden } from './laden';

describe('kurze Namen der Angaben', () => {
  const paket = paketLaden();
  const defs = { ...FAKTEN, ...faktDefinitionen(paket.module) };
  it('jede Angabe hat einen Namen mit höchstens 40 Zeichen (langer Titel → „kurz“)', () => {
    const zuLang = Object.entries(defs).filter(([id, d]) => faktName(d, id).length > 40).map(([id, d]) => `${id}: ${faktName(d, id)}`);
    expect(zuLang).toEqual([]);
  });
  it('eine Angabe in mehreren Modulen trägt überall denselben kurzen Namen', () => {
    const namen = new Map<string, Set<string>>();
    for (const m of paket.module) for (const [id, d] of Object.entries(m.fakten ?? {})) namen.set(id, new Set([...(namen.get(id) ?? []), faktName({ ...FAKTEN[id], ...d }, id)]));
    expect([...namen].filter(([, n]) => n.size > 1).map(([id, n]) => `${id}: ${[...n].join(' / ')}`)).toEqual([]);
  });
});
