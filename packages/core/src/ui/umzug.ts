import { beimUmzug, ungespeichertSatz } from '../platform/rahmen';
import { aenderungenSpeichern, bestaetigen, UNGESPEICHERT_ALLGEMEIN } from './Rueckfrage';

/**
 * Rückfrage vor dem Herauslösen bzw. Andocken einer App mit ungespeicherten Änderungen: zuerst die Folge („Beim
 * Herauslösen startet die App neu.“), dann ein kurzer Satz. Gehen die Änderungen verloren (ATLAS, FABRIO, LEXIO), ist das
 * der Satz der App (`ungespeichert`, sonst der allgemeine) und die Rückfrage bietet „Speichern“ an – ohne
 * Speichermöglichkeit nur „Verwerfen“ als Gefahrknopf; sonst sagt der Satz, was aus den Änderungen wird. true = weiter.
 */
export async function umzugBestaetigen(
  kennung: string | null,
  app: string,
  projekt: string,
  richtung: 'herausloesen' | 'andocken',
  speichern?: () => Promise<boolean | void> | boolean | void,
  ungespeichert?: string,
): Promise<boolean> {
  const umzug = beimUmzug(kennung);
  const verb = richtung === 'herausloesen' ? 'Herauslösen' : 'Andocken';
  const folge = `Beim ${verb} startet die App neu.`;
  if (!umzug.verliert) return bestaetigen(`${app} ${verb.toLowerCase()}?`, `${folge} ${umzug.text}`, verb);
  const satz = `${folge} ${ungespeichertSatz(ungespeichert) ?? UNGESPEICHERT_ALLGEMEIN}`;
  if (speichern) return aenderungenSpeichern(`${app}${projekt ? ` – ${projekt}` : ''}`, speichern, satz);
  return bestaetigen(`${app} ${verb.toLowerCase()}?`, satz, `Verwerfen und ${verb.toLowerCase()}`, true);
}
