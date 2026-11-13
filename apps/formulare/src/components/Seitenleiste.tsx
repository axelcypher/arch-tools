import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { einfuegeStelle, zeigerZiehen } from '@core/ui/ziehen';
import { Ziehgriff } from '@core/ui/Leiste';
import { formularAktualisieren } from '../aktualisieren';
import { useId, useMemo, useState } from 'react';
import { oeffnePfad, verbinde } from '../dateisystem';
import { ablageVon, auswahlVon, formularDatei, hatEntwurf, istGeaendert, useFormulare } from '../store';
import { aktiveFassung, aktiverEingereicht, antragSperre, useAntrag, wechselLaeuft, zeilenFassung } from '../antragStore';
import { AntragsAblage, SammelExportKnopf } from './AntragsAblage';
import type { FormularEintrag } from '../projekte';
import { formularLoeschen, formularUmbenennen } from '../dateiAktionen';
import { AblageBaum } from './AblageBaum';
import { ausUmfangEntfernen, FassungsWahl, formularePunkte, StatusPunkt, umfangZeigen } from './Antrag';
import { nachReihenfolge, passt, STATUS_TEXT } from '../antrag';
import { useExportDialog } from './ExportDialog';
import { useHinzufuegenDialog } from './FormularHinzufuegen';
import type { MenuePunkt } from '@core/ui/Menue';
import { zeigeMenue, zeigeMenueAn } from '@core/ui/Menue';
import { Symbol } from '@core/ui/Symbol';
import { zeitKurz, zeitLang } from '../zeit';

/** Aufklappbarer Abschnitt der Navigation; der Zustand bleibt je Abschnitt erhalten */
function Abschnitt({ id, titel, kopf, children, start = true }: { id: string; titel: ReactNode; kopf?: ReactNode; children: ReactNode; start?: boolean }) {
  const schluessel = `formulare:block:${id}`;
  const [auf, setAuf] = useState(() => {
    try {
      const v = localStorage.getItem(schluessel);
      return v === null ? start : v === '1';
    } catch {
      return start;
    }
  });
  const umschalten = () => {
    setAuf(!auf);
    try {
      localStorage.setItem(schluessel, auf ? '0' : '1');
    } catch {
      // nur für diese Sitzung
    }
  };
  return (
    <section className="nav-abschnitt">
      <div className="nav-kopf">
        <button className="nav-kopf-titel" aria-expanded={auf} onClick={umschalten} title={typeof titel === 'string' ? titel : undefined}>
          <Symbol name={auf ? 'pfeilUnten' : 'pfeilRechts'} />
          {/* in einer schmalen Navigation mit Auslassung; die Knöpfe daneben rücken bei Bedarf in die nächste Zeile */}
          <span className="nav-kopf-titel-text">{titel}</span>
        </button>
        <span className="nav-kopf-knoepfe">{kopf}</span>
      </div>
      {auf && <div className="nav-inhalt">{children}</div>}
    </section>
  );
}

/**
 * Links die Navigation der App – auf eigenem Hintergrund, damit sie sich klar vom Inhalt abhebt: Projekt,
 * Projektdaten (die Projektkarte aus FORMA, hervorgehoben), Formulare und – durch eine Linie getrennt – der
 * echte Projektordner.
 */
