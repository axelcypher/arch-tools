// Befehle der Formulare-App: FORMA-Projektordner, Sperrdateien, Projektkarte, Dokumente. Per include! in die
// Hülle der App (lib.rs) und in die Rahmen-App (apps/suite) eingebunden, damit beide dieselben Befehle haben.
// Voraussetzung: packages/core/tauri/commands.rs ist davor eingebunden (write_atomic, base64 …).

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
    /// letzte Änderung (ms seit 1970), 0 wenn unbekannt
    geaendert: u64,
}

/// Änderungszeit in ms seit 1970 (0, wenn das Dateisystem sie nicht liefert)
fn ms_seit_1970(m: &std::fs::Metadata) -> u64 {
    m.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
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
        let meta = e.metadata().ok();
        let geaendert = meta.as_ref().map(ms_seit_1970).unwrap_or(0);
        if typ.is_dir() {
            out.push(Eintrag { pfad: pfad.clone(), ordner: true, groesse: 0, geaendert });
            if tiefe > 1 {
                sammle(&e.path(), &pfad, tiefe - 1, out)?;
            }
        } else {
            let groesse = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            out.push(Eintrag { pfad, ordner: false, groesse, geaendert });
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

/// Dokumente, die die App bearbeiten darf (Vorschau mit Bearbeiten im Projektordner) – und die Projektdatei
/// (.oap) mit den Projektstammdaten
const DOKUMENTE: [&str; 5] = ["pdf", "xlsx", "xlsm", "docx", "oap"];
/// so viele Sicherungskopien bleiben im App-Ordner
const MAX_SICHERUNGEN: usize = 200;

/// Ist das Dokument gerade in Excel oder Word geöffnet? Office legt daneben eine Besitzerdatei „~$…“ an
/// (bei langen Namen ohne die ersten beiden Zeichen).
fn office_offen(p: &Path) -> bool {
    let (Some(ordner), Some(name)) = (p.parent(), p.file_name().and_then(|n| n.to_str())) else { return false };
    let kurz: String = name.chars().skip(2).collect();
    ordner.join(format!("~${name}")).exists() || (!kurz.is_empty() && ordner.join(format!("~${kurz}")).exists())
}

/// Kopie der bisherigen Fassung im App-Ordner (Sicherungen), älteste werden gelöscht
fn sicherung(app: &tauri::AppHandle, p: &Path) -> Result<PathBuf, String> {
    let ordner = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("Sicherungen");
    std::fs::create_dir_all(&ordner).map_err(|e| format!("{}: {}", ordner.display(), e))?;
    let zeit = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let ziel = ordner.join(format!("{zeit}-{name}"));
    std::fs::copy(p, &ziel).map_err(|e| format!("Sicherung von {}: {}", p.display(), e))?;
    if let Ok(eintraege) = std::fs::read_dir(&ordner) {
        let mut alle: Vec<_> = eintraege.flatten().map(|e| e.path()).collect();
        alle.sort();
        let zuviel = alle.len().saturating_sub(MAX_SICHERUNGEN);
        for alt in alle.into_iter().take(zuviel) {
            let _ = std::fs::remove_file(alt);
        }
    }
    Ok(ziel)
}

/// Ersetzt ein vorhandenes Dokument (PDF, Excel, Word, Projektdatei) atomar – vorher mit Sicherungskopie im App-Ordner.
/// Abgelehnt, wenn es in Excel/Word geöffnet ist; ist es in einem anderen Programm geöffnet, scheitert das Ersetzen.
#[tauri::command]
async fn doc_replace(app: tauri::AppHandle, root: String, pfad: String, contents_base64: String) -> Result<(), String> {
    let p = unterhalb(&root, &pfad)?;
    if !DOKUMENTE.iter().any(|e| endung_ist(&p, e)) {
        return Err(format!("{}: Nur PDF-, Excel-, Word- und Projektdateien dürfen hier gespeichert werden", p.display()));
    }
    if !p.is_file() {
        return Err(format!("{}: Datei nicht gefunden", p.display()));
    }
    if office_offen(&p) {
        return Err(format!("{}: Die Datei ist gerade in Excel bzw. Word geöffnet – bitte dort schließen", p.display()));
    }
    let bytes = base64_lesen(&contents_base64)?;
    let kopie = sicherung(&app, &p)?;
    let ziel = p.clone();
    tauri::async_runtime::spawn_blocking(move || write_atomic(&ziel, &bytes))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| match e.raw_os_error() {
            Some(5) | Some(32) | Some(33) => format!("{}: Die Datei ist in einem anderen Programm geöffnet – bitte dort schließen", p.display()),
            _ => format!("{}: {}", p.display(), e),
        })?;
    log::info!("Dokument gespeichert: {} (Sicherung: {})", p.display(), kopie.display());
    Ok(())
}

/// Legt ein neues Dokument (PDF, Excel, Word) oder eine Projektdatei (.oap) an, z. B. eine exportierte PDF. Fehlt der
/// Ordner, wird er angelegt; eine vorhandene Datei wird nie überschrieben.
#[tauri::command]
async fn doc_create(root: String, pfad: String, contents_base64: String) -> Result<(), String> {
    let p = unterhalb(&root, &pfad)?;
    if !DOKUMENTE.iter().any(|e| endung_ist(&p, e)) {
        return Err(format!("{}: Nur PDF-, Excel-, Word- und Projektdateien dürfen hier angelegt werden", p.display()));
    }
    if let Some(ordner) = p.parent() {
        std::fs::create_dir_all(ordner).map_err(|e| format!("{}: {}", ordner.display(), e))?;
    }
    let bytes = base64_lesen(&contents_base64)?;
    let mut f = std::fs::OpenOptions::new().write(true).create_new(true).open(&p).map_err(|e| match e.kind() {
        std::io::ErrorKind::AlreadyExists => format!("{}: Die Datei gibt es schon", p.display()),
        _ => format!("{}: {}", p.display(), e),
    })?;
    f.write_all(&bytes).and_then(|_| f.sync_all()).map_err(|e| format!("{}: {}", p.display(), e))?;
    log::info!("Dokument angelegt: {}", p.display());
    Ok(())
}

/// Ist das Dokument gerade in Excel oder Word geöffnet?
#[tauri::command]
async fn doc_in_office(root: String, pfad: String) -> Result<bool, String> {
    Ok(office_offen(&unterhalb(&root, &pfad)?))
}

/// Name der Datei mit den Angaben der App zum Projekt (im FORMA-Projektordner)
const PROJEKTDATEI: &str = "formulare.json";

/// Dateien von FORMA, die nur FORMA selbst anlegt, umbenennt oder löscht
fn ist_forma_datei(p: &Path) -> bool {
    ["frmsjf", "frmtmp", "sdb", "ini"].iter().any(|e| endung_ist(p, e))
}

/// Darf die Datei von Hand gelöscht werden? Formulare (.frmsjf) ja, aber nicht, solange eine Sperrdatei daneben
/// liegt (in FORMA oder hier geöffnet); Sperrdateien, Projektkarte und Projekttitel verwaltet nur FORMA.
fn loeschen_erlaubt(p: &Path) -> Result<(), String> {
    if endung_ist(p, "frmsjf") {
        if p.with_extension("frmtmp").exists() {
            return Err(format!("{}: Das Formular ist gerade geöffnet (Sperrdatei vorhanden) – bitte erst dort schließen", p.display()));
        }
        return Ok(());
    }
    if ist_forma_datei(p) {
        return Err(format!("{}: Dateien von FORMA werden nur in FORMA gelöscht", p.display()));
    }
    Ok(())
}

/// Schreibt die Angaben der App zum Projekt (`formulare.json`) atomar – andere Dateien werden abgelehnt.
#[tauri::command]
async fn project_file_write(root: String, pfad: String, contents_base64: String) -> Result<(), String> {
    let p = unterhalb(&root, &pfad)?;
    if !p.file_name().is_some_and(|n| n.to_string_lossy().eq_ignore_ascii_case(PROJEKTDATEI)) {
        return Err(format!("{}: Hier darf nur {PROJEKTDATEI} geschrieben werden", p.display()));
    }
    if !p.parent().is_some_and(|o| o.is_dir()) {
        return Err(format!("{}: Ordner nicht gefunden", p.display()));
    }
    let bytes = base64_lesen(&contents_base64)?;
    let ziel = p.clone();
    tauri::async_runtime::spawn_blocking(move || write_atomic(&ziel, &bytes))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("{}: {}", p.display(), e))?;
    Ok(())
}

