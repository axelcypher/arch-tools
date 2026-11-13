import type { ReactNode } from 'react';
import { Fragment, useState } from 'react';
import type { AntragsVorlage, KatalogEintrag } from '../antrag';
import { VORGABE_MERKMALE, bedingungText, hatBedingung, istVorgabeMerkmal } from '../bedingung';
import { BedingungEditor } from './BedingungEditor';
import { ART_HINWEIS, vorlageArtWarnung, PLATZHALTER, VORGABE_EXPORT, VORGABE_VORLAGEN, dateiname, verschieben, vorlagenAus, vorlageMitAntragsart, PLANSATZ_QUELLE } from '../antrag';
import { Griff, useSortieren } from './Sortieren';
import { namensschemaVon, useAntrag } from '../antragStore';
import { useFormulare } from '../store';
import { waehleOrdner } from '../dateisystem';
import { Symbol } from './Symbol';

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
 * Einstellungen für Antrag und Export: wo die Anträge im Projektordner liegen, welche Antragsarten es gibt, wie
 * exportierte PDFs heißen und wohin sie kommen, und die grundlegende Liste der Antragsdokumente. Alles gilt für
 * alle Projekte; Abweichungen je Projekt stehen in der Projektkarte unter „Antragsumfang“.
 */
export function AntragEinstellungen() {
  const e = useAntrag((s) => s.einstellungen);
  const katalog = useAntrag((s) => s.katalog);
  const merkmale = useAntrag((s) => s.merkmalDefinitionen);
  const vorlagen = useAntrag((s) => s.vorlagen);
  const { setEinstellungen, setKatalog, setMerkmalDefinitionen, setVorlagen } = useAntrag.getState();
  const katalogSort = useSortieren(katalog.length, (von, nach) => setKatalog(verschieben(katalog, von, nach)));
  const merkmalSort = useSortieren(merkmale.length, (von, nach) => setMerkmalDefinitionen(verschieben(merkmale, von, nach)));
  const vorlagenSort = useSortieren(vorlagen.length, (von, nach) => setVorlagen(verschieben(vorlagen, von, nach)));
  const vorlageSetzen = (id: string, teil: Partial<AntragsVorlage>) => setVorlagen(vorlagen.map((v) => (v.id === id ? { ...v, ...teil } : v)));
  const inVorlage = (v: AntragsVorlage, kid: string, an: boolean) => vorlageSetzen(v.id, { dokumente: an ? [...v.dokumente.filter((d) => d !== kid), kid] : v.dokumente.filter((d) => d !== kid) });
  const [bedingungOffen, setBedingungOffen] = useState<string | null>(null);
  // beim Export steht an der Stelle der Antragsart immer {Art} (nach dem Namensschema)
  const reihenfolge = useFormulare((s) => namensschemaVon(s).reihenfolge);
  const wirksameVorlage = vorlageMitAntragsart(e.namensvorlage, reihenfolge);
  const artWarnung = vorlageArtWarnung(e.namensvorlage, reihenfolge);
  const beispiel = dateiname(wirksameVorlage, { kuerzel: 'BS9', phase: e.phase, datum: new Date(), nr: '01', name: 'Bauantrag', antrag: `${e.arten[0]} 2`, art: e.arten[0], kennung: 'nw010005', stand: '2026A' });

  const zeileSetzen = (i: number, teil: Partial<KatalogEintrag>) => setKatalog(katalog.map((k, n) => (n === i ? { ...k, ...teil } : k)));

  return (
    <>
      <h2>Antrag & Export</h2>
      <p className="muted">
        Ausgefüllte Formulare lassen sich als PDF exportieren – in den Ordner der aktiven Antragsfassung (z. B. <code>TÖB\BAUA 2</code>) oder an jeden anderen Ort. Was zu einem
        Antrag gehört, wird je Projekt in der Projektkarte unter „Antragsumfang“ ausgewählt; daran prüft die App, ob alles vollständig und aktuell vorliegt. Abweichungen je
        Projekt lassen sich dort ebenfalls einstellen.
      </p>

      <Karte titel="Anträge im Projektordner" text="Ordner der Anträge relativ zum Projektordner, darin je Antragsfassung ein Ordner: BAUA, BAUA 2 (oder BAUA2) …">
        <div className="es-raster">
          <label>
            <span className="field-label">Antragsordner</span>
            <input value={e.antragsordner} onChange={(x) => setEinstellungen({ antragsordner: x.target.value })} aria-label="Antragsordner" placeholder="TÖB" />
          </label>
          <label>
            <span className="field-label">Antragsarten (die erste ist der Standard)</span>
            <input
              defaultValue={e.arten.join(', ')}
              key={e.arten.join(',')}
              aria-label="Antragsarten"
              aria-describedby="es-arten-hinweis"
              placeholder="BAUA, BAUVA, DENK"
              onBlur={(x) => setEinstellungen({ arten: x.target.value.split(/[,;\s]+/).filter(Boolean).map((a) => a.toUpperCase()) })}
            />
            <span className="field-hint" id="es-arten-hinweis">
              Dazu kommen die Antragsarten aus Projektordner › Einstellungen › Namensschema: Kürzel und Plannummern.
            </span>
          </label>
        </div>
      </Karte>

      <Karte titel="Dateiname exportierter PDFs" text={<>Beispiel: <strong>{beispiel}.pdf</strong></>}>
        <div className="es-raster">
          {/* wie im Export des Projekts: Feld, darunter Hinweis und ggf. Warnung */}
          <div className="es-breit es-feldblock">
            <label>
              <span className="field-label">Namensvorlage</span>
              <input
                value={e.namensvorlage}
                onChange={(x) => setEinstellungen({ namensvorlage: x.target.value })}
                aria-label="Namensvorlage"
                aria-describedby={artWarnung ? 'es-art-hinweis es-art-warnung' : 'es-art-hinweis'}
                spellCheck={false}
              />
            </label>
            <p className="field-hint" id="es-art-hinweis">
              {ART_HINWEIS}
            </p>
            {artWarnung && (
              <p className="warning small-text">
                <span id="es-art-warnung">{artWarnung}</span>{' '}
                <button className="small" onClick={() => setEinstellungen({ namensvorlage: wirksameVorlage })}>
                  Vorlage anpassen
                </button>
              </p>
            )}
          </div>
          <label>
            <span className="field-label">Phase</span>
            <input value={e.phase} list="es-phasen" onChange={(x) => setEinstellungen({ phase: x.target.value })} aria-label="Phase" aria-describedby="es-phase-hinweis" />
            <datalist id="es-phasen">
              {['BP', 'EP', 'GP', 'AP'].map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            <span className="field-hint" id="es-phase-hinweis">
              wird für den Platzhalter {'{Phase}'} eingesetzt
            </span>
          </label>
        </div>
        <div className="es-platzhalter">
          {PLATZHALTER.map((p) => (
            <button key={p.name} className="small" title={p.text} onClick={() => setEinstellungen({ namensvorlage: `${e.namensvorlage} ${p.name}`.trim() })}>
              {p.name}
            </button>
          ))}
          {e.namensvorlage !== VORGABE_EXPORT.namensvorlage && (
            <button className="small" onClick={() => setEinstellungen({ namensvorlage: VORGABE_EXPORT.namensvorlage })}>
              Vorgabe
            </button>
          )}
        </div>
        {!/^\{k(ü|ue)rzel\}\s+\{art\}\s+\{datum\}\s/i.test(e.namensvorlage.trim()) && (
          <p className="warning small-text">
            Dateien im Antragsordner müssen mit „Projektcode Antragsart JJMMTT“ beginnen, sonst lassen sie sich nicht als bereit markieren – die Vorlage sollte mit „{'{Kürzel} {Art} {Datum}'}“
            beginnen.
          </p>
        )}
      </Karte>

      <Karte titel="Ziel des Exports" text="Der voreingestellte Ordner im Export-Dialog; dort lässt sich jedes Mal auch ein anderer Ordner im Projekt wählen oder „Speichern unter …“.">
        <label className="radio-row">
          <input type="radio" checked={e.ziel === 'aktiv'} onChange={() => setEinstellungen({ ziel: 'aktiv' })} />
          <span>
            <strong>Aktive Antragsfassung</strong> <span className="muted small-text">– {e.antragsordner || 'TÖB'}\{e.arten[0]} bzw. die oben links am Projekt gewählte Fassung</span>
          </span>
        </label>
        <label className="radio-row">
          <input type="radio" checked={e.ziel === 'pfad'} onChange={() => setEinstellungen({ ziel: 'pfad' })} />
          <span className="es-breit">
            <strong>Fester Ordner im Projekt</strong>
            <input value={e.zielpfad} disabled={e.ziel !== 'pfad'} onChange={(x) => setEinstellungen({ zielpfad: x.target.value })} aria-label="Fester Zielordner" placeholder="z. B. TÖB/{Antrag}/Formulare" />
          </span>
        </label>
      </Karte>

      <Karte titel="Quellen und Vorlagen">
        <div className="es-raster">
          <label>
            <span className="field-label">Berechnungen im Projektordner</span>
            <input value={e.berechnungsordner} onChange={(x) => setEinstellungen({ berechnungsordner: x.target.value })} aria-label="Berechnungsordner" placeholder="Planung/Berechnungen" />
          </label>
          <label>
            <span className="field-label">Vorlagen für neue Formulare (leere Formulare)</span>
            <span className="es-zeile">
              <input value={e.vorlagenordner} onChange={(x) => setEinstellungen({ vorlagenordner: x.target.value })} aria-label="Vorlagenordner" placeholder="leer = aus anderen Projekten" />
              <button
                onClick={async () => {
                  const p = await waehleOrdner('Ordner mit leeren Formularen');
                  if (p) setEinstellungen({ vorlagenordner: p });
                }}
              >
                …
              </button>
            </span>
          </label>
        </div>
        <p className="muted small-text">
          Fehlt ein Formular des Antragsumfangs, legt ein Klick darauf es an: aus dem Vorlagenordner oder – ohne Vorlagenordner – als Kopie des neuesten passenden Formulars aus
          einem anderen Projekt, mit geleerten Eingaben.
        </p>
      </Karte>

      <Karte
        titel="Antragsmerkmale"
        text="Merkmale eines Antrags, von denen Formularteile und Dokumente abhängen können (z. B. Gebäudeklasse). Jeder Antrag hat seine eigenen Werte (im Antragsumfang gewählt); ein neuer Antrag übernimmt einmalig die Vorgabe – spätere Änderungen hier ändern bestehende Anträge nicht. Bedingungen stellst du in der Gliederung (Anpassen) und im Katalog ein."
      >
        <table className="es-tabelle es-katalog" data-sortier-liste="">
          <thead>
            <tr>
              <th />
              <th>Merkmal</th>
              <th>Mögliche Werte (mit Komma getrennt)</th>
              <th>Vorgabe für neue Anträge</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {merkmale.map((m, i) => (
              <tr key={i} {...merkmalSort.zeile(i)}>
                <td className="es-griff">
                  <Griff {...merkmalSort.griff(i, m.name)} />
                </td>
                <td>
                  <input
                    value={m.name}
                    aria-label="Merkmal"
                    readOnly={istVorgabeMerkmal(m.name)}
                    title={istVorgabeMerkmal(m.name) ? 'Merkmal der App – die Vorgaben der Formulare bauen darauf auf' : undefined}
                    onChange={(x) => setMerkmalDefinitionen(merkmale.map((y, n) => (n === i ? { ...y, name: x.target.value } : y)))}
                  />
                </td>
                <td>
                  <input
                    defaultValue={m.werte.join(', ')}
                    key={m.werte.join(',')}
                    aria-label={`Werte von ${m.name}`}
                    onBlur={(x) => setMerkmalDefinitionen(merkmale.map((y, n) => (n === i ? { ...y, werte: x.target.value.split(',').map((w) => w.trim()).filter(Boolean) } : y)))}
                  />
                </td>
                <td>
                  <select
                    value={m.vorgabe && m.werte.includes(m.vorgabe) ? m.vorgabe : ''}
                    aria-label={`Vorgabe von ${m.name}`}
                    onChange={(x) => setMerkmalDefinitionen(merkmale.map((y, n) => (n === i ? { ...y, vorgabe: x.target.value || undefined } : y)))}
                  >
                    <option value="">– leer –</option>
                    {m.werte.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button
                    className="icon"
                    aria-label={`${m.name} entfernen`}
                    title={istVorgabeMerkmal(m.name) ? 'Merkmal der App – bleibt' : 'Entfernen'}
                    disabled={istVorgabeMerkmal(m.name)}
                    onClick={() => setMerkmalDefinitionen(merkmale.filter((_, n) => n !== i))}
                  >
                    <Symbol name="muell" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="es-zeile">
          <button onClick={() => setMerkmalDefinitionen([...merkmale, { name: 'Neues Merkmal', werte: ['ja', 'nein'] }])}>
            <Symbol name="plus" /> Merkmal hinzufügen
          </button>
          {JSON.stringify(merkmale) !== JSON.stringify(VORGABE_MERKMALE) && <button onClick={() => setMerkmalDefinitionen(null)}>Vorgabe wiederherstellen</button>}
        </div>
      </Karte>

      <Karte
        titel="Antragsvorlagen"
        text="Zusammenstellungen der Antragsdokumente je Art von Antrag. Beim Festlegen des Antragsumfangs wird die Vorlage zur Antragsart der aktiven Fassung vorgeschlagen (z. B. BAUA → Bauantrag). Welche Dokumente dazugehören, kreuzt du unten im Katalog in der Spalte der Vorlage an; die Reihenfolge ist die des Katalogs."
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
                <td className="muted small-text">{katalog.filter((k) => v.dokumente.includes(k.id)).length} Dokumente</td>
                <td>
                  <button className="icon" aria-label={`${v.name} entfernen`} title="Entfernen" onClick={() => setVorlagen(vorlagen.filter((x) => x.id !== v.id))}>
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
            <button onClick={() => setVorlagen(null)}>Vorgabe wiederherstellen</button>
          )}
        </div>
      </Karte>

      <Karte
        titel="Antragsdokumente (Katalog)"
        text="Alle Dokumente, die in einem Antrag vorkommen können – je Vorlage angekreuzt, was dazugehört; die übrigen lassen sich je Projekt hinzunehmen. Intern: Formular des Projekts (Teil des Namens oder Kennung). Extern: Datei aus dem Projektordner (Ordner der Quelle und Muster mit * und ?, mehrere mit „;“). Die Reihenfolge gilt auch für den Antragsumfang."
      >
        <table className="es-tabelle es-katalog" data-sortier-liste="">
          <thead>
            <tr>
              <th />
              <th>Dokument</th>
              <th>Art</th>
              <th>Formular / Quelle</th>
              <th>Muster der Datei</th>
              {vorlagen.map((v) => (
                <th key={v.id} className="es-vorlage-spalte" title={`gehört zur Vorlage „${v.name}“`}>
                  {v.name}
                </th>
              ))}
              <th title="nur erforderlich, wenn die Antragsmerkmale zutreffen">Nur wenn</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {katalog.map((k, i) => (
              <Fragment key={k.id}>
                <tr {...katalogSort.zeile(i)}>
                  <td className="es-griff">
                    <Griff {...katalogSort.griff(i, k.titel)} />
                  </td>
                  <td>
                    <input value={k.titel} onChange={(x) => zeileSetzen(i, { titel: x.target.value })} aria-label="Dokument" />
                  </td>
                  <td>
                    <select value={k.art} onChange={(x) => zeileSetzen(i, { art: x.target.value as KatalogEintrag['art'] })} aria-label="Art">
                      <option value="intern">intern (Formular)</option>
                      <option value="extern">extern (Datei)</option>
                      <option value="plansatz">Plansatz (Pläne GP-01 …)</option>
                    </select>
                  </td>
                  <td>
                    {k.art === 'intern' ? (
                      <input value={k.formular ?? ''} placeholder={k.titel} onChange={(x) => zeileSetzen(i, { formular: x.target.value })} aria-label="Formular" />
                    ) : (
                      <input value={k.quelle ?? ''} placeholder={k.art === 'plansatz' ? PLANSATZ_QUELLE : e.berechnungsordner} onChange={(x) => zeileSetzen(i, { quelle: x.target.value })} aria-label="Quelle" />
                    )}
                  </td>
                  <td>
                    <input value={k.muster ?? ''} placeholder={k.art === 'plansatz' ? 'alle Pläne mit Plannummer' : `*${k.titel}*`} onChange={(x) => zeileSetzen(i, { muster: x.target.value })} aria-label="Muster" />
                  </td>
                  {vorlagen.map((v) => (
                    <td key={v.id} className="es-mitte">
                      <input type="checkbox" checked={v.dokumente.includes(k.id)} onChange={(x) => inVorlage(v, k.id, x.target.checked)} aria-label={`${k.titel} in ${v.name}`} />
                    </td>
                  ))}
                  <td>
                    <button
                      className={`small es-bedingung${hatBedingung(k.bedingung) ? ' gesetzt' : ''}`}
                      aria-label={`Bedingung für ${k.titel}`}
                      title={hatBedingung(k.bedingung) ? `Nur erforderlich, wenn ${bedingungText(k.bedingung)}` : 'Immer erforderlich – klicken für eine Bedingung'}
                      onClick={() => setBedingungOffen(bedingungOffen === k.id ? null : k.id)}
                    >
                      {hatBedingung(k.bedingung) ? bedingungText(k.bedingung) : 'immer'}
                    </button>
                  </td>
                  <td>
                    <button className="icon" aria-label={`${k.titel} entfernen`} title="Entfernen" onClick={() => setKatalog(katalog.filter((_, n) => n !== i))}>
                      <Symbol name="muell" />
                    </button>
                  </td>
                </tr>
                {bedingungOffen === k.id && (
                  <tr className="es-bedingung-zeile">
                    <td colSpan={7 + vorlagen.length}>
                      <BedingungEditor wert={k.bedingung} merkmale={merkmale} onChange={(b) => zeileSetzen(i, { bedingung: b })} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        <div className="es-zeile">
          <button onClick={() => setKatalog([...katalog, { id: `k${Date.now().toString(36)}`, titel: 'Neues Dokument', art: 'extern', vorgewaehlt: false }])}>
            <Symbol name="plus" /> Dokument hinzufügen
          </button>
          <button onClick={() => setKatalog(null)}>Vorgabe wiederherstellen</button>
        </div>
      </Karte>
    </>
  );
}
