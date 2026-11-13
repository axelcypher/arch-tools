// QGIS im Hintergrund (qgis_process) – für die Katasterpläne der App „Projekt“. Per include! in die Hüllen von
// Projektordner und Rahmen-App eingebunden (nach commands.rs: base64, log); Formulare hatte die Katasterpläne früher.
//
// Gestartet wird ausschließlich ein Programm namens qgis_process (bzw. qgis_process-qgis*.bat unter Windows), mit dem
// Export-Skript der App und einem Auftrag (JSON) – beide und die QGIS-Vorlage liegen in einem eigenen temporären
// Ordner, der danach gelöscht wird. Das Skript schreibt die Pläne ebenfalls dorthin; erst danach legt die Hülle sie
// an den Zielpfaden des Auftrags ab – neu angelegt, vorhandene Dateien werden nie überschrieben.

#[derive(serde::Serialize)]
struct QgisAblage {
    id: String,
    /// abgelegte Datei (Zielpfad) oder None
    datei: Option<String>,
    fehler: Option<String>,
}

#[derive(serde::Serialize)]
struct QgisErgebnis {
    code: i32,
    ausgabe: String,
    fehler: String,
    abgelegt: Vec<QgisAblage>,
}

/// Erzeugte Datei an ihrem Ziel ablegen – nur neu anlegen (Ordner samt fehlender darüber), nie überschreiben
fn qgis_ablegen(von: &std::path::Path, nach: &std::path::Path) -> Result<(), String> {
    if let Some(o) = nach.parent() {
        std::fs::create_dir_all(o).map_err(|e| format!("{}: {e}", o.display()))?;
    }
    let mut ziel = std::fs::OpenOptions::new().write(true).create_new(true).open(nach).map_err(|e| match e.kind() {
        std::io::ErrorKind::AlreadyExists => format!("{}: Die Datei gibt es schon", nach.display()),
        _ => format!("{}: {e}", nach.display()),
    })?;
    let mut quelle = std::fs::File::open(von).map_err(|e| e.to_string())?;
    if let Err(e) = std::io::copy(&mut quelle, &mut ziel) {
        drop(ziel);
        let _ = std::fs::remove_file(nach);
        return Err(format!("{}: {e}", nach.display()));
    }
    Ok(())
}

/// so lange darf qgis_process laufen, bevor es beendet wird (je Plan 3 Minuten, mindestens 5) – sonst sperrte ein
/// hängendes QGIS den Katasterdialog dauerhaft
fn qgis_zeitlimit(plaene: usize) -> std::time::Duration {
    std::time::Duration::from_secs(60 * (3 * plaene as u64).max(5))
}

/// Kennungen der Pläne, die das Skript als gelungen meldet (Zeilen „ERGEBNIS {json}“ mit "ok": true)
fn qgis_gelungen(ausgabe: &str) -> std::collections::HashSet<String> {
    ausgabe
        .lines()
        .filter_map(|z| z.find("ERGEBNIS ").map(|i| &z[i + "ERGEBNIS ".len()..]))
        .filter_map(|j| serde_json::from_str::<serde_json::Value>(j.trim()).ok())
        .filter(|v| v.get("ok").and_then(|o| o.as_bool()) == Some(true))
        .filter_map(|v| v.get("id").and_then(|i| i.as_str()).map(String::from))
        .collect()
}

/// Programm ausführen, Ausgaben sammeln; nach `limit` beenden. Fehlertext bei Zeitüberschreitung.
fn qgis_mit_zeitlimit(cmd: &mut std::process::Command, limit: std::time::Duration) -> Result<std::process::Output, String> {
    use std::io::Read;
    use std::process::Stdio;
    let mut kind = cmd.stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| e.to_string())?;
    // Ausgaben in eigenen Fäden lesen – sonst blockiert QGIS bei vollem Puffer und das Zeitlimit liefe ins Leere
    let mut out = kind.stdout.take().ok_or("keine Ausgabe")?;
    let mut err = kind.stderr.take().ok_or("keine Fehlerausgabe")?;
    let lies_out = std::thread::spawn(move || {
        let mut b = Vec::new();
        let _ = out.read_to_end(&mut b);
        b
    });
    let lies_err = std::thread::spawn(move || {
        let mut b = Vec::new();
        let _ = err.read_to_end(&mut b);
        b
    });
    let beginn = std::time::Instant::now();
    let status = loop {
        match kind.try_wait().map_err(|e| e.to_string())? {
            Some(s) => break s,
            None if beginn.elapsed() >= limit => {
                let _ = kind.kill();
                let _ = kind.wait();
                return Err(format!("QGIS hat nach {} Minuten nicht geantwortet und wurde beendet.", limit.as_secs() / 60));
            }
            None => std::thread::sleep(std::time::Duration::from_millis(200)),
        }
    };
    Ok(std::process::Output { status, stdout: lies_out.join().unwrap_or_default(), stderr: lies_err.join().unwrap_or_default() })
}

