import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent, ReactNode } from 'react';
import { fmt2, fmt3 } from '@core/format';
import { logger } from '@core/platform/log';
import { abschliessen, klick, punktVerschieben } from '../aktionen';
import { ebenenAbbildung, einpassen, fotoAbbildung, zoomen } from '../ansicht';
import type { Abbildung, Sicht } from '../ansicht';
import { bitmap } from '../bilder';
import { entzerrung, zuEbene, zuFoto } from '../geo/ebene';
import type { Entzerrung, Ergebnis } from '../geo/ebene';
import { mul } from '../geo/mat';
import type { Pt } from '../geo/mat';
import { bereichVon, flaecheVon, pixelGroesse } from '../geo/messen';
import { ECKEN, ECKEN_KURZ } from '../model';
import type { Ebene, Foto } from '../model';
import { Renderer } from '../render/gl';
import { aktuell, useEntz } from '../store';
import type { Auswahl } from '../store';

const log = logger('flaeche');

const LUPE = 168;
const LUPE_ZOOM = 4;
/** Fangradius in Bildschirmpixeln */
const FANG = 9;

type Ziehen = { art: 'pan'; start: Pt; sicht: Sicht; bewegt: boolean; klickBeiEnde: boolean } | { art: 'punkt'; a: Auswahl; bewegt: boolean };

