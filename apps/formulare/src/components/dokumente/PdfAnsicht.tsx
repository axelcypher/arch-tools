import 'pdfjs-dist/web/pdf_viewer.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import { pdfFelder, pdfjs, pdfOeffnen, pdfSchliessen, textEntfernen, textGroesse, textVormerken } from '../../dokumente/pdf';
import { frageText } from '../Rueckfrage';
import { Symbol } from '../Symbol';
import type { OffeneDatei } from '../../store';
import { PDF_ENTWURF, pdfAnbindung, useFormulare } from '../../store';
import { pdfSpeichern } from '../../dokumente/pdfSpeichern';
import { anzahl } from '../../text';
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

type Werkzeug = 'text' | 'kreuz' | null;

/** Vorgemerkter Text (noch nicht gespeichert): Lage oben links in Seitenpunkten, wie bei Maßstab 1 */
interface Vormerk {
  id: string;
  seite: number;
  links: number;
  oben: number;
  text: string;
  groesse: number;
}

interface Klick {
  nr: number;
  /** Punkt in der Ansicht bei Maßstab 1 */
  x: number;
  y: number;
  /** Ansicht → PDF-Koordinaten (bei Maßstab 1) */
  inPdf: (x: number, y: number) => [number, number];
  drehung: number;
}

