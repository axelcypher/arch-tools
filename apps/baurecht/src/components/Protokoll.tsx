import { appMitWas } from '@core/appNamen';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { offenText } from '@core/baurecht/kurz';
import { MERKMAL_TITEL } from '@core/baurecht/fakten';
import { VORGABE_MERKMALE } from '@core/bedingung';
import type { Ampel, FaktWert, ParagrafErgebnis } from '@core/baurecht/typen';
import { EBENEN, einheitName, FAKT_GRUPPEN, faktName, normVoll, wertAnzeige } from '@core/baurecht/typen';
import { druckenAls } from '@core/platform/projektDatei';
import { DruckKopf } from '@core/ui/DruckKopf';
import { useEscSchliessen } from '@core/ui/Dialog';
import { FOKUSSIERBAR } from '@core/ui/dialoge';
import { benutzer } from '../benutzer';
import type { Pruefstand } from '../pruefung';
import { aktuelleLage, anUngespeichertem, OHNE_LAGEBEZUG, verwendeteFassungen } from '../pruefung';
import { istGeaendert, offeneBestaetigungen, offeneFestlegungen, PLANUNGSRECHT, useBaurecht } from '../store';
import { AMPEL_TEXT, aufzaehlen, datum, nb, uhrzeit } from './Ampel';
import { rueckfrageOffen } from './Angaben';
import { frageGestellt, RUECKFRAGEN } from '@core/baurecht/fragen';

/** Herkunft einer gesicherten Angabe in Worten – ohne die Hinweistexte der App („bitte bestätigen …“) */
function herkunftText(f: FaktWert): string {
  switch (f.herkunft) {
    case 'geodienst':
      return `Geodienst${f.quelle ? ` ${f.quelle}` : ''}${f.stand ? `, abgefragt ${datum(f.stand)}` : ''}`;
    case 'abgeleitet':
      return `abgeleitet${f.quelle ? ` aus ${f.quelle}` : ''}`;
    case 'flaechen':
      return `${appMitWas('flaechenrechner')}, Modell`;
    case 'grz':
      return appMitWas('grz');
    case 'stammdaten':
      return 'Stammdaten des Projekts';
    case 'merkmal':
      return 'Antragsmerkmal';
    case 'modul':
      return `Regelmodul${f.quelle ? ` (${f.quelle})` : ''}`;
    default:
      return 'von Hand';
  }
}

/** Gruppe eines offenen Punkts: was fehlt (kurzer Titel der Angabe), woran er hängt oder warum er offen ist */
function gruppeVon(p: ParagrafErgebnis): string {
  if (p.ueberholt && p.ampel !== 'gelb') return 'Festlegung überholt – erneut festlegen oder aufheben';
  if (p.festlegung?.ampel === 'gelb') return 'Von Hand auf „prüfen“ festgelegt – klären';
  if (p.ueberholt) return 'Festlegung „entfällt“ überholt – erneut festlegen oder aufheben';
  if (p.unwirksam) return `Festlegung „entfällt“ noch nicht wirksam – ${p.unwirksam}`;
  return '';
}

/** Paragrafen je Norm zusammengefasst: „BauNVO §§ 18, 19, 20 · LP I C.1, C.2“ */
function nachNorm(ps: ParagrafErgebnis[], normen: { id: string; def: { kurz: string } }[]): string {
  const gruppen = new Map<string, ParagrafErgebnis[]>();
  for (const p of ps) gruppen.set(`${p.modul}/${p.norm}`, [...(gruppen.get(`${p.modul}/${p.norm}`) ?? []), p]);
  return [...gruppen.entries()]
    .map(([id, liste]) => {
      const kurz = normen.find((n) => n.id === id)?.def.kurz ?? id;
      const zahlen = liste.every((p) => /^\d/.test(p.paragraf));
      // benannte Einheiten mit ihrem Titel („andere Naturschutzgebiete“), nicht mit dem bloßen Schlüssel („andere“)
      const nrn = liste.map((p) => (/^\d/.test(p.paragraf) ? p.paragraf : einheitName(p.paragraf, p.titel).titel || p.paragraf)).join(zahlen ? ', ' : '; ');
      return nb(zahlen ? `${kurz} ${liste.length > 1 ? '§§' : '§'} ${nrn}` : `${kurz}: ${nrn}`);
    })
    .join(' · ');
}

/** Entwurfsvermerk als Kopfzeile jeder Druckseite (im reservierten oberen Seitenrand, überdruckt keinen Text) – genau
 *  wie auf dem Bildschirm („ENTWURF – die Bestätigung des Planungsrechts ist noch nicht gespeichert“) */
const entwurfDruck = (text: string, eins: boolean) =>
  `@media print { @page { margin-top: 20mm; @top-center { content: '${`ENTWURF – ${text} ${eins ? 'ist' : 'sind'} noch nicht gespeichert und bestätigt`.replace(/['\\]/g, '')}'; font: 700 12pt 'Segoe UI', system-ui, sans-serif; color: #8a5300; } } }`;
/** Modulstände sind Daten (JJJJ-MM-TT) – im Protokoll wie alle Daten als TT.MM.JJJJ */
const stand = (v: string) => (/^\d{4}-\d\d-\d\d$/.test(v) ? datum(v) : v);

/** Ampel in der Tabelle: mit „von Hand“ bzw. „von Hand, Entwurf“ */
function ampelText(p: ParagrafErgebnis): string {
  if (!p.festlegung) return AMPEL_TEXT[p.ampel];
  // eine überholte bzw. nicht wirksame Festlegung trägt die Ampel nicht – das sagt die Zelle auch
  if (p.ueberholt || p.unwirksam) return `${AMPEL_TEXT[p.ampel]} (Festlegung „${AMPEL_TEXT[p.festlegung.ampel]}“ ${p.ueberholt ? 'überholt' : 'noch nicht wirksam'})`;
  return `${AMPEL_TEXT[p.ampel]} (von Hand${p.festlegung.bestaetigt ? '' : ', Entwurf'})`;
}

