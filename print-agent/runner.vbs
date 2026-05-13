' Cardapio Print Agent — runner oculto
' Roda 'node index.js' sem janela, redirecionando stdout/stderr pra agent.log
' Usado pela Tarefa Agendada (install-service.bat).
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir
WshShell.Run "cmd /c node index.js >> agent.log 2>&1", 0, False