/// Legt einen Ordner an (samt fehlender Ordner darüber), z. B. eine neue Antragsfassung „TÖB/BAUA 3“.
#[tauri::command]
async fn dir_create(root: String, pfad: String) -> Result<(), String> {
    let p = unterhalb(&root, &pfad)?;
    std::fs::create_dir_all(&p).map_err(|e| format!("{}: {}", p.display(), e))?;
    log::info!("Ordner angelegt: {}", p.display());
    Ok(())
}

/// Legt ein neues Formular (.frmsjf) an – aus einer Vorlage, eine vorhandene Datei wird nie überschrieben.
#[tauri::command]
async fn form_create(root: String, pfad: String, contents_base64: String) -> Result<(), String> {
    let p = unterhalb(&root, &pfad)?;
    if !endung_ist(&p, "frmsjf") {
        return Err(format!("{}: Nur Formulare (.frmsjf) dürfen hier angelegt werden", p.display()));
    }
    if !p.parent().is_some_and(|o| o.is_dir()) {
        return Err(format!("{}: Projektordner nicht gefunden", p.display()));
    }
    let bytes = base64_lesen(&contents_base64)?;
    let mut f = std::fs::OpenOptions::new().write(true).create_new(true).open(&p).map_err(|e| match e.kind() {
        std::io::ErrorKind::AlreadyExists => format!("{}: Das Formular gibt es schon", p.display()),
        _ => format!("{}: {}", p.display(), e),
    })?;
    f.write_all(&bytes).and_then(|_| f.sync_all()).map_err(|e| format!("{}: {}", p.display(), e))?;
    log::info!("Formular angelegt: {}", p.display());
    Ok(())
}

