import { useEffect, useMemo, useRef, useState } from 'react';
import { einheitName, paragrafName } from '@core/baurecht/typen';
import type { KurzKnoten } from '@core/baurecht/kurz';
import { kurzBaum, offenText } from '@core/baurecht/kurz';
import type { Festlegung, ParagrafErgebnis } from '@core/baurecht/typen';
import type { Paragraf } from '@core/recht/index';
import { absaetze as absaetzeVon, absatzNummer } from '@core/recht/text';
import { externOeffnen } from '@core/platform/links';
import { isTauri } from '@core/platform/files';
import type { Pruefstand } from '../pruefung';
import { useBaurecht } from '../store';
import { AMPEL_ERKLAERUNG, AMPEL_TEXT, AmpelMarke, datum, nb } from './Ampel';
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

const STAND: Record<'ja' | 'nein' | 'offen', { zeichen: string; wort: string }> = {
  ja: { zeichen: '✓', wort: 'trifft zu' },
  nein: { zeichen: '✗', wort: 'trifft nicht zu' },
  offen: { zeichen: '?', wort: 'offen' },
};

function Stand({ w, unsicher }: { w?: KurzKnoten['w']; unsicher?: boolean }) {
  if (!w) return null;
  // nur Hinweis: das Zeichen in Klammern – es trägt das Ergebnis nicht (zur sicheren Seite)
  const wort = unsicher ? `${STAND[w].wort}, aber nur Hinweis – zählt nicht als gesichert` : STAND[w].wort;
  return (
    <span className={`br-stand br-stand-${unsicher ? 'unsicher' : w}`} title={wort}>
      <span aria-hidden="true">{unsicher ? `(${STAND[w].zeichen})` : STAND[w].zeichen}</span>
      <span className="br-unsichtbar">{wort}: </span>
    </span>
  );
}

/**
 * Regel als eingerückter Baum mit Stand je Knoten (✓ trifft zu, ✗ nicht, ? offen) und dem aktuellen Wert je Blatt.
 * Entschiedene Unterzweige sind zugeklappt, offene aufgeklappt – so sieht man, was fehlt.
 */
function Baum({ k, tiefe = 0 }: { k: KurzKnoten; tiefe?: number }) {
  if (!k.kinder)
    return (
      <li className="br-haengend">
        <Stand w={k.w} unsicher={k.unsicher} />
        {nb(k.text)}
        {k.ist && <span className="br-ist"> – jetzt: {k.ist}</span>}
      </li>
    );
  const liste = (
    <ul>
      {k.kinder.map((x, i) => (
        <Baum key={i} k={x} tiefe={tiefe + 1} />
      ))}
    </ul>
  );
  if (tiefe < 2)
    return (
      <li className="br-haengend">
        <Stand w={k.w} unsicher={k.unsicher} />
        {nb(k.text)}
        {liste}
      </li>
    );
  return (
    <li>
      <details open={k.w === 'offen' || !k.w}>
        <summary>
          <Stand w={k.w} unsicher={k.unsicher} />
          {k.text} <span className="br-leise">({k.kinder.length})</span>
        </summary>
        {liste}
      </details>
    </li>
  );
}

/** zu einem anderen Paragrafen springen: wählen und den Fokus auf seine Überschrift (sonst fiele er auf die Seite) */
function zuParagraf(id: string) {
  useBaurecht.getState().waehlen(id);
  setTimeout(() => document.querySelector<HTMLElement>('.br-detail [data-f6-ziel]')?.focus(), 0);
}

const BEHOERDE: Record<string, string> = {
  ja: 'Prüft die Bauaufsicht im gewählten Verfahren.',
  nein: 'Prüft die Bauaufsicht nicht – soweit die Vorschrift gilt, liegt sie in der eigenen Verantwortung der Entwurfsverfassenden.',
  offen: 'Ob die Bauaufsicht das prüft, hängt am Verfahren – Verfahren festlegen.',
};

