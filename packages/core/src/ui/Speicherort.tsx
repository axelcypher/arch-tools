import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { isTauri } from '../platform/files';
import { bereichName, gleicherPfad, konfigOrt, konfigOrtBeobachten, konfigOrtNeuPruefen, konfigOrtWechseln, konfigZielPruefen } from '../platform/konfig';
import type { KonfigModus, KonfigOrt, KonfigUmzug } from '../platform/konfig';
import { ordnerWaehlen, ordnerZeigen } from '../platform/projektordner';
import { logger } from '../platform/log';
import { Modal } from './Dialog';
import { fehlerText, fragen } from './Rueckfrage';

/**
 * Speicherort der Einstellungen – für alle Apps gleich: Einzelplatz (nur dieser Rechner) oder Netzwerkinstallation
 * (Ordner auf dem Netzlaufwerk, alle Rechner mit demselben Stand). Der Knopf steckt in der Titelleiste jeder App (im
 * Tab des Rahmens nur in dessen Kopfleiste); im Notbetrieb (Netzlaufwerk nicht erreichbar) zeigt er das deutlich an.
 * Nur in der Desktop-App.
 */

const log = logger('konfig');

export const useSpeicherort = create<{ offen: boolean; oeffnen(): void; schliessen(): void }>((set) => ({
  offen: false,
  oeffnen: () => set({ offen: true }),
  schliessen: () => set({ offen: false }),
}));

/** Ort der Einstellungen: `undefined` = wird gelesen, `null` = Browser, `'fehler'` = nicht lesbar */
export type KonfigOrtAnzeige = KonfigOrt | null | undefined | 'fehler';

/** aktueller Ort der Einstellungen – folgt Wechsel und Notbetrieb */
export function useKonfigOrt(): KonfigOrtAnzeige {
  const [ort, setOrt] = useState<KonfigOrtAnzeige>(() => (isTauri() ? undefined : null));
  useEffect(() => {
    if (!isTauri()) return;
    let aktiv = true;
    let gemeldet = false;
    const ab = konfigOrtBeobachten((o) => {
      gemeldet = true;
      if (aktiv) setOrt(o);
    });
    // das erste Ergebnis nur, solange noch keine neuere Meldung kam
    void konfigOrt().then(
      (o) => aktiv && !gemeldet && setOrt(o),
      (e) => {
        log.error('Speicherort der Einstellungen nicht lesbar', e);
        if (aktiv && !gemeldet) setOrt('fehler');
      },
    );
    return () => {
      aktiv = false;
      ab();
    };
  }, []);
  return ort;
}

const MODUS_TEXT: Record<KonfigModus, string> = { einzelplatz: 'Einzelplatz', netzwerk: 'Netzwerkinstallation' };
/** einheitliche Anzeige des Orts: Einzelplatz ohne Pfad (der steht im Tooltip), Netzwerk mit dem Ordner */
const ortText = (o: KonfigOrt) => `${MODUS_TEXT[o.modus]} – ${o.modus === 'netzwerk' ? o.ordner : 'nur auf diesem Rechner'}`;

/** kleines Symbol „Ablage“ (Laufwerk) für die Titelleiste */
function AblageSymbol() {
  return (
    <svg className="sp-symbol" viewBox="0 0 12 12" aria-hidden>
      <rect x="1" y="2" width="10" height="3.5" rx="1" />
      <rect x="1" y="6.5" width="10" height="3.5" rx="1" />
      <path d="M3 3.75h.01M3 8.25h.01" />
    </svg>
  );
}

