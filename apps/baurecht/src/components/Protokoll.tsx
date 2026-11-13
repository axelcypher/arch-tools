import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { offenText, werten } from '@core/baurecht/kurz';
import { MERKMAL_TITEL } from '@core/baurecht/fakten';
import { VORGABE_MERKMALE } from '@core/bedingung';
import type { Ampel, FaktWert, ParagrafErgebnis } from '@core/baurecht/typen';
import { EBENEN, einheitName, FAKT_GRUPPEN, faktName, normVoll, wertAnzeige } from '@core/baurecht/typen';
import { druckenAls } from '@core/platform/projektDatei';
import { DruckKopf } from '@core/ui/DruckKopf';
import { useEscSchliessen } from '@core/ui/Dialog';
import { benutzer } from '../benutzer';
import type { Pruefstand } from '../pruefung';
import { aktuelleLage, auswertungMit, OHNE_LAGEBEZUG, verwendeteFassungen } from '../pruefung';
import { istGeaendert, offeneBestaetigungen, offeneFestlegungen, PLANUNGSRECHT, useBaurecht } from '../store';
import { AMPEL_TEXT, datum, nb } from './Ampel';



/** Herkunft einer gesicherten Angabe in Worten – ohne die Hinweistexte der App („bitte bestätigen …“) */
function herkunftText(f: FaktWert): string {
  switch (f.herkunft) {
    case 'geodienst':
      return `Geodienst${f.quelle ? ` ${f.quelle}` : ''}${f.stand ? `, abgefragt ${datum(f.stand)}` : ''}`;
    case 'abgeleitet':
      return `abgeleitet${f.quelle ? ` aus ${f.quelle}` : ''}`;
    case 'flaechen':
      return 'Flächenrechner (Modell)';
    case 'grz':
      return 'GRZ-Nachweis';
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

/** Entwurfsvermerk als Kopfzeile jeder Druckseite (im reservierten oberen Seitenrand, überdruckt keinen Text) */
const ENTWURF_DRUCK = `@media print { @page { margin-top: 20mm; @top-center { content: 'ENTWURF – enthält nicht gespeicherte bzw. nicht bestätigte Festlegungen oder gesicherte Angaben'; font: 700 14pt 'Segoe UI', system-ui, sans-serif; color: #8a5300; } } }`;
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
export function Protokoll({ stand: pruefstand, onClose }: { stand: Pruefstand; onClose: () => void }) {
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
  // so viele Paragrafen hängen an der noch nicht gespeicherten Bestätigung des Planungsrechts (Vergleich mit dem Stand der Datei)
  const prGeaendert = useMemo(() => {
    if (!offeneB.split('|').includes(PLANUNGSRECHT)) return 0;
    const datei = auswertungMit(eigeneFakten, { planungsrechtOrt: useBaurecht.getState().pruefungDatei.planungsrechtOrt });
    const dort = new Map(datei.paragrafen.map((p) => [p.id, p.ampel]));
    return pruefstand.auswertung.paragrafen.filter((p) => dort.has(p.id) && dort.get(p.id) !== p.ampel).length;
  }, [offeneB, eigeneFakten, pruefstand]);
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
      const gestellt = (id: string) => !!a0.faktDefs[id] && (!a0.faktDefs[id].wenn || werten(a0.faktDefs[id].wenn, a0.kontext).w === 'ja');
      const teile = ['vorhaben.beseitigung_umfang', 'nw.altbau_verfahrensfrei', 'nw.beseitigung_mit_beantragt']
        .filter((id) => pruefstand.auswertung.fakten[id]?.wert != null && gestellt(id))
        .map((id) => (id === 'vorhaben.beseitigung_umfang' ? String(pruefstand.auswertung.fakten[id].wert) : `${faktName(pruefstand.auswertung.faktDefs[id], id)}: ${wertAnzeige(pruefstand.auswertung.fakten[id].wert, pruefstand.auswertung.faktDefs[id])}`));
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
  // Fokus: beim Öffnen hinein, Tab bleibt im Protokoll, beim Schließen zurück an die Stelle davor
  useEffect(() => {
    const vorher = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const d = fenster.current;
    d?.querySelector<HTMLElement>('.br-protokoll-aktionen button:not([disabled])')?.focus();
    const taste = (e: KeyboardEvent) => {
      // liegt ein Dialog über dem Protokoll (z. B. Bestätigen beim Speichern), führt der den Fokus
      if (e.key !== 'Tab' || !d || document.querySelector('.modal')) return;
      const ziele = [...d.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]')];
      if (!ziele.length) return;
      const [erstes, letztes] = [ziele[0], ziele[ziele.length - 1]];
      if (!d.contains(document.activeElement)) {
        e.preventDefault();
        erstes.focus();
      } else if (e.shiftKey && document.activeElement === erstes) {
        e.preventDefault();
        letztes.focus();
      } else if (!e.shiftKey && document.activeElement === letztes) {
        e.preventDefault();
        erstes.focus();
      }
    };
    document.addEventListener('keydown', taste, true);
    return () => {
      document.removeEventListener('keydown', taste, true);
      if (vorher?.isConnected) vorher.focus();
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
  const entwurfTeile = [nF ? (nF === 1 ? 'eine Festlegung von Hand' : `${nF} Festlegungen von Hand`) : '', ungespeichert.size ? (ungespeichert.size === 1 ? 'eine gesicherte Angabe' : `${ungespeichert.size} gesicherte Angaben`) : '', prEntwurf ? 'die Bestätigung des Planungsrechts' : ''].filter(Boolean);
  const entwurfText = entwurfTeile.length > 1 ? `${entwurfTeile.slice(0, -1).join(', ')} und ${entwurfTeile[entwurfTeile.length - 1]}` : (entwurfTeile[0] ?? '');
  const offen = a.paragrafen.filter((p) => p.ampel === 'gelb');
  const vonHand = a.paragrafen.filter((p) => p.festlegung);
  const ausEntwurf = vonHand.filter((p) => !p.festlegung!.bestaetigt);
  const ueberholt = a.paragrafen.filter((p) => p.ueberholt && p.ampel !== 'gelb');
  const gesichert = Object.entries(a.fakten).filter(([, f]) => f.bestaetigt);
  // Angaben von Hand ohne Beleg: auch sie tragen Ampeln (z. B. „Kampfmittelverdacht: nein“) – mit wer und wann
  // nur Angaben, die das Regelpaket kennt (eine Angabe einer früheren Fassung stünde sonst mit ihrer rohen Kennung da)
  const vonHandOhneBeleg = Object.entries(a.fakten).filter(([id, f]) => id in eigeneFakten && !!a.faktDefs[id] && id !== 'antrag.einreichung' && f.herkunft === 'manuell' && !f.bestaetigt && f.wert != null);
  // abgeschlossen wird nur ein gespeicherter, zweimal bestätigter und vollständig geladener Stand
  const sperre = entwuerfe ? `Erst speichern: ${entwurfText} ${entwuerfe === 1 ? 'ist' : 'sind'} noch Entwurf (zweite Bestätigung fehlt)` : ungespeichertGesamt ? 'Erst speichern: Es gibt ungespeicherte Änderungen' : laedt ? 'Die Gesetzestexte werden noch geholt – bitte warten' : '';
  // offene Punkte nach der fehlenden Angabe gruppiert („Baugebiet – 20 Paragrafen“), der Rest nach dem Grund
  const ohneRegel = a.normen.filter((n) => n.ohneRegel);
  // fehlende Angaben genau wie „Klärt am meisten“ gezählt (ein Paragraf kann unter mehreren Angaben stehen)
  const gruppen = new Map<string, ParagrafErgebnis[]>();
  // dieselben Paare (Paragraf, klärende Angabe) wie „Klärt am meisten“ – aus der Auswertung, nicht neu gezählt
  for (const k of a.klaerung) gruppen.set(`Es fehlt: ${k.titel}`, a.paragrafen.filter((p) => p.klaerend?.includes(k.id)));
  // Hinweise, deren Bestätigung entscheidet – dieselben Paare wie „bestätigen klärt“
  for (const k of a.bestaetigen ?? []) gruppen.set(`Bestätigen: ${k.titel}`, a.paragrafen.filter((p) => p.bestaetigend === k.id));
  for (const p of [...offen, ...ueberholt]) {
    const sonder = gruppeVon(p);
    if (!sonder && ((p.klaerend?.length ?? 0) > 0 || p.bestaetigend)) continue; // steht schon unter seinen klärenden Angaben
    // sonst nach dem Grund: hängt an einem offenen Paragrafen, oder die fehlenden Angaben entscheiden nur zusammen
    const o = p.offen[0];
    const k = sonder || (o?.startsWith('paragraf:') ? `Hängt an ${offenText(o, a.text)} – dort offen` : p.gruende[0].replace(/\s*\(.*$/, '').replace(/^Offen – /, '').replace(/\.$/, ''));
    gruppen.set(k, [...(gruppen.get(k) ?? []), p]);
  }
  // Gruppen mit nur einem Paragrafen kommen zusammen in eine Zeile „Weitere“
  const einzeln = [...gruppen.entries()].filter(([, ps]) => ps.length === 1);
  const mehrere = [...gruppen.entries()].filter(([, ps]) => ps.length > 1).sort((x, y) => y[1].length - x[1].length);
  const titel = `Baurechtliche Prüfung vor dem Einreichen – ${antrag}`;
  // Stand einer Festlegung von Hand: bestätigt/Entwurf und wirksam/überholt/nicht wirksam – getrennt von der Begründung
  // mehrteilig: Entwurf/bestätigt und – falls – überholt bzw. noch nicht wirksam
  const festlegungStand = (q: ParagrafErgebnis) =>
    [q.festlegung!.bestaetigt ? 'bestätigt' : 'Entwurf – zweite Bestätigung fehlt', q.ueberholt ? `überholt: ${q.ueberholt}` : q.unwirksam ? `noch nicht wirksam: ${q.unwirksam}` : ''].filter(Boolean).join(' · ');
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
    useBaurecht.getState().protokollAnhaengen({ am: new Date().toISOString(), von: benutzer(), paket: paket.version, einreichung: pruefstand.einreichung, fassungen: verwendeteFassungen(a), zaehler: a.zaehler, ampeln, offen: offen.length + ueberholt.length + ohneRegel.length });
  };
  const datei = quelle?.art === 'ordner' ? quelle.datei : quelle?.art === 'datei' ? quelle.name : null;
  const geo = [...new Set(Object.values(a.fakten).filter((f) => f.herkunft === 'geodienst' && f.quelle).map((f) => `${f.quelle}${f.stand ? `, abgefragt ${datum(f.stand)}` : ''}`))];
  return (
    <div className="report-backdrop br-protokoll-hintergrund">
      <div className="report br-protokoll" role="dialog" aria-modal="true" aria-label={titel} ref={fenster}>
        {entwuerfe > 0 && <style>{ENTWURF_DRUCK}</style>}
        <div className="report-actions no-print br-protokoll-aktionen">
          <label className="toggle">
            <input type="checkbox" checked={nurRelevant} onChange={(e) => setNurRelevant(e.target.checked)} /> ohne „entfällt“
          </label>
          <span className="tb-spacer" />
          {sperre && (
            <span className="br-sperre" id="br-sperre-grund">
              {sperre}
            </span>
          )}
          <button type="button" onClick={() => druckenAls({ datei, projektName: project.name, zusatz: `Baurecht ${antrag}` })}>
            Drucken / PDF …
          </button>
          <button
            type="button"
            className="primary"
            onClick={abschliessen}
            disabled={!!sperre}
            aria-describedby={sperre ? 'br-sperre-grund' : undefined}
            title={sperre || 'Diesen Stand mit Fassungen und Ampeln in der Projektdatei ablegen (danach speichern)'}
          >
            Prüfung abschließen
          </button>
          <button type="button" onClick={onClose}>
            Schließen
          </button>
        </div>
        {entwuerfe > 0 && (
          <p className="br-meldung br-meldung-warn br-entwurf-hinweis no-print" role="status">
            Entwurf: {entwurfText.charAt(0).toUpperCase() + entwurfText.slice(1)} {entwuerfe === 1 ? 'ist' : 'sind'} noch nicht gespeichert und bestätigt – unten als „Entwurf“ bzw. „noch nicht gespeichert“ gekennzeichnet. Abschließen lässt sich die Prüfung erst nach dem Speichern.
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
                {[...pruefstand.module].reverse().map((m) => `${m.name} (Stand ${stand(m.version)})`).join(' · ')} – Regelpaket {paket.version}
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
                  .map((m) => `${MERKMAL_TITEL[m.name] ?? m.name}: ${merkmale[m.name]}${m.werte.includes(merkmale[m.name]) ? merkmalVermerk(m.name) : ' (passt nicht zur Liste – nicht gewertet)'}`)
                  .join(' · ') || '–'}
              </td>
            </tr>
            <tr>
              <td>Ergebnis</td>
              <td className="strong">
                {a.zaehler.rot} gilt · {a.zaehler.gelb} prüfen · {a.zaehler.gruen} entfällt
                {ausEntwurf.length > 0 && <span className="br-entwurf-text"> – davon {ausEntwurf.length} aus Entwürfen von Hand</span>}
                {prGeaendert > 0 && (
                  <span className="br-entwurf-text">
                    {' '}
                    – {prGeaendert === 1 ? 'ein Paragraf' : `${prGeaendert} Paragrafen`} nur durch die noch nicht gespeicherte Bestätigung des Planungsrechts
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
              <table className="report-table">
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
                      <td>{nb(z.nr)}</td>
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
                              {(p.ueberholt || p.unwirksam) && <div className="report-meta">{p.ueberholt ? `Festlegung überholt: ${p.ueberholt}` : `Festlegung noch nicht wirksam: ${p.unwirksam}`}</div>}
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
                  {datum(p.am)} ({p.von}): {p.zaehler.rot} gilt · {p.zaehler.gelb} prüfen · {p.zaehler.gruen} entfällt – Regelpaket {p.paket}, Einreichung {datum(p.einreichung)}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="report-note">
          Arbeitshilfe – ersetzt keine fachliche Prüfung. Die rechtliche Einordnung bleibt bei den Entwurfsverfassenden (§ 54 BauO NRW). Gesetzestexte aus den amtlichen Quellen zum Abrufdatum; Geodaten sind nicht rechtsverbindlich.
        </p>
      </div>
    </div>
  );
}
