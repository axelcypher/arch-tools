import { useState } from 'react';
import { meldung } from '@core/ui/Rueckfrage';
import { Symbol } from '@core/ui/Symbol';
import { vollerPfad } from '../dateien';
import type { Datei } from '../projekt';
import { gewerkOrdner, useAva } from '../store';
import { MailListe } from './bauleitung/Mailverlauf';

const groesse = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const zeit = (ms: number) => (ms ? new Date(ms).toLocaleDateString('de-DE') : '');

/** Dateien des Gewerks: Auftrag und Nachträge, Rechnungen, Korrespondenz (Mails), Archiv */
export function Dateiliste({ gewerk }: { gewerk: string }) {
  const projekt = useAva((s) => s.projekt)!;
  const g = gewerkOrdner(projekt, gewerk);
  const [archiv, setArchiv] = useState(false);
  if (!g) return <p className="muted">Kein Gewerkeordner im Projekt.</p>;
  const oeffnen = (d: Datei) => void useAva.getState().fs.oeffnen(vollerPfad(projekt.ordner, d.pfad)).catch((e) => meldung('Datei ließ sich nicht öffnen', d.pfad, e));
  const liste = (titel: string, dateien: Datei[]) => {
    const sichtbar = dateien.filter((d) => archiv || !d.archiv);
    if (!sichtbar.length) return null;
    return (
      <section className="ava-karte">
        <h2>{titel}</h2>
        <table className="ava-tabelle ava-dateien">
          <colgroup>
            <col />
            <col className="ava-dateien-ort" />
            <col className="ava-dateien-groesse" />
            <col className="ava-dateien-datum" />
            <col className="ava-dateien-aktion" />
          </colgroup>
          <thead>
            <tr>
              <th>Datei</th>
              <th>Unterordner</th>
              <th className="num">Größe</th>
              <th>geändert</th>
              <th>
                <span className="ava-sr-only">Öffnen</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sichtbar.map((d) => (
              <tr key={d.pfad} className="ava-klickbar" onDoubleClick={() => oeffnen(d)} title={`${d.pfad} – Doppelklick öffnet`}>
                <td className="ava-datei-name">
                  {d.name}
                  {d.archiv && <span className="ava-chip">Archiv</span>}
                </td>
                <td className="muted small-text">{d.pfad.slice(g.pfad.length + 1, -d.name.length - 1)}</td>
                <td className="num muted small-text">{groesse(d.groesse)}</td>
                <td className="muted small-text">{zeit(d.geaendert)}</td>
                <td>
                  <button className="small" onClick={() => oeffnen(d)} aria-label={`${d.name} öffnen`}>
                    Öffnen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  };
  const leer = ![g.auftrag, g.rechnungen, g.lvs, g.korrespondenz, g.sonstige].some((l) => l.some((d) => archiv || !d.archiv));
  const imArchiv = [g.auftrag, g.rechnungen, g.lvs, g.korrespondenz, g.sonstige].some((l) => l.some((d) => d.archiv));
  return (
    <div className="ava-seite">
      {leer && (
        <div className="ava-leer-hinweis">
          Im Gewerkeordner liegen noch keine Dateien{imArchiv && !archiv ? ' (nur im Archiv)' : ''}.
          <div className="button-row">
            <button onClick={() => void useAva.getState().fs.oeffnen(vollerPfad(projekt.ordner, g.pfad)).catch((e) => meldung('Ordner ließ sich nicht öffnen', g.pfad, e))}><Symbol name="ordnerOffen" /> Ordner öffnen</button>
          </div>
        </div>
      )}
      <label className="ava-check">
        <input type="checkbox" checked={archiv} onChange={(e) => setArchiv(e.target.checked)} /> Archiv zeigen
      </label>
      {liste('Auftrag, Nachträge, Schriftverkehr', g.auftrag)}
      {liste('Rechnungen (Auftragsordner)', g.rechnungen)}
      {liste('LV-Dateien', g.lvs)}
      {g.korrespondenz.length > 0 && (
        <section className="ava-karte">
          <h2>Korrespondenz</h2>
          <MailListe dateien={g.korrespondenz.filter((d) => archiv || !d.archiv)} />
        </section>
      )}
      {liste('Weitere Dateien', g.sonstige)}
    </div>
  );
}
