; Umbenennung der App: Bis Version 0.17.0 hiess sie "Projektordner". Der Installer leitet Installationsordner,
; Startmenue- und Desktop-Verknuepfung und den Eintrag unter "Apps & Features" vom Produktnamen ab. Eine Installation
; unter dem alten Namen wird deshalb vor der Installation entfernt - Einstellungen und Daten liegen unter der
; App-Kennung (BUNDLEID) und bleiben erhalten. Hatte die alte Installation eine Verknuepfung im Startmenue oder auf
; dem Desktop, legt der Installer sie unter dem neuen Namen an (bei einem Update taete er das sonst nicht).
; Entfernt wird nur, was sicher von uns stammt (gleicher Herausgeber, gleiche Programmdatei); aufgeraeumt wird nur,
; wenn die alte Deinstallation geklappt hat - sonst bleibt alles, wie es ist, und das naechste Update versucht es neu.
; Eingebunden ueber bundle > windows > nsis > installerHooks in tauri.conf.json; Datei bewusst nur ASCII
; (Umlaute als ${U+...}), damit die Codepage beim Kompilieren keine Rolle spielt. Gepruefte Kompilierung:
; scripts/nsis-hooks-pruefen.sh (CI).

!define ALTER_NAME "Projektordner"
!define ALTER_UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${ALTER_NAME}"

Var AltStartmenue
Var AltDesktop

!macro NSIS_HOOK_PREINSTALL
  StrCpy $AltStartmenue 0
  StrCpy $AltDesktop 0
  ${If} ${FileExists} "$SMPROGRAMS\${ALTER_NAME}.lnk"
    StrCpy $AltStartmenue 1
  ${EndIf}
  ${If} ${FileExists} "$DESKTOP\${ALTER_NAME}.lnk"
    StrCpy $AltDesktop 1
  ${EndIf}

  ; mit dem NSIS-Installer (je Benutzer) installiert - nur unsere: gleicher Herausgeber und, falls eingetragen,
  ; gleiche Programmdatei (die Programmdatei behaelt bei der Umbenennung ihren Namen)
  ReadRegStr $R9 HKCU "${ALTER_UNINSTKEY}" "UninstallString"
  ReadRegStr $R7 HKCU "${ALTER_UNINSTKEY}" "Publisher"
  ReadRegStr $R6 HKCU "${ALTER_UNINSTKEY}" "MainBinaryName"
  StrCpy $R5 0
  ${If} $R9 != ""
  ${AndIf} $R7 == "${MANUFACTURER}"
    ${If} $R6 == ""
    ${OrIf} $R6 == "${MAINBINARYNAME}.exe"
      StrCpy $R5 1
    ${EndIf}
  ${EndIf}
  ${If} $R5 = 1
    ; Ordner der alten Installation: wie ihn der Installer gespeichert hat, sonst der des Deinstallers
    ReadRegStr $R8 HKCU "Software\${MANUFACTURER}\${ALTER_NAME}" ""
    ${If} $R8 == ""
      StrCpy $R7 $R9 1
      ${If} $R7 == '"'
        StrCpy $R8 $R9 "" 1
        StrCpy $R8 $R8 -1
      ${Else}
        StrCpy $R8 $R9
      ${EndIf}
      ${GetParent} $R8 $R8
    ${EndIf}
    ; laeuft die alte App noch: wie der Installer selbst nachfragen (im Passiv-/Silent-Modus beenden)
    !insertmacro CheckIfAppIsRunning "$R8\${MAINBINARYNAME}.exe" "${ALTER_NAME}"
    DetailPrint "Entferne die Installation unter dem alten Namen ${ALTER_NAME} ($R8)"
    ; still (/S), ohne /UPDATE: entfernt auch die alten Verknuepfungen; App-Daten bleiben (Haken "Daten loeschen" aus)
    ClearErrors
    ExecWait '$R9 /S _?=$R8' $R5
    ${If} ${Errors}
      StrCpy $R5 2
    ${EndIf}
    ${If} $R5 = 0
    ${AndIfNot} ${FileExists} "$R8\${MAINBINARYNAME}.exe"
      Delete "$R8\uninstall.exe"
      RMDir "$R8"
      DeleteRegKey HKCU "${ALTER_UNINSTKEY}"
      DeleteRegKey HKCU "Software\${MANUFACTURER}\${ALTER_NAME}"
      DeleteRegKey /ifempty HKCU "Software\${MANUFACTURER}"
    ${Else}
      ; alte Installation bleibt vollstaendig, also auch ihre Verknuepfungen - keine zweiten anlegen
      DetailPrint "Die Installation unter dem alten Namen ${ALTER_NAME} liess sich nicht entfernen (Code $R5) - sie bleibt."
      StrCpy $AltStartmenue 0
      StrCpy $AltDesktop 0
    ${EndIf}
  ${EndIf}

  ; mit dem MSI-Paket (fuer alle Benutzer) installiert: Eintrag mit altem Namen und gleichem Herausgeber
  StrCpy $R6 0
  umbenennung_msi_schleife:
    EnumRegKey $R5 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall" $R6
    StrCmp $R5 "" umbenennung_msi_fertig
    IntOp $R6 $R6 + 1
    ReadRegStr $R4 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$R5" "DisplayName"
    ReadRegStr $R3 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$R5" "Publisher"
    StrCmp "$R4|$R3" "${ALTER_NAME}|${MANUFACTURER}" 0 umbenennung_msi_schleife
    ReadRegStr $R4 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$R5" "UninstallString"
    ${StrCase} $R3 $R4 "L"
    ${StrLoc} $R2 $R3 "msiexec" ">"
    StrCmp $R2 "" umbenennung_msi_schleife
    DetailPrint "Entferne das MSI-Paket unter dem alten Namen ${ALTER_NAME}"
    ClearErrors
    ExecWait '$R4 /passive' $R2
    ${If} ${Errors}
      StrCpy $R2 2
    ${EndIf}
    ; 0 = entfernt, 3010 = entfernt, Neustart noetig; sonst (z. B. 1602 Abbruch, 1625 Richtlinie) bleibt es
    ${If} $R2 = 0
    ${OrIf} $R2 = 3010
      StrCpy $AltStartmenue 1
    ${Else}
      DetailPrint "Das MSI-Paket ${ALTER_NAME} wurde nicht entfernt (Code $R2) - es bleibt."
    ${EndIf}
  umbenennung_msi_fertig:
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $AltStartmenue = 1
  ${AndIf} $NoShortcutMode <> 1
  ${AndIfNot} ${FileExists} "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  ${EndIf}
  ${If} $AltDesktop = 1
  ${AndIf} $NoShortcutMode <> 1
  ${AndIfNot} ${FileExists} "$DESKTOP\${PRODUCTNAME}.lnk"
    CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    !insertmacro SetLnkAppUserModelId "$DESKTOP\${PRODUCTNAME}.lnk"
  ${EndIf}
!macroend