/// Kopiert eine Datei (auch in einen anderen Ordner unter `root`); das Ziel wird nie überschrieben.
#[tauri::command]
async fn doc_copy(root: String, von: String, nach: String) -> Result<(), String> {
    let quelle = unterhalb(&root, &von)?;
    let ziel = unterhalb(&root, &nach)?;
    if !quelle.is_file() {
        return Err(format!("{}: Datei nicht gefunden", quelle.display()));
    }
    if let Some(ordner) = ziel.parent() {
        std::fs::create_dir_all(ordner).map_err(|e| format!("{}: {}", ordner.display(), e))?;
    }
    let (q, z) = (quelle.clone(), ziel.clone());
    tauri::async_runtime::spawn_blocking(move || -> std::io::Result<()> {
        let mut aus = std::fs::File::open(&q)?;
        let mut ein = std::fs::OpenOptions::new().write(true).create_new(true).open(&z)?;
        std::io::copy(&mut aus, &mut ein)?;
        ein.sync_all()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| match e.kind() {
        std::io::ErrorKind::AlreadyExists => format!("{}: Die Datei gibt es schon", ziel.display()),
        _ => format!("{}: {}", ziel.display(), e),
    })?;
    log::info!("Kopiert: {} → {}", quelle.display(), ziel.display());
    Ok(())
}

/// Benennt eine Datei um bzw. verschiebt sie unter `root`; das Ziel wird nie überschrieben. Dateien von FORMA
/// sind ausgenommen.
#[tauri::command]
async fn doc_rename(root: String, von: String, nach: String) -> Result<(), String> {
    let quelle = unterhalb(&root, &von)?;
    let ziel = unterhalb(&root, &nach)?;
    if ist_forma_datei(&quelle) || ist_forma_datei(&ziel) {
        return Err(format!("{}: Dateien von FORMA werden nur in FORMA umbenannt", quelle.display()));
    }
    if !quelle.is_file() {
        return Err(format!("{}: Datei nicht gefunden", quelle.display()));
    }
    if office_offen(&quelle) {
        return Err(format!("{}: Die Datei ist gerade in Excel bzw. Word geöffnet – bitte dort schließen", quelle.display()));
    }
    // nur Groß-/Kleinschreibung geändert: unter Windows ist das dieselbe Datei
    let gleiche_datei = von.to_lowercase() == nach.to_lowercase();
    if ziel.exists() && !gleiche_datei {
        return Err(format!("{}: Die Datei gibt es schon", ziel.display()));
    }
    std::fs::rename(&quelle, &ziel).map_err(|e| match e.raw_os_error() {
        Some(5) | Some(32) | Some(33) => format!("{}: Die Datei ist in einem anderen Programm geöffnet – bitte dort schließen", quelle.display()),
        _ => format!("{}: {}", quelle.display(), e),
    })?;
    log::info!("Umbenannt: {} → {}", quelle.display(), ziel.display());
    Ok(())
}

/// Benennt ein Formular (.frmsjf) im selben Ordner um. Während des Umbenennens liegt eine eigene Sperrdatei neben
/// dem alten Namen (mit `create_new` – liegt schon eine, ist das Formular in FORMA oder anderswo geöffnet, und es wird
/// nicht umbenannt); so kann FORMA es nicht genau in diesem Moment öffnen. Das Ziel und seine Sperrdatei dürfen
/// es noch nicht geben – überschrieben wird nie. Danach wird die eigene Sperre wieder entfernt.
fn formular_umbenennen(quelle: &Path, ziel: &Path, sperre: &[u8]) -> Result<(), String> {
    if !endung_ist(quelle, "frmsjf") || !endung_ist(ziel, "frmsjf") {
        return Err(format!("{}: Nur Formulare (.frmsjf) werden hier umbenannt", quelle.display()));
    }
    if quelle.parent() != ziel.parent() {
        return Err(format!("{}: Formulare werden nur im selben Ordner umbenannt", quelle.display()));
    }
    if !quelle.is_file() {
        return Err(format!("{}: Formular nicht gefunden", quelle.display()));
    }
    // nur Groß-/Kleinschreibung geändert: unter Windows ist das dieselbe Datei (auch dieselbe Sperrdatei)
    let gleiche_datei = quelle.to_string_lossy().to_lowercase() == ziel.to_string_lossy().to_lowercase();
    if !gleiche_datei && (ziel.exists() || ziel.with_extension("frmtmp").exists()) {
        return Err(format!("{}: Das Formular gibt es schon", ziel.display()));
    }
    let sp = quelle.with_extension("frmtmp");
    match std::fs::OpenOptions::new().write(true).create_new(true).open(&sp) {
        Ok(mut f) => f.write_all(sperre).and_then(|_| f.flush()).map_err(|e| format!("{}: {}", sp.display(), e))?,
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
            return Err(format!("{}: Das Formular ist gerade geöffnet (Sperrdatei vorhanden) – bitte erst dort schließen", quelle.display()))
        }
        Err(e) => return Err(format!("{}: {}", sp.display(), e)),
    }
    let ergebnis = std::fs::rename(quelle, ziel).map_err(|e| match e.raw_os_error() {
        Some(5) | Some(32) | Some(33) => format!("{}: Das Formular ist in einem anderen Programm geöffnet – bitte dort schließen", quelle.display()),
        _ => format!("{}: {}", quelle.display(), e),
    });
    // die eigene Sperre wieder weg – nur, wenn sie noch genau unseren Inhalt hat
    if std::fs::read(&sp).is_ok_and(|b| b == sperre) {
        let _ = std::fs::remove_file(&sp);
    }
    ergebnis?;
    log::info!("Formular umbenannt: {} → {}", quelle.display(), ziel.display());
    Ok(())
}

