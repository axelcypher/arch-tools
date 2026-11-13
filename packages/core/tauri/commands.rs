// Gemeinsame Tauri-Befehle aller Apps (per include! in die jeweilige lib.rs eingebunden, damit die
// #[tauri::command]-Makros im App-Crate expandiert werden).
//
// Die gesamte Fachlogik liegt im Web-Frontend (TypeScript). Rust stellt nur bereit, was der Browser
// nicht kann: native Dialoge mit Schreibzugriff, Zugriff auf Projektordner und den gemeinsamen
// Konfigurationsordner. In Projektordnern wird nur neu angelegt; ersetzt wird allein die Projektdatei (.oap),
// mit Sicherungskopie. Gelöscht wird nichts.

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
    // Schreiben (mit möglichen Wiederholungen) nicht im asynchronen Befehl blockieren
    let ziel = path.clone();
    let laenge = bytes.len();
    tauri::async_runtime::spawn_blocking(move || write_atomic(std::path::Path::new(&ziel), &bytes))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| {
            log::error!("Speichern fehlgeschlagen: {}: {}", path, e);
            format!("{}: {}", path, e)
        })?;
    log::info!("Gespeichert: {} ({} Bytes)", path, laenge);
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
        // Windows: Virenscanner oder Indexdienst halten die Zieldatei kurz offen – einige Male erneut versuchen
        let mut versuch = 0;
        loop {
            match std::fs::rename(&tmp, path) {
                Ok(()) => return Ok(()),
                // Zugriff verweigert bzw. Freigabe-/Sperrverletzung (Windows-Fehler 32 und 33)
                Err(e) if versuch < 5 && (e.kind() == std::io::ErrorKind::PermissionDenied || matches!(e.raw_os_error(), Some(32) | Some(33))) => {
                    versuch += 1;
                    std::thread::sleep(std::time::Duration::from_millis(100 * versuch));
                }
                Err(e) => return Err(e),
            }
        }
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

// ---------- Gemeinsamer Konfigurationsordner ----------

/// Lokaler Ordner aller Apps für den Zeiger auf den Konfigurationsordner (%APPDATA%\arch-tools); wird angelegt.
#[tauri::command]
async fn konfig_basis(app: tauri::AppHandle) -> Result<String, String> {
    let dir = tauri::Manager::path(&app).config_dir().map_err(|e| e.to_string())?.join("arch-tools");
    // darin die lokale Kopie der Einstellungen einer Netzwerkinstallation (Notbetrieb ohne Netzlaufwerk)
    let kopie = dir.join("netz-kopie");
    std::fs::create_dir_all(&kopie).map_err(|e| format!("{}: {}", kopie.display(), e))?;
    Ok(dir.display().to_string())
}

/// Ist der Ordner erreichbar? Mit Zeitlimit: Ein getrenntes Netzlaufwerk lässt die Prüfung sonst lange hängen.
#[tauri::command]
async fn ordner_erreichbar(pfad: String) -> bool {
    let (tx, rx) = std::sync::mpsc::channel();
    let p = std::path::PathBuf::from(&pfad);
    std::thread::spawn(move || {
        let _ = tx.send(p.is_absolute() && p.is_dir());
    });
    // hängt die Prüfung, läuft der Faden im Hintergrund zu Ende; die App wartet nicht auf ihn
    tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(std::time::Duration::from_secs(4)).unwrap_or(false))
        .await
        .unwrap_or(false)
}

