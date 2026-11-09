import 'pdfjs-dist/web/pdf_viewer.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import { pdfFelder, pdfjs, pdfOeffnen, pdfSchliessen } from '../../dokumente/pdf';
import type { OffeneDatei } from '../../store';
import { useFormulare } from '../../store';
import { DateiKopf, useSpeichernTaste } from './DateiAnsicht';

/** Verweise in der PDF: externe im Browser, interne werden ignoriert (kein Blättern über Links) */
const verweise = {
  externalLinkEnabled: true,
  externalLinkTarget: 2,
  externalLinkRel: 'noopener noreferrer nofollow',
  isInPresentationMode: false,
  pagesCount: 0,
  page: 1,
  rotation: 0,
  addLinkAttributes(link: HTMLAnchorElement, url: string) {
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer nofollow';
  },
  getDestinationHash: () => '#',
  getAnchorUrl: (hash: string) => `#${hash}`,
  goToDestination: () => undefined,
  goToPage: () => undefined,
  goToXY: () => undefined,
  setHash: () => undefined,
  executeNamedAction: () => undefined,
  executeSetOCGState: () => undefined,
  cachePageRef: () => undefined,
};

const ZOOM = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** Eine Seite: Bild (Canvas) und darüber die Formularfelder (Annotation Layer von pdf.js) */
function Seite({ doc, nr, massstab }: { doc: PDFDocumentProxy; nr: number; massstab: number }) {
  const huelle = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = huelle.current;
    if (!el) return;
    let abbruch = false;
    void (async () => {
      const lib = await pdfjs();
      const seite = await doc.getPage(nr);
      if (abbruch) return;
      const viewport = seite.getViewport({ scale: massstab });
      el.replaceChildren();
      el.style.width = `${Math.floor(viewport.width)}px`;
      el.style.height = `${Math.floor(viewport.height)}px`;
      el.style.setProperty('--scale-factor', String(massstab));
      el.style.setProperty('--total-scale-factor', String(massstab));
      const canvas = document.createElement('canvas');
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      el.appendChild(canvas);
      if (!canvas.getContext) return;
      await seite.render({ canvas, viewport: seite.getViewport({ scale: massstab * dpr }), annotationMode: lib.AnnotationMode.ENABLE_FORMS }).promise;
      if (abbruch) return;
      const ebene = document.createElement('div');
      ebene.className = 'annotationLayer';
      el.appendChild(ebene);
      const anzeige = viewport.clone({ dontFlip: true });
      const layer = new lib.AnnotationLayer({
        div: ebene,
        page: seite,
        viewport: anzeige,
        annotationStorage: doc.annotationStorage,
        linkService: verweise,
        accessibilityManager: null,
        annotationCanvasMap: null,
        annotationEditorUIManager: null,
        structTreeLayer: null,
        commentManager: null,
      });
      await layer.render({
        div: ebene,
        viewport: anzeige,
        page: seite,
        annotations: await seite.getAnnotations({ intent: 'display' }),
        linkService: verweise as never,
        annotationStorage: doc.annotationStorage,
        renderForms: true,
        imageResourcesPath: '',
        enableScripting: false,
        hasJSActions: false,
        fieldObjects: null,
      });
    })().catch(() => undefined);
    return () => {
      abbruch = true;
    };
  }, [doc, nr, massstab]);
  return <div ref={huelle} className="pdf-seite" data-seite-pdf={nr} />;
}

/**
 * PDF-Vorschau. Hat die PDF Formularfelder, lassen sie sich direkt auf der Seite ausfüllen; gespeichert wird
 * als Nachtrag ans Ende der Datei – der ursprüngliche Inhalt bleibt unverändert.
 */
export function PdfAnsicht({ datei }: { datei: OffeneDatei }) {
  const { dateiSpeichern } = useFormulare.getState();
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [felder, setFelder] = useState(0);
  const [geaendert, setGeaendert] = useState(false);
  const [fehler, setFehler] = useState('');
  const [zoom, setZoom] = useState(0);
  const [breite, setBreite] = useState(0);
  const [seitenBreite, setSeitenBreite] = useState(595);
  const [runde, setRunde] = useState(0);
  const flaeche = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let d: PDFDocumentProxy | null = null;
    let aus = false;
    pdfOeffnen(datei.bytes)
      .then(async (x) => {
        d = x;
        if (aus) return void pdfSchliessen(x);
        // pdf.js meldet Eingaben in Formularfeldern über diese Rückrufe (in den Typen als null deklariert)
        const speicher = x.annotationStorage as unknown as { onSetModified: (() => void) | null; onResetModified: (() => void) | null };
        speicher.onSetModified = () => setGeaendert(true);
        speicher.onResetModified = () => setGeaendert(false);
        const erste = await x.getPage(1);
        setSeitenBreite(erste.getViewport({ scale: 1 }).width);
        setFelder((await pdfFelder(x)).length);
        setDoc(x);
      })
      .catch((e: unknown) => setFehler(e instanceof Error ? e.message : String(e)));
    return () => {
      aus = true;
      if (d) void pdfSchliessen(d);
    };
  }, [datei.bytes, runde]);

  useEffect(() => {
    const el = flaeche.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBreite(el.clientWidth));
    ro.observe(el);
    setBreite(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const speichern = useCallback(async () => {
    if (!doc || !geaendert) return;
    try {
      await dateiSpeichern(await doc.saveDocument());
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }, [doc, geaendert, dateiSpeichern]);
  useSpeichernTaste(() => void speichern(), felder > 0);

  const massstab = zoom > 0 ? zoom : breite > 0 ? Math.max(0.4, Math.min(3, (breite - 48) / seitenBreite)) : 1;
  const hinweis = fehler
    ? `Die PDF lässt sich nicht anzeigen: ${fehler}`
    : felder > 0
      ? `${felder} Formularfeld(er) – direkt auf der Seite ausfüllen. Gespeichert wird als Nachtrag; der Inhalt der PDF bleibt unverändert.`
      : undefined;

  return (
    <div className="dok">
      <DateiKopf
        datei={datei}
        geaendert={geaendert}
        bearbeitbar={felder > 0}
        hinweis={hinweis}
        onSpeichern={() => void speichern()}
        onVerwerfen={() => {
          setGeaendert(false);
          setRunde((r) => r + 1);
        }}
        werkzeuge={
          <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom">
            <option value={0}>Seitenbreite</option>
            {ZOOM.map((z) => (
              <option key={z} value={z}>
                {Math.round(z * 100)} %
              </option>
            ))}
          </select>
        }
      />
      <div className="dok-flaeche pdf-flaeche" ref={flaeche}>
        {doc && Array.from({ length: doc.numPages }, (_, i) => <Seite key={`${runde}-${i}`} doc={doc} nr={i + 1} massstab={massstab} />)}
        {!doc && !fehler && <p className="muted">PDF wird gelesen …</p>}
      </div>
    </div>
  );
}