/** Knopf in der Titelleiste: zeigt den Ort kurz an und öffnet den Dialog; im Notbetrieb als Warnung */
export function SpeicherortKnopf() {
  const ort = useKonfigOrt();
  const oeffnen = useSpeicherort((s) => s.oeffnen);
  if (!ort) return null;
  if (ort === 'fehler') {
    return (
      <button className="titlebar-btn titlebar-notbetrieb" title="Speicherort der Einstellungen nicht lesbar – Einzelheiten im Protokoll" onClick={oeffnen}>
        <span aria-hidden>⚠</span> Einstellungen
      </button>
    );
  }
  if (ort.notbetrieb) {
    return (
      <button className="titlebar-btn titlebar-notbetrieb" title={`Netzlaufwerk mit den Einstellungen nicht erreichbar (${ort.ordner}) – Einstellungen nur lesbar`} onClick={oeffnen}>
        <span aria-hidden>⚠</span> Einstellungen nur lesbar
      </button>
    );
  }
  return (
    <button
      className="titlebar-btn"
      title={`Speicherort der Einstellungen: ${ortText(ort)}${ort.modus === 'einzelplatz' ? ` (${ort.ordner})` : ''}`}
      aria-label={`Speicherort der Einstellungen: ${ort.modus === 'netzwerk' ? 'Netzwerk' : 'Einzelplatz'}`}
      onClick={oeffnen}
    >
      {/* in schmalen Fenstern nur das Symbol (base.css, .titlebar-text) */}
      <AblageSymbol /> <span className="titlebar-text">{ort.modus === 'netzwerk' ? 'Netzwerk' : 'Einzelplatz'}</span>
    </button>
  );
}

/** Dialog, solange geöffnet (steckt in der Titelleiste bzw. im Rahmen) */
export function SpeicherortHost() {
  const { offen, schliessen } = useSpeicherort();
  return offen && isTauri() ? <SpeicherortDialog onClose={schliessen} /> : null;
}

/** Zeile mit dem aktuellen Ort und „Ändern …“ – z. B. in den gemeinsamen Einstellungen einer App */
export function SpeicherortZeile() {
  const ort = useKonfigOrt();
  const oeffnen = useSpeicherort((s) => s.oeffnen);
  if (ort === null) return <p className="muted small-text">Im Browser liegen die Einstellungen im Speicher dieses Browsers.</p>;
  const echt = ort && ort !== 'fehler' ? ort : null;
  return (
    <div className="sp-zeile">
      <div>
        <span className="field-label">Speicherort der Einstellungen</span>
        <code title={echt?.ordner}>{echt ? ortText(echt) : ort === 'fehler' ? 'nicht lesbar – Einzelheiten im Protokoll' : 'wird gelesen …'}</code>
      </div>
      <button className="small" onClick={oeffnen}>
        Ändern …
      </button>
      {echt?.notbetrieb && <p className="warning sp-voll">Das Netzlaufwerk ist nicht erreichbar – die Einstellungen sind nur lesbar (lokale Kopie).</p>}
    </div>
  );
}

