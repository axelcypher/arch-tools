import { useMemo } from 'react';
import { computeStorey } from '@core/calc';
import { fmt2 } from '@core/format';
import type { Massgrundlage } from '@core/model';
import { shapeArea } from '@core/model';
import { MASSGRUNDLAGEN, nutzungInfo } from '@core/norms';
import { addStorey, moveStorey, removeStorey, useActiveStorey, useEditor } from '../store/store';
import { Field, NumberField } from '@core/ui/fields';
import { ProjektInfo } from './ProjektDialog';
import { bestaetigen, fragen } from '@core/ui/Rueckfrage';
import { geschossDuplizierenAktion } from './KopieDialog';

/** „+ Neu“: Geschoss über oder unter dem aktiven einfügen, Name und Fußbodenhöhe nach der Lage (F-03) */
async function neuesGeschoss(bezugId: string, bezugName: string) {
  const lage = await fragen({
    titel: 'Neues Geschoss',
    text: `Wo soll das neue Geschoss liegen? Name und Fußbodenhöhe werden aus „${bezugName}“ abgeleitet und lassen sich danach ändern.`,
    knoepfe: [
      { id: 'abbrechen', label: 'Abbrechen' },
      { id: 'darunter', label: `unter „${bezugName}“` },
      { id: 'darueber', label: `über „${bezugName}“`, art: 'primary' },
    ],
  });
  if (lage !== 'darueber' && lage !== 'darunter') return;
  const st = useEditor.getState();
  const r = addStorey(st.project, undefined, bezugId, lage);
  st.update(() => r.project);
  st.setActiveStorey(r.id);
}

