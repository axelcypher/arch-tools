// Rahmen-App: In einem Tab (iframe) richtet die Webansicht den Zugang zu den Befehlen der Desktop-App nicht
// überall selbst ein – dann den des Rahmens übernehmen (gleicher Ursprung). Läuft vor den Skripten der App.
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
