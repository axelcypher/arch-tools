import { useMemo, useState } from 'react';
import { dateiname, openFileWithPath } from '@core/platform/files';
import type { Adresse } from '../adressbuch';
import { adressName, adressOrt, inRolle, sucheAdressen } from '../adressbuch';
import { waehleOrdner } from '../dateisystem';
import { IN_PROJEKTKARTE } from '../projektdaten';
import { stammdatenLaden, stammdatenSpeichern } from '../stammdaten';
import type { EinstellungsBereich } from '../store';
import { useFormulare } from '../store';
import type { SymbolName } from './Symbol';
import { Symbol } from './Symbol';

const BEREICHE: { id: EinstellungsBereich; titel: string; symbol: SymbolName; text: string }[] = [
  { id: 'ordner', titel: 'Ordner', symbol: 'ordner', text: 'FORMA-Projekte, Projektordner, angezeigte Pfade' },
  { id: 'stammdaten', titel: 'Büro & Stammdaten', symbol: 'buero', text: 'Vorgaben je Rolle für neue Projektkarten' },
  { id: 'adressbuch', titel: 'Adressbuch', symbol: 'adressen', text: 'Adressen aus allen FORMA-Projekten' },
  { id: 'formulare', titel: 'Formulare', symbol: 'formular', text: 'Gliederung und Füllstand je Formular' },
  { id: 'projektdaten', titel: 'Projektdaten.xlsx', symbol: 'tabelle', text: 'Abgleich mit dem Projektordner' },
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
 * Einstellungen als eigene Ansicht mit Ebenen: links die Bereiche, rechts der Inhalt. Adressen und Stammdaten
 * kommen aus FORMA (Projektkarten) – hier wird nur ausgewählt, nichts doppelt gepflegt.
 */
export function EinstellungenAnsicht() {
  const bereich = useFormulare((s) => s.einstellungsBereich);
  const { einstellungenOeffnen, setHaupt } = useFormulare.getState();
  const offen = useFormulare((s) => s.offen);
  const datei = useFormulare((s) => s.datei);
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
        <button className="es-zurueck" onClick={() => setHaupt(offen ? 'formular' : datei ? 'datei' : 'formular')}>
          Fertig
        </button>
      </nav>
      <section className="es-inhalt">
        {bereich === 'ordner' && <Ordner />}
        {bereich === 'stammdaten' && <Stammdaten />}
        {bereich === 'adressbuch' && <Adressbuch />}
        {bereich === 'formulare' && <Formulare />}
        {bereich === 'projektdaten' && <Projektdaten />}
      </section>
    </div>
  );
}

