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

/// Sperrdateien, die diese App angelegt hat, mit ihrem Inhalt
#[derive(Default)]
struct EigeneSperren(Mutex<HashMap<PathBuf, Vec<u8>>>);

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
            f.write_all(&bytes).map_err(|e| format!("{}: {}", p.display(), e))?;
            sperren.0.lock().map_err(|e| e.to_string())?.insert(p.clone(), bytes);
            log::info!("Gesperrt: {}", p.display());
            Ok(true)
        }
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => Ok(false),
        Err(e) => Err(format!("{}: {}", p.display(), e)),
    }
}

/// Löscht eine Sperrdatei, wenn sie noch genau `inhalt` enthält.
fn sperre_entfernen(p: &Path, inhalt: &[u8]) -> Result<bool, String> {
    match std::fs::read(p) {
        Ok(jetzt) if jetzt == inhalt => {
            std::fs::remove_file(p).map_err(|e| format!("{}: {}", p.display(), e))?;
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

/// Löscht eine eigene Sperrdatei – nur wenn sie noch genau den übergebenen Inhalt hat.
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
    typ: i64,
    titel: Vec<u8>,
    texte: Vec<u8>,
}

#[derive(serde::Serialize)]
struct PkRoh {
    gruppen: Vec<PkGruppe>,
    inhalte: Vec<PkInhalt>,
}

#[derive(serde::Deserialize)]
struct PkAenderung {
    gruppe: i64,
    id: i64,
    alt: Vec<u8>,
    neu: Vec<u8>,
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
        .prepare("SELECT GruppeID, InhalteID, InhalteTyp, Titel, Texte FROM Inhalte ORDER BY GruppeID, InhalteID")
        .and_then(|mut q| {
            q.query_map([], |r| {
                Ok(PkInhalt {
                    gruppe: r.get(0)?,
                    id: r.get(1)?,
                    typ: r.get::<_, Option<i64>>(2)?.unwrap_or(0),
                    titel: bytes_spalte(r, 3)?,
                    texte: bytes_spalte(r, 4)?,
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
        let jetzt = match tx.query_row(
            "SELECT Texte FROM Inhalte WHERE GruppeID = ?1 AND InhalteID = ?2",
            [a.gruppe, a.id],
            |r| bytes_spalte(r, 0),
        ) {
            Ok(t) => t,
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                return Err(format!("Eintrag {}/{} gibt es in der Projektkarte nicht", a.gruppe, a.id))
            }
            Err(e) => return Err(pk_fehler(p, e)),
        };
        if jetzt != a.alt {
            return Err(format!("Die Projektkarte wurde inzwischen geändert (Eintrag {}/{}) – bitte neu laden", a.gruppe, a.id));
        }
        // als TEXT speichern, wie FORMA (nicht als BLOB)
        let neu = rusqlite::types::ToSqlOutput::Borrowed(rusqlite::types::ValueRef::Text(&a.neu));
        tx.execute(
            "UPDATE Inhalte SET Texte = ?1 WHERE GruppeID = ?2 AND InhalteID = ?3",
            rusqlite::params![neu, a.gruppe, a.id],
        )
        .map_err(|e| pk_fehler(p, e))?;
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
            for (p, inhalt) in offen {
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
            "CREATE TABLE Gruppe (GruppeID INTEGER, GruppeTyp INTEGER, GruppeText TEXT);
             CREATE TABLE Inhalte (GruppeID INTEGER, InhalteID INTEGER, InhalteTyp INTEGER, Ganzzahl INTEGER,
                                   Gleitkomma REAL, Titel TEXT, Texte TEXT, Rechenblatt BLOB, Container BLOB);
             INSERT INTO Gruppe VALUES (201, 1, 'Bauherr');
             INSERT INTO Inhalte (GruppeID, InhalteID, InhalteTyp, Titel, Texte) VALUES (201, 40, 1, 'Name/Firma:', 'Muster');",
        )
        .unwrap();
        let strasse = rusqlite::types::ToSqlOutput::Borrowed(rusqlite::types::ValueRef::Text(b"Stra\xdfe:"));
        db.execute("INSERT INTO Inhalte (GruppeID, InhalteID, InhalteTyp, Titel, Texte) VALUES (201, 70, 1, ?1, NULL)", [strasse])
            .unwrap();
        p
    }

    fn aenderung(id: i64, alt: &[u8], neu: &[u8]) -> PkAenderung {
        PkAenderung { gruppe: 201, id, alt: alt.to_vec(), neu: neu.to_vec() }
    }

    #[test]
    fn liest_bytes_wie_gespeichert() {
        let p = muster("lesen");
        let pk = pk_lesen(&p).unwrap();
        assert_eq!(pk.gruppen[0].text, b"Bauherr");
        assert_eq!(pk.inhalte[1].titel, b"Stra\xdfe:");
        assert_eq!(pk.inhalte[1].texte, b"");
    }

    #[test]
    fn schreibt_alle_oder_keinen() {
        let p = muster("schreiben");
        pk_schreiben(&p, &[aenderung(40, b"Muster", b"M\xfcller"), aenderung(70, b"", b"Hauptstra\xdfe 1")]).unwrap();
        let pk = pk_lesen(&p).unwrap();
        assert_eq!(pk.inhalte[0].texte, b"M\xfcller");
        assert_eq!(pk.inhalte[1].texte, b"Hauptstra\xdfe 1");
        // als TEXT gespeichert, wie FORMA
        let db = rusqlite::Connection::open(&p).unwrap();
        let typ: String = db.query_row("SELECT typeof(Texte) FROM Inhalte WHERE InhalteID = 40", [], |r| r.get(0)).unwrap();
        assert_eq!(typ, "text");
        drop(db);

        // zweiter Eintrag inzwischen anders: nichts wird geschrieben, auch nicht der erste
        let e = pk_schreiben(&p, &[aenderung(40, b"M\xfcller", b"Neu"), aenderung(70, b"veraltet", b"X")]).unwrap_err();
        assert!(e.contains("inzwischen geändert"), "{e}");
        assert_eq!(pk_lesen(&p).unwrap().inhalte[0].texte, b"M\xfcller");

        let e = pk_schreiben(&p, &[aenderung(999, b"", b"X")]).unwrap_err();
        assert!(e.contains("gibt es in der Projektkarte nicht"), "{e}");
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
            let alle: Vec<_> = pk.inhalte.iter().map(|i| PkAenderung { gruppe: i.gruppe, id: i.id, alt: i.texte.clone(), neu: i.texte.clone() }).collect();
            pk_schreiben(&kopie, &alle).unwrap();
            let wieder = pk_lesen(&kopie).unwrap();
            assert!(pk.inhalte.iter().zip(&wieder.inhalte).all(|(a, b)| a.texte == b.texte));
            std::fs::remove_file(&kopie).unwrap();
        }
    }
}
