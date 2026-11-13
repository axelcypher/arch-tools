import { VORBEREITEN_MS } from '../platform/rahmen';
import { logger } from '../platform/log';
import { bestaetigen } from './Rueckfrage';

const log = logger('schliessen');

/**
 * Vor Schließen, Andocken, Herauslösen oder Update-Neustart: ausstehendes Schreiben der App abwarten (`vorbereiten`,
 * z. B. schliessenVorbereiten bzw. vorbereitenImTab). Wird es nicht rechtzeitig fertig, fragt sie, ob trotzdem
 * fortgefahren werden soll – die letzte Änderung kann dann fehlen. true = weiter.
 */
export async function schreibenAbwarten(app: string, vorbereiten: () => Promise<boolean>): Promise<boolean> {
  if (await vorbereiten()) return true;
  log.warn(`${app}: Schreiben nach ${VORBEREITEN_MS / 1000} s nicht fertig`);
  return bestaetigen(
    `${app} speichert noch`,
    `Das Speichern ist nach ${VORBEREITEN_MS / 1000} Sekunden noch nicht fertig (Netzlaufwerk langsam oder nicht erreichbar?). Wer trotzdem fortfährt, verliert womöglich die letzte Änderung.`,
    'Trotzdem fortfahren',
    true,
  );
}
