import type { KeyboardEvent } from 'react';
import { useEffect, useId, useState } from 'react';
import { bestaetigen } from '@core/ui/Rueckfrage';
import type { AntragsVorlage, KatalogEintrag } from '../antrag';
import { PLANSATZ_QUELLE, VORGABE_KATALOG, VORGABE_VORLAGEN, verschieben, vorlagenAus } from '../antrag';
import { bedingungText, hatBedingung } from '../bedingung';
import { useAntrag } from '../antragStore';
import { BedingungEditor } from './BedingungEditor';
import { Karte } from './EinstellungsKarte';
import { Griff, useSortieren } from './Sortieren';
import type { SymbolName } from '@core/ui/Symbol';
import { Symbol } from '@core/ui/Symbol';

/** Art eines Dokuments: Bezeichnung und Erklärung (Auswahl im Editor) */
const ARTEN: { art: KatalogEintrag['art']; titel: string; text: string; symbol: SymbolName }[] = [
  { art: 'intern', titel: 'Formular des Projekts', text: 'ein Formular aus dem Formularprojekt, z. B. Bauantrag', symbol: 'formular' },
  { art: 'extern', titel: 'Datei aus dem Projektordner', text: 'z. B. Berechnung, Gutachten, fremde PDF', symbol: 'datei' },
  { art: 'plansatz', titel: 'Plansatz', text: 'alle Pläne mit Plannummer (GP-01 …), geprüft auf Lücken', symbol: 'stapel' },
];

const dokumenteText = (n: number) => `${n} ${n === 1 ? 'Dokument' : 'Dokumente'}`;

/** Kurzbeschreibung eines Formulars: was gesucht wird („Statisti“ ist ein Teil des Namens, nw010005 eine Kennung) */
function formularText(k: KatalogEintrag): string {
  const f = k.formular?.trim();
  if (!f || f === k.titel) return 'Formular des Projekts';
  return /^[a-z]{2}\d{6}$/i.test(f) ? `Formular mit Kennung ${f}` : `Formular mit „${f}“ im Namen`;
}

/**
 * Fokus auf ein Element, sonst das nächste (falls es nicht mehr da ist). `body` zählt nicht – in WKWebView (macOS)
 * bekommt ein angeklickter Knopf keinen Fokus, dann greift das nächste Ziel (eine feste Id).
 */
function fokussieren(...ziele: (HTMLElement | string | null | undefined)[]) {
  for (const z of ziele) {
    const el = typeof z === 'string' ? document.getElementById(z) : z;
    if (el?.isConnected && el !== document.body) {
      el.focus();
      return;
    }
  }
}

