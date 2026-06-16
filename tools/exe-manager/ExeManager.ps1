[CmdletBinding()]
param(
    [ValidateSet('menu', 'build', 'launch-manager', 'launch-child', 'open-output', 'clean', 'status', 'install-prereqs')]
    [string]$Action = 'menu',
    [string]$Label = 'default',
    [switch]$DebugBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string]$Message)
    Write-Host "[exe-manager] $Message" -ForegroundColor Cyan
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[exe-manager] $Message" -ForegroundColor Yellow
}

function Get-RepoRoot {
    $scriptPath = if ($PSCommandPath) { $PSCommandPath } else { $MyInvocation.MyCommand.Definition }
    $scriptDir = Split-Path -Parent $scriptPath
    return (Convert-Path (Join-Path $scriptDir '..\\..'))
}

function Resolve-BunCommand {
    if (Get-Command bun -ErrorAction SilentlyContinue) {
        return 'bun'
    }

    throw "Bun is not installed or not on PATH. Install Bun from https://bun.sh"
}

function Add-ToProcessPathIfExists {
    param([string]$PathCandidate)

    if ([string]::IsNullOrWhiteSpace($PathCandidate)) {
        return
    }

    if (-not (Test-Path -LiteralPath $PathCandidate)) {
        return
    }

    $currentPath = [System.Environment]::GetEnvironmentVariable('PATH', 'Process')
    $segments = @()
    if (-not [string]::IsNullOrWhiteSpace($currentPath)) {
        $segments = $currentPath.Split(';')
    }

    if ($segments -contains $PathCandidate) {
        return
    }

    $newPath = if ([string]::IsNullOrWhiteSpace($currentPath)) {
        $PathCandidate
    }
    else {
        "$PathCandidate;$currentPath"
    }

    [System.Environment]::SetEnvironmentVariable('PATH', $newPath, 'Process')
    Write-Step "Added to PATH for this run: $PathCandidate"
}

function Ensure-CargoCommand {
    if (Get-Command cargo -ErrorAction SilentlyContinue) {
        return
    }

    # Align with rustup defaults and common user-level installs on Windows.
    Add-ToProcessPathIfExists (Join-Path $env:USERPROFILE '.cargo\bin')
    Add-ToProcessPathIfExists (Join-Path $env:LOCALAPPDATA 'Programs\Rust\bin')

    if (Get-Command cargo -ErrorAction SilentlyContinue) {
        return
    }

    throw "Cargo was not found. Install Rust via rustup (https://rustup.rs), then reopen terminal and run again."
}

