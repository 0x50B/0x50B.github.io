---
layout: post
title: "Finishing the F&O Visual Studio Extension Setup Behind Admin By Request"
date: 2026-10-01 09:00:00 +0200
tags: [Dynamics 365, Visual Studio, Power Platform, PowerShell]
---

On a Unified Developer Environment (UDE) VM where local admin rights are handed out by a privilege management tool like **Admin By Request (ABR)**, the Finance and Operations Visual Studio extension may install fine and then refuse to do anything. As soon as you interact with it (for example, opening the Application Explorer), Windows shows a UAC prompt for **UrlProtocolHandler**. After you enter your credentials, Visual Studio shows this error:

```plaintext
"Exception 'InvalidOperationException', 'No process is associated with this object.'"
```

Starting Visual Studio as administrator does not help. The UAC prompt disappears, but the error still appears immediately. On a regular machine with standard UAC, the same extension binaries work without problems.

This post explains what the extension does at that moment, why the elevation broker breaks it, and how to finish the setup yourself with a PowerShell script.

## What the extension does on first use

I decompiled the extension (VSIX `DynamicsFnO.DeveloperTools`, version `7.0.8199.32`, installed under `Common7\IDE\Extensions\<random>\`). When the project system package loads, `VSProjectPackage.InitializeAsync()` first calls `DevelopmentConfigurationService.CheckVersionUpdateAsync()`. That method checks whether `<FrameworkDirectory>\Bin\InstalledVersion.json` exists and contains the build version of the installed extension. After a fresh install or an update it does not, so the extension runs its post-install setup:

1. Register the `dynamics://` URL protocol handler.
2. Install the MSBuild targets.
3. Extract the design-time preview files.
4. Write `InstalledVersion.json`.

The first step is where it fails. `ProtocolHandlerInteractionService.RegisterProtocolHandler()` launches `UrlProtocolHandler.17.0.exe register` elevated:

```csharp
using (Process process = new Process())
{
    process.StartInfo = new ProcessStartInfo
    {
        FileName = text, // <extension>\UrlProtocolHandler.17.0.exe
        Arguments = "register",
        UseShellExecute = true,
        Verb = "runas",
        WindowStyle = ProcessWindowStyle.Hidden,
        CreateNoWindow = false
    };
    process.Start();        // return value ignored
    process.WaitForExit();  // throws if no process handle was returned
}
```

The protocol handler itself only writes `HKEY_CLASSES_ROOT\dynamics`. That registration makes `dynamics://` links open an element in Visual Studio. It needs admin rights, which is why the UAC prompt appears.

## Why the elevation broker breaks it

With `UseShellExecute = true`, `Process.Start()` calls `ShellExecuteEx`. If the call succeeds but returns no process handle, `Process.Start()` returns `false` and the `Process` object has no associated process. The extension ignores the return value, and the following `WaitForExit()` throws `InvalidOperationException: No process is associated with this object.`

Admin By Request handles the elevation itself, and in this case the caller got no process handle back. The elevated process may still run, but the extension cannot wait for it. The message box comes from the `catch` block in `VSProjectPackage.InitializeAsync()`, which formats the error as `"Exception '{0}', '{1}'"`.

The impact is bigger than a missing protocol handler:

* `InitializeAsync()` stops before it registers project factories, editor factories, menu command handlers and services. The extension is effectively dead.
* The remaining setup steps never run, so `InstalledVersion.json` is never written.
* On the next start, the version check fails again and the cycle repeats.

The same `runas` + `WaitForExit()` pattern exists in the fallbacks of the MSBuild targets installer, the design-time preview installer and the version file writer. Those fallbacks are only used when Visual Studio is not elevated.

You can check whether a machine is affected without Visual Studio. This snippet makes the same call:

```powershell
$p = New-Object System.Diagnostics.Process
$p.StartInfo.FileName = 'cmd.exe'
$p.StartInfo.Arguments = '/c exit'
$p.StartInfo.UseShellExecute = $true
$p.StartInfo.Verb = 'runas'
$p.Start()        # False on an affected machine
$p.WaitForExit()  # "No process is associated with this object."
```

## Finishing the setup manually

The extension only runs this setup when the version check fails. Once `InstalledVersion.json` contains the correct build version, the extension skips the whole block and `InitializeAsync()` completes normally. So the fix is to do the four steps yourself, from an elevated PowerShell session, without depending on a process handle:

| Step | Extension code | What the script does |
|---|---|---|
| 1 | `RegisterUtility.RegisterProtocolHandler` | Writes `HKCR\dynamics` with the same values `UrlProtocolHandler.17.0.exe register` writes |
| 2 | `MsbuildTargetsInstaller` | Extracts the two `*.17.0.targets` files embedded in `Microsoft.Dynamics.Framework.Tools.Installer.17.0.dll` to `%ProgramFiles(x86)%\MSBuild\Microsoft\Dynamics\AX` |
| 3 | `DesignTimePreviewFilesInstaller` | Recreates `<FrameworkDirectory>\Bin\DesignTimePreview` from the embedded `DesignTimePreviewFiles.zip` |
| 4 | `InstalledVersionControl.CreateInstalledVersionFile` | Writes `<FrameworkDirectory>\Bin\InstalledVersion.json`, last, so a failed run is retried |

The build version the extension expects is a constant compiled into the Installer assembly, and it matches the assembly's file version. The script reads the file version and then checks that this exact string is present as a constant in the DLL. If a future build changes that relationship, the script stops instead of writing a wrong version. `FrameworkDirectory` comes from the metadata configuration that `HKCU\Software\Microsoft\Dynamics\AX7\Development\Configurations\CurrentMetadataConfig` points to. That configuration is created when you connect the environment through the Power Platform Tools.

Before writing anything, the script also checks that it runs elevated, that no Visual Studio instance is open, that it finds exactly one extension folder, and that all embedded resources can be read.

## The script

Save it as `Complete-FnOToolsSetup.ps1`:

```powershell
<#
.SYNOPSIS
    Completes the post-install setup of the Finance and Operations (Dynamics 365)
    Visual Studio extension when the extension's own elevation step fails.

.DESCRIPTION
    Replicates DevelopmentConfigurationService.CheckVersionUpdateAsync() from
    Microsoft.Dynamics.Framework.Tools.*.17.0.dll (VSIX DynamicsFnO.DeveloperTools):

      1. ProtocolHandlerInteractionService.RegisterProtocolHandler()
         -> HKCR\dynamics URL protocol (same values as UrlProtocolHandler.17.0.exe register)
      2. MsbuildTargetsInstaller.InstallWithProgress()
         -> %ProgramFiles(x86)%\MSBuild\Microsoft\Dynamics\AX\*.17.0.targets
      3. DesignTimePreviewFilesInstaller.InstallWithProgress()
         -> <FrameworkDirectory>\Bin\DesignTimePreview\
      4. InstalledVersionControl.CreateInstalledVersionFile()
         -> <FrameworkDirectory>\Bin\InstalledVersion.json

    The extension starts these steps with ShellExecute "runas" and calls WaitForExit()
    on the result. When an elevation broker (e.g. Admin By Request) launches the
    elevated process itself, no process handle is returned and VS fails with
    "InvalidOperationException: No process is associated with this object."
    Once InstalledVersion.json matches the VSIX build, the extension skips the
    whole step on startup.

    Run from an elevated Windows PowerShell as the developer account (HKCU is read).
    Close all Visual Studio instances first. Re-run after every VSIX update.

.PARAMETER ExtensionPath
    VSIX install folder containing UrlProtocolHandler.17.0.exe. Auto-detected if omitted.

.EXAMPLE
    .\Complete-FnOToolsSetup.ps1 -WhatIf
    .\Complete-FnOToolsSetup.ps1
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$ExtensionPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$VsixId = 'DynamicsFnO.DeveloperTools'
$HandlerExe = 'UrlProtocolHandler.17.0.exe'
$InstallerDllName = 'Microsoft.Dynamics.Framework.Tools.Installer.17.0.dll'
$BuildTasksTargets = 'Microsoft.Dynamics.Framework.Tools.BuildTasks.17.0.targets'
$ExtensibilityTargets = 'Microsoft.Dynamics.Framework.Tools.Extensibility.17.0.targets'
$ConfigurationsKey = 'HKCU:\Software\Microsoft\Dynamics\AX7\Development\Configurations'

# ---------------------------------------------------------------------------
# Validation (read-only)
# ---------------------------------------------------------------------------

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and -not $WhatIfPreference) {
    throw 'Run this script from an elevated PowerShell (or use -WhatIf for a dry run).'
}

$devenv = @(Get-Process -Name devenv -ErrorAction SilentlyContinue)
if ($devenv.Count -gt 0 -and -not $WhatIfPreference) {
    throw "Close all Visual Studio instances first (devenv PIDs: $($devenv.Id -join ', '))."
}

if (-not $ExtensionPath) {
    $searchRoots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}) | Where-Object { $_ } | Select-Object -Unique
    $candidates = @(foreach ($root in $searchRoots) {
        Get-ChildItem -Path (Join-Path $root "Microsoft Visual Studio\*\*\Common7\IDE\Extensions\*\$HandlerExe") -ErrorAction SilentlyContinue
    }) | ForEach-Object { $_.DirectoryName } |
        Where-Object { (Get-Content -Raw -LiteralPath (Join-Path $_ 'extension.vsixmanifest')) -match "Id=`"$VsixId`"" } |
        Select-Object -Unique
    $candidates = @($candidates)
    if ($candidates.Count -eq 0) { throw "No $VsixId extension found. Pass -ExtensionPath." }
    if ($candidates.Count -gt 1) { throw "Multiple $VsixId extensions found, pass -ExtensionPath:`n  $($candidates -join "`n  ")" }
    $ExtensionPath = $candidates[0]
}
$ExtensionPath = (Resolve-Path -LiteralPath $ExtensionPath).ProviderPath.TrimEnd('\')

$handlerPath = Join-Path $ExtensionPath $HandlerExe
$installerDll = Join-Path $ExtensionPath $InstallerDllName
foreach ($required in @($handlerPath, $installerDll)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Missing $required" }
}

# InstalledVersionControl compares against a compile-time constant that equals the
# Installer assembly file version. Verify the constant is present before trusting it.
$buildVersion = (Get-Item -LiteralPath $installerDll).VersionInfo.FileVersion
$dllBytes = [IO.File]::ReadAllBytes($installerDll)
$latin1 = [Text.Encoding]::GetEncoding(28591)
$utf16Needle = $latin1.GetString([Text.Encoding]::Unicode.GetBytes($buildVersion))
if ($latin1.GetString($dllBytes).IndexOf($utf16Needle, [StringComparison]::Ordinal) -lt 0) {
    throw "Build version constant '$buildVersion' not found in $InstallerDllName. This VSIX build differs from the analyzed one; do not use this script."
}

$configPath = (Get-ItemProperty -Path $ConfigurationsKey -Name CurrentMetadataConfig -ErrorAction SilentlyContinue).CurrentMetadataConfig
if (-not $configPath -or -not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    throw "CurrentMetadataConfig is not set or missing ($ConfigurationsKey). Configure the environment in Visual Studio first."
}
$config = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
$frameworkDirectory = $config.FrameworkDirectory
if ([string]::IsNullOrWhiteSpace($frameworkDirectory)) {
    throw "FrameworkDirectory is empty in $configPath."
}
$frameworkBin = Join-Path $frameworkDirectory 'Bin'
$designTimePreviewDir = Join-Path $frameworkBin 'DesignTimePreview'
$installedVersionFile = Join-Path $frameworkBin 'InstalledVersion.json'
$msbuildTargetsDir = Join-Path ${env:ProgramFiles(x86)} 'MSBuild\Microsoft\Dynamics\AX'

# Load embedded resources up front so nothing is written if one is missing.
$assembly = [Reflection.Assembly]::Load($dllBytes)
function Get-ResourceBytes([string]$suffix) {
    $name = $assembly.GetManifestResourceNames() | Where-Object { $_.EndsWith($suffix, [StringComparison]::OrdinalIgnoreCase) } | Select-Object -First 1
    if (-not $name) { throw "Embedded resource '*$suffix' not found in $InstallerDllName." }
    $stream = $assembly.GetManifestResourceStream($name)
    try {
        $buffer = New-Object IO.MemoryStream
        $stream.CopyTo($buffer)
        return , $buffer.ToArray()
    }
    finally { $stream.Dispose() }
}
$buildTasksBytes = Get-ResourceBytes $BuildTasksTargets
$extensibilityBytes = Get-ResourceBytes $ExtensibilityTargets
$previewZipBytes = Get-ResourceBytes 'DesignTimePreviewFiles.zip'

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$probe = New-Object IO.Compression.ZipArchive((New-Object IO.MemoryStream(, $previewZipBytes)), [IO.Compression.ZipArchiveMode]::Read)
$previewEntryCount = $probe.Entries.Count
$probe.Dispose()

Write-Host "User:                 $([Security.Principal.WindowsIdentity]::GetCurrent().Name) (elevated: $isAdmin)"
Write-Host "Extension:            $ExtensionPath"
Write-Host "Build version:        $buildVersion"
Write-Host "Metadata config:      $configPath"
Write-Host "FrameworkDirectory:   $frameworkDirectory"
Write-Host "MSBuild targets:      $msbuildTargetsDir ($($buildTasksBytes.Length) + $($extensibilityBytes.Length) bytes)"
Write-Host "DesignTimePreview:    $designTimePreviewDir ($previewEntryCount zip entries)"
if (Test-Path -LiteralPath $installedVersionFile) {
    Write-Host "InstalledVersion:     $((Get-Content -Raw -LiteralPath $installedVersionFile) -replace '\s+', ' ')"
}
else {
    Write-Host "InstalledVersion:     missing"
}
Write-Host ''

# ---------------------------------------------------------------------------
# 1. URL protocol handler (RegisterUtility.RegisterProtocolHandler)
# ---------------------------------------------------------------------------

if ($PSCmdlet.ShouldProcess('HKEY_CLASSES_ROOT\dynamics', 'Register dynamics:// protocol handler')) {
    $classesRoot = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::ClassesRoot, [Microsoft.Win32.RegistryView]::Default)
    try {
        $classesRoot.DeleteSubKeyTree('dynamics', $false)
        $protocolKey = $classesRoot.CreateSubKey('dynamics')
        try {
            $protocolKey.SetValue('', '"URL:dynamics Protocol"')
            $protocolKey.SetValue('URL Protocol', '')
            $iconKey = $protocolKey.CreateSubKey('DefaultIcon')
            try { $iconKey.SetValue('', "`"$HandlerExe,1`"") } finally { $iconKey.Dispose() }
            $commandKey = $protocolKey.CreateSubKey('shell\open\command')
            try { $commandKey.SetValue('', "`"$handlerPath`" `"%1`"") } finally { $commandKey.Dispose() }
        }
        finally { $protocolKey.Dispose() }
    }
    finally { $classesRoot.Dispose() }
    Write-Host '[1/4] dynamics:// protocol handler registered.'
}

# ---------------------------------------------------------------------------
# 2. MSBuild targets (MsbuildTargetsInstaller)
# ---------------------------------------------------------------------------

if ($PSCmdlet.ShouldProcess($msbuildTargetsDir, "Write $BuildTasksTargets and $ExtensibilityTargets")) {
    [void][IO.Directory]::CreateDirectory($msbuildTargetsDir)
    [IO.File]::WriteAllBytes((Join-Path $msbuildTargetsDir $BuildTasksTargets), $buildTasksBytes)
    [IO.File]::WriteAllBytes((Join-Path $msbuildTargetsDir $ExtensibilityTargets), $extensibilityBytes)
    Write-Host '[2/4] MSBuild targets installed.'
}

# ---------------------------------------------------------------------------
# 3. Design-time preview files (DesignTimePreviewFilesInstaller)
# ---------------------------------------------------------------------------

if ($PSCmdlet.ShouldProcess($designTimePreviewDir, 'Replace design-time preview files')) {
    [void][IO.Directory]::CreateDirectory($frameworkDirectory)
    if (Test-Path -LiteralPath $designTimePreviewDir) {
        Remove-Item -LiteralPath $designTimePreviewDir -Recurse -Force
    }
    [void][IO.Directory]::CreateDirectory($designTimePreviewDir)
    $zip = New-Object IO.Compression.ZipArchive((New-Object IO.MemoryStream(, $previewZipBytes)), [IO.Compression.ZipArchiveMode]::Read)
    try { [IO.Compression.ZipFileExtensions]::ExtractToDirectory($zip, $designTimePreviewDir) }
    finally { $zip.Dispose() }
    Write-Host '[3/4] Design-time preview files installed.'
}

# ---------------------------------------------------------------------------
# 4. InstalledVersion.json (InstalledVersionControl.CreateInstalledVersionFile)
#    Written last: it marks the setup as complete for the extension.
# ---------------------------------------------------------------------------

if ($PSCmdlet.ShouldProcess($installedVersionFile, "Write BuildVersion $buildVersion")) {
    [void][IO.Directory]::CreateDirectory($frameworkBin)
    $json = "{`r`n  `"BuildVersion`": `"$buildVersion`"`r`n}"
    [IO.File]::WriteAllText($installedVersionFile, $json, (New-Object Text.UTF8Encoding($false)))
    Write-Host '[4/4] InstalledVersion.json written.'
}

