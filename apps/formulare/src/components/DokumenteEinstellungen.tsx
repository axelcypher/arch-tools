import type { ReactNode } from 'react';
import { useId, useState } from 'react';
import { bestaetigen } from '@core/ui/Rueckfrage';
import type { AntragsVorlage, KatalogEintrag } from '../antrag';
import { PLANSATZ_QUELLE, VORGABE_KATALOG, VORGABE_VORLAGEN, verschieben, vorlagenAus } from '../antrag';
import { bedingungText, hatBedingung } from '../bedingung';
import { useAntrag } from '../antragStore';
import { BedingungEditor } from './BedingungEditor';
import { Griff, useSortieren } from './Sortieren';
import type { SymbolName } from './Symbol';
import { Symbol } from './Symbol';

/** Art eines Dokuments: Bezeichnung und Erklärung (Auswahl im Editor) */
const ARTEN: { art: KatalogEintrag['art']; titel: string; text: string; symbol: SymbolName }[] = [
  { art: 'intern', titel: 'Formular des Projekts', text: 'ein Formular aus dem Formularprojekt, z. B. Bauantrag', symbol: 'formular' },
  { art: 'extern', titel: 'Datei aus dem Projektordner', text: 'z. B. Berechnung, Gutachten, fremde PDF', symbol: 'datei' },
  { art: 'plansatz', titel: 'Plansatz', text: 'alle Pläne mit Plannummer (GP-01 …), geprüft auf Lücken', symbol: 'stapel' },
];

function Karte({ titel, text, children }: { titel: string; text?: ReactNode; children: ReactNode }) {
  return (
    <section className="es-karte">
      <div className="es-karte-kopf">
        <h3>{titel}</h3>
      </div>
      {text && <p className="muted small-text">{text}</p>}
      {children}
    </section>
  );
}

/**
 * Einstellungen „Antragsvorlagen“ und „Antragsdokumente“: Die Dokumente stehen als Liste mit Kurzbeschreibung; ein
 * Klick öffnet ihre Angaben als beschriftetes Formular (Bezeichnung, Art, Formular bzw. Quelle und Muster, Vorlagen,
 * Bedingung). Welche Dokumente zu einer Vorlage gehören, wird mit der Auswahl „Vorlage“ über der Liste angekreuzt.
 */
