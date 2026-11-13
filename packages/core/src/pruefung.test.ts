import { describe, expect, it } from 'vitest';
import { rectPoints } from './geometry';
import type { Project, RoomShape } from './model';
import { createOutline, createProject, createRoom } from './model';
import { pruefeGeschoss, pruefeProjekt, raumAufUmriss } from './pruefung';

const rect = (x: number, y: number, w: number, h: number) => rectPoints({ x, y }, { x: x + w, y: y + h });

/** EG mit BGF 12 × 10 und zwei Räumen mit 0,3 m Wand dazwischen */
function haus(): Project {
  const p = createProject();
  const eg = p.storeys[0];
  eg.shapes.push(createOutline(rect(0, 0, 12, 10)));
  const a = createRoom(rect(0.3, 0.3, 5.55, 9.4), '0.01', 'Wohnen');
  a.wofl = { kategorie: 'voll', wohnung: 'WE 01' };
  const b = createRoom(rect(6.15, 0.3, 5.55, 9.4), '0.02', 'Küche');
  b.wofl = { kategorie: 'voll', wohnung: 'WE 01' };
  eg.shapes.push(a, b);
  return p;
}
const regeln = (p: Project) => pruefeGeschoss(p.storeys[0], p).map((e) => e.regel);

describe('Prüfliste (F-10)', () => {
  it('sauberes Geschoss: keine Einträge; Lücke 0,3 m (Wand) ist kein Hinweis', () => {
    expect(regeln(haus())).toEqual([]);
  });

  it('Raum ragt über den Umriss bzw. liegt außerhalb', () => {
    const p = haus();
    p.storeys[0].shapes.push(createRoom(rect(11.5, 2, 1, 1), '0.03', 'Flur'));
    const e = pruefeGeschoss(p.storeys[0], p).find((x) => x.regel === 'raum-ausserhalb')!;
    expect(e.text).toMatch(/ragt 0,50 m² über den R-Umriss/);
    p.storeys[0].shapes.push(createRoom(rect(20, 2, 2, 2), '0.04', 'Abstellraum'));
    expect(pruefeGeschoss(p.storeys[0], p).some((x) => /außerhalb aller R-Umrisse/.test(x.text))).toBe(true);
  });

  it('Balkon auf S-Umriss ist kein Fehler; ohne S-Umriss schon', () => {
    const p = haus();
    const balkon = createRoom(rect(12, 2, 2, 4), '0.05', 'Balkon');
    p.storeys[0].shapes.push(balkon);
    expect(regeln(p)).toContain('raum-ausserhalb');
    p.storeys[0].shapes.push({ ...createOutline(rect(12, 2, 2, 4), 'Balkon'), umschliessung: 'S' as const, hoehe: 1.1 });
    expect(regeln(p)).not.toContain('raum-ausserhalb');
    expect(regeln(p)).not.toContain('nrf-groesser-bgf');
  });

  it('versetzte Kopie: Umrisse und Räume überlappen; Abzugsfläche nicht', () => {
    const p = haus();
    const eg = p.storeys[0];
    eg.shapes.push({ ...createRoom(rect(1, 1, 0.5, 0.5), '', 'Schornstein'), subtract: true });
    expect(regeln(p)).toEqual([]);
    eg.shapes.push(createOutline(rect(0.5, 0.5, 12, 10)));
    eg.shapes.push(createRoom(rect(0.8, 0.8, 5.55, 9.4), '0.06', 'Wohnen (Kopie)'));
    const r = regeln(p);
    expect(r).toContain('umrisse-ueberlappen');
    expect(r).toContain('raeume-ueberlappen');
  });

  it('Lücke breiter als eine Wand, doppelte Nummern, Raum ohne Wohnung', () => {
    const p = haus();
    const eg = p.storeys[0];
    eg.shapes.splice(2, 1); // Küche fehlt
    expect(regeln(p)).toContain('luecke');
    const p2 = haus();
    const k = p2.storeys[0].shapes[2];
    if (k.kind === 'room') {
      k.nummer = '0.01';
      k.wofl = { kategorie: 'voll', wohnung: '' };
    }
    expect(regeln(p2)).toEqual(expect.arrayContaining(['nummer-doppelt', 'ohne-wohnung']));
  });

  it('S-Umriss ohne Körperhöhe; „voll“ im Dachgeschoss als Hinweis (FR-08)', () => {
    const p = haus();
    p.storeys[0].shapes.push({ ...createOutline(rect(12, 2, 2, 4), 'Balkon'), umschliessung: 'S' as const });
    expect(regeln(p)).toContain('s-ohne-hoehe');
    p.storeys[0].dachgeschoss = true;
    const e = pruefeGeschoss(p.storeys[0], p).filter((x) => x.regel === 'dachschraege');
    expect(e).toHaveLength(2);
    expect(e[0].art).toBe('hinweis');
  });

  it('„keine Wohnfläche“ im Wohngeschoss nur als Hinweis; Raum auf Umriss beschneiden', () => {
    const p = haus();
    const flur = createRoom(rect(11.5, 2, 1, 1), '0.03', 'Treppenraum');
    p.storeys[0].shapes.push(flur);
    const e = pruefeGeschoss(p.storeys[0], p).find((x) => x.regel === 'keine-wofl')!;
    expect(e.art).toBe('hinweis');
    expect(e.text).toMatch(/^1 Raum zählt nicht zur Wohnfläche: 0\.03 Treppenraum – richtig, wenn es sich um Räume außerhalb der Wohnung/);
    const pts = raumAufUmriss(flur, p.storeys[0])!;
    expect(Math.abs(pts.reduce((s, q, i) => s + q.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * q.y, 0) / 2)).toBeCloseTo(0.5, 6);
  });
});

