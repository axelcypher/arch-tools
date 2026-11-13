#!/usr/bin/env bash
# Kompiliert die Installer-Hooks (apps/*/src-tauri/windows/*.nsh) mit makensis, Warnungen gelten als Fehler.
# Die Makros aus Tauris utils.nsh (CheckIfAppIsRunning, SetLnkAppUserModelId) und die Variable $NoShortcutMode
# aus dem Installer-Template sind hier nachgebildet - geprueft werden Syntax, Labels und Verzweigungen der Hooks.
# Aufruf: bash scripts/nsis-hooks-pruefen.sh   (braucht makensis, z. B. apt-get install nsis)
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/stubs.nsh" <<'NSH'
!macro CheckIfAppIsRunning executablePath productName
  DetailPrint "pruefe ${executablePath} (${productName})"
!macroend
!macro SetLnkAppUserModelId shortcut
  DetailPrint "AppUserModelId ${shortcut}"
!macroend
NSH
anzahl=0
for hook in apps/*/src-tauri/windows/*.nsh; do
  cat > "$tmp/t.nsi" <<NSI
Unicode true
!include LogicLib.nsh
!include FileFunc.nsh
!include StrFunc.nsh
\${StrCase}
\${StrLoc}
!include "$tmp/stubs.nsh"
!include "$PWD/$hook"
!define MANUFACTURER "pendzialek"
!define PRODUCTNAME "NEU"
!define MAINBINARYNAME "neu"
Var NoShortcutMode
Function .onInit
  StrCpy \$NoShortcutMode 0
FunctionEnd
OutFile "$tmp/t.exe"
RequestExecutionLevel user
Section Install
  !insertmacro NSIS_HOOK_PREINSTALL
  !insertmacro NSIS_HOOK_POSTINSTALL
SectionEnd
NSI
  if ! makensis -V2 -WX "$tmp/t.nsi" >"$tmp/log" 2>&1; then
    echo "Fehler in $hook:"
    cat "$tmp/log"
    exit 1
  fi
  echo "ok: $hook"
  anzahl=$((anzahl + 1))
done
[ "$anzahl" -gt 0 ] || { echo "keine Hooks gefunden"; exit 1; }
