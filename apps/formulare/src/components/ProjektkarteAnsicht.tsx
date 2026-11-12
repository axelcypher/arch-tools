import type { KeyboardEvent, ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { PkEintrag, PkGruppe, PkWert } from '../forma/projektkarte';
import { pkArt, pkEintrag, pkMoeglichkeiten, pkSchluessel, pkTitel, pkWertVon } from '../forma/projektkarte';
import { anschrift, aufbau, einheit, feldTitel, gruppenReihen, istAdresse, istAnzahl, nutzungsarten, pruefung, zusammenfassung } from '../projektkarteAufbau';
import type { Adresse } from '../adressbuch';
import { adressName, adressOrt, adressSchluessel, adressenAusKarte, inRolle } from '../adressbuch';
import type { Angabe } from '../projektdaten';
import { IN_PROJEKTKARTE } from '../projektdaten';
import { OAP_ANGABEN, angabenAus } from '../oap';
import { projektdateiPfad } from '@core/projektdatei';
import type { Stammadresse } from '../stammdaten';
import { stammdatenLaden } from '../stammdaten';
import { Symbol } from './Symbol';
import type { FeldDef } from '@core/ui/ansicht';
import { felderDerAnsicht, useAnsicht } from '@core/ui/ansicht';
import { AnsichtAnzeige, AnsichtEditor } from '@core/ui/AnsichtEditor';
import { BreitenLeiste } from '@core/ui/Leiste';
import type { KartenWert, OffeneKarte } from '../store';
import { KARTEN_ANSICHT, kartenVerknuepfbar, karteMitAenderungen, karteText, karteWert, useFormulare } from '../store';

/** zuletzt gewählte Gruppe je Projekt (bleibt beim Wechsel zwischen Formular und Projektkarte) */
const gewaehlt = new Map<string, number>();

const leer = (e: PkEintrag): PkWert => (pkArt(e) === 'kreuz' ? 0 : pkArt(e) === 'auswahl' || pkArt(e) === 'optionen' ? null : '');

/** Zum Eintrag springen (nach Suche oder Rückgängig) */
export function zeigeEintrag(schluessel: string) {
  const el = document.querySelector<HTMLElement>(`[data-pk="${schluessel}"]`);
  if (!el) return false;
  el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  el.focus({ preventScroll: true });
  return true;
}

/**
 * Projektkarte: links die Gruppen (Projekt, Beteiligte) mit Kurzfassung, rechts die gewählte Gruppe als
 * gegliedertes Formular. Auswahllisten und Optionen wie in FORMA, Übernehmen aus anderen Gruppen und aus den
 * Bürostammdaten, Hinweise auf Tippfehler. Gespeichert wird über die Werkzeugleiste in die Projektkarte des
 * FORMA-Projekts.
 */
export function ProjektkarteAnsicht() {
  const karte = useFormulare((s) => s.karte);
  const projekt = useFormulare((s) => s.projekt);
  const ds = useFormulare((s) => s.ds);
  const { karteLaden } = useFormulare.getState();
  const [geladen, setGeladen] = useState(!!karte);

  useEffect(() => {
    if (!karte) void karteLaden().finally(() => setGeladen(true));
  }, [karte, karteLaden]);

  if (!ds) return <div className="fo-leer">Die Projektkarte gibt es nur in der Desktop-App.</div>;
  if (!projekt) return null;
  if (!karte)
    return (
      <div className="fo-leer">
        {geladen ? (
          <>
            <h2>Keine Projektkarte</h2>
            <p>
              Im Projekt <strong>{projekt.ordner}</strong> gibt es keine lesbare Projektkarte.
            </p>
            <button onClick={() => void karteLaden()}>Erneut lesen</button>
          </>
        ) : (
          <p className="muted">Projektkarte wird gelesen …</p>
        )}
      </div>
    );
  return <Karte key={`${projekt.root}|${projekt.ordner}`} karte={karte} />;
}

function Karte({ karte }: { karte: OffeneKarte }) {
  const projektKey = `${karte.projekt.root}|${karte.projekt.ordner}`;
  const reihen = useMemo(() => gruppenReihen(karte.karte), [karte.karte]);
  const alle = reihen.flatMap((r) => r.gruppen);
  const [gruppeId, setGruppeId] = useState<number>(() => gewaehlt.get(projektKey) ?? alle[0]?.id ?? 0);
  const [suche, setSuche] = useState('');
  const [stamm] = useState<Stammadresse[]>(stammdatenLaden);
  /** -1 = Abgleich mit der Projektdatei (.oap), -3 = eigene Ansicht */
  const gruppe = gruppeId === PROJEKTDATEN || gruppeId === EIGENE ? null : (alle.find((g) => g.id === gruppeId) ?? alle[0]);

  const waehle = (id: number, eintrag?: string) => {
    gewaehlt.set(projektKey, id);
    setGruppeId(id);
    if (eintrag) requestAnimationFrame(() => zeigeEintrag(eintrag));
  };

  // nach Rückgängig/Wiederholen in eine andere Gruppe wechseln (App ruft zeigeEintrag; fehlt das Element, Gruppe umschalten)
  useEffect(() => {
    const beiSprung = (ev: Event) => {
      const s = (ev as CustomEvent<string>).detail;
      const g = Number(s.split(':')[0]);
      if (g && g !== gruppeId) waehle(g, s);
    };
    window.addEventListener('formulare:pk-sprung', beiSprung);
    return () => window.removeEventListener('formulare:pk-sprung', beiSprung);
  });

  if (!alle.length) return <div className="fo-leer">Die Projektkarte enthält keine Einträge.</div>;

  return (
    <div className="pk">
      <BreitenLeiste schluessel="formulare:breite:projektkarte" vorgabe={270}>
        <Navigation karte={karte} reihen={reihen} aktiv={gruppe?.id ?? gruppeId} suche={suche} setSuche={setSuche} onWahl={waehle} />
      </BreitenLeiste>
      {gruppe ? (
        <GruppenEditor key={gruppe.id} karte={karte} gruppe={gruppe} alleGruppen={alle} stamm={stamm} />
      ) : gruppeId === EIGENE ? (
        <EigeneAnsicht karte={karte} />
      ) : (
        <ProjektdatenAbgleich karte={karte} />
      )}
    </div>
  );
}

/** Kennung des Abgleichs mit der Projektdatei (.oap) in der Navigation */
const PROJEKTDATEN = -1;
/** Kennung der eigenen Ansicht in der Navigation */
const EIGENE = -3;

export { KARTEN_ANSICHT };

/** Katalog der Projektkarte für den Ansicht-Editor: jeder Eintrag jeder Gruppe (Kennung „Gruppe:Eintrag“) */
function kartenKatalog(karte: OffeneKarte): FeldDef[] {
  return karte.karte.gruppen.flatMap((g) =>
    karte.karte.eintraege
      .filter((e) => e.gruppe === g.id)
      .map((e) => ({ id: pkSchluessel(g.id, e.id), titel: feldTitel(e.titel), gruppe: g.text, breit: pkArt(e) === 'mehrzeilig' })),
  );
}

/**
 * Eigene Ansicht der Projektkarte: die im Büro genutzten Einträge aus allen Gruppen auf einer Seite, in eigenen
 * Abschnitten und eigener Reihenfolge – zusammengestellt im Ansicht-Editor (gilt für alle Projekte).
 */
function EigeneAnsicht({ karte }: { karte: OffeneKarte }) {
  const [ansicht, setAnsicht] = useAnsicht(KARTEN_ANSICHT);
  const [editor, setEditor] = useState(false);
  const katalog = useMemo(() => kartenKatalog(karte), [karte.karte]); // eslint-disable-line react-hooks/exhaustive-deps
  const feld = (f: FeldDef, o: { label: string; verknuepft: string[] }) => {
    const [g, id] = f.id.split(':').map(Number);
    const gruppe = karte.karte.gruppen.find((x) => x.id === g);
    const eintrag = karte.karte.eintraege.find((e) => e.gruppe === g && e.id === id);
    if (!gruppe || !eintrag) return null;
    const mit = o.verknuepft.map((v) => katalog.find((k) => k.id === v)).filter((k): k is FeldDef => !!k);
    const unter = (
      <>
        {gruppe.text}
        {mit.length > 0 && (
          <span className="pk-eigen-link" title={`Verknüpft – wird gemeinsam ausgefüllt mit: ${mit.map((k) => `${k.titel} (${k.gruppe})`).join(', ')}`}>
            {' '}
            · ⛓ {mit.map((k) => k.gruppe).join(', ')}
          </span>
        )}
      </>
    );
    return (
      <div className="pk-eigen-feld">
        {pkArt(eintrag) === 'kreuz' ? (
          <Kreuze karte={karte} eintraege={[eintrag]} titelText={o.label} unter={unter} />
        ) : (
          <Eintrag karte={karte} gruppe={gruppe} eintrag={eintrag} breite={12} land={karteText(karte, g, 120)} titelText={o.label} unter={unter} />
        )}
      </div>
    );
  };
  return (
    <section className="pk-editor" aria-label="Eigene Ansicht">
      <header className="pk-kopf">
        <div className="pk-kopf-text">
          <h2>Eigene Ansicht</h2>
          <span className="muted">Die Einträge, die ihr nutzt – aus allen Gruppen auf einer Seite. Gilt für alle Projekte.</span>
        </div>
        <div className="pk-aktionen">
          <button onClick={() => setEditor(true)}>
            <Symbol name="stift" /> Ansicht bearbeiten …
          </button>
        </div>
      </header>
      <div className="pk-koerper">
        <div className="pk-abschnitte pk-eigen">
          {ansicht && felderDerAnsicht(ansicht).length ? (
            <AnsichtAnzeige ansicht={ansicht} katalog={katalog} feld={feld} />
          ) : (
            <div className="pk-eigen-leer">
              <p>Noch keine eigene Ansicht. Stellt euch die Einträge zusammen, die ihr in jedem Projekt braucht – etwa Vorhaben, Bauherr, Grundstück und Bauaufsicht.</p>
              <button className="primary" onClick={() => setEditor(true)}>
                Ansicht zusammenstellen …
              </button>
            </div>
          )}
        </div>
      </div>
      {editor && (
        <AnsichtEditor
          titel="Projektkarte: eigene Ansicht"
          text="Rechts Einträge der Projektkarte anhaken – sie kommen in den gewählten Abschnitt. Links ordnen: am Griff ziehen (auch in einen anderen Abschnitt) oder Griff wählen und ↑/↓."
          katalog={katalog}
          ansicht={ansicht}
          onChange={setAnsicht}
          onSchliessen={() => setEditor(false)}
          verknuepfbar={(a, b) => kartenVerknuepfbar(eintragVon(karte, a.id), eintragVon(karte, b.id))}
        />
      )}
    </section>
  );
}

/** Eintrag der Projektkarte zu einer Kennung „Gruppe:Eintrag“ */
const eintragVon = (karte: OffeneKarte, kennung: string) => {
  const [g, id] = kennung.split(':').map(Number);
  return karte.karte.eintraege.find((e) => e.gruppe === g && e.id === id);
};

/** Leere Adressgruppen mit den Vorgaben der Stammdaten füllen */
function vorgabenFuer(karte: OffeneKarte, adressen: Adresse[], vorgaben: Record<string, string>): KartenWert[] {
  const out: KartenWert[] = [];
  for (const g of karte.karte.gruppen.filter(istAdresse)) {
    if (karteText(karte, g.id, 40).trim()) continue;
    const a = adressen.find((x) => x.schluessel === vorgaben[String(g.id)]);
    if (!a) continue;
    for (const e of karte.karte.eintraege.filter((x) => x.gruppe === g.id)) if (String(e.id) in a.werte) out.push({ gruppe: g.id, id: e.id, wert: a.werte[String(e.id)] });
  }
  return out;
}

/* ---------- Navigation ---------- */

function Navigation({
  karte,
  reihen,
  aktiv,
  suche,
  setSuche,
  onWahl,
}: {
  karte: OffeneKarte;
  reihen: ReturnType<typeof gruppenReihen>;
  aktiv: number;
  suche: string;
  setSuche: (s: string) => void;
  onWahl: (id: number, eintrag?: string) => void;
}) {
  const q = suche.trim().toLowerCase();
  const treffer = useMemo(() => {
    if (!q) return [];
    return karte.karte.eintraege
      .map((e) => ({ e, g: karte.karte.gruppen.find((x) => x.id === e.gruppe)!, text: karteText(karte, e.gruppe, e.id) }))
      .filter((x) => x.g && `${x.g.text} ${pkTitel(x.e.titel)} ${x.text}`.toLowerCase().includes(q) && (x.text.trim() || `${x.g.text} ${pkTitel(x.e.titel)}`.toLowerCase().includes(q)))
      .slice(0, 60);
  }, [karte, q]);

  const adressbuch = useFormulare((s) => s.adressbuch);
  const vorgaben = useFormulare((s) => s.rollenVorgaben);
  const oap = useFormulare((s) => s.oap);
  const { karteMehrere, setMeldung } = useFormulare.getState();
  const vorschlag = adressbuch ? vorgabenFuer(karte, adressbuch.adressen, vorgaben) : [];
  const vorgabeGruppen = new Set(vorschlag.map((v) => v.gruppe)).size;

  // Favoriten oben (in der gewählten Reihenfolge), ausgeblendete Gruppen am Ende – außer der gewählten und solchen
  // mit ungespeicherten Änderungen, die bleiben sichtbar
  const favIds = useFormulare((s) => s.kartenFavoriten);
  const ausIds = useFormulare((s) => s.kartenAusgeblendet);
  const { kartenFavoritUmschalten, kartenAusblendenUmschalten } = useFormulare.getState();
  const [zeigeVersteckte, setZeigeVersteckte] = useState(false);
  const alle = reihen.flatMap((r) => r.gruppen);
  const geaendert = (g: PkGruppe) => karte.karte.eintraege.some((e) => e.gruppe === g.id && pkSchluessel(e.gruppe, e.id) in karte.aenderungen);
  const istVersteckt = (g: PkGruppe) => ausIds.includes(g.id) && g.id !== aktiv && !geaendert(g);
  const favoriten = favIds.map((id) => alle.find((g) => g.id === id)).filter((g): g is PkGruppe => !!g);
  const sichtbareReihen = reihen.map((r) => ({ ...r, gruppen: r.gruppen.filter((g) => !favIds.includes(g.id) && !istVersteckt(g)) })).filter((r) => r.gruppen.length);
  const versteckt = alle.filter(istVersteckt);
  const eintrag = (g: PkGruppe) => (
    <NavEintrag
      key={g.id}
      karte={karte}
      gruppe={g}
      aktiv={g.id === aktiv}
      onClick={() => onWahl(g.id)}
      favorit={favIds.includes(g.id)}
      ausgeblendet={ausIds.includes(g.id)}
      onFavorit={() => kartenFavoritUmschalten(g.id)}
      onAusblenden={() => kartenAusblendenUmschalten(g.id)}
    />
  );

  return (
    <nav className="pk-nav" aria-label="Gruppen der Projektkarte">
      <div className="pk-nav-kopf">
        <Symbol name="karte" /> Projektkarte <strong>{karte.projekt.ordner}</strong>
      </div>
      <input type="search" className="pk-suche" placeholder="Projektkarte durchsuchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
      {vorgabeGruppen > 0 && !q && (
        <button
          className="pk-vorgaben"
          title="Leere Gruppen mit den Vorgaben aus „Büro & Stammdaten“ füllen"
          onClick={() => {
            karteMehrere(vorschlag, 'Vorgaben eingetragen');
            setMeldung({ art: 'info', text: `Vorgaben in ${vorgabeGruppen} Gruppe(n) eingetragen – Strg+Z nimmt es zurück.` });
          }}
        >
          <Symbol name="buero" /> Vorgaben eintragen ({vorgabeGruppen})
        </button>
      )}
      {q ? (
        <div className="pk-treffer">
          {treffer.map(({ e, g, text }) => (
            <button key={pkSchluessel(e.gruppe, e.id)} className="pk-treffer-zeile" onClick={() => onWahl(g.id, pkSchluessel(e.gruppe, e.id))}>
              <span className="pk-treffer-ort">
                {g.text} › {feldTitel(e.titel)}
              </span>
              <span className="pk-treffer-wert">{text || <span className="muted">leer</span>}</span>
            </button>
          ))}
          {!treffer.length && <p className="muted small-text">Nichts gefunden.</p>}
        </div>
      ) : (
        <>
          <EigeneNavEintrag aktiv={aktiv === EIGENE} onClick={() => onWahl(EIGENE)} />
          {favoriten.length > 0 && (
            <div className="pk-nav-reihe pk-nav-favoriten">
              <div className="pk-nav-titel">Favoriten</div>
              {favoriten.map((g) => eintrag(g))}
            </div>
          )}
          {sichtbareReihen.map((r) => (
            <div key={r.titel} className="pk-nav-reihe">
              <div className="pk-nav-titel">{r.titel}</div>
              {r.gruppen.map((g) => eintrag(g))}
            </div>
          ))}
          {versteckt.length > 0 && (
            <div className="pk-nav-reihe pk-nav-ausgeblendet">
              <button className="pk-nav-mehr" aria-expanded={zeigeVersteckte} onClick={() => setZeigeVersteckte(!zeigeVersteckte)}>
                {versteckt.length} ausgeblendet – {zeigeVersteckte ? 'verbergen' : 'zeigen'}
              </button>
              {zeigeVersteckte && versteckt.map((g) => eintrag(g))}
            </div>
          )}
        </>
      )}
      {!q && oap !== null && (
        <div className="pk-nav-reihe">
          <div className="pk-nav-titel">Projektordner</div>
          <button className={`pk-nav-eintrag${aktiv === PROJEKTDATEN ? ' aktiv' : ''}${oap === 'fehlt' ? ' leer' : ''}`} onClick={() => onWahl(PROJEKTDATEN)}>
            <span className="pk-nav-name">
              <Symbol name="tabelle" /> Projektdatei (.oap)
            </span>
            <span className="pk-nav-kurz">{oap === 'fehlt' ? 'nicht gefunden' : oap.pfad.split('/').pop()}</span>
          </button>
        </div>
      )}
    </nav>
  );
}

/** Eigene Ansicht in der Navigation (oben) */
function EigeneNavEintrag({ aktiv, onClick }: { aktiv: boolean; onClick: () => void }) {
  const [ansicht] = useAnsicht(KARTEN_ANSICHT);
  const n = felderDerAnsicht(ansicht).length;
  return (
    <div className="pk-nav-reihe pk-nav-eigen">
      <button className={`pk-nav-eintrag${aktiv ? ' aktiv' : ''}`} aria-current={aktiv ? 'true' : undefined} onClick={onClick}>
        <span className="pk-nav-name">
          <Symbol name="liste" /> Eigene Ansicht
        </span>
        <span className="pk-nav-kurz">{n ? `${n} ${n === 1 ? 'Eintrag' : 'Einträge'} auf einer Seite` : 'zusammenstellen …'}</span>
      </button>
    </div>
  );
}

function NavEintrag({
  karte,
  gruppe,
  aktiv,
  onClick,
  favorit,
  ausgeblendet,
  onFavorit,
  onAusblenden,
}: {
  karte: OffeneKarte;
  gruppe: PkGruppe;
  aktiv: boolean;
  onClick: () => void;
  favorit: boolean;
  ausgeblendet: boolean;
  onFavorit: () => void;
  onAusblenden: () => void;
}) {
  const eintraege = karte.karte.eintraege.filter((e) => e.gruppe === gruppe.id);
  const gefuellt = eintraege.filter((e) => karteText(karte, e.gruppe, e.id).trim()).length;
  const geaendert = eintraege.some((e) => pkSchluessel(e.gruppe, e.id) in karte.aenderungen);
  const kurz = zusammenfassung(gruppe, (id) => karteText(karte, gruppe.id, id));
  return (
    <div className={`pk-nav-zeile${favorit ? ' favorit' : ''}${ausgeblendet ? ' ausgeblendet' : ''}`}>
      <NavKnopf aktiv={aktiv} gefuellt={!!gefuellt} onClick={onClick}>
        <span className="pk-nav-name">
          {gruppe.text}
          {geaendert && (
            <span className="fo-ungespeichert" title="Ungespeicherte Änderungen">
              {' '}
              ●
            </span>
          )}
        </span>
        <span className="pk-nav-kurz">{kurz || (gefuellt ? `${gefuellt} von ${eintraege.length} ausgefüllt` : 'nicht ausgefüllt')}</span>
      </NavKnopf>
      <span className="pk-nav-aktionen">
        <button
          className="pk-nav-stern"
          aria-pressed={favorit}
          aria-label={favorit ? `${gruppe.text}: Favorit entfernen` : `${gruppe.text} als Favorit oben anzeigen`}
          title={favorit ? 'Favorit entfernen' : 'Als Favorit oben anzeigen (gilt für alle Projekte)'}
          onClick={onFavorit}
        >
          {favorit ? '★' : '☆'}
        </button>
        <button
          className="pk-nav-auge"
          aria-pressed={ausgeblendet}
          aria-label={ausgeblendet ? `${gruppe.text} wieder einblenden` : `${gruppe.text} ausblenden`}
          title={ausgeblendet ? 'Wieder einblenden' : 'In der Gliederung ausblenden (gilt für alle Projekte; die Suche findet die Gruppe weiter)'}
          onClick={onAusblenden}
        >
          <Symbol name="auge" />
        </button>
      </span>
    </div>
  );
}

function NavKnopf({ aktiv, gefuellt, onClick, children }: { aktiv: boolean; gefuellt: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button className={`pk-nav-eintrag${aktiv ? ' aktiv' : ''}${gefuellt ? '' : ' leer'}`} aria-current={aktiv ? 'true' : undefined} onClick={onClick}>
      {children}
    </button>
  );
}

/* ---------- Editor einer Gruppe ---------- */

/** Schlüssel eines ausgeblendeten Eintrags: bei Beteiligten für alle (gleicher Aufbau), sonst je Gruppe */
export const eintragAusblendSchluessel = (g: Pick<PkGruppe, 'id' | 'typ'>, id: number) => (istAdresse(g) ? `a:${id}` : `${g.id}:${id}`);

/** Ausblenden einzelner Einträge im Gruppen-Editor (für die Zellen) */
const AusblendenKontext = createContext<{ istAus: (ids: number[]) => boolean; schalten: (ids: number[]) => void; gruppe: string } | null>(null);

function GruppenEditor({
  karte,
  gruppe,
  alleGruppen,
  stamm,
}: {
  karte: OffeneKarte;
  gruppe: PkGruppe;
  alleGruppen: PkGruppe[];
  stamm: Stammadresse[];
}) {
  const { karteMehrere, setMeldung, setRollenVorgabe, adressbuchErgaenzen, einstellungenOeffnen } = useFormulare.getState();
  const adressbuch = useFormulare((s) => s.adressbuch);
  const vorgabeSchluessel = useFormulare((s) => s.rollenVorgaben[String(gruppe.id)]);
  const vorgabe = adressbuch?.adressen.find((a) => a.schluessel === vorgabeSchluessel);
  const inDieserRolle = adressbuch ? inRolle(adressbuch.adressen, gruppe.id).filter((a) => a !== vorgabe).slice(0, 15) : [];
  const eintraege = useMemo(() => karte.karte.eintraege.filter((e) => e.gruppe === gruppe.id), [karte.karte, gruppe.id]);
  const alleAbschnitte = useMemo(() => aufbau(gruppe, eintraege), [gruppe, eintraege]);
  const text = (id: number) => karteText(karte, gruppe.id, id);
  // ausgeblendete Einträge: weg aus dem Editor – außer mit ungespeicherten Änderungen oder bei „zeigen“
  const ausSchluessel = useFormulare((s) => s.kartenEintraegeAusgeblendet);
  const [zeigeAus, setZeigeAus] = useState(false);
  const istAus = (ids: number[]) => ids.every((id) => ausSchluessel.includes(eintragAusblendSchluessel(gruppe, id)));
  const verborgen = (id: number) => istAus([id]) && !(pkSchluessel(gruppe.id, id) in karte.aenderungen);
  const ausgeblendetZahl = eintraege.filter((e) => verborgen(e.id)).length;
  const abschnitte = zeigeAus ? alleAbschnitte : alleAbschnitte.map((a) => ({ ...a, felder: a.felder.filter((x) => !verborgen(x.eintrag.id)) })).filter((a) => a.felder.length);
  const ausblenden = useMemo(
    () => ({
      istAus,
      schalten: (ids: number[]) => useFormulare.getState().kartenEintraegeUmschalten(ids.map((id) => eintragAusblendSchluessel(gruppe, id))),
      gruppe: istAdresse(gruppe) ? 'alle Beteiligten' : gruppe.text,
    }),
    [ausSchluessel, gruppe], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const adresse = istAdresse(gruppe);
  const gefuellt = eintraege.some((e) => text(e.id).trim());
  const quellen = alleGruppen.filter((g) => g.id !== gruppe.id && istAdresse(g) && karte.karte.eintraege.some((e) => e.gruppe === g.id && karteText(karte, g.id, e.id).trim()));
  const inhalt = useRef<HTMLDivElement>(null);

  const uebernehmen = (auswahl: string) => {
    const [art, name] = [auswahl.slice(0, 2), auswahl.slice(2)];
    let werte: KartenWert[] = [];
    let von = '';
    if (art === 'g:') {
      const quelle = Number(name);
      von = alleGruppen.find((g) => g.id === quelle)?.text ?? '';
      werte = eintraege.filter((e) => pkEintrag(karte.karte, quelle, e.id)).map((e) => ({ gruppe: gruppe.id, id: e.id, wert: karteWert(karte, quelle, e.id) }));
    } else if (art === 'a:') {
      const a = adressbuch?.adressen.find((x) => x.schluessel === name);
      if (!a) return;
      von = adressName(a);
      werte = eintraege.filter((e) => String(e.id) in a.werte).map((e) => ({ gruppe: gruppe.id, id: e.id, wert: a.werte[String(e.id)] }));
    } else {
      const s = stamm.find((x) => x.name === name);
      if (!s) return;
      von = s.name;
      werte = eintraege.filter((e) => String(e.id) in s.werte).map((e) => ({ gruppe: gruppe.id, id: e.id, wert: s.werte[String(e.id)] }));
    }
    karteMehrere(werte, `${gruppe.text}: übernommen von ${von}`);
    setMeldung({ art: 'info', text: `${gruppe.text}: Angaben von „${von}“ übernommen – Strg+Z nimmt es zurück.` });
  };

  /** diese Adresse als Vorgabe für die Rolle festlegen (und ins Adressbuch aufnehmen, falls neu) */
  const alsVorgabe = () => {
    const [a] = adressenAusKarte(karte.projekt.ordner, karteMitAenderungen(karte)).filter((x) => x.verwendungen[0].gruppe === gruppe.id);
    if (!a) return;
    adressbuchErgaenzen([a]);
    setRollenVorgabe(gruppe.id, a.schluessel);
    setMeldung({ art: 'info', text: `„${adressName(a)}“ ist jetzt die Vorgabe für ${gruppe.text} (Einstellungen → Büro & Stammdaten).` });
  };
  const istVorgabe = !!vorgabeSchluessel && vorgabeSchluessel === adressSchluessel(Object.fromEntries(eintraege.map((e) => [String(e.id), text(e.id)])));

  const leeren = () => {
    karteMehrere(
      eintraege.map((e) => ({ gruppe: gruppe.id, id: e.id, wert: leer(e) })),
      `${gruppe.text} geleert`,
    );
    setMeldung({ art: 'info', text: `${gruppe.text} geleert – Strg+Z nimmt es zurück.` });
  };

  // Enter in einzeiligen Feldern: zum nächsten Feld
  const tasten = (ev: KeyboardEvent<HTMLDivElement>) => {
    const t = ev.target as HTMLElement;
    if (ev.key !== 'Enter' || !(t instanceof HTMLInputElement) || t.type === 'checkbox' || ev.ctrlKey || ev.altKey) return;
    const felder = [...(inhalt.current?.querySelectorAll<HTMLElement>('[data-pk]') ?? [])];
    const i = felder.indexOf(t);
    if (i >= 0 && felder[i + 1]) {
      ev.preventDefault();
      felder[i + 1].focus();
    }
  };

  return (
    <section className="pk-editor" aria-label={gruppe.text}>
      <header className="pk-kopf">
        <div className="pk-kopf-text">
          <h2>{gruppe.text}</h2>
          <span className="muted">{zusammenfassung(gruppe, text) || (gefuellt ? '' : 'Noch keine Angaben')}</span>
        </div>
        <div className="pk-aktionen">
          {adresse && (
            <select className="pk-uebernehmen" aria-label="Angaben übernehmen" value="" onChange={(e) => (e.target.value === 'mehr' ? einstellungenOeffnen('adressbuch') : e.target.value && uebernehmen(e.target.value))}>
              <option value="">Übernehmen von …</option>
              {vorgabe && (
                <optgroup label="Vorgabe (Stammdaten)">
                  <option value={`a:${vorgabe.schluessel}`}>
                    {adressName(vorgabe)} · {adressOrt(vorgabe)}
                  </option>
                </optgroup>
              )}
              {quellen.length > 0 && (
                <optgroup label="Aus diesem Projekt">
                  {quellen.map((g) => (
                    <option key={g.id} value={`g:${g.id}`}>
                      {g.text}
                      {zusammenfassung(g, (id) => karteText(karte, g.id, id)) ? ` – ${zusammenfassung(g, (id) => karteText(karte, g.id, id))}` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              {inDieserRolle.length > 0 && (
                <optgroup label={`Adressbuch: bisher als ${gruppe.text}`}>
                  {inDieserRolle.map((a) => (
                    <option key={a.schluessel} value={`a:${a.schluessel}`}>
                      {adressName(a)} · {adressOrt(a)}
                    </option>
                  ))}
                </optgroup>
              )}
              <option value="mehr">{adressbuch ? 'Adressbuch öffnen …' : 'Adressbuch einlesen …'}</option>
              {stamm.length > 0 && (
                <optgroup label="Früher in der App gemerkt">
                  {stamm.map((s) => (
                    <option key={s.name} value={`s:${s.name}`}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          )}
          {adresse && gefuellt && !istVorgabe && (
            <button title={`Diese Adresse in neuen Projektkarten als ${gruppe.text} vorschlagen`} onClick={alsVorgabe}>
              Als Vorgabe festlegen
            </button>
          )}
          {adresse && istVorgabe && (
            <span className="pk-marke" title="Diese Adresse ist die Vorgabe für die Rolle">
              <Symbol name="haken" /> Vorgabe
            </span>
          )}
          {gefuellt && (
            <button title="Alle Angaben dieser Gruppe entfernen (Strg+Z nimmt es zurück)" onClick={leeren}>
              Leeren
            </button>
          )}
        </div>
      </header>

      <div className={`pk-koerper${adresse ? ' mit-vorschau' : ''}`}>
        <div className="pk-abschnitte" ref={inhalt} onKeyDown={tasten}>
          <AusblendenKontext.Provider value={ausblenden}>
            {abschnitte.map((a) => (
              <Abschnitt key={a.titel || 'alle'} titel={a.titel} einklappbar={a.einklappbar && a.felder.every((x) => !text(x.eintrag.id).trim())}>
                <div className="pk-raster">{zellen(a.felder, karte, gruppe, text(120))}</div>
              </Abschnitt>
            ))}
          </AusblendenKontext.Provider>
          {ausgeblendetZahl > 0 && (
            <button className="pk-nav-mehr pk-eintraege-mehr" aria-expanded={zeigeAus} onClick={() => setZeigeAus(!zeigeAus)}>
              {ausgeblendetZahl} {ausgeblendetZahl === 1 ? 'Eintrag' : 'Einträge'} ausgeblendet – {zeigeAus ? 'verbergen' : 'zeigen'}
            </button>
          )}
        </div>
        {adresse && <Vorschau zeilen={anschrift(text)} />}
      </div>
    </section>
  );
}

function Abschnitt({ titel, einklappbar, children }: { titel: string; einklappbar: boolean; children: ReactNode }) {
  const [auf, setAuf] = useState(!einklappbar);
  if (!titel) return <div className="pk-abschnitt">{children}</div>;
  return (
    <div className="pk-abschnitt">
      <h3>
        {einklappbar ? (
          <button className="pk-abschnitt-knopf" aria-expanded={auf} onClick={() => setAuf(!auf)}>
            <span aria-hidden>{auf ? '▾' : '▸'}</span> {titel}
          </button>
        ) : (
          titel
        )}
      </h3>
      {auf && children}
    </div>
  );
}

function Vorschau({ zeilen }: { zeilen: string[] }) {
  return (
    <aside className="pk-vorschau" aria-label="Anschrift">
      <div className="pk-vorschau-titel">Anschrift</div>
      {zeilen.length ? (
        <address>
          {zeilen.map((z, i) => (
            <div key={i}>{z}</div>
          ))}
        </address>
      ) : (
        <p className="muted small-text">Noch keine Anschrift.</p>
      )}
    </aside>
  );
}

/** Zellen eines Abschnitts; aufeinanderfolgende Kästchen mit gleichem Titel stehen gemeinsam unter einem Titel */
function zellen(felder: { eintrag: PkEintrag; breite: number }[], karte: OffeneKarte, gruppe: PkGruppe, land: string): ReactNode[] {
  const out: ReactNode[] = [];
  for (let i = 0; i < felder.length; i++) {
    const { eintrag, breite } = felder[i];
    if (pkArt(eintrag) === 'kreuz') {
      const gleich = [eintrag];
      while (felder[i + 1] && pkArt(felder[i + 1].eintrag) === 'kreuz' && felder[i + 1].eintrag.titel === eintrag.titel) gleich.push(felder[++i].eintrag);
      out.push(<Kreuze key={eintrag.id} karte={karte} eintraege={gleich} />);
      continue;
    }
    out.push(<Eintrag key={eintrag.id} karte={karte} gruppe={gruppe} eintrag={eintrag} breite={breite} land={land} />);
  }
  return out;
}

function Zelle({
  breite,
  titel,
  geaendert,
  hinweis,
  warnung,
  onZurueck,
  children,
  htmlFor,
  ids,
  unter,
}: {
  breite: number;
  titel: string;
  /** dezent unter dem Eingabefeld (eigene Ansicht: aus welcher Gruppe der Eintrag stammt) */
  unter?: ReactNode;
  geaendert: boolean;
  hinweis?: string;
  warnung?: string | null;
  onZurueck?: () => void;
  children: ReactNode;
  htmlFor?: string;
  /** Einträge dieser Zelle (zum Ausblenden) */
  ids?: number[];
}) {
  const aus = useContext(AusblendenKontext);
  const ausgeblendet = !!(aus && ids?.length && aus.istAus(ids));
  return (
    <div className={`pk-feld${geaendert ? ' geaendert' : ''}${warnung ? ' warnung' : ''}${ausgeblendet ? ' ausgeblendet' : ''}`} style={{ gridColumn: `span ${breite}` }}>
      <div className="pk-feld-kopf">
        <label className="pk-feld-titel" htmlFor={htmlFor} title={titel}>
          {titel}
          {hinweis && <span className="pk-einheit"> [{hinweis}]</span>}
        </label>
        {geaendert && onZurueck && (
          <button className="pk-zurueck" title="Auf den gespeicherten Wert zurücksetzen" aria-label={`${titel} zurücksetzen`} onClick={onZurueck}>
            ↺
          </button>
        )}
        {aus && ids?.length ? (
          <button
            className="pk-feld-auge"
            aria-pressed={ausgeblendet}
            aria-label={ausgeblendet ? `${titel} wieder einblenden` : `${titel} ausblenden`}
            title={ausgeblendet ? 'Wieder einblenden' : `Ausblenden – gilt für ${aus.gruppe} in allen Projekten; Formulare werden weiter befüllt`}
            onClick={() => aus.schalten(ids)}
          >
            <Symbol name="auge" />
          </button>
        ) : null}
      </div>
      {children}
      {unter && <div className="pk-feld-unter">{unter}</div>}
      {warnung && <div className="pk-warnung">{warnung}</div>}
    </div>
  );
}

function Eintrag({
  karte,
  gruppe,
  eintrag,
  breite,
  land,
  titelText,
  unter,
}: {
  karte: OffeneKarte;
  gruppe: PkGruppe;
  eintrag: PkEintrag;
  breite: number;
  land: string;
  /** eigene Beschriftung (eigene Ansicht) */
  titelText?: string;
  unter?: ReactNode;
}) {
  const karteSetzen = useFormulare((s) => s.karteSetzen);
  const s = pkSchluessel(eintrag.gruppe, eintrag.id);
  const id = `pk-${eintrag.gruppe}-${eintrag.id}`;
  const wert = karteWert(karte, eintrag.gruppe, eintrag.id);
  const geaendert = s in karte.aenderungen;
  const setzen = (w: PkWert) => karteSetzen(eintrag.gruppe, eintrag.id, w);
  const zurueck = () => setzen(pkWertVon(eintrag));
  const titel = titelText || feldTitel(eintrag.titel);
  const art = pkArt(eintrag);

  if (art === 'auswahl' || art === 'optionen') {
    const moeglich = pkMoeglichkeiten(eintrag);
    // Auswahllisten: erste (leere) Möglichkeit = „keine Angabe“; Optionen: erneuter Klick hebt die Wahl auf
    if (art === 'auswahl' || moeglich.length > 4) {
      return (
        <Zelle ids={[eintrag.id]} unter={unter} breite={breite} titel={titel} geaendert={geaendert} onZurueck={zurueck} htmlFor={id}>
          <select id={id} data-pk={s} value={typeof wert === 'number' ? wert : ''} onChange={(e) => setzen(e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">– keine Angabe –</option>
            {moeglich.map((m, i) => (m ? <option key={i} value={i}>{m}</option> : null))}
          </select>
        </Zelle>
      );
    }
    return (
      <Zelle ids={[eintrag.id]} unter={unter} breite={breite} titel={titel} geaendert={geaendert} onZurueck={zurueck}>
        <div className="pk-optionen" role="radiogroup" aria-label={titel}>
          {moeglich.map((m, i) => (
            <button key={i} role="radio" aria-checked={wert === i} data-pk={i === 0 ? s : undefined} className={wert === i ? 'active' : ''} onClick={() => setzen(wert === i ? null : i)}>
              {m}
            </button>
          ))}
        </div>
      </Zelle>
    );
  }

  const textWert = typeof wert === 'string' ? wert : '';
  const kernTitel = feldTitel(eintrag.titel);
  // Anzahl: ein vorhandener Wert, der keine ganze Zahl ist, bleibt stehen und wird gemeldet
  const keineZahl = istAnzahl(kernTitel) && textWert.trim() !== '' && !/^\d+$/.test(textWert.trim());
  const warnung = keineZahl ? `„${textWert.trim()}“ ist keine ganze Zahl – bitte als Zahl eintragen` : pruefung(gruppe, eintrag, textWert, land);
  const e = einheit(eintrag.titel);
  if (art === 'mehrzeilig') {
    return (
      <Zelle ids={[eintrag.id]} unter={unter} breite={breite} titel={titel} hinweis={e} geaendert={geaendert} onZurueck={zurueck} warnung={warnung} htmlFor={id}>
        <textarea id={id} data-pk={s} rows={Math.max(2, Math.min(10, textWert.split('\n').length + 1))} value={textWert} onChange={(ev) => setzen(ev.target.value)} />
      </Zelle>
    );
  }
  const kern = kernTitel;
  return (
    <Zelle ids={[eintrag.id]} unter={unter} breite={breite} titel={titel} hinweis={e} geaendert={geaendert} onZurueck={zurueck} warnung={warnung} htmlFor={id}>
      {istAnzahl(kern) ? (
        // Anzahl: nur ganze Zahlen (gespeichert als Text, wie in der Projektkarte)
        <input
          id={id}
          data-pk={s}
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          className="pk-zahl"
          value={keineZahl ? '' : textWert.trim()}
          placeholder={keineZahl ? textWert.trim() : undefined}
          onChange={(ev) => setzen(ev.target.value.replace(/\D/g, ''))}
        />
      ) : nutzungsarten(kern) ? (
        <AuswahlMitText id={id} schluessel={s} wert={textWert} vorschlaege={nutzungsarten(kern)!} onChange={setzen} />
      ) : (
        <input id={id} data-pk={s} type="text" value={textWert} spellCheck={false} className={e === 'm²' ? 'pk-zahl' : undefined} onChange={(ev) => setzen(ev.target.value)} />
      )}
    </Zelle>
  );
}

/**
 * Auswahl aus gängigen Werten (z. B. Art der Nutzung) – gespeichert wird der Text. Ein eigener Text bleibt erhalten: Er
 * steht als „(eigene Angabe)“ in der Auswahl; „andere …“ öffnet die Eingabe, der Pfeil führt zur Liste zurück, ohne
 * etwas zu löschen.
 */
function AuswahlMitText({ id, schluessel, wert, vorschlaege, onChange }: { id: string; schluessel: string; wert: string; vorschlaege: string[]; onChange: (w: string) => void }) {
  const [frei, setFrei] = useState(false);
  const eigen = wert.trim() !== '' && !vorschlaege.includes(wert);
  if (frei)
    return (
      <span className="pk-auswahl-frei">
        <input id={id} data-pk={schluessel} type="text" value={wert} spellCheck={false} autoFocus onChange={(ev) => onChange(ev.target.value)} />
        <button type="button" className="icon" title="Aus der Liste wählen – die eigene Angabe bleibt erhalten" aria-label="Aus der Liste wählen" onClick={() => setFrei(false)}>
          <Symbol name="pfeilUnten" />
        </button>
      </span>
    );
  return (
    <select id={id} data-pk={schluessel} value={wert} onChange={(ev) => (ev.target.value === FREI ? setFrei(true) : onChange(ev.target.value))}>
      <option value="">– keine Angabe –</option>
      {eigen && <option value={wert}>{wert} (eigene Angabe)</option>}
      {vorschlaege.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
      <option value={FREI}>{eigen ? 'eigene Angabe ändern …' : 'andere …'}</option>
    </select>
  );
}

/** Wert der Auswahl für „eigene Angabe eingeben“ (kein möglicher Text der Projektkarte) */
const FREI = '\u0000frei';

function Kreuze({ karte, eintraege, titelText, unter }: { karte: OffeneKarte; eintraege: PkEintrag[]; titelText?: string; unter?: ReactNode }) {
  const karteSetzen = useFormulare((s) => s.karteSetzen);
  const geaendert = eintraege.some((e) => pkSchluessel(e.gruppe, e.id) in karte.aenderungen);
  return (
    <Zelle breite={12} titel={titelText || feldTitel(eintraege[0].titel)} geaendert={geaendert} ids={eintraege.map((e) => e.id)} unter={unter}>
      <div className="pk-kreuze">
        {eintraege.map((e) => (
          <label key={e.id} className="pk-kreuz">
            <input type="checkbox" data-pk={pkSchluessel(e.gruppe, e.id)} checked={karteWert(karte, e.gruppe, e.id) === 1} onChange={(ev) => karteSetzen(e.gruppe, e.id, ev.target.checked ? 1 : 0)} />
            {e.text}
          </label>
        ))}
      </div>
    </Zelle>
  );
}

/**
 * Abgleich mit der Projektdatei (.oap) im Projektordner – der gemeinsamen Quelle der Projektstammdaten von
 * Flächenrechner, GRZ-Nachweis, Kostenermittlung und Projektordner: je Angabe der Wert dort und in der
 * Projektkarte, Übernehmen in die eine oder andere Richtung. Beim Speichern der Projektkarte trägt die App
 * geänderte Angaben selbst in die Projektdatei ein. Eine alte Projektdaten.xlsx lässt sich noch übernehmen.
 */
function ProjektdatenAbgleich({ karte }: { karte: OffeneKarte }) {
  const oap = useFormulare((s) => s.oap);
  const xlsx = useFormulare((s) => s.projektdaten);
  const vorlage = useFormulare((s) => s.oapVorlage);
  const { oapUebernehmen, oapEintragen, oapLaden, oapWaehlen, projektdatenUebernehmen, dateiAnsehen, stammdatenErfassen } = useFormulare.getState();
  const projekt = karte.projekt;
  const werte = oap && oap !== 'fehlt' ? angabenAus(oap.inhalt.meta) : null;
  // nur Angaben, die es in dieser Projektkarte gibt
  const zeilen = OAP_ANGABEN.filter(({ angabe }) => !!pkEintrag(karte.karte, IN_PROJEKTKARTE[angabe]!.gruppe, IN_PROJEKTKARTE[angabe]!.id)).map(({ angabe, feld }) => {
    const ziel = IN_PROJEKTKARTE[angabe]!;
    const inKarte = karteText(karte, ziel.gruppe, ziel.id);
    const inDatei = werte?.get(angabe) ?? '';
    return { angabe, feld, ziel, inKarte, inDatei, gleich: inKarte.trim() === inDatei.trim() };
  });
  const zurKarte = zeilen.filter((z) => !z.gleich && z.inDatei.trim()).map((z) => z.angabe);
  const zurDatei = zeilen.filter((z) => !z.gleich && z.inKarte.trim()).map((z) => z.angabe);
  // alte Projektdaten.xlsx: Angaben, die von der Projektkarte abweichen
  const alt =
    xlsx && xlsx !== 'fehlt'
      ? xlsx.eintraege.filter((e) => {
          const z = IN_PROJEKTKARTE[e.angabe];
          return z && e.wert.trim() && karteText(karte, z.gruppe, z.id).trim() !== e.wert.trim();
        })
      : [];

  return (
    <section className="pk-editor">
      <header className="pk-kopf">
        <div className="pk-kopf-text">
          <h2>Projektdatei (.oap)</h2>
          <span className="muted">{oap && oap !== 'fehlt' ? oap.pfad : oap === 'fehlt' ? 'im Projektordner nicht gefunden' : 'wird gesucht …'}</span>
        </div>
        <div className="pk-aktionen">
          {werte && (
            <>
              <button disabled={!zurKarte.length} title="Werte der Projektdatei in die Projektkarte übernehmen" onClick={() => oapUebernehmen(zurKarte)}>
                Abweichende übernehmen ({zurKarte.length})
              </button>
              <button disabled={!zurDatei.length} title="Werte der Projektkarte in die Projektdatei eintragen" onClick={() => void oapEintragen(zurDatei)}>
                Abweichende eintragen ({zurDatei.length})
              </button>
            </>
          )}
          <button onClick={() => void oapLaden()}>Neu lesen</button>
        </div>
      </header>
      <p className="muted pk-text">
        Die Projektdatei ist das gemeinsame Projektarchiv von Flächenrechner, GRZ-Nachweis, Kostenermittlung und Projektordner; die Projektstammdaten stehen darin unter
        „meta“. Beim Speichern der Projektkarte werden geänderte Angaben dort mitgeführt – nur diese, alles andere in der Datei bleibt.
      </p>
      {oap === 'fehlt' && (
        <p className="pk-text">
          Im Projektordner gibt es noch keine Projektdatei. Der Stammdaten-Dialog legt sie an – vorbelegt mit den Angaben der Projektkarte, unter{' '}
          <code>{projektdateiPfad(vorlage, { nummer: projekt.ordner, kurzname: projekt.titel, vorhaben: karteText(karte, IN_PROJEKTKARTE.vorhaben!.gruppe, IN_PROJEKTKARTE.vorhaben!.id).trim() })}</code>.{' '}
          <button className="small primary" onClick={() => void stammdatenErfassen('Für dieses Projekt gibt es im Projektordner noch keine Projektdatei (.oap). Mit diesen Angaben wird sie angelegt.')}>
            Stammdaten erfassen …
          </button>
        </p>
      )}
      {oap && oap !== 'fehlt' && oap.kandidaten.length > 1 && (
        <label className="pk-text pk-oap-wahl">
          <span className="field-label">Mehrere Projektdateien im Projektordner – verwendet wird:</span>
          <select value={oap.pfad} onChange={(e) => void oapWaehlen(e.target.value)} aria-label="Projektdatei">
            {oap.kandidaten.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
      )}
      <table className="pk-abgleich">
        <thead>
          <tr>
            <th>Angabe</th>
            <th>Projektdatei</th>
            <th>Projektkarte</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z) => (
            <tr key={z.angabe} className={z.gleich ? 'gleich' : ''}>
              <td>
                {z.ziel.titel}
                <span className="muted small-text"> ({z.feld})</span>
              </td>
              <td>{werte ? z.inDatei || <span className="muted">leer</span> : <span className="muted">–</span>}</td>
              <td>{z.inKarte || <span className="muted">leer</span>}</td>
              <td className="pk-abgleich-knoepfe">
                {z.gleich ? (
                  <span className="pk-marke">
                    <Symbol name="haken" /> gleich
                  </span>
                ) : (
                  <>
                    {werte && z.inDatei.trim() && (
                      <button className="small" title="In die Projektkarte übernehmen" onClick={() => oapUebernehmen([z.angabe])}>
                        Übernehmen
                      </button>
                    )}
                    {werte && z.inKarte.trim() && (
                      <button className="small" title="In die Projektdatei eintragen" onClick={() => void oapEintragen([z.angabe])}>
                        Eintragen
                      </button>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {xlsx && xlsx !== 'fehlt' && (
        <div className="pk-alt">
          <strong>Projektdaten.xlsx (bisher)</strong>
          <span className="muted small-text">
            {xlsx.pfad} – wird nicht mehr beschrieben.{' '}
            {alt.length ? `${alt.length} Angabe(n) weichen von der Projektkarte ab.` : 'Alle erkannten Angaben stimmen mit der Projektkarte überein.'}
          </span>
          <span className="pk-alt-knoepfe">
            {alt.length > 0 && (
              <button className="small" title="Angaben der alten xlsx in die Projektkarte übernehmen – beim Speichern kommen sie in die Projektdatei" onClick={() => projektdatenUebernehmen(alt.map((e) => e.angabe as Angabe))}>
                In die Projektkarte übernehmen ({alt.length})
              </button>
            )}
            <button className="small" onClick={() => void dateiAnsehen(xlsx.root, xlsx.pfad)}>
              Ansehen
            </button>
          </span>
        </div>
      )}
    </section>
  );
}