/// Ist das der Name eines qgis_process-Aufrufs? (qgis_process, qgis_process.exe, qgis_process-qgis.bat, -qgis-ltr.bat …)
fn ist_qgis_process(pfad: &std::path::Path) -> bool {
    let name = pfad.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
    name.starts_with("qgis_process") && (name == "qgis_process" || name.ends_with(".exe") || name.ends_with(".bat") || name.ends_with(".cmd") || !name.contains('.'))
}

/// qgis_process in den üblichen Installationsorten suchen (neueste zuerst)
#[tauri::command]
async fn qgis_suchen() -> Result<Vec<String>, String> {
    let mut gefunden: Vec<std::path::PathBuf> = Vec::new();
    let mut wurzeln: Vec<std::path::PathBuf> = Vec::new();
    for var in ["ProgramFiles", "ProgramW6432", "ProgramFiles(x86)"] {
        if let Ok(p) = std::env::var(var) {
            wurzeln.push(std::path::PathBuf::from(p));
        }
    }
    wurzeln.push(std::path::PathBuf::from("C:\\OSGeo4W"));
    for w in wurzeln {
        let Ok(eintraege) = std::fs::read_dir(&w) else { continue };
        for e in eintraege.flatten() {
            let name = e.file_name().to_string_lossy().to_lowercase();
            if !(name.starts_with("qgis") || name == "osgeo4w") {
                continue;
            }
            let bin = e.path().join("bin");
            for kandidat in ["qgis_process-qgis-ltr.bat", "qgis_process-qgis.bat", "qgis_process.exe"] {
                let p = bin.join(kandidat);
                if p.is_file() {
                    gefunden.push(p);
                }
            }
        }
        let bin = w.join("bin");
        for kandidat in ["qgis_process-qgis-ltr.bat", "qgis_process-qgis.bat"] {
            let p = bin.join(kandidat);
            if p.is_file() {
                gefunden.push(p);
            }
        }
    }
    for p in ["/usr/bin/qgis_process", "/usr/local/bin/qgis_process", "/Applications/QGIS.app/Contents/MacOS/bin/qgis_process"] {
        let p = std::path::PathBuf::from(p);
        if p.is_file() {
            gefunden.push(p);
        }
    }
    let mut liste: Vec<String> = gefunden.into_iter().map(|p| p.to_string_lossy().into_owned()).collect();
    liste.sort();
    liste.reverse();
    liste.dedup();
    Ok(liste)
}

