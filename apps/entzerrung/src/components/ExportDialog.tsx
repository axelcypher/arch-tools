import { useState } from 'react';
import { fmt2 } from '@core/format';
import { saveBinaryFile } from '@core/platform/files';
import { logger } from '@core/platform/log';
import { Field, NumberField } from '@core/ui/fields';
import type { Entzerrung } from '../geo/ebene';
import { ausgabe } from '../geo/messen';
import type { Bereich, Ebene, Foto } from '../model';
import { exportieren, PAPIER, passenderMassstab, pdfPlan } from '../export/export';
import type { Format, Papier } from '../export/export';
import { useEntz } from '../store';

const log = logger('export');

export function ExportDialog({ foto, ebene, e, aufloesung, bereich, onClose }: { foto: Foto; ebene: Ebene; e: Entzerrung; aufloesung: number; bereich: Bereich; onClose: () => void }) {
  const [format, setFormat] = useState<Format>('png');
  const [mitMessungen, setMitMessungen] = useState(ebene.messungen.length > 0);
  const [papier, setPapier] = useState<Papier>('A3');
  const [massstab, setMassstab] = useState(() => passenderMassstab(bereich, 'A3'));
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const a = ausgabe(bereich, aufloesung);
  const plan = pdfPlan(bereich, massstab, papier);
  // Druckauflösung: Bildpixel je Millimeter Papier
  const dpi = (a.breite / plan.bild[0]) * 25.4;

  const los = async () => {
    setLaeuft(true);
    setFehler(null);
    try {
      const daten = useEntz.getState().bilder[foto.id];
      const d = await exportieren(foto, daten, ebene, e, { format, aufloesung, bereich, mitMessungen, massstab, papier });
      const ok = await saveBinaryFile({ defaultName: d.name, data: d.daten, filterName: d.filter, extension: d.endung, mime: d.mime });
      log.info(`Exportiert: ${d.name}`, { bytes: d.daten.length, breite: a.breite, hoehe: a.hoehe });
      if (ok) onClose();
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      log.error('Export fehlgeschlagen', text);
      setFehler(text);
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(x) => x.target === x.currentTarget && !laeuft && onClose()}>
      <div className="modal">
        <h3>Entzerrtes Bild exportieren</h3>
        <p className="small-text muted">
          {foto.name} – {ebene.name}: {fmt2(bereich.x1 - bereich.x0)} × {fmt2(bereich.y1 - bereich.y0)} m, {a.breite.toLocaleString('de-DE')} × {a.hoehe.toLocaleString('de-DE')} px ({fmt2(a.aufloesung * 1000)} mm je Pixel)
        </p>
        {(
          [
            ['png', 'PNG', 'verlustfrei; Maßstab 1:1 in den Bilddaten (Pixel je Meter), Auflösung im Dateinamen'],
            ['jpeg', 'JPEG', 'kleinere Datei; Maßstab in den Bilddaten (gerundet) und im Dateinamen'],
            ['pdf', 'PDF im Maßstab', 'zum Drucken: Bild im gewählten Maßstab mit Maßstabsleiste'],
          ] as [Format, string, string][]
        ).map(([f, name, text]) => (
          <label key={f} className="radio-row">
            <input type="radio" checked={format === f} onChange={() => setFormat(f)} />
            <span>
              <strong>{name}</strong>
              <br />
              <span className="muted small-text">{text}</span>
            </span>
          </label>
        ))}
        {format === 'pdf' && (
          <div className="indent">
            <div className="field-row">
              <Field label="Papier">
                <select
                  value={papier}
                  onChange={(x) => {
                    const p = x.target.value as Papier;
                    setPapier(p);
                    if (p !== 'passend') setMassstab(passenderMassstab(bereich, p));
                  }}
                >
                  {Object.keys(PAPIER).map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                  <option value="passend">passend zum Bild</option>
                </select>
              </Field>
              <Field label="Maßstab 1 :">
                <NumberField value={massstab} min={1} digits={0} onChange={(v) => v && setMassstab(Math.round(v))} />
              </Field>
            </div>
            <p className={`small-text ${plan.passt ? 'muted' : ''}`}>
              Seite {Math.round(plan.seite[0])} × {Math.round(plan.seite[1])} mm, Bild {Math.round(plan.bild[0])} × {Math.round(plan.bild[1])} mm, etwa {Math.round(dpi)} dpi
            </p>
            {!plan.passt && <div className="warning">Passt bei 1:{massstab} nicht auf {papier}.</div>}
          </div>
        )}
        <label className="toggle">
          <input type="checkbox" checked={mitMessungen} disabled={!ebene.messungen.length} onChange={(x) => setMitMessungen(x.target.checked)} />
          Messungen einzeichnen
        </label>
        {fehler && <div className="warning">{fehler}</div>}
        <div className="dialog-buttons">
          {laeuft && <span className="busy">wird erzeugt …</span>}
          <button onClick={onClose} disabled={laeuft}>
            Abbrechen
          </button>
          <button className="primary" onClick={() => void los()} disabled={laeuft || (format === 'pdf' && !plan.passt)}>
            Exportieren
          </button>
        </div>
      </div>
    </div>
  );
}
