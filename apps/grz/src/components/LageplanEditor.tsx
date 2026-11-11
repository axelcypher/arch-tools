import { zeichenKuerzelErlaubt } from '@core/platform/eingabe';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Hilfslinie } from '@core/fang';
import { achsBeschraenkt, achsRechteck, achsRichtungen, eckpunktHilfslinien, gebaeudeAchse, hilfslinienFang, zeichenHilfslinien } from '@core/fang';
import type { KantenFang } from '@core/kantenFang';
import { kantenFang, polarPunkt } from '@core/kantenFang';
import { fmt2, parseNum } from '@core/format';
import type { Point } from '@core/geometry';
import { bounds, pointInPolygon, polygonArea } from '@core/geometry';
import { LAGEPLAN_NUTZUNGEN, nutzungLabel, versiegelungInfo } from '@core/lageplan';
import type { Nachweis } from '../massNutzung';
import { addFlaeche, auswahlVerschieben, flaechenDuplizieren, flaechenEinfuegen, flaechenKopieren, mapFlaeche, neueFlaeche, NUTZUNG_NAME, removeFlaeche, useGrz } from '../store';
import { beschriftungsPunkt, massstabLaenge } from '../beschriftung';
import { unterlageKalibrieren, unterlageVerschieben } from '@core/kalibrierung';
import { frageText, meldung } from '@core/ui/Rueckfrage';
import { newId } from '@core/model';
import type { RasterBackground } from '@core/model';
import { unterlageLesen } from '../unterlage';
import type { Werkzeug } from '../store';

