import { useId, useState } from 'react';
import { bestaetigen, meldung } from '@core/ui/Rueckfrage';
import { ordnerWaehlen } from '@core/platform/projektordner';
import { openFileWithPath } from '@core/platform/files';
import { bueroName, KonfigNichtErreichbar, konfigNeuLesen } from '@core/platform/konfig';
import { logger } from '@core/platform/log';
import { modernisieren } from '@core/platzhalter';
import { PlatzhalterChips, PlatzhalterHinweise, platzhalterEinfuegen } from '@core/ui/Platzhalter';
import { Symbol } from '@core/ui/Symbol';
import { PfadeVerweis, einstellungenEntwurfMelden, einstellungenStartseite, einstellungsSeiteAnmelden, useEinstellungenGesperrt, type SeitenEntwurf } from '@core/ui/Einstellungen';
import { create } from 'zustand';
import { nameErkennen } from '../abrechnung/benennung';
import { mailVariablen } from '../platzhalter';
import type { AvaEinstellungen, MailVorlage } from '../einstellungen';
import { EinstellungenKonflikt, VORGABE } from '../einstellungen';
import { neueId } from '../lv/modell';
import { useAva } from '../store';
import { Feld, TextEingabe, ZahlEingabe } from './eingaben';

/**
 * Seite „FABRIO“ im zentralen Einstellungsdialog (docs/design.md, „Einstellungen“): Rechnungen, Prüfung, Deckblatt,
 * Scanordner, Mailvorlagen und Leistungsverzeichnisse. Ablage, Rechnungsmuster und der Name neuer LV-Dateien stehen auf
 * „Pfade und Benennung“ (Verweise). Änderungen gelten mit „Übernehmen“ und werden wie bisher mit `einstellungenSetzen`
 * in den Bereich `ava` des gemeinsamen Konfigurationsordners geschrieben; im Notbetrieb ist die Seite gesperrt.
 */

const log = logger('ava-einstellungen');

export const FABRIO_SEITE = 'ava';

const liste = (s: string) =>
  s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

/** Entwurf der Seite; null = nichts geändert (es gilt der gespeicherte Stand) */
export const useFabrioEntwurf = create<{ entwurf: AvaEinstellungen | null }>(() => ({ entwurf: null }));

/** zentral eingestellte Angaben (Pfade und Benennung): es gilt immer der aktuelle Stand, nie der des Entwurfs */
const mitZentral = (e: AvaEinstellungen, z: AvaEinstellungen): AvaEinstellungen => ({
  ...e,
  ablage: z.ablage,
  rechnungen: { ...e.rechnungen, muster: z.rechnungen.muster },
  lv: { ...e.lv, dateiname: z.lv.dateiname },
});

export const FABRIO_ENTWURF: SeitenEntwurf = {
  geaendert: () => {
    const e = useFabrioEntwurf.getState().entwurf;
    const g = useAva.getState().einstellungen;
    return !!e && JSON.stringify(mitZentral(e, g)) !== JSON.stringify(g);
  },
  uebernehmen: async () => {
    const e = useFabrioEntwurf.getState().entwurf;
    if (!e) return;
    try {
      // „Pfade und Benennung“ kann im selben „Übernehmen“ eben in den Bereich „ava“ geschrieben haben (Ablage, Muster,
      // LV-Dateiname): erst frisch lesen, damit diese Werte nicht mit dem alten Stand überschrieben werden. Hat sich
      // dabei etwas geändert, das zu dieser Seite gehört (anderer Rechner), wird nichts überschrieben.
      const basis = useAva.getState().einstellungen;
      await useAva.getState().einstellungenLaden();
      const frisch = useAva.getState().einstellungen;
      if (JSON.stringify(mitZentral(basis, frisch)) !== JSON.stringify(frisch)) throw new EinstellungenKonflikt();
      await useAva.getState().einstellungenSetzen(mitZentral(e, frisch));
      useFabrioEntwurf.setState({ entwurf: null });
    } catch (x) {
      // anderer Rechner oder Netzlaufwerk weg: die Meldung erklärt es selbst
      if (x instanceof EinstellungenKonflikt || x instanceof KonfigNichtErreichbar) throw x;
      log.error('Einstellungen von FABRIO nicht gespeichert', x);
      throw new Error('Der gemeinsame Konfigurationsordner ließ sich nicht schreiben.');
    }
  },
  verwerfen: () => useFabrioEntwurf.setState({ entwurf: null }),
};

