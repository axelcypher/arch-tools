import { useCallback, useEffect, useState } from 'react';
import { bestaetigen, frageText, meldung } from '@core/ui/Rueckfrage';
import { ordnerWaehlen } from '@core/platform/projektordner';
import type { OrdnerEintrag } from '@core/projektdatei';
import { mailEntwurf, rechnungsDateiname, scanAblegen, auftragsordner } from '../../abrechnung/ablauf';
import { gewerkZweistellig } from '../../abrechnung/gewerk';
import { euro } from '../../abrechnung/pruefung';
import type { RechnungsDatensatz } from '../../avaDaten';
import { gewerkOrdner, useAva } from '../../store';
import { datumKurz } from '../eingaben';
import { PdfVorschau } from '../PdfVorschau';
import { RechnungPruefen } from './RechnungPruefen';

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
  const [datensatz, setDatensatz] = useState<string | null>(null);
  const [deckblatt, setDeckblatt] = useState(e.rechnungen.deckblattVoranstellen);
  const [pruefen, setPruefen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const ordner = e.scan.ordner.trim();
  const offene = projekt.ava.rechnungen.filter((r) => r.status === 'erfasst' && !r.datei);
  const abgelegte = projekt.ava.rechnungen.filter((r) => r.status === 'abgelegt' && r.datei);
  const d = projekt.ava.rechnungen.find((r) => r.id === datensatz) ?? offene[offene.length - 1];

  const laden = useCallback(async () => {
    if (!ordner) return;
    try {
      const liste = await fs.liste(ordner, 1);
      const endungen = new RegExp(`\\.(${e.scan.endungen.join('|')})$`, 'i');
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
    void fs.lies(ordner, name).then((r) => aktuell && setVorschau(r?.daten ?? null), () => aktuell && setVorschau(null));
    return () => {
      aktuell = false;
    };
  }, [gewaehlt, scans, ordner, fs]);

  const scan = gewaehlt ?? scans?.[0]?.pfad ?? null;
  const k = useAva.getState().kontext()!;

  const ablegen = async () => {
    if (!scan || !d) return;
    const g = gewerkOrdner(projekt, d.gewerk);
    let name = rechnungsDateiname(k, d);
    const ziel = `${auftragsordner(k, g, d.gewerk)}/${name}`;
    const anders = await frageText('Scan ablegen', name, 'Ablegen', `„${scan}“ wird umbenannt und verschoben nach\n${auftragsordner(k, g, d.gewerk)}${deckblatt ? '\n– mit dem Deckblatt als erster Seite' : ''}`);
    if (!anders) return;
    name = /\.pdf$/i.test(anders) || !/\.pdf$/i.test(scan) ? anders : `${anders}.pdf`;
    setLaeuft(true);
    try {
      const r = await scanAblegen(k, d, g, { ordner, datei: scan }, { deckblatt, name });
      useAva.setState((s) => (s.projekt ? { projekt: { ...s.projekt, ava: r.ava } } : {}));
      setGewaehlt(null);
      await laden();
      await useAva.getState().neuLaden();
      const abgelegt = r.ava.rechnungen.find((x) => x.id === d.id)!;
      if (await bestaetigen('Abgelegt', `${r.pfad}\n\nMailentwurf an den Zahler öffnen?`, 'Mail öffnen')) await mail(abgelegt);
    } catch (x) {
      await meldung('Scan nicht abgelegt', `${ziel}: ${x instanceof Error ? x.message : String(x)}`, x);
    } finally {
      setLaeuft(false);
    }
  };

  const mail = async (r: RechnungsDatensatz) => {
    const vorlage = e.mail.vorlagen.find((v) => v.id === 'rechnung') ?? e.mail.vorlagen[0];
    if (!vorlage) return;
    try {
      const ava = await mailEntwurf(k, r, useAva.getState().projekt!.ava, vorlage);
      useAva.setState((s) => (s.projekt ? { projekt: { ...s.projekt, ava } } : {}));
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
              if (o) await useAva.getState().einstellungenSetzen({ ...e, scan: { ...e.scan, ordner: o } });
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
        <ul className="list">
          {scans?.map((s) => (
            <li key={s.pfad} className={s.pfad === scan ? 'active' : ''} onClick={() => setGewaehlt(s.pfad)} onDoubleClick={() => void fs.oeffnen(`${ordner.replace(/[\\/]+$/, '')}${ordner.includes('\\') ? '\\' : '/'}${s.pfad}`)}>
              <div>{s.pfad}</div>
              <span className="muted small-text">
                {zeit(s.geaendert ?? 0)} · {Math.round(s.groesse / 1024)} KB
              </span>
            </li>
          ))}
          {scans && !scans.length && <li className="muted">Keine Scans im Scanordner.</li>}
        </ul>
      </div>
      <div className="ava-eingang-vorschau">{scan ? <PdfVorschau daten={vorschau} name={scan} /> : <div className="muted">Kein Scan gewählt.</div>}</div>
      <div className="ava-eingang-ziel">
        <div className="button-row">
          <button className="primary" onClick={() => setPruefen(true)} title="Erfassen, Korrektur rechnen, Nummer vergeben, in die Kostenkontrolle eintragen">
            Neue Rechnung prüfen …
          </button>
        </div>
        <h2>Erfasst, noch ohne Scan</h2>
        <ul className="list">
          {offene.map((r) => (
            <li key={r.id} className={r.id === d?.id ? 'active' : ''} onClick={() => setDatensatz(r.id)}>
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
