//! Desktop-Hülle für die Formulare-App. Die allgemeinen Befehle (Speichern-Dialoge, Protokoll) stehen in
//! packages/core/tauri/commands.rs; hier kommen die Dateisystem-Befehle für die FORMA-Projektordner dazu.
//!
//! Grundsatz: Ersetzt werden nur vorhandene Formulare (`.frmsjf`), angelegt und gelöscht nur Sperrdateien
//! (`.frmtmp`) – und gelöscht nur, solange sie noch genau den Inhalt haben, den diese App geschrieben hat. In der
//! Projektkarte (`sj_prokarte.sdb`) werden nur vorhandene Einträge geändert, und nur wenn sie noch den Wert haben,
//! von dem die Änderung ausgeht. Jeder Pfad bleibt innerhalb des vom Benutzer gewählten Ordners. Eigene
//! Sperrdateien werden beim Beenden entfernt.

include!("../../../../packages/core/tauri/commands.rs");

use std::collections::HashMap;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

use tauri::Manager;

/// größte Datei, die gelesen wird (Formulare mit eingebetteten Bildern haben einige MB)
const MAX_LESEN: u64 = 64 * 1024 * 1024;
/// Obergrenze der Einträge beim Auflisten (Schutz vor versehentlich gewählten Laufwerken)
const MAX_EINTRAEGE: usize = 50_000;

/// Sperrdateien, die diese App angelegt hat: Inhalt und ein offener Griff darauf. Solange der Griff offen ist,
/// kann kein anderes Programm die Datei löschen oder exklusiv öffnen – daran erkennt jeder Rechner im Netz, dass
/// die Sperre benutzt wird. Stürzt die App ab, schließt Windows den Griff: Die Datei bleibt, gilt aber als frei.
#[derive(Default)]
struct EigeneSperren(Mutex<HashMap<PathBuf, (Vec<u8>, std::fs::File)>>);

#[derive(serde::Serialize)]
struct SperrProbe {
    /// Inhalt der Sperrdatei (Base64)
    inhalt: String,
    /// ein Programm hält die Datei offen (nur unter Windows prüfbar)
    offen: bool,
    /// von dieser App in diesem Lauf angelegt
    eigen: bool,
    /// letzte Änderung (ms seit 1970)
    geaendert: u64,
}

/// Lesegriff, der anderen nur das Lesen erlaubt (FORMA zeigt an, wer das Formular geöffnet hat)
fn griff_oeffnen(p: &Path) -> std::io::Result<std::fs::File> {
    let mut o = std::fs::OpenOptions::new();
    o.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        o.share_mode(0x0000_0001); // FILE_SHARE_READ
    }
    o.open(p)
}

/// Hält ein anderes Programm die Datei offen? Probe: exklusiv öffnen – scheitert das an der gemeinsamen
/// Nutzung, ist sie in Gebrauch. Ohne Windows lässt sich das nicht feststellen.
fn wird_benutzt(p: &Path) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        // 32 = ERROR_SHARING_VIOLATION, 33 = ERROR_LOCK_VIOLATION
        matches!(
            std::fs::OpenOptions::new().read(true).share_mode(0).open(p),
            Err(e) if matches!(e.raw_os_error(), Some(32) | Some(33))
        )
    }
    #[cfg(not(windows))]
    {
        let _ = p;
        false
    }
}

#[derive(serde::Serialize)]
struct Eintrag {
    /// Pfad relativ zum aufgelisteten Ordner, mit „/“ getrennt
    pfad: String,
    ordner: bool,
    groesse: u64,
}

#[derive(serde::Serialize)]
struct Rechner {
    benutzer: String,
    computer: String,
    prozess: u32,
}

/// Setzt `rel` unter `root` – nur gewöhnliche Namen, kein „..“, kein absoluter Pfad.
fn unterhalb(root: &str, rel: &str) -> Result<PathBuf, String> {
    let root = Path::new(root);
    if !root.is_absolute() {
        return Err(format!("Kein vollständiger Pfad: {}", root.display()));
    }
    let mut out = root.to_path_buf();
    let mut teile = 0;
    for c in Path::new(rel).components() {
        match c {
            Component::Normal(n) => {
                out.push(n);
                teile += 1;
            }
            Component::CurDir => {}
            _ => return Err(format!("Unzulässiger Pfad: {rel}")),
        }
    }
    if teile == 0 {
        return Err("Leerer Pfad".into());
    }
    Ok(out)
}

