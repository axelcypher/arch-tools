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
import { Modal } from '@core/ui/Dialog';
import { jpegDichte, pngDichte } from '../export/png';

const log = logger('export');

export function ExportDialog({ foto, ebene, e, aufloesung, bereich, onClose }: { foto: Foto; ebene: Ebene; e: Entzerrung; aufloesung: number; bereich: Bereich; onClose: () => void }) {
  const [format, setFormat] = useState<Format>('png');
  const [mitMessungen, setMitMessungen] = useState(ebene.messungen.length > 0);
  const [papier, setPapier] = useState<Papier>('A3');
  // Bereich auf ganze Pixel erweitert – derselbe, mit dem exportiert wird
  const a = ausgabe(bereich, aufloesung);
  const [massstab, setMassstab] = useState(() => passenderMassstab(a.bereich, 'A3'));
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const plan = pdfPlan(a.bereich, massstab, papier);
  const jpegMitDichte = jpegDichte(a.aufloesung) !== null;
  const pngMitDichte = pngDichte(a.aufloesung) !== null;
  // Druckauflösung: Bildpixel je Millimeter Papier
  const dpi = (a.breite / plan.bild[0]) * 25.4;

  const los = async () => {
    setLaeuft(true);
    setFehler(null);
    try {
      const daten = useEntz.getState().bilder[foto.id];
      const d = await exportieren(foto, daten, ebene, e, { format, aufloesung, bereich, mitMessungen, massstab, papier, projekt: useEntz.getState().projekt });
      const ok = await saveBinaryFile({ defaultName: d.name, data: d.daten, filterName: d.filter, extension: d.endung, mime: d.mime });
      if (ok) {
        log.info(`Exportiert: ${d.name}`, { bytes: d.daten.length, breite: a.breite, hoehe: a.hoehe });
        onClose();
      }
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      log.error('Export fehlgeschlagen', text);
      setFehler(text);
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Modal titel="Entzerrtes Bild exportieren" kopf onClose={laeuft ? undefined : onClose}>
      <form
        onSubmit={(x) => {
          x.preventDefault();
          if (!laeuft && !(format === 'pdf' && !plan.passt)) void los();
        }}
      >
        <p className="small-text muted">
          {foto.name} – {ebene.name}: {fmt2(a.bereich.x1 - a.bereich.x0)} × {fmt2(a.bereich.y1 - a.bereich.y0)} m, {a.breite.toLocaleString('de-DE')} × {a.hoehe.toLocaleString('de-DE')} px ({fmt2(a.aufloesung * 1000)} mm je Pixel)
        </p>
        {(
          [
            [
              'png',
              'PNG',
              pngMitDichte ? 'verlustfrei; Maßstab 1:1 in den Bilddaten (Pixel je Meter), Auflösung im Dateinamen' : 'verlustfrei; bei dieser groben Auflösung Maßstab nur im Dateinamen',
            ],
            [
              'jpeg',
              'JPEG',
              jpegMitDichte
                ? 'kleinere Datei; Maßstab in den Bilddaten und im Dateinamen'
                : 'kleinere Datei; Maßstab nur im Dateinamen – diese Auflösung lässt sich im JPEG nicht genau eintragen (dafür PNG oder z. B. 1, 2, 2,5 oder 5 mm je Pixel)',
            ],
            ['pdf', 'PDF im Maßstab', 'zum Drucken: Bild im gewählten Maßstab mit Maßstabsleiste'],
          ] as [Format, string, string][]
        ).map(([f, name, text]) => (
          <label key={f} className="radio-row">
            <input type="radio" name="ef-format" value={f} checked={format === f} autoFocus={format === f} onChange={() => setFormat(f)} />
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
                    if (p !== 'passend') setMassstab(passenderMassstab(a.bereich, p));
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
              Seite {Math.round(plan.seite[0])} × {Math.round(plan.seite[1])} mm, Bild {Math.round(plan.bild[0])} × {Math.round(plan.bild[1])} mm, etwa {Math.round(dpi)} dpi. Beim Drucken
              „Tatsächliche Größe“ (100 %) wählen, sonst stimmt der Maßstab nicht.
            </p>
            {!plan.passt && <div className="warning">Passt bei 1:{massstab} nicht auf {papier}.</div>}
          </div>
        )}
        <label className="toggle">
          <input type="checkbox" checked={mitMessungen} disabled={!ebene.messungen.length} onChange={(x) => setMitMessungen(x.target.checked)} />
          Messungen einzeichnen{!ebene.messungen.length && <span className="muted"> (noch keine Messungen)</span>}
        </label>
        {fehler && (
          <div className="meldung fehler" role="alert">
            {fehler}
          </div>
        )}
        <div className="dialog-buttons">
          {laeuft && <span className="busy">wird erzeugt …</span>}
          <button type="button" onClick={onClose} disabled={laeuft}>
            Abbrechen
          </button>
          <button type="submit" className="primary" disabled={laeuft || (format === 'pdf' && !plan.passt)}>
            Exportieren
          </button>
        </div>
      </form>
    </Modal>
  );
}
