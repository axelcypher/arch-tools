import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { Modal } from '@core/ui/Dialog';
import { useKonfigOrt } from '@core/ui/Speicherort';
import { bestaetigen } from '@core/ui/Rueckfrage';
import { Symbol } from '@core/ui/Symbol';
import type { Adresse } from '../adressbuch';
import { ADRESS_TEXTFELDER, adressName, adressOrt, neueEigeneAdresse, sucheAdressen } from '../adressbuch';
import { stammdatenLaden, stammdatenSpeichern } from '../stammdaten';
import { useFormulare } from '../store';
import { anzahl } from '../text';
import { Karte } from './EinstellungsKarte';

/**
 * Adressbuch als eigener Dialog von PERMIO: Datenpflege mit „Speichern“ je Adresse, keine Einstellung – deshalb nicht
 * im zentralen Einstellungsdialog (docs/design.md, „Einstellungen“: Was nur ein Werkzeug betrifft, bleibt in dessen
 * Dialog). Geöffnet über „Mehr → Adressbuch …“, aus den Projektdaten („Übernehmen von … → Adressbuch …“) und von der
 * Seite PERMIO der Einstellungen (über ihr, als eigene Ebene).
 */

export const useAdressbuchDialog = create<{ offen: boolean }>(() => ({ offen: false }));
export const adressbuchOeffnen = () => useAdressbuchDialog.setState({ offen: true });
const adressbuchSchliessen = () => useAdressbuchDialog.setState({ offen: false });

export function AdressbuchDialog() {
  const offen = useAdressbuchDialog((s) => s.offen);
  if (!offen) return null;
  return <AdressbuchModal />;
}

/** Notbetrieb (Speicherort nur lesbar): das Adressbuch folgt der Sperre der Einstellungen (docs/design.md) */
const NUR_LESBAR = 'Das Netzlaufwerk mit den Einstellungen ist nicht erreichbar – das Adressbuch ist nur lesbar.';

function AdressbuchModal() {
  const ort = useKonfigOrt();
  const gesperrt = ort && ort !== 'fehler' && ort.notbetrieb ? NUR_LESBAR : null;
  // ans Ende von body: liegt so auch über dem Einstellungsdialog, aus dem er geöffnet werden kann
  return createPortal(
    <Modal titel="Adressbuch" className="es-adressbuch-dialog" tabelle onClose={adressbuchSchliessen}>
      <div className="es-adressbuch-rumpf">
        {gesperrt && (
          <p className="meldung warnung" role="status">
            {gesperrt} Ändern geht wieder, sobald es erreichbar ist.
          </p>
        )}
        <fieldset className="es-seite" disabled={!!gesperrt} title={gesperrt ?? undefined}>
          <legend className="unsichtbar">Adressbuch</legend>
          <Adressbuch />
        </fieldset>
      </div>
      <div className="dialog-buttons">
        <span className="tb-spacer" />
        <button type="button" onClick={adressbuchSchliessen}>
          Schließen
        </button>
      </div>
    </Modal>,
    document.body,
  );
}

/** Einträge einer Adressgruppe in der Projektkarte (für die Anzeige im Adressbuch) */
const ADRESSFELDER: [string, string][] = [
  ['10', 'Branche'],
  ['20', 'Titel'],
  ['30', 'Vorname'],
  ['40', 'Name/Firma'],
  ['50', 'Abteilung'],
  ['60', 'zu Händen'],
  ['70', 'Straße/Nr.'],
  ['80', 'Postfach'],
  ['90', 'PLZ'],
  ['100', 'PLZ Postfach'],
  ['110', 'Ort'],
  ['120', 'Land'],
  ['130', 'Telefon 1'],
  ['140', 'Telefon 2'],
  ['150', 'Telefax'],
  ['160', 'Mobilfunk'],
  ['170', 'E-Mail'],
  ['180', 'Internet'],
  ['210', 'Anrede'],
  ['220', 'Bevorzugter Kontakt'],
  ['190', 'Kennung'],
  ['200', 'Info'],
  ['240', 'Bank'],
  ['230', 'BIC'],
  ['250', 'IBAN'],
];

