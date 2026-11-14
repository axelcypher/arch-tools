import { beimUmzug, ungespeichertSatz } from '../platform/rahmen';
import { aenderungenSpeichern, bestaetigen, UNGESPEICHERT_ALLGEMEIN } from './Rueckfrage';

/**
 * Rückfrage vor dem Herauslösen bzw. Andocken einer App mit ungespeicherten Änderungen: zuerst die Folge („Beim
 * Herauslösen startet die App neu.“), dann ein kurzer Satz. Gehen die Änderungen verloren (ATLAS, FABRIO, LEXIO), ist das
 * der Satz der App (`ungespeichert`, sonst der allgemeine) und die Rückfrage bietet „Speichern“ an – ohne
 * Speichermöglichkeit „Ungespeicherte Änderungen verwerfen?“ mit „Verwerfen und …“ als Gefahrknopf (wie beim Schließen);
 * sonst sagt der Satz, was aus den Änderungen wird. true = weiter.
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
  if (speichern) return aenderungenSpeichern(`${app}${projekt ? ` – ${projekt}` : ''}`, speichern, `${folge} ${ungespeichertSatz(ungespeichert) ?? UNGESPEICHERT_ALLGEMEIN}`);
  // ohne Speichermöglichkeit wie beim Schließen: Verwerfen als Gefahrknopf, der Verlust steht im Text
  return bestaetigen('Ungespeicherte Änderungen verwerfen?', `Beim ${verb} startet die App neu, die Änderungen gehen verloren.`, `Verwerfen und ${verb.toLowerCase()}`, true);
}
