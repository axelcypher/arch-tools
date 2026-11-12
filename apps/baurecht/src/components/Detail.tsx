import { useMemo, useState } from 'react';
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
            {z}
          </p>
        );
      })}
    </div>
  );
}

function Gegenueberstellung({ alt, neu, absatz }: { alt: Paragraf | undefined; neu: Paragraf | undefined; absatz: string }) {
  const zeilen = (p: Paragraf | undefined) => {
    if (!p) return ['(nicht vorhanden)'];
    if (!absatz) return p.text;
    return absaetzeVon(p).get(absatz) ?? p.text;
  };
  return (
    <div className="br-vergleich">
      <div>
        <h4>bisher</h4>
        {zeilen(alt).map((z, i) => (
          <p key={i}>{z}</p>
        ))}
      </div>
      <div>
        <h4>jetzt</h4>
        {zeilen(neu).map((z, i) => (
          <p key={i}>{z}</p>
        ))}
      </div>
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
  const t = texte[`${p.modul}/${p.norm}`];
  const text = t?.fassung?.paragrafen[p.paragraf];
  const absaetze = new Set(p.fundstellen.map((f) => f.split('/')[1] ?? ''));
  const geaendert = new Set(p.geaendert.map((g) => g.split('/')[1] ?? ''));
  const ctx = stand.auswertung.text;
  const titel = `§ ${p.paragraf} ${norm.def.kurz}`;
  return (
    <aside className="br-detail" aria-label={`Einzelheiten ${titel}`}>
      <header className={`br-detail-kopf br-kopf-${p.ampel}`}>
        <div className="br-detail-titel">
          <span className="br-detail-nr">{titel}</span>
          <span className="br-detail-name">{p.titel}</span>
        </div>
        <div className="br-detail-ampel">
          <AmpelMarke ampel={p.ampel} />
          {p.festlegung && <span className="br-leise">{p.festlegung.bestaetigt ? 'von Hand festgelegt' : 'von Hand festgelegt (Entwurf)'}</span>}
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
              <span className="br-leise">automatisch wäre: {AMPEL_TEXT[p.automatisch]}</span>
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
            <p>
              Siehe auch:{' '}
              {p.verweise.map((v, i) => (
                <span key={v}>
                  {i > 0 && ', '}
                  <button type="button" className="br-link" onClick={() => useBaurecht.getState().waehlen(v)}>
                    {ctx.paragraf?.(v) ?? v}
                  </button>
                </span>
              ))}
            </p>
          ) : null}
          {p.regel && (
            <p className="br-leise">
              Regel: {p.regel.datei.replace(/^module\//, '')} (Version {p.regel.version}, geprüft an der Fassung vom {datum(p.regel.fassung)})
            </p>
          )}
          {p.annahme && <p className="br-leise">Annahme: {p.annahme}</p>}
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
          {vergleich && t?.vorige
            ? p.geaendert.map((g) => <Gegenueberstellung key={g} alt={t.vorige!.paragrafen[p.paragraf]} neu={text} absatz={g.split('/')[1] ?? ''} />)
            : text ? <ParagrafText p={text} absaetze={absaetze} geaendert={geaendert} /> : <p className="br-leise">{useBaurecht.getState().laedt.includes(norm.id) ? 'Text wird geholt …' : norm.def.quelle.art === 'verweis' ? 'Nur Fundstelle – der Text ist nicht frei verfügbar.' : `Text nicht verfügbar${t?.fehler ? `: ${t.fehler}` : ' (Web-Version oder noch nicht geholt)'}.`}</p>}
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