describe('Prüfliste: Selbstüberschneidung und Abzugsflächen', () => {
  it('selbstüberschneidender Umriss bzw. Raum: Warnung (Fläche wäre falsch)', () => {
    const p = haus();
    const schleife = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 3 },
      { x: 4, y: 3 },
    ];
    p.storeys[0].shapes.push(createOutline(schleife), createRoom(schleife, '0.09', 'Diele'));
    const e = pruefeGeschoss(p.storeys[0], p).filter((x) => x.regel === 'selbstueberschneidung');
    expect(e.map((x) => x.art)).toEqual(['warnung', 'warnung']);
    expect(e[1].text).toMatch(/0\.09 Diele überschneidet sich selbst/);
  });

  it('Abzugsfläche mit eigener, abweichender Anrechnung bzw. außerhalb aller Räume: Hinweis', () => {
    const p = haus();
    const [, a] = p.storeys[0].shapes;
    const abzug: RoomShape = { ...createRoom(rect(1, 1, 1, 1), '', 'Schornstein'), subtract: true, wofl: { kategorie: 'voll', wohnung: 'WE 02' } };
    p.storeys[0].shapes.push(abzug);
    const e = pruefeGeschoss(p.storeys[0], p).find((x) => x.regel === 'abzug-abweichend')!;
    expect(e.shapeIds).toEqual([abzug.id, a.id]);
    // „keine“ = erbt vom Raum: kein Hinweis
    abzug.wofl = { kategorie: 'keine', wohnung: '' };
    expect(regeln(p)).not.toContain('abzug-abweichend');
    // außerhalb aller Räume mit eigener Anrechnung
    p.storeys[0].shapes.push({ ...createRoom(rect(5.9, 1, 0.2, 0.2), '', 'Pfeiler'), subtract: true, wofl: { kategorie: 'voll', wohnung: 'WE 01' } });
    expect(regeln(p)).toContain('abzug-ohne-raum');
  });
});

describe('Prüfliste: Sonderfall S und Flächen außerhalb der BGF (DIN 277:2021-08, 6.1 und 7.1)', () => {
  it('S-Umriss: „überdeckt“ bestätigt die Geschosshöhe als obere Begrenzung – keine Warnung', () => {
    const p = haus();
    const balkon = { ...createOutline(rect(12, 2, 2, 4)), umschliessung: 'S' as const };
    p.storeys[0].shapes.push(balkon);
    expect(regeln(p)).toContain('s-ohne-hoehe');
    balkon.ueberdeckt = true;
    expect(regeln(p)).not.toContain('s-ohne-hoehe');
  });

  it('ebenerdige Terrasse außerhalb der BGF: kein „Raum außerhalb“, nicht in der NRF', () => {
    const p = haus();
    const terrasse: RoomShape = { ...createRoom(rect(0, 10.5, 6, 3), '0.07', 'Terrasse'), ausserhalbBgf: true, wofl: { kategorie: 'freisitz', wohnung: 'WE 01' } };
    p.storeys[0].shapes.push(terrasse);
    expect(regeln(p)).toEqual([]);
    terrasse.ausserhalbBgf = undefined;
    const e = pruefeGeschoss(p.storeys[0], p).find((x) => x.regel === 'raum-ausserhalb')!;
    expect(e.text).toMatch(/außerhalb aller R-Umrisse/);
  });
});

