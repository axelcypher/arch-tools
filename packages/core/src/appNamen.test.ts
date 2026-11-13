import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { APP_NAMEN, appMitWas } from './appNamen';

/**
 * Die Namen der Apps stehen an mehreren Stellen, die zusammenpassen müssen: Produktname (Installer, Startmenü),
 * Fenstertitel, <title>, Release-Name – und für die Umbenennung der Installer-Hook mit dem alten Namen und der
 * MSI-Upgrade-Code des alten Namens (sonst installierte ein Update die App ein zweites Mal daneben).
 */
const wurzel = new URL('../../../', import.meta.url);
const datei = (pfad: string) => readFileSync(new URL(pfad, wurzel), 'utf8');

/** bisherige Produktnamen (bis zur Umbenennung) */
const ALT: Record<string, string> = {
  suite: 'arch-tools',
  ordner: 'Projektordner',
  formulare: 'Formulare',
  flaechenrechner: 'Flächenrechner',
  grz: 'GRZ-Nachweis',
  kosten: 'Kostenermittlung',
  entzerrung: 'Entzerrung',
  ava: 'AVA',
};

/** WiX-Upgrade-Code, wie ihn Tauri ohne Angabe aus dem Produktnamen ableitet (UUID v5, Namensraum DNS) */
function upgradeCode(produktName: string): string {
  const ns = Buffer.from('6ba7b8109dad11d180b400c04fd430c8', 'hex');
  const h = createHash('sha1')
    .update(Buffer.concat([ns, Buffer.from(`${produktName}.exe.app.x64`, 'utf8')]))
    .digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

interface TauriConf {
  productName: string;
  app: { windows: { title: string }[] };
  bundle: { windows: { nsis: { installerHooks?: string }; wix: { upgradeCode?: string } } };
}

describe('Namen der Apps', () => {
  it('Upgrade-Code wie Tauri („tauri inspect wix-upgrade-code“)', () => {
    expect(upgradeCode('Formulare')).toBe('157a720b-7bc8-590d-93b4-80de89309be5');
    expect(upgradeCode('Flächenrechner')).toBe('87850a7d-dd70-5d2d-be46-536ee23ad6d1');
  });

  it('Name mit Erklärung', () => {
    expect(appMitWas('formulare')).toBe('PERMIO (Formulare)');
  });

  for (const [id, alt] of Object.entries(ALT)) {
    describe(id, () => {
      const conf = JSON.parse(datei(`apps/${id}/src-tauri/tauri.conf.json`)) as TauriConf;
      const neu = APP_NAMEN[id as keyof typeof APP_NAMEN].name;

      it('Produktname, Fenstertitel und <title> = APP_NAMEN', () => {
        expect(conf.productName).toBe(neu);
        expect(conf.app.windows[0].title).toBe(neu);
        expect(datei(`apps/${id}/index.html`)).toContain(`<title>${neu}</title>`);
      });

      it('Release-Name im Workflow', () => {
        expect(datei('.github/workflows/release.yml')).toMatch(new RegExp(`^\\s+${id}\\) tag="[^"]+"; name="${neu}";`, 'm'));
      });

      it('MSI ersetzt das Paket unter dem alten Namen (gleicher Upgrade-Code)', () => {
        expect(conf.bundle.windows.wix.upgradeCode).toBe(upgradeCode(alt));
      });

      it('NSIS-Hook entfernt die Installation unter dem alten Namen – Datei nur ASCII, Umlaute als ${U+…}', () => {
        const pfad = conf.bundle.windows.nsis.installerHooks!;
        expect(pfad).toBe('windows/umbenennung.nsh');
        const url = new URL(`apps/${id}/src-tauri/${pfad}`, wurzel);
        expect(existsSync(url)).toBe(true);
        const hook = readFileSync(url, 'utf8');
        expect(/^[\x00-\x7f]*$/.test(hook)).toBe(true);
        const name = /^!define ALTER_NAME "([^"]+)"/m.exec(hook)![1].replace(/\$\{U\+([0-9A-F]{4})\}/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
        expect(name).toBe(alt);
        expect(hook).toContain('!macro NSIS_HOOK_PREINSTALL');
        expect(hook).toContain('!macro NSIS_HOOK_POSTINSTALL');
        // alle Hooks gleich bis auf den Namen und die Version im Kopf
        const ohne = (t: string) => t.replace(/^!define ALTER_NAME .*$/m, '').replace(/^; Umbenennung der App: .*$/m, '');
        expect(ohne(hook)).toBe(ohne(readFileSync(new URL('apps/formulare/src-tauri/windows/umbenennung.nsh', wurzel), 'utf8')));
      });

      it('Icon der App = Iconset', () => {
        const icon = datei(`design/icons/${id}.svg`);
        expect(datei(`apps/${id}/src-tauri/icon.svg`)).toBe(icon);
        expect(datei(`apps/${id}/public/favicon.svg`)).toBe(icon);
      });
    });
  }

  // LEXIO erscheint zum ersten Mal – unter diesem Namen; ohne Installer-Hook und ohne Upgrade-Code eines alten Namens
  describe('baurecht', () => {
    const conf = JSON.parse(datei('apps/baurecht/src-tauri/tauri.conf.json')) as TauriConf;
    const neu = APP_NAMEN.baurecht.name;

    it('Produktname, Fenstertitel und <title> = APP_NAMEN', () => {
      expect(conf.productName).toBe(neu);
      expect(conf.app.windows[0].title).toBe(neu);
      expect(datei('apps/baurecht/index.html')).toContain(`<title>${neu}</title>`);
    });

    it('Release-Name im Workflow', () => {
      expect(datei('.github/workflows/release.yml')).toMatch(new RegExp(`^\\s+baurecht\\) tag="[^"]+"; name="${neu}";`, 'm'));
    });

    it('Icon der App = Iconset', () => {
      const icon = datei('design/icons/baurecht.svg');
      expect(datei('apps/baurecht/src-tauri/icon.svg')).toBe(icon);
      expect(datei('apps/baurecht/public/favicon.svg')).toBe(icon);
    });

    it('kein Umbenennungs-Hook (nie unter anderem Namen veröffentlicht)', () => {
      expect(conf.bundle.windows.nsis?.installerHooks).toBeUndefined();
    });
  });
});

