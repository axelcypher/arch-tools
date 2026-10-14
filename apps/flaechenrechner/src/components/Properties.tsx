import { useDeferredValue, useMemo } from 'react';
import { computeProject, computeStorey, raumBodenVersatz, unterbau } from '@core/calc';
import { fmt2 } from '@core/format';
import { isSelfIntersecting, perimeter } from '@core/geometry';
import type { Nutzungsgruppe, OutlineShape, Raumumschliessung, Shape, WoflKategorie } from '@core/model';
import { istDachgeschoss, shapeArea, storeyElevations } from '@core/model';
import { NUTZUNGSGRUPPEN, UMSCHLIESSUNG, WOFL_KATEGORIEN, woflArt, woflFaktor } from '@core/norms';
import { mapShape, mapStorey, useActiveStorey, useEditor, useSelectedShape, useSelectedShapes } from '../store/store';
import { BackgroundPanel } from './BackgroundPanel';
import { RoofEditor } from './RoofEditor';
import { Field, NumberField, TextField } from '@core/ui/fields';
import { HilfeKnopf } from '@core/ui/Nachschlagewerk';

/** Rechte Seitenleiste: Eigenschaften der Auswahl bzw. des Geschosses + Kurzauswertung. */
export function Properties() {
  const shape = useSelectedShape();
  const auswahl = useSelectedShapes();
  return (
    <aside className="sidebar sidebar-right">
      {auswahl.length > 1 ? (
        <MultiProperties key={auswahl.map((s) => s.id).join('|')} shapes={auswahl} />
      ) : shape ? (
        <ShapeProperties key={shape.id} shape={shape} />
      ) : (
        <StoreyProperties />
      )}
      <Summary />
    </aside>
  );
}

