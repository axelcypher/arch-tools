import { useEffect, useId, type ReactNode } from 'react';
import { create } from 'zustand';
import { VORGABE_NAMENSSCHEMA, namensschemaAus, type Namensschema } from '@core/namensschema';
import { PfadeVerweis, einstellungenEntwurfMelden, einstellungenStartseite, einstellungsSeiteAnmelden, useEinstellungenGesperrt, type SeitenEntwurf } from '@core/ui/Einstellungen';
import { allgemeinAendern, konfigGeaendertMelden } from '@core/platform/konfig';
import { useMails } from '../mail/mailStore';
import { NICHT_GESPEICHERT, useOrdner } from '../store';
import { NamensschemaEinstellungen } from './NamensschemaEinstellungen';

/**
 * Seite „ATLAS“ im zentralen Einstellungsdialog (docs/design.md, „Einstellungen“): Namensschema des Büros (Kürzel,
 * Stellen, Indizes – gemeinsam für alle Apps, `allgemein.namensschema`) und die eigenen Domains der Mailprüfung
 * (Bereich der Mails). Pfade und Namensmuster (Stammordner, Vorlagenordner, Projektnummer, Ordner- und Dateinamen)
 * stehen auf „Pfade und Benennung“; die Pflege der Vorlagen-Presets und der Katasterpläne bleibt in ihren Ansichten.
 * Änderungen gelten mit „Übernehmen“ und werden mit den bisherigen Settern geschrieben; im Notbetrieb gesperrt.
 */

export const ATLAS_SEITE = 'ordner';

interface Entwurf {
  namensschema?: Namensschema;
  /** eigene Domains als Text (Komma oder Leerzeichen getrennt) */
  domains?: string;
}

export const useAtlasEntwurf = create<{ entwurf: Entwurf }>(() => ({ entwurf: {} }));

const gespeichertesSchema = () => namensschemaAus(useOrdner.getState().allgemein.namensschema) ?? VORGABE_NAMENSSCHEMA;
/** eingegebene Domains als Liste – klein, ohne „@“, ohne Doppelte */
export const domainsAus = (text: string) => [
  ...new Set(
    text
      .split(/[,;\s]+/)
      .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean),
  ),
];

function aenderungen(): { namensschema?: Namensschema; domains?: string[] } {
  const { namensschema, domains } = useAtlasEntwurf.getState().entwurf;
  const out: { namensschema?: Namensschema; domains?: string[] } = {};
  if (namensschema && JSON.stringify(namensschema) !== JSON.stringify(gespeichertesSchema())) out.namensschema = namensschema;
  if (domains !== undefined && domainsAus(domains).join(',') !== useMails.getState().eigene.join(',')) out.domains = domainsAus(domains);
  return out;
}

export const ATLAS_ENTWURF: SeitenEntwurf = {
  geaendert: () => Object.keys(aenderungen()).length > 0,
  uebernehmen: async () => {
    const a = aenderungen();
    // gewartet wird auf das Schreiben: scheitert es, bleibt der Entwurf stehen und der Dialog zeigt den Fehler
    if (a.namensschema) {
      const allgemein = await allgemeinAendern({ namensschema: a.namensschema });
      // eine ältere Meldung „Einstellungen nicht gespeichert …“ gilt nicht mehr; andere Fenster lesen neu
      useOrdner.setState((s) => ({
        allgemein: { ...s.allgemein, namensschema: allgemein.namensschema ?? a.namensschema },
        ...(s.konfigFehler?.startsWith(NICHT_GESPEICHERT) ? { konfigFehler: null } : {}),
      }));
      konfigGeaendertMelden(['allgemein']);
    }
    if (a.domains) {
      await useMails.getState().setEigene(a.domains);
      const fehler = useMails.getState().fehler;
      if (fehler) throw new Error(fehler);
    }
    useAtlasEntwurf.setState({ entwurf: {} });
  },
  verwerfen: () => useAtlasEntwurf.setState({ entwurf: {} }),
};

