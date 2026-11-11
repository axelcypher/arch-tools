import { useDeferredValue, useMemo } from 'react';
import { computeProject, computeStorey, effektiveWofl, raumBodenVersatz, raumUmschliessung, raumUmAbzug, unterbau } from '@core/calc';
import { fmt2 } from '@core/format';
import { isSelfIntersecting, perimeter } from '@core/geometry';
import type { AbzugArt, Nutzungsgruppe, OutlineShape, Raumumschliessung, RoomShape, Shape, WoflKategorie } from '@core/model';
import { istDachgeschoss, istKellergeschoss, shapeArea, storeyElevations } from '@core/model';
import { ABZUG_ARTEN, NUTZUNGSGRUPPEN, UMSCHLIESSUNG, WOFL_HINWEIS, WOFL_KATEGORIEN, woflArt, woflFaktor, woflHinweis } from '@core/norms';
import { mapShape, mapStorey, useActiveStorey, useEditor, useSelectedShape, useSelectedShapes } from '../store/store';
import { BackgroundPanel } from './BackgroundPanel';
import { Pruefliste } from './Pruefliste';
import { katalogAnwenden, katalogEintrag, useKatalog, wohnungNormalisieren } from '../core/katalog';
import { wohnungenImProjekt } from '../core/geschosse';
import { raumAufUmriss } from '@core/pruefung';
import { gruppeAusNutzungsart } from '@core/norms';
import { raumHoehenAnteile } from '@core/hoehenlinien';
import { naeherungsVermerk, umrissAusRaeumen } from '../core/umriss';
import { createOutline } from '@core/model';
import { frageText } from '@core/ui/Rueckfrage';
import { parseNum } from '@core/format';
import { doppelteNummern, raeumeNeuNummerieren, raumNummernPraefix } from '../core/geschosse';
import type { NummerReihenfolge } from '../core/geschosse';
import { bestaetigen, meldung } from '@core/ui/Rueckfrage';
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
      {shape.kind === 'room' && !shape.subtract && <AufUmrissBeschneiden shape={shape} upd={upd} />}

      {shape.kind === 'room' && <RaumBezeichnung shape={shape} upd={upd} />}
      {shape.kind === 'room' && !shape.subtract && shape.nummer.trim() && doppelteNummern(storey).has(shape.nummer.trim()) && (
        <p className="warning small-text">Die Raumnummer {shape.nummer} kommt in diesem Geschoss mehrfach vor.</p>
      )}
      {shape.kind === 'outline' && (
        <Field label="Bezeichnung">
          <TextField value={shape.name} onChange={(v) => upd((s) => ({ ...s, name: v }))} />
        </Field>
      )}

      {shape.kind === 'room' ? (
        <RaumUmschliessung shape={shape} upd={upd} />
      ) : (
        <Field label="Raumumschließung (DIN 277)" hint={UMSCHLIESSUNG.find((u) => u.id === shape.umschliessung)?.label}>
          <select value={shape.umschliessung} onChange={(e) => upd((s) => ({ ...s, umschliessung: e.target.value as Raumumschliessung }))}>
            {UMSCHLIESSUNG.map((u) => (
              <option key={u.id} value={u.id} title={u.label}>
                {u.kurz}
              </option>
            ))}
          </select>
        </Field>
      )}

      <label className="toggle block abzug-toggle">
        <input type="checkbox" checked={shape.subtract} onChange={(e) => upd((s) => ({ ...s, subtract: e.target.checked }))} />
        <span>
          Abzugsfläche
          <small className="muted"> – wird abgezogen, {shape.kind === 'outline' ? 'z. B. Innenhof, Luftraum über Galerie' : 'z. B. Schornstein, Pfeiler, Schacht im Raum'}</small>
        </span>
      </label>
      {shape.kind === 'room' && shape.subtract && (
        <Field label="Abzug mindert" hint={ABZUG_ARTEN.find((a) => a.id === (shape.abzugArt ?? 'beide'))?.hint}>
          <select value={shape.abzugArt ?? 'beide'} onChange={(e) => upd((s) => (s.kind === 'room' ? { ...s, abzugArt: e.target.value === 'beide' ? undefined : (e.target.value as AbzugArt) } : s))}>
            {ABZUG_ARTEN.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field
        label={shape.kind === 'room' ? 'Höhenlage Fußboden [m]' : 'Höhenversatz Körper [m]'}
        hint={
          shape.kind === 'room'
            ? 'gegenüber dem Geschoss, negativ = tiefer (Split-Level); leer = auf dem Fußboden des Umrisses. Liegt der Raum tiefer als der Körper seines Umrisses, vergrößert sich der BRI um Raumfläche × Absenkung (wo kein Geschoss darunter liegt).'
            : 'verschiebt den ganzen Körper samt Dach gegenüber dem Geschossfußboden, negativ = tiefer (Split-Level); seine Höhe bleibt. Räume ohne eigene Höhenlage liegen auf seiner Unterkante.'
        }
      >
        <NumberField value={shape.versatz} allowEmpty min={-20} max={20} digits={3} placeholder={shape.kind === 'room' ? 'wie Umriss' : '0,000'} onChange={(v) => upd((s) => ({ ...s, versatz: s.kind === 'room' ? v : v || undefined }))} />
      </Field>

      {shape.kind === 'outline' && (
        <Field
          label="Körperhöhe für BRI [m]"
          pflicht={shape.umschliessung === 'S' && !shape.subtract}
          hint={
            shape.umschliessung === 'S'
              ? 'Sonderfall S: obere Begrenzung angeben – Unterkante Überdeckung bzw. Oberkante Umwehrung (z. B. Brüstung 1,10 m)'
              : `Unterkante bis Oberkante des Körpers (ohne Dach); leer = Geschosshöhe (${fmt2(storey.hoehe)} m)`
          }
        >
          <NumberField value={shape.hoehe} allowEmpty min={0} pflicht={shape.umschliessung === 'S' && !shape.subtract} onChange={(v) => upd((s) => ({ ...s, hoehe: v }))} placeholder={fmt2(storey.hoehe)} />
        </Field>
      )}
      {shape.kind === 'outline' && shape.umschliessung === 'S' && !shape.subtract && shape.hoehe === undefined && (
        <p className="warning small-text">Sonderfall S ohne Körperhöhe: der BRI rechnet mit der vollen Geschosshöhe ({fmt2(storey.hoehe)} m) – bitte die obere Begrenzung eintragen.</p>
      )}
      {shape.kind === 'outline' && shape.umschliessung === 'S' && !shape.subtract && !!storey.sohle && (
        <label className="toggle block" title="Unter nicht umschlossenen Bereichen (Balkon, Dachterrasse) liegt i. d. R. keine Bodenplatte des Gebäudes">
          <input type="checkbox" checked={!!shape.sohleAnsetzen} onChange={(e) => upd((s) => (s.kind === 'outline' ? { ...s, sohleAnsetzen: e.target.checked || undefined } : s))} />
          Bodenplatte ({fmt2(storey.sohle)} m) auch unter diesem S-Umriss ansetzen
        </label>
      )}
      {shape.kind === 'outline' && <UnterbauInfo shape={shape} />}
      {shape.kind === 'outline' && (
        <RoofEditor shape={shape} storey={storey} project={project} onChange={(dach) => upd((s) => (s.kind === 'outline' ? { ...s, dach } : s))} />
      )}

      {shape.kind === 'room' && (
        <>
          <Field label="Nutzungsgruppe (DIN 277)">
            <select
              value={shape.nutzung}
              onChange={(e) =>
                upd((s) => {
                  if (s.kind !== 'room') return s;
                  // eine Nutzungsart einer anderen Gruppe passt nicht mehr
                  const { nutzungsart, katalog: _k, ...rest } = s;
                  void _k;
                  const g = e.target.value as Nutzungsgruppe;
                  return { ...rest, nutzung: g, ...(nutzungsart && gruppeAusNutzungsart(nutzungsart) === g ? { nutzungsart } : {}) };
                })
              }
            >
              {NUTZUNGSGRUPPEN.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.kurz} – {n.label}
                </option>
              ))}
            </select>
          </Field>
          <NutzungsartFeld shape={shape} upd={upd} />
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
          <WoflHinweise shape={shape} />
          <Field label="Anrechnung" hint={WOFL_HINWEIS[shape.wofl.kategorie]}>
            <select
              value={shape.wofl.kategorie}
              onChange={(e) =>
                upd((s) => {
                  if (s.kind !== 'room') return s;
                  const { katalog: _k, ...rest } = s;
                  void _k;
                  return { ...rest, wofl: { ...s.wofl, kategorie: e.target.value as WoflKategorie, faktor: undefined } };
                })
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
          {!shape.subtract && <AnHoehenlinienTeilen shape={shape} upd={upd} />}
          {shape.wofl.kategorie === 'hoehen' && <HoehenTeile shape={shape} upd={upd} />}
          {shape.wofl.kategorie !== 'keine' && (
            <>
              <Field label="Wohnung" hint="Auswahl der vorhandenen Wohnungen; eine neue einfach eintippen (gleiche Schreibweise wie vorhandene wird übernommen)">
                <TextField
                  value={shape.wofl.wohnung}
                  placeholder="z. B. WE 01"
                  list="fr-wohnungen"
                  onChange={(v) => upd((s) => (s.kind === 'room' ? { ...s, wofl: { ...s.wofl, wohnung: wohnungNormalisieren(v, wohnungenImProjekt(project)) } } : s))}
                />
                <datalist id="fr-wohnungen">
                  {wohnungenImProjekt(project).map((w) => (
                    <option key={w} value={w} />
                  ))}
                </datalist>
              </Field>
              <p className="muted">
                Anrechenbar: {fmt2(area * woflFaktor(shape.wofl, project.settings) * (shape.subtract ? -1 : 1))} m²
                {shape.wofl.kategorie === 'hoehen' ? '' : ` (Faktor ${fmt2(woflFaktor(shape.wofl, project.settings))})`}
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
        <select
          value={umschliessung ?? ''}
          onChange={(e) => e.target.value && updAll((s) => (s.kind === 'room' ? { ...s, umschliessung: e.target.value as Raumumschliessung, rsVonHand: true } : { ...s, umschliessung: e.target.value as Raumumschliessung }))}
        >
          {umschliessung === undefined && <option value="">unterschiedlich</option>}
          {UMSCHLIESSUNG.map((u) => (
            <option key={u.id} value={u.id} title={u.label}>
              {u.kurz}
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
      <Field
        label={rooms.length && outlines.length ? 'Höhenlage Fußboden / Höhenversatz Körper [m]' : rooms.length ? 'Höhenlage Fußboden [m]' : 'Höhenversatz Körper [m]'}
        hint={`gegenüber dem Geschoss, negativ = tiefer (Split-Level)${outlines.length ? '; Umrisse: verschiebt den ganzen Körper' : ''}`}
      >
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
      <p className="muted small-text">
        Die Geschosshöhe – Fußboden bis Fußboden darüber bzw. OK Dachhaut, in derselben Bezugsebene wie die Geschosskoten (i. d. R. OK Fertigfußboden) – wird für den BRI
        verwendet.
      </p>
      <Field
        label="Bodenplatte: UK Sohle bis Fußboden-Bezugsebene [m]"
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
      <Field
        label="Geschossart"
        hint="Kellergeschoss: Räume werden bei „automatisch nach Raumname“ nicht als Wohnfläche vorgeschlagen (Souterrainwohnung: Normalgeschoss wählen). Excel-Vorlagen: Normalgeschosse als Höhe × BGF, Dachgeschosse mit Dachformeln (Filter [normal] / [dg])"
      >
        <select
          value={storey.keller ? 'kg' : storey.dachgeschoss ? 'dg' : storey.keller === false || storey.dachgeschoss === false ? 'normal' : 'auto'}
          onChange={(e) => {
            const v = e.target.value;
            upd((s) => ({ ...s, keller: v === 'auto' ? undefined : v === 'kg', dachgeschoss: v === 'auto' ? undefined : v === 'dg' }));
          }}
        >
          <option value="auto">
            automatisch ({istKellergeschoss({ name: storey.name }) ? 'Kellergeschoss' : istDachgeschoss({ ...storey, dachgeschoss: undefined }) ? 'Dachgeschoss' : 'Normalgeschoss'})
          </option>
          <option value="kg">Kellergeschoss</option>
          <option value="normal">Normalgeschoss</option>
          <option value="dg">Dachgeschoss</option>
        </select>
      </Field>
      <RaumNummern />
      {(istDachgeschoss(storey) || storey.shapes.some((s) => s.kind === 'outline' && !!s.dach && s.dach.typ !== 'flach')) && (
        <div className="field-row">
          <Field label="Dachaufbau bis Innenbekleidung [m]" hint="senkrecht zur Dachfläche gemessen; für die Höhenlinien (lichte Höhe unter Schrägen)">
            <NumberField value={storey.dachaufbau} allowEmpty min={0} max={2} digits={3} placeholder="0,000" onChange={(v) => upd((s) => ({ ...s, dachaufbau: v || undefined }))} />
          </Field>
          <Field label="Fußbodenaufbau [m]" hint="nur, wenn die Geschosskote auf dem Rohfußboden liegt">
            <NumberField value={storey.fussbodenaufbau} allowEmpty min={0} max={1} digits={3} placeholder="0,000" onChange={(v) => upd((s) => ({ ...s, fussbodenaufbau: v || undefined }))} />
          </Field>
        </div>
      )}
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
                    const art = woflArt(sh.name, s, sh.nutzung);
                    // Wohnung bleibt, wie sie ist – nie automatisch „Wohnung = Geschoss“ (WoFlV: Wohnfläche je Wohnung)
                    const wohnung = sh.wofl.wohnung;
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

      <UmrissAusRaeumen />
      <BackgroundPanel storey={storey} />
    </section>
  );
}

/** Präfix der Raumnummern und „Räume neu nummerieren“ (nur auf ausdrücklichen Befehl, F-01) */
function RaumNummern() {
  const storey = useActiveStorey();
  const project = useEditor((s) => s.project);
  const st = useEditor.getState();
  const vorschlag = raumNummernPraefix(project, { ...storey, nummernPraefix: undefined });
  const raeume = storey.shapes.filter((s) => s.kind === 'room' && !s.subtract);
  const doppelt = doppelteNummern(storey);
  const neu = async (reihenfolge: NummerReihenfolge) => {
    const ifc = raeume.filter((r) => r.ifcId).length;
    const ok = await bestaetigen(
      `Räume in „${storey.name}“ neu nummerieren?`,
      `Die Räume erhalten fortlaufende Nummern ab ${raumNummernPraefix(project, storey)}.01 (${reihenfolge === 'liste' ? 'Reihenfolge der Liste' : 'im Uhrzeigersinn, oben beginnend'}). Die Raumnummern im Flächennachweis müssen mit den Bauzeichnungen übereinstimmen.${ifc ? ` ${ifc} Räume aus dem IFC-Import behalten ihre Nummer – sonst weichen die Nummern vom Modell und den Plänen ab.` : ''}`,
      'Neu nummerieren',
    );
    if (!ok) return;
    const p = useEditor.getState().project;
    const s = p.storeys.find((x) => x.id === storey.id);
    if (!s) return;
    const r = raeumeNeuNummerieren(p, s, reihenfolge);
    if (r.geaendert) st.update((q) => mapStorey(q, storey.id, () => r.storey));
    else void meldung('Neu nummerieren', 'Alle Räume tragen schon diese Nummern.');
  };
  return (
    <>
      <Field label="Präfix der Raumnummern" hint={`leer = nach dem Geschossnamen bzw. der Lage („${vorschlag}“ → ${vorschlag}.01); neue Räume zählen ab der höchsten Nummer weiter`}>
        <TextField value={storey.nummernPraefix ?? ''} placeholder={vorschlag} onChange={(v) => upd(st, storey.id, (s) => ({ ...s, nummernPraefix: v.trim() || undefined }))} />
      </Field>
      {doppelt.size > 0 && <p className="warning small-text">Doppelte Raumnummern: {[...doppelt].join(', ')}</p>}
      {raeume.length > 1 && (
        <div className="button-row">
          <button className="small" onClick={() => void neu('liste')} title="Fortlaufend in der Reihenfolge der Raumliste">
            Räume neu nummerieren
          </button>
          <button className="small" onClick={() => void neu('uhrzeigersinn')} title="Fortlaufend im Uhrzeigersinn um die Geschossmitte, oben beginnend">
            … im Uhrzeigersinn
          </button>
        </div>
      )}
    </>
  );
}

function upd(st: ReturnType<typeof useEditor.getState>, storeyId: string, fn: Parameters<typeof mapStorey>[2]) {
  st.update((p) => mapStorey(p, storeyId, fn));
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
        <>
          {sr.kgf.R < -0.005 && <p className="warning">NRF (R) ist größer als BGF (R) – Raumflächen, Umriss oder Raumumschließung prüfen.</p>}
          {sr.kgf.S < -0.005 && <p className="warning">NRF (S) ist größer als BGF (S) – fehlt ein S-Umriss (Balkon, Loggia)?</p>}
        </>
      )}
      <Pruefliste />
      {sr.bgf.total > 0 && (
        <p className="muted small-text">
          NRF/BGF: {fmt2((sr.nrf.total / sr.bgf.total) * 100)} % · KGF/BGF: {fmt2((sr.kgf.total / sr.bgf.total) * 100)} %
        </p>
      )}
    </section>
  );
}

/** Raumumschließung eines Raums: automatisch aus dem Umriss, in dem er liegt, oder von Hand (FR-02) */
function RaumUmschliessung({ shape, upd }: { shape: RoomShape; upd: (fn: (s: Shape) => Shape) => void }) {
  const storey = useActiveStorey();
  const auto = !shape.rsVonHand && shape.umschliessung !== 'S';
  const wert = raumUmschliessung(shape, storey);
  const ausUmriss = raumUmschliessung({ ...shape, rsVonHand: false, umschliessung: 'R' }, storey);
  return (
    <Field label="Raumumschließung (DIN 277)" hint={UMSCHLIESSUNG.find((u) => u.id === wert)?.label}>
      <select
        value={auto ? 'auto' : shape.umschliessung}
        onChange={(e) =>
          upd((s) =>
            s.kind !== 'room' ? s : e.target.value === 'auto' ? { ...s, umschliessung: 'R', rsVonHand: undefined } : { ...s, umschliessung: e.target.value as Raumumschliessung, rsVonHand: true },
          )
        }
      >
        <option value="auto">wie der BGF-Umriss ({ausUmriss})</option>
        {UMSCHLIESSUNG.map((u) => (
          <option key={u.id} value={u.id} title={u.label}>
            {u.kurz}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Hinweise zur WoFlV-Einstufung: Abzugsfläche erbt vom Raum, Dachgeschoss mit „voll“, Treppe im Raum (FR-03, FR-07, FR-08) */
function WoflHinweise({ shape }: { shape: RoomShape }) {
  const storey = useActiveStorey();
  const out: string[] = [];
  if (shape.subtract && shape.wofl.kategorie === 'keine') {
    const raum = raumUmAbzug(shape, storey);
    if (raum && (shape.abzugArt ?? 'beide') !== 'din')
      out.push(`Abzug von der Wohnfläche wie „${[raum.nummer, raum.name].filter(Boolean).join(' ')}“ (${WOFL_KATEGORIEN.find((k) => k.id === effektiveWofl(shape, storey).kategorie)?.label}) – eigene Anrechnung wählen, um abzuweichen.`);
  }
  if (!shape.subtract && shape.wofl.kategorie === 'voll' && istDachgeschoss(storey))
    out.push('Dachgeschoss: lichte Höhe prüfen – Raumteile unter 2 m zählen nur zur Hälfte, unter 1 m nicht (§ 4 WoFlV); dann „Raumteile nach lichter Höhe“ wählen.');
  const t = !shape.subtract && shape.wofl.kategorie !== 'keine' ? woflHinweis(shape.name) : undefined;
  if (t) out.push(t);
  if (!out.length) return null;
  return (
    <>
      {out.map((t) => (
        <p key={t} className="hinweis small-text">
          {t}
        </p>
      ))}
    </>
  );
}

/** Teilflächen nach lichter Höhe in m² (Summe = Raumfläche) – Wohnfläche = ≥ 2 m + ½ × 1–2 m, exakt */
function HoehenTeile({ shape, upd }: { shape: RoomShape; upd: (fn: (s: Shape) => Shape) => void }) {
  const a = shape.wofl.anteile ?? { h2: 1, h12: 0, h01: 0 };
  const f = shapeArea(shape);
  const setze = (h2: number, h12: number) => {
    if (f <= 0) return;
    const x2 = Math.min(Math.max(h2 / f, 0), 1);
    const x12 = Math.min(Math.max(h12 / f, 0), 1 - x2);
    upd((s) => (s.kind === 'room' ? { ...s, wofl: { ...s.wofl, anteile: { h2: x2, h12: x12, h01: 1 - x2 - x12 } } } : s));
  };
  return (
    <div className="field-row">
      <Field label="≥ 2 m [m²]">
        <NumberField value={a.h2 * f} min={0} max={f} onChange={(v) => v !== undefined && setze(v, Math.min(a.h12 * f, f - v))} />
      </Field>
      <Field label="1–2 m [m²]">
        <NumberField value={a.h12 * f} min={0} max={f} onChange={(v) => v !== undefined && setze(Math.min(a.h2 * f, f - v), v)} />
      </Field>
      <Field label="< 1 m [m²]">
        <input className="num" readOnly value={fmt2(a.h01 * f)} />
      </Field>
    </div>
  );
}

/** Nr. und Bezeichnung mit Vorschlägen aus dem Raumkatalog: ein Katalogname setzt Nutzung und Anrechnung (F-11) */
function RaumBezeichnung({ shape, upd }: { shape: RoomShape; upd: (fn: (s: Shape) => Shape) => void }) {
  const katalog = useKatalog((s) => s.katalog);
  return (
    <>
      <div className="field-row">
        <Field label="Nr.">
          <TextField value={shape.nummer} onChange={(v) => upd((s) => ({ ...s, nummer: v }))} />
        </Field>
        <Field label="Bezeichnung">
          <TextField
            value={shape.name}
            list="fr-raumkatalog"
            onChange={(v) =>
              upd((s) => {
                if (s.kind !== 'room') return s;
                const e = katalogEintrag(katalog, v);
                return e ? katalogAnwenden(s, e) : { ...s, name: v };
              })
            }
          />
          <datalist id="fr-raumkatalog">
            {katalog.map((k) => (
              <option key={k.name} value={k.name} />
            ))}
          </datalist>
        </Field>
      </div>
      {shape.katalog && (
        <p className="muted small-text katalog-hinweis">
          Nutzung und Anrechnung aus dem Raumkatalog („{shape.katalog}“) – Vorschlag, bitte prüfen.
        </p>
      )}
    </>
  );
}

/** Nutzungsart als zweite Ebene (F-14): Nummer aus dem Katalog des Büros, die Gruppe folgt der ersten Ziffer */
function NutzungsartFeld({ shape, upd }: { shape: RoomShape; upd: (fn: (s: Shape) => Shape) => void }) {
  const arten = useKatalog((s) => s.nutzungsarten);
  const passend = arten.filter((a) => gruppeAusNutzungsart(a.nr) === shape.nutzung);
  const bez = arten.find((a) => a.nr === shape.nutzungsart)?.bezeichnung;
  return (
    <Field label="Nutzungsart (optional)" hint={bez ? `${shape.nutzungsart} ${bez}` : 'zweite Ebene unter der Nutzungsgruppe, z. B. 7.1 – die Auswertung summiert weiter je Gruppe'}>
      <TextField
        value={shape.nutzungsart ?? ''}
        list="fr-nutzungsarten"
        placeholder={passend[0]?.nr ?? ''}
        onChange={(v) =>
          upd((s) => {
            if (s.kind !== 'room') return s;
            const { nutzungsart: _a, ...rest } = s;
            void _a;
            const nr = v.trim();
            const g = gruppeAusNutzungsart(nr);
            return nr ? { ...rest, nutzungsart: nr, ...(g ? { nutzung: g } : {}) } : rest;
          })
        }
      />
      <datalist id="fr-nutzungsarten">
        {arten.map((a) => (
          <option key={a.nr} value={a.nr} label={a.bezeichnung} />
        ))}
      </datalist>
    </Field>
  );
}

/** Raum ragt über den BGF-Umriss hinaus: auf den Umriss beschneiden (NRF muss innerhalb der BGF liegen) */
function AufUmrissBeschneiden({ shape, upd }: { shape: RoomShape; upd: (fn: (s: Shape) => Shape) => void }) {
  const storey = useActiveStorey();
  const neu = useMemo(() => {
    if (!storey.shapes.some((s) => s.kind === 'outline')) return null;
    const pts = raumAufUmriss(shape, storey);
    if (!pts) return null;
    const vorher = shapeArea({ ...shape, putzabzug: undefined });
    const nachher = shapeArea({ ...shape, points: pts, putzabzug: undefined });
    return vorher - nachher > 0.01 ? { pts, diff: vorher - nachher } : null;
  }, [shape, storey]);
  if (!neu) return null;
  return (
    <p className="warning small-text">
      Der Raum ragt {fmt2(neu.diff)} m² über den BGF-Umriss hinaus.{' '}
      <button className="small" onClick={() => upd((s) => ({ ...s, points: neu.pts }))}>
        Auf Umriss beschneiden
      </button>
    </p>
  );
}

/** „Raum an Höhenlinien teilen“: Teilflächen ≥ 2 m / 1–2 m / < 1 m aus der Dachform (F-12) – nur die Wohnfläche ändert sich */
function AnHoehenlinienTeilen({ shape, upd }: { shape: RoomShape; upd: (fn: (s: Shape) => Shape) => void }) {
  const storey = useActiveStorey();
  const t = useMemo(() => raumHoehenAnteile(shape, storey), [shape, storey]);
  if (!t) return null;
  const f = shapeArea(shape);
  const a = t.anteile;
  const gleich = shape.wofl.kategorie === 'hoehen' && shape.wofl.anteile && Math.abs(shape.wofl.anteile.h2 - a.h2) < 1e-6 && Math.abs(shape.wofl.anteile.h12 - a.h12) < 1e-6;
  if (gleich) return <p className="muted small-text">Teilflächen aus den Höhenlinien der Dachform abgeleitet (Planmaße).</p>;
  return (
    <p className="hinweis small-text">
      Unter der Dachform: ≥ 2 m {fmt2(a.h2 * f)} m², 1–2 m {fmt2(a.h12 * f)} m², &lt; 1 m {fmt2(a.h01 * f)} m².{' '}
      <button className="small" onClick={() => upd((s) => (s.kind === 'room' ? { ...s, wofl: { ...s.wofl, kategorie: 'hoehen', faktor: undefined, anteile: a } } : s))}>
        Raum an Höhenlinien teilen
      </button>
    </p>
  );
}

/** „BGF-Umriss aus Räumen + Wanddicke“ – nur mit ausdrücklicher Wanddicke, Vermerk „Näherung“ (F-15) */
function UmrissAusRaeumen() {
  const storey = useActiveStorey();
  const st = useEditor.getState();
  const raeume = storey.shapes.filter((s): s is RoomShape => s.kind === 'room' && !s.subtract);
  if (!raeume.length || storey.shapes.some((s) => s.kind === 'outline')) return null;
  const anlegen = async () => {
    const t = await frageText(
      'BGF-Umriss aus Räumen',
      '',
      'Anlegen',
      'Wanddicke der Außenwände in m (einschließlich Putz/Dämmung). Der Umriss ist eine Näherung – bei ungleichen Wanddicken besser aus dem Plan erkennen (Werkzeug „Erkennen“, Klick auf die Außenwand) oder zeichnen.',
    );
    const d = t ? parseNum(t) : null;
    if (d === null || !(d > 0 && d < 2)) return;
    const polys = umrissAusRaeumen(raeume, d);
    if (!polys.length) return;
    const neu = polys.map((pts, i) => ({ ...createOutline(pts, polys.length > 1 ? `BGF ${i + 1}` : 'BGF'), bemerkung: naeherungsVermerk(d), pruefen: true }));
    st.update((p) => mapStorey(p, storey.id, (s) => ({ ...s, shapes: [...neu, ...s.shapes] })));
  };
  return (
    <div className="button-row">
      <button className="small" onClick={() => void anlegen()} title="Näherung: Räume um die Wanddicke erweitert">
        BGF-Umriss aus Räumen + Wanddicke …
      </button>
    </div>
  );
}