/**
 * Prüfprotokoll zum Drucken bzw. als PDF. Aufbau: Grundlagen, Festlegungen von Hand und gesicherte Angaben, offene
 * Punkte als Tabelle (was fehlt – Anzahl – Paragrafen), dann alle Vorschriften je Ebene. „Prüfung abschließen“ legt einen Stand in der
 * Projektdatei ab – erst, wenn nichts mehr Entwurf ist.
 */
export function Protokoll({ stand: pruefstand, onClose, onSpeichern }: { stand: Pruefstand; onClose: () => void; onSpeichern?: () => Promise<boolean> }) {
  const project = useBaurecht((s) => s.project);
  const antrag = useBaurecht((s) => s.antrag);
  const merkmale = useBaurecht((s) => s.merkmale);
  const paket = useBaurecht((s) => s.paket);
  const protokolle = useBaurecht((s) => s.pruefung.protokolle);
  const quelle = useBaurecht((s) => s.quelle);
  const offeneF = useBaurecht((s) => offeneFestlegungen(s).join('|'));
  const offeneB = useBaurecht((s) => offeneBestaetigungen(s).join('|'));
  const eigeneFakten = useBaurecht((s) => s.pruefung.fakten);
  const planungsrechtOrt = useBaurecht((s) => s.pruefung.planungsrechtOrt);
  // so viele Paragrafen hängen an noch nicht gespeicherten Bestätigungen (Angaben, Planungsrecht) – gegenüber dem Stand
  // der Datei, alle zusammen (zwei Bestätigungen, die dieselbe Vorschrift entscheiden, zählen sie einmal)
  const anOffenem = useMemo(() => anUngespeichertem(offeneB ? offeneB.split('|') : [], pruefstand.auswertung), [offeneB, eigeneFakten, pruefstand]);
  // an den Antragsmerkmalen: Bestätigung des Planungsrechts (wer, wann) bzw. Vorbehalt; Umfang der Beseitigung und
  // Angaben zum Altbau beim Merkmal „Art des Vorhabens“ (wie in der App unter dem Merkmal)
  const merkmalVermerk = (name: string): string => {
    if (name === 'Planungsrecht') {
      if (pruefstand.planungsrechtFrueher) return ' (nicht für diesen Ort bestätigt)';
      if (!planungsrechtOrt?.von) return '';
      const wer = `${planungsrechtOrt.von}${planungsrechtOrt.am ? `, ${datum(planungsrechtOrt.am)}` : ''}`;
      // noch nicht gespeichert: zählt schon, ist aber Entwurf (zweite Bestätigung beim Speichern)
      return offeneB.split('|').includes(PLANUNGSRECHT) ? ` (Entwurf – für diesen Ort bestätigt: ${wer}; zweite Bestätigung beim Speichern fehlt)` : ` (für diesen Ort bestätigt: ${wer})`;
    }
    if (name === 'Vorhaben') {
      // nur Rückfragen, die gerade gestellt sind (nach einem Wechsel auf „Errichtung“ zählt der Umfang nicht mehr)
      const a0 = pruefstand.auswertung;
      const gestellt = (id: string) => !!a0.faktDefs[id] && frageGestellt(id, a0.faktDefs[id], a0.kontext);
      // wie in der App: ein Wert, der nur Hinweis ist, gilt dort als offen – hier mit Vermerk
      const teile = RUECKFRAGEN.Vorhaben.filter((id) => pruefstand.auswertung.fakten[id]?.wert != null && gestellt(id)).map((id) => {
        const f = pruefstand.auswertung.fakten[id];
        const text = id === 'vorhaben.beseitigung_umfang' ? String(f.wert) : `${faktName(pruefstand.auswertung.faktDefs[id], id)}: ${wertAnzeige(f.wert, pruefstand.auswertung.faktDefs[id])}`;
        return rueckfrageOffen(f) ? `${text} – nur Hinweis, nicht bestätigt` : text;
      });
      return teile.length ? ` (${teile.join('; ')})` : '';
    }
    return '';
  };
  // „frühere Lage“ nur, wenn die Angabe wirklich an einer anderen Lage hängt (nicht beim Gemeindeschlüssel von Hand,
  // der an der aktuellen Lage absichtlich Hinweis bleibt)
  const lageJetzt = aktuelleLage(project).lage;
  const lageVermerk = (e: FaktWert | undefined, abgeleitet?: FaktWert) => {
    if (abgeleitet?.lage === OHNE_LAGEBEZUG) return ' (ohne Lagebezug, ältere Datei)';
    const gebunden = e?.lage ?? e?.bestaetigt?.lage;
    if (!gebunden) return '';
    return !lageJetzt ? ' (ohne gültige Koordinaten)' : gebunden !== lageJetzt ? ' (frühere Lage)' : '';
  };
  const ungespeichertGesamt = useBaurecht(istGeaendert);
  const laedt = useBaurecht((s) => s.laedt.length);
  const [nurRelevant, setNurRelevant] = useState(false);
  // Meldung nach „Prüfung abschließen“ (mit „Jetzt speichern“, solange nicht gespeichert) – der Fokus geht dorthin;
  // nach dem Speichern (hier oder mit Strg+S) sagt sie das Ergebnis, im Dialog selbst
  // beim Öffnen: eine abgelegte, noch nicht gespeicherte Prüfung (Protokoll geschlossen und wieder geöffnet) – mit „Jetzt
  // speichern“, wie direkt nach dem Abschließen
  const [abgelegt, setAbgelegt] = useState<{ text: string; speichern: boolean } | null>(() => {
    const s = useBaurecht.getState();
    const offen = s.pruefung.protokolle.some((p) => !s.pruefungDatei.protokolle.some((b) => b.am === p.am));
    return offen ? { text: 'Eine abgeschlossene Prüfung ist noch nicht in der Datei gespeichert.', speichern: true } : null;
  });
  const meldung = useRef<HTMLDivElement>(null);
  const [speichertJetzt, setSpeichertJetzt] = useState(false);
  // Fokus nur nach eigenem Anlass (Abschließen, „Jetzt speichern“): dann auf „Jetzt speichern“ bzw. danach auf „Drucken /
  // PDF …“ – die Meldung sagt die Live-Region an; ein Strg+S von anderswo verschiebt den Fokus nicht
  const fokusNachMeldung = useRef(false);
  useEffect(() => {
    if (!abgelegt || !fokusNachMeldung.current) return;
    fokusNachMeldung.current = false;
    const knopf = meldung.current?.querySelector<HTMLElement>('button');
    if (knopf) knopf.focus();
    else fenster.current?.querySelector<HTMLElement>('.br-drucken')?.focus();
  }, [abgelegt]);
  // jedes Speichern, solange das Protokoll offen ist (auch Strg+S): das Ergebnis in der Live-Region des Dialogs – die
  // Meldung im Kopf liegt hinter dem modalen Protokoll
  const gespeichertMeldung = useBaurecht((s) => s.gespeichertMeldung);
  const meldungBeimOeffnen = useRef(gespeichertMeldung);
  // der Sperrgrund des letzten Renderns (für die Meldung nach dem Speichern)
  const sperreJetzt = useRef('');
  useEffect(() => {
    if (!gespeichertMeldung || gespeichertMeldung === meldungBeimOeffnen.current) return;
    // war eine Ablage offen und ist jetzt gespeichert: die genaue Meldung (nicht nur „Gespeichert.“)
    // gespeichert und nichts sperrt mehr: dazusagen, dass jetzt abgeschlossen werden kann
    const abschliessbar = gespeichertMeldung.text === 'Gespeichert' && !sperreJetzt.current;
    setAbgelegt((vorher) =>
      vorher?.speichern && !istGeaendert(useBaurecht.getState())
        ? { text: 'Gespeichert – die abgeschlossene Prüfung steht in der Projektdatei.', speichern: false }
        : vorher?.speichern
          ? vorher
          : { text: abschliessbar ? 'Gespeichert – die Prüfung lässt sich jetzt abschließen.' : `${gespeichertMeldung.text}.`, speichern: false },
    );
    // verschwand der fokussierte Knopf („Jetzt speichern“), bleibt der Fokus im Protokoll
    setTimeout(() => {
      const a = document.activeElement;
      if ((!a || a === document.body || !a.isConnected || !fenster.current?.contains(a)) && !document.querySelector('.modal')) fenster.current?.querySelector<HTMLElement>('.br-drucken')?.focus();
    }, 0);
  }, [gespeichertMeldung]);
  const fenster = useRef<HTMLDivElement>(null);
  // Höhe der klebenden Aktionsleiste als CSS-Variable – der feste Tabellenkopf klebt darunter
  useEffect(() => {
    const d = fenster.current;
    const leiste = d?.querySelector<HTMLElement>('.br-protokoll-aktionen');
    if (!d || !leiste) return;
    const setzen = () => d.style.setProperty('--br-aktionen-h', `${leiste.offsetHeight}px`);
    setzen();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(setzen);
    ro.observe(leiste);
    return () => ro.disconnect();
  }, []);
  useEscSchliessen(onClose);
  // Fokus: Startfokus (data-startfokus an „Jetzt speichern“ bzw. „Drucken / PDF“), Tab-Falle und Rückgabe beim
  // Schließen führt der gemeinsame Unterbau (ui/dialoge.ts – die Druckvorschau `.report-backdrop > .report` zählt dort
  // als Dialog; fokussierte das Protokoll selbst, merkte er sich die Stelle davor nicht). Hier nur der Fall, den der
  // Unterbau nicht kennt: Fokus auf einem Element außerhalb der Tab-Folge (z. B. der Meldung)
  useEffect(() => {
    const d = fenster.current;
    const taste = (e: KeyboardEvent) => {
      // liegt ein Dialog über dem Protokoll (z. B. Bestätigen beim Speichern), führt der den Fokus
      if (e.key !== 'Tab' || !d || document.querySelector('.modal')) return;
      const aktiv = document.activeElement as HTMLElement | null;
      if (!aktiv || !d.contains(aktiv) || aktiv.matches(FOKUSSIERBAR)) return;
      // im Protokoll weiter, nicht hinaus: zum nächsten bzw. vorigen Ziel der Tab-Folge (dieselben wie im Unterbau)
      const ziele = [...d.querySelectorAll<HTMLElement>(FOKUSSIERBAR)].filter((el) => el.offsetParent !== null);
      if (!ziele.length) return;
      e.preventDefault();
      const danach = ziele.find((z) => aktiv.compareDocumentPosition(z) & Node.DOCUMENT_POSITION_FOLLOWING);
      const davor = [...ziele].reverse().find((z) => aktiv.compareDocumentPosition(z) & Node.DOCUMENT_POSITION_PRECEDING);
      (e.shiftKey ? (davor ?? ziele[ziele.length - 1]) : (danach ?? ziele[0])).focus();
    };
    document.addEventListener('keydown', taste, true);
    // der Hintergrund ist nicht bedienbar (auch nicht die Sprungmarken über dem Overlay); später geöffnete Dialoge
    // (Bestätigen beim Speichern) bleiben bedienbar
    const hinter = d?.closest('.report-backdrop');
    const geschwister = hinter?.parentElement ? [...hinter.parentElement.children].filter((k): k is HTMLElement => k !== hinter && k instanceof HTMLElement && !k.inert) : [];
    for (const k of geschwister) k.inert = true;
    return () => {
      for (const k of geschwister) k.inert = false;
      document.removeEventListener('keydown', taste, true);
    };
  }, []);
  if (!project) return null;
  const a = pruefstand.auswertung;
  const ungespeichert = new Set(offeneB ? offeneB.split('|') : []);
  // die Bestätigung des Planungsrechts eigens (ein Antragsmerkmal, keine gesicherte Angabe)
  const prEntwurf = ungespeichert.delete(PLANUNGSRECHT);
  const nF = offeneF ? offeneF.split('|').length : 0;
  const entwuerfe = nF + ungespeichert.size + (prEntwurf ? 1 : 0);
  // getrennt benannt: Festlegungen von Hand, gesicherte Angaben und das Planungsrecht
  const entwurfTeile = [
    nF ? (nF === 1 ? 'eine Festlegung von Hand' : `${nF} Festlegungen von Hand`) : '',
    ungespeichert.size ? (ungespeichert.size === 1 ? 'eine gesicherte Angabe' : `${ungespeichert.size} gesicherte Angaben`) : '',
    prEntwurf ? 'die Bestätigung des Planungsrechts' : '',
  ].filter(Boolean);
  const entwurfText = aufzaehlen(entwurfTeile);
  const offen = a.paragrafen.filter((p) => p.ampel === 'gelb');
  const vonHand = a.paragrafen.filter((p) => p.festlegung);
  // nur Entwürfe, die die Ampel tragen (nicht überholt, nicht „noch nicht wirksam“)
  const ausEntwurf = vonHand.filter((p) => !p.festlegung!.bestaetigt && !p.ueberholt && !p.unwirksam);
  const ueberholt = a.paragrafen.filter((p) => p.ueberholt && p.ampel !== 'gelb');
  // dasselbe Kriterium wie Leiste und Kern: nur gestellte Angaben tragen Ampeln; nicht gestellte stehen gesondert
  // („ohne Wirkung“), auch wenn der Kern sie nicht ableitet (Bezug einer Tabelle außerhalb seines Gebiets)
  const gestellt = (id: string) => frageGestellt(id, a.faktDefs[id], a.kontext);
  const gesichert = Object.entries(a.fakten).filter(([id, f]) => f.bestaetigt && gestellt(id));
  const nichtGestellt = Object.entries(eigeneFakten).filter(([id, f]) => !!a.faktDefs[id] && f.wert != null && !gestellt(id));
  // Angaben von Hand ohne Beleg: auch sie tragen Ampeln (z. B. „Kampfmittelverdacht: nein“) – mit wer und wann
  // nur Angaben, die das Regelpaket kennt (eine Angabe einer früheren Fassung stünde sonst mit ihrer rohen Kennung da)
  const vonHandOhneBeleg = Object.entries(a.fakten).filter(
    ([id, f]) => id in eigeneFakten && !!a.faktDefs[id] && id !== 'antrag.einreichung' && f.herkunft === 'manuell' && !f.bestaetigt && f.wert != null && gestellt(id),
  );
  // abgeschlossen wird nur ein gespeicherter, zweimal bestätigter und vollständig geladener Stand
  // knapp (die Einzelheiten stehen im Hinweis darunter); nach dem Abschließen neutral: die Ablage will gespeichert werden
  // derselbe Stand ist schon abgeschlossen (gleiche Ampeln, Regelpaket, Stichtag): keine zweite, gleiche Ablage
  const zuletzt = protokolle[protokolle.length - 1];
  // … und dieselben Fassungen (eine neue Fassung bei gleichen Ampeln ist ein neuer Stand)
  const fassungenJetzt = verwendeteFassungen(a);
  const gleicheFassungen = !!zuletzt && Object.keys(fassungenJetzt).length === Object.keys(zuletzt.fassungen).length && Object.entries(fassungenJetzt).every(([k, v]) => zuletzt.fassungen[k] === v);
  const schonAbgeschlossen =
    !!zuletzt &&
    gleicheFassungen &&
    zuletzt.paket === paket.version &&
    zuletzt.einreichung === pruefstand.einreichung &&
    a.paragrafen.every((p) => zuletzt.ampeln[p.id] === p.ampel) &&
    Object.keys(zuletzt.ampeln).length === a.paragrafen.length;
  // abgelegt, aber noch nicht in der Datei (auch nach dem Wiederöffnen des Protokolls erkennbar)
  const protokolleDatei = useBaurecht.getState().pruefungDatei.protokolle;
  const ungespeichertAbgelegt = new Set(protokolle.filter((p) => !protokolleDatei.some((b) => b.am === p.am)).map((p) => p.am));
  const sperre = entwuerfe
    ? 'Erst speichern – Entwürfe brauchen die zweite Bestätigung'
    : ungespeichertGesamt
      ? abgelegt?.speichern || ungespeichertAbgelegt.size
        ? 'Abgelegt – zum Übernehmen speichern'
        : 'Erst speichern: Es gibt ungespeicherte Änderungen'
      : laedt
        ? 'Die Gesetzestexte werden noch geholt – bitte warten'
        : schonAbgeschlossen
          ? 'Dieser Stand ist schon abgeschlossen'
          : '';
  sperreJetzt.current = sperre;
  // offene Punkte nach der fehlenden Angabe gruppiert („Baugebiet – 20 Paragrafen“), der Rest nach dem Grund
  const ohneRegel = a.normen.filter((n) => n.ohneRegel);
  // fehlende Angaben genau wie „Klärt am meisten“ gezählt (ein Paragraf kann unter mehreren Angaben stehen)
  const gruppen = new Map<string, ParagrafErgebnis[]>();
  // dieselben Paare (Paragraf, klärende Angabe) wie „Klärt am meisten“ – aus der Auswertung, nicht neu gezählt
  for (const k of a.klaerung)
    gruppen.set(
      `Es fehlt: ${k.titel}`,
      a.paragrafen.filter((p) => p.klaerend?.includes(k.id)),
    );
  // Hinweise, deren Bestätigung entscheidet – dieselben Paare wie „bestätigen klärt“
  for (const k of a.bestaetigen ?? [])
    gruppen.set(
      `Bestätigen: ${k.titel}`,
      a.paragrafen.filter((p) => p.bestaetigend === k.id),
    );
  for (const p of [...offen, ...ueberholt]) {
    const sonder = gruppeVon(p);
    if (!sonder && ((p.klaerend?.length ?? 0) > 0 || p.bestaetigend)) continue; // steht schon unter seinen klärenden Angaben
    // sonst nach dem Grund: hängt an einem offenen Paragrafen, oder die fehlenden Angaben entscheiden nur zusammen
    const o = p.offen[0];
    // „Einzelfall möglich – es fehlt: A · B. <Grund>“: nur die fehlenden Angaben (aus `offen`, nicht aus dem Text – Namen
    // können selbst „Abs. 6“ enthalten); sonst bis vor die erste Klammer
    const g0 = p.gruende[0];
    const einzelfallFehlt = /^Einzelfall möglich – /.test(g0) ? p.offen.filter((x) => !x.startsWith('paragraf:')).map((x) => offenText(x, a.text)) : [];
    const k =
      sonder ||
      (o?.startsWith('paragraf:')
        ? `Hängt an ${offenText(o, a.text)} – dort offen`
        : einzelfallFehlt.length
          ? `Einzelfall möglich – es fehlt: ${einzelfallFehlt.join(' · ')}`
          : g0
              .replace(/\s*\(.*$/, '')
              .replace(/^Offen – /, '')
              .replace(/\.$/, ''));
    gruppen.set(k, [...(gruppen.get(k) ?? []), p]);
  }
  // Gruppen mit nur einem Paragrafen kommen zusammen in eine Zeile „Weitere“
  const einzeln = [...gruppen.entries()].filter(([, ps]) => ps.length === 1);
  const mehrere = [...gruppen.entries()].filter(([, ps]) => ps.length > 1).sort((x, y) => y[1].length - x[1].length);
  const titel = `Baurechtliche Prüfung vor dem Einreichen – ${antrag}`;
  // Stand einer Festlegung von Hand: bestätigt/Entwurf und wirksam/überholt/nicht wirksam – getrennt von der Begründung
  // mehrteilig: Entwurf/bestätigt und – falls – überholt bzw. noch nicht wirksam
  const festlegungStand = (q: ParagrafErgebnis) =>
    [q.festlegung!.bestaetigt ? 'bestätigt' : 'Entwurf – zweite Bestätigung fehlt', q.ueberholt ? `überholt: ${q.ueberholt}` : q.unwirksam ? `noch nicht wirksam: ${q.unwirksam}` : '']
      .filter(Boolean)
      .join(' · ');
  // Zeilen der offenen Punkte, fehlende Angaben nach ihrer Gruppe (Lage, Gebäude …) – ab 15 Zeilen mit Zwischenzeilen
  const gruppeDerAngabe = new Map<string, string>([
    ...a.klaerung.map((k): [string, string] => [`Es fehlt: ${k.titel}`, FAKT_GRUPPEN.find((g) => g.id === a.faktDefs[k.id]?.gruppe)?.titel ?? 'Weitere Angaben']),
    ...(a.bestaetigen ?? []).map((k): [string, string] => [`Bestätigen: ${k.titel}`, FAKT_GRUPPEN.find((g) => g.id === a.faktDefs[k.id]?.gruppe)?.titel ?? 'Weitere Angaben']),
  ]);
  const zeilen = mehrere.map(([k, ps]) => ({ k, ps, gruppe: gruppeDerAngabe.get(k) ?? 'Andere Gründe' }));
  const reihenfolge = [...FAKT_GRUPPEN.map((g) => g.titel), 'Weitere Angaben', 'Andere Gründe'];
  zeilen.sort((x, y) => reihenfolge.indexOf(x.gruppe) - reihenfolge.indexOf(y.gruppe) || y.ps.length - x.ps.length);
  const mitZwischen = zeilen.length > 15;
  // Einzelpunkte als eigene Tabelle Norm | Paragraf | Grund – sortiert, je Paragraf einmal (mehrere Gründe zusammen)
  const weitere = new Map<string, { norm: string; nr: string; sort: string; gruende: string[] }>();
  for (const [k, ps] of einzeln) {
    const q = ps[0];
    const norm = a.normen.find((n) => n.id === `${q.modul}/${q.norm}`)?.def.kurz ?? q.norm;
    const e = einheitName(q.paragraf, q.titel);
    const eintrag = weitere.get(q.id) ?? { norm, nr: e.nr || e.titel, sort: `${norm}|${q.paragraf.padStart(6, '0')}`, gruende: [] };
    const grund = k.replace(/^Es fehlt: /, '');
    if (!eintrag.gruende.includes(grund)) eintrag.gruende.push(grund);
    weitere.set(q.id, eintrag);
  }
  const weitereZeilen = [...weitere.values()].sort((x, y) => x.sort.localeCompare(y.sort, 'de', { numeric: true }));

  const abschliessen = () => {
    if (sperre) return;
    const ampeln: Record<string, Ampel> = Object.fromEntries(a.paragrafen.map((p) => [p.id, p.ampel]));
    const am = new Date().toISOString();
    useBaurecht.getState().protokollAnhaengen({
      am,
      von: benutzer(),
      paket: paket.version,
      einreichung: pruefstand.einreichung,
      fassungen: verwendeteFassungen(a),
      zaehler: a.zaehler,
      ampeln,
      offen: offen.length + ueberholt.length + ohneRegel.length,
    });
    // sichtbar und angesagt, Fokus auf die Meldung (der Knopf ist danach gesperrt – sonst fiele der Fokus auf die Seite)
    fokusNachMeldung.current = true;
    setAbgelegt({
      text: `Prüfung vom ${datum(am)} abgelegt (${a.zaehler.rot} gilt · ${a.zaehler.gelb} prüfen · ${a.zaehler.gruen} entfällt) – zum Übernehmen in die Datei speichern.`,
      speichern: true,
    });
  };
  const datei = quelle?.art === 'ordner' ? quelle.datei : quelle?.art === 'datei' ? quelle.name : null;
  const geo = [
    ...new Set(
      Object.values(a.fakten)
        .filter((f) => f.herkunft === 'geodienst' && f.quelle)
        .map((f) => `${f.quelle}${f.stand ? `, abgefragt ${datum(f.stand)}` : ''}`),
    ),
  ];
  return (
    <div className="report-backdrop br-protokoll-hintergrund">
      <div className="report br-protokoll" role="dialog" aria-modal="true" aria-label={titel} ref={fenster} tabIndex={-1}>
        {entwuerfe > 0 && <style>{entwurfDruck(entwurfText, entwuerfe === 1)}</style>}
        <div className="report-actions no-print br-protokoll-aktionen">
          <label className="toggle">
            <input type="checkbox" checked={nurRelevant} onChange={(e) => setNurRelevant(e.target.checked)} /> ohne „entfällt“
          </label>
          <span className="tb-spacer" />
          {/* steht die Meldung „abgelegt“ darunter, sagt sie den Grund – der Sperrtext nicht noch einmal */}
          {sperre && !abgelegt?.speichern && (
            <span className="br-sperre" id="br-sperre-grund">
              {sperre}
            </span>
          )}
          {/* wo „Erst speichern …“ steht, auch der Weg dorthin (die Rückmeldung kommt in der Live-Region darunter) */}
          {onSpeichern && ungespeichertGesamt && !abgelegt?.speichern && (
            <button
              type="button"
              className="small"
              aria-disabled={speichertJetzt || undefined}
              aria-describedby="br-sperre-grund"
              data-startfokus=""
              onClick={async () => {
                if (speichertJetzt) return;
                setSpeichertJetzt(true);
                fokusNachMeldung.current = true;
                const ok = await onSpeichern();
                setSpeichertJetzt(false);
                // abgebrochen bzw. gescheitert: kein Anlass mehr – ein späteres Strg+S verschiebt den Fokus nicht
                if (!ok) fokusNachMeldung.current = false;
              }}
            >
              Jetzt speichern
            </button>
          )}
          <button type="button" className="br-drucken" data-startfokus="" onClick={() => druckenAls({ datei, projektName: project.name, zusatz: `Baurecht ${antrag}` })}>
            Drucken / PDF …
          </button>
          <button
            type="button"
            className="primary"
            onClick={abschliessen}
            disabled={!!sperre}
            aria-describedby={sperre && !abgelegt?.speichern ? 'br-sperre-grund' : undefined}
            title={sperre || 'Diesen Stand mit Fassungen und Ampeln in der Projektdatei ablegen (danach speichern)'}
          >
            Prüfung abschließen
          </button>
          <button type="button" onClick={onClose}>
            Schließen
          </button>
        </div>
        {/* Meldung nach dem Abschließen: der Text in einer stehenden Live-Region, der Knopf daneben (nicht mitgelesen) */}
        <div ref={meldung} tabIndex={-1} className={abgelegt ? 'br-meldung br-meldung-info no-print br-abgelegt' : 'no-print'}>
          <span role="status" id="br-abgelegt-text">
            {abgelegt?.text ?? ''}
          </span>
          {onSpeichern && abgelegt?.speichern && (
            <>
              {' '}
              <button
                type="button"
                className="small"
                aria-disabled={speichertJetzt || undefined}
                onClick={async () => {
                  if (speichertJetzt) return;
                  setSpeichertJetzt(true);
                  fokusNachMeldung.current = true;
                  const ok = await onSpeichern();
                  setSpeichertJetzt(false);
                  fokusNachMeldung.current = true;
                  if (!ok) setTimeout(() => (fokusNachMeldung.current = false), 0);
                  setAbgelegt(
                    ok
                      ? { text: 'Gespeichert – die abgeschlossene Prüfung steht in der Projektdatei.', speichern: false }
                      : { text: 'Nicht gespeichert – die Prüfung ist abgelegt, steht aber noch nicht in der Datei.', speichern: true },
                  );
                }}
              >
                Jetzt speichern
              </button>
            </>
          )}
        </div>
        {entwuerfe > 0 && (
          <p className="br-meldung br-meldung-warn br-entwurf-hinweis no-print" role="status">
            Entwurf: {entwurfText.charAt(0).toUpperCase() + entwurfText.slice(1)} {entwuerfe === 1 ? 'ist' : 'sind'} noch nicht gespeichert und bestätigt – unten als „Entwurf“ bzw. „noch nicht
            gespeichert“ gekennzeichnet. Abschließen lässt sich die Prüfung erst nach dem Speichern.
          </p>
        )}
        <DruckKopf titel={titel} project={project} stand={new Date()} />
        <h2>Grundlagen</h2>
        <table className="report-table narrow">
          <tbody>
            <tr>
              <td>Geplante Einreichung (Stichtag)</td>
              <td className="strong">{datum(pruefstand.einreichung)}</td>
            </tr>
            <tr>
              <td>Regelmodule</td>
              <td>
                {/* Gemeinde zuerst – wie im Kopf */}
                {[...pruefstand.module]
                  .reverse()
                  .map((m) => `${m.name} (Stand ${stand(m.version)})`)
                  .join(' · ')}{' '}
                – Regelpaket {paket.version}
              </td>
            </tr>
            {pruefstand.fehlend.length > 0 && (
              <tr>
                <td>Ohne Modul</td>
                <td>{pruefstand.fehlend.join(', ')} – von Hand zu prüfen</td>
              </tr>
            )}
            <tr>
              <td>Antragsmerkmale</td>
              {/* Reihenfolge und Namen wie in der Leiste */}
              <td>
                {VORGABE_MERKMALE.filter((m) => merkmale[m.name])
                  .map((m) =>
                    m.werte.includes(merkmale[m.name])
                      ? `${MERKMAL_TITEL[m.name] ?? m.name}: ${merkmale[m.name]}${merkmalVermerk(m.name)}`
                      : `${MERKMAL_TITEL[m.name] ?? m.name}: „${merkmale[m.name]}“ – passt nicht zur Liste, nicht gewertet`,
                  )
                  .join(' · ') || '–'}
              </td>
            </tr>
            <tr>
              <td>Ergebnis</td>
              <td className="strong">
                {a.zaehler.rot} gilt · {a.zaehler.gelb} prüfen · {a.zaehler.gruen} entfällt
                {ausEntwurf.length > 0 && <span className="br-entwurf-text"> – davon {ausEntwurf.length} aus Entwürfen von Hand</span>}
                {nurRelevant && a.zaehler.gruen > 0 && <span className="br-leise"> – Vorschriften mit „entfällt“ ({a.zaehler.gruen}) sind in diesem Ausdruck nicht aufgeführt</span>}
                {anOffenem > 0 && (
                  <span className="br-entwurf-text">
                    {' '}
                    – {anOffenem === 1 ? 'ein Paragraf hängt' : `${anOffenem} Paragrafen hängen`} an{' '}
                    {offeneB === PLANUNGSRECHT ? 'der noch nicht gespeicherten Bestätigung des Planungsrechts' : 'noch nicht gespeicherten Bestätigungen'}
                  </span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
        {/* echte Widersprüche und der Vorbehalt beim Planungsrecht getrennt – das Planungsrecht widerspricht nichts */}
        {pruefstand.widersprueche.some((w) => w !== pruefstand.planungsrechtHinweis) && (
          <p className="report-note">Widerspruch: {pruefstand.widersprueche.filter((w) => w !== pruefstand.planungsrechtHinweis).join('; ')}</p>
        )}
        {pruefstand.planungsrechtHinweis && <p className="report-note">Nicht gesichert: {pruefstand.planungsrechtHinweis}.</p>}

        <h2>Festlegungen von Hand ({vonHand.length})</h2>
        {vonHand.length ? (
          <table className="report-table">
            <thead>
              <tr>
                <th style={{ width: '22%' }}>Paragraf</th>
                <th style={{ width: '13%' }}>Festlegung</th>
                <th>Begründung</th>
                <th style={{ width: '13%' }}>von, am</th>
                <th style={{ width: '18%' }}>Stand</th>
              </tr>
            </thead>
            <tbody>
              {vonHand.map((p) => (
                <tr key={p.id}>
                  <td className="strong">{a.text.paragraf?.(p.id) ?? p.id}</td>
                  <td>
                    {AMPEL_TEXT[p.festlegung!.ampel]} <span className="report-meta">(automatisch: {AMPEL_TEXT[p.automatisch]})</span>
                  </td>
                  <td>{p.festlegung!.grund}</td>
                  <td>
                    {p.festlegung!.von}, {datum(p.festlegung!.am)}
                  </td>
                  <td className={p.festlegung!.bestaetigt && !p.ueberholt && !p.unwirksam ? '' : 'br-entwurf-text'}>{festlegungStand(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Keine.</p>
        )}
        <h2>Gesicherte Angaben ({gesichert.length})</h2>
        {gesichert.length ? (
          <table className="report-table">
            <thead>
              <tr>
                <th style={{ width: '24%' }}>Angabe</th>
                <th style={{ width: '12%' }}>Wert</th>
                <th style={{ width: '20%' }}>Herkunft</th>
                <th>gestützt auf</th>
                <th style={{ width: '18%' }}>gesichert von, am</th>
              </tr>
            </thead>
            <tbody>
              {gesichert.map(([id, f]) => (
                <tr key={id}>
                  <td className="strong">{faktName(a.faktDefs[id], id)}</td>
                  <td>{wertAnzeige(f.wert, a.faktDefs[id])}</td>
                  <td>{f.herkunft === 'manuell' ? 'von Hand angegeben' : herkunftText(f)}</td>
                  <td>{f.bestaetigt!.grund || '–'}</td>
                  <td>
                    {f.bestaetigt!.von}, {datum(f.bestaetigt!.am)}
                    {ungespeichert.has(id) && <span className="br-entwurf-text"> – noch nicht gespeichert</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Keine.</p>
        )}

        <h2>Angaben von Hand ohne Beleg ({vonHandOhneBeleg.length})</h2>
        {vonHandOhneBeleg.length ? (
          <table className="report-table">
            <thead>
              <tr>
                <th style={{ width: '34%' }}>Angabe</th>
                <th style={{ width: '16%' }}>Wert</th>
                <th>eingetragen von, am</th>
              </tr>
            </thead>
            <tbody>
              {vonHandOhneBeleg.map(([id, f]) => (
                <tr key={id}>
                  <td className="strong">{faktName(a.faktDefs[id], id)}</td>
                  <td>
                    {wertAnzeige(f.wert, a.faktDefs[id])}
                    {/* nur noch Hinweis (frühere Lage, ohne Koordinaten): gekennzeichnet, nicht wie eine geltende Angabe */}
                    {f.sicherheit === 'hinweis' && <span className="br-entwurf-text"> – nur Hinweis{lageVermerk(eigeneFakten[id], f)}</span>}
                  </td>
                  <td>
                    {/^von Hand \((.+)\)$/.exec(f.quelle ?? '')?.[1] ?? '–'}
                    {f.stand ? `, ${datum(f.stand)}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Keine.</p>
        )}
        {/* gespeicherte Antworten auf Fragen, die gerade nicht gestellt werden (z. B. nach einem Ortswechsel) */}
        {nichtGestellt.length > 0 && (
          <p className="br-leise">
            Antworten auf derzeit nicht gestellte Fragen (ohne Wirkung): {nichtGestellt.map(([id, f]) => `${faktName(a.faktDefs[id], id)}: ${wertAnzeige(f.wert, a.faktDefs[id])}`).join(' · ')}
          </p>
        )}

        <h2>Offene Punkte ({offen.length + ueberholt.length + ohneRegel.length})</h2>
        {offen.length + ueberholt.length + ohneRegel.length ? (
          <>
            <table className="report-table br-protokoll-offen">
              <thead>
                <tr>
                  <th style={{ width: '32%' }}>Was fehlt bzw. zu klären ist</th>
                  <th style={{ width: '9%' }}>Anzahl</th>
                  <th>Paragrafen</th>
                </tr>
              </thead>
              <tbody>
                {ohneRegel.length > 0 && (
                  <tr>
                    <td className="strong">Keine Regeldatei – von Hand beurteilen</td>
                    <td>{ohneRegel.length}</td>
                    <td>{nb(ohneRegel.map((n) => normVoll(n.def)).join(' · '))}</td>
                  </tr>
                )}
                {zeilen.map(({ k, ps, gruppe }, i) => (
                  <Fragment key={k}>
                    {mitZwischen && gruppe !== zeilen[i - 1]?.gruppe && (
                      <tr className="br-protokoll-zwischen">
                        <th colSpan={3}>{gruppe}</th>
                      </tr>
                    )}
                    <tr>
                      {/* die Spalte heißt schon „Was fehlt“ – ohne den Vorsatz je Zeile */}
                      <td className="strong">{nb(k.replace(/^Es fehlt: /, ''))}</td>
                      <td>{ps.length}</td>
                      <td>{nachNorm(ps, a.normen)}</td>
                    </tr>
                  </Fragment>
                ))}
                {weitereZeilen.length > 0 && (
                  <tr>
                    <td className="strong">Weitere (je ein Paragraf)</td>
                    <td>{weitereZeilen.length}</td>
                    <td>siehe Tabelle „Weitere offene Punkte“</td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="report-note">Ein Paragraf kann unter mehreren fehlenden Angaben stehen – gezählt wie unter „Klärt am meisten“.</p>
            {weitereZeilen.length > 0 && (
              <>
                <h3>Weitere offene Punkte (je ein Paragraf)</h3>
                <table className="report-table br-protokoll-weitere">
                  <thead>
                    <tr>
                      <th style={{ width: '16%' }}>Norm</th>
                      <th style={{ width: '24%' }}>Paragraf</th>
                      <th>Was fehlt bzw. zu klären ist</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weitereZeilen.map((z) => (
                      <tr key={`${z.sort}|${z.nr}`}>
                        <td>{z.norm}</td>
                        {/* kurze Nummern („§ 248“, „Art. 14“) bleiben zusammen, Titel brechen um */}
                        <td className={z.nr.length <= 8 ? 'br-nr-kurz' : undefined}>{nb(z.nr)}</td>
                        <td>{nb(z.gruende.join(' · '))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        ) : (
          <p>Keine – alle Vorschriften sind eingeordnet.</p>
        )}

        {EBENEN.map((e) => {
          const normen = a.normen.filter((n) => n.ebene === e.id);
          if (!normen.length) return null;
          return (
            <section key={e.id} className="br-protokoll-ebene">
              <h2>Vorschriften – {e.titel}</h2>
              {normen.map((n) => {
                const ps = n.paragrafen.filter((p) => !nurRelevant || p.ampel !== 'gruen');
                if (!ps.length && nurRelevant) return null;
                return (
                  <div key={n.id} className="br-protokoll-norm">
                    <h3>
                      {nb(normVoll(n.def))}{' '}
                      <span className="report-meta">
                        {n.fassung ? `– ${n.fassung.text}, abgerufen ${datum(n.fassung.abgerufen)}` : n.def.quelle.art === 'verweis' ? '– nur Fundstelle' : '– Text nicht abgerufen'}
                      </span>
                    </h3>
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th style={{ width: '9%' }}>Einheit</th>
                          <th style={{ width: '24%' }}>Titel</th>
                          <th style={{ width: '13%' }}>Ampel</th>
                          <th>Begründung</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ps.map((p) => {
                          const e = einheitName(p.paragraf, p.titel);
                          return (
                            <tr key={p.id} className={`br-zeile-${p.ampel}`}>
                              <td>{e.nr}</td>
                              <td>{e.titel}</td>
                              <td className="strong">{ampelText(p)}</td>
                              <td>
                                {p.festlegung ? `${p.festlegung.grund} (${p.festlegung.von}, ${datum(p.festlegung.am)}; automatisch: ${AMPEL_TEXT[p.automatisch]})` : p.gruende.join(' ')}
                                {(p.ueberholt || p.unwirksam) && <div className="report-meta">{p.ueberholt ? `überholt, weil ${p.ueberholt}` : `noch nicht wirksam, weil ${p.unwirksam}`}</div>}
                              </td>
                            </tr>
                          );
                        })}
                        {n.ohneRegel && (
                          <tr>
                            <td colSpan={4}>Keine Regeldatei – von Hand beurteilen.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </section>
          );
        })}

        {geo.length > 0 && (
          <>
            <h2>Quellen der Geodaten</h2>
            <ul>
              {geo.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </>
        )}
        {a.hinweise.length > 0 && (
          <>
            <h2>Hinweise und Auskünfte</h2>
            <ul>
              {a.hinweise.map((h, i) => (
                <li key={i}>
                  <strong>{h.titel}</strong>
                  {h.titel.includes(h.modul) ? '' : ` (${h.modul})`}: {nb(h.text)}
                </li>
              ))}
            </ul>
          </>
        )}
        {protokolle.length > 0 && (
          <>
            <h2>Abgeschlossene Prüfungen</h2>
            <ul>
              {protokolle.map((p) => (
                <li key={p.am}>
                  {datum(p.am)}, {uhrzeit(p.am)} ({p.von}){ungespeichertAbgelegt.has(p.am) ? ' – noch nicht in der Datei gespeichert' : ''}: {p.zaehler.rot} gilt · {p.zaehler.gelb} prüfen ·{' '}
                  {p.zaehler.gruen} entfällt – Regelpaket {p.paket}, Einreichung {datum(p.einreichung)}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="report-note">
          Arbeitshilfe – ersetzt keine fachliche Prüfung. Die rechtliche Einordnung bleibt bei den Entwurfsverfassenden (§ 54 BauO NRW). Gesetzestexte aus den amtlichen Quellen zum Abrufdatum;
          Geodaten sind nicht rechtsverbindlich.
        </p>
      </div>
    </div>
  );
}
