// Netzabruf und Ablage der App Baurecht – per include! in die Tauri-Hülle von Baurecht und in die Rahmen-App
// eingebunden (wie die gemeinsamen Befehle in packages/core/tauri/commands.rs).
//
// Grundsatz: Die Webansicht darf ins Netz nur über `netz_holen`, und nur zu freigegebenen Hosts – einer festen Liste
// (amtliche Rechtsquellen, Geodienste, Ortsrecht der Module, Auslieferung des Regelpakets) und den Hosts, die ein
// gültig signiertes Regelpaket nennt (`netz_hosts_erweitern` prüft die Signatur des Index hier noch einmal mit dem
// einkompilierten öffentlichen Schlüssel). Umleitungen werden einzeln verfolgt und jede Station gegen die Liste
// geprüft. Die Ablage liest und schreibt nur JSON unter <Konfigurationsordner>/baurecht. Die CSP der Webansicht
// bleibt unverändert.

// Keine `use`-Zeilen auf oberster Ebene: Die Datei wird per include! neben andere Befehlsdateien gelegt (Rahmen-App),
// gleichnamige Importe würden dort kollidieren.

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

fn netz_freigaben() -> &'static std::sync::Mutex<std::collections::HashSet<String>> {
    static FREIGABEN: std::sync::OnceLock<std::sync::Mutex<std::collections::HashSet<String>>> = std::sync::OnceLock::new();
    FREIGABEN.get_or_init(|| std::sync::Mutex::new(NETZ_GRUNDLISTE.iter().map(|s| s.to_string()).collect()))
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

/// Ziel einer Umleitung: absolut (nur https) oder ab der Wurzel desselben Hosts; geprüft wird es wie jede Adresse
fn netz_umleitung(adresse: &str, ziel: &str) -> Result<String, String> {
    if ziel.starts_with("https://") {
        Ok(ziel.to_string())
    } else if ziel.starts_with('/') && !ziel.starts_with("//") {
        let host = netz_host(adresse).ok_or_else(|| format!("Umleitung von ungültiger Adresse: {adresse}"))?;
        Ok(format!("https://{host}{ziel}"))
    } else {
        Err(format!("Umleitung nicht unterstützt: {ziel}"))
    }
}

