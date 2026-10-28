param(
    [string]$Symbol = 'XAUUSDc',
    [string]$Timeframe = 'M15',
    [double]$Years = 3,
    [double]$InitialCash = 10000,
    [double]$RiskPct = 0.005,
    [double]$CommissionPerLotSide = 0,
    [double]$SlippagePoints = 2,
    [string]$Terminal = 'C:\Program Files\HFM Metatrader 5\terminal64.exe'
)
$ErrorActionPreference = 'Stop'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Here
Write-Host 'VOOM MT5 Historical Import + Research Backtest (READ-ONLY)' -ForegroundColor Cyan
Write-Host "Symbol=$Symbol Timeframe=$Timeframe Years=$Years RiskPct=$RiskPct"

python .\import_mt5_history.py --symbol $Symbol --timeframe $Timeframe --years $Years --terminal "$Terminal"
if ($LASTEXITCODE -ne 0) { throw 'MT5 history import failed; backtest not started.' }

$dataDir = Join-Path $Here 'data'
$pattern = $Symbol + '_' + $Timeframe + '_*.csv'
$csv = Get-ChildItem -Path (Join-Path $dataDir $pattern) -File |
    Where-Object { $_.Name -notlike '*.meta.json' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
if (-not $csv) { throw 'Importer completed but output CSV was not found.' }

$meta = [System.IO.Path]::ChangeExtension($csv.FullName, '.meta.json')
if (-not (Test-Path $meta)) { throw "Matching metadata file is missing: $meta" }

python .\mt5_strategy_backtest.py --csv "$($csv.FullName)" --meta "$meta" --output-dir .\results --cash $InitialCash --risk-pct $RiskPct --commission-per-lot-side $CommissionPerLotSide --slippage-points $SlippagePoints
if ($LASTEXITCODE -ne 0) { throw 'Backtest failed.' }

$report = Join-Path (Join-Path $Here 'results') ($csv.BaseName + '_report.json')
python .\publish_backtest_to_learning.py --report "$report" --csv "$($csv.FullName)"
if ($LASTEXITCODE -ne 0) { throw 'Research summary publish failed; the backtest itself remains in results.' }

Write-Host 'Completed. Review JSON/trades under Backtest\results and the research note under Research\aiเทรด\backtests.' -ForegroundColor Green
Write-Host 'No MT5 orders were sent. This script does not modify EA, Live Trading, or Risk Guard settings.'