/** Seite beim Start von FABRIO anmelden – „Datei → Einstellungen …“ öffnet dann auf ihr */
export function fabrioSeiteAnmelden(): () => void {
  const abmelden = einstellungsSeiteAnmelden({
    id: FABRIO_SEITE,
    app: 'ava',
    titel: 'FABRIO',
    text: 'Rechnungen, Prüfung, Deckblatt, Scanordner, Mailvorlagen',
    symbol: 'liste',
    inhalt: () => <FabrioSeite />,
    entwurf: FABRIO_ENTWURF,
  });
  einstellungenStartseite(FABRIO_SEITE);
  // Speicherort gewechselt bzw. Netzlaufwerk weg oder wieder da: der Entwurf stammt vom alten Stand – verwerfen
  const neuLesen = konfigNeuLesen(() => {
    if (!useFabrioEntwurf.getState().entwurf) return;
    useFabrioEntwurf.setState({ entwurf: null });
    einstellungenEntwurfMelden();
    void meldung(
      'Einstellungen neu geladen',
      'Der Speicherort der Einstellungen wurde gewechselt bzw. das Netzlaufwerk getrennt oder wieder verbunden. Die Änderungen auf der Seite FABRIO sind verworfen – bitte noch einmal vornehmen.',
    );
  });
  return () => {
    abmelden();
    neuLesen();
  };
}

function Abschnitt({ titel, text, children }: { titel: string; text?: string; children: React.ReactNode }) {
  const kopfId = useId();
  return (
    <section className="einst-gruppe ava-einst-gruppe" aria-labelledby={kopfId}>
      <h4 id={kopfId}>{titel}</h4>
      {text && <p className="muted small-text">{text}</p>}
      {children}
    </section>
  );
}

