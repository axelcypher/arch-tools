import type { AblageOrdner } from '../ablage';
import { dateiArt } from '../ablage';
import type { Bereitschaft } from '../antrag';
import {
  antragsMuster,
  antragsNameFehler,
  artDerFassung,
  BEREIT_TEXT,
  bereitschaft,
  eingereichtVon,
  entferntSeitEinreichung,
  istHilfsdatei,
  nameNachFormat,
  SEIT_EINREICHUNG_TEXT,
  seitEinreichung,
} from '../antrag';
import { aktiveFassung, antragsOrdner, dokumentZu, namensschemaVon, projektCodes, useAntrag } from '../antragStore';
import { umbenennen } from '../dateiAktionen';
import { oeffnePfad, verbinde } from '../dateisystem';
import { dateiArtVon, useFormulare } from '../store';
import { dateiMenue, SYMBOL } from './AblageBaum';
import { StatusPunkt } from './Antrag';
import { PLAN_ZUSTAND_KURZ, PLAN_ZUSTAND_TEXT } from '../plansatz';
import { zeitKurz, zeitLang } from '../zeit';
import type { MenuePunkt } from './Menue';
import { zeigeMenue } from './Menue';
import { Symbol } from './Symbol';
import { useState } from 'react';
import { UnterlagenVorschau } from './UnterlagenVorschau';

/** Alle Formulare des Projekts (ohne Archivordner) auf einmal als PDF exportieren – mit Fortschritt */
export function SammelExportKnopf({ mitText = false }: { mitText?: boolean }) {
  const laeuft = useAntrag((s) => s.sammelExport);
  const anzahl = useFormulare((s) => s.formulare.length);
  return (
    <button
      className={mitText ? 'small' : 'icon'}
      disabled={!!laeuft || !anzahl}
      aria-label="Alle Formulare als PDF exportieren"
      title="Alle Formulare des Projekts als PDF exportieren – Name und Ziel wie beim einzelnen Export (Formulare in _archiv bzw. archiv ausgenommen)"
      onClick={() => void useAntrag.getState().alleExportieren()}
    >
      <Symbol name="export" />
      {mitText && (laeuft ? ` Export ${laeuft.fertig} von ${laeuft.gesamt} …` : ' Alle Formulare exportieren')}
      {!mitText && laeuft && (
        <span className="fo-sammel-zahl">
          {laeuft.fertig}/{laeuft.gesamt}
        </span>
      )}
    </button>
  );
}

/** Zeichen des Zustands einer Datei im Antragsordner */
const ZEICHEN: Record<Bereitschaft, string> = { bereit: '✓', offen: '○', name: '!', geaendert: '↻' };

/**
 * Projektordner, Ansicht „Antrag“: nur die Dokumente im Ordner der aktiven Antragsfassung (z. B. TÖB/BAUA 2) mit
 * Vollständigkeit. „Bereit“ markiert man von Hand – nur Dateien im Namensformat `<Projektcode> <Antragsart> <JJMMTT> …`;
 * wird eine Datei danach geändert, gilt sie nicht mehr als bereit. Dazu die Dokumente des Antragsumfangs, die im
 * Antragsordner noch fehlen.
 */
