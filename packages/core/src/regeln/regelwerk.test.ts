import { describe, expect, it } from 'vitest';
import { BEREICHE, REGELN, suche } from './regelwerk';

describe('Nachschlagewerk', () => {
  it('jede Regel hat Bereich, Text und mindestens eine Quelle; IDs sind eindeutig', () => {
    const ids = new Set<string>();
    for (const r of REGELN) {
      expect(BEREICHE.some((b) => b.id === r.bereich)).toBe(true);
      expect(r.text.length).toBeGreaterThan(0);
      expect(r.quellen.length).toBeGreaterThan(0);
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      for (const q of r.quellen) if (q.url) expect(q.url).toMatch(/^https:\/\//);
    }
  });

  it('Suche findet über Umlaute, Stichworte und Zitate', () => {
    expect(suche('Flaechenzahl').map((t) => t.regel.id)).toContain('baunvo-19');
    expect(suche('Vollgeschoss 1,60').map((t) => t.regel.id)[0]).toMatch(/^bauo-/);
    expect(suche('Putzabzug')[0].regel.id).toBe('putzabzug');
    expect(suche('Balkon Viertel').map((t) => t.regel.id)).toContain('woflv-4');
    expect(suche('xyzunbekannt')).toHaveLength(0);
  });

  it('Themenfilter für die Hilfe an einer Funktion', () => {
    const r = suche('', { themen: ['sohle'] }).map((t) => t.regel.id);
    expect(r).toContain('verfahren-sohle');
    expect(r).not.toContain('baunvo-19');
  });

  it('jedes Thema, das die Apps als Hilfe anbieten, hat Regeln', () => {
    for (const t of ['bgf', 'bri', 'splitlevel', 'nrf', 'nuf', 'wofl', 'putzabzug', 'sohle', 'dach', 'din277', 'baunvo', 'vollgeschoss', 'lageplan', 'ueberlagerung', 'gelaende', 'grz', 'gfz', 'aufenthaltsraum', 'kosten', 'kennwerte', 'din276']) {
      expect(suche('', { themen: [t] }).length, t).toBeGreaterThan(0);
    }
  });
});