/** Einzelheiten zum gewählten Paragrafen */
export function Detail({ stand }: { stand: Pruefstand }) {
  const auswahl = useBaurecht((s) => s.auswahl);
  const texte = useBaurecht((s) => s.texte);
  const [vergleich, setVergleich] = useState(false);
  // nach „Festlegung aufheben“: Rückgängig anbieten, Fokus auf „Von Hand festlegen …“
  const [aufgehoben, setAufgehoben] = useState<{ id: string; f: Festlegung } | null>(null);
  const festlegenKnopf = useRef<HTMLButtonElement>(null);
  const laedtListe = useBaurecht((s) => s.laedt);
  const p: ParagrafErgebnis | undefined = useMemo(() => stand.auswertung.paragrafen.find((x) => x.id === auswahl), [stand.auswertung.paragrafen, auswahl]);
  useEffect(() => {
    if (aufgehoben && aufgehoben.id !== auswahl) setAufgehoben(null);
  }, [auswahl, aufgehoben]);
  // alt/neu gilt nur für den Paragrafen, an dem es eingeschaltet wurde
  useEffect(() => setVergleich(false), [auswahl]);
  useEffect(() => {
    if (aufgehoben) festlegenKnopf.current?.focus();
  }, [aufgehoben]);
  if (!p)
    return (
      <aside className="br-detail br-detail-leer" aria-label="Einzelheiten" tabIndex={-1}>
        <h2>Einzelheiten</h2>
        <p>Paragraf in der Liste wählen: Begründung, beteiligte Angaben, Text in der maßgeblichen Fassung und Festlegung von Hand.</p>
        <dl className="br-legende">
          {(['rot', 'gelb', 'gruen'] as const).map((a) => (
            <div key={a}>
              <dt>
                <AmpelMarke ampel={a} />
              </dt>
              <dd>{AMPEL_ERKLAERUNG[a]}</dd>
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
  const einheit = einheitName(p.paragraf, p.titel);
  const titel = `${einheit.nr || paragrafName(p.paragraf)} ${norm.def.kurz}`;
  // „Festlegung überholt“ steht als Meldung oben – nicht noch einmal als Grund
  const gruende = p.gruende.filter((g) => !(p.ueberholt && g.startsWith('Festlegung „entfällt“ überholt')) && !(p.unwirksam && g.startsWith('Festlegung „entfällt“ noch nicht wirksam')));
  const zeigeVergleich = vergleich && p.geaendert.length > 0 && !!t?.vorige;
  const aufheben = () => {
    if (!p.festlegung) return;
    setAufgehoben({ id: p.id, f: p.festlegung });
    useBaurecht.getState().festlegungAufheben(p.id);
    useBaurecht.getState().ansagen(`Festlegung aufgehoben – automatisch: „${AMPEL_TEXT[p.automatisch]}“${p.festlegung.bestaetigt ? '; beim Speichern noch einmal bestätigen' : ''}`);
  };
  return (
    <aside className="br-detail" aria-label={`Einzelheiten ${titel}`} tabIndex={-1}>
      <header className={`br-detail-kopf br-kopf-${p.ampel}`}>
        {/* F6 und Sprungmarke landen hier – immer an derselben Stelle, nicht auf einem zufälligen Knopf; die Überschrift
            nennt § und Norm mit (optisch als Zeile darüber) */}
        <h2 className="br-detail-titel br-detail-name" tabIndex={-1} data-f6-ziel="">
          <span className="br-detail-nr">{nb(einheit.nr ? titel : norm.def.kurz)}</span>
          <span className="br-unsichtbar"> – </span>
          <span>{nb(einheit.titel || titel)}</span>
        </h2>
        <div className="br-detail-ampel">
          <AmpelMarke ampel={p.ampel} />
          {p.festlegung && (
            <span className="br-leise-stark">
              {p.ueberholt || p.unwirksam
                ? `Festlegung „${AMPEL_TEXT[p.festlegung.ampel]}“ ${p.ueberholt ? 'überholt' : 'noch nicht wirksam'}`
                : p.festlegung.bestaetigt
                  ? 'von Hand festgelegt'
                  : 'von Hand festgelegt · Entwurf (beim Speichern bestätigen)'}
            </span>
          )}
        </div>
      </header>
      <div className="br-detail-inhalt">
        {p.ueberholt && (
          <div className="br-meldung br-meldung-warn" role="status">
            <strong>Festlegung überholt:</strong> {nb(p.ueberholt)}. Bitte erneut festlegen oder aufheben.
          </div>
        )}
        {!p.ueberholt && p.unwirksam && (
          <div className="br-meldung br-meldung-info" role="status">
            <strong>Festlegung „entfällt“ noch nicht wirksam:</strong> {nb(p.unwirksam)}. Bis dahin bleibt es bei „{AMPEL_TEXT[p.ampel]}“.{' '}
            {isTauri() ? 'Mit „Rechtsstand prüfen“ den Text an der Quelle holen; liegt er geprüft vor, zählt die Festlegung – wurde sie ohne Text getroffen, dann am Text erneut festlegen.' : 'Die Gesetzestexte gibt es nur in der Desktop-App – dort prüfen und festlegen.'}
          </div>
        )}
        <section>
          <h3>Begründung</h3>
          {p.festlegung && (
            <p className="br-festlegung-text">
              <strong>Von Hand ({p.festlegung.von}, {datum(p.festlegung.am)}):</strong> {nb(p.festlegung.grund)}
              <br />
              <span className="br-leise-stark">automatisch wäre: {AMPEL_TEXT[p.automatisch]}</span>
            </p>
          )}
          <ul className="br-gruende">
            {gruende.map((g, i) => (
              <li key={i}>
                {nb(g)}
                {/* der Vorbehalt am Planungsrecht mit Ausweg: zum Bestätigen am Merkmal */}
                {/^Nicht gesichert: Planungsrecht/.test(g) && (
                  <>
                    {' '}
                    <button type="button" className="small br-link" onClick={() => useBaurecht.getState().fokusSetzen('merkmal:Planungsrecht:bestaetigen')}>
                      Zum Bestätigen
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {p.hinweise.length > 0 && (
            <ul className="br-hinweise">
              {p.hinweise.map((h, i) => (
                <li key={i}>
                  <strong>Hinweis:</strong> {nb(h)}
                </li>
              ))}
            </ul>
          )}
        </section>
        {p.offen.some((o) => !o.startsWith('paragraf:')) && (
          <section>
            <h3>Fehlende Angaben</h3>
            <div className="br-chips">
              {p.offen.filter((o) => !o.startsWith('paragraf:')).map((o) => (
                <button
                  key={o}
                  type="button"
                  className="br-chip-knopf"
                  onClick={() => (o.startsWith('paragraf:') ? zuParagraf(o.slice(9)) : useBaurecht.getState().fokusSetzen(o))}
                  title={o.startsWith('paragraf:') ? 'zum Paragrafen' : 'zur Angabe'}
                >
                  {nb(offenText(o, ctx))}
                </button>
              ))}
            </div>
          </section>
        )}
        {p.offen.some((o) => o.startsWith('paragraf:')) && (
          <section>
            <h3>Hängt an</h3>
            <p className="br-leise-stark">Diese Paragrafen sind selbst noch offen – ist dort entschieden, entscheidet sich auch dieser.</p>
            <div className="br-chips">
              {p.offen
                .filter((o) => o.startsWith('paragraf:'))
                .map((o) => (
                  <button key={o} type="button" className="br-chip-knopf" onClick={() => zuParagraf(o.slice(9))} title="zum Paragrafen">
                    {nb(offenText(o, ctx))}
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
                  {nb(offenText(o, ctx))}
                </button>
              ))}
            </div>
          </section>
        )}
        <section className="br-fakten-kurz">
          <h3>Prüfung und Nachweis</h3>
          {p.behoerde ? <p>{BEHOERDE[p.behoerde]}</p> : null}
          {p.nachweis?.length ? <p>Nachweis: {nb(p.nachweis.join('; '))}</p> : null}
          {p.verweise?.length ? (
            <>
              <p className="br-verweise-kopf">Siehe auch:</p>
              <ul className="br-verweise">
                {p.verweise.map((v) => (
                  <li key={v}>
                    <button type="button" className="br-link" onClick={() => zuParagraf(v)}>
                      {nb(ctx.paragraf?.(v) ?? v)}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {p.regel && (
            <p className="br-leise" title={p.regel.datei}>
              Regel Stand {datum(p.regel.fassung)} (an dieser Fassung geprüft), Version{'\u00a0'}{p.regel.version}
            </p>
          )}
          {p.annahme && <p className="br-leise">Annahme: {p.annahme}</p>}
          {p.regelteile?.length ? (
            <details className="br-regel-einzeln">
              <summary>Regel im Einzelnen</summary>
              <ul className="br-regel-baum">
                {p.regelteile.map((r) => (
                  <Baum key={r.titel} k={{ text: `${r.titel}:`, kinder: [kurzBaum(r.kurz, ctx, stand.auswertung.kontext)] }} />
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
                <button type="button" className="small" aria-pressed={vergleich} onClick={() => setVergleich(!vergleich)} title="Fassung, an der die Regel geprüft ist, und geltende Fassung gegenüberstellen">
                  alt/neu vergleichen
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
          {text && !zeigeVergleich && (
            <p className="br-text-legende" aria-hidden="true">
              <span className="br-legende-hervor">Fundstelle der Regel</span>
              {geaendert.size > 0 && <span className="br-legende-geaendert">seit der Prüfung geändert</span>}
            </p>
          )}
          {zeigeVergleich && t?.vorige
            ? p.geaendert.map((g) => <Gegenueberstellung key={g} alt={t.vorige!.paragrafen[p.paragraf]} neu={text} absatz={g.split('/')[1] ?? ''} />)
            : text ? <ParagrafText p={text} absaetze={absaetze} geaendert={geaendert} /> : <p className="br-leise">{laedt ? 'Text wird geholt …' : norm.def.quelle.art === 'verweis' ? 'Nur Fundstelle – der Text ist nicht frei verfügbar.' : `Text nicht verfügbar${t?.fehler ? `: ${t.fehler}` : ' (Web-Version oder noch nicht geholt)'}.`}</p>}
        </section>
      </div>
      <footer className="br-detail-fuss">
        <button type="button" ref={festlegenKnopf} onClick={() => festlegenOeffnen(p)}>
          {p.festlegung ? 'Festlegung ändern …' : 'Von Hand festlegen …'}
        </button>
        {p.festlegung && (
          <button type="button" className="danger" onClick={aufheben}>
            Festlegung aufheben
          </button>
        )}
        {aufgehoben && !p.festlegung && (
          <span className="br-aufgehoben" role="status">
            Festlegung aufgehoben.{' '}
            <button
              type="button"
              className="small"
              onClick={() => {
                useBaurecht.getState().festlegungWiederherstellen(aufgehoben.id, aufgehoben.f);
                useBaurecht.getState().ansagen(`Festlegung wiederhergestellt – „${AMPEL_TEXT[aufgehoben.f.ampel]}“${aufgehoben.f.bestaetigt ? '' : ' (Entwurf)'}`);
                setAufgehoben(null);
                // der Knopf verschwindet – Fokus auf „Festlegung ändern …“
                setTimeout(() => festlegenKnopf.current?.focus(), 0);
              }}
            >
              Rückgängig
            </button>
          </span>
        )}
      </footer>
    </aside>
  );
}