export function AntragsAblage({ ablage }: { ablage: AblageOrdner }) {
  const projekt = useFormulare((s) => s.projekt)!;
  useFormulare((s) => s.oap); // Projektcode der Projektdatei
  const offenPfad = useFormulare((s) => (s.haupt === 'datei' ? s.datei?.pfad : null));
  const dateien = useAntrag((s) => s.dateien);
  const lesefehler = useAntrag((s) => s.dateienLesefehler);
  const dokumente = useAntrag((s) => s.dokumente);
  const umfangDa = useAntrag((s) => !!s.projektdatei?.umfang);
  const fassung = useAntrag((s) => aktiveFassung(s, projekt));
  const ordner = useAntrag((s) => antragsOrdner(s, projekt));
  const bereitJeFassung = useAntrag((s) => s.projektdatei?.bereit);
  // Antragsstand bei der Einreichung – er gilt nur, solange der Antrag als eingereicht gilt
  const stand = useAntrag((s) => {
    const a = s.projektdatei?.antraege?.[aktiveFassung(s, projekt)];
    return eingereichtVon(a) ? a?.stand : undefined;
  });
  const markiert = bereitJeFassung?.[fassung] ?? [];
  const { bereitUmschalten } = useAntrag.getState();
  const [vorschau, setVorschau] = useState<string | null | undefined>(undefined);
  const basis = verbinde(ablage.root, ablage.pfad);
  const art = artDerFassung(fassung);
  const codes = projektCodes(projekt);
  // Stellen von Projektcode, Antragsart und Datum nach dem Namensschema (der Projektdatei bzw. des Büros)
  const schema = useFormulare(namensschemaVon);
  const reihenfolge = schema.reihenfolge;

  const liste = dateien
    .filter((d) => !d.ordner && !istHilfsdatei(d.pfad))
    .sort((a, b) => a.pfad.localeCompare(b.pfad, 'de', { numeric: true, sensitivity: 'base' }))
    .map((d) => {
      const fehler = antragsNameFehler(d.pfad, { codes, art, reihenfolge, schema });
      const m = markiert.find((b) => b.datei.toLowerCase() === d.pfad.toLowerCase());
      // zugehöriges Dokument: die verknüpfte bzw. gefundene Datei – bei einem Plansatz jede seiner Plandateien
      const dok = dokumentZu(dokumente, d.pfad);
      return { d, fehler, zustand: bereitschaft(d, m, fehler), dok, seit: seitEinreichung(d, stand) };
    });
  const seitNeu = liste.filter((x) => x.seit === 'neu').length;
  const seitGeaendert = liste.filter((x) => x.seit === 'geaendert').length;
  // eingereichte Dateien, die seitdem aus dem Ordner verschwunden sind (gelöscht oder verschoben) – nicht, wenn der
  // Ordner gerade nicht lesbar war
  const entfernt = lesefehler
    ? []
    : entferntSeitEinreichung(
        liste.map((x) => x.d.pfad),
        stand,
      );
  const seitText = [seitNeu ? `${seitNeu} neu` : '', seitGeaendert ? `${seitGeaendert} geändert` : '', entfernt.length ? `${entfernt.length} entfernt` : ''].filter(Boolean).join(', ');
  const bereit = liste.filter((x) => x.zustand === 'bereit').length;
  // fehlt ganz: ein Dokument ohne Datei, ein Plansatz ohne einen einzigen Plan
  const fehlend = dokumente.filter((x) => x.status !== 'entfaellt' && (x.plansatz ? !x.plansatz.plaene.length : !x.datei));
  // Plansätze: fehlende Nummern und noch nicht verschobene Pläne einzeln
  const fehlendePlaene = dokumente.flatMap((x) =>
    x.status !== 'entfaellt' && x.plansatz ? x.plansatz.plaene.filter((p) => p.zustand === 'fehlt' || p.zustand === 'quelle').map((p) => ({ dok: x, p })) : [],
  );
  const vollstaendig = liste.length > 0 && bereit === liste.length && !fehlend.length && !fehlendePlaene.length;
  // Umbenennen: Kopf nach dem Namensschema vor die Bezeichnung, Vorhandenes übernehmen (antrag.ts)
  const vorschlag = (name: string, geaendert?: number) => nameNachFormat(name, { codes, art, datum: new Date(geaendert || Date.now()), reihenfolge, schema });
  const muster = antragsMuster(codes, art, reihenfolge);

  const menue = (pfad: string, zustand: Bereitschaft, fehler: string | null, geaendert?: number): MenuePunkt[] => [
    {
      text: zustand === 'bereit' || zustand === 'geaendert' ? 'Nicht mehr bereit' : 'Als bereit markieren',
      symbol: 'haken',
      ...(fehler ? { hinweis: 'Namensformat passt nicht' } : {}),
      aktion: () => void bereitUmschalten(pfad),
    },
    // nur, wenn der Vorschlag etwas ändert (fehlt bloß die Bezeichnung, ist er der Name selbst)
    ...(fehler && vorschlag(pfad, geaendert) !== pfad
      ? [
          {
            text: 'Umbenennen nach Namensformat …',
            symbol: 'stift' as const,
            aktion: () => void umbenennen(basis, `${ordner}/${pfad}`, vorschlag(pfad, geaendert), `Dateien im Antragsordner heißen „${muster} …“.`),
          },
        ]
      : []),
    { text: 'In der Vorschau durchblättern', symbol: 'auge', aktion: () => setVorschau(pfad) },
    { trenner: true },
    ...dateiMenue(basis, `${ordner}/${pfad}`),
  ];

  return (
    <div className="fo-antrag-ablage">
      <p className="nav-ablage-name" title={verbinde(basis, ordner)}>
        {ordner}
      </p>
      <div className={`fo-bereit-kopf${vollstaendig ? ' vollstaendig' : ''}`} aria-label="Vollständigkeit des Antragsordners">
        <span>
          <strong>
            {bereit} von {liste.length}
          </strong>{' '}
          bereit
          {umfangDa && fehlend.length + fehlendePlaene.length > 0 && ` · ${fehlend.length + fehlendePlaene.length} ${fehlend.length + fehlendePlaene.length === 1 ? 'fehlt' : 'fehlen'}`}
        </span>
        <span className="fo-bereit-balken" aria-hidden>
          <span style={{ width: `${liste.length ? (bereit / liste.length) * 100 : 0}%` }} />
        </span>
        {vollstaendig && <span className="fo-bereit-fertig">Alles bereit</span>}
      </div>
      {stand && (
        <p
          className={`fo-stand${seitText ? ' abweichend' : ''}`}
          role="status"
          title={entfernt.length ? `Seit der Einreichung nicht mehr im Ordner:\n${entfernt.map((x) => x.pfad).join('\n')}` : undefined}
        >
          <Symbol name="schloss" /> Eingereicht am {stand.tag.split('-').reverse().join('.')} – Stand festgehalten
          {seitText ? ` · ${seitText} seit der Einreichung` : ' · seitdem unverändert'}
        </p>
      )}
      {stand && entfernt.length > 0 && (
        <ul className="fo-stand-entfernt" aria-label="Seit der Einreichung entfernt">
          {/* höchstens drei Namen – alle stehen im Tooltip der Summe */}
          {(entfernt.length > 3 ? entfernt.slice(0, 2) : entfernt).map((x) => (
            <li key={x.pfad}>
              <span className="fo-seit entfernt" title="entfernt seit der Einreichung">
                entfernt
              </span>
              <span className="fo-stand-name">{x.pfad}</span>
            </li>
          ))}
          {entfernt.length > 3 && <li className="fo-stand-weitere">und {entfernt.length - 2} weitere (alle im Tooltip der Zeile darüber)</li>}
        </ul>
      )}
      <div className="fo-bereit-knoepfe">
        <button className="small" disabled={!liste.length} title="Alle Antragsunterlagen groß ansehen und durchblättern (mit Zoom)" onClick={() => setVorschau(null)}>
          <Symbol name="auge" /> Ansehen
        </button>
        <SammelExportKnopf mitText />
      </div>
      {vorschau !== undefined && <UnterlagenVorschau ablage={ablage} start={vorschau ?? undefined} onClose={() => setVorschau(undefined)} />}
      {lesefehler ? (
        <p className="nav-leer" role="status">
          Der Ordner {ordner} ist gerade nicht lesbar – beim nächsten Lesen wird es nachgeholt.
        </p>
      ) : (
        !liste.length && <p className="nav-leer">Im Ordner {ordner} liegen noch keine Dokumente.</p>
      )}
      <ul className="fo-baum fo-bereit-liste">
        {liste.map(({ d, fehler, zustand, dok, seit }) => (
          <li key={d.pfad} className={`fo-bereit-zeile ${zustand}${seit ? ` seit-${seit}` : ''}`}>
            <button
              className="fo-bereit-knopf"
              aria-pressed={zustand === 'bereit'}
              aria-label={`${d.pfad}: ${BEREIT_TEXT[zustand]}`}
              title={fehler ? `${BEREIT_TEXT.name}: ${fehler}` : zustand === 'bereit' ? 'Bereit – Klick hebt die Markierung auf' : `${BEREIT_TEXT[zustand]} – Klick markiert als bereit`}
              disabled={!!fehler}
              onClick={() => void bereitUmschalten(d.pfad)}
            >
              {ZEICHEN[zustand]}
            </button>
            <button
              className={`fo-baum-zeile${offenPfad === `${ordner}/${d.pfad}` ? ' aktiv' : ''}`}
              title={`${d.pfad}${dok ? ` – ${dok.eintrag.titel}` : ''}${fehler ? `\n${fehler}` : ''}\n${zeitLang(d.geaendert)}`}
              onClick={() => dateiArtVon(d.pfad) && void useFormulare.getState().dateiAnsehen(basis, `${ordner}/${d.pfad}`)}
              onDoubleClick={() => void oeffnePfad(verbinde(basis, `${ordner}/${d.pfad}`)).catch(() => undefined)}
              onContextMenu={(e) => zeigeMenue(e, menue(d.pfad, zustand, fehler, d.geaendert))}
            >
              <span className={`fo-baum-symbol ${dateiArt(d.pfad)}`}>
                <Symbol name={SYMBOL[dateiArt(d.pfad)]} />
              </span>
              <span className="fo-baum-name">
                {d.pfad}
                {(dok || fehler) && <span className="fo-bereit-unter">{fehler ? 'Namensformat passt nicht' : dok!.eintrag.titel}</span>}
                {/* kurz – der Bezug („seit der Einreichung“) steht in der Zeile darüber, voll im Tooltip */}
                {seit && (
                  <span className={`fo-seit ${seit}`} title={SEIT_EINREICHUNG_TEXT[seit]}>
                    {seit === 'neu' ? 'neu' : 'geändert'}
                  </span>
                )}
              </span>
              {d.geaendert ? <span className="fo-baum-zeit">{zeitKurz(d.geaendert)}</span> : null}
            </button>
          </li>
        ))}
      </ul>
      {umfangDa && fehlend.length + fehlendePlaene.length > 0 && (
        <>
          <p className="fo-bereit-titel">Fehlt im Antragsordner</p>
          <ul className="fo-baum fo-bereit-fehlt">
            {fehlend.map((x) => (
              <li key={x.eintrag.id} className="fo-baum-zeile" title={`${x.eintrag.titel}: noch keine Datei im Ordner ${ordner}`}>
                <StatusPunkt status={x.status === 'aktuell' ? 'offen' : x.status} />
                <span className="fo-baum-name">{x.eintrag.titel}</span>
              </li>
            ))}
            {fehlendePlaene.map(({ dok, p }) => (
              <li key={`${dok.eintrag.id}|${p.schluessel}`} className="fo-baum-zeile" title={`${dok.eintrag.titel}: ${p.schluessel} – ${PLAN_ZUSTAND_TEXT[p.zustand]}`}>
                <StatusPunkt status={p.zustand === 'fehlt' ? 'unvollstaendig' : 'offen'} titel={PLAN_ZUSTAND_TEXT[p.zustand]} />
                <span className="fo-baum-name">
                  {p.schluessel}
                  {p.bezeichnung ? ` ${p.bezeichnung}` : ''}
                  <span className="fo-bereit-unter">{PLAN_ZUSTAND_KURZ[p.zustand]}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
