import { Symbol } from '@core/ui/Symbol';
import { useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { nachNummer } from '../core/geschosse';
import { RaumTabelle } from './RaumTabelle';
import { computeStorey } from '@core/calc';
import { fmt2 } from '@core/format';
import type { Massgrundlage } from '@core/model';
import { shapeArea } from '@core/model';
import { MASSGRUNDLAGEN, nutzungInfo, raumNutzung } from '@core/norms';
import { addStorey, moveStorey, removeStorey, useActiveStorey, useEditor } from '../store/store';
import { Field, NumberField, TextField } from '@core/ui/fields';
import { fehlendeAngaben, planungsunterlagen } from '../core/bericht';
import { ProjektInfo } from './ProjektDialog';
import { bestaetigen, fragen } from '@core/ui/Rueckfrage';
import { geschossDuplizierenAktion } from './KopieDialog';
import { UmrissUebernehmen } from './Properties';

/** „Geschoss …“: Geschoss über oder unter dem aktiven einfügen, Name und Fußbodenhöhe nach der Lage (F-03) */
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
  // neues leeres Geschoss: das darunterliegende einblenden (Bezug zum Nachzeichnen, F-18)
  st.setView({ showGhost: true });
}

/** Linke Seitenleiste: Projekt, Geschosse, Flächenliste des aktiven Geschosses. */
export function Sidebar() {
  const project = useEditor((s) => s.project);
  const storey = useActiveStorey();
  const selectedIds = useEditor((s) => s.selectedIds);
  const gewaehlt = new Set(selectedIds);
  /** zuletzt per Klick gewählte Fläche – Anker für Umschalt+Klick (Bereich) */
  const anker = useRef<string | null>(null);
  const view = useEditor((s) => s.view);
  const st = useEditor.getState();

  const outlines = storey.shapes.filter((s) => s.kind === 'outline');
  // nach Nummer sortiert (natürliche Sortierung, F-21)
  const rooms = nachNummer(storey.shapes.filter((s) => s.kind === 'room'));
  const [tabelle, setTabelle] = useState(false);
  // Liste zeigt das oberste Geschoss oben (umgekehrte Reihenfolge von project.storeys)
  const index = project.storeys.findIndex((s) => s.id === storey.id);
  const obenAmEnde = index === project.storeys.length - 1;
  const untenAmEnde = index === 0;
  // Vorgabe der Planungsunterlagen: die hinterlegten Pläne (ohne eigene Eingabe)
  const planAuto = planungsunterlagen({ ...project, settings: { ...project.settings, planunterlagen: undefined } });
  const mass = MASSGRUNDLAGEN.find((m) => m.id === project.settings.massgrundlage)?.label;
  const grundlagen = [`Raster ${fmt2(project.settings.gridStep * 100).replace(',00', '')} cm`, `Balkon ${fmt2(project.settings.freisitzFaktor)}`, ...(mass ? [mass] : []), ...(project.settings.zweiteBV ? ['Vergleich II. BV'] : [])];
  // DIN 277, 5.1: im Bericht anzugeben – fehlt etwas, steht es schon in der eingeklappten Zeile
  /** Klick in der Flächenliste: wählt eine Fläche; Strg+Klick schaltet sie dazu bzw. weg, Umschalt+Klick wählt den Bereich */
  const listeKlick = (e: MouseEvent, id: string, liste: readonly { id: string }[]) => {
    if (e.ctrlKey || e.metaKey) {
      st.toggleSelect(id);
      anker.current = id;
      return;
    }
    const a = anker.current ? liste.findIndex((x) => x.id === anker.current) : -1;
    const b = liste.findIndex((x) => x.id === id);
    if (e.shiftKey && a >= 0 && b >= 0) {
      st.selectMany(liste.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.id));
      return;
    }
    st.select(id);
    anker.current = id;
  };
  const fehlend = fehlendeAngaben(project);

  return (
    <aside className="sidebar sidebar-left">
      <section>
        <h2>Projekt</h2>
        <ProjektInfo />
        {/* Berechnungsgrundlagen eingeklappt, damit Geschosse und Flächen sichtbar bleiben; gesetzte bzw. fehlende Angaben
            stehen in der Zeile */}
        <details className="weitere-angaben berechnungsgrundlagen">
          <summary>
            Berechnungsgrundlagen
            <span className="muted"> ({grundlagen.join(' · ')})</span>
            {fehlend.length > 0 && (
              <span className="fehlt-text">
                {' '}
                – {fehlend.join(', ')} {fehlend.length > 1 ? 'fehlen' : 'fehlt'}
              </span>
            )}
          </summary>
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
          <Field label="Messverfahren" hint="Maßgrundlage der Flächen (DIN 277, 5.1) – steht im Kopf von Bericht und Excel">
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
          <Field label="Planungsunterlagen" hint={planAuto ? `leer = hinterlegte Pläne (${planAuto})` : 'DIN 277, 5.1 – z. B. Grundrisse 1:100, Stand …'}>
            <TextField
              value={project.settings.planunterlagen ?? ''}
              placeholder="z. B. Grundrisse 1:100, Stand 01.10.2026"
              onChange={(v) => st.update((p) => ({ ...p, settings: { ...p.settings, planunterlagen: v.trim() || undefined } }))}
            />
          </Field>
          <label className="toggle block" title="Nur zum Vergleich mit Bestandsberechnungen nach II. BV a. F. (bis 31.12.2003, § 5 WoFlV). Standard bleibt die WoFlV.">
            <input type="checkbox" checked={!!project.settings.zweiteBV} onChange={(e) => st.update((p) => ({ ...p, settings: { ...p.settings, zweiteBV: e.target.checked || undefined } }))} />
            Vergleich mit II. BV: Freisitze zu ½
          </label>
          {project.settings.zweiteBV && <p className="warning small-text">Vergleichsrechnung – nur Freisitze zur Hälfte, weitere Regeln der II. BV a. F. sind nicht nachgebildet. Für neue Nachweise gilt die WoFlV.</p>}
        </details>
      </section>

      <section>
        <div className="section-head">
          <h2>Geschosse</h2>
          <button
            className="small"
            onClick={() => void neuesGeschoss(storey.id, storey.name)}
            title="Geschoss über oder unter dem aktiven hinzufügen …"
          >
            <Symbol name="plus" /> Geschoss …
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
            title="Aktives Geschoss mit allen Flächen kopieren …"
          >
            Duplizieren …
          </button>
          <button className="small icon" disabled={obenAmEnde} onClick={() => st.update((p) => moveStorey(p, storey.id, 1))} title="Geschoss in der Liste nach oben" aria-label="Geschoss nach oben">
            <Symbol name="nachOben" />
          </button>
          <button className="small icon" disabled={untenAmEnde} onClick={() => st.update((p) => moveStorey(p, storey.id, -1))} title="Geschoss in der Liste nach unten" aria-label="Geschoss nach unten">
            <Symbol name="nachUnten" />
          </button>
          <button
            className="small danger"
            disabled={project.storeys.length <= 1}
            title={project.storeys.length <= 1 ? 'Das einzige Geschoss lässt sich nicht löschen' : `Geschoss „${storey.name}“ mit allen Flächen löschen`}
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
          <label className="toggle" title="Dachflächen und Höhenlinien 1 m / 2 m lichte Höhe unter Dachformen">
            <input type="checkbox" checked={view.showHoehenlinien} onChange={(e) => st.setView({ showHoehenlinien: e.target.checked })} />
            Höhenlinien
          </label>
        </div>
        {storey.shapes.length === 0 && (
          <div className="leer-hinweis">
            <p className="muted">Noch keine Flächen. Plan laden (Werkzeugleiste „Plan laden …“) und Räume erkennen (E) oder mit Rechteck (R) bzw. Polygon (P) zeichnen.</p>
            <UmrissUebernehmen />
          </div>
        )}
        {outlines.length > 0 && <h3>BGF-Umrisse</h3>}
        <ul className="list shape-list">
          {outlines.map((s) => (
            <li key={s.id} className={gewaehlt.has(s.id) ? 'active' : ''}>
              <button type="button" className="list-btn" aria-pressed={gewaehlt.has(s.id)} onClick={(e) => listeKlick(e, s.id, outlines)} title="Klick wählt; Strg+Klick: dazu/weg; Umschalt+Klick: Bereich">
                <span className="swatch" style={{ background: s.subtract ? 'var(--danger)' : 'var(--accent)' }} aria-hidden />
                <span className="grow-text">
                  {s.name} <small>({s.umschliessung})</small>
                </span>
                <span className="num">{fmt2(shapeArea(s) * (s.subtract ? -1 : 1))} m²</span>
              </button>
            </li>
          ))}
        </ul>
        {rooms.length > 0 && (
          <div className="section-head">
            <h3>Räume</h3>
            <button className="small" onClick={() => setTabelle(true)} title="Alle Räume des Projekts als Tabelle bearbeiten">
              Raumtabelle …
            </button>
          </div>
        )}
        {tabelle && <RaumTabelle onClose={() => setTabelle(false)} />}
        <ul className="list shape-list">
          {rooms.map((s) => (
            <li key={s.id} className={gewaehlt.has(s.id) ? 'active' : ''}>
              <button type="button" className="list-btn" aria-pressed={gewaehlt.has(s.id)} onClick={(e) => listeKlick(e, s.id, rooms)} title="Klick wählt; Strg+Klick: dazu/weg; Umschalt+Klick: Bereich">
                <span className="swatch" style={{ background: s.subtract ? 'var(--danger)' : nutzungInfo(raumNutzung(s)).color }} aria-hidden />
                <span className="raum-nr">{s.nummer}</span>
                <span className="grow-text">
                  {s.name}
                  {s.ausserhalbBgf && !s.subtract && <small className="muted"> (außerhalb BGF)</small>}
                </span>
                <span className="num">{fmt2(shapeArea(s) * (s.subtract ? -1 : 1))} m²</span>
              </button>
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
  const [bearbeiten, setBearbeiten] = useState(false);
  /** Esc: Umbenennen verwerfen (das folgende blur übernimmt dann nichts) */
  const verwerfen = useRef(false);
  const umbenennen = (neu: string) => {
    setBearbeiten(false);
    if (verwerfen.current) {
      verwerfen.current = false;
      return;
    }
    const n = neu.trim();
    if (n && n !== name) useEditor.getState().update((p) => ({ ...p, storeys: p.storeys.map((s) => (s.id === id ? { ...s, name: n } : s)) }));
  };
  if (bearbeiten)
    return (
      <li className={active ? 'active' : ''}>
        <input
          className="geschoss-umbenennen"
          aria-label="Name des Geschosses"
          defaultValue={name}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => umbenennen(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            else if (e.key === 'Escape') {
              e.stopPropagation();
              verwerfen.current = true;
              e.currentTarget.blur();
            }
          }}
        />
      </li>
    );
  return (
    <li className={active ? 'active' : ''}>
      <button
        type="button"
        className="list-btn"
        aria-current={active || undefined}
        onClick={() => useEditor.getState().setActiveStorey(id)}
        onDoubleClick={() => setBearbeiten(true)}
        onKeyDown={(e) => {
          if (e.key === 'F2') {
            e.preventDefault();
            setBearbeiten(true);
          }
        }}
        title={`Geschoss ${name} bearbeiten – Doppelklick oder F2: umbenennen`}
      >
        <span className="grow-text">{name}</span>
        <span className="num muted">{fmt2(bgf)} m² BGF</span>
      </button>
    </li>
  );
}
