import { zeichenKuerzelErlaubt } from '@core/platform/eingabe';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Point } from '@core/geometry';
import {
  bounds,
  distance,
  labelPoint,
  pointInPolygon,
  polygonArea,
  projectOnSegment,
  roundTo,
  snapToGrid,
  translate,
} from '@core/geometry';
import { fmt2, parseNum } from '@core/format';
import { NumberField } from '@core/ui/fields';
import { Modal } from '@core/ui/Dialog';
import type { MenuePunkt } from '@core/ui/Menue';
import { zeigeMenue } from '@core/ui/Menue';
import type { Hilfslinie } from '@core/fang';
import { achsBeschraenkt, achsRechteck, achsRichtungen, eckpunktHilfslinien, gebaeudeAchse, hilfslinienFang, zeichenHilfslinien } from '@core/fang';
import type { OutlineShape, Shape, Storey } from '@core/model';
import { createOutline, createRoom, shapeArea } from '@core/model';
import { nutzungInfo, raumNutzung } from '@core/norms';
import { planFuellungDunkel } from '@core/planFarbe';
import { useZeichenflaecheGefiltert } from '@core/platform/theme';
import { bgScale, bgWorldBounds, ohneKontrollmass, scaleAround, vectorSegmentGrid } from '../core/background';
import { detectOutline, detectRegion } from '@core/detect';
import { SegmentGrid } from '@core/spatial';
import { loadImage, rasterEdgeRefiner, rasterMaskProvider } from '../platform/rasterMask';
import { einfuegenAktion } from './KopieDialog';
import { neuerRaumVorgabe } from '../core/katalog';
import { kontrollAbweichung, laengeAusText } from '../core/background';
import { messText, messung } from '../core/messung';
import { sVorschlagen } from '../core/umriss';
import { hoehenZonen } from '@core/hoehenlinien';
import { clippedPieces } from '@core/roof';
import {
  auswahlVerschieben,
  entwurfZuruecknehmenAnmelden,
  ablageStatus,
  flaechenDuplizieren,
  flaechenKopieren,
  flaechenLoeschen,
  mapShape,
  mapStorey,
  nextRoomNumber,
  rueckgaengig,
  setShapePoints,
  useActiveStorey,
  useEditor,
} from '../store/store';
import { escZiel, kantenpunktAufRaster, relativerPunkt, textBreite } from '../core/zeichnen';
import { planLaden } from './BackgroundPanel';
import { BackgroundLayer } from './BackgroundLayer';
import { logger } from '@core/platform/log';

const log = logger('erkennen');

interface Viewport {
  /** Pixel pro Meter */
  scale: number;
  tx: number;
  ty: number;
}

type SnapKind = 'vertex' | 'edge' | 'guide' | 'grid' | 'ortho' | 'none';

interface SnapResult {
  p: Point;
  kind: SnapKind;
  /** aktive Hilfslinien (Anzeige) */
  linien?: Hilfslinie[];
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; tx: number; ty: number }
  | { kind: 'vertex'; shapeId: string; index: number; orig: Point[]; started: boolean; sx: number; sy: number }
  | { kind: 'move'; start: Point; orig: Map<string, Point[]>; stempel?: Map<string, Point>; started: boolean; sx: number; sy: number; shapeId: string }
  | { kind: 'box'; start: Point; cur: Point; add: boolean }
  | { kind: 'stempel'; shapeId: string; started: boolean; sx: number; sy: number };

const VERTEX_SNAP_PX = 10;
const HINWEIS_KEY = 'arch-flaechen-tool:hinweise-zu';
/** Deckung der Raumfüllung (Nutzungsfarbe) auf der Zeichenfläche */
const RAUM_DECKUNG = 0.45; // dieselbe Zahl steht in docs/design.md (QUADRIO)
const EDGE_SNAP_PX = 7;
const GUIDE_SNAP_PX = 8;
/** Mausweg in px, ab dem ein Klick als Ziehen gilt: Flächen verschieben erst ab 6 px (kein Verrutschen beim Wählen) */
const ZIEH_SCHWELLE_FLAECHE = 6;
const ZIEH_SCHWELLE_PUNKT = 4;

type Meldung = { text: string; art: 'ok' | 'info' | 'warnung' };


