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
});
