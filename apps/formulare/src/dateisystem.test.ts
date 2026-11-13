import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PkAenderung } from './dateisystem';
import { tauriDateisystem } from './dateisystem';
import { cp1252Schreiben } from './forma/cp1252';

/** Die Tauri-Hülle im Test: merkt sich die Aufrufe und liefert für `prokarte_read` eine Karte */
const huelle = vi.hoisted(() => ({ aufrufe: [] as { befehl: string; args: Record<string, unknown> }[], karte: null as unknown }));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (befehl: string, args: Record<string, unknown>) => {
    huelle.aufrufe.push({ befehl, args });
    return befehl === 'prokarte_read' ? huelle.karte : undefined;
  },
}));

const utf8 = (s: string) => [...new TextEncoder().encode(s)];

beforeEach(() => {
  huelle.aufrufe = [];
});

describe('Projektkarte über die Tauri-Hülle', () => {
  it('ein in Windows-1252 gespeicherter Text wird gelesen und lässt sich ändern: „alt“ sind die Bytes der Datei', async () => {
    const roh = [...cp1252Schreiben('Müller')];
    huelle.karte = {
      gruppen: [{ id: 201, typ: 1, text: utf8('Bauherr') }],
      inhalte: [
        { gruppe: 201, id: 40, typ: 1, ganzzahl: null, titel: utf8('Name:'), texte: roh },
        { gruppe: 201, id: 30, typ: 1, ganzzahl: null, titel: utf8('Vorname:'), texte: utf8('Jörg') },
      ],
    };
    const karte = (await tauriDateisystem.projektkarteLesen('C:/FORMA', 'BS9/sj_prokarte.sdb'))!;
    const [name, vorname] = karte.eintraege;
    expect(name).toMatchObject({ text: 'Müller', textRoh: roh });
    // gültiges UTF-8 braucht keine Rohbytes
    expect(vorname.text).toBe('Jörg');
    expect(vorname).not.toHaveProperty('textRoh');

    const aenderungen: PkAenderung[] = [
      { gruppe: 201, id: 40, typ: 1, spalte: 'texte', alt: name.text, altRoh: name.textRoh, neu: 'Müller-Lüdenscheidt' },
      { gruppe: 201, id: 30, typ: 1, spalte: 'texte', alt: vorname.text, neu: 'Jürgen' },
      { gruppe: 201, id: 50, typ: 16, spalte: 'ganzzahl', alt: 0, neu: 1 },
    ];
    await tauriDateisystem.projektkarteSchreiben('C:/FORMA', 'BS9/sj_prokarte.sdb', aenderungen);
    const geschrieben = huelle.aufrufe.find((a) => a.befehl === 'prokarte_write')!.args.aenderungen as Record<string, unknown>[];
    expect(geschrieben[0]).toEqual({ gruppe: 201, id: 40, typ: 1, spalte: 'texte', alt: roh, neu: utf8('Müller-Lüdenscheidt') });
    expect(geschrieben[1]).toEqual({ gruppe: 201, id: 30, typ: 1, spalte: 'texte', alt: utf8('Jörg'), neu: utf8('Jürgen') });
    expect(geschrieben[2]).toEqual(aenderungen[2]);
  });

  it('passen die Rohbytes nicht mehr zum Text, wird der Text selbst verglichen (UTF-8)', async () => {
    await tauriDateisystem.projektkarteSchreiben('C:/FORMA', 'BS9/sj_prokarte.sdb', [
      { gruppe: 201, id: 40, typ: 1, spalte: 'texte', alt: 'Schmidt', altRoh: [...cp1252Schreiben('Müller')], neu: 'Meier' },
    ]);
    const [a] = huelle.aufrufe[0].args.aenderungen as Record<string, unknown>[];
    expect(a.alt).toEqual(utf8('Schmidt'));
    expect(a).not.toHaveProperty('altRoh');
  });
});
