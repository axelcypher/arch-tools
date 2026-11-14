import { useEffect, useRef, useState } from 'react';
import type { MenuePunkt } from '@core/ui/Menue';
import { useMenueOffen, zeigeMenueAn } from '@core/ui/Menue';
import { Symbol } from '@core/ui/Symbol';
import type { LeistenTeil } from '@core/ui/Werkzeugleiste';
import { Werkzeugleiste } from '@core/ui/Werkzeugleiste';
import { isTauri } from '@core/platform/files';
import type { Pruefstand } from '../pruefung';
import { aktuelleLage } from '../pruefung';
import { heute, istGeaendert, useBaurecht } from '../store';
import { datum } from './Ampel';

const EBENE_TEXT = { land: 'Land', kreis: 'Kreis', gemeinde: 'Gemeinde' } as const;
const MODUL_TEXT = { land: 'Landesmodul', kreis: 'Kreismodul', gemeinde: 'Gemeindemodul' } as const;

const datumZeit = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
};

/** „Gespeichert“ neben dem Knopf – einige Sekunden sichtbar, in einer stehenden Live-Region (wird verlässlich vorgelesen) */
function GespeichertMeldung() {
  const m = useBaurecht((s) => s.gespeichertMeldung);
  const [zeigen, setZeigen] = useState(false);
  useEffect(() => {
    // aus dem Prüfprotokoll gespeichert: dort steht die Rückmeldung (im Dialog) – hier nicht noch einmal
    if (!m || document.querySelector('.br-protokoll')) return;
    setZeigen(true);
    const t = setTimeout(() => setZeigen(false), 4000);
    return () => clearTimeout(t);
  }, [m]);
  return (
    <span className="br-gespeichert" role="status">
      {zeigen && m ? m.text : ''}
    </span>
  );
}

/**
 * Kopfleiste (Werkzeugleiste, design.md „Kopf- und Werkzeugleisten“): links „Speichern“, dann Antrag, Einreichung,
 * Module und Rechtsstand mit ihren Marken, rechts der Hauptknopf „Prüfprotokoll …“, zuletzt „Mehr“ mit den seltenen
 * Befehlen „Lage abfragen“ und „Rechtsstand prüfen“ (Desktop). Reicht die Breite nicht, kürzen sich Module und
 * Rechtsstand; danach wandert die Wahl des Antrags ins Menü. Unter 1600 px (Breite der App) werden die Warnungen zu
 * einer Sammelmarke, die dasselbe Menü öffnet.
 */
