/**
 * Rahmen-App: Alle Apps laufen in einem Fenster als Tabs (iframes desselben Ursprungs) oder herausgelöst in
 * eigenen Fenstern desselben Programms. Die Apps merken das hier und passen sich an:
 *
 *   'tab'     im Tab der Rahmen-App: keine eigenen Fensterknöpfe, kein Ziehen, keine Updates (die macht der Rahmen);
 *             Name und ungespeicherte Änderungen werden an den Rahmen gemeldet
 *   'fenster' herausgelöst in ein eigenes Fenster der Rahmen-App: eigene Fensterknöpfe, keine Updates, Knopf
 *             „Andocken“ zurück in den Rahmen
 *   null      eigenständige App (eigener Installer) oder Browser
 */

export type RahmenModus = 'tab' | 'fenster' | null;

/** Nachricht eines Tabs an den Rahmen */
export interface RahmenStatus {
  typ: 'arch-tools:status';
  /** Name der App (TitleBar) */
  app: string;
  /** Name des geöffneten Projekts */
  name: string;
  dirty: boolean;
}

/** Ereignis eines herausgelösten Fensters an den Rahmen: wieder als Tab andocken */
export const ANDOCKEN = 'arch-tools:andocken';

export function rahmenModus(): RahmenModus {
  if (typeof window === 'undefined') return null;
  try {
    if (window.parent !== window && /(^|[?&])rahmen=tab(&|$)/.test(window.location.search)) return 'tab';
  } catch {
    // fremder Rahmen: wie eigenständig
  }
  return /(^|[?&])rahmen=fenster(&|$)/.test(window.location.search) ? 'fenster' : null;
}

/** Kennung der App in der Rahmen-App (aus der Adresse, z. B. „formulare“) */
export function rahmenApp(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('app');
}

/** Im Tab: Name und ungespeicherte Änderungen an den Rahmen melden */
export function anRahmenMelden(app: string, name: string, dirty: boolean): void {
  if (rahmenModus() !== 'tab') return;
  const nachricht: RahmenStatus = { typ: 'arch-tools:status', app, name, dirty };
  try {
    window.parent.postMessage(nachricht, window.location.origin);
  } catch {
    // ohne Rahmen nichts zu melden
  }
}

/** Herausgelöstes Fenster: zurück in den Rahmen (der Rahmen öffnet den Tab, dieses Fenster schließt sich) */
export async function andocken(): Promise<void> {
  const app = rahmenApp();
  if (!app) return;
  const [{ emit }, { getCurrentWindow }] = await Promise.all([import('@tauri-apps/api/event'), import('@tauri-apps/api/window')]);
  await emit(ANDOCKEN, { app });
  await getCurrentWindow().close();
}
