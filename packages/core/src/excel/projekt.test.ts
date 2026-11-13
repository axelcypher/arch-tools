import { describe, expect, it } from 'vitest';
import { createProject } from '../model';
import { resolveText } from './context';
import { projektWerte } from './projekt';

describe('globale Variablen in Dokumentvorlagen', () => {
  it('{{PROJEKT_KUERZEL}}, {{DATUM}} und Datum mit Format', () => {
    const p = createProject('Test');
    p.meta = { ...p.meta, projektcode: 'BS9', kurzname: 'Kita', vorhaben: 'Neubau', bearbeiter: 'TP' };
    const ctx = { scalars: projektWerte(p, new Date(2026, 10, 3)), collections: {} };
    expect(resolveText('{{PROJEKT_KUERZEL}} {{PROJEKT_KURZNAME}} {{PROJEKT_VORHABEN}} {{BEARBEITER}}', ctx)).toBe('BS9 Kita Neubau TP');
    expect(resolveText('{{DATUM}} {{JAHR}} {{JAHR_KURZ}}', ctx)).toBe('261103 2026 26');
    expect(resolveText('Stand {{DATUM:TT.MM.JJJJ}} / {{JAHR:JJ}}', ctx)).toBe('Stand 03.11.2026 / 26');
    // unpassendes Format und Unbekanntes bleiben sichtbar stehen
    expect(resolveText('{{DATUM:xyz}} {{FOO}}', ctx)).toBe('{{DATUM:xyz}} {{FOO}}');
  });
});
