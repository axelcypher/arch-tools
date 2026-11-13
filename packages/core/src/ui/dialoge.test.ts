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

  it('verschachtelt: schließt der innere, geht der Fokus zurück an die Stelle im äußeren (Dialog bzw. Druckvorschau)', async () => {
    dialogVerhaltenEinrichten();
    for (const aussen of [
      '<div class="modal"><button id="start">Start</button><input id="haken" type="checkbox"></div>',
      '<div class="report"><button id="start">Start</button><input id="haken" type="checkbox"></div>',
    ]) {
      const hinten = document.createElement('div');
      hinten.className = aussen.includes('report') ? 'report-backdrop' : 'modal-backdrop';
      hinten.innerHTML = aussen;
      document.body.appendChild(hinten);
      await warten();
      const haken = hinten.querySelector<HTMLElement>('#haken')!;
      haken.focus();
      const vorn = document.createElement('div');
      vorn.className = 'modal-backdrop';
      vorn.innerHTML = '<div class="modal"><button id="ok">OK</button></div>';
      document.body.appendChild(vorn);
      await warten();
      expect(document.activeElement?.id).toBe('ok');
      vorn.remove();
      await warten();
      expect(document.activeElement).toBe(haken);
      hinten.remove();
      await warten();
    }
  });

  it('kein Fokus in einen Hintergrund, über dem noch ein anderer Dialog liegt', async () => {
    dialogVerhaltenEinrichten();
    const knopf = document.body.appendChild(document.createElement('button'));
    knopf.focus();
    const erster = document.body.appendChild(document.createElement('div'));
    erster.className = 'modal-backdrop';
    erster.innerHTML = '<div class="modal"><button id="eins">Eins</button></div>';
    await warten();
    const zweiter = document.body.appendChild(document.createElement('div'));
    zweiter.className = 'modal-backdrop';
    zweiter.innerHTML = '<div class="modal"><button id="zwei">Zwei</button></div>';
    await warten();
    // der erste schließt, während der zweite offen bleibt: der Fokus bleibt im zweiten, nicht auf dem Knopf dahinter
    erster.remove();
    await warten();
    expect(document.activeElement?.id).toBe('zwei');
    zweiter.remove();
    knopf.remove();
    await warten();
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

  it('data-startfokus bestimmt den Startfokus (vor einem Tabstopp davor)', async () => {
    dialogVerhaltenEinrichten();
    const hinter = document.createElement('div');
    hinter.className = 'modal-backdrop';
    hinter.innerHTML = '<div class="modal"><div tabindex="0" id="bereich">Liste</div><input id="haken" type="checkbox" data-startfokus=""><button>OK</button></div>';
    document.body.appendChild(hinter);
    await warten();
    expect(document.activeElement?.id).toBe('haken');
    hinter.remove();
  });
});
