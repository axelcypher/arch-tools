import { useEffect, useMemo } from 'react';
import { einstellungenStartseite, einstellungsSeiteAnmelden, PfadeVerweis, useEinstellungenGesperrt } from '@core/ui/Einstellungen';
import { dateiname } from '@core/platform/files';
import { projektdateiPfad } from '@core/projektdatei';
import { Symbol } from '@core/ui/Symbol';
import { inRolle, adressName, adressOrt } from '../adressbuch';
import { waehleOrdner } from '../dateisystem';
import { PERMIO_ENTWURF, entwurfSetzen, useEntwurfWert } from '../einstellungsEntwurf';
import { OAP_ANGABEN } from '../oap';
import { IN_PROJEKTKARTE } from '../projektdaten';
import { useFormulare } from '../store';
import { anzahl } from '../text';
import { hatVorgabe } from '../vorgabe';
import { VORGABEN } from '../vorgaben';
import { AdressKarte, adressbuchOeffnen } from './AdressbuchDialog';
import { AntragEinstellungen } from './AntragEinstellungen';
import { Karte } from './EinstellungsKarte';
import { SicherungEinstellungen } from './SicherungEinstellungen';

/**
 * Seite „PERMIO“ im zentralen Einstellungsdialog (docs/design.md, „Einstellungen“). Alles hier ändert zunächst nur den
 * Entwurf (`einstellungsEntwurf.ts`) und gilt mit „Übernehmen“; im Notbetrieb ist die ganze Seite gesperrt. Pfade und
 * Namensmuster stehen auf „Pfade und Benennung“ (Verweise), das Adressbuch ist ein eigener Dialog.
 *
 * Sprungziele für `einstellungenOeffnen('formulare', ziel)`: formularprojekte, pfade, rollen, formulare, antrag,
 * projektdatei, sicherung.
 */

export const PERMIO_SEITE = 'formulare';

/** Seite beim Start von PERMIO anmelden – „Datei → Einstellungen …“ öffnet dann auf ihr */
export function permioSeiteAnmelden(): () => void {
  const abmelden = einstellungsSeiteAnmelden({
    id: PERMIO_SEITE,
    app: 'formulare',
    titel: 'PERMIO',
    text: 'Formularprojekte, Vorgaben, Antrag und Export',
    symbol: 'formular',
    inhalt: ({ fokus }) => <PermioSeite fokus={fokus} />,
    entwurf: PERMIO_ENTWURF,
  });
  einstellungenStartseite(PERMIO_SEITE);
  return abmelden;
}

export function PermioSeite({ fokus }: { fokus?: string }) {
  const gesperrt = useEinstellungenGesperrt();
  useEffect(() => {
    if (!fokus) return;
    const ziel = document.getElementById(`permio-${fokus}`);
    ziel?.scrollIntoView?.({ block: 'start' });
    ziel?.querySelector<HTMLElement>('input, textarea, select, button')?.focus();
  }, [fokus]);
  return (
    <>
      <h3>PERMIO</h3>
      <p className="einst-einleitung">
        Formularprojekte, Vorgaben für neue Projekte, Antrag und Export. Ordner im Projekt und Dateinamen stehen auf „Pfade und Benennung“, die Adressen im Adressbuch.
      </p>
      {/* im Notbetrieb sperrt das fieldset alle Felder und Knöpfe der Seite auf einmal */}
      <fieldset className="es-seite" disabled={!!gesperrt} title={gesperrt ?? undefined}>
        <legend className="unsichtbar">Einstellungen von PERMIO</legend>
        <Ordner />
        <Stammdaten />
        <Formulare />
        <AntragEinstellungen />
        <Projektdaten />
        <SicherungEinstellungen />
      </fieldset>
    </>
  );
}

