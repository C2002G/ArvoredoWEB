@echo off
SET "SCRIPT_DIR=%~dp0"
CD /D "%SCRIPT_DIR%"

ECHO Iniciando Arvoredo PDV...

REM Iniciar o script PowerShell em uma nova janela (invisivel)
powershell -ExecutionPolicy Bypass -File ".\deployment\iniciar.ps1" -WindowStyle Hidden

ECHO Arvoredo PDV iniciado em segundo plano.
ECHO Voce pode fechar esta janela.
exit