function Import-VsDevCmdEnvironment {
    $programFilesX86 = [System.Environment]::GetFolderPath('ProgramFilesX86')
    $vswhereCandidates = @(
        (Join-Path $programFilesX86 'Microsoft Visual Studio\Installer\vswhere.exe'),
        'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
    ) | Select-Object -Unique

    $vswhere = $vswhereCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    $vsDevCmd = $null

    if ($vswhere) {
        $installPath = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($installPath)) {
            $vsDevCmd = Join-Path $installPath 'Common7\Tools\VsDevCmd.bat'
        }
    }

    if (-not $vsDevCmd -or -not (Test-Path -LiteralPath $vsDevCmd)) {
        $fallbackCandidates = @(
            'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat',
            'C:\Program Files\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat'
        )

        $vsDevCmd = $fallbackCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    }

    if (-not $vsDevCmd) {
        return $false
    }

    if (-not (Test-Path -LiteralPath $vsDevCmd)) {
        return $false
    }

    Write-Step "Importing MSVC toolchain environment from: $vsDevCmd"
    $tempCmdPath = Join-Path $env:TEMP ("fg-vsdevcmd-{0}.cmd" -f [guid]::NewGuid().ToString('N'))
    $cmdContent = @(
        '@echo off',
        ('call "{0}" -arch=x64 -host_arch=x64 >nul' -f $vsDevCmd),
        'if errorlevel 1 exit /b %errorlevel%',
        'set'
    )

    Set-Content -LiteralPath $tempCmdPath -Value $cmdContent -Encoding Ascii
    try {
        $setOutput = & cmd.exe /d /s /c "`"$tempCmdPath`""
        if ($LASTEXITCODE -ne 0 -or -not $setOutput) {
            return $false
        }
    }
    finally {
        if (Test-Path -LiteralPath $tempCmdPath) {
            Remove-Item -LiteralPath $tempCmdPath -Force
        }
    }

    foreach ($line in $setOutput) {
        $idx = $line.IndexOf('=')
        if ($idx -lt 1) {
            continue
        }

        $name = $line.Substring(0, $idx)
        $value = $line.Substring($idx + 1)
        [System.Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }

    return $true
}

function Ensure-MsvcLinker {
    if (Get-Command link.exe -ErrorAction SilentlyContinue) {
        return
    }

    $imported = Import-VsDevCmdEnvironment
    if ($imported -and (Get-Command link.exe -ErrorAction SilentlyContinue)) {
        Write-Step 'MSVC linker detected after importing Visual Studio environment.'
        return
    }

    throw @"
MSVC linker (link.exe) was not found.

Install prerequisites with this script:
  bun run exe-manager -- -Action install-prereqs

Or manually install Visual Studio Build Tools with Desktop C++ workload, then reopen terminal.
"@
}

function Install-Prerequisites {
    $programFilesX86 = [System.Environment]::GetFolderPath('ProgramFilesX86')
    $buildToolsPath = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools'
    $setupExe = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\setup.exe'
    $vswhere = Join-Path $programFilesX86 'Microsoft Visual Studio\Installer\vswhere.exe'

    if (Test-Path -LiteralPath $vswhere) {
        $detectedPath = & $vswhere -latest -products Microsoft.VisualStudio.Product.BuildTools -property installationPath 2>$null
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($detectedPath)) {
            $buildToolsPath = $detectedPath
        }
    }

    if (-not (Test-Path -LiteralPath $setupExe)) {
        $winget = Get-Command winget -ErrorAction SilentlyContinue
        if ($winget) {
            Write-Step 'Visual Studio Installer not found. Installing Build Tools bootstrapper via winget...'
            & $winget.Source install --id Microsoft.VisualStudio.2022.BuildTools -e
            if ($LASTEXITCODE -ne 0) {
                throw 'Failed to install Visual Studio Build Tools bootstrapper via winget.'
            }
        }
    }

    if (-not (Test-Path -LiteralPath $setupExe)) {
        throw 'Could not find Visual Studio Installer (setup.exe). Install Build Tools from https://visualstudio.microsoft.com/downloads/'
    }

    Write-Step 'Starting elevated Visual Studio modify command for VC++ workload...'
    $argLine = 'modify --installPath "{0}" --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive --norestart' -f $buildToolsPath
    Write-Step "Installer command: setup.exe $argLine"

    $proc = Start-Process -FilePath $setupExe -ArgumentList $argLine -Verb RunAs -Wait -PassThru
    if ($proc.ExitCode -ne 0) {
        throw "Visual Studio prerequisite installation failed with exit code $($proc.ExitCode)."
    }

    Write-Step 'Prerequisite installation completed. Re-run build.'
}

function Invoke-TauriCli {
    param(
        [string]$RepoRoot,
        [string[]]$TauriArgs
    )

    $localTauriCmd = Join-Path $RepoRoot 'node_modules\\.bin\\tauri.cmd'
    if (Test-Path -LiteralPath $localTauriCmd) {
        Write-Step "Using local Tauri CLI: $localTauriCmd"
        & $localTauriCmd @TauriArgs
        return
    }

    $bun = Resolve-BunCommand
    Write-Warn 'Local @tauri-apps/cli not found in node_modules; using bunx package @tauri-apps/cli@2.10.1'
    Write-Step "Forwarding Tauri args: $([string]::Join(' ', $TauriArgs))"
    & $bun x --package "@tauri-apps/cli@2.10.1" tauri -- @TauriArgs
}

function Resolve-TauriSourceExe {
    param(
        [string]$RepoRoot,
        [bool]$IsDebug
    )

    $config = if ($IsDebug) { 'debug' } else { 'release' }
    return Join-Path $RepoRoot "src-tauri\\target\\$config\\free-grind.exe"
}

function Get-OutputDir {
    param([string]$RepoRoot)
    return (Join-Path $RepoRoot 'windows-exe')
}

function Get-LegacyOutputDir {
    param([string]$RepoRoot)
    return (Join-Path (Join-Path $RepoRoot 'dist') 'windows-exe')
}

function Stop-LegacyOutputProcesses {
    param([string]$RepoRoot)

    $legacyOutputDir = Get-LegacyOutputDir -RepoRoot $RepoRoot
    if (-not (Test-Path -LiteralPath $legacyOutputDir)) {
        return
    }

    $legacyOutputDir = (Convert-Path $legacyOutputDir)
    $legacyOutputLower = $legacyOutputDir.ToLowerInvariant()

    $killed = 0
    foreach ($process in (Get-Process -ErrorAction SilentlyContinue)) {
        try {
            $path = $process.Path
            if ([string]::IsNullOrWhiteSpace($path)) {
                continue
            }

            $processPathLower = $path.ToLowerInvariant()
            if ($processPathLower.StartsWith($legacyOutputLower)) {
                Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
                $killed += 1
            }
        }
        catch {
            # Ignore access/path lookup failures for unrelated system processes.
        }
    }

    if ($killed -gt 0) {
        Write-Warn "Stopped $killed process(es) running from legacy output folder: $legacyOutputDir"
    }
}

function Remove-LegacyOutputDir {
    param([string]$RepoRoot)

    $legacyOutputDir = Get-LegacyOutputDir -RepoRoot $RepoRoot
    if (-not (Test-Path -LiteralPath $legacyOutputDir)) {
        return
    }

    Stop-LegacyOutputProcesses -RepoRoot $RepoRoot

    $maxAttempts = 3
    for ($attempt = 1; $attempt -le $maxAttempts; $attempt += 1) {
        try {
            Remove-Item -LiteralPath $legacyOutputDir -Recurse -Force
            Write-Step "Removed legacy output folder: $legacyOutputDir"
            return
        }
        catch {
            if ($attempt -eq $maxAttempts) {
                throw "Failed to remove legacy output folder '$legacyOutputDir'. Close apps running from that folder and retry."
            }
        }
    }
}

function Build-ExePair {
    param(
        [string]$RepoRoot,
        [bool]$IsDebug
    )

    $outputDir = Get-OutputDir -RepoRoot $RepoRoot
    $targetArg = if ($IsDebug) { @('build', '--debug') } else { @('build') }

    Remove-LegacyOutputDir -RepoRoot $RepoRoot
    Ensure-CargoCommand
    Ensure-MsvcLinker

    Write-Step "Running Tauri build ($([string]::Join(' ', $targetArg)))"
    Push-Location $RepoRoot
    try {
        Invoke-TauriCli -RepoRoot $RepoRoot -TauriArgs $targetArg
        if ($LASTEXITCODE -ne 0) {
            throw "tauri build failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }

    $sourceExe = Resolve-TauriSourceExe -RepoRoot $RepoRoot -IsDebug:$IsDebug
    if (-not (Test-Path -LiteralPath $sourceExe)) {
        throw "Build finished but expected executable was not found: $sourceExe"
    }

    if (-not (Test-Path -LiteralPath $outputDir)) {
        New-Item -Path $outputDir -ItemType Directory | Out-Null
    }

    $managerExe = Join-Path $outputDir 'manager.exe'
    $childExe = Join-Path $outputDir 'child.exe'

    Copy-Item -LiteralPath $sourceExe -Destination $managerExe -Force
    Copy-Item -LiteralPath $sourceExe -Destination $childExe -Force

    Write-Step "Created manager executable: $managerExe"
    Write-Step "Created child executable:   $childExe"
}

function Assert-ExePairExists {
    param([string]$RepoRoot)

    $outputDir = Get-OutputDir -RepoRoot $RepoRoot
    $managerExe = Join-Path $outputDir 'manager.exe'
    $childExe = Join-Path $outputDir 'child.exe'

    if (-not (Test-Path -LiteralPath $managerExe) -or -not (Test-Path -LiteralPath $childExe)) {
        throw "Could not find manager.exe/child.exe in $outputDir. Run build first."
    }

    return @{
        OutputDir = $outputDir
        ManagerExe = $managerExe
        ChildExe = $childExe
    }
}

function Start-ExecutableWithEnvironment {
    param(
        [string]$FilePath,
        [string]$WorkingDirectory,
        [string[]]$Arguments,
        [hashtable]$EnvironmentMap
    )

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $FilePath
    $startInfo.WorkingDirectory = $WorkingDirectory
    $startInfo.UseShellExecute = $false
    if ($Arguments -and $Arguments.Count -gt 0) {
        $startInfo.Arguments = [string]::Join(' ', $Arguments)
    }

    # Clear parent environment and set only the specified variables.
    # This prevents inheritance of FREE_GRIND_* vars from parent process.
    $startInfo.EnvironmentVariables.Clear()
    
    # Copy essential Windows environment variables first
    foreach ($varName in @('PATH', 'SystemRoot', 'SystemDrive', 'TEMP', 'TMP', 'ComSpec', 'PATHEXT', 'WINDIR')) {
        $val = [System.Environment]::GetEnvironmentVariable($varName)
        if ($val) {
            $startInfo.EnvironmentVariables[$varName] = $val
        }
    }

    # Then set the custom environment map
    if ($EnvironmentMap) {
        foreach ($entry in $EnvironmentMap.GetEnumerator()) {
            $startInfo.EnvironmentVariables[[string]$entry.Key] = [string]$entry.Value
        }
    }

    $process = [System.Diagnostics.Process]::Start($startInfo)
    if (-not $process) {
        throw "Failed to start process: $FilePath"
    }
}

function Start-Manager {
    param([string]$RepoRoot)

    $paths = Assert-ExePairExists -RepoRoot $RepoRoot

    Write-Step 'Starting manager.exe with manager mode environment'
    Start-ExecutableWithEnvironment -FilePath $paths.ManagerExe -WorkingDirectory $paths.OutputDir -Arguments @('--manager') -EnvironmentMap @{
        FREE_GRIND_MODE = 'manager'
        FREE_GRIND_MANAGER_FORCE = '1'
        FREE_GRIND_INSTANCE = 'manager'
        FREE_GRIND_CHILD_EXE = $paths.ChildExe
    }
}

function Start-Child {
    param(
        [string]$RepoRoot,
        [string]$InstanceLabel
    )

    $paths = Assert-ExePairExists -RepoRoot $RepoRoot

    if ([string]::IsNullOrWhiteSpace($InstanceLabel)) {
        $InstanceLabel = 'default'
    }

    Write-Step "Starting child.exe for instance label '$InstanceLabel'"
    Start-ExecutableWithEnvironment -FilePath $paths.ChildExe -WorkingDirectory $paths.OutputDir -Arguments @('--child', "--instance=$InstanceLabel") -EnvironmentMap @{
        FREE_GRIND_MODE = 'child'
        FREE_GRIND_MANAGER_FORCE = '0'
        FREE_GRIND_INSTANCE = $InstanceLabel
    }
}

function Show-Status {
    param([string]$RepoRoot)

    $outputDir = Get-OutputDir -RepoRoot $RepoRoot
    $managerExe = Join-Path $outputDir 'manager.exe'
    $childExe = Join-Path $outputDir 'child.exe'

    Write-Step "Repo:       $RepoRoot"
    Write-Step "Output dir: $outputDir"
    Write-Step "manager.exe exists: $([bool](Test-Path -LiteralPath $managerExe))"
    Write-Step "child.exe exists:   $([bool](Test-Path -LiteralPath $childExe))"
}

function Clean-Output {
    param([string]$RepoRoot)

    $outputDir = Get-OutputDir -RepoRoot $RepoRoot
    if (Test-Path -LiteralPath $outputDir) {
        Remove-Item -LiteralPath $outputDir -Recurse -Force
        Write-Step "Removed $outputDir"
    }
    else {
        Write-Warn "Nothing to clean at $outputDir"
    }
}

function Open-OutputFolder {
    param([string]$RepoRoot)

    $outputDir = Get-OutputDir -RepoRoot $RepoRoot
    if (-not (Test-Path -LiteralPath $outputDir)) {
        throw "Output folder does not exist yet: $outputDir"
    }

    Write-Step "Opening $outputDir"
    Start-Process explorer.exe $outputDir | Out-Null
}

function Show-MenuAndRun {
    param(
        [string]$RepoRoot,
        [bool]$IsDebug,
        [string]$InstanceLabel
    )

    Write-Host ''
    Write-Host 'Free Grind Windows EXE Manager' -ForegroundColor Green
    Write-Host '1) Build manager.exe + child.exe'
    Write-Host '2) Launch manager.exe'
    Write-Host '3) Launch child.exe'
    Write-Host '4) Open output folder'
    Write-Host '5) Show status'
    Write-Host '6) Clean output folder'
    Write-Host '7) Install build prerequisites (admin)'
    Write-Host ''

    $choice = Read-Host 'Choose an action (1-7)'
    switch ($choice) {
        '1' { Build-ExePair -RepoRoot $RepoRoot -IsDebug:$IsDebug }
        '2' { Start-Manager -RepoRoot $RepoRoot }
        '3' {
            $labelInput = Read-Host "Child instance label (default: $InstanceLabel)"
            if ([string]::IsNullOrWhiteSpace($labelInput)) {
                $labelInput = $InstanceLabel
            }
            Start-Child -RepoRoot $RepoRoot -InstanceLabel $labelInput
        }
        '4' { Open-OutputFolder -RepoRoot $RepoRoot }
        '5' { Show-Status -RepoRoot $RepoRoot }
        '6' { Clean-Output -RepoRoot $RepoRoot }
        '7' { Install-Prerequisites }
        default { throw "Invalid menu choice: $choice" }
    }
}

$repoRoot = Get-RepoRoot
$isDebug = [bool]$DebugBuild

switch ($Action) {
    'menu' { Show-MenuAndRun -RepoRoot $repoRoot -IsDebug:$isDebug -InstanceLabel $Label }
    'build' { Build-ExePair -RepoRoot $repoRoot -IsDebug:$isDebug }
    'launch-manager' { Start-Manager -RepoRoot $repoRoot }
    'launch-child' { Start-Child -RepoRoot $repoRoot -InstanceLabel $Label }
    'open-output' { Open-OutputFolder -RepoRoot $repoRoot }
    'clean' { Clean-Output -RepoRoot $repoRoot }
    'status' { Show-Status -RepoRoot $repoRoot }
    'install-prereqs' { Install-Prerequisites }
    default { throw "Unsupported action: $Action" }
}
