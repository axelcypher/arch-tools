import { describe, expect, it } from 'vitest';
import { VORGABE_NAMENSSCHEMA, wirksamesNamensschema } from './namensschema';
import { parseProjectData } from './serialize';
import { createProject } from './model';
import { ersetzen, globaleWerte, GLOBALE_VARIABLEN, istGlobalerName, nutztPhase } from './platzhalter';
import { relativerPfad } from './einstellungen/pfade';
import { phaseMarke, phaseQuelle, planphaseText, planphaseVon, planphaseVorschlag, projektPlanphase } from './planphase';

const TAG = new Date(2026, 10, 3);
const GP = { kuerzel: 'GP', name: 'Genehmigungsplanung', lph: 4 };

describe('Planungsphase je Projekt', () => {
  it('Kürzel, Name und LPh aus dem Namensschema; Phasen ohne LPh (AB) und unbekannte Kürzel', () => {
    expect(planphaseVon('gp', VORGABE_NAMENSSCHEMA)).toEqual({ ...GP, bekannt: true });
    const ab = planphaseVon('AB', VORGABE_NAMENSSCHEMA)!;
    expect(ab.lph).toBeUndefined();
    expect(ab.bekannt).toBe(true);
    expect(planphaseVon('XY', VORGABE_NAMENSSCHEMA)).toEqual({ kuerzel: 'XY', name: '', bekannt: false });
    expect(planphaseVon(undefined, VORGABE_NAMENSSCHEMA)).toBeNull();
    expect(planphaseVon('  ', VORGABE_NAMENSSCHEMA)).toBeNull();
    expect(planphaseText(planphaseVon('GP', VORGABE_NAMENSSCHEMA)!)).toBe('GP – Genehmigungsplanung (LPh 4)');
    expect(phaseMarke(planphaseVon('GP', VORGABE_NAMENSSCHEMA)!)).toMatchObject({ text: 'Phase GP', art: 'neutral' });
    expect(phaseMarke(planphaseVon('XY', VORGABE_NAMENSSCHEMA)!).titel).toContain('nicht im Namensschema');
  });

  it('Projekt vor Büro vor Vorgabe', () => {
    const eigen = { ...VORGABE_NAMENSSCHEMA, phasen: [{ kuerzel: 'GP', name: 'Bauantragsplanung', lph: 4 }] };
    const buero = { ...VORGABE_NAMENSSCHEMA, phasen: [{ kuerzel: 'GP', name: 'Genehmigung (Büro)', lph: 4 }] };
    expect(projektPlanphase({ meta: { planphase: 'GP' }, namensschema: eigen }, buero)?.name).toBe('Bauantragsplanung');
    expect(projektPlanphase({ meta: { planphase: 'GP' } }, buero)?.name).toBe('Genehmigung (Büro)');
    expect(projektPlanphase({ meta: { planphase: 'GP' } }, undefined)?.name).toBe('Genehmigungsplanung');
    // alte Projekte ohne Phase laufen weiter
    expect(projektPlanphase({ meta: {} }, buero)).toBeNull();
    expect(projektPlanphase(null)).toBeNull();
  });

  it('Projektdatei: Phase wird gelesen, ungültige entfällt, alte Dateien ohne Phase bleiben ohne', () => {
    const p = createProject('Test');
    const roh = (planphase: unknown) => JSON.parse(JSON.stringify({ ...p, meta: { ...p.meta, planphase } })) as unknown;
    expect(parseProjectData(roh(' gp ')).meta.planphase).toBe('GP');
    expect(parseProjectData(roh('viel zu lang')).meta.planphase).toBeUndefined();
    expect(parseProjectData(roh(4)).meta.planphase).toBeUndefined();
    expect(parseProjectData(JSON.parse(JSON.stringify(p)) as unknown).meta.planphase).toBeUndefined();
  });

  it('Vorschlag nur aus sicheren Angaben – Antrag in Arbeit, sonst die erste beauftragte Leistungsphase', () => {
    const s = VORGABE_NAMENSSCHEMA;
    expect(planphaseVorschlag({ antrag: { name: 'BAUA 2' } }, s)).toEqual({ kuerzel: 'GP', grund: 'Antrag BAUA 2 in Arbeit' });
    expect(planphaseVorschlag({ antrag: { name: 'ABGE' } }, s)?.kuerzel).toBe('AB');
    // eingereicht: der Antrag sagt nichts mehr über die aktuelle Phase
    const eingereicht = { datum: '2026-11-01', manuell: true as const };
    expect(planphaseVorschlag({ antrag: { name: 'BAUA', eingereicht } }, s)?.kuerzel).toBe('AP');
    // Vollauftrag und eingereichter Bauantrag: nie zurück auf LPh 1
    expect(planphaseVorschlag({ antrag: { name: 'BAUA', eingereicht }, leistungsphasen: [1, 2, 3, 4, 5, 6, 7, 8, 9] }, s)?.kuerzel).toBe('AP');
    expect(planphaseVorschlag({ antrag: { name: 'BAUF', eingereicht }, leistungsphasen: [1, 2, 3, 4] }, s)).toBeNull();
    // Bauantrag, aber LPh 4 nicht beauftragt: kein GP, sondern nach den Leistungsphasen
    expect(planphaseVorschlag({ antrag: { name: 'BAUA' }, leistungsphasen: [5, 6, 7, 8] }, s)?.kuerzel).toBe('AP');
    expect(planphaseVorschlag({ leistungsphasen: [1, 2, 3, 4] }, s)).toEqual({ kuerzel: 'BP', grund: 'erste beauftragte Leistungsphase (LPh 1)' });
    expect(planphaseVorschlag({ leistungsphasen: [2] }, s)).toBeNull();
    expect(planphaseVorschlag({}, s)).toBeNull();
    // eigenes Namensschema ohne AB: kein Vorschlag aus ABGE
    expect(planphaseVorschlag({ antrag: { name: 'ABGE' } }, wirksamesNamensschema({ phasen: [GP] }))).toBeNull();
  });
});