/**
 * Einstellungen „Antragsvorlagen“ und „Antragsdokumente“: Die Dokumente stehen als Liste mit Kurzbeschreibung; ein
 * Klick öffnet ihre Angaben als beschriftetes Formular (Bezeichnung, Art, Formular bzw. Quelle und Muster, Vorlagen,
 * Bedingung). Welche Dokumente zu einer Vorlage gehören, wird mit der Auswahl „Vorlage zusammenstellen“ über der Liste
 * angekreuzt.
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
  // geöffnetes Dokument, eben angelegtes (Bezeichnung bekommt einmal den Fokus), gewählte Vorlage der Liste
  const [offen, setOffen] = useState<string | null>(null);
  const [neu, setNeu] = useState<string | null>(null);
  const [vorlageId, setVorlageId] = useState('');
  // nach dem nächsten Rendern zu fokussieren (Ids; das erste, das es gibt), z. B. nach „Schließen“ die Zeile
  const [fokus, setFokus] = useState<string[] | null>(null);
  useEffect(() => {
    if (!fokus) return;
    fokussieren(...fokus);
    setFokus(null);
  }, [fokus]);
  const vorlage = vorlagen.find((v) => v.id === vorlageId);
  const dokId = (kid: string) => `${id}-${kid}`;
  const knopfId = (kid: string) => `${dokId(kid)}-knopf`;
  const hinzufuegenId = `${id}-hinzufuegen`;
  const vorlageNeuId = `${id}-vorlage-neu`;
  const vorlageWahlId = `${id}-vorlage`;

  const vorlageSetzen = (vid: string, teil: Partial<AntragsVorlage>) => setVorlagen(vorlagen.map((v) => (v.id === vid ? { ...v, ...teil } : v)));
  const inVorlage = (v: AntragsVorlage, kid: string, an: boolean) => vorlageSetzen(v.id, { dokumente: an ? [...v.dokumente.filter((d) => d !== kid), kid] : v.dokumente.filter((d) => d !== kid) });
  const setzen = (kid: string, teil: Partial<KatalogEintrag>) => setKatalog(katalog.map((k) => (k.id === kid ? { ...k, ...teil } : k)));
  const quelleVorgabe = (k: KatalogEintrag) => (k.art === 'plansatz' ? PLANSATZ_QUELLE : e.berechnungsordner);
  const musterVorgabe = (k: KatalogEintrag) => (k.art === 'plansatz' ? 'alle Pläne mit Plannummer' : `*${k.titel}*`);
  // Kurzbeschreibung in der Zeile: woher das Dokument kommt
  const herkunft = (k: KatalogEintrag) => (k.art === 'intern' ? formularText(k) : `${k.art === 'plansatz' ? 'Pläne' : 'Datei'} aus ${k.quelle || quelleVorgabe(k)}${k.muster ? ` · ${k.muster}` : ''}`);

  const schliessen = (kid: string) => {
    setOffen(null);
    setFokus([knopfId(kid)]);
  };
  // Esc in den Angaben schließt nur die Angaben (nicht die ganzen Einstellungen)
  const escInAngaben = (kid: string) => (x: KeyboardEvent) => {
    if (x.key !== 'Escape' || x.defaultPrevented) return;
    x.preventDefault();
    schliessen(kid);
  };
  const hinzufuegen = () => {
    const kid = `k${Date.now().toString(36)}`;
    setKatalog([...katalog, { id: kid, titel: 'Neues Dokument', art: 'extern', vorgewaehlt: false }]);
    // ist eine Vorlage gewählt, gehört das neue Dokument gleich dazu
    if (vorlage) inVorlage(vorlage, kid, true);
    setOffen(kid);
    setNeu(kid);
  };
  const entfernen = async (k: KatalogEintrag) => {
    const ausloeser = document.activeElement as HTMLElement | null;
    if (!(await bestaetigen('Dokument entfernen', `„${k.titel}“ aus den Antragsdokumenten entfernen? In Projekten, die es im Antragsumfang haben, bleibt es dort.`, 'Entfernen', true))) {
      fokussieren(ausloeser, `${dokId(k.id)}-entfernen`);
      return;
    }
    const { katalog: jetzt, vorlagen: vorlagenJetzt } = useAntrag.getState();
    const i = jetzt.findIndex((x) => x.id === k.id);
    const rest = jetzt.filter((x) => x.id !== k.id);
    setKatalog(rest);
    if (vorlagenJetzt.some((v) => v.dokumente.includes(k.id))) setVorlagen(vorlagenJetzt.map((v) => ({ ...v, dokumente: v.dokumente.filter((d) => d !== k.id) })));
    setOffen(null);
    // Fokus auf das Dokument, das nun an seiner Stelle steht (sonst das davor), ohne Dokumente auf „Dokument hinzufügen“
    const naechstes = rest[Math.min(i, rest.length - 1)];
    setFokus([...(naechstes ? [knopfId(naechstes.id)] : []), hinzufuegenId]);
  };
  const vorlageEntfernen = async (v: AntragsVorlage) => {
    const ausloeser = document.activeElement as HTMLElement | null;
    if (!(await bestaetigen('Vorlage entfernen', `Die Vorlage „${v.name}“ entfernen? Die Antragsdokumente selbst bleiben erhalten.`, 'Entfernen', true))) {
      fokussieren(ausloeser, `${id}-vorlage-${v.id}-entfernen`);
      return;
    }
    setVorlagen(useAntrag.getState().vorlagen.filter((x) => x.id !== v.id));
    setVorlageId((jetzt) => (jetzt === v.id ? '' : jetzt));
    setFokus([vorlageNeuId]);
  };
  const katalogVorgabe = async () => {
    const ausloeser = document.activeElement as HTMLElement | null;
    if (
      !(await bestaetigen('Vorgabe wiederherstellen', 'Die Antragsdokumente auf die Vorgabe zurücksetzen? Eigene Dokumente und Änderungen gehen verloren; die Vorlagen bleiben.', 'Zurücksetzen', true))
    ) {
      fokussieren(ausloeser, `${id}-katalog-vorgabe`);
      return;
    }
    // die Vorlagen bleiben: auch solche, die (noch nie gespeichert) aus dem Katalog abgeleitet sind – festschreiben, wenn
    // sie sonst nach dem Zurücksetzen anders abgeleitet würden
    const vorlagenJetzt = useAntrag.getState().vorlagen;
    if (JSON.stringify(vorlagenJetzt) !== JSON.stringify(vorlagenAus(null, VORGABE_KATALOG))) setVorlagen(vorlagenJetzt);
    setKatalog(null);
    setOffen(null);
    setFokus([hinzufuegenId]);
  };
  const vorlagenVorgabe = async () => {
    const ausloeser = document.activeElement as HTMLElement | null;
    if (!(await bestaetigen('Vorgabe wiederherstellen', 'Die Antragsvorlagen auf die Vorgabe zurücksetzen? Eigene Vorlagen und Zuordnungen gehen verloren.', 'Zurücksetzen', true))) {
      fokussieren(ausloeser, `${id}-vorlagen-vorgabe`);
      return;
    }
    setVorlagen(null);
    setVorlageId('');
    setFokus([vorlageNeuId]);
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
            {vorlagen.map((v, i) => {
              const n = katalog.filter((k) => v.dokumente.includes(k.id)).length;
              return (
                <tr key={v.id} {...vorlagenSort.zeile(i)}>
                  <td className="es-griff">
                    <Griff {...vorlagenSort.griff(i, `Vorlage ${v.name}`)} />
                  </td>
                  <td>
                    <input value={v.name} aria-label="Name der Vorlage" onChange={(x) => vorlageSetzen(v.id, { name: x.target.value })} />
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
                      aria-label={`${dokumenteText(n)} – Dokumente der Vorlage ${v.name} ankreuzen`}
                      title={`Unten die Dokumente der Vorlage „${v.name}“ zeigen und ankreuzen`}
                      onClick={() => {
                        setVorlageId(v.id);
                        document.getElementById(`${id}-dokumente`)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
                        document.getElementById(vorlageWahlId)?.focus({ preventScroll: true });
                      }}
                    >
                      {dokumenteText(n)}
                    </button>
                  </td>
                  <td>
                    <button id={`${id}-vorlage-${v.id}-entfernen`} className="icon" aria-label={`Vorlage ${v.name} entfernen`} title="Entfernen" onClick={() => void vorlageEntfernen(v)}>
                      <Symbol name="muell" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="es-zeile">
          <button id={vorlageNeuId} onClick={() => setVorlagen([...vorlagen, { id: `v${Date.now().toString(36)}`, name: 'Neue Vorlage', dokumente: [] }])}>
            <Symbol name="plus" /> Vorlage hinzufügen
          </button>
          {JSON.stringify(vorlagen) !== JSON.stringify(vorlagenAus(null, katalog)) && JSON.stringify(vorlagen) !== JSON.stringify(VORGABE_VORLAGEN) && (
            <button id={`${id}-vorlagen-vorgabe`} onClick={() => void vorlagenVorgabe()}>
              Vorgabe wiederherstellen …
            </button>
          )}
        </div>
      </Karte>

      <Karte
        titel="Antragsdokumente"
        text="Alle Dokumente, die in einem Antrag vorkommen können; was nicht zur Vorlage gehört, lässt sich je Projekt hinzunehmen. Ein Klick auf ein Dokument öffnet seine Angaben. Die Reihenfolge (am Griff ziehen) gilt auch für den Antragsumfang."
      >
        <div className="es-dok-kopf" id={`${id}-dokumente`}>
          <label>
            <span className="field-label">Vorlage zusammenstellen</span>
            <select id={vorlageWahlId} value={vorlageId} onChange={(x) => setVorlageId(x.target.value)} aria-describedby={`${id}-vorlage-hinweis`}>
              <option value="">– keine –</option>
              {vorlagen.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <span className="field-hint" id={`${id}-vorlage-hinweis`} role="status">
            {vorlage && !katalog.length
              ? 'Noch keine Dokumente zum Ankreuzen.'
              : vorlage
                ? (() => {
                    const n = katalog.filter((k) => vorlage.dokumente.includes(k.id)).length;
                    return `${n} von ${katalog.length} Dokumenten ${n === 1 ? 'gehört' : 'gehören'} zu „${vorlage.name}“ – ankreuzen, was dazugehört.`;
                  })()
                : 'Eine Vorlage wählen, um anzukreuzen, welche Dokumente zu ihr gehören.'}
          </span>
        </div>
        {katalog.length ? (
          <ul className="es-dok-liste" data-sortier-liste="">
            {katalog.map((k, i) => {
              const auf = offen === k.id;
              const art = ARTEN.find((a) => a.art === k.art) ?? ARTEN[0];
              const inVorlagen = vorlagen.filter((v) => v.dokumente.includes(k.id));
              const kid = dokId(k.id);
              const info = [inVorlagen.length ? `Gehört zu: ${inVorlagen.map((v) => v.name).join(', ')}` : 'Gehört zu keiner Vorlage'];
              if (hatBedingung(k.bedingung)) info.push(`nur erforderlich, wenn ${bedingungText(k.bedingung)}`);
              return (
                <li key={k.id} className={`es-dok${auf ? ' offen' : ''}`} {...katalogSort.zeile(i)}>
                  <div className="es-dok-zeile">
                    <Griff {...katalogSort.griff(i, k.titel)} />
                    {vorlage && (
                      <label className="es-dok-haken" title={`Gehört zu „${vorlage.name}“`}>
                        <input
                          type="checkbox"
                          checked={vorlage.dokumente.includes(k.id)}
                          onChange={(x) => inVorlage(vorlage, k.id, x.target.checked)}
                          aria-label={`${k.titel} gehört zu ${vorlage.name}`}
                        />
                      </label>
                    )}
                    <button
                      id={knopfId(k.id)}
                      className="es-dok-knopf"
                      aria-expanded={auf}
                      aria-controls={auf ? `${kid}-editor` : undefined}
                      aria-describedby={`${kid}-info`}
                      onClick={() => setOffen(auf ? null : k.id)}
                    >
                      <span className="es-dok-symbol">
                        <Symbol name={art.symbol} />
                      </span>
                      <span className="es-dok-text">
                        <strong title={k.titel}>{k.titel}</strong>
                        <span className="es-dok-unter" title={herkunft(k)}>
                          {herkunft(k)}
                        </span>
                      </span>
                      <span className="es-dok-chips" aria-hidden="true">
                        {inVorlagen.map((v) => (
                          <span key={v.id} className="es-chip" title={v.name}>
                            {v.name}
                          </span>
                        ))}
                        {hatBedingung(k.bedingung) && (
                          <span className="es-chip bedingt" title={`Nur erforderlich, wenn ${bedingungText(k.bedingung)}`}>
                            nur wenn …
                          </span>
                        )}
                      </span>
                      <span id={`${kid}-info`} hidden>
                        {info.join('; ')}
                      </span>
                      <Symbol name={auf ? 'pfeilUnten' : 'pfeilRechts'} />
                    </button>
                  </div>
                  {auf && (
                    <div className="es-dok-editor" id={`${kid}-editor`} role="group" aria-label={`Angaben zu ${k.titel}`} onKeyDown={escInAngaben(k.id)}>
                      <label className="es-dok-feld">
                        <span className="field-label">Bezeichnung</span>
                        <input
                          value={k.titel}
                          autoFocus={neu === k.id}
                          onFocus={(x) => {
                            if (neu !== k.id) return;
                            x.target.select();
                            setNeu(null);
                          }}
                          onChange={(x) => setzen(k.id, { titel: x.target.value })}
                        />
                      </label>
                      <fieldset className="es-dok-gruppe">
                        <legend className="field-label">Art</legend>
                        <div className="es-dok-arten">
                          {ARTEN.map((a) => (
                            <label key={a.art} className={`es-dok-art${k.art === a.art ? ' gewaehlt' : ''}`}>
                              <input type="radio" name={`${kid}-art`} checked={k.art === a.art} onChange={() => setzen(k.id, { art: a.art })} />
                              <span>
                                <strong>{a.titel}</strong>
                                <span className="field-hint">{a.text}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      {k.art === 'intern' ? (
                        <label className="es-dok-feld">
                          <span className="field-label">Formular (Teil des Namens oder Kennung)</span>
                          <input value={k.formular ?? ''} placeholder={k.titel} onChange={(x) => setzen(k.id, { formular: x.target.value })} aria-describedby={`${kid}-formular-hinweis`} />
                          <span className="field-hint" id={`${kid}-formular-hinweis`}>
                            Leer: die Bezeichnung. Gefunden wird das Formular des Projekts, dessen Name das enthält (oder mit dieser Kennung, z. B. nw010005).
                          </span>
                        </label>
                      ) : (
                        <div className="es-dok-felder">
                          <label className="es-dok-feld">
                            <span className="field-label">Ordner der Quelle (im Projektordner)</span>
                            <input value={k.quelle ?? ''} placeholder={quelleVorgabe(k)} onChange={(x) => setzen(k.id, { quelle: x.target.value })} aria-describedby={`${kid}-quelle-hinweis`} />
                            <span className="field-hint" id={`${kid}-quelle-hinweis`}>
                              Ordner innerhalb des Projektordners; leer: {quelleVorgabe(k)}.
                            </span>
                          </label>
                          <label className="es-dok-feld">
                            <span className="field-label">Muster des Dateinamens</span>
                            <input value={k.muster ?? ''} placeholder={musterVorgabe(k)} onChange={(x) => setzen(k.id, { muster: x.target.value })} aria-describedby={`${kid}-muster-hinweis`} />
                            <span className="field-hint" id={`${kid}-muster-hinweis`}>
                              * steht für beliebige Zeichen, ? für genau eines; mehrere Muster mit „;“ trennen. Leer: {musterVorgabe(k)}.
                            </span>
                          </label>
                        </div>
                      )}
                      <fieldset className="es-dok-gruppe">
                        <legend className="field-label">Gehört zu den Vorlagen</legend>
                        {vorlagen.length ? (
                          <div className="es-dok-vorlagen">
                            {vorlagen.map((v) => (
                              <label key={v.id}>
                                <input type="checkbox" checked={v.dokumente.includes(k.id)} onChange={(x) => inVorlage(v, k.id, x.target.checked)} /> {v.name}
                              </label>
                            ))}
                          </div>
                        ) : (
                          <span className="field-hint">Noch keine Vorlagen – oben anlegen.</span>
                        )}
                      </fieldset>
                      <div className="es-dok-gruppe" role="group" aria-labelledby={`${kid}-erforderlich`}>
                        <span className="field-label" id={`${kid}-erforderlich`}>
                          Erforderlich
                        </span>
                        <BedingungEditor wert={k.bedingung} merkmale={merkmale} onChange={(b) => setzen(k.id, { bedingung: b })} />
                      </div>
                      <div className="es-zeile es-dok-fuss">
                        <button id={`${kid}-entfernen`} className="small danger" onClick={() => void entfernen(k)}>
                          <Symbol name="muell" /> Dokument entfernen …
                        </button>
                        <button className="small" onClick={() => schliessen(k.id)}>
                          Schließen
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted small-text es-dok-leer">Noch keine Dokumente – „Dokument hinzufügen“ legt eins an.</p>
        )}
        <div className="es-zeile">
          <button id={hinzufuegenId} onClick={hinzufuegen}>
            <Symbol name="plus" /> Dokument hinzufügen
          </button>
          {JSON.stringify(katalog) !== JSON.stringify(VORGABE_KATALOG) && (
            <button id={`${id}-katalog-vorgabe`} onClick={() => void katalogVorgabe()}>
              Vorgabe wiederherstellen …
            </button>
          )}
        </div>
      </Karte>
    </>
  );
}
