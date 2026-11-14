import { Symbol } from '@core/ui/Symbol';
import type { MenuePunkt } from '@core/ui/Menue';
import { MenueKnopf } from '@core/ui/Menue';
import { useMemo, useState } from 'react';
import { fmt2 } from '@core/format';
import type { Kosten, KostenBezug, KostenPosition, KostenStufe } from '@core/model';
import { newId } from '@core/model';
import { Field, NumberField, TextField } from '@core/ui/fields';
import { istKg, istRisiko, kg1, KG_ERSTE_EBENE, KG_RISIKO, kgName, kgUnter, standardBezug } from '../din276';
import { gliederung, gliederungFuer } from '../katalog';
import type { Ergebnis, PositionErgebnis } from '../kosten';
import { berechne, euro, euroSpanne, standAus, vergleiche } from '../kosten';
import type { MengenBezug } from '../mengen';
import { MENGEN_BEZUEGE, MENGEN_INFO } from '../mengen';
import { addPositionen, mapPosition, removePosition, setKosten, useKosten } from '../store';
import { GLIEDERUNG_KURZ, GLIEDERUNGSTIEFE, STUFEN, stufeLabel, stufeVon } from '../stufen';
import { useBauteile } from '../bauteile';
import { datumAnzeige as datum } from '../datum';
import { HilfeKnopf } from '@core/ui/Nachschlagewerk';
import { bestaetigen } from '@core/ui/Rueckfrage';
import { StammdatenKnopf } from '@core/ui/Stammdaten';

const zahl = (v: number, d = 2) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

/** neue Zeile in den Blick holen und das Feld für die Kostengruppe fokussieren */
function fokussieren(id: string) {
  setTimeout(() => {
    const el = document.querySelector<HTMLInputElement>(`tr[data-pos="${id}"] input[type="text"], tr[data-pos="${id}"] input:not([type])`);
    el?.scrollIntoView?.({ block: 'nearest' });
    el?.focus();
  }, 0);
}