export function DokumenteEinstellungen() {
  const katalog = useAntrag((s) => s.katalog);
  const vorlagen = useAntrag((s) => s.vorlagen);
  const merkmale = useAntrag((s) => s.merkmalDefinitionen);
  const e = useAntrag((s) => s.einstellungen);
  const { setKatalog, setVorlagen } = useAntrag.getState();
  const katalogSort = useSortieren(katalog.length, (von, nach) => setKatalog(verschieben(katalog, von, nach)));
  const vorlagenSort = useSortieren(vorlagen.length, (von, nach) => setVorlagen(verschieben(vorlagen, von, nach)));
  const id = useId();
  // geöffnetes Dokument, eben angelegtes (Bezeichnung bekommt den Fokus), gewählte Vorlage der Liste
  const [offen, setOffen] = useState<string | null>(null);
  const [neu, setNeu] = useState<string | null>(null);
  const [vorlageId, setVorlageId] = useState('');
  const vorlage = vorlagen.find((v) => v.id === vorlageId);

  const vorlageSetzen = (vid: string, teil: Partial<AntragsVorlage>) => setVorlagen(vorlagen.map((v) => (v.id === vid ? { ...v, ...teil } : v)));
  const inVorlage = (v: AntragsVorlage, kid: string, an: boolean) => vorlageSetzen(v.id, { dokumente: an ? [...v.dokumente.filter((d) => d !== kid), kid] : v.dokumente.filter((d) => d !== kid) });
  const setzen = (kid: string, teil: Partial<KatalogEintrag>) => setKatalog(katalog.map((k) => (k.id === kid ? { ...k, ...teil } : k)));
  const quelleVorgabe = (k: KatalogEintrag) => (k.art === 'plansatz' ? PLANSATZ_QUELLE : e.berechnungsordner);
  // Kurzbeschreibung in der Zeile: woher das Dokument kommt
  const herkunft = (k: KatalogEintrag) =>
    k.art === 'intern' ? `Formular „${k.formular || k.titel}“` : `${k.art === 'plansatz' ? 'Pläne' : 'Datei'} aus ${k.quelle || quelleVorgabe(k)}${k.muster ? ` · ${k.muster}` : ''}`;

  const hinzufuegen = () => {
    const kid = `k${Date.now().toString(36)}`;
    setKatalog([...katalog, { id: kid, titel: 'Neues Dokument', art: 'extern', vorgewaehlt: false }]);
    // ist eine Vorlage gewählt, gehört das neue Dokument gleich dazu
    if (vorlage) inVorlage(vorlage, kid, true);
    setOffen(kid);
    setNeu(kid);
  };
  const entfernen = async (k: KatalogEintrag) => {
    if (!(await bestaetigen('Dokument entfernen', `„${k.titel}“ aus den Antragsdokumenten entfernen? In Projekten, die es im Antragsumfang haben, bleibt es dort.`, 'Entfernen', true))) return;
    const { katalog: jetzt, vorlagen: vorlagenJetzt } = useAntrag.getState();
    setKatalog(jetzt.filter((x) => x.id !== k.id));
    if (vorlagenJetzt.some((v) => v.dokumente.includes(k.id))) setVorlagen(vorlagenJetzt.map((v) => ({ ...v, dokumente: v.dokumente.filter((d) => d !== k.id) })));
    setOffen(null);
  };
  const katalogVorgabe = async () => {
    if (
      await bestaetigen('Vorgabe wiederherstellen', 'Die Antragsdokumente auf die Vorgabe zurücksetzen? Eigene Dokumente und Änderungen gehen verloren; die Vorlagen bleiben.', 'Zurücksetzen', true)
    ) {
      setKatalog(null);
      setOffen(null);
    }
  };
  const vorlagenVorgabe = async () => {
    if (await bestaetigen('Vorgabe wiederherstellen', 'Die Antragsvorlagen auf die Vorgabe zurücksetzen? Eigene Vorlagen und Zuordnungen gehen verloren.', 'Zurücksetzen', true)) {
      setVorlagen(null);
      setVorlageId('');
    }
  };

  return (
    <>
      <Karte
        titel="Antragsvorlagen"
        text="Zusammenstellungen der Antragsdokumente je Art von Antrag. Beim Festlegen des Antragsumfangs wird die Vorlage zur Antragsart der aktiven Fassung vorgeschlagen (z. B. BAUA → Bauantrag). Welche Dokumente dazugehören, legst du unten bei den Antragsdokumenten fest – „Dokumente“ führt dorthin."
      >
        <table className="es-tabelle es-katalog es-vorlagen" data-sortier-liste="">
          <thead>
            <tr>
              <th />
              <th>Vorlage</th>
              <th title="für Projekte, deren aktive Antragsfassung diese Art hat">Antragsart</th>
              <th>Dokumente</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {vorlagen.map((v, i) => (
              <tr key={v.id} {...vorlagenSort.zeile(i)}>
                <td className="es-griff">
                  <Griff {...vorlagenSort.griff(i, `Vorlage ${v.name}`)} />
                </td>
                <td>
                  <input value={v.name} aria-label="Vorlage" onChange={(x) => vorlageSetzen(v.id, { name: x.target.value })} />
                </td>
                <td>
                  <select value={v.art ?? ''} aria-label={`Antragsart von ${v.name}`} onChange={(x) => vorlageSetzen(v.id, { art: x.target.value || undefined })}>
                    <option value="">–</option>
                    {[...new Set([...e.arten, ...(v.art ? [v.art] : [])])].map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button
                    className="small"
                    title={`Unten die Dokumente der Vorlage „${v.name}“ zeigen und ankreuzen`}
                    onClick={() => {
                      setVorlageId(v.id);
                      document.getElementById(`${id}-dokumente`)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
                    }}
                  >
                    {katalog.filter((k) => v.dokumente.includes(k.id)).length} Dokumente
                  </button>
                </td>
                <td>
                  <button
                    className="icon"
                    aria-label={`${v.name} entfernen`}
                    title="Entfernen"
                    onClick={() => {
                      setVorlagen(vorlagen.filter((x) => x.id !== v.id));
                      if (vorlageId === v.id) setVorlageId('');
                    }}
                  >
                    <Symbol name="muell" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="es-zeile">
          <button onClick={() => setVorlagen([...vorlagen, { id: `v${Date.now().toString(36)}`, name: 'Neue Vorlage', dokumente: [] }])}>
            <Symbol name="plus" /> Vorlage hinzufügen
          </button>
          {JSON.stringify(vorlagen) !== JSON.stringify(vorlagenAus(null, katalog)) && JSON.stringify(vorlagen) !== JSON.stringify(VORGABE_VORLAGEN) && (
            <button onClick={() => void vorlagenVorgabe()}>Vorgabe wiederherstellen</button>
          )}
        </div>
      </Karte>

      <Karte
        titel="Antragsdokumente"
        text="Alle Dokumente, die in einem Antrag vorkommen können; was nicht zur Vorlage gehört, lässt sich je Projekt hinzunehmen. Ein Klick auf ein Dokument öffnet seine Angaben. Die Reihenfolge (am Griff ziehen) gilt auch für den Antragsumfang."
      >
        <div className="es-dok-kopf" id={`${id}-dokumente`}>
          <label>
            <span className="field-label">Vorlage</span>
            <select value={vorlageId} onChange={(x) => setVorlageId(x.target.value)} aria-describedby={`${id}-vorlage-hinweis`}>
              <option value="">Alle Dokumente</option>
              {vorlagen.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <span className="field-hint" id={`${id}-vorlage-hinweis`} role="status">
            {vorlage
              ? `${katalog.filter((k) => vorlage.dokumente.includes(k.id)).length} von ${katalog.length} Dokumenten gehören zu „${vorlage.name}“ – ankreuzen, was dazugehört.`
              : 'Eine Vorlage wählen, um ihre Dokumente anzukreuzen.'}
          </span>
        </div>
        <ul className="es-dok-liste" data-sortier-liste="">
          {katalog.map((k, i) => {
            const auf = offen === k.id;
            const art = ARTEN.find((a) => a.art === k.art) ?? ARTEN[0];
            const inVorlagen = vorlagen.filter((v) => v.dokumente.includes(k.id));
            const kid = `${id}-${k.id}`;
            return (
              <li key={k.id} className={`es-dok${auf ? ' offen' : ''}`} {...katalogSort.zeile(i)}>
                <div className="es-dok-zeile">
                  <Griff {...katalogSort.griff(i, k.titel)} />
                  {vorlage && (
                    <input
                      type="checkbox"
                      className="es-dok-haken"
                      checked={vorlage.dokumente.includes(k.id)}
                      onChange={(x) => inVorlage(vorlage, k.id, x.target.checked)}
                      aria-label={`${k.titel} gehört zu ${vorlage.name}`}
                    />
                  )}
                  <button className="es-dok-knopf" aria-expanded={auf} aria-controls={`${kid}-editor`} onClick={() => setOffen(auf ? null : k.id)}>
                    <span className="es-dok-symbol">
                      <Symbol name={art.symbol} />
                    </span>
                    <span className="es-dok-text">
                      <strong>{k.titel}</strong>
                      <span className="es-dok-unter">{herkunft(k)}</span>
                    </span>
                    <span className="es-dok-chips">
                      {inVorlagen.map((v) => (
                        <span key={v.id} className="es-chip">
                          {v.name}
                        </span>
                      ))}
                      {hatBedingung(k.bedingung) && (
                        <span className="es-chip bedingt" title={`Nur erforderlich, wenn ${bedingungText(k.bedingung)}`}>
                          nur wenn …
                        </span>
                      )}
                    </span>
                    <Symbol name={auf ? 'pfeilUnten' : 'pfeilRechts'} />
                  </button>
                </div>
                {auf && (
                  <div className="es-dok-editor" id={`${kid}-editor`} role="group" aria-label={`Angaben zu ${k.titel}`}>
                    <div className="es-raster">
                      <label className="es-breit">
                        <span className="field-label">Bezeichnung</span>
                        <input value={k.titel} autoFocus={neu === k.id} onFocus={(x) => neu === k.id && x.target.select()} onChange={(x) => setzen(k.id, { titel: x.target.value })} />
                      </label>
                      <fieldset className="es-breit es-dok-arten">
                        <legend className="field-label">Art</legend>
                        {ARTEN.map((a) => (
                          <label key={a.art} className={`es-dok-art${k.art === a.art ? ' gewaehlt' : ''}`}>
                            <input type="radio" name={`${kid}-art`} checked={k.art === a.art} onChange={() => setzen(k.id, { art: a.art })} />
                            <span>
                              <strong>{a.titel}</strong>
                              <span className="field-hint">{a.text}</span>
                            </span>
                          </label>
                        ))}
                      </fieldset>
                      {k.art === 'intern' ? (
                        <label className="es-breit">
                          <span className="field-label">Formular (Teil des Namens oder Kennung)</span>
                          <input value={k.formular ?? ''} placeholder={k.titel} onChange={(x) => setzen(k.id, { formular: x.target.value })} aria-describedby={`${kid}-formular-hinweis`} />
                          <span className="field-hint" id={`${kid}-formular-hinweis`}>
                            Leer: die Bezeichnung. Gefunden wird das Formular des Projekts, dessen Name das enthält (oder mit dieser Kennung, z. B. nw010005).
                          </span>
                        </label>
                      ) : (
                        <>
                          <label>
                            <span className="field-label">Ordner der Quelle (im Projektordner)</span>
                            <input value={k.quelle ?? ''} placeholder={quelleVorgabe(k)} onChange={(x) => setzen(k.id, { quelle: x.target.value })} aria-describedby={`${kid}-quelle-hinweis`} />
                            <span className="field-hint" id={`${kid}-quelle-hinweis`}>
                              Relativ zum Projektordner; leer: {quelleVorgabe(k)}.
                            </span>
                          </label>
                          <label>
                            <span className="field-label">Muster des Dateinamens</span>
                            <input
                              value={k.muster ?? ''}
                              placeholder={k.art === 'plansatz' ? 'alle Pläne mit Plannummer' : `*${k.titel}*`}
                              onChange={(x) => setzen(k.id, { muster: x.target.value })}
                              aria-describedby={`${kid}-muster-hinweis`}
                            />
                            <span className="field-hint" id={`${kid}-muster-hinweis`}>
                              * und ? als Platzhalter, mehrere mit „;“; leer: {k.art === 'plansatz' ? 'alle Pläne mit Plannummer' : `*${k.titel}*`}.
                            </span>
                          </label>
                        </>
                      )}
                      <fieldset className="es-breit es-dok-vorlagen">
                        <legend className="field-label">Gehört zu den Vorlagen</legend>
                        {vorlagen.length ? (
                          vorlagen.map((v) => (
                            <label key={v.id}>
                              <input type="checkbox" checked={v.dokumente.includes(k.id)} onChange={(x) => inVorlage(v, k.id, x.target.checked)} /> {v.name}
                            </label>
                          ))
                        ) : (
                          <span className="field-hint">Noch keine Vorlagen – oben anlegen.</span>
                        )}
                      </fieldset>
                      <div className="es-breit es-dok-bedingung">
                        <span className="field-label">Erforderlich</span>
                        <span className="field-hint">{hatBedingung(k.bedingung) ? `nur, wenn ${bedingungText(k.bedingung)}` : 'immer – mit einer Bedingung nur, wenn Antragsmerkmale zutreffen'}</span>
                        <BedingungEditor wert={k.bedingung} merkmale={merkmale} onChange={(b) => setzen(k.id, { bedingung: b })} />
                      </div>
                    </div>
                    <div className="es-zeile es-dok-fuss">
                      <button className="small gefahr" onClick={() => void entfernen(k)}>
                        <Symbol name="muell" /> Dokument entfernen …
                      </button>
                      <button className="small" onClick={() => setOffen(null)}>
                        Schließen
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="es-zeile">
          <button onClick={hinzufuegen}>
            <Symbol name="plus" /> Dokument hinzufügen
          </button>
          {JSON.stringify(katalog) !== JSON.stringify(VORGABE_KATALOG) && <button onClick={() => void katalogVorgabe()}>Vorgabe wiederherstellen</button>}
        </div>
      </Karte>
    </>
  );
}
