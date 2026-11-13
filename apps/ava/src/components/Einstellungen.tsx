import { useEffect, useState } from 'react';
import { Modal } from '@core/ui/Dialog';
import { bestaetigen, meldung } from '@core/ui/Rueckfrage';
import { ordnerWaehlen } from '@core/platform/projektordner';
import { openFileWithPath } from '@core/platform/files';
import { bueroName, KonfigNichtErreichbar, konfigNeuLesen } from '@core/platform/konfig';
import { modernisieren } from '@core/platzhalter';
import { PlatzhalterChips, PlatzhalterHinweise, platzhalterEinfuegen } from '@core/ui/Platzhalter';
import { nameBilden, nameErkennen } from '../abrechnung/benennung';
import { LV_NAME_VARIABLEN, mailVariablen, RECHNUNG_NAME_VARIABLEN } from '../platzhalter';
import type { AvaEinstellungen, MailVorlage } from '../einstellungen';
import { EinstellungenKonflikt, VORGABE } from '../einstellungen';
import { neueId } from '../lv/modell';
import { useAva } from '../store';
import { Feld, TextEingabe, ZahlEingabe } from './eingaben';
import { listenTaste } from './tastatur';

type Ebene = 'ablage' | 'rechnungen' | 'pruefung' | 'deckblatt' | 'scan' | 'mail' | 'lv';

const EBENEN: { id: Ebene; text: string }[] = [
  { id: 'ablage', text: 'Ablage' },
  { id: 'rechnungen', text: 'Rechnungen & Benennung' },
  { id: 'pruefung', text: 'Prüfung' },
  { id: 'deckblatt', text: 'Deckblatt' },
  { id: 'scan', text: 'Scanordner' },
  { id: 'mail', text: 'Mailvorlagen' },
  { id: 'lv', text: 'Leistungsverzeichnisse' },
];

const liste = (s: string) =>
  s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

