import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Tabs (iframes) erreichen die Befehle der Desktop-App unter Windows nur über das IPC-Protokoll: Der Ausweichweg
 * (postMessage, Antwort per eval) kommt nur im Hauptdokument an – ohne diese Einträge reagieren in den Tabs alle
 * Knöpfe nicht, die einen Befehl brauchen.
 */
describe('CSP der Rahmen-App', () => {
  const conf = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8')) as {
    app: { security: { csp: string }; windows?: { useHttpsScheme?: boolean }[] };
  };
  const richtlinie = (name: string) =>
    conf.app.security.csp
      .split(';')
      .map((s) => s.trim().split(/\s+/))
      .find((teile) => teile[0] === name)
      ?.slice(1) ?? [];

  it('erlaubt in connect-src das IPC-Protokoll (macOS/Linux „ipc:“, Windows „http://ipc.localhost“)', () => {
    expect(richtlinie('connect-src')).toEqual(expect.arrayContaining(['ipc:', 'http://ipc.localhost']));
  });

  it('kein useHttpsScheme – sonst gingen die Befehle an https://ipc.localhost, das connect-src nicht erlaubt', () => {
    const https = (conf.app.windows ?? []).some((w) => w.useHttpsScheme);
    if (https) expect(richtlinie('connect-src')).toContain('https://ipc.localhost');
    else expect(https).toBe(false);
  });
});
