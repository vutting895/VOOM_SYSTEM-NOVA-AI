$ErrorActionPreference = "SilentlyContinue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Server = Join-Path $Root "server.py"
$Port = if ($env:VOOM_SECURITY_DASHBOARD_PORT) { [int]$env:VOOM_SECURITY_DASHBOARD_PORT } else { 8765 }
$LogDir = Join-Path $Root "logs"
$Log = Join-Path $LogDir "watchdog.log"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
function Write-Log([string]$Message) {
    $line = "$(Get-Date -Format o) $Message"
    Add-Content -LiteralPath $Log -Value $line -Encoding UTF8
    if ((Get-Item -LiteralPath $Log).Length -gt 2MB) {
        Move-Item -LiteralPath $Log -Destination ($Log + ".1") -Force
    }
}
while ($true) {
    $healthy = $false
    try {
        $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 3
        $healthy = ($r.ok -eq $true -and $r.service -eq "voom-security-dashboard")
    } catch { $healthy = $false }
    if (-not $healthy) {
        try {
            $python = (Get-Command python.exe -ErrorAction Stop).Source
            if (-not (Test-Path -LiteralPath $Server)) { throw "server.py missing" }
            Start-Process -FilePath $python -ArgumentList @('"' + $Server + '"') -WorkingDirectory $Root -WindowStyle Hidden
            Write-Log "Backend start requested; health check failed."
        } catch {
            Write-Log ("ERROR: " + $_.Exception.Message)
        }
        Start-Sleep -Seconds 8
    }
    Start-Sleep -Seconds 20
}
