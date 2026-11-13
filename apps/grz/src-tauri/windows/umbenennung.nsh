; Umbenennung der App: Bis Version 0.22.0 hiess sie "GRZ-Nachweis". Der Installer leitet Installationsordner,
; Startmenue- und Desktop-Verknuepfung und den Eintrag unter "Apps & Features" vom Produktnamen ab. Eine Installation
; unter dem alten Namen wird deshalb vor der Installation still entfernt - Einstellungen und Daten liegen unter der
; App-Kennung (BUNDLEID) und bleiben erhalten. Hatte die alte Installation eine Verknuepfung im Startmenue oder auf
; dem Desktop, legt der Installer sie unter dem neuen Namen an (bei einem Update taete er das sonst nicht).
; Eingebunden ueber bundle > windows > nsis > installerHooks in tauri.conf.json; Datei bewusst nur ASCII
; (Umlaute als ${U+...}), damit die Codepage beim Kompilieren keine Rolle spielt.

!define ALTER_NAME "GRZ-Nachweis"

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

  ; mit dem NSIS-Installer (je Benutzer) installiert
  ReadRegStr $R9 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${ALTER_NAME}" "UninstallString"
  ${If} $R9 != ""
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
    DetailPrint "Entferne die Installation unter dem alten Namen ${ALTER_NAME} ($R8)"
    ; still (/S), ohne /UPDATE: entfernt auch die alten Verknuepfungen; App-Daten bleiben (Haken "Daten loeschen" aus)
    ExecWait '$R9 /S _?=$R8'
    Delete "$R8\uninstall.exe"
    RMDir "$R8"
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${ALTER_NAME}"
    DeleteRegKey HKCU "Software\${MANUFACTURER}\${ALTER_NAME}"
    DeleteRegKey /ifempty HKCU "Software\${MANUFACTURER}"
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
    ExecWait '$R4 /passive'
    StrCpy $AltStartmenue 1
  umbenennung_msi_fertig:
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $AltStartmenue = 1
  ${AndIfNot} ${FileExists} "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  ${EndIf}
  ${If} $AltDesktop = 1
  ${AndIfNot} ${FileExists} "$DESKTOP\${PRODUCTNAME}.lnk"
    CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    !insertmacro SetLnkAppUserModelId "$DESKTOP\${PRODUCTNAME}.lnk"
  ${EndIf}
!macroend
