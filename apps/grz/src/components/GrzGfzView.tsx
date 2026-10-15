import { lazy, Suspense, useDeferredValue, useMemo, useState } from 'react';
import { fmt2 } from '@core/format';
import { LAGEPLAN_NUTZUNGEN, VERSIEGELUNGEN } from '@core/lageplan';
import type { BauNVOFassung, BauOFassung, LageplanFlaeche, LageplanNutzung, MassNutzung, RoomShape, Versiegelung } from '@core/model';
import { Field, NumberField, TextField } from '@core/ui/fields';
import type { Anrechnung, Kennzahl, Status } from '../massNutzung';
import { anrechnungRegel, BAUNVO_FASSUNGEN, BAUO_FASSUNGEN, baunvoLabel, bauoLabel, massNachweis, recht } from '../massNutzung';
import { mapFlaeche, removeFlaeche, setMassNutzung, useGrz } from '../store';
import { AUFENTHALT, ANRECHNUNG, GELAENDE_QUELLE, GF_ART, HAFTUNG, roemisch, STATUS, zahl } from '../texte';
import { LageplanEditor } from './LageplanEditor';
import { areaMP, unionAll } from '@core/polygon';
import { HilfeKnopf } from '@core/ui/Nachschlagewerk';

const Gelaende3D = lazy(() => import('./Gelaende3D'));

/**
 * GRZ/GFZ-Nachweis: Festsetzungen des Bebauungsplans, Lageplan mit Flächen und der Nachweis
 * nach der für das Plandatum maßgebenden BauNVO und Bauordnung NRW.
 */
