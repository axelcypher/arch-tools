import { useMemo, useState } from 'react';
import { Modal } from '@core/ui/Dialog';
import { dateiname } from '@core/platform/files';
import { OAP_PLATZHALTER, projektdateiPfad, unbekanntePlatzhalter } from '@core/projektdatei';
import { hatVorgabe } from '../vorgabe';
import { VORGABEN } from '../vorgaben';
import type { Adresse } from '../adressbuch';
import { ADRESS_TEXTFELDER, adressName, adressOrt, inRolle, neueEigeneAdresse, sucheAdressen } from '../adressbuch';
import { bestaetigen } from '@core/ui/Rueckfrage';
import { waehleOrdner } from '../dateisystem';
import { IN_PROJEKTKARTE } from '../projektdaten';
import { stammdatenLaden, stammdatenSpeichern } from '../stammdaten';
import { AntragEinstellungen } from './AntragEinstellungen';
import { Karte } from './EinstellungsKarte';
import { SicherungEinstellungen } from './SicherungEinstellungen';
import type { EinstellungsBereich } from '../store';
import { VORGABE_OAP_PFAD, useFormulare } from '../store';
import { OAP_ANGABEN } from '../oap';
import type { SymbolName } from './Symbol';
import { Symbol } from './Symbol';

const BEREICHE: { id: EinstellungsBereich; titel: string; symbol: SymbolName; text: string }[] = [
  { id: 'ordner', titel: 'Ordner', symbol: 'ordner', text: 'Formularprojekte, Projektordner, angezeigte Pfade' },
  { id: 'stammdaten', titel: 'Büro & Stammdaten', symbol: 'buero', text: 'Vorgaben je Rolle für neue Projektkarten' },
  { id: 'adressbuch', titel: 'Adressbuch', symbol: 'adressen', text: 'Adressen anlegen und pflegen, aus allen Projektkarten' },
  { id: 'formulare', titel: 'Formulare', symbol: 'formular', text: 'Gliederung und Füllstand je Formular' },
  { id: 'antrag', titel: 'Antrag & Export', symbol: 'export', text: 'PDF-Export, Antragsfassungen, Antragsdokumente' },
  { id: 'projektdaten', titel: 'Projektdatei (.oap)', symbol: 'tabelle', text: 'Projektstammdaten aus dem Projektordner' },
  { id: 'sicherung', titel: 'Sichern & Übertragen', symbol: 'uebertragen', text: 'Einstellungen als Datei exportieren und importieren' },
];

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

/** Rollen, für die eine Vorgabe besonders nützlich ist (falls das Adressbuch noch leer ist) */
const ROLLEN_VORGABE: [number, string][] = [
  [202, 'Entwurfsverfasser'],
  [206, 'Bauvorlageberechtiger Entwurfsverfasser'],
  [204, 'Bauleiter'],
  [231, 'Bauaufsichtsbehörde'],
  [232, 'Gemeinde'],
];

/**
 * Einstellungen als Modal über der aktuellen Ansicht, mit Ebenen: links die Bereiche, rechts der Inhalt. Adressen
 * und Stammdaten kommen aus den Projektkarten – hier wird nur ausgewählt, nichts doppelt gepflegt. Alles wirkt
 * sofort; Schließen (Fertig, ×, Esc) kehrt zur Ansicht darunter zurück, die unverändert bleibt.
 */
export function EinstellungenModal() {
  const { einstellungenSchliessen } = useFormulare.getState();
  return (
    <Modal titel="Einstellungen" className="es-modal" onClose={einstellungenSchliessen} klickDaneben={false}>
      <button className="icon es-schliessen" title="Schließen (Esc)" aria-label="Einstellungen schließen" onClick={einstellungenSchliessen}>
        <Symbol name="schliessen" />
      </button>
      <EinstellungenAnsicht />
    </Modal>
  );
}

