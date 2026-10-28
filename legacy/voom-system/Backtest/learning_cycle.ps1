# Repeatable offline learning cycle for the VOOM hybrid-history comparator.
# Research-only. This does not connect to MT5 or place orders.
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot
$Source = Join-Path $ProjectRoot 'Backtest\data\XAUUSDc_M15_20211023_20261023_hybrid.csv'
$Input = Join-Path $ProjectRoot 'Backtest\data\XAUUSD_M15_hybrid_learning_input.csv'
$Lab = Join-Path $ProjectRoot 'Research\aiเทรด\lab.py'
if (!(Test-Path $Source)) { throw "Missing hybrid source CSV: $Source" }
if (!(Test-Path $Lab)) { throw "Missing VOOM research lab: $Lab" }
Import-Csv $Source | Select-Object @{Name='timestamp';Expression={$_.time}},open,high,low,close | Export-Csv -Path $Input -NoTypeInformation -Encoding utf8
Write-Host 'Prepared close-price comparator input. Source labels are not included in this reduced comparator.'
py -3 $Lab train --csv $Input --train-fraction 0.7 --cost-bps 2 --min-test-trades 100 --max-drawdown-pct 25
if ($LASTEXITCODE -ne 0) { throw "Offline parameter search failed with exit code $LASTEXITCODE" }
Write-Host 'Completed. Review the newest Research\aiเทรด\reports\training_report_*.json. Failed candidates must remain research-only.'
