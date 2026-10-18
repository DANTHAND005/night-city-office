# Starts the LiteLLM proxy on 127.0.0.1:4000 using the master key from C:\agents\.env
$envFile = Join-Path $PSScriptRoot '.env'
if (-not (Test-Path $envFile)) { Write-Error "Missing $envFile"; exit 1 }
Get-Content $envFile | Where-Object { $_ -match '^\s*([^#=]+?)\s*=\s*(.*)$' } | ForEach-Object {
    Set-Item -Path "env:$($Matches[1])" -Value $Matches[2]
}
$env:PYTHONIOENCODING = 'utf-8'
& (Join-Path $PSScriptRoot '.venv\Scripts\litellm.exe') --config (Join-Path $PSScriptRoot 'config.yaml') --host 127.0.0.1 --port 4000