export function EinstellungenAnsicht() {
  const bereich = useFormulare((s) => s.einstellungsBereich);
  const { einstellungenOeffnen, einstellungenSchliessen } = useFormulare.getState();
  return (
    <div className="es">
      <nav className="es-nav" aria-label="Bereiche der Einstellungen">
        <div className="es-nav-kopf">
          <Symbol name="zahnrad" /> Einstellungen
        </div>
        {BEREICHE.map((b) => (
          <button key={b.id} className={`es-nav-eintrag${bereich === b.id ? ' aktiv' : ''}`} aria-current={bereich === b.id ? 'page' : undefined} onClick={() => einstellungenOeffnen(b.id)}>
            <Symbol name={b.symbol} />
            <span>
              <span className="es-nav-titel">{b.titel}</span>
              <span className="es-nav-text">{b.text}</span>
            </span>
          </button>
        ))}
        <button className="es-zurueck primary" onClick={einstellungenSchliessen}>
          Fertig
        </button>
      </nav>
      <section className="es-inhalt">
        {bereich === 'ordner' && <Ordner />}
        {bereich === 'stammdaten' && <Stammdaten />}
        {bereich === 'adressbuch' && <Adressbuch />}
        {bereich === 'formulare' && <Formulare />}
        {bereich === 'antrag' && <AntragEinstellungen />}
        {bereich === 'projektdaten' && <Projektdaten />}
        {bereich === 'sicherung' && <SicherungEinstellungen />}
      </section>
    </div>
  );
}