export function Canvas() {
  const storey = useActiveStorey();
  const project = useEditor((s) => s.project);
  const tool = useEditor((s) => s.tool);
  const drawKind = useEditor((s) => s.drawKind);
  const view = useEditor((s) => s.view);
  const selectedId = useEditor((s) => s.selectedShapeId);
  const selectedIds = useEditor((s) => s.selectedIds);
  const fitRequest = useEditor((s) => s.fitRequest);
  const { update, updateSilent, checkpoint, select, setTool } = useEditor.getState();

  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [vp, setVp] = useState<Viewport>({ scale: 40, tx: 60, ty: 60 });
  const [cursor, setCursor] = useState<SnapResult | null>(null);
  const [box, setBox] = useState<[Point, Point] | null>(null);
  const [draft, setDraft] = useState<Point[]>([]);
  const [numBuf, setNumBuf] = useState('');
  // Messung (F-19): Kette, ggf. geschlossen; bleibt beim Werkzeugwechsel stehen, bis Esc oder eine neue Messung
  const [mess, setMess] = useState<{ punkte: Point[]; fertig: boolean; geschlossen: boolean } | null>(null);
  const [calib, setCalib] = useState<[Point, Point] | null>(null);
  const [kontrolle, setKontrolle] = useState<[Point, Point] | null>(null);
  // Bedienhinweise unten: einmal eingeklappt, bleiben sie eingeklappt (F-24)
  const [hinweisZu, setHinweisZu] = useState(() => {
    try {
      return localStorage.getItem(HINWEIS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const hinweisUmschalten = (zu: boolean) => {
    setHinweisZu(zu);
    try {
      if (zu) localStorage.setItem(HINWEIS_KEY, '1');
      else localStorage.removeItem(HINWEIS_KEY);
    } catch {
      // ohne Speicher gilt es nur bis zum Schließen
    }
  };
  const [spaceDown, setSpaceDown] = useState(false);
  const [kuerzelOffen, setKuerzelOffen] = useState(false);
  /** Rückmeldung während des Ziehens (Statuszeile): Versatz bzw. Punktverschiebung */
  const [ziehInfo, setZiehInfo] = useState<string | null>(null);
  const drag = useRef<Drag | null>(null);
  const lastClick = useRef<{ t: number; x: number; y: number }>({ t: 0, x: 0, y: 0 });

  const gridStep = project.settings.gridStep;
  const storeyIndex = project.storeys.findIndex((s) => s.id === storey.id);
  const ghost: Storey | null = view.showGhost && storeyIndex > 0 ? project.storeys[storeyIndex - 1] : null;
  // Bearbeitungsgriffe nur bei genau einer gewählten Fläche
  const selected = selectedIds.length <= 1 ? (storey.shapes.find((s) => s.id === selectedId) ?? null) : null;
  // Gebäudeachse (genordete Pläne: Gebäude stehen schräg) – für Hilfslinien, Umschalt und Rechtecke
  // Während des Ziehens bleibt sie fest – sonst drehte sich die Achse mit der gezogenen Kante unter dem Cursor.
  const thetaAktuell = useMemo(() => gebaeudeAchse([...storey.shapes, ...(ghost?.shapes ?? [])].map((s) => s.points)), [storey.shapes, ghost]);
  const thetaFest = useRef(thetaAktuell);
  if (!drag.current) thetaFest.current = thetaAktuell;
  const theta = thetaFest.current;

  const toScreen = useCallback((p: Point) => ({ x: p.x * vp.scale + vp.tx, y: p.y * vp.scale + vp.ty }), [vp]);
  const toWorld = useCallback((sx: number, sy: number) => ({ x: (sx - vp.tx) / vp.scale, y: (sy - vp.ty) / vp.scale }), [vp]);

  /* ---------- Größe & Zoom ---------- */

  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    const pts: Point[] = storey.shapes.flatMap((s) => s.points);
    const bg = storey.background;
    if (bg && bg.visible) {
      const b = bgWorldBounds(bg);
      pts.push({ x: b.minX, y: b.minY }, { x: b.maxX, y: b.maxY });
    }
    const el = svgRef.current;
    const w = el?.clientWidth || size.w;
    const h = el?.clientHeight || size.h;
    if (!pts.length) {
      setVp({ scale: 40, tx: 60, ty: 60 });
      return;
    }
    const b = bounds(pts);
    const bw = Math.max(b.maxX - b.minX, 1);
    const bh = Math.max(b.maxY - b.minY, 1);
    const scale = Math.min((w - 80) / bw, (h - 80) / bh);
    setVp({ scale, tx: w / 2 - ((b.minX + b.maxX) / 2) * scale, ty: h / 2 - ((b.minY + b.maxY) / 2) * scale });
  }, [storey, size]);

  // Zoom auf alles bei Projektwechsel / Anforderung
  const fitRef = useRef(fit);
  fitRef.current = fit;
  useEffect(() => {
    requestAnimationFrame(() => fitRef.current());
  }, [fitRequest]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      setVp((v) => {
        const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
        const scale = Math.min(5000, Math.max(1, v.scale * factor));
        const wx = (sx - v.tx) / v.scale;
        const wy = (sy - v.ty) / v.scale;
        return { scale, tx: sx - wx * scale, ty: sy - wy * scale };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Zeichnungsentwurf verwerfen, wenn Werkzeug oder Geschoss wechselt
  useEffect(() => {
    setDraft([]);
    setNumBuf('');
    if (tool !== 'measure') setMess((m) => (m && !m.fertig ? (m.punkte.length >= 2 ? { ...m, fertig: true } : null) : m));
    setCalib(null);
  }, [tool, storey.id]);

  /* ---------- Fang ---------- */

  const snapCandidates = useMemo(() => {
    const shapes: Shape[] = [];
    if (view.showOutlines) shapes.push(...storey.shapes.filter((s) => s.kind === 'outline'));
    if (view.showRooms) shapes.push(...storey.shapes.filter((s) => s.kind === 'room'));
    if (ghost) shapes.push(...ghost.shapes);
    return shapes;
  }, [storey, ghost, view.showOutlines, view.showRooms]);

  const bgVisible = !!storey.background?.visible && view.showBackground;
  const vectorGrid = useMemo(
    () => (bgVisible && storey.background?.type === 'vector' ? vectorSegmentGrid(storey.background) : null),
    [bgVisible, storey.background],
  );

  const snap = useCallback(
    (raw: Point, mods: { alt: boolean; shift: boolean; ohneRaster?: boolean }, origin: Point | null, exclude?: { shapeId: string; index: number }, guides: Hilfslinie[] = []): SnapResult => {
      if (mods.alt) return { p: raw, kind: 'none' as SnapKind };
      // beim Kalibrieren kein Rasterfang: das Raster folgt noch dem vorläufigen Maßstab
      const raster = view.snapGrid && !mods.ohneRaster ? gridStep : 0;
      if (origin && mods.shift) {
        // rechtwinklig zur Gebäudeachse (bei waagerecht/senkrecht stehenden Gebäuden wie bisher)
        return { p: achsBeschraenkt(origin, raw, theta, raster), kind: 'ortho' as SnapKind };
      }
      const hilfs = view.snapGuides && guides.length ? hilfslinienFang(raw, guides, GUIDE_SNAP_PX / vp.scale, raster) : null;
      if (view.snapVertices) {
        const vTol = VERTEX_SNAP_PX / vp.scale;
        let best: Point | null = null;
        let bestD = vTol;
        const consider = (q: Point) => {
          const d = distance(q, raw);
          if (d < bestD) {
            bestD = d;
            best = q;
          }
        };
        for (const s of snapCandidates) {
          s.points.forEach((q, i) => {
            if (exclude && exclude.shapeId === s.id && exclude.index === i) return;
            consider(q);
          });
        }
        draft.forEach(consider);
        const near = vectorGrid ? vectorGrid.query(raw.x - vTol, raw.y - vTol, raw.x + vTol, raw.y + vTol) : [];
        for (const i of near) {
          const [x1, y1, x2, y2] = vectorGrid!.seg(i);
          consider({ x: x1, y: y1 });
          consider({ x: x2, y: y2 });
        }
        if (best) return { p: { ...(best as Point) }, kind: 'vertex' as SnapKind };
        // Schnittpunkt zweier Hilfslinien hat Vorrang vor Kanten
        if (hilfs && hilfs.linien.length > 1) return { p: hilfs.p, kind: 'guide', linien: hilfs.linien };

        const eTol = EDGE_SNAP_PX / vp.scale;
        let bestE: Point | null = null;
        let bestSeg: [Point, Point] | null = null;
        let bestED = eTol;
        for (const s of snapCandidates) {
          const n = s.points.length;
          for (let i = 0; i < n; i++) {
            if (exclude && exclude.shapeId === s.id && (exclude.index === i || exclude.index === (i + 1) % n)) continue;
            const pr = projectOnSegment(raw, s.points[i], s.points[(i + 1) % n]);
            if (pr.dist < bestED) {
              bestED = pr.dist;
              bestE = pr.point;
              bestSeg = [s.points[i], s.points[(i + 1) % n]];
            }
          }
        }
        const eNear = vectorGrid ? vectorGrid.query(raw.x - eTol, raw.y - eTol, raw.x + eTol, raw.y + eTol) : [];
        for (const i of eNear) {
          const [x1, y1, x2, y2] = vectorGrid!.seg(i);
          const pr = projectOnSegment(raw, { x: x1, y: y1 }, { x: x2, y: y2 });
          if (pr.dist < bestED) {
            bestED = pr.dist;
            bestE = pr.point;
            bestSeg = [
              { x: x1, y: y1 },
              { x: x2, y: y2 },
            ];
          }
        }
        if (bestE) {
          const e = bestE as Point;
          // Kante und Hilfslinie zugleich: auf deren Schnittpunkt
          if (hilfs) {
            const l = hilfs.linien[0];
            const s = kanteSchnitt(e, raw, l, snapCandidates, vectorGrid, eTol);
            if (s) return { p: s, kind: 'guide', linien: hilfs.linien };
          }
          // mit Rasterfang: entlang der Kante auf das Raster (sonst landen Punkte zwischen den Rasterschritten)
          const q = raster && bestSeg ? kantenpunktAufRaster(e, bestSeg[0], bestSeg[1], raster) : e;
          return { p: { x: roundTo(q.x, 1e-4), y: roundTo(q.y, 1e-4) }, kind: 'edge' as SnapKind };
        }
      }
      if (hilfs) return { p: hilfs.p, kind: 'guide', linien: hilfs.linien };
      if (raster) return { p: snapToGrid(raw, raster), kind: 'grid' as SnapKind };
      return { p: raw, kind: 'none' as SnapKind };
    },
    [view.snapGrid, view.snapVertices, view.snapGuides, gridStep, vp.scale, snapCandidates, draft, vectorGrid, theta],
  );

  /* ---------- Formen anlegen ---------- */

  const finishShape = useCallback(
    (pts: Point[], extra?: { bemerkung?: string; pruefen?: boolean }) => {
      const clean = pts.filter((p, i) => i === 0 || distance(p, pts[i - 1]) > 1e-6);
      if (clean.length > 3 && distance(clean[0], clean[clean.length - 1]) < 1e-6) clean.pop();
      setDraft([]);
      setNumBuf('');
      if (clean.length < 3 || polygonArea(clean) < 1e-6) return;
      const st = storey;
      const shape =
        drawKind === 'outline'
          ? { ...createOutline(clean, st.shapes.some((s) => s.kind === 'outline') ? 'BGF-Teilfläche' : 'BGF'), ...extra }
          : { ...createRoom(clean, nextRoomNumber(project, st)), ...neuerRaumVorgabe(project, st) };
      update((p) => mapStorey(p, st.id, (s) => ({ ...s, shapes: [...s.shapes, shape] })));
      select(shape.id);
      // kleiner Umriss außen am Gebäude: Balkon/Loggia → Umschließung S vorschlagen (F-15)
      if (shape.kind === 'outline' && sVorschlagen(clean, st)) melde('Kleiner Umriss außen am Gebäude – Balkon oder Loggia? Dann rechts die Raumumschließung „S – Sonderfall“ wählen.');
    },
    [storey, drawKind, project, update, select],
  );

  const applyNumeric = useCallback(() => {
    const buf = numBuf.trim();
    if (!buf) return false;
    const last = draft[draft.length - 1];
    if (!last) return false;
    const cur = cursor?.p ?? { x: last.x + 1, y: last.y };
    if (tool === 'polygon') {
      const rel = buf.split(';');
      if (rel.length === 2) {
        const dx = parseNum(rel[0]);
        const dy = parseNum(rel[1]);
        if (dx === null || dy === null) return false;
        setDraft([...draft, relativerPunkt(last, dx, dy)]);
      } else {
        const len = parseNum(buf);
        if (len === null) return false;
        let dx = cur.x - last.x;
        let dy = cur.y - last.y;
        const d = Math.hypot(dx, dy);
        if (d < 1e-9) {
          dx = 1;
          dy = 0;
        } else {
          dx /= d;
          dy /= d;
        }
        setDraft([...draft, { x: roundTo(last.x + dx * len, 1e-4), y: roundTo(last.y + dy * len, 1e-4) }]);
      }
      setNumBuf('');
      return true;
    }
    if (tool === 'rect') {
      const parts = buf.split(/[x;*]/i);
      if (parts.length !== 2) return false;
      const w = parseNum(parts[0]);
      const h = parseNum(parts[1]);
      if (w === null || h === null) return false;
      // Breite entlang der Gebäudeachse, Tiefe rechtwinklig dazu – Richtung wie die Maus
      const [ax, ay] = achsRichtungen(theta);
      const v = { x: cur.x - last.x, y: cur.y - last.y };
      const sx = v.x * ax.x + v.y * ax.y < 0 ? -1 : 1;
      const sy = v.x * ay.x + v.y * ay.y < 0 ? -1 : 1;
      finishShape(achsRechteck(last, { x: last.x + sx * w * ax.x + sy * h * ay.x, y: last.y + sx * w * ax.y + sy * h * ay.y }, theta));
      return true;
    }
    return false;
  }, [numBuf, draft, cursor, tool, finishShape, theta]);

  /* ---------- Tastatur ---------- */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Esc hat schon ein Menü bzw. Dialog geschlossen (gemeinsamer Esc-Stapel) – nicht zusätzlich die Auswahl aufheben
      if (e.key === 'Escape' && e.defaultPrevented) return;
      if (!zeichenKuerzelErlaubt(e, svgRef.current)) return;
      const st = useEditor.getState();
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        // zuerst den Entwurf (letzter Punkt), erst dann die letzte fertige Fläche
        rueckgaengig();
        return;
      }
      if (ctrl && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        st.redo();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'a' && tool === 'select') {
        // alle sichtbaren Flächen des Geschosses
        e.preventDefault();
        const v = st.view;
        st.selectMany(storey.shapes.filter((s) => (s.kind === 'outline' ? v.showOutlines : v.showRooms)).map((s) => s.id));
        return;
      }
      // Strg+C kopiert die Messung (F-19)
      if (ctrl && e.key.toLowerCase() === 'c' && tool === 'measure' && mess && mess.punkte.length >= 2) {
        e.preventDefault();
        void navigator.clipboard?.writeText(messText(messung(mess.punkte, mess.geschlossen))).catch(() => undefined);
        melde('Messung in die Zwischenablage kopiert.', 'ok');
        return;
      }
      if (ctrl && tool === 'select' && !e.shiftKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'c' && flaechenKopieren()) e.preventDefault();
        else if (k === 'v' && einfuegenAktion()) e.preventDefault();
        else if (k === 'd') {
          e.preventDefault();
          flaechenDuplizieren();
        }
        if (k === 'c' || k === 'v' || k === 'd') return;
      }
      if (ctrl) return;
      if (e.key === '?') {
        e.preventDefault();
        setKuerzelOffen(true);
        return;
      }
      // Tab / Umschalt+Tab: nächste bzw. vorige Fläche wählen (nur, wenn die Zeichenfläche den Fokus hat)
      if (e.key === 'Tab' && tool === 'select' && !draft.length && document.activeElement === svgRef.current) {
        const v = st.view;
        const liste = storey.shapes.filter((s) => (s.kind === 'outline' ? v.showOutlines : v.showRooms));
        const i = liste.findIndex((s) => s.id === st.selectedShapeId);
        const n = i < 0 ? (e.shiftKey ? liste.length - 1 : 0) : i + (e.shiftKey ? -1 : 1);
        // am Ende der Liste geht Tab normal weiter – die Zeichenfläche hält den Fokus nicht fest
        if (n < 0 || n >= liste.length) return;
        e.preventDefault();
        st.select(liste[n].id);
        return;
      }
      // Pfeiltasten: Auswahl um 1 cm, mit Umschalt um 10 cm verschieben (Bildschirmrichtung: y nach unten)
      if (tool === 'select' && !draft.length && e.key.startsWith('Arrow') && (st.selectedIds.length || st.selectedShapeId)) {
        e.preventDefault();
        const schritt = e.shiftKey ? 0.1 : 0.01;
        const [dx, dy] = { ArrowLeft: [-schritt, 0], ArrowRight: [schritt, 0], ArrowUp: [0, -schritt], ArrowDown: [0, schritt] }[e.key as 'ArrowLeft'] ?? [0, 0];
        auswahlVerschieben(dx, dy);
        return;
      }
      if (e.key === ' ') {
        setSpaceDown(true);
        e.preventDefault();
        return;
      }
      const drawing = draft.length > 0 && (tool === 'polygon' || tool === 'rect');
      if (drawing && /^[0-9.,;xX*-]$/.test(e.key)) {
        setNumBuf((b) => b + e.key);
        e.preventDefault();
        return;
      }
      switch (e.key) {
        case 'Escape':
          switch (escZiel({ eingabe: !!numBuf, entwurf: draft.length > 0, kalibrierung: !!calib, messung: !!mess, werkzeug: tool !== 'select' })) {
            case 'eingabe':
              setNumBuf('');
              break;
            case 'entwurf':
              setDraft([]);
              break;
            case 'kalibrierung':
              setCalib(null);
              break;
            case 'messung':
              setMess(null);
              break;
            case 'werkzeug':
              setTool('select');
              break;
            case 'auswahl':
              st.select(null);
          }
          break;
        case 'Enter':
          if (tool === 'measure' && mess && !mess.fertig) setMess({ ...mess, fertig: mess.punkte.length >= 2 });
          else if (numBuf) applyNumeric();
          else if (tool === 'polygon' && draft.length >= 3) finishShape(draft);
          break;
        case 'Backspace':
          if (numBuf) setNumBuf((b) => b.slice(0, -1));
          else if (draft.length) setDraft((d) => d.slice(0, -1));
          else if (st.selectedIds.length) deleteSelected();
          e.preventDefault();
          break;
        case 'Delete':
          deleteSelected();
          break;
        case 'v':
        case 'V':
          setTool('select');
          break;
        case 'p':
        case 'P':
          setTool('polygon');
          break;
        case 'r':
        case 'R':
          setTool('rect');
          break;
        case 'm':
        case 'M':
          setTool('measure');
          break;
        case 'e':
        case 'E':
          setTool('detect');
          break;
        case 'k':
        case 'K':
          if (storey.background) setTool('calibrate');
          break;
        case 'b':
        case 'B':
          st.setDrawKind('outline');
          break;
        case 'n':
        case 'N':
          st.setDrawKind('room');
          break;
        case 'f':
        case 'F':
          fitRef.current();
          break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpaceDown(false);
    };
    function deleteSelected() {
      flaechenLoeschen();
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [draft, tool, numBuf, calib, mess, applyNumeric, finishShape, storey.id, storey.shapes, storey.background, setTool]);

  // Rückgängig (Strg+Z, ↶) nimmt zuerst den laufenden Entwurf zurück: letzter Punkt, Kalibrierstrecke, letzter Messpunkt
  useEffect(() => {
    const laufendeMessung = !!mess && !mess.fertig;
    useEditor.getState().setEntwurf(draft.length > 0 || !!calib || laufendeMessung);
    entwurfZuruecknehmenAnmelden(() => {
      if (calib) {
        setCalib(null);
        return true;
      }
      if (draft.length) {
        setNumBuf('');
        setDraft(draft.slice(0, -1));
        return true;
      }
      if (mess && !mess.fertig) {
        setMess(mess.punkte.length > 1 ? { ...mess, punkte: mess.punkte.slice(0, -1) } : null);
        return true;
      }
      return false;
    });
  }, [draft, mess, calib]);
  useEffect(
    () => () => {
      entwurfZuruecknehmenAnmelden(null);
      useEditor.getState().setEntwurf(false);
    },
    [],
  );

  /* ---------- Maus ---------- */

  const localPos = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  };

  const startPan = (e: React.PointerEvent) => {
    const { sx, sy } = localPos(e);
    drag.current = { kind: 'pan', sx, sy, tx: vp.tx, ty: vp.ty };
    svgRef.current!.setPointerCapture(e.pointerId);
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    // eine stehende Warnung verschwindet beim nächsten Klick in die Zeichenfläche
    if (message?.art === 'warnung') setMessage(null);
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      e.preventDefault();
      startPan(e);
      return;
    }
    if (e.button !== 0) return;
    const { sx, sy } = localPos(e);
    const raw = toWorld(sx, sy);
    const origin = draft.length ? draft[draft.length - 1] : null;
    const zeichnen = tool === 'polygon' || tool === 'rect';
    const kalibrieren = tool === 'calibrate' || tool === 'kontrolle';
    const { p } = snap(raw, { alt: e.altKey, shift: e.shiftKey, ohneRaster: kalibrieren }, origin, undefined, zeichnen ? zeichenHilfslinien(draft, theta) : []);

    const now = performance.now();
    const isDouble = now - lastClick.current.t < 350 && Math.hypot(sx - lastClick.current.x, sy - lastClick.current.y) < 5;
    lastClick.current = { t: now, x: sx, y: sy };

    switch (tool) {
      case 'select':
        if (e.shiftKey) {
          // Umschalt + Ziehen im Leeren: Rahmenauswahl (ergänzt die bisherige Auswahl)
          drag.current = { kind: 'box', start: raw, cur: raw, add: true };
          setBox([raw, raw]);
          svgRef.current!.setPointerCapture(e.pointerId);
          break;
        }
        select(null);
        startPan(e);
        break;
      case 'polygon': {
        if (isDouble && draft.length >= 3) {
          finishShape(draft);
          break;
        }
        if (draft.length >= 3 && distance(toScreen(p), toScreen(draft[0])) < VERTEX_SNAP_PX) {
          finishShape(draft);
          break;
        }
        if (draft.length && distance(p, draft[draft.length - 1]) < 1e-9) break;
        setDraft([...draft, p]);
        setNumBuf('');
        break;
      }
      case 'rect':
        if (!draft.length) setDraft([p]);
        else finishShape(achsRechteck(draft[0], p, theta));
        break;
      case 'measure': {
        // Kettenmessung: jeder Klick ein Punkt; Doppelklick/Enter beendet, Klick auf den Startpunkt schließt (Fläche)
        const m = mess && !mess.fertig ? mess : null;
        if (!m) setMess({ punkte: [p], fertig: false, geschlossen: false });
        else if (m.punkte.length >= 3 && distance(toScreen(p), toScreen(m.punkte[0])) < VERTEX_SNAP_PX) setMess({ ...m, fertig: true, geschlossen: true });
        else if (isDouble) setMess({ ...m, fertig: m.punkte.length >= 2 });
        else if (distance(p, m.punkte[m.punkte.length - 1]) > 1e-9) setMess({ ...m, punkte: [...m.punkte, p] });
        break;
      }
      case 'detect':
        void runDetection(raw);
        break;
      case 'calibrate':
      case 'kontrolle':
        if (!storey.background) break;
        if (draft.length === 0) setDraft([p]);
        else {
          if (distance(draft[0], p) > 1e-6) (tool === 'calibrate' ? setCalib : setKontrolle)([draft[0], p]);
          setDraft([]);
        }
        break;
    }
  };

  const detect = useEditor((s) => s.detect);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Meldung | null>(null);
  /** Meldung auf der Zeichenfläche: Erfolg grün, Hinweis neutral, Warnung gelb (bleibt bis zum Klick) */
  const melde = (text: string, art: Meldung['art'] = 'info') => setMessage({ text, art });
  useEffect(() => {
    if (!message || message.art === 'warnung') return;
    const t = setTimeout(() => setMessage(null), Math.max(5000, message.text.length * 60));
    return () => clearTimeout(t);
  }, [message]);

  const runDetection = async (click: Point) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const grids: SegmentGrid[] = [];
      const bg = storey.background;
      if (bg && bgVisible && bg.type === 'vector') grids.push(vectorSegmentGrid(bg, { skipArcs: detect.skipArcs }));
      // Kanten vorhandener (sichtbarer) Flächen begrenzen ebenfalls
      const edges: number[] = [];
      for (const s of storey.shapes) {
        if ((s.kind === 'outline' && !view.showOutlines) || (s.kind === 'room' && !view.showRooms)) continue;
        const n = s.points.length;
        for (let i = 0; i < n; i++) {
          const a = s.points[i];
          const b = s.points[(i + 1) % n];
          edges.push(a.x, a.y, b.x, b.y);
        }
      }
      if (edges.length) grids.push(new SegmentGrid(edges));
      let rasterMask: ReturnType<typeof rasterMaskProvider> | undefined;
      let refineEdge: ReturnType<typeof rasterEdgeRefiner> | undefined;
      if (bg && bgVisible && bg.type === 'raster') {
        const img = await loadImage(bg.dataUrl);
        rasterMask = rasterMaskProvider(bg, img, detect.threshold);
        refineEdge = rasterEdgeRefiner(bg, img);
      }
      if (!grids.length && !rasterMask) {
        melde('Keine Linien vorhanden: zuerst einen Plan laden oder einen BGF-Umriss zeichnen.', 'warnung');
        return;
      }
      // dem Browser einen Frame für die Anzeige des Wartezustands lassen
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      // BGF-Modus: Klick auf die Außenwand → Außenkontur der Wand (F-15); Klick in einen Raum wie bisher
      if (drawKind === 'outline') {
        const aussen = detectOutline({ click, grids, rasterMask, refineEdge, gap: detect.gap });
        if (aussen.ok) {
          log.debug('BGF-Umriss aus der Außenwand erkannt', { click, punkte: aussen.points.length });
          finishShape(aussen.points, { pruefen: true, bemerkung: 'aus dem Plan erkannt (Außenkante der Wand) – prüfen' });
          melde('BGF-Umriss erkannt – bitte prüfen: Außenmaße einschließlich Putz bzw. WDVS; im Dachgeschoss bis zum Schnitt der Dachhaut mit der Fußbodenebene.', 'info');
          return;
        }
      }
      const res = detectRegion({ click, grids, rasterMask, refineEdge, gap: detect.gap, ignoreThinLines: detect.ignoreThin ? 0.05 : 0 });
      if (res.ok && drawKind === 'outline') melde('Fläche zwischen den Linien als BGF-Umriss angelegt. Für die BGF eines Gebäudes auf die Außenwand klicken.');
      if (!res.ok) {
        log.info(`Keine Fläche erkannt: ${res.error}`, { click, gap: detect.gap });
        melde(res.error, 'warnung');
      } else {
        log.debug('Fläche erkannt', { click, punkte: res.points.length });
        finishShape(res.points);
      }
    } catch (e) {
      log.error('Erkennung fehlgeschlagen', e);
      melde('Die Erkennung ist fehlgeschlagen. Einzelheiten stehen im Protokoll.', 'warnung');
    } finally {
      setBusy(false);
    }
  };

  const onShapePointerDown = (e: React.PointerEvent, shape: Shape) => {
    if (tool !== 'select' || e.button !== 0 || spaceDown) return;
    e.stopPropagation();
    const st = useEditor.getState();
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      // Umschalt/Strg + Klick: Fläche zur Auswahl hinzufügen bzw. entfernen
      st.toggleSelect(shape.id);
      return;
    }
    // Klick in eine bereits gewählte Gruppe verschiebt die ganze Gruppe
    const ids = st.selectedIds.includes(shape.id) ? st.selectedIds : [shape.id];
    if (!st.selectedIds.includes(shape.id)) select(shape.id);
    const orig = new Map(storey.shapes.filter((s) => ids.includes(s.id)).map((s) => [s.id, s.points] as const));
    const { sx, sy } = localPos(e);
    const stempel = new Map(storey.shapes.filter((s) => ids.includes(s.id) && s.stempel).map((s) => [s.id, s.stempel!] as const));
    drag.current = { kind: 'move', start: toWorld(sx, sy), orig, stempel, started: false, sx, sy, shapeId: shape.id };
    svgRef.current!.setPointerCapture(e.pointerId);
  };

  const onVertexPointerDown = (e: React.PointerEvent, shape: Shape, index: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const { sx, sy } = localPos(e);
    drag.current = { kind: 'vertex', shapeId: shape.id, index, orig: shape.points, started: false, sx, sy };
    svgRef.current!.setPointerCapture(e.pointerId);
  };

  const onMidpointPointerDown = (e: React.PointerEvent, shape: Shape, index: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const a = shape.points[index];
    const b = shape.points[(index + 1) % shape.points.length];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const pts = [...shape.points];
    pts.splice(index + 1, 0, mid);
    update((p) => setShapePoints(p, storey.id, shape.id, pts));
    const { sx, sy } = localPos(e);
    // Einfügen ist bereits ein Undo-Schritt, das anschließende Ziehen gehört dazu
    drag.current = { kind: 'vertex', shapeId: shape.id, index: index + 1, orig: pts, started: true, sx, sy };
    svgRef.current!.setPointerCapture(e.pointerId);
  };

  // Kontextmenü am Eckpunkt (gemeinsames Menü: Tastatur, Esc-Stapel, gesperrte Punkte mit Grund)
  const onVertexContextMenu = (e: React.MouseEvent, shape: Shape, index: number) => {
    const zuWenig = shape.points.length <= 3;
    zeigeMenue(
      e,
      [
        {
          text: `Punkt ${index + 1} löschen`,
          symbol: 'muell',
          gefahr: true,
          deaktiviert: zuWenig,
          hinweis: zuWenig ? 'Mind. 3 Punkte' : undefined,
          titel: zuWenig ? 'Eine Fläche braucht mindestens drei Punkte' : undefined,
          // aus dem aktuellen Stand rechnen: bei offenem Menü kann sich die Fläche geändert haben (z. B. Rückgängig)
          aktion: () =>
            update((p) => {
              const aktuell = p.storeys.find((s) => s.id === storey.id)?.shapes.find((s) => s.id === shape.id);
              if (!aktuell || aktuell.points.length <= 3 || index >= aktuell.points.length) return p;
              return setShapePoints(p, storey.id, shape.id, aktuell.points.filter((_, i) => i !== index));
            }),
        },
      ],
      'Eckpunkt',
    );
  };

  // Kontextmenü auf einer Fläche (Auswahlwerkzeug): wählt die Fläche, falls sie noch nicht gewählt ist
  const onShapeContextMenu = (e: React.MouseEvent, shape: Shape) => {
    if (tool !== 'select') {
      e.preventDefault();
      return;
    }
    const st = useEditor.getState();
    if (!st.selectedIds.includes(shape.id) && st.selectedShapeId !== shape.id) select(shape.id);
    zeigeMenue(e, flaechenMenue(), menueName(shape));
  };

  // Kontextmenü auf der leeren Zeichenfläche
  const onCanvasContextMenu = (e: React.MouseEvent) => {
    if (tool !== 'select' || draft.length) {
      e.preventDefault();
      return;
    }
    // mit Auswahl (auch per Kontextmenütaste): das Menü der gewählten Flächen
    const st = useEditor.getState();
    const gewaehlt = st.selectedIds.length ? st.selectedIds : st.selectedShapeId ? [st.selectedShapeId] : [];
    const erste = storey.shapes.find((s) => s.id === gewaehlt[0]);
    if (erste) {
      zeigeMenue(e, flaechenMenue(), gewaehlt.length > 1 ? `${gewaehlt.length} Flächen` : menueName(erste));
      return;
    }
    zeigeMenue(
      e,
      [
        einfuegenPunkt(),
        { text: 'Alles zeigen', symbol: 'einpassen', hinweis: 'F', aktion: () => useEditor.getState().requestFit() },
      ],
      'Zeichenfläche',
    );
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const { sx, sy } = localPos(e);
    const raw = toWorld(sx, sy);
    const d = drag.current;
    const mods = { alt: e.altKey, shift: e.shiftKey };

    if (d?.kind === 'pan') {
      setVp((v) => ({ ...v, tx: d.tx + (sx - d.sx), ty: d.ty + (sy - d.sy) }));
      return;
    }
    if (d?.kind === 'vertex') {
      if (!d.started) {
        if (Math.hypot(sx - d.sx, sy - d.sy) < ZIEH_SCHWELLE_PUNKT) return;
        d.started = true;
        checkpoint();
      }
      const shape = storey.shapes.find((s) => s.id === d.shapeId);
      if (!shape) return;
      const n = shape.points.length;
      // Hilfslinien: Verlängerung der angrenzenden Kanten (wie vor dem Ziehen), Gebäudeachsen, Fluchten
      const s = snap(raw, mods, shape.points[(d.index - 1 + n) % n], { shapeId: d.shapeId, index: d.index }, eckpunktHilfslinien(d.orig, d.index, theta));
      setCursor(s);
      const pts = shape.points.map((q, i) => (i === d.index ? s.p : q));
      const o = d.orig[d.index];
      if (o) setZiehInfo(`Punkt: Δx ${fmt2(s.p.x - o.x)} · Δy ${fmt2(o.y - s.p.y)} m`);
      // bearbeiteter Umriss gilt als geprüft (Kennzeichen „prüfen“ nach der Erkennung entfällt)
      updateSilent((p) => mapShape(setShapePoints(p, storey.id, d.shapeId, pts), storey.id, d.shapeId, (x) => (x.kind === 'outline' && x.pruefen ? { ...x, pruefen: undefined } : x)));
      return;
    }
    if (d?.kind === 'move') {
      if (!d.started) {
        if (Math.hypot(sx - d.sx, sy - d.sy) < ZIEH_SCHWELLE_FLAECHE) return;
        d.started = true;
        checkpoint();
      }
      let dx = raw.x - d.start.x;
      let dy = raw.y - d.start.y;
      if (e.shiftKey) {
        // entlang der Gebäudeachse
        const q = achsBeschraenkt(d.start, raw, theta, view.snapGrid && !e.altKey ? gridStep : 0);
        dx = q.x - d.start.x;
        dy = q.y - d.start.y;
      } else if (view.snapGrid && !e.altKey) {
        dx = roundTo(dx, gridStep);
        dy = roundTo(dy, gridStep);
      }
      setZiehInfo(`Verschieben: dx ${fmt2(dx)} · dy ${fmt2(-dy)} m`);
      updateSilent((p) => {
        let next = p;
        for (const [id, pts] of d.orig) {
          const st0 = d.stempel?.get(id);
          next = mapShape(next, storey.id, id, (s) => ({ ...s, points: translate(pts, dx, dy), ...(st0 ? { stempel: { x: st0.x + dx, y: st0.y + dy } } : {}) }));
        }
        return next;
      });
      return;
    }
    if (d?.kind === 'box') {
      d.cur = raw;
      setBox([d.start, raw]);
      return;
    }
    if (d?.kind === 'stempel') {
      if (!d.started) {
        if (Math.hypot(sx - d.sx, sy - d.sy) < ZIEH_SCHWELLE_PUNKT) return;
        d.started = true;
        checkpoint();
      }
      // der Griff sitzt unter dem Stempel: Stempel folgt dem Mauszeiger mit diesem Versatz
      const p = toWorld(sx, sy - 17);
      updateSilent((q) => mapShape(q, storey.id, d.shapeId, (s) => ({ ...s, stempel: { x: roundTo(p.x, 1e-3), y: roundTo(p.y, 1e-3) } })));
      return;
    }
    const origin = draft.length ? draft[draft.length - 1] : null;
    const zeichnen = tool === 'polygon' || tool === 'rect';
    const kalibrieren = tool === 'calibrate' || tool === 'kontrolle';
    setCursor(snap(raw, { ...mods, ohneRaster: kalibrieren }, tool === 'select' ? null : origin, undefined, zeichnen ? zeichenHilfslinien(draft, theta) : []));
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (d?.kind === 'box') {
      // Flächen, die ganz im Rahmen liegen (nur sichtbare)
      const x0 = Math.min(d.start.x, d.cur.x);
      const x1 = Math.max(d.start.x, d.cur.x);
      const y0 = Math.min(d.start.y, d.cur.y);
      const y1 = Math.max(d.start.y, d.cur.y);
      const drin = [...outlines, ...rooms].filter((s) => s.points.every((q) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1)).map((s) => s.id);
      const st = useEditor.getState();
      st.selectMany(d.add ? [...st.selectedIds, ...drin.filter((id) => !st.selectedIds.includes(id))] : drin);
      setBox(null);
    }
    // Klick ohne Ziehen auf eine Fläche einer Mehrfachauswahl: nur diese Fläche wählen
    if (d?.kind === 'move' && !d.started && d.orig.size > 1) select(d.shapeId);
    drag.current = null;
    setZiehInfo(null);
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId);
  };

  /* ---------- Kalibrierung Hintergrundbild ---------- */

  const applyCalibration = (realLength: number) => {
    const bg = storey.background;
    if (!calib || !bg) return;
    const [a, b] = calib;
    const measured = distance(a, b);
    if (measured < 1e-9 || !(realLength > 0)) return;
    update((p) => mapStorey(ohneKontrollmass(p, storey.id), storey.id, (s) => ({ ...s, background: scaleAround(bg, realLength / measured, a) })));
    setCalib(null);
    // gleich danach ein Kontrollmaß messen (F-16): zweite bekannte Strecke, möglichst quer zur ersten
    setTool('kontrolle');
    melde('Plan kalibriert. Jetzt eine zweite bekannte Strecke als Kontrollmaß anklicken (Esc: überspringen).', 'ok');
    requestAnimationFrame(() => fitRef.current());
  };

  const applyKontrolle = (soll: number) => {
    if (!kontrolle) return;
    const ist = distance(kontrolle[0], kontrolle[1]);
    const abweichung = kontrollAbweichung(ist, soll);
    const massstab = storey.background ? bgScale(storey.background) : undefined;
    update((p) => ({ ...p, settings: { ...p.settings, kontrollmasse: { ...(p.settings.kontrollmasse ?? {}), [storey.id]: { soll, ist, abweichung, ...(massstab ? { massstab } : {}) } } } }));
    setKontrolle(null);
    setTool('select');
    const pct = (abweichung * 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const zuGross = Math.abs(abweichung) > 0.005;
    melde(
      `Kontrollmaß ${fmt2(soll)} m: Abweichung ${abweichung > 0 ? '+' : ''}${pct} % – ${zuGross ? 'größer als 0,5 %, Kalibrierung wiederholen.' : 'Kalibrierung in Ordnung.'}`,
      zuGross ? 'warnung' : 'ok',
    );
  };

  /* ---------- Rendering ---------- */

  const pathOf = (pts: Point[], close = true) =>
    pts.length ? pts.map((p, i) => `${i ? 'L' : 'M'}${(p.x * vp.scale + vp.tx).toFixed(2)},${(p.y * vp.scale + vp.ty).toFixed(2)}`).join('') + (close ? 'Z' : '') : '';

  const grid = useMemo(() => {
    const steps = [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 50, 100, 500];
    const minor = steps.find((s) => s * vp.scale >= 12) ?? 500;
    const major = steps.find((s) => s > minor * 4 && s * vp.scale >= 60) ?? minor * 10;
    const w0 = toWorld(0, 0);
    const w1 = toWorld(size.w, size.h);
    const lines: { d: string; major: boolean }[] = [];
    const x0 = Math.floor(w0.x / minor) * minor;
    for (let x = x0; x <= w1.x; x += minor) {
      const sx = x * vp.scale + vp.tx;
      lines.push({ d: `M${sx.toFixed(1)},0V${size.h}`, major: Math.abs(x / major - Math.round(x / major)) < 1e-6 });
    }
    const y0 = Math.floor(w0.y / minor) * minor;
    for (let y = y0; y <= w1.y; y += minor) {
      const sy = y * vp.scale + vp.ty;
      lines.push({ d: `M0,${sy.toFixed(1)}H${size.w}`, major: Math.abs(y / major - Math.round(y / major)) < 1e-6 });
    }
    return {
      minorPath: lines.filter((l) => !l.major).map((l) => l.d).join(''),
      majorPath: lines.filter((l) => l.major).map((l) => l.d).join(''),
    };
  }, [vp, size, toWorld]);

  const outlines = view.showOutlines ? storey.shapes.filter((s) => s.kind === 'outline') : [];
  const rooms = view.showRooms ? storey.shapes.filter((s) => s.kind === 'room') : [];

  // Beschriftungspunkte; BGF-Beschriftungen weichen sichtbaren Räumen aus
  const labelPoints = useMemo(() => {
    const m = new Map<string, Point>();
    const roomPts = view.showRooms ? storey.shapes.filter((s) => s.kind === 'room').map((s) => s.points) : [];
    for (const s of storey.shapes) m.set(s.id, s.stempel ?? labelPoint(s.points, s.kind === 'outline' ? roomPts : []));
    return m;
  }, [storey.shapes, view.showRooms]);

  // dunkle Zeichenfläche (Filter): Raumfüllung vorgerechnet, damit sie im Ton der Farbmarke in der Liste erscheint.
  // Gerechnet wird gegen den Grund der Zeichenfläche, auch über einer Unterlage (PDF/Bild) – bewusst hingenommen (s. @core/planFarbe).
  const gefiltert = useZeichenflaecheGefiltert();
  const raumFuellung = useMemo(() => {
    const cache = new Map<string, { farbe: string; deckung: number }>();
    return (farbe: string) => {
      if (!gefiltert) return { farbe, deckung: RAUM_DECKUNG };
      let f = cache.get(farbe);
      if (!f) cache.set(farbe, (f = planFuellungDunkel(farbe, RAUM_DECKUNG)));
      return f;
    };
  }, [gefiltert]);

  const shapeStyle = (s: Shape): React.SVGProps<SVGPathElement> => {
    const isSel = selectedIds.includes(s.id);
    if (s.subtract) {
      return { fill: 'url(#hatch-subtract)', stroke: isSel ? 'var(--sel)' : '#c0392b', strokeWidth: isSel ? 2.5 : 1.5, strokeDasharray: '6 3' };
    }
    if (s.kind === 'outline') {
      return {
        fill: s.umschliessung === 'S' ? 'url(#hatch-s)' : 'rgba(42, 91, 215, 0.08)',
        // erkannt und noch nicht bearbeitet: gestrichelt in Orange, bis der Umriss geprüft (bearbeitet) ist
        stroke: isSel ? 'var(--sel)' : s.pruefen ? '#b35900' : '#2a5bd7',
        strokeWidth: isSel ? 3 : 2,
        strokeDasharray: s.pruefen && !isSel ? '7 4' : undefined,
      };
    }
    const f = raumFuellung(nutzungInfo(raumNutzung(s)).color);
    return {
      fill: f.farbe,
      fillOpacity: f.deckung,
      stroke: isSel ? 'var(--sel)' : '#444',
      strokeWidth: isSel ? 2.5 : 1,
      strokeDasharray: s.umschliessung === 'S' ? '5 3' : undefined,
    };
  };

  const renderLabel = (s: Shape) => {
    if (s.points.length < 3) return null;
    const b = bounds(s.points);
    // BGF-Beschriftung am Rand (außen oben links) statt in der Mitte auf den Räumen (F-20) – ein verschobener Stempel geht vor
    if (s.kind === 'outline' && !s.stempel) {
      const q = toScreen({ x: b.minX, y: b.minY });
      // gewählter Umriss mit Kantenmaßen: Beschriftung höher, damit das obere Kantenmaß frei bleibt
      const hoch = selected?.id === s.id && tool === 'select' && view.showDimensions;
      return (
        <text key={`l-${s.id}`} className="shape-label umriss-label" x={q.x + 2} y={q.y - (hoch ? 28 : 6)} textAnchor="start">
          {s.name} ({s.umschliessung}) · {fmt2(shapeArea(s) * (s.subtract ? -1 : 1))} m²
          {s.pruefen && <tspan className="pruefen-label"> · prüfen</tspan>}
        </text>
      );
    }
    const lp = toScreen(labelPoints.get(s.id) ?? labelPoint(s.points));
    const wPx = (b.maxX - b.minX) * vp.scale;
    const hPx = (b.maxY - b.minY) * vp.scale;
    const area = shapeArea(s) * (s.subtract ? -1 : 1);
    const flaecheText = `${fmt2(area)} m²`;
    // nur beschriften, was in die Fläche passt – sonst überlagern sich herausgezoomt die Texte benachbarter Räume
    if (wPx < textBreite(flaecheText) + 6 || hPx < 16) return null;
    const title = s.kind === 'room' ? [s.nummer, s.name].filter(Boolean).join(' ') : `${s.name} (${s.umschliessung})`;
    const showTitle = !!title && wPx > textBreite(title) + 6 && hPx > 34;
    return (
      <text key={`l-${s.id}`} className="shape-label" x={lp.x} y={lp.y} textAnchor="middle">
        {showTitle && (
          <tspan x={lp.x} dy="-0.35em" className="shape-label-title">
            {title}
          </tspan>
        )}
        <tspan x={lp.x} dy={showTitle ? '1.2em' : '0.35em'}>
          {flaecheText}
        </tspan>
      </text>
    );
  };

  /** Kantenmaße; innen = in die Fläche hinein (Räume: nicht auf Wand, Nachbarraum oder BGF-Beschriftung) */
  const renderDimensions = (pts: Point[], closed: boolean, innen = false) => {
    const n = pts.length;
    const out: React.ReactNode[] = [];
    const count = closed ? n : n - 1;
    // kleine Räume auf dem Bildschirm: Maße außen, sonst überlagern sie sich mit Griffen und Beschriftung
    if (innen && n) {
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      if (Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * vp.scale < 90) innen = false;
    }
    for (let i = 0; i < count; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const len = distance(a, b);
      // nur, wenn die Zahl samt Abstand neben die Kante passt
      if (len * vp.scale < textBreite(fmt2(len), 11) + 24) continue;
      const sa = toScreen(a);
      const sb = toScreen(b);
      const mx = (sa.x + sb.x) / 2;
      const my = (sa.y + sb.y) / 2;
      let nx = (sb.y - sa.y) / (len * vp.scale);
      let ny = -(sb.x - sa.x) / (len * vp.scale);
      if (closed) {
        const probe = toWorld(mx + nx * 3, my + ny * 3);
        if (pointInPolygon(probe, pts) !== innen) {
          nx = -nx;
          ny = -ny;
        }
      }
      // mit Abstand zur Kante: nicht auf dem Griff in der Kantenmitte bzw. den Eckpunkten (F-06)
      // innen an senkrechten Kanten weiter weg: der Text ist breiter als hoch und soll den Griff in der Kantenmitte freilassen
      const abstand = innen ? 12 + Math.abs(nx) * 10 : 18;
      out.push(
        <text key={`d${i}`} className="dim-label" x={mx + nx * abstand} y={my + ny * abstand + 4} textAnchor="middle">
          {fmt2(len)}
        </text>,
      );
    }
    return out;
  };

  const bg = storey.background;
  const origin = draft.length ? draft[draft.length - 1] : null;
  const preview = cursor && draft.length ? cursor.p : null;

  // Bedienhinweis: eine Zeile je Zustand; alle Kürzel im Dialog „Tastenkürzel“ (?)
  const leer = !storey.shapes.length;
  const art = drawKind === 'outline' ? 'BGF-Umriss' : 'Raum';
  let hint = '';
  switch (tool) {
    case 'select':
      hint =
        selectedIds.length > 1
          ? `${selectedIds.length} Flächen gewählt · Ziehen/Pfeiltasten: verschieben · Strg+D: duplizieren · Entf: löschen · Esc: Auswahl aufheben`
          : selected
            ? 'Punkt ziehen: ändern · ◇ ziehen: Punkt einfügen · Rechtsklick: Menü · Entf: Fläche löschen'
            : leer
              ? ''
              : 'Klicken: wählen · Ziehen: verschieben · Umschalt+Klick/Rahmen: mehrere';
      break;
    case 'polygon':
      hint = draft.length ? 'Klicken: nächster Punkt · Länge oder dx;dy (rechts/oben positiv) + Enter · Enter/Startpunkt: schließen · Strg+Z: Punkt zurück' : `Ersten Punkt setzen (${art})`;
      break;
    case 'rect':
      hint = draft.length ? 'Gegenecke klicken oder Maß eingeben, z. B. 4,5x3,2 + Enter' : `Erste Ecke setzen (${art})`;
      break;
    case 'detect':
      hint = busy ? 'Erkenne Fläche …' : `In einen umschlossenen Bereich klicken → ${art} (Öffnungen bis ${fmt2(detect.gap)} m werden geschlossen)`;
      break;
    case 'measure':
      hint = 'Punkte klicken · Doppelklick/Enter: beenden · Startpunkt: Fläche · Strg+C: kopieren – zählt nicht zur Auswertung';
      break;
    case 'calibrate':
      hint = !bg
        ? 'Zuerst einen Plan laden (Plan laden …)'
        : bg.type === 'vector'
          ? 'Zwei Punkte mit bekanntem Abstand anklicken (Fang auf Plankanten und Eckpunkte; Alt: ohne Fang)'
          : 'Zwei Punkte mit bekanntem Abstand anklicken – nah heranzoomen (Mausrad) für Genauigkeit';
      break;
    case 'kontrolle':
      hint = 'Kontrollmaß: zweite bekannte Strecke anklicken, möglichst quer zur ersten · Esc: überspringen';
      break;
  }
  // leere Zeichenfläche: Einstieg statt Bedienhinweisen (Plan laden, IFC, zeichnen)
  const einstieg = leer && !bg && !ghost && tool === 'select';

  const cursorStyle = busy ? 'progress' : drag.current?.kind === 'pan' || spaceDown ? 'grabbing' : tool === 'select' ? 'default' : tool === 'detect' ? 'cell' : 'crosshair';

  return (
    <div className="canvas-wrap">
      <svg
        ref={svgRef}
        className="canvas"
        style={{ cursor: cursorStyle }}
        onPointerDown={onPointerDown}
        // fokussierbar: Tab wählt dann die nächste Fläche; sonst bleibt Tab die normale Bedienung der Oberfläche
        tabIndex={0}
        aria-label="Zeichenfläche"
        onPointerDownCapture={() => svgRef.current?.focus({ preventScroll: true })}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => !drag.current && setCursor(null)}
        onContextMenu={onCanvasContextMenu}
      >
        <defs>
          <pattern id="hatch-s" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="rgba(42, 91, 215, 0.05)" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(42, 91, 215, 0.35)" strokeWidth="1.5" />
          </pattern>
          <pattern id="hatch-subtract" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <rect width="7" height="7" fill="rgba(255,255,255,0.6)" />
            <line x1="0" y1="0" x2="0" y2="7" stroke="rgba(192, 57, 43, 0.6)" strokeWidth="1.5" />
          </pattern>
        </defs>

        <rect width={size.w} height={size.h} className="canvas-bg" />
        {/* Raster unter dem Plan; mit sichtbarem Plan nur das Hauptraster, blass – Scans bleiben ruhig */}
        {!bgVisible && <path d={grid.minorPath} className="grid-minor" />}
        <path d={grid.majorPath} className={bgVisible ? 'grid-major grid-unter-plan' : 'grid-major'} />
        {bg && view.showBackground && <BackgroundLayer bg={bg} k={vp.scale} tx={vp.tx} ty={vp.ty} />}

        {ghost &&
          ghost.shapes.map((s) => <path key={`g-${s.id}`} d={pathOf(s.points)} className="ghost" />)}

        <g style={{ pointerEvents: tool === 'select' && !spaceDown ? 'visiblePainted' : 'none' }}>
          {[...outlines, ...rooms].map((s) => (
            <path
              key={s.id}
              d={pathOf(s.points)}
              {...shapeStyle(s)}
              fillRule="evenodd"
              strokeLinejoin="round"
              onPointerDown={(e) => onShapePointerDown(e, s)}
              onContextMenu={(e) => onShapeContextMenu(e, s)}
              style={{ cursor: tool === 'select' ? 'move' : undefined }}
            />
          ))}
        </g>
        {view.showHoehenlinien && <HoehenLayer storey={storey} toScreen={toScreen} />}
        <g style={{ pointerEvents: 'none' }}>{[...outlines, ...rooms].map(renderLabel)}</g>

        {selected && tool === 'select' && (
          <g>
            <path d={pathOf(selected.points)} fill="none" stroke="var(--sel)" strokeWidth={2} pointerEvents="none" />
            {view.showDimensions && <g pointerEvents="none">{renderDimensions(selected.points, true, selected.kind === 'room')}</g>}
            {selected.points.map((a, i) => {
              const b = selected.points[(i + 1) % selected.points.length];
              const m = toScreen({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
              if (distance(a, b) * vp.scale < 24) return null;
              return (
                <g key={`m${i}`} className="griff" onPointerDown={(e) => onMidpointPointerDown(e, selected, i)} onContextMenu={(e) => onShapeContextMenu(e, selected)}>
                  {/* unsichtbare, größere Trefferfläche */}
                  <circle cx={m.x} cy={m.y} r={9} className="griff-treffer" />
                  <rect className="mid-handle" x={m.x - 4} y={m.y - 4} width={8} height={8} transform={`rotate(45 ${m.x} ${m.y})`} />
                  <title>Ziehen: Punkt einfügen</title>
                </g>
              );
            })}
            {selected.kind === 'room' && (() => {
              // Raumstempel verschieben (F-20)
              const q = toScreen(labelPoints.get(selected.id) ?? labelPoint(selected.points));
              return (
                <g
                  className="griff stempel-griff"
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    const { sx, sy } = localPos(e);
                    drag.current = { kind: 'stempel', shapeId: selected.id, started: false, sx, sy };
                    svgRef.current!.setPointerCapture(e.pointerId);
                  }}
                >
                  <rect className="griff-treffer" x={q.x - 10} y={q.y + 7} width={20} height={20} />
                  <rect className="stempel-handle" x={q.x - 5} y={q.y + 12} width={10} height={10} />
                  <title>Beschriftung verschieben</title>
                </g>
              );
            })()}
            {selected.points.map((p, i) => {
              const s = toScreen(p);
              return (
                <g key={`v${i}`} className="griff" onPointerDown={(e) => onVertexPointerDown(e, selected, i)} onContextMenu={(e) => onVertexContextMenu(e, selected, i)}>
                  <circle cx={s.x} cy={s.y} r={10} className="griff-treffer" />
                  <circle className="vertex-handle" cx={s.x} cy={s.y} r={5} />
                </g>
              );
            })}
          </g>
        )}

        {/* Entwurf beim Zeichnen */}
        {draft.length > 0 && (tool === 'polygon' || tool === 'rect') && (
          <g pointerEvents="none">
            {tool === 'polygon' && (
              <>
                <path d={pathOf(preview ? [...draft, preview] : draft, false)} className="draft" />
                {draft.length >= 2 && preview && <path d={pathOf([...draft, preview])} className="draft-fill" />}
                {renderDimensions(preview ? [...draft, preview] : draft, false)}
              </>
            )}
            {tool === 'rect' && preview && (
              <>
                <path d={pathOf(achsRechteck(draft[0], preview, theta))} className="draft draft-fill" />
                {renderDimensions(achsRechteck(draft[0], preview, theta).slice(0, 3), false)}
              </>
            )}
            {draft.map((p, i) => {
              const s = toScreen(p);
              return <circle key={i} cx={s.x} cy={s.y} r={i === 0 ? 5 : 3.5} className={i === 0 ? 'draft-start' : 'draft-point'} />;
            })}
          </g>
        )}

        {/* Messen / Kalibrieren */}
        {mess && <MessAnzeige mess={mess} vorschau={tool === 'measure' && !mess.fertig && cursor ? cursor.p : null} toScreen={toScreen} breite={size.w} />}
        {(tool === 'calibrate' || tool === 'kontrolle') && (
          <g pointerEvents="none">
            {(() => {
              const seg = draft.length && preview ? ([draft[0], preview] as [Point, Point]) : tool === 'kontrolle' ? kontrolle : calib;
              if (!seg) return null;
              const a = toScreen(seg[0]);
              const b = toScreen(seg[1]);
              return (
                <>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="measure-line" />
                  <circle cx={a.x} cy={a.y} r={3.5} className="draft-point" />
                  <circle cx={b.x} cy={b.y} r={3.5} className="draft-point" />
                  <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 8} textAnchor="middle" className="dim-label measure-label">
                    {fmt2(distance(seg[0], seg[1]))} m
                  </text>
                </>
              );
            })()}
          </g>
        )}

        {/* Hilfslinien des aktuellen Fangs */}
        {cursor?.linien && (
          <g pointerEvents="none">
            {cursor.linien.map((l, i) => {
              const L = (size.w + size.h) / vp.scale;
              const a = toScreen({ x: cursor.p.x - l.d.x * L, y: cursor.p.y - l.d.y * L });
              const b = toScreen({ x: cursor.p.x + l.d.x * L, y: cursor.p.y + l.d.y * L });
              const q = toScreen(l.p);
              return (
                <g key={i}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`guide-line guide-${l.art}`} />
                  <circle cx={q.x} cy={q.y} r={3} className="guide-anchor" />
                </g>
              );
            })}
          </g>
        )}

        {/* Rahmenauswahl */}
        {box && (
          <rect
            className="select-box"
            pointerEvents="none"
            x={Math.min(toScreen(box[0]).x, toScreen(box[1]).x)}
            y={Math.min(toScreen(box[0]).y, toScreen(box[1]).y)}
            width={Math.abs(toScreen(box[1]).x - toScreen(box[0]).x)}
            height={Math.abs(toScreen(box[1]).y - toScreen(box[0]).y)}
          />
        )}

        {/* Fangsymbol */}
        {cursor && (tool !== 'select' || drag.current?.kind === 'vertex') && (
          <g pointerEvents="none">
            {(() => {
              const s = toScreen(cursor.p);
              switch (cursor.kind) {
                case 'vertex':
                  return <rect x={s.x - 6} y={s.y - 6} width={12} height={12} className="snap-marker" />;
                case 'edge':
                  return <path d={`M${s.x},${s.y - 7}L${s.x + 7},${s.y}L${s.x},${s.y + 7}L${s.x - 7},${s.y}Z`} className="snap-marker" />;
                case 'guide':
                  return <circle cx={s.x} cy={s.y} r={6} className="snap-marker" />;
                default:
                  return <path d={`M${s.x - 7},${s.y}H${s.x + 7}M${s.x},${s.y - 7}V${s.y + 7}`} className="snap-cross" />;
              }
            })()}
          </g>
        )}
      </svg>

      <div className="hud">
        {/* Koordinaten wie im Plan: y nach oben positiv (wie Messen und die Eingabe dx;dy) */}
        {(cursor || ziehInfo) && (
          <span className="hud-coords">
            {ziehInfo ?? (cursor ? `X ${fmt2(cursor.p.x)}  Y ${fmt2(-cursor.p.y)} m` : '')}
            {!ziehInfo && cursor && cursor.kind !== 'none' && cursor.kind !== 'grid' && tool !== 'select' && (
              <em> · Fang: {{ vertex: 'Punkt', edge: 'Kante', guide: 'Hilfslinie', ortho: 'Achse', grid: 'Raster', none: '' }[cursor.kind]}</em>
            )}
            {!ziehInfo && origin && preview && tool === 'polygon' && <em> · Segment {fmt2(distance(origin, preview))} m</em>}
          </span>
        )}
        {numBuf && <span className="hud-input">Eingabe: {numBuf}▏</span>}
        <div className="hud-zeile">
          {hinweisZu || !hint ? (
            <button className="hud-hint-knopf" onClick={() => (hint ? hinweisUmschalten(false) : setKuerzelOffen(true))} title={hint ? 'Bedienhinweise einblenden' : 'Tastenkürzel anzeigen (?)'}>
              {hint ? '? Hinweise' : '? Tastenkürzel'}
            </button>
          ) : (
            <span className="hud-hint" title={hint}>
              <span className="hud-hint-text">{hint}</span>
              <button className="hud-hint-knopf" onClick={() => setKuerzelOffen(true)} title="Alle Tastenkürzel (?)" aria-label="Alle Tastenkürzel">
                ?
              </button>
              <button className="hud-hint-knopf" onClick={() => hinweisUmschalten(true)} title="Bedienhinweise ausblenden (bleibt so)" aria-label="Bedienhinweise ausblenden">
                ×
              </button>
            </span>
          )}
        </div>
      </div>
      {einstieg && (
        <div className="canvas-leer">
          <p className="canvas-leer-titel">Wie soll es losgehen?</p>
          <button className="primary" onClick={() => void planLaden(storey.id)}>
            Grundriss laden (PDF, DXF, Bild) …
          </button>
          <button onClick={() => useEditor.getState().setIfcOpen(true)}>IFC-Modell importieren …</button>
          <p className="muted small-text">
            oder direkt zeichnen: <kbd>R</kbd> Rechteck · <kbd>P</kbd> Polygon
          </p>
        </div>
      )}
      {kuerzelOffen && <KuerzelDialog onClose={() => setKuerzelOffen(false)} />}
      <ScaleBar scale={vp.scale} />
      {/* Ansichtsoptionen, Werkzeugoptionen und Meldung untereinander rechts oben – brechen in schmalen Fenstern um,
          ohne sich zu überdecken */}
      <div className="canvas-oben">
        <div className="canvas-controls" title="Fang – Alt gedrückt: ohne Fang · Umschalt: entlang der Gebäudeachse">
          <label className="toggle">
            <input type="checkbox" checked={view.snapGrid} onChange={(e) => useEditor.getState().setView({ snapGrid: e.target.checked })} />
            Rasterfang ({fmt2(gridStep * 100).replace(',00', '')} cm)
          </label>
          <label className="toggle">
            <input type="checkbox" checked={view.snapVertices} onChange={(e) => useEditor.getState().setView({ snapVertices: e.target.checked })} />
            Punktfang
          </label>
          <label className="toggle" title="Fang an der Verlängerung bestehender Kanten und an den Gebäudeachsen (auch bei schräg stehenden, genordeten Plänen)">
            <input type="checkbox" checked={view.snapGuides} onChange={(e) => useEditor.getState().setView({ snapGuides: e.target.checked })} />
            Hilfslinien
          </label>
          <button className="small" onClick={() => fitRef.current()} title="Alles zeigen (F)" aria-label="Alles zeigen (F)">
            ⤢<span className="nur-breit"> Alles</span>
          </button>
        </div>
        {tool === 'detect' && (
          <div className="canvas-controls detect-controls">
            <label className="toggle" title="Größte Öffnung (z. B. Türbreite), die beim Erkennen geschlossen wird. Muss kleiner sein als der schmalste Raum.">
              Lückenschluss
              <NumberField value={detect.gap} min={0} max={5} onChange={(v) => v !== undefined && useEditor.getState().setDetect({ gap: v })} />m
            </label>
            {bg?.type === 'vector' && (
              <label className="toggle" title="Bögen und Kreise (z. B. Türaufschläge) nicht als Begrenzung verwenden">
                <input type="checkbox" checked={detect.skipArcs} onChange={(e) => useEditor.getState().setDetect({ skipArcs: e.target.checked })} />
                Bögen ignorieren
              </label>
            )}
            {bg?.type === 'raster' && (
              <label className="toggle" title="Dünne Linien (Türaufschläge, Möbel) nicht als Begrenzung verwenden – solange der Raum trotzdem geschlossen ist">
                <input type="checkbox" checked={detect.ignoreThin} onChange={(e) => useEditor.getState().setDetect({ ignoreThin: e.target.checked })} />
                dünne Linien ignorieren
              </label>
            )}
            {bg?.type === 'raster' && (
              <label className="toggle" title="Pixel dunkler als dieser Wert gelten als Wand/Linie">
                Schwelle
                <input
                  type="range"
                  min={60}
                  max={250}
                  step={5}
                  value={detect.threshold}
                  onChange={(e) => useEditor.getState().setDetect({ threshold: Number(e.target.value) })}
                />
              </label>
            )}
          </div>
        )}
        {message && (
          <div className={`canvas-message ${message.art}`} role="status" aria-live="polite" title="Klicken zum Ausblenden" onClick={() => setMessage(null)}>
            {message.text}
          </div>
        )}
      </div>

      {calib && <CalibrationDialog measured={distance(calib[0], calib[1])} onApply={applyCalibration} onCancel={() => setCalib(null)} />}
      {kontrolle && <CalibrationDialog kontrolle measured={distance(kontrolle[0], kontrolle[1])} onApply={applyKontrolle} onCancel={() => setKontrolle(null)} />}
    </div>
  );
}

