# Guia de Backup Excel

## Comando manual
Na raiz do projeto:
```powershell
powershell -ExecutionPolicy Bypass -File .\deployment\backup-excel.ps1 -OpenAfter
```

## Parametros uteis
- `-PgPassword "SUA_SENHA"`: informa senha sem prompt
- `-Data "2026-04-14"`: gera backup de uma data especifica
- `-OutputDir "C:\Arvoredo\Backups"`: pasta de destino
- `-OpenAfter`: abre o arquivo ao final

Exemplo:
```powershell
powershell -ExecutionPolicy Bypass -File .\deployment\backup-excel.ps1 -PgPassword "1234" -Data "2026-04-14" -OutputDir "C:\Arvoredo\Backups" -OpenAfter
```

## Agendar diario
No Agendador de Tarefas do Windows:
- Programa: `powershell.exe`
- Argumentos:
```text
-ExecutionPolicy Bypass -File "C:\Arvoredo\deployment\backup-diario.ps1"
```

O script diario:
- evita duplicar backup no mesmo dia
- guarda arquivos em `C:\Arvoredo\Backups`
- remove backups com mais de 30 dias
