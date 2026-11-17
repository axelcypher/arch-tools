// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { konfigGeaendertMelden } from '@core/platform/konfig';
import { useFormulare } from './store';

/**
 * Stammordner der Projekte: gemeinsam in allgemein.json (eingestellt auf „Pfade und Benennung“). PERMIO übernimmt seine
 * alten Werte einmal dorthin und folgt danach der gemeinsamen Liste – auch wenn sie zentral geleert wird.
 */

const KONFIG = 'arch-tools:konfig:allgemein';
const allgemein = () => JSON.parse(localStorage.getItem(KONFIG) ?? 'null') as { projekte?: string[] } | null;
const warten = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  localStorage.clear();
  useFormulare.setState({ ablageordner: [], ds: null });
});

describe('Stammordner der Projekte in PERMIO', () => {
  it('alte Werte der App, gemeinsam noch keine: werden einmal übernommen, der Merker ist gesetzt', async () => {
    useFormulare.setState({ ablageordner: ['Z:\\Projekte'] });
    await useFormulare.getState().gemeinsamLaden();
    expect(allgemein()!.projekte).toEqual(['Z:\\Projekte']);
    expect(localStorage.getItem('formulare:stammordnerGeteilt')).toBe('1');
  });

  it('gemeinsam schon vorhanden: gilt, die alten Werte der App werden nicht geschrieben', async () => {
    localStorage.setItem(KONFIG, JSON.stringify({ projekte: ['\\\\server\\Projekte'] }));
    useFormulare.setState({ ablageordner: ['Z:\\Alt'] });
    await useFormulare.getState().gemeinsamLaden();
    expect(useFormulare.getState().ablageordner).toEqual(['\\\\server\\Projekte']);
    expect(allgemein()!.projekte).toEqual(['\\\\server\\Projekte']);
    expect(localStorage.getItem('formulare:stammordnerGeteilt')).toBe('1');
  });

  it('Merker gesetzt, zentral geleert: PERMIO folgt, nichts kehrt zurück', async () => {
    localStorage.setItem('formulare:stammordnerGeteilt', '1');
    localStorage.setItem(KONFIG, JSON.stringify({ projekte: [] }));
    useFormulare.setState({ ablageordner: ['Z:\\Projekte'] });
    await useFormulare.getState().gemeinsamLaden();
    expect(useFormulare.getState().ablageordner).toEqual([]);
    expect(allgemein()!.projekte).toEqual([]);
  });

  it('auf „Pfade und Benennung“ geändert: PERMIO übernimmt die neue Liste sofort, ohne zurückzuschreiben', async () => {
    useFormulare.setState({ ablageordner: ['Z:\\Projekte'] });
    localStorage.setItem(KONFIG, JSON.stringify({ projekte: ['Y:\\Neu', 'Z:\\Projekte'] }));
    konfigGeaendertMelden(['allgemein']);
    await warten();
    expect(useFormulare.getState().ablageordner).toEqual(['Y:\\Neu', 'Z:\\Projekte']);
    expect(allgemein()!.projekte).toEqual(['Y:\\Neu', 'Z:\\Projekte']);
  });
});
