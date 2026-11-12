// Netzabruf und Ablage der App Baurecht – per include! in die Tauri-Hülle von Baurecht und in die Rahmen-App
// eingebunden (wie die gemeinsamen Befehle in packages/core/tauri/commands.rs).
//
// Grundsatz: Die Webansicht darf ins Netz nur über `netz_holen`, und nur zu freigegebenen Hosts – einer festen Liste
// (amtliche Rechtsquellen, Geodienste, Ortsrecht der Module, Auslieferung des Regelpakets) und den Hosts, die ein
// gültig signiertes Regelpaket nennt (`netz_hosts_erweitern`, nach Prüfung der Signatur im Frontend). Umleitungen
// werden einzeln verfolgt und jede Station gegen die Liste geprüft. Die CSP der Webansicht bleibt unverändert.

use std::collections::HashSet;
use std::io::Read;
use std::sync::Mutex;

/// Hosts, die immer erlaubt sind
const NETZ_GRUNDLISTE: &[&str] = &[
    // Rechtsquellen
    "www.gesetze-im-internet.de",
    "testphase.rechtsinformationen.bund.de",
    "rechtsinformationen.bund.de",
    "recht.nrw.de",
    "www.dibt.de",
    // Geodienste NRW
    "www.wms.nrw.de",
    "www.wfs.nrw.de",
    // Kreis und Stadt Soest, Bezirksregierung, Naturschutzinformationen (Module)
    "www.soest.de",
    "gis02.soest.de",
    "www.stadtentwaesserung-soest.de",
    "www.kreis-soest.de",
    "gis.kreis-soest.de",
    "www.bra.nrw.de",
    "legaldocs.naturschutzinformationen.nrw.de",
    // Auslieferung des Regelpakets (GitHub-Release „regeln“)
    "github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
];

/// höchstens so viele Bytes je Abruf (große PDFs wie die MVV TB passen hinein)
const NETZ_HOECHSTENS: u64 = 80 * 1024 * 1024;

fn netz_freigaben() -> &'static Mutex<HashSet<String>> {
    static FREIGABEN: std::sync::OnceLock<Mutex<HashSet<String>>> = std::sync::OnceLock::new();
    FREIGABEN.get_or_init(|| Mutex::new(NETZ_GRUNDLISTE.iter().map(|s| s.to_string()).collect()))
}

/// Host einer Adresse (nur https)
fn netz_host(url: &str) -> Option<String> {
    let rest = url.strip_prefix("https://")?;
    let ende = rest.find(|c| c == '/' || c == '?' || c == '#').unwrap_or(rest.len());
    let host = &rest[..ende];
    if host.contains('@') || host.contains(':') || host.is_empty() {
        return None;
    }
    Some(host.to_ascii_lowercase())
}

fn netz_erlaubt(url: &str) -> Result<(), String> {
    let host = netz_host(url).ok_or_else(|| format!("Nur https-Adressen ohne Port und Zugangsdaten: {url}"))?;
    let freigaben = netz_freigaben().lock().map_err(|e| e.to_string())?;
    if freigaben.contains(&host) {
        Ok(())
    } else {
        Err(format!("Host nicht freigegeben: {host}"))
    }
}

/// gültiger DNS-Name (für Freigaben aus dem Regelpaket)
fn netz_hostname_gueltig(h: &str) -> bool {
    !h.is_empty()
        && h.len() <= 253
        && h.contains('.')
        && h.split('.').all(|t| !t.is_empty() && t.len() <= 63 && t.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') && !t.starts_with('-') && !t.ends_with('-'))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NetzAntwort {
    status: u16,
    url: String,
    etag: Option<String>,
    geaendert: Option<String>,
    typ: Option<String>,
    /// Inhalt als Base64
    daten: String,
}

fn netz_agent(zeit_ms: u64) -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_millis(zeit_ms.clamp(1000, 300_000)))
        // Umleitungen selbst verfolgen (jede Station gegen die Freigaben prüfen)
        .redirects(0)
        // Proxy aus der Umgebung (Firmennetze)
        .try_proxy_from_env(true)
        .user_agent(concat!("arch-tools Baurecht/", env!("CARGO_PKG_VERSION"), " (+https://github.com/axelcypher/arch-tools)"))
        .build()
}