/** Massen- und Kostenermittlung: Grundlagen und Mengen, Positionen nach DIN 276, Übersicht mit festgehaltenen Ständen */
export function KostenView({ onKatalog, onMenge }: { onKatalog: () => void; onMenge?: (b: MengenBezug) => void }) {
  const project = useKosten((s) => s.project);
  const waende = useBauteile((s) => s.waende);
  const e = useMemo(() => berechne(project, undefined, waende), [project, waende]);
  const k: Kosten = project.kosten ?? { positionen: [] };
  const st = useKosten.getState();
  const setK = (patch: Partial<Kosten>) => st.update((p) => setKosten(p, patch));
  const stufe = stufeVon(k.stufe);
  // eine Kostengruppe gilt als vorhanden, wenn sie selbst oder eine darunterliegende erfasst ist (330 deckt 331 ab);
  // übergeordnete (KG 300 neben 330) werden beim Anlegen der feineren Gliederung zum Ausschalten angeboten
  const fehlend = (art: 'grob' | 'fein') => gliederung(art).filter((g) => !k.positionen.some((p) => p.kg === g.kg || kgUnter(p.kg, g.kg)));
  const gliederungAnlegen = async (art: 'grob' | 'fein') => {
    const fehlende = fehlend(art);
    const ueber = k.positionen.filter((p) => !p.aus && istKg(p.kg) && fehlende.some((g) => kgUnter(g.kg, p.kg)));
    if (ueber.length) {
      const liste = [...new Set(ueber.map((p) => p.kg))].join(', ');
      const ok = await bestaetigen(
        `KG ${liste} ausschalten?`,
        `Die neue Gliederung erfasst dieselben Kosten feiner. KG ${liste} ${ueber.length > 1 && liste.includes(',') ? 'werden' : 'wird'} ausgeschaltet, damit nichts doppelt zählt; die Kennwerte bleiben als Alternative sichtbar.`,
        'Ausschalten und anlegen',
      );
      if (!ok) return;
    }
    const ids = new Set(ueber.map((p) => p.id));
    st.update((p) => addPositionen(setKosten(p, { positionen: (p.kosten?.positionen ?? []).map((x) => (ids.has(x.id) ? { ...x, aus: true } : x)) }), fehlende));
  };
  const neu = (pos: KostenPosition) => {
    st.update((p) => addPositionen(p, [pos]));
    fokussieren(pos.id);
  };
  // Menü „Hinzufügen“: seltene Varianten neben dem Knopf „Position“ (docs/design.md, „Kopf- und Werkzeugleisten“)
  const hinzufuegenPunkte = (): MenuePunkt[] => {
    const grob = fehlend('grob').length > 0;
    const fein = fehlend('fein');
    return [
      {
        text: 'Kostenrisiko',
        symbol: 'plus',
        aktion: () => neu(neueRisikoPosition()),
        titel: 'Nach DIN 276 gesondert ausgewiesen, pauschal oder in % von Kostengruppen; zählt zu keiner Kostengruppe',
      },
      { trenner: true },
      {
        text: 'Gliederung 1. Ebene',
        aktion: () => void gliederungAnlegen('grob'),
        deaktiviert: !grob,
        hinweis: grob ? undefined : 'schon erfasst',
        titel: 'Fehlende Positionen der 1. Ebene (KG 300, 400, 500, 700) mit üblicher Bezugsgröße anlegen',
      },
      {
        text: 'Gliederung 2. Ebene',
        aktion: () => void gliederungAnlegen('fein'),
        deaktiviert: !fein.length,
        hinweis: fein.length ? undefined : 'schon erfasst',
        titel: `Fehlende Positionen der 2. Ebene mit Bauteilmengen anlegen (KG ${gliederung('fein')
          .map((p) => p.kg)
          .join(', ')}); erfasste Gruppen der 1. Ebene werden zum Ausschalten angeboten`,
      },
    ];
  };

  return (
    <div className="ko-view">
      <div className="ko-links">
        <section className="ko-col">
          <h2>
            Grundlagen
            <HilfeKnopf thema={['kosten', 'kennwerte']} titel="Kostenermittlung" />
          </h2>
          <Field label="Projekt">
            <TextField value={project.name} onChange={(v) => st.update((p) => (v.trim() && v.trim() !== p.name ? { ...p, name: v.trim() } : p))} />
          </Field>
          <StammdatenKnopf project={project} onAendern={(meta, name) => st.update((p) => ({ ...p, meta, name }))} />
          <Field label="Stufe">
            <select value={stufe} onChange={(ev) => setK({ stufe: ev.target.value as KostenStufe })}>
              {STUFEN.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} ({s.lph})
                </option>
              ))}
            </select>
          </Field>
          <p className="muted small-text ko-hint" title={`${GLIEDERUNGSTIEFE[stufe]} – maßgeblich ist die im Vertrag vereinbarte Fassung.`}>
            Gliederung: {GLIEDERUNG_KURZ[stufe]}
          </p>
          <Field label="Kostenstand (Preisstand)">
            <input type="date" value={k.datum ?? ''} onChange={(ev) => setK({ datum: ev.target.value || undefined })} />
          </Field>
          <div className="field-row">
            <Field label="Index Kennwerte">
              <NumberField value={k.indexBasis} allowEmpty min={0} digits={1} label="Baupreisindex zum Stand der Kennwerte" onChange={(v) => setK({ indexBasis: v })} />
            </Field>
            <Field label="Index aktuell">
              <NumberField value={k.indexAktuell} allowEmpty min={0} digits={1} label="Baupreisindex aktuell" onChange={(v) => setK({ indexAktuell: v })} />
            </Field>
          </div>
          <p className="muted small-text ko-hint">
            Baupreisindex zum Stand der Kennwerte{k.katalog?.stand ? ` (${k.katalog.stand})` : ''} und aktuell; leer = keine Anpassung.
          </p>
          <div className="field-row">
            <Field label="Regionalfaktor">
              <NumberField value={k.regionalfaktor} allowEmpty min={0} digits={3} placeholder="1,000" onChange={(v) => setK({ regionalfaktor: v })} />
            </Field>
            <Field label="Umsatzsteuer [%]">
              <NumberField value={k.mwst} allowEmpty min={0} max={100} digits={0} placeholder="19" onChange={(v) => setK({ mwst: v })} />
            </Field>
          </div>
          <p className="muted small-text ko-hint">Regionalfaktor 1,000 = Bundesdurchschnitt; leer = 1,000 bzw. 19 %.</p>
          <label className="toggle block">
            <input type="checkbox" checked={!!k.kennwerteBrutto} onChange={(ev) => setK({ kennwerteBrutto: ev.target.checked || undefined })} />
            Kennwerte enthalten die Umsatzsteuer (brutto)
          </label>
          <p className="muted small-text">
            Faktor auf die Kennwerte: <strong>{e.faktor.toLocaleString('de-DE', { maximumFractionDigits: 4 })}</strong>
            {k.katalog && (
              <>
                <br />
                Kennwerte: {k.katalog.name}
                {k.katalog.quelle ? ` (${k.katalog.quelle})` : ''}
                {k.katalog.stand ? `, Stand ${k.katalog.stand}` : ''}
              </>
            )}
          </p>
        </section>

        <section className="ko-col">
          <h2>
            Mengen
            <HilfeKnopf thema={['bri', 'bgf', 'sohle', 'wofl']} titel="Mengen" />
          </h2>
          <table className="ko-table ko-mengen">
            <tbody>
              {MENGEN_BEZUEGE.map((b) => (
                <MengeZeile key={b} b={b} e={e} onMenge={onMenge} />
              ))}
            </tbody>
          </table>
          <p className="muted small-text">
            Abgeleitet aus dem Projekt; ein eingetragener Wert gilt stattdessen (Zurücksetzen mit dem Pfeil daneben).
            {onMenge && ' Klick auf das Kürzel: Herkunft im Grundriss und 3D-Modell.'}
          </p>
        </section>
      </div>

      <div className="ko-rechts">
        <section className="ko-col ko-positionen">
          <h2>
            Positionen
            <HilfeKnopf thema={['din276', 'kennwerte']} titel="Kostengruppen" />
          </h2>
          <div className="button-row">
            <button className="small" title="Position hinzufügen – leere Zeile, Kostengruppe eintragen" onClick={() => neu(neuePosition(''))}>
              <Symbol name="plus" /> Position
            </button>
            <MenueKnopf className="small" punkte={hinzufuegenPunkte} title="Weitere Einträge: Kostenrisiko, Gliederung 1. oder 2. Ebene">
              Hinzufügen
            </MenueKnopf>
            <button className="small" onClick={onKatalog} title="Kennwerte aus dem Kennwertkatalog als Positionen übernehmen">
              Kennwertkatalog …
            </button>
          </div>
          {!k.positionen.length ? (
            <p className="muted small-text">
              Noch keine Positionen. Für die {stufeLabel(stufe)} passt die Gliederung {gliederungFuer(stufe) === 'grob' ? '1. Ebene (Kennwerte je m² BGF)' : '2. Ebene (Kennwerte je Bauteilmenge)'};
              die Kennwerte werden eingetragen oder aus dem Kennwertkatalog übernommen.
            </p>
          ) : (
            <div className="tbl-wrap">
              <table className="ko-table ko-pos">
                <thead>
                  <tr>
                    <th>
                      <span className="ko-sr">Rechnen</span>
                    </th>
                    <th>KG</th>
                    <th>Bezeichnung</th>
                    <th>Bezug</th>
                    <th className="num">Menge</th>
                    <th className="num">von</th>
                    <th className="num">Mittel</th>
                    <th className="num">bis</th>
                    <th className="num">Kosten (Mittel)</th>
                    <th>
                      <span className="ko-sr">Löschen</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {KG_ERSTE_EBENE.filter((g) => e.positionen.some((x) => kg1(x.pos.kg) === g)).map((g) => (
                    <Gruppe key={g} kg={g} titel={kgName(g)} summe={e.summen.find((s) => s.kg === g)?.summe[1]} e={e} zeilen={e.positionen.filter((x) => kg1(x.pos.kg) === g)} />
                  ))}
                  {e.positionen.some((x) => istRisiko(x.pos.kg)) && (
                    <Gruppe kg="" titel="Kostenrisiken" summe={e.risiko[1]} e={e} zeilen={e.positionen.filter((x) => istRisiko(x.pos.kg))} />
                  )}
                  {e.positionen.some((x) => !istKg(x.pos.kg) && !istRisiko(x.pos.kg)) && (
                    <Gruppe kg="" titel="Ohne gültige Kostengruppe – wird nicht gerechnet" e={e} zeilen={e.positionen.filter((x) => !istKg(x.pos.kg) && !istRisiko(x.pos.kg))} />
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted small-text">
            Kennwerte je Einheit, netto{k.kennwerteBrutto ? ' (eingetragen brutto, gerechnet netto)' : ''}; bei % der Prozentsatz, bei psch der Betrag. Fehlt „von“ oder „bis“, gilt der
            Mittelwert. Der Faktor wirkt nicht auf Pauschalen und Prozentsätze.
          </p>
        </section>

        <section className="ko-col ko-uebersicht">
          <Uebersicht e={e} k={k} />
        </section>
      </div>
    </div>
  );
}

function neuePosition(kg: string): KostenPosition {
  const b = standardBezug(kg);
  return { id: newId('kp'), kg, bezeichnung: kgName(kg), bezug: b.bezug, ...(b.basis ? { basis: b.basis } : {}) };
}

function neueRisikoPosition(): KostenPosition {
  return { id: newId('kp'), kg: KG_RISIKO, bezeichnung: 'Kostenrisiken', bezug: 'prozent', basis: ['300', '400'] };
}

function MengeZeile({ b, e, onMenge }: { b: MengenBezug; e: Ergebnis; onMenge?: (b: MengenBezug) => void }) {
  const info = MENGEN_INFO[b];
  const m = e.mengen[b];
  const st = useKosten.getState();
  const wert = (v: number) => (b === 'we' ? String(v) : fmt2(v));
  const setMenge = (v: number | undefined) =>
    st.update((p) => {
      const mengen = { ...(p.kosten?.mengen ?? {}) };
      if (v === undefined) delete mengen[b];
      else mengen[b] = v;
      return setKosten(p, { mengen: Object.keys(mengen).length ? mengen : undefined });
    });
  return (
    <tr className={m.festgelegt ? 'festgelegt' : ''}>
      <td title={`${info.label}: ${info.ermittlung}`}>
        {onMenge ? (
          <button className="link" onClick={() => onMenge(b)} title={`${info.label} prüfen: ${info.ermittlung}`}>
            <strong>{info.kurz}</strong>
          </button>
        ) : (
          <strong>{info.kurz}</strong>
        )}{' '}
        <span className="muted small-text">{info.label}</span>
        {m.festgelegt && <div className="ko-fest small-text">von Hand · abgeleitet {wert(m.abgeleitet)}</div>}
      </td>
      <td className="num ko-menge">
        <NumberField
          value={m.festgelegt ? m.wert : undefined}
          allowEmpty
          min={0}
          digits={b === 'we' ? 0 : 2}
          placeholder={wert(m.abgeleitet)}
          label={`${info.label} (leer = abgeleitet ${wert(m.abgeleitet)})`}
          onChange={setMenge}
        />
      </td>
      <td className="muted small-text ko-einheit">
        {info.einheit}
        {m.festgelegt && (
          <button className="small icon ko-zurueck" aria-label={`${info.kurz} auf den abgeleiteten Wert zurücksetzen`} title={`Zurücksetzen auf abgeleitet: ${wert(m.abgeleitet)} ${info.einheit}`} onClick={() => setMenge(undefined)}>
            <Symbol name="rueckgaengig" />
          </button>
        )}
      </td>
    </tr>
  );
}

function Gruppe({ kg, titel, summe, e, zeilen }: { kg: string; titel: string; summe?: number; e: Ergebnis; zeilen: PositionErgebnis[] }) {
  return (
    <>
      <tr className="ko-gruppe">
        <td />
        <td>{kg}</td>
        <td colSpan={6}>{titel}</td>
        <td className="num">{summe !== undefined ? euro(summe) : ''}</td>
        <td />
      </tr>
      {zeilen.map((x) => (
        <PositionZeile key={x.pos.id} x={x} e={e} />
      ))}
    </>
  );
}

const BEZUG_OPTIONEN: { id: KostenBezug; label: string }[] = [
  ...MENGEN_BEZUEGE.map((b) => ({ id: b as KostenBezug, label: `${MENGEN_INFO[b].einheit} ${MENGEN_INFO[b].kurz}` })),
  { id: 'menge', label: 'eigene Menge' },
  { id: 'pauschal', label: 'pauschal' },
  { id: 'prozent', label: '% von KG' },
];

/** Probleme, die die Zeile selbst betreffen: ungültige Kostengruppe, Doppelerfassung mit einer über- bzw. untergeordneten */
function zeilenProblem(x: PositionErgebnis, e: Ergebnis): string | undefined {
  const kg = x.pos.kg;
  if (istRisiko(kg)) return undefined;
  if (!kg.trim()) return 'Kostengruppe eintragen (dreistellig, z. B. 331)';
  if (!istKg(kg)) return 'Wird nicht gerechnet';
  if (!x.aktiv) return undefined;
  const andere = e.positionen.filter((y) => y.aktiv && y !== x && istKg(y.pos.kg) && (kgUnter(kg, y.pos.kg) || kgUnter(y.pos.kg, kg))).map((y) => y.pos.kg);
  return andere.length ? `Doppelt erfasst mit KG ${[...new Set(andere)].join(', ')} – eine Position ausschalten` : undefined;
}

function PositionZeile({ x, e }: { x: PositionErgebnis; e: Ergebnis }) {
  const st = useKosten.getState();
  const p = x.pos;
  const risiko = istRisiko(p.kg);
  const name = risiko ? 'Kostenrisiko' : `KG ${p.kg || 'neu'}`;
  const upd = (patch: Partial<KostenPosition>) => st.update((pr) => mapPosition(pr, p.id, (q) => ({ ...q, ...patch })));
  const setKg = (kg: string) => {
    const neu = kg.trim();
    const patch: Partial<KostenPosition> = { kg: neu };
    // Bezeichnung und Bezug mitführen, solange sie noch der alten Kostengruppe entsprechen
    if (!p.bezeichnung || p.bezeichnung === kgName(p.kg)) patch.bezeichnung = kgName(neu) || p.bezeichnung;
    if (p.von === undefined && p.mittel === undefined && p.bis === undefined) {
      const b = standardBezug(neu);
      patch.bezug = b.bezug;
      patch.basis = b.basis;
    }
    upd(patch);
  };
  const problem = zeilenProblem(x, e);
  const hinweis = x.aktiv ? x.hinweis : undefined;
  return (
    <tr data-pos={p.id} className={`${p.aus ? 'aus' : ''}${(hinweis || problem) && !p.aus ? ' warn' : ''}`}>
      <td>
        <input type="checkbox" checked={!p.aus} aria-label={`${name} rechnen`} title="Position rechnen (ausgeschaltet bleibt sie sichtbar, z. B. als Alternative)" onChange={(ev) => upd({ aus: ev.target.checked ? undefined : true })} />
      </td>
      <td className="ko-kg">
        {risiko ? (
          <span className="muted" title="Kostenrisiko – zählt zu keiner Kostengruppe">
            —
          </span>
        ) : (
          <TextField value={p.kg} label="Kostengruppe" zeigen pruefen={(v) => (!v.trim() || istKg(v.trim()) ? null : 'dreistellig, 100–899')} onChange={setKg} />
        )}
      </td>
      <td>
        <TextField value={p.bezeichnung} label={`Bezeichnung, ${name}`} onChange={(v) => upd({ bezeichnung: v })} />
        {p.quelle && <div className="muted small-text">{p.quelle}</div>}
        {problem && <div className="warning small-text">{problem}</div>}
      </td>
      <td>
        <select
          value={p.bezug}
          aria-label={`Bezug, ${name}`}
          onChange={(ev) => upd({ bezug: ev.target.value as KostenBezug, ...(ev.target.value === 'prozent' && !p.basis ? { basis: ['300', '400'] } : {}) })}
        >
          {BEZUG_OPTIONEN.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        {p.bezug === 'prozent' && (
          <div className="ko-basis" title="Kostengruppen, auf deren Summe sich der Prozentsatz bezieht, z. B. „300 + 400“">
            von KG <TextField value={(p.basis ?? []).join(' + ')} label={`Grundlage in Kostengruppen, ${name}`} onChange={(v) => upd({ basis: v.split(/[\s,+;]+/).filter(Boolean) })} />
          </div>
        )}
        {p.bezug === 'menge' && (
          <div className="ko-basis">
            Einheit <TextField value={p.einheit ?? ''} placeholder="Stk" label={`Einheit, ${name}`} onChange={(v) => upd({ einheit: v || undefined })} />
          </div>
        )}
      </td>
      <td className="num">
        {p.bezug === 'menge' ? (
          <NumberField value={p.menge} allowEmpty min={0} label={`Menge, ${name}`} onChange={(v) => upd({ menge: v })} />
        ) : p.bezug === 'pauschal' ? (
          '1 psch'
        ) : p.bezug === 'prozent' ? (
          <span title="Grundlage (Mittel)">{euro(x.menge)}</span>
        ) : (
          `${fmt2(x.menge)} ${x.einheit}`
        )}
      </td>
      {(['von', 'mittel', 'bis'] as const).map((f) => (
        <td key={f} className="num ko-kw">
          <NumberField value={p[f]} allowEmpty min={0} label={`${f === 'mittel' ? 'Mittel' : f}, ${name}`} onChange={(v) => upd({ [f]: v })} />
        </td>
      ))}
      <td className="num">
        {x.aktiv ? <strong>{euro(x.kosten[1])}</strong> : <span className="muted ko-nicht-gerechnet" title="wird nicht gerechnet">{euro(x.kosten[1])}</span>}
        {x.kosten[0] !== x.kosten[2] && <div className="muted small-text">{euroSpanne(x.kosten)}</div>}
        {hinweis && <div className="warning small-text">{hinweis}</div>}
      </td>
      <td>
        <button className="small danger ko-loeschen" aria-label={`${name} löschen`} title="Position löschen (Strg+Z stellt sie wieder her)" onClick={() => st.update((pr) => removePosition(pr, p.id))}>
          <Symbol name="muell" />
        </button>
      </td>
    </tr>
  );
}

function Uebersicht({ e, k }: { e: Ergebnis; k: Kosten }) {
  const st = useKosten.getState();
  const laedt = useBauteile((s) => s.status === 'laedt');
  const [bemerkung, setBemerkung] = useState('');
  const staende = k.staende ?? [];
  const [vergleichId, setVergleichId] = useState<string | null>(null);
  const vergleich = staende.find((s) => s.id === vergleichId) ?? staende[staende.length - 1];
  const v = vergleich ? vergleiche(vergleich, e) : null;
  const festhalten = () => {
    if (laedt) return;
    const s = standAus(e, stufeVon(k.stufe), bemerkung.trim());
    st.update((p) => setKosten(p, { staende: [...(p.kosten?.staende ?? []), s] }));
    setBemerkung('');
    setVergleichId(s.id);
  };
  const risiko = e.risiko[0] !== 0 || e.risiko[1] !== 0 || e.risiko[2] !== 0;

  return (
    <>
      <h2>{stufeLabel(k.stufe)}</h2>
      <table className="ko-table ko-summen">
        <thead>
          <tr>
            <th colSpan={2}>Kostengruppe</th>
            <th className="num">von</th>
            <th className="num">Mittel</th>
            <th className="num">bis</th>
          </tr>
        </thead>
        <tbody>
          {e.summen.map((s) => (
            <tr key={s.kg} className={s.ebene === 1 ? 'ko-kg1' : 'ko-kg2'}>
              <td className="ko-kgnr">{s.kg}</td>
              <td className="ko-kgname">{s.name}</td>
              <td className="num">{euro(s.summe[0])}</td>
              <td className="num">{euro(s.summe[1])}</td>
              <td className="num">{euro(s.summe[2])}</td>
            </tr>
          ))}
          {risiko && (
            <tr className="ko-kg1">
              <td colSpan={2}>Kostenrisiken</td>
              <td className="num">{euro(e.risiko[0])}</td>
              <td className="num">{euro(e.risiko[1])}</td>
              <td className="num">{euro(e.risiko[2])}</td>
            </tr>
          )}
          <tr className="sum">
            <td colSpan={2}>Gesamt netto</td>
            <td className="num">{euro(e.gesamtNetto[0])}</td>
            <td className="num">{euro(e.gesamtNetto[1])}</td>
            <td className="num">{euro(e.gesamtNetto[2])}</td>
          </tr>
          <tr>
            <td colSpan={2}>+ {e.mwst} % USt.</td>
            <td className="num">{euro(e.gesamtBrutto[0] - e.gesamtNetto[0])}</td>
            <td className="num">{euro(e.gesamtBrutto[1] - e.gesamtNetto[1])}</td>
            <td className="num">{euro(e.gesamtBrutto[2] - e.gesamtNetto[2])}</td>
          </tr>
          <tr className="sum">
            <td colSpan={2}>Gesamt brutto</td>
            <td className="num">{euro(e.gesamtBrutto[0])}</td>
            <td className="num">{euro(e.gesamtBrutto[1])}</td>
            <td className="num">{euro(e.gesamtBrutto[2])}</td>
          </tr>
        </tbody>
      </table>

      {e.kennwerte.length > 0 && (
        <>
          <h3>Kennwerte Bauwerk (KG 300 + 400, brutto)</h3>
          <table className="ko-table">
            <tbody>
              {e.kennwerte.map((kw) => (
                <tr key={kw.kurz}>
                  <td>
                    € / {kw.einheit} {kw.kurz}
                  </td>
                  <td className="num">
                    <strong>{zahl(kw.wert[1], 0)}</strong>
                    {Math.round(kw.wert[0]) !== Math.round(kw.wert[2]) && (
                      <span className="muted small-text">
                        {' '}
                        ({zahl(kw.wert[0], 0)} – {zahl(kw.wert[2], 0)})
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {e.hinweise.length > 0 && (
        <>
          <h3>Hinweise</h3>
          <ul className="ko-hinweise">
            {e.hinweise.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </>
      )}

      <h3>Festgehaltene Stände</h3>
      <div className="ko-stand-neu">
        <input
          value={bemerkung}
          aria-label="Bemerkung zum festgehaltenen Stand"
          placeholder="Bemerkung, z. B. „Entwurf Variante A“"
          onChange={(ev) => setBemerkung(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter') {
              ev.preventDefault();
              festhalten();
            }
          }}
        />
        <button
          className="small"
          onClick={festhalten}
          disabled={laedt}
          title={laedt ? 'Die Wände des IFC-Modells werden noch gelesen …' : 'Aktuelle Kosten und Mengen festhalten – für Historie und Vorher/Nachher (Enter im Feld)'}
        >
          Stand festhalten
        </button>
      </div>
      {staende.length > 0 && (
        <table className="ko-table">
          <thead>
            <tr>
              <th>Stand</th>
              <th className="num">Gesamt brutto</th>
              <th>
                <span className="ko-sr">Löschen</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {[...staende].reverse().map((s) => (
              <tr key={s.id} className={s.id === vergleich?.id ? 'selected' : ''}>
                <td>
                  <button className="link" onClick={() => setVergleichId(s.id)} title="Mit diesem Stand vergleichen" aria-pressed={s.id === vergleich?.id}>
                    {datum(s.datum)} · {stufeLabel(s.stufe)}
                  </button>
                  {s.bemerkung && <div className="muted small-text">{s.bemerkung}</div>}
                </td>
                <td className="num">{euro(s.gesamtBrutto[1])}</td>
                <td>
                  <button
                    className="small danger ko-loeschen"
                    aria-label={`Stand vom ${datum(s.datum)} löschen`}
                    title="Stand löschen (Strg+Z stellt ihn wieder her)"
                    onClick={() => st.update((p) => setKosten(p, { staende: (p.kosten?.staende ?? []).filter((x) => x.id !== s.id) }))}
                  >
                    <Symbol name="muell" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {v && vergleich && (
        <>
          <h3>Vorher/Nachher gegenüber {datum(vergleich.datum)} (Mittel, netto)</h3>
          <table className="ko-table ko-summen">
            <thead>
              <tr>
                <th colSpan={2}>Kostengruppe</th>
                <th className="num">vorher</th>
                <th className="num">jetzt</th>
                <th className="num">Differenz</th>
              </tr>
            </thead>
            <tbody>
              {[...v.zeilen, v.gesamt].map((z) => (
                <tr key={z.kg || 'gesamt'} className={z.kg ? '' : 'sum'}>
                  {z.kg && !istRisiko(z.kg) ? (
                    <>
                      <td className="ko-kgnr">{z.kg}</td>
                      <td className="ko-kgname">{z.name}</td>
                    </>
                  ) : (
                    <td colSpan={2}>{z.name}</td>
                  )}
                  <td className="num">{euro(z.vorher)}</td>
                  <td className="num">{euro(z.jetzt)}</td>
                  <td className={`num ${z.differenz > 0.5 ? 'mehr' : z.differenz < -0.5 ? 'weniger' : ''}`}>
                    {z.differenz > 0.5 ? '+' : ''}
                    {euro(z.differenz)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {v.mengen.length > 0 && (
            <p className="small-text">
              Geänderte Mengen:{' '}
              {v.mengen.map((mm) => `${MENGEN_INFO[mm.bezug].kurz} ${fmt2(mm.vorher)} → ${fmt2(mm.jetzt)} ${MENGEN_INFO[mm.bezug].einheit}`).join(' · ')}
            </p>
          )}
        </>
      )}
      <p className="muted small-text">Die Kennwerte sind Eingaben des Büros; NUMIO rechnet transparent damit und liefert keine Preise.</p>
    </>
  );
}
