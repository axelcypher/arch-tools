import { describe, expect, it } from 'vitest';
import { REGELN, suche } from './regelwerk';

describe('Regeln im GRZ-Nachweis (G-29)', () => {
  it('Suche „Terrasse“ im Regelsatz „grz“ liefert § 19 BauNVO und keine WoFlV-Treffer', () => {
    const t = suche('Terrasse', { app: 'grz' }).map((x) => x.regel);
    expect(t.map((r) => r.id)).toContain('baunvo-19');
    expect(t.some((r) => r.bereich === 'wofl')).toBe(false);
    for (const w of ['Carport', 'Zufahrt', 'Stellplatz', 'Garage']) expect(suche(w, { app: 'grz' }).map((x) => x.regel.id)).toContain('baunvo-19');
  });

  it('andere Regelsätze finden weiterhin alle Regeln', () => {
    expect(suche('Terrasse', { app: 'flaechen' }).some((x) => x.regel.bereich === 'wofl')).toBe(true);
  });

  it('§ 19 erklärt die Praxis bei Terrassen nach BauNVO 1990', () => {
    const r = REGELN.find((x) => x.id === 'baunvo-19')!;
    expect(r.text.join(' ')).toMatch(/Terrasse.*GRZ I.*GRZ II/);
  });
});