/// Namen der Einstellungsdateien (`*.json`) eines Konfigurationsordners, ohne Unterordner und versteckte Dateien.
/// Fehler, wenn der Ordner nicht lesbar ist; leer, wenn es ihn nicht gibt.
#[tauri::command]
async fn konfig_dateien(ordner: String) -> Result<Vec<String>, String> {
    // auf einem Netzlaufwerk kann das dauern – nicht im asynchronen Befehl blockieren
    tauri::async_runtime::spawn_blocking(move || {
        let dir = std::path::Path::new(&ordner);
        let eintraege = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(format!("{}: {}", dir.display(), e)),
        };
        let mut namen = Vec::new();
        for e in eintraege {
            let e = e.map_err(|e| format!("{}: {}", dir.display(), e))?;
            let name = e.file_name().to_string_lossy().into_owned();
            if name.ends_with(".json") && !name.starts_with('.') && e.file_type().map(|t| t.is_file()).unwrap_or(false) {
                namen.push(name);
            }
        }
        namen.sort();
        Ok(namen)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Sperrdatei neben einer Einstellungsdatei anlegen – nur wenn es sie nicht gibt (`create_new`, das gilt auch auf
/// Netzlaufwerken) – sonst kurz warten. Die Sperre enthält ein Zeichen dieses Schreibvorgangs. Ob eine Sperre verwaist
/// ist (abgebrochenes Schreiben), misst die eigene, monotone Uhr: Bleibt dieselbe Sperre (gleiches Zeichen) 10 s lang
/// liegen, wird sie entfernt – die Uhrzeit des Netzlaufwerks spielt keine Rolle, sie kann von der des Rechners abweichen.
/// Unmittelbar vor dem Entfernen wird das Zeichen noch einmal verglichen, damit nicht die frische Sperre eines anderen
/// Rechners verschwindet (ein winziges Zeitfenster zwischen Vergleich und Entfernen bleibt). Bekannte Grenze: Hängt
/// ein Schreibvorgang länger als 10 s (hängende Freigabe), kann ein anderer Rechner dessen Sperre für verwaist halten;
/// der erneute Vergleich unter der Sperre verhindert dann trotzdem, dass eine fremde Änderung still überschrieben wird.
fn konfig_sperre(pfad: &std::path::Path) -> Result<(std::path::PathBuf, String), String> {
    use std::io::Write;
    let name = pfad.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let sperre = pfad.with_file_name(format!(".{name}.sperre"));
    let zeichen = format!(
        "{}-{}",
        std::process::id(),
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0)
    );
    let beginn = std::time::Instant::now();
    // gesehene fremde Sperre: ihr Zeichen und seit wann (eigene Uhr)
    let mut gesehen: Option<(String, std::time::Instant)> = None;
    while beginn.elapsed() < std::time::Duration::from_secs(20) {
        match std::fs::OpenOptions::new().write(true).create_new(true).open(&sperre) {
            Ok(mut f) => {
                let _ = f.write_all(zeichen.as_bytes());
                return Ok((sperre, zeichen));
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                let fremd = std::fs::read_to_string(&sperre).unwrap_or_default();
                match &gesehen {
                    Some((z, seit)) if *z == fremd => {
                        if seit.elapsed() >= std::time::Duration::from_secs(10) && std::fs::read_to_string(&sperre).unwrap_or_default() == fremd {
                            let _ = std::fs::remove_file(&sperre);
                            gesehen = None;
                            continue;
                        }
                    }
                    _ => gesehen = Some((fremd, std::time::Instant::now())),
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            Err(e) => return Err(format!("{}: {}", sperre.display(), e)),
        }
    }
    Err(format!("{}: wird gerade von einem anderen Rechner geschrieben – bitte erneut versuchen", pfad.display()))
}

/// Schreibt eine Einstellungsdatei nur, wenn sie noch `erwartet` enthält (Base64; `None` = es gibt sie nicht).
/// Vergleich und Ersetzen geschehen unter einer Sperrdatei, damit zwei Rechner sich nicht gegenseitig Änderungen
/// überschreiben. `false`, wenn die Datei inzwischen anders ist – dann wird nichts geschrieben.
#[tauri::command]
async fn konfig_schreiben_wenn(pfad: String, erwartet_base64: Option<String>, contents_base64: String) -> Result<bool, String> {
    let b64 = base64::engine::general_purpose::STANDARD;
    let erwartet = match erwartet_base64 {
        Some(e) => Some(b64.decode(e.as_bytes()).map_err(|e| format!("Ungültige Daten: {e}"))?),
        None => None,
    };
    let bytes = b64.decode(contents_base64.as_bytes()).map_err(|e| format!("Ungültige Daten: {e}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        let ziel = std::path::Path::new(&pfad);
        let (sperre, zeichen) = konfig_sperre(ziel)?;
        let ergebnis = (|| {
            let aktuell = match std::fs::read(ziel) {
                Ok(b) => Some(b),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
                Err(e) => return Err(format!("{}: {}", ziel.display(), e)),
            };
            if aktuell != erwartet {
                return Ok(false);
            }
            write_atomic(ziel, &bytes).map_err(|e| format!("{}: {}", ziel.display(), e))?;
            log::info!("Gespeichert: {} ({} Bytes)", ziel.display(), bytes.len());
            Ok(true)
        })();
        // nur die eigene Sperre entfernen
        if std::fs::read_to_string(&sperre).map(|z| z == zeichen).unwrap_or(false) {
            let _ = std::fs::remove_file(&sperre);
        }
        ergebnis
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Öffnet den Dialog zur Ordnerwahl. `None`, wenn der Benutzer abgebrochen hat.
#[tauri::command]
async fn ordner_waehlen(app: tauri::AppHandle, title: String) -> Result<Option<String>, String> {
    match app.dialog().file().set_title(title).blocking_pick_folder() {
        Some(p) => Ok(Some(p.into_path().map_err(|e| e.to_string())?.display().to_string())),
        None => Ok(None),
    }
}

/// Zeigt einen Ordner im Dateimanager.
#[tauri::command]
async fn ordner_zeigen(pfad: String) -> Result<(), String> {
    let p = std::path::Path::new(&pfad);
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

// ---------- Projektordner: lesen, neu anlegen, Projektdatei gezielt ersetzen ----------

/// größte Datei, die gelesen wird (Projektdateien mit Plänen und IFC können groß sein)
const PROJEKT_MAX_LESEN: u64 = 512 * 1024 * 1024;
/// Obergrenze der Einträge beim Auflisten (Schutz vor versehentlich gewählten Laufwerken)
const PROJEKT_MAX_EINTRAEGE: usize = 50_000;
/// so viele Sicherungskopien ersetzter Projektdateien bleiben im App-Ordner
const PROJEKT_MAX_SICHERUNGEN: usize = 200;

#[derive(serde::Serialize)]
struct ProjektEintrag {
    /// Pfad relativ zum aufgelisteten Ordner, mit „/“ getrennt
    pfad: String,
    ordner: bool,
    groesse: u64,
    /// letzte Änderung (ms seit 1970), 0 wenn unbekannt
    geaendert: u64,
}

#[derive(serde::Serialize)]
struct ProjektDateiInhalt {
    daten: String,
    groesse: u64,
    geaendert: u64,
}

fn projekt_ms(m: &std::fs::Metadata) -> u64 {
    m.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Setzt `rel` unter `root` – nur gewöhnliche Namen, kein „..“, kein absoluter Pfad.
fn projekt_unterhalb(root: &str, rel: &str) -> Result<std::path::PathBuf, String> {
    let root = std::path::Path::new(root);
    if !root.is_absolute() {
        return Err(format!("Kein vollständiger Pfad: {}", root.display()));
    }
    let mut out = root.to_path_buf();
    let mut teile = 0;
    for c in std::path::Path::new(rel).components() {
        match c {
            std::path::Component::Normal(n) => {
                out.push(n);
                teile += 1;
            }
            std::path::Component::CurDir => {}
            _ => return Err(format!("Unzulässiger Pfad: {rel}")),
        }
    }
    if teile == 0 {
        return Err("Leerer Pfad".into());
    }
    Ok(out)
}

fn projekt_sammle(dir: &std::path::Path, prefix: &str, tiefe: u32, out: &mut Vec<ProjektEintrag>) -> Result<(), String> {
    let lesen = std::fs::read_dir(dir).map_err(|e| format!("{}: {}", dir.display(), e))?;
    for e in lesen {
        let e = e.map_err(|e| format!("{}: {}", dir.display(), e))?;
        let typ = e.file_type().map_err(|e| e.to_string())?;
        if typ.is_symlink() {
            continue;
        }
        let name = e.file_name().to_string_lossy().to_string();
        let pfad = if prefix.is_empty() { name } else { format!("{prefix}/{name}") };
        if out.len() >= PROJEKT_MAX_EINTRAEGE {
            return Err(format!("Mehr als {PROJEKT_MAX_EINTRAEGE} Einträge – bitte einen kleineren Ordner wählen."));
        }
        let meta = e.metadata().ok();
        let geaendert = meta.as_ref().map(projekt_ms).unwrap_or(0);
        if typ.is_dir() {
            out.push(ProjektEintrag { pfad: pfad.clone(), ordner: true, groesse: 0, geaendert });
            if tiefe > 1 {
                projekt_sammle(&e.path(), &pfad, tiefe - 1, out)?;
            }
        } else {
            let groesse = meta.map(|m| m.len()).unwrap_or(0);
            out.push(ProjektEintrag { pfad, ordner: false, groesse, geaendert });
        }
    }
    Ok(())
}

/// Listet Ordner und Dateien unter `root` bis zur Tiefe `tiefe` (1 = nur der Ordner selbst).
#[tauri::command]
async fn projekt_liste(root: String, tiefe: u32) -> Result<Vec<ProjektEintrag>, String> {
    let dir = std::path::Path::new(&root);
    if !dir.is_absolute() {
        return Err(format!("Kein vollständiger Pfad: {root}"));
    }
    let mut out = Vec::new();
    projekt_sammle(dir, "", tiefe.max(1), &mut out)?;
    out.sort_by(|a, b| a.pfad.to_lowercase().cmp(&b.pfad.to_lowercase()));
    Ok(out)
}

/// Liest eine Datei unter `root` mit Größe und Änderungszeit; `None`, wenn es sie nicht gibt.
#[tauri::command]
async fn projekt_lesen(root: String, pfad: String) -> Result<Option<ProjektDateiInhalt>, String> {
    let p = projekt_unterhalb(&root, &pfad)?;
    let meta = match std::fs::metadata(&p) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("{}: {}", p.display(), e)),
    };
    if !meta.is_file() {
        return Ok(None);
    }
    if meta.len() > PROJEKT_MAX_LESEN {
        return Err(format!("{}: Datei ist größer als {} MB", p.display(), PROJEKT_MAX_LESEN / 1024 / 1024));
    }
    let bytes = std::fs::read(&p).map_err(|e| format!("{}: {}", p.display(), e))?;
    Ok(Some(ProjektDateiInhalt {
        daten: base64::engine::general_purpose::STANDARD.encode(&bytes),
        groesse: meta.len(),
        geaendert: projekt_ms(&meta),
    }))
}

/// Legt einen Ordner (mit allen Zwischenordnern) an. `true`, wenn er neu ist; `false`, wenn es ihn schon gab.
#[tauri::command]
async fn projekt_ordner_anlegen(root: String, pfad: String) -> Result<bool, String> {
    let p = projekt_unterhalb(&root, &pfad)?;
    if p.is_dir() {
        return Ok(false);
    }
    if p.exists() {
        return Err(format!("{}: Es gibt bereits eine Datei mit diesem Namen", p.display()));
    }
    std::fs::create_dir_all(&p).map_err(|e| format!("{}: {}", p.display(), e))?;
    log::info!("Ordner angelegt: {}", p.display());
    Ok(true)
}

/// Schreibt eine neue Datei. Eine vorhandene Datei bleibt unverändert – dann `false`.
#[tauri::command]
async fn projekt_datei_anlegen(root: String, pfad: String, contents_base64: String) -> Result<bool, String> {
    use std::io::Write;
    let p = projekt_unterhalb(&root, &pfad)?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(contents_base64.as_bytes())
        .map_err(|e| format!("Ungültige Daten: {e}"))?;
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("{}: {}", parent.display(), e))?;
    }
    // create_new: schlägt fehl, wenn die Datei existiert – nie überschreiben
    match std::fs::OpenOptions::new().write(true).create_new(true).open(&p) {
        Ok(mut f) => {
            f.write_all(&bytes).map_err(|e| format!("{}: {}", p.display(), e))?;
            log::info!("Datei angelegt: {} ({} Bytes)", p.display(), bytes.len());
            Ok(true)
        }
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => Ok(false),
        Err(e) => Err(format!("{}: {}", p.display(), e)),
    }
}

/// Sicherungskopie im App-Ordner (%LOCALAPPDATA%\<App>\Sicherungen), die neuesten bleiben.
fn projekt_sicherung(app: &tauri::AppHandle, p: &std::path::Path) -> Result<std::path::PathBuf, String> {
    let ordner = tauri::Manager::path(app).app_local_data_dir().map_err(|e| e.to_string())?.join("Sicherungen");
    std::fs::create_dir_all(&ordner).map_err(|e| format!("{}: {}", ordner.display(), e))?;
    let zeit = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let ziel = ordner.join(format!("{zeit}-{name}"));
    std::fs::copy(p, &ziel).map_err(|e| format!("Sicherung von {}: {}", p.display(), e))?;
    if let Ok(eintraege) = std::fs::read_dir(&ordner) {
        let mut alle: Vec<_> = eintraege.flatten().map(|e| e.path()).collect();
        alle.sort();
        let zuviel = alle.len().saturating_sub(PROJEKT_MAX_SICHERUNGEN);
        for alt in alle.into_iter().take(zuviel) {
            let _ = std::fs::remove_file(alt);
        }
    }
    Ok(ziel)
}

/// Ersetzt eine vorhandene Projektdatei (.oap) atomar – nur, wenn sie noch Größe und Änderungszeit vom Lesen hat
/// (sonst hat sie inzwischen jemand geändert), und erst nach einer Sicherungskopie. Andere Dateien werden abgelehnt.
#[tauri::command]
async fn projekt_oap_ersetzen(app: tauri::AppHandle, root: String, pfad: String, contents_base64: String, groesse: u64, geaendert: u64) -> Result<(), String> {
    let p = projekt_unterhalb(&root, &pfad)?;
    let ist_oap = p.extension().map(|e| e.to_string_lossy().eq_ignore_ascii_case("oap")).unwrap_or(false);
    if !ist_oap {
        return Err(format!("{}: Nur Projektdateien (.oap) dürfen ersetzt werden", p.display()));
    }
    let meta = std::fs::metadata(&p).map_err(|e| format!("{}: {}", p.display(), e))?;
    if !meta.is_file() {
        return Err(format!("{}: Datei nicht gefunden", p.display()));
    }
    if meta.len() != groesse || projekt_ms(&meta) != geaendert {
        return Err(format!("{}: wurde inzwischen geändert – bitte neu einlesen und erneut versuchen", p.display()));
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(contents_base64.as_bytes())
        .map_err(|e| format!("Ungültige Daten: {e}"))?;
    let kopie = projekt_sicherung(&app, &p)?;
    let ziel = p.clone();
    let laenge = bytes.len();
    tauri::async_runtime::spawn_blocking(move || write_atomic(&ziel, &bytes))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("{}: {}", p.display(), e))?;
    log::info!("Projektdatei ersetzt: {} ({} Bytes, Sicherung {})", p.display(), laenge, kopie.display());
    Ok(())
}

fn projekt_suche(dir: &std::path::Path, prefix: &str, tiefe: u32, endung: &str, out: &mut Vec<ProjektEintrag>, gesehen: &mut usize) -> Result<(), String> {
    let lesen = match std::fs::read_dir(dir) {
        Ok(l) => l,
        // nicht lesbare Unterordner (Rechte) überspringen – die Suche soll nicht an einem Ordner scheitern
        Err(_) if !prefix.is_empty() => return Ok(()),
        Err(e) => return Err(format!("{}: {}", dir.display(), e)),
    };
    for e in lesen.flatten() {
        let typ = match e.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        if typ.is_symlink() {
            continue;
        }
        *gesehen += 1;
        if *gesehen >= PROJEKT_MAX_EINTRAEGE {
            return Err(format!("Mehr als {PROJEKT_MAX_EINTRAEGE} Einträge – bitte einen kleineren Ordner wählen."));
        }
        let name = e.file_name().to_string_lossy().to_string();
        let pfad = if prefix.is_empty() { name.clone() } else { format!("{prefix}/{name}") };
        if typ.is_dir() {
            if tiefe > 1 {
                projekt_suche(&e.path(), &pfad, tiefe - 1, endung, out, gesehen)?;
            }
        } else if name.to_lowercase().ends_with(&format!(".{endung}")) {
            let meta = e.metadata().ok();
            out.push(ProjektEintrag {
                pfad,
                ordner: false,
                groesse: meta.as_ref().map(|m| m.len()).unwrap_or(0),
                geaendert: meta.as_ref().map(projekt_ms).unwrap_or(0),
            });
        }
    }
    Ok(())
}

/// Sucht Dateien mit der Endung `endung` (ohne Punkt, z. B. „oap“) unter `root` bis zur Tiefe `tiefe` – liefert
/// nur die Treffer, nicht den ganzen Baum (schnell auch über das Netz).
#[tauri::command]
async fn projekt_dateien_suchen(root: String, tiefe: u32, endung: String) -> Result<Vec<ProjektEintrag>, String> {
    let dir = std::path::Path::new(&root);
    if !dir.is_absolute() {
        return Err(format!("Kein vollständiger Pfad: {root}"));
    }
    let endung = endung.trim_start_matches('.').to_lowercase();
    let mut out = Vec::new();
    let mut gesehen = 0;
    projekt_suche(dir, "", tiefe.max(1), &endung, &mut out, &mut gesehen)?;
    out.sort_by(|a, b| a.pfad.to_lowercase().cmp(&b.pfad.to_lowercase()));
    Ok(out)
}

#[derive(serde::Serialize)]
struct ZipEintragInhalt {
    /// Daten des Eintrags, wie sie im Archiv stehen (bei `methode` 8 noch komprimiert), Base64
    daten: String,
    /// 0 = gespeichert, 8 = deflate
    methode: u16,
    /// Größe unkomprimiert
    groesse: u64,
    /// Änderungszeit des Archivs (ms seit 1970)
    geaendert: u64,
}

fn le16(b: &[u8], i: usize) -> u16 {
    u16::from_le_bytes([b[i], b[i + 1]])
}
fn le32(b: &[u8], i: usize) -> u32 {
    u32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]])
}

/// Liest einen einzelnen Eintrag eines ZIP-Archivs (z. B. `projekt.json` einer Projektdatei), ohne das ganze
/// Archiv zu laden – für Übersichten mit vielen Projekten. `None`, wenn es Datei oder Eintrag nicht gibt.
#[tauri::command]
async fn projekt_zip_eintrag(root: String, pfad: String, name: String) -> Result<Option<ZipEintragInhalt>, String> {
    use std::io::{Read, Seek, SeekFrom};
    let p = projekt_unterhalb(&root, &pfad)?;
    let fehler = |e: std::io::Error| format!("{}: {}", p.display(), e);
    let mut f = match std::fs::File::open(&p) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(fehler(e)),
    };
    let meta = f.metadata().map_err(fehler)?;
    let laenge = meta.len();
    // Ende des zentralen Verzeichnisses: in den letzten 64 KB + 22 Bytes
    let ende = laenge.min(65_557);
    f.seek(SeekFrom::Start(laenge - ende)).map_err(fehler)?;
    let mut schwanz = vec![0u8; ende as usize];
    f.read_exact(&mut schwanz).map_err(fehler)?;
    let eocd = (0..schwanz.len().saturating_sub(21)).rev().find(|&i| le32(&schwanz, i) == 0x0605_4b50);
    let Some(eocd) = eocd else {
        return Err(format!("{}: kein ZIP-Archiv", p.display()));
    };
    let anzahl = le16(&schwanz, eocd + 10) as usize;
    let cd_groesse = le32(&schwanz, eocd + 12) as usize;
    let cd_start = le32(&schwanz, eocd + 16) as u64;
    if cd_start + cd_groesse as u64 > laenge {
        return Err(format!("{}: ZIP-Verzeichnis beschädigt", p.display()));
    }
    f.seek(SeekFrom::Start(cd_start)).map_err(fehler)?;
    let mut cd = vec![0u8; cd_groesse];
    f.read_exact(&mut cd).map_err(fehler)?;
    let mut i = 0;
    for _ in 0..anzahl {
        if i + 46 > cd.len() || le32(&cd, i) != 0x0201_4b50 {
            break;
        }
        let methode = le16(&cd, i + 10);
        let komprimiert = le32(&cd, i + 20) as u64;
        let groesse = le32(&cd, i + 24) as u64;
        let n = le16(&cd, i + 28) as usize;
        let extra = le16(&cd, i + 30) as usize;
        let kommentar = le16(&cd, i + 32) as usize;
        let lokal = le32(&cd, i + 42) as u64;
        if i + 46 + n > cd.len() {
            break;
        }
        if &cd[i + 46..i + 46 + n] == name.as_bytes() {
            let mut kopf = [0u8; 30];
            f.seek(SeekFrom::Start(lokal)).map_err(fehler)?;
            f.read_exact(&mut kopf).map_err(fehler)?;
            if le32(&kopf, 0) != 0x0403_4b50 {
                return Err(format!("{}: ZIP-Eintrag {name} beschädigt", p.display()));
            }
            let start = lokal + 30 + le16(&kopf, 26) as u64 + le16(&kopf, 28) as u64;
            if start + komprimiert > laenge {
                return Err(format!("{}: ZIP-Eintrag {name} beschädigt", p.display()));
            }
            f.seek(SeekFrom::Start(start)).map_err(fehler)?;
            let mut daten = vec![0u8; komprimiert as usize];
            f.read_exact(&mut daten).map_err(fehler)?;
            return Ok(Some(ZipEintragInhalt { daten: base64::engine::general_purpose::STANDARD.encode(&daten), methode, groesse, geaendert: projekt_ms(&meta) }));
        }
        i += 46 + n + extra + kommentar;
    }
    Ok(None)
}
