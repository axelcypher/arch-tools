// @vitest-environment happy-dom
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EinstellungenHost, einstellungenOeffnen, useEinstellungen } from '@core/ui/Einstellungen';
import { RueckfrageHost } from '@core/ui/Rueckfrage';
import { fabrioSeiteAnmelden, useFabrioEntwurf } from './components/Einstellungen';
import { pfadSpeichern } from '@core/einstellungen/pfade';
import { VORGABE } from './einstellungen';
import { useAva } from './store';

/** Seite „FABRIO“ im zentralen Einstellungsdialog: Entwurf, „Übernehmen“ in den bisherigen Bereich „ava“, Abbrechen */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
let abmelden: (() => void) | null = null;
const warten = () => act(() => new Promise((r) => setTimeout(r, 20)));
const roh = () => JSON.parse(localStorage.getItem('arch-tools:konfig:ava') ?? 'null') as typeof VORGABE | null;
const knopf = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('.einst button')].find((b) => b.textContent?.trim() === text)!;
const haken = (text: string) => [...document.querySelectorAll<HTMLLabelElement>('.einst :is(label.ava-check, label.toggle)')].find((l) => l.textContent?.includes(text))!.querySelector('input')!;

beforeEach(async () => {
  localStorage.clear();
  useAva.setState({ einstellungen: structuredClone(VORGABE) });
  useFabrioEntwurf.setState({ entwurf: null });
  useEinstellungen.setState({ offen: false });
  abmelden = fabrioSeiteAnmelden();
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(createElement(Fragment, null, createElement(EinstellungenHost), createElement(RueckfrageHost))));
  act(() => einstellungenOeffnen());
  await warten();
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  abmelden?.();
  document.body.innerHTML = '';
});

describe('Seite FABRIO in den Einstellungen', () => {
  it('öffnet als Startseite; Änderungen gelten erst mit „Übernehmen“ und landen im Bereich „ava“', async () => {
    expect(document.querySelector('.einst [role="tab"][aria-selected="true"]')!.textContent).toContain('FABRIO');
    // die Ablage steht nur als Verweis da (zentral auf „Pfade und Benennung“)
    expect(document.querySelector('.einst-inhalt')!.textContent).toContain('Pfade und Benennung');
    const vorher = useAva.getState().einstellungen.rechnungen.nrAufDeckblatt;
    act(() => haken('Nummer der Rechnungsliste').click());
    expect(useAva.getState().einstellungen.rechnungen.nrAufDeckblatt).toBe(vorher);
    expect(roh()).toBeNull();
    await act(async () => knopf('Übernehmen').click());
    await warten();
    expect(document.querySelector('.einst')).toBeNull();
    expect(useAva.getState().einstellungen.rechnungen.nrAufDeckblatt).toBe(!vorher);
    // derselbe Bereich wie im früheren eigenen Dialog, die übrigen Angaben bleiben
    expect(roh()).toMatchObject({ rechnungen: { nrAufDeckblatt: !vorher, muster: VORGABE.rechnungen.muster }, ablage: VORGABE.ablage, pruefung: VORGABE.pruefung });
  });

  it('Abbrechen (nach Rückfrage) verwirft den Entwurf, nichts wird geschrieben', async () => {
    act(() => haken('Deckblatt beim Ablegen').click());
    await act(async () => knopf('Abbrechen').click());
    await warten();
    const verwerfen = [...document.querySelectorAll<HTMLButtonElement>('.modal button')].find((b) => /Verwerfen|Schließen/.test(b.textContent ?? '') && !b.closest('.einst'));
    await act(async () => verwerfen!.click());
    await warten();
    expect(document.querySelector('.einst')).toBeNull();
    expect(useFabrioEntwurf.getState().entwurf).toBeNull();
    expect(roh()).toBeNull();
  });

  it('„Pfade und Benennung“ und FABRIO in einem „Übernehmen“: der zentral geänderte Ordner der Gewerke bleibt erhalten', async () => {
    act(() => haken('Nummer der Rechnungsliste').click());
    // was der Dialog zuerst tut: die gemeinsame Seite schreibt in den Bereich „ava“
    await act(() => pfadSpeichern('ablage.fabrio.gewerke', '20 Gewerke'));
    await act(async () => knopf('Übernehmen').click());
    await warten();
    expect(roh()).toMatchObject({ ablage: { gewerke: '20 Gewerke' }, rechnungen: { nrAufDeckblatt: !VORGABE.rechnungen.nrAufDeckblatt } });
  });

  it('„Alles zurücksetzen …“: alle Abschnitte auf die Vorgabe, Ablage und Muster bleiben – erst mit „Übernehmen“', async () => {
    const eigen = { ...structuredClone(VORGABE), ablage: { ...VORGABE.ablage, gewerke: 'LV' }, pruefung: { ...VORGABE.pruefung, skontoProzent: 3 } };
    useAva.setState({ einstellungen: eigen });
    await warten();
    await act(async () => knopf('Alles zurücksetzen …').click());
    await warten();
    const ok = [...document.querySelectorAll<HTMLButtonElement>('.modal button')].find((b) => b.textContent?.trim() === 'Zurücksetzen')!;
    await act(async () => ok.click());
    await warten();
    expect(useFabrioEntwurf.getState().entwurf).toMatchObject({ pruefung: VORGABE.pruefung, ablage: { gewerke: 'LV' } });
    expect(useAva.getState().einstellungen.pruefung.skontoProzent).toBe(3);
  });
});
