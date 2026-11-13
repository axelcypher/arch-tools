// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { dialogVerhaltenEinrichten } from './dialoge';

const warten = () => new Promise((r) => setTimeout(r, 30));

describe('Dialoge', () => {
  it('setzen aria-modal, holen den Fokus und geben ihn beim Schließen zurück', async () => {
    dialogVerhaltenEinrichten();
    const knopf = document.createElement('button');
    document.body.appendChild(knopf);
    knopf.focus();
    const hinter = document.createElement('div');
    hinter.className = 'modal-backdrop';
    hinter.innerHTML = '<div class="modal"><input id="a"><button id="b">OK</button></div>';
    document.body.appendChild(hinter);
    await warten();
    const d = hinter.querySelector('.modal')!;
    expect(d.getAttribute('role')).toBe('dialog');
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement?.id).toBe('a');
    hinter.remove();
    await warten();
    expect(document.activeElement).toBe(knopf);
  });

  it('nehmen die Aufklappzeile (summary) in den Tab-Zyklus auf', async () => {
    dialogVerhaltenEinrichten();
    const hinter = document.createElement('div');
    hinter.className = 'modal-backdrop';
    hinter.innerHTML = '<div class="modal"><button id="x">Abbrechen</button><details><summary id="s">Liste anzeigen</summary><p>…</p></details></div>';
    document.body.appendChild(hinter);
    await warten();
    const s = hinter.querySelector<HTMLElement>('#s')!;
    // offsetParent ist in happy-dom immer null – sichtbar machen wie im Browser
    for (const el of hinter.querySelectorAll<HTMLElement>('button, summary')) Object.defineProperty(el, 'offsetParent', { get: () => hinter });
    s.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(tab);
    // summary ist das letzte Ziel: Tab springt zurück an den Anfang statt aus dem Dialog
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('x');
    hinter.remove();
  });

  it('Startfokus nicht auf einer Aufklappzeile – sie bleibt aber im Tab-Zyklus', async () => {
    dialogVerhaltenEinrichten();
    const hinter = document.createElement('div');
    hinter.className = 'modal-backdrop';
    hinter.innerHTML = '<div class="modal"><details><summary id="s">Stuft 3 herab – Liste anzeigen</summary><p>…</p></details><input id="haken" type="checkbox"><button id="ok">OK</button></div>';
    document.body.appendChild(hinter);
    await warten();
    expect(document.activeElement?.id).toBe('haken');
    hinter.remove();
  });
});
