import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { isTauri } from '../platform/files';
import { bereichName, konfigOrt, konfigOrtBeobachten, konfigOrtNeuPruefen, konfigOrtWechseln, konfigZielPruefen } from '../platform/konfig';
import type { KonfigModus, KonfigOrt, KonfigUmzug } from '../platform/konfig';
import { ordnerWaehlen, ordnerZeigen } from '../platform/projektordner';
import { logger } from '../platform/log';
import { Modal } from './Dialog';
import { fehlerText, fragen } from './Rueckfrage';

/**
 * Speicherort der Einstellungen – für alle Apps gleich: Einzelplatz (nur dieser Rechner) oder Netzwerkinstallation
 * (Ordner auf dem Netzlaufwerk, alle Rechner mit demselben Stand). Der Knopf steckt in der Titelleiste jeder App und
 * im Rahmen; im Notbetrieb (Netzlaufwerk nicht erreichbar) zeigt er das deutlich an. Nur in der Desktop-App.
 */

const log = logger('konfig');

export const useSpeicherort = create<{ offen: boolean; oeffnen(): void; schliessen(): void }>((set) => ({
  offen: false,
  oeffnen: () => set({ offen: true }),
  schliessen: () => set({ offen: false }),
}));

/** aktueller Ort der Einstellungen (`undefined` = wird gelesen, `null` = Browser) – folgt Wechsel und Notbetrieb */
export function useKonfigOrt(): KonfigOrt | null | undefined {
  const [ort, setOrt] = useState<KonfigOrt | null | undefined>(undefined);
  useEffect(() => {
    let aktiv = true;
    void konfigOrt().then(
      (o) => aktiv && setOrt(o),
      () => aktiv && setOrt(null),
    );
    const ab = konfigOrtBeobachten((o) => aktiv && setOrt(o));
    return () => {
      aktiv = false;
      ab();
    };
  }, []);
  return ort;
}

const MODUS_TEXT: Record<KonfigModus, string> = { einzelplatz: 'Einzelplatz', netzwerk: 'Netzwerkinstallation' };