Write-Host ''
Write-Host 'Done. Start Visual Studio normally (not elevated) and open the AOT.'

```

## Usage

1. Close all Visual Studio instances.
2. Open an elevated **Windows PowerShell** with the same account you develop with. The script reads your `HKCU` configuration. With Admin By Request, elevation keeps the same account, so this works.
3. Do a dry run first, then the real run:

   ```powershell
   Set-ExecutionPolicy -Scope Process Bypass
   .\Complete-FnOToolsSetup.ps1 -WhatIf
   .\Complete-FnOToolsSetup.ps1
   ```

4. Start Visual Studio normally, not elevated, and open the Application Explorer.

If several Visual Studio versions have the extension installed (for example Visual Studio 2022 and 2026), the script lists all extension folders and asks you to pick one:

```powershell
.\Complete-FnOToolsSetup.ps1 -ExtensionPath "C:\Program Files\Microsoft Visual Studio\18\Professional\Common7\IDE\Extensions\<folder>"
```

The `dynamics://` registration and the MSBuild targets apply to the whole machine, so the last registered extension wins. That matches what the extension does itself.

## Things to keep in mind

* **Re-run after every extension update.** Each build has a new version constant, so the version check fails again after an update.
* **The environment must already be connected.** If `CurrentMetadataConfig` is missing, the extension starts the protocol registration through a different code path during configuration. The script does not cover that path.
* **This is a workaround, not a supported fix.** It is based on decompiling extension version `7.0.8199.32`. The actual bug is on Microsoft's side: `RegisterProtocolHandler()` ignores the return value of `Process.Start()`, and a failing optional step aborts the whole package initialization. If your security team can exclude Visual Studio and `UrlProtocolHandler.17.0.exe` from the broker's `runas` handling, that is the cleaner option.
