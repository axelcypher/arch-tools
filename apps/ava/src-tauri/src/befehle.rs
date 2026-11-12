// Befehle der AVA-App: LV-Dateien, Kostenkontrolle und Rechnungen in den Gewerkeordnern, Scans übernehmen,
// Mailentwürfe öffnen. Per include! in die Hülle der App (lib.rs) und in die Rahmen-App (apps/suite) eingebunden.
// Voraussetzung: packages/core/tauri/commands.rs ist davor eingebunden (projekt_unterhalb, projekt_ms,
// projekt_sicherung, write_atomic …). Lesen, Auflisten und neue Dateien anlegen laufen über die gemeinsamen
// Befehle (projekt_liste, projekt_lesen, projekt_datei_anlegen, projekt_ordner_anlegen).
//
// Grundsatz: Überschrieben wird nur eine vorhandene Datei der App (LV, Projekt, Kostenkontrolle) – atomar, nach
// einer Sicherungskopie und nur, wenn sie seit dem Lesen niemand geändert hat. Verschieben und Umbenennen
// überschreiben nie. Gelöscht wird nur ein übernommener Scan im Scanordner, nachdem er sicher im Projekt liegt.

/// Dateien, die die App ersetzen darf
const AVA_ERSETZBAR: [&str; 7] = ["aslv", "asproj", "oalv", "xlsx", "xlsm", "pdf", "json"];

fn ava_endung(p: &std::path::Path) -> String {
    p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default()
}

/// Ist das Dokument gerade in Excel geöffnet? Office legt daneben eine Besitzerdatei „~$…“ an
/// (bei langen Namen ohne die ersten beiden Zeichen).
fn ava_in_office(p: &std::path::Path) -> bool {
    let (Some(ordner), Some(name)) = (p.parent(), p.file_name().and_then(|n| n.to_str())) else { return false };
    let kurz: String = name.chars().skip(2).collect();
    ordner.join(format!("~${name}")).exists() || (!kurz.is_empty() && ordner.join(format!("~${kurz}")).exists())
}

fn ava_base64(daten: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(daten.as_bytes())
        .map_err(|e| format!("Ungültige Daten: {e}"))
}

fn ava_belegt(e: &std::io::Error) -> bool {
    matches!(e.raw_os_error(), Some(5) | Some(32) | Some(33))
}

/// Ersetzt eine vorhandene Datei der App (LV, Projekt, Kostenkontrolle …) atomar – nur, wenn sie noch Größe und
/// Änderungszeit vom Lesen hat, nicht, solange Excel sie geöffnet hat, und erst nach einer Sicherungskopie.
#[tauri::command]
async fn ava_ersetzen(app: tauri::AppHandle, root: String, pfad: String, contents_base64: String, groesse: u64, geaendert: u64) -> Result<(), String> {
    let p = projekt_unterhalb(&root, &pfad)?;
    let endung = ava_endung(&p);
    if !AVA_ERSETZBAR.contains(&endung.as_str()) {
        return Err(format!("{}: Diese Datei darf die App nicht ersetzen", p.display()));
    }
    let meta = std::fs::metadata(&p).map_err(|e| format!("{}: {}", p.display(), e))?;
    if !meta.is_file() {
        return Err(format!("{}: Datei nicht gefunden", p.display()));
    }
    if meta.len() != groesse || projekt_ms(&meta) != geaendert {
        return Err(format!("{}: wurde inzwischen geändert – bitte neu einlesen und erneut versuchen", p.display()));
    }
    if ava_in_office(&p) {
        return Err(format!("{}: Die Datei ist gerade in Excel geöffnet – bitte dort schließen", p.display()));
    }
    let bytes = ava_base64(&contents_base64)?;
    let kopie = projekt_sicherung(&app, &p)?;
    let ziel = p.clone();
    tauri::async_runtime::spawn_blocking(move || write_atomic(&ziel, &bytes))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| {
            if ava_belegt(&e) {
                format!("{}: Die Datei ist in einem anderen Programm geöffnet – bitte dort schließen", p.display())
            } else {
                format!("{}: {}", p.display(), e)
            }
        })?;
    log::info!("Gespeichert: {} (Sicherung {})", p.display(), kopie.display());
    Ok(())
}

/// Ist die Datei gerade in Excel geöffnet?
#[tauri::command]
async fn ava_office_offen(root: String, pfad: String) -> Result<bool, String> {
    Ok(ava_in_office(&projekt_unterhalb(&root, &pfad)?))
}

/// Benennt eine Datei unter `root` um bzw. verschiebt sie (z. B. ins Archiv); das Ziel wird nie überschrieben.
#[tauri::command]
async fn ava_umbenennen(root: String, von: String, nach: String) -> Result<(), String> {
    let quelle = projekt_unterhalb(&root, &von)?;
    let ziel = projekt_unterhalb(&root, &nach)?;
    if !quelle.is_file() {
        return Err(format!("{}: Datei nicht gefunden", quelle.display()));
    }
    if ava_in_office(&quelle) {
        return Err(format!("{}: Die Datei ist gerade in Excel geöffnet – bitte dort schließen", quelle.display()));
    }
    let gleiche_datei = von.to_lowercase() == nach.to_lowercase();
    if ziel.exists() && !gleiche_datei {
        return Err(format!("{}: Die Datei gibt es schon", ziel.display()));
    }
    if let Some(ordner) = ziel.parent() {
        std::fs::create_dir_all(ordner).map_err(|e| format!("{}: {}", ordner.display(), e))?;
    }
    std::fs::rename(&quelle, &ziel).map_err(|e| {
        if ava_belegt(&e) {
            format!("{}: Die Datei ist in einem anderen Programm geöffnet – bitte dort schließen", quelle.display())
        } else {
            format!("{}: {}", quelle.display(), e)
        }
    })?;
    log::info!("Umbenannt: {} → {}", quelle.display(), ziel.display());
    Ok(())
}

