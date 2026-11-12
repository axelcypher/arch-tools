import { useMemo, useState } from 'react';
import { paragrafName } from '@core/baurecht/typen';
import { offenText } from '@core/baurecht/kurz';
import type { ParagrafErgebnis } from '@core/baurecht/typen';
import type { Paragraf } from '@core/recht/index';
import { absaetze as absaetzeVon, absatzNummer } from '@core/recht/text';
import { externOeffnen } from '@core/platform/links';
import type { Pruefstand } from '../pruefung';
import { useBaurecht } from '../store';
import { AMPEL_LANG, AMPEL_TEXT, AmpelMarke, datum } from './Ampel';
import { festlegenOeffnen } from './Dialoge';

/** Text eines Paragrafen; die Absätze der Fundstellen hervorgehoben, geänderte markiert */
function ParagrafText({ p, absaetze, geaendert }: { p: Paragraf; absaetze: Set<string>; geaendert: Set<string> }) {
  let abs = '';
  return (
    <div className="br-text">
      {p.text.map((z, i) => {
        const n = absatzNummer(z);
        if (n) abs = n;
        const hervor = absaetze.has(abs) || absaetze.has('');
        return (
          <p key={i} className={`${hervor ? 'br-text-hervor' : ''}${geaendert.has(abs) ? ' br-text-geaendert' : ''}`}>
            {hervor && n ? <span className="br-unsichtbar">Fundstelle der Regel: </span> : null}
            {geaendert.has(abs) && n ? <span className="br-unsichtbar">seit der Prüfung geändert: </span> : null}
            {z}
          </p>
        );
      })}
    </div>
  );
}

/** Wortunterschied (längste gemeinsame Teilfolge): gestrichen / eingefügt – nicht nur als Farbe */
export function wortDiff(alt: string, neu: string): { art: 'gleich' | 'weg' | 'neu'; text: string }[] {
  const a = alt.split(/(\s+)/).filter(Boolean);
  const b = neu.split(/(\s+)/).filter(Boolean);
  if (a.length * b.length > 250000) return [{ art: 'weg', text: alt }, { art: 'neu', text: neu }];
  const l: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) l[i][j] = a[i] === b[j] ? l[i + 1][j + 1] + 1 : Math.max(l[i + 1][j], l[i][j + 1]);
  const out: { art: 'gleich' | 'weg' | 'neu'; text: string }[] = [];
  const dazu = (art: 'gleich' | 'weg' | 'neu', text: string) => {
    const letzt = out[out.length - 1];
    if (letzt?.art === art) letzt.text += text;
    else out.push({ art, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      dazu('gleich', a[i]);
      i++;
      j++;
    } else if (l[i + 1][j] >= l[i][j + 1]) dazu('weg', a[i++]);
    else dazu('neu', b[j++]);
  }
  while (i < a.length) dazu('weg', a[i++]);
  while (j < b.length) dazu('neu', b[j++]);
  return out;
}

/** alt/neu untereinander, Wortunterschiede gestrichen bzw. unterstrichen */
function Gegenueberstellung({ alt, neu, absatz }: { alt: Paragraf | undefined; neu: Paragraf | undefined; absatz: string }) {
  const zeilen = (p: Paragraf | undefined) => {
    if (!p) return '';
    if (!absatz) return p.text.join('\n');
    return (absaetzeVon(p).get(absatz) ?? p.text).join('\n');
  };
  const teile = wortDiff(zeilen(alt), zeilen(neu));
  return (
    <div className="br-vergleich">
      <h4>
        {absatz ? `Abs. ${absatz}: ` : ''}Änderung gegenüber der Fassung, an der die Regel geprüft ist <span className="br-leise">(gestrichen = entfallen, unterstrichen = neu)</span>
      </h4>
      <p className="br-vergleich-text">
        {teile.map((t, i) => (t.art === 'gleich' ? <span key={i}>{t.text}</span> : t.art === 'weg' ? <del key={i}>{t.text}</del> : <ins key={i}>{t.text}</ins>))}
      </p>
    </div>
  );
}