/** Eine Seite: Bild (Canvas), darüber die Formularfelder (Annotation Layer von pdf.js) und vorgemerkter Text */
function Seite({
  doc,
  nr,
  massstab,
  werkzeug,
  vorgemerkt,
  onKlick,
  onEntfernen,
}: {
  doc: PDFDocumentProxy;
  nr: number;
  massstab: number;
  werkzeug: Werkzeug;
  vorgemerkt: Vormerk[];
  onKlick: (k: Klick) => void;
  onEntfernen: (id: string) => void;
}) {
  const huelle = useRef<HTMLDivElement>(null);
  const ansicht = useRef<{ inPdf: (x: number, y: number) => [number, number]; drehung: number } | null>(null);
  useEffect(() => {
    const el = huelle.current;
    if (!el) return;
    let abbruch = false;
    void (async () => {
      const lib = await pdfjs();
      const seite = await doc.getPage(nr);
      if (abbruch) return;
      const viewport = seite.getViewport({ scale: massstab });
      const einfach = seite.getViewport({ scale: 1 });
      ansicht.current = { inPdf: (x, y) => einfach.convertToPdfPoint(x, y) as [number, number], drehung: seite.rotate };
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
  return (
    <div
      className={`pdf-seite-rahmen${werkzeug ? ` werkzeug-${werkzeug}` : ''}`}
      onClickCapture={(e) => {
        if (!werkzeug || !ansicht.current) return;
        e.preventDefault();
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        onKlick({ nr, x: (e.clientX - r.left) / massstab, y: (e.clientY - r.top) / massstab, ...ansicht.current });
      }}
    >
      <div ref={huelle} className="pdf-seite" data-seite-pdf={nr} />
      {vorgemerkt.map((v) => (
        <button
          key={v.id}
          className="pdf-vormerk"
          style={{ left: v.links * massstab, top: v.oben * massstab, fontSize: v.groesse * massstab }}
          title="Noch nicht gespeichert – Klick entfernt den Eintrag"
          onClick={() => !werkzeug && onEntfernen(v.id)}
        >
          {v.text}
        </button>
      ))}
    </div>
  );
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
  const [werkzeug, setWerkzeug] = useState<Werkzeug>(null);
  const [vorgemerkt, setVorgemerkt] = useState<Vormerk[]>([]);
  /** wird gerade gespeichert – die Fläche nimmt dann keine Eingaben an (sie gingen mit dem Neuaufbau danach verloren) */
  const [speichert, setSpeichert] = useState(false);
  const flaeche = useRef<HTMLDivElement>(null);
  const zaehler = useRef(0);

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
        setVorgemerkt([]);
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

  /** Text bzw. Kreuz an der angeklickten Stelle vormerken */
  const eintragen = async (k: Klick) => {
    if (!doc) return;
    const text = werkzeug === 'kreuz' ? 'X' : await frageText('Text eintragen', '', 'Eintragen', 'Der Text beginnt an der angeklickten Stelle (Helvetica 11 pt).');
    if (!text) return;
    const groesse = werkzeug === 'kreuz' ? 12 : 11;
    const g = textGroesse(text, groesse);
    // Kreuz mittig auf der Stelle, Text beginnt dort (Mitte der ersten Zeile)
    const links = werkzeug === 'kreuz' ? k.x - g.breite / 2 : k.x;
    const oben = k.y - groesse * 0.75;
    const [x1, y1] = k.inPdf(links, oben);
    const [x2, y2] = k.inPdf(links + g.breite, oben + g.hoehe);
    const id = `${Date.now().toString(36)}${zaehler.current++}`;
    textVormerken(doc, id, { seite: k.nr, rect: [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)], text, groesse, drehung: k.drehung });
    setVorgemerkt((v) => [...v, { id, seite: k.nr, links, oben, text, groesse }]);
    setGeaendert(true);
  };
  const entfernen = (id: string) => {
    if (!doc) return;
    textEntfernen(doc, id);
    setVorgemerkt((v) => v.filter((x) => x.id !== id));
  };

  const speichern = useCallback(async (): Promise<boolean> => {
    if (!doc || !geaendert) return true;
    if (speichert) return false;
    setSpeichert(true);
    setWerkzeug(null);
    try {
      return await pdfSpeichern(() => doc.saveDocument(), dateiSpeichern, setGeaendert, setFehler);
    } finally {
      setSpeichert(false);
    }
  }, [doc, geaendert, speichert, dateiSpeichern]);
  useSpeichernTaste(() => void speichern(), true);

  // Ungespeicherte Eingaben dem Store melden (● in der Titelleiste, Rückfrage beim Verlassen und Beenden); mit der
  // Ansicht verfallen sie – dann auch die Meldung
  useEffect(() => {
    const { setDateiEntwurf } = useFormulare.getState();
    // auch während des Speicherns (pdf.js hat den Änderungsstand dann schon zurückgesetzt)
    setDateiEntwurf(geaendert || speichert ? PDF_ENTWURF : null, datei);
    pdfAnbindung.speichern = speichern;
    return () => {
      if (pdfAnbindung.speichern === speichern) delete pdfAnbindung.speichern;
    };
  }, [geaendert, speichert, speichern, datei]);
  useEffect(() => () => useFormulare.getState().setDateiEntwurf(null, datei), [datei]);

  const massstab = zoom > 0 ? zoom : breite > 0 ? Math.max(0.4, Math.min(3, (breite - 48) / seitenBreite)) : 1;
  const hinweis = fehler
    ? `Die PDF lässt sich nicht anzeigen: ${fehler}`
    : werkzeug
      ? `${werkzeug === 'kreuz' ? 'Kreuz' : 'Text'}: auf die Stelle in der PDF klicken. Esc oder erneuter Klick auf das Werkzeug beendet.`
      : felder > 0
        ? `${anzahl(felder, 'Formularfeld', 'Formularfelder')} – direkt auf der Seite ausfüllen; „Text“ und „Kreuz“ tragen auch anderswo etwas ein. Gespeichert wird als Nachtrag, der Inhalt der PDF bleibt unverändert.`
        : '„Text“ und „Kreuz“ tragen etwas in die PDF ein. Gespeichert wird als Nachtrag, der Inhalt der PDF bleibt unverändert.';

  useEffect(() => {
    if (!werkzeug) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setWerkzeug(null);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [werkzeug]);

  return (
    <div className="dok">
      <DateiKopf
        datei={datei}
        geaendert={geaendert}
        bearbeitbar
        beschaeftigt={speichert}
        hinweis={speichert ? 'Wird gespeichert …' : hinweis}
        onSpeichern={() => void speichern()}
        onVerwerfen={() => {
          setGeaendert(false);
          setWerkzeug(null);
          setRunde((r) => r + 1);
        }}
        werkzeuge={
          <>
            <button className={werkzeug === 'text' ? 'active' : ''} aria-pressed={werkzeug === 'text'} disabled={!doc || speichert} title="Text in die PDF eintragen: Werkzeug wählen, dann auf die Stelle klicken" onClick={() => setWerkzeug(werkzeug === 'text' ? null : 'text')}>
              <Symbol name="textfeld" /> Text
            </button>
            <button className={werkzeug === 'kreuz' ? 'active' : ''} aria-pressed={werkzeug === 'kreuz'} disabled={!doc || speichert} title="Kreuz setzen (z. B. in ein Kästchen): Werkzeug wählen, dann auf die Stelle klicken" onClick={() => setWerkzeug(werkzeug === 'kreuz' ? null : 'kreuz')}>
              <Symbol name="kreuz" /> Kreuz
            </button>
            <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom">
              <option value={0}>Seitenbreite</option>
              {ZOOM.map((z) => (
                <option key={z} value={z}>
                  {Math.round(z * 100)} %
                </option>
              ))}
            </select>
          </>
        }
      />
      <div className="dok-flaeche pdf-flaeche" ref={flaeche} inert={speichert} aria-busy={speichert}>
        {doc &&
          Array.from({ length: doc.numPages }, (_, i) => (
            <Seite
              key={`${runde}-${i}`}
              doc={doc}
              nr={i + 1}
              massstab={massstab}
              werkzeug={werkzeug}
              vorgemerkt={vorgemerkt.filter((v) => v.seite === i + 1)}
              onKlick={(k) => void eintragen(k)}
              onEntfernen={entfernen}
            />
          ))}
        {!doc && !fehler && <p className="muted">PDF wird gelesen …</p>}
      </div>
    </div>
  );
}
