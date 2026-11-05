param(
    [switch] $ConfirmSingleTenantRoute
)

$ErrorActionPreference = 'Stop'

if (-not $ConfirmSingleTenantRoute) {
    throw 'This operation replaces the relay Worker tenant map. Verify there is exactly one tenant to provision, then rerun with -ConfirmSingleTenantRoute.'
}
if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    throw 'LOCALAPPDATA is unavailable; run this from the intended Windows user session.'
}

$secretRoot = Join-Path $env:LOCALAPPDATA 'VOOM_SYSTEM\secrets'
$tenantPath = Join-Path $secretRoot 'mt5-tenant-id.txt'
if (-not (Test-Path -LiteralPath $tenantPath)) {
    throw 'Private tenant ID file is missing.'
}
$tenantId = [System.IO.File]::ReadAllText($tenantPath).Trim()
if ($tenantId -notmatch '^[A-Za-z0-9_-]{8,100}$') {
    throw 'Private tenant ID is invalid.'
}

$tokenPath = Join-Path $secretRoot ('mt5-bridge-' + $tenantId + '.token')
if (-not (Test-Path -LiteralPath $tokenPath)) {
    throw 'Private tenant-specific bridge token file is missing.'
}
$token = [System.IO.File]::ReadAllText($tokenPath).Trim()
if ($token.Length -lt 32) {
    throw 'Private tenant-specific bridge token is invalid.'
}

# Build the map in memory. Never write the JSON to disk, stdout, stderr, or logs.
$routeMap = @{
    $tenantId = @{
        tenantId = $tenantId
        token = $token
    }
} | ConvertTo-Json -Depth 5 -Compress

# This helper replaces each target Worker’s full tenant map. The explicit confirmation
# flag is mandatory because this utility is intended only for a verified single-tenant setup.
$workerNames = @('voom-mt5-bridge-relay', 'voom-mt5-readonly-proxy')

# Prefer the already-installed Wrangler CLI on disk-constrained Windows hosts.
# Fall back to npx only when no global wrapper is available.
$globalWrangler = Get-Command wrangler.cmd -ErrorAction SilentlyContinue
$wranglerCommand = if ($globalWrangler) {
    'wrangler'
}
else {
    'npx wrangler'
}

foreach ($workerName in $workerNames) {
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $env:ComSpec
    $startInfo.Arguments = '/d /s /c "' + $wranglerCommand + ' secret put MT5_TENANT_ROUTES --name ' + $workerName + '"'
    $startInfo.WorkingDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.CreateNoWindow = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    if (-not $process.Start()) {
        throw "Could not start Wrangler for Worker $workerName. Route contents were not printed."
    }

    # Drain output asynchronously so Wrangler cannot block on a full pipe. Do not print either stream.
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $process.StandardInput.WriteLine($routeMap)
    $process.StandardInput.Close()

    if (-not $process.WaitForExit(90000)) {
        try { $process.Kill() } catch {}
        throw "Wrangler timed out while provisioning Worker $workerName. Route contents were not printed."
    }

    $null = $stdoutTask.GetAwaiter().GetResult()
    $null = $stderrTask.GetAwaiter().GetResult()

    if ($process.ExitCode -ne 0) {
        throw "Wrangler failed for Worker $workerName with exit code $($process.ExitCode). Route data was not printed."
    }
}

$routeMap = $null
$token = $null
$tenantId = $null
Write-Host 'Tenant route secret submitted to the relay and proxy Workers. Secret values were not displayed.'
