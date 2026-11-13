import { useEffect, useRef, useState } from 'react';
import { computeProject } from '@core/calc';
import { fmt2 } from '@core/format';
import type { IfcExtract } from '@core/ifcData';
import type { IfcImportOptions } from '@core/ifcImport';
import { buildFromIfc } from '@core/ifcImport';
import { hatIfcHerkunft, ifcAbgleichen, ifcHinzufuegen, projektAusIfc, wohnflaecheAusProjekt } from '@core/ifcAbgleich';
import { ifcDateiErsetzen } from '@core/platform/ifcAktualisieren';
// statisch: klein; das große web-ifc lädt loadIfc erst bei Bedarf nach
import { ifcReference, loadIfc } from '@core/platform/ifc';
import { addDatei } from '@core/model';
import { pickFile } from '@core/platform/files';
import { useEditor } from '../store/store';
import { NumberField } from '@core/ui/fields';
import { logger } from '@core/platform/log';
import { verwerfenOk } from './Toolbar';
import { Modal } from '@core/ui/Dialog';
import { anzahl } from '../core/text';

const log = logger('ifc');

type Step = { kind: 'start' } | { kind: 'loading'; msg: string; abbrechbar?: boolean } | { kind: 'options'; x: IfcExtract; file: string } | { kind: 'done'; report: string[] };

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
    // beim Abgleich wie beim bisherigen Import
    wohnflaeche: wohnflaecheAusProjekt(useEditor.getState().project) ?? false,
    wohnung: 'eine',
    wohnungName: 'WE 01',
    planSchnitthoehe: 1,
    dachform: true,
    modus: hatIfcHerkunft(useEditor.getState().project) ? 'aktualisieren' : 'neu',
  }));

  // web-ifc schon beim Öffnen des Dialogs laden (F-22) – das Lesen der Datei startet dann ohne Wartezeit
  useEffect(() => {
    void import('web-ifc').catch(() => undefined);
  }, []);
  /** zählt bei jedem Laden bzw. Abbrechen weiter – ein abgebrochener Ladevorgang wird verworfen */
  const lauf = useRef(0);

  const choose = async () => {
    setError(null);
    const f = await pickFile('.ifc');
    if (!f) return;
    const meiner = ++lauf.current;
    setStep({ kind: 'loading', msg: 'Datei wird gelesen …', abbrechbar: true });
    try {
      const data = new Uint8Array(await f.arrayBuffer());
      original.current = data;
      const done = log.time(`IFC lesen: ${f.name}`);
      const x = await loadIfc(data.slice(), (msg) => {
        log.debug(msg);
        if (lauf.current === meiner) setStep({ kind: 'loading', msg, abbrechbar: true });
      });
      if (lauf.current !== meiner) return; // abgebrochen
      done({ bytes: data.byteLength, geschosse: x.storeys.length, zonen: x.spaces.length });
      if (!x.storeys.length) {
        log.warn(`IFC ohne Geschosse: ${f.name}`);
        setError('Die Datei enthält keine Geschosse (IfcBuildingStorey). Bitte im CAD-Programm das Gebäudemodell samt Geschossen als IFC exportieren.');
        setStep({ kind: 'start' });
        return;
      }
      setStep({ kind: 'options', x, file: f.name });
    } catch (e) {
      if (lauf.current !== meiner) return;
      log.error(`IFC-Datei konnte nicht gelesen werden: ${f.name}`, e);
      setError('Die Datei ist keine gültige IFC-Datei oder beschädigt. Bitte im CAD-Programm erneut als IFC 2x3 oder IFC4 exportieren. Einzelheiten stehen im Protokoll.');
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
        const a = ifcAbgleichen(st.project, r, { raeume: opts.rooms, umrisse: opts.outlines, modelle: opts.roof, lageplan: true, plaene: !!opts.planSchnitthoehe, wohnflaeche: opts.wohnflaeche });
        st.update(() => {
          return original.current ? ifcDateiErsetzen(a.project, file, original.current) : a.project;
        });
        st.setIfcModel(ifcReference(x, file));
        log.info('IFC abgeglichen', { datei: file, ...a.zaehler });
        setStep({ kind: 'done', report: [...a.bericht, ...r.report.filter((z) => !/übernommen\.$/.test(z))] });
        return;
      }
      if (opts.modus === 'neu') {
        if (!(await verwerfenOk())) {
          setStep({ kind: 'options', x, file });
          return;
        }
        // samt Lageplan (Geschoss „Lageplan“, IFC-Gelände) für den GRZ/GFZ-Nachweis
        const p = projektAusIfc(x.projectName || file.replace(/\.ifc$/i, ''), r);
        st.loadProject(original.current ? addDatei(p, file, 'ifc', original.current).project : p);
      } else {
        st.update((p) => {
          const next = ifcHinzufuegen(p, r);
          return original.current ? addDatei(next, file, 'ifc', original.current).project : next;
        });
      }
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
      setError('Der Import ist fehlgeschlagen; das Projekt bleibt unverändert. Einzelheiten stehen im Protokoll.');
      setStep({ kind: 'options', x, file });
    }
  };

  return (
    <Modal titel="IFC-Import" breit klickDaneben={false} onClose={step.kind === 'loading' ? undefined : onClose}>
        <h3>IFC-Import</h3>
        {error && (
          <p className="warning" role="alert">
            {error}
          </p>
        )}
        {step.kind === 'start' && (
          <>
            <p className="small-text">
              Übernimmt aus einem IFC-Modell (z. B. Archicad, Revit, Vectorworks) die <strong>Geschosse</strong>, die <strong>Zonen/Räume</strong> (IfcSpace)
              als Räume, die <strong>BGF-Umrisse</strong> aus den Außenbauteilen und die <strong>Dachhaut</strong> für den Brutto-Rauminhalt.
            </p>
            <p className="muted small-text">
              Archicad: Datei → Speichern unter → IFC, mit einem Übersetzer, der Zonen exportiert. Die Datei wird nur lokal verarbeitet.
            </p>
            <div className="dialog-buttons">
              <button onClick={onClose}>Abbrechen</button>
              <button className="primary" autoFocus onClick={choose}>
                IFC-Datei wählen …
              </button>
            </div>
          </>
        )}
        {step.kind === 'loading' && (
          <>
            <p className="busy">{step.msg}</p>
            {step.abbrechbar && (
            <div className="dialog-buttons">
              <button
                onClick={() => {
                  lauf.current++;
                  setStep({ kind: 'start' });
                }}
              >
                Abbrechen
              </button>
            </div>
            )}
          </>
        )}
        {step.kind === 'options' && (
          <>
            <p className="small-text">
              <strong>{step.file}</strong> ({step.x.schema}) – {anzahl(step.x.storeys.length, 'Geschoss', 'Geschosse')}, {anzahl(step.x.spaces.length, 'Raum/Zone', 'Räume/Zonen')},{' '}
              {anzahl(step.x.elements.length, 'Bauteil', 'Bauteile')}
            </p>
            {/* oberstes Geschoss oben – wie in der Seitenleiste */}
            <ul className="ifc-storeys">
              {[...step.x.storeys]
                .sort((a, b) => b.elevation - a.elevation)
                .map((s) => (
                  <li key={s.expressId}>
                    {s.name}{' '}
                    <span className="muted">
                      (± {fmt2(s.elevation)} m, {anzahl(step.x.spaces.filter((sp) => step.x.storeys[sp.storey] === s).length, 'Raum', 'Räume')})
                    </span>
                  </li>
                ))}
            </ul>
            <fieldset className="ifc-block">
              <legend>Art des Imports</legend>
              <label className="toggle block">
                <input type="radio" name="ifc-modus" checked={opts.modus === 'aktualisieren'} onChange={() => setOpts({ ...opts, modus: 'aktualisieren' })} />
                aktuelles Projekt aktualisieren
              </label>
              <label className="toggle block">
                <input type="radio" name="ifc-modus" checked={opts.modus === 'neu'} onChange={() => setOpts({ ...opts, modus: 'neu' })} />
                als neues Projekt öffnen
              </label>
              <label className="toggle block">
                <input type="radio" name="ifc-modus" checked={opts.modus === 'hinzufuegen'} onChange={() => setOpts({ ...opts, modus: 'hinzufuegen' })} />
                Geschosse zum aktuellen Projekt hinzufügen
              </label>
              <p className="muted small-text ifc-modus-text">
                {opts.modus === 'aktualisieren'
                  ? 'Für einen erneuten Export desselben Modells: Räume werden über die IFC-GlobalId zugeordnet und erhalten die neue Geometrie; von Hand geänderte Angaben bleiben, neue Zonen kommen hinzu.'
                  : opts.modus === 'neu'
                    ? 'Ersetzt das geöffnete Projekt durch ein neues aus dem Modell (vorher wird nach ungespeicherten Änderungen gefragt).'
                    : 'Fügt die Geschosse des Modells zum geöffneten Projekt hinzu; vorhandene Geschosse bleiben unverändert.'}
              </p>
            </fieldset>
            <fieldset className="ifc-block">
              <legend>Übernehmen</legend>
              <label className="toggle block">
                <input type="checkbox" checked={opts.rooms} onChange={(e) => setOpts({ ...opts, rooms: e.target.checked })} />
                Räume aus Zonen (IfcSpace) – Nummer, Name, Putzabzug wie im Modell
              </label>
              <label className="toggle block indent">
                <input type="checkbox" checked={opts.wohnflaeche} disabled={!opts.rooms} onChange={(e) => setOpts({ ...opts, wohnflaeche: e.target.checked })} />
                als Wohnfläche anrechnen (Vorschlag nach Raumname, WoFlV-Faktor aus den lichten Raumhöhen)
              </label>
              {opts.rooms && opts.wohnflaeche && (
                <div className="ifc-wohnung indent">
                  <label className="toggle block">
                    <input type="radio" name="ifc-wohnung" checked={opts.wohnung === 'eine'} onChange={() => setOpts({ ...opts, wohnung: 'eine' })} />
                    eine Wohnung für alle Geschosse
                    <input
                      className="ifc-wohnung-name"
                      aria-label="Name der Wohnung"
                      placeholder="WE 01"
                      value={opts.wohnungName ?? ''}
                      disabled={opts.wohnung !== 'eine'}
                      onChange={(e) => setOpts({ ...opts, wohnungName: e.target.value })}
                    />
                  </label>
                  <label className="toggle block">
                    <input type="radio" name="ifc-wohnung" checked={opts.wohnung === 'geschoss'} onChange={() => setOpts({ ...opts, wohnung: 'geschoss' })} />
                    je Geschoss eine Wohnung (Wohnung = Geschossname)
                  </label>
                  <label className="toggle block">
                    <input type="radio" name="ifc-wohnung" checked={opts.wohnung === 'zone'} onChange={() => setOpts({ ...opts, wohnung: 'zone' })} />
                    aus der Zonenkategorie (IFC-Objekttyp der Zone)
                  </label>
                </div>
              )}
              <label className="toggle block">
                <input type="checkbox" checked={opts.outlines} onChange={(e) => setOpts({ ...opts, outlines: e.target.checked })} />
                BGF-Umrisse aus Wänden, Stützen, Fenstern und Türen je Geschoss
              </label>
              <label className="toggle block">
                <input type="checkbox" checked={opts.roof} onChange={(e) => setOpts({ ...opts, roof: e.target.checked })} />
                Dach aus dem Modell für den BRI (Volumen bis zur Dachhaut)
              </label>
            </fieldset>
            <fieldset className="ifc-block">
              <legend>Prüfhilfen</legend>
              <label className="toggle block">
                <input type="checkbox" checked={!!opts.dachform} disabled={!opts.roof} onChange={(e) => setOpts({ ...opts, dachform: e.target.checked })} />
                Dachform und Gauben erkennen (BRI mit Formeln, z. B. Walmdach + Schleppgaube) – nur wenn sie das Modell genau treffen
              </label>
              <label className="toggle block">
                <input type="checkbox" checked={!!opts.planSchnitthoehe} onChange={(e) => setOpts({ ...opts, planSchnitthoehe: e.target.checked ? 1 : 0 })} />
                Geschossschnitt als Plan hinterlegen (zum Prüfen und Korrigieren im Grundriss)
              </label>
              {!!opts.planSchnitthoehe && (
                <label className="toggle block indent mit-feld">
                  Schnitthöhe über Fußboden
                  <span className="inline-num">
                    <NumberField value={opts.planSchnitthoehe} min={0.1} max={5} onChange={(v) => v && setOpts({ ...opts, planSchnitthoehe: v })} />
                  </span>
                  m
                </label>
              )}
            </fieldset>
            <div className="dialog-buttons">
              <button onClick={onClose}>Abbrechen</button>
              <button className="primary" autoFocus onClick={() => doImport(step.x, step.file)}>
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
                autoFocus
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
    </Modal>
  );
}