#[tauri::command]
async fn form_rename(root: String, von: String, nach: String, sperre_base64: String) -> Result<(), String> {
    formular_umbenennen(&unterhalb(&root, &von)?, &unterhalb(&root, &nach)?, &base64_lesen(&sperre_base64)?)
}

/// Löscht eine Datei – vorher mit Sicherungskopie im App-Ordner. Dateien von FORMA sind ausgenommen.
#[tauri::command]
async fn doc_delete(app: tauri::AppHandle, root: String, pfad: String) -> Result<(), String> {
    let p = unterhalb(&root, &pfad)?;
    if !p.is_file() {
        return Err(format!("{}: Datei nicht gefunden", p.display()));
    }
    loeschen_erlaubt(&p)?;
    if office_offen(&p) {
        return Err(format!("{}: Die Datei ist gerade in Excel bzw. Word geöffnet – bitte dort schließen", p.display()));
    }
    let kopie = sicherung(&app, &p)?;
    std::fs::remove_file(&p).map_err(|e| match e.raw_os_error() {
        Some(5) | Some(32) | Some(33) => format!("{}: Die Datei ist in einem anderen Programm geöffnet – bitte dort schließen", p.display()),
        _ => format!("{}: {}", p.display(), e),
    })?;
    log::info!("Gelöscht: {} (Sicherung: {})", p.display(), kopie.display());
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

/// Beim Beenden: eigene Sperrdateien nicht liegen lassen, sonst bleiben die Formulare für die Kollegen gesperrt.
fn formulare_beim_beenden<R: tauri::Runtime>(handle: &tauri::AppHandle<R>) {
    let Some(sperren) = handle.try_state::<EigeneSperren>() else {
        return;
    };
    let offen: Vec<_> = sperren.0.lock().map(|mut m| m.drain().collect()).unwrap_or_default();
    for (p, (inhalt, griff)) in offen {
        drop(griff);
        if let Err(e) = sperre_entfernen(&p, &inhalt) {
            log::error!("Sperrdatei beim Beenden nicht entfernt: {e}");
        }
    }
}
