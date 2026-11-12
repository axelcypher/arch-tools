import { useEffect, useMemo, useState } from 'react';
import type { Mail } from '../../bauleitung/mails';
import { mailLesen } from '../../bauleitung/mails';
import { gewerkZweistellig } from '../../abrechnung/gewerk';
import { vollerPfad } from '../../dateien';
import type { Datei } from '../../projekt';
import { useAva } from '../../store';

const zwischenspeicher = new Map<string, Mail | Error>();

/** Mails lesen (mit Zwischenspeicher je Pfad und Änderungszeit) */
function useMails(dateien: Datei[]): Map<string, Mail | Error> {
  const projekt = useAva((s) => s.projekt)!;
  const [, setStand] = useState(0);
  useEffect(() => {
    let aus = false;
    void (async () => {
      for (const d of dateien) {
        const k = `${d.pfad}|${d.geaendert}`;
        if (zwischenspeicher.has(k)) continue;
        try {
          const r = await useAva.getState().fs.lies(projekt.ordner, d.pfad);
          zwischenspeicher.set(k, r ? mailLesen(d.name, r.daten) : new Error('nicht gefunden'));
        } catch (e) {
          zwischenspeicher.set(k, e instanceof Error ? e : new Error(String(e)));
        }
        if (aus) return;
        setStand((s) => s + 1);
      }
    })();
    return () => {
      aus = true;
    };
  }, [dateien, projekt.ordner]);
  return new Map(dateien.map((d) => [d.pfad, zwischenspeicher.get(`${d.pfad}|${d.geaendert}`)!]).filter(([, m]) => m) as [string, Mail | Error][]);
}

const zeit = (iso?: string) => (iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

/** Liste von Mails mit Vorschau (für den Mailverlauf und die Korrespondenz eines Gewerks) */
export function MailListe({ dateien, gewerkVon }: { dateien: Datei[]; gewerkVon?: (d: Datei) => string | undefined }) {
  const projekt = useAva((s) => s.projekt)!;
  const mails = useMails(dateien);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  const zeilen = dateien
    .map((d) => ({ d, m: mails.get(d.pfad) }))
    .filter(({ d, m }) => !suche || `${d.name} ${m && !(m instanceof Error) ? `${m.betreff} ${m.von} ${m.an} ${m.text}` : ''}`.toLowerCase().includes(suche.toLowerCase()))
    .sort((a, b) => {
      const da = a.m && !(a.m instanceof Error) ? (a.m.datum ?? '') : new Date(a.d.geaendert).toISOString();
      const db = b.m && !(b.m instanceof Error) ? (b.m.datum ?? '') : new Date(b.d.geaendert).toISOString();
      return db.localeCompare(da);
    });
  const aktiv = zeilen.find((z) => z.d.pfad === gewaehlt) ?? null;
  const oeffnen = (d: Datei) => void useAva.getState().fs.oeffnen(vollerPfad(projekt.ordner, d.pfad));
  return (
    <div className="ava-mails">
      <input className="ava-suche" placeholder="Suchen in Betreff, Absender, Text …" value={suche} onChange={(e) => setSuche(e.target.value)} />
      <div className="ava-mails-koerper">
        <table className="ava-tabelle ava-mail-tabelle">
          <thead>
            <tr>
              <th>Datum</th>
              {gewerkVon && <th>Gewerk</th>}
              <th>Von</th>
              <th>Betreff</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map(({ d, m }) => (
              <tr key={d.pfad} className={`ava-klickbar${aktiv?.d.pfad === d.pfad ? ' active' : ''}`} onClick={() => setGewaehlt(d.pfad)} onDoubleClick={() => oeffnen(d)} title="Doppelklick öffnet im Mailprogramm">
                <td>{m && !(m instanceof Error) ? zeit(m.datum) : '…'}</td>
                {gewerkVon && <td>{gewerkVon(d) ? gewerkZweistellig(gewerkVon(d)!) : ''}</td>}
                <td className="ava-kurztext">{m && !(m instanceof Error) ? m.von : ''}</td>
                <td className="ava-kurztext">{m instanceof Error ? <span className="muted">{d.name} (nicht lesbar)</span> : (m?.betreff || d.name)}</td>
              </tr>
            ))}
            {!zeilen.length && (
              <tr>
                <td colSpan={gewerkVon ? 4 : 3} className="muted">
                  Keine Mails.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {aktiv && aktiv.m && !(aktiv.m instanceof Error) && (
          <div className="ava-mail-vorschau">
            <h3>{aktiv.m.betreff}</h3>
            <div className="small-text">
              <div>
                <strong>Von:</strong> {aktiv.m.von}
              </div>
              <div>
                <strong>An:</strong> {aktiv.m.an}
              </div>
              {aktiv.m.cc && (
                <div>
                  <strong>Cc:</strong> {aktiv.m.cc}
                </div>
              )}
              <div>
                <strong>Datum:</strong> {zeit(aktiv.m.datum)}
              </div>
              {aktiv.m.anhaenge.length > 0 && (
                <div>
                  <strong>Anhänge:</strong> {aktiv.m.anhaenge.join(', ')}
                </div>
              )}
            </div>
            <pre className="ava-mail-text">{aktiv.m.text}</pre>
            <button className="small" onClick={() => oeffnen(aktiv.d)}>
              Im Mailprogramm öffnen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Mailverlauf des Projekts: Korrespondenz aller Gewerke und die Mailordner des Projekts */
export function Mailverlauf() {
  const projekt = useAva((s) => s.projekt)!;
  const [gewerk, setGewerk] = useState('');
  const dateien = useMemo(() => {
    const g = projekt.struktur?.gewerke ?? [];
    const alle = [...g.flatMap((x) => x.korrespondenz.filter((d) => /\.(eml|msg)$/i.test(d.name))), ...(projekt.struktur?.mails ?? [])];
    return gewerk ? alle.filter((d) => g.find((x) => x.kennung === gewerk)?.korrespondenz.includes(d)) : alle;
  }, [projekt.struktur, gewerk]);
  const gewerkVon = (d: Datei) => projekt.struktur?.gewerke.find((g) => d.pfad.startsWith(`${g.pfad}/`))?.kennung;
  return (
    <div className="ava-seite ava-mailverlauf">
      <div className="ava-seite-kopf">
        <h1>Mailverlauf</h1>
        <select value={gewerk} onChange={(e) => setGewerk(e.target.value)}>
          <option value="">alle Gewerke und das Projekt</option>
          {projekt.struktur?.gewerke
            .filter((g) => g.korrespondenz.length)
            .map((g) => (
              <option key={g.kennung} value={g.kennung}>
                {gewerkZweistellig(g.kennung)} {g.name}
              </option>
            ))}
        </select>
      </div>
      <p className="muted small-text">Mails (.eml, .msg) aus den Korrespondenzordnern der Gewerke und den Mailordnern des Projekts ({useAva.getState().einstellungen.ablage.mailOrdner.join(', ')}).</p>
      <MailListe dateien={dateien} gewerkVon={gewerkVon} />
    </div>
  );
}