export function FabrioSeite() {
  const gespeichert = useAva((s) => s.einstellungen);
  const entwurf = useFabrioEntwurf((s) => s.entwurf);
  const gesperrt = useEinstellungenGesperrt();
  const e = entwurf ?? gespeichert;
  const [probe, setProbe] = useState('K62 R021 Musterbau 251024 AB1.pdf');
  const setzeAlles = (neu: AvaEinstellungen) => {
    useFabrioEntwurf.setState({ entwurf: neu });
    einstellungenEntwurfMelden();
  };
  const setze = <K extends keyof AvaEinstellungen>(k: K, patch: Partial<AvaEinstellungen[K]>) => setzeAlles({ ...e, [k]: { ...e[k], ...patch } });
  const erkannt = nameErkennen(probe, gespeichert.rechnungen.muster, e.rechnungen.arten);

  return (
    <>
      <h3>FABRIO</h3>
      <p className="einst-einleitung">Gilt für das ganze Büro (gemeinsamer Konfigurationsordner). Ablage und Dateinamen stehen auf „Pfade und Benennung“.</p>
      {/* im Notbetrieb sperrt das fieldset alle Felder und Knöpfe der Seite auf einmal */}
      <fieldset className="ava-einst-seite" disabled={!!gesperrt} title={gesperrt ?? undefined}>
        <legend className="unsichtbar">Einstellungen von FABRIO</legend>
        <Abschnitt titel="Ablage" text="Wo im Projektordner was liegt: Gewerke, LV-Dateien, Aufträge und Rechnungen, Mailverkehr, Archiv, Kostenkontrolle, Bauleitung.">
          <PfadeVerweis fokus="ablage.fabrio.gewerke" erklaerung="Eingestellt auf der Seite „Pfade und Benennung“." />
        </Abschnitt>

        <Abschnitt titel="Rechnungen">
          <p className="muted small-text">
            Muster der Dateinamen im Auftragsordner: <code>{gespeichert.rechnungen.muster[0]}</code>
            {gespeichert.rechnungen.muster.length > 1 && ` und ${gespeichert.rechnungen.muster.length - 1} weitere zum Erkennen`} – eingestellt auf „Pfade und Benennung“.
          </p>
          <PfadeVerweis fokus="plaene.fabrio.rechnungen" text="Muster der Rechnungen …" />
          <div className="ava-formular">
            <Feld label="Rechnungsarten" hinweis="je Zeile: Kürzel = Name (AB = Abschlagsrechnung …)" breit>
              <TextEingabe
                mehrzeilig
                zeilen={4}
                startfokus
                label="Rechnungsarten"
                wert={e.rechnungen.arten.map((a) => `${a.kuerzel} = ${a.name}`).join('\n')}
                onChange={(s) =>
                  setze('rechnungen', {
                    arten: s
                      .split('\n')
                      .map((z) => z.split('='))
                      .filter((t) => t[0]?.trim())
                      .map(([k, n]) => {
                        const kuerzel = k.trim();
                        const vorher = e.rechnungen.arten.find((a) => a.kuerzel === kuerzel) ?? VORGABE.rechnungen.arten.find((a) => a.kuerzel === kuerzel);
                        return { ...vorher, kuerzel, name: (n ?? kuerzel).trim() };
                      }),
                  })
                }
              />
            </Feld>
            <Feld label="Erkennen ausprobieren" breit>
              <input value={probe} onChange={(x) => setProbe(x.target.value)} />
              <span className="ava-feld-hinweis">
                {erkannt
                  ? `erkannt: Nr. ${erkannt.nr ?? '–'}, ${erkannt.art ?? ''}${erkannt.lfd ?? ''}, ${erkannt.firma ?? ''}, ${erkannt.datum ?? ''} (Muster „${erkannt.muster}“)`
                  : 'passt zu keinem Muster'}
              </span>
            </Feld>
            <label className="ava-check ava-feld-breit">
              <input type="checkbox" checked={e.rechnungen.nrAufDeckblatt} onChange={(x) => setze('rechnungen', { nrAufDeckblatt: x.target.checked })} /> Nummer der Rechnungsliste auf dem Deckblatt
            </label>
            <label className="ava-check ava-feld-breit">
              <input type="checkbox" checked={e.rechnungen.deckblattVoranstellen} onChange={(x) => setze('rechnungen', { deckblattVoranstellen: x.target.checked })} /> Deckblatt beim Ablegen digital
              vor den Scan setzen (sonst wird es mit eingescannt)
            </label>
          </div>
        </Abschnitt>

        <Abschnitt titel="Prüfung" text="Vorgaben einer neuen Rechnungsprüfung (lassen sich je Rechnung ändern).">
          <div className="ava-formular">
            <Feld label="Umsatzsteuer %">
              <ZahlEingabe wert={e.pruefung.mwstProzent} onChange={(n) => setze('pruefung', { mwstProzent: n ?? 19 })} />
            </Feld>
            <Feld label="Gemeinkostenumlage %">
              <ZahlEingabe wert={e.pruefung.umlageProzent} onChange={(n) => setze('pruefung', { umlageProzent: n ?? 0 })} />
            </Feld>
            <Feld label="Sicherheitseinbehalt % (Abschläge)">
              <ZahlEingabe wert={e.pruefung.einbehaltProzent} onChange={(n) => setze('pruefung', { einbehaltProzent: n ?? 0 })} />
            </Feld>
            <Feld label="Sicherheit für Mängelansprüche % (Schlussrechnung)" hinweis="§ 17 VOB/B; leer = je Rechnung nachfragen (Vorrang hat der Wert im LV)">
              <ZahlEingabe wert={e.pruefung.sicherheitMaengelProzent} onChange={(n) => setze('pruefung', { sicherheitMaengelProzent: n ?? undefined })} />
            </Feld>
            <Feld label="Nachlass %">
              <ZahlEingabe wert={e.pruefung.nachlassProzent} onChange={(n) => setze('pruefung', { nachlassProzent: n ?? 0 })} />
            </Feld>
            <Feld label="Skonto %">
              <ZahlEingabe wert={e.pruefung.skontoProzent} onChange={(n) => setze('pruefung', { skontoProzent: n ?? 0 })} />
            </Feld>
          </div>
        </Abschnitt>

        <Abschnitt titel="Deckblatt">
          <div className="ava-formular">
            <Feld label="Briefbogen (PDF)" hinweis="erste Seite als Hintergrund; leer = Büroname oben rechts und Fußzeile" breit>
              <div className="ava-reihe">
                <TextEingabe wert={e.deckblatt.briefbogen} onChange={(briefbogen) => setze('deckblatt', { briefbogen })} />
                <button
                  type="button"
                  onClick={async () => {
                    const d = await openFileWithPath({ filterName: 'PDF', extensions: ['pdf'] });
                    if (d?.pfad) setze('deckblatt', { briefbogen: d.pfad });
                  }}
                >
                  Datei wählen …
                </button>
              </div>
            </Feld>
            <Feld label="Büro (mehrzeilig)" breit>
              <TextEingabe mehrzeilig zeilen={2} wert={e.deckblatt.buero || bueroName()} onChange={(buero) => setze('deckblatt', { buero })} />
            </Feld>
            <Feld label="Unterschrift „i.A. …“" hinweis="leer = Bearbeiter des Projekts">
              <TextEingabe wert={e.deckblatt.bearbeiter} onChange={(bearbeiter) => setze('deckblatt', { bearbeiter })} />
            </Feld>
            <Feld label="Schlusstext" breit>
              <TextEingabe mehrzeilig zeilen={3} wert={e.deckblatt.schlusstext} onChange={(schlusstext) => setze('deckblatt', { schlusstext })} />
            </Feld>
            <Feld label="Fußzeile ohne Briefbogen" hinweis="Spalten mit || trennen, Zeilen mit Zeilenumbruch" breit>
              <TextEingabe mehrzeilig zeilen={4} wert={e.deckblatt.fusszeile.replace(/\t/g, ' || ')} onChange={(s) => setze('deckblatt', { fusszeile: s.replace(/\s*\|\|\s*/g, '\t') })} />
            </Feld>
          </div>
        </Abschnitt>

        <Abschnitt titel="Scanordner">
          <div className="ava-formular">
            <Feld label="Scanordner" hinweis="Ordner, in dem der Scanner die Dateien ablegt (z. B. \\server\Scans)" breit>
              <div className="ava-reihe">
                <TextEingabe wert={e.scan.ordner} onChange={(ordner) => setze('scan', { ordner })} />
                <button
                  type="button"
                  onClick={async () => {
                    const o = await ordnerWaehlen('Scanordner wählen');
                    if (o) setze('scan', { ordner: o });
                  }}
                >
                  Ordner wählen …
                </button>
              </div>
            </Feld>
            <Feld label="Dateiendungen" hinweis="durch Komma getrennt">
              <TextEingabe wert={e.scan.endungen.join(', ')} onChange={(s) => setze('scan', { endungen: liste(s).map((x) => x.replace(/^\./, '')) })} />
            </Feld>
          </div>
        </Abschnitt>

        <Abschnitt titel="Mailvorlagen" text="Die Mail öffnet sich mit Anhang im Mailprogramm als neue Nachricht – nur noch „Senden“. Manche Programme zeigen sie nur an.">
          <MailVorlagen vorlagen={e.mail.vorlagen} onChange={(vorlagen) => setze('mail', { vorlagen })} />
        </Abschnitt>

        <Abschnitt titel="Leistungsverzeichnisse">
          <div className="ava-formular">
            <Feld label="Format neuer LV-Dateien">
              <select value={e.lv.neuesFormat} onChange={(x) => setze('lv', { neuesFormat: x.target.value as 'aslv' | 'oalv' })}>
                <option value="aslv">LV-Datei (.aslv) – auch im LV-Programm zu öffnen</option>
                <option value="oalv">eigenes Format (.oalv) – alle Positionsarten, ohne LV-Programm</option>
              </select>
            </Feld>
          </div>
          <p className="muted small-text">
            Name neuer LV-Dateien: <code>{gespeichert.lv.dateiname}</code> – dahinter folgt die Bezeichnung.
          </p>
          <PfadeVerweis fokus="vorlagen.fabrio.lv" text="Name neuer LV-Dateien …" />
        </Abschnitt>

        <Abschnitt titel="Vorgabe" text="Alle Abschnitte dieser Seite auf die Vorgabe zurücksetzen – Ablage und Dateinamen nicht, sie stehen auf „Pfade und Benennung“. Wirksam erst mit „Übernehmen“.">
          <button
            type="button"
            className="ava-einst-vorgabe"
            onClick={async () => {
              if (
                await bestaetigen(
                  'Alle Einstellungen von FABRIO zurücksetzen?',
                  'Alle Abschnitte der Seite FABRIO werden auf die Vorgabe zurückgesetzt – Ablage und Dateinamen nicht. Wirksam erst mit „Übernehmen“.',
                  'Zurücksetzen',
                  true,
                )
              )
                setzeAlles(mitZentral(VORGABE, gespeichert));
            }}
          >
            Alles zurücksetzen …
          </button>
        </Abschnitt>
      </fieldset>
    </>
  );
}