export function AdressKarte({ a }: { a: Adresse }) {
  return (
    <div className="es-adresse">
      <strong>{adressName(a)}</strong>
      {a.texte['70'] && <span>{a.texte['70']}</span>}
      {adressOrt(a) && <span>{adressOrt(a)}</span>}
      {(a.texte['130'] || a.texte['170']) && <span className="muted small-text">{[a.texte['130'], a.texte['170']].filter(Boolean).join(' · ')}</span>}
    </div>
  );
}

/** Noch kein Adressbuch: einlesen oder eine Adresse hinzufügen */
function AdressbuchLeer({ onNeu }: { onNeu: () => void }) {
  const laeuft = useFormulare((s) => s.adressbuchLaeuft);
  const projekte = useFormulare((s) => s.projekte.length);
  const { adressbuchLaden } = useFormulare.getState();
  return (
    <div className="es-leer">
      <p>Das Adressbuch sammelt die Adressen aus den Projektdaten aller Projekte ({anzahl(projekte, 'Projekt', 'Projekte')}) – und eure eigenen, die ihr hier anlegt.</p>
      <div className="es-knoepfe">
        <button type="button" className="primary" disabled={!!laeuft || !projekte} title="Die Projektdaten (Projektkarten) aller Projekte lesen" onClick={() => void adressbuchLaden()}>
          {laeuft ? `Liest … ${laeuft.fertig} von ${laeuft.gesamt}` : 'Aus den Projektdaten einlesen'}
        </button>
        <button type="button" onClick={onNeu}>
          <Symbol name="plus" /> Adresse hinzufügen
        </button>
      </div>
    </div>
  );
}