describe('Prüfliste: Wohnfläche zusammengefasst (§ 2 Abs. 3 WoFlV)', () => {
  it('mehrere Räume ohne Wohnfläche im Wohngeschoss: eine Meldung mit allen Räumen, ab sechs gekürzt', () => {
    const p = haus();
    for (let i = 0; i < 7; i++) p.storeys[0].shapes.push(createRoom(rect(11.5, i, 0.5, 0.5), `0.1${i}`, 'Abstellraum'));
    const e = pruefeGeschoss(p.storeys[0], p).filter((x) => x.regel === 'keine-wofl');
    expect(e).toHaveLength(1);
    expect(e[0].shapeIds).toHaveLength(7);
    expect(e[0].text).toMatch(/^7 Räume zählen nicht zur Wohnfläche: 0\.10 Abstellraum, .* und 2 weitere – /);
  });

  it('kein Raum zählt zur Wohnfläche, aber Wohnräume nach Name: Hinweis je Projekt; bei Büros nicht', () => {
    const p = createProject('Haus');
    p.storeys[0].shapes.push(createRoom(rect(0, 0, 4, 4), '0.01', 'Wohnen'));
    expect(pruefeProjekt(p).filter((x) => x.regel === 'keine-wohnflaeche')).toHaveLength(1);
    // Gegenprobe: Büro und „Raum“ mit der Vorgabe NUF 1 (nicht von Hand umgestellt) – kein Hinweis
    const q = createProject('Büro');
    q.storeys[0].shapes.push(createRoom(rect(0, 0, 4, 4), '0.01', 'Büro'), createRoom(rect(5, 0, 4, 4), '0.02', 'Raum'), createRoom(rect(10, 0, 4, 4), '0.03', 'Praxis'));
    expect(pruefeProjekt(q).filter((x) => x.regel === 'keine-wohnflaeche')).toHaveLength(0);
    // Gegenprobe: ein Raum zählt bereits zur Wohnfläche
    p.storeys[0].shapes[0] = { ...(p.storeys[0].shapes[0] as RoomShape), wofl: { kategorie: 'voll', wohnung: 'WE 01' } };
    expect(pruefeProjekt(p).filter((x) => x.regel === 'keine-wohnflaeche')).toHaveLength(0);
  });

  it('genau fünf Räume ohne „und … weitere“', () => {
    const p = haus();
    for (let i = 0; i < 5; i++) p.storeys[0].shapes.push(createRoom(rect(11.5, i, 0.5, 0.5), `0.1${i}`, 'Abstellraum'));
    const e = pruefeGeschoss(p.storeys[0], p).find((x) => x.regel === 'keine-wofl')!;
    expect(e.text).toMatch(/^5 Räume zählen nicht zur Wohnfläche: 0\.10 Abstellraum, 0\.11 Abstellraum, 0\.12 Abstellraum, 0\.13 Abstellraum, 0\.14 Abstellraum – /);
    expect(e.text).not.toContain('weitere');
  });

  it('Projekt-Hinweis: Praxis-, Büro- und Gastronomieräume mit ähnlichem Namen bleiben stumm; Kellergeschoss zählt nicht', () => {
    const q = createProject('Praxis');
    for (const [i, n] of ['Wartezimmer', 'Behandlungszimmer', 'Teeküche', 'Gastraum', 'Besprechungszimmer'].entries()) q.storeys[0].shapes.push(createRoom(rect(i * 5, 0, 4, 4), `0.0${i}`, n));
    expect(pruefeProjekt(q).filter((x) => x.regel === 'keine-wohnflaeche')).toHaveLength(0);
    const k = createProject('Keller');
    k.storeys[0].keller = true;
    k.storeys[0].shapes.push(createRoom(rect(0, 0, 4, 4), '-1.01', 'Wohnen'));
    expect(pruefeProjekt(k).filter((x) => x.regel === 'keine-wohnflaeche')).toHaveLength(0);
    k.storeys[0].keller = false; // Gegenprobe: im Normalgeschoss meldet derselbe Raum
    expect(pruefeProjekt(k).filter((x) => x.regel === 'keine-wohnflaeche')).toHaveLength(1);
  });

  it('Projekt-Hinweis über mehrere Geschosse: ein Eintrag, Zahl der Geschosse im Text, Räume des ersten Geschosses gewählt', () => {
    const p = createProject('Haus');
    const og = { ...createProject('x').storeys[0], id: 'og', name: 'OG' };
    p.storeys[0].shapes.push(createRoom(rect(0, 0, 4, 4), '0.01', 'Wohnen'));
    og.shapes = [createRoom(rect(0, 0, 4, 4), '1.01', 'Schlafen'), createRoom(rect(5, 0, 4, 4), '1.02', 'Kinderzimmer')];
    p.storeys.push(og);
    const e = pruefeProjekt(p).filter((x) => x.regel === 'keine-wohnflaeche');
    expect(e).toHaveLength(1);
    expect(e[0].text).toContain('(Wohnräume in 2 Geschossen)');
    expect(e[0].storeyId).toBe(p.storeys[0].id);
    expect(e[0].shapeIds).toHaveLength(1);
  });
});
