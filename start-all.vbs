Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strPath = fso.GetParentFolderName(WScript.ScriptFullName)

' 1. 启动服务端
WshShell.Run "cmd /k cd /d """ & strPath & "\server"" && node index.js", 1, False

' 2. 等待 2 秒
WScript.Sleep 2000

' 3. 启动 Windows 客服桌面工作台
WshShell.Run "cmd /c cd /d """ & strPath & """ && start-windows-client.bat", 0, False

' 4. 打开访客测试页
WshShell.Run "http://127.0.0.1:8080/demo.html", 1, False