fn endung_ist(p: &Path, endung: &str) -> bool {
    p.extension().is_some_and(|e| e.eq_ignore_ascii_case(endung))
}

fn base64_lesen(daten: &str) -> Result<Vec<u8>, String> {
    base64::engine::general_purpose::STANDARD
        .decode(daten.as_bytes())
        .map_err(|e| format!("Ungültige Daten: {e}"))
}

/// Öffnet den Dialog zur Ordnerwahl. `None`, wenn der Benutzer abgebrochen hat.
#[tauri::command]
async fn pick_folder(app: tauri::AppHandle, title: String) -> Result<Option<String>, String> {
    let picked = app.dialog().file().set_title(title).blocking_pick_folder();
    match picked {
        Some(p) => Ok(Some(p.into_path().map_err(|e| e.to_string())?.display().to_string())),
        None => Ok(None),
    }
}

fn sammle(dir: &Path, prefix: &str, tiefe: u32, out: &mut Vec<Eintrag>) -> Result<(), String> {
    let lesen = std::fs::read_dir(dir).map_err(|e| format!("{}: {}", dir.display(), e))?;
    for e in lesen {
        let e = e.map_err(|e| format!("{}: {}", dir.display(), e))?;
        let typ = e.file_type().map_err(|e| e.to_string())?;
        if typ.is_symlink() {
            continue;
        }
        let name = e.file_name().to_string_lossy().to_string();
        let pfad = if prefix.is_empty() { name } else { format!("{prefix}/{name}") };
        if out.len() >= MAX_EINTRAEGE {
            return Err(format!("Mehr als {MAX_EINTRAEGE} Einträge – bitte einen kleineren Ordner wählen."));
        }
        if typ.is_dir() {
            out.push(Eintrag { pfad: pfad.clone(), ordner: true, groesse: 0 });
            if tiefe > 1 {
                sammle(&e.path(), &pfad, tiefe - 1, out)?;
            }
        } else {
            let groesse = e.metadata().map(|m| m.len()).unwrap_or(0);
            out.push(Eintrag { pfad, ordner: false, groesse });
        }
    }
    Ok(())
}

/// Listet Ordner und Dateien unter `root` bis zur Tiefe `tiefe` (1 = nur der Ordner selbst).
#[tauri::command]
async fn fs_list(root: String, tiefe: u32) -> Result<Vec<Eintrag>, String> {
    let dir = Path::new(&root);
    if !dir.is_absolute() {
        return Err(format!("Kein vollständiger Pfad: {root}"));
    }
    let mut out = Vec::new();
    sammle(dir, "", tiefe.max(1), &mut out)?;
    out.sort_by_key(|e| e.pfad.to_lowercase());
    Ok(out)
}

/// Liest eine Datei unter `root` (Base64) oder `None`, wenn es sie nicht gibt.
#[tauri::command]
async fn fs_read(root: String, pfad: String) -> Result<Option<String>, String> {
    let p = unterhalb(&root, &pfad)?;
    let groesse = match std::fs::metadata(&p) {
        Ok(m) => m.len(),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("{}: {}", p.display(), e)),
    };
    if groesse > MAX_LESEN {
        return Err(format!("{}: Datei ist größer als {} MB", p.display(), MAX_LESEN / 1024 / 1024));
    }
    let bytes = std::fs::read(&p).map_err(|e| format!("{}: {}", p.display(), e))?;
    Ok(Some(base64::engine::general_purpose::STANDARD.encode(bytes)))
}

/// Ersetzt ein vorhandenes Formular (.frmsjf) atomar. Andere Dateien und neue Dateien werden abgelehnt.
#[tauri::command]
async fn fs_replace(root: String, pfad: String, contents_base64: String) -> Result<(), String> {
    let p = unterhalb(&root, &pfad)?;
    if !endung_ist(&p, "frmsjf") {
        return Err(format!("{}: Nur Formulare (.frmsjf) dürfen ersetzt werden", p.display()));
    }
    if !p.is_file() {
        return Err(format!("{}: Formular nicht gefunden", p.display()));
    }
    let bytes = base64_lesen(&contents_base64)?;
    let ziel = p.clone();
    let laenge = bytes.len();
    tauri::async_runtime::spawn_blocking(move || write_atomic(&ziel, &bytes))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| {
            log::error!("Speichern fehlgeschlagen: {}: {}", p.display(), e);
            format!("{}: {}", p.display(), e)
        })?;
    log::info!("Formular gespeichert: {} ({} Bytes)", p.display(), laenge);
    Ok(())
}

