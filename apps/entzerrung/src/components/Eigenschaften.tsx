import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { fmt2, fmt3, fmtPlain } from '@core/format';
import { logger } from '@core/platform/log';
import { Field, NumberField, TextField } from '@core/ui/fields';
import { entzerrung } from '../geo/ebene';
import type { Entzerrung, Ergebnis } from '../geo/ebene';
import { ausgabe, autoAufloesung, bereichVon, messwert } from '../geo/messen';
import { linseGueltig, schaetzeLinse } from '../geo/verzeichnung';
import { ECKEN, MESS_NAMEN } from '../model';
import type { Ebene, Foto, Methode } from '../model';
import { aktuell, mitEbene, mitFoto, useEntz } from '../store';
import type { Werkzeug } from '../store';
import { ExportDialog } from './ExportDialog';

const log = logger('eigenschaften');

export const WERKZEUG_NAMEN: Record<Werkzeug, string> = {
  auswahl: 'Auswahl',
  hilfslinie: 'Hilfslinie',
  ecken: 'Ecken setzen',
  passpunkt: 'Passpunkt setzen',
  waagerecht: 'Waagerechte',
  senkrecht: 'Senkrechte',
  mass: 'Bekanntes Maß',
  strecke: 'Strecke',
  linienzug: 'Linienzug',
  flaeche: 'Fläche',
  ausschnitt: 'Ausschnitt ziehen',
};

/** Knopf für ein Werkzeug; Name immer aus `WERKZEUG_NAMEN`, `anzahl` als Zusatz */
export function WerkzeugKnopf({ w, anzahl, title, primaer = false }: { w: Werkzeug; anzahl?: number; title?: string; primaer?: boolean }) {
  const aktiv = useEntz((s) => s.werkzeug === w);
  return (
    <button
      className={`${aktiv ? 'active' : ''}${primaer && !aktiv ? ' primary' : ''}`}
      aria-pressed={aktiv}
      title={title}
      onClick={() => useEntz.getState().setze({ werkzeug: aktiv ? 'auswahl' : w, entwurf: [] })}
    >
      {WERKZEUG_NAMEN[w]}
      {anzahl !== undefined && <span className="ef-zaehler"> ({anzahl})</span>}
    </button>
  );
}

/** Feld der eben gesetzten Zeile (Passpunkt, Maß) fokussieren; Enter übernimmt und gibt den Fokus an die Fläche zurück */
function useFokusFeld(liste: HTMLElement | null) {
  const fokus = useEntz((s) => s.fokus);
  useEffect(() => {
    if (!fokus || !liste) return;
    const feld = liste.querySelector<HTMLInputElement>(`[data-fokus="${fokus}"] input`);
    if (!feld) return;
    feld.focus();
    feld.select();
    useEntz.getState().setze({ fokus: null });
  }, [fokus, liste]);
}

/** Enter im Tabellenfeld: übernehmen und zurück zur Zeichenfläche */
const enterZurFlaeche = (e: ReactKeyboardEvent) => {
  if (e.key !== 'Enter') return;
  (e.target as HTMLElement).blur();
  document.querySelector<SVGSVGElement>('.ef-overlay')?.focus({ preventScroll: true });
};

/** Rechte Leiste */
export function Eigenschaften() {
  const doc = useEntz((s) => s.doc);
  const fotoId = useEntz((s) => s.fotoId);
  const ebeneId = useEntz((s) => s.ebeneId);
  const gewuenscht = useEntz((s) => s.ansicht);
  const { foto, ebene } = aktuell({ doc, fotoId, ebeneId });
  const ergebnis = useMemo(() => (foto && ebene ? entzerrung(foto, ebene) : null), [foto, ebene]);
  if (!foto || !ebene || !ergebnis) {
    return (
      <aside className="sidebar sidebar-right">
        <section>
          <h2>So geht es</h2>
          <ol className="ef-schritte small-text">
            <li>
              <strong>Foto</strong> einer ebenen Fläche hinzufügen (Fassade, Wand, Boden, abfotografierter Plan).
            </li>
            <li>
              <strong>Referenz</strong> festlegen: ein bekanntes Rechteck, Passpunkte aus dem Aufmaß oder Fluchtlinien mit zwei Maßen.
            </li>
            <li>
              <strong>Entzerrt</strong> ansehen und Strecken, Linienzüge und Flächen messen.
            </li>
            <li>
              <strong>Exportieren</strong> als Bild oder als PDF im Maßstab.
            </li>
          </ol>
        </section>
      </aside>
    );
  }
  const entzerrt = gewuenscht === 'entzerrt' && ergebnis.ok;
  return (
    <aside className="sidebar sidebar-right">
      {entzerrt && ergebnis.ok ? (
        <>
          <MessPanel foto={foto} ebene={ebene} e={ergebnis.e} />
          <BildPanel foto={foto} ebene={ebene} e={ergebnis.e} />
        </>
      ) : (
        <>
          <ReferenzPanel foto={foto} ebene={ebene} ergebnis={ergebnis} />
          <ObjektivPanel foto={foto} />
        </>
      )}
    </aside>
  );
}