/** Linke Seitenleiste: Projekt, Geschosse, Flächenliste des aktiven Geschosses. */
export function Sidebar() {
  const project = useEditor((s) => s.project);
  const storey = useActiveStorey();
  const selectedId = useEditor((s) => s.selectedShapeId);
  const view = useEditor((s) => s.view);
  const st = useEditor.getState();

  const outlines = storey.shapes.filter((s) => s.kind === 'outline');
  const rooms = storey.shapes.filter((s) => s.kind === 'room');

  return (
    <aside className="sidebar sidebar-left">
      <section>
        <h2>Projekt</h2>
        <ProjektInfo />
        <div className="field-row projekt-settings">
          <Field label="Raster [m]">
            <NumberField
              value={project.settings.gridStep}
              min={0.001}
              digits={3}
              onChange={(v) => v && st.update((p) => ({ ...p, settings: { ...p.settings, gridStep: v } }))}
            />
          </Field>
          <Field label="Balkonfaktor">
            <NumberField
              value={project.settings.freisitzFaktor}
              min={0}
              max={0.5}
              onChange={(v) => v !== undefined && st.update((p) => ({ ...p, settings: { ...p.settings, freisitzFaktor: v } }))}
            />
          </Field>
        </div>
        <Field label="Maßgrundlage" hint="steht im Kopf von Bericht und Excel">
          <select
            value={project.settings.massgrundlage ?? ''}
            onChange={(e) => st.update((p) => ({ ...p, settings: { ...p.settings, massgrundlage: (e.target.value || undefined) as Massgrundlage | undefined } }))}
          >
            <option value="">nicht angegeben</option>
            {MASSGRUNDLAGEN.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <label className="toggle block" title="Nur zum Vergleich mit Bestandsberechnungen bis 31.12.2003 (§ 5 WoFlV, §§ 42–44 II. BV). Standard bleibt die WoFlV.">
          <input type="checkbox" checked={!!project.settings.zweiteBV} onChange={(e) => st.update((p) => ({ ...p, settings: { ...p.settings, zweiteBV: e.target.checked || undefined } }))} />
          Altberechnung nach II. BV (nur Vergleich)
        </label>
        {project.settings.zweiteBV && <p className="warning small-text">Wohnfläche als Altberechnung nach II. BV – nicht für neue Nachweise (dort gilt die WoFlV).</p>}
      </section>

      <section>
        <div className="section-head">
          <h2>Geschosse</h2>
          <button
            className="small"
            onClick={() => void neuesGeschoss(storey.id, storey.name)}
            title="Geschoss über oder unter dem aktiven einfügen"
          >
            + Neu
          </button>
        </div>
        <ul className="list">
          {[...project.storeys].reverse().map((s) => (
            <StoreyRow key={s.id} id={s.id} name={s.name} active={s.id === storey.id} />
          ))}
        </ul>
        <div className="button-row">
          <button
            className="small"
            onClick={() => void geschossDuplizierenAktion(storey.id)}
            title="Aktives Geschoss inkl. aller Flächen kopieren"
          >
            Duplizieren
          </button>
          <button className="small" onClick={() => st.update((p) => moveStorey(p, storey.id, 1))} title="Nach oben">
            ▲
          </button>
          <button className="small" onClick={() => st.update((p) => moveStorey(p, storey.id, -1))} title="Nach unten">
            ▼
          </button>
          <button
            className="small danger"
            disabled={project.storeys.length <= 1}
            onClick={() => void bestaetigen(`Geschoss „${storey.name}“ löschen?`, 'Das Geschoss wird mit allen Flächen gelöscht (rückgängig mit Strg+Z).', 'Löschen', true).then((ok) => ok && st.update((p) => removeStorey(p, storey.id)))}
          >
            Löschen
          </button>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={view.showGhost} onChange={(e) => st.setView({ showGhost: e.target.checked })} />
          darunterliegendes Geschoss einblenden
        </label>
      </section>

      <section className="grow">
        <h2>Flächen – {storey.name}</h2>
        <div className="layer-toggles">
          <label className="toggle">
            <input type="checkbox" checked={view.showOutlines} onChange={(e) => st.setView({ showOutlines: e.target.checked })} />
            BGF-Umrisse
          </label>
          <label className="toggle">
            <input type="checkbox" checked={view.showRooms} onChange={(e) => st.setView({ showRooms: e.target.checked })} />
            Räume
          </label>
          <label className="toggle">
            <input type="checkbox" checked={view.showDimensions} onChange={(e) => st.setView({ showDimensions: e.target.checked })} />
            Maße
          </label>
        </div>
        {storey.shapes.length === 0 && <p className="muted">Noch keine Flächen. Werkzeug „Polygon“ oder „Rechteck“ wählen und zeichnen.</p>}
        {outlines.length > 0 && <h3>BGF-Umrisse</h3>}
        <ul className="list shape-list">
          {outlines.map((s) => (
            <li key={s.id} className={s.id === selectedId ? 'active' : ''} onClick={() => st.select(s.id)}>
              <span className="swatch" style={{ background: s.subtract ? '#c0392b' : '#2a5bd7' }} />
              <span className="grow-text">
                {s.name} <small>({s.umschliessung})</small>
              </span>
              <span className="num">{fmt2(shapeArea(s) * (s.subtract ? -1 : 1))}</span>
            </li>
          ))}
        </ul>
        {rooms.length > 0 && <h3>Räume</h3>}
        <ul className="list shape-list">
          {rooms.map((s) => (
            <li key={s.id} className={s.id === selectedId ? 'active' : ''} onClick={() => st.select(s.id)}>
              <span className="swatch" style={{ background: s.subtract ? '#c0392b' : nutzungInfo(s.nutzung).color }} />
              <span className="grow-text">
                <small>{s.nummer}</small> {s.name}
              </span>
              <span className="num">{fmt2(shapeArea(s) * (s.subtract ? -1 : 1))}</span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

function StoreyRow({ id, name, active }: { id: string; name: string; active: boolean }) {
  const project = useEditor((s) => s.project);
  const storey = project.storeys.find((s) => s.id === id)!;
  const bgf = useMemo(() => computeStorey(storey, project).bgf.total, [storey, project]);
  return (
    <li className={active ? 'active' : ''} onClick={() => useEditor.getState().setActiveStorey(id)}>
      <span className="grow-text">{name}</span>
      <span className="num muted">{fmt2(bgf)} m²</span>
    </li>
  );
}
