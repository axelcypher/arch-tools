import { beimUmzug } from '../platform/rahmen';
import { aenderungenSpeichern, bestaetigen } from './Rueckfrage';

/**
 * Rückfrage vor dem Herauslösen bzw. Andocken einer App mit ungespeicherten Änderungen (die App startet dabei neu).
 * Gehen die Änderungen verloren (ATLAS, FABRIO), bietet sie „Speichern“ an – ohne Speichermöglichkeit nur „Verwerfen“
 * als Gefahrknopf; sonst sagt sie, was aus den Änderungen wird. true = weiter.
 */
export async function umzugBestaetigen(
  kennung: string | null,
  app: string,
  projekt: string,
  richtung: 'herausloesen' | 'andocken',
  speichern?: () => Promise<boolean | void> | boolean | void,
): Promise<boolean> {
  const { text, verliert } = beimUmzug(kennung);
  const verb = richtung === 'herausloesen' ? 'Herauslösen' : 'Andocken';
  if (verliert && speichern) return aenderungenSpeichern(`${app}${projekt ? ` – ${projekt}` : ''}`, speichern, `Beim ${verb} startet die App neu. ${text}`);
  if (verliert) return bestaetigen(`${app} ${verb.toLowerCase()}?`, text, `Verwerfen und ${verb.toLowerCase()}`, true);
  return bestaetigen(`${app} ${verb.toLowerCase()}?`, text, verb);
}
