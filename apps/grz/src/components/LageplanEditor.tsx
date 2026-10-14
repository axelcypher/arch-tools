import { zeichenKuerzelErlaubt } from '@core/platform/eingabe';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Hilfslinie } from '@core/fang';
import { achsBeschraenkt, achsRechteck, eckpunktHilfslinien, gebaeudeAchse, hilfslinienFang, zeichenHilfslinien } from '@core/fang';
import type { Point } from '@core/geometry';
import { bounds, pointInPolygon, polygonArea } from '@core/geometry';
import { nutzungLabel, versiegelungInfo } from '@core/lageplan';
import { createLageplanFlaeche } from '@core/model';
import type { Nachweis } from '../massNutzung';
import { addFlaeche, auswahlVerschieben, flaechenDuplizieren, flaechenEinfuegen, flaechenKopieren, mapFlaeche, removeFlaeche, useGrz } from '../store';
import type { Werkzeug } from '../store';

interface Ausschnitt {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Fangradius in Bildschirmpixeln */
const FANG_PX = 10;
/** Mindestweg in Pixeln, ab dem ein Ziehen beginnt (sonst Klick) */
const ZIEH_PX = 3;

/** Werkzeuge und Tasten wie im Flächenrechner */
const WERKZEUGE: { id: Werkzeug; label: string; taste: string; hint: string }[] = [
  {
    id: 'auswahl',
    label: 'Auswahl',
    taste: 'V',
    hint: 'Klicken: auswählen · Umschalt+Klick/-Rahmen: mehrere · Strg+A: alle · Pfeiltasten: verschieben (Umschalt: 10 cm) · Strg+C/V/D: kopieren/einfügen/duplizieren · Ziehen: verschieben · Punkt ziehen: ändern (Umschalt während des Ziehens: entlang der Gebäudeachse) · ◇ ziehen: Punkt einfügen · Rechtsklick auf Punkt: löschen · Entf: löschen',
  },
  { id: 'polygon', label: 'Polygon', taste: 'P', hint: 'Klicken: nächster Punkt · Enter/Doppelklick/Startpunkt: schließen · Umschalt: entlang der Gebäudeachse · Rück: letzten Punkt löschen · Esc: abbrechen' },
  { id: 'rechteck', label: 'Rechteck', taste: 'R', hint: 'Erste Ecke setzen, dann Gegenecke klicken – ausgerichtet an der Gebäudeachse' },
];

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
  const st = useGrz.getState();
  const flaechen = project.lageplan?.flaechen ?? [];
  const svgRef = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [linien, setLinien] = useState<Hilfslinie[]>([]);
  const [rahmen, setRahmen] = useState<[Point, Point] | null>(null);
  const ziehen = useRef<Ziehen | null>(null);
  // Vorschau beim Ziehen (Punkte der gezogenen Flächen)
  const [vorschau, setVorschau] = useState<Map<string, Point[]> | null>(null);
  const [leertaste, setLeertaste] = useState(false);

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

  useEffect(() => setDraft([]), [werkzeug]);

