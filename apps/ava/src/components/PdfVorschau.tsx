import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let geladen: Promise<PdfJs> | null = null;

function pdfjs(): Promise<PdfJs> {
  geladen ??= (async () => {
    const lib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    if (typeof Worker !== 'undefined') lib.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
    return lib;
  })();
  return geladen;
}

/** Vorschau einer PDF (alle Seiten, an die Breite angepasst) bzw. eines Bilds */
export function PdfVorschau({ daten, name, laedt = false }: { daten: Uint8Array | null; name: string; laedt?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [bild, setBild] = useState<string | null>(null);
  const istBild = /\.(png|jpe?g|gif|bmp|webp)$/i.test(name);

  useEffect(() => {
    if (!daten || !istBild) return;
    const url = URL.createObjectURL(new Blob([daten as BlobPart]));
    setBild(url);
    return () => URL.revokeObjectURL(url);
  }, [daten, istBild]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !daten || istBild) return;
    let aus = false;
    let doc: PDFDocumentProxy | null = null;
    el.innerHTML = '';
    setFehler(null);
    void (async () => {
      try {
        const lib = await pdfjs();
        doc = await lib.getDocument({ data: daten.slice() }).promise;
        const breite = Math.max(160, el.clientWidth - 24);
        for (let n = 1; n <= Math.min(doc.numPages, 30) && !aus; n++) {
          const seite = await doc.getPage(n);
          const v1 = seite.getViewport({ scale: 1 });
          const massstab = breite / v1.width;
          const dpr = window.devicePixelRatio || 1;
          const canvas = document.createElement('canvas');
          const viewport = seite.getViewport({ scale: massstab * dpr });
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
          canvas.className = 'ava-pdf-seite';
          el.appendChild(canvas);
          await seite.render({ canvas, viewport }).promise;
        }
      } catch (e) {
        if (!aus) setFehler(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      aus = true;
      void doc?.loadingTask.destroy();
    };
  }, [daten, istBild]);

  if (!daten) return <div className="ava-pdf muted">{laedt ? 'Vorschau wird geladen …' : 'Keine Vorschau.'}</div>;
  if (istBild) return <div className="ava-pdf">{bild && <img src={bild} alt={name} className="ava-pdf-seite" />}</div>;
  return (
    <div className="ava-pdf">
      {fehler && <div className="warning">Vorschau nicht möglich: {fehler}</div>}
      <div ref={ref} />
    </div>
  );
}