/** Seite beim Start von ATLAS anmelden – „Datei → Einstellungen …“ öffnet dann auf ihr */
export function atlasSeiteAnmelden(): () => void {
  const abmelden = einstellungsSeiteAnmelden({
    id: ATLAS_SEITE,
    app: 'ordner',
    titel: 'ATLAS',
    text: 'Namensschema, eigene Domains',
    symbol: 'stapel',
    inhalt: () => <AtlasSeite />,
    entwurf: ATLAS_ENTWURF,
  });
  einstellungenStartseite(ATLAS_SEITE);
  return abmelden;
}

const setzeEntwurf = (patch: Entwurf) => {
  useAtlasEntwurf.setState((s) => ({ entwurf: { ...s.entwurf, ...patch } }));
  einstellungenEntwurfMelden();
};

function Abschnitt({ titel, text, children }: { titel: string; text?: ReactNode; children: ReactNode }) {
  const kopfId = useId();
  return (
    <section className="einst-gruppe po-einst-gruppe" aria-labelledby={kopfId}>
      <h4 id={kopfId}>{titel}</h4>
      {text && <p className="muted small-text">{text}</p>}
      {children}
    </section>
  );
}

export function AtlasSeite() {
  const gesperrt = useEinstellungenGesperrt();
  const entwurf = useAtlasEntwurf((s) => s.entwurf);
  const allgemein = useOrdner((s) => s.allgemein);
  const eigene = useMails((s) => s.eigene);
  const geladen = useMails((s) => s.geladen);
  const mailFehler = useMails((s) => s.fehler);
  const domainsId = useId();
  // die eigenen Domains liegen im Bereich der Mails – einmal lesen, falls die Mailprüfung noch nicht offen war
  useEffect(() => {
    if (!useMails.getState().geladen) void useMails.getState().laden();
  }, []);
  const schema = entwurf.namensschema ?? namensschemaAus(allgemein.namensschema) ?? VORGABE_NAMENSSCHEMA;
  const domains = entwurf.domains ?? eigene.join(', ');

  return (
    <>
      <h3>ATLAS</h3>
      <p className="einst-einleitung">
        Namensschema des Büros und eigene Domains der Mailprüfung. Stammordner, Vorlagenordner, Projektnummer sowie Ordner- und Dateinamen stehen auf „Pfade und Benennung“.
      </p>
      {/* im Notbetrieb sperrt das fieldset alle Felder und Knöpfe der Seite auf einmal */}
      <fieldset className="po-einst-seite" disabled={!!gesperrt} title={gesperrt ?? undefined}>
        <legend className="unsichtbar">Einstellungen von ATLAS</legend>
        <Abschnitt titel="Pfade und Benennung" text="Stammordner der Projekte, Vorlagenordner, Projektnummer, Name des Projektordners, Dateinamen der Pläne und der Vorlagen.">
          <PfadeVerweis fokus="projekt.stammordner" erklaerung="Eingestellt auf der Seite „Pfade und Benennung“." />
        </Abschnitt>

        <Abschnitt titel="Namensschema: Kürzel und Plannummern">
          <NamensschemaEinstellungen wert={schema} onChange={(namensschema) => setzeEntwurf({ namensschema })} />
        </Abschnitt>

        <Abschnitt titel="Eigene Domains" text="Daran erkennt die Mailprüfung, ob eine Mail von außen kam („von“) oder ins Büro hinaus ging („an“). Gilt fürs ganze Büro.">
          <label className="field" htmlFor={domainsId}>
            <span className="field-label">Domains</span>
            <input id={domainsId} value={domains} readOnly={!geladen} placeholder="z. B. architekten-beispiel.example" spellCheck={false} onChange={(e) => setzeEntwurf({ domains: e.target.value })} />
            {mailFehler ? (
              <span className="feld-meldung" role="alert">
                {mailFehler}
              </span>
            ) : (
              <span className="field-hint">{geladen ? 'Mehrere mit Komma getrennt; ohne „@“.' : 'Wird gelesen …'}</span>
            )}
          </label>
        </Abschnitt>

        <Abschnitt titel="Vorlagen und Katasterpläne">
          <p className="muted small-text">Zielordner und Dateinamen je Vorlage: Einrichtung › Vorlagen. Katasterpläne: Einrichtung › Katasterpläne.</p>
        </Abschnitt>
      </fieldset>
    </>
  );
}
