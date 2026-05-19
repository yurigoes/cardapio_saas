' Cardapio Print Agent - runner oculto
'
' Roda o agente sem janela visivel, redirecionando stdout/stderr pra agent.log.
' Lê caminho do node de node-path.txt (gerado pelo install-service.bat).
' Se nao existir, faz fallback pra "node" no PATH.
'
' Anti-duplicacao: se ja tem agente rodando (detecta pelo titulo da janela),
' nao inicia outro. Permite que o watchdog rode a cada 5min sem duplicar.

Set WshShell = CreateObject("WScript.Shell")
Set fso      = CreateObject("Scripting.FileSystemObject")
scriptDir    = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir

' Lê caminho do node
nodePath = "node"
nodePathFile = scriptDir & "\node-path.txt"
If fso.FileExists(nodePathFile) Then
    Set f = fso.OpenTextFile(nodePathFile, 1)
    nodePath = Trim(f.ReadAll())
    f.Close
End If

' Anti-duplicacao: se ja tem janela com titulo CardapioPrintAgent, sai
On Error Resume Next
Set exec = WshShell.Exec("tasklist /V /FI ""IMAGENAME eq cmd.exe"" /FO CSV /NH")
If Err.Number = 0 Then
    out = exec.StdOut.ReadAll()
    If InStr(out, "CardapioPrintAgent") > 0 Then
        WScript.Quit 0
    End If
End If
On Error Goto 0

' Comando final
cmdLine = "cmd /c title CardapioPrintAgent && """ & nodePath & """ """ & scriptDir & "\index.js"" >> agent.log 2>&1"

' Executa em segundo plano (janela 0=hidden, wait False)
WshShell.Run cmdLine, 0, False