function ShapeProperties({ shape }: { shape: Shape }) {
  const storey = useActiveStorey();
  const project = useEditor((s) => s.project);
  const st = useEditor.getState();
  const upd = (fn: (s: Shape) => Shape) => st.update((p) => mapShape(p, storey.id, shape.id, fn));

  const area = shapeArea(shape);
  const selfX = isSelfIntersecting(shape.points);

  return (
    <section>
      <div className="section-head">
        <h2>
          {shape.kind === 'outline' ? 'BGF-Umriss' : 'Raum'}
          <HilfeKnopf thema={shape.kind === 'outline' ? ['bgf', 'bri', 'splitlevel'] : ['nrf', 'nuf', 'wofl', 'splitlevel']} titel={shape.kind === 'outline' ? 'BGF-Umriss' : 'Raum'} />
        </h2>
        <button
          className="small danger"
          onClick={() => {
            st.update((p) => mapStorey(p, storey.id, (s) => ({ ...s, shapes: s.shapes.filter((x) => x.id !== shape.id) })));
            st.select(null);
          }}
        >
          Löschen
        </button>
      </div>

      <div className="metric-row">
        <div className="metric">
          <span>Fläche</span>
          <strong>
            {shape.subtract ? '−' : ''}
            {fmt2(area)} m²
          </strong>
        </div>
        <div className="metric">
          <span>Umfang</span>
          <strong>{fmt2(perimeter(shape.points))} m</strong>
        </div>
      </div>
      {selfX && <p className="warning">Das Polygon überschneidet sich selbst – die Fläche ist so nicht korrekt.</p>}

      {shape.kind === 'room' && (
        <div className="field-row">
          <Field label="Nr.">
            <TextField value={shape.nummer} onChange={(v) => upd((s) => ({ ...s, nummer: v }))} />
          </Field>
          <Field label="Bezeichnung">
            <TextField value={shape.name} onChange={(v) => upd((s) => ({ ...s, name: v }))} />
          </Field>
        </div>
      )}
      {shape.kind === 'outline' && (
        <Field label="Bezeichnung">
          <TextField value={shape.name} onChange={(v) => upd((s) => ({ ...s, name: v }))} />
        </Field>
      )}

      <Field label="Raumumschließung (DIN 277)">
        <select value={shape.umschliessung} onChange={(e) => upd((s) => ({ ...s, umschliessung: e.target.value as Raumumschliessung }))}>
          {UMSCHLIESSUNG.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </select>
      </Field>

      <label className="toggle">
        <input type="checkbox" checked={shape.subtract} onChange={(e) => upd((s) => ({ ...s, subtract: e.target.checked }))} />
        Abzugsfläche (wird abgezogen, z. B. Innenhof, Schacht, Treppenloch)
      </label>

      <Field
        label="Höhenlage Fußboden [m]"
        hint={
          shape.kind === 'room'
            ? 'gegenüber dem Geschoss, negativ = tiefer (Split-Level); leer = auf dem Fußboden des Umrisses. Ein tiefer liegender Raum vergrößert den BRI um Raumfläche × Absenkung (wo kein Geschoss darunter liegt).'
            : 'gegenüber dem Geschoss, negativ = tiefer (Split-Level). Der Körper beginnt tiefer, seine Oberkante bleibt.'
        }
      >
        <NumberField value={shape.versatz} allowEmpty min={-20} max={20} digits={3} placeholder={shape.kind === 'room' ? 'wie Umriss' : '0,000'} onChange={(v) => upd((s) => ({ ...s, versatz: s.kind === 'room' ? v : v || undefined }))} />
      </Field>

      {shape.kind === 'outline' && (
        <Field label="Abweichende Höhe für BRI [m]" hint={`Oberkante über dem Geschossfußboden; leer = Geschosshöhe (${fmt2(storey.hoehe)} m)`}>
          <NumberField value={shape.hoehe} allowEmpty min={0} onChange={(v) => upd((s) => ({ ...s, hoehe: v }))} placeholder={fmt2(storey.hoehe)} />
        </Field>
      )}
      {shape.kind === 'outline' && <UnterbauInfo shape={shape} />}
      {shape.kind === 'outline' && (
        <RoofEditor shape={shape} storey={storey} project={project} onChange={(dach) => upd((s) => (s.kind === 'outline' ? { ...s, dach } : s))} />
      )}

      {shape.kind === 'room' && (
        <>
          <Field label="Nutzungsgruppe (DIN 277)">
            <select value={shape.nutzung} onChange={(e) => upd((s) => ({ ...s, nutzung: e.target.value as Nutzungsgruppe }))}>
              {NUTZUNGSGRUPPEN.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.kurz} – {n.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Putzabzug [%]" hint="z. B. 3 % bei Flächen aus Rohbaumaßen (wie Archicad-Zonen)">
            <NumberField
              value={shape.putzabzug}
              allowEmpty
              min={0}
              max={20}
              digits={1}
              onChange={(v) => upd((s) => (s.kind === 'room' ? { ...s, putzabzug: v || undefined } : s))}
            />
          </Field>
          <h3>
            Wohnfläche (WoFlV)
            <HilfeKnopf thema={['wofl', 'putzabzug']} titel="Wohnfläche" />
          </h3>
          <Field label="Anrechnung">
            <select
              value={shape.wofl.kategorie}
              onChange={(e) =>
                upd((s) => (s.kind === 'room' ? { ...s, wofl: { ...s.wofl, kategorie: e.target.value as WoflKategorie, faktor: undefined } } : s))
              }
            >
              {WOFL_KATEGORIEN.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
          {(shape.wofl.kategorie === 'freisitz' || shape.wofl.kategorie === 'individuell') && (
            <Field
              label="Faktor"
              hint={shape.wofl.kategorie === 'freisitz' ? `leer = Projektstandard (${fmt2(project.settings.freisitzFaktor)}), max. 0,50` : '0 … 1'}
            >
              <NumberField
                value={shape.wofl.faktor}
                allowEmpty
                min={0}
                max={shape.wofl.kategorie === 'freisitz' ? 0.5 : 1}
                onChange={(v) => upd((s) => (s.kind === 'room' ? { ...s, wofl: { ...s.wofl, faktor: v } } : s))}
              />
            </Field>
          )}
          {shape.wofl.kategorie !== 'keine' && (
            <>
              <Field label="Wohnung">
                <TextField
                  value={shape.wofl.wohnung}
                  placeholder="z. B. WE 01"
                  onChange={(v) => upd((s) => (s.kind === 'room' ? { ...s, wofl: { ...s.wofl, wohnung: v } } : s))}
                />
              </Field>
              <p className="muted">
                Anrechenbar: {fmt2(area * woflFaktor(shape.wofl, project.settings) * (shape.subtract ? -1 : 1))} m² (Faktor{' '}
                {fmt2(woflFaktor(shape.wofl, project.settings))})
              </p>
            </>
          )}
        </>
      )}

      <Field label="Bemerkung">
        <TextField value={shape.bemerkung ?? ''} onChange={(v) => upd((s) => ({ ...s, bemerkung: v || undefined }))} />
      </Field>

      <details className="points-editor">
        <summary>Eckpunkte ({shape.points.length})</summary>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>X [m]</th>
              <th>Y [m]</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shape.points.map((p, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>
                  <NumberField
                    value={p.x}
                    digits={3}
                    onChange={(v) => v !== undefined && upd((s) => ({ ...s, points: s.points.map((q, j) => (j === i ? { ...q, x: v } : q)) }))}
                  />
                </td>
                <td>
                  <NumberField
                    value={p.y}
                    digits={3}
                    onChange={(v) => v !== undefined && upd((s) => ({ ...s, points: s.points.map((q, j) => (j === i ? { ...q, y: v } : q)) }))}
                  />
                </td>
                <td>
                  <button
                    className="small icon"
                    disabled={shape.points.length <= 3}
                    title="Punkt entfernen"
                    onClick={() => upd((s) => ({ ...s, points: s.points.filter((_, j) => j !== i) }))}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

/** gemeinsamer Wert mehrerer Flächen – oder undefined, wenn sie sich unterscheiden */
function gemeinsam<T>(werte: T[]): T | undefined {
  return werte.length && werte.every((v) => v === werte[0]) ? werte[0] : undefined;
}

/** Mehrere gewählte Flächen: Summen und gemeinsame Werte für alle setzen */
function MultiProperties({ shapes }: { shapes: Shape[] }) {
  const storey = useActiveStorey();
  const st = useEditor.getState();
  const ids = new Set(shapes.map((s) => s.id));
  const updAll = (fn: (s: Shape) => Shape) => st.update((p) => mapStorey(p, storey.id, (x) => ({ ...x, shapes: x.shapes.map((sh) => (ids.has(sh.id) ? fn(sh) : sh)) })));
  const rooms = shapes.filter((s) => s.kind === 'room');
  const outlines = shapes.filter((s) => s.kind === 'outline');
  const summe = (list: Shape[]) => list.reduce((a, s) => a + shapeArea(s) * (s.subtract ? -1 : 1), 0);
  const nutzung = gemeinsam(rooms.map((r) => r.nutzung));
  const kategorie = gemeinsam(rooms.map((r) => r.wofl.kategorie));
  const wohnung = gemeinsam(rooms.map((r) => r.wofl.wohnung));
  const umschliessung = gemeinsam(shapes.map((s) => s.umschliessung));
  // Räume ohne eigene Höhenlage: die des Umrisses, in dem sie liegen
  const versatz = gemeinsam(shapes.map((s) => (s.kind === 'room' ? raumBodenVersatz(s, storey) : (s.versatz ?? 0))));
  const abzug = gemeinsam(shapes.map((s) => s.subtract));

  return (
    <section>
      <div className="section-head">
        <h2>{shapes.length} Flächen gewählt</h2>
        <button
          className="small danger"
          onClick={() => {
            st.update((p) => mapStorey(p, storey.id, (x) => ({ ...x, shapes: x.shapes.filter((sh) => !ids.has(sh.id)) })));
            st.select(null);
          }}
        >
          Alle löschen
        </button>
      </div>
      <div className="metric-row">
        {outlines.length > 0 && (
          <div className="metric">
            <span>BGF ({outlines.length})</span>
            <strong>{fmt2(summe(outlines))} m²</strong>
          </div>
        )}
        {rooms.length > 0 && (
          <div className="metric">
            <span>Räume ({rooms.length})</span>
            <strong>{fmt2(summe(rooms))} m²</strong>
          </div>
        )}
      </div>
      <p className="muted small-text">Änderungen gelten für alle gewählten Flächen. Felder mit „unterschiedlich“ bleiben unverändert, solange nichts gewählt wird.</p>

      <Field label="Raumumschließung (DIN 277)">
        <select value={umschliessung ?? ''} onChange={(e) => e.target.value && updAll((s) => ({ ...s, umschliessung: e.target.value as Raumumschliessung }))}>
          {umschliessung === undefined && <option value="">unterschiedlich</option>}
          {UMSCHLIESSUNG.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Abzugsfläche">
        <select value={abzug === undefined ? '' : abzug ? 'ja' : 'nein'} onChange={(e) => e.target.value && updAll((s) => ({ ...s, subtract: e.target.value === 'ja' }))}>
          {abzug === undefined && <option value="">unterschiedlich</option>}
          <option value="nein">nein</option>
          <option value="ja">ja (wird abgezogen)</option>
        </select>
      </Field>
      <Field label="Höhenlage Fußboden [m]" hint="gegenüber dem Geschoss, negativ = tiefer (Split-Level)">
        <NumberField value={versatz} allowEmpty min={-20} max={20} digits={3} placeholder="unterschiedlich" onChange={(v) => v !== undefined && updAll((s) => ({ ...s, versatz: s.kind === 'room' ? v : v || undefined }))} />
      </Field>

      {rooms.length > 0 && (
        <>
          <h3>Räume ({rooms.length})</h3>
          <Field label="Nutzungsgruppe (DIN 277)">
            <select value={nutzung ?? ''} onChange={(e) => e.target.value && updAll((s) => (s.kind === 'room' ? { ...s, nutzung: e.target.value as Nutzungsgruppe } : s))}>
              {nutzung === undefined && <option value="">unterschiedlich</option>}
              {NUTZUNGSGRUPPEN.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.kurz} – {n.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Wohnfläche (WoFlV)">
            <select
              value={kategorie ?? ''}
              onChange={(e) => e.target.value && updAll((s) => (s.kind === 'room' ? { ...s, wofl: { ...s.wofl, kategorie: e.target.value as WoflKategorie, faktor: undefined } } : s))}
            >
              {kategorie === undefined && <option value="">unterschiedlich</option>}
              {WOFL_KATEGORIEN.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Wohnung">
            <TextField
              value={wohnung ?? ''}
              placeholder={wohnung === undefined ? 'unterschiedlich' : 'z. B. WE 01'}
              onChange={(v) => updAll((s) => (s.kind === 'room' ? { ...s, wofl: { ...s.wofl, wohnung: v } } : s))}
            />
          </Field>
        </>
      )}
    </section>
  );
}

/** BRI unterhalb des Geschossfußbodens (Bodenplatte, Split-Level) dieses Umrisses */
function UnterbauInfo({ shape }: { shape: OutlineShape }) {
  const storey = useActiveStorey();
  const project = useEditor((s) => s.project);
  const teile = useMemo(() => unterbau(shape, storey, project), [shape, storey, project]);
  if (!teile.length) return null;
  return (
    <div className="field">
      <span className="field-label">BRI unter dem Geschossfußboden</span>
      <ul className="unterbau-liste small-text">
        {teile.map((t, i) => (
          <li key={i}>
            {t.bezeichnung}: {fmt2(t.flaeche)} m² × {fmt2(Math.abs(t.hoehe))} m = {t.hoehe < 0 ? '−' : ''}
            {fmt2(t.flaeche * Math.abs(t.hoehe))} m³
          </li>
        ))}
      </ul>
    </div>
  );
}

function StoreyProperties() {
  const storey = useActiveStorey();
  const project = useEditor((s) => s.project);
  const st = useEditor.getState();
  const upd = (fn: Parameters<typeof mapStorey>[2]) => st.update((p) => mapStorey(p, storey.id, fn));
  const elev = storeyElevations(project);
  const e0 = elev[project.storeys.indexOf(storey)] ?? 0;
  const istUnterstes = !elev.some((e, i) => e < e0 - 1e-6 && project.storeys[i].shapes.some((x) => x.kind === 'outline'));

  return (
    <section>
      <h2>
        Geschoss
        <HilfeKnopf thema={['sohle', 'bri', 'dach']} titel="Geschoss" />
      </h2>
      <div className="field-row">
        <Field label="Bezeichnung">
          <TextField value={storey.name} onChange={(v) => upd((s) => ({ ...s, name: v }))} />
        </Field>
        <Field label="Geschosshöhe [m]">
          <NumberField value={storey.hoehe} min={0} onChange={(v) => v !== undefined && upd((s) => ({ ...s, hoehe: v }))} />
        </Field>
      </div>
      <p className="muted small-text">Die Geschosshöhe (OK Rohfußboden bis OK Rohfußboden darüber bzw. OK Dachbelag) wird für den BRI verwendet.</p>
      <Field
        label="Bodenplatte: UK Sohle bis Fußboden [m]"
        hint={
          istUnterstes
            ? 'DIN 277: Der BRI rechnet ab Unterseite der konstruktiven Sohle. Gilt für alle Teile, unter denen kein Geschoss liegt.'
            : 'nur nötig, wo unter diesem Geschoss kein anderes liegt (z. B. nicht unterkellerter Anbau)'
        }
      >
        <NumberField value={storey.sohle} allowEmpty min={0} max={3} digits={3} placeholder={istUnterstes ? 'z. B. 0,300' : ''} onChange={(v) => upd((s) => ({ ...s, sohle: v || undefined }))} />
      </Field>
      {istUnterstes && !storey.sohle && storey.shapes.some((s) => s.kind === 'outline') && (
        <p className="warning small-text">Unterstes Geschoss ohne Bodenplatte: der BRI endet am Fußboden statt an der Unterseite der Sohle.</p>
      )}
      <Field label="Geschossart" hint="für Excel-Vorlagen: Normalgeschosse als Höhe × BGF, Dachgeschosse mit Dachformeln (Filter [normal] / [dg])">
        <select
          value={storey.dachgeschoss === undefined ? 'auto' : storey.dachgeschoss ? 'dg' : 'normal'}
          onChange={(e) => upd((s) => ({ ...s, dachgeschoss: e.target.value === 'auto' ? undefined : e.target.value === 'dg' }))}
        >
          <option value="auto">automatisch ({istDachgeschoss({ ...storey, dachgeschoss: undefined }) ? 'Dachgeschoss' : 'Normalgeschoss'})</option>
          <option value="normal">Normalgeschoss</option>
          <option value="dg">Dachgeschoss</option>
        </select>
      </Field>
      {project.dachModell && (
        <label className="toggle block" title="Ohne Haken reicht der Rauminhalt dort, wo darüber keine BGF liegt (z. B. Dachspitze als eigenes Geschoss), bis unter die Dachhaut.">
          <input type="checkbox" checked={!!storey.geschosshoeheBegrenzt} onChange={(e) => upd((s) => ({ ...s, geschosshoeheBegrenzt: e.target.checked || undefined }))} />
          BRI auf Geschosshöhe begrenzen (nicht bis unter die Dachhaut)
        </label>
      )}

      {storey.shapes.some((s) => s.kind === 'room') && (
        <div className="field">
          <span className="field-label">Wohnfläche aller Räume dieses Geschosses</span>
          <div className="button-row">
            <button
              title="Nach Raumname: Keller, Technik, Treppen, Garage, Dachboden … keine Wohnfläche; Balkon/Terrasse als Freisitz; übrige Räume anrechnen"
              onClick={() =>
                upd((s) => ({
                  ...s,
                  shapes: s.shapes.map((sh) => {
                    if (sh.kind !== 'room') return sh;
                    const art = woflArt(sh.name, s.name, sh.nutzung);
                    const wohnung = sh.wofl.wohnung || s.name;
                    if (art === 'keine') return { ...sh, wofl: { ...sh.wofl, kategorie: 'keine' as const } };
                    if (art === 'freisitz') return { ...sh, wofl: { ...sh.wofl, kategorie: 'freisitz' as const, wohnung } };
                    return sh.wofl.kategorie === 'keine' || sh.wofl.kategorie === 'freisitz' ? { ...sh, wofl: { ...sh.wofl, kategorie: 'voll' as const, wohnung } } : { ...sh, wofl: { ...sh.wofl, wohnung } };
                  }),
                }))
              }
            >
              automatisch nach Raumname
            </button>
            <button onClick={() => upd((s) => ({ ...s, shapes: s.shapes.map((sh) => (sh.kind === 'room' ? { ...sh, wofl: { ...sh.wofl, kategorie: 'keine' as const } } : sh)) }))}>
              keine
            </button>
          </div>
        </div>
      )}

      <BackgroundPanel storey={storey} />
    </section>
  );
}

function Summary() {
  // nachrangig rechnen: beim Ziehen bleibt die Zeichenfläche flüssig, die Summen folgen einen Augenblick später
  const project = useDeferredValue(useEditor((s) => s.project));
  const activeId = useEditor((s) => s.activeStoreyId);
  const storey = project.storeys.find((s) => s.id === activeId) ?? project.storeys[0];
  const sr = useMemo(() => computeStorey(storey, project), [storey, project]);
  const pr = useMemo(() => computeProject(project), [project]);

  const rows: [string, number, number, string][] = [
    ['BGF', sr.bgf.total, pr.total.bgf.total, 'm²'],
    ['BRI', sr.bri.total, pr.total.bri.total, 'm³'],
    ['NUF', sr.nuf.total, pr.total.nuf.total, 'm²'],
    ['TF', sr.tf.total, pr.total.tf.total, 'm²'],
    ['VF', sr.vf.total, pr.total.vf.total, 'm²'],
    ['NRF', sr.nrf.total, pr.total.nrf.total, 'm²'],
    ['KGF', sr.kgf.total, pr.total.kgf.total, 'm²'],
    ['WoFl', sr.wofl, pr.total.wofl, 'm²'],
  ];

  return (
    <section className="summary">
      <h2>
        Auswertung
        <HilfeKnopf thema={['din277', 'wofl']} titel="Auswertung" />
      </h2>
      <table className="summary-table">
        <thead>
          <tr>
            <th />
            <th>{storey.name}</th>
            <th>Gesamt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, a, b, u]) => (
            <tr key={k} className={k === 'NRF' || k === 'BGF' ? 'strong' : ''}>
              <td>{k}</td>
              <td className="num">{fmt2(a)}</td>
              <td className="num">
                {fmt2(b)} <small>{u}</small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sr.bgf.total === 0 && sr.nrf.total > 0 ? (
        <p className="warning">Für dieses Geschoss ist noch kein BGF-Umriss gezeichnet.</p>
      ) : (
        sr.kgf.total < -0.005 && <p className="warning">NRF ist größer als BGF – Raumflächen oder Umriss prüfen.</p>
      )}
      {sr.bgf.total > 0 && (
        <p className="muted small-text">
          NRF/BGF: {fmt2((sr.nrf.total / sr.bgf.total) * 100)} % · KGF/BGF: {fmt2((sr.kgf.total / sr.bgf.total) * 100)} %
        </p>
      )}
    </section>
  );
}