  // Mausrad zoomt nur den Plan – die Seite darf dabei nicht scrollen (React-Handler sind passiv)
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
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
    const r = svgRef.current?.getBoundingClientRect();
    return Math.max(vb.w / (r?.width || 600), vb.h / (r?.height || 400));
  };
  const toWorld = (e: { clientX: number; clientY: number }): Point => weltpunkt(vb, svgRef.current?.getBoundingClientRect(), e.clientX, e.clientY);

  const fangpunkte = useMemo(() => [...n.hauptanlagePolygone.flat(), ...flaechen.flatMap((f) => f.points)], [n.hauptanlagePolygone, flaechen]);
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
  const fang = (p: Point, o: { ohne?: Point; hilfslinien?: Hilfslinie[]; alt?: boolean } = {}): Point => {
    setLinien([]);
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
    const h = o.hilfslinien?.length ? hilfslinienFang(p, o.hilfslinien, FANG_PX * skala()) : null;
    if (h) {
      setLinien(h.linien);
      return h.p;
    }
    return p;
  };

  const fertig = (pts: Point[]) => {
    setDraft([]);
    if (pts.length < 3 || polygonArea(pts) < 0.05) return;
    const f = createLageplanFlaeche(pts, `Fläche ${flaechen.length + 1}`);
    st.update((p) => addFlaeche(p, f));
    st.select(f.id);
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
          : fang(roh, { ohne: z.orig[z.index], hilfslinien: eckpunktHilfslinien(z.orig, z.index, theta), alt: e.altKey });
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
      setCursor(e.shiftKey && letzter ? achsBeschraenkt(letzter, roh, theta) : fang(roh, { hilfslinien: zeichenHilfslinien(draft, theta), alt: e.altKey }));
    }
  };

  const onPointerUp = () => {
    const z = ziehen.current;
    ziehen.current = null;
    const v = vorschau;
    setVorschau(null);
    setLinien([]);
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
    const p = e.shiftKey && letzter ? achsBeschraenkt(letzter, roh, theta) : fang(roh, { hilfslinien: zeichenHilfslinien(draft, theta), alt: e.altKey });
    if (werkzeug === 'rechteck') {
      if (!draft.length) setDraft([p]);
      else fertig(achsRechteck(draft[0], p, theta));
      return;
    }
    // Polygon: Klick auf den ersten Punkt schließt
    if (draft.length >= 3 && Math.hypot(p.x - draft[0].x, p.y - draft[0].y) < FANG_PX * skala()) fertig(draft);
    else setDraft([...draft, p]);
  };

  const onDoubleClick = () => {
    if (werkzeug === 'polygon' && draft.length >= 3) fertig(draft);
  };

  // Tastatur wie im Flächenrechner
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!zeichenKuerzelErlaubt(e)) return;
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
          if (werkzeug === 'polygon' && draft.length >= 3) fertig(draft);
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
  const entwurf = draft.length && cursor ? (werkzeug === 'rechteck' ? achsRechteck(draft[0], cursor, theta) : [...draft, cursor]) : draft;
  // Eckpunkte nur bei genau einer gewählten Fläche
  const sel = werkzeug === 'auswahl' && selectedIds.length <= 1 ? flaechen.find((f) => f.id === selected) : undefined;
  const selPts = sel ? punkteVon(sel.id, sel.points) : [];
  const cursorStil = ziehen.current?.art === 'pan' || leertaste ? 'grabbing' : werkzeug === 'auswahl' ? 'default' : 'crosshair';

  return (
    <div className="lp-editor">
      <div className="lp-tools">
        {WERKZEUGE.map((w) => (
          <button key={w.id} className={werkzeug === w.id ? 'small active' : 'small'} title={`${w.hint} (${w.taste})`} onClick={() => st.setWerkzeug(w.id)}>
            {w.label}
          </button>
        ))}
        <button className="small" title="Ansicht auf Gebäude und Flächen einpassen (F)" onClick={() => setVb(passend)}>
          Einpassen
        </button>
        <span className="muted small-text lp-hint">
          {WERKZEUGE.find((w) => w.id === werkzeug)!.hint} · Mausrad: zoomen · mittlere Maustaste oder Leertaste + Ziehen: verschieben
        </span>
      </div>
      <svg
        ref={svgRef}
        className={`grz-skizze lp-${werkzeug}`}
        style={{ cursor: cursorStil }}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onPointerDown={onPointerDown}
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
        {n.grundstueckPolygone.map((pts, i) => (
          <path key={`g${i}`} d={d(pts)} fill="none" stroke="#1f2328" strokeWidth={k * 2.5} strokeDasharray={`${k * 10} ${k * 3} ${k * 2} ${k * 3}`} pointerEvents="none" />
        ))}
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
        {entwurf.length > 0 && (
          <g pointerEvents="none">
            <path d={d(entwurf, werkzeug === 'rechteck' || entwurf.length > 2)} fill="var(--sel)" fillOpacity={0.12} stroke="var(--sel)" strokeWidth={k * 1.5} />
            {draft.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={k * (i === 0 ? 5 : 3.5)} fill="var(--panel)" stroke="var(--sel)" strokeWidth={k * 1.5} />
            ))}
          </g>
        )}
        {cursor && werkzeug !== 'auswahl' && <circle cx={cursor.x} cy={cursor.y} r={k * 3} fill="var(--sel)" pointerEvents="none" />}
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
    </div>
  );
}

/** Bildschirm → Plan (viewBox mit xMidYMid meet: Ausschnitt mittig, gleicher Maßstab in x und y) */
function weltpunkt(vb: Ausschnitt, r: DOMRect | undefined, clientX: number, clientY: number): Point {
  const wPx = r?.width || 600;
  const hPx = r?.height || 400;
  const s = Math.max(vb.w / wPx, vb.h / hPx);
  const x0 = vb.x - (wPx * s - vb.w) / 2;
  const y0 = vb.y - (hPx * s - vb.h) / 2;
  return { x: x0 + (clientX - (r?.left ?? 0)) * s, y: y0 + (clientY - (r?.top ?? 0)) * s };
}
