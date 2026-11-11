import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { NumberField, TextField } from '@core/ui/fields';
import type { DxfStil, KatasterPlan, VorlageInfo } from '../kataster/kataster';
import { ausschnitt, karteVon, planDateiname, planFehler } from '../kataster/kataster';
import { useKataster } from '../kataster/katasterStore';
import { useFormulare } from '../store';
import { Symbol } from './Symbol';

function Karte({ titel, text, children, kopf }: { titel: string; text?: ReactNode; children: ReactNode; kopf?: ReactNode }) {
  return (
    <section className="es-karte">
      <div className="es-karte-kopf">
        <h3>{titel}</h3>
        {kopf}
      </div>
      {text && <p className="muted small-text">{text}</p>}
      {children}
    </section>
  );
}

const STIL: { id: DxfStil; text: string }[] = [
  { id: 'symbollayer', text: 'je Symbolebene (wie in QGIS)' },
  { id: 'objekt', text: 'je Objekt' },
  { id: 'ohne', text: 'ohne Symbolik (nur Geometrie)' },
];

/** Auswahl mit den Werten der Vorlage; ein gespeicherter Wert, den es dort nicht gibt, bleibt sichtbar (markiert) */
function Wahl({ wert, werte, leer, label, onChange }: { wert: string; werte: string[]; leer?: string; label: string; onChange: (v: string) => void }) {
  const alle = wert && !werte.includes(wert) ? [...werte, wert] : werte;
  return (
    <select value={wert} aria-label={label} onChange={(e) => onChange(e.target.value)} className={wert && !werte.includes(wert) && werte.length ? 'feld-fehler' : undefined}>
      {leer !== undefined && <option value="">{leer}</option>}
      {alle.map((w) => (
        <option key={w} value={w}>
          {w}
          {!werte.includes(w) && werte.length ? ' (nicht in der Vorlage)' : ''}
        </option>
      ))}
    </select>
  );
}