/** Knopf in der Titelleiste: öffnet den Dialog; im Notbetrieb als Warnung */
export function SpeicherortKnopf() {
  const ort = useKonfigOrt();
  const oeffnen = useSpeicherort((s) => s.oeffnen);
  if (!isTauri() || !ort) return null;
  if (ort.notbetrieb) {
    return (
      <button className="titlebar-btn titlebar-notbetrieb" title={`Netzlaufwerk mit den Einstellungen nicht erreichbar (${ort.ordner}) – Einstellungen nur lesbar`} onClick={oeffnen}>
        <span aria-hidden>⚠</span> Einstellungen nur lesbar
      </button>
    );
  }
  const wo = ort.modus === 'netzwerk' ? `Netzwerkinstallation: ${ort.ordner}` : 'Einzelplatz: nur auf diesem Rechner';
  return (
    <button className="titlebar-btn" title={`Speicherort der Einstellungen – ${wo}`} aria-label="Speicherort der Einstellungen" onClick={oeffnen}>
      <span aria-hidden>⚙</span>
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
  return (
    <div className="sp-zeile">
      <div>
        <span className="field-label">Speicherort der Einstellungen</span>
        <code title={ort?.ordner}>{ort ? `${MODUS_TEXT[ort.modus]} – ${ort.modus === 'netzwerk' ? ort.ordner : 'nur auf diesem Rechner'}` : 'wird gelesen …'}</code>
      </div>
      <button className="small" onClick={oeffnen}>
        Ändern …
      </button>
      {ort?.notbetrieb && <p className="warning sp-voll">Das Netzlaufwerk ist nicht erreichbar – die Einstellungen sind nur lesbar (lokale Kopie).</p>}
    </div>
  );
}

export function SpeicherortDialog({ onClose }: { onClose: () => void }) {
  const ort = useKonfigOrt();
  const [modus, setModus] = useState<KonfigModus | null>(null);
  const [netzordner, setNetzordner] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'fehler'; text: string } | null>(null);

  const gewaehlt = modus ?? ort?.modus ?? 'einzelplatz';
  const ordner = netzordner ?? (ort?.modus === 'netzwerk' ? ort.ordner : (ort?.netzordner ?? ''));
  const unveraendert = !!ort && gewaehlt === ort.modus && (gewaehlt === 'einzelplatz' || ordner === ort.ordner);

  const waehlen = async () => {
    const p = await ordnerWaehlen('Ordner für die Einstellungen auf dem Netzlaufwerk wählen');
    if (p) {
      setNetzordner(p);
      setModus('netzwerk');
      setMeldung(null);
    }
  };

  const erneut = async () => {
    setLaeuft(true);
    const o = await konfigOrtNeuPruefen().catch(() => null);
    setLaeuft(false);
    setMeldung(o && !o.notbetrieb ? { art: 'ok', text: 'Das Netzlaufwerk ist wieder erreichbar.' } : { art: 'fehler', text: 'Das Netzlaufwerk ist weiterhin nicht erreichbar.' });
  };

  const uebernehmen = async () => {
    setMeldung(null);
    setLaeuft(true);
    try {
      const ziel = { modus: gewaehlt, ordner };
      const pruefung = await konfigZielPruefen(ziel);
      if (!pruefung) return;
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
            '„Mit meinen ersetzen“: Die Einstellungen von hier überschreiben sie; die bisherigen bleiben als Sicherung im Ordner.',
          knoepfe: [
            { id: 'abbrechen', label: 'Abbrechen' },
            { id: 'ersetzen', label: 'Mit meinen ersetzen', art: 'danger' },
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
      setLaeuft(false);
    }
  };

  return (
    <Modal titel="Speicherort der Einstellungen" onClose={laeuft ? undefined : onClose} breit klickDaneben={!laeuft}>
      <h3>Speicherort der Einstellungen</h3>
      <p className="small-text muted">Gilt für alle Apps auf diesem Rechner für diesen Benutzer.</p>
      {ort && (
        <div className="sp-aktuell">
          <span className="field-label">Aktuell</span>
          <div className="sp-ort">
            <code title={ort.ordner}>
              {MODUS_TEXT[ort.modus]} – {ort.ordner}
            </code>
            <button className="small" disabled={ort.notbetrieb} onClick={() => void ordnerZeigen(ort.ordner).catch((e) => setMeldung({ art: 'fehler', text: fehlerText(e) }))}>
              Im Explorer zeigen
            </button>
          </div>
          {ort.notbetrieb && (
            <div className="warning sp-notbetrieb" role="status">
              <span>
                Das Netzlaufwerk ist nicht erreichbar. Die Apps arbeiten mit der lokalen Kopie der Einstellungen weiter; Änderungen daran werden nicht gespeichert, damit nichts von anderen Rechnern
                überschrieben wird.
              </span>
              <button className="small" disabled={laeuft} onClick={() => void erneut()}>
                Erneut versuchen
              </button>
            </div>
          )}
        </div>
      )}

      <fieldset className="sp-wahl" disabled={laeuft}>
        <legend className="field-label">Installation</legend>
        <label className="radio-row">
          <input type="radio" name="sp-modus" checked={gewaehlt === 'einzelplatz'} onChange={() => setModus('einzelplatz')} />
          <span>
            <strong>Einzelplatz</strong>
            <br />
            <span className="small-text muted">Die Einstellungen liegen nur auf diesem Rechner{ort ? ` (${ort.basis})` : ''}.</span>
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
        <p className={meldung.art === 'fehler' ? 'warning' : 'sp-meldung'} role={meldung.art === 'fehler' ? 'alert' : 'status'}>
          {meldung.text}
        </p>
      )}
      <div className="dialog-buttons">
        <button onClick={onClose} disabled={laeuft}>
          Schließen
        </button>
        <button className="primary" disabled={laeuft || !ort || unveraendert || (gewaehlt === 'netzwerk' && !ordner)} onClick={() => void uebernehmen()}>
          {laeuft ? 'Bitte warten …' : 'Wechseln'}
        </button>
      </div>
    </Modal>
  );
}
