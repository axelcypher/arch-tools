// Rahmen-App: Zugang einer App im Tab (iframe) zu den Befehlen der Desktop-App. Unter Windows (WebView2) richtet Tauri
// ihn auch im iframe selbst ein; Befehle gehen dann über das IPC-Protokoll (http://ipc.localhost) – die CSP muss es in
// connect-src erlauben, denn der Ausweichweg (postMessage, Antwort per eval) funktioniert nur im Hauptdokument, nie in
// einem Tab. Webansichten, die ihn im iframe nicht einrichten (macOS, Linux), übernehmen hier den des Rahmens (gleicher
// Ursprung). Läuft vor den Skripten der App.
(function () {
  try {
    var p = window.parent;
    if (p && p !== window && !('__TAURI_INTERNALS__' in window) && p.__TAURI_INTERNALS__) {
      window.__TAURI_INTERNALS__ = p.__TAURI_INTERNALS__;
      if (p.__TAURI_EVENT_PLUGIN_INTERNALS__) window.__TAURI_EVENT_PLUGIN_INTERNALS__ = p.__TAURI_EVENT_PLUGIN_INTERNALS__;
    }
  } catch (e) {
    // fremder Rahmen: als Web-Version weiter
  }
})();
