import { useState } from 'react';
import { hatDateisystem, oeffneOrdner, waehleOrdner, waehleOrdnerImBrowser } from '../dateisystem';
import type { Ergebnis, Herkunft, Plan, PresetAbweichung } from '../plan';
import { tutEtwas, vorlagenAnzahl } from '../plan';
import { useOrdner } from '../store';
import type { Struktur } from '../struktur';
import { aktivePresets } from '../struktur';

/** Bausteine, die der Assistent und „Vorlagen“ gemeinsam nutzen */

const HERKUNFT: Record<Herkunft, string> = { struktur: 'Struktur', vorlage: 'Vorlage', projektdatei: 'Projektdatei mit Stammdaten' };

/**
 * Trockenlauf als Baum: jeder Ordner und jede Datei mit Herkunft und dem Vermerk „neu“ oder „vorhanden“.
 * Mit `abgewaehlt`/`onUmschalten` lassen sich neue Einträge abwählen – mit einem Ordner entfällt alles darin.
 * `neuOhneVermerk` (neues Projekt): „neu“ wäre in jeder Zeile reines Rauschen – dann nur Abweichungen vermerken.
 */
export function PlanTabelle({
  plan,
  abgewaehlt,
  onUmschalten,
  nurNeu = false,
  neuOhneVermerk = false,
}: {
  plan: Plan;
  abgewaehlt?: Set<string>;
  onUmschalten?: (pfad: string) => void;
  nurNeu?: boolean;
  neuOhneVermerk?: boolean;
}) {
  const weg = [...(abgewaehlt ?? [])].map((p) => p.toLowerCase());
  const entfaellt = (pfad: string) => weg.some((w) => pfad.toLowerCase() === w || pfad.toLowerCase().startsWith(`${w}/`));
  // nur Neues: Ordner bleiben stehen, wenn darin etwas neu ist (sonst fehlt im Baum der Zusammenhang)
  const neuDarin = (pfad: string) => plan.schritte.some((x) => tutEtwas(x) && (x.pfad === pfad || x.pfad.startsWith(`${pfad}/`)));
  const zeilen = nurNeu ? plan.schritte.filter((s) => tutEtwas(s) || (s.art === 'ordner' && neuDarin(s.pfad))) : plan.schritte;
  if (!zeilen.length) return <p className="muted small-text">Es fehlt nichts – alles ist schon vorhanden.</p>;
  return (
    <div className="po-plan">
      <table className="po-table">
        <tbody>
          {zeilen.map((s) => {
            const tiefe = s.pfad.split('/').length - 1;
            const aus = entfaellt(s.pfad);
            const herkunft = s.art === 'datei' || s.herkunft === 'vorlage' ? `${HERKUNFT[s.herkunft]}${s.preset ? ` · ${s.preset}` : ''}` : '';
            const name = (s.vorhandenAls ?? s.pfad).split('/').pop();
            const status = aus ? 'abgewählt' : s.aenderung?.teile.length ? 'wird ergänzt' : s.vorhandenAls ? 'vorhanden*' : s.vorhanden ? 'vorhanden' : neuOhneVermerk ? '' : 'neu';
            return (
              <tr key={`${s.art}:${s.pfad}`} className={`${s.vorhanden && !tutEtwas(s) ? 'vorhanden' : ''}${aus ? ' abgewaehlt' : ''}`}>
                <td style={{ paddingLeft: 6 + tiefe * 16 }} title={s.pfad}>
                  {onUmschalten && tutEtwas(s) && (
                    <input
                      type="checkbox"
                      className="po-wahl"
                      checked={!aus}
                      // mit einem abgewählten Ordner ist auch sein Inhalt abgewählt
                      disabled={aus && !weg.includes(s.pfad.toLowerCase())}
                      title={aus ? 'wird nicht angelegt' : 'abwählen: wird nicht angelegt'}
                      aria-label={`${name} anlegen`}
                      onChange={() => onUmschalten(s.pfad)}
                    />
                  )}
                  <span className={`po-art ${s.art}`} aria-hidden />
                  {/* mit anderem Datum vorhanden: die vorhandene Datei zeigen */}
                  {name}
                </td>
                <td className="muted small-text" title={s.quelle ? `aus dem Vorlagenordner: ${s.quelle}` : undefined}>
                  {herkunft}
                </td>
                <td
                  className="po-status"
                  title={s.aenderung?.teile.length ? `wird ergänzt: ${s.aenderung.teile.join(', ')}` : s.vorhandenAls ? `mit anderem Datum vorhanden – nach dem Schema hieße sie heute ${s.pfad.split('/').pop()}` : undefined}
                >
                  {status}
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
  // ohne die Anleitung im Stamm (LIESMICH.txt), die nie kopiert wird
  const anzahl = vorlagenAnzahl(vorlagen);
  return (
    <>
      <div className="po-ort">
        <div>
          <span className="field-label">
            Vorlagenordner
            {gewaehlt && <span className="muted"> – {vorlagenLaden ? 'wird gelesen …' : `${anzahl} ${anzahl === 1 ? 'Datei' : 'Dateien'}`}</span>}
          </span>
          {gewaehlt ? <code title={vorlagenordner}>{gewaehlt}</code> : <span className="muted small-text">{leerText}</span>}
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
export function PresetAuswahl({
  struktur,
  auswahl,
  onChange,
  nichtAutomatisch = new Map(),
}: {
  struktur: Struktur;
  auswahl: string[] | undefined;
  onChange: (auswahl: string[]) => void;
  /** Standard-Presets, die wegen eines anders gegliederten Vorlagenordners nicht vorausgewählt sind */
  nichtAutomatisch?: Map<string, PresetAbweichung>;
}) {
  const { presets, unbekannt } = aktivePresets(struktur, auswahl, nichtAutomatisch.keys());
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
        <span key={n} className="po-unbekannt" title="In der Projektdatei gewählt, in der Struktur aber nicht vorhanden">
          {n} (unbekannt)
        </span>
      ))}
      {[...nichtAutomatisch].map(([name, a]) => (
        <p key={name} className="po-hinweis po-nicht-automatisch">
          „{name}“ ist nicht vorausgewählt: {abweichungText(a)} – der Vorlagenordner ist anders gegliedert als die Struktur. Unter „Vorlagen“ lassen sich seine Ordner gezielt
          zuordnen.
        </p>
      ))}
    </div>
  );
}

/** „3 Ordner lägen außerhalb der Struktur, 2 Dateien lose im Projektstamm“ */
export function abweichungText(a: PresetAbweichung, konjunktiv = true): string {
  const teile: string[] = [];
  if (a.fremd.length) teile.push(`${a.fremd.length} Ordner ${konjunktiv ? (a.fremd.length === 1 ? 'läge' : 'lägen') : a.fremd.length === 1 ? 'liegt' : 'liegen'} außerhalb der Struktur (${a.fremd.join(', ')})`);
  if (a.lose.length) teile.push(`${a.lose.length} ${a.lose.length === 1 ? 'Datei' : 'Dateien'} lose im Projektstamm`);
  return teile.join(', ');
}

/**
 * Wo die Vorlagen eines Presets außerhalb der Struktur landen – nach den Regeln des Prüfmodus, mit aufklappbarer Liste.
 */
export function PresetAbweichungen({ a }: { a: PresetAbweichung }) {
  if (!a.fremd.length && !a.lose.length) return null;
  return (
    <div className="po-hinweis po-abweichung">
      {a.fremd.length > 0 && (
        <details>
          <summary>
            {a.fremd.length} {a.fremd.length === 1 ? 'Ordner liegt' : 'Ordner liegen'} außerhalb der Struktur
          </summary>
          <ul>
            {a.fremd.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </details>
      )}
      {a.lose.length > 0 && (
        <details>
          <summary>
            {a.lose.length} {a.lose.length === 1 ? 'Datei liegt' : 'Dateien liegen'} lose im Projektstamm
          </summary>
          <ul>
            {a.lose.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </details>
      )}
      <span className="small-text">„Ordner prüfen“ meldet sie später als Abweichung – besser einen Zielordner der Struktur wählen.</span>
    </div>
  );
}

/** Ergebnis eines Laufs: angelegt, schon vorhanden, fehlgeschlagen */
export function ErgebnisAnzeige({ ordner, liste, children }: { ordner: string; liste: Ergebnis[]; children?: React.ReactNode }) {
  const [fehler, setFehler] = useState<string | null>(null);
  const angelegt = liste.filter((x) => x.status === 'angelegt').length;
  const ergaenzt = liste.filter((x) => x.status === 'ergaenzt').length;
  const unveraendert = liste.filter((x) => x.status === 'vorhanden').length;
  const fehlgeschlagen = liste.filter((x) => x.status === 'fehler');
  return (
    <div className={`po-ergebnis${fehlgeschlagen.length ? ' fehler' : ''}`}>
      <strong>
        {angelegt} {angelegt === 1 ? 'Eintrag' : 'Ordner und Dateien'} angelegt{ergaenzt ? ', Projektdatei ergänzt' : ''}
        {unveraendert ? `, ${unveraendert} schon vorhanden` : ''}
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
