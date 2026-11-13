import type { Vorbereitet } from '../platform/rahmen';
import { VORBEREITEN_MS } from '../platform/rahmen';
import { logger } from '../platform/log';
import { fragen } from './Rueckfrage';

const log = logger('schliessen');

/**
 * Vor Schließen, Andocken, Herauslösen, Beenden oder Update-Neustart: ausstehendes Schreiben der App abwarten
 * (`vorbereiten`, z. B. schliessenVorbereiten bzw. vorbereitenImTab). Ist es nicht rechtzeitig fertig, fragt sie
 * *Weiter warten*; ist es gescheitert (eine angemeldete Funktion lieferte `false` oder scheiterte), fragt sie
 * *Erneut versuchen* – jeweils als Hauptknopf (Enter), dazu *Trotzdem <verb>* (Gefahr: die letzte Änderung kann fehlen)
 * und *Abbrechen*. `verb`: was danach geschieht, klein, z. B. „schließen“, „andocken“, „neu starten“. true = weiter.
 */
export async function schreibenAbwarten(app: string, vorbereiten: () => Promise<Vorbereitet>, verb: string): Promise<boolean> {
  for (;;) {
    const ergebnis = await vorbereiten();
    if (ergebnis === 'fertig') return true;
    const gescheitert = ergebnis === 'fehler';
    log.warn(gescheitert ? `${app}: Speichern vor dem Schließen gescheitert` : `${app}: Schreiben nach ${VORBEREITEN_MS / 1000} s nicht fertig`);
    const a = await fragen({
      titel: gescheitert ? `${app} konnte nicht speichern` : `${app} speichert noch`,
      text: gescheitert
        ? `Die letzte Änderung ließ sich nicht speichern – womöglich ist das Netzlaufwerk nicht erreichbar. Prüfen Sie die Verbindung und versuchen Sie es erneut. Wenn Sie jetzt ${verb}, geht sie womöglich verloren.`
        : `Das Speichern dauert länger als ${VORBEREITEN_MS / 1000} Sekunden – womöglich ist das Netzlaufwerk langsam oder nicht erreichbar. Warten Sie, bis es fertig ist. Wenn Sie jetzt ${verb}, geht die letzte Änderung womöglich verloren.`,
      knoepfe: [
        { id: 'abbrechen', label: 'Abbrechen' },
        { id: 'trotzdem', label: `Trotzdem ${verb}`, art: 'danger' },
        { id: 'nochmal', label: gescheitert ? 'Erneut versuchen' : 'Weiter warten', art: 'primary' },
      ],
    });
    if (a === 'trotzdem') return true;
    if (a !== 'nochmal') return false;
  }
}