type MailFeld = 'an' | 'cc' | 'betreff' | 'text';
const MAIL_FELDER: Record<MailFeld, string> = { an: 'An', cc: 'Cc', betreff: 'Betreff', text: 'Text' };

function MailVorlagen({ vorlagen, onChange }: { vorlagen: MailVorlage[]; onChange: (v: MailVorlage[]) => void }) {
  const [id, setId] = useState(vorlagen[0]?.id ?? '');
  /** Feld, in das die Platzhalter-Chips einfügen: das zuletzt bearbeitete */
  const [ziel, setZiel] = useState<MailFeld>('text');
  // gewählte Vorlage nicht mehr da (entfernt, „Alles zurücksetzen“): die erste zeigen
  const v = vorlagen.find((x) => x.id === id) ?? vorlagen[0];
  const aktiv = v?.id ?? '';
  const setze = (patch: Partial<MailVorlage>) => onChange(vorlagen.map((x) => (x.id === aktiv ? { ...x, ...patch } : x)));
  const variablen = mailVariablen(aktiv);
  const alle = v ? [v.an, v.cc, v.betreff, v.text].join('\n') : '';
  return (
    <div className="ava-mailvorlagen">
      <div className="ava-reihe">
        <select value={aktiv} aria-label="Mailvorlage" onChange={(x) => setId(x.target.value)}>
          {vorlagen.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          title="Mailvorlage hinzufügen"
          onClick={() => {
            const n = { id: neueId('m'), name: 'Neue Vorlage', an: '', cc: '', betreff: '{PROJEKT_KUERZEL} {PROJEKT_VORHABEN}', text: '' };
            onChange([...vorlagen, n]);
            setId(n.id);
          }}
        >
          <Symbol name="plus" /> Mailvorlage hinzufügen
        </button>
        {v && !['rechnung', 'auftrag', 'protokoll'].includes(v.id) && (
          <button
            type="button"
            className="danger"
            onClick={async () => {
              if (!(await bestaetigen('Vorlage entfernen?', `Die Mailvorlage „${v.name}“ wird entfernt (wirksam mit „Übernehmen“).`, 'Entfernen', true))) return;
              const rest = vorlagen.filter((x) => x.id !== aktiv);
              onChange(rest);
              setId(rest[0]?.id ?? '');
            }}
          >
            Entfernen …
          </button>
        )}
      </div>
      {v && (
        <div className="ava-formular">
          <Feld label="Name" breit>
            <TextEingabe wert={v.name} onChange={(name) => setze({ name })} />
          </Feld>
          <Feld label="An">
            <span className="ava-mailfeld" onFocus={() => setZiel('an')}>
              <TextEingabe wert={v.an} onChange={(an) => setze({ an })} />
            </span>
          </Feld>
          <Feld label="Cc">
            <span className="ava-mailfeld" onFocus={() => setZiel('cc')}>
              <TextEingabe wert={v.cc} onChange={(cc) => setze({ cc })} />
            </span>
          </Feld>
          <Feld label="Betreff" breit>
            <span className="ava-mailfeld" onFocus={() => setZiel('betreff')}>
              <TextEingabe wert={v.betreff} onChange={(betreff) => setze({ betreff })} />
            </span>
          </Feld>
          <Feld label="Text" breit>
            <span className="ava-mailfeld" onFocus={() => setZiel('text')}>
              <TextEingabe mehrzeilig zeilen={8} wert={v.text} onChange={(text) => setze({ text })} />
            </span>
          </Feld>
          <div className="ava-feld-breit">
            <PlatzhalterHinweise
              vorlage={alle}
              variablen={variablen}
              onAnpassen={() => setze({ an: modernisieren(v.an, variablen), cc: modernisieren(v.cc, variablen), betreff: modernisieren(v.betreff, variablen), text: modernisieren(v.text, variablen) })}
            />
            <PlatzhalterChips
              variablen={variablen}
              label={`Mailvorlage, eingefügt in „${MAIL_FELDER[ziel]}“`}
              fokusBehalten={false}
              onEinfuegen={(p) => setze({ [ziel]: platzhalterEinfuegen(v[ziel], p).text })}
            />
            <span className="ava-feld-hinweis">Ein Klick fügt den Platzhalter am Ende von „{MAIL_FELDER[ziel]}“ ein (zuletzt bearbeitetes Feld).</span>
          </div>
        </div>
      )}
    </div>
  );
}
