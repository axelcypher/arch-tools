import { Fragment, lazy, Suspense, useDeferredValue, useMemo, useState } from 'react';
import { fmt2 } from '@core/format';
import { LAGEPLAN_NUTZUNGEN, VERSIEGELUNGEN } from '@core/lageplan';
import type { BauNVOFassung, BauOFassung, Einstufung, Gebietsart, LageplanFlaeche, LageplanNutzung, MassNutzung, OutlineShape, RoomShape, Versiegelung } from '@core/model';
import { GEBIETSARTEN } from '@core/model';
import type { Point } from '@core/geometry';
import { Field, NumberField, TextField } from '@core/ui/fields';
import type { Anrechnung, Kennzahl, Status } from '../massNutzung';
import { aktiveVariante, anrechnungRegel, BAUNVO_FASSUNGEN, BAUO_FASSUNGEN, baunvoLabel, bauoLabel, massNachweis, recht, varianten, variantenVergleich } from '../massNutzung';
import { flaechenAktion, mapFlaeche, removeFlaeche, setMassNutzung, useGrz } from '../store';
import {
  anrechnungErklaerung,
  anrechnungRegelId,
  AUFENTHALT,
  ANRECHNUNG,
  flaechenVergleich,
  GELAENDE_QUELLE,
  GF_ART,
  HAFTUNG,
  kennzahlWert,
  roemisch,
  STATUS,
  vollgeschosseZulaessig,
  zahl,
} from '../texte';
import { LageplanEditor } from './LageplanEditor';
import { areaMP, unionAll } from '@core/polygon';
import { polygonArea } from '@core/geometry';
import { HilfeKnopf, useHilfe } from '@core/ui/Nachschlagewerk';
import { StammdatenKnopf } from '@core/ui/Stammdaten';
import { teilFormel } from '@core/flaechenZerlegung';
import { rechenweg, teilName } from '../rechenweg';

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
  // Nummern wie im Druck (eigene Flächen in Listenfolge) und Rechenweg
  const rw = useMemo(() => rechenweg(n, new Map(n.lageplan.filter((l) => !l.nachbar).map((l, i) => [l.id, i + 1]))), [n]);
  // Varianten (Lageplan-Flächen „nur in Variante B“): Kennzahlen nebeneinander, nur wenn es mehr als eine gibt
  const variante = aktiveVariante(nachweisStand);
  const vergleich = useMemo(() => (varianten(nachweisStand).length > 1 ? variantenVergleich(nachweisStand) : []), [nachweisStand]);
  const m = project.massNutzung ?? {};
  const st = useGrz.getState();
  const setM = (patch: Partial<MassNutzung>) => st.update((p) => setMassNutzung(p, patch), undefined, 'Festsetzung ändern');
  const auto = recht({ ...m, baunvo: undefined, bauo: undefined });
  const flaechen = project.lageplan?.flaechen ?? [];
  const offeneNutzungen = LAGEPLAN_NUTZUNGEN.filter((x) => anrechnungRegel(x.id, n.recht.baunvo) === 'pruefen' && flaechen.some((f) => !f.nachbar && f.nutzung === x.id));
  const updFlaeche = (id: string, patch: Partial<LageplanFlaeche>) => st.update((p) => mapFlaeche(p, id, (f) => ({ ...f, ...patch })), undefined, flaechenAktion(patch));
  const sel = selectedIds.length <= 1 ? flaechen.find((f) => f.id === selected) : undefined;
  const mehrere = selectedIds.length > 1 ? flaechen.filter((f) => selectedIds.includes(f.id)) : [];
  const updAlle = (patch: Partial<LageplanFlaeche>) =>
    st.update(
      (p) => {
        let next = p;
        for (const f of mehrere) next = mapFlaeche(next, f.id, (x) => ({ ...x, ...patch }));
        return next;
      },
      undefined,
      flaechenAktion(patch),
    );
  const gleich = <T,>(werte: T[]): T | undefined => (werte.length && werte.every((v) => v === werte[0]) ? werte[0] : undefined);
  const setVollgeschoss = (storeyId: string, v: boolean | undefined) =>
    st.update((p) => ({ ...p, storeys: p.storeys.map((s) => (s.id === storeyId ? { ...s, vollgeschoss: v } : s)) }), undefined, 'Vollgeschoss festlegen');
  const setBplan = (patch: { nummer?: string; name?: string }) =>
    st.update(
      (p) => {
        const b = { ...(p.meta.bebauungsplan ?? {}), ...patch };
        const leer = !b.nummer?.trim() && !b.name?.trim();
        return { ...p, meta: { ...p.meta, bebauungsplan: leer ? undefined : b } };
      },
      undefined,
      'Bebauungsplan ändern',
    );
  // Gebäudeteile: Umrisse oberirdischer Geschosse, sobald ein Geschoss mehrere hat (oder einer gekennzeichnet ist)
  const gebaeudeteile = project.storeys.flatMap((s) => {
    const os = s.shapes.filter((x): x is OutlineShape => x.kind === 'outline' && !x.subtract);
    return os.length > 1 || os.some((o) => o.anlage) ? os.map((o) => ({ storey: s.name, o })) : [];
  });
  const setAnlage = (id: string, anlage: OutlineShape['anlage']) =>
    st.update(
      (p) => ({ ...p, storeys: p.storeys.map((s) => ({ ...s, shapes: s.shapes.map((x) => (x.id === id && x.kind === 'outline' ? { ...x, anlage } : x)) })) }),
      undefined,
      'Gebäudeteil einstufen',
    );
  const setAufenthalt = (storeyId: string, roomId: string, v: RoomShape['aufenthalt']) =>
    st.update(
      (p) => ({
        ...p,
        storeys: p.storeys.map((s) => (s.id === storeyId ? { ...s, shapes: s.shapes.map((r) => (r.id === roomId && r.kind === 'room' ? { ...r, aufenthalt: v } : r)) } : s)),
      }),
      undefined,
      'Aufenthaltsraum festlegen',
    );
  return (
    <div className="grz-view">
      <section className="grz-col grz-fest">
        <h2>Projekt und Bebauungsplan</h2>
        <StammdatenKnopf project={project} onAendern={(meta, name) => st.update((p) => ({ ...p, meta, name }), undefined, 'Stammdaten ändern')} />
        <div className="field-row">
          <Field label="Bebauungsplan Nr.">
            <TextField value={project.meta.bebauungsplan?.nummer ?? ''} onChange={(v) => setBplan({ nummer: v })} />
          </Field>
          <Field label="Gebiet">
            <select value={m.gebietsart ?? ''} onChange={(e) => setM({ gebietsart: (e.target.value || undefined) as Gebietsart | undefined })} title="Art der baulichen Nutzung (BauNVO)">
              <option value="">–</option>
              {GEBIETSARTEN.map((g) => (
                <option key={g.id} value={g.id} title={g.label}>
                  {g.id}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Bebauungsplan Name">
          <TextField value={project.meta.bebauungsplan?.name ?? ''} onChange={(v) => setBplan({ name: v })} />
        </Field>
        <Field label="Bebauungsplan in Kraft seit" hint="leer = aktuelles Recht (§ 34/35 BauGB)">
          <input type="date" value={m.planDatum ?? ''} onChange={(e) => setM({ planDatum: e.target.value || undefined })} />
        </Field>
        <h2>
          Festsetzungen
          <HilfeKnopf thema={['baunvo', 'vollgeschoss']} titel="Festsetzungen" />
        </h2>
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
          <Field label="GR zulässig [m²]" hint="absolut (§ 16 Abs. 2)">
            <NumberField value={m.grAbsolut} allowEmpty min={0} onChange={(v) => setM({ grAbsolut: v })} />
          </Field>
          <Field label="GF zulässig [m²]" hint="absolut">
            <NumberField value={m.gfAbsolut} allowEmpty min={0} onChange={(v) => setM({ gfAbsolut: v })} />
          </Field>
        </div>
        <div className="field-row">
          <Field label="BMZ zulässig" hint="Baumassenzahl (§ 21)">
            <NumberField value={m.bmz} allowEmpty min={0} max={20} onChange={(v) => setM({ bmz: v })} />
          </Field>
          <Field label={m.vollgeschosseZwingend ? 'Vollgeschosse zwingend' : 'Vollgeschosse höchstens'}>
            <NumberField value={m.vollgeschosseMax} allowEmpty min={0} max={40} digits={0} onChange={(v) => setM({ vollgeschosseMax: v === undefined ? undefined : Math.round(v) })} />
          </Field>
        </div>
        <div className="field-row">
          {!m.vollgeschosseZwingend && (
            <Field label="Vollgeschosse mindestens">
              <NumberField value={m.vollgeschosseMin} allowEmpty min={0} max={40} digits={0} onChange={(v) => setM({ vollgeschosseMin: v === undefined ? undefined : Math.round(v) })} />
            </Field>
          )}
          <label className="toggle block">
            <input type="checkbox" checked={!!m.vollgeschosseZwingend} onChange={(e) => setM({ vollgeschosseZwingend: e.target.checked || undefined })} />
            zwingend
          </label>
        </div>
        <div className="field-row">
          {n.recht.baunvo === '1990' && (
            <Field label="GRZ II höchstens" hint="leer = 1,5 × GRZ, max. 0,8">
              <NumberField value={m.grzIIMax} allowEmpty min={0} max={1} onChange={(v) => setM({ grzIIMax: v })} />
            </Field>
          )}
        </div>
        <div className="field-row">
          <Field label="Traufhöhe höchstens [m]" hint="nur Prüfhinweis">
            <NumberField value={m.traufhoeheMax} allowEmpty min={0} max={100} onChange={(v) => setM({ traufhoeheMax: v })} />
          </Field>
          <Field label="Firsthöhe höchstens [m]" hint="nur Prüfhinweis">
            <NumberField value={m.firsthoeheMax} allowEmpty min={0} max={100} onChange={(v) => setM({ firsthoeheMax: v })} />
          </Field>
        </div>
        {n.recht.baunvo === '1990' && (
          <label className="toggle block" title="nur, wenn der Bebauungsplan es festsetzt">
            <input type="checkbox" checked={!!m.aufenthaltNichtVollgeschoss} onChange={(e) => setM({ aufenthaltNichtVollgeschoss: e.target.checked || undefined })} />
            Aufenthaltsräume in Nicht-Vollgeschossen mitrechnen (§ 20 Abs. 3 S. 2 BauNVO)
          </label>
        )}
        <div id="grz-grundstueck">
          <Field
            label="Grundstücksfläche [m²]"
            hint={
              n.grundstueck.grenze !== undefined
                ? `gezeichnete Grenze: ${fmt2(n.grundstueck.grenze)} m² – maßgebend ist die Katasterangabe`
                : n.grundstueck.ausLageplan !== undefined
                  ? `aus dem Lageplan: ${fmt2(n.grundstueck.ausLageplan)} m²`
                  : 'laut Kataster (Projektdaten)'
            }
          >
            <NumberField
              value={project.meta.grundstueck.flaeche}
              allowEmpty
              min={0}
              placeholder={n.grundstueck.grenze !== undefined ? fmt2(n.grundstueck.grenze) : n.grundstueck.ausLageplan !== undefined ? fmt2(n.grundstueck.ausLageplan) : ''}
              onChange={(v) => st.update((p) => ({ ...p, meta: { ...p.meta, grundstueck: { ...p.meta.grundstueck, flaeche: v } } }), undefined, 'Grundstücksfläche ändern')}
            />
          </Field>
        </div>
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
          <Field label="Decken-/Dachaufbau [m]" hint="lichte Höhe = OK Decke bzw. Dachhaut − Aufbau">
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
        {gebaeudeteile.length > 0 && (
          <>
            <h3>Gebäudeteile</h3>
            <p className="muted small-text">Angebaute Garagen, Carports oder Gartenhäuser aus der IFC zählen als Anlage (§ 19 Abs. 4 bzw. § 21a), nicht als Hauptanlage.</p>
            {gebaeudeteile.map(({ storey, o }) => (
              <Field key={o.id} label={`${storey} · ${o.name || 'Umriss'} · ${fmt2(polygonArea(o.points))} m²`}>
                <select value={o.anlage ?? ''} onChange={(e) => setAnlage(o.id, (e.target.value || undefined) as OutlineShape['anlage'])}>
                  <option value="">Hauptanlage</option>
                  <option value="garage">Garage / Carport</option>
                  <option value="nebenanlage">Nebenanlage</option>
                </select>
              </Field>
            ))}
          </>
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
                    else einstufung[x.id] = e.target.value as Einstufung;
                    setM({ einstufung });
                  }}
                >
                  <option value="offen">offen – ohne und mit rechnen</option>
                  <option value="ja">{n.recht.baunvo === '1990' ? 'zählt zur GRZ II' : 'zählt zur Grundfläche'}</option>
                  {n.recht.baunvo === '1990' && <option value="grz1">zählt zur Hauptanlage (GRZ I)</option>}
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
            Noch keine Lageplan-Flächen. Beim IFC-Import kommen sie aus dem Geschoss „Lageplan“ und dem Gelände; sonst hier Zufahrten, Stellplätze, Terrassen und Grünflächen als Polygon oder Rechteck
            einzeichnen.
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
            <button
              className="small danger"
              onClick={() =>
                st.update(
                  (p) =>
                    removeFlaeche(
                      p,
                      mehrere.map((f) => f.id),
                    ),
                  undefined,
                  'Flächen löschen',
                )
              }
            >
              {mehrere.length} Flächen löschen
            </button>
          </div>
        )}
        {sel && (
          <div className="lp-auswahl" key={sel.id}>
            <Field label="Bezeichnung">
              <TextField value={sel.name} onChange={(v) => updFlaeche(sel.id, { name: v })} />
            </Field>
            <Field label="Nutzung">
              <select value={sel.nutzung} disabled={sel.nachbar} onChange={(e) => updFlaeche(sel.id, { nutzung: e.target.value as LageplanNutzung })}>
                {LAGEPLAN_NUTZUNGEN.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Versiegelung">
              <select value={sel.versiegelung} disabled={sel.nachbar} onChange={(e) => updFlaeche(sel.id, { versiegelung: e.target.value as Versiegelung })}>
                {VERSIEGELUNGEN.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nachbargrundstück">
              <select value={sel.nachbar ? 'ja' : 'nein'} onChange={(e) => updFlaeche(sel.id, { nachbar: e.target.value === 'ja' || undefined })}>
                <option value="nein">eigenes Grundstück</option>
                <option value="ja">Nachbar (zählt nicht)</option>
              </select>
            </Field>
            <Field label="Höhe der Oberfläche [m]" hint="über ±0,00 – für die Geländeoberfläche">
              <NumberField value={sel.hoehe} allowEmpty onChange={(v) => updFlaeche(sel.id, { hoehe: v })} />
            </Field>
            <Field label="Variante" hint="z. B. „mit Terrasse“ nur in Variante B">
              <select value={sel.variante ?? ''} onChange={(e) => updFlaeche(sel.id, { variante: e.target.value || undefined })}>
                <option value="">alle Varianten</option>
                {['A', 'B', 'C', 'D'].map((v) => (
                  <option key={v} value={v}>
                    nur Variante {v}
                  </option>
                ))}
              </select>
            </Field>
            <KantenLaengen pts={sel.points} onChange={(pts) => updFlaeche(sel.id, { points: pts })} />
            <TeilflaechenListe f={rw.flaechen.find((x) => x.id === sel.id)} />
            <button className="small danger" onClick={() => st.update((p) => removeFlaeche(p, sel.id), undefined, 'Fläche löschen')}>
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
                  <th className="num" title="eindeutig zugeordnete Fläche außerhalb des Gebäudes – Überlagerungen zählen nur einmal">
                    m²
                  </th>
                  <th>Grundfläche</th>
                </tr>
              </thead>
              <tbody>
                {flaechen.map((f) => {
                  const post = n.lageplan.find((x) => x.id === f.id);
                  return (
                    <tr key={f.id} className={`${f.nachbar || (f.variante && f.variante !== variante) ? 'nachbar' : ''}${selectedIds.includes(f.id) ? ' selected' : ''}`}>
                      <td>
                        <button className="link" onClick={(e) => (e.shiftKey || e.ctrlKey || e.metaKey ? st.toggleSelect(f.id) : st.select(f.id))} title="Im Lageplan auswählen (Umschalt: mehrere)">
                          {f.name || 'Fläche'}
                        </button>
                        {f.variante && <span className="muted small-text"> · Variante {f.variante}</span>}
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
                      <td>
                        {f.nachbar ? (
                          <span className="muted small-text">Nachbar</span>
                        ) : (
                          <AnrechnungPill a={post?.anrechnung ?? 'nein'} regel={post?.regel ?? 'nein'} nutzung={f.nutzung} baunvo={n.recht.baunvo} />
                        )}
                      </td>
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
        {vergleich.length > 1 && (
          <div className="grz-varianten">
            <div className="button-row" role="group" aria-label="Variante">
              <span className="muted small-text">Variante:</span>
              {vergleich.map(({ variante: v }) => (
                <button key={v} className={v === variante ? 'small active' : 'small'} onClick={() => setM({ variante: v === 'A' ? undefined : v })}>
                  {v}
                </button>
              ))}
            </div>
            <table className="grz-table grz-varianten-tabelle">
              <thead>
                <tr>
                  <th>Variante</th>
                  <th className="num">{n.recht.baunvo === '1990' ? 'GRZ I' : 'GRZ'}</th>
                  {n.recht.baunvo === '1990' && <th className="num">GRZ II</th>}
                  <th className="num">GFZ</th>
                </tr>
              </thead>
              <tbody>
                {vergleich.map(({ variante: v, n: nv }) => (
                  <tr key={v} className={v === variante ? 'selected' : undefined}>
                    <td>{v}</td>
                    <td className="num">{kennzahlWert(nv.grz)}</td>
                    {nv.grz2 && <td className="num">{kennzahlWert(nv.grz2)}</td>}
                    <td className="num">{kennzahlWert(nv.gfz)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="kpis">
          <KpiZeile titel={n.recht.baunvo === '1990' ? 'GRZ I' : 'GRZ'} k={n.grz} einheit="Grundfläche" kurz={n.recht.baunvo === '1990' ? 'GR I' : 'GR'} />
          {n.grz2 && <KpiZeile titel="GRZ II" k={n.grz2} einheit="mit § 19 Abs. 4" kurz="GR II" />}
          <KpiZeile titel="GFZ" k={n.gfz} einheit="Geschossfläche" kurz="GF" />
          {n.grAbsolut && <AbsolutKpi titel={n.recht.baunvo === '1990' ? 'GR I absolut' : 'GR absolut'} a={n.grAbsolut} />}
          {n.gfAbsolut && <AbsolutKpi titel="GF absolut" a={n.gfAbsolut} />}
          {n.bmz && <KpiZeile titel="BMZ" k={n.bmz} einheit="Baumasse" kurz="BM" />}
          <div className="kpi">
            <div className="kpi-head">
              <span>Vollgeschosse</span>
              <StatusPill s={n.vollgeschosse.status} />
            </div>
            <div className="kpi-value">{roemisch(n.vollgeschosse.anzahl)}</div>
            <div className="kpi-sub">
              {vollgeschosseZulaessig(n.vollgeschosse)}
              {n.geschosse
                .filter((g) => g.vollgeschoss)
                .map((g) => g.name)
                .join(', ') || 'keine'}
            </div>
          </div>
        </div>
        <details className="grz-rechenweg-app">
          <summary>Rechenweg</summary>
          <ul className="grz-formeln">
            {rw.formeln.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </details>
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
              <th className="num" title="Geländeoberfläche entlang der Außenwände des Geschosses: Mittel (tiefster – höchster Punkt)">
                Gelände
              </th>
              <th className="num">über Gelände</th>
              <th className="num">Anteil</th>
              <th>Ergebnis</th>
            </tr>
          </thead>
          <tbody>
            {n.geschosse.map((g) => (
              <Fragment key={g.storeyId}>
                <tr className="grz-vg-zeile">
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
                  <td className="grz-vg-ergebnis">
                    <strong>{g.vollgeschoss ? 'Vollgeschoss' : 'kein Vollgeschoss'}</strong>{' '}
                    <select
                      className="grz-wahl"
                      title="Vollgeschoss festlegen: automatisch, ja oder nein"
                      aria-label={`Vollgeschoss ${g.name}`}
                      value={g.automatisch ? 'auto' : g.vollgeschoss ? 'ja' : 'nein'}
                      onChange={(e) => setVollgeschoss(g.storeyId, e.target.value === 'auto' ? undefined : e.target.value === 'ja')}
                    >
                      <option value="auto">auto</option>
                      <option value="ja">ja</option>
                      <option value="nein">nein</option>
                    </select>
                  </td>
                </tr>
                <tr className="grz-begruendung">
                  <td colSpan={5}>
                    <details>
                      <summary>Begründung</summary>
                      {g.begruendung}
                    </details>
                  </td>
                </tr>
              </Fragment>
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
              {baunvoLabel(n.recht.baunvo)}: Aufenthaltsräume samt Treppenräumen zählen zur Geschossfläche. Vorschlag aus Nutzung und lichter Höhe nach {bauoLabel(n.recht.bauo)}.
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
                      <select
                        value={r.automatisch ? 'auto' : r.ergebnis}
                        onChange={(e) => setAufenthalt(r.storeyId, r.roomId, e.target.value === 'auto' ? undefined : (e.target.value as 'ja' | 'nein' | 'treppe'))}
                      >
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

        {n.recht.hinweise.length + n.hinweise.length > 0 && (
          <>
            <h3>Hinweise</h3>
            <ul className="grz-hinweise">
              {n.recht.hinweise.map((h, i) => (
                <li key={`r${i}`}>{h}</li>
              ))}
              {n.hinweise.map((h, i) => (
                <li key={i} className={h.art === 'bedienung' ? 'bedienung' : undefined} title={h.art === 'bedienung' ? 'Bedienhinweis – erscheint nicht im Nachweis' : undefined}>
                  {h.text}
                  {h.tipp && <span className="muted"> {h.tipp}</span>}
                  {h.feld === 'grundstueck' && (
                    <>
                      {' '}
                      <button className="link" onClick={() => document.querySelector<HTMLInputElement>('#grz-grundstueck input')?.focus()}>
                        zum Feld
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="muted small-text">{HAFTUNG}</p>
      </section>
    </div>
  );
}

/**
 * Kantenlängen der gewählten Fläche, bearbeitbar: Eine Eingabe verschiebt den Endpunkt entlang der Kante; bei einem
 * Rechteck wandert die gegenüberliegende Ecke mit, damit es ein Rechteck bleibt.
 */
function KantenLaengen({ pts, onChange }: { pts: Point[]; onChange: (pts: Point[]) => void }) {
  return (
    <details className="lp-kanten">
      <summary className="small-text">Kantenlängen</summary>
      <div className="lp-kanten-liste">
        {pts.map((a, i) => {
          const b = pts[(i + 1) % pts.length];
          const l = Math.hypot(b.x - a.x, b.y - a.y);
          return (
            <Field key={i} label={`Kante ${i + 1}`}>
              <NumberField value={Math.round(l * 10000) / 10000} min={0.01} onChange={(v) => v !== undefined && onChange(kanteSetzen(pts, i, v))} />
            </Field>
          );
        })}
      </div>
    </details>
  );
}

/** Kante i auf die Länge l bringen: Endpunkt entlang der Kante verschieben (Rechteck: Nachbarecke mit) */
export function kanteSetzen(pts: Point[], i: number, l: number): Point[] {
  const n = pts.length;
  const a = pts[i];
  const j = (i + 1) % n;
  const b = pts[j];
  const alt = Math.hypot(b.x - a.x, b.y - a.y);
  if (alt < 1e-9) return pts;
  const d = { x: ((b.x - a.x) / alt) * (l - alt), y: ((b.y - a.y) / alt) * (l - alt) };
  const recht =
    n === 4 &&
    pts.every((p, k) => {
      const q = pts[(k + 1) % 4];
      const r = pts[(k + 2) % 4];
      return Math.abs((q.x - p.x) * (r.x - q.x) + (q.y - p.y) * (r.y - q.y)) < 1e-6;
    });
  const bewegen = new Set(recht ? [j, (j + 1) % n] : [j]);
  return pts.map((p, k) => (bewegen.has(k) ? { x: p.x + d.x, y: p.y + d.y } : p));
}

/** absolute Festsetzung (GR/GF in m²) */
function AbsolutKpi({ titel, a }: { titel: string; a: NonNullable<ReturnType<typeof massNachweis>['grAbsolut']> }) {
  return (
    <div className={`kpi${a.status === 'ueberschritten' ? ' alarm' : ''}`}>
      <div className="kpi-head">
        <span>{titel}</span>
        <StatusPill s={a.status} />
      </div>
      <div className="kpi-value">
        {fmt2(a.flaeche)} <small>m²</small>
      </div>
      <div className="kpi-sub">
        zulässig <span className="nowrap">{fmt2(a.zulaessig)} m²</span>
      </div>
    </div>
  );
}

/** Teilflächen der gewählten Fläche (Rechenweg) */
function TeilflaechenListe({ f }: { f: ReturnType<typeof rechenweg>['flaechen'][number] | undefined }) {
  if (!f) return null;
  if (!f.zerlegung.zerlegt) return <p className="grz-teile">Fläche aus Koordinaten: {fmt2(f.zerlegung.flaeche)} m²</p>;
  return (
    <ul className="grz-teile" aria-label="Teilflächen">
      {f.zerlegung.teile.map((t, i) => (
        <li key={i}>
          {teilName(f.nr, i, t)}: {teilFormel(t)}
        </li>
      ))}
    </ul>
  );
}

export function StatusPill({ s }: { s: Status }) {
  return <span className={`pill ${STATUS[s].cls}`}>{STATUS[s].label}</span>;
}

/** Pille der Anrechnung: Tooltip mit Begründung, Klick öffnet die Regel im Nachschlagewerk */
export function AnrechnungPill({ a, regel, nutzung, baunvo }: { a: Anrechnung; regel: Anrechnung; nutzung: LageplanNutzung; baunvo: BauNVOFassung }) {
  const cls = a === 'pruefen' ? 'warn' : a === 'nein' ? 'off' : 'ok';
  const id = anrechnungRegelId(a);
  return (
    <button
      type="button"
      className={`pill pill-knopf ${cls}`}
      title={`${anrechnungErklaerung(nutzung, baunvo, a, regel)} (Klick: Regel nachschlagen)`}
      data-regel={id}
      onClick={() => useHilfe.getState().oeffnen(['grz'], 'Anrechnung', id)}
    >
      {ANRECHNUNG[a]}
    </button>
  );
}

function KpiZeile({ titel, k, einheit, kurz }: { titel: string; k: Kennzahl; einheit: string; kurz: string }) {
  const vergleich = flaechenVergleich(kurz, k);
  return (
    <div className={`kpi${k.status === 'ueberschritten' ? ' alarm' : ''}`}>
      <div className="kpi-head">
        <span>{titel}</span>
        <StatusPill s={k.status} />
      </div>
      <div className="kpi-value" title={k.wert === undefined ? 'Grundstücksfläche fehlt' : undefined}>
        {kennzahlWert(k)}
        {k.mitOffenen !== undefined && <small> bis {kennzahlWert(k, k.mitOffenen)}</small>}
      </div>
      <div className="kpi-sub">
        <span className="nowrap">
          {einheit} {fmt2(k.flaeche)} m²
        </span>
        {k.zulaessig !== undefined && ` · zulässig ${zahl(k.zulaessig)}`}
        {k.reserve !== undefined && (
          <>
            {' · '}
            <span className="nowrap">
              {k.reserve >= 0 ? 'Reserve' : 'zu viel'} {fmt2(Math.abs(k.reserve))} m²
            </span>
          </>
        )}
      </div>
      {vergleich && <div className="kpi-sub kpi-vergleich">{vergleich}</div>}
    </div>
  );
}
