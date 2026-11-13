import type { ReactNode } from 'react';
import { useEffect, useMemo } from 'react';
import { oeffnePfad, verbinde } from '../../dateisystem';
import type { OffeneDatei } from '../../store';
import { useFormulare } from '../../store';
import { ExcelAnsicht } from './ExcelAnsicht';
import { PdfAnsicht } from './PdfAnsicht';
import { WordAnsicht } from './WordAnsicht';

const ART: Record<OffeneDatei['art'], string> = { pdf: 'PDF', excel: 'Excel', word: 'Word', bild: 'Bild' };

/** Strg+S in der App: die gerade gezeigte Ansicht speichert */
export function useSpeichernTaste(speichern: () => void, aktiv: boolean) {
  useEffect(() => {
    const beiTaste = () => aktiv && speichern();
    window.addEventListener('formulare:datei-speichern', beiTaste);
    return () => window.removeEventListener('formulare:datei-speichern', beiTaste);
  }, [speichern, aktiv]);
}

/**
 * Kopf über jedem Dokument: Art, Name, Pfad, Zustand und die Knöpfe zum Speichern, Verwerfen und Öffnen im
 * zugehörigen Programm. Die Ansicht darunter liefert ihre eigenen Werkzeuge (`werkzeuge`).
 */
export function DateiKopf({
  datei,
  geaendert,
  bearbeitbar,
  beschaeftigt = false,
  hinweis,
  onSpeichern,
  onVerwerfen,
  werkzeuge,
}: {
  datei: OffeneDatei;
  geaendert: boolean;
  bearbeitbar: boolean;
  /** wird gerade gespeichert: Speichern, Verwerfen und Neu laden ruhen */
  beschaeftigt?: boolean;
  hinweis?: string;
  onSpeichern?: () => void;
  onVerwerfen?: () => void;
  werkzeuge?: ReactNode;
}) {
  const { dateiNeuLaden } = useFormulare.getState();
  return (
    <header className="dok-kopf">
      <div className="dok-kopf-text">
        <span className={`dok-art ${datei.art}`}>{ART[datei.art]}</span>
        <strong title={datei.name}>{datei.name}</strong>
        <span className="muted small-text" title={verbinde(datei.root, datei.pfad)}>
          {datei.pfad.split('/').slice(0, -1).join(' › ')}
        </span>
      </div>
      <div className="dok-kopf-knoepfe">
        {werkzeuge}
        {bearbeitbar && onSpeichern && (
          <>
            <button className="primary" disabled={!geaendert || beschaeftigt} title="In die Datei im Projektordner speichern (Strg+S); die vorige Fassung bleibt als Sicherung" onClick={onSpeichern}>
              Speichern
            </button>
            <button disabled={!geaendert || beschaeftigt} onClick={onVerwerfen}>
              Verwerfen
            </button>
          </>
        )}
        <button title="Datei neu einlesen" disabled={beschaeftigt} onClick={() => void dateiNeuLaden()}>
          Neu laden
        </button>
        <button title="Mit dem zugehörigen Programm öffnen" onClick={() => void oeffnePfad(verbinde(datei.root, datei.pfad)).catch(() => undefined)}>
          Mit Programm öffnen
        </button>
      </div>
      {hinweis && <div className="dok-hinweis">{hinweis}</div>}
    </header>
  );
}

function BildAnsicht({ datei }: { datei: OffeneDatei }) {
  const url = useMemo(() => (typeof URL.createObjectURL === 'function' ? URL.createObjectURL(new Blob([datei.bytes as BlobPart])) : ''), [datei.bytes]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return (
    <div className="dok">
      <DateiKopf datei={datei} geaendert={false} bearbeitbar={false} />
      <div className="dok-flaeche dok-bild">{url && <img src={url} alt={datei.name} />}</div>
    </div>
  );
}

/** Dokument aus dem Projektordner: PDF (mit Formularfeldern), Excel, Word oder Bild */
export function DateiAnsicht() {
  const datei = useFormulare((s) => s.datei);
  if (!datei) return null;
  const k = `${datei.root}|${datei.pfad}|${datei.stand}`;
  switch (datei.art) {
    case 'pdf':
      return <PdfAnsicht key={k} datei={datei} />;
    case 'excel':
      return <ExcelAnsicht key={k} datei={datei} />;
    case 'word':
      return <WordAnsicht key={k} datei={datei} />;
    default:
      return <BildAnsicht key={k} datei={datei} />;
  }
}