/// Legt eine Sperrdatei (.frmtmp) an. `false`, wenn es schon eine gibt (das Formular ist anderswo geöffnet).
#[tauri::command]
async fn lock_create(
    sperren: tauri::State<'_, EigeneSperren>,
    root: String,
    pfad: String,
    contents_base64: String,
) -> Result<bool, String> {
    let p = unterhalb(&root, &pfad)?;
    if !endung_ist(&p, "frmtmp") {
        return Err(format!("{}: Keine Sperrdatei (.frmtmp)", p.display()));
    }
    let bytes = base64_lesen(&contents_base64)?;
    // create_new: schlägt fehl, wenn die Datei existiert – nie eine fremde Sperre überschreiben
    match std::fs::OpenOptions::new().write(true).create_new(true).open(&p) {
        Ok(mut f) => {
            f.write_all(&bytes).and_then(|_| f.flush()).map_err(|e| format!("{}: {}", p.display(), e))?;
            drop(f);
            // offen halten, solange das Formular geöffnet ist (nur lesend – FORMA darf die Sperre lesen)
            let griff = griff_oeffnen(&p).map_err(|e| format!("{}: {}", p.display(), e))?;
            sperren.0.lock().map_err(|e| e.to_string())?.insert(p.clone(), (bytes, griff));
            log::info!("Gesperrt: {}", p.display());
            Ok(true)
        }
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => Ok(false),
        Err(e) => Err(format!("{}: {}", p.display(), e)),
    }
}

/// Zustand einer Sperrdatei: Inhalt, ob ein Programm sie offen hält, ob sie von dieser App stammt, Alter.
/// `None`, wenn es sie nicht gibt.
#[tauri::command]
async fn lock_probe(sperren: tauri::State<'_, EigeneSperren>, root: String, pfad: String) -> Result<Option<SperrProbe>, String> {
    let p = unterhalb(&root, &pfad)?;
    if !endung_ist(&p, "frmtmp") {
        return Err(format!("{}: Keine Sperrdatei (.frmtmp)", p.display()));
    }
    let eigen = sperren.0.lock().map_err(|e| e.to_string())?.contains_key(&p);
    let ziel = p.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let p = ziel;
        let inhalt = match std::fs::read(&p) {
            Ok(b) => b,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(format!("{}: {}", p.display(), e)),
        };
        let geaendert = std::fs::metadata(&p)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        Ok(Some(SperrProbe {
            inhalt: base64::engine::general_purpose::STANDARD.encode(inhalt),
            offen: wird_benutzt(&p),
            eigen,
            geaendert,
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Name des Programms mit dieser Prozessnummer auf diesem Rechner; `None`, wenn keins läuft.
#[tauri::command]
async fn process_info(pid: u32) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || prozess_name(pid)).await.map_err(|e| e.to_string())
}

fn prozess_name(pid: u32) -> Option<String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CSV ohne Kopf: "Name.exe","1234",… – ohne Treffer nur eine Hinweiszeile ohne Anführungszeichen
        let aus = std::process::Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"])
            .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&aus.stdout);
        let zeile = text.lines().find(|z| z.starts_with('"'))?;
        let mut felder = zeile.split("\",\"");
        let name = felder.next()?.trim_start_matches('"').to_string();
        let nummer = felder.next()?.trim_end_matches('"');
        (nummer == pid.to_string()).then_some(name)
    }
    #[cfg(not(windows))]
    {
        let aus = std::process::Command::new("ps").args(["-p", &pid.to_string(), "-o", "comm="]).output().ok()?;
        let name = String::from_utf8_lossy(&aus.stdout).trim().to_string();
        (!name.is_empty()).then_some(name)
    }
}

