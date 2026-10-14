// Gemeinsame Tauri-Befehle aller Apps (per include! in die jeweilige lib.rs eingebunden, damit die
// #[tauri::command]-Makros im App-Crate expandiert werden).
//
// Die gesamte Fachlogik liegt im Web-Frontend (TypeScript). Rust stellt nur bereit, was der Browser
// nicht kann: einen nativen Speichern-Dialog mit Schreibzugriff.

use base64::Engine;
use tauri_plugin_dialog::DialogExt;

/// Öffnet einen nativen Speichern-Dialog und schreibt `contents` in die gewählte Datei.
/// Gibt den Pfad zurück oder `None`, wenn der Benutzer abgebrochen hat.
#[tauri::command]
async fn save_file(
    app: tauri::AppHandle,
    default_name: String,
    default_dir: Option<String>,
    contents: String,
    filter_name: String,
    extensions: Vec<String>,
) -> Result<Option<String>, String> {
    save_bytes(&app, &default_name, default_dir.as_deref(), contents.as_bytes(), &filter_name, &extensions)
}

/// Wie `save_file`, aber für Binärdaten (z. B. Excel, Projektarchiv), Base64-kodiert übertragen.
#[tauri::command]
async fn save_binary_file(
    app: tauri::AppHandle,
    default_name: String,
    default_dir: Option<String>,
    contents_base64: String,
    filter_name: String,
    extensions: Vec<String>,
) -> Result<Option<String>, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(contents_base64.as_bytes())
        .map_err(|e| format!("Ungültige Daten: {e}"))?;
    save_bytes(&app, &default_name, default_dir.as_deref(), &bytes, &filter_name, &extensions)
}

/// Speichern-Dialog ohne Schreiben: liefert den gewählten Pfad oder `None` bei Abbruch. Zusammen mit
/// `read_binary_file` und `write_binary_file` für Projektdateien, die beim Speichern mit dem bisherigen
/// Inhalt der Zieldatei zusammengeführt werden.
#[tauri::command]
async fn pick_save_path(
    app: tauri::AppHandle,
    default_name: String,
    default_dir: Option<String>,
    filter_name: String,
    extensions: Vec<String>,
) -> Result<Option<String>, String> {
    let exts: Vec<&str> = extensions.iter().map(String::as_str).collect();
    let mut dialog = app.dialog().file().set_file_name(&default_name).add_filter(&filter_name, &exts);
    if let Some(dir) = existing_dir(default_dir.as_deref()) {
        dialog = dialog.set_directory(dir);
    }
    let Some(file_path) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let path = file_path.into_path().map_err(|e| e.to_string())?;
    Ok(Some(path.display().to_string()))
}

/// Öffnen-Dialog: liefert den Pfad der gewählten Datei oder `None` bei Abbruch. Mit dem Pfad kann
/// „Speichern“ später ohne Rückfrage in dieselbe Datei schreiben.
#[tauri::command]
async fn pick_open_path(
    app: tauri::AppHandle,
    default_dir: Option<String>,
    filter_name: String,
    extensions: Vec<String>,
) -> Result<Option<String>, String> {
    let exts: Vec<&str> = extensions.iter().map(String::as_str).collect();
    let mut dialog = app.dialog().file().add_filter(&filter_name, &exts);
    if let Some(dir) = existing_dir(default_dir.as_deref()) {
        dialog = dialog.set_directory(dir);
    }
    let Some(file_path) = dialog.blocking_pick_file() else {
        return Ok(None);
    };
    let path = file_path.into_path().map_err(|e| e.to_string())?;
    Ok(Some(path.display().to_string()))
}

/// Vorgabeordner für Dialoge – nur wenn es ihn (noch) gibt
fn existing_dir(dir: Option<&str>) -> Option<std::path::PathBuf> {
    let p = std::path::PathBuf::from(dir?);
    if p.is_dir() {
        Some(p)
    } else {
        None
    }
}

/// Inhalt einer Datei (Base64) oder `None`, wenn es sie nicht gibt.
#[tauri::command]
async fn read_binary_file(path: String) -> Result<Option<String>, String> {
    match std::fs::read(&path) {
        Ok(bytes) => Ok(Some(base64::engine::general_purpose::STANDARD.encode(bytes))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => {
            log::error!("Lesen fehlgeschlagen: {}: {}", path, e);
            Err(format!("{}: {}", path, e))
        }
    }
}

/// Schreibt Base64-kodierte Daten in eine Datei (Pfad aus `pick_save_path`).
#[tauri::command]
async fn write_binary_file(path: String, contents_base64: String) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(contents_base64.as_bytes())
        .map_err(|e| format!("Ungültige Daten: {e}"))?;
    write_atomic(std::path::Path::new(&path), &bytes).map_err(|e| {
        log::error!("Speichern fehlgeschlagen: {}: {}", path, e);
        format!("{}: {}", path, e)
    })?;
    log::info!("Gespeichert: {} ({} Bytes)", path, bytes.len());
    Ok(())
}

/// Schreibt erst in eine temporäre Datei daneben und ersetzt dann das Ziel – ein Abbruch (Absturz, Datenträger
/// voll) hinterlässt nie eine halb geschriebene Projektdatei.
fn write_atomic(path: &std::path::Path, contents: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let tmp = path.with_file_name(format!(".{name}.{}.tmp", std::process::id()));
    let result = (|| {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(contents)?;
        f.sync_all()?;
        drop(f);
        std::fs::rename(&tmp, path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    result
}

fn save_bytes(
    app: &tauri::AppHandle,
    default_name: &str,
    default_dir: Option<&str>,
    contents: &[u8],
    filter_name: &str,
    extensions: &[String],
) -> Result<Option<String>, String> {
    let exts: Vec<&str> = extensions.iter().map(String::as_str).collect();
    let mut dialog = app.dialog().file().set_file_name(default_name).add_filter(filter_name, &exts);
    if let Some(dir) = existing_dir(default_dir) {
        dialog = dialog.set_directory(dir);
    }
    let picked = dialog.blocking_save_file();

    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path = file_path.into_path().map_err(|e| e.to_string())?;
    write_atomic(&path, contents).map_err(|e| {
        log::error!("Speichern fehlgeschlagen: {}: {}", path.display(), e);
        format!("{}: {}", path.display(), e)
    })?;
    log::info!("Gespeichert: {} ({} Bytes)", path.display(), contents.len());
    Ok(Some(path.display().to_string()))
}

/// Protokoll: Konsole + Logdatei im App-Logordner (%LOCALAPPDATA%\<identifier>\logs)
fn log_plugin<R: tauri::Runtime>(datei: &str) -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_log::Builder::new()
        .targets([
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                file_name: Some(datei.into()),
            }),
        ])
        .level(log::LevelFilter::Debug)
        .max_file_size(2_000_000)
        .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(5))
        .build()
}