export function Seitenleiste({ onProjekte, onSperren }: { onProjekte: () => void; onSperren: () => void }) {
  const projekt = useFormulare((s) => s.projekt);
  const formulare = useFormulare((s) => s.formulare);
  const sammel = useFormulare((s) => s.sammel);
  // Sammelprojekt: Überschriften der Gruppen (aria-labelledby der Listen)
  const gruppenId = useId();
  const offen = useFormulare((s) => s.offen);
  const haupt = useFormulare((s) => s.haupt);
  const karte = useFormulare((s) => s.karte);
  const ablage = useFormulare((s) => ablageVon(s, s.projekt));
  const oap = useFormulare((s) => s.oap);
  const auswahl = useFormulare((s) => auswahlVon(s, s.projekt));
  const eigeneAuswahl = useFormulare((s) => !!s.projekt && !!s.auswahl[s.projekt.ordner]);
  const ablageordner = useFormulare((s) => s.ablageordner.length);
  const breite = useFormulare((s) => s.leisteBreite);
  const { projektWaehlen, formularOeffnen, setHaupt, setLeisteBreite, setAuswahl } = useFormulare.getState();
  const [pfadeBearbeiten, setPfadeBearbeiten] = useState(false);
  // Projektordner: ganze Auswahl („Ordner“) oder nur die Dokumente im Antragsordner („Antrag“) – je Rechner gemerkt
  const [ablageAnsicht, setAblageAnsichtRoh] = useState<'ordner' | 'antrag'>(() => {
    try {
      return localStorage.getItem('formulare:ablage-ansicht') === 'antrag' ? 'antrag' : 'ordner';
    } catch {
      return 'ordner';
    }
  });
  const setAblageAnsicht = (a: 'ordner' | 'antrag') => {
    setAblageAnsichtRoh(a);
    try {
      localStorage.setItem('formulare:ablage-ansicht', a);
    } catch {
      // nur für diese Sitzung
    }
  };
  const dokumente = useAntrag((s) => s.dokumente);
  const fassung = useAntrag((s) => aktiveFassung(s, projekt));
  const eingereicht = useAntrag((s) => !!aktiverEingereicht(s, projekt));
  const umfangDa = useAntrag((s) => !!s.projektdatei?.umfang);
  // Status je Formular und fehlende Formulare des Antragsumfangs
  const statusVon = useMemo(() => new Map(dokumente.filter((d) => d.formular && d.status !== 'entfaellt').map((d) => [d.formular!.pfad, d])), [dokumente]);
  const fehlende = dokumente.filter((d) => d.eintrag.art === 'intern' && !d.formular && d.status === 'fehlt');
  // eingereichter Antrag: Antragsumfang gesperrt (Zuordnen, Entfernen, Anlegen)
  const gesperrt = useAntrag((s) => !!antragSperre(s, projekt));
  // ein Antrag wird gerade geöffnet: die Zeilen gehören noch zum bisherigen
  const wechsel = useAntrag((s) => !!wechselLaeuft(s, projekt));
  // so ausgegraut, mit Grund – wie überall bei eingereichtem bzw. gerade geöffnetem Antrag
  const aus = gesperrt ? { deaktiviert: true, hinweis: 'Antrag eingereicht' } : wechsel ? { deaktiviert: true, hinweis: 'Antrag wird geöffnet' } : {};
  // zuletzt bearbeitet: Datei oder nicht gespeicherte Eingaben, was später ist
  const formularInfo = useAntrag((s) => s.formularInfo);
  // Sammelprojekt: Ampel der Formulare auf der obersten Ebene ohne Zuordnung im aktiven Antrag
  const stammStatus = useAntrag((s) => s.stammStatus);
  // Reihenfolge der Formulare (für das ganze Projekt in der Projektdatei); gezogen wird die Zeile, je Liste
  const reihenfolge = useAntrag((s) => s.projektdatei?.reihenfolge);
  // gespeichert wird in der Projektdatei – ohne sie kein Ziehen (sonst sähe es nach Erfolg aus)
  const sortierbar = useAntrag((s) => !!s.projektdatei) && !!oap && oap !== 'fehlt';
  const [zug, setZug] = useState<{ liste: string; pfad: string; stelle: number } | null>(null);
  /**
   * Doppelter Eintrag? Ein fehlendes Dokument, dessen Titel zu einem Formular passt, das schon einem anderen Eintrag
   * zugeordnet ist (etwa „Baustatistik“ neben „Statistischer Erhebungsbogen“) – dann kein stilles Anlegen eines zweiten
   * Formulars, sondern zuordnen oder entfernen
   */
  const doppeltVon = (d: (typeof fehlende)[number]) => formulare.find((f) => statusVon.has(f.pfad) && passt(f.name, d.eintrag.titel));

  const formularMenue = (f: FormularEintrag): MenuePunkt[] => {
    const umfang = useAntrag.getState().projektdatei?.umfang;
    // die beim Öffnen des Menüs angezeigte Fassung – zugeordnet wird nur dort (Umfang erst beim Klick gelesen)
    const ansicht = useAntrag.getState().projektdatei?.ansicht;
    const zugeordnet = statusVon.get(f.pfad);
    return [
      { text: 'Öffnen', symbol: 'formular', aktion: () => void formularOeffnen(f) },
      // im geöffneten Formular mit Vorschau (Dialog), sonst wirkt es sofort
      { text: offen?.projekt === projekt && offen?.pfad === f.pfad ? 'Daten aktualisieren …' : 'Daten aktualisieren', symbol: 'neuLaden', aktion: () => void formularAktualisieren(f) },
      { text: 'Als PDF exportieren …', symbol: 'export', deaktiviert: !ablage, ...(ablage ? {} : { hinweis: 'kein Projektordner' }), aktion: () => useExportDialog.getState().oeffnen(f.pfad) },
      { text: 'Speichern unter …', symbol: 'datei', aktion: () => void useAntrag.getState().speichernUnter(f.pfad) },
      { trenner: true },
      ...(umfang
        ? [
            {
              text: 'Antragsdokument',
              symbol: 'stapel' as const,
              // eingereicht: wie bei den fehlenden Formularen gesperrt
              ...aus,
              unter: umfang
                .filter((u) => u.art === 'intern')
                .map((u) => ({
                  text: u.titel,
                  symbol: (zugeordnet?.eintrag.id === u.id ? 'haken' : undefined) as 'haken' | undefined,
                  aktion: () =>
                    void useAntrag.getState().umfangAendern((aktuell) => aktuell.map((x) => (x.id === u.id ? { ...x, formularDatei: formularDatei(f.pfad) } : x)), { ansicht, eintrag: u.id, titel: u.titel, was: 'Nicht zugeordnet' }),
                })),
            },
          ]
        : []),
      // der Ordner des Formulars (im Sammelprojekt ggf. der Unterordner des Antrags)
      { text: 'Ordner öffnen', symbol: 'ordnerOffen', aktion: () => void oeffnePfad(verbinde(projekt!.root, f.pfad.slice(0, f.pfad.lastIndexOf('/')))).catch(() => undefined) },
      { text: 'Pfad kopieren', symbol: 'kopie', aktion: () => void navigator.clipboard?.writeText(verbinde(projekt!.root, f.pfad)) },
      { trenner: true },
      { text: 'Reihenfolge zurücksetzen', hinweis: 'alphabetisch', symbol: 'neuLaden', deaktiviert: !reihenfolge?.length, aktion: () => void useAntrag.getState().reihenfolgeSetzen(null) },
      { trenner: true },
      { text: 'Umbenennen …', symbol: 'stift', aktion: () => void formularUmbenennen(f) },
      { trenner: true },
      { text: 'Löschen …', symbol: 'muell', gefahr: true, aktion: () => void formularLoeschen(f) },
    ];
  };

  // Sammelprojekt: Formulare im Unterordner des aktiven Antrags bzw. auf der obersten Ebene; wo neue entstehen (mit
  // Leerzeichen am Ende, für „… das Formular in 2. BAUA anlegen“)
  const imUnterordner = nachReihenfolge(formulare.filter((f) => f.unterordner), reihenfolge);
  const imStamm = nachReihenfolge(formulare.filter((f) => !f.unterordner), reihenfolge);
  const alleFormulare = nachReihenfolge(formulare, reihenfolge);
  /** Formular in seiner Liste an eine Stelle verschieben (nach dem Herausnehmen gezählt) und die Reihenfolge merken */
  const verschieben = (liste: FormularEintrag[], pfad: string, stelle: number) => {
    const f = liste.find((x) => x.pfad === pfad);
    if (!f) return;
    const ohne = liste.filter((x) => x.pfad !== pfad);
    ohne.splice(Math.max(0, Math.min(stelle, ohne.length)), 0, f);
    if (ohne.every((x, i) => x === liste[i])) return;
    void useAntrag.getState().reihenfolgeSetzen(ohne.map((x) => formularDatei(x.pfad)));
  };
  /** Zeile ziehen (erst ab 5 px – ein Klick bleibt ein Klick); Ziel nach den Mitten der Formularzeilen dieser Liste */
  const ziehen = (name: string, liste: FormularEintrag[], pfad: string) => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const huelle = e.currentTarget.closest<HTMLElement>('[data-formular-liste]');
    let stelle = -1;
    zeigerZiehen(e, {
      schwelle: 5,
      beginn: () => setZug({ liste: name, pfad, stelle: liste.findIndex((x) => x.pfad === pfad) }),
      bewegen: (ev) => {
        const zeilen = huelle ? [...huelle.querySelectorAll<HTMLElement>(':scope > [data-formular]')] : [];
        stelle = einfuegeStelle(zeilen, ev.clientY, zeilen.findIndex((z) => z.dataset.formular === pfad));
        setZug({ liste: name, pfad, stelle });
      },
      ende: (gezogen) => {
        setZug(null);
        if (gezogen && stelle >= 0) verschieben(liste, pfad, stelle);
      },
    });
  };
  /** Alt+↑/↓ an der Zeile: eine Stelle nach oben bzw. unten */
  const taste = (liste: FormularEintrag[], pfad: string) => (e: ReactKeyboardEvent<HTMLElement>) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const i = liste.findIndex((x) => x.pfad === pfad);
    verschieben(liste, pfad, e.key === 'ArrowUp' ? i - 1 : i + 1);
  };
  /** Markierung beim Ziehen: gezogene Zeile, Einfügestelle davor bzw. nach der letzten */
  const markierung = (name: string, liste: FormularEintrag[], pfad: string): 'quelle' | 'davor' | 'danach' | undefined => {
    if (!zug || zug.liste !== name) return undefined;
    if (zug.pfad === pfad) return 'quelle';
    // an der Ausgangsstelle: keine Einfügestelle zeigen (es verschiebt sich nichts)
    if (zug.stelle === liste.findIndex((x) => x.pfad === zug.pfad)) return undefined;
    const uebrige = liste.filter((x) => x.pfad !== zug.pfad);
    const i = uebrige.findIndex((x) => x.pfad === pfad);
    if (i === zug.stelle) return 'davor';
    return zug.stelle >= uebrige.length && i === uebrige.length - 1 ? 'danach' : undefined;
  };
  const zielText = sammel ? (sammel.unterordner ? `in ${sammel.unterordner} ` : 'auf der obersten Ebene ') : null;
  const formularZeile = (name: string, liste: FormularEintrag[]) => (f: FormularEintrag) => {
    const aktiv = offen?.pfad === f.pfad;
    const ungespeichert = aktiv ? istGeaendert(offen) : !!projekt && hatEntwurf(projekt, f.pfad);
    const fremd = f.gesperrt && !(aktiv && offen?.sperre.art === 'eigen');
    const gezeigt = aktiv && haupt === 'formular';
    const doc = umfangDa ? statusVon.get(f.pfad) : undefined;
    // während ein Antrag geöffnet wird, gehört der Punkt noch zum bisherigen – dann keiner
    const stamm = !doc && umfangDa && !wechsel ? stammStatus[f.pfad] : undefined;
    // zuerst, dass es nicht zum Antragsumfang gehört – der Status dahinter (nicht verwechselbar mit „Antragsordner“)
    const stammText = stamm ? `nicht im Antragsumfang von ${fassung} · ${STATUS_TEXT[stamm]}` : '';
    return (
      <div key={f.pfad} role="listitem" data-formular={f.pfad} data-ziehen={markierung(name, liste, f.pfad)}>
        <button
          className={`nav-eintrag${gezeigt ? ' aktiv' : ''}`}
          aria-current={gezeigt ? 'page' : undefined}
          aria-keyshortcuts={sortierbar ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
          onPointerDown={sortierbar ? ziehen(name, liste, f.pfad) : undefined}
          onKeyDown={sortierbar ? taste(liste, f.pfad) : undefined}
          title={`${doc ? `${f.name} – ${doc.eintrag.titel}` : stamm ? `${f.name}\n${stammText}` : f.name}\n${zeitLang(formularInfo[f.pfad]?.letzteAenderung)}${sortierbar ? '\nZiehen oder Alt+↑/↓ ändert die Reihenfolge' : ''}`}
          onClick={() => (aktiv ? setHaupt('formular') : void formularOeffnen(f))}
          onContextMenu={(e) => zeigeMenue(e, formularMenue(f), f.name)}
        >
          <span className="nav-symbol">
            <Symbol name="formular" />
            {doc && <StatusPunkt status={doc.status} />}
            {stamm && <StatusPunkt status={stamm} titel={stammText} neben />}
          </span>
          <span className="nav-text">{f.name}</span>
          {fremd && (
            <span className="nav-schloss" title="Anderswo geöffnet (Sperrdatei vorhanden)" role="img" aria-label="gesperrt">
              <Symbol name="schloss" />
            </span>
          )}
          {ungespeichert && (
            <span className="fo-ungespeichert" title="Nicht gespeicherte Eingaben">
              ●
            </span>
          )}
          {/* die Zeit immer als letztes, rechtsbündig – Markierungen davor */}
          {formularInfo[f.pfad]?.letzteAenderung ? <span className="nav-zeit">{zeitKurz(formularInfo[f.pfad].letzteAenderung)}</span> : null}
        </button>
      </div>
    );
  };
  const fehlendeZeile = (d: (typeof fehlende)[number]) => {
    const doppelt = doppeltVon(d);
    const menue = (): MenuePunkt[] => {
      // die Fassung der angezeigten Zeile beim Öffnen – angelegt bzw. geändert wird nur für sie
      const ansicht = zeilenFassung(useAntrag.getState(), projekt);
      return [
        { text: 'Formular anlegen', symbol: 'plus', ...aus, aktion: () => void useAntrag.getState().formularAnlegen(d.eintrag.id, { ansicht }) },
        ...(formulare.length ? [{ text: 'Vorhandenes Formular zuordnen', symbol: 'link' as const, unter: formularePunkte(d.eintrag.id), ...aus }] : []),
        { trenner: true },
        { text: 'Antragsumfang zeigen', symbol: 'stapel', aktion: umfangZeigen },
        { trenner: true },
        { text: 'Aus dem Antragsumfang nehmen', symbol: 'muell', gefahr: true, ...aus, aktion: () => void ausUmfangEntfernen(d.eintrag.id, ansicht, d.eintrag.titel) },
      ];
    };
    return (
      <div key={d.eintrag.id} role="listitem">
        <button
          className={`nav-eintrag fehlt${gesperrt || wechsel ? ' gesperrt' : ''}`}
          title={
            gesperrt
              ? `${d.eintrag.titel} fehlt – der Antrag ist eingereicht und gesperrt; zum Nachreichen den Status in den Antragsdaten vorübergehend auf „in Arbeit“ setzen`
              : wechsel
                ? `${d.eintrag.titel} fehlt – der Antrag wird gerade geöffnet, gleich wieder möglich`
                : doppelt
                ? `${d.eintrag.titel}: „${doppelt.name}“ ist schon „${statusVon.get(doppelt.pfad)!.eintrag.titel}“ zugeordnet – doppelter Eintrag? Klicken: zuordnen oder aus dem Antragsumfang nehmen`
                : `${d.eintrag.titel} fehlt im Projekt – klicken, um das Formular ${zielText ?? ''}anzulegen`
          }
          aria-haspopup={doppelt && !gesperrt && !wechsel ? 'menu' : undefined}
          // das Menü am Eintrag öffnen (auch mit Enter/Leertaste, ohne Mauszeiger); gesperrt bzw. beim Öffnen: nur die Meldung
          onClick={(e) =>
            doppelt && !gesperrt && !wechsel
              ? zeigeMenueAn(e.currentTarget, menue(), d.eintrag.titel)
              : void useAntrag.getState().formularAnlegen(d.eintrag.id, { ansicht: zeilenFassung(useAntrag.getState(), projekt) })
          }
          onContextMenu={(e) => zeigeMenue(e, menue(), d.eintrag.titel)}
        >
          <span className="nav-symbol">
            <Symbol name="formular" />
            <StatusPunkt status="fehlt" />
          </span>
          <span className="nav-text">{d.eintrag.titel}</span>
          {!gesperrt && !wechsel && <span className={`nav-unter${doppelt ? ' nav-doppelt' : ''}`}>{doppelt ? 'doppelt?' : 'anlegen'}</span>}
        </button>
      </div>
    );
  };

  return (
    <aside className="nav" style={{ width: breite }} aria-label="Navigation">
      {/* fester Kopf: Projekt, Antrag und die Daten-Knöpfe bleiben stehen, darunter rollt die Navigation */}
      {projekt && (
        <div className="nav-fest">
          <div className="fo-projektkopf">
            <div className="fo-projektkopf-text" title={verbinde(projekt.root, projekt.ordner)}>
              <span className="nav-klein">Projekt</span>
              <strong>{projekt.ordner}</strong>
              {projekt.titel && <span className="fo-projektkopf-titel">{projekt.titel}</span>}
            </div>
            <div className="fo-projektkopf-knoepfe">
              <button className="small" title="Alle Projekte – zuletzt geöffnete und je Quelle (Strg+K sucht direkt)" onClick={onProjekte}>
                Wechseln
              </button>
              <button className="icon" title="Projekt schließen" aria-label="Projekt schließen" onClick={() => void projektWaehlen(null)}>
                <Symbol name="schliessen" />
              </button>
            </div>
            <FassungsWahl />
            {!ablage ? (
              <button
                className="fo-hinweis-knopf"
                title="Zum Kürzel wurde kein Projektordner gefunden – einen wählen oder anlegen"
                onClick={() => useFormulare.getState().projektordnerZuordnen('Zum Kürzel wurde in den Stammordnern kein Projektordner gefunden. Dort liegt die Projektdatei (.oap) mit den Stammdaten und den Angaben zum Antrag.')}
              >
                <Symbol name="ordner" /> Kein Projektordner – zuordnen …
              </button>
            ) : (
              oap === 'fehlt' && (
                <button
                  className="fo-hinweis-knopf"
                  title="Im Projektordner gibt es noch keine Projektdatei (.oap)"
                  onClick={() => void useFormulare.getState().stammdatenErfassen('Für dieses Projekt gibt es im Projektordner noch keine Projektdatei (.oap). Mit diesen Stammdaten wird sie angelegt.')}
                >
                  <Symbol name="tabelle" /> Keine Projektdatei – Stammdaten erfassen …
                </button>
              )
            )}
          </div>
          {/* Projektdaten (für das ganze Projekt) und Antragsdaten (nur für den aktiven Antrag) – ein Knopf in zwei Hälften */}
          <div className="fo-daten" role="group" aria-label="Daten">
            <button
              className={`nav-eintrag fo-eintrag-karte${haupt === 'projektkarte' ? ' aktiv' : ''}`}
              aria-current={haupt === 'projektkarte' ? 'page' : undefined}
              onClick={() => setHaupt('projektkarte')}
              title="Projektdaten – gelten für das ganze Projekt: Vorhaben, Beteiligte, Grundstück (aus der Projektkarte); daraus werden die Formulare ausgefüllt"
            >
              <Symbol name="karte" />
              <span className="fo-eintrag-karte-text">
                <strong>Projektdaten</strong>
                <span className="nav-unter">ganzes Projekt</span>
              </span>
              {karte && Object.keys(karte.aenderungen).length > 0 && (
                <span className="fo-ungespeichert" title="Nicht gespeicherte Änderungen">
                  ●
                </span>
              )}
            </button>
            <button
              className={`nav-eintrag fo-eintrag-karte${haupt === 'antrag' ? ' aktiv' : ''}`}
              aria-current={haupt === 'antrag' ? 'page' : undefined}
              onClick={() => setHaupt('antrag')}
              title={`Antragsdaten – gelten nur für den Antrag ${fassung}: Status, Antragsmerkmale, Antragsumfang${eingereicht ? ' · eingereicht und gesperrt' : ''}`}
            >
              <Symbol name={eingereicht ? 'schloss' : 'stapel'} />
              <span className="fo-eintrag-karte-text">
                <strong>Antragsdaten</strong>
                <span className="nav-unter">{eingereicht ? `${fassung} · eingereicht` : fassung}</span>
              </span>
            </button>
          </div>
        </div>
      )}
      <div className="nav-rollbereich">
        {projekt && (
          <>
            <Abschnitt
              id="formulare"
              titel="Formulare"
              kopf={
                <>
                  <button
                    className="icon"
                    title={`Formular hinzufügen – aus dem Vorlagenordner oder einem anderen Projekt${zielText ? `; neue entstehen ${zielText.trim()}` : ''}`}
                    aria-label="Formular hinzufügen …"
                    onClick={() => useHinzufuegenDialog.getState().setOffen(true)}
                  >
                    <Symbol name="plus" />
                  </button>
                  <SammelExportKnopf />
                  <button className="icon" title="Sperren in diesem Projekt prüfen und aufheben" aria-label="Sperren …" onClick={onSperren}>
                    <Symbol name="schloss" />
                  </button>
                  <button className="icon" title="Formularordner des Projekts öffnen" aria-label="Formularordner öffnen" onClick={() => void oeffnePfad(verbinde(projekt.root, projekt.ordner)).catch(() => undefined)}>
                    <Symbol name="ordnerOffen" />
                  </button>
                </>
              }
            >
              {sammel ? (
                // Sammelprojekt: zuerst die Formulare im Unterordner des aktiven Antrags (neue entstehen dort), dann die der
                // obersten Ebene für alle Anträge – beide in einem Rollbereich; leere Gruppen nur mit Hinweis, ohne Liste
                <div className="nav-gruppen">
                  <p className="nav-gruppe" id={`${gruppenId}-antrag`}>
                    {!sammel.unterordner
                      ? `Antrag ${fassung} · kein eigener Unterordner`
                      : sammel.unterordner.toLowerCase() === fassung.toLowerCase()
                        ? `Antrag ${fassung} · eigener Unterordner`
                        : `Antrag ${fassung} · Unterordner ${sammel.unterordner}`}
                  </p>
                  {!sammel.unterordner && (
                    <>
                      <p className="nav-leer">Neue Formulare entstehen auf der obersten Ebene.</p>
                      <p className="nav-leer">Vorhanden: {sammel.alle.join(', ')}</p>
                    </>
                  )}
                  {imUnterordner.length + fehlende.length > 0 ? (
                    <div className="nav-liste" role="list" aria-labelledby={`${gruppenId}-antrag`} data-formular-liste="antrag">
                      {imUnterordner.map(formularZeile('antrag', imUnterordner))}
                      {fehlende.map(fehlendeZeile)}
                    </div>
                  ) : (
                    sammel.unterordner && <p className="nav-leer">Noch keine Formulare in {sammel.unterordner}.</p>
                  )}
                  <p className="nav-gruppe" id={`${gruppenId}-alle`}>
                    Alle Anträge · oberste Ebene
                  </p>
                  {imStamm.length ? (
                    <div className="nav-liste" role="list" aria-labelledby={`${gruppenId}-alle`} data-formular-liste="alle">
                      {imStamm.map(formularZeile('alle', imStamm))}
                    </div>
                  ) : (
                    <p className="nav-leer">Keine Formulare für alle Anträge.</p>
                  )}
                </div>
              ) : (
                <div className="nav-liste" role="list" aria-label="Formulare" data-formular-liste="formulare">
                  {alleFormulare.map(formularZeile('formulare', alleFormulare))}
                  {fehlende.map(fehlendeZeile)}
                  {!formulare.length && !fehlende.length && <p className="nav-leer">Keine Formulare in diesem Projekt.</p>}
                </div>
              )}
            </Abschnitt>

            {ablageordner > 0 && <hr className="nav-trenner" />}

            {ablageordner > 0 && (
              <Abschnitt
                id="ablage"
                titel="Projektordner"
                kopf={
                  <>
                    <span className="fo-ablage-umschalter" role="group" aria-label="Ansicht des Projektordners">
                      <button className={ablageAnsicht === 'ordner' ? 'active' : ''} aria-pressed={ablageAnsicht === 'ordner'} title="Angezeigte Pfade des Projektordners" onClick={() => setAblageAnsicht('ordner')}>
                        Ordner
                      </button>
                      <button
                        className={ablageAnsicht === 'antrag' ? 'active' : ''}
                        aria-pressed={ablageAnsicht === 'antrag'}
                        title="Nur die Dokumente im Antragsordner der aktiven Fassung – mit Vollständigkeit und „bereit“"
                        onClick={() => setAblageAnsicht('antrag')}
                      >
                        Antrag
                      </button>
                    </span>
                    {ablageAnsicht === 'ordner' && (
                      <button className={`icon${pfadeBearbeiten ? ' active' : ''}`} title="Angezeigte Pfade für dieses Projekt" aria-label="Angezeigte Pfade" onClick={() => setPfadeBearbeiten(!pfadeBearbeiten)}>
                        <Symbol name="zahnrad" />
                      </button>
                    )}
                    {ablage && (
                      <button className="icon" title="Projektordner öffnen" aria-label="Projektordner öffnen" onClick={() => void oeffnePfad(verbinde(ablage.root, ablage.pfad)).catch(() => undefined)}>
                        <Symbol name="ordnerOffen" />
                      </button>
                    )}
                  </>
                }
              >
                {pfadeBearbeiten && ablageAnsicht === 'ordner' && (
                  <div className="nav-pfade">
                    <label className="small-text">
                      Angezeigte Pfade für {projekt.ordner} (je Zeile, Platzhalter * und ?)
                      <textarea rows={4} defaultValue={auswahl.join('\n')} key={auswahl.join('\n')} onBlur={(e) => setAuswahl(projekt.ordner, e.target.value.split('\n'))} />
                    </label>
                    {eigeneAuswahl && (
                      <button className="small" onClick={() => setAuswahl(projekt.ordner, null)}>
                        Vorgabe verwenden
                      </button>
                    )}
                  </div>
                )}
                {ablage && ablageAnsicht === 'antrag' ? (
                  <AntragsAblage ablage={ablage} />
                ) : ablage ? (
                  <>
                    <p className="nav-ablage-name" title={verbinde(ablage.root, ablage.pfad)}>
                      {ablage.pfad}
                    </p>
                    <AblageBaum key={`${ablage.root}|${ablage.pfad}`} ordner={ablage} auswahl={auswahl} />
                  </>
                ) : (
                  <p className="nav-leer">Kein Projektordner mit dem Kürzel „{projekt.ordner}“ gefunden.</p>
                )}
              </Abschnitt>
            )}
          </>
        )}
      </div>
      {/* Breite ziehen, mit ←/→ (Tastatur) oder per Doppelklick auf die Vorgabe zurück – gemerkt in den Einstellungen der App */}
      <Ziehgriff breite={breite} setBreite={setLeisteBreite} vorgabe={300} titel="Breite der Navigation ändern" />
    </aside>
  );
}