function PlanKarte({ plan, info, erster, letzter }: { plan: KatasterPlan; info: VorlageInfo | null; erster: boolean; letzter: boolean }) {
  const { planAendern, planEntfernen, planVerschieben } = useKataster.getState();
  const setzen = (patch: Partial<KatasterPlan>) => void planAendern(plan.id, patch);
  const layout = info?.layouts.find((l) => l.name === plan.layout);
  const karte = info ? karteVon(info, plan) : null;
  const fehler = planFehler(plan, info);
  const zeigt = karte && karte.breite > 0 ? ausschnitt(karte, plan.massstab) : null;
  const m = (v: number) => v.toLocaleString('de-DE', { maximumFractionDigits: 1 });
  return (
    <div className={`ka-plan${plan.aktiv ? '' : ' inaktiv'}`}>
      <div className="ka-plan-kopf">
        <label className="ka-aktiv" title="Im Export-Dialog vorgewählt">
          <input type="checkbox" checked={plan.aktiv} onChange={(e) => setzen({ aktiv: e.target.checked })} />
        </label>
        <span className={`ka-art ${plan.art}`}>{plan.art.toUpperCase()}</span>
        <span className="ka-name">
          <TextField value={plan.name} onChange={(v) => setzen({ name: v.trim() || plan.name })} label="Name des Plans" />
        </span>
        <button className="icon" disabled={erster} title="Nach oben" aria-label={`${plan.name} nach oben`} onClick={() => void planVerschieben(plan.id, -1)}>
          ↑
        </button>
        <button className="icon" disabled={letzter} title="Nach unten" aria-label={`${plan.name} nach unten`} onClick={() => void planVerschieben(plan.id, 1)}>
          ↓
        </button>
        <button className="icon" title="Plan entfernen" aria-label={`${plan.name} entfernen`} onClick={() => void planEntfernen(plan.id)}>
          <Symbol name="muell" />
        </button>
      </div>
      <div className="es-raster ka-raster">
        {plan.art === 'pdf' && (
          <>
            <label>
              <span className="field-label">Layout</span>
              <Wahl wert={plan.layout} werte={info?.layouts.map((l) => l.name) ?? []} leer="– bitte wählen –" label="Layout" onChange={(v) => setzen({ layout: v, karte: '' })} />
            </label>
            <label>
              <span className="field-label">Kartenobjekt</span>
              <Wahl wert={plan.karte} werte={(layout?.karten.map((k) => k.id) ?? []).filter(Boolean)} leer="das erste" label="Kartenobjekt" onChange={(v) => setzen({ karte: v })} />
            </label>
          </>
        )}
        <label>
          <span className="field-label">Kartenthema</span>
          <Wahl wert={plan.thema} werte={info?.themen ?? []} leer="sichtbare Layer" label="Kartenthema" onChange={(v) => setzen({ thema: v })} />
        </label>
        <label>
          <span className="field-label">{plan.art === 'pdf' ? 'Maßstab 1 :' : 'Symbolmaßstab 1 :'}</span>
          <NumberField value={plan.massstab} digits={0} min={1} max={1000000} label="Maßstab" onChange={(v) => v && setzen({ massstab: v })} />
        </label>
        <label>
          <span className="field-label">Ausschnitt Breite (m)</span>
          <NumberField
            value={plan.breite}
            digits={0}
            min={1}
            max={100000}
            allowEmpty
            placeholder={zeigt ? m(zeigt.breite) : plan.art === 'dxf' ? 'Pflicht' : 'aus Maßstab'}
            label="Breite des Ausschnitts"
            onChange={(v) => setzen({ breite: v })}
          />
        </label>
        <label>
          <span className="field-label">Höhe (m)</span>
          <NumberField
            value={plan.hoehe}
            digits={0}
            min={1}
            max={100000}
            allowEmpty
            placeholder={zeigt ? m(zeigt.hoehe) : plan.art === 'dxf' ? 'Pflicht' : 'aus Maßstab'}
            label="Höhe des Ausschnitts"
            onChange={(v) => setzen({ hoehe: v })}
          />
        </label>
        {plan.art === 'pdf' ? (
          <label>
            <span className="field-label">Auflösung (dpi)</span>
            <NumberField value={plan.dpi} digits={0} min={72} max={1200} label="Auflösung" onChange={(v) => v && setzen({ dpi: v })} />
          </label>
        ) : (
          <>
            <label>
              <span className="field-label">Stil (Symbolik)</span>
              <select value={plan.stil} aria-label="Stil" onChange={(e) => setzen({ stil: e.target.value as DxfStil })}>
                {STIL.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.text}
                  </option>
                ))}
              </select>
            </label>
            <label className="ka-check">
              <input type="checkbox" checked={plan.beschriftungen} onChange={(e) => setzen({ beschriftungen: e.target.checked })} />
              <span>Beschriftungen der Layer</span>
            </label>
          </>
        )}
        <label className="es-breit">
          <span className="field-label">Beschriftung {plan.art === 'pdf' && <code>[% @plan_beschriftung %]</code>}</span>
          <TextField
            value={plan.beschriftung}
            onChange={(v) => setzen({ beschriftung: v })}
            label="Beschriftung"
            placeholder={plan.art === 'pdf' ? 'z. B. Auszug aus der Liegenschaftskarte' : 'für DXF ohne Wirkung'}
          />
        </label>
      </div>
      {plan.art === 'pdf' && zeigt && !(plan.breite && plan.hoehe) && (
        <p className="muted small-text">
          Das Kartenobjekt ({m(karte!.breite)} × {m(karte!.hoehe)} mm) zeigt bei 1:{plan.massstab.toLocaleString('de-DE')} einen Ausschnitt von {m(zeigt.breite)} × {m(zeigt.hoehe)} m um die
          Projektadresse.
        </p>
      )}
      {plan.art === 'pdf' && !!(plan.breite && plan.hoehe) && <p className="muted small-text">Mit Breite und Höhe ergibt sich der Maßstab aus dem Ausschnitt – die Maßstabsangabe gilt dann nicht.</p>}
      {fehler.map((f) => (
        <p key={f} className="warning small-text">
          {f}
        </p>
      ))}
    </div>
  );
}

