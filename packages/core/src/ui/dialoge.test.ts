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

  it('geben den Fokus auch an eine SVG-Zeichenfläche zurück und beim Aushängen ohne Esc', async () => {
    dialogVerhaltenEinrichten();
    document.body.innerHTML = '<svg class="canvas" tabindex="0"></svg>';
    const flaeche = document.querySelector<SVGElement>('svg.canvas')!;
    flaeche.focus();
    expect(document.activeElement).toBe(flaeche);
    const hinter = document.createElement('div');
    hinter.className = 'modal-backdrop';
    hinter.innerHTML = '<div class="modal"><button id="ok">OK</button></div>';
    document.body.appendChild(hinter);
    await warten();
    expect(document.activeElement?.id).toBe('ok');
    hinter.remove();
    await warten();
    expect(document.activeElement).toBe(flaeche);
  });

  it('wurde der auslösende Knopf ersetzt, geht der Fokus an den Ersatz im selben Bereich statt auf body', async () => {
    dialogVerhaltenEinrichten();
    document.body.innerHTML = '<footer class="karte-fuss"><span class="zeile"><button id="alt">?</button></span></footer>';
    document.getElementById('alt')!.focus();
    const hinter = document.createElement('div');
    hinter.className = 'modal-backdrop';
    hinter.innerHTML = '<div class="modal"><button id="ok">OK</button></div>';
    document.body.appendChild(hinter);
    await warten();
    // die App rendert die Zeile neu: der alte Knopf ist weg, ein neuer steht an seiner Stelle
    document.querySelector('.karte-fuss')!.innerHTML = '<span class="zeile"><button id="neu">? Tastenkürzel …</button></span>';
    hinter.remove();
    await warten();
    expect(document.activeElement?.id).toBe('neu');
  });

  const oeffnen = async (html = '<button id="ok">OK</button>') => {
    const hinter = document.createElement('div');
    hinter.className = 'modal-backdrop';
    hinter.innerHTML = `<div class="modal">${html}</div>`;
    document.body.appendChild(hinter);
    await warten();
    return hinter;
  };

  it('ersetzt: das Gegenstück (gleiche Beschriftung) unter mehreren Knöpfen, nicht der erste', async () => {
    dialogVerhaltenEinrichten();
    document.body.innerHTML = '<div class="toolbar"><button>Neu</button><button aria-label="Alle Tastenkürzel …" id="alt">?</button><button>Mehr</button></div>';
    document.getElementById('alt')!.focus();
    const hinter = await oeffnen();
    document.querySelector('.toolbar')!.innerHTML = '<button>Neu</button><button>Hilfe</button><button aria-label="Alle Tastenkürzel …" id="neu">?</button>';
    hinter.remove();
    await warten();
    expect(document.activeElement?.id).toBe('neu');
  });

  it('ersetzt: sucht nur im nahen Bereich – kein Sprung an den Anfang der App', async () => {
    dialogVerhaltenEinrichten();
    document.body.innerHTML = '<div id="root"><button id="titel">Menü</button><div class="karte"><div><span><button id="alt">?</button></span></div></div></div>';
    document.getElementById('alt')!.focus();
    const hinter = await oeffnen();
    // die ganze Karte wird neu aufgebaut – der nächste vorhandene Vorfahr wäre #root
    document.querySelector('.karte')!.remove();
    hinter.remove();
    await warten();
    expect(document.activeElement).toBe(document.body);
  });

  it('ersetzt: überspringt versteckte und ausgeblendete Ziele, nimmt auch eine neue SVG-Zeichenfläche', async () => {
    dialogVerhaltenEinrichten();
    document.body.innerHTML = '<div class="karte"><svg class="canvas" tabindex="0" id="alt"></svg></div>';
    document.querySelector<SVGElement>('#alt')!.focus();
    const hinter = await oeffnen();
    document.querySelector('.karte')!.innerHTML = '<input type="hidden" name="x"><button hidden>weg</button><svg class="canvas" tabindex="0" id="neu"></svg>';
    hinter.remove();
    await warten();
    expect(document.activeElement?.id).toBe('neu');
  });

  it('ersetzt: bei gleich beschrifteten Knöpfen (mehrere „Löschen“) der an der alten Stelle', async () => {
    dialogVerhaltenEinrichten();
    document.body.innerHTML = '<div class="karte"><button>Löschen</button><button>Löschen</button><button id="alt">Löschen</button></div>';
    document.getElementById('alt')!.focus();
    const hinter = await oeffnen();
    document.querySelector('.karte')!.innerHTML = '<button>Löschen</button><button>Löschen</button><button id="neu">Löschen</button>';
    hinter.remove();
    await warten();
    expect(document.activeElement?.id).toBe('neu');
  });

  it('ersetzt: ohne Bereich in drei Ebenen nur das Gegenstück, nie das erste Element', async () => {
    dialogVerhaltenEinrichten();
    document.body.innerHTML = '<div id="root"><div><div><button id="menue">Menü</button><span><button id="alt">X</button></span></div></div></div>';
    document.getElementById('alt')!.focus();
    const hinter = await oeffnen();
    document.querySelector('#root span')!.remove();
    hinter.remove();
    await warten();
    expect(document.activeElement).toBe(document.body);
  });

  it('äußerer und innerer Dialog in einem Schritt ausgehängt: der Fokus bleibt beim Auslöser des äußeren', async () => {
    dialogVerhaltenEinrichten();
    document.body.innerHTML = '<div class="toolbar"><button id="ausloeser">Öffnen</button><button>Anderes</button></div>';
    document.getElementById('ausloeser')!.focus();
    const aussen = await oeffnen('<button id="innen-ausloeser">Weiter</button>');
    document.getElementById('innen-ausloeser')!.focus();
    const innen = document.createElement('div');
    innen.className = 'modal-backdrop';
    innen.innerHTML = '<div class="modal"><button id="ok2">OK</button></div>';
    aussen.querySelector('.modal')!.appendChild(innen);
    await warten();
    aussen.remove();
    await warten();
    expect(document.activeElement?.id).toBe('ausloeser');
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