/// Löscht eine Sperrdatei, wenn sie noch genau `inhalt` enthält.
fn sperre_entfernen(p: &Path, inhalt: &[u8]) -> Result<bool, String> {
    match std::fs::read(p) {
        Ok(jetzt) if jetzt == inhalt => {
            std::fs::remove_file(p).map_err(|e| match e.raw_os_error() {
                Some(32) | Some(33) => format!("{}: Die Sperre wird gerade von einem anderen Programm benutzt", p.display()),
                _ => format!("{}: {}", p.display(), e),
            })?;
            log::info!("Entsperrt: {}", p.display());
            Ok(true)
        }
        Ok(_) => {
            log::warn!("Sperrdatei nicht entfernt, Inhalt ist nicht mehr der eigene: {}", p.display());
            Ok(false)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(format!("{}: {}", p.display(), e)),
    }
}

/// Löscht eine Sperrdatei – nur wenn sie noch genau den übergebenen Inhalt hat. Das gilt für die eigene beim
/// Schließen ebenso wie für eine verwaiste, die der Benutzer ausdrücklich aufhebt. Hält ein anderes Programm sie
/// offen, scheitert das Löschen.
#[tauri::command]
async fn lock_release(
    sperren: tauri::State<'_, EigeneSperren>,
    root: String,
    pfad: String,
    contents_base64: String,
) -> Result<bool, String> {
    let p = unterhalb(&root, &pfad)?;
    if !endung_ist(&p, "frmtmp") {
        return Err(format!("{}: Keine Sperrdatei (.frmtmp)", p.display()));
    }
    let bytes = base64_lesen(&contents_base64)?;
    sperren.0.lock().map_err(|e| e.to_string())?.remove(&p);
    sperre_entfernen(&p, &bytes)
}

#[derive(serde::Serialize)]
struct PkGruppe {
    id: i64,
    typ: i64,
    /// Text als gespeicherte Bytes (UTF-8; Umwandlung in der Oberfläche)
    text: Vec<u8>,
}

#[derive(serde::Serialize)]
struct PkInhalt {
    gruppe: i64,
    id: i64,
    /// 1 Text, 2 mehrzeilig, 4 Auswahlliste, 8 Optionen, 16 Kästchen
    typ: i64,
    /// gewählte Möglichkeit (Typ 4/8) bzw. angekreuzt (Typ 16)
    ganzzahl: Option<i64>,
    titel: Vec<u8>,
    /// Text (Typ 1/2), die Möglichkeiten zeilenweise (Typ 4/8) bzw. die Beschriftung (Typ 16)
    texte: Vec<u8>,
}

#[derive(serde::Serialize)]
struct PkRoh {
    gruppen: Vec<PkGruppe>,
    inhalte: Vec<PkInhalt>,
}

/// Neuer Wert eines Eintrags mit dem Wert, von dem die Änderung ausgeht
#[derive(serde::Deserialize)]
#[serde(tag = "spalte", rename_all = "lowercase")]
enum PkWert {
    Texte { alt: Vec<u8>, neu: Vec<u8> },
    Ganzzahl { alt: Option<i64>, neu: Option<i64> },
}

#[derive(serde::Deserialize)]
struct PkAenderung {
    gruppe: i64,
    id: i64,
    typ: i64,
    #[serde(flatten)]
    wert: PkWert,
}

/// Text einer Spalte als Bytes, wie gespeichert – FORMA schreibt UTF-8; ungültige Bytes sollen nicht verloren gehen
fn bytes_spalte(row: &rusqlite::Row, i: usize) -> rusqlite::Result<Vec<u8>> {
    use rusqlite::types::ValueRef;
    Ok(match row.get_ref(i)? {
        ValueRef::Text(t) | ValueRef::Blob(t) => t.to_vec(),
        ValueRef::Null => Vec::new(),
        ValueRef::Integer(n) => n.to_string().into_bytes(),
        ValueRef::Real(f) => f.to_string().into_bytes(),
    })
}

fn sdb_pfad(root: &str, pfad: &str) -> Result<PathBuf, String> {
    let p = unterhalb(root, pfad)?;
    if !p.file_name().is_some_and(|n| n.eq_ignore_ascii_case("sj_prokarte.sdb")) {
        return Err(format!("{}: Keine Projektkarte (sj_prokarte.sdb)", p.display()));
    }
    Ok(p)
}

fn pk_fehler(p: &Path, e: rusqlite::Error) -> String {
    if let rusqlite::Error::SqliteFailure(f, _) = &e {
        if matches!(f.code, rusqlite::ErrorCode::DatabaseBusy | rusqlite::ErrorCode::DatabaseLocked) {
            return format!(
                "{}: Die Projektkarte ist gerade in FORMA geöffnet – bitte dort schließen und erneut versuchen",
                p.display()
            );
        }
    }
    format!("{}: {}", p.display(), e)
}

fn pk_oeffnen(p: &Path, schreiben: bool) -> Result<rusqlite::Connection, String> {
    let zugriff = if schreiben { rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE } else { rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY };
    let db = rusqlite::Connection::open_with_flags(p, zugriff | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX)
        .map_err(|e| pk_fehler(p, e))?;
    db.busy_timeout(std::time::Duration::from_secs(3)).map_err(|e| pk_fehler(p, e))?;
    Ok(db)
}

fn pk_lesen(p: &Path) -> Result<PkRoh, String> {
    let db = pk_oeffnen(p, false)?;
    let gruppen = db
        .prepare("SELECT GruppeID, GruppeTyp, GruppeText FROM Gruppe ORDER BY GruppeID")
        .and_then(|mut q| {
            q.query_map([], |r| {
                Ok(PkGruppe { id: r.get(0)?, typ: r.get::<_, Option<i64>>(1)?.unwrap_or(0), text: bytes_spalte(r, 2)? })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()
        })
        .map_err(|e| pk_fehler(p, e))?;
    let inhalte = db
        .prepare("SELECT GruppeID, InhalteID, InhalteTyp, Ganzzahl, Titel, Texte FROM Inhalte ORDER BY GruppeID, InhalteID, InhalteTyp")
        .and_then(|mut q| {
            q.query_map([], |r| {
                Ok(PkInhalt {
                    gruppe: r.get(0)?,
                    id: r.get(1)?,
                    typ: r.get::<_, Option<i64>>(2)?.unwrap_or(0),
                    ganzzahl: r.get::<_, Option<i64>>(3).unwrap_or(None),
                    titel: bytes_spalte(r, 4)?,
                    texte: bytes_spalte(r, 5)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()
        })
        .map_err(|e| pk_fehler(p, e))?;
    Ok(PkRoh { gruppen, inhalte })
}

fn pk_schreiben(p: &Path, aenderungen: &[PkAenderung]) -> Result<(), String> {
    let mut db = pk_oeffnen(p, true)?;
    let tx = db.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(|e| pk_fehler(p, e))?;
    for a in aenderungen {
        let schluessel = [a.gruppe, a.id, a.typ];
        let jetzt = tx.query_row(
            "SELECT Texte, Ganzzahl FROM Inhalte WHERE GruppeID = ?1 AND InhalteID = ?2 AND InhalteTyp = ?3",
            schluessel,
            |r| Ok((bytes_spalte(r, 0)?, r.get::<_, Option<i64>>(1).unwrap_or(None))),
        );
        let (texte, ganzzahl) = match jetzt {
            Ok(w) => w,
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                return Err(format!("Eintrag {}/{} gibt es in der Projektkarte nicht", a.gruppe, a.id))
            }
            Err(e) => return Err(pk_fehler(p, e)),
        };
        let veraltet = || format!("Die Projektkarte wurde inzwischen geändert (Eintrag {}/{}) – bitte neu laden", a.gruppe, a.id);
        match &a.wert {
            PkWert::Texte { alt, neu } => {
                if a.typ != 1 && a.typ != 2 {
                    return Err(format!("Eintrag {}/{} ist kein Text", a.gruppe, a.id));
                }
                if texte != *alt {
                    return Err(veraltet());
                }
                // als TEXT speichern, wie FORMA (nicht als BLOB)
                let neu = rusqlite::types::ToSqlOutput::Borrowed(rusqlite::types::ValueRef::Text(neu));
                tx.execute(
                    "UPDATE Inhalte SET Texte = ?1 WHERE GruppeID = ?2 AND InhalteID = ?3 AND InhalteTyp = ?4",
                    rusqlite::params![neu, a.gruppe, a.id, a.typ],
                )
                .map_err(|e| pk_fehler(p, e))?;
            }
            PkWert::Ganzzahl { alt, neu } => {
                if ![4, 8, 16].contains(&a.typ) {
                    return Err(format!("Eintrag {}/{} ist keine Auswahl", a.gruppe, a.id));
                }
                if ganzzahl != *alt {
                    return Err(veraltet());
                }
                // Die Möglichkeiten (Texte) bleiben, wie sie sind
                tx.execute(
                    "UPDATE Inhalte SET Ganzzahl = ?1 WHERE GruppeID = ?2 AND InhalteID = ?3 AND InhalteTyp = ?4",
                    rusqlite::params![neu, a.gruppe, a.id, a.typ],
                )
                .map_err(|e| pk_fehler(p, e))?;
            }
        }
    }
    // ohne commit (bei jedem Fehler oben) rollt die Transaktion zurück
    tx.commit().map_err(|e| pk_fehler(p, e))
}

/// Liest die Projektkarte (Gruppen und Einträge). `None`, wenn es keine gibt.
#[tauri::command]
async fn prokarte_read(root: String, pfad: String) -> Result<Option<PkRoh>, String> {
    let p = sdb_pfad(&root, &pfad)?;
    if !p.is_file() {
        return Ok(None);
    }
    tauri::async_runtime::spawn_blocking(move || pk_lesen(&p).map(Some)).await.map_err(|e| e.to_string())?
}

/// Ändert Einträge der Projektkarte in einer Transaktion: alle oder keiner. Ein Eintrag, der inzwischen anders
/// lautet als `alt` (z. B. in FORMA geändert), bricht alles ab. Neue Einträge werden nicht angelegt.
#[tauri::command]
async fn prokarte_write(root: String, pfad: String, aenderungen: Vec<PkAenderung>) -> Result<(), String> {
    let p = sdb_pfad(&root, &pfad)?;
    if !p.is_file() {
        return Err(format!("{}: Projektkarte nicht gefunden", p.display()));
    }
    let anzahl = aenderungen.len();
    tauri::async_runtime::spawn_blocking(move || {
        pk_schreiben(&p, &aenderungen)?;
        log::info!("Projektkarte gespeichert: {} ({} Einträge)", p.display(), anzahl);
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Benutzer, Rechner und Prozessnummer für die Sperrdatei.
#[tauri::command]
fn machine_info() -> Rechner {
    let env = |k: &str| std::env::var(k).unwrap_or_default();
    Rechner {
        benutzer: if cfg!(windows) { env("USERNAME") } else { env("USER") },
        computer: if cfg!(windows) { env("COMPUTERNAME") } else { env("HOSTNAME") },
        prozess: std::process::id(),
    }
}

/// Zeigt einen Ordner im Dateimanager bzw. öffnet eine Datei mit dem zugehörigen Programm.
#[tauri::command]
async fn open_path(pfad: String) -> Result<(), String> {
    let p = Path::new(&pfad);
    if !p.is_absolute() || !p.exists() {
        return Err(format!("Nicht gefunden: {pfad}"));
    }
    #[cfg(target_os = "windows")]
    let programm = "explorer";
    #[cfg(target_os = "macos")]
    let programm = "open";
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let programm = "xdg-open";
    std::process::Command::new(programm).arg(p).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(log_plugin("formulare"))
        .plugin(tauri_plugin_dialog::init())
        // Links im Standardbrowser öffnen
        .plugin(tauri_plugin_opener::init())
        // automatische Updates: signiertes Manifest je App (tauri.conf.json → plugins.updater)
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(EigeneSperren::default())
        .invoke_handler(tauri::generate_handler![
            save_file,
            save_binary_file,
            pick_save_path,
            pick_open_path,
            read_binary_file,
            write_binary_file,
            pick_folder,
            fs_list,
            fs_read,
            fs_replace,
            lock_create,
            lock_release,
            lock_probe,
            process_info,
            prokarte_read,
            prokarte_write,
            machine_info,
            open_path
        ])
        .setup(|app| {
            log::info!("Formulare {} gestartet", app.package_info().version);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Fehler beim Starten der Anwendung");

    app.run(|handle, event| {
        // eigene Sperrdateien nicht liegen lassen, sonst bleiben die Formulare für die Kollegen gesperrt
        if let tauri::RunEvent::Exit = event {
            let sperren = handle.state::<EigeneSperren>();
            let offen: Vec<_> = sperren.0.lock().map(|mut m| m.drain().collect()).unwrap_or_default();
            for (p, (inhalt, griff)) in offen {
                drop(griff);
                if let Err(e) = sperre_entfernen(&p, &inhalt) {
                    log::error!("Sperrdatei beim Beenden nicht entfernt: {e}");
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Projektkarte im Aufbau von FORMA, Texte in UTF-8 („Straße“ = 53 74 72 61 C3 9F 65)
    fn muster(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("formulare-test-{}-{name}.sdb", std::process::id()));
        let _ = std::fs::remove_file(&p);
        let db = rusqlite::Connection::open(&p).unwrap();
        db.execute_batch(
            "CREATE TABLE Gruppe (GruppeID INTEGER NOT NULL, GruppeTyp INTEGER NOT NULL, GruppeText NVARCHAR(250) NOT NULL);
             CREATE TABLE Inhalte (GruppeID INTEGER NOT NULL, InhalteID INTEGER NOT NULL, InhalteTyp INTEGER NOT NULL,
                                   Ganzzahl INTEGER, Gleitkomma DOUBLE, Titel NVARCHAR(250) NOT NULL, Texte TEXT NOT NULL,
                                   Rechenblatt TEXT, Container LONGVARBINARY);
             INSERT INTO Gruppe VALUES (201, 1, 'Bauherr');
             INSERT INTO Inhalte (GruppeID, InhalteID, InhalteTyp, Titel, Texte) VALUES (201, 40, 1, 'Name/Firma:', 'Muster');
             INSERT INTO Inhalte (GruppeID, InhalteID, InhalteTyp, Titel, Texte) VALUES (201, 70, 1, 'Straße/Nr.:', '');
             INSERT INTO Inhalte (GruppeID, InhalteID, InhalteTyp, Ganzzahl, Titel, Texte)
                    VALUES (201, 210, 4, NULL, 'Anrede:', char(13, 10) || 'Sehr geehrte Frau' || char(13, 10) || 'Sehr geehrter Herr');",
        )
        .unwrap();
        p
    }

    fn text(id: i64, alt: &str, neu: &str) -> PkAenderung {
        PkAenderung { gruppe: 201, id, typ: 1, wert: PkWert::Texte { alt: alt.as_bytes().to_vec(), neu: neu.as_bytes().to_vec() } }
    }

    fn auswahl(alt: Option<i64>, neu: Option<i64>) -> PkAenderung {
        PkAenderung { gruppe: 201, id: 210, typ: 4, wert: PkWert::Ganzzahl { alt, neu } }
    }

    #[test]
    fn liest_bytes_und_auswahl_wie_gespeichert() {
        let p = muster("lesen");
        let pk = pk_lesen(&p).unwrap();
        assert_eq!(pk.gruppen[0].text, b"Bauherr");
        assert_eq!(pk.inhalte[1].titel, "Straße/Nr.:".as_bytes());
        assert_eq!(pk.inhalte[1].texte, b"");
        assert_eq!(pk.inhalte[2].ganzzahl, None);
        assert_eq!(pk.inhalte[2].texte, b"\r\nSehr geehrte Frau\r\nSehr geehrter Herr");
    }

    #[test]
    fn schreibt_alle_oder_keinen() {
        let p = muster("schreiben");
        pk_schreiben(&p, &[text(40, "Muster", "Müller"), text(70, "", "Hauptstraße 1"), auswahl(None, Some(2))]).unwrap();
        let pk = pk_lesen(&p).unwrap();
        assert_eq!(pk.inhalte[0].texte, "Müller".as_bytes());
        assert_eq!(pk.inhalte[1].texte, "Hauptstraße 1".as_bytes());
        assert_eq!(pk.inhalte[2].ganzzahl, Some(2));
        // die Möglichkeiten bleiben unverändert, Texte als TEXT wie bei FORMA
        assert_eq!(pk.inhalte[2].texte, b"\r\nSehr geehrte Frau\r\nSehr geehrter Herr");
        let db = rusqlite::Connection::open(&p).unwrap();
        let typ: String = db.query_row("SELECT typeof(Texte) FROM Inhalte WHERE InhalteID = 40", [], |r| r.get(0)).unwrap();
        assert_eq!(typ, "text");
        drop(db);

        // ein Eintrag inzwischen anders: nichts wird geschrieben, auch nicht die anderen
        let e = pk_schreiben(&p, &[text(40, "Müller", "Neu"), auswahl(None, Some(1))]).unwrap_err();
        assert!(e.contains("inzwischen geändert"), "{e}");
        let pk = pk_lesen(&p).unwrap();
        assert_eq!(pk.inhalte[0].texte, "Müller".as_bytes());
        assert_eq!(pk.inhalte[2].ganzzahl, Some(2));

        let e = pk_schreiben(&p, &[text(999, "", "X")]).unwrap_err();
        assert!(e.contains("gibt es in der Projektkarte nicht"), "{e}");
        // Art des Werts muss zum Eintrag passen
        let falsch = PkAenderung { gruppe: 201, id: 40, typ: 1, wert: PkWert::Ganzzahl { alt: None, neu: Some(1) } };
        assert!(pk_schreiben(&p, &[falsch]).unwrap_err().contains("keine Auswahl"));
    }

    #[test]
    fn liest_aenderungen_aus_der_oberflaeche() {
        let a: Vec<PkAenderung> = serde_json::from_str(
            r#"[{"gruppe":201,"id":40,"typ":1,"spalte":"texte","alt":[77],"neu":[78]},
                {"gruppe":201,"id":210,"typ":4,"spalte":"ganzzahl","alt":null,"neu":2}]"#,
        )
        .unwrap();
        assert!(matches!(&a[0].wert, PkWert::Texte { alt, neu } if alt == b"M" && neu == b"N"));
        assert!(matches!(a[1].wert, PkWert::Ganzzahl { alt: None, neu: Some(2) }));
    }

    #[test]
    fn offen_gehaltene_sperre_gilt_als_benutzt() {
        let p = std::env::temp_dir().join(format!("formulare-test-{}.frmtmp", std::process::id()));
        let _ = std::fs::remove_file(&p);
        std::fs::write(&p, b"[Zugriff]
").unwrap();
        assert!(!wird_benutzt(&p));
        let griff = griff_oeffnen(&p).unwrap();
        // lesen dürfen andere (FORMA zeigt an, wer das Formular geöffnet hat) …
        assert_eq!(std::fs::read(&p).unwrap(), b"[Zugriff]
");
        if cfg!(windows) {
            // … aber nicht löschen; und jeder sieht, dass die Datei benutzt wird
            assert!(wird_benutzt(&p));
            let e = sperre_entfernen(&p, b"[Zugriff]
").unwrap_err();
            assert!(e.contains("gerade von einem anderen Programm benutzt"), "{e}");
        }
        // nach einem Absturz schließt das System den Griff: frei, löschbar
        drop(griff);
        assert!(!wird_benutzt(&p));
        assert!(!sperre_entfernen(&p, b"anderer Inhalt").unwrap());
        assert!(sperre_entfernen(&p, b"[Zugriff]
").unwrap());
        assert!(!p.exists());
    }

    #[test]
    fn prozess_name_nur_fuer_laufende_prozesse() {
        let eigener = prozess_name(std::process::id()).expect("eigener Prozess");
        assert!(!eigener.is_empty());
        assert_eq!(prozess_name(4_294_967_000), None);
    }

    /// Mit SJFORMA_REF: eine Kopie jeder echten Projektkarte lesen und unverändert zurückschreiben
    #[test]
    fn echte_projektkarten() {
        let Ok(wurzel) = std::env::var("SJFORMA_REF") else { return };
        for e in std::fs::read_dir(wurzel).unwrap().flatten() {
            let quelle = e.path().join("sj_prokarte.sdb");
            if !quelle.is_file() {
                continue;
            }
            let kopie = std::env::temp_dir().join(format!("formulare-test-{}-echt.sdb", std::process::id()));
            std::fs::copy(&quelle, &kopie).unwrap();
            let pk = pk_lesen(&kopie).unwrap();
            assert!(pk.gruppen.len() > 10 && pk.inhalte.len() > 100);
            let alle: Vec<_> = pk
                .inhalte
                .iter()
                .map(|i| PkAenderung {
                    gruppe: i.gruppe,
                    id: i.id,
                    typ: i.typ,
                    wert: if [4, 8, 16].contains(&i.typ) {
                        PkWert::Ganzzahl { alt: i.ganzzahl, neu: i.ganzzahl }
                    } else {
                        PkWert::Texte { alt: i.texte.clone(), neu: i.texte.clone() }
                    },
                })
                .collect();
            pk_schreiben(&kopie, &alle).unwrap();
            let wieder = pk_lesen(&kopie).unwrap();
            assert!(pk.inhalte.iter().zip(&wieder.inhalte).all(|(a, b)| a.texte == b.texte && a.ganzzahl == b.ganzzahl));
            std::fs::remove_file(&kopie).unwrap();
        }
    }
}
