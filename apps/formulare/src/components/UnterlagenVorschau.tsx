import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import { useEscSchliessen } from '@core/ui/Dialog';
import type { AblageOrdner } from '../ablage';
import { dateiArt } from '../ablage';
import { antragsNameFehler, artDerFassung, BEREIT_TEXT, bereitschaft, istHilfsdatei } from '../antrag';
import { aktiveFassung, antragSperre, antragsOrdner, dateienVon, dokumentZu, namensschemaVon, projektCodes, useAntrag, zeilenFassung } from '../antragStore';
import type { Eintrag } from '../dateisystem';
import { oeffnePfad, verbinde } from '../dateisystem';
import { pdfOeffnen, pdfSchliessen } from '../dokumente/pdf';
import { useFormulare } from '../store';
import { Symbol } from './Symbol';

/** Zoomstufen der Vorschau (0 = Seitenbreite) */
export const VORSCHAU_ZOOM = [0, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];

/** Reihenfolge der Antragsunterlagen: zuerst die Dokumente des Antragsumfangs in ihrer Reihenfolge, dann der Rest */
export function unterlagenReihenfolge(dateien: Eintrag[], umfangDateien: string[]): Eintrag[] {
  const nurDateien = dateien.filter((d) => !d.ordner && !istHilfsdatei(d.pfad));
  const rang = (d: Eintrag) => {
    const i = umfangDateien.findIndex((n) => n.toLowerCase() === d.pfad.toLowerCase());
    return i < 0 ? umfangDateien.length : i;
  };
  return nurDateien.sort((a, b) => rang(a) - rang(b) || a.pfad.localeCompare(b.pfad, 'de', { numeric: true, sensitivity: 'base' }));
}

/**
 * Alle Antragsunterlagen (Ordner der aktiven Fassung) groß ansehen und durchblättern: ‹ › bzw. ← → oder Bild↑/↓
 * wechseln das Dokument, − + und die Auswahl zoomen (0 = Seitenbreite), Esc schließt. PDFs werden ganz gezeigt
 * (alle Seiten), Bilder ebenso; andere Dateien lassen sich im Programm öffnen. „Bereit“ lässt sich hier setzen.
 */