function Karte({ titel, text, children, kopf }: { titel: string; text?: React.ReactNode; children: React.ReactNode; kopf?: React.ReactNode }) {
  return (
    <section className="es-karte">
      <div className="es-karte-kopf">
        <h3>{titel}</h3>
        {kopf}
      </div>
      {text && <p className="muted small-text">{text}</p>}
      {children}
    </section>
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
      <Karte titel="FORMA-Projekte" text="Ordner, in denen die FORMA-Projekte liegen (je Projekt ein Unterordner mit Kürzel, z. B. „BS5“). Es können mehrere sein.">
        <OrdnerListe ordner={projektordner} onEntfernen={(p) => void ordnerEntfernen(p)} />
        <button
          onClick={async () => {
            const p = await waehleOrdner('Ordner mit FORMA-Projekten wählen');
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
            Ordner mit den eigentlichen Projektordnern (z. B. <code>Z:\Projekte</code>). Zuordnung über das Kürzel – „BS5 Birkenstraße 5“ oder „JJ H24 …“ –, zwei Ebenen
            tief (auch in Unterordnern wie der Akquise).
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
      <p>Das Adressbuch wird aus den Projektkarten aller FORMA-Projekte gelesen ({projekte} Projekte).</p>
      <button className="primary" disabled={!!laeuft || !projekte} onClick={() => void adressbuchLaden()}>
        {laeuft ? `Liest … ${laeuft.fertig} von ${laeuft.gesamt}` : 'Adressbuch einlesen'}
      </button>
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
        aus dem <button className="es-verweis" onClick={() => einstellungenOeffnen('adressbuch')}>Adressbuch</button>, also aus FORMA – gepflegt wird dort, nicht hier.
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
  const laeuft = useFormulare((s) => s.adressbuchLaeuft);
  const { adressbuchLaden } = useFormulare.getState();
  const [suche, setSuche] = useState('');
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [alt, setAlt] = useState(stammdatenLaden);
  const liste = useMemo(() => sucheAdressen(adressbuch?.adressen ?? [], suche), [adressbuch, suche]);
  const auswahl = liste.find((a) => a.schluessel === gewaehlt) ?? liste[0];

  return (
    <>
      <div className="es-titelzeile">
        <h2>Adressbuch</h2>
        <button disabled={!!laeuft} onClick={() => void adressbuchLaden()} title="Projektkarten aller FORMA-Projekte neu lesen">
          {laeuft ? `Liest … ${laeuft.fertig} von ${laeuft.gesamt}` : 'Neu einlesen'}
        </button>
      </div>
      <p className="muted">
        Alle Adressen aus den Projektkarten der FORMA-Projekte – Bauherren, Entwurfsverfasser, Behörden, Fachplaner. Gepflegt wird in FORMA bzw. in der Projektkarte; gleiche
        Adressen erscheinen einmal mit allen Verwendungen.
        {adressbuch && ` Stand: ${new Date(adressbuch.stand).toLocaleString('de-DE')}, ${adressbuch.adressen.length} Adressen.`} Die zentrale Adressdatenbank von SJ OFFICE ist
        noch nicht angebunden.
      </p>
      {!adressbuch ? (
        <AdressbuchLeer />
      ) : (
        <div className="es-adressbuch">
          <div className="es-adressliste">
            <input type="search" placeholder="Name, Ort, Rolle, Projekt …" value={suche} onChange={(e) => setSuche(e.target.value)} aria-label="Adressbuch durchsuchen" />
            <div className="es-adressliste-eintraege" role="listbox" aria-label="Adressen">
              {liste.map((a) => (
                <button key={a.schluessel} role="option" aria-selected={auswahl === a} className={`es-adress-eintrag${auswahl === a ? ' aktiv' : ''}`} onClick={() => setGewaehlt(a.schluessel)}>
                  <strong>{adressName(a)}</strong>
                  <span className="muted small-text">
                    {adressOrt(a) || '–'} · {[...new Set(a.verwendungen.map((v) => v.rolle))].slice(0, 2).join(', ')}
                  </span>
                </button>
              ))}
              {!liste.length && <p className="muted small-text">Keine passenden Adressen.</p>}
            </div>
          </div>
          {auswahl && (
            <div className="es-adress-detail">
              <h3>{adressName(auswahl)}</h3>
              <dl>
                {ADRESSFELDER.filter(([id]) => auswahl.texte[id]?.trim()).map(([id, titel]) => (
                  <div key={id}>
                    <dt>{titel}</dt>
                    <dd>{auswahl.texte[id]}</dd>
                  </div>
                ))}
              </dl>
              <h4>Verwendet in</h4>
              <ul className="es-verwendungen">
                {auswahl.verwendungen.map((v, i) => (
                  <li key={i}>
                    <strong>{v.projekt}</strong> · {v.rolle}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {alt.length > 0 && (
        <Karte titel="Früher in der App gemerkte Adressen" text="Aus Version 0.2/0.3 – lassen sich weiter übernehmen, sind aber nicht mit FORMA verbunden. Am besten entfernen und die Adresse in FORMA pflegen.">
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
        Je Formular lässt sich einstellen, welche Abschnitte die Gliederung zeigt, wie sie heißen und welche Felder in den Füllstand eingehen – im Formular über die Gliederung
        (<Symbol name="stift" /> Anpassen). Die Einstellung gilt für das Formular in allen Projekten.
      </p>
      {!eintraege.length ? (
        <p className="muted small-text">Noch kein Formular angepasst.</p>
      ) : (
        <ul className="es-liste">
          {eintraege.map(([k, p]) => {
            const versteckt = Object.values(p.abschnitte).filter((a) => a.sichtbar === false).length;
            const umbenannt = Object.values(p.abschnitte).filter((a) => a.titel).length;
            const ohne = Object.keys(p.zaehlt).length;
            return (
              <li key={k}>
                <Symbol name="formular" />
                <span className="es-liste-text">
                  <strong>{k.replace(/\|/, ' · Stand ')}</strong>
                  <span className="muted small-text">
                    {[versteckt && `${versteckt} Abschnitt(e) ausgeblendet`, umbenannt && `${umbenannt} umbenannt`, ohne && `${ohne} Feld(er) zählen nicht`].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <button onClick={() => profilSetzen(k, null)}>Zurücksetzen</button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Projektdaten() {
  const vorlage = useFormulare((s) => s.projektdatenVorlage);
  const { setProjektdatenVorlage } = useFormulare.getState();
  return (
    <>
      <h2>Projektdaten.xlsx</h2>
      <p className="muted">
        Im Projektordner liegt unter <code>Organisation\&lt;Kürzel&gt; Projektdaten.xlsx</code> eine Übersicht der Projektdaten. Die App liest sie allgemein – Beschriftung
        und Wert rechts daneben; Überschriften wie „Bauherr“ oder „Grundstück“ bestimmen, wozu Straße, PLZ und Ort gehören. In der Projektkarte lassen sich die Angaben
        übernehmen; beim Speichern der Projektkarte werden geänderte Angaben in die Datei nachgetragen (nur die Wertzellen).
      </p>
      <Karte titel="Vorlage für neue Projekte" text="Fehlt die Datei, wird sie beim Speichern der Projektkarte aus dieser Vorlage angelegt. Leer = keine anlegen.">
        <div className="es-zeile">
          <input value={vorlage} placeholder="z. B. Z:\Vorlagen\Projektdaten.xlsx" onChange={(e) => setProjektdatenVorlage(e.target.value)} aria-label="Vorlage für die Projektdaten.xlsx" />
          <button
            onClick={async () => {
              const d = await openFileWithPath({ filterName: 'Excel-Mappe', extensions: ['xlsx'] });
              if (d?.pfad) setProjektdatenVorlage(d.pfad);
            }}
          >
            Durchsuchen …
          </button>
        </div>
      </Karte>
      <Karte titel="Erkannte Angaben">
        <table className="es-tabelle">
          <thead>
            <tr>
              <th>In der Projektkarte</th>
              <th>Beschriftung in der Projektdaten.xlsx (Beispiele)</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ['vorhaben', 'Bauvorhaben, Projekt, Maßnahme'],
                ['grundstueck.strasse', 'Straße / Nr. (unter „Grundstück“)'],
                ['grundstueck.ort', 'Ort, PLZ / Ort'],
                ['gemarkung', 'Gemarkung'],
                ['flur', 'Flur'],
                ['flurstueck', 'Flurstück, Flst.'],
                ['grundstuecksflaeche', 'Grundstücksfläche'],
                ['bauherr.name', 'Bauherr, Name, Firma'],
                ['bauherr.vorname', 'Vorname'],
                ['bauherr.strasse', 'Straße (unter „Bauherr“)'],
                ['bauherr.plz', 'PLZ'],
                ['bauherr.ort', 'Ort'],
                ['bauherr.telefon', 'Telefon, Tel., Mobil'],
                ['bauherr.email', 'E-Mail'],
                ['aktenzeichen', 'Aktenzeichen'],
              ] as const
            ).map(([a, b]) => (
              <tr key={a}>
                <td>{IN_PROJEKTKARTE[a]?.titel}</td>
                <td>{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Karte>
    </>
  );
}