describe('Variablen {PHASE}, {PHASE_NAME}, {LPH}', () => {
  it('folgen der Schreibregel und stehen bei den globalen Variablen', () => {
    for (const n of ['PHASE', 'PHASE_NAME', 'LPH']) {
      expect(istGlobalerName(n)).toBe(true);
      expect(GLOBALE_VARIABLEN.find((v) => v.name === n)?.beispiel).toBeTruthy();
    }
  });

  it('werden aus der Phase gesetzt; {LPH:2} mit Stellen', () => {
    const w = globaleWerte({ projektcode: 'BS9', datum: TAG, phase: phaseQuelle(planphaseVon('GP', VORGABE_NAMENSSCHEMA)) });
    expect(ersetzen('{PROJEKT_KUERZEL}_{PHASE}_{Plannummer}', GLOBALE_VARIABLEN, w)).toBe('BS9_GP_{Plannummer}');
    expect(ersetzen('{PHASE_NAME} – LPh {LPH} – {LPH:2}', GLOBALE_VARIABLEN, w)).toBe('Genehmigungsplanung – LPh 4 – 04');
  });

  it('leere Phase: kein „undefined“, keine doppelten Trenner – der Trenner rund um die Variable entfällt', () => {
    const w = globaleWerte({ projektcode: 'BS9', datum: TAG });
    const ohne = (v: string) => ersetzen(v, GLOBALE_VARIABLEN, w);
    expect(ohne('{PROJEKT_KUERZEL}_{PHASE}_GP-04')).toBe('BS9_GP-04');
    expect(ohne('{PROJEKT_KUERZEL} {PHASE} {DATUM}')).toBe('BS9 261103');
    expect(ohne('{PHASE}_{PROJEKT_KUERZEL}')).toBe('BS9');
    expect(ohne('{PROJEKT_KUERZEL}-{PHASE}')).toBe('BS9');
    expect(ohne('{PROJEKT_KUERZEL}_{PHASE}_{LPH}_x')).toBe('BS9_x');
    expect(ohne('Pläne/{PHASE}/Ausgang')).toBe('Pläne/Ausgang');
    // AB hat keine Leistungsphase: nur {LPH} entfällt
    const ab = globaleWerte({ projektcode: 'BS9', datum: TAG, phase: phaseQuelle(planphaseVon('AB', VORGABE_NAMENSSCHEMA)) });
    expect(ersetzen('{PROJEKT_KUERZEL}_{PHASE}_LPh{LPH}', GLOBALE_VARIABLEN, ab)).toBe('BS9_AB_LPh');
    expect(ersetzen('{PROJEKT_KUERZEL}_{PHASE}_{LPH}', GLOBALE_VARIABLEN, ab)).toBe('BS9_AB');
    // die Endung bleibt
    expect(ohne('{PROJEKT_KUERZEL}_{PHASE}.pdf')).toBe('BS9.pdf');
    // Pfadtrenner bleiben immer – keine Ordnerebene geht verloren
    expect(ohne('04 Ausgang/{PROJEKT_KUERZEL} {PHASE}/Pläne')).toBe('04 Ausgang/BS9/Pläne');
    expect(ohne('Ausgang_{PHASE}/Pläne')).toBe('Ausgang/Pläne');
    expect(ohne('Ausgang/{PHASE}_Pläne')).toBe('Ausgang/Pläne');
    expect(ohne('C:\\a {PHASE}\\b')).toBe('C:\\a\\b');
    // ebenso für bestehende Variablen: leerer Kurzname im Ordnernamen
    expect(ohne('{PROJEKT_KUERZEL} {PROJEKT_KURZNAME}/Formulare')).toBe('BS9/Formulare');
  });

  it('Exportpfade: leere Phase lässt keine Ordnerebene wegfallen', () => {
    expect(relativerPfad('Planung/{PROJEKT_KUERZEL} {PHASE}/Berechnungen', { projektcode: 'BS9' })).toBe('Planung/BS9/Berechnungen');
    expect(relativerPfad('Planung/{PHASE}/Berechnungen', { projektcode: 'BS9' })).toBe('Planung/Berechnungen');
    expect(relativerPfad('Planung/{PHASE}/Berechnungen', { projektcode: 'BS9', phase: { kuerzel: 'GP' } })).toBe('Planung/GP/Berechnungen');
  });

  it('nutztPhase erkennt die Variablen der Phase (für den Hinweis „Planungsphase nicht festgelegt“)', () => {
    expect(nutztPhase('{PROJEKT_KUERZEL}_{PHASE}_{Titel}', GLOBALE_VARIABLEN)).toBe(true);
    expect(nutztPhase('LPh {LPH}', GLOBALE_VARIABLEN)).toBe(true);
    expect(nutztPhase('{PROJEKT_KUERZEL}_{Titel}', GLOBALE_VARIABLEN)).toBe(false);
  });
});