export function UnterlagenVorschau({ ablage, start, onClose }: { ablage: AblageOrdner; start?: string; onClose: () => void }) {
  const projekt = useFormulare((s) => s.projekt)!;
  const ds = useFormulare((s) => s.ds);
  useFormulare((s) => s.oap);
  const dateien = useAntrag((s) => s.dokumente);
  const roh = useAntrag((s) => s.dateien);
  const fassung = useAntrag((s) => aktiveFassung(s, projekt));
  const ordner = useAntrag((s) => antragsOrdner(s, projekt));
  const bereitJeFassung = useAntrag((s) => s.projektdatei?.bereit);
  const gesperrt = useAntrag((s) => !!antragSperre(s, projekt));
  // Fassung der gezeigten Liste – „bereit“ gilt nur für sie
  const listeFassung = useAntrag((s) => zeilenFassung(s, projekt));
  const basis = verbinde(ablage.root, ablage.pfad);
  // Reihenfolge des Antragsumfangs – die Pläne eines Plansatzes an seiner Stelle
  const liste = useMemo(() => unterlagenReihenfolge(roh, dateien.flatMap(dateienVon)), [roh, dateien]);
  const [index, setIndex] = useState(() => Math.max(0, start ? liste.findIndex((d) => d.pfad === start) : 0));
  const [zoom, setZoom] = useState(0);
  const [bytes, setBytes] = useState<{ pfad: string; daten: Uint8Array } | null>(null);
  const [fehler, setFehler] = useState('');
  useEscSchliessen(onClose);

  const aktuell = liste[Math.min(index, liste.length - 1)];
  const art = aktuell ? dateiArt(aktuell.pfad) : 'sonst';
  const schema = useFormulare(namensschemaVon);
  const fehlerName = aktuell ? antragsNameFehler(aktuell.pfad, { codes: projektCodes(projekt), art: artDerFassung(fassung), reihenfolge: schema.reihenfolge, schema }) : null;
  const zustand = aktuell
    ? bereitschaft(
        aktuell,
        bereitJeFassung?.[fassung]?.find((b) => b.datei.toLowerCase() === aktuell.pfad.toLowerCase()),
        fehlerName,
      )
    : 'offen';
  const dok = aktuell ? dokumentZu(dateien, aktuell.pfad) : undefined;

  // Datei lesen (nur PDFs und Bilder werden gezeigt)
  useEffect(() => {
    setFehler('');
    if (!ds || !aktuell || (art !== 'pdf' && art !== 'bild')) return setBytes(null);
    let aktiv = true;
    ds.lies(basis, `${ordner}/${aktuell.pfad}`)
      .then((d) => aktiv && setBytes(d ? { pfad: aktuell.pfad, daten: d } : null))
      .catch((e: unknown) => aktiv && setFehler(e instanceof Error ? e.message : String(e)));
    return () => {
      aktiv = false;
    };
  }, [ds, basis, ordner, aktuell?.pfad, art]); // eslint-disable-line react-hooks/exhaustive-deps

  const blaettern = (d: number) => setIndex((i) => Math.max(0, Math.min(liste.length - 1, i + d)));
  const zoomen = (d: number) => setZoom((z) => VORSCHAU_ZOOM[Math.max(0, Math.min(VORSCHAU_ZOOM.length - 1, VORSCHAU_ZOOM.indexOf(z) + d))]);
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') blaettern(1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') blaettern(-1);
      else if (e.key === '+' || e.key === '=') zoomen(1);
      else if (e.key === '-') zoomen(-1);
      else if (e.key === '0') setZoom(0);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  });

  // per Portal an <body>: die Navigation, in der die Ansicht „Antrag“ steht, ist ein Container (Containerabfrage) –
  // in manchen Browsern wäre position: fixed sonst auf sie beschränkt
  return createPortal(
    <div className="vs-ebene" role="dialog" aria-modal="true" aria-label="Antragsunterlagen ansehen">
      <header className="vs-leiste">
        <strong className="vs-titel">
          Antragsunterlagen <span className="muted">{ordner}</span>
        </strong>
        <span className="vs-blaettern">
          <button onClick={() => blaettern(-1)} disabled={index <= 0} title="Vorheriges Dokument (←, Bild↑)" aria-label="Vorheriges Dokument">
            ‹
          </button>
          <span className="vs-zaehler" aria-live="polite">
            {liste.length ? `${index + 1} / ${liste.length}` : '0 / 0'}
          </span>
          <button onClick={() => blaettern(1)} disabled={index >= liste.length - 1} title="Nächstes Dokument (→, Bild↓)" aria-label="Nächstes Dokument">
            ›
          </button>
        </span>
        <span className="vs-zoom">
          <button onClick={() => zoomen(-1)} disabled={zoom === VORSCHAU_ZOOM[0]} title="Verkleinern (−)" aria-label="Verkleinern">
            −
          </button>
          <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom">
            {VORSCHAU_ZOOM.map((z) => (
              <option key={z} value={z}>
                {z ? `${Math.round(z * 100)} %` : 'Seitenbreite'}
              </option>
            ))}
          </select>
          <button onClick={() => zoomen(1)} disabled={zoom === VORSCHAU_ZOOM.at(-1)} title="Vergrößern (+)" aria-label="Vergrößern">
            +
          </button>
        </span>
        <span className="tb-spacer" />
        {aktuell && (
          <>
            <button
              className={`vs-bereit ${zustand}`}
              aria-pressed={zustand === 'bereit'}
              disabled={!!fehlerName || gesperrt}
              title={gesperrt ? 'Der Antrag ist eingereicht und gesperrt – „bereit“ bleibt, wie es ist' : fehlerName ? `${BEREIT_TEXT.name}: ${fehlerName}` : BEREIT_TEXT[zustand]}
              onClick={() => void useAntrag.getState().bereitUmschalten(aktuell.pfad, { fassung: listeFassung })}
            >
              {zustand === 'bereit' ? '✓ Bereit' : 'Als bereit markieren'}
            </button>
            <button title="Mit dem zugehörigen Programm öffnen" onClick={() => void oeffnePfad(verbinde(basis, `${ordner}/${aktuell.pfad}`)).catch(() => undefined)}>
              <Symbol name="extern" /> Extern öffnen
            </button>
          </>
        )}
        <button className="primary" onClick={onClose} title="Schließen (Esc)">
          Schließen
        </button>
      </header>
      <div className="vs-koerper">
        <nav className="vs-liste" aria-label="Dokumente">
          {liste.map((d, i) => (
            <button key={d.pfad} className={i === index ? 'aktiv' : ''} aria-current={i === index ? 'true' : undefined} onClick={() => setIndex(i)} title={d.pfad}>
              {d.pfad}
            </button>
          ))}
        </nav>
        <main className="vs-flaeche">
          {!aktuell && <p className="vs-hinweis">Im Ordner {ordner} liegen noch keine Dokumente.</p>}
          {aktuell && (
            <p className="vs-name">
              {aktuell.pfad}
              {dok && <span className="muted"> · {dok.eintrag.titel}</span>}
            </p>
          )}
          {fehler && <p className="warning">{fehler}</p>}
          {aktuell && art === 'pdf' && bytes?.pfad === aktuell.pfad && <PdfSeiten key={aktuell.pfad} daten={bytes.daten} zoom={zoom} />}
          {aktuell && art === 'bild' && bytes?.pfad === aktuell.pfad && <BildSeite daten={bytes.daten} zoom={zoom} name={aktuell.pfad} />}
          {aktuell && art !== 'pdf' && art !== 'bild' && <p className="vs-hinweis">Für diese Datei gibt es hier keine Vorschau – „Extern öffnen“ zeigt sie im zugehörigen Programm.</p>}
        </main>
      </div>
    </div>,
    document.body,
  );
}

