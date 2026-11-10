import { useState } from 'react';
import { hatDateisystem, oeffneOrdner, waehleOrdner, waehleOrdnerImBrowser } from '../dateisystem';
import type { Ergebnis, Herkunft, Plan } from '../plan';
import { useOrdner } from '../store';
import type { Struktur } from '../struktur';
import { aktivePresets } from '../struktur';

/** Bausteine, die „Neues Projekt“, „Projekt aktualisieren“ und „Vorlagen“ gemeinsam nutzen */

const HERKUNFT: Record<Herkunft, string> = { struktur: 'Struktur', vorlage: 'Vorlage', stammdaten: 'Stammdaten', flaechen: 'leere Flächenberechnung' };

/**
 * Trockenlauf als Baum: jeder Ordner und jede Datei mit Herkunft und dem Vermerk „neu“ oder „vorhanden“.
 * Mit `abgewaehlt`/`onUmschalten` lassen sich neue Einträge abwählen – mit einem Ordner entfällt alles darin.
 */
export function PlanTabelle({ plan, abgewaehlt, onUmschalten, nurNeu = false }: { plan: Plan; abgewaehlt?: Set<string>; onUmschalten?: (pfad: string) => void; nurNeu?: boolean }) {
  const weg = [...(abgewaehlt ?? [])].map((p) => p.toLowerCase());
  const entfaellt = (pfad: string) => weg.some((w) => pfad.toLowerCase() === w || pfad.toLowerCase().startsWith(`${w}/`));
  // nur Neues: Ordner bleiben stehen, wenn darin etwas neu ist (sonst fehlt im Baum der Zusammenhang)
  const neuDarin = (pfad: string) => plan.schritte.some((x) => !x.vorhanden && (x.pfad === pfad || x.pfad.startsWith(`${pfad}/`)));
  const zeilen = nurNeu ? plan.schritte.filter((s) => !s.vorhanden || (s.art === 'ordner' && neuDarin(s.pfad))) : plan.schritte;
  if (!zeilen.length) return <p className="muted small-text">Es fehlt nichts – alles ist schon vorhanden.</p>;
  return (
    <div className="po-plan">
      <table className="po-table">
        <tbody>
          {zeilen.map((s) => {
            const tiefe = s.pfad.split('/').length - 1;
            const aus = entfaellt(s.pfad);
            const herkunft = s.art === 'datei' || s.herkunft === 'vorlage' ? `${HERKUNFT[s.herkunft]}${s.preset ? ` · ${s.preset}` : ''}` : '';
            return (
              <tr key={`${s.art}:${s.pfad}`} className={`${s.vorhanden ? 'vorhanden' : ''}${aus ? ' abgewaehlt' : ''}`}>
                <td style={{ paddingLeft: 6 + tiefe * 16 }} title={s.pfad}>
                  {onUmschalten && !s.vorhanden && (
                    <input
                      type="checkbox"
                      className="po-wahl"
                      checked={!aus}
                      // mit einem abgewählten Ordner ist auch sein Inhalt abgewählt
                      disabled={aus && !weg.includes(s.pfad.toLowerCase())}
                      title={aus ? 'wird nicht angelegt' : 'abwählen: wird nicht angelegt'}
                      onChange={() => onUmschalten(s.pfad)}
                    />
                  )}
                  <span className={`po-art ${s.art}`} aria-hidden />
                  {/* mit anderem Datum vorhanden: die vorhandene Datei zeigen */}
                  {(s.vorhandenAls ?? s.pfad).split('/').pop()}
                </td>
                <td className="muted small-text" title={s.quelle ? `aus dem Vorlagenordner: ${s.quelle}` : undefined}>
                  {herkunft}
                </td>
                <td className="po-status" title={s.vorhandenAls ? `mit anderem Datum vorhanden – nach dem Schema hieße sie heute ${s.pfad.split('/').pop()}` : undefined}>
                  {aus ? 'abgewählt' : s.vorhandenAls ? 'vorhanden*' : s.vorhanden ? 'vorhanden' : 'neu'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Fehler, Warnungen und Hinweise eines Plans */
export function PlanMeldungen({ plan }: { plan: Plan }) {
  return (
    <>
      {plan.fehler.map((f) => (
        <p key={f} className="warning">
          {f}
        </p>
      ))}
      {plan.warnungen.length > 0 && (
        <ul className="po-hinweise po-warnungen">
          {plan.warnungen.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}
      {plan.hinweise.length > 0 && (
        <ul className="po-hinweise">
          {plan.hinweise.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Vorlagenordner: anzeigen, wählen, neu einlesen, abwählen */
export function VorlagenordnerZeile({ leerText = 'keiner – es entstehen nur Ordner, Stammdaten und die leere Flächenberechnung' }: { leerText?: string }) {
  const desktop = hatDateisystem();
  const { vorlagenordner, vorlagenName, vorlagen, vorlagenFehler, vorlagenLaden, setVorlagenordner, ladeVorlagen, setVorlagenImBrowser } = useOrdner();
  const gewaehlt = desktop ? vorlagenordner : vorlagenName;
  const waehlen = async () => {
    if (desktop) {
      const p = await waehleOrdner('Vorlagenordner wählen');
      if (p) setVorlagenordner(p);
      return;
    }
    const o = await waehleOrdnerImBrowser();
    if (o) setVorlagenImBrowser(o.name, o.eintraege.filter((e) => !e.ordner).map((e) => ({ pfad: e.pfad, lies: () => o.lies(e.pfad) })));
  };
  const anzahl = vorlagen.length;
  return (
    <>
      <div className="po-ort">
        <div>
          <span className="field-label">
            Vorlagenordner
            {gewaehlt && <span className="muted"> – {vorlagenLaden ? 'wird gelesen …' : `${anzahl} ${anzahl === 1 ? 'Datei' : 'Dateien'}`}</span>}
          </span>
          <code title={vorlagenordner}>{gewaehlt || leerText}</code>
        </div>
        <button className="small" onClick={() => void waehlen()}>
          Wählen …
        </button>
        {desktop && vorlagenordner && (
          <button className="small" title="Vorlagenordner neu einlesen – nach Änderungen an den Vorlagen" disabled={vorlagenLaden} onClick={() => void ladeVorlagen()}>
            Neu einlesen
          </button>
        )}
        {gewaehlt && (
          <button
            className="small"
            title="Ohne Vorlagenordner arbeiten"
            onClick={() => {
              setVorlagenordner('');
              setVorlagenImBrowser('', []);
            }}
          >
            Ohne Vorlagen
          </button>
        )}
      </div>
      {vorlagenFehler && <p className="warning">{vorlagenFehler}</p>}
    </>
  );
}

/**
 * Auswahl der Vorlagen-Presets für ein Projekt. `auswahl` nicht gesetzt = die Standard-Presets der Struktur.
 */
export function PresetAuswahl({ struktur, auswahl, onChange }: { struktur: Struktur; auswahl: string[] | undefined; onChange: (auswahl: string[]) => void }) {
  const { presets, unbekannt } = aktivePresets(struktur, auswahl);
  const gewaehlt = new Set(presets.map((p) => p.name));
  if (!struktur.presets.length && !unbekannt.length) return <p className="muted small-text">Keine Presets – unter „Vorlagen“ lassen sich welche anlegen.</p>;
  const umschalten = (name: string) => onChange(gewaehlt.has(name) ? presets.map((p) => p.name).filter((n) => n !== name) : struktur.presets.map((p) => p.name).filter((n) => n === name || gewaehlt.has(n)));
  return (
    <div className="po-presetwahl">
      {struktur.presets.map((p) => (
        <label key={p.name} className="toggle" title={`${p.eintraege.length} ${p.eintraege.length === 1 ? 'Zuordnung' : 'Zuordnungen'}${p.standard ? ' – bei neuen Projekten vorausgewählt' : ''}`}>
          <input type="checkbox" checked={gewaehlt.has(p.name)} onChange={() => umschalten(p.name)} />
          {p.name}
          {p.standard && <span className="muted"> (Standard)</span>}
        </label>
      ))}
      {unbekannt.map((n) => (
        <span key={n} className="po-unbekannt" title="In der projekt.json gewählt, in der Struktur aber nicht vorhanden">
          {n} (unbekannt)
        </span>
      ))}
    </div>
  );
}

/** Ergebnis eines Laufs: angelegt, schon vorhanden, fehlgeschlagen */
export function ErgebnisAnzeige({ ordner, liste, children }: { ordner: string; liste: Ergebnis[]; children?: React.ReactNode }) {
  const [fehler, setFehler] = useState<string | null>(null);
  const angelegt = liste.filter((x) => x.status === 'angelegt').length;
  const unveraendert = liste.filter((x) => x.status === 'vorhanden').length;
  const fehlgeschlagen = liste.filter((x) => x.status === 'fehler');
  return (
    <div className={`po-ergebnis${fehlgeschlagen.length ? ' fehler' : ''}`}>
      <strong>
        {angelegt} angelegt{unveraendert ? `, ${unveraendert} schon vorhanden` : ''}
        {fehlgeschlagen.length ? `, ${fehlgeschlagen.length} fehlgeschlagen` : ''}
      </strong>
      {ordner && <code>{ordner}</code>}
      {fehlgeschlagen.length > 0 && (
        <ul>
          {fehlgeschlagen.map((f) => (
            <li key={f.schritt.pfad}>
              {f.schritt.pfad}: {f.meldung}
            </li>
          ))}
        </ul>
      )}
      {fehler && <p className="warning">{fehler}</p>}
      <div className="button-row">
        {ordner && (
          <button className="small" onClick={() => void oeffneOrdner(ordner).catch((e) => setFehler(String(e)))}>
            Ordner öffnen
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