const BEHOERDE: Record<string, string> = {
  ja: 'Prüft die Bauaufsicht im gewählten Verfahren.',
  nein: 'Prüft die Bauaufsicht nicht – gilt trotzdem (eigene Verantwortung der Entwurfsverfassenden).',
  offen: 'Ob die Bauaufsicht das prüft, hängt am Verfahren – Verfahren festlegen.',
};

/** Einzelheiten zum gewählten Paragrafen */
export function Detail({ stand }: { stand: Pruefstand }) {
  const auswahl = useBaurecht((s) => s.auswahl);
  const texte = useBaurecht((s) => s.texte);
  const [vergleich, setVergleich] = useState(false);
  const laedtListe = useBaurecht((s) => s.laedt);
  const p: ParagrafErgebnis | undefined = useMemo(() => stand.auswertung.paragrafen.find((x) => x.id === auswahl), [stand.auswertung.paragrafen, auswahl]);
  if (!p)
    return (
      <aside className="br-detail br-detail-leer" aria-label="Einzelheiten">
        <h2>Einzelheiten</h2>
        <p>Paragraf in der Liste wählen: Begründung, beteiligte Angaben, Text in der maßgeblichen Fassung und Festlegung von Hand.</p>
        <dl className="br-legende">
          {(['rot', 'gelb', 'gruen'] as const).map((a) => (
            <div key={a}>
              <dt>
                <AmpelMarke ampel={a} />
              </dt>
              <dd>{AMPEL_LANG[a]}</dd>
            </div>
          ))}
        </dl>
      </aside>
    );
  const norm = stand.auswertung.normen.find((n) => n.id === `${p.modul}/${p.norm}`)!;
  const laedt = laedtListe.includes(norm.id);
  const t = texte[`${p.modul}/${p.norm}`];
  const text = t?.fassung?.paragrafen[p.paragraf];
  const absaetze = new Set(p.fundstellen.map((f) => f.split('/')[1] ?? ''));
  const geaendert = new Set(p.geaendert.map((g) => g.split('/')[1] ?? ''));
  const ctx = stand.auswertung.text;
  const titel = `${paragrafName(p.paragraf)} ${norm.def.kurz}`;
  return (
    <aside className="br-detail" aria-label={`Einzelheiten ${titel}`}>
      <header className={`br-detail-kopf br-kopf-${p.ampel}`}>
        <div className="br-detail-titel">
          <span className="br-detail-nr">{titel}</span>
          <h2 className="br-detail-name">{p.titel || titel}</h2>
        </div>
        <div className="br-detail-ampel">
          <AmpelMarke ampel={p.ampel} />
          {p.festlegung && <span className="br-leise-stark">{p.festlegung.bestaetigt ? 'von Hand festgelegt' : 'von Hand festgelegt · Entwurf (beim Speichern bestätigen)'}</span>}
        </div>
      </header>
      <div className="br-detail-inhalt">
        {p.ueberholt && (
          <div className="br-meldung br-meldung-warn" role="status">
            <strong>Festlegung überholt:</strong> {p.ueberholt}. Bitte erneut festlegen oder aufheben.
          </div>
        )}
        <section>
          <h3>Begründung</h3>
          {p.festlegung && (
            <p className="br-festlegung-text">
              <strong>Von Hand ({p.festlegung.von}, {datum(p.festlegung.am)}):</strong> {p.festlegung.grund}
              <br />
              <span className="br-leise-stark">automatisch wäre: {AMPEL_TEXT[p.automatisch]}</span>
            </p>
          )}
          <ul className="br-gruende">
            {p.gruende.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
          {p.hinweise.length > 0 && (
            <ul className="br-hinweise">
              {p.hinweise.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          )}
        </section>
        {p.offen.length > 0 && (
          <section>
            <h3>Fehlende Angaben</h3>
            <div className="br-chips">
              {p.offen.map((o) => (
                <button
                  key={o}
                  type="button"
                  className="br-chip-knopf"
                  onClick={() => (o.startsWith('paragraf:') ? useBaurecht.getState().waehlen(o.slice(9)) : useBaurecht.getState().fokusSetzen(o))}
                  title={o.startsWith('paragraf:') ? 'zum Paragrafen' : 'zur Angabe'}
                >
                  {offenText(o, ctx)}
                </button>
              ))}
            </div>
          </section>
        )}
        {p.unsicher.length > 0 && (
          <section>
            <h3>Nur Hinweis, nicht gesichert</h3>
            <div className="br-chips">
              {p.unsicher.map((o) => (
                <button key={o} type="button" className="br-chip-knopf" onClick={() => useBaurecht.getState().fokusSetzen(o)}>
                  {offenText(o, ctx)}
                </button>
              ))}
            </div>
          </section>
        )}
        <section className="br-fakten-kurz">
          <h3>Prüfung und Nachweis</h3>
          {p.behoerde ? <p>{BEHOERDE[p.behoerde]}</p> : null}
          {p.nachweis?.length ? <p>Nachweis: {p.nachweis.join('; ')}</p> : null}
          {p.verweise?.length ? (
            <>
              <p className="br-verweise-kopf">Siehe auch:</p>
              <ul className="br-verweise">
                {p.verweise.map((v) => (
                  <li key={v}>
                    <button type="button" className="br-link" onClick={() => useBaurecht.getState().waehlen(v)}>
                      {ctx.paragraf?.(v) ?? v}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {p.regel && (
            <p className="br-leise" title={p.regel.datei}>
              Regel Stand {datum(p.regel.fassung)} (an dieser Fassung geprüft), Version {p.regel.version}
            </p>
          )}
          {p.annahme && <p className="br-leise">Annahme: {p.annahme}</p>}
          {p.bedingung?.length ? (
            <details className="br-regel-einzeln">
              <summary>Regel im Einzelnen</summary>
              <ul>
                {p.bedingung.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
        <section>
          <div className="section-head">
            <h3>Gesetzestext</h3>
            <span>
              {p.geaendert.length > 0 && t?.vorige && (
                <button type="button" className="small" aria-pressed={vergleich} onClick={() => setVergleich(!vergleich)}>
                  {vergleich ? 'Text' : 'alt/neu'}
                </button>
              )}{' '}
              {text?.url && (
                <button type="button" className="small" onClick={() => void externOeffnen(text.url)} title="Original in der Quelle öffnen">
                  Original ↗
                </button>
              )}
            </span>
          </div>
          {t?.fassung && <p className="br-leise">{t.fassung.fassung} · abgerufen {datum(t.fassung.abgerufen)}</p>}
          {text && !vergleich && (
            <p className="br-text-legende" aria-hidden="true">
              <span className="br-legende-hervor">Fundstelle der Regel</span>
              {geaendert.size > 0 && <span className="br-legende-geaendert">seit der Prüfung geändert</span>}
            </p>
          )}
          {vergleich && t?.vorige
            ? p.geaendert.map((g) => <Gegenueberstellung key={g} alt={t.vorige!.paragrafen[p.paragraf]} neu={text} absatz={g.split('/')[1] ?? ''} />)
            : text ? <ParagrafText p={text} absaetze={absaetze} geaendert={geaendert} /> : <p className="br-leise">{laedt ? 'Text wird geholt …' : norm.def.quelle.art === 'verweis' ? 'Nur Fundstelle – der Text ist nicht frei verfügbar.' : `Text nicht verfügbar${t?.fehler ? `: ${t.fehler}` : ' (Web-Version oder noch nicht geholt)'}.`}</p>}
        </section>
      </div>
      <footer className="br-detail-fuss">
        <button type="button" className="primary" onClick={() => festlegenOeffnen(p)}>
          {p.festlegung ? 'Festlegung ändern …' : 'Von Hand festlegen …'}
        </button>
        {p.festlegung && (
          <button type="button" className="danger" onClick={() => useBaurecht.getState().festlegungAufheben(p.id)}>
            Festlegung aufheben
          </button>
        )}
      </footer>
    </aside>
  );
}