export function GrzGfzView() {
  const project = useGrz((s) => s.project);
  const selected = useGrz((s) => s.selected);
  const selectedIds = useGrz((s) => s.selectedIds);
  const [ansicht, setAnsicht] = useState<'plan' | '3d'>('plan');
  // Nachweis nachrangig rechnen: Ziehen und Tippen bleiben flüssig, die Kennzahlen folgen einen Augenblick später
  const nachweisStand = useDeferredValue(project);
  const n = useMemo(() => massNachweis(nachweisStand), [nachweisStand]);
  const m = project.massNutzung ?? {};
  const st = useGrz.getState();
  const setM = (patch: Partial<MassNutzung>) => st.update((p) => setMassNutzung(p, patch));
  const auto = recht({ ...m, baunvo: undefined, bauo: undefined });
  const flaechen = project.lageplan?.flaechen ?? [];
  const offeneNutzungen = LAGEPLAN_NUTZUNGEN.filter((x) => anrechnungRegel(x.id, n.recht.baunvo) === 'pruefen' && flaechen.some((f) => !f.nachbar && f.nutzung === x.id));
  const updFlaeche = (id: string, patch: Partial<LageplanFlaeche>) => st.update((p) => mapFlaeche(p, id, (f) => ({ ...f, ...patch })));
  const sel = selectedIds.length <= 1 ? flaechen.find((f) => f.id === selected) : undefined;
  const mehrere = selectedIds.length > 1 ? flaechen.filter((f) => selectedIds.includes(f.id)) : [];
  const updAlle = (patch: Partial<LageplanFlaeche>) =>
    st.update((p) => {
      let next = p;
      for (const f of mehrere) next = mapFlaeche(next, f.id, (x) => ({ ...x, ...patch }));
      return next;
    });
  const gleich = <T,>(werte: T[]): T | undefined => (werte.length && werte.every((v) => v === werte[0]) ? werte[0] : undefined);
  const setVollgeschoss = (storeyId: string, v: boolean | undefined) =>
    st.update((p) => ({ ...p, storeys: p.storeys.map((s) => (s.id === storeyId ? { ...s, vollgeschoss: v } : s)) }));
  const setAufenthalt = (storeyId: string, roomId: string, v: RoomShape['aufenthalt']) =>
    st.update((p) => ({
      ...p,
      storeys: p.storeys.map((s) => (s.id === storeyId ? { ...s, shapes: s.shapes.map((r) => (r.id === roomId && r.kind === 'room' ? { ...r, aufenthalt: v } : r)) } : s)),
    }));
  return (
    <div className="grz-view">
      <section className="grz-col grz-fest">
        <h2>
          Festsetzungen
          <HilfeKnopf thema={['baunvo', 'vollgeschoss']} titel="Festsetzungen" />
        </h2>
        <Field label="Bebauungsplan in Kraft seit" hint="leer = aktuelles Recht (§ 34/35 BauGB)">
          <input type="date" value={m.planDatum ?? ''} onChange={(e) => setM({ planDatum: e.target.value || undefined })} />
        </Field>
        <Field label="BauNVO-Fassung">
          <select value={m.baunvo ?? 'auto'} onChange={(e) => setM({ baunvo: e.target.value === 'auto' ? undefined : (e.target.value as BauNVOFassung) })}>
            <option value="auto">automatisch ({baunvoLabel(auto.baunvo)})</option>
            {BAUNVO_FASSUNGEN.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label} ({f.zeitraum})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Vollgeschossbegriff">
          <select value={m.bauo ?? 'auto'} onChange={(e) => setM({ bauo: e.target.value === 'auto' ? undefined : (e.target.value as BauOFassung) })}>
            <option value="auto">automatisch ({bauoLabel(auto.bauo)})</option>
            {BAUO_FASSUNGEN.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label} ({f.zeitraum})
              </option>
            ))}
          </select>
        </Field>
        <div className="field-row">
          <Field label="GRZ zulässig">
            <NumberField value={m.grz} allowEmpty min={0} max={1} onChange={(v) => setM({ grz: v })} />
          </Field>
          <Field label="GFZ zulässig">
            <NumberField value={m.gfz} allowEmpty min={0} max={10} onChange={(v) => setM({ gfz: v })} />
          </Field>
        </div>
        <div className="field-row">
          <Field label="Vollgeschosse höchstens">
            <NumberField value={m.vollgeschosseMax} allowEmpty min={0} max={40} digits={0} onChange={(v) => setM({ vollgeschosseMax: v === undefined ? undefined : Math.round(v) })} />
          </Field>
          {n.recht.baunvo === '1990' && (
            <Field label="GRZ II höchstens" hint="leer = 1,5 × GRZ, max. 0,8">
              <NumberField value={m.grzIIMax} allowEmpty min={0} max={1} onChange={(v) => setM({ grzIIMax: v })} />
            </Field>
          )}
        </div>
        <Field label="Grundstücksfläche [m²]" hint={n.grundstueck.ausLageplan !== undefined ? `aus dem Lageplan: ${fmt2(n.grundstueck.ausLageplan)} m²` : 'wie in den Projektdaten'}>
          <NumberField
            value={project.meta.grundstueck.flaeche}
            allowEmpty
            min={0}
            placeholder={n.grundstueck.ausLageplan !== undefined ? fmt2(n.grundstueck.ausLageplan) : ''}
            onChange={(v) => st.update((p) => ({ ...p, meta: { ...p.meta, grundstueck: { ...p.meta.grundstueck, flaeche: v } } }))}
          />
        </Field>
        <Field
          label={n.recht.bauo === 'nw1962' ? 'festgelegte Geländeoberfläche [m]' : 'Geländeoberfläche [m]'}
          hint={
            m.gelaende === undefined
              ? n.gelaende.quelle === 'annahme'
                ? 'unbekannt: ±0,00 angenommen'
                : `${GELAENDE_QUELLE[n.gelaende.quelle]}: im Mittel ${fmt2(n.gelaende.hoehe)} m – je Geschoss entlang seiner Außenwände`
              : 'über ±0,00 – gilt für alle Geschosse'
          }
        >
          <NumberField value={m.gelaende} allowEmpty placeholder={fmt2(n.gelaende.hoehe)} onChange={(v) => setM({ gelaende: v })} />
        </Field>
        <div className="field-row">
          <Field label="Dachaufbau [m]" hint="lichte Höhe = Dachhaut − Aufbau">
            <NumberField value={m.dachaufbau} allowEmpty min={0} max={2} placeholder="0,30" onChange={(v) => setM({ dachaufbau: v })} />
          </Field>
          {n.recht.baunvo !== '1990' && (
            <Field label="Wandzuschlag [m]" hint="Umfassungswände der Aufenthaltsräume">
              <NumberField value={m.wandzuschlag} allowEmpty min={0} max={2} placeholder="0,25" onChange={(v) => setM({ wandzuschlag: v })} />
            </Field>
          )}
        </div>
        {n.recht.bauo === 'nw1962' && (
          <label className="toggle block">
            <input type="checkbox" checked={!!m.einfamilienhaus} onChange={(e) => setM({ einfamilienhaus: e.target.checked || undefined })} />
            Einfamilienhaus (lichte Höhe für Aufenthaltsräume 2,30 statt 2,50 m)
          </label>
        )}
        {offeneNutzungen.length > 0 && (
          <>
            <h3>Einstufung offener Fälle</h3>
            <p className="muted small-text">{baunvoLabel(n.recht.baunvo)} regelt diese Nutzungen nicht eindeutig. Mit der Bauaufsicht klären und hier festlegen.</p>
            {offeneNutzungen.map((x) => (
              <Field key={x.id} label={x.label}>
                <select
                  value={m.einstufung?.[x.id] ?? 'offen'}
                  onChange={(e) => {
                    const einstufung = { ...(m.einstufung ?? {}) };
                    if (e.target.value === 'offen') delete einstufung[x.id];
                    else einstufung[x.id] = e.target.value as 'ja' | 'nein';
                    setM({ einstufung });
                  }}
                >
                  <option value="offen">offen – ohne und mit rechnen</option>
                  <option value="ja">zählt zur Grundfläche</option>
                  <option value="nein">zählt nicht</option>
                </select>
              </Field>
            ))}
          </>
        )}
      </section>

      <section className="grz-col grz-plan">
        <div className="section-head">
          <h2>
            {ansicht === 'plan' ? 'Lageplan' : '3D-Ansicht'}
            <HilfeKnopf thema={['lageplan', 'ueberlagerung', 'gelaende']} titel="Lageplan" />
          </h2>
          <div className="button-row">
            <button className={ansicht === 'plan' ? 'small active' : 'small'} onClick={() => setAnsicht('plan')}>
              Lageplan
            </button>
            <button className={ansicht === '3d' ? 'small active' : 'small'} onClick={() => setAnsicht('3d')} title="Gebäude, Gelände und Lageplan-Flächen in 3D – Vollgeschosse farbig">
              3D
            </button>
          </div>
        </div>
        {ansicht === 'plan' ? (
          <LageplanEditor n={n} />
        ) : (
          <Suspense fallback={<p className="busy">3D-Ansicht wird geladen …</p>}>
            <Gelaende3D project={project} n={n} />
          </Suspense>
        )}
        {!flaechen.length && (
          <p className="muted small-text">
            Noch keine Lageplan-Flächen. Beim IFC-Import kommen sie aus dem Geschoss „Lageplan“ und dem Gelände; sonst hier Zufahrten, Stellplätze, Terrassen und Grünflächen
            als Polygon oder Rechteck einzeichnen.
          </p>
        )}
        {mehrere.length > 0 && (
          <div className="lp-auswahl lp-mehrere">
            <strong>
              {mehrere.length} Flächen gewählt · {fmt2(areaMP(unionAll(mehrere.map((f) => f.points))))} m²
            </strong>
            <Field label="Nutzung">
              <select value={gleich(mehrere.map((f) => f.nutzung)) ?? ''} onChange={(e) => e.target.value && updAlle({ nutzung: e.target.value as LageplanNutzung })}>
                {gleich(mehrere.map((f) => f.nutzung)) === undefined && <option value="">unterschiedlich</option>}
                {LAGEPLAN_NUTZUNGEN.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Versiegelung">
              <select value={gleich(mehrere.map((f) => f.versiegelung)) ?? ''} onChange={(e) => e.target.value && updAlle({ versiegelung: e.target.value as Versiegelung })}>
                {gleich(mehrere.map((f) => f.versiegelung)) === undefined && <option value="">unterschiedlich</option>}
                {VERSIEGELUNGEN.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nachbargrundstück">
              <select
                value={(() => {
                  const g = gleich(mehrere.map((f) => !!f.nachbar));
                  return g === undefined ? '' : g ? 'ja' : 'nein';
                })()}
                onChange={(e) => e.target.value && updAlle({ nachbar: e.target.value === 'ja' || undefined })}
              >
                {gleich(mehrere.map((f) => !!f.nachbar)) === undefined && <option value="">unterschiedlich</option>}
                <option value="nein">eigenes Grundstück</option>
                <option value="ja">Nachbar (zählt nicht)</option>
              </select>
            </Field>
            <Field label="Höhe der Oberfläche [m]" hint="über ±0,00 – für alle gewählten Flächen">
              <NumberField value={gleich(mehrere.map((f) => f.hoehe))} allowEmpty placeholder="unterschiedlich" onChange={(v) => v !== undefined && updAlle({ hoehe: v })} />
            </Field>
            <button className="small danger" onClick={() => st.update((p) => removeFlaeche(p, mehrere.map((f) => f.id)))}>
              {mehrere.length} Flächen löschen
            </button>
          </div>
        )}
        {sel && (
          <div className="lp-auswahl" key={sel.id}>
            <Field label="Bezeichnung">
              <TextField value={sel.name} onChange={(v) => updFlaeche(sel.id, { name: v })} />
            </Field>
            <Field label="Höhe der Oberfläche [m]" hint="über ±0,00 – für die Geländeoberfläche">
              <NumberField value={sel.hoehe} allowEmpty onChange={(v) => updFlaeche(sel.id, { hoehe: v })} />
            </Field>
            <button className="small danger" onClick={() => st.update((p) => removeFlaeche(p, sel.id))}>
              Fläche löschen
            </button>
          </div>
        )}
        {flaechen.length > 0 && (
          <div className="tbl-wrap">
            <table className="grz-table">
              <thead>
                <tr>
                  <th>Fläche</th>
                  <th>Nutzung</th>
                  <th>Versiegelung</th>
                  <th className="num" title="eindeutig zugeordnete Fläche außerhalb des Gebäudes – Überlagerungen zählen nur einmal">m²</th>
                  <th>Grundfläche</th>
                </tr>
              </thead>
              <tbody>
                {flaechen.map((f) => {
                  const post = n.lageplan.find((x) => x.id === f.id);
                  return (
                    <tr key={f.id} className={`${f.nachbar ? 'nachbar' : ''}${selectedIds.includes(f.id) ? ' selected' : ''}`}>
                      <td>
                        <button
                          className="link"
                          onClick={(e) => (e.shiftKey || e.ctrlKey || e.metaKey ? st.toggleSelect(f.id) : st.select(f.id))}
                          title="Im Lageplan auswählen (Umschalt: mehrere)"
                        >
                          {f.name || 'Fläche'}
                        </button>
                        <label className="toggle small-text">
                          <input type="checkbox" checked={!!f.nachbar} onChange={(e) => updFlaeche(f.id, { nachbar: e.target.checked || undefined })} />
                          Nachbar
                        </label>
                      </td>
                      <td>
                        <select value={f.nutzung} disabled={f.nachbar} onChange={(e) => updFlaeche(f.id, { nutzung: e.target.value as LageplanNutzung })}>
                          {LAGEPLAN_NUTZUNGEN.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select value={f.versiegelung} disabled={f.nachbar} onChange={(e) => updFlaeche(f.id, { versiegelung: e.target.value as Versiegelung })}>
                          {VERSIEGELUNGEN.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="num" title={post ? `Fläche ${fmt2(post.flaeche)} m², außerhalb des Gebäudes ${fmt2(post.flaecheAussen)} m²` : undefined}>
                        {fmt2(post?.flaecheEindeutig ?? 0)}
                        {post && post.ueberlagert > 0.05 && <div className="muted small-text">{fmt2(post.ueberlagert)} überlagert</div>}
                      </td>
                      <td>{f.nachbar ? <span className="muted small-text">Nachbar</span> : <AnrechnungPill a={post?.anrechnung ?? 'nein'} baunvo={n.recht.baunvo} />}</td>
                    </tr>
                  );
                })}
                <tr className="sum">
                  <td colSpan={3}>Summe (jede Stelle einmal)</td>
                  <td className="num">{fmt2(n.lageplan.filter((x) => !x.nachbar).reduce((a, x) => a + x.flaecheEindeutig, 0))}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grz-col grz-nachweis">
        <h2>
          Nachweis
          <HilfeKnopf thema={['grz', 'gfz', 'baunvo']} titel="GRZ/GFZ" />
        </h2>
        <p className="muted small-text">
          {baunvoLabel(n.recht.baunvo)} · Vollgeschosse nach {bauoLabel(n.recht.bauo)}
          {n.grundstueck.flaeche !== undefined && ` · Grundstück ${fmt2(n.grundstueck.flaeche)} m²${n.grundstueck.quelle === 'lageplan' ? ' (aus dem Lageplan)' : ''}`}
        </p>
        <div className="kpis">
          <KpiZeile titel={n.recht.baunvo === '1990' ? 'GRZ I' : 'GRZ'} k={n.grz} einheit="Grundfläche" flaeche={n.grz.wert * (n.grundstueck.flaeche ?? 0)} />
          {n.grz2 && <KpiZeile titel="GRZ II" k={n.grz2} einheit="mit § 19 Abs. 4" flaeche={n.grz2.wert * (n.grundstueck.flaeche ?? 0)} />}
          <KpiZeile titel="GFZ" k={n.gfz} einheit="Geschossfläche" flaeche={n.gf} />
          <div className="kpi">
            <div className="kpi-head">
              <span>Vollgeschosse</span>
              <StatusPill s={n.vollgeschosse.status} />
            </div>
            <div className="kpi-value">{roemisch(n.vollgeschosse.anzahl)}</div>
            <div className="kpi-sub">
              {n.vollgeschosse.zulaessig !== undefined ? `zulässig ${roemisch(n.vollgeschosse.zulaessig)} · ` : ''}
              {n.geschosse.filter((g) => g.vollgeschoss).map((g) => g.name).join(', ') || 'keine'}
            </div>
          </div>
        </div>
        {n.garagenFrei !== undefined && n.garagenFrei > 0 && (
          <p className="small-text">Garagen und überdachte Stellplätze: {fmt2(n.garagenFrei)} m² anrechnungsfrei (§ 21a Abs. 3, bis 0,1 der Grundstücksfläche).</p>
        )}

        <h3>
          Vollgeschosse
          <HilfeKnopf thema={['vollgeschoss', 'gelaende']} titel="Vollgeschosse" />
        </h3>
        <table className="grz-table">
          <thead>
            <tr>
              <th>Geschoss</th>
              <th className="num" title="Geländeoberfläche entlang der Außenwände des Geschosses: Mittel (tiefster – höchster Punkt)">Gelände</th>
              <th className="num">über Gelände</th>
              <th className="num">Anteil</th>
              <th>Ergebnis</th>
            </tr>
          </thead>
          <tbody>
            {n.geschosse.map((g) => (
              <tr key={g.storeyId} title={g.begruendung}>
                <td>{g.name}</td>
                <td className="num" title={`Quelle: ${GELAENDE_QUELLE[g.gelaende.quelle]}`}>
                  {fmt2(g.gelaende.mittel)} m
                  {g.gelaende.max - g.gelaende.min > 0.05 && (
                    <div className="muted small-text">
                      {fmt2(g.gelaende.min)} – {fmt2(g.gelaende.max)}
                    </div>
                  )}
                </td>
                <td className="num">{fmt2(g.ueberGelaende)} m</td>
                <td className="num">{g.oberirdisch ? `${Math.round(g.anteil * 100)} %` : '–'}</td>
                <td>
                  <select
                    value={g.automatisch ? 'auto' : g.vollgeschoss ? 'ja' : 'nein'}
                    onChange={(e) => setVollgeschoss(g.storeyId, e.target.value === 'auto' ? undefined : e.target.value === 'ja')}
                  >
                    <option value="auto">automatisch</option>
                    <option value="ja">Vollgeschoss</option>
                    <option value="nein">kein Vollgeschoss</option>
                  </select>{' '}
                  <strong>{g.vollgeschoss ? 'Vollgeschoss' : 'kein Vollgeschoss'}</strong>
                  <div className="muted small-text">{g.begruendung}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>Geschossfläche</h3>
        <table className="grz-table">
          <tbody>
            {n.gfJeGeschoss.map((g) => (
              <tr key={g.storeyId}>
                <td>{g.name}</td>
                <td className="muted small-text">{GF_ART[g.art]}</td>
                <td className="num">{fmt2(g.flaeche)} m²</td>
              </tr>
            ))}
            <tr className="sum">
              <td>Summe</td>
              <td />
              <td className="num">{fmt2(n.gf)} m²</td>
            </tr>
          </tbody>
        </table>

        {n.raeume.length > 0 && (
          <>
            <h3>
              Räume in Nicht-Vollgeschossen
              <HilfeKnopf thema={['aufenthaltsraum', 'gfz']} titel="Aufenthaltsräume" />
            </h3>
            <p className="muted small-text">
              {baunvoLabel(n.recht.baunvo)}: Aufenthaltsräume samt Treppenräumen zählen zur Geschossfläche. Vorschlag aus Nutzung und lichter Höhe nach{' '}
              {bauoLabel(n.recht.bauo)}.
            </p>
            <table className="grz-table">
              <tbody>
                {n.raeume.map((r) => (
                  <tr key={r.roomId} title={r.anforderung.text}>
                    <td>{project.storeys.find((s) => s.id === r.storeyId)?.name}</td>
                    <td>
                      {r.name}
                      <div className="muted small-text">{r.begruendung}</div>
                    </td>
                    <td className="num">{fmt2(r.maxHoehe)} m</td>
                    <td>
                      <select value={r.automatisch ? 'auto' : r.ergebnis} onChange={(e) => setAufenthalt(r.storeyId, r.roomId, e.target.value === 'auto' ? undefined : (e.target.value as 'ja' | 'nein' | 'treppe'))}>
                        <option value="auto">automatisch ({AUFENTHALT[r.automatisch ? r.ergebnis : r.nachName]})</option>
                        <option value="ja">Aufenthaltsraum</option>
                        <option value="treppe">Treppenraum</option>
                        <option value="nein">kein Aufenthaltsraum</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {flaechen.some((f) => !f.nachbar) && (
          <>
            <h3>
              Flächenbilanz
              <HilfeKnopf thema="ueberlagerung" titel="Überlagerungen" />
            </h3>
            <table className="grz-table">
              <tbody>
                <tr>
                  <td>Gebäude</td>
                  <td className="num">{fmt2(n.bilanz.gebaeude)} m²</td>
                </tr>
                {VERSIEGELUNGEN.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <span className="swatch" style={{ background: v.color }} /> {v.label}
                    </td>
                    <td className="num">{fmt2(n.bilanz[v.id])} m²</td>
                  </tr>
                ))}
                <tr className="sum">
                  <td>Summe</td>
                  <td className="num">{fmt2(n.bilanz.summe)} m²</td>
                </tr>
                {n.bilanz.differenz !== undefined && Math.abs(n.bilanz.differenz) > 0.5 && (
                  <tr>
                    <td className="warning">nicht erfasst bzw. überlappend</td>
                    <td className="num warning">{fmt2(n.bilanz.differenz)} m²</td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}

        {n.hinweise.length > 0 && (
          <>
            <h3>Hinweise</h3>
            <ul className="grz-hinweise">
              {n.hinweise.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </>
        )}
        <p className="muted small-text">{HAFTUNG}</p>
      </section>
    </div>
  );
}

export function StatusPill({ s }: { s: Status }) {
  return <span className={`pill ${STATUS[s].cls}`}>{STATUS[s].label}</span>;
}

function AnrechnungPill({ a, baunvo }: { a: Anrechnung; baunvo: BauNVOFassung }) {
  const cls = a === 'pruefen' ? 'warn' : a === 'nein' ? 'off' : 'ok';
  return (
    <span className={`pill ${cls}`} title={`${baunvoLabel(baunvo)}`}>
      {ANRECHNUNG[a]}
    </span>
  );
}

function KpiZeile({ titel, k, einheit, flaeche }: { titel: string; k: Kennzahl; einheit: string; flaeche: number }) {
  return (
    <div className={`kpi${k.status === 'ueberschritten' ? ' alarm' : ''}`}>
      <div className="kpi-head">
        <span>{titel}</span>
        <StatusPill s={k.status} />
      </div>
      <div className="kpi-value" title={k.wert.toLocaleString('de-DE', { maximumFractionDigits: 4 })}>
        {zahl(k.wert)}
        {k.mitOffenen !== undefined && <small> bis {zahl(k.mitOffenen)}</small>}
      </div>
      <div className="kpi-sub">
        {einheit} {fmt2(flaeche)} m²
        {k.zulaessig !== undefined && ` · zulässig ${zahl(k.zulaessig)}`}
        {k.reserve !== undefined && ` · ${k.reserve >= 0 ? 'Reserve' : 'zu viel'} ${fmt2(Math.abs(k.reserve))} m²`}
      </div>
    </div>
  );
}