/** Breite der Fläche verfolgen (für „Seitenbreite“) */
function useBreite() {
  const ref = useRef<HTMLDivElement>(null);
  const [breite, setBreite] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setBreite(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBreite(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, breite };
}

function PdfSeiten({ daten, zoom }: { daten: Uint8Array; zoom: number }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [seitenBreite, setSeitenBreite] = useState(595);
  const [fehler, setFehler] = useState('');
  const { ref, breite } = useBreite();
  useEffect(() => {
    let d: PDFDocumentProxy | null = null;
    let aus = false;
    pdfOeffnen(daten)
      .then(async (x) => {
        d = x;
        if (aus) return void pdfSchliessen(x);
        setSeitenBreite((await x.getPage(1)).getViewport({ scale: 1 }).width);
        setDoc(x);
      })
      .catch((e: unknown) => !aus && setFehler(e instanceof Error ? e.message : String(e)));
    return () => {
      aus = true;
      if (d) void pdfSchliessen(d);
    };
  }, [daten]);
  const massstab = zoom > 0 ? zoom : breite > 0 ? Math.max(0.3, (breite - 32) / seitenBreite) : 1;
  return (
    <div className="vs-pdf" ref={ref}>
      {fehler && <p className="warning">Die PDF lässt sich nicht anzeigen: {fehler}</p>}
      {!doc && !fehler && <p className="muted">PDF wird gelesen …</p>}
      {doc && Array.from({ length: doc.numPages }, (_, i) => <PdfSeite key={i} doc={doc} nr={i + 1} massstab={massstab} />)}
    </div>
  );
}

function PdfSeite({ doc, nr, massstab }: { doc: PDFDocumentProxy; nr: number; massstab: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let aufgabe: { cancel: () => void } | null = null;
    let aus = false;
    void doc.getPage(nr).then((seite) => {
      const el = canvas.current;
      const ctx = el?.getContext('2d');
      if (aus || !el || !ctx) return;
      const v = seite.getViewport({ scale: massstab * (window.devicePixelRatio || 1) });
      el.width = v.width;
      el.height = v.height;
      el.style.width = `${v.width / (window.devicePixelRatio || 1)}px`;
      const r = seite.render({ canvasContext: ctx, viewport: v, canvas: el } as Parameters<typeof seite.render>[0]);
      aufgabe = r;
      r.promise.catch(() => undefined);
    });
    return () => {
      aus = true;
      aufgabe?.cancel();
    };
  }, [doc, nr, massstab]);
  return <canvas ref={canvas} className="vs-seite" aria-label={`Seite ${nr}`} />;
}

function BildSeite({ daten, zoom, name }: { daten: Uint8Array; zoom: number; name: string }) {
  const url = useMemo(() => (typeof URL.createObjectURL === 'function' ? URL.createObjectURL(new Blob([daten as BlobPart])) : ''), [daten]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  const [natur, setNatur] = useState(0);
  return (
    <div className="vs-bild">
      {url && <img src={url} alt={name} onLoad={(e) => setNatur(e.currentTarget.naturalWidth)} style={zoom && natur ? { width: `${natur * zoom}px`, maxWidth: 'none' } : { width: '100%' }} />}
    </div>
  );
}