/** alle Tastenkürzel der Zeichenfläche (Taste ?) – die Hinweiszeile zeigt nur das Nötigste */
const KUERZEL: [string, string][] = [
  ['V · P · R · E · M · K', 'Auswählen · Polygon · Rechteck · Erkennen · Messen · Kalibrieren'],
  ['B · N', 'neue Fläche als BGF-Umriss · als Raum'],
  ['F', 'alles zeigen'],
  ['Mausrad · Leertaste/mittlere Maustaste + Ziehen', 'zoomen · Ansicht verschieben'],
  ['Strg+Z · Strg+Y', 'rückgängig (beim Zeichnen zuerst der letzte Punkt) · wiederholen'],
  ['Esc', 'Eingabe, Entwurf, Messung bzw. Werkzeug verwerfen; zuletzt Auswahl aufheben'],
  ['Zahl + Enter', 'Polygon: Länge in Mausrichtung · Rechteck: Maß, z. B. 4,5x3,2'],
  ['dx;dy + Enter', 'Polygon: Punkt relativ, nach rechts und oben positiv'],
  ['Enter · Doppelklick', 'Polygon schließen bzw. Messung beenden'],
  ['Alt · Umschalt', 'ohne Fang · entlang der Gebäudeachse'],
  ['Tab · Umschalt+Tab', 'nächste bzw. vorige Fläche wählen'],
  ['Pfeiltasten (Umschalt)', 'Auswahl um 1 cm (10 cm) verschieben'],
  ['Umschalt/Strg+Klick · Umschalt+Rahmen · Strg+A', 'Flächen zur Auswahl hinzufügen · alle wählen'],
  ['Strg+C · Strg+V · Strg+D', 'kopieren · einfügen · duplizieren (Messen: Strg+C kopiert die Messung)'],
  ['Entf · Rücktaste', 'Auswahl löschen · letzten Entwurfspunkt löschen'],
  ['Punkt ziehen · ◇ ziehen', 'Punkt ändern · Punkt einfügen'],
  ['Rechtsklick (oder Kontextmenütaste)', 'Menü: Punkt löschen, Flächen kopieren, duplizieren, einfügen, löschen'],
];

function KuerzelDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal titel="Tastenkürzel der Zeichenfläche" kopf onClose={onClose} breit>
      <table className="kuerzel-tabelle">
        <tbody>
          {KUERZEL.map(([k, w]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td>{w}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="dialog-buttons">
        <button className="primary" autoFocus onClick={onClose}>
          Schließen
        </button>
      </div>
    </Modal>
  );
}

function ScaleBar({ scale }: { scale: number }) {
  const candidates = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
  const len = candidates.find((c) => c * scale >= 80) ?? 500;
  return (
    <div className="scalebar">
      <div className="scalebar-bar" style={{ width: len * scale }} />
      <span>{String(len).replace('.', ',')} m</span>
    </div>
  );
}

function CalibrationDialog({ measured, onApply, onCancel, kontrolle = false }: { measured: number; onApply: (v: number) => void; onCancel: () => void; kontrolle?: boolean }) {
  const [val, setVal] = useState('');
  // mit Einheit: „12,00 m“, „1200 cm“, „12000 mm“ (ohne Einheit: Meter)
  const v = laengeAusText(val);
  const titel = kontrolle ? 'Kontrollmaß' : 'Plan kalibrieren';
  // gemeinsamer Dialog: Esc und Klick daneben brechen ab, der Fokus bleibt im Dialog, Kürzel der Zeichenfläche ruhen
  return (
    <Modal titel={titel} kopf onClose={onCancel} className="kalibrier-dialog">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (v && v > 0) onApply(v);
        }}
      >
        
        <p>
          Gemessene Strecke im aktuellen Maßstab: <strong>{fmt2(measured)} m</strong>
        </p>
        <label className="field">
          <span className="field-label">Tatsächliche Länge (mit Einheit, z. B. 12,00 m · 1200 cm · 12000 mm)</span>
          <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} placeholder="z. B. 10,00 m" />
        </label>
        {v ? (
          <p className="muted small-text">
            = {fmt2(v)} m{kontrolle ? ` · Abweichung ${((kontrollAbweichung(measured, v) * 100) || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 })} %` : ''}
          </p>
        ) : null}
        <div className="dialog-buttons">
          <button type="button" onClick={onCancel}>
            Abbrechen
          </button>
          <button type="submit" className="primary" disabled={!v || v <= 0}>
            Übernehmen
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Schnitt einer Hilfslinie mit der Kante, auf die gefangen wurde (`e` = Lotfußpunkt auf dieser Kante):
 * die Kante wird über die nächstgelegenen Kanten der Flächen bzw. des Plans in Reichweite gesucht.
 */
