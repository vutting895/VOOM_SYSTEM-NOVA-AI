$ErrorActionPreference = "Continue"
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"
$root = "C:\Users\Administrator\Documents\Voom_system"
$bridge = "C:\Program Files\AI_Bridge"
$logDir = Join-Path $root "Logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$log = Join-Path $logDir ("safe_test_run_" + $stamp + ".log")
"VOOM_SYSTEM SAFE TEST RUN $stamp" | Tee-Object -FilePath $log
"MODE=READ_ONLY_PAPER_ONLY; LIVE_TRADING=DISABLED" | Tee-Object -FilePath $log -Append

Push-Location $root
"=== CENTRAL SYSTEM CHECKS ===" | Tee-Object -FilePath $log -Append
python .\Python\run_system_checks.py 2>&1 | Tee-Object -FilePath $log -Append
$centralExit = $LASTEXITCODE

"=== RISK GUARD UNIT TESTS ===" | Tee-Object -FilePath $log -Append
python -m unittest Python.test_risk_guard_optimizer -v 2>&1 | Tee-Object -FilePath $log -Append
$riskExit = $LASTEXITCODE
Pop-Location

Push-Location $bridge
"=== MT5 BRIDGE READ-ONLY COMPONENT SMOKE TESTS ===" | Tee-Object -FilePath $log -Append
python .\test_bridge_components_readonly.py 2>&1 | Tee-Object -FilePath $log -Append
$bridgeExit = $LASTEXITCODE

"=== SAFETY REGRESSION TESTS ===" | Tee-Object -FilePath $log -Append
python .\research_backtesting\test_safety_regression.py 2>&1 | Tee-Object -FilePath $log -Append
$safetyExit = $LASTEXITCODE
Pop-Location

"=== SUMMARY ===" | Tee-Object -FilePath $log -Append
"central_checks_exit=$centralExit" | Tee-Object -FilePath $log -Append
"risk_unit_tests_exit=$riskExit" | Tee-Object -FilePath $log -Append
"bridge_smoke_tests_exit=$bridgeExit" | Tee-Object -FilePath $log -Append
"safety_regression_exit=$safetyExit" | Tee-Object -FilePath $log -Append
"LOG=$log" | Tee-Object -FilePath $log -Append
if ($riskExit -ne 0 -or $bridgeExit -ne 0 -or $safetyExit -ne 0) { exit 1 }
if ($centralExit -eq 2) { exit 2 }
if ($centralExit -ne 0) { exit 1 }
exit 0
