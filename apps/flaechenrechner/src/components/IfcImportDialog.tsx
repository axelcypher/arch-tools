import { useRef, useState } from 'react';
import { computeProject } from '@core/calc';
import { fmt2 } from '@core/format';
import type { IfcExtract } from '@core/ifcData';
import type { IfcImportOptions } from '@core/ifcImport';
import { buildFromIfc } from '@core/ifcImport';
import { hatIfcHerkunft, ifcAbgleichen } from '@core/ifcAbgleich';
import { ifcDateiErsetzen } from '@core/platform/ifcAktualisieren';
import { addDatei, createProject } from '@core/model';
import { pickFile } from '@core/platform/files';
import { useEditor } from '../store/store';
import { NumberField } from '@core/ui/fields';
import { logger } from '@core/platform/log';

const log = logger('ifc');

type Step = { kind: 'start' } | { kind: 'loading'; msg: string } | { kind: 'options'; x: IfcExtract; file: string } | { kind: 'done'; report: string[] };

/** IFC-Import (z. B. Archicad): Geschosse, Zonen → Räume, BGF-Umrisse, Dach für den BRI. */
export function IfcImportDialog({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>({ kind: 'start' });
  const [error, setError] = useState<string | null>(null);
  /** Originaldatei – wird im Projektarchiv mitgespeichert */
  const original = useRef<Uint8Array | null>(null);
  // Projekt mit Flächen aus einem früheren IFC-Import: standardmäßig abgleichen statt neu aufsetzen
  const [opts, setOpts] = useState<IfcImportOptions & { modus: 'neu' | 'hinzufuegen' | 'aktualisieren' }>(() => ({
    rooms: true,
    outlines: true,
    roof: true,
    wohnflaeche: false,
    planSchnitthoehe: 1,
    dachform: true,
    modus: hatIfcHerkunft(useEditor.getState().project) ? 'aktualisieren' : 'neu',
  }));

  const choose = async () => {
    setError(null);
    const f = await pickFile('.ifc');
    if (!f) return;
    setStep({ kind: 'loading', msg: 'Datei wird gelesen …' });
    try {
      const data = new Uint8Array(await f.arrayBuffer());
      original.current = data;
      const { loadIfc } = await import('@core/platform/ifc');
      const done = log.time(`IFC lesen: ${f.name}`);
      const x = await loadIfc(data.slice(), (msg) => {
        log.debug(msg);
        setStep({ kind: 'loading', msg });
      });
      done({ bytes: data.byteLength, geschosse: x.storeys.length, zonen: x.spaces.length });
      setStep({ kind: 'options', x, file: f.name });
    } catch (e) {
      log.error(`IFC-Datei konnte nicht gelesen werden: ${f.name}`, e);
      setError(`IFC-Datei konnte nicht gelesen werden: ${e instanceof Error ? e.message : String(e)}`);
      setStep({ kind: 'start' });
    }
  };

  const doImport = async (x: IfcExtract, file: string) => {
    setStep({ kind: 'loading', msg: 'Flächen werden ermittelt …' });
    await new Promise((r) => setTimeout(r, 30));
    try {
      const r = buildFromIfc(x, opts);
      const st = useEditor.getState();
      if (opts.modus === 'aktualisieren') {
        // Abgleich über die IFC-GlobalIds: Änderungen von Hand bleiben, das Modell wird ersetzt
        const a = ifcAbgleichen(st.project, r, { raeume: opts.rooms, umrisse: opts.outlines, modelle: opts.roof, lageplan: true, plaene: !!opts.planSchnitthoehe });
        st.update(() => {
          return original.current ? ifcDateiErsetzen(a.project, file, original.current) : a.project;
        });
        const { ifcReference } = await import('@core/platform/ifc');
        st.setIfcModel(ifcReference(x, file));
        log.info('IFC abgeglichen', { datei: file, ...a.zaehler });
        setStep({ kind: 'done', report: [...a.bericht, ...r.report.filter((z) => !/übernommen\.$/.test(z))] });
        return;
      }
      if (opts.modus === 'neu') {
        if (st.dirty && !window.confirm('Ungespeicherte Änderungen am aktuellen Projekt verwerfen?')) {
          setStep({ kind: 'options', x, file });
          return;
        }
        const p = createProject(x.projectName || file.replace(/\.ifc$/i, ''));
        p.storeys = r.storeys;
        p.dachModell = r.dachModell;
        if (r.gelaendeModell) p.gelaendeModell = r.gelaendeModell;
        // Lageplan (Geschoss „Lageplan“, IFC-Gelände) für den GRZ/GFZ-Nachweis mitnehmen
        if (r.lageplan) p.lageplan = r.lageplan;
        st.loadProject(original.current ? addDatei(p, file, 'ifc', original.current).project : p);
      } else {
        st.update((p) => {
          const next = {
            ...p,
            storeys: [...p.storeys, ...r.storeys],
            dachModell: r.dachModell ?? p.dachModell,
            gelaendeModell: r.gelaendeModell ?? p.gelaendeModell,
            lageplan: r.lageplan ? { flaechen: [...(p.lageplan?.flaechen ?? []), ...r.lageplan.flaechen] } : p.lageplan,
          };
          return original.current ? addDatei(next, file, 'ifc', original.current).project : next;
        });
      }
      const { ifcReference } = await import('@core/platform/ifc');
      st.setIfcModel(ifcReference(x, file));
      const res = computeProject(useEditor.getState().project);
      log.info('IFC-Import abgeschlossen', { datei: file, bericht: r.report, bgf: res.total.bgf.total, bri: res.total.bri.total, nrf: res.total.nrf.total, wofl: res.total.wofl });
      setStep({
        kind: 'done',
        report: [
          ...r.report,
          `Ergebnis: BGF ${fmt2(res.total.bgf.total)} m², BRI ${fmt2(res.total.bri.total)} m³, NRF ${fmt2(res.total.nrf.total)} m²${res.total.wofl ? `, WoFl ${fmt2(res.total.wofl)} m²` : ''}.`,
        ],
      });
    } catch (e) {
      log.error('IFC-Import fehlgeschlagen', e);
      setError(`Import fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
      setStep({ kind: 'options', x, file });
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal modal-wide">
        <h3>IFC-Import</h3>
        {step.kind === 'start' && (
          <>
            <p className="small-text">
              Übernimmt aus einem IFC-Modell (z. B. Archicad, Revit, Vectorworks) die <strong>Geschosse</strong>, die <strong>Zonen/Räume</strong> (IfcSpace)
              als Räume, die <strong>BGF-Umrisse</strong> aus den Außenbauteilen und die <strong>Dachhaut</strong> für den Brutto-Rauminhalt.
            </p>
            <p className="muted small-text">
              Archicad: Datei → Speichern unter → IFC, mit einem Übersetzer, der Zonen exportiert (siehe docs/archicad-ifc.md). Die Datei wird nur lokal
              verarbeitet.
            </p>
            <div className="dialog-buttons">
              <button onClick={onClose}>Abbrechen</button>
              <button className="primary" onClick={choose}>
                IFC-Datei wählen …
              </button>
            </div>
          </>
        )}
        {step.kind === 'loading' && <p className="busy">{step.msg}</p>}
        {step.kind === 'options' && (
          <>
            <p className="small-text">
              <strong>{step.file}</strong> ({step.x.schema}) – {step.x.storeys.length} Geschosse, {step.x.spaces.length} Räume/Zonen, {step.x.elements.length} Bauteile
            </p>
            <ul className="ifc-storeys">
              {[...step.x.storeys]
                .sort((a, b) => a.elevation - b.elevation)
                .map((s) => (
                  <li key={s.expressId}>
                    {s.name} <span className="muted">(± {fmt2(s.elevation)} m, {step.x.spaces.filter((sp) => step.x.storeys[sp.storey] === s).length} Räume)</span>
                  </li>
                ))}
            </ul>
            <label className="toggle block">
              <input type="checkbox" checked={opts.rooms} onChange={(e) => setOpts({ ...opts, rooms: e.target.checked })} />
              Räume aus Zonen (IfcSpace) – Nummer, Name, Putzabzug wie im Modell
            </label>
            <label className="toggle block indent">
              <input type="checkbox" checked={opts.wohnflaeche} disabled={!opts.rooms} onChange={(e) => setOpts({ ...opts, wohnflaeche: e.target.checked })} />
              als Wohnfläche anrechnen (WoFlV-Faktor aus den lichten Raumhöhen, Wohnung = Geschoss)
            </label>
            <label className="toggle block">
              <input type="checkbox" checked={opts.outlines} onChange={(e) => setOpts({ ...opts, outlines: e.target.checked })} />
              BGF-Umrisse aus Wänden, Stützen, Fenstern und Türen je Geschoss
            </label>
            <label className="toggle block">
              <input type="checkbox" checked={opts.roof} onChange={(e) => setOpts({ ...opts, roof: e.target.checked })} />
              Dach aus dem Modell für den BRI (Volumen bis zur Dachhaut)
            </label>
            <label className="toggle block indent">
              <input type="checkbox" checked={!!opts.dachform} disabled={!opts.roof} onChange={(e) => setOpts({ ...opts, dachform: e.target.checked })} />
              Dachform und Gauben erkennen (BRI mit Formeln, z. B. Walmdach + Schleppgaube) – nur wenn sie das Modell genau treffen
            </label>
            <label className="toggle block">
              <input
                type="checkbox"
                checked={!!opts.planSchnitthoehe}
                onChange={(e) => setOpts({ ...opts, planSchnitthoehe: e.target.checked ? 1 : 0 })}
              />
              Geschossschnitt als Plan hinterlegen (zum Prüfen und Korrigieren im Grundriss)
            </label>
            {!!opts.planSchnitthoehe && (
              <label className="toggle block indent">
                Schnitthöhe über Fußboden
                <span className="inline-num">
                  <NumberField value={opts.planSchnitthoehe} min={0.1} max={5} onChange={(v) => v && setOpts({ ...opts, planSchnitthoehe: v })} />
                </span>
                m
              </label>
            )}
            <hr />
            <label className="toggle block" title="Räume über die IFC-GlobalId zuordnen: neue Geometrie aus der IFC, von Hand geänderte Angaben bleiben, neue Zonen kommen hinzu">
              <input type="radio" checked={opts.modus === 'aktualisieren'} onChange={() => setOpts({ ...opts, modus: 'aktualisieren' })} />
              aktuelles Projekt aktualisieren (erneuter Export desselben Modells – Ihre Änderungen bleiben)
            </label>
            <label className="toggle block">
              <input type="radio" checked={opts.modus === 'neu'} onChange={() => setOpts({ ...opts, modus: 'neu' })} />
              als neues Projekt öffnen
            </label>
            <label className="toggle block">
              <input type="radio" checked={opts.modus === 'hinzufuegen'} onChange={() => setOpts({ ...opts, modus: 'hinzufuegen' })} />
              Geschosse zum aktuellen Projekt hinzufügen
            </label>
            <div className="dialog-buttons">
              <button onClick={onClose}>Abbrechen</button>
              <button className="primary" onClick={() => doImport(step.x, step.file)}>
                {opts.modus === 'aktualisieren' ? 'Aktualisieren' : 'Importieren'}
              </button>
            </div>
          </>
        )}
        {step.kind === 'done' && (
          <>
            <ul className="ifc-report">
              {step.report.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            <p className="muted small-text">
              Bitte die übernommenen Flächen prüfen: Räume ohne passende Nutzungsgruppe stehen auf NUF 1; Dachflächen und Umrisse sind im 3D-Modell zu sehen.
            </p>
            <div className="dialog-buttons">
              <button onClick={onClose}>Schließen</button>
              <button
                className="primary"
                onClick={() => {
                  useEditor.getState().setMainView('3d');
                  onClose();
                }}
              >
                3D-Ansicht öffnen
              </button>
            </div>
          </>
        )}
        {error && <p className="warning">{error}</p>}
      </div>
    </div>
  );
}