fn netz_abrufen(url: String, etag: Option<String>, geaendert: Option<String>, zeit_ms: u64) -> Result<NetzAntwort, String> {
    let agent = netz_agent(zeit_ms);
    let mut adresse = url;
    for _ in 0..8 {
        netz_erlaubt(&adresse)?;
        let mut anfrage = agent.get(&adresse);
        if let Some(e) = &etag {
            anfrage = anfrage.set("If-None-Match", e);
        }
        if let Some(g) = &geaendert {
            anfrage = anfrage.set("If-Modified-Since", g);
        }
        let antwort = match anfrage.call() {
            Ok(a) => a,
            Err(ureq::Error::Status(_, a)) => a,
            Err(e) => return Err(format!("Nicht erreichbar: {adresse} ({e})")),
        };
        let status = antwort.status();
        if (300..400).contains(&status) && status != 304 {
            let ziel = antwort.header("location").ok_or_else(|| format!("Umleitung ohne Ziel: {adresse}"))?;
            adresse = if ziel.starts_with("https://") {
                ziel.to_string()
            } else if ziel.starts_with('/') {
                let host = netz_host(&adresse).unwrap_or_default();
                format!("https://{host}{ziel}")
            } else {
                return Err(format!("Umleitung nicht unterstützt: {ziel}"));
            };
            continue;
        }
        let kopf = |n: &str| antwort.header(n).map(|s| s.to_string());
        let (etag, geaendert, typ) = (kopf("etag"), kopf("last-modified"), kopf("content-type"));
        let mut daten = Vec::new();
        antwort
            .into_reader()
            .take(NETZ_HOECHSTENS + 1)
            .read_to_end(&mut daten)
            .map_err(|e| format!("Lesen fehlgeschlagen: {adresse} ({e})"))?;
        if daten.len() as u64 > NETZ_HOECHSTENS {
            return Err(format!("Antwort zu groß: {adresse}"));
        }
        use base64::Engine;
        return Ok(NetzAntwort {
            status,
            url: adresse,
            etag,
            geaendert,
            typ,
            daten: base64::engine::general_purpose::STANDARD.encode(daten),
        });
    }
    Err("Zu viele Umleitungen".into())
}

/// Abruf einer Adresse (Rechtsquellen, Geodienste, Regelpaket). Bedingte Abfrage über ETag/Last-Modified.
#[tauri::command]
async fn netz_holen(url: String, etag: Option<String>, geaendert: Option<String>, zeit_ms: Option<u64>) -> Result<NetzAntwort, String> {
    let ziel = url.clone();
    tauri::async_runtime::spawn_blocking(move || netz_abrufen(url, etag, geaendert, zeit_ms.unwrap_or(30_000)))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| {
            log::warn!("Abruf fehlgeschlagen: {ziel}: {e}");
            e
        })
}

/// Hosts aus einem gültig signierten Regelpaket freigeben (nur gültige DNS-Namen, nur hinzufügen)
#[tauri::command]
fn netz_hosts_erweitern(hosts: Vec<String>) -> Result<usize, String> {
    let mut freigaben = netz_freigaben().lock().map_err(|e| e.to_string())?;
    let mut neu = 0;
    for h in hosts {
        let h = h.trim().to_ascii_lowercase();
        if netz_hostname_gueltig(&h) && freigaben.insert(h.clone()) {
            log::info!("Host freigegeben (Regelpaket): {h}");
            neu += 1;
        }
    }
    Ok(neu)
}

/// Pfad der Ablage prüfen: nur JSON unter einem Ordner „baurecht“ (Konfigurationsordner)
fn ablage_pfad(pfad: &str) -> Result<std::path::PathBuf, String> {
    let p = std::path::PathBuf::from(pfad);
    let ok_name = p.extension().map(|e| e == "json" || e == "sig").unwrap_or(false);
    let ok_ordner = p.components().any(|c| c.as_os_str() == "baurecht");
    let ok_rein = !p.components().any(|c| matches!(c, std::path::Component::ParentDir));
    if ok_name && ok_ordner && ok_rein && p.is_absolute() {
        Ok(p)
    } else {
        Err(format!("Ablage nicht erlaubt: {pfad}"))
    }
}

/// Datei der Ablage lesen (Text); `None`, wenn es sie nicht gibt
#[tauri::command]
async fn baurecht_ablage_lesen(pfad: String) -> Result<Option<String>, String> {
    let p = ablage_pfad(&pfad)?;
    match std::fs::read_to_string(&p) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("{pfad}: {e}")),
    }
}

/// Datei der Ablage schreiben (Ordner werden angelegt, atomar ersetzt)
#[tauri::command]
async fn baurecht_ablage_schreiben(pfad: String, inhalt: String) -> Result<(), String> {
    let p = ablage_pfad(&pfad)?;
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(eltern) = p.parent() {
            std::fs::create_dir_all(eltern)?;
        }
        write_atomic(&p, inhalt.as_bytes())
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("{pfad}: {e}"))
}

#[cfg(test)]
mod netz_tests {
    use super::*;

    #[test]
    fn hosts_und_pfade() {
        assert_eq!(netz_host("https://recht.nrw.de/lrgv/x").as_deref(), Some("recht.nrw.de"));
        assert!(netz_host("http://recht.nrw.de/").is_none());
        assert!(netz_host("https://user@recht.nrw.de/").is_none());
        assert!(netz_host("https://recht.nrw.de:8443/").is_none());
        assert!(netz_erlaubt("https://www.gesetze-im-internet.de/bbaug/xml.zip").is_ok());
        assert!(netz_erlaubt("https://example.com/").is_err());
        assert!(netz_hostname_gueltig("gis.kreis-unna.de"));
        assert!(!netz_hostname_gueltig("bad host"));
        assert!(!netz_hostname_gueltig("-x.de"));
        #[cfg(unix)]
        {
            assert!(ablage_pfad("/home/a/arch-tools/baurecht/recht/x.json").is_ok());
            assert!(ablage_pfad("/home/a/arch-tools/recht/x.json").is_err());
            assert!(ablage_pfad("/home/a/arch-tools/baurecht/../x.json").is_err());
            assert!(ablage_pfad("baurecht/x.json").is_err());
        }
    }
}