function OrdnerListe({ ordner, onEntfernen }: { ordner: string[]; onEntfernen: (p: string) => void }) {
  if (!ordner.length) return <p className="muted small-text">Noch keiner eingestellt.</p>;
  return (
    <ul className="es-liste">
      {ordner.map((p) => (
        <li key={p} title={p}>
          <Symbol name="ordner" />
          <span className="es-liste-text">
            <strong>{dateiname(p) || p}</strong>
            <span className="muted small-text">{p}</span>
          </span>
          <button className="icon" title="Aus der Liste entfernen (der Ordner selbst bleibt unverändert)" aria-label={`${p} entfernen`} onClick={() => onEntfernen(p)}>
            <Symbol name="schliessen" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function Ordner() {
  const projektordner = useFormulare((s) => s.projektordner);
  const ablageordner = useFormulare((s) => s.ablageordner);
  const vorgabe = useFormulare((s) => s.vorgabeAuswahl);
  const ablageFehler = useFormulare((s) => s.ablageFehler);
  const { ordnerHinzufuegen, ordnerEntfernen, ablageHinzufuegen, ablageEntfernen, setVorgabeAuswahl } = useFormulare.getState();
  return (
    <>
      <h2>Ordner</h2>
      <Karte titel="Formularprojekte" text="Ordner, in denen die Formularprojekte liegen (je Projekt ein Unterordner mit Kürzel, z. B. „BS5“, mit den Formularen und der Projektkarte). Es können mehrere sein.">
        <OrdnerListe ordner={projektordner} onEntfernen={(p) => void ordnerEntfernen(p)} />
        <button
          onClick={async () => {
            const p = await waehleOrdner('Ordner mit Formularprojekten wählen');
            if (p) await ordnerHinzufuegen(p);
          }}
        >
          <Symbol name="plus" /> Ordner hinzufügen …
        </button>
      </Karte>
      <Karte
        titel="Projektordner"
        text={
          <>
            Stammordner mit den eigentlichen Projektordnern (z. B. <code>Z:\Projekte</code>) – gemeinsam für alle Apps (gemeinsamer Konfigurationsordner). Zuordnung
            über das Kürzel – „BS5 Birkenstraße 5“ oder „JJ H24 …“ –, zwei Ebenen tief (auch in Unterordnern wie der Akquise).
          </>
        }
      >
        <OrdnerListe ordner={ablageordner} onEntfernen={(p) => void ablageEntfernen(p)} />
        <button
          onClick={async () => {
            const p = await waehleOrdner('Ordner mit den Projektordnern wählen (z. B. Z:\\Projekte)');
            if (p) await ablageHinzufuegen(p);
          }}
        >
          <Symbol name="plus" /> Ordner hinzufügen …
        </button>
        {ablageFehler.map((f) => (
          <p key={f} className="warning small-text">
            {f}
          </p>
        ))}
      </Karte>
      <Karte
        titel="Angezeigte Pfade (Vorgabe)"
        text={
          <>
            Welche Teile eines Projektordners in der Navigation erscheinen – je Zeile ein Pfad, z. B. <code>Organisation</code> oder <code>Planung/Berechnungen</code>, Platzhalter{' '}
            <code>*</code> und <code>?</code> je Ebene. Je Projekt änderbar (⚙ beim Projektordner).
          </>
        }
      >
        <textarea rows={5} defaultValue={vorgabe.join('\n')} onBlur={(e) => setVorgabeAuswahl(e.target.value.split('\n'))} aria-label="Angezeigte Pfade (Vorgabe)" />
      </Karte>
    </>
  );
}

function AdressKarte({ a }: { a: Adresse }) {
  return (
    <div className="es-adresse">
      <strong>{adressName(a)}</strong>
      {a.texte['70'] && <span>{a.texte['70']}</span>}
      {adressOrt(a) && <span>{adressOrt(a)}</span>}
      {(a.texte['130'] || a.texte['170']) && <span className="muted small-text">{[a.texte['130'], a.texte['170']].filter(Boolean).join(' · ')}</span>}
    </div>
  );
}

function AdressbuchLeer() {
  const laeuft = useFormulare((s) => s.adressbuchLaeuft);
  const projekte = useFormulare((s) => s.projekte.length);
  const { adressbuchLaden } = useFormulare.getState();
  return (
    <div className="es-leer">
      <p>Das Adressbuch sammelt die Adressen aus den Projektkarten aller Projekte ({projekte} Projekte) – und eure eigenen, die ihr hier anlegt.</p>
      <div className="es-knoepfe">
        <button className="primary" disabled={!!laeuft || !projekte} onClick={() => void adressbuchLaden()}>
          {laeuft ? `Liest … ${laeuft.fertig} von ${laeuft.gesamt}` : 'Aus den Projektkarten einlesen'}
        </button>
        <button onClick={() => useFormulare.getState().einstellungenOeffnen('adressbuch')}>Adresse anlegen …</button>
      </div>
    </div>
  );
}

function Stammdaten() {
  const adressbuch = useFormulare((s) => s.adressbuch);
  const vorgaben = useFormulare((s) => s.rollenVorgaben);
  const { setRollenVorgabe, einstellungenOeffnen } = useFormulare.getState();
  const rollen = useMemo(() => {
    const m = new Map<number, string>(ROLLEN_VORGABE);
    for (const a of adressbuch?.adressen ?? []) for (const v of a.verwendungen) if (!m.has(v.gruppe) && v.gruppe !== 201 && v.gruppe !== 205) m.set(v.gruppe, v.rolle);
    return [...m].sort((a, b) => a[0] - b[0]);
  }, [adressbuch]);

  return (
    <>
      <h2>Büro & Stammdaten</h2>
      <p className="muted">
        Vorgaben je Rolle: Welche Adresse in einer neuen Projektkarte eingesetzt wird (Projektkarte → „Vorgaben eintragen“ bzw. „Übernehmen von …“). Die Adressen stammen
        aus dem <button className="es-verweis" onClick={() => einstellungenOeffnen('adressbuch')}>Adressbuch</button> – dort lassen sie sich anlegen und ändern.
      </p>
      {!adressbuch ? (
        <AdressbuchLeer />
      ) : (
        <div className="es-rollen">
          {rollen.map(([gruppe, rolle]) => {
            const passend = inRolle(adressbuch.adressen, gruppe);
            const gewaehlt = adressbuch.adressen.find((a) => a.schluessel === vorgaben[String(gruppe)]);
            const andere = adressbuch.adressen.filter((a) => !passend.includes(a));
            return (
              <Karte key={gruppe} titel={rolle}>
                <select value={vorgaben[String(gruppe)] ?? ''} onChange={(e) => setRollenVorgabe(gruppe, e.target.value || null)} aria-label={`Vorgabe für ${rolle}`}>
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
                {vorgaben[String(gruppe)] && !gewaehlt && <p className="warning small-text">Die gewählte Adresse steht nicht mehr im Adressbuch.</p>}
              </Karte>
            );
          })}
        </div>
      )}
    </>
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
      if (await bestaetigen(`„${adressName(a)}“ löschen?`, 'Die Adresse wird aus dem Adressbuch gelöscht. Projektkarten, in die sie übernommen wurde, bleiben unverändert.', 'Löschen'))
        await eigeneAdresseEntfernen(a.schluessel);
    } else if (
      await bestaetigen(
        `„${adressName(a)}“ ausblenden?`,
        'Die Adresse steht in Projektkarten und wird dort nicht gelöscht – im Adressbuch erscheint sie nicht mehr (unten wieder einblendbar).',
        'Ausblenden',
      )
    )
      await eigeneAdresseSpeichern({ schluessel: a.schluessel, texte: {}, ausgeblendet: true, geaendert: Date.now() });
  };

  return (
    <>
      <div className="es-titelzeile">
        <h2>Adressbuch</h2>
        <button className="primary" onClick={neu}>
          <Symbol name="plus" /> Neue Adresse
        </button>
        <button disabled={!!laeuft || !projekte} onClick={() => void adressbuchLaden()} title="Die Projektkarten aller Projekte neu lesen">
          {laeuft ? `Liest … ${laeuft.fertig} von ${laeuft.gesamt}` : 'Aus den Projektkarten einlesen'}
        </button>
      </div>
      <p className="muted">
        Bauherren, Entwurfsverfasser, Behörden, Fachplaner: die Adressen aus den Projektkarten aller Projekte (gleiche erscheinen einmal mit allen Verwendungen) und eure
        eigenen. Anlegen, ändern und ausblenden lässt sich alles hier – gespeichert im gemeinsamen Konfigurationsordner, für alle im Büro. Die Projektkarten selbst bleiben
        unverändert; übernommen wird eine Adresse in der Projektkarte mit „Übernehmen von …“.
        {adressbuch && ` ${adressbuch.adressen.length} Adressen${adressbuch.stand ? `, Projektkarten gelesen ${new Date(adressbuch.stand).toLocaleString('de-DE')}` : ''}.`}
      </p>
      {!adressbuch && !entwurf ? (
        <AdressbuchLeer />
      ) : (
        <div className="es-adressbuch">
          <div className="es-adressliste">
            <input type="search" placeholder="Name, Ort, Rolle, Projekt …" value={suche} onChange={(e) => setSuche(e.target.value)} aria-label="Adressbuch durchsuchen" />
            <div className="es-adressliste-eintraege" role="listbox" aria-label="Adressen">
              {liste.map((a) => (
                <button
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
              onSubmit={(e) => {
                e.preventDefault();
                void speichern();
              }}
            >
              <h3>{entwurf.neu ? 'Neue Adresse' : 'Adresse bearbeiten'}</h3>
              <div className="es-adress-felder">
                {ADRESS_TEXTFELDER.map(([id, titel]) => (
                  <label key={id} className={id === '40' || id === '70' ? 'breit' : ''}>
                    <span className="field-label">
                      {titel}
                      {id === '40' ? ' *' : ''}
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
                  <h3>{adressName(auswahl)}</h3>
                  <button className="small" onClick={() => bearbeiten(auswahl)}>
                    <Symbol name="stift" /> Bearbeiten
                  </button>
                  <button className="small" onClick={() => void entfernen(auswahl)}>
                    {auswahl.herkunft === 'eigen' ? 'Löschen …' : 'Ausblenden …'}
                  </button>
                  {auswahl.herkunft === 'geaendert' && (
                    <button className="small" title="Die eigene Fassung verwerfen – es gilt wieder die aus den Projektkarten" onClick={() => void eigeneAdresseEntfernen(auswahl.schluessel)}>
                      Änderungen verwerfen
                    </button>
                  )}
                </div>
                <p className="muted small-text">
                  {auswahl.herkunft === 'eigen' ? 'Eigene Adresse des Adressbuchs.' : auswahl.herkunft === 'geaendert' ? 'Aus den Projektkarten, im Adressbuch geändert.' : 'Aus den Projektkarten.'}
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
                    <h4>Verwendet in</h4>
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
        <Karte titel={`Ausgeblendet (${ausgeblendet.length})`} text="Adressen aus den Projektkarten, die im Adressbuch nicht erscheinen.">
          <ul className="es-liste">
            {ausgeblendet.map((e) => {
              const a = adressbuch?.adressen.find((x) => x.schluessel === e.schluessel) ?? useFormulare.getState().adressbuchKarten?.adressen.find((x) => x.schluessel === e.schluessel);
              return (
                <li key={e.schluessel}>
                  <Symbol name="adressen" />
                  <span className="es-liste-text">{a ? `${adressName(a)} · ${adressOrt(a)}` : e.schluessel.split('|').filter(Boolean).join(', ')}</span>
                  <button className="small" onClick={() => void eigeneAdresseEntfernen(e.schluessel)}>
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

function Formulare() {
  const profile = useFormulare((s) => s.profile);
  const { profilSetzen } = useFormulare.getState();
  const eintraege = Object.entries(profile);
  return (
    <>
      <h2>Formulare</h2>
      <p className="muted">
        Je Formular lässt sich einstellen, welche Abschnitte die Gliederung zeigt, wie Abschnitte und Felder heißen, welche Felder in den Füllstand eingehen und welche zusammen
        als eine Angabe zählen und wann etwas erforderlich ist – im Formular über „Einrichten“ in der Werkzeugleiste. Die Einstellung gilt für das Formular in
        allen Projekten.
      </p>
      <p className="muted small-text">
        {Object.keys(VORGABEN).length
          ? `Für ${Object.keys(VORGABEN).length} Formular(e) bringt die App eine Vorgabe mit (Titel, Gruppen und Bedingungen nach BauO NRW / BauPrüfVO). Eigene Einstellungen gehen vor; gespeichert wird nur, was davon abweicht.`
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
            return (
              <li key={k}>
                <Symbol name="formular" />
                <span className="es-liste-text">
                  <strong>{k.replace(/\|/, ' · Stand ')}</strong>
                  <span className="muted small-text">
                    {[
                      versteckt && `${versteckt} Abschnitt(e) ausgeblendet`,
                      umbenannt && `${umbenannt} umbenannt`,
                      felder && `${felder} Feld(er) umbenannt`,
                      ohne && `${ohne} Feld(er) zählen nicht`,
                      gruppen && `${gruppen} Gruppe(n)`,
                      bedingungen && `${bedingungen} Bedingung(en)`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <button onClick={() => profilSetzen(k, null)}>{hatVorgabe(k) ? 'Auf Vorgabe zurücksetzen' : 'Zurücksetzen'}</button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/** Beispielwerte für die Vorschau des Pfads neuer Projektdateien */
const OAP_BEISPIEL = { nummer: 'BS9', kurzname: 'EFH Musterweg', vorhaben: 'Neubau Einfamilienhaus', datum: new Date() };

/** Platzhalter anhängen – vor der Endung „.oap“, falls vorhanden */
const mitPlatzhalter = (vorlage: string, name: string) => {
  const m = /^(.*?)\s*(\.oap)\s*$/i.exec(vorlage.trim());
  return m ? `${`${m[1]} ${name}`.trim()}${m[2]}` : `${vorlage.trim()} ${name}`.trim();
};

function Projektdaten() {
  const neu = useFormulare((s) => s.oapVorlage);
  const { setOapVorlage } = useFormulare.getState();
  return (
    <>
      <h2>Projektdatei (.oap)</h2>
      <p className="muted">
        Die Projektstammdaten kommen aus der Projektdatei im Projektordner – dem gemeinsamen Projektarchiv von Flächenrechner, GRZ-Nachweis, Kostenermittlung und
        Projektordner (die Daten stehen darin als JSON unter „meta“). Gesucht wird bis vier Ebenen tief; bei mehreren gilt die im Ordner der Berechnungen, sonst die
        mit dem kürzesten Pfad – je Projekt lässt sich in der Projektkarte eine andere wählen. In der Projektkarte lassen sich die Angaben in beide Richtungen
        abgleichen; beim Speichern der Projektkarte werden geänderte Angaben in die Projektdatei eingetragen, alles andere darin bleibt unverändert. Eine alte
        Projektdaten.xlsx wird nur noch gelesen, um ihre Angaben zu übernehmen.
      </p>
      <Karte
        titel="Neue Projektdatei"
        text={
          <>
            Fehlt die Projektdatei, legt sie der Stammdaten-Dialog hier an – relativ zum Projektordner, mit den Angaben aus dem Dialog. Die Einstellung gilt für
            alle Apps (gemeinsamer Konfigurationsordner).
          </>
        }
      >
        <div className="es-zeile">
          <input defaultValue={neu} key={neu} placeholder={VORGABE_OAP_PFAD} onBlur={(e) => e.target.value.trim() !== neu && setOapVorlage(e.target.value)} aria-label="Pfad für neue Projektdateien" />
        </div>
        <div className="es-platzhalter">
          {OAP_PLATZHALTER.map((p) => (
            <button key={p.name} className="small" title={p.text} onClick={() => setOapVorlage(mitPlatzhalter(neu, p.name))}>
              {p.name}
            </button>
          ))}
          {neu !== VORGABE_OAP_PFAD && (
            <button className="small" onClick={() => setOapVorlage(VORGABE_OAP_PFAD)}>
              Vorgabe
            </button>
          )}
        </div>
        <p className="muted es-beispiel" aria-label="Beispiel für den Pfad">
          Beispiel: <code>{projektdateiPfad(neu, OAP_BEISPIEL)}</code>
        </p>
        {unbekanntePlatzhalter(neu).length > 0 && <p className="warning">Unbekannt, bleibt so im Namen stehen: {unbekanntePlatzhalter(neu).join(', ')}</p>}
      </Karte>
      <Karte titel="Angaben">
        <table className="es-tabelle">
          <thead>
            <tr>
              <th>In der Projektkarte</th>
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
    </>
  );
}