export interface Ausschnitt {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Fangradius in Bildschirmpixeln */
const FANG_PX = 10;
/** Mindestweg in Pixeln, ab dem ein Ziehen beginnt (sonst Klick) */
const ZIEH_PX = 3;

/**
 * Werkzeuge und Tasten wie im Flächenrechner. kurz: die zwei, drei wichtigsten Kürzel für die Hilfezeile; alle:
 * vollständige Übersicht hinter „?“
 */
const WERKZEUGE: { id: Werkzeug; label: string; taste: string; kurz: string[]; alle: string[]; titel: string }[] = [
  {
    id: 'auswahl',
    label: 'Auswahl',
    taste: 'V',
    titel: 'Flächen auswählen, verschieben und ändern',
    kurz: ['Klicken: auswählen', 'Ziehen: verschieben', 'Entf: löschen'],
    alle: [
      'Klicken: auswählen · Umschalt+Klick oder Umschalt+Rahmen: mehrere · Strg+A: alle',
      'Tab: nächste Fläche · Pfeiltasten: verschieben (1 cm, Umschalt: 10 cm)',
      'Strg+C / Strg+V / Strg+D: kopieren / einfügen / duplizieren',
      'Ziehen: verschieben · Punkt ziehen: ändern (Umschalt: entlang der Gebäudeachse)',
      '◇ ziehen: Punkt einfügen · Rechtsklick auf Punkt: löschen · Entf: Fläche löschen',
    ],
  },
  {
    id: 'polygon',
    label: 'Polygon',
    taste: 'P',
    titel: 'Fläche Punkt für Punkt zeichnen',
    kurz: ['Klicken: Punkt', 'Zahl: Länge eingeben', 'Enter: schließen'],
    alle: ['Klicken: nächster Punkt · Enter, Doppelklick oder Startpunkt: schließen', 'Zahl tippen: Länge und Winkel eingeben', 'Umschalt: entlang der Gebäudeachse · Rück: letzten Punkt löschen · Esc: abbrechen'],
  },
  {
    id: 'rechteck',
    label: 'Rechteck',
    taste: 'R',
    titel: 'Rechteck an der Gebäudeachse zeichnen',
    kurz: ['Klicken: erste Ecke', 'Zahl: Breite × Tiefe', 'Klicken: Gegenecke'],
    alle: ['Erste Ecke setzen, dann Gegenecke klicken – ausgerichtet an der Gebäudeachse', 'Zahl tippen: Breite und Tiefe eingeben'],
  },
  {
    id: 'grenze',
    label: 'Grenze',
    taste: 'G',
    titel: 'Grundstücksgrenze (Flurstück) als Polygon zeichnen',
    kurz: ['Klicken: Punkt', 'Enter: schließen', 'Esc: abbrechen'],
    alle: ['Grundstücksgrenze wie ein Polygon zeichnen; mehrere Flurstücke nacheinander', 'Die Fläche wird mit der eingetragenen Grundstücksfläche abgeglichen'],
  },
];

/** allgemeine Kürzel (Übersicht hinter „?“) */
const ALLGEMEIN = ['Mausrad: zoomen · mittlere Maustaste oder Leertaste + Ziehen: verschieben', 'F: einpassen · Alt: Fang aus', 'Esc: Zeichnen abbrechen bzw. zur Auswahl'];

/** Rasterweite: runde Weite, mindestens etwa 25 px auf dem Bildschirm */
function rasterWeite(k: number): number {
  for (const s of [0.5, 1, 2, 5, 10, 20, 50, 100]) if (s / k >= 25) return s;
  return 200;
}

type Ziehen =
  | { art: 'pan'; sx: number; sy: number; vb: Ausschnitt }
  /** Punkt (bei ◇ bereits eingefügt) oder ganze Fläche; die Punkte werden erst beim Loslassen übernommen */
  | { art: 'punkt'; id: string; index: number; orig: Point[]; eingefuegt: boolean; sx: number; sy: number; started: boolean }
  /** gewählte Flächen gemeinsam verschieben */
  | { art: 'flaeche'; id: string; start: Point; orig: Map<string, Point[]>; sx: number; sy: number; started: boolean }
  | { art: 'rahmen'; start: Point; cur: Point };

/**
 * Lageplan: Gebäude (Hauptanlage), Grundstück und Lageplan-Flächen. Bedienung wie im Flächenrechner:
 * Flächen auswählen und verschieben, Punkte ziehen, über ◇ einfügen und per Rechtsklick löschen,
 * als Polygon oder Rechteck zeichnen; Ecken von Gebäude und Flächen werden gefangen.
 */
export function LageplanEditor({ n }: { n: Nachweis }) {
  const project = useGrz((s) => s.project);
  const selected = useGrz((s) => s.selected);
  const selectedIds = useGrz((s) => s.selectedIds);
  const werkzeug = useGrz((s) => s.werkzeug);
  const nutzungVorlage = useGrz((s) => s.nutzungVorlage);
  const st = useGrz.getState();
  const flaechen = project.lageplan?.flaechen ?? [];
  const svgRef = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [linien, setLinien] = useState<Hilfslinie[]>([]);
  // Kantenfang (Mitte, Lot, Kante) für das Fangsymbol
  const [kfang, setKfang] = useState<KantenFang | null>(null);
  // genaue Eingabe beim Zeichnen: Länge/Winkel bzw. Breite/Tiefe in m
  const [eingabe, setEingabe] = useState<{ a: string; b: string }>({ a: '', b: '' });
  const eingabeA = useRef<HTMLInputElement>(null);
  const [rahmen, setRahmen] = useState<[Point, Point] | null>(null);
  const ziehen = useRef<Ziehen | null>(null);
  // Vorschau beim Ziehen (Punkte der gezogenen Flächen)
  const [vorschau, setVorschau] = useState<Map<string, Point[]> | null>(null);
  const [leertaste, setLeertaste] = useState(false);
  // Anzeige: Beschriftung „Nr · Nutzung · m²“ und Raster (Schalter in der Plan-Leiste)
  const [beschriften, setBeschriften] = useState(true);
  const [raster, setRaster] = useState(false);
  const dateiRef = useRef<HTMLInputElement>(null);
  const unterlage = project.lageplan?.unterlage;
  const grenzen = project.lageplan?.grenze ?? [];

  // Ausschnitt: eingepasst auf Gebäude und Flächen; neu beim Öffnen eines anderen Projekts
  const passend = useMemo<Ausschnitt>(() => {
    const pts: Point[] = [...n.hauptanlagePolygone.flat(), ...flaechen.flatMap((f) => f.points)];
    if (!pts.length) return { x: -20, y: -15, w: 40, h: 30 };
    const b = bounds(pts);
    const pad = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.08 + 1;
    return { x: b.minX - pad, y: b.minY - pad, w: b.maxX - b.minX + 2 * pad, h: b.maxY - b.minY + 2 * pad };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.storeys, n.hauptanlagePolygone.length]);
  const [vb, setVb] = useState<Ausschnitt>(passend);
  useEffect(() => setVb(passend), [passend]);

  useEffect(() => {
    setDraft([]);
    setEingabe({ a: '', b: '' });
  }, [werkzeug]);

  // Mausrad zoomt nur den Plan – die Seite darf dabei nicht scrollen (React-Handler sind passiv)
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = innenflaeche(el);
      const f = Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
      setVb((v) => {
        const p = weltpunkt(v, r, e.clientX, e.clientY);
        const w = Math.min(5000, Math.max(0.5, v.w * f));
        const k = w / v.w;
        return { x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k, w, h: v.h * k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const skala = () => {
    const r = innenflaeche(svgRef.current);
    return Math.max(vb.w / (r?.width || 600), vb.h / (r?.height || 400));
  };
  const toWorld = (e: { clientX: number; clientY: number }): Point => weltpunkt(vb, innenflaeche(svgRef.current), e.clientX, e.clientY);

  const fangpunkte = useMemo(() => [...n.hauptanlagePolygone.flat(), ...n.anlagenPolygone.flat(), ...flaechen.flatMap((f) => f.points)], [n.hauptanlagePolygone, n.anlagenPolygone, flaechen]);
  // Gebäudeachse (genordete Pläne: Gebäude stehen schräg) für Hilfslinien, Umschalt und Rechtecke
  // während des Ziehens fest – sonst drehte sich die Achse mit der gezogenen Kante
  const thetaAktuell = useMemo(() => gebaeudeAchse([...n.hauptanlagePolygone, ...flaechen.map((f) => f.points)]), [n.hauptanlagePolygone, flaechen]);
  const thetaFest = useRef(thetaAktuell);
  if (!ziehen.current) thetaFest.current = thetaAktuell;
  const theta = thetaFest.current;
  /**
   * Fang: nächster Punkt von Gebäude, Flächen und Entwurf im Fangradius, sonst Hilfslinien (Kantenverlängerung,
   * Gebäudeachsen); `ohne` wird übergangen (der gezogene Punkt). Alt schaltet den Fang aus.
   */
  const fang = (p: Point, o: { ohne?: Point; ohneId?: string; von?: Point; hilfslinien?: Hilfslinie[]; alt?: boolean } = {}): Point => {
    setLinien([]);
    setKfang(null);
    if (o.alt) return p;
    let best: Point | null = null;
    let d = FANG_PX * skala();
    for (const q of [...fangpunkte, ...draft]) {
      if (q === o.ohne) continue;
      const dd = Math.hypot(q.x - p.x, q.y - p.y);
      if (dd < d) {
        d = dd;
        best = q;
      }
    }
    if (best) return { ...best };
    // Kanten von Gebäude und Flächen: Mitte, Lot vom letzten Punkt, beliebiger Punkt der Kante
    const kanten = [...n.hauptanlagePolygone, ...n.anlagenPolygone, ...flaechen.filter((f) => f.id !== o.ohneId).map((f) => f.points)];
    const kf = kantenFang(p, kanten, FANG_PX * skala(), o.von);
    if (kf) {
      setKfang(kf);
      return kf.p;
    }
    const h = o.hilfslinien?.length ? hilfslinienFang(p, o.hilfslinien, FANG_PX * skala()) : null;
    if (h) {
      setLinien(h.linien);
      return h.p;
    }
    return p;
  };

  const fertig = (pts: Point[]) => {
    setDraft([]);
    setEingabe({ a: '', b: '' });
    if (pts.length < 3 || polygonArea(pts) < 0.05) return;
    if (werkzeug === 'grenze') {
      st.update((p) => {
        const alt = p.lageplan?.grenze ?? [];
        return { ...p, lageplan: { flaechen: [], ...p.lageplan, grenze: [...alt, { id: newId('gr'), name: `Flurstück ${alt.length + 1}`, points: pts }] } };
      }, undefined);
      return;
    }
    const f = neueFlaeche(useGrz.getState().project, pts, useGrz.getState().nutzungVorlage);
    st.update((p) => addFlaeche(p, f));
    st.select(f.id);
  };

  /**
   * Genaue Eingabe übernehmen. Polygon: Länge (und Winkel gegen die Gebäudeachse; ohne Winkel in Richtung des
   * Mauszeigers) ab dem letzten Punkt. Rechteck: Breite × Tiefe entlang der Gebäudeachse ab der ersten Ecke, in
   * Richtung des Mauszeigers.
   */
  const eingabeUebernehmen = () => {
    const a = parseNum(eingabe.a);
    const b = parseNum(eingabe.b);
    const letzter = draft[draft.length - 1];
    if (!letzter) return;
    const [ax, ay] = achsRichtungen(theta);
    if (werkzeug === 'rechteck') {
      if (a === null || b === null || a <= 0 || b <= 0) return;
      const v = cursor ? { x: cursor.x - letzter.x, y: cursor.y - letzter.y } : { x: 1, y: 1 };
      const su = v.x * ax.x + v.y * ax.y < 0 ? -1 : 1;
      const sw = v.x * ay.x + v.y * ay.y < 0 ? -1 : 1;
      const gegen = { x: letzter.x + ax.x * a * su + ay.x * b * sw, y: letzter.y + ax.y * a * su + ay.y * b * sw };
      fertig(achsRechteck(letzter, gegen, theta));
      return;
    }
    if (a === null || a <= 0) {
      if (eingabe.a.trim() === '' && draft.length >= 3) fertig(draft);
      return;
    }
    let p: Point;
    if (b !== null) p = polarPunkt(letzter, a, b, ax);
    else {
      const v = cursor ? { x: cursor.x - letzter.x, y: cursor.y - letzter.y } : ax;
      const l = Math.hypot(v.x, v.y) || 1;
      p = { x: letzter.x + (v.x / l) * a, y: letzter.y + (v.y / l) * a };
    }
    setDraft([...draft, p]);
    setEingabe({ a: '', b: '' });
  };

  const setzePunkte = (id: string, pts: Point[]) => st.update((p) => mapFlaeche(p, id, (f) => ({ ...f, points: pts })));

  const panStarten = (e: React.PointerEvent) => {
    ziehen.current = { art: 'pan', sx: e.clientX, sy: e.clientY, vb };
    svgRef.current?.setPointerCapture?.(e.pointerId);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || (e.button === 0 && leertaste)) {
      e.preventDefault();
      panStarten(e);
      return;
    }
    if (e.button !== 0 || werkzeug !== 'auswahl') return;
    const p = toWorld(e);
    const hit = [...flaechen].reverse().find((f) => pointInPolygon(p, f.points));
    const zusatz = e.shiftKey || e.ctrlKey || e.metaKey;
    if (hit && zusatz) {
      st.toggleSelect(hit.id);
      return;
    }
    if (!hit && e.shiftKey) {
      // Umschalt + Ziehen im Leeren: Rahmenauswahl
      ziehen.current = { art: 'rahmen', start: p, cur: p };
      setRahmen([p, p]);
      svgRef.current?.setPointerCapture?.(e.pointerId);
      return;
    }
    if (!hit) {
      st.select(null);
      panStarten(e);
      return;
    }
    // Klick in eine gewählte Gruppe verschiebt die ganze Gruppe
    const ids = useGrz.getState().selectedIds.includes(hit.id) ? useGrz.getState().selectedIds : [hit.id];
    if (!useGrz.getState().selectedIds.includes(hit.id)) st.select(hit.id);
    const orig = new Map(flaechen.filter((f) => ids.includes(f.id)).map((f) => [f.id, f.points] as const));
    ziehen.current = { art: 'flaeche', id: hit.id, start: p, orig, sx: e.clientX, sy: e.clientY, started: false };
    svgRef.current?.setPointerCapture?.(e.pointerId);
  };

  const onPunktDown = (e: React.PointerEvent, id: string, pts: Point[], index: number, einfuegen: boolean) => {
    if (e.button !== 0 || leertaste) return;
    e.stopPropagation();
    let orig = pts;
    if (einfuegen) {
      const a = pts[index];
      const b = pts[(index + 1) % pts.length];
      orig = [...pts.slice(0, index + 1), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, ...pts.slice(index + 1)];
      setVorschau(new Map([[id, orig]]));
    }
    ziehen.current = { art: 'punkt', id, index: einfuegen ? index + 1 : index, orig, eingefuegt: einfuegen, sx: e.clientX, sy: e.clientY, started: false };
    svgRef.current?.setPointerCapture?.(e.pointerId);
  };

  const onPunktKontext = (e: React.MouseEvent, id: string, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    const f = flaechen.find((x) => x.id === id);
    if (!f || f.points.length <= 3) return;
    setzePunkte(id, f.points.filter((_, i) => i !== index));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const z = ziehen.current;
    if (z?.art === 'pan') {
      const k = skala();
      setVb({ ...z.vb, x: z.vb.x - (e.clientX - z.sx) * k, y: z.vb.y - (e.clientY - z.sy) * k });
      return;
    }
    if (z?.art === 'rahmen') {
      z.cur = toWorld(e);
      setRahmen([z.start, z.cur]);
      return;
    }
    if (z) {
      if (!z.started) {
        if (Math.hypot(e.clientX - z.sx, e.clientY - z.sy) < ZIEH_PX) return;
        z.started = true;
      }
      if (z.art === 'punkt') {
        const n0 = z.orig.length;
        const roh = toWorld(e);
        const p = e.shiftKey
          ? achsBeschraenkt(z.orig[(z.index - 1 + n0) % n0], roh, theta)
          : fang(roh, { ohne: z.orig[z.index], ohneId: z.id, von: z.orig[(z.index - 1 + n0) % n0], hilfslinien: eckpunktHilfslinien(z.orig, z.index, theta), alt: e.altKey });
        setVorschau(new Map([[z.id, z.orig.map((q, i) => (i === z.index ? p : q))]]));
      } else {
        const roh = toWorld(e);
        const p = e.shiftKey ? achsBeschraenkt(z.start, roh, theta) : roh;
        const dx = p.x - z.start.x;
        const dy = p.y - z.start.y;
        setVorschau(new Map([...z.orig].map(([id, pts]) => [id, pts.map((q) => ({ x: q.x + dx, y: q.y + dy }))] as const)));
      }
      return;
    }
    if (werkzeug !== 'auswahl') {
      const roh = toWorld(e);
      const letzter = draft[draft.length - 1];
      setCursor(e.shiftKey && letzter ? achsBeschraenkt(letzter, roh, theta) : fang(roh, { von: letzter, hilfslinien: zeichenHilfslinien(draft, theta), alt: e.altKey }));
    }
  };

  const onPointerUp = () => {
    const z = ziehen.current;
    ziehen.current = null;
    const v = vorschau;
    setVorschau(null);
    setLinien([]);
    setKfang(null);
    if (z?.art === 'rahmen') {
      const x0 = Math.min(z.start.x, z.cur.x);
      const x1 = Math.max(z.start.x, z.cur.x);
      const y0 = Math.min(z.start.y, z.cur.y);
      const y1 = Math.max(z.start.y, z.cur.y);
      const drin = flaechen.filter((f) => f.points.every((q) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1)).map((f) => f.id);
      const bisher = useGrz.getState().selectedIds;
      st.selectMany([...bisher, ...drin.filter((id) => !bisher.includes(id))]);
      setRahmen(null);
      return;
    }
    // Klick ohne Ziehen auf eine Fläche einer Mehrfachauswahl: nur diese Fläche wählen
    if (z?.art === 'flaeche' && !z.started && z.orig.size > 1) st.select(z.id);
    if (!z || z.art === 'pan' || !v) return;
    // ein Undo-Schritt je Ziehen; ◇ ohne Bewegung fügt den Mittelpunkt ein
    if (z.started || (z.art === 'punkt' && z.eingefuegt)) {
      st.update((p) => {
        let next = p;
        for (const [id, pts] of v) next = mapFlaeche(next, id, (f) => ({ ...f, points: pts }));
        return next;
      });
    }
  };

  const onClick = (e: React.MouseEvent) => {
    if (e.button !== 0 || leertaste || werkzeug === 'auswahl') return;
    const roh = toWorld(e);
    const letzter = draft[draft.length - 1];
    const p = e.shiftKey && letzter ? achsBeschraenkt(letzter, roh, theta) : fang(roh, { von: letzter, hilfslinien: zeichenHilfslinien(draft, theta), alt: e.altKey });
    if (werkzeug === 'rechteck') {
      if (!draft.length) setDraft([p]);
      else fertig(achsRechteck(draft[0], p, theta));
      return;
    }
    if (werkzeug === 'kalibrieren' || werkzeug === 'ausrichten') {
      if (!draft.length) setDraft([p]);
      else void unterlageEinrichten(draft[0], p);
      return;
    }
    // Polygon: Klick auf den ersten Punkt schließt
    if (draft.length >= 3 && Math.hypot(p.x - draft[0].x, p.y - draft[0].y) < FANG_PX * skala()) fertig(draft);
    else setDraft([...draft, p]);
  };

  const onDoubleClick = () => {
    if ((werkzeug === 'polygon' || werkzeug === 'grenze') && draft.length >= 3) fertig(draft);
  };

  const setUnterlage = (u: RasterBackground | undefined) => st.update((p) => ({ ...p, lageplan: { flaechen: [], ...p.lageplan, unterlage: u } }));

  /** Kalibrieren (Strecke a–b, wahre Länge erfragen) bzw. Ausrichten (Punkt a der Unterlage auf b) */
  const unterlageEinrichten = async (a: Point, b: Point) => {
    setDraft([]);
    const u = useGrz.getState().project.lageplan?.unterlage;
    const art = werkzeug;
    st.setWerkzeug('auswahl');
    if (!u || u.type !== 'raster') return;
    if (art === 'ausrichten') {
      setUnterlage(unterlageVerschieben(u, a, b));
      return;
    }
    const gemessen = Math.hypot(b.x - a.x, b.y - a.y);
    const t = await frageText('Unterlage kalibrieren', fmt2(gemessen), 'Kalibrieren', 'Wahre Länge der Strecke zwischen den beiden Punkten in Metern (z. B. eine Grundstücksseite mit Maß):');
    if (t === null) return;
    const l = parseNum(t);
    if (l === null || l <= 0) {
      await meldung('Kalibrieren nicht möglich', 'Bitte eine Länge über 0 in Metern eingeben.');
      return;
    }
    setUnterlage(unterlageKalibrieren(u, a, b, l));
  };

  const unterlageWaehlen = async (datei: File | undefined) => {
    if (!datei) return;
    try {
      setUnterlage(await unterlageLesen(datei, vb));
    } catch (e) {
      await meldung('Unterlage ließ sich nicht lesen', `Die Datei „${datei.name}“ ist kein lesbares Bild (PNG, JPG) bzw. PDF.`, e);
    }
  };

  // Tastatur wie im Flächenrechner
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!zeichenKuerzelErlaubt(e, svgRef.current)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && werkzeug === 'auswahl') {
        e.preventDefault();
        st.selectMany(flaechen.map((f) => f.id));
        return;
      }
      if ((e.ctrlKey || e.metaKey) && werkzeug === 'auswahl' && !e.shiftKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'c' && flaechenKopieren()) e.preventDefault();
        else if (k === 'v' && flaechenEinfuegen()) e.preventDefault();
        else if (k === 'd') {
          e.preventDefault();
          flaechenDuplizieren();
        }
        if (k === 'c' || k === 'v' || k === 'd') return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const sel = useGrz.getState().selectedIds;
      // Zahl beim Zeichnen: in die genaue Eingabe (Länge bzw. Breite) springen
      if ((werkzeug === 'polygon' || werkzeug === 'rechteck' || werkzeug === 'grenze') && draft.length && /^[0-9]$/.test(e.key)) {
        e.preventDefault();
        setEingabe({ a: e.key, b: '' });
        eingabeA.current?.focus();
        return;
      }
      // Tab / Umschalt+Tab: nächste bzw. vorige Fläche (nur, wenn der Lageplan den Fokus hat)
      if (e.key === 'Tab' && werkzeug === 'auswahl' && !draft.length && flaechen.length && document.activeElement === svgRef.current) {
        const i = flaechen.findIndex((f) => f.id === useGrz.getState().selected);
        const n = i < 0 ? (e.shiftKey ? flaechen.length - 1 : 0) : i + (e.shiftKey ? -1 : 1);
        // am Ende der Liste geht Tab normal weiter – der Lageplan hält den Fokus nicht fest
        if (n < 0 || n >= flaechen.length) return;
        e.preventDefault();
        st.select(flaechen[n].id);
        return;
      }
      // Pfeiltasten: Auswahl um 1 cm, mit Umschalt um 10 cm verschieben (Bildschirmrichtung)
      if (werkzeug === 'auswahl' && !draft.length && e.key.startsWith('Arrow') && sel.length) {
        e.preventDefault();
        const schritt = e.shiftKey ? 0.1 : 0.01;
        const r = { ArrowLeft: [-schritt, 0], ArrowRight: [schritt, 0], ArrowUp: [0, -schritt], ArrowDown: [0, schritt] }[e.key as 'ArrowLeft'];
        if (r) auswahlVerschieben(r[0], r[1]);
        return;
      }
      switch (e.key) {
        case ' ':
          setLeertaste(true);
          e.preventDefault();
          break;
        case 'Escape':
          if (draft.length) setDraft([]);
          else if (werkzeug !== 'auswahl') st.setWerkzeug('auswahl');
          else st.select(null);
          break;
        case 'Enter':
          if ((werkzeug === 'polygon' || werkzeug === 'grenze') && draft.length >= 3) fertig(draft);
          break;
        case 'Backspace':
          if (draft.length) setDraft(draft.slice(0, -1));
          else if (sel.length) st.update((p) => removeFlaeche(p, sel));
          e.preventDefault();
          break;
        case 'Delete':
          if (sel.length) st.update((p) => removeFlaeche(p, sel));
          break;
        case 'f':
        case 'F':
          setVb(passend);
          break;
        default: {
          const w = WERKZEUGE.find((x) => x.taste === e.key.toUpperCase());
          if (w) st.setWerkzeug(w.id);
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') setLeertaste(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  });

  const k = skala();
  const d = (pts: Point[], zu = true) => `M${pts.map((p) => `${p.x} ${p.y}`).join('L')}${zu ? 'Z' : ''}`;
  const punkteVon = (id: string, pts: Point[]) => vorschau?.get(id) ?? pts;
  const entwurf =
    werkzeug === 'kalibrieren' || werkzeug === 'ausrichten' ? [] : draft.length && cursor ? (werkzeug === 'rechteck' ? achsRechteck(draft[0], cursor, theta) : [...draft, cursor]) : draft;
  // Beschriftung: Nummern wie im Druck (eigene Flächen in Listenfolge)
  const beschriftungen = beschriften
    ? n.lageplan
        .filter((l) => !l.nachbar)
        .map((l, i) => ({ l, nr: i + 1 }))
        .filter(({ l }) => l.flaecheEindeutig > 0.005)
        .map(({ l, nr }) => {
          const f = flaechen.find((x) => x.id === l.id);
          const umriss = f?.points ?? l.polygone?.[0] ?? [];
          return { id: l.id, p: beschriftungsPunkt(l.eindeutig, umriss), text: `${nr} · ${nutzungLabel(l.nutzung)} · ${fmt2(l.flaecheEindeutig)} m²` };
        })
    : [];
  const rw = rasterWeite(k);
  const ml = massstabLaenge(vb.w);
  const werkzeugInfo = WERKZEUGE.find((w) => w.id === werkzeug);
  const zeichnet = werkzeug === 'polygon' || werkzeug === 'rechteck' || werkzeug === 'grenze';
  // Eckpunkte nur bei genau einer gewählten Fläche
  const sel = werkzeug === 'auswahl' && selectedIds.length <= 1 ? flaechen.find((f) => f.id === selected) : undefined;
  const selPts = sel ? punkteVon(sel.id, sel.points) : [];
  const cursorStil = ziehen.current?.art === 'pan' || leertaste ? 'grabbing' : werkzeug === 'auswahl' ? 'default' : 'crosshair';
  // laufende Anzeige beim Zeichnen: Länge des aktuellen Segments bzw. Breite × Tiefe und Gesamtfläche
  const masstext = (() => {
    if (!draft.length || !cursor) return '';
    if (werkzeug === 'rechteck') {
      const r = achsRechteck(draft[0], cursor, theta);
      const b = Math.hypot(r[1].x - r[0].x, r[1].y - r[0].y);
      const t = Math.hypot(r[3].x - r[0].x, r[3].y - r[0].y);
      return `${fmt2(b)} × ${fmt2(t)} m · Fläche ${fmt2(b * t)} m²`;
    }
    const l = draft[draft.length - 1];
    return `Segment ${fmt2(Math.hypot(cursor.x - l.x, cursor.y - l.y))} m${entwurf.length >= 3 ? ` · Fläche ${fmt2(polygonArea(entwurf))} m²` : ''}`;
  })();

  return (
    <div className="lp-editor">
      <div className="lp-tools">
        {WERKZEUGE.map((w) => (
          <button key={w.id} className={werkzeug === w.id ? 'small active' : 'small'} title={`${w.titel} (${w.taste})`} onClick={() => st.setWerkzeug(w.id)}>
            {w.label}
          </button>
        ))}
        <button className="small" title="Ansicht auf Gebäude und Flächen einpassen (F)" onClick={() => setVb(passend)}>
          Einpassen
        </button>
        <label className="toggle small-text" title="Nummer, Nutzung und Fläche im Plan">
          <input type="checkbox" checked={beschriften} onChange={(e) => setBeschriften(e.target.checked)} />
          Beschriftung
        </label>
        <label className="toggle small-text">
          <input type="checkbox" checked={raster} onChange={(e) => setRaster(e.target.checked)} />
          Raster
        </label>
        <details className="lp-tasten">
          <summary title="Tastenübersicht">?</summary>
          <div className="lp-tasten-liste">
            {WERKZEUGE.map((w) => (
              <div key={w.id}>
                <strong>
                  {w.label} ({w.taste})
                </strong>
                <ul>
                  {w.alle.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            ))}
            <div>
              <strong>Allgemein</strong>
              <ul>
                {ALLGEMEIN.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          </div>
        </details>
        <span className="muted small-text lp-hint">
          {werkzeug === 'kalibrieren'
            ? 'Zwei Punkte einer bekannten Strecke auf der Unterlage klicken'
            : werkzeug === 'ausrichten'
              ? 'Punkt auf der Unterlage, dann den Zielpunkt im Plan klicken'
              : werkzeugInfo!.kurz.join(' · ')}
        </span>
      </div>
      <div className="lp-tools lp-unterlage">
        <span className="muted small-text">Unterlage:</span>
        <input ref={dateiRef} type="file" accept="image/png,image/jpeg,application/pdf,.pdf" hidden onChange={(e) => void unterlageWaehlen(e.target.files?.[0])} />
        <button className="small" title="Amtlicher Lageplan als Bild (PNG, JPG) oder PDF zum Nachzeichnen" onClick={() => dateiRef.current?.click()}>
          {unterlage ? 'Ersetzen …' : 'Bild/PDF …'}
        </button>
        {unterlage && (
          <>
            <button className={werkzeug === 'kalibrieren' ? 'small active' : 'small'} title="Maßstab an einer bekannten Strecke festlegen" onClick={() => st.setWerkzeug('kalibrieren')}>
              Kalibrieren
            </button>
            <button className={werkzeug === 'ausrichten' ? 'small active' : 'small'} title="Unterlage verschieben: Punkt auf der Unterlage → Punkt im Plan" onClick={() => st.setWerkzeug('ausrichten')}>
              Ausrichten
            </button>
            <label className="toggle small-text">
              <input type="checkbox" checked={unterlage.visible} onChange={(e) => setUnterlage({ ...(unterlage as RasterBackground), visible: e.target.checked })} />
              anzeigen
            </label>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={unterlage.opacity}
              title="Deckkraft"
              aria-label="Deckkraft der Unterlage"
              onChange={(e) => setUnterlage({ ...(unterlage as RasterBackground), opacity: Number(e.target.value) })}
            />
            <button className="small" onClick={() => setUnterlage(undefined)}>
              Entfernen
            </button>
          </>
        )}
        {grenzen.length > 0 && (
          <button className="small" title="Gezeichnete Grundstücksgrenze entfernen" onClick={() => st.update((p) => ({ ...p, lageplan: { flaechen: [], ...p.lageplan, grenze: undefined } }))}>
            Grenze löschen
          </button>
        )}
      </div>
      <div className="lp-tools lp-nutzungen" role="group" aria-label="Nutzung neuer Flächen">
        <span className="muted small-text">Neue Fläche:</span>
        {LAGEPLAN_NUTZUNGEN.map((x) => (
          <button
            key={x.id}
            className={nutzungVorlage === x.id ? 'small active' : 'small'}
            title={`Neue Flächen als „${x.label}“ zeichnen (Versiegelung passend vorbelegt)`}
            onClick={() => {
              st.setNutzungVorlage(x.id);
              if (werkzeug === 'auswahl') st.setWerkzeug('rechteck');
            }}
          >
            {x.id === 'sonstige' ? 'sonstige' : NUTZUNG_NAME[x.id]}
          </button>
        ))}
      </div>
      {zeichnet && draft.length > 0 && (
        <div className="lp-tools lp-eingabe">
          <label className="small-text">
            {werkzeug === 'rechteck' ? 'Breite [m]' : 'Länge [m]'}{' '}
            <input
              ref={eingabeA}
              className="lp-eingabe-feld"
              inputMode="decimal"
              value={eingabe.a}
              onChange={(e) => setEingabe({ ...eingabe, a: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  eingabeUebernehmen();
                } else if (e.key === 'Escape') {
                  e.stopPropagation();
                  setEingabe({ a: '', b: '' });
                  svgRef.current?.focus();
                }
              }}
            />
          </label>
          <label className="small-text">
            {werkzeug === 'rechteck' ? 'Tiefe [m]' : 'Winkel [°]'}{' '}
            <input
              className="lp-eingabe-feld"
              inputMode="decimal"
              value={eingabe.b}
              placeholder={werkzeug === 'rechteck' ? '' : 'Maus'}
              title={werkzeug === 'rechteck' ? undefined : 'gegen die Gebäudeachse, gegen den Uhrzeigersinn; leer: in Richtung des Mauszeigers'}
              onChange={(e) => setEingabe({ ...eingabe, b: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  eingabeUebernehmen();
                }
              }}
            />
          </label>
          <span className="small-text lp-mass">{masstext}</span>
        </div>
      )}
      <svg
        ref={svgRef}
        className={`grz-skizze lp-${werkzeug}`}
        style={{ cursor: cursorStil }}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onPointerDown={onPointerDown}
        // fokussierbar: Tab wählt dann die nächste Fläche; sonst bleibt Tab die normale Bedienung der Oberfläche
        tabIndex={0}
        aria-label="Lageplan"
        onPointerDownCapture={() => svgRef.current?.focus({ preventScroll: true })}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setCursor(null)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern id="grz-hatch" width={k * 8} height={k * 8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2={k * 8} stroke="#2a5bd7" strokeWidth={k * 2} strokeOpacity={0.5} />
          </pattern>
        </defs>
        {unterlage?.visible && unterlage.type === 'raster' && (
          <image
            className="lp-unterlage-bild"
            href={unterlage.dataUrl}
            x={unterlage.x}
            y={unterlage.y}
            width={unterlage.widthPx * unterlage.metersPerPixel}
            height={unterlage.heightPx * unterlage.metersPerPixel}
            opacity={unterlage.opacity}
            preserveAspectRatio="none"
            pointerEvents="none"
          />
        )}
        {raster && (
          <g className="lp-raster" pointerEvents="none" stroke="#c9cdd4" strokeWidth={k * 0.6}>
            {Array.from({ length: Math.min(400, Math.ceil(vb.w / rw) + 2) }, (_, i) => {
              const x = (Math.floor(vb.x / rw) + i) * rw;
              return <line key={`x${i}`} x1={x} y1={vb.y - vb.h} x2={x} y2={vb.y + 2 * vb.h} />;
            })}
            {Array.from({ length: Math.min(400, Math.ceil(vb.h / rw) + 2) }, (_, i) => {
              const y = (Math.floor(vb.y / rw) + i) * rw;
              return <line key={`y${i}`} x1={vb.x - vb.w} y1={y} x2={vb.x + 2 * vb.w} y2={y} />;
            })}
          </g>
        )}
        {flaechen.map((f) => (
          <path
            key={f.id}
            d={d(punkteVon(f.id, f.points))}
            fill={versiegelungInfo(f.versiegelung).color}
            fillOpacity={f.nachbar ? 0.15 : 0.55}
            stroke={selectedIds.includes(f.id) ? 'var(--sel)' : f.nachbar ? '#9aa0a6' : '#5b6068'}
            strokeWidth={k * (selectedIds.includes(f.id) ? 3 : 1)}
            strokeDasharray={f.nachbar ? `${k * 4} ${k * 3}` : undefined}
          >
            <title>{`${f.name} · ${nutzungLabel(f.nutzung)} · ${versiegelungInfo(f.versiegelung).label}${f.nachbar ? ' · Nachbar' : ''}`}</title>
          </path>
        ))}
        {n.hauptanlagePolygone.map((pts, i) => (
          <path key={`h${i}`} d={d(pts)} fill="url(#grz-hatch)" stroke="#1d3f96" strokeWidth={k * 2} fillRule="evenodd" pointerEvents="none" />
        ))}
        {n.anlagenPolygone.map((pts, i) => (
          <path key={`a${i}`} d={d(pts)} fill="#8a8f99" fillOpacity={0.45} stroke="#1d3f96" strokeWidth={k * 1.5} pointerEvents="none">
            <title>Gebäudeteil als Garage/Nebenanlage</title>
          </path>
        ))}
        {n.grundstueckPolygone.map((pts, i) => (
          <path key={`g${i}`} d={d(pts)} fill="none" stroke="#1f2328" strokeWidth={k * 2.5} strokeDasharray={`${k * 10} ${k * 3} ${k * 2} ${k * 3}`} pointerEvents="none" />
        ))}
        {beschriftungen.map((b) => (
          <text key={`b${b.id}`} x={b.p.x} y={b.p.y} fontSize={k * 11} className="lp-beschriftung" textAnchor="middle" dominantBaseline="middle" pointerEvents="none">
            {b.text}
          </text>
        ))}
        <g className="lp-massstab" pointerEvents="none" data-laenge={ml}>
          <rect x={vb.x + k * 12} y={vb.y + vb.h - k * 16} width={ml / 2} height={k * 5} fill="#1f2328" />
          <rect x={vb.x + k * 12 + ml / 2} y={vb.y + vb.h - k * 16} width={ml / 2} height={k * 5} fill="#fff" stroke="#1f2328" strokeWidth={k} />
          <text x={vb.x + k * 12 + ml} y={vb.y + vb.h - k * 20} fontSize={k * 10} className="lp-beschriftung" textAnchor="middle">
            {ml.toLocaleString('de-DE')} m
          </text>
        </g>
        <g className="lp-nordpfeil" pointerEvents="none" transform={`translate(${vb.x + vb.w - k * 20} ${vb.y + k * 10})`}>
          <path d={`M0 0 L${k * 6} ${k * 18} L0 ${k * 14} L${-k * 6} ${k * 18} Z`} fill="#1f2328" />
          <text x={0} y={k * 30} fontSize={k * 10} className="lp-beschriftung" textAnchor="middle">
            N
          </text>
        </g>
        {sel && (
          <g>
            {selPts.map((p, i) => {
              const q = selPts[(i + 1) % selPts.length];
              const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
              return (
                <rect
                  key={`m${i}`}
                  className="mid-handle"
                  x={m.x - k * 4}
                  y={m.y - k * 4}
                  width={k * 8}
                  height={k * 8}
                  transform={`rotate(45 ${m.x} ${m.y})`}
                  onPointerDown={(e) => onPunktDown(e, sel.id, selPts, i, true)}
                />
              );
            })}
            {selPts.map((p, i) => (
              <circle
                key={`v${i}`}
                className="vertex-handle"
                cx={p.x}
                cy={p.y}
                r={k * 5}
                onPointerDown={(e) => onPunktDown(e, sel.id, selPts, i, false)}
                onContextMenu={(e) => onPunktKontext(e, sel.id, i)}
              />
            ))}
          </g>
        )}
        {(entwurf.length > 0 || draft.length > 0) && (
          <g pointerEvents="none">
            <path d={d(entwurf, werkzeug === 'rechteck' || entwurf.length > 2)} fill="var(--sel)" fillOpacity={0.12} stroke="var(--sel)" strokeWidth={k * 1.5} />
            {draft.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={k * (i === 0 ? 5 : 3.5)} fill="var(--panel)" stroke="var(--sel)" strokeWidth={k * 1.5} />
            ))}
          </g>
        )}
        {cursor && werkzeug !== 'auswahl' && <circle cx={cursor.x} cy={cursor.y} r={k * 3} fill="var(--sel)" pointerEvents="none" />}
        {kfang && <FangSymbol f={kfang} k={k} />}
        {cursor && werkzeug !== 'auswahl' && masstext && (
          <text x={cursor.x + k * 10} y={cursor.y - k * 10} fontSize={k * 11} className="lp-masstext" pointerEvents="none">
            {masstext}
          </text>
        )}
        {linien.map((l, i) => {
          const L = Math.max(vb.w, vb.h) * 2;
          const o = l.p;
          return (
            <line
              key={`hl${i}`}
              x1={o.x - l.d.x * L}
              y1={o.y - l.d.y * L}
              x2={o.x + l.d.x * L}
              y2={o.y + l.d.y * L}
              className={`guide-line guide-${l.art}`}
              style={{ strokeWidth: k, strokeDasharray: `${k * 6} ${k * 4}` }}
              pointerEvents="none"
            />
          );
        })}
        {rahmen && (
          <rect
            className="select-box"
            x={Math.min(rahmen[0].x, rahmen[1].x)}
            y={Math.min(rahmen[0].y, rahmen[1].y)}
            width={Math.abs(rahmen[1].x - rahmen[0].x)}
            height={Math.abs(rahmen[1].y - rahmen[0].y)}
            style={{ strokeWidth: k, strokeDasharray: `${k * 4} ${k * 3}` }}
            pointerEvents="none"
          />
        )}
      </svg>
      <p className="muted small-text lp-legende">
        Strichpunktiert: {n.grenzeGezeichnet ? 'Grundstücksgrenze' : 'Umriss der erfassten Flächen (keine Grundstücksgrenze gezeichnet – Werkzeug „Grenze“)'}
      </p>
    </div>
  );
}

/** Symbol des Kantenfangs: Dreieck = Kantenmitte, ⊥ = Lot, × = Punkt auf der Kante */
function FangSymbol({ f, k }: { f: KantenFang; k: number }) {
  const { p } = f;
  const r = k * 6;
  const titel = f.art === 'mitte' ? 'Kantenmitte' : f.art === 'lot' ? 'Lot' : 'auf der Kante';
  return (
    <g className={`fang-symbol fang-${f.art}`} pointerEvents="none" stroke="var(--sel)" strokeWidth={k * 1.5} fill="none">
      <title>{titel}</title>
      {f.art === 'mitte' && <path d={`M${p.x} ${p.y - r}L${p.x + r} ${p.y + r * 0.7}L${p.x - r} ${p.y + r * 0.7}Z`} />}
      {f.art === 'lot' && <path d={`M${p.x - r} ${p.y + r}L${p.x + r} ${p.y + r}M${p.x} ${p.y + r}L${p.x} ${p.y - r}`} />}
      {f.art === 'kante' && <path d={`M${p.x - r} ${p.y - r}L${p.x + r} ${p.y + r}M${p.x - r} ${p.y + r}L${p.x + r} ${p.y - r}`} />}
    </g>
  );
}

/** Rechteck in Bildschirmkoordinaten */
export interface Rechteck {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Innenfläche des Plans in Bildschirmkoordinaten: ohne Rahmen und Innenabstand – die viewBox bezieht sich auf sie,
 * nicht auf getBoundingClientRect() (sonst sitzen Punkte um die Rahmenbreite versetzt)
 */
export function innenflaeche(el: Element | null | undefined): Rechteck | undefined {
  if (!el) return undefined;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const px = (v: string) => parseFloat(v) || 0;
  const l = px(cs.borderLeftWidth) + px(cs.paddingLeft);
  const t = px(cs.borderTopWidth) + px(cs.paddingTop);
  const rr = px(cs.borderRightWidth) + px(cs.paddingRight);
  const b = px(cs.borderBottomWidth) + px(cs.paddingBottom);
  return { left: r.left + l, top: r.top + t, width: Math.max(0, r.width - l - rr), height: Math.max(0, r.height - t - b) };
}

/** Bildschirm → Plan (viewBox mit xMidYMid meet: Ausschnitt mittig, gleicher Maßstab in x und y); r: Innenfläche */
export function weltpunkt(vb: Ausschnitt, r: Rechteck | undefined, clientX: number, clientY: number): Point {
  const wPx = r?.width || 600;
  const hPx = r?.height || 400;
  const s = Math.max(vb.w / wPx, vb.h / hPx);
  const x0 = vb.x - (wPx * s - vb.w) / 2;
  const y0 = vb.y - (hPx * s - vb.h) / 2;
  return { x: x0 + (clientX - (r?.left ?? 0)) * s, y: y0 + (clientY - (r?.top ?? 0)) * s };
}