fn netz_abrufen(url: String, etag: Option<String>, geaendert: Option<String>, zeit_ms: u64) -> Result<NetzAntwort, String> {
    use std::io::Read;
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
            adresse = netz_umleitung(&adresse, ziel)?;
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

/// öffentlicher Schlüssel des Regelpakets (Base64, 32 Byte; Zeilen mit # sind Kommentare; leer = nicht eingerichtet)
const REGELN_SCHLUESSEL: &str = include_str!("../../../../packages/baurecht-regeln/schluessel/regeln.pub");

fn regeln_schluessel(text: &str) -> Option<Vec<u8>> {
    use base64::Engine;
    let b64: String = text.lines().filter(|z| !z.trim().is_empty() && !z.trim_start().starts_with('#')).flat_map(|z| z.split_whitespace()).collect();
    if b64.is_empty() {
        return None;
    }
    base64::engine::general_purpose::STANDARD.decode(b64).ok().filter(|k| k.len() == 32)
}

/// Signatur des Index prüfen (Ed25519) und seine Hosts liefern
fn regeln_index_hosts(schluessel: &[u8], index: &str, signatur: &str) -> Result<Vec<String>, String> {
    use base64::Engine;
    let sig = base64::engine::general_purpose::STANDARD
        .decode(signatur.split_whitespace().collect::<String>())
        .map_err(|_| "Signatur nicht lesbar".to_string())?;
    ring::signature::UnparsedPublicKey::new(&ring::signature::ED25519, schluessel)
        .verify(index.as_bytes(), &sig)
        .map_err(|_| "Signatur des Regelpakets ungültig".to_string())?;
    let wert: serde_json::Value = serde_json::from_str(index).map_err(|e| format!("Index nicht lesbar: {e}"))?;
    let hosts = wert.get("hosts").and_then(|h| h.as_array()).ok_or_else(|| "Index ohne Hostliste".to_string())?;
    Ok(hosts.iter().filter_map(|h| h.as_str().map(|s| s.trim().to_ascii_lowercase())).collect())
}

fn netz_hosts_hinzu(hosts: Vec<String>) -> Result<usize, String> {
    let mut freigaben = netz_freigaben().lock().map_err(|e| e.to_string())?;
    let mut neu = 0;
    for h in hosts {
        if netz_hostname_gueltig(&h) && freigaben.insert(h.clone()) {
            log::info!("Host freigegeben (Regelpaket): {h}");
            neu += 1;
        }
    }
    Ok(neu)
}

/// Hosts aus einem gültig signierten Regelpaket freigeben: die Signatur des Index wird hier geprüft (nicht nur in der
/// Webansicht); nur gültige DNS-Namen, nur hinzufügen
#[tauri::command]
fn netz_hosts_erweitern(index: String, signatur: String) -> Result<usize, String> {
    let schluessel = regeln_schluessel(REGELN_SCHLUESSEL).ok_or_else(|| "Kein öffentlicher Schlüssel für das Regelpaket".to_string())?;
    let hosts = regeln_index_hosts(&schluessel, &index, &signatur)?;
    netz_hosts_hinzu(hosts)
}

/// Wurzel der Ablage: <Konfigurationsordner>/baurecht – der Konfigurationsordner wie im Frontend
/// (packages/core/src/platform/konfig.ts): der Ordner aus %APPDATA%\arch-tools\konfig.json oder ohne eigene Wahl
/// dieser lokale Ordner selbst
fn ablage_wurzel(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let basis = tauri::Manager::path(app).config_dir().map_err(|e| e.to_string())?.join("arch-tools");
    let eigen = std::fs::read_to_string(basis.join("konfig.json"))
        .ok()
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
        .and_then(|v| v.get("ordner").and_then(|o| o.as_str()).map(|s| s.trim().to_string()))
        .filter(|s| !s.is_empty());
    Ok(eigen.map(std::path::PathBuf::from).unwrap_or(basis).join("baurecht"))
}

/// Pfad der Ablage prüfen: absolut, nur .json/.sig, unterhalb der Wurzel, ohne „..“ – und der schon vorhandene Teil
/// des Pfads muss auch nach Auflösen von Verknüpfungen unter der (aufgelösten) Wurzel liegen
fn ablage_pfad(wurzel: &std::path::Path, pfad: &str) -> Result<std::path::PathBuf, String> {
    let nein = || format!("Ablage nicht erlaubt: {pfad}");
    let p = std::path::PathBuf::from(pfad);
    let ok_name = p.extension().map(|e| e == "json" || e == "sig").unwrap_or(false);
    let ok_rein = p.components().all(|c| !matches!(c, std::path::Component::ParentDir | std::path::Component::CurDir));
    if !(ok_name && ok_rein && p.is_absolute() && p.starts_with(wurzel) && p != wurzel) {
        return Err(nein());
    }
    if let Ok(w) = std::fs::canonicalize(wurzel) {
        let mut vorhanden = p.as_path();
        while !vorhanden.exists() {
            vorhanden = vorhanden.parent().ok_or_else(nein)?;
        }
        let echt = std::fs::canonicalize(vorhanden).map_err(|e| format!("{pfad}: {e}"))?;
        if !echt.starts_with(&w) {
            return Err(nein());
        }
    }
    Ok(p)
}

/// Datei der Ablage lesen (Text); `None`, wenn es sie nicht gibt
#[tauri::command]
async fn baurecht_ablage_lesen(app: tauri::AppHandle, pfad: String) -> Result<Option<String>, String> {
    let p = ablage_pfad(&ablage_wurzel(&app)?, &pfad)?;
    match std::fs::read_to_string(&p) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("{pfad}: {e}")),
    }
}

