import { pfadText } from '../einstellungen/pfade';
import { ordnerVon } from '../platform/files';

/** vollständiger Pfad? (Laufwerk, UNC oder „/“) */
export const istVollstaendig = (pfad: string) => /^([a-z]:[\\/]|[\\/]{2}|\/)/i.test(pfad);

/**
 * Projektordner (die Wurzel, die ATLAS anlegt) aus dem Pfad der Projektdatei: Die Ordnerteile des Musters für neue
 * Projektdateien (Teile mit Platzhaltern gelten als beliebig) werden vom Ende des Ordners der .oap abgeschnitten,
 * wenn sie passen (ohne Groß-/Kleinschreibung). Muster: die Einstellung „Pfad neuer Projektdateien“. Passt das Muster nicht, ist der Projektordner unbekannt: `null`.
 */
export function projektordnerAusDatei(datei: string | null | undefined, oapMuster = pfadText('projekt.oapPfad')): string | null {
  const ordner = ordnerVon(datei ?? null);
  if (!ordner || !istVollstaendig(ordner)) return null;
  const muster = oapMuster
    .split(/[\\/]+/)
    .filter(Boolean)
    .slice(0, -1);
  const sep = ordner.includes('\\') ? '\\' : '/';
  const teile = ordner.replace(/[\\/]+$/, '').split(/[\\/]/);
  if (teile.length - 1 < muster.length) return null;
  const ende = teile.slice(teile.length - muster.length);
  const passt = muster.every((m, i) => m.includes('{') || m.toLocaleLowerCase('de') === ende[i].toLocaleLowerCase('de'));
  if (!passt) return null;
  const wurzel = teile.slice(0, teile.length - muster.length).join(sep);
  return wurzel === '' ? sep : /^[a-z]:$/i.test(wurzel) ? wurzel + sep : wurzel;
}
