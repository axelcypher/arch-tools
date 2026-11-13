import { useMemo } from 'react';
import { meldung } from '@core/ui/Rueckfrage';
import { alleGewerke, gewerkAbrechnung } from '../abrechnung/aggregat';
import { gewerkZweistellig } from '../abrechnung/gewerk';
import { euro } from '../abrechnung/pruefung';
import { vollerPfad } from '../dateien';
import { useAva } from '../store';

const prozent = (n: number | null) => (n === null || !Number.isFinite(n) ? '' : `${n.toLocaleString('de-DE', { maximumFractionDigits: 0 })} %`);

/** Kostenübersicht des Projekts: je Gewerk aus Kostenkontrolle, LV-Dateien und Rechnungen */
export function Uebersicht() {
  const projekt = useAva((s) => s.projekt)!;
  const kk = projekt.kk?.kk ?? null;
  const zeilen = useMemo(() => {
    const gewerke = alleGewerke(kk, projekt.struktur?.gewerke ?? [], projekt.ava.rechnungen);
    return gewerke.map((k) => gewerkAbrechnung(k, kk, projekt.struktur?.gewerke.find((g) => g.kennung === k) ?? null, projekt.ava.rechnungen));
  }, [kk, projekt.struktur, projekt.ava.rechnungen]);
  const summe = (f: (z: (typeof zeilen)[number]) => number | null) => zeilen.reduce((s, z) => s + (f(z) ?? 0), 0);
  const ks = summe((z) => z.kostenschaetzung);
  const ka = summe((z) => z.kostenanschlag);
  const kf = summe((z) => z.kostenfeststellung);
  // Abweichung Kostenanschlag/Kostenschätzung nur für vergebene Gewerke – sonst erschiene ein Gewerk ohne Auftrag als Einsparung
  const abweichung = (z: (typeof zeilen)[number]) => (z.kostenanschlag && z.kostenschaetzung ? z.kostenanschlag - z.kostenschaetzung : null);
  const abwSumme = summe(abweichung);
  const oeffneGewerk = (gewerk: string, tab: 'lv' | 'rechnungen') => useAva.getState().setAnsicht({ art: 'gewerk', gewerk, tab });
  const hinweise = [...(projekt.struktur?.hinweise ?? []), ...(kk?.hinweise ?? []), ...zeilen.flatMap((z) => z.hinweise.map((h) => `${gewerkZweistellig(z.gewerk)}: ${h}`))];
  const rechnungsHinweise = zeilen.reduce((n, z) => n + z.rechnungen.filter((r) => r.hinweise.length).length, 0);

  const oeffnen = async (pfad: string) => {
    try {
      await useAva.getState().fs.oeffnen(vollerPfad(projekt.ordner, pfad));
    } catch (e) {
      await meldung('Datei ließ sich nicht öffnen', pfad, e);
    }
  };

  return (
    <div className="ava-seite">
      <div className="ava-seite-kopf">
        <h1>Kostenübersicht</h1>
        <div className="ava-kopf-info">
          {projekt.kk ? (
            <>
              <span title={projekt.kk.pfad}>Kostenkontrolle: {projekt.kk.pfad.split('/').pop()}</span>
              <button className="small" onClick={() => void oeffnen(projekt.kk!.pfad)} title="In Excel öffnen">
                In Excel öffnen
              </button>
              {(projekt.struktur?.kostenkontrollen.length ?? 0) > 1 && (
                <select
                  value={projekt.ava.kostenkontrolle ?? ''}
                  onChange={(e) => void useAva.getState().kostenkontrolleWaehlen(e.target.value || null)}
                  title="Welche Kostenkontrolle für dieses Projekt gilt (gilt für alle im Büro)"
                >
                  <option value="">automatisch (aktuellste)</option>
                  {projekt.struktur!.kostenkontrollen.map((d) => (
                    <option key={d.pfad} value={d.pfad}>
                      {d.pfad}
                      {d.archiv ? ' (Archiv)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </>
          ) : (
            <span className="muted">{projekt.kkFehler ?? `Keine Kostenkontrolle gefunden (Excel mit „${useAva.getState().einstellungen.ablage.kostenkontrolle}“ im Namen).`}</span>
          )}
        </div>
      </div>
      <div className="ava-kennzahlen">
        <div className="metric">
          <span>Zielsumme</span>
          <strong>{euro(kk?.uebersicht?.zielsumme ?? null) || '—'}</strong>
        </div>
        <div className="metric">
          <span>Kostenschätzung</span>
          <strong>{euro(ks)}</strong>
        </div>
        <div className="metric">
          <span>Kostenanschlag (Aufträge)</span>
          <strong>{euro(ka)}</strong>
          <small>{ks ? `${prozent((ka / ks) * 100)} der Schätzung` : ''}</small>
        </div>
        <div className="metric">
          <span title="Summe der geprüften Zahlungsfreigaben (Rechnungen) – nach Einbehalt, Umlagen und Skonto">Zahlungsfreigaben (Rechnungen)</span>
          <strong>{euro(kf)}</strong>
          <small>{ka ? `${prozent((kf / ka) * 100)} des Anschlags` : ''}</small>
        </div>
        <div className="metric">
          <span title="Kostenanschlag (Aufträge) abzüglich Zahlungsfreigaben">noch auszuzahlen</span>
          <strong className={ka - kf < 0 ? 'ava-ueber' : ''}>{euro(ka - kf)}</strong>
        </div>
      </div>
      <div className="ava-tabelle-rahmen">
      <table className="ava-tabelle">
        <thead>
          <tr>
            <th>Gewerk</th>
            <th>Bezeichnung</th>
            <th>Auftragnehmer</th>
            <th className="num">Kostenschätzung</th>
            <th className="num">Kostenanschlag</th>
            <th className="num" title="Kostenanschlag minus Kostenschätzung – nur für vergebene Gewerke">
              Abw. KA/KS
            </th>
            <th className="num" title="Summe der geprüften Zahlungsfreigaben">
              Zahlungsfreigaben
            </th>
            <th className="num" title="Kostenanschlag abzüglich Zahlungsfreigaben">
              offen
            </th>
            <th>freigegeben</th>
            <th>
              <span className="ava-sr-only">Hinweise</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z) => {
            const abw = abweichung(z);
            const hinweise = z.hinweise.length + z.rechnungen.filter((r) => r.hinweise.length).length;
            return (
              <tr
                key={z.gewerk}
                className="ava-klickbar"
                tabIndex={0}
                title="Rechnungen dieses Gewerks zeigen (Enter)"
                onClick={() => oeffneGewerk(z.gewerk, 'rechnungen')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target === e.currentTarget) oeffneGewerk(z.gewerk, 'rechnungen');
                }}
              >
                <td>
                  <button
                    type="button"
                    className="small ava-kennung-knopf"
                    title="Gewerk öffnen (Leistungsverzeichnis)"
                    onClick={(e) => {
                      e.stopPropagation();
                      oeffneGewerk(z.gewerk, 'lv');
                    }}
                  >
                    {gewerkZweistellig(z.gewerk)}
                  </button>
                </td>
                <td>{z.bezeichnung}</td>
                <td>{z.firma}</td>
                <td className="num">{euro(z.kostenschaetzung)}</td>
                <td className="num">{euro(z.kostenanschlag)}</td>
                <td className={`num ${abw !== null && abw > 0 ? 'ava-ueber' : abw !== null && abw < 0 ? 'ava-unter' : ''}`}>{abw ? euro(abw) : ''}</td>
                <td className="num">{euro(z.kostenfeststellung)}</td>
                <td className={`num${z.offen !== null && z.offen < 0 ? ' ava-ueber' : ''}`} title={z.offen !== null && z.offen < 0 ? 'Mehr freigegeben als beauftragt' : undefined}>
                  {z.offen ? euro(z.offen) : ''}
                </td>
                <td>
                  {z.anteil !== null && (
                    <div className="ava-balken" title={`${prozent(z.anteil)} des Kostenanschlags freigegeben`} role="img" aria-label={`${prozent(z.anteil)} freigegeben`}>
                      <div style={{ width: `${Math.min(100, Math.max(0, z.anteil))}%` }} className={z.anteil > 100.5 ? 'ava-balken-ueber' : ''} />
                    </div>
                  )}
                </td>
                <td>{hinweise ? <span className="ava-warn-marke" title={`${hinweise} Hinweis(e)`}>⚠ {hinweise}</span> : null}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>Summe</td>
            <td className="num">{euro(ks)}</td>
            <td className="num">{euro(ka)}</td>
            <td className="num">{abwSumme ? euro(abwSumme) : ''}</td>
            <td className="num">{euro(kf)}</td>
            <td className={`num${ka - kf < 0 ? ' ava-ueber' : ''}`}>{euro(ka - kf)}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
      </div>
      {(hinweise.length > 0 || rechnungsHinweise > 0) && (
        <div className="warning ava-hinweise">
          <strong>Hinweise</strong>
          <ul>
            {hinweise.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
            {rechnungsHinweise > 0 && <li>{rechnungsHinweise} Rechnung(en) mit Abweichungen zwischen Rechnungsliste, Gewerkblatt und Auftragsordner – siehe „Rechnungen“.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