function Adressbuch() {
  const adressbuch = useFormulare((s) => s.adressbuch);
  const eigene = useFormulare((s) => s.eigeneAdressen);
  const laeuft = useFormulare((s) => s.adressbuchLaeuft);
  const projekte = useFormulare((s) => s.projekte.length);
  const { adressbuchLaden, eigeneAdresseSpeichern, eigeneAdresseEntfernen } = useFormulare.getState();
  const [suche, setSuche] = useState('');
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  /** in Bearbeitung: Schlüssel und Texte (neu: Schlüssel „e:…“, noch nicht gespeichert) */
  const [entwurf, setEntwurf] = useState<{ schluessel: string; texte: Record<string, string>; neu: boolean } | null>(null);
  const [alt, setAlt] = useState(stammdatenLaden);
  const liste = useMemo(() => sucheAdressen(adressbuch?.adressen ?? [], suche), [adressbuch, suche]);
  const auswahl = liste.find((a) => a.schluessel === gewaehlt) ?? liste[0];
  const ausgeblendet = eigene.filter((e) => e.ausgeblendet);
  /** noch nichts eingelesen: die Knöpfe stehen dann in der Leerseite (nicht doppelt in der Titelzeile) */
  const leer = !adressbuch && !entwurf;

  const neu = () => {
    const a = neueEigeneAdresse();
    setEntwurf({ schluessel: a.schluessel, texte: {}, neu: true });
  };
  const bearbeiten = (a: Adresse) => setEntwurf({ schluessel: a.schluessel, texte: Object.fromEntries(ADRESS_TEXTFELDER.map(([id]) => [id, a.texte[id] ?? ''])), neu: false });
  const speichern = async () => {
    if (!entwurf || !entwurf.texte['40']?.trim()) return;
    const texte = Object.fromEntries(Object.entries(entwurf.texte).map(([k, v]) => [k, v.trim()]));
    await eigeneAdresseSpeichern({ schluessel: entwurf.schluessel, texte, geaendert: Date.now() });
    setGewaehlt(entwurf.schluessel);
    setEntwurf(null);
  };
  const entfernen = async (a: Adresse) => {
    if (a.herkunft === 'eigen') {
      if (await bestaetigen(`„${adressName(a)}“ löschen?`, 'Die Adresse wird aus dem Adressbuch gelöscht. Projektdaten, in die sie übernommen wurde, bleiben unverändert.', 'Löschen'))
        await eigeneAdresseEntfernen(a.schluessel);
    } else if (
      await bestaetigen(
        `„${adressName(a)}“ ausblenden?`,
        'Die Adresse steht in den Projektdaten von Projekten und wird dort nicht gelöscht – im Adressbuch erscheint sie nicht mehr (unten wieder einblendbar).',
        'Ausblenden',
      )
    )
      await eigeneAdresseSpeichern({ schluessel: a.schluessel, texte: {}, ausgeblendet: true, geaendert: Date.now() });
  };

  return (
    <>
      <div className="es-titelzeile">
        <h3>Adressbuch</h3>
        {!leer && (
          <>
            <button type="button" className="primary" onClick={neu}>
              <Symbol name="plus" /> Adresse hinzufügen
            </button>
            <button type="button" disabled={!!laeuft || !projekte} onClick={() => void adressbuchLaden()} title="Die Projektdaten (Projektkarten) aller Projekte neu lesen">
              {laeuft ? `Liest … ${laeuft.fertig} von ${laeuft.gesamt}` : adressbuch?.stand ? 'Neu einlesen' : 'Aus den Projektdaten einlesen'}
            </button>
          </>
        )}
      </div>
      <p className="muted">
        Bauherren, Entwurfsverfasser, Behörden, Fachplaner: die Adressen aus den Projektdaten aller Projekte (gleiche erscheinen einmal mit allen Verwendungen) und eure eigenen. Anlegen, ändern und
        ausblenden lässt sich alles hier – gespeichert im gemeinsamen Konfigurationsordner, für alle im Büro. Die Projektdaten selbst bleiben unverändert; übernommen wird eine Adresse in den
        Projektdaten mit „Übernehmen von …“.
        {adressbuch && ` ${anzahl(adressbuch.adressen.length, 'Adresse', 'Adressen')}${adressbuch.stand ? `, Projektdaten gelesen ${new Date(adressbuch.stand).toLocaleString('de-DE')}` : ''}.`}
      </p>
      {leer ? (
        <AdressbuchLeer onNeu={neu} />
      ) : (
        <div className="es-adressbuch">
          <div className="es-adressliste">
            <input type="search" placeholder="Name, Ort, Rolle, Projekt …" value={suche} onChange={(e) => setSuche(e.target.value)} aria-label="Adressbuch durchsuchen" />
            <div className="es-adressliste-eintraege" role="listbox" aria-label="Adressen">
              {liste.map((a) => (
                <button
                  type="button"
                  key={a.schluessel}
                  role="option"
                  aria-selected={auswahl === a && !entwurf?.neu}
                  className={`es-adress-eintrag${auswahl === a && !entwurf?.neu ? ' aktiv' : ''}`}
                  onClick={() => {
                    setGewaehlt(a.schluessel);
                    setEntwurf(null);
                  }}
                >
                  <strong>
                    {adressName(a)}
                    {a.herkunft && <span className={`es-herkunft ${a.herkunft}`}>{a.herkunft === 'eigen' ? 'eigene' : 'geändert'}</span>}
                  </strong>
                  <span className="muted small-text">
                    {adressOrt(a) || '–'}
                    {a.verwendungen.length ? ` · ${[...new Set(a.verwendungen.map((v) => v.rolle))].slice(0, 2).join(', ')}` : ''}
                  </span>
                </button>
              ))}
              {!liste.length && <p className="muted small-text">Keine passenden Adressen.</p>}
            </div>
          </div>
          {entwurf ? (
            <form
              className="es-adress-detail es-adress-form"
              aria-label={entwurf.neu ? 'Neue Adresse' : 'Adresse bearbeiten'}
              // Esc beendet erst die Bearbeitung, nicht gleich das ganze Adressbuch
              onKeyDown={(e) => {
                if (e.key !== 'Escape' || e.defaultPrevented) return;
                e.preventDefault();
                setEntwurf(null);
              }}
              onSubmit={(e) => {
                e.preventDefault();
                void speichern();
              }}
            >
              <h4>{entwurf.neu ? 'Neue Adresse' : 'Adresse bearbeiten'}</h4>
              <div className="es-adress-felder">
                {ADRESS_TEXTFELDER.map(([id, titel]) => (
                  <label key={id} className={id === '40' || id === '70' ? 'breit' : ''}>
                    <span className="field-label">
                      {titel}
                      {id === '40' && (
                        <span className="pflicht" aria-hidden>
                          {' '}
                          *
                        </span>
                      )}
                    </span>
                    <input
                      value={entwurf.texte[id] ?? ''}
                      aria-label={titel}
                      required={id === '40'}
                      autoFocus={id === '40'}
                      onChange={(e) => setEntwurf({ ...entwurf, texte: { ...entwurf.texte, [id]: e.target.value } })}
                    />
                  </label>
                ))}
              </div>
              <div className="es-knoepfe">
                <button type="submit" className="primary" disabled={!entwurf.texte['40']?.trim()}>
                  Speichern
                </button>
                <button type="button" onClick={() => setEntwurf(null)}>
                  Abbrechen
                </button>
              </div>
            </form>
          ) : (
            auswahl && (
              <div className="es-adress-detail">
                <div className="es-titelzeile">
                  <h4>{adressName(auswahl)}</h4>
                  <button type="button" className="small" onClick={() => bearbeiten(auswahl)}>
                    <Symbol name="stift" /> Bearbeiten
                  </button>
                  <button type="button" className={`small${auswahl.herkunft === 'eigen' ? ' danger' : ''}`} onClick={() => void entfernen(auswahl)}>
                    {auswahl.herkunft === 'eigen' ? 'Löschen …' : 'Ausblenden …'}
                  </button>
                  {auswahl.herkunft === 'geaendert' && (
                    <button
                      type="button"
                      className="small"
                      title="Die eigene Fassung verwerfen – es gilt wieder die aus den Projektdaten"
                      onClick={() => void eigeneAdresseEntfernen(auswahl.schluessel)}
                    >
                      Änderungen verwerfen
                    </button>
                  )}
                </div>
                <p className="muted small-text">
                  {auswahl.herkunft === 'eigen' ? 'Eigene Adresse des Adressbuchs.' : auswahl.herkunft === 'geaendert' ? 'Aus den Projektdaten, im Adressbuch geändert.' : 'Aus den Projektdaten.'}
                </p>
                <dl>
                  {ADRESSFELDER.filter(([id]) => auswahl.texte[id]?.trim()).map(([id, titel]) => (
                    <div key={id}>
                      <dt>{titel}</dt>
                      <dd>{auswahl.texte[id]}</dd>
                    </div>
                  ))}
                </dl>
                {auswahl.verwendungen.length > 0 && (
                  <>
                    <h5>Verwendet in</h5>
                    <ul className="es-verwendungen">
                      {auswahl.verwendungen.map((v, i) => (
                        <li key={i}>
                          <strong>{v.projekt}</strong> · {v.rolle}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )
          )}
        </div>
      )}
      {ausgeblendet.length > 0 && (
        <Karte titel={`Ausgeblendet (${ausgeblendet.length})`} text="Adressen aus den Projektdaten, die im Adressbuch nicht erscheinen.">
          <ul className="es-liste">
            {ausgeblendet.map((e) => {
              const a = adressbuch?.adressen.find((x) => x.schluessel === e.schluessel) ?? useFormulare.getState().adressbuchKarten?.adressen.find((x) => x.schluessel === e.schluessel);
              return (
                <li key={e.schluessel}>
                  <Symbol name="adressen" />
                  <span className="es-liste-text">{a ? `${adressName(a)} · ${adressOrt(a)}` : e.schluessel.split('|').filter(Boolean).join(', ')}</span>
                  <button type="button" className="small" onClick={() => void eigeneAdresseEntfernen(e.schluessel)}>
                    Einblenden
                  </button>
                </li>
              );
            })}
          </ul>
        </Karte>
      )}
      {alt.length > 0 && (
        <Karte titel="Früher in der App gemerkte Adressen" text="Aus Version 0.2/0.3 – lassen sich weiter übernehmen. Am besten als neue Adresse ins Adressbuch übertragen und hier entfernen.">
          <ul className="es-liste">
            {alt.map((s) => (
              <li key={s.name}>
                <Symbol name="adressen" />
                <span className="es-liste-text">{s.name}</span>
                <button
                  type="button"
                  className="icon"
                  aria-label={`${s.name} entfernen`}
                  title="Entfernen"
                  onClick={() => {
                    const liste2 = alt.filter((x) => x.name !== s.name);
                    stammdatenSpeichern(liste2);
                    setAlt(liste2);
                  }}
                >
                  <Symbol name="schliessen" />
                </button>
              </li>
            ))}
          </ul>
        </Karte>
      )}
    </>
  );
}
