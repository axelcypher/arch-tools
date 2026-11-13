import { useMemo, useState } from 'react';
import { meldung } from '@core/ui/Rueckfrage';
import type { Rechnung } from '../../abrechnung/aggregat';
import { alleGewerke, gewerkAbrechnung } from '../../abrechnung/aggregat';
import { deckblattErzeugen, mailEntwurf, rechnungsDateiname } from '../../abrechnung/ablauf';
import { gewerkZweistellig } from '../../abrechnung/gewerk';
import { datumDE, euro } from '../../abrechnung/pruefung';
import { vollerPfad } from '../../dateien';
import { gewerkOrdner, useAva } from '../../store';
import { RechnungPruefen } from './RechnungPruefen';

/**
 * Rechnungen eines Gewerks bzw. des ganzen Projekts – aus Rechnungsliste, Gewerkblatt, Auftragsordner und den
 * Prüfungen der App zusammengeführt, mit Hinweisen, wo etwas nicht zusammenpasst.
 */
export function RechnungenAnsicht({ gewerk }: { gewerk?: string }) {
  const projekt = useAva((s) => s.projekt)!;
  const e = useAva((s) => s.einstellungen);
  const [pruefen, setPruefen] = useState(false);
  const [nurHinweise, setNurHinweise] = useState(false);
  const [suche, setSuche] = useState('');
  const kk = projekt.kk?.kk ?? null;
  const abrechnungen = useMemo(() => {
    const liste = gewerk ? [gewerk] : alleGewerke(kk, projekt.struktur?.gewerke ?? [], projekt.ava.rechnungen);
    return liste.map((g) => gewerkAbrechnung(g, kk, gewerkOrdner(projekt, g), projekt.ava.rechnungen));
  }, [gewerk, kk, projekt]);
  const zeilen = abrechnungen
    .flatMap((a) => a.rechnungen)
    .filter((r) => (!nurHinweise || r.hinweise.length) && (!suche || `${r.nr} ${r.text} ${r.gewerk}`.toLowerCase().includes(suche.toLowerCase())))
    .sort((a, b) => {
      const n = (x: Rechnung) => (typeof x.nr === 'number' ? x.nr : parseFloat(String(x.nr ?? '')) || 1e9);
      return n(a) - n(b);
    });
  const summe = zeilen.reduce((s, r) => s + (r.betrag ?? 0), 0);
  const k = useAva.getState().kontext()!;
  const a1 = gewerk ? abrechnungen[0] : null;

  const oeffnen = (pfad: string) => void useAva.getState().fs.oeffnen(vollerPfad(projekt.ordner, pfad)).catch((x) => meldung('Datei ließ sich nicht öffnen', pfad, x));

  return (
    <div className="ava-seite">
      {!gewerk && (
        <div className="ava-seite-kopf">
          <h1>Rechnungen</h1>
        </div>
      )}
      {a1 && (
        <div className="ava-kennzahlen">
          <div className="metric">
            <span>Kostenschätzung</span>
            <strong>{euro(a1.kostenschaetzung)}</strong>
          </div>
          <div className="metric">
            <span>Kostenanschlag</span>
            <strong>{euro(a1.kostenanschlag)}</strong>
          </div>
          <div className="metric">
            <span>Kostenfeststellung</span>
            <strong>{euro(a1.kostenfeststellung)}</strong>
          </div>
          <div className="metric">
            <span>noch abzurechnen</span>
            <strong>{euro(a1.offen)}</strong>
          </div>
        </div>
      )}
      <div className="toolbar">
        <button className="primary" onClick={() => setPruefen(true)}>
          Neue Rechnung prüfen …
        </button>
        <input className="ava-suche" placeholder="Suchen …" value={suche} onChange={(x) => setSuche(x.target.value)} />
        <label className="ava-check">
          <input type="checkbox" checked={nurHinweise} onChange={(x) => setNurHinweise(x.target.checked)} /> nur mit Hinweisen
        </label>
        {projekt.kk && (
          <button className="small" onClick={() => oeffnen(projekt.kk!.pfad)} title={projekt.kk.pfad}>
            Kostenkontrolle in Excel
          </button>
        )}
      </div>
      {a1?.hinweise.map((h, i) => (
        <div key={i} className="warning">
          {h}
        </div>
      ))}
      <table className="ava-tabelle ava-rechnungen">
        <thead>
          <tr>
            <th className="num">Nr.</th>
            {!gewerk && <th>Gewerk</th>}
            <th>Rechnung</th>
            <th>Rechn.-Datum</th>
            <th>Freigabe</th>
            <th className="num">Betrag €</th>
            <th>Quellen</th>
            <th>Hinweise</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {zeilen.map((r) => (
            <tr key={`${r.gewerk}${r.schluessel}`} className={r.hinweise.length ? 'ava-mit-hinweis' : ''}>
              <td className="num">{String(r.nr ?? '')}</td>
              {!gewerk && <td className="ava-kennung">{gewerkZweistellig(r.gewerk)}</td>}
              <td>
                {r.text}
                {r.datensatz?.status === 'erfasst' && <span className="ava-chip">ohne Scan</span>}
                {r.datensatz?.status === 'versendet' && <span className="ava-chip ava-chip-ok" title={r.datensatz.versendet ? `an ${r.datensatz.versendet.an}` : undefined}>weitergeleitet</span>}
              </td>
              <td>{datumDE(r.datum)}</td>
              <td>{datumDE(r.freigabe)}</td>
              <td className="num">{euro(r.betrag)}</td>
              <td className="ava-quellen">
                <span className={r.liste ? 'an' : ''} title="Rechnungsliste">
                  L
                </span>
                <span className={r.blatt ? 'an' : ''} title="Gewerkblatt (Kostenfeststellung)">
                  G
                </span>
                <span className={r.datei ? 'an' : ''} title={r.datei?.name ?? 'PDF im Auftragsordner'}>
                  P
                </span>
                <span className={r.datensatz ? 'an' : ''} title="Prüfung in der App">
                  A
                </span>
              </td>
              <td className="ava-hinweis-zelle">{r.hinweise.join(' ')}</td>
              <td className="ava-aktionen">
                {r.datei && (
                  <button className="small" onClick={() => oeffnen(r.datei!.pfad)} title={r.datei.name}>
                    PDF
                  </button>
                )}
                {r.datensatz && (
                  <button
                    className="small"
                    onClick={async () => {
                      try {
                        const pdf = await deckblattErzeugen(k, r.datensatz!);
                        await useAva.getState().fs.tempOeffnen(`${rechnungsDateiname(k, r.datensatz!).replace(/\.pdf$/i, '')} Deckblatt.pdf`, pdf);
                      } catch (x) {
                        await meldung('Deckblatt nicht erzeugt', String(x instanceof Error ? x.message : x), x);
                      }
                    }}
                    title="Deckblatt der Prüfung öffnen"
                  >
                    Deckblatt
                  </button>
                )}
                {r.datensatz?.datei && (
                  <button
                    className="small"
                    onClick={async () => {
                      const v = e.mail.vorlagen.find((x) => x.id === 'rechnung') ?? e.mail.vorlagen[0];
                      if (!v) return;
                      try {
                        const ava = await mailEntwurf(k, r.datensatz!, projekt.ava, v);
                        useAva.setState((s) => (s.projekt ? { projekt: { ...s.projekt, ava } } : {}));
                      } catch (x) {
                        await meldung('Mailentwurf nicht erstellt', String(x instanceof Error ? x.message : x), x);
                      }
                    }}
                    title="Mailentwurf mit der Rechnung als Anhang"
                  >
                    Mail
                  </button>
                )}
              </td>
            </tr>
          ))}
          {!zeilen.length && (
            <tr>
              <td colSpan={gewerk ? 8 : 9} className="muted">
                Keine Rechnungen.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={gewerk ? 4 : 5}>Summe ({zeilen.length})</td>
            <td className="num">{euro(summe)}</td>
            <td colSpan={3} />
          </tr>
        </tfoot>
      </table>
      <p className="muted small-text">Quellen: L = Rechnungsliste, G = Gewerkblatt der Kostenkontrolle, P = PDF im Auftragsordner, A = Prüfung in der App (Projektdatei).</p>
      {pruefen && <RechnungPruefen gewerk={gewerk} onClose={() => setPruefen(false)} />}
    </div>
  );
}