function OrdnerListe({ ordner, onEntfernen }: { ordner: string[]; onEntfernen: (p: string) => void }) {
  if (!ordner.length) return <p className="muted small-text">Mit „Ordner hinzufügen …“ einen Ordner mit Formularprojekten wählen.</p>;
  return (
    <ul className="es-liste">
      {ordner.map((p) => (
        <li key={p} title={p}>
          <Symbol name="ordner" />
          <span className="es-liste-text">
            <strong>{dateiname(p) || p}</strong>
            <span className="muted small-text">{p}</span>
          </span>
          <button type="button" className="icon" title="Aus der Liste entfernen (der Ordner selbst bleibt unverändert)" aria-label={`${p} entfernen`} onClick={() => onEntfernen(p)}>
            <Symbol name="schliessen" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function Ordner() {
  const projektordner = useEntwurfWert('projektordner');
  const vorgabe = useEntwurfWert('vorgabeAuswahl');
  const ablageFehler = useFormulare((s) => s.ablageFehler);
  return (
    <>
      <Karte
        id="formularprojekte"
        titel="Formularprojekte"
        text="Ordner, in denen die Formularprojekte liegen (je Projekt ein Unterordner mit Kürzel, z. B. „BS5“, mit den Formularen und den Projektdaten). Es können mehrere sein."
      >
        <OrdnerListe
          ordner={projektordner}
          onEntfernen={(p) =>
            entwurfSetzen(
              'projektordner',
              projektordner.filter((x) => x !== p),
            )
          }
        />
        <button
          type="button"
          // Erstfokus der Seite (docs/design.md, „Einstellungen“): ihr erstes Feld
          data-startfokus=""
          onClick={async () => {
            const p = await waehleOrdner('Ordner mit Formularprojekten wählen');
            if (p && !projektordner.includes(p)) entwurfSetzen('projektordner', [...projektordner, p]);
          }}
        >
          <Symbol name="plus" /> Ordner hinzufügen …
        </button>
      </Karte>
      <Karte
        titel="Stammordner der Projekte"
        text="Die Stammordner mit den eigentlichen Projektordnern gelten für alle Apps. Zugeordnet wird über das Kürzel („BS5 Buchenstraße 5“), zwei Ebenen tief."
      >
        {ablageFehler.map((f) => (
          <p key={f} className="warning small-text">
            {f}
          </p>
        ))}
        <PfadeVerweis fokus="projekt.stammordner" text="Stammordner der Projekte …" erklaerung="Eingestellt auf der Seite „Pfade und Benennung“." />
      </Karte>
      <Karte
        id="pfade"
        titel="Angezeigte Pfade (Vorgabe)"
        text={
          <>
            Welche Teile eines Projektordners in der Navigation erscheinen – je Zeile ein Pfad, z. B. <code>Organisation</code> oder <code>Planung/Berechnungen</code>, Platzhalter <code>*</code> und{' '}
            <code>?</code> je Ebene. Je Projekt änderbar (<Symbol name="zahnrad" titel="Zahnrad" /> beim Projektordner in der Navigation).
          </>
        }
      >
        <textarea rows={5} value={vorgabe.join('\n')} onChange={(e) => entwurfSetzen('vorgabeAuswahl', e.target.value.split('\n'))} aria-label="Angezeigte Pfade (Vorgabe)" />
      </Karte>
    </>
  );
}

/** Rollen, für die eine Vorgabe besonders nützlich ist (falls das Adressbuch noch leer ist) */
const ROLLEN_VORGABE: [number, string][] = [
  [202, 'Entwurfsverfasser'],
  [206, 'Bauvorlageberechtigter Entwurfsverfasser'],
  [204, 'Bauleiter'],
  [231, 'Bauaufsichtsbehörde'],
  [232, 'Gemeinde'],
];

function Stammdaten() {
  const adressbuch = useFormulare((s) => s.adressbuch);
  const vorgaben = useEntwurfWert('rollenVorgaben');
  const rollen = useMemo(() => {
    const m = new Map<number, string>(ROLLEN_VORGABE);
    for (const a of adressbuch?.adressen ?? []) for (const v of a.verwendungen) if (!m.has(v.gruppe) && v.gruppe !== 201 && v.gruppe !== 205) m.set(v.gruppe, v.rolle);
    return [...m].sort((a, b) => a[0] - b[0]);
  }, [adressbuch]);
  const setze = (gruppe: number, schluessel: string | null) => {
    const neu = { ...vorgaben };
    if (schluessel) neu[String(gruppe)] = schluessel;
    else delete neu[String(gruppe)];
    entwurfSetzen('rollenVorgaben', neu);
  };

  return (
    <Karte
      id="rollen"
      titel="Vorgaben je Rolle"
      text="Welche Adresse in die Projektdaten eines neuen Projekts eingesetzt wird (Projektdaten → „Vorgaben eintragen“ bzw. „Übernehmen von …“). Die Adressen stammen aus dem Adressbuch – dort lassen sie sich anlegen und ändern."
    >
      {!adressbuch ? (
        <>
          <p className="muted small-text">Das Adressbuch ist noch leer – dort die Adressen aus den Projektdaten einlesen oder eigene anlegen.</p>
          <div className="es-zeile">
            <button type="button" onClick={adressbuchOeffnen}>
              <Symbol name="adressen" /> Adressbuch …
            </button>
          </div>
        </>
      ) : (
        <div className="es-rollen">
          <div className="es-zeile">
            <button type="button" onClick={adressbuchOeffnen}>
              <Symbol name="adressen" /> Adressbuch …
            </button>
          </div>
          {rollen.map(([gruppe, rolle]) => {
            const passend = inRolle(adressbuch.adressen, gruppe);
            const gewaehlt = adressbuch.adressen.find((a) => a.schluessel === vorgaben[String(gruppe)]);
            const andere = adressbuch.adressen.filter((a) => !passend.includes(a));
            return (
              <label key={gruppe} className="field es-rolle">
                <span className="field-label">{rolle}</span>
                <select value={vorgaben[String(gruppe)] ?? ''} onChange={(e) => setze(gruppe, e.target.value || null)}>
                  <option value="">– keine Vorgabe –</option>
                  {passend.length > 0 && (
                    <optgroup label={`Bisher als ${rolle}`}>
                      {passend.map((a) => (
                        <option key={a.schluessel} value={a.schluessel}>
                          {adressName(a)} · {adressOrt(a)} ({a.verwendungen.filter((v) => v.gruppe === gruppe).length}×)
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Alle Adressen">
                    {andere.map((a) => (
                      <option key={a.schluessel} value={a.schluessel}>
                        {adressName(a)} · {adressOrt(a)}
                      </option>
                    ))}
                  </optgroup>
                </select>
                {gewaehlt && <AdressKarte a={gewaehlt} />}
                {vorgaben[String(gruppe)] && !gewaehlt && <span className="warning small-text">Die gewählte Adresse steht nicht mehr im Adressbuch.</span>}
              </label>
            );
          })}
        </div>
      )}
    </Karte>
  );
}

function Formulare() {
  const profile = useFormulare((s) => s.profile);
  const zurueck = useEntwurfWert('profileZurueck');
  const eintraege = Object.entries(profile);
  const umschalten = (k: string) => entwurfSetzen('profileZurueck', zurueck.includes(k) ? zurueck.filter((x) => x !== k) : [...zurueck, k]);
  return (
    <Karte
      id="formulare"
      titel="Formulare"
      text="Je Formular lässt sich einstellen, welche Abschnitte die Gliederung zeigt, wie Abschnitte und Felder heißen, welche Felder in den Füllstand eingehen und wann etwas erforderlich ist – im Formular über „Formular einrichten“ im Menü „Mehr“. Die Einstellung gilt für das Formular in allen Projekten."
    >
      <p className="muted small-text">
        {Object.keys(VORGABEN).length
          ? `Für ${anzahl(Object.keys(VORGABEN).length, 'Formular', 'Formulare')} bringt die App eine Vorgabe mit (Titel, Gruppen und Bedingungen nach BauO NRW / BauPrüfVO). Eigene Einstellungen gehen vor; gespeichert wird nur, was davon abweicht.`
          : 'Eingebaute Vorgaben (Titel, Gruppen und Bedingungen nach BauO NRW / BauPrüfVO) folgen; eigene Einstellungen gehen ihnen dann vor.'}
      </p>
      {!eintraege.length ? (
        <p className="muted small-text">Noch kein Formular angepasst.</p>
      ) : (
        <ul className="es-liste">
          {eintraege.map(([k, p]) => {
            const versteckt = Object.values(p.abschnitte).filter((a) => a.sichtbar === false).length;
            const umbenannt = Object.values(p.abschnitte).filter((a) => a.titel).length;
            const ohne = Object.keys(p.zaehlt).length;
            const felder = Object.keys(p.feldTitel ?? {}).length;
            const gruppen = (p.gruppen ?? []).length + (p.ohneGruppen ?? []).length;
            const bedingungen = Object.keys(p.bedingungen ?? {}).length + Object.values(p.abschnitte).filter((a) => a.bedingung !== undefined).length;
            const vorgemerkt = zurueck.includes(k);
            const name = k.replace(/\|/, ' · Stand ');
            return (
              <li key={k} className={vorgemerkt ? 'es-vorgemerkt' : undefined}>
                <Symbol name="formular" />
                <span className="es-liste-text">
                  <strong>{name}</strong>
                  <span className="muted small-text">
                    {vorgemerkt
                      ? `${hatVorgabe(k) ? 'Wird auf die Vorgabe zurückgesetzt' : 'Wird zurückgesetzt'} – gilt mit „Übernehmen“`
                      : [
                          versteckt && `${anzahl(versteckt, 'Abschnitt', 'Abschnitte')} ausgeblendet`,
                          umbenannt && `${umbenannt} umbenannt`,
                          felder && `${anzahl(felder, 'Feld', 'Felder')} umbenannt`,
                          ohne && `${anzahl(ohne, 'Feld zählt', 'Felder zählen')} nicht`,
                          gruppen && anzahl(gruppen, 'Gruppe', 'Gruppen'),
                          bedingungen && anzahl(bedingungen, 'Bedingung', 'Bedingungen'),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                  </span>
                </span>
                <button type="button" aria-label={`${name}: ${vorgemerkt ? 'Doch behalten' : hatVorgabe(k) ? 'Auf Vorgabe zurücksetzen' : 'Zurücksetzen'}`} onClick={() => umschalten(k)}>
                  {vorgemerkt ? 'Doch behalten' : hatVorgabe(k) ? 'Auf Vorgabe zurücksetzen' : 'Zurücksetzen'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Karte>
  );
}

/** Beispielwerte für die Vorschau des Pfads neuer Projektdateien */
const OAP_BEISPIEL = { nummer: 'BS9', kurzname: 'EFH Musterweg', vorhaben: 'Neubau Einfamilienhaus', datum: new Date() };

function Projektdaten() {
  const neu = useFormulare((s) => s.oapVorlage);
  return (
    <Karte
      id="projektdatei"
      titel="Projektdatei (.oap)"
      text="Die Projektstammdaten kommen aus der Projektdatei im Projektordner – dem gemeinsamen Projektarchiv von QUADRIO, TERRIO, NUMIO und ATLAS. Gesucht wird bis vier Ebenen tief; bei mehreren gilt die im Ordner der Berechnungen, sonst die mit dem kürzesten Pfad – je Projekt lässt sich in den Projektdaten eine andere wählen. Beim Speichern der Projektdaten werden geänderte Angaben in die Projektdatei eingetragen, alles andere darin bleibt unverändert."
    >
      <p>
        Neue Projektdatei: <code>{neu}</code> <span className="muted small-text">z. B. {projektdateiPfad(neu, OAP_BEISPIEL)}</span>
      </p>
      <PfadeVerweis fokus="projekt.oapPfad" erklaerung="Ort und Name neuer Projektdateien stehen auf der Seite „Pfade und Benennung“." />
      <table className="es-tabelle">
        <caption className="unsichtbar">Angaben der Projektdaten und der Projektdatei</caption>
        <thead>
          <tr>
            <th>In den Projektdaten</th>
            <th>In der Projektdatei</th>
          </tr>
        </thead>
        <tbody>
          {OAP_ANGABEN.map(({ angabe, feld }) => (
            <tr key={angabe}>
              <td>{IN_PROJEKTKARTE[angabe]?.titel}</td>
              <td>{feld}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Karte>
  );
}
