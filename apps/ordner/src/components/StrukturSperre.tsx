import { useState } from 'react';
import { logger } from '@core/platform/log';
import { bestaetigen } from '@core/ui/Rueckfrage';
import { useOrdner } from '../store';

const log = logger('struktur');

/** Grund der Sperre bei unlesbarer Struktur – Tooltip gesperrter Knöpfe und Felder */
export const SPERRGRUND = 'Die Bürostruktur ist nicht lesbar – erst übernehmen';
/** kurz, als Hinweis an gesperrten Menüpunkten */
export const SPERRGRUND_KURZ = 'Struktur nicht lesbar';

/**
 * Hinweis bei nicht lesbarer Struktur (`strukturFehler`) für Struktur- und Vorlagen-Editor: nennt den Grund, sagt, dass
 * Bearbeiten gesperrt ist, und bietet an, die angezeigte Struktur (die Vorgabe) bewusst zu übernehmen – über
 * `strukturErsetzen`, also nach einer Sicherung des unlesbaren Inhalts. Ohne Fehler nichts.
 */
export function StrukturSperre() {
  const strukturFehler = useOrdner((s) => s.strukturFehler);
  const [fehler, setFehler] = useState<string | null>(null);
  if (!strukturFehler) return null;
  const uebernehmen = async () => {
    const struktur = useOrdner.getState().struktur;
    const presets = struktur.presets;
    const ok = await bestaetigen(
      'Angezeigte Struktur übernehmen?',
      `„${struktur.name}“ (${struktur.ordner.length} Ordner, ${presets.length} ${presets.length === 1 ? 'Preset' : 'Presets'}) ersetzt die nicht lesbare Struktur. Die Bürostruktur gilt für alle, die diesen Konfigurationsordner nutzen. Der bisherige Inhalt wird vorher gesichert (unter „Einrichtung“ → „Struktur“ → „Sicherungen“); danach lässt sich wieder bearbeiten.`,
      'Übernehmen',
      true,
    );
    if (!ok) return;
    try {
      await useOrdner.getState().strukturErsetzen(struktur, 'Angezeigte Struktur übernommen.');
      log.info('Nicht lesbare Struktur durch die angezeigte ersetzt (vorher gesichert)');
      setFehler(null);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <>
      <div className="warning po-struktur-fehler" role="alert">
        <p>{strukturFehler}</p>
        <div className="button-row">
          <button className="small" onClick={() => void uebernehmen()}>
            Angezeigte Struktur übernehmen …
          </button>
        </div>
      </div>
      {/* eigene Meldung neben dem Hinweis (nicht darin: keine verschachtelten Live-Regionen) */}
      {fehler && (
        <p className="meldung fehler" role="alert">
          {fehler}
        </p>
      )}
    </>
  );
}