function kanteSchnitt(
  e: Point,
  raw: Point,
  l: Hilfslinie,
  shapes: Shape[],
  vectorGrid: ReturnType<typeof vectorSegmentGrid> | null,
  tol: number,
): Point | null {
  const segs: [Point, Point][] = [];
  for (const s of shapes) {
    const n = s.points.length;
    for (let i = 0; i < n; i++) {
      const a = s.points[i];
      const b = s.points[(i + 1) % n];
      if (projectOnSegment(e, a, b).dist < 1e-6) segs.push([a, b]);
    }
  }
  if (vectorGrid) {
    for (const i of vectorGrid.query(e.x - 1e-6, e.y - 1e-6, e.x + 1e-6, e.y + 1e-6)) {
      const [x1, y1, x2, y2] = vectorGrid.seg(i);
      if (projectOnSegment(e, { x: x1, y: y1 }, { x: x2, y: y2 }).dist < 1e-6) segs.push([{ x: x1, y: y1 }, { x: x2, y: y2 }]);
    }
  }
  for (const [a, b] of segs) {
    const d = { x: b.x - a.x, y: b.y - a.y };
    const len = Math.hypot(d.x, d.y);
    if (len < 1e-9) continue;
    const den = l.d.x * d.y - l.d.y * d.x;
    if (Math.abs(den) < 1e-9 * len) continue;
    const t = ((a.x - l.p.x) * d.y - (a.y - l.p.y) * d.x) / den;
    const s = { x: l.p.x + l.d.x * t, y: l.p.y + l.d.y * t };
    const pr = projectOnSegment(s, a, b);
    if (pr.dist < 1e-6 && Math.hypot(s.x - raw.x, s.y - raw.y) <= tol * 1.5) return s;
  }
  return null;
}

