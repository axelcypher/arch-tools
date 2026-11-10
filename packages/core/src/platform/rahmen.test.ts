// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { anRahmenMelden, rahmenApp, rahmenModus } from './rahmen';

afterEach(() => window.history.replaceState(null, '', '/'));

describe('Rahmen-App: Modus der App', () => {
  it('eigenständig, herausgelöstes Fenster; Tab nur in einem Rahmen', () => {
    expect(rahmenModus()).toBeNull();
    window.history.replaceState(null, '', '/?rahmen=fenster&app=formulare');
    expect(rahmenModus()).toBe('fenster');
    expect(rahmenApp()).toBe('formulare');
    // ohne umgebenden Rahmen ist „tab“ in der Adresse kein Tab
    window.history.replaceState(null, '', '/?rahmen=tab&app=formulare');
    expect(rahmenModus()).toBeNull();
    const melden = vi.spyOn(window.parent, 'postMessage');
    anRahmenMelden('Formulare', 'BS5', true);
    expect(melden).not.toHaveBeenCalled();
  });
});