/// Übernimmt eine Datei aus dem Scanordner ins Projekt: legt sie unter `ziel` an (nie überschreibend) – mit dem
/// Inhalt `contents_base64`, falls angegeben (z. B. mit vorangestelltem Deckblatt), sonst unverändert – und
/// entfernt sie erst danach aus dem Scanordner. Vorher kommt eine Sicherungskopie in den App-Ordner.
#[tauri::command]
async fn ava_scan_uebernehmen(
    app: tauri::AppHandle,
    scan_ordner: String,
    scan_datei: String,
    root: String,
    ziel: String,
    contents_base64: Option<String>,
) -> Result<(), String> {
    use std::io::Write;
    let quelle = projekt_unterhalb(&scan_ordner, &scan_datei)?;
    let ziel_pfad = projekt_unterhalb(&root, &ziel)?;
    if !quelle.is_file() {
        return Err(format!("{}: Scan nicht gefunden", quelle.display()));
    }
    if ziel_pfad.exists() {
        return Err(format!("{}: Die Datei gibt es schon", ziel_pfad.display()));
    }
    if let Some(ordner) = ziel_pfad.parent() {
        std::fs::create_dir_all(ordner).map_err(|e| format!("{}: {}", ordner.display(), e))?;
    }
    let kopie = projekt_sicherung(&app, &quelle)?;
    let bytes = match contents_base64 {
        Some(b) => ava_base64(&b)?,
        None => std::fs::read(&quelle).map_err(|e| format!("{}: {}", quelle.display(), e))?,
    };
    let mut f = std::fs::OpenOptions::new().write(true).create_new(true).open(&ziel_pfad).map_err(|e| match e.kind() {
        std::io::ErrorKind::AlreadyExists => format!("{}: Die Datei gibt es schon", ziel_pfad.display()),
        _ => format!("{}: {}", ziel_pfad.display(), e),
    })?;
    f.write_all(&bytes).and_then(|_| f.sync_all()).map_err(|e| format!("{}: {}", ziel_pfad.display(), e))?;
    drop(f);
    // erst wenn die Datei vollständig im Projekt liegt, verschwindet der Scan
    let angekommen = std::fs::metadata(&ziel_pfad).map(|m| m.len() == bytes.len() as u64).unwrap_or(false);
    if !angekommen {
        return Err(format!("{}: unvollständig geschrieben – der Scan bleibt im Scanordner", ziel_pfad.display()));
    }
    if let Err(e) = std::fs::remove_file(&quelle) {
        log::warn!("Scan übernommen, aber nicht aus dem Scanordner entfernt: {}: {}", quelle.display(), e);
        return Err(format!("Übernommen nach {}, aber der Scan ließ sich nicht aus dem Scanordner entfernen: {}", ziel_pfad.display(), e));
    }
    log::info!("Scan übernommen: {} → {} (Sicherung {})", quelle.display(), ziel_pfad.display(), kopie.display());
    Ok(())
}

/// Öffnet eine Datei mit dem zugehörigen Programm.
#[tauri::command]
async fn ava_oeffnen(pfad: String) -> Result<(), String> {
    let p = std::path::Path::new(&pfad);
    if !p.is_absolute() || !p.exists() {
        return Err(format!("Nicht gefunden: {pfad}"));
    }
    ava_starten(p)
}

fn ava_starten(p: &std::path::Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // „start“ öffnet mit dem Standardprogramm (für .eml das Mailprogramm), ohne Konsolenfenster
        use std::os::windows::process::CommandExt;
        std::process::Command::new("cmd")
            .args(["/C", "start", ""])
            .arg(p)
            .creation_flags(0x0800_0000)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(p).spawn().map_err(|e| e.to_string())?;
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    std::process::Command::new("xdg-open").arg(p).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

/// Legt einen Mailentwurf (.eml mit „X-Unsent: 1“, Anhänge eingebettet) im Temp-Ordner ab und öffnet ihn mit dem
/// Mailprogramm – Outlook zeigt ihn als neue, ungesendete Nachricht: nur noch „Senden“.
#[tauri::command]
async fn ava_mail_entwurf(name: String, contents_base64: String) -> Result<String, String> {
    let bytes = ava_base64(&contents_base64)?;
    let sauber: String = name
        .chars()
        .map(|c| if "\\/:*?\"<>|".contains(c) || c.is_control() { '_' } else { c })
        .collect();
    let ordner = std::env::temp_dir().join("arch-tools-mails");
    std::fs::create_dir_all(&ordner).map_err(|e| format!("{}: {}", ordner.display(), e))?;
    let zeit = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let p = ordner.join(format!("{zeit} {}.eml", sauber.trim()));
    std::fs::write(&p, &bytes).map_err(|e| format!("{}: {}", p.display(), e))?;
    ava_starten(&p)?;
    log::info!("Mailentwurf geöffnet: {}", p.display());
    Ok(p.display().to_string())
}
