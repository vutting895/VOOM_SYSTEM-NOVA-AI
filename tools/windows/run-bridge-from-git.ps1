#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

# This small bootstrap is the only source launcher that needs to stay outside Git.
# All application code is pulled from the private repository's main branch.
$RepositoryUrl = 'https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI.git'
$Branch = 'main'
$LocalRoot = Join-Path $env:LOCALAPPDATA 'VOOM_SYSTEM'
$RuntimeRoot = Join-Path $LocalRoot 'runtime'
$Checkout = Join-Path $RuntimeRoot 'repo'
$BridgeRelativePath = 'integrations/mt5-readonly-bridge'
$WindowsToolsRelativePath = 'tools/windows'
$PersistentBootstrap = Join-Path $LocalRoot 'run-bridge-from-git.ps1'
$BridgeRoot = Join-Path $Checkout 'integrations\mt5-readonly-bridge'
$BridgeLauncher = Join-Path $BridgeRoot 'run-bridge.ps1'

function Invoke-Git {
    param(
        [Parameter(Mandatory = $true)]
        [string[]] $Arguments
    )

    & git @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Git command failed (exit $LASTEXITCODE): git $($Arguments -join ' ')"
    }
}

if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    throw 'LOCALAPPDATA is unavailable; run this script in the signed-in Windows user session.'
}
if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) {
    throw 'Git for Windows is required. Install Git and configure private GitHub access with Git Credential Manager; do not put a token in this script.'
}

# Prevent a hidden username/password prompt from leaving a scheduled or unattended start stuck.
$PreviousGitPrompt = $env:GIT_TERMINAL_PROMPT
$env:GIT_TERMINAL_PROMPT = '0'

try {
    New-Item -ItemType Directory -Path $RuntimeRoot -Force | Out-Null

    if (Test-Path -LiteralPath $Checkout) {
        if (-not (Test-Path -LiteralPath (Join-Path $Checkout '.git'))) {
            throw "Runtime path exists but is not a Git checkout; nothing was deleted: $Checkout"
        }

        $RemoteUrl = (& git -C $Checkout remote get-url origin | Select-Object -First 1)
        if ($LASTEXITCODE -ne 0 -or $RemoteUrl.Trim() -ne $RepositoryUrl) {
            throw 'Runtime checkout origin does not match the expected private repository; refusing to update it.'
        }

        $DirtyState = @(& git -C $Checkout status --porcelain --untracked-files=all)
        if ($LASTEXITCODE -ne 0) {
            throw 'Could not inspect runtime checkout state; refusing to update it.'
        }
        if ($DirtyState.Count -gt 0) {
            throw 'Runtime checkout contains local changes. Preserve or inspect them before updating; this launcher will not overwrite them.'
        }

        Invoke-Git @('-C', $Checkout, 'fetch', '--no-tags', 'origin', $Branch)
        Invoke-Git @('-C', $Checkout, 'checkout', '--quiet', '-B', $Branch, "origin/$Branch")
        Invoke-Git @('-C', $Checkout, 'reset', '--hard', "origin/$Branch")
    }
    else {
        # A sparse, shallow clone keeps the Windows runtime limited to the MT5 Bridge source.
        & git clone --depth 1 --filter=blob:none --sparse --branch $Branch $RepositoryUrl $Checkout
        if ($LASTEXITCODE -ne 0) {
            throw 'Could not clone the private repository. Confirm Git Credential Manager has access to it; no credentials were written by this script.'
        }
    }

    Invoke-Git @('-C', $Checkout, 'sparse-checkout', 'init', '--cone')
    Invoke-Git @('-C', $Checkout, 'sparse-checkout', 'set', $BridgeRelativePath, $WindowsToolsRelativePath)

    if (-not (Test-Path -LiteralPath $BridgeLauncher)) {
        throw "The latest Git checkout does not contain $BridgeRelativePath\run-bridge.ps1; refusing to start an older local copy."
    }

    # Once the bootstrap is merged to main, keep the persistent local copy in sync too.
    # This file is the only manually installed launcher; all application code comes from Git.
    $BootstrapSource = Join-Path $Checkout 'tools\windows\run-bridge-from-git.ps1'
    if (Test-Path -LiteralPath $BootstrapSource) {
        $sourceHash = (Get-FileHash -LiteralPath $BootstrapSource -Algorithm SHA256).Hash
        $currentScript = $MyInvocation.MyCommand.Path
        $currentHash = if (Test-Path -LiteralPath $currentScript) { (Get-FileHash -LiteralPath $currentScript -Algorithm SHA256).Hash } else { '' }
        if ($sourceHash -ne $currentHash) {
            $temporaryBootstrap = $PersistentBootstrap + '.new'
            Copy-Item -LiteralPath $BootstrapSource -Destination $temporaryBootstrap -Force
            Move-Item -LiteralPath $temporaryBootstrap -Destination $PersistentBootstrap -Force
            Write-Host 'Bootstrap updated from main; restarting with the Git version.'
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $PersistentBootstrap
            exit $LASTEXITCODE
        }
    }

    # Do not launch a duplicate Bridge while a previous instance is serving on port 8787.
    $ExistingListener = Get-NetTCPConnection -State Listen -LocalPort 8787 -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($ExistingListener) {
        Write-Host "A service is already listening on local port 8787 (PID $($ExistingListener.OwningProcess))."
        Write-Host 'Refusing to start a duplicate Bridge. Stop the existing instance before restarting from Git.'
        exit 0
    }

    $Requirements = Join-Path $BridgeRoot 'requirements.txt'
    $VenvRoot = Join-Path $BridgeRoot '.venv'
    $Python = Join-Path $VenvRoot 'Scripts\python.exe'
    $RequirementsMarker = Join-Path $VenvRoot '.requirements-sha256'

    if (-not (Test-Path -LiteralPath $Python)) {
        if (-not (Get-Command py.exe -ErrorAction SilentlyContinue)) {
            throw 'Python Launcher and Python 3.11 are required to create the Bridge virtual environment.'
        }
        & py.exe -3.11 -m venv $VenvRoot
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $Python)) {
            throw 'Could not create the isolated Python 3.11 environment. Check free disk space and the Python installation.'
        }
    }

    $CurrentRequirementsHash = (Get-FileHash -LiteralPath $Requirements -Algorithm SHA256).Hash
    $InstalledRequirementsHash = ''
    if (Test-Path -LiteralPath $RequirementsMarker) {
        $InstalledRequirementsHash = [System.IO.File]::ReadAllText($RequirementsMarker).Trim()
    }

    if ($CurrentRequirementsHash -ne $InstalledRequirementsHash) {
        & $Python -m pip install --disable-pip-version-check -r $Requirements
        if ($LASTEXITCODE -ne 0) {
            throw 'Bridge dependency installation failed. The Bridge was not started.'
        }
        [System.IO.File]::WriteAllText($RequirementsMarker, $CurrentRequirementsHash, [System.Text.Encoding]::ASCII)
    }

    $Commit = (& git -C $Checkout rev-parse --short HEAD | Select-Object -First 1).Trim()
    Write-Host "VOOM_SYSTEM Bridge source: main@$Commit"
    Write-Host 'Mode: read-only; this launcher does not enable order execution.'
    Write-Host 'Starting the tenant-guarded MT5 Bridge. Stop it with Ctrl+C.'

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $BridgeLauncher
    exit $LASTEXITCODE
}
finally {
    $env:GIT_TERMINAL_PROMPT = $PreviousGitPrompt
}
