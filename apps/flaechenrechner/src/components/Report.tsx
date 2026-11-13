import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { AreaTotals } from '@core/calc';
import { computeProject } from '@core/calc';
import { briKoerper, briRechenweg } from '@core/rechenweg';
import { fmt2 } from '@core/format';
import { NUF_IDS, nutzungInfo, WOFL_KATEGORIEN, ZWEITE_BV_KURZ, ZWEITE_BV_TEXT } from '@core/norms';
import { polygonArea } from '@core/geometry';
import { druckenAls } from '@core/platform/projektDatei';
import { useEditor } from '../store/store';
import { PlanFigure } from './PlanFigure';
import { raumRechenweg, rechenwegText } from '../core/raumRechenweg';
import { gueltigesKontrollmass, kontrollText } from '../core/background';
import { useEscSchliessen } from '@core/ui/Dialog';
import { DruckKopf } from '@core/ui/DruckKopf';
import type { Abschnitt, BerichtEinstellung, BerichtVorlage } from '../core/bericht';
import { ABSCHNITTE, berichtEinstellung, berichtPlan, messverfahren, planungsunterlagen, statistik, STATISTIK_MIN_RAUM, VORLAGEN } from '../core/bericht';

/** Druckbare Flächenaufstellung (DIN 277 / WoFlV). */
export function Report() {
  const project = useEditor((s) => s.project);
  const setOpen = useEditor((s) => s.setReportOpen);
  // Esc schließt zuerst einen offenen Ausklapper der Bedienleiste, dann den Bericht
  useEscSchliessen(() => {
    const offen = [...(berichtRef.current?.querySelectorAll<HTMLDetailsElement>('details.bericht-ausklapper[open]') ?? [])];
    if (offen.length) offen.forEach((d) => (d.open = false));
    else setOpen(false);
  });
  // Bildschirmansicht als Dialog: Fokus beim Öffnen auf „Schließen“, beim Schließen zurück; Tab bleibt im Bericht
  const berichtRef = useRef<HTMLDivElement>(null);
  const schliessenRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const vorher = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    schliessenRef.current?.focus();
    return () => {
      if (vorher?.isConnected) vorher.focus();
    };
  }, []);
  // Ausklapper der Bedienleiste (Abschnitte, Anzeige) schließen bei Klick daneben
  useEffect(() => {
    const zu = (e: Event) => {
      for (const d of berichtRef.current?.querySelectorAll<HTMLDetailsElement>('details.bericht-ausklapper[open]') ?? []) if (!d.contains(e.target as Node)) d.open = false;
    };
    document.addEventListener('pointerdown', zu);
    return () => document.removeEventListener('pointerdown', zu);
  }, []);
  const r = useMemo(() => computeProject(project), [project]);
  const rechenweg = useMemo(() => briRechenweg(project), [project]);
  const fussnoten = useMemo(() => briKoerper(project).filter((k) => k.bemerkung), [project]);
  // Putzabzug sichtbar machen (FR-05): Rohfläche und Abzug je Raum, nur wenn ein Raum einen Abzug hat
  const raumById = useMemo(() => new Map(project.storeys.flatMap((s) => s.shapes.flatMap((x) => (x.kind === 'room' ? [[x.id, x] as const] : [])))), [project]);
  const mitPutz = [...raumById.values()].some((x) => (x.putzabzug ?? 0) > 0);
  // Messverfahren und Planungsunterlagen (DIN 277:2021-08, 5.1)
  const massText = messverfahren(project) || undefined;
  const unterlagen = planungsunterlagen(project);
  // Maßgrundlage aus dem Plan (F-16): Kontrollmaß je kalibriertem Geschoss
  const kontrollZeilen = project.storeys.flatMap((s) => {
    const k = gueltigesKontrollmass(project, s);
    return k ? [`${s.name}: ${kontrollText(k)}`] : [];
  });
  // Anzeige (Grundrisse, Hintergrundplan, Rechenweg) – Vorliebe des Nutzers, in diesem Browser bzw. Rechner gemerkt
  const [anzeige, setAnzeigeState] = useState<BerichtAnzeige>(anzeigeLaden);
  const setAnzeige = (a: BerichtAnzeige) => {
    setAnzeigeState(a);
    anzeigeMerken(a);
  };
  const showPlans = anzeige.plaene;
  const showBackground = anzeige.hintergrund;
  const showRechenweg = anzeige.rechenweg;
  // Vorlage und Abschnitte (F-17) – im Projekt gemerkt
  const einstellung = berichtEinstellung(project.settings.bericht);
  const plan = berichtPlan(einstellung, r, project);
  const zeigt = (a: Abschnitt) => plan.abschnitte.includes(a);
  // gewählt, aber ohne Inhalt (z. B. Wohnflächen ohne Wohnfläche) – steht im Ausklapper statt still zu fehlen
  const gewaehlt = ABSCHNITTE.filter((a) => plan.gesperrt.includes(a.id) || einstellung.abschnitte.includes(a.id)).map((a) => a.id);
  const entfallen = gewaehlt.filter((a) => !zeigt(a));
  const setEinstellung = (e: BerichtEinstellung) => useEditor.getState().update((p) => ({ ...p, settings: { ...p.settings, bericht: e } }));
  const stat = useMemo(() => statistik(r), [r]);
  // Nutzungsgruppen-Tabelle nur mit Spalten, die Fläche haben (sonst überwiegend Nullen); mindestens NUF 1
  const nutzSpalten = useMemo(() => {
    const mit = NUTZ_ALLE.filter((id) => Math.abs(r.total.nutzung[id]) >= 0.005);
    return mit.length ? mit : [NUTZ_ALLE[0]];
  }, [r]);
  const S = plan.sSpalten;

  // R/S getrennt (FR-09): BGF, BRI, NRF, KGF je Regelfall und Sonderfall; reine R-Projekte ohne S-Spalten
  const rs = (v: { R: number; S: number; total: number }, stark = false) =>
    S
      ? [
          <td key="r" className="num">
            {fmt2(v.R)}
          </td>,
          <td key="s" className="num">
            {fmt2(v.S)}
          </td>,
          <td key="t" className={`num${stark ? ' strong' : ''}`}>
            {fmt2(v.total)}
          </td>,
        ]
      : [
          <td key="t" className={`num${stark ? ' strong' : ''}`}>
            {fmt2(v.total)}
          </td>,
        ];
  const rsKopf = (k: string, e: string) => S
      ? [
          <th key="r" className="num">
            {k} R [{e}]
          </th>,
          <th key="s" className="num">
            {k} S [{e}]
          </th>,
          <th key="t" className="num">
            {k} [{e}]
          </th>,
        ]
      : [
          <th key="t" className="num">
            {k} [{e}]
          </th>,
        ];
  const din277Row = (name: string, h: number | null, t: AreaTotals, cls = '') => (
    <tr className={cls} key={name}>
      <td>{name}</td>
      <td className="num">{h === null ? '' : fmt2(h)}</td>
      {rs(t.bgf, true)}
      {rs(t.bri)}
      <td className="num">{fmt2(t.nuf.total)}</td>
      <td className="num">{fmt2(t.tf.total)}</td>
      <td className="num">{fmt2(t.vf.total)}</td>
      {rs(t.nrf, true)}
      {rs(t.kgf)}
    </tr>
  );

  return (
    <div className="report-backdrop">
      <div className="report" ref={berichtRef} role="dialog" aria-modal="true" aria-label="Flächenaufstellung" onKeyDown={(e) => fokusImBericht(e, berichtRef.current)}>
        <div className="report-actions no-print">
          <label className="toggle">
            Umfang
            <select value={einstellung.vorlage} onChange={(e) => setEinstellung({ ...einstellung, vorlage: e.target.value as BerichtVorlage })}>
              {VORLAGEN.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          {einstellung.vorlage !== 'vollstaendig' && (
            <details className="bericht-ausklapper">
              <summary>
                Abschnitte ({gewaehlt.length} von {ABSCHNITTE.length}){entfallen.length ? ` · ${entfallen.length} entfällt` : ''}
              </summary>
              <div className="bericht-ausklapper-inhalt">
                {ABSCHNITTE.map((a) => {
                  const gesperrt = plan.gesperrt.includes(a.id);
                  return (
                    <label key={a.id} className="toggle block" title={gesperrt ? '§ 6 Nr. 1 BauPrüfVO NRW, Gebührentarif NRW Tarifstelle 3.1.1.2' : undefined}>
                      <input
                        type="checkbox"
                        checked={gesperrt || einstellung.abschnitte.includes(a.id)}
                        disabled={gesperrt}
                        onChange={(e) => setEinstellung({ ...einstellung, abschnitte: e.target.checked ? [...einstellung.abschnitte, a.id] : einstellung.abschnitte.filter((x) => x !== a.id) })}
                      />
                      <span>
                        {a.label}
                        {gesperrt && <span className="muted"> (im Bauantrag immer enthalten)</span>}
                        {entfallen.includes(a.id) && <span className="muted"> (entfällt – {a.id === 'wofl' ? 'keine Wohnfläche erfasst' : 'keine Räume erfasst'})</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </details>
          )}
          <details className="bericht-ausklapper">
            <summary>Anzeige</summary>
            <div className="bericht-ausklapper-inhalt">
              <label className="toggle block">
                <input type="checkbox" checked={anzeige.plaene} onChange={(e) => setAnzeige({ ...anzeige, plaene: e.target.checked })} />
                Grundrisse
              </label>
              <label className="toggle block indent">
                <input type="checkbox" checked={anzeige.hintergrund} disabled={!anzeige.plaene} onChange={(e) => setAnzeige({ ...anzeige, hintergrund: e.target.checked })} />
                mit Hintergrundplan
              </label>
              <label className="toggle block">
                <input type="checkbox" checked={anzeige.rechenweg} onChange={(e) => setAnzeige({ ...anzeige, rechenweg: e.target.checked })} />
                Rechenweg je Raum (Maße, Putzabzug, Abzugsflächen, Anrechnung)
              </label>
              <p className="muted small-text">Wird auf diesem Rechner gemerkt.</p>
            </div>
          </details>
          <span className="bericht-knoepfe">
            <button ref={schliessenRef} onClick={() => setOpen(false)}>
              Schließen
            </button>
            <button className="primary" onClick={() => druckenAls({ datei: useEditor.getState().datei, projektName: project.name, zusatz: 'WoFl+BGF+BRI' })}>
              Drucken / PDF
            </button>
          </span>
        </div>

        <DruckKopf
          titel={einstellung.vorlage === 'bauantrag' ? 'Berechnung des Brutto-Rauminhalts und der Flächen' : 'Flächenaufstellung'}
          project={project}
          zusatz={
            <p className="druck-kopf-normen">
              Grundflächen und Rauminhalte nach DIN 277:2021-08 (Gebührentarif NRW, Tarifstelle 3.1.1.2; § 6 Nr. 1 BauPrüfVO NRW nennt DIN 277-1:2016-01)
              {zeigt('wofl') ? (project.settings.zweiteBV ? ` · Wohnfläche: ${ZWEITE_BV_KURZ}` : ' · Wohnfläche nach WoFlV vom 25.11.2003') : ''}
              <br />
              Messverfahren: {massText ?? 'nicht angegeben'}
              {mitPutz ? ' · Putzabzug je Raum' : ''}
              <br />
              Planungsunterlagen: {unterlagen || 'nicht angegeben'}
              {kontrollZeilen.map((z) => (
                <span key={z} className="druck-kopf-kontrolle">
                  <br />
                  {z}
                </span>
              ))}
            </p>
          }
        />
        {/* fachliche Mängel auch im Druck; fehlende Angaben mit Bedienhinweis nur am Bildschirm */}
        {plan.warnungen.map((w) => (
          <p key={w} className="warning">
            {w}
          </p>
        ))}
        {plan.bildschirm.map((w) => (
          <p key={w} className="warning no-print">
            {w}
          </p>
        ))}

        {zeigt('din277') && (
          <section className="bericht-abschnitt">
            <h2>Grundflächen und Rauminhalte nach DIN 277</h2>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Geschoss</th>
                  <th className="num">Höhe [m]</th>
                  {rsKopf('BGF', 'm²')}
                  {rsKopf('BRI', 'm³')}
                  <th className="num">NUF [m²]</th>
                  <th className="num">TF [m²]</th>
                  <th className="num">VF [m²]</th>
                  {rsKopf('NRF', 'm²')}
                  {rsKopf('KGF', 'm²')}
                </tr>
              </thead>
              <tbody>
                {r.storeys.map((s) => din277Row(s.name, s.hoehe, s))}
                {din277Row('Summe', null, r.total, 'sum')}
              </tbody>
            </table>
            <p className="report-note">
              {S
                ? 'R = Regelfall der Raumumschließung (bei allen Begrenzungsflächen vollständig umschlossen), S = Sonderfall (nicht allseitig umschlossen) – getrennt ermittelt nach DIN 277:2021-08. '
                : 'Alle Flächen und Rauminhalte im Regelfall R (bei allen Begrenzungsflächen vollständig umschlossen). '}
              KGF = BGF − NRF (rechnerisch). BRI nach DIN 277:2021-08 = Σ Umrissfläche × Geschosshöhe bzw. Volumen bis zur Dachhaut, ab Unterkante Bodenplatte
              einschließlich Dämmung darunter.
            </p>
          </section>
        )}

        {zeigt('bri') && (
          <section className="bericht-abschnitt">
        <h2>Brutto-Rauminhalt – Rechenweg</h2>
        <table className="report-table">
          <thead>
            <tr>
              <th>Geschoss</th>
              <th>Umriss</th>
              <th>Teilkörper</th>
              <th>Rechenweg [m]</th>
              <th className="num">Volumen [m³]</th>
            </tr>
          </thead>
          <tbody>
            {r.storeys.map((sr) => {
              const steps = rechenweg.filter((b) => b.geschossId === sr.storeyId);
              if (!steps.length) return null;
              return [
                ...steps.map((b, i) => (
                  <tr key={`${sr.storeyId}-${i}`}>
                    <td>{i === 0 ? sr.name : ''}</td>
                    <td>{b.umriss}</td>
                    <td>{b.bezeichnung}</td>
                    <td className="formula">{b.formel}</td>
                    <td className="num">{fmt2(b.volumen)}</td>
                  </tr>
                )),
                <tr key={`${sr.storeyId}-sum`} className="subtotal">
                  <td />
                  <td colSpan={3}>BRI {sr.name}</td>
                  <td className="num">{fmt2(sr.bri.total)}</td>
                </tr>,
              ];
            })}
            <tr className="sum">
              <td colSpan={4}>Brutto-Rauminhalt gesamt</td>
              <td className="num">{fmt2(r.total.bri.total)}</td>
            </tr>
          </tbody>
        </table>
        <p className="report-note">
          Teilkörper: Anzahl × Länge × Breite (bzw. Grundfläche) × Höhe × Formfaktor (½ Prisma/Keil, ⅓ Walmende/Pyramide, ⅙ Krüppelwalm-Abzug).
          „Mittlere Höhe“: Volumen exakt aus den Dachflächen bzw. dem IFC-Modell, als Grundfläche × mittlere Höhe dargestellt.
        </p>
        {fussnoten.map((k) => (
          <p key={`${k.umrissId}-${k.nr}`} className="report-note">
            {k.geschoss}, {k.umriss}, {k.bezeichnung}: {k.bemerkung}.
          </p>
        ))}
          </section>
        )}

        {zeigt('nutzung') && (
          <section className="bericht-abschnitt">
        <h2>Netto-Raumfläche nach Nutzungsgruppen</h2>
        <table className={nutzSpalten.length <= 4 ? 'report-table narrow' : 'report-table'}>
          <thead>
            <tr>
              <th>Geschoss</th>
              {nutzSpalten.map((id) => (
                <th key={id} className="num" title={id === 'TF' ? 'Technikfläche' : id === 'VF' ? 'Verkehrsfläche' : nutzungInfo(id).label}>
                  {nutzKurz(id)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...r.storeys, { name: 'Summe', ...r.total, storeyId: 'sum' }].map((s) => (
              <tr key={s.storeyId} className={s.storeyId === 'sum' ? 'sum' : ''}>
                <td>{s.name}</td>
                {nutzSpalten.map((id) => (
                  <td key={id} className="num">
                    {fmt2(s.nutzung[id])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {nutzSpalten.length < NUTZ_ALLE.length && (
          <p className="report-note">
            Nicht aufgeführt, weil ohne Fläche: {NUTZ_ALLE.filter((id) => !nutzSpalten.includes(id)).map(nutzKurz).join(', ')}.
          </p>
        )}
          </section>
        )}

        {zeigt('raeume') &&
          r.storeys.map((sr, idx) => {
          const storey = project.storeys[idx];
          return (
            <section key={sr.storeyId} className="report-storey bericht-abschnitt">
              <h2>
                {showPlans ? 'Grundriss und Raumliste' : 'Raumliste'} – {sr.name}
              </h2>
              <p className="report-keyfigures">
                BGF {fmt2(sr.bgf.total)} m² · BRI {fmt2(sr.bri.total)} m³ · NRF {fmt2(sr.nrf.total)} m² · KGF {fmt2(sr.kgf.total)} m²
                {sr.wofl ? ` · WoFl ${fmt2(sr.wofl)} m²` : ''}
              </p>
              {showPlans && <PlanFigure storey={storey} showBackground={showBackground} />}
              {sr.rooms.length > 0 ? (
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Nr.</th>
                      <th>Raum</th>
                      <th>Nutzung</th>
                      <th>R/S</th>
                      {mitPutz && <th className="num">Fläche roh [m²]</th>}
                      {mitPutz && <th className="num">Putzabzug</th>}
                      <th className="num">Fläche [m²]</th>
                      <th>WoFlV</th>
                      <th className="num">Faktor</th>
                      <th className="num">WoFl [m²]</th>
                      <th>Wohnung</th>
                    </tr>
                  </thead>
                  {sr.rooms.map((room) => (
                    <tbody key={room.shapeId} className="raum-zeilen">
                      <tr>
                        <td>{room.nummer}</td>
                        <td>
                          {room.name}
                          {room.subtract && <em>{room.abzugArt === 'wofl' ? ' (Abzug nur Wohnfläche)' : room.abzugArt === 'din' ? ' (Abzug nur NRF)' : ' (Abzug)'}</em>}
                          {room.ausserhalbBgf && <em> (außerhalb der BGF, nur Wohnfläche)</em>}
                        </td>
                        <td>{room.ausserhalbBgf ? '–' : nutzungInfo(room.nutzung).kurz}</td>
                        <td>{room.ausserhalbBgf ? '–' : room.umschliessung}</td>
                        {mitPutz && <td className="num">{fmt2(polygonArea(raumById.get(room.shapeId)?.points ?? []) * (room.subtract ? -1 : 1))}</td>}
                        {mitPutz && <td className="num">{raumById.get(room.shapeId)?.putzabzug ? `${fmt2(raumById.get(room.shapeId)!.putzabzug!)} %` : ''}</td>}
                        <td className="num">{fmt2(room.area)}</td>
                        <td>
                          {room.woflKategorie === 'keine'
                            ? '–'
                            : room.woflAnteile
                              ? `≥ 2 m ${fmt2(Math.abs(room.area) * room.woflAnteile.h2)} | 1–2 m ${fmt2(Math.abs(room.area) * room.woflAnteile.h12)} | < 1 m ${fmt2(Math.abs(room.area) * room.woflAnteile.h01)} m²`
                              : WOFL_KATEGORIEN.find((k) => k.id === room.woflKategorie)?.label}
                        </td>
                        <td className="num">{room.woflKategorie === 'keine' || room.woflAnteile ? '' : fmt2(room.woflFaktor)}</td>
                        <td className="num">{room.woflKategorie === 'keine' ? '' : fmt2(room.woflArea)}</td>
                        <td>{room.wohnung}</td>
                      </tr>
                      {
                      showRechenweg && !room.subtract && raumById.get(room.shapeId) ? (
                        <tr className="rechenweg">
                          <td />
                          <td colSpan={mitPutz ? 10 : 8} className="formula">
                            {rechenwegText(raumRechenweg(raumById.get(room.shapeId)!, storey, project))}
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  ))}
                  <tbody>
                    <tr className="sum">
                      <td />
                      <td>Summe {sr.name} (NRF bzw. Wohnfläche)</td>
                      <td />
                      <td />
                      {mitPutz && <td />}
                      {mitPutz && <td />}
                      <td className="num">{fmt2(sr.nrf.total)}</td>
                      <td />
                      <td />
                      <td className="num">{fmt2(sr.wofl)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              ) : (
                <p className="muted">Keine Räume erfasst.</p>
              )}
            </section>
          );
        })}

        {zeigt('wofl') && (
          <section className="bericht-abschnitt">
        <h2>{project.settings.zweiteBV ? 'Wohnflächen – Vergleichsrechnung (Freisitze zu ½)' : 'Wohnflächen nach WoFlV'}</h2>
        {project.settings.zweiteBV && <p className="warning">{ZWEITE_BV_TEXT}</p>}
        <table className="report-table narrow">
          <thead>
            <tr>
              <th>Wohnung</th>
              <th className="num">Räume</th>
              <th className="num">Grundfläche [m²]</th>
              <th className="num">Wohnfläche [m²]</th>
            </tr>
          </thead>
          <tbody>
            {r.wohnungen.map((w) => (
              <tr key={w.wohnung}>
                <td>{w.wohnung}</td>
                <td className="num">{w.rooms.length}</td>
                <td className="num">{fmt2(w.grundflaeche)}</td>
                <td className="num strong">{fmt2(w.wofl)}</td>
              </tr>
            ))}
            <tr className="sum">
              <td>Summe</td>
              <td />
              <td className="num">{fmt2(r.wohnungen.reduce((a, w) => a + w.grundflaeche, 0))}</td>
              <td className="num">{fmt2(r.total.wofl)}</td>
            </tr>
          </tbody>
        </table>
        <p className="report-note">
          Anrechnung nach § 4 WoFlV: Räume und Raumteile mit lichter Höhe ≥ 2 m voll, 1–2 m zur Hälfte, &lt; 1 m nicht; unbeheizbare Wintergärten,
          Schwimmbäder u. ä. zur Hälfte; Balkone, Loggien, Dachgärten und Terrassen{' '}
          {project.settings.zweiteBV ? 'in dieser Vergleichsrechnung zur Hälfte' : 'i. d. R. zu einem Viertel, höchstens zur Hälfte'}. Nach § 3 Abs. 3 WoFlV bleiben Schornsteine,
          Pfeiler und Säulen über 1,50 m Höhe und mehr als 0,1 m² Grundfläche sowie Treppen mit mehr als drei Steigungen samt Treppenabsätzen außer Betracht; sie
          sind als Abzugsflächen im Raum erfasst (Treppen nur von der Wohnfläche, sie bleiben in der NRF des Raums). Tür- sowie Fenster- und offene Wandnischen,
          die nicht bis zum Fußboden reichen oder höchstens 0,13 m tief sind, gehören nicht zur gemessenen Grundfläche. WoFlV-Einstufung nach Raumnamen
          vorgeschlagen, vom Verfasser geprüft.
          {r.storeys.some((s) => s.rooms.some((x) => x.woflAnteile)) &&
            ' Räume unter Dachschrägen mit Teilflächen nach lichter Höhe (≥ 2 m voll, 1–2 m zur Hälfte, < 1 m nicht); Höhenlinien aus Planmaßen bzw. dem IFC-Modell abgeleitet.'}
        </p>
          </section>
        )}

        {zeigt('statistik') && (
          <section className="bericht-abschnitt">
            <h2>Angaben für die Hochbaustatistik</h2>
            <table className="report-table narrow">
              <thead>
                <tr>
                  <th>Wohnung</th>
                  <th className="num">Räume</th>
                  <th className="num">Wohnfläche [m²]</th>
                </tr>
              </thead>
              <tbody>
                {stat.wohnungen.map((w) => (
                  <tr key={w.wohnung}>
                    <td>{w.wohnung}</td>
                    <td className="num">{w.raeume}</td>
                    <td className="num">{fmt2(w.wohnflaeche)}</td>
                  </tr>
                ))}
                <tr className="sum">
                  <td>{stat.wohnungen.length} Wohnung{stat.wohnungen.length === 1 ? '' : 'en'}</td>
                  <td className="num">{stat.wohnungen.reduce((a, w) => a + w.raeume, 0)}</td>
                  <td className="num">{fmt2(stat.wohnflaeche)}</td>
                </tr>
              </tbody>
            </table>
            <p className="report-keyfigures">
              Sonstige Nutzfläche (NUF ohne Wohnflächenräume) {fmt2(stat.sonstigeNutzflaeche)} m² · Brutto-Rauminhalt {fmt2(stat.bri)} m³
            </p>
            <p className="report-note">
              Räume: Wohn- und Aufenthaltsräume (NUF 1) ab {STATISTIK_MIN_RAUM} m², Küchen unabhängig von der Größe, ohne Freisitze. Zusammenstellung als Hilfe für den Erhebungsbogen der
              Bautätigkeitsstatistik (§ 3 HBauStatG) – die Zählregeln des aktuellen Erhebungsbogens von IT.NRW sind maßgebend.
            </p>
          </section>
        )}

        <section className="bericht-unterschrift">
          <div>
            <span className="unterschrift-linie" />
            Ort, Datum
          </div>
          <div>
            <span className="unterschrift-linie" />
            Aufgestellt (Unterschrift)
          </div>
          <div>
            <span className="unterschrift-linie" />
            Entwurfsverfasserin / Entwurfsverfasser (§ 54 BauO NRW 2018)
          </div>
        </section>
      </div>
    </div>
  );
}

/** Spalten der Nutzungsgruppen-Tabelle: NUF 1–7, TF 8, VF 9 */
const NUTZ_ALLE = [...NUF_IDS, 'TF', 'VF'] as const;
type NutzSpalte = (typeof NUTZ_ALLE)[number];
const nutzKurz = (id: NutzSpalte) => (id === 'TF' ? 'TF 8' : id === 'VF' ? 'VF 9' : nutzungInfo(id).kurz);

export interface BerichtAnzeige {
  plaene: boolean;
  hintergrund: boolean;
  rechenweg: boolean;
}

const ANZEIGE_SCHLUESSEL = 'arch-flaechen-tool:bericht-anzeige';
const ANZEIGE_VORGABE: BerichtAnzeige = { plaene: true, hintergrund: false, rechenweg: false };

/** gemerkte Anzeige des Berichts; fehlt oder unlesbar → Vorgabe */
export function anzeigeLaden(): BerichtAnzeige {
  try {
    const roh = JSON.parse(localStorage.getItem(ANZEIGE_SCHLUESSEL) ?? 'null') as Partial<BerichtAnzeige> | null;
    if (!roh || typeof roh !== 'object') return ANZEIGE_VORGABE;
    return { plaene: roh.plaene ?? true, hintergrund: roh.hintergrund === true, rechenweg: roh.rechenweg === true };
  } catch {
    return ANZEIGE_VORGABE;
  }
}

function anzeigeMerken(a: BerichtAnzeige) {
  try {
    localStorage.setItem(ANZEIGE_SCHLUESSEL, JSON.stringify(a));
  } catch {
    // ohne Speicher (privates Fenster): nur für diese Sitzung
  }
}

/** Tab und Umschalt+Tab bleiben in der Bildschirmansicht des Berichts (wie in den gemeinsamen Dialogen) */
function fokusImBericht(e: KeyboardEvent, bericht: HTMLElement | null) {
  if (e.key !== 'Tab' || !bericht) return;
  const ziele = [...bericht.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]')];
  if (!ziele.length) return;
  const erstes = ziele[0];
  const letztes = ziele[ziele.length - 1];
  if (e.shiftKey && document.activeElement === erstes) {
    e.preventDefault();
    letztes.focus();
  } else if (!e.shiftKey && document.activeElement === letztes) {
    e.preventDefault();
    erstes.focus();
  }
}