/**
 * Dachflächen (Grate, First, Kehlen) und Zonen der lichten Höhe unter Dachformen (F-12): < 1 m schraffiert,
 * 1–2 m leicht getönt, Grenzen gestrichelt – im Geschoss mit Aufbauten aus den Geschosseigenschaften.
 */
function HoehenLayer({ storey, toScreen }: { storey: Storey; toScreen: (p: Point) => Point }) {
  const daten = useMemo(
    () =>
      storey.shapes
        .filter((s): s is OutlineShape => s.kind === 'outline' && !s.subtract && !!s.dach && s.dach.typ !== 'flach' && s.dach.typ !== 'modell')
        .map((u) => ({
          id: u.id,
          kanten: clippedPieces(u.dach!, u.points).map((p) => p.poly),
          zonen: hoehenZonen(u, u.points, { dachaufbau: storey.dachaufbau, fussbodenaufbau: storey.fussbodenaufbau }),
        })),
    [storey],
  );
  if (!daten.length) return null;
  const pfad = (pts: Point[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${toScreen(p).x},${toScreen(p).y}`).join('') + 'Z';
  return (
    <g pointerEvents="none" className="hoehen-layer">
      {daten.map((d) => (
        <g key={d.id}>
          {d.zonen
            .filter((z) => z.klasse !== 'h2')
            .map((z, i) => (
              <path key={`z${i}`} d={pfad(z.points)} className={`hoehen-zone hoehen-${z.klasse}`} />
            ))}
          {d.kanten.map((k, i) => (
            <path key={`k${i}`} d={pfad(k)} className="dach-kante" />
          ))}
        </g>
      ))}
    </g>
  );
}

/** Messkette mit Abschnittslängen, Summe, dx/dy/Winkel des letzten Abschnitts und ggf. Fläche (F-19) */
function MessAnzeige({
  mess,
  vorschau,
  toScreen,
  breite,
}: {
  mess: { punkte: Point[]; fertig: boolean; geschlossen: boolean };
  vorschau: Point | null;
  toScreen: (p: Point) => Point;
  breite: number;
}) {
  const punkte = vorschau ? [...mess.punkte, vorschau] : mess.punkte;
  if (punkte.length < 1) return null;
  const m = messung(punkte, mess.geschlossen);
  const sp = punkte.map(toScreen);
  const d = sp.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join('') + (mess.geschlossen ? 'Z' : '');
  const letzter = m.abschnitte[m.abschnitte.length - 1];
  const ende = sp[sp.length - 1];
  return (
    <g pointerEvents="none">
      {mess.geschlossen && <path d={d} className="mess-flaeche" />}
      <path d={d} className="measure-line" fill="none" />
      {sp.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} className="draft-point" />
      ))}
      {m.abschnitte.map((a, i) => {
        const p = sp[i];
        const q = sp[(i + 1) % sp.length];
        return (
          <text key={`l${i}`} x={(p.x + q.x) / 2} y={(p.y + q.y) / 2 - 8} textAnchor="middle" className="dim-label measure-label">
            {fmt2(a.laenge)} m
          </text>
        );
      })}
      {letzter &&
        (() => {
          const info = `${m.abschnitte.length > 1 ? `Σ ${fmt2(m.summe)} m · ` : ''}dx ${fmt2(letzter.dx)} · dy ${fmt2(letzter.dy)} · ${letzter.winkel.toLocaleString('de-DE', { maximumFractionDigits: 1 })}°${m.flaeche !== undefined ? ` · Fläche ${fmt2(m.flaeche)} m²` : ''}`;
          // rechts unter dem Endpunkt; reicht der Platz nicht, links davon
          const links = ende.x + 12 + textBreite(info, 13) > breite - 8;
          return (
            <text x={links ? ende.x - 12 : ende.x + 12} y={ende.y + 22} textAnchor={links ? 'end' : 'start'} className="dim-label measure-label mess-info">
              {info}
            </text>
          );
        })()}
    </g>
  );
}

/** Name des Menüs für Screenreader: „Raum 0.01 Bad“ bzw. „BGF-Umriss Anbau“, ohne Angaben nur die Art */
function menueName(s: Shape): string {
  const teile = s.kind === 'room' ? [s.nummer, s.name] : s.name && s.name !== 'BGF' ? [s.name] : [];
  return [s.kind === 'room' ? 'Raum' : 'BGF-Umriss', ...teile.map((t) => t?.trim()).filter(Boolean)].join(' ');
}

/** „Einfügen“ – gesperrt mit sichtbarem Grund, solange nichts kopiert ist */
function einfuegenPunkt(): MenuePunkt {
  const leer = ablageStatus().leer;
  return { text: 'Einfügen', symbol: 'einfuegen', hinweis: leer ? 'Nichts kopiert' : 'Strg+V', deaktiviert: leer, titel: leer ? 'Zuerst Flächen kopieren (Strg+C)' : undefined, aktion: () => void einfuegenAktion() };
}

/** Befehle für gewählte Flächen im Kontextmenü – dieselben wie die Tastenkürzel */
function flaechenMenue(): MenuePunkt[] {
  const st = useEditor.getState();
  const n = Math.max(st.selectedIds.length, 1);
  const flaechen = n > 1 ? `${n} Flächen` : 'Fläche';
  return [
    { text: `${flaechen} kopieren`, symbol: 'kopie', hinweis: 'Strg+C', aktion: () => void flaechenKopieren() },
    { text: `${flaechen} duplizieren`, hinweis: 'Strg+D', aktion: () => void flaechenDuplizieren() },
    einfuegenPunkt(),
    { trenner: true },
    { text: `${flaechen} löschen`, symbol: 'muell', hinweis: 'Entf', gefahr: true, aktion: () => void flaechenLoeschen() },
  ];
}