export function Arbeitsflaeche() {
  const doc = useEntz((s) => s.doc);
  const fotoId = useEntz((s) => s.fotoId);
  const ebeneId = useEntz((s) => s.ebeneId);
  const bilder = useEntz((s) => s.bilder);
  const gewuenscht = useEntz((s) => s.ansicht);
  const werkzeug = useEntz((s) => s.werkzeug);
  const auswahl = useEntz((s) => s.auswahl);
  const entwurf = useEntz((s) => s.entwurf);
  const korrigiert = useEntz((s) => s.korrigiert);
  const { foto, ebene } = aktuell({ doc, fotoId, ebeneId });

  const ergebnis: Ergebnis | null = useMemo(() => (foto && ebene ? entzerrung(foto, ebene) : null), [foto, ebene]);
  const entz = ergebnis?.ok ? ergebnis.e : null;
  const ansicht = gewuenscht === 'entzerrt' && entz ? 'entzerrt' : 'foto';

  const huelle = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const renderer = useRef<Renderer | null>(null);
  const [glFehler, setGlFehler] = useState<string | null>(null);
  const [geladen, setGeladen] = useState<string | null>(null);
  const [groesse, setGroesse] = useState({ w: 0, h: 0 });
  const [maus, setMaus] = useState<Pt | null>(null);
  const [shift, setShift] = useState(false);
  const leertaste = useRef(false);
  const ziehen = useRef<Ziehen | null>(null);
  const [, neuZeichnen] = useState(0);

  // ---------- Größe und Renderer ----------
  useLayoutEffect(() => {
    const el = huelle.current!;
    const ro = new ResizeObserver(() => setGroesse({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setGroesse({ w: el.clientWidth, h: el.clientHeight });
    try {
      renderer.current = new Renderer(canvas.current!);
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      log.error('WebGL nicht verfügbar', text);
      setGlFehler(text);
    }
    return () => {
      ro.disconnect();
      renderer.current?.freigeben();
      renderer.current = null;
    };
  }, []);

  // Foto als Textur laden
  useEffect(() => {
    const r = renderer.current;
    if (!r || !foto || !bilder[foto.id]) return;
    let aktiv = true;
    setGeladen(null);
    bitmap(foto.id, bilder[foto.id], foto.mime)
      .then(async (b) => {
        if (!aktiv) return;
        await r.setzeFoto(b, foto.breite, foto.hoehe);
        if (aktiv) setGeladen(foto.id);
      })
      .catch((e) => log.error(`Foto „${foto.name}“ konnte nicht geladen werden`, e));
    return () => {
      aktiv = false;
    };
    // nur bei anderem Foto neu laden, nicht bei jeder Änderung daran
  }, [foto?.id, bilder]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Sicht je Foto, Ansicht und Ebene ----------
  const sichten = useRef(new Map<string, Sicht>());
  const schluessel = `${foto?.id}|${ansicht}|${ansicht === 'entzerrt' ? ebene?.id : ''}`;
  const einpassenJetzt = useCallback((): Sicht | null => {
    if (!foto || groesse.w < 10) return null;
    if (ansicht === 'entzerrt' && entz && ebene) return einpassen(bereichVon(entz, foto, ebene), groesse.w, groesse.h, true);
    return einpassen({ x0: 0, y0: 0, x1: foto.breite, y1: foto.hoehe }, groesse.w, groesse.h, false);
  }, [foto, ebene, entz, ansicht, groesse]);
  let sicht = sichten.current.get(schluessel) ?? null;
  if (!sicht) {
    sicht = einpassenJetzt();
    if (sicht) sichten.current.set(schluessel, sicht);
  }
  const setzeSicht = (s: Sicht) => {
    sichten.current.set(schluessel, s);
    neuZeichnen((v) => v + 1);
  };
  // Einpassen auf Anforderung (Toolbar, Taste „Pos1“)
  useEffect(() => {
    const f = () => {
      const s = einpassenJetzt();
      if (s) setzeSicht(s);
    };
    window.addEventListener('entz:einpassen', f);
    return () => window.removeEventListener('entz:einpassen', f);
  });

  const abb: Abbildung | null = useMemo(() => {
    if (!foto || !sicht) return null;
    return ansicht === 'entzerrt' && entz ? ebenenAbbildung(entz, sicht) : fotoAbbildung(foto, sicht, korrigiert);
  }, [foto, sicht, ansicht, entz, korrigiert]);

  const lupeAn = !!maus && (werkzeug !== 'auswahl' || ziehen.current?.art === 'punkt');
  const lupePos = maus
    ? {
        x: maus.x + 22 + LUPE > groesse.w ? maus.x - 22 - LUPE : maus.x + 22,
        y: maus.y - 22 - LUPE < 0 ? maus.y + 22 : maus.y - 22 - LUPE,
      }
    : null;

  // ---------- Zeichnen (WebGL) ----------
  useEffect(() => {
    const r = renderer.current;
    const c = canvas.current;
    if (!r || !c) return;
    const id = requestAnimationFrame(() => {
      const dpr = window.devicePixelRatio || 1;
      const bw = Math.max(1, Math.round(groesse.w * dpr));
      const bh = Math.max(1, Math.round(groesse.h * dpr));
      if (c.width !== bw || c.height !== bh) {
        c.width = bw;
        c.height = bh;
      }
      r.leeren(bh);
      if (!abb || !r.hatFoto || geladen !== foto?.id) return;
      r.zeichnen({ m: abb.gl, kamera: abb.kamera, x: 0, y: 0, breite: bw, hoehe: bh, dpr }, bh);
      if (lupeAn && maus && lupePos) {
        const o = LUPE / (2 * LUPE_ZOOM);
        const lupe = mul(abb.gl, [1 / LUPE_ZOOM, 0, maus.x - o, 0, 1 / LUPE_ZOOM, maus.y - o, 0, 0, 1]);
        r.zeichnen(
          { m: lupe, kamera: abb.kamera, x: Math.round(lupePos.x * dpr), y: Math.round(lupePos.y * dpr), breite: Math.round(LUPE * dpr), hoehe: Math.round(LUPE * dpr), dpr, leer: [0.55, 0.55, 0.55, 1] },
          bh,
        );
      }
    });
    return () => cancelAnimationFrame(id);
  });

  // ---------- Mausrad (nicht passiv, damit die Seite nicht scrollt) ----------
  const sichtRef = useRef(sicht);
  sichtRef.current = sicht;
  useEffect(() => {
    const el = svg.current!;
    const rad = (e: WheelEvent) => {
      e.preventDefault();
      const s = sichtRef.current;
      if (!s) return;
      const r = el.getBoundingClientRect();
      const f = Math.pow(1.0018, -e.deltaY * (e.deltaMode === 1 ? 30 : 1));
      setzeSicht(zoomen(s, f, { x: e.clientX - r.left, y: e.clientY - r.top }));
    };
    el.addEventListener('wheel', rad, { passive: false });
    return () => el.removeEventListener('wheel', rad);
  });

  // ---------- Tasten für Verschieben und Orthogonalmodus ----------
  useEffect(() => {
    const runter = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShift(true);
      if (e.key === ' ' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        leertaste.current = true;
        e.preventDefault();
      }
    };
    const hoch = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShift(false);
      if (e.key === ' ') leertaste.current = false;
    };
    window.addEventListener('keydown', runter);
    window.addEventListener('keyup', hoch);
    return () => {
      window.removeEventListener('keydown', runter);
      window.removeEventListener('keyup', hoch);
    };
  }, []);

  // ---------- Punkte mit Fang und Orthogonalmodus ----------
  const fangPunkte = useMemo(() => {
    if (ansicht !== 'entzerrt' || !ebene) return [] as Pt[];
    return ebene.messungen.flatMap((m) => m.punkte);
  }, [ansicht, ebene]);

  /** Bildschirmpunkt → Fotopunkt; `vorher`: vorheriger Punkt (für Shift = waagerecht/senkrecht in der Ebene) */
  const punktAus = (s: Pt, vorher: Pt | null, ohne?: Pt): Pt | null => {
    if (!abb) return null;
    if (ansicht === 'entzerrt' && entz) {
      let best: Pt | null = null;
      let bestD = FANG;
      for (const p of fangPunkte) {
        if (p === ohne) continue;
        const q = abb.zuSchirm(p);
        if (!q) continue;
        const d = Math.hypot(q.x - s.x, q.y - s.y);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      if (best) return best;
      if (shift && vorher && abb.schirmZuEbene) {
        const v = zuEbene(entz, vorher);
        const q = abb.schirmZuEbene(s);
        const r = Math.abs(q.x - v.x) >= Math.abs(q.y - v.y) ? { x: q.x, y: v.y } : { x: v.x, y: q.y };
        const p = zuFoto(entz, r);
        return p.w > 0 ? { x: p.x, y: p.y } : null;
      }
    }
    const p = abb.vonSchirm(s);
    return p ? { x: p.x, y: p.y } : null;
  };

  const lokal = (e: { clientX: number; clientY: number }): Pt => {
    const r = svg.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** Nachbarpunkt für den Orthogonalmodus beim Ziehen */
  const nachbar = (a: Auswahl): Pt | null => {
    if (!ebene || a.art !== 'messung' || a.index === undefined) return null;
    const m = ebene.messungen.find((x) => x.id === a.id);
    if (!m) return null;
    return m.punkte[a.index - 1] ?? m.punkte[a.index + 1] ?? null;
  };

  const zeigerRunter = (e: RPointerEvent<SVGSVGElement>) => {
    if (!sicht) return;
    svg.current!.setPointerCapture(e.pointerId);
    const p = lokal(e);
    const pan = e.button === 1 || (e.button === 0 && leertaste.current);
    if (e.button === 0 || pan) {
      ziehen.current = { art: 'pan', start: p, sicht, bewegt: false, klickBeiEnde: !pan };
    }
  };

  const griffRunter = (e: RPointerEvent, a: Auswahl) => {
    if (e.button !== 0 || leertaste.current) return;
    const ziehbar = werkzeug === 'auswahl' || (ansicht === 'foto' && entwurf.length === 0);
    if (!ziehbar) return; // Klick geht an die Fläche (Fang)
    e.stopPropagation();
    useEntz.getState().setze({ auswahl: a });
    // Linien nur auswählen, Punkte auch ziehen
    if (a.index === undefined && a.art !== 'passpunkt') return;
    svg.current!.setPointerCapture(e.pointerId);
    ziehen.current = { art: 'punkt', a, bewegt: false };
  };

  const zeigerBewegt = (e: RPointerEvent<SVGSVGElement>) => {
    const p = lokal(e);
    setMaus(p);
    const z = ziehen.current;
    if (!z) return;
    if (z.art === 'pan') {
      const dx = p.x - z.start.x;
      const dy = p.y - z.start.y;
      if (!z.bewegt && Math.hypot(dx, dy) < 4) return;
      z.bewegt = true;
      setzeSicht({ ...z.sicht, ox: z.sicht.ox + dx, oy: z.sicht.oy + dy });
    } else {
      const q = punktAus(p, nachbar(z.a), aktuellerPunkt(z.a));
      if (!q) return;
      if (!z.bewegt) useEntz.getState().merken();
      z.bewegt = true;
      punktVerschieben(z.a, q);
    }
  };

  const zeigerHoch = (e: RPointerEvent<SVGSVGElement>) => {
    const z = ziehen.current;
    ziehen.current = null;
    if (!z || z.art !== 'pan' || z.bewegt || !z.klickBeiEnde) return;
    const s = lokal(e);
    // Doppelklick erzeugt zwei Klicks – denselben Punkt nicht doppelt setzen
    const letzter = entwurf[entwurf.length - 1];
    const ls = letzter && abb?.zuSchirm(letzter);
    if (ls && Math.hypot(ls.x - s.x, ls.y - s.y) < 4) return;
    const q = punktAus(s, letzter ?? null);
    if (q) klick(q);
  };

  const aktuellerPunkt = (a: Auswahl): Pt | undefined => {
    if (!ebene || a.art !== 'messung') return undefined;
    return ebene.messungen.find((m) => m.id === a.id)?.punkte[a.index ?? 0];
  };

  // ---------- Overlay ----------
  const elemente: ReactNode[] = [];
  if (abb && foto) {
    if (ansicht === 'foto') fotoOverlay(elemente, abb, foto, ebene, ergebnis, auswahl, griffRunter);
    else if (ebene && entz) ebenenOverlay(elemente, abb, ebene, auswahl, griffRunter, (m) => entzMesswerte(entz, m));
    entwurfOverlay(elemente, abb, entwurf, maus && !ziehen.current ? punktAus(maus, entwurf[entwurf.length - 1] ?? null) : null, werkzeug, ansicht === 'entzerrt' && entz ? (p) => zuEbene(entz, p) : null);
  }

  // Statuszeile
  let status = '';
  if (maus && abb && foto) {
    if (ansicht === 'entzerrt' && entz && abb.schirmZuEbene) {
      const q = abb.schirmZuEbene(maus);
      const p = abb.vonSchirm(maus);
      const px = p ? pixelGroesse(entz, p) : NaN;
      status = `x ${fmt3(q.x)} m   y ${fmt3(q.y)} m${Number.isFinite(px) ? `   ·   ein Fotopixel ≈ ${fmt2(px * 1000)} mm` : ''}`;
    } else {
      const p = abb.vonSchirm(maus);
      if (p) status = `${Math.round(p.x)} × ${Math.round(p.y)} px`;
    }
  }
  const hinweis = werkzeugHinweis(werkzeug, ebene, entwurf.length, shift);

  return (
    <div className="ef-flaeche" ref={huelle}>
      <canvas ref={canvas} className="ef-canvas" />
      <svg
        ref={svg}
        className={`ef-overlay wz-${werkzeug}`}
        onPointerDown={zeigerRunter}
        onPointerMove={zeigerBewegt}
        onPointerUp={zeigerHoch}
        onPointerLeave={() => !ziehen.current && setMaus(null)}
        onDoubleClick={() => abschliessen()}
        onContextMenu={(e) => {
          e.preventDefault();
          abschliessen();
        }}
      >
        {lupeAn && lupePos && (
          <mask id="ef-ohne-lupe">
            <rect x={0} y={0} width={groesse.w} height={groesse.h} fill="white" />
            <rect x={lupePos.x} y={lupePos.y} width={LUPE} height={LUPE} fill="black" />
          </mask>
        )}
        <g mask={lupeAn ? 'url(#ef-ohne-lupe)' : undefined}>{elemente}</g>
        {lupeAn && lupePos && (
          <g className="ef-lupe" pointerEvents="none">
            <rect x={lupePos.x} y={lupePos.y} width={LUPE} height={LUPE} />
            <path d={`M${lupePos.x + LUPE / 2} ${lupePos.y + 8}V${lupePos.y + LUPE / 2 - 6}M${lupePos.x + LUPE / 2} ${lupePos.y + LUPE / 2 + 6}V${lupePos.y + LUPE - 8}M${lupePos.x + 8} ${lupePos.y + LUPE / 2}H${lupePos.x + LUPE / 2 - 6}M${lupePos.x + LUPE / 2 + 6} ${lupePos.y + LUPE / 2}H${lupePos.x + LUPE - 8}`} />
          </g>
        )}
      </svg>
      {!foto && <div className="canvas-message">Foto hinzufügen (Schaltfläche oben oder Datei hierher ziehen).</div>}
      {glFehler && <div className="canvas-message">Darstellung nicht möglich: {glFehler}</div>}
      {foto && (status || hinweis) && (
        <div className="ef-status">
          {hinweis && <span>{hinweis}</span>}
          {status && <span className="ef-koord">{status}</span>}
        </div>
      )}
    </div>
  );
}

function entzMesswerte(e: Entzerrung, m: Pt[]) {
  return m.map((p) => zuEbene(e, p));
}

function werkzeugHinweis(w: string, ebene: Ebene | null, n: number, shift: boolean): string {
  switch (w) {
    case 'ecken': {
      const i = ebene?.rechteck.ecken.length ?? 0;
      return i < 4 ? `Ecke ${ECKEN[i]} des Rechtecks anklicken` : 'Alle vier Ecken gesetzt – zum Verschieben ziehen';
    }
    case 'passpunkt':
      return 'Passpunkt anklicken, dann rechts seine Koordinaten eintragen';
    case 'waagerecht':
      return n ? 'Endpunkt der waagerechten Kante' : 'Waagerechte Kante: Anfangspunkt anklicken';
    case 'senkrecht':
      return n ? 'Endpunkt der senkrechten Kante' : 'Senkrechte Kante: Anfangspunkt anklicken';
    case 'mass':
      return n ? 'Endpunkt des bekannten Maßes' : 'Bekanntes Maß: Anfangspunkt anklicken';
    case 'hilfslinie':
      return n >= 3 ? 'Weitere Punkte auf der Kante – Enter, Doppel- oder Rechtsklick beendet' : 'Punkte entlang einer Kante setzen, die in Wirklichkeit gerade ist (am besten nahe am Bildrand)';
    case 'strecke':
      return `${n ? 'Endpunkt' : 'Anfangspunkt'} der Strecke${shift ? ' (waagerecht/senkrecht)' : ' – Umschalt: waagerecht/senkrecht'}`;
    case 'linienzug':
    case 'flaeche':
      return `Punkte setzen – Enter, Doppel- oder Rechtsklick beendet${shift ? ' (waagerecht/senkrecht)' : ', Umschalt: waagerecht/senkrecht'}`;
    case 'ausschnitt':
      return n ? 'Gegenüberliegende Ecke des Ausschnitts' : 'Erste Ecke des Ausschnitts anklicken';
    default:
      return '';
  }
}

// ---------- Overlay-Bausteine ----------

type GriffRunter = (e: RPointerEvent, a: Auswahl) => void;

function pfad(punkte: (Pt | null)[], zu = false): string {
  let d = '';
  let offen = false;
  for (const p of punkte) {
    if (!p) {
      offen = false;
      continue;
    }
    d += `${offen ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    offen = true;
  }
  return zu && d ? `${d}Z` : d;
}

function griff(key: string, p: Pt | null, a: Auswahl, auswahl: Auswahl | null, runter: GriffRunter, klasse = '') {
  if (!p) return null;
  const sel = auswahl?.art === a.art && auswahl.id === a.id && (auswahl.index === undefined || auswahl.index === a.index);
  return <circle key={key} className={`ef-griff ${klasse} ${sel ? 'sel' : ''}`} cx={p.x} cy={p.y} r={5} onPointerDown={(e) => runter(e, a)} />;
}

function beschriftung(key: string, p: Pt | null, text: string, klasse = '', dy = -8) {
  if (!p) return null;
  return (
    <text key={key} className={`ef-text ${klasse}`} x={p.x} y={p.y + dy} textAnchor="middle">
      {text}
    </text>
  );
}

const ist = (auswahl: Auswahl | null, art: Auswahl['art'], id: string) => auswahl?.art === art && auswahl.id === id;

function fotoOverlay(el: ReactNode[], abb: Abbildung, foto: Foto, ebene: Ebene | null, ergebnis: Ergebnis | null, auswahl: Auswahl | null, runter: GriffRunter) {
  const S = abb.zuSchirm;
  for (const l of foto.hilfslinien) {
    const pts = l.punkte.map(S);
    const sel = ist(auswahl, 'hilfslinie', l.id);
    el.push(<path key={`h${l.id}`} className={`ef-hilfslinie ${sel ? 'sel' : ''}`} d={pfad(pts)} onPointerDown={(e) => runter(e, { art: 'hilfslinie', id: l.id })} />);
    pts.forEach((p, i) => el.push(griff(`h${l.id}-${i}`, p, { art: 'hilfslinie', id: l.id, index: i }, auswahl, runter, 'klein')));
  }
  if (!ebene) return;
  const residuum = (id: string) => (ergebnis?.ok ? ergebnis.e.residuen.find((r) => r.id === id) : undefined);
  if (ebene.methode === 'rechteck') {
    const pts = ebene.rechteck.ecken.map(S);
    el.push(<path key="r" className="ef-ref" d={pfad(pts, pts.length === 4)} />);
    pts.forEach((p, i) => {
      el.push(griff(`r${i}`, p, { art: 'ecke', id: ebene.id, index: i }, auswahl, runter));
      el.push(beschriftung(`rt${i}`, p, ECKEN_KURZ[i], 'ref'));
    });
  } else if (ebene.methode === 'passpunkte') {
    ebene.passpunkte.forEach((pp, i) => {
      const p = S(pp.bild);
      if (!p) return;
      const r = residuum(pp.id);
      const fehlt = pp.x === undefined || pp.y === undefined;
      el.push(<path key={`pk${pp.id}`} className={`ef-kreuz ${fehlt ? 'fehlt' : ''}`} d={`M${p.x - 11} ${p.y}h7m8 0h7M${p.x} ${p.y - 11}v7m0 8v7`} />);
      el.push(griff(`p${pp.id}`, p, { art: 'passpunkt', id: pp.id }, auswahl, runter));
      el.push(beschriftung(`pt${pp.id}`, p, `P${i + 1}${r ? ` · ${fmt2(r.wert * 1000)} mm` : ''}`, 'ref', -12));
    });
  } else {
    const f = ebene.fluchtlinien;
    const linien = (liste: { id: string; a: Pt; b: Pt }[], art: 'waagerecht' | 'senkrecht' | 'mass', kuerzel: string, text?: (i: number) => string) =>
      liste.forEach((l, i) => {
        const a = S(l.a);
        const b = S(l.b);
        const sel = ist(auswahl, art, l.id);
        el.push(<path key={`${art}${l.id}`} className={`ef-linie ef-${art} ${sel ? 'sel' : ''}`} d={pfad([a, b])} onPointerDown={(e) => runter(e, { art, id: l.id })} />);
        el.push(griff(`${art}${l.id}a`, a, { art, id: l.id, index: 0 }, auswahl, runter, 'klein'));
        el.push(griff(`${art}${l.id}b`, b, { art, id: l.id, index: 1 }, auswahl, runter, 'klein'));
        if (a && b) el.push(beschriftung(`${art}${l.id}t`, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, text ? text(i) : `${kuerzel}${i + 1}`, art));
      });
    linien(f.waagerecht, 'waagerecht', 'W');
    linien(f.senkrecht, 'senkrecht', 'S');
    linien(f.masse, 'mass', 'M', (i) => {
      const m = f.masse[i];
      return m.laenge ? `${fmt2(m.laenge)} m` : `M${i + 1}: Länge?`;
    });
  }
}

function ebenenOverlay(el: ReactNode[], abb: Abbildung, ebene: Ebene, auswahl: Auswahl | null, runter: GriffRunter, inEbene: (p: Pt[]) => Pt[]) {
  const S = abb.zuSchirm;
  const E = abb.ebeneZuSchirm!;
  // Bezug blass zur Orientierung
  if (ebene.methode === 'rechteck' && ebene.rechteck.ecken.length === 4) el.push(<path key="bez" className="ef-bezug" d={pfad(ebene.rechteck.ecken.map(S), true)} />);
  if (ebene.methode === 'fluchtlinien') ebene.fluchtlinien.masse.forEach((m) => el.push(<path key={`bez${m.id}`} className="ef-bezug" d={pfad([S(m.a), S(m.b)])} />));
  if (ebene.methode === 'passpunkte') {
    ebene.passpunkte.forEach((pp) => {
      const p = S(pp.bild);
      if (p) el.push(<path key={`bez${pp.id}`} className="ef-bezug" d={`M${p.x - 6} ${p.y}h12M${p.x} ${p.y - 6}v12`} />);
    });
  }
  if (ebene.ausschnitt) {
    const a = ebene.ausschnitt;
    const p = E({ x: a.x0, y: a.y1 });
    const q = E({ x: a.x1, y: a.y0 });
    el.push(<rect key="aus" className="ef-ausschnitt" x={p.x} y={p.y} width={q.x - p.x} height={q.y - p.y} />);
  }
  for (const m of ebene.messungen) {
    const pts = m.punkte.map(S);
    const ep = inEbene(m.punkte);
    const zu = m.art === 'flaeche';
    const sel = ist(auswahl, 'messung', m.id);
    el.push(<path key={`m${m.id}`} className={`ef-messung ef-${m.art} ${sel ? 'sel' : ''}`} d={pfad(pts, zu)} onPointerDown={(e) => runter(e, { art: 'messung', id: m.id })} />);
    const n = zu ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (!a || !b) continue;
      const l = Math.hypot(ep[(i + 1) % ep.length].x - ep[i].x, ep[(i + 1) % ep.length].y - ep[i].y);
      el.push(segmentText(`m${m.id}s${i}`, a, b, `${fmt2(l)}`, m.art === 'flaeche' ? 'klein' : ''));
    }
    if (zu && pts.length > 2 && pts.every(Boolean)) {
      const c = { x: pts.reduce((s, p) => s + p!.x, 0) / pts.length, y: pts.reduce((s, p) => s + p!.y, 0) / pts.length };
      el.push(beschriftung(`m${m.id}f`, c, `${fmt2(flaecheVon(ep))} m²`, 'flaeche', 4));
    }
    pts.forEach((p, i) => el.push(griff(`m${m.id}-${i}`, p, { art: 'messung', id: m.id, index: i }, auswahl, runter, 'klein')));
  }
}

/** Beschriftung parallel zum Abschnitt, lesbar von unten bzw. rechts */
function segmentText(key: string, a: Pt, b: Pt, text: string, klasse = '') {
  let w = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (w > 90) w -= 180;
  if (w < -90) w += 180;
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (Math.hypot(b.x - a.x, b.y - a.y) < 28) return null;
  return (
    <text key={key} className={`ef-text mass ${klasse}`} x={m.x} y={m.y - 5} textAnchor="middle" transform={`rotate(${w.toFixed(1)} ${m.x.toFixed(1)} ${m.y.toFixed(1)})`}>
      {text}
    </text>
  );
}

function entwurfOverlay(el: ReactNode[], abb: Abbildung, entwurf: Pt[], cursor: Pt | null, werkzeug: string, inEbene: ((p: Pt) => Pt) | null) {
  if (!entwurf.length && !cursor) return;
  const pts = [...entwurf, ...(cursor && werkzeug !== 'auswahl' ? [cursor] : [])];
  const s = pts.map(abb.zuSchirm);
  if (werkzeug === 'ausschnitt' && s.length === 2 && s[0] && s[1] && abb.ebeneZuSchirm && inEbene) {
    const a = inEbene(pts[0]);
    const b = inEbene(pts[1]);
    const p = abb.ebeneZuSchirm({ x: Math.min(a.x, b.x), y: Math.max(a.y, b.y) });
    const q = abb.ebeneZuSchirm({ x: Math.max(a.x, b.x), y: Math.min(a.y, b.y) });
    el.push(<rect key="ew" className="ef-ausschnitt entwurf" x={p.x} y={p.y} width={q.x - p.x} height={q.y - p.y} />);
    return;
  }
  if (entwurf.length) el.push(<path key="ew" className="ef-entwurf" d={pfad(s, werkzeug === 'flaeche' && s.length > 2)} />);
  s.slice(0, entwurf.length).forEach((p, i) => p && el.push(<circle key={`ew${i}`} className="ef-entwurf-punkt" cx={p.x} cy={p.y} r={3.5} />));
  // Länge des laufenden Abschnitts bzw. laufende Fläche
  if (inEbene && entwurf.length && cursor) {
    const a = s[s.length - 2];
    const b = s[s.length - 1];
    const ea = inEbene(pts[pts.length - 2]);
    const eb = inEbene(pts[pts.length - 1]);
    if (a && b) el.push(segmentText('ewl', a, b, fmt2(Math.hypot(eb.x - ea.x, eb.y - ea.y))));
    if (werkzeug === 'flaeche' && pts.length > 2 && b) el.push(beschriftung('ewf', b, `${fmt2(flaecheVon(pts.map(inEbene)))} m²`, 'flaeche', 22));
  }
}
