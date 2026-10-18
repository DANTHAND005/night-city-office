# Starts the Night City Office dashboard on 127.0.0.1:8080. Tasks need the LiteLLM proxy (start_proxy.ps1) running.
Set-Location $PSScriptRoot
$env:PYTHONIOENCODING = 'utf-8'
& (Join-Path $PSScriptRoot '.venv\Scripts\python.exe') -m uvicorn dashboard.app:app --host 127.0.0.1 --port 8080 --no-access-log --no-server-header