/** Einstellungen der App – gelten für das ganze Büro (gemeinsamer Konfigurationsordner) */
export function EinstellungenModal() {
  const gespeichert = useAva((s) => s.einstellungen);
  const [e, setE] = useState<AvaEinstellungen>(gespeichert);
  const [ebene, setEbene] = useState<Ebene>('ablage');
  const [probe, setProbe] = useState('K62 R021 Witthaut 251024 AB1.pdf');
  const schliessen = () => useAva.getState().setEinstellungenOffen(false);
  // Speicherort gewechselt (z. B. in einem anderen Fenster) bzw. Netzlaufwerk weg oder wieder da: der Entwurf stammt vom
  // alten Stand – nicht darüber speichern
  useEffect(
    () =>
      konfigNeuLesen(() => {
        schliessen();
        void meldung('Einstellungen neu geladen', 'Der Speicherort der Einstellungen wurde gewechselt bzw. das Netzlaufwerk getrennt oder wieder verbunden. Bitte die Einstellungen noch einmal öffnen und die Änderung vornehmen.');
      }),
    [],
  );
  const setze = <K extends keyof AvaEinstellungen>(k: K, patch: Partial<AvaEinstellungen[K]>) => setE((x) => ({ ...x, [k]: { ...x[k], ...patch } }));

  const speichern = async () => {
    try {
      await useAva.getState().einstellungenSetzen(e);
      schliessen();
    } catch (x) {
      // anderer Rechner oder Netzlaufwerk weg: die Meldung erklärt es selbst
      const klar = x instanceof EinstellungenKonflikt || x instanceof KonfigNichtErreichbar;
      await meldung('Einstellungen nicht gespeichert', klar ? x.message : 'Der gemeinsame Konfigurationsordner ließ sich nicht schreiben.', klar ? undefined : x);
    }
  };

  /** Abbrechen, Esc: ungespeicherte Änderungen nicht ohne Rückfrage verwerfen */
  const abbrechen = async () => {
    if (e !== gespeichert && !(await bestaetigen('Änderungen verwerfen?', 'Die geänderten Einstellungen sind noch nicht gespeichert.', 'Verwerfen', true))) return;
    schliessen();
  };

  const erkannt = nameErkennen(probe, e.rechnungen.muster, e.rechnungen.arten);

  return (
    <Modal titel="Einstellungen" onClose={() => void abbrechen()} breit klickDaneben={false} className="ava-einstellungen">
      <div className="ava-einst-kopf">
        <h2>Einstellungen</h2>
        <span className="muted small-text">gelten für das ganze Büro (gemeinsamer Konfigurationsordner)</span>
      </div>
      <div className="ava-einst-koerper">
        <ul className="list ava-einst-ebenen" role="tablist" aria-orientation="vertical" aria-label="Bereiche der Einstellungen">
          {EBENEN.map((x, i) => (
            <li
              key={x.id}
              role="tab"
              tabIndex={x.id === ebene ? 0 : -1}
              aria-selected={x.id === ebene}
              className={x.id === ebene ? 'active' : ''}
              onClick={() => setEbene(x.id)}
              onKeyDown={(k) => listenTaste(k, EBENEN, i, (y) => setEbene(y.id))}
            >
              {x.text}
            </li>
          ))}
        </ul>
        <div className="ava-einst-inhalt">
          {ebene === 'ablage' && (
            <div className="ava-formular">
              <p className="muted ava-feld-breit">Wo im Projektordner was liegt. Gewerkeordner heißen „G08 Fenster“ (Kennung G + Nummer, dann die Bezeichnung).</p>
              <Feld label="Ordner der Gewerke" hinweis="relativ zum Projektordner">
                <TextEingabe wert={e.ablage.gewerke} onChange={(gewerke) => setze('ablage', { gewerke })} />
              </Feld>
              <Feld label="LV-Dateien im Unterordner" hinweis="leer = direkt im Gewerkeordner">
                <TextEingabe wert={e.ablage.lv} onChange={(lv) => setze('ablage', { lv })} />
              </Feld>
              <Feld label="Aufträge und Rechnungen">
                <TextEingabe wert={e.ablage.auftrag} onChange={(auftrag) => setze('ablage', { auftrag })} />
              </Feld>
              <Feld label="Mailverkehr des Gewerks">
                <TextEingabe wert={e.ablage.korrespondenz} onChange={(korrespondenz) => setze('ablage', { korrespondenz })} />
              </Feld>
              <Feld label="Archivordner" hinweis="durch Komma getrennt; im Gewerk und im Auftragsordner">
                <TextEingabe wert={e.ablage.archive.join(', ')} onChange={(s) => setze('ablage', { archive: liste(s) })} />
              </Feld>
              <Feld label="Kostenkontrolle" hinweis="Teil des Dateinamens; „AKTUELL“ bzw. das jüngste Datum im Namen gewinnt">
                <TextEingabe wert={e.ablage.kostenkontrolle} onChange={(kostenkontrolle) => setze('ablage', { kostenkontrolle })} />
              </Feld>
              <Feld label="Bauleitung (Protokolle, Bautagebuch)">
                <TextEingabe wert={e.ablage.bauleitung} onChange={(bauleitung) => setze('ablage', { bauleitung })} />
              </Feld>
              <Feld label="Weitere Mailordner des Projekts" hinweis="Ordnernamen, durch Komma getrennt">
                <TextEingabe wert={e.ablage.mailOrdner.join(', ')} onChange={(s) => setze('ablage', { mailOrdner: liste(s) })} />
              </Feld>
            </div>
          )}
          {ebene === 'rechnungen' && (
            <div className="ava-formular">
              <p className="muted ava-feld-breit">Muster der Dateinamen im Auftragsordner. Das erste gilt für neue Dateien, alle zum Erkennen vorhandener.</p>
              <Feld label="Muster (je Zeile eines)" breit>
                <TextEingabe mehrzeilig zeilen={4} wert={e.rechnungen.muster.join('\n')} onChange={(s) => setze('rechnungen', { muster: s.split('\n').map((x) => x.trim()).filter(Boolean) })} />
              </Feld>
              <div className="ava-feld-breit">
                <PlatzhalterHinweise vorlage={e.rechnungen.muster.join('\n')} variablen={RECHNUNG_NAME_VARIABLEN} onAnpassen={(s) => setze('rechnungen', { muster: s.split('\n') })} />
                <PlatzhalterChips
                  variablen={RECHNUNG_NAME_VARIABLEN}
                  label="Muster der Rechnungsdateien (an das erste Muster angehängt)"
                  fokusBehalten={false}
                  onEinfuegen={(p) => setE((x) => ({ ...x, rechnungen: { ...x.rechnungen, muster: [platzhalterEinfuegen(x.rechnungen.muster[0] ?? '', p).text, ...x.rechnungen.muster.slice(1)] } }))}
                />
                <span className="ava-feld-hinweis">Ein Klick hängt den Platzhalter an das erste Muster an.</span>
              </div>
              <Feld label="Beispiel für neue Dateien" breit>
                <code>{nameBilden(e.rechnungen.muster[0] ?? '', { kuerzel: 'K62', nr: 53, firma: 'Witthaut', datum: '2026-11-12', art: 'SR', lfd: 4, gewerk: 'G08' })}.pdf</code>
              </Feld>
              <Feld label="Erkennen ausprobieren" breit>
                <input value={probe} onChange={(x) => setProbe(x.target.value)} />
                <span className="ava-feld-hinweis">{erkannt ? `erkannt: Nr. ${erkannt.nr ?? '–'}, ${erkannt.art ?? ''}${erkannt.lfd ?? ''}, ${erkannt.firma ?? ''}, ${erkannt.datum ?? ''} (Muster „${erkannt.muster}“)` : 'passt zu keinem Muster'}</span>
              </Feld>
              <Feld label="Rechnungsarten" hinweis="je Zeile: Kürzel = Name (AB = Abschlagsrechnung …)" breit>
                <TextEingabe
                  mehrzeilig
                  zeilen={4}
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
              <label className="ava-check ava-feld-breit">
                <input type="checkbox" checked={e.rechnungen.nrAufDeckblatt} onChange={(x) => setze('rechnungen', { nrAufDeckblatt: x.target.checked })} /> Nummer der Rechnungsliste auf dem Deckblatt
              </label>
              <label className="ava-check ava-feld-breit">
                <input type="checkbox" checked={e.rechnungen.deckblattVoranstellen} onChange={(x) => setze('rechnungen', { deckblattVoranstellen: x.target.checked })} /> Deckblatt beim Ablegen digital vor den Scan setzen (sonst wird es mit eingescannt)
              </label>
            </div>
          )}
          {ebene === 'pruefung' && (
            <div className="ava-formular">
              <p className="muted ava-feld-breit">Vorgaben einer neuen Rechnungsprüfung (lassen sich je Rechnung ändern).</p>
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
          )}
          {ebene === 'deckblatt' && (
            <div className="ava-formular">
              <Feld label="Briefbogen (PDF)" hinweis="erste Seite als Hintergrund; leer = Büroname oben rechts und Fußzeile" breit>
                <div className="ava-reihe">
                  <TextEingabe wert={e.deckblatt.briefbogen} onChange={(briefbogen) => setze('deckblatt', { briefbogen })} />
                  <button
                    onClick={async () => {
                      const d = await openFileWithPath({ filterName: 'PDF', extensions: ['pdf'] });
                      if (d?.pfad) setze('deckblatt', { briefbogen: d.pfad });
                    }}
                  >
                    Wählen …
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
          )}
          {ebene === 'scan' && (
            <div className="ava-formular">
              <Feld label="Scanordner" hinweis="Ordner, in dem der Scanner die Dateien ablegt (z. B. \\server\Scans)" breit>
                <div className="ava-reihe">
                  <TextEingabe wert={e.scan.ordner} onChange={(ordner) => setze('scan', { ordner })} />
                  <button
                    onClick={async () => {
                      const o = await ordnerWaehlen('Scanordner wählen');
                      if (o) setze('scan', { ordner: o });
                    }}
                  >
                    Wählen …
                  </button>
                </div>
              </Feld>
              <Feld label="Dateiendungen" hinweis="durch Komma getrennt">
                <TextEingabe wert={e.scan.endungen.join(', ')} onChange={(s) => setze('scan', { endungen: liste(s).map((x) => x.replace(/^\./, '')) })} />
              </Feld>
            </div>
          )}
          {ebene === 'mail' && <MailVorlagen vorlagen={e.mail.vorlagen} onChange={(vorlagen) => setze('mail', { vorlagen })} />}
          {ebene === 'lv' && (
            <div className="ava-formular">
              <Feld label="Format neuer LV-Dateien">
                <select value={e.lv.neuesFormat} onChange={(x) => setze('lv', { neuesFormat: x.target.value as 'aslv' | 'oalv' })}>
                  <option value="aslv">LV-Datei (.aslv) – auch im LV-Programm zu öffnen</option>
                  <option value="oalv">eigenes Format (.oalv) – alle Positionsarten, ohne LV-Programm</option>
                </select>
              </Feld>
              <Feld label="Name neuer LV-Dateien" hinweis="dahinter folgt die Bezeichnung">
                <TextEingabe wert={e.lv.dateiname} onChange={(dateiname) => setze('lv', { dateiname })} />
              </Feld>
              <div className="ava-feld-breit">
                <PlatzhalterHinweise vorlage={e.lv.dateiname} variablen={LV_NAME_VARIABLEN} onAnpassen={(dateiname) => setze('lv', { dateiname })} />
                <PlatzhalterChips
                  variablen={LV_NAME_VARIABLEN}
                  label="Name neuer LV-Dateien"
                  fokusBehalten={false}
                  onEinfuegen={(p) => setE((x) => ({ ...x, lv: { ...x.lv, dateiname: platzhalterEinfuegen(x.lv.dateiname, p).text } }))}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="dialog-buttons">
        <button
          onClick={async () => {
            if (await bestaetigen('Alles auf die Vorgabe?', 'Alle Bereiche der Einstellungen werden auf die Vorgabe zurückgesetzt. Wirksam erst mit „Speichern“.', 'Zurücksetzen', true)) setE(VORGABE);
          }}
          title="Alle Einstellungen auf die Vorgabe zurücksetzen (erst mit „Speichern“ wirksam)"
        >
          Vorgabe
        </button>
        <span className="tb-spacer" />
        <button onClick={() => void abbrechen()}>Abbrechen</button>
        <button className="primary" onClick={() => void speichern()}>
          Speichern
        </button>
      </div>
    </Modal>
  );
}

type MailFeld = 'an' | 'cc' | 'betreff' | 'text';
const MAIL_FELDER: Record<MailFeld, string> = { an: 'An', cc: 'Cc', betreff: 'Betreff', text: 'Text' };

function MailVorlagen({ vorlagen, onChange }: { vorlagen: MailVorlage[]; onChange: (v: MailVorlage[]) => void }) {
  const [id, setId] = useState(vorlagen[0]?.id ?? '');
  /** Feld, in das die Platzhalter-Chips einfügen: das zuletzt bearbeitete */
  const [ziel, setZiel] = useState<MailFeld>('text');
  const v = vorlagen.find((x) => x.id === id);
  const setze = (patch: Partial<MailVorlage>) => onChange(vorlagen.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const variablen = mailVariablen(id);
  const alle = v ? [v.an, v.cc, v.betreff, v.text].join('\n') : '';
  return (
    <div className="ava-mailvorlagen">
      <p className="muted">Die Mail öffnet sich als Entwurf mit Anhang im Mailprogramm (Outlook: als neue Nachricht) – nur noch „Senden“.</p>
      <div className="ava-reihe">
        <select value={id} onChange={(x) => setId(x.target.value)}>
          {vorlagen.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            const n = { id: neueId('m'), name: 'Neue Vorlage', an: '', cc: '', betreff: '{PROJEKT_KUERZEL} {PROJEKT_VORHABEN}', text: '' };
            onChange([...vorlagen, n]);
            setId(n.id);
          }}
        >
          + Vorlage
        </button>
        {v && !['rechnung', 'auftrag', 'protokoll'].includes(v.id) && (
          <button
            className="danger"
            onClick={async () => {
              if (!(await bestaetigen('Vorlage entfernen?', `Die Mailvorlage „${v.name}“ wird entfernt (wirksam mit „Speichern“).`, 'Entfernen', true))) return;
              onChange(vorlagen.filter((x) => x.id !== id));
              setId(vorlagen[0]?.id ?? '');
            }}
          >
            Entfernen
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
            <PlatzhalterChips variablen={variablen} label={`Mailvorlage, eingefügt in „${MAIL_FELDER[ziel]}“`} fokusBehalten={false} onEinfuegen={(p) => setze({ [ziel]: platzhalterEinfuegen(v[ziel], p).text })} />
            <span className="ava-feld-hinweis">Ein Klick fügt den Platzhalter am Ende von „{MAIL_FELDER[ziel]}“ ein (zuletzt bearbeitetes Feld).</span>
          </div>
        </div>
      )}
    </div>
  );
}
