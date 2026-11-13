import { useCallback, useEffect, useState } from 'react';
import { bestaetigen, fehlerText, frageText, meldung } from '@core/ui/Rueckfrage';
import { ordnerWaehlen } from '@core/platform/projektordner';
import type { OrdnerEintrag } from '@core/projektdatei';
import { ablageNachtragen, mailEntwurf, rechnungsDateiname, scanAblegen, auftragsordner, TeilweiseAbgelegt } from '../../abrechnung/ablauf';
import { dateinameSicher } from '../../abrechnung/benennung';
import { gewerkZweistellig } from '../../abrechnung/gewerk';
import { euro } from '../../abrechnung/pruefung';
import type { AvaProjekt, RechnungsDatensatz } from '../../avaDaten';
import { gewerkOrdner, useAva } from '../../store';
import { datumKurz } from '../eingaben';
import { PdfVorschau } from '../PdfVorschau';
import { RechnungPruefen } from './RechnungPruefen';
import { listenTaste } from '../tastatur';

const regexText = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const zeit = (ms: number) => (ms ? new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

/**
 * Rechnungseingang: die frischen Scans aus dem Scanordner (neueste zuerst) mit Vorschau und die erfassten
 * Rechnungen, die noch keine Datei haben. „Zuordnen & ablegen“ benennt den Scan nach dem Muster und verschiebt
 * ihn in den Auftragsordner des Gewerks; danach lässt sich der Mailentwurf an den Zahler öffnen.
 */
export function Eingang() {
  const projekt = useAva((s) => s.projekt)!;
  const e = useAva((s) => s.einstellungen);
  const fs = useAva((s) => s.fs);
  const [scans, setScans] = useState<OrdnerEintrag[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [vorschau, setVorschau] = useState<Uint8Array | null>(null);
  const [vorschauLaedt, setVorschauLaedt] = useState(false);
  const [datensatz, setDatensatz] = useState<string | null>(null);
  const [deckblatt, setDeckblatt] = useState(e.rechnungen.deckblattVoranstellen);
  const [pruefen, setPruefen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  /** kurze Rückmeldung (z. B. „Mailentwurf geöffnet“) */
  const [hinweis, setHinweis] = useState<string | null>(null);
  useEffect(() => {
    if (!hinweis) return;
    const t = setTimeout(() => setHinweis(null), 8000);
    return () => clearTimeout(t);
  }, [hinweis]);
  const ordner = e.scan.ordner.trim();
  const offene = projekt.ava.rechnungen.filter((r) => r.status === 'erfasst' && !r.datei);
  const abgelegte = projekt.ava.rechnungen.filter((r) => r.status === 'abgelegt' && r.datei);
  // keine stille Vorauswahl: nur bei genau einer offenen Rechnung ist sie gewählt, sonst ausdrücklich wählen
  const d = offene.find((r) => r.id === datensatz) ?? (offene.length === 1 ? offene[0] : undefined);

  const laden = useCallback(async () => {
    if (!ordner) return;
    try {
      const liste = await fs.liste(ordner, 1);
      const endungen = new RegExp(`\\.(${e.scan.endungen.map((x) => regexText(x.trim().replace(/^\./, ''))).filter(Boolean).join('|')})$`, 'i');
      setScans(liste.filter((x) => !x.ordner && endungen.test(x.pfad)).sort((a, b) => (b.geaendert ?? 0) - (a.geaendert ?? 0)));
      setFehler(null);
    } catch (x) {
      setScans([]);
      setFehler(`Scanordner nicht lesbar: ${x instanceof Error ? x.message : String(x)}`);
    }
  }, [ordner, fs, e.scan.endungen]);

  useEffect(() => {
    void laden();
    const t = setInterval(() => document.visibilityState !== 'hidden' && void laden(), 10_000);
    return () => clearInterval(t);
  }, [laden]);

  useEffect(() => {
    const name = gewaehlt ?? scans?.[0]?.pfad;
    if (!name || !ordner) {
      setVorschau(null);
      return;
    }
    let aktuell = true;
    setVorschauLaedt(true);
    void fs
      .lies(ordner, name)
      .then(
        (r) => aktuell && setVorschau(r?.daten ?? null),
        () => aktuell && setVorschau(null),
      )
      .finally(() => aktuell && setVorschauLaedt(false));
    return () => {
      aktuell = false;
    };
  }, [gewaehlt, scans, ordner, fs]);

  const scan = gewaehlt ?? scans?.[0]?.pfad ?? null;
  const k = useAva.getState().kontext()!;

  /** neuen Stand der Projektdatei übernehmen, wenn noch dasselbe Projekt offen ist */
  const avaSetzen = (ava: AvaProjekt) => useAva.setState((s) => (s.projekt?.ordner === projekt.ordner ? { projekt: { ...s.projekt, ava } } : {}));

  const ablegen = async () => {
    if (!scan || !d) return;
    const g = gewerkOrdner(projekt, d.gewerk);
    const zielOrdner = auftragsordner(k, g, d.gewerk);
    const anders = await frageText('Scan ablegen', rechnungsDateiname(k, d), 'Ablegen', `„${scan}“ wird umbenannt und verschoben nach\n${zielOrdner}${deckblatt ? '\n– mit dem Deckblatt als erster Seite' : ''}`);
    if (!anders) return;
    // unzulässige Zeichen (/ \ : * ? …) fallen weg – kein Unterordner, kein Windows-Fehler
    const sicher = dateinameSicher(anders);
    const name = /\.pdf$/i.test(sicher) || !/\.pdf$/i.test(scan) ? sicher : `${sicher}.pdf`;
    setLaeuft(true);
    try {
      const r = await scanAblegen(k, d, g, { ordner, datei: scan }, { deckblatt, name });
      avaSetzen(r.ava);
      setGewaehlt(null);
      setDatensatz(null);
      await laden();
      await useAva.getState().neuLaden();
      const abgelegt = r.ava.rechnungen.find((x) => x.id === d.id)!;
      if (await bestaetigen('Abgelegt', `${r.pfad}${r.warnung ? `\n\nHinweis: ${r.warnung}` : ''}\n\nMailentwurf an den Zahler öffnen?`, 'Mail öffnen')) await mail(abgelegt);
    } catch (x) {
      if (x instanceof TeilweiseAbgelegt) {
        if (await bestaetigen('Projektdatei nicht gespeichert', `${x.message}\n\nDie Ablage jetzt erneut in der Projektdatei eintragen?`, 'Erneut eintragen')) {
          try {
            avaSetzen(await ablageNachtragen(k, d.id, x.pfad));
          } catch (y) {
            await meldung('Projektdatei nicht gespeichert', y instanceof Error ? y.message : String(y), y);
          }
        }
        await laden();
      } else await meldung('Scan nicht abgelegt', `${zielOrdner}/${name}: ${x instanceof Error ? x.message : String(x)}`, x);
    } finally {
      setLaeuft(false);
    }
  };

  const mail = async (r: RechnungsDatensatz) => {
    const vorlage = e.mail.vorlagen.find((v) => v.id === 'rechnung') ?? e.mail.vorlagen[0];
    if (!vorlage) {
      await meldung('Keine Mailvorlage', 'Es gibt keine Mailvorlage „Rechnung“ – bitte unter ⚙ Einstellungen › Mailvorlagen anlegen.');
      return;
    }
    try {
      const ava = await mailEntwurf(k, r, useAva.getState().projekt!.ava, vorlage);
      avaSetzen(ava);
      setHinweis(`Mailentwurf für Nr. ${String(r.nr)} geöffnet – bitte im Mailprogramm prüfen und senden.`);
    } catch (x) {
      await meldung('Mailentwurf nicht erstellt', x instanceof Error ? x.message : String(x), x);
    }
  };

  if (!ordner) {
    return (
      <div className="ava-seite">
        <h1>Rechnungseingang</h1>
        <p>Noch kein Scanordner eingestellt – der Ordner, in dem der Scanner die Dateien ablegt.</p>
        <div className="button-row">
          <button
            className="primary"
            onClick={async () => {
              const o = await ordnerWaehlen('Scanordner wählen');
              if (o) await useAva.getState().einstellungenSetzen({ ...e, scan: { ...e.scan, ordner: o } }).catch((x) => meldung('Scanordner nicht gespeichert', fehlerText(x)));
            }}
          >
            Scanordner wählen …
          </button>
          <button onClick={() => setPruefen(true)}>Neue Rechnung prüfen …</button>
        </div>
        {pruefen && <RechnungPruefen onClose={() => setPruefen(false)} onErfasst={(x) => setDatensatz(x.id)} />}
      </div>
    );
  }

  return (
    <div className="ava-eingang">
      <div className="ava-eingang-liste">
        <div className="ava-eingang-kopf">
          <h2>Scans</h2>
          <button className="small" onClick={() => void laden()} title={ordner}>
            Neu einlesen
          </button>
        </div>
        <div className="muted small-text" title={ordner}>
          {ordner}
        </div>
        {fehler && <div className="warning">{fehler}</div>}
        <ul className="list" role="listbox" aria-label="Scans">
          {scans?.map((s, i) => (
            <li
              key={s.pfad}
              role="option"
              tabIndex={0}
              aria-selected={s.pfad === scan}
              className={s.pfad === scan ? 'active' : ''}
              onClick={() => setGewaehlt(s.pfad)}
              onKeyDown={(x) => listenTaste(x, scans, i, (y) => setGewaehlt(y.pfad))}
              title="Doppelklick öffnet den Scan"
              onDoubleClick={() => void fs.oeffnen(`${ordner.replace(/[\\/]+$/, '')}${ordner.includes('\\') ? '\\' : '/'}${s.pfad}`)}>
              <div>{s.pfad}</div>
              <span className="muted small-text">
                {zeit(s.geaendert ?? 0)} · {Math.round(s.groesse / 1024)} KB
              </span>
            </li>
          ))}
          {scans && !scans.length && <li className="muted">Keine Scans im Scanordner.</li>}
        </ul>
      </div>
      <div className="ava-eingang-vorschau">{scan ? <PdfVorschau daten={vorschau} name={scan} laedt={vorschauLaedt} /> : <div className="muted">Kein Scan gewählt.</div>}</div>
      <div className="ava-eingang-ziel">
        <div className="button-row">
          <button onClick={() => setPruefen(true)} title="Erfassen, Korrektur rechnen, Nummer vergeben, in die Kostenkontrolle eintragen">
            Neue Rechnung prüfen …
          </button>
        </div>
        {hinweis && (
          <div className="ava-ok small-text" role="status">
            {hinweis}
          </div>
        )}
        <h2>Erfasst, noch ohne Scan</h2>
        <ul className="list" role="listbox" aria-label="Erfasste Rechnungen ohne Scan">
          {offene.map((r, i) => (
            <li
              key={r.id}
              role="option"
              tabIndex={0}
              aria-selected={r.id === d?.id}
              className={r.id === d?.id ? 'active' : ''}
              onClick={() => setDatensatz(r.id)}
              onKeyDown={(x) => listenTaste(x, offene, i, (y) => setDatensatz(y.id))}
            >
              <div>
                <strong>Nr. {String(r.nr)}</strong> {gewerkZweistellig(r.gewerk)} {r.firma} {r.art} {r.lfd ?? ''}
              </div>
              <span className="muted small-text">
                {datumKurz(r.rechnungsdatum)} · {euro(r.betrag)}
              </span>
            </li>
          ))}
          {!offene.length && <li className="muted">Keine – erst „Neue Rechnung prüfen“.</li>}
        </ul>
        {(!d || !scan) && offene.length > 0 && (
          <div className="ava-karte ava-eingang-hinweis">
            {!scan ? 'Links einen Scan wählen' : 'Oben die Rechnung wählen, zu der der Scan gehört'}, dann „Zuordnen & ablegen“.
          </div>
        )}
        {d && scan && (
          <div className="ava-karte">
            <div className="small-text">Ablage als</div>
            <div className="ava-dateiname">{rechnungsDateiname(k, d)}</div>
            <div className="muted small-text">in {auftragsordner(k, gewerkOrdner(projekt, d.gewerk), d.gewerk)}</div>
            <label className="ava-check">
              <input type="checkbox" checked={deckblatt} onChange={(x) => setDeckblatt(x.target.checked)} disabled={!/\.pdf$/i.test(scan)} /> Deckblatt digital voranstellen
            </label>
            <button className="primary" disabled={laeuft} onClick={() => void ablegen()}>
              {laeuft ? 'Wird abgelegt …' : 'Zuordnen & ablegen …'}
            </button>
          </div>
        )}
        {abgelegte.length > 0 && (
          <>
            <h2>Abgelegt, noch nicht weitergeleitet</h2>
            <ul className="list">
              {abgelegte.map((r) => (
                <li key={r.id}>
                  <div>
                    Nr. {String(r.nr)} {gewerkZweistellig(r.gewerk)} {r.firma} {r.art} {r.lfd ?? ''}
                  </div>
                  <button className="small" onClick={() => void mail(r)} title="Mailentwurf mit der Rechnung als Anhang öffnen">
                    Mail an Zahler …
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {pruefen && <RechnungPruefen onClose={() => setPruefen(false)} onErfasst={(x) => setDatensatz(x.id)} />}
    </div>
  );
}