// ---------- Referenz ----------

const METHODEN: { id: Methode; name: string; text: string }[] = [
  {
    id: 'rechteck',
    name: 'Rechteck',
    text: 'Vier Ecken eines bekannten Rechtecks in der Messebene (Öffnung an der Putzkante mit nachgemessenem Fertigmaß, Platte) mit Breite und Höhe.',
  },
  { id: 'passpunkte', name: 'Passpunkte', text: 'Mindestens vier Punkte mit Koordinaten aus dem Aufmaß; mehr Punkte gleichen aus und zeigen Restfehler.' },
  { id: 'fluchtlinien', name: 'Fluchtlinien', text: 'Je zwei waagerechte und senkrechte Kanten nachziehen und zwei bekannte Maße angeben.' },
];

function ReferenzPanel({ foto, ebene, ergebnis }: { foto: Foto; ebene: Ebene; ergebnis: Ergebnis }) {
  const s = useEntz.getState;
  const aendern = (f: (e: Ebene) => Ebene) => s().aendern(mitEbene(foto.id, ebene.id, f));
  const auswahl = useEntz((x) => x.auswahl);
  const [tabelle, setTabelle] = useState<HTMLTableElement | null>(null);
  useFokusFeld(tabelle);
  const rest = (id: string) => (ergebnis.ok ? ergebnis.e.residuen.find((r) => r.id === id) : undefined);
  const restText = (id: string) => {
    const r = rest(id);
    if (!r) return '';
    return r.einheit === 'm' ? `${fmt2(r.wert * 1000)} mm` : `${fmt2(r.wert)}°`;
  };

  return (
    <section>
      <h2>Referenz · {ebene.name}</h2>
      <div className="ef-methoden" role="group" aria-label="Art der Referenz">
        {METHODEN.map((m) => (
          <button key={m.id} className={ebene.methode === m.id ? 'active' : ''} aria-pressed={ebene.methode === m.id} title={m.text} onClick={() => aendern((e) => ({ ...e, methode: m.id }))}>
            {m.name}
          </button>
        ))}
      </div>
      <p className="muted small-text">{METHODEN.find((m) => m.id === ebene.methode)!.text}</p>

      {ebene.methode === 'rechteck' && (
        <>
          <div className="field-row">
            <Field label="Breite (m)">
              <NumberField value={ebene.rechteck.breite} min={0} digits={3} allowEmpty onChange={(v) => aendern((e) => ({ ...e, rechteck: { ...e.rechteck, breite: v } }))} />
            </Field>
            <Field label="Höhe (m)">
              <NumberField value={ebene.rechteck.hoehe} min={0} digits={3} allowEmpty onChange={(v) => aendern((e) => ({ ...e, rechteck: { ...e.rechteck, hoehe: v } }))} />
            </Field>
          </div>
          <p className="small-text">
            Ecken: {ebene.rechteck.ecken.length} von 4
            {ebene.rechteck.ecken.length < 4 && <span className="muted"> – als Nächstes {ECKEN[ebene.rechteck.ecken.length]}</span>}
          </p>
          <div className="button-row">
            {ebene.rechteck.ecken.length < 4 && <WerkzeugKnopf w="ecken" primaer title="Ecken der Reihe nach anklicken: links unten, rechts unten, rechts oben, links oben" />}
            {ebene.rechteck.ecken.length > 0 && (
              <button
                title="Alle vier Ecken löschen und neu setzen (Strg+Z nimmt es zurück)"
                onClick={() => {
                  aendern((e) => ({ ...e, rechteck: { ...e.rechteck, ecken: [] } }));
                  s().setze({ werkzeug: 'ecken', entwurf: [] });
                }}
              >
                Ecken neu setzen
              </button>
            )}
          </div>
          <p className="muted small-text">Ein Rechteck ist nicht überbestimmt: zur Kontrolle ein bekanntes Maß nachmessen, das nicht zur Referenz gehört.</p>
        </>
      )}

      {ebene.methode === 'passpunkte' && (
        <>
          <div className="button-row">
            <WerkzeugKnopf w="passpunkt" anzahl={ebene.passpunkte.length} primaer={ebene.passpunkte.length < 4} />
          </div>
          {ebene.passpunkte.length > 0 && (
            <table className="ef-tabelle" ref={setTabelle}>
              <thead>
                <tr>
                  <th />
                  <th>x (m)</th>
                  <th>y (m)</th>
                  <th title="Abweichung nach dem Ausgleich">Rest</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ebene.passpunkte.map((p, i) => (
                  <tr
                    key={p.id}
                    className={`${auswahl?.art === 'passpunkt' && auswahl.id === p.id ? 'sel' : ''}${p.x === undefined || p.y === undefined ? ' fehlt' : ''}`}
                    onClick={() => s().setze({ auswahl: { art: 'passpunkt', id: p.id } })}
                    onKeyDown={enterZurFlaeche}
                  >
                    <td>P{i + 1}</td>
                    <td data-fokus={p.id}>
                      <NumberField value={p.x} digits={3} allowEmpty label={`P${i + 1} x in m`} onChange={(v) => aendern((e) => ({ ...e, passpunkte: e.passpunkte.map((q) => (q.id === p.id ? { ...q, x: v } : q)) }))} />
                    </td>
                    <td>
                      <NumberField value={p.y} digits={3} allowEmpty label={`P${i + 1} y in m`} onChange={(v) => aendern((e) => ({ ...e, passpunkte: e.passpunkte.map((q) => (q.id === p.id ? { ...q, y: v } : q)) }))} />
                    </td>
                    <td className="num muted">{restText(p.id)}</td>
                    <td>
                      <button className="icon small danger" title={`Passpunkt P${i + 1} entfernen`} aria-label={`Passpunkt P${i + 1} entfernen`} onClick={() => aendern((e) => ({ ...e, passpunkte: e.passpunkte.filter((q) => q.id !== p.id) }))}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted small-text">x nach rechts, y nach oben, z. B. Höhen über Gelände. Punkte möglichst weit über die Fläche verteilen.</p>
        </>
      )}

      {ebene.methode === 'fluchtlinien' && (
        <>
          <div className="button-row">
            <WerkzeugKnopf w="waagerecht" anzahl={ebene.fluchtlinien.waagerecht.length} />
            <WerkzeugKnopf w="senkrecht" anzahl={ebene.fluchtlinien.senkrecht.length} />
            <WerkzeugKnopf w="mass" anzahl={ebene.fluchtlinien.masse.length} />
          </div>
          {ebene.fluchtlinien.masse.length > 0 && (
            <table className="ef-tabelle" ref={setTabelle}>
              <thead>
                <tr>
                  <th />
                  <th>Länge (m)</th>
                  <th>Rest</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ebene.fluchtlinien.masse.map((m, i) => (
                  <tr
                    key={m.id}
                    className={`${auswahl?.art === 'mass' && auswahl.id === m.id ? 'sel' : ''}${m.laenge === undefined ? ' fehlt' : ''}`}
                    onClick={() => s().setze({ auswahl: { art: 'mass', id: m.id } })}
                    onKeyDown={enterZurFlaeche}
                  >
                    <td>M{i + 1}</td>
                    <td data-fokus={m.id}>
                      <NumberField
                        value={m.laenge}
                        min={0}
                        digits={3}
                        allowEmpty
                        label={`Länge M${i + 1} in m`}
                        onChange={(v) => aendern((e) => ({ ...e, fluchtlinien: { ...e.fluchtlinien, masse: e.fluchtlinien.masse.map((q) => (q.id === m.id ? { ...q, laenge: v } : q)) } }))}
                      />
                    </td>
                    <td className="num muted">{restText(m.id)}</td>
                    <td>
                      <button
                        className="icon small danger"
                        title={`Maß M${i + 1} entfernen`}
                        aria-label={`Maß M${i + 1} entfernen`}
                        onClick={() => aendern((e) => ({ ...e, fluchtlinien: { ...e.fluchtlinien, masse: e.fluchtlinien.masse.filter((q) => q.id !== m.id) } }))}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {ergebnis.ok && ergebnis.e.residuen.some((r) => r.einheit === '°') && (
            <p className="small-text muted">
              Kantenabweichung:{' '}
              {[
                ...ebene.fluchtlinien.waagerecht.map((l, i) => [`W${i + 1}`, l.id]),
                ...ebene.fluchtlinien.senkrecht.map((l, i) => [`S${i + 1}`, l.id]),
              ]
                .filter(([, id]) => rest(id))
                .map(([n, id]) => `${n} ${restText(id)}`)
                .join(' · ')}
            </p>
          )}
          <p className="muted small-text">Kanten möglichst lang und weit auseinander wählen. Die Maße am besten als eine Breite und eine Höhe.</p>
        </>
      )}

      {ergebnis.ok ? (
        <div className="ef-ok">
          <span>Ebene ist entzerrbar.</span>
          <button className="primary" onClick={() => s().setze({ ansicht: 'entzerrt', werkzeug: 'auswahl', entwurf: [], auswahl: null })}>
            Entzerrt ansehen
          </button>
        </div>
      ) : (
        <div className="ef-fehlt" role="status">
          {ergebnis.fehler}
        </div>
      )}
    </section>
  );
}

// ---------- Objektiv ----------

function ObjektivPanel({ foto }: { foto: Foto }) {
  const korrigiert = useEntz((s) => s.korrigiert);
  const s = useEntz.getState;
  const [fehler, setFehler] = useState<string | null>(null);
  const linien = foto.hilfslinien.filter((l) => l.punkte.length >= 3);
  const setzeLinse = (linse: Foto['linse']) => s().aendern(mitFoto(foto.id, (f) => ({ ...f, linse })));
  const schaetzen = () => {
    try {
      const r = schaetzeLinse(
        foto.breite,
        foto.hoehe,
        linien.map((l) => l.punkte),
      );
      setFehler(null);
      setzeLinse({ k1: r.k1, k2: r.k2, vorher: r.vorher, nachher: r.nachher });
      log.info('Verzeichnung geschätzt', r);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  };
  const hat = foto.linse.k1 !== 0 || foto.linse.k2 !== 0;
  const gueltig = linseGueltig(foto.linse);
  return (
    <section>
      <h2>Objektiv · Verzeichnung</h2>
      <p className="muted small-text">
        Weitwinkel biegen gerade Kanten zum Bildrand hin. Mit Hilfslinien entlang solcher Kanten (je mindestens drei Punkte, gern mehr) wird die Verzeichnung geschätzt und
        bei allen Ebenen dieses Fotos herausgerechnet.
      </p>
      <div className="button-row">
        <WerkzeugKnopf w="hilfslinie" anzahl={foto.hilfslinien.length} />
        <button disabled={!linien.length} onClick={schaetzen} title={linien.length >= 3 ? 'Krümmung aus den Hilfslinien ermitteln' : 'Krümmung aus den Hilfslinien ermitteln – mit drei oder mehr Linien genauer'}>
          Verzeichnung schätzen
        </button>
      </div>
      {foto.linse.vorher !== undefined && foto.linse.nachher !== undefined && hat && (
        <p className="small-text">
          Abweichung der Hilfslinien von der Geraden: {fmt2(foto.linse.vorher)} px → <strong>{fmt2(foto.linse.nachher)} px</strong>
        </p>
      )}
      {!gueltig && <div className="warning">Diese Werte falten das Bild zum Rand hin und werden nicht angewendet – neu schätzen oder zurücksetzen.</div>}
      {fehler && <div className="warning">{fehler}</div>}
      <details className="ef-feinwerte">
        <summary>Feinwerte{hat ? ` (k1 ${fmt3(foto.linse.k1)}, k2 ${fmt3(foto.linse.k2)})` : ''}</summary>
        <div className="field-row">
          <Field label="k1 (Tonne < 0 < Kissen)">
            <NumberField value={foto.linse.k1} digits={4} onChange={(v) => setzeLinse({ k1: v ?? 0, k2: foto.linse.k2 })} />
          </Field>
          <Field label="k2">
            <NumberField value={foto.linse.k2} digits={4} onChange={(v) => setzeLinse({ k1: foto.linse.k1, k2: v ?? 0 })} />
          </Field>
        </div>
      </details>
      <div className="button-row">
        <label className="toggle">
          <input type="checkbox" checked={korrigiert} onChange={(e) => s().setze({ korrigiert: e.target.checked })} />
          Foto korrigiert anzeigen
        </label>
        {hat && (
          <button className="small" onClick={() => setzeLinse({ k1: 0, k2: 0 })}>
            Zurücksetzen
          </button>
        )}
      </div>
    </section>
  );
}

// ---------- Messen ----------

function MessPanel({ foto, ebene, e }: { foto: Foto; ebene: Ebene; e: Entzerrung }) {
  const auswahl = useEntz((s) => s.auswahl);
  const s = useEntz.getState;
  const werte = useMemo(() => new Map(ebene.messungen.map((m) => [m.id, messwert(e, m)])), [ebene.messungen, e]);
  const [kopiert, setKopiert] = useState<string | null>(null);
  const kopieren = async () => {
    const zeilen = [['Name', 'Art', 'Länge bzw. Umfang [m]', 'Fläche [m²]'].join('\t')];
    for (const m of ebene.messungen) {
      const w = werte.get(m.id)!;
      if (!w.gueltig) zeilen.push([m.name, MESS_NAMEN[m.art], 'nicht messbar', ''].join('\t'));
      else zeilen.push([m.name, MESS_NAMEN[m.art], fmtPlain(w.laenge, 3), w.flaeche !== undefined ? fmtPlain(w.flaeche, 3) : ''].join('\t'));
    }
    try {
      if (!navigator.clipboard) throw new Error('Zwischenablage nicht verfügbar');
      await navigator.clipboard.writeText(zeilen.join('\n'));
      setKopiert(`${ebene.messungen.length} ${ebene.messungen.length === 1 ? 'Messung' : 'Messungen'} kopiert – in Excel einfügen.`);
    } catch (e) {
      log.warn('Kopieren fehlgeschlagen', e);
      setKopiert('Kopieren nicht möglich – die Zwischenablage ist gesperrt.');
    }
  };
  const kopiertRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!kopiert) return;
    clearTimeout(kopiertRef.current);
    kopiertRef.current = setTimeout(() => setKopiert(null), 4000);
    return () => clearTimeout(kopiertRef.current);
  }, [kopiert]);
  return (
    <section className="grow">
      <div className="section-head">
        <h2>Messen · {ebene.name}</h2>
        {ebene.messungen.length > 0 && (
          <button className="small" onClick={() => void kopieren()} title="Als Tabelle in die Zwischenablage (zum Einfügen in Excel)">
            Kopieren
          </button>
        )}
      </div>
      {kopiert && (
        <p className="small-text muted" role="status">
          {kopiert}
        </p>
      )}
      <div className="button-row">
        <WerkzeugKnopf w="strecke" />
        <WerkzeugKnopf w="linienzug" />
        <WerkzeugKnopf w="flaeche" title="Geometrische Fläche in der entzerrten Ebene (z. B. Fassaden- oder Wandfläche) – keine Fläche nach DIN 277 oder WoFlV" />
      </div>
      {!ebene.messungen.length && <p className="muted small-text">Werkzeug wählen und Punkte im entzerrten Bild anklicken. Umschalt hält waagerecht/senkrecht, vorhandene Punkte werden gefangen.</p>}
      <ul className="list ef-messungen">
        {ebene.messungen.map((m) => {
          const w = werte.get(m.id)!;
          const sel = auswahl?.art === 'messung' && auswahl.id === m.id;
          return (
            <li key={m.id} className={sel ? 'active' : ''} onClick={() => s().setze({ auswahl: { art: 'messung', id: m.id } })}>
              <span className="grow-text">
                <TextField value={m.name} label="Name der Messung" onChange={(name) => s().aendern(mitEbene(foto.id, ebene.id, (x) => ({ ...x, messungen: x.messungen.map((y) => (y.id === m.id ? { ...y, name } : y)) })))} />
              </span>
              <span className="num ef-wert">
                {!w.gueltig ? (
                  <span className="ef-ungueltig" title="Ein Punkt liegt nach der geänderten Referenz nicht mehr in der Ebene (hinter dem Horizont) – Punkte neu setzen.">
                    nicht messbar
                  </span>
                ) : w.flaeche !== undefined ? (
                  <>
                    <strong>{fmt2(w.flaeche)} m²</strong>
                    <br />
                    <span className="muted small-text">U {fmt2(w.laenge)} m</span>
                  </>
                ) : (
                  <strong>{fmt2(w.laenge)} m</strong>
                )}
              </span>
              <button
                className="icon small danger"
                title={`${m.name} entfernen`}
                aria-label={`${m.name} entfernen`}
                onClick={(x) => {
                  x.stopPropagation();
                  s().aendern(mitEbene(foto.id, ebene.id, (y) => ({ ...y, messungen: y.messungen.filter((z) => z.id !== m.id) })));
                }}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
      <p className="muted small-text ef-hinweis">Maße stimmen nur für Punkte, die in der entzerrten Ebene liegen. Vor- und Rücksprünge (Fensterbank, Gesims, Dachüberstand) werden verzerrt.</p>
    </section>
  );
}

// ---------- Bild ----------

function BildPanel({ foto, ebene, e }: { foto: Foto; ebene: Ebene; e: Entzerrung }) {
  const [dialog, setDialog] = useState(false);
  const s = useEntz.getState;
  const aendern = (f: (x: Ebene) => Ebene) => s().aendern(mitEbene(foto.id, ebene.id, f));
  const auto = useMemo(() => autoAufloesung(e, ebene), [e, ebene]);
  const bereich = bereichVon(e, foto, ebene);
  const a = ausgabe(bereich, ebene.aufloesung ?? auto);
  return (
    <section>
      <h2>Bild</h2>
      <div className="field-row">
        <Field label="Auflösung (mm je Pixel)" hint={ebene.aufloesung === undefined ? 'automatisch: etwa wie im Foto' : undefined}>
          <NumberField value={ebene.aufloesung !== undefined ? ebene.aufloesung * 1000 : undefined} placeholder={fmt2(auto * 1000)} min={0.01} digits={2} allowEmpty onChange={(v) => aendern((x) => ({ ...x, aufloesung: v === undefined ? undefined : v / 1000 }))} />
        </Field>
      </div>
      <p className="small-text">
        Ausschnitt {fmt2(bereich.x1 - bereich.x0)} × {fmt2(bereich.y1 - bereich.y0)} m{ebene.ausschnitt ? '' : ' (automatisch)'}
        <br />
        <span className="muted">
          Bild {a.breite.toLocaleString('de-DE')} × {a.hoehe.toLocaleString('de-DE')} px{a.begrenzt ? ` – auf ${fmt2(a.aufloesung * 1000)} mm/px begrenzt` : ''}
        </span>
      </p>
      <div className="button-row">
        <WerkzeugKnopf w="ausschnitt" title="Rechteck in der entzerrten Ansicht aufziehen – nur dieser Teil wird exportiert" />
        {ebene.ausschnitt && <button onClick={() => aendern((x) => ({ ...x, ausschnitt: undefined }))}>Automatisch</button>}
        <button className="primary" onClick={() => setDialog(true)}>
          Exportieren …
        </button>
      </div>
      {dialog && <ExportDialog foto={foto} ebene={ebene} e={e} aufloesung={a.aufloesung} bereich={bereich} onClose={() => setDialog(false)} />}
    </section>
  );
}
