$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Watchdog = Join-Path $Root "run_security_watchdog.ps1"
if (-not (Test-Path -LiteralPath $Watchdog)) { throw "Watchdog not found: $Watchdog" }
$TaskName = "VOOM-Security-Dashboard-Watchdog"
$PowerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$Argument = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $Watchdog + '"'
$Action = New-ScheduledTaskAction -Execute $PowerShell -Argument $Argument
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Keeps the local-only VOOM Security Dashboard backend healthy; does not expose it to LAN or Internet." -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Host "Installed and started $TaskName for the current Windows user." -ForegroundColor Green
Write-Host "Runs at user logon and checks the local health endpoint every 20 seconds."
Write-Host "It does not make the dashboard public or connect customer accounts by itself."
