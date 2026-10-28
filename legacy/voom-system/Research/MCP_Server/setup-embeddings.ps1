$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
$Python = Join-Path $Root ".venv\Scripts\python.exe"
if (-not (Test-Path $Python)) { throw "Run .\setup.ps1 first to create the virtual environment." }
& $Python -m pip install -r requirements-embeddings.txt
if ($LASTEXITCODE -ne 0) { throw "Embedding dependency installation failed." }
Write-Host "Embedding engine packages installed. The multilingual model downloads on first indexing/search."
Write-Host "If ONNX Runtime reports a missing DLL (for example vcruntime140_1.dll), install the Microsoft Visual C++ 2015-2022 x64 Redistributable, then retry."
Write-Host "Build index with: .\.venv\Scripts\python.exe -c ""import sys; sys.path.insert(0,'.'); import semantic_search; print(semantic_search.rebuild_index())"""
