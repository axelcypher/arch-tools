import { describe, expect, it } from 'vitest';
import { computeProject } from '@core/calc';
import { rectPoints } from '@core/geometry';
import { createOutline, createProject, createRoom } from '@core/model';
import { berichtEinstellung, berichtPlan, planungsunterlagen, statistik } from './bericht';

const rect = (x: number, y: number, w: number, h: number) => rectPoints({ x, y }, { x: x + w, y: y + h });

function haus(mitWofl = true) {
  const p = createProject('Haus');
  const eg = p.storeys[0];
  eg.shapes.push(createOutline(rect(0, 0, 12, 10)));
  const a = createRoom(rect(0.3, 0.3, 5, 4), '0.01', 'Wohnen');
  const b = createRoom(rect(6, 0.3, 2, 2), '0.02', 'Bad');
  b.nutzung = 'NUF7';
  const c = createRoom(rect(0.3, 5, 4, 4), '0.03', 'Kind');
  const d = createRoom(rect(6, 5, 2, 2), '0.04', 'Abstellraum/Keller (außerhalb)');
  d.nutzung = 'NUF7';
  if (mitWofl) {
    a.wofl = { kategorie: 'voll', wohnung: 'WE 01' };
    b.wofl = { kategorie: 'voll', wohnung: 'WE 01' };
    c.wofl = { kategorie: 'voll', wohnung: 'WE 02' };
  }
  eg.shapes.push(a, b, c, d);
  return p;
}

describe('Bericht für die Bauvorlage (F-17)', () => {
  it('Vorlage „Bauantrag NRW“ enthält BRI-Rechenweg und DIN 277 (R/S), auch wenn abgewählt', () => {
    const p = haus();
    const plan = berichtPlan({ vorlage: 'bauantrag', abschnitte: ['wofl'] }, computeProject(p));
    expect(plan.abschnitte).toEqual(['din277', 'bri', 'wofl']);
    expect(plan.gesperrt).toEqual(['din277', 'bri']);
    // frei: wirklich abwählbar
    expect(berichtPlan({ vorlage: 'frei', abschnitte: ['wofl'] }, computeProject(p)).abschnitte).toEqual(['wofl']);
  });

  it('leerer WoFlV-Abschnitt entfällt; fehlender BRI erzeugt eine Warnung statt zu verschwinden', () => {
    const ohne = haus(false);
    expect(berichtPlan(berichtEinstellung(undefined), computeProject(ohne)).abschnitte).not.toContain('wofl');
    const nurRaeume = createProject();
    nurRaeume.storeys[0].shapes.push(createRoom(rect(0, 0, 3, 3), '0.01', 'Wohnen'));
    const plan = berichtPlan({ vorlage: 'bauantrag', abschnitte: [] }, computeProject(nurRaeume));
    expect(plan.abschnitte).toContain('bri');
    expect(plan.warnungen.join(' ')).toMatch(/Kein Brutto-Rauminhalt/);
  });

  it('S-Spalten nur, wenn es einen Sonderfall gibt (FR-09)', () => {
    const p = haus();
    expect(berichtPlan(berichtEinstellung(undefined), computeProject(p)).sSpalten).toBe(false);
    p.storeys[0].shapes.push({ ...createOutline(rect(12, 0, 2, 4), 'Balkon'), umschliessung: 'S' as const, hoehe: 1.1 });
    expect(berichtPlan(berichtEinstellung(undefined), computeProject(p)).sSpalten).toBe(true);
  });

  it('Messverfahren und Planungsunterlagen fehlen: Warnung (DIN 277:2021-08, 5.1); Pläne gelten als Unterlagen', () => {
    const p = haus();
    const plan = berichtPlan(berichtEinstellung(undefined), computeProject(p), p);
    expect(plan.bildschirm.map((w) => w.split(' (')[0])).toEqual(['Messverfahren nicht angegeben', 'Planungsunterlagen nicht angegeben']);
    expect(plan.warnungen).toEqual([]); // Bedienhinweis, kein fachlicher Mangel – im Druck steht „nicht angegeben“ im Kopf
    p.settings.massgrundlage = 'rohbau';
    p.storeys[0].background = { type: 'raster', name: 'EG_1-100.pdf', dataUrl: 'data:,', widthPx: 10, heightPx: 10, x: 0, y: 0, metersPerPixel: 0.01, opacity: 1, visible: true };
    expect(planungsunterlagen(p)).toBe('EG: EG_1-100.pdf');
    expect(berichtPlan(berichtEinstellung(undefined), computeProject(p), p).bildschirm).toEqual([]);
    p.settings.planunterlagen = 'Grundrisse 1:100, Stand 01.10.2026';
    expect(planungsunterlagen(p)).toBe('Grundrisse 1:100, Stand 01.10.2026');
  });

  it('selbstüberschneidende Fläche erscheint als Warnung statt still mit falscher Fläche', () => {
    const p = haus();
    p.settings.massgrundlage = 'rohbau';
    p.settings.planunterlagen = 'Grundrisse 1:100';
    expect(berichtPlan(berichtEinstellung(undefined), computeProject(p), p).warnungen).toEqual([]);
    p.storeys[0].shapes.push(
      createRoom(
        [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 0, y: 3 },
          { x: 4, y: 3 },
        ],
        '0.09',
        'Diele',
      ),
    );
    expect(berichtPlan(berichtEinstellung(undefined), computeProject(p), p).warnungen).toEqual(['Selbstüberschneidende Flächen – ihre Fläche ist so nicht korrekt, Eckpunkte prüfen: EG: 0.09 Diele.']);
  });

  it('unbekannte Einstellung fällt auf die Vorgabe zurück', () => {
    expect(berichtEinstellung({ vorlage: 'x', abschnitte: ['bri', 'quatsch'] })).toEqual({ vorlage: 'vollstaendig', abschnitte: ['bri'] });
  });
});

describe('Hochbaustatistik (FR-20)', () => {
  it('zwei Wohnungen: Wohnfläche und Räume je Wohnung, sonstige Nutzfläche', () => {
    const s = statistik(computeProject(haus()));
    expect(s.wohnungen.map((w) => ({ ...w, wohnflaeche: Math.round(w.wohnflaeche * 100) / 100 }))).toEqual([
      { wohnung: 'WE 01', wohnflaeche: 24, raeume: 1 }, // Wohnen 20 m² (Bad ist NUF 7)
      { wohnung: 'WE 02', wohnflaeche: 16, raeume: 1 },
    ]);
    expect(s.sonstigeNutzflaeche).toBeCloseTo(4); // Abstellraum außerhalb
    expect(s.wohnflaeche).toBeCloseTo(40);
  });

  it('Küchen zählen unabhängig von der Größe, Bad und Freisitz nicht', () => {
    const p = haus();
    const kueche = createRoom(rect(9, 0.3, 2, 2), '0.05', 'Küche'); // 4 m² < 6 m²
    kueche.wofl = { kategorie: 'voll', wohnung: 'WE 01' };
    const balkon = createRoom(rect(9, 5, 3, 3), '0.06', 'Balkon');
    balkon.wofl = { kategorie: 'freisitz', wohnung: 'WE 01' };
    p.storeys[0].shapes.push(kueche, balkon);
    expect(statistik(computeProject(p)).wohnungen[0].raeume).toBe(2); // Wohnen + Küche
  });
});
