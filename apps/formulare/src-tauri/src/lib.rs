//! Desktop-Hülle für die Formulare-App. Die allgemeinen Befehle (Speichern-Dialoge, Protokoll) stehen in
//! packages/core/tauri/commands.rs; hier kommen die Dateisystem-Befehle für die FORMA-Projektordner dazu.
//!
//! Grundsatz: Ersetzt werden nur vorhandene Formulare (`.frmsjf`), angelegt und gelöscht nur Sperrdateien
//! (`.frmtmp`) – und gelöscht nur, solange sie noch genau den Inhalt haben, den diese App geschrieben hat. Jeder
//! Pfad bleibt innerhalb des vom Benutzer gewählten Ordners. Eigene Sperrdateien werden beim Beenden entfernt.

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
    out.sort_by(|a, b| a.pfad.to_lowercase().cmp(&b.pfad.to_lowercase()));
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

/// Zeigt einen Ordner im Dateimanager.
#[tauri::command]
async fn open_folder(pfad: String) -> Result<(), String> {
    let p = Path::new(&pfad);
    if !p.is_absolute() || !p.is_dir() {
        return Err(format!("Ordner nicht gefunden: {pfad}"));
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
            machine_info,
            open_folder
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