export function Kopf({
  stand,
  onRechtsstand,
  onLage,
  onProtokoll,
  onSpeichern,
  onAntrag,
  lageLaeuft,
}: {
  stand: Pruefstand;
  onRechtsstand: () => void;
  onLage: () => void;
  onProtokoll: () => void;
  onSpeichern: () => void;
  onAntrag: (antrag: string) => void;
  lageLaeuft: boolean;
}) {
  const antrag = useBaurecht((s) => s.antrag);
  const dirty = useBaurecht(istGeaendert);
  const antraege = useBaurecht((s) => s.antraege);
  const einreichung = useBaurecht((s) => s.pruefung.einreichung);
  const laedt = useBaurecht((s) => s.laedt);
  const paket = useBaurecht((s) => s.paket);
  const paketMeldung = useBaurecht((s) => s.paketMeldung);
  const normen = stand.auswertung.normen.filter((n) => n.def.quelle.art !== 'verweis');
  const fehler = normen.filter((n) => n.fehler).length;
  const geaendert = stand.auswertung.paragrafen.filter((p) => p.geaendert.length || p.ueberholt).length;
  const kuenftig = normen.filter((n) => n.kuenftige?.length).length;
  // Rechtsstand: der älteste Stand der aktiven Normen (nicht die Uhrzeit des letzten Laufs)
  const zeiten = normen
    .map((n) => n.geprueft)
    .filter((x): x is string => !!x)
    .sort();
  const nie = normen.length - zeiten.length;
  const ags = stand.auswertung.fakten['lage.ags'];
  const agsVorschlag = ags?.sicherheit === 'hinweis' && !ags.bestaetigt && !ags.widerspruch;
  const agsWiderspruch = !!ags?.widerspruch;
  // die Gemeinde zuerst: kürzt sich die Zeile, fällt der Bund weg, nicht die Gemeinde
  const moduleText = [...stand.module]
    .reverse()
    .map((m) => m.name)
    .join(' · ');
  const desktop = isTauri();
  const ungeprueft = desktop && !laedt.length && !zeiten.length;
  // „nie geprüft“ nur, wenn ein Teil geprüft ist – sonst sagt „Rechtsstand nicht geprüft“ dasselbe
  const warnungen =
    !laedt.length && desktop
      ? [nie && !ungeprueft ? `${nie} nie geprüft` : '', fehler ? `${fehler} nicht abrufbar` : '', geaendert ? `${geaendert} geändert` : '', kuenftig ? `${kuenftig} neue Fassung` : ''].filter(Boolean)
      : [];
  const warnText = [ungeprueft ? 'Rechtsstand noch nicht geprüft' : '', ...warnungen].filter(Boolean);
  const zurAgs = () => useBaurecht.getState().fokusSetzen('lage.ags');
  const project = useBaurecht((s) => s.project);
  const lageProblem = aktuelleLage(project).problem;
  const lageText = lageProblem === 'fehlen' ? 'Keine Koordinaten' : lageProblem === 'veraltet' ? 'Koordinaten veraltet' : '';
  const lageTitel =
    lageProblem === 'veraltet'
      ? 'Die Adresse wurde geändert, die Koordinaten passen nicht mehr dazu. Ergebnisse der Geodienste und Bestätigungen zur Lage gelten bis zur Aktualisierung nur als Hinweis.'
      : 'Keine Koordinaten zum Vorhaben (Adresse in den Stammdaten eintragen). Ergebnisse der Geodienste und Bestätigungen zur Lage gelten nur als Hinweis.';
  // feste Punkte von „Mehr“ (nur Desktop – die Web-Version holt keine Texte und fragt keine Lage ab); dieselben öffnet
  // auch die Sammelmarke der Warnungen; die Warnungen stehen als Hinweis an „Rechtsstand prüfen“ (dort ist der Weg, sie
  // zu beheben)
  const mehrPunkte = (): MenuePunkt[] =>
    !desktop
      ? []
      : [
          {
            text: 'Lage abfragen',
            aktion: onLage,
            deaktiviert: lageLaeuft,
            hinweis: lageLaeuft ? 'läuft' : undefined,
            titel: 'Gemeindeschlüssel, Flurstück und Schutzgebiete aus den Geodiensten am Grundstück',
          },
          {
            text: 'Rechtsstand prüfen',
            aktion: onRechtsstand,
            deaktiviert: laedt.length > 0,
            // kurz im Menü (sonst wird es sehr breit), alle Warnungen im Tooltip
            hinweis: laedt.length ? 'Texte werden geholt' : warnText.length > 1 ? `${warnText.length} Warnungen` : warnText[0],
            titel: ['Alle Texte sofort an der Quelle prüfen', ...warnText].join(' · '),
          },
        ];
  const marke = useRef<HTMLButtonElement>(null);
  const markeOffen = useMenueOffen(marke);
  const modulMarken = agsWiderspruch || agsVorschlag || !!lageText || stand.fehlend.length > 0;
  const rechtsstandTitel = `${paket.herkunft === 'nachgeladen' ? 'Regelpaket nachgeladen' : 'Regelpaket des Builds'} ${paket.version}${paketMeldung ? ` – ${paketMeldung}` : ''}${zeiten.length ? ` · Normen zuletzt an der Quelle bestätigt zwischen ${datumZeit(zeiten[0])} und ${datumZeit(zeiten[zeiten.length - 1])}` : ''}`;
  const teile: LeistenTeil[] = [
    {
      id: 'speichern',
      gruppe: true,
      inhalt: (
        <>
          {/* ungespeicherte Änderungen als Punkt in der Ecke (Designsystem) – ändert die Breite der Leiste nicht */}
          <button
            type="button"
            className={dirty ? 'ungespeichert' : undefined}
            aria-label={dirty ? 'Speichern – ungespeicherte Änderungen' : 'Speichern'}
            onClick={onSpeichern}
            title={dirty ? 'Ungespeicherte Änderungen – in der Projektdatei speichern (Strg+S)' : 'In der Projektdatei speichern (Strg+S)'}
          >
            {/* Kompaktstufe der Werkzeugleiste: nur das Symbol, der Name steht in aria-label und title */}
            <Symbol name="speichern" /> <span className="tb-text">Speichern</span>
          </button>
          <GespeichertMeldung />
        </>
      ),
    },
    {
      id: 'antrag',
      // wandert als Erstes ins Menü (als Einfachauswahl), wenn Module und Rechtsstand schon gekürzt sind
      rang: 1,
      menue: { text: `Antrag: ${antrag}`, unter: antraege.map((a) => ({ text: a, gewaehlt: a === antrag, aktion: () => onAntrag(a) })) },
      inhalt: (
        <label className="br-kopf-feld">
          <span className="tb-label br-kopf-label">Antrag</span>
          <select className="br-antrag-wahl" value={antrag} onChange={(e) => onAntrag(e.target.value)} aria-label="Antrag" title={antrag}>
            {antraege.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
      ),
    },
    {
      id: 'einreichung',
      inhalt: (
        <label className="br-kopf-feld" title="Stichtag der Prüfung: Fassung der Gesetze am Tag der Einreichung (z. B. § 42a, § 90 BauO NRW)">
          <span className="tb-label br-kopf-label">Einreichung</span>
          <input
            type="date"
            value={einreichung ?? heute()}
            min="2018-01-01"
            aria-label="Geplante Einreichung (Stichtag)"
            onChange={(e) => useBaurecht.getState().einreichungSetzen(e.target.value === heute() ? '' : e.target.value)}
          />
        </label>
      ),
    },
    {
      // Liste der Module: kürzt sich zuerst (ganz im Tooltip)
      id: 'module',
      kuerzbar: true,
      inhalt: (
        <span
          className="br-module-text"
          title={`Regelmodule: ${[...stand.module]
            .reverse()
            .map((m) => `${m.name} (Stand ${/^\d{4}-\d\d-\d\d$/.test(m.version) ? datum(m.version) : m.version})`)
            .join(', ')}`}
        >
          {moduleText}
        </span>
      ),
    },
    // Marken der Module (Gemeinde, Lage, fehlende Ebene): Status, bleiben sichtbar und werden nie gekürzt
    ...(modulMarken
      ? [
          {
            id: 'modul-marken',
            inhalt: (
              <span className="br-kopf-marken">
                {agsWiderspruch && (
                  <button
                    type="button"
                    className="br-modul-chip br-modul-widerspruch"
                    onClick={zurAgs}
                    title={`Gemeindeschlüssel widersprüchlich: ${ags?.widerspruch ?? ''} – bis zur Klärung gelten die Werte der Gebietsmodule nur als Hinweis. Klick: zur Angabe.`}
                  >
                    Gemeinde widersprüchlich
                  </button>
                )}
                {agsVorschlag && (
                  <button
                    type="button"
                    className="br-modul-chip br-modul-fehlt"
                    onClick={zurAgs}
                    title={`Der Gemeindeschlüssel ist nur vorgeschlagen – bis zur Bestätigung gelten die Werte der Gebietsmodule nur als Hinweis. Klick: zur Angabe${desktop ? ' (oder „Lage abfragen“)' : ''}.`}
                  >
                    Gemeinde unbestätigt
                  </button>
                )}
                {lageText &&
                  (desktop ? (
                    <button
                      type="button"
                      className="br-modul-chip br-modul-fehlt"
                      onClick={onLage}
                      disabled={lageLaeuft}
                      title={lageLaeuft ? `${lageTitel} Die Lage wird gerade abgefragt.` : `${lageTitel} Klick: Lage abfragen.`}
                    >
                      {lageText}
                    </button>
                  ) : (
                    <span className="br-modul-chip br-modul-fehlt" title={lageTitel} tabIndex={0}>
                      {lageText}
                    </span>
                  ))}
                {stand.fehlend.map((e) => (
                  <span
                    key={e}
                    className="br-modul-chip br-modul-fehlt"
                    title={
                      stand.ags
                        ? `Für diesen Gemeindeschlüssel gibt es kein ${MODUL_TEXT[e]} – die Vorschriften dieser Ebene von Hand prüfen.`
                        : `Gemeindeschlüssel fehlt – ${desktop ? '„Lage abfragen“ oder ' : ''}in den Angaben eintragen.`
                    }
                  >
                    {stand.ags ? `kein ${MODUL_TEXT[e]}` : `${EBENE_TEXT[e]}: Gemeindeschlüssel fehlt`}
                  </span>
                ))}
              </span>
            ),
          },
        ]
      : []),
    {
      // Rechtsstand (und eine laufende Abfrage der Lage): Status, kürzt sich (ganz im Tooltip); eine stehende
      // Live-Region – auch leer im DOM, damit „Texte werden geholt …“ verlässlich angesagt wird
      id: 'rechtsstand',
      kuerzbar: true,
      inhalt: (
        <span className="br-rechtsstand" aria-live="polite" title={rechtsstandTitel}>
          {lageLaeuft ? (
            <span className="br-laedt">Lage wird abgefragt …</span>
          ) : laedt.length ? (
            <span className="br-laedt">{laedt.length} Texte werden geholt …</span>
          ) : !desktop ? (
            <span className="br-leise">Web-Version: ohne Gesetzestexte</span>
          ) : zeiten.length ? (
            <span className="br-rechtsstand-zeit">Rechtsstand {datumZeit(zeiten[0])}</span>
          ) : null}
        </span>
      ),
    },
    // Warnungen zum Rechtsstand: breit einzeln, schmal als Sammelmarke – nie gekürzt
    ...(ungeprueft || warnungen.length
      ? [
          {
            id: 'warnungen',
            inhalt: (
              <>
                <span className="br-kopf-marken br-nur-breit" role="group" aria-label="Warnungen zum Rechtsstand">
                  {ungeprueft && <span className="br-marke br-marke-warn">Rechtsstand nicht geprüft</span>}
                  {warnungen.map((w) => (
                    <span key={w} className="br-marke br-marke-warn">
                      {w}
                    </span>
                  ))}
                </span>
                <span className="br-kopf-marken br-nur-schmal">
                  {/* Sammelmarke als Knopf: öffnet die festen Punkte von „Mehr“ (Warnungen im Einzelnen an „Rechtsstand prüfen“) */}
                  <button
                    type="button"
                    ref={marke}
                    className="br-marke br-marke-warn br-marke-knopf"
                    title={warnText.join(' · ')}
                    aria-haspopup="menu"
                    aria-expanded={markeOffen}
                    // kurz „N Warnungen“ (die Marke steht beim Rechtsstand); der Name beginnt mit dem sichtbaren Text
                    aria-label={warnText.length === 1 ? undefined : `${warnText.length} Warnungen zum Rechtsstand`}
                    onClick={(e) => zeigeMenueAn(e.currentTarget, mehrPunkte(), 'Rechtsstand')}
                  >
                    {warnText.length === 1 ? warnText[0] : `${warnText.length} Warnungen`}
                  </button>
                </span>
              </>
            ),
          },
        ]
      : []),
    { abstand: true },
    {
      id: 'protokoll',
      inhalt: (
        <button type="button" className="primary" onClick={onProtokoll} title="Prüfprotokoll ansehen, drucken, abschließen">
          Prüfprotokoll …
        </button>
      ),
    },
  ];
  return <Werkzeugleiste teile={teile} mehr={mehrPunkte} name="Prüfung" className="br-kopf" />;
}

/** „Klärt am meisten“: die Angaben, die die meisten offenen Paragrafen entscheiden (oben in den Angaben) */
export function Klaeren({ stand }: { stand: Pruefstand }) {
  // fehlende Angaben und Hinweise, deren Bestätigung entscheidet – zusammen nach Wirkung geordnet (das Planungsrecht steht
  // mit „klärt N“ im Hinweis direkt darunter, nicht noch einmal als Chip)
  const liste = [...stand.auswertung.klaerung.map((k) => ({ ...k, bestaetigen: false })), ...(stand.auswertung.bestaetigen ?? []).map((k) => ({ ...k, bestaetigen: true }))]
    .sort((a, b) => b.anzahl - a.anzahl)
    .slice(0, 4);
  if (!liste.length) return null;
  return (
    <div className="br-klaeren" role="group" aria-label="Angaben, die am meisten klären">
      <h3 className="br-klaeren-titel">Klärt am meisten</h3>
      {liste.map((k) => (
        <button
          key={k.id}
          type="button"
          className="br-chip-knopf"
          onClick={() => useBaurecht.getState().fokusSetzen(k.bestaetigen ? `${k.id}:bestaetigen` : k.id)}
          title={k.bestaetigen ? `Bestätigen entscheidet ${k.anzahl} Paragrafen, die nur wegen dieses Hinweises offen sind` : `Diese Angabe entscheidet ${k.anzahl} offene Paragrafen`}
        >
          {/* bei schmaler Leiste wird nur der Name gekürzt – die Zahl bleibt stehen */}
          <span className="br-chip-name">{k.titel}</span>{' '}
          <span className="br-chip-zahl">
            {k.bestaetigen ? 'bestätigen klärt' : 'klärt'} {k.anzahl}
          </span>
        </button>
      ))}
    </div>
  );
}