/// Datei der Ablage schreiben (Ordner werden angelegt, atomar ersetzt)
#[tauri::command]
async fn baurecht_ablage_schreiben(app: tauri::AppHandle, pfad: String, inhalt: String) -> Result<(), String> {
    let p = ablage_pfad(&ablage_wurzel(&app)?, &pfad)?;
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
    fn hosts() {
        assert_eq!(netz_host("https://recht.nrw.de/lrgv/x").as_deref(), Some("recht.nrw.de"));
        assert!(netz_host("http://recht.nrw.de/").is_none());
        assert!(netz_host("https://user@recht.nrw.de/").is_none());
        assert!(netz_host("https://recht.nrw.de:8443/").is_none());
        assert!(netz_erlaubt("https://www.gesetze-im-internet.de/bbaug/xml.zip").is_ok());
        assert!(netz_erlaubt("https://example.com/").is_err());
        assert!(netz_erlaubt("https://RECHT.NRW.DE/x").is_ok());
        assert!(netz_hostname_gueltig("gis.kreis-unna.de"));
        assert!(!netz_hostname_gueltig("bad host"));
        assert!(!netz_hostname_gueltig("-x.de"));
        assert!(!netz_hostname_gueltig("localhost"));
    }

    #[test]
    fn umleitungen() {
        // relativ: derselbe Host
        assert_eq!(netz_umleitung("https://recht.nrw.de/a?b", "/lrgv/x").unwrap(), "https://recht.nrw.de/lrgv/x");
        // absolut: wird wie jede Adresse geprüft – fremder Host scheitert an der Liste
        let fremd = netz_umleitung("https://recht.nrw.de/a", "https://boese.example/x").unwrap();
        assert!(netz_erlaubt(&fremd).is_err());
        let ok = netz_umleitung("https://github.com/x", "https://objects.githubusercontent.com/y").unwrap();
        assert!(netz_erlaubt(&ok).is_ok());
        // kein Wechsel auf http, keine protokollrelativen oder relativen Ziele
        assert!(netz_umleitung("https://recht.nrw.de/a", "http://recht.nrw.de/b").is_err());
        assert!(netz_umleitung("https://recht.nrw.de/a", "//boese.example/b").is_err());
        assert!(netz_umleitung("https://recht.nrw.de/a/b", "c").is_err());
        assert!(netz_umleitung("https://recht.nrw.de/a", "https://boese.example:444/").map(|u| netz_erlaubt(&u).is_err()).unwrap());
    }

    #[test]
    fn signatur_des_index() {
        use ring::signature::KeyPair;
        let zufall = ring::rand::SystemRandom::new();
        let pkcs8 = ring::signature::Ed25519KeyPair::generate_pkcs8(&zufall).unwrap();
        let paar = ring::signature::Ed25519KeyPair::from_pkcs8(pkcs8.as_ref()).unwrap();
        let schluessel = paar.public_key().as_ref().to_vec();
        let index = r#"{"paket":"2026.11.13-1","format":1,"dateien":{},"hosts":["gis.kreis-unna.de","Bad Host"]}"#;
        use base64::Engine;
        let sig = base64::engine::general_purpose::STANDARD.encode(paar.sign(index.as_bytes()).as_ref());
        assert_eq!(regeln_index_hosts(&schluessel, index, &sig).unwrap(), vec!["gis.kreis-unna.de", "bad host"]);
        // geänderter Index, fremder Schlüssel, kaputte Signatur
        assert!(regeln_index_hosts(&schluessel, &index.replace("unna", "boese"), &sig).is_err());
        let anderes = ring::signature::Ed25519KeyPair::from_pkcs8(ring::signature::Ed25519KeyPair::generate_pkcs8(&zufall).unwrap().as_ref()).unwrap();
        assert!(regeln_index_hosts(anderes.public_key().as_ref(), index, &sig).is_err());
        assert!(regeln_index_hosts(&schluessel, index, "kein base64!").is_err());
        // Schlüsseldatei: Kommentare, leer
        let b64 = base64::engine::general_purpose::STANDARD.encode(&schluessel);
        assert_eq!(regeln_schluessel(&format!("# Kommentar\n{b64}\n")), Some(schluessel));
        assert_eq!(regeln_schluessel("# noch nicht eingerichtet\n"), None);
        assert_eq!(regeln_schluessel("AAAA"), None);
    }

    #[test]
    fn ablage_nur_unter_der_wurzel() {
        let tmp = std::env::temp_dir().join(format!("baurecht-ablage-{}", std::process::id()));
        let wurzel = tmp.join("konfig").join("baurecht");
        std::fs::create_dir_all(wurzel.join("recht")).unwrap();
        let s = |p: &std::path::Path| p.to_string_lossy().into_owned();
        assert!(ablage_pfad(&wurzel, &s(&wurzel.join("recht").join("x.json"))).is_ok());
        assert!(ablage_pfad(&wurzel, &s(&wurzel.join("neu").join("tief").join("x.sig"))).is_ok());
        // anderer Ordner „baurecht“ außerhalb der Wurzel, falsche Endung, „..“, relativ, die Wurzel selbst
        assert!(ablage_pfad(&wurzel, &s(&tmp.join("anders").join("baurecht").join("x.json"))).is_err());
        assert!(ablage_pfad(&wurzel, &s(&wurzel.join("x.exe"))).is_err());
        assert!(ablage_pfad(&wurzel, &s(&wurzel.join("..").join("x.json"))).is_err());
        assert!(ablage_pfad(&wurzel, "baurecht/x.json").is_err());
        assert!(ablage_pfad(&wurzel, &s(&wurzel)).is_err());
        // Verknüpfung in der Ablage, die hinaus zeigt
        #[cfg(unix)]
        {
            let draussen = tmp.join("draussen");
            std::fs::create_dir_all(&draussen).unwrap();
            let _ = std::fs::remove_file(wurzel.join("link"));
            std::os::unix::fs::symlink(&draussen, wurzel.join("link")).unwrap();
            assert!(ablage_pfad(&wurzel, &s(&wurzel.join("link").join("x.json"))).is_err());
        }
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
