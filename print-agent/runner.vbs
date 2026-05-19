' Cardapio Print Agent - runner oculto (v1.8)
'
' Roda o agente sem janela visivel, redirecionando stdout/stderr pra agent.log.
' Le caminho do node de node-path.txt (gerado pelo install-service.bat).
' Se nao existir, faz fallback pra "node" no PATH.
'
' ANTI-DUPLICACAO via lock file:
'   - Le agent.lock pra pegar PID do agente existente
'   - Se o PID ainda esta rodando (tasklist /FI), sai sem fazer nada
'   - Se nao existe lock OU PID morto, lanca novo agente
'
' Quando o agente cai/eh morto, ele apaga agent.lock no exit handler.
' Watchdog (a cada 5min) detecta isso e relanca.

Set WshShell = CreateObject("WScript.Shell")
Set fso      = CreateObject("Scripting.FileSystemObject")
scriptDir    = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir

' ── Le caminho do node ──────────────────────────────────────
nodePath = "node"
nodePathFile = scriptDir & "\node-path.txt"
If fso.FileExists(nodePathFile) Then
    Set f = fso.OpenTextFile(nodePathFile, 1)
    nodePath = Trim(f.ReadAll())
    f.Close
End If

' ── Anti-duplicacao via lock file ───────────────────────────
lockFile = scriptDir & "\agent.lock"
If fso.FileExists(lockFile) Then
    On Error Resume Next
    Set f = fso.OpenTextFile(lockFile, 1)
    pidStr = Trim(f.ReadAll())
    f.Close
    On Error Goto 0

    If Len(pidStr) > 0 Then
        ' Checa se PID ainda esta rodando
        Set exec = WshShell.Exec("tasklist /FI ""PID eq " & pidStr & """ /FO CSV /NH")
        out = exec.StdOut.ReadAll()
        If InStr(LCase(out), "node.exe") > 0 Then
            ' Agente ainda rodando — sai sem fazer nada
            WScript.Quit 0
        End If
    End If

    ' PID morto, remove lock obsoleto
    On Error Resume Next
    fso.DeleteFile lockFile
    On Error Goto 0
End If

' ── Lanca o agente em background ────────────────────────────
' cmd /c title CardapioPrintAgent && node index.js >> agent.log 2>&1
cmdLine = "cmd /c title CardapioPrintAgent && """ & nodePath & """ """ & scriptDir & "\index.js"" >> agent.log 2>&1"
WshShell.Run cmdLine, 0, False