export function SpeicherortDialog({ onClose }: { onClose: () => void }) {
  const anzeige = useKonfigOrt();
  const ort = anzeige && anzeige !== 'fehler' ? anzeige : null;
  const [modus, setModus] = useState<KonfigModus | null>(null);
  const [netzordner, setNetzordner] = useState<string | null>(null);
  /** was gerade läuft: Netzlaufwerk prüfen oder wechseln */
  const [laeuft, setLaeuft] = useState<'pruefen' | 'wechseln' | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'fehler'; text: string } | null>(null);

  const gewaehlt = modus ?? ort?.modus ?? 'einzelplatz';
  const ordner = netzordner ?? (ort?.modus === 'netzwerk' ? ort.ordner : (ort?.netzordner ?? ''));
  const unveraendert = !!ort && gewaehlt === ort.modus && (gewaehlt === 'einzelplatz' || gleicherPfad(ordner, ort.ordner));
  const ohneOrdner = gewaehlt === 'netzwerk' && !ordner;
  const wechselnGesperrt = !!laeuft || !ort || unveraendert || ohneOrdner;
  const wechselnTitel = !ort ? 'Speicherort wird gelesen' : unveraendert ? 'Der Speicherort ist unverändert' : ohneOrdner ? 'Erst einen Ordner auf dem Netzlaufwerk wählen' : undefined;

  const waehlen = async () => {
    try {
      const p = await ordnerWaehlen('Ordner für die Einstellungen auf dem Netzlaufwerk wählen');
      if (!p) return;
      setNetzordner(p);
      setModus('netzwerk');
      setMeldung(null);
    } catch (e) {
      setMeldung({ art: 'fehler', text: `Ordner nicht gewählt: ${fehlerText(e)}` });
    }
  };

  const erneut = async () => {
    setLaeuft('pruefen');
    const war = anzeige;
    const o = await konfigOrtNeuPruefen().catch((e: unknown) => {
      log.error('Speicherort der Einstellungen nicht lesbar', e);
      return null;
    });
    setLaeuft(null);
    if (war === 'fehler') setMeldung(o ? { art: 'ok', text: 'Der Speicherort ist wieder lesbar.' } : { art: 'fehler', text: 'Der Speicherort ist weiterhin nicht lesbar.' });
    else setMeldung(o && !o.notbetrieb ? { art: 'ok', text: 'Das Netzlaufwerk ist wieder erreichbar.' } : { art: 'fehler', text: 'Das Netzlaufwerk ist weiterhin nicht erreichbar.' });
  };

  const wechseln = async () => {
    setMeldung(null);
    setLaeuft('wechseln');
    try {
      const ziel = { modus: gewaehlt, ordner };
      const pruefung = await konfigZielPruefen(ziel);
      if (!pruefung) return;
      if (pruefung.gleich) {
        setMeldung({ art: 'ok', text: 'Dieser Speicherort ist bereits gewählt.' });
        return;
      }
      if (!pruefung.erreichbar) {
        setMeldung({ art: 'fehler', text: `${pruefung.ordner} ist nicht erreichbar. Bitte Netzlaufwerk und Pfad prüfen – es wurde nichts geändert.` });
        return;
      }
      let umzug: KonfigUmzug = 'uebernehmen';
      if (pruefung.vorhanden.length) {
        const antwort = await fragen<KonfigUmzug | 'abbrechen'>({
          titel: 'Dort liegen schon Einstellungen',
          text:
            `Im Ordner ${pruefung.ordner} liegen bereits:\n${pruefung.vorhanden.map((b) => `• ${bereichName(b)}`).join('\n')}\n\n` +
            '„Vorhandene übernehmen“: Diese gelten, nur Fehlendes kommt von hier dazu (z. B. beim Anschluss eines weiteren Rechners).\n' +
            '„Mit diesem Rechner überschreiben“: Die Einstellungen von diesem Rechner ersetzen die dort liegenden; die bisherigen bleiben als Sicherung im Ordner.',
          knoepfe: [
            { id: 'abbrechen', label: 'Abbrechen' },
            { id: 'ersetzen', label: 'Mit diesem Rechner überschreiben', art: 'danger' },
            { id: 'uebernehmen', label: 'Vorhandene übernehmen', art: 'primary' },
          ],
        });
        if (!antwort || antwort === 'abbrechen') return;
        umzug = antwort;
      }
      const r = await konfigOrtWechseln(ziel, umzug);
      const wo = gewaehlt === 'netzwerk' ? `Die Einstellungen liegen jetzt in ${pruefung.ordner} (Netzwerkinstallation).` : 'Die Einstellungen liegen jetzt nur auf diesem Rechner (Einzelplatz).';
      const mit = r.kopiert.length ? ` Mitgenommen: ${r.kopiert.map(bereichName).join(', ')}.` : '';
      const sicher = r.gesichert.length ? ` Gesichert vor dem Ersetzen: ${r.gesichert.map(bereichName).join(', ')}.` : '';
      log.info(`Speicherort gewechselt: ${gewaehlt} ${pruefung.ordner} (${umzug}; kopiert ${r.kopiert.join(', ') || '–'})`);
      setModus(null);
      setNetzordner(null);
      setMeldung({ art: 'ok', text: `${wo}${mit}${sicher}` });
    } catch (e) {
      log.error('Speicherort nicht gewechselt', e);
      setMeldung({ art: 'fehler', text: fehlerText(e) });
    } finally {
      setLaeuft(null);
    }
  };

  return (
    <Modal titel="Speicherort der Einstellungen" onClose={laeuft ? undefined : onClose} breit klickDaneben={!laeuft}>
      <h3>Speicherort der Einstellungen</h3>
      <p className="small-text muted">Gilt für alle Apps – für dieses Benutzerkonto auf diesem Rechner.</p>
      {anzeige === 'fehler' && (
        <div className="warning sp-notbetrieb" role="status">
          <span>Der Speicherort ist nicht lesbar – Einzelheiten im Protokoll.</span>
          <button className="small" disabled={!!laeuft} onClick={() => void erneut()}>
            {laeuft === 'pruefen' ? 'Wird geprüft …' : 'Erneut versuchen'}
          </button>
        </div>
      )}
      {ort && (
        <div className="sp-aktuell">
          <span className="field-label">Aktuell</span>
          <div className="sp-ort">
            <code title={ort.ordner}>{ortText(ort)}</code>
            <button
              className="small"
              disabled={ort.notbetrieb}
              title={ort.notbetrieb ? 'Netzlaufwerk nicht erreichbar' : ort.ordner}
              onClick={() => void ordnerZeigen(ort.ordner).catch((e) => setMeldung({ art: 'fehler', text: fehlerText(e) }))}
            >
              Im Explorer zeigen
            </button>
          </div>
          {ort.notbetrieb && (
            <div className="warning sp-notbetrieb" role="status">
              <span>
                Das Netzlaufwerk ist nicht erreichbar. Die Apps arbeiten mit der lokalen Kopie der Einstellungen weiter; Änderungen daran werden nicht gespeichert, damit nichts von anderen Rechnern
                überschrieben wird.
              </span>
              <button className="small" disabled={!!laeuft} onClick={() => void erneut()}>
                {laeuft === 'pruefen' ? 'Wird geprüft …' : 'Erneut versuchen'}
              </button>
            </div>
          )}
        </div>
      )}

      <fieldset className="sp-wahl" disabled={!!laeuft}>
        <legend className="field-label">Installation</legend>
        <label className="radio-row">
          <input type="radio" name="sp-modus" checked={gewaehlt === 'einzelplatz'} onChange={() => setModus('einzelplatz')} />
          <span>
            <strong>Einzelplatz</strong>
            <br />
            <span className="small-text muted">Die Einstellungen liegen nur auf diesem Rechner.</span>
          </span>
        </label>
        <label className="radio-row">
          <input type="radio" name="sp-modus" checked={gewaehlt === 'netzwerk'} onChange={() => setModus('netzwerk')} />
          <span>
            <strong>Netzwerkinstallation</strong>
            <br />
            <span className="small-text muted">Die Einstellungen liegen in einem Ordner auf dem Netzlaufwerk (NAS, Server) – alle Rechner, die ihn wählen, haben denselben Stand.</span>
          </span>
        </label>
        {gewaehlt === 'netzwerk' && (
          <div className="sp-ort indent">
            <code title={ordner}>{ordner || 'noch kein Ordner gewählt'}</code>
            <button className="small" onClick={() => void waehlen()}>
              Ordner wählen …
            </button>
          </div>
        )}
      </fieldset>
      <p className="small-text muted">Immer nur auf diesem Rechner bleiben: zuletzt geöffnete und angeheftete Projekte, Fenster, Farbschema und Leistenbreiten.</p>

      {meldung && (
        <p className={meldung.art === 'fehler' ? 'meldung fehler' : 'meldung ok'} role={meldung.art === 'fehler' ? 'alert' : 'status'}>
          {meldung.text}
        </p>
      )}
      <div className="dialog-buttons">
        <button onClick={onClose} disabled={!!laeuft}>
          Schließen
        </button>
        <button className="primary" disabled={wechselnGesperrt} title={wechselnTitel} onClick={() => void wechseln()}>
          {laeuft === 'wechseln' ? 'Bitte warten …' : 'Speicherort wechseln'}
        </button>
      </div>
    </Modal>
  );
}