/// Export-Skript mit Auftrag und Vorlage in einem temporären Ordner ablegen und mit qgis_process ausführen.
/// `auftrag` ist JSON; "vorlage" wird auf die hier abgelegte Vorlage gesetzt, "ausgabe" jedes Plans (vollständiger
/// Zielpfad) auf eine Datei im temporären Ordner – die danach am Ziel abgelegt wird.
#[tauri::command]
async fn qgis_ausfuehren(programm: String, skript: String, auftrag: String, vorlage_base64: String, vorlage_name: String) -> Result<QgisErgebnis, String> {
    let prog = std::path::PathBuf::from(&programm);
    if !ist_qgis_process(&prog) {
        return Err(format!("{programm}: kein qgis_process – bitte in den Einstellungen den Pfad zu qgis_process wählen"));
    }
    if !prog.is_file() {
        return Err(format!("{programm}: nicht gefunden – ist QGIS installiert?"));
    }
    let vorlage = base64::engine::general_purpose::STANDARD
        .decode(vorlage_base64.as_bytes())
        .map_err(|e| format!("Ungültige Vorlage: {e}"))?;
    let mut auftrag: serde_json::Value = serde_json::from_str(&auftrag).map_err(|e| format!("Ungültiger Auftrag: {e}"))?;
    // nur ein Dateiname, keine Pfadteile
    let name: String = vorlage_name.chars().map(|c| if "<>:\"/\\|?*".contains(c) || c.is_control() { '_' } else { c }).collect();
    let name = if name.to_lowercase().ends_with(".qgz") || name.to_lowercase().ends_with(".qgs") { name } else { format!("{name}.qgz") };
    tauri::async_runtime::spawn_blocking(move || {
        let stempel = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
        let ordner = std::env::temp_dir().join(format!("arch-tools-qgis-{}-{}", std::process::id(), stempel));
        std::fs::create_dir_all(&ordner).map_err(|e| e.to_string())?;
        let ergebnis = (|| {
            let vorlage_pfad = ordner.join(&name);
            std::fs::write(&vorlage_pfad, &vorlage).map_err(|e| e.to_string())?;
            let skript_pfad = ordner.join("katasterexport.py");
            std::fs::write(&skript_pfad, skript.as_bytes()).map_err(|e| e.to_string())?;
            auftrag["vorlage"] = serde_json::Value::String(vorlage_pfad.to_string_lossy().into_owned());
            let aus = ordner.join("aus");
            std::fs::create_dir_all(&aus).map_err(|e| e.to_string())?;
            // (Kennung, temporäre Datei, Ziel)
            let mut ziele: Vec<(String, std::path::PathBuf, std::path::PathBuf)> = Vec::new();
            if let Some(plaene) = auftrag.get_mut("plaene").and_then(|p| p.as_array_mut()) {
                for (i, plan) in plaene.iter_mut().enumerate() {
                    let ziel = std::path::PathBuf::from(plan.get("ausgabe").and_then(|a| a.as_str()).unwrap_or_default());
                    if !ziel.is_absolute() {
                        return Err(format!("Plan {}: kein vollständiger Zielpfad", i + 1));
                    }
                    let endung = ziel.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
                    if endung != "pdf" && endung != "dxf" {
                        return Err(format!("{}: nur PDF- und DXF-Dateien", ziel.display()));
                    }
                    let tmp = aus.join(format!("{i}.{endung}"));
                    let id = plan.get("id").and_then(|a| a.as_str()).unwrap_or_default().to_string();
                    plan["ausgabe"] = serde_json::Value::String(tmp.to_string_lossy().into_owned());
                    ziele.push((id, tmp, ziel));
                }
            }
            let auftrag_pfad = ordner.join("auftrag.json");
            std::fs::write(&auftrag_pfad, serde_json::to_vec(&auftrag).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
            let mut cmd = std::process::Command::new(&prog);
            cmd.arg("run").arg(&skript_pfad).arg("--").arg(format!("AUFTRAG={}", auftrag_pfad.to_string_lossy()));
            cmd.current_dir(&ordner);
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                // kein Konsolenfenster
                cmd.creation_flags(0x0800_0000);
            }
            log::info!("QGIS: {} run katasterexport.py", prog.display());
            let out = qgis_mit_zeitlimit(&mut cmd, qgis_zeitlimit(ziele.len())).map_err(|e| format!("{}: {e}", prog.display()))?;
            // nur Pläne ablegen, die das Skript als gelungen meldet – nie die Datei eines fehlgeschlagenen
            let gelungen = qgis_gelungen(&String::from_utf8_lossy(&out.stdout));
            let abgelegt = ziele
                .into_iter()
                .filter(|(id, tmp, _)| gelungen.contains(id) && tmp.is_file())
                .map(|(id, tmp, ziel)| match qgis_ablegen(&tmp, &ziel) {
                    Ok(()) => QgisAblage { id, datei: Some(ziel.to_string_lossy().into_owned()), fehler: None },
                    Err(e) => QgisAblage { id, datei: None, fehler: Some(e) },
                })
                .collect();
            Ok::<QgisErgebnis, String>(QgisErgebnis {
                code: out.status.code().unwrap_or(-1),
                ausgabe: String::from_utf8_lossy(&out.stdout).into_owned(),
                fehler: String::from_utf8_lossy(&out.stderr).into_owned(),
                abgelegt,
            })
        })();
        let _ = std::fs::remove_dir_all(&ordner);
        if let Ok(r) = &ergebnis {
            log::info!("QGIS beendet: Code {}", r.code);
        }
        ergebnis
    })
    .await
    .map_err(|e| e.to_string())?
}
