' Cardapio Print Agent - runner oculto
'
' Este arquivo eh RE-GERADO automaticamente pelo install-service.bat
' com o caminho ABSOLUTO do node.exe detectado. A versao abaixo eh um
' fallback que tenta achar node no PATH (funciona se rodado pelo user
' interativo, mas pode falhar no contexto SYSTEM/scheduled task).
'
' Pra instalacao correta como servico: SEMPRE rode install-service.bat
' (clique direito - Executar como administrador). Ele regenera este
' arquivo com o caminho absoluto certo + cria 3 tarefas (boot, logon,
' watchdog).
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir

' Anti-duplicacao: se ja tem um agente rodando, nao inicia outro
Set exec = WshShell.Exec("tasklist /V /FI ""IMAGENAME eq node.exe"" /FO CSV")
out = exec.StdOut.ReadAll()
If InStr(out, "CardapioPrintAgent") > 0 Then
  WScript.Quit 0
End If

' Inicia o agente com title pra deteccao no proximo watchdog
WshShell.Run "cmd /c title CardapioPrintAgent & node index.js >> agent.log 2>&1", 0, False