/**
 * Katasterpläne: QGIS-Vorlage (gemeinsam für alle Projekte), Pfad zu qgis_process (je Rechner), Ablage und die
 * Pläne (Layouts bzw. Kartenthemen der Vorlage, Maßstab, Ausschnitt, Stil, Beschriftung).
 */
export function KatasterEinstellungen() {
  const e = useKataster((s) => s.einstellungen);
  const programm = useKataster((s) => s.programm);
  const vi = useKataster((s) => s.vorlageInfo);
  const { aendern, vorlageWaehlen, vorlageInfoLaden, programmSetzen, programmSuchen, planHinzufuegen, vorgabenWiederherstellen } = useKataster.getState();
  const [gefunden, setGefunden] = useState<string[] | null>(null);
  // Desktop-App (Zugriff auf Dateien und Programme)
  const desktop = useFormulare((s) => !!s.ds);
  useEffect(() => {
    void useKataster.getState().laden();
  }, []);
  const info = vi?.info ?? null;
  const beispiel = planDateiname(e.dateiname, { name: 'Katasterauszug A4', art: 'pdf' }, { code: 'MUS', kuerzel: 'BS9', art: 'BAUA', datum: new Date() });

  return (
    <>
      <h2>Katasterpläne</h2>
      <p className="muted">
        Katasterauszüge (PDF aus Layouts) und DXF-Pläne (Vektorlayer eines Kartenthemas) kommen aus einem QGIS-Projekt als Vorlage – mit den Diensten (WMS/WFS) und Layouts des Büros. QGIS läuft dafür
        unsichtbar im Hintergrund (<code>qgis_process</code>, ab QGIS 3.28). Der Plan wird um die Koordinaten der Projektadresse gelegt (EPSG:25832). Beim ersten Export wird die Vorlage in die
        Projektdatei (.oap) übernommen und danach von dort verwendet; „Vorlage aktualisieren“ im Export-Dialog holt die aktuelle Fassung.
      </p>
      {!desktop && <p className="warning small-text">Der Export braucht die Desktop-App (QGIS läuft auf diesem Rechner).</p>}

      <Karte
        titel="QGIS-Vorlage"
        text={
          <>
            Planköpfe: Projektvariablen <code>@project_title</code> (Vorhaben), <code>@project_identifier</code> (Projektcode), <code>@project_street</code>, <code>@project_city</code>,{' '}
            <code>@project_zip_code</code>; je Plan zusätzlich <code>@plan_name</code>, <code>@plan_massstab</code>, <code>@plan_datum</code> und <code>@plan_beschriftung</code>.
          </>
        }
      >
        <div className="ka-zeile">
          <span className="ka-pfad" title={e.vorlage}>
            {e.vorlage || <span className="muted">Keine Vorlage gewählt</span>}
          </span>
          <button className="small" disabled={!desktop} onClick={() => void vorlageWaehlen()}>
            <Symbol name="ordner" /> Wählen …
          </button>
          {e.vorlage && (
            <button className="small" disabled={!desktop} title="Vorlage neu einlesen (nach Änderungen in QGIS)" onClick={() => void vorlageInfoLaden()}>
              Neu einlesen
            </button>
          )}
        </div>
        {vi?.fehler && <p className="warning small-text">Vorlage nicht lesbar: {vi.fehler}</p>}
        {info && (
          <p className="muted small-text">
            {info.layouts.length} {info.layouts.length === 1 ? 'Layout' : 'Layouts'}
            {info.layouts.length ? ` (${info.layouts.map((l) => l.name).join(', ')})` : ''} · {info.themen.length} {info.themen.length === 1 ? 'Kartenthema' : 'Kartenthemen'}
            {info.themen.length ? ` (${info.themen.join(', ')})` : ''}
          </p>
        )}
      </Karte>

      <Karte titel="QGIS auf diesem Rechner" text="Pfad zu qgis_process – unter Windows z. B. C:\Program Files\QGIS 3.40\bin\qgis_process-qgis-ltr.bat. Gilt nur für diesen Rechner.">
        <div className="ka-zeile">
          <span className="ka-name">
            <TextField value={programm} onChange={programmSetzen} label="Pfad zu qgis_process" placeholder="qgis_process-qgis-ltr.bat" />
          </span>
          <button
            className="small"
            disabled={!desktop}
            onClick={() =>
              void programmSuchen()
                .then(setGefunden)
                .catch(() => setGefunden([]))
            }
          >
            <Symbol name="suche" /> Suchen
          </button>
        </div>
        {gefunden && !gefunden.length && <p className="warning small-text">QGIS wurde in den üblichen Installationsordnern nicht gefunden – bitte den Pfad eintragen.</p>}
        {gefunden && gefunden.length > 0 && (
          <ul className="es-liste">
            {gefunden.map((g) => (
              <li key={g}>
                <span className="es-liste-text">{g}</span>
                <button className="small" disabled={g === programm} onClick={() => programmSetzen(g)}>
                  {g === programm ? 'Gewählt' : 'Verwenden'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Karte>

      <Karte
        titel="Ablage"
        text={
          <>
            Beispiel: <strong>{beispiel}</strong> – Platzhalter: {'{Code}'} (Projektcode), {'{Art}'} (Antragsart), {'{Datum}'} (JJMMTT), {'{Name}'} (Plan), {'{Kürzel}'}.
          </>
        }
      >
        <div className="ex-ziele" role="radiogroup" aria-label="Ablage der Katasterpläne">
          <label className={`ex-ziel${e.ziel === 'pfad' ? ' aktiv' : ''}`}>
            <input type="radio" checked={e.ziel === 'pfad'} onChange={() => void aendern({ ziel: 'pfad' })} />
            <span>
              Ordner im Projektordner
              <TextField value={e.zielpfad} onChange={(v) => void aendern({ zielpfad: v })} label="Ordner der Katasterpläne" placeholder="Kataster" />
            </span>
          </label>
          <label className={`ex-ziel${e.ziel === 'antrag' ? ' aktiv' : ''}`}>
            <input type="radio" checked={e.ziel === 'antrag'} onChange={() => void aendern({ ziel: 'antrag' })} />
            <span>Ordner der aktiven Antragsfassung (z. B. TÖB\BAUA 2)</span>
          </label>
        </div>
        <label className="ex-feld">
          <span className="field-label">Dateiname</span>
          <TextField value={e.dateiname} onChange={(v) => void aendern({ dateiname: v })} label="Dateiname der Katasterpläne" />
        </label>
      </Karte>

      <Karte
        titel="Pläne"
        kopf={
          <span className="ka-knoepfe">
            <button className="small" onClick={() => void planHinzufuegen('pdf')}>
              <Symbol name="plus" /> PDF
            </button>
            <button className="small" onClick={() => void planHinzufuegen('dxf')}>
              <Symbol name="plus" /> DXF
            </button>
            <button className="small" title="Die vier Standardpläne wiederherstellen (eigene Pläne entfallen)" onClick={() => void vorgabenWiederherstellen()}>
              Vorgaben
            </button>
          </span>
        }
        text="PDF: Layout der Vorlage, das Kartenobjekt wird auf die Projektadresse gesetzt. DXF: die sichtbaren Vektorlayer des Kartenthemas im Ausschnitt um die Projektadresse (WMS-Rasterlayer entfallen)."
      >
        {!e.plaene.length && <p className="muted small-text">Keine Pläne eingerichtet.</p>}
        {e.plaene.map((p, i) => (
          <PlanKarte key={p.id} plan={p} info={info} erster={i === 0} letzter={i === e.plaene.length - 1} />
        ))}
      </Karte>
    </>
  );
}
